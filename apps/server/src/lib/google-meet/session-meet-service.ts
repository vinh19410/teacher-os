import {
	type ClassMeetBulkCreateResponse,
	GOOGLE_MEET_ERROR_CODES,
	type RecordingStatus,
	type SessionMeetCreateResponse,
	type SessionRecordingSyncResponse,
} from "@teacher-os/api/contracts";
import {
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import {
	addDaysISO,
	vietnamSessionEndMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	classSession,
	classSessionMeeting,
	classTable,
	enrollment,
	lesson,
	membership,
	student,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "../../app";
import {
	type FetchFn,
	GoogleIntegrationError,
	getValidGoogleAccessToken,
} from "./google-oauth";
import {
	createGoogleWorkspaceClient,
	extractMeetCodeFromUrl,
	type GoogleWorkspaceClient,
} from "./google-workspace-client";

export interface GoogleMeetServiceDeps {
	db: Db;
	googleClientId?: string;
	googleClientSecret?: string;
	fetchFn?: FetchFn;
	/** Test/E2E injection hook to avoid real Google network calls. */
	getGoogleWorkspaceClient?: (
		userId: string,
	) => Promise<GoogleWorkspaceClient> | GoogleWorkspaceClient;
	/** Optional per-task client cache across multi-session sync loops. */
	clientCache?: Map<string, GoogleWorkspaceClient>;
	now?: () => Date;
}

const MAX_AUTO_PROVISION_ON_CREATE = 5;
const MAX_BULK_CREATE_PER_CALL = 12;
const MAX_CRON_SYNC_PER_TICK = 10;
const MAX_CRON_SCAN_ROWS = 30;
const CRON_MIN_AFTER_END_MS = 5 * 60_000;
const CRON_MAX_AFTER_END_MS = 72 * 3600_000;
const CRON_FAILED_RETRY_MS = 60 * 60_000;

async function resolveClient(
	deps: GoogleMeetServiceDeps,
	userId: string,
): Promise<GoogleWorkspaceClient> {
	const cached = deps.clientCache?.get(userId);
	if (cached) return cached;
	const client = deps.getGoogleWorkspaceClient
		? await deps.getGoogleWorkspaceClient(userId)
		: createGoogleWorkspaceClient({
				accessToken: await getValidGoogleAccessToken(deps.db, {
					userId,
					clientId: deps.googleClientId ?? "",
					clientSecret: deps.googleClientSecret ?? "",
					fetchFn: deps.fetchFn,
				}),
				fetchFn: deps.fetchFn,
			});
	deps.clientCache?.set(userId, client);
	return client;
}

export async function resolveOrgTeacherUserId(
	db: Db,
	orgId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ userId: membership.userId })
		.from(membership)
		.where(and(eq(membership.orgId, orgId), eq(membership.role, "teacher")))
		.orderBy(asc(membership.createdAt), asc(membership.id))
		.limit(1);
	return row?.userId ?? null;
}

export async function loadActiveClassStudentEmails(
	db: Db,
	orgId: string,
	classId: string,
): Promise<string[]> {
	const rows = await db
		.select({ email: student.email })
		.from(enrollment)
		.innerJoin(student, eq(enrollment.studentId, student.id))
		.where(
			and(
				eq(enrollment.orgId, orgId),
				eq(enrollment.classId, classId),
				eq(enrollment.status, "active"),
			),
		);
	return rows.map((r) => r.email).filter((e) => e.trim().length > 0);
}

function hhmmToMinutes(hhmm: string): number {
	const [h = 0, m = 0] = hhmm.split(":").map(Number);
	return h * 60 + m;
}

export function deriveScheduledOccurrences(cls: {
	schedule: string;
	startDate: string;
	sessionsTotal: number;
}): Array<{ date: string; time: string; dur: number }> {
	const parsed = parseStoredSchedule(cls.schedule);
	const startISO = parseStartDateStrict(cls.startDate);
	if (!parsed || !startISO || cls.sessionsTotal <= 0) return [];
	const skeleton = skeletonOf(parsed, startISO, cls.sessionsTotal);
	if (!skeleton) return [];
	const dur =
		(hhmmToMinutes(parsed.end) - hhmmToMinutes(parsed.start) + 1440) % 1440 ||
		60;
	const dates: string[] = [];
	for (const list of skeleton.values()) {
		for (const d of list) dates.push(d);
	}
	dates.sort((a, b) => a.localeCompare(b));
	return dates.map((date) => ({ date, time: parsed.start, dur }));
}

interface OccurrenceTiming {
	className: string;
	classMode: string;
	time: string;
	dur: number;
	topic: string;
	isCancelledOrHoliday: boolean;
}

function resolveTimingFromRows(
	cls:
		| {
				name: string;
				mode: string;
				schedule: string;
				startDate: string;
				sessionsTotal: number;
		  }
		| null
		| undefined,
	cs: { time: string; dur: number; topic: string } | null | undefined,
	lessonRows: Array<{
		time: string;
		dur: number;
		topic: string;
		status: string;
	}>,
	dateISO: string,
): OccurrenceTiming | null {
	if (!cls) return null;

	if (cs) {
		const activeLesson = lessonRows.find(
			(r) => r.status !== "cancelled" && r.status !== "holiday",
		);
		const allInactive =
			lessonRows.length > 0 &&
			lessonRows.every(
				(r) => r.status === "cancelled" || r.status === "holiday",
			);
		return {
			className: cls.name,
			classMode: cls.mode,
			time: activeLesson?.time ?? cs.time,
			dur: activeLesson?.dur ?? cs.dur,
			topic: activeLesson?.topic || cs.topic,
			isCancelledOrHoliday: allInactive,
		};
	}

	if (lessonRows.length > 0) {
		const activeLesson = lessonRows.find(
			(r) => r.status !== "cancelled" && r.status !== "holiday",
		);
		const first = activeLesson ?? lessonRows[0];
		if (!first) return null;
		return {
			className: cls.name,
			classMode: cls.mode,
			time: first.time,
			dur: first.dur,
			topic: first.topic,
			isCancelledOrHoliday: !activeLesson,
		};
	}

	const projected = deriveScheduledOccurrences(cls).find(
		(d) => d.date === dateISO,
	);
	if (!projected) return null;
	return {
		className: cls.name,
		classMode: cls.mode,
		time: projected.time,
		dur: projected.dur,
		topic: "",
		isCancelledOrHoliday: false,
	};
}

async function resolveOccurrenceTiming(
	db: Db,
	orgId: string,
	classId: string,
	dateISO: string,
): Promise<OccurrenceTiming | null> {
	const [cls] = await db
		.select({
			id: classTable.id,
			name: classTable.name,
			mode: classTable.mode,
			schedule: classTable.schedule,
			startDate: classTable.startDate,
			sessionsTotal: classTable.sessionsTotal,
		})
		.from(classTable)
		.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)))
		.limit(1);
	if (!cls) return null;

	const [[cs], lessonRows] = await Promise.all([
		db
			.select({
				time: classSession.time,
				dur: classSession.dur,
				topic: classSession.topic,
			})
			.from(classSession)
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, dateISO),
				),
			)
			.limit(1),
		db
			.select({
				time: lesson.time,
				dur: lesson.dur,
				topic: lesson.topic,
				status: lesson.status,
			})
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
				),
			),
	]);

	return resolveTimingFromRows(cls, cs, lessonRows, dateISO);
}

export async function mirrorMeetUrlToSessionRows(
	db: Db,
	orgId: string,
	classId: string,
	dateISO: string,
	meetUrl: string,
): Promise<void> {
	await Promise.all([
		db
			.update(classSession)
			.set({ zoom: meetUrl })
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, dateISO),
				),
			),
		db
			.update(lesson)
			.set({ zoom: meetUrl })
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
				),
			),
	]);
}

function buildCalendarSummary(className: string, topic: string): string {
	const trimmedTopic = topic.trim();
	return trimmedTopic ? `${className} — ${trimmedTopic}` : className;
}

export async function ensureSessionMeeting(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		actorUserId: string;
	},
): Promise<SessionMeetCreateResponse> {
	const [existing] = await deps.db
		.select()
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
				eq(classSessionMeeting.date, input.dateISO),
			),
		)
		.limit(1);

	if (existing?.meetUrl) {
		await mirrorMeetUrlToSessionRows(
			deps.db,
			input.orgId,
			input.classId,
			input.dateISO,
			existing.meetUrl,
		);
		return {
			meetUrl: existing.meetUrl,
			googleCalendarEventId: existing.googleCalendarEventId,
			googleMeetCode: existing.googleMeetCode,
			warning: null,
		};
	}

	const timing = await resolveOccurrenceTiming(
		deps.db,
		input.orgId,
		input.classId,
		input.dateISO,
	);
	if (!timing) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			"Không tìm thấy buổi học để tạo Google Meet.",
			404,
		);
	}
	if (timing.isCancelledOrHoliday) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			"Không thể tạo Google Meet cho buổi đã hủy hoặc nghỉ lễ.",
			409,
		);
	}

	const client = await resolveClient(deps, input.actorUserId);
	const attendeeEmails = await loadActiveClassStudentEmails(
		deps.db,
		input.orgId,
		input.classId,
	);

	const cal = await client.createCalendarEventWithMeet({
		summary: buildCalendarSummary(timing.className, timing.topic),
		description: `Buổi học lớp ${timing.className} (${input.dateISO} ${timing.time})`,
		dateISO: input.dateISO,
		time: timing.time,
		dur: timing.dur,
		attendeeEmails,
		requestId: `tos-${input.classId}-${input.dateISO}-${crypto.randomUUID().slice(0, 8)}`,
	});

	let spaceName: string | null = null;
	let warning: string | null = null;
	const meetCode = cal.meetCode ?? extractMeetCodeFromUrl(cal.hangoutLink);
	if (meetCode) {
		const configured = await client
			.configureMeetSpace({ meetCode })
			.catch(() => ({
				spaceName: null,
				meetingUri: null,
				warning: "Đã tạo link Meet nhưng không thể cấu hình phòng tự động.",
			}));
		spaceName = configured.spaceName;
		warning = configured.warning;
	}

	const meetUrl = cal.hangoutLink;

	const saveClaimedMeeting = async (
		winnerId: string,
		winnerHasRecording: boolean,
	) =>
		deps.db
			.update(classSessionMeeting)
			.set({
				meetUrl,
				googleCalendarEventId: cal.eventId,
				googleMeetSpaceName: spaceName,
				googleMeetCode: meetCode,
				googleOwnerUserId: input.actorUserId,
				recordingStatus: winnerHasRecording ? "ready" : "pending",
			})
			.where(
				and(
					eq(classSessionMeeting.id, winnerId),
					eq(classSessionMeeting.meetUrl, ""),
				),
			)
			.returning({ id: classSessionMeeting.id });

	const cleanupAndReturnWinner =
		async (): Promise<SessionMeetCreateResponse> => {
			await client.deleteCalendarEvent(cal.eventId).catch(() => undefined);
			const [winner] = await deps.db
				.select()
				.from(classSessionMeeting)
				.where(
					and(
						eq(classSessionMeeting.orgId, input.orgId),
						eq(classSessionMeeting.classId, input.classId),
						eq(classSessionMeeting.date, input.dateISO),
					),
				)
				.limit(1);
			if (!winner?.meetUrl) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.API_ERROR,
					"Không thể lưu thông tin Google Meet cho buổi học.",
					409,
				);
			}
			await mirrorMeetUrlToSessionRows(
				deps.db,
				input.orgId,
				input.classId,
				input.dateISO,
				winner.meetUrl,
			);
			return {
				meetUrl: winner.meetUrl,
				googleCalendarEventId: winner.googleCalendarEventId,
				googleMeetCode: winner.googleMeetCode,
				warning: null,
			};
		};

	if (existing) {
		const claimed = await saveClaimedMeeting(
			existing.id,
			Boolean(existing.recordingUrl),
		);
		if (claimed.length === 0) {
			return cleanupAndReturnWinner();
		}
	} else {
		try {
			await deps.db.insert(classSessionMeeting).values({
				id: crypto.randomUUID(),
				orgId: input.orgId,
				classId: input.classId,
				date: input.dateISO,
				meetUrl,
				googleCalendarEventId: cal.eventId,
				googleMeetSpaceName: spaceName,
				googleMeetCode: meetCode,
				googleOwnerUserId: input.actorUserId,
				recordingUrl: "",
				recordingStatus: "pending",
			});
		} catch (err) {
			const [winner] = await deps.db
				.select()
				.from(classSessionMeeting)
				.where(
					and(
						eq(classSessionMeeting.orgId, input.orgId),
						eq(classSessionMeeting.classId, input.classId),
						eq(classSessionMeeting.date, input.dateISO),
					),
				)
				.limit(1);
			if (!winner) {
				await client.deleteCalendarEvent(cal.eventId).catch(() => undefined);
				throw err;
			}
			if (!winner.meetUrl) {
				const claimed = await saveClaimedMeeting(
					winner.id,
					Boolean(winner.recordingUrl),
				);
				if (claimed.length === 0) {
					return cleanupAndReturnWinner();
				}
			} else {
				return cleanupAndReturnWinner();
			}
		}
	}

	await mirrorMeetUrlToSessionRows(
		deps.db,
		input.orgId,
		input.classId,
		input.dateISO,
		meetUrl,
	);

	return {
		meetUrl,
		googleCalendarEventId: cal.eventId,
		googleMeetCode: meetCode,
		warning,
	};
}

export async function autoProvisionMeetingsForNewClass(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		actorUserId: string;
		mode: string;
		schedule: string;
		startDate: string;
		sessionsTotal: number;
	},
): Promise<void> {
	if (input.mode !== "Online") return;
	const occurrences = deriveScheduledOccurrences(input).slice(
		0,
		MAX_AUTO_PROVISION_ON_CREATE,
	);
	for (const occ of occurrences) {
		try {
			await ensureSessionMeeting(deps, {
				orgId: input.orgId,
				classId: input.classId,
				dateISO: occ.date,
				actorUserId: input.actorUserId,
			});
		} catch (err) {
			if (
				err instanceof GoogleIntegrationError &&
				(err.code === GOOGLE_MEET_ERROR_CODES.NOT_CONNECTED ||
					err.code === GOOGLE_MEET_ERROR_CODES.INSUFFICIENT_SCOPES ||
					err.code === GOOGLE_MEET_ERROR_CODES.REAUTH_REQUIRED)
			) {
				// Giáo viên chưa kết nối đủ quyền — dừng ngay không lặp vô ích.
				return;
			}
			console.warn("[google-meet] auto-provision session failed", {
				classId: input.classId,
				date: occ.date,
				err,
			});
		}
	}
}

export async function bulkCreateMeetingsForClass(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		actorUserId: string;
	},
): Promise<ClassMeetBulkCreateResponse> {
	const [cls] = await deps.db
		.select({
			id: classTable.id,
			schedule: classTable.schedule,
			startDate: classTable.startDate,
			sessionsTotal: classTable.sessionsTotal,
			schedulingMode: classTable.schedulingMode,
		})
		.from(classTable)
		.where(
			and(eq(classTable.id, input.classId), eq(classTable.orgId, input.orgId)),
		)
		.limit(1);

	if (!cls) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			"Không tìm thấy lớp học.",
			404,
		);
	}

	const [csRows, lessonRows, existingMeetings] = await Promise.all([
		deps.db
			.select({ date: classSession.date, zoom: classSession.zoom })
			.from(classSession)
			.where(
				and(
					eq(classSession.orgId, input.orgId),
					eq(classSession.classId, input.classId),
				),
			),
		deps.db
			.select({
				date: lesson.date,
				status: lesson.status,
				zoom: lesson.zoom,
			})
			.from(lesson)
			.where(
				and(eq(lesson.orgId, input.orgId), eq(lesson.classId, input.classId)),
			),
		deps.db
			.select({
				date: classSessionMeeting.date,
				meetUrl: classSessionMeeting.meetUrl,
			})
			.from(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, input.orgId),
					eq(classSessionMeeting.classId, input.classId),
				),
			),
	]);

	const candidateDates = new Set<string>();
	const existingZoomDates = new Set<string>();
	const inactiveDates = new Set<string>();

	for (const m of existingMeetings) {
		if (m.meetUrl) existingZoomDates.add(m.date);
	}
	for (const cs of csRows) {
		candidateDates.add(cs.date);
		if (cs.zoom) existingZoomDates.add(cs.date);
	}
	const activeByDate = new Map<string, boolean>();
	for (const l of lessonRows) {
		if (!l.date) continue;
		candidateDates.add(l.date);
		if (l.zoom) existingZoomDates.add(l.date);
		const isActive = l.status !== "cancelled" && l.status !== "holiday";
		activeByDate.set(l.date, (activeByDate.get(l.date) ?? false) || isActive);
	}
	for (const [d, hasActive] of activeByDate) {
		if (!hasActive) inactiveDates.add(d);
	}
	if (candidateDates.size === 0 && cls.schedulingMode !== "manual") {
		for (const occ of deriveScheduledOccurrences(cls)) {
			candidateDates.add(occ.date);
		}
	}

	const sortedDates = [...candidateDates].sort((a, b) => a.localeCompare(b));
	let created = 0;
	let skipped = 0;
	let failed = 0;
	const errors: Array<{ date: string; message: string }> = [];

	// Validate token/scopes once upfront so NOT_CONNECTED / INSUFFICIENT_SCOPES fails cleanly with 412.
	await resolveClient(deps, input.actorUserId);

	for (const dateISO of sortedDates) {
		if (existingZoomDates.has(dateISO) || inactiveDates.has(dateISO)) {
			skipped += 1;
			continue;
		}
		if (created >= MAX_BULK_CREATE_PER_CALL) {
			skipped += 1;
			continue;
		}
		try {
			await ensureSessionMeeting(deps, {
				orgId: input.orgId,
				classId: input.classId,
				dateISO,
				actorUserId: input.actorUserId,
			});
			created += 1;
		} catch (err) {
			failed += 1;
			errors.push({
				date: dateISO,
				message: err instanceof Error ? err.message : "Lỗi tạo Meet",
			});
		}
	}

	return { created, skipped, failed, errors };
}

export async function syncCalendarOnSessionEdit(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		oldDateISO: string;
		newDateISO: string;
		time?: string;
		dur?: number;
		topic?: string;
		zoom?: string;
	},
): Promise<void> {
	const [meeting] = await deps.db
		.select()
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
				eq(classSessionMeeting.date, input.oldDateISO),
			),
		)
		.limit(1);

	if (!meeting) return;

	const updatePatch: Partial<typeof classSessionMeeting.$inferInsert> = {};
	if (input.oldDateISO !== input.newDateISO) {
		await deps.db
			.delete(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, input.orgId),
					eq(classSessionMeeting.classId, input.classId),
					eq(classSessionMeeting.date, input.newDateISO),
				),
			);
		updatePatch.date = input.newDateISO;
	}
	if (input.zoom !== undefined && input.zoom !== meeting.meetUrl) {
		updatePatch.meetUrl = input.zoom;
		if (input.zoom === "" && !meeting.recordingUrl) {
			updatePatch.recordingStatus = "none";
		}
	}
	if (Object.keys(updatePatch).length > 0) {
		await deps.db
			.update(classSessionMeeting)
			.set(updatePatch)
			.where(eq(classSessionMeeting.id, meeting.id));
	}

	if (!meeting.googleCalendarEventId || !meeting.googleOwnerUserId) return;

	const timing = await resolveOccurrenceTiming(
		deps.db,
		input.orgId,
		input.classId,
		input.newDateISO,
	);
	if (!timing) return;

	try {
		const client = await resolveClient(deps, meeting.googleOwnerUserId);
		await client.patchCalendarEvent({
			eventId: meeting.googleCalendarEventId,
			summary: buildCalendarSummary(
				timing.className,
				input.topic ?? timing.topic,
			),
			dateISO: input.newDateISO,
			time: input.time ?? timing.time,
			dur: input.dur ?? timing.dur,
		});
	} catch (err) {
		console.warn("[google-meet] patchCalendarEvent failed", {
			classId: input.classId,
			date: input.newDateISO,
			err,
		});
	}
}

export async function syncCalendarOnSessionCancelOrDelete(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		deleteMeetingRow?: boolean;
	},
): Promise<void> {
	const [meeting] = await deps.db
		.select()
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
				eq(classSessionMeeting.date, input.dateISO),
			),
		)
		.limit(1);

	if (!meeting) return;

	if (meeting.googleCalendarEventId && meeting.googleOwnerUserId) {
		try {
			const client = await resolveClient(deps, meeting.googleOwnerUserId);
			await client.deleteCalendarEvent(meeting.googleCalendarEventId);
		} catch (err) {
			console.warn("[google-meet] deleteCalendarEvent failed", {
				classId: input.classId,
				date: input.dateISO,
				err,
			});
		}
	}

	if (input.deleteMeetingRow) {
		await deps.db
			.delete(classSessionMeeting)
			.where(eq(classSessionMeeting.id, meeting.id));
	} else {
		await deps.db
			.update(classSessionMeeting)
			.set({
				googleCalendarEventId: null,
				recordingStatus: meeting.recordingUrl ? "ready" : "none",
			})
			.where(eq(classSessionMeeting.id, meeting.id));
	}
}

export async function syncCalendarAttendeesForClass(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
	},
): Promise<void> {
	const meetings = await deps.db
		.select()
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
			),
		);

	const activeEvents = meetings.filter(
		(m) => m.googleCalendarEventId && m.googleOwnerUserId && !m.recordingUrl,
	);
	if (activeEvents.length === 0) return;

	const attendeeEmails = await loadActiveClassStudentEmails(
		deps.db,
		input.orgId,
		input.classId,
	);
	const clientCache = new Map<string, GoogleWorkspaceClient>();

	for (const m of activeEvents.slice(0, 10)) {
		if (!m.googleCalendarEventId || !m.googleOwnerUserId) continue;
		try {
			let client = clientCache.get(m.googleOwnerUserId);
			if (!client) {
				client = await resolveClient(deps, m.googleOwnerUserId);
				clientCache.set(m.googleOwnerUserId, client);
			}
			await client.patchCalendarEvent({
				eventId: m.googleCalendarEventId,
				attendeeEmails,
			});
		} catch (err) {
			console.warn("[google-meet] sync attendees failed", {
				classId: input.classId,
				date: m.date,
				err,
			});
		}
	}
}

export async function syncRecordingForOccurrence(
	deps: GoogleMeetServiceDeps,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		actorUserId?: string;
		cachedClient?: GoogleWorkspaceClient;
	},
): Promise<SessionRecordingSyncResponse> {
	const [meeting] = await deps.db
		.select()
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
				eq(classSessionMeeting.date, input.dateISO),
			),
		)
		.limit(1);

	if (!meeting || (!meeting.googleMeetSpaceName && !meeting.googleMeetCode)) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			"Buổi học này chưa có phòng Google Meet được tạo qua hệ thống.",
			404,
		);
	}

	const ownerId =
		meeting.googleOwnerUserId ??
		input.actorUserId ??
		(await resolveOrgTeacherUserId(deps.db, input.orgId));
	if (!ownerId) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.NOT_CONNECTED,
			"Không xác định được tài khoản Google của giáo viên.",
			412,
		);
	}

	const client = input.cachedClient ?? (await resolveClient(deps, ownerId));
	const now = deps.now ? deps.now() : new Date();

	const rec = await client.findReadyRecording({
		spaceName: meeting.googleMeetSpaceName,
		meetCode: meeting.googleMeetCode,
	});

	if (rec.status === "pending") {
		await deps.db
			.update(classSessionMeeting)
			.set({
				recordingStatus: "pending",
				recordingError: null,
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, meeting.id));

		return {
			status: "pending",
			recordingUrl: meeting.recordingUrl,
			syncedAt: now.toISOString(),
			message:
				"Recording chưa sẵn sàng trên Google Meet. Hệ thống sẽ tiếp tục kiểm tra định kỳ.",
		};
	}

	const studentEmails = await loadActiveClassStudentEmails(
		deps.db,
		input.orgId,
		input.classId,
	);
	let shareWarning: string | null = null;
	if (studentEmails.length > 0) {
		const shareRes = await client.shareDriveFileWithEmails({
			fileId: rec.fileId,
			emails: studentEmails,
		});
		if (shareRes.errors.length > 0) {
			shareWarning = `Không chia sẻ được cho ${shareRes.errors.length} email học viên.`;
		}
	}

	await deps.db
		.update(classSessionMeeting)
		.set({
			recordingUrl: rec.exportUri,
			recordingFileId: rec.fileId,
			recordingStatus: "ready",
			recordingError: shareWarning,
			recordingSyncedAt: now,
		})
		.where(eq(classSessionMeeting.id, meeting.id));

	return {
		status: "ready",
		recordingUrl: rec.exportUri,
		syncedAt: now.toISOString(),
		message: shareWarning,
	};
}

export async function runRecordingSyncCron(
	deps: GoogleMeetServiceDeps,
): Promise<{ checked: number; updated: number; failed: number }> {
	const now = deps.now ? deps.now() : new Date();
	const nowMs = now.getTime();
	const todayISO = vietnamTodayISO(now);
	const minDateISO = addDaysISO(todayISO, -4);

	const candidates = await deps.db
		.select({
			id: classSessionMeeting.id,
			orgId: classSessionMeeting.orgId,
			classId: classSessionMeeting.classId,
			date: classSessionMeeting.date,
			googleMeetSpaceName: classSessionMeeting.googleMeetSpaceName,
			googleMeetCode: classSessionMeeting.googleMeetCode,
			googleOwnerUserId: classSessionMeeting.googleOwnerUserId,
			recordingUrl: classSessionMeeting.recordingUrl,
			recordingStatus: classSessionMeeting.recordingStatus,
			recordingSyncedAt: classSessionMeeting.recordingSyncedAt,
		})
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.recordingUrl, ""),
				inArray(classSessionMeeting.recordingStatus, ["pending", "failed"]),
				gte(classSessionMeeting.date, minDateISO),
				lte(classSessionMeeting.date, todayISO),
			),
		)
		.orderBy(asc(classSessionMeeting.recordingSyncedAt))
		.limit(MAX_CRON_SCAN_ROWS);

	const eligible = candidates.filter(
		(row) =>
			Boolean(row.googleMeetSpaceName || row.googleMeetCode) &&
			!(
				row.recordingStatus === "failed" &&
				row.recordingSyncedAt &&
				nowMs - row.recordingSyncedAt.getTime() < CRON_FAILED_RETRY_MS
			),
	);
	if (eligible.length === 0) {
		return { checked: 0, updated: 0, failed: 0 };
	}

	const classIds = [...new Set(eligible.map((r) => r.classId))];
	const [clsRows, csRows, lessonRows] = await Promise.all([
		deps.db
			.select({
				id: classTable.id,
				orgId: classTable.orgId,
				name: classTable.name,
				mode: classTable.mode,
				schedule: classTable.schedule,
				startDate: classTable.startDate,
				sessionsTotal: classTable.sessionsTotal,
			})
			.from(classTable)
			.where(inArray(classTable.id, classIds)),
		deps.db
			.select({
				orgId: classSession.orgId,
				classId: classSession.classId,
				date: classSession.date,
				time: classSession.time,
				dur: classSession.dur,
				topic: classSession.topic,
			})
			.from(classSession)
			.where(
				and(
					inArray(classSession.classId, classIds),
					gte(classSession.date, minDateISO),
					lte(classSession.date, todayISO),
				),
			),
		deps.db
			.select({
				orgId: lesson.orgId,
				classId: lesson.classId,
				date: lesson.date,
				time: lesson.time,
				dur: lesson.dur,
				topic: lesson.topic,
				status: lesson.status,
			})
			.from(lesson)
			.where(
				and(
					inArray(lesson.classId, classIds),
					gte(lesson.date, minDateISO),
					lte(lesson.date, todayISO),
				),
			),
	]);

	const clsByKey = new Map(clsRows.map((c) => [`${c.orgId}|${c.id}`, c]));
	const csByKey = new Map(
		csRows.map((cs) => [`${cs.orgId}|${cs.classId}|${cs.date}`, cs]),
	);
	const lessonsByKey = new Map<string, typeof lessonRows>();
	for (const l of lessonRows) {
		if (!l.date) continue;
		const k = `${l.orgId}|${l.classId}|${l.date}`;
		const arr = lessonsByKey.get(k);
		if (arr) {
			arr.push(l);
		} else {
			lessonsByKey.set(k, [l]);
		}
	}

	const dueCandidates: typeof candidates = [];
	for (const row of eligible) {
		const cls = clsByKey.get(`${row.orgId}|${row.classId}`);
		const key = `${row.orgId}|${row.classId}|${row.date}`;
		const timing = resolveTimingFromRows(
			cls,
			csByKey.get(key),
			lessonsByKey.get(key) ?? [],
			row.date,
		);
		if (!timing || timing.isCancelledOrHoliday) continue;
		const endMs = vietnamSessionEndMs(row.date, timing.time, timing.dur);
		if (endMs == null) continue;
		const elapsedMs = nowMs - endMs;
		if (
			elapsedMs >= CRON_MIN_AFTER_END_MS &&
			elapsedMs <= CRON_MAX_AFTER_END_MS
		) {
			dueCandidates.push(row);
		}
		if (dueCandidates.length >= MAX_CRON_SYNC_PER_TICK) break;
	}

	let checked = 0;
	let updated = 0;
	let failed = 0;
	const clientCache = new Map<
		string,
		{ ok: true; client: GoogleWorkspaceClient } | { ok: false; err: unknown }
	>();

	for (const row of dueCandidates) {
		checked += 1;
		try {
			const ownerId =
				row.googleOwnerUserId ??
				(await resolveOrgTeacherUserId(deps.db, row.orgId));
			if (!ownerId) continue;

			let entry = clientCache.get(ownerId);
			if (!entry) {
				try {
					const client = await resolveClient(deps, ownerId);
					entry = { ok: true, client };
				} catch (err) {
					entry = { ok: false, err };
				}
				clientCache.set(ownerId, entry);
			}
			if (!entry.ok) {
				throw entry.err;
			}

			const res = await syncRecordingForOccurrence(deps, {
				orgId: row.orgId,
				classId: row.classId,
				dateISO: row.date,
				actorUserId: ownerId,
				cachedClient: entry.client,
			});
			if (res.status === "ready") updated += 1;
		} catch (err) {
			failed += 1;
			const msg = err instanceof Error ? err.message : "Sync recording failed";
			await deps.db
				.update(classSessionMeeting)
				.set({
					recordingStatus: "failed",
					recordingError: msg.slice(0, 300),
					recordingSyncedAt: now,
				})
				.where(eq(classSessionMeeting.id, row.id));
		}
	}

	return { checked, updated, failed };
}

export async function updateSessionRecordingManual(
	db: Db,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		recordingUrl: string;
	},
): Promise<{ status: RecordingStatus; recordingUrl: string }> {
	const trimmed = input.recordingUrl.trim();
	const nextStatus: RecordingStatus = trimmed ? "ready" : "none";
	const now = new Date();

	const [existing] = await db
		.select({ id: classSessionMeeting.id })
		.from(classSessionMeeting)
		.where(
			and(
				eq(classSessionMeeting.orgId, input.orgId),
				eq(classSessionMeeting.classId, input.classId),
				eq(classSessionMeeting.date, input.dateISO),
			),
		)
		.limit(1);

	if (existing) {
		await db
			.update(classSessionMeeting)
			.set({
				recordingUrl: trimmed,
				recordingStatus: nextStatus,
				recordingError: null,
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, existing.id));
	} else if (trimmed) {
		await db.insert(classSessionMeeting).values({
			id: crypto.randomUUID(),
			orgId: input.orgId,
			classId: input.classId,
			date: input.dateISO,
			meetUrl: "",
			recordingUrl: trimmed,
			recordingStatus: nextStatus,
			recordingSyncedAt: now,
		});
	}

	return { status: nextStatus, recordingUrl: trimmed };
}
