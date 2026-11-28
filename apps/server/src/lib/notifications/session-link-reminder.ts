import { evaluateSessionLinkReminderWindow } from "@teacher-os/api/session-link-email";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { isValidZoomJoinUrl } from "@teacher-os/api/zoom-window";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import {
	classSessionMeeting,
	classTable,
	enrollment,
	lesson,
	notificationRecord,
	organization,
	student,
} from "@teacher-os/db/schema/index";
import { and, eq, inArray, notLike, sql } from "drizzle-orm";
import type { Db } from "../../app";
import { deliverNotifications, sanitizeDeliveryError } from "./deliver";
import { enqueueNotifications } from "./enqueue";
import { type NotificationEvent, sessionLinkReminderEvent } from "./templates";

/** Khoảng nghỉ mặc định giữa các email trong cron để tránh chạm giới hạn 2 req/s của Resend. */
const DEFAULT_SEND_INTERVAL_MS = 550;

export interface SessionLinkReminderDeps {
	db: Db;
	mailer?: Mailer;
	getMailer?: () => Mailer | undefined;
	studentOrigin?: string;
	now?: () => Date;
	retryDelaysMs?: number[];
	sendIntervalMs?: number;
}

export interface SessionLinkReminderCronResult {
	checkedAtISO: string;
	candidatesMatched: number;
	recordsCreated: number;
	emailsQueued: number;
	skippedNoLink: number;
	skippedNoEmail: number;
	orgsProcessed: number;
}

interface QueuedSessionLinkEntry {
	dateISO: string;
	time: string;
	classId: string;
	studentId: string;
	event: NotificationEvent;
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

function resolveSessionJoinUrl(
	lessonZoom: string | null | undefined,
	meetingJoinUrl: string | null | undefined,
): string {
	const trimmedLessonZoom = (lessonZoom ?? "").trim();
	if (isValidZoomJoinUrl(trimmedLessonZoom)) {
		return trimmedLessonZoom;
	}
	const trimmedMeetingUrl = (meetingJoinUrl ?? "").trim();
	if (isValidZoomJoinUrl(trimmedMeetingUrl)) {
		return trimmedMeetingUrl;
	}
	return "";
}

/**
 * Quét các buổi học `upcoming` của lớp `Online` `active` đang nằm trong cửa sổ
 * `[startMs - 2h, startMs)` (giờ Việt Nam UTC+7), enqueue và gửi email chứa link
 * Zoom trực tiếp cho học viên `active` có email.
 *
 * - Mỗi slot `(classId, date, time, studentId)` gửi tối đa 1 email nhắc nhở;
 *   dời ngày hoặc đổi giờ học tạo slot mới sẽ tự động gửi lại.
 * - Buổi chưa có link Zoom hợp lệ được bỏ qua không tạo `notification_record` để
 *   lượt cron 10 phút kế tiếp có thể gửi ngay khi giáo viên bổ sung link.
 * - Lỗi ở từng org được cô lập để các org còn lại vẫn xử lý, nhưng lỗi đầu tiên
 *   sẽ được ném lại sau cùng để Cloudflare Cron telemetry ghi nhận trạng thái fail.
 */
export async function runSessionLinkReminderCron(
	deps: SessionLinkReminderDeps,
): Promise<SessionLinkReminderCronResult> {
	const now = deps.now ? deps.now() : new Date();
	const nowMs = now.getTime();
	const todayISO = vietnamTodayISO(now);
	const tomorrowISO = addDaysISO(todayISO, 1);

	const rows = await deps.db
		.select({
			orgId: lesson.orgId,
			orgName: organization.name,
			classId: classTable.id,
			className: classTable.name,
			date: lesson.date,
			time: lesson.time,
			dur: lesson.dur,
			topic: lesson.topic,
			lessonZoom: lesson.zoom,
			meetingJoinUrl: classSessionMeeting.joinUrl,
			studentId: student.id,
			studentName: student.name,
			studentEmail: student.email,
		})
		.from(lesson)
		.innerJoin(
			classTable,
			and(
				eq(classTable.id, lesson.classId),
				eq(classTable.orgId, lesson.orgId),
				eq(classTable.status, "active"),
			),
		)
		.innerJoin(organization, eq(organization.id, lesson.orgId))
		.innerJoin(
			enrollment,
			and(
				eq(enrollment.id, lesson.enrollmentId),
				eq(enrollment.orgId, lesson.orgId),
				eq(enrollment.classId, lesson.classId),
				eq(enrollment.status, "active"),
			),
		)
		.innerJoin(
			student,
			and(
				eq(student.id, enrollment.studentId),
				eq(student.orgId, lesson.orgId),
			),
		)
		.leftJoin(
			classSessionMeeting,
			and(
				eq(classSessionMeeting.orgId, lesson.orgId),
				eq(classSessionMeeting.classId, lesson.classId),
				eq(classSessionMeeting.date, lesson.date),
			),
		)
		.where(
			and(
				inArray(lesson.date, [todayISO, tomorrowISO]),
				eq(lesson.status, "upcoming"),
				sql`lower(trim(${classTable.mode})) = 'online'`,
				notLike(student.id, "demo-student:%"),
				sql`NOT EXISTS (
					SELECT 1 FROM ${notificationRecord}
					WHERE ${notificationRecord.orgId} = ${lesson.orgId}
						AND ${notificationRecord.idempotencyKey} = (
							'session_link_reminder:' || ${lesson.classId} || ':' || ${lesson.date} || ':' || ${lesson.time} || ':' || ${student.id}
						)
				)`,
			),
		);

	const entriesByOrg = new Map<string, QueuedSessionLinkEntry[]>();
	const seenKeys = new Set<string>();
	let candidatesMatched = 0;
	let skippedNoLink = 0;
	let skippedNoEmail = 0;

	for (const row of rows) {
		const windowRes = evaluateSessionLinkReminderWindow({
			date: row.date,
			time: row.time,
			nowMs,
		});
		if (windowRes.status !== "due" || row.date === null) {
			continue;
		}

		const dedupeKey = `${row.orgId}:${row.classId}:${row.date}:${row.time}:${row.studentId}`;
		if (seenKeys.has(dedupeKey)) {
			continue;
		}
		seenKeys.add(dedupeKey);

		const joinUrl = resolveSessionJoinUrl(row.lessonZoom, row.meetingJoinUrl);
		if (!joinUrl) {
			skippedNoLink += 1;
			continue;
		}

		candidatesMatched += 1;
		if (row.studentEmail.trim().length === 0) {
			skippedNoEmail += 1;
			continue;
		}

		const event = sessionLinkReminderEvent({
			classId: row.classId,
			className: row.className,
			dateISO: row.date,
			time: row.time,
			dur: row.dur,
			topic: row.topic,
			joinUrl,
			orgName: row.orgName,
			studentId: row.studentId,
			studentName: row.studentName,
			studentOrigin: deps.studentOrigin,
		});

		const list = entriesByOrg.get(row.orgId);
		const entry: QueuedSessionLinkEntry = {
			dateISO: row.date,
			time: row.time,
			classId: row.classId,
			studentId: row.studentId,
			event,
		};
		if (list) {
			list.push(entry);
		} else {
			entriesByOrg.set(row.orgId, [entry]);
		}
	}

	const sortedOrgIds = [...entriesByOrg.keys()].sort((a, b) =>
		a.localeCompare(b),
	);
	let recordsCreated = 0;
	let emailsQueued = 0;
	let orgsProcessed = 0;
	let firstError: unknown;
	const sendIntervalMs = deps.sendIntervalMs ?? DEFAULT_SEND_INTERVAL_MS;
	const queuedByOrg: Array<{ orgId: string; queuedEmailIds: string[] }> = [];

	// Pha 1: enqueue toàn bộ org trước để lỗi mạng khi gửi ở 1 org không làm mất bản ghi các org sau.
	for (const orgId of sortedOrgIds) {
		const entries = entriesByOrg.get(orgId);
		if (!entries || entries.length === 0) continue;
		entries.sort(
			(a, b) =>
				a.dateISO.localeCompare(b.dateISO) ||
				a.time.localeCompare(b.time) ||
				a.classId.localeCompare(b.classId) ||
				a.studentId.localeCompare(b.studentId),
		);

		try {
			const { createdIds, queuedEmailIds } = await enqueueNotifications(
				deps.db,
				orgId,
				entries.map((entry) => entry.event),
			);
			recordsCreated += createdIds.length;
			emailsQueued += queuedEmailIds.length;
			queuedByOrg.push({ orgId, queuedEmailIds });
		} catch (error) {
			firstError ??= error;
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				"[notifications] session link reminder enqueue failed for org %s: %s",
				orgId,
				sanitizeDeliveryError(message).rawError,
			);
		}
	}

	const hasQueuedEmails = queuedByOrg.some(
		(item) => item.queuedEmailIds.length > 0,
	);
	// Chỉ resolve mailer khi thực sự có email cần gửi để tránh log thừa trên các tick nhàn rỗi.
	const mailer = hasQueuedEmails
		? (deps.mailer ?? deps.getMailer?.())
		: undefined;

	// Pha 2: gửi tuần tự theo từng org và giữ giãn nhịp `sendIntervalMs` xuyên suốt.
	let hasDeliveredAny = false;
	for (const { orgId, queuedEmailIds } of queuedByOrg) {
		try {
			if (queuedEmailIds.length > 0) {
				if (hasDeliveredAny && mailer && sendIntervalMs > 0) {
					await sleep(sendIntervalMs);
				}
				await deliverNotifications(
					deps.db,
					mailer,
					queuedEmailIds,
					deps.studentOrigin,
					{
						retryDelaysMs: deps.retryDelaysMs,
						sendIntervalMs,
					},
				);
				if (mailer) {
					hasDeliveredAny = true;
				}
			}
			if (queuedEmailIds.length === 0 || mailer) {
				orgsProcessed += 1;
			}
		} catch (error) {
			firstError ??= error;
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				"[notifications] session link reminder delivery failed for org %s: %s",
				orgId,
				sanitizeDeliveryError(message).rawError,
			);
		}
	}

	if (firstError !== undefined) {
		throw firstError;
	}

	return {
		checkedAtISO: now.toISOString(),
		candidatesMatched,
		recordsCreated,
		emailsQueued,
		skippedNoLink,
		skippedNoEmail,
		orgsProcessed,
	};
}
