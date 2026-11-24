import {
	addDaysISO,
	formatVietnamTimeHHMM,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import {
	classAssignment,
	classAssignmentTarget,
	classStudyPack,
	classTable,
	enrollment,
	quizAttempt,
	student,
} from "@teacher-os/db/schema/index";
import {
	and,
	eq,
	gte,
	isNotNull,
	isNull,
	lt,
	notLike,
	or,
	sql,
} from "drizzle-orm";
import type { Db } from "../../app";
import { deliverNotifications, sanitizeDeliveryError } from "./deliver";
import { enqueueNotifications } from "./enqueue";
import {
	type DailyDeadlineReminderItem,
	dailyDeadlineReminderEvent,
	type NotificationEvent,
} from "./templates";

/** 23:00 UTC hằng ngày = 06:00 sáng theo giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7). */
export const DAILY_DEADLINE_REMINDER_CRON = "0 23 * * *";
/** Lịch đồng bộ cloud recording Zoom mỗi 10 phút. */
export const ZOOM_RECORDING_SYNC_CRON = "*/10 * * * *";

/** Khoảng nghỉ mặc định giữa các email trong cron để không chạm giới hạn 2 req/s của Resend. */
const DEFAULT_SEND_INTERVAL_MS = 550;

export interface DailyDeadlineReminderDeps {
	db: Db;
	mailer?: Mailer;
	studentOrigin?: string;
	now?: () => Date;
	retryDelaysMs?: number[];
	sendIntervalMs?: number;
}

export interface DailyDeadlineReminderCronResult {
	dateISO: string;
	studentsMatched: number;
	recordsCreated: number;
	emailsQueued: number;
	skippedNoEmail: number;
	orgsProcessed: number;
}

interface InternalReminderEntry {
	item: DailyDeadlineReminderItem;
	dueAtMs: number | null;
}

interface StudentReminderBucket {
	orgId: string;
	studentId: string;
	studentName: string;
	studentEmail: string;
	seenAssignmentIds: Set<string>;
	homework: InternalReminderEntry[];
	selfStudy: InternalReminderEntry[];
}

function sleep(ms: number): Promise<void> {
	if (ms <= 0) return Promise.resolve();
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

function compareReminderEntries(
	a: InternalReminderEntry,
	b: InternalReminderEntry,
): number {
	const aDue = a.dueAtMs ?? Number.POSITIVE_INFINITY;
	const bDue = b.dueAtMs ?? Number.POSITIVE_INFINITY;
	if (aDue !== bDue) return aDue - bDue;
	const titleCmp = a.item.title.localeCompare(b.item.title, "vi");
	if (titleCmp !== 0) return titleCmp;
	return a.item.assignmentId.localeCompare(b.item.assignmentId);
}

/**
 * Chạy tác vụ cron 06:00 giờ Việt Nam hằng ngày: gom tất cả bài tập về nhà và
 * bộ đề tự học chưa nộp đến hạn trong ngày hiện tại của từng học viên (đang học
 * lớp active), phát đúng 1 email tổng hợp/học viên/ngày qua pipeline thông báo.
 */
export async function runDailyDeadlineReminderCron(
	deps: DailyDeadlineReminderDeps,
): Promise<DailyDeadlineReminderCronResult> {
	const now = deps.now ? deps.now() : new Date();
	const todayISO = vietnamTodayISO(now);
	const todayStartMs = Date.parse(`${todayISO}T00:00:00+07:00`);
	const tomorrowStartMs = Date.parse(
		`${addDaysISO(todayISO, 1)}T00:00:00+07:00`,
	);
	const todayStartDate = new Date(todayStartMs);
	const tomorrowStartDate = new Date(tomorrowStartMs);

	const rows = await deps.db
		.select({
			orgId: classAssignmentTarget.orgId,
			studentId: student.id,
			studentName: student.name,
			studentEmail: student.email,
			assignmentId: classAssignment.id,
			title: classAssignment.title,
			className: classTable.name,
			dueAt: classAssignment.dueAt,
			availableAt: classAssignment.availableAt,
			classStudyPackId: classAssignment.classStudyPackId,
			studyPackStatus: classStudyPack.status,
			studyPackCancelledAt: classStudyPack.cancelledAt,
		})
		.from(classAssignmentTarget)
		.innerJoin(
			classAssignment,
			and(
				eq(classAssignment.id, classAssignmentTarget.assignmentId),
				eq(classAssignment.orgId, classAssignmentTarget.orgId),
			),
		)
		.innerJoin(
			classTable,
			and(
				eq(classTable.id, classAssignment.classId),
				eq(classTable.orgId, classAssignment.orgId),
				eq(classTable.status, "active"),
			),
		)
		.innerJoin(
			enrollment,
			and(
				eq(enrollment.orgId, classAssignment.orgId),
				eq(enrollment.classId, classAssignment.classId),
				eq(enrollment.studentId, classAssignmentTarget.studentId),
				eq(enrollment.status, "active"),
			),
		)
		.innerJoin(
			student,
			and(
				eq(student.id, classAssignmentTarget.studentId),
				eq(student.orgId, classAssignmentTarget.orgId),
			),
		)
		.leftJoin(
			classStudyPack,
			and(
				eq(classStudyPack.id, classAssignment.classStudyPackId),
				eq(classStudyPack.orgId, classAssignment.orgId),
			),
		)
		.where(
			and(
				isNull(classAssignmentTarget.submittedAt),
				notLike(student.id, "demo-student:%"),
				sql`NOT EXISTS (
					SELECT 1 FROM ${quizAttempt}
					WHERE ${quizAttempt.orgId} = ${classAssignmentTarget.orgId}
						AND ${quizAttempt.assignmentId} = ${classAssignmentTarget.assignmentId}
						AND ${quizAttempt.studentId} = ${classAssignmentTarget.studentId}
						AND ${quizAttempt.status} = 'submitted'
				)`,
				or(
					and(
						isNotNull(classAssignment.dueAt),
						gte(classAssignment.dueAt, todayStartDate),
						lt(classAssignment.dueAt, tomorrowStartDate),
					),
					and(isNull(classAssignment.dueAt), eq(classAssignment.due, todayISO)),
				),
			),
		);

	const nowMs = now.getTime();
	const bucketsByOrg = new Map<string, Map<string, StudentReminderBucket>>();

	for (const row of rows) {
		if (
			row.availableAt !== null &&
			row.availableAt.getTime() >= tomorrowStartMs
		) {
			continue;
		}
		if (
			row.classStudyPackId !== null &&
			row.studyPackStatus === "cancelled" &&
			(row.availableAt === null ||
				row.studyPackCancelledAt === null ||
				row.availableAt.getTime() > row.studyPackCancelledAt.getTime())
		) {
			continue;
		}

		let orgBuckets = bucketsByOrg.get(row.orgId);
		if (!orgBuckets) {
			orgBuckets = new Map<string, StudentReminderBucket>();
			bucketsByOrg.set(row.orgId, orgBuckets);
		}
		let bucket = orgBuckets.get(row.studentId);
		if (!bucket) {
			bucket = {
				orgId: row.orgId,
				studentId: row.studentId,
				studentName: row.studentName,
				studentEmail: row.studentEmail,
				seenAssignmentIds: new Set<string>(),
				homework: [],
				selfStudy: [],
			};
			orgBuckets.set(row.studentId, bucket);
		}

		if (bucket.seenAssignmentIds.has(row.assignmentId)) {
			continue;
		}
		bucket.seenAssignmentIds.add(row.assignmentId);

		const dueAtMs = row.dueAt ? row.dueAt.getTime() : null;
		const dueTimeLabel = row.dueAt
			? formatVietnamTimeHHMM(row.dueAt)
			: "Trong ngày";
		const opensAtLabel =
			row.classStudyPackId !== null &&
			row.availableAt !== null &&
			row.availableAt.getTime() > nowMs
				? formatVietnamTimeHHMM(row.availableAt)
				: null;

		const entry: InternalReminderEntry = {
			item: {
				assignmentId: row.assignmentId,
				title: row.title,
				className: row.className,
				dueTimeLabel,
				opensAtLabel,
			},
			dueAtMs,
		};

		if (row.classStudyPackId === null) {
			bucket.homework.push(entry);
		} else {
			bucket.selfStudy.push(entry);
		}
	}

	const eventsByOrg = new Map<string, NotificationEvent[]>();
	let studentsMatched = 0;
	let skippedNoEmail = 0;

	const sortedOrgIds = [...bucketsByOrg.keys()].sort((a, b) =>
		a.localeCompare(b),
	);

	for (const orgId of sortedOrgIds) {
		const orgBuckets = bucketsByOrg.get(orgId);
		if (!orgBuckets) continue;
		const sortedStudentBuckets = [...orgBuckets.values()].sort((a, b) =>
			a.studentId.localeCompare(b.studentId),
		);
		for (const bucket of sortedStudentBuckets) {
			if (bucket.homework.length === 0 && bucket.selfStudy.length === 0) {
				continue;
			}
			studentsMatched += 1;
			if (bucket.studentEmail.trim().length === 0) {
				skippedNoEmail += 1;
				continue;
			}

			bucket.homework.sort(compareReminderEntries);
			bucket.selfStudy.sort(compareReminderEntries);

			const event = dailyDeadlineReminderEvent({
				studentId: bucket.studentId,
				studentName: bucket.studentName,
				dateISO: todayISO,
				homework: bucket.homework.map((e) => e.item),
				selfStudy: bucket.selfStudy.map((e) => e.item),
				studentOrigin: deps.studentOrigin,
			});

			const orgEvents = eventsByOrg.get(bucket.orgId);
			if (orgEvents) {
				orgEvents.push(event);
			} else {
				eventsByOrg.set(bucket.orgId, [event]);
			}
		}
	}

	let recordsCreated = 0;
	let emailsQueued = 0;
	let orgsProcessed = 0;
	const sendIntervalMs = deps.sendIntervalMs ?? DEFAULT_SEND_INTERVAL_MS;
	const queuedByOrg: Array<{ orgId: string; queuedEmailIds: string[] }> = [];

	// Pha 1: enqueue toàn bộ org trước để lỗi/timeout mạng khi gửi ở 1 org không làm các org sau mất bản ghi.
	for (const [orgId, events] of eventsByOrg) {
		try {
			const { createdIds, queuedEmailIds } = await enqueueNotifications(
				deps.db,
				orgId,
				events,
			);
			recordsCreated += createdIds.length;
			emailsQueued += queuedEmailIds.length;
			queuedByOrg.push({ orgId, queuedEmailIds });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				"[notifications] daily deadline reminder enqueue failed for org %s: %s",
				orgId,
				sanitizeDeliveryError(message).rawError,
			);
		}
	}

	// Pha 2: gửi tuần tự theo từng org và giữ giãn nhịp `sendIntervalMs` xuyên suốt giữa các org.
	let hasDeliveredAny = false;
	for (const { orgId, queuedEmailIds } of queuedByOrg) {
		try {
			if (queuedEmailIds.length > 0) {
				if (hasDeliveredAny && deps.mailer && sendIntervalMs > 0) {
					await sleep(sendIntervalMs);
				}
				await deliverNotifications(
					deps.db,
					deps.mailer,
					queuedEmailIds,
					deps.studentOrigin,
					{
						retryDelaysMs: deps.retryDelaysMs,
						sendIntervalMs,
					},
				);
				if (deps.mailer) {
					hasDeliveredAny = true;
				}
			}
			orgsProcessed += 1;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(
				"[notifications] daily deadline reminder delivery failed for org %s: %s",
				orgId,
				sanitizeDeliveryError(message).rawError,
			);
		}
	}

	return {
		dateISO: todayISO,
		studentsMatched,
		recordsCreated,
		emailsQueued,
		skippedNoEmail,
		orgsProcessed,
	};
}
