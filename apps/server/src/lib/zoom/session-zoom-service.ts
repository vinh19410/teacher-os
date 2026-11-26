import {
	type ClassZoomBulkCreateResponse,
	RECORDING_RETENTION_DAYS,
	type RecordingStatus,
	type RecordingZoomTrashStatus,
	type SessionRecordingSyncResponse,
	type SessionZoomCreateResponse,
	ZOOM_ERROR_CODES,
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
	lesson,
} from "@teacher-os/db/schema/index";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	or,
} from "drizzle-orm";
import type { Db } from "../../app";
import type { RecordingPutResult, RecordingStore } from "../recording-store";
import {
	createZoomClient,
	type FetchFn,
	isZoomConfigured,
	type ZoomClient,
	type ZoomConfig,
	ZoomIntegrationError,
	type ZoomRecordingDownloadResult,
} from "./zoom-client";

export interface ZoomServiceDeps {
	db: Db;
	zoom?: ZoomConfig;
	fetchFn?: FetchFn;
	/** Test/E2E injection hook to avoid real Zoom network calls. */
	getZoomClient?: () => ZoomClient;
	/** Kho lưu trữ video recording R2 (production) hoặc FS (E2E). */
	recordingStore?: RecordingStore;
	/** Chạy dọn object R2 bù trừ ngoài vòng đời response (`waitUntil` ở Worker). */
	runInBackground?: (promise: Promise<unknown>) => void;
	now?: () => Date;
}

const MAX_AUTO_PROVISION_ON_CREATE = 5;
const MAX_BULK_CREATE_PER_CALL = 12;
const MAX_CRON_SYNC_PER_TICK = 10;
const MAX_CRON_REUP_PER_TICK = 2;
const MAX_CRON_TRASH_RETRY_PER_TICK = 10;
const MAX_CRON_EXPIRE_SWEEP_PER_TICK = 50;
const MAX_CRON_SCAN_ROWS = 30;
const CRON_MIN_AFTER_END_MS = 5 * 60_000;
const CRON_MAX_AFTER_END_MS = 72 * 3600_000;
const CRON_FAILED_RETRY_MS = 60 * 60_000;
const RECORDING_RETENTION_MS = RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const RECORDING_TIMEOUT_MESSAGE =
	"Không tìm thấy cloud recording trên Zoom sau 72 giờ (có thể hết dung lượng cloud hoặc buổi không được ghi).";

function isStorageExpired(
	storageKey: string | null | undefined,
	expiresAt: Date | null | undefined,
	now: Date,
): boolean {
	return Boolean(
		storageKey && expiresAt && expiresAt.getTime() <= now.getTime(),
	);
}

function normalizeTrashStatus(
	raw: string | null | undefined,
): RecordingZoomTrashStatus {
	if (
		raw === "none" ||
		raw === "pending" ||
		raw === "trashed" ||
		raw === "failed"
	) {
		return raw;
	}
	return "none";
}

async function deleteRecordingObjectBestEffort(
	store: RecordingStore | undefined,
	key: string | null | undefined,
	context: Record<string, unknown>,
	runInBackground?: (promise: Promise<unknown>) => void,
): Promise<void> {
	if (!store || !key) return;
	const task = store.delete(key).catch((err) => {
		console.warn("[zoom] delete recording object failed", {
			...context,
			key,
			err,
		});
	});
	if (runInBackground) {
		runInBackground(task);
	} else {
		await task;
	}
}

async function tryTrashZoomRecording(
	db: Db,
	client: ZoomClient,
	rowId: string,
	zoomMeetingId: string,
	now: Date,
): Promise<"trashed" | "failed"> {
	if (!client.trashRecording) {
		await db
			.update(classSessionMeeting)
			.set({
				recordingZoomTrashStatus: "failed",
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, rowId));
		return "failed";
	}
	try {
		await client.trashRecording(zoomMeetingId);
		await db
			.update(classSessionMeeting)
			.set({
				recordingZoomTrashStatus: "trashed",
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, rowId));
		return "trashed";
	} catch (err) {
		console.warn("[zoom] trashRecording failed", {
			id: rowId,
			zoomMeetingId,
			err,
		});
		await db
			.update(classSessionMeeting)
			.set({
				recordingZoomTrashStatus: "failed",
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, rowId));
		return "failed";
	}
}

function resolveZoomClient(deps: ZoomServiceDeps): ZoomClient {
	return deps.getZoomClient
		? deps.getZoomClient()
		: createZoomClient(deps.zoom ?? {}, deps.fetchFn);
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

export async function mirrorJoinUrlToSessionRows(
	db: Db,
	orgId: string,
	classId: string,
	dateISO: string,
	joinUrl: string,
): Promise<void> {
	await Promise.all([
		db
			.update(classSession)
			.set({ zoom: joinUrl })
			.where(
				and(
					eq(classSession.orgId, orgId),
					eq(classSession.classId, classId),
					eq(classSession.date, dateISO),
				),
			),
		db
			.update(lesson)
			.set({ zoom: joinUrl })
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					eq(lesson.date, dateISO),
				),
			),
	]);
}

export function buildMeetingTopic(className: string, topic: string): string {
	const trimmedTopic = topic.trim();
	return trimmedTopic ? `${className} — ${trimmedTopic}` : className;
}

function buildMeetingAgenda(
	className: string,
	dateISO: string,
	time: string,
): string {
	return `Buổi học lớp ${className} (${dateISO} ${time})`;
}

export async function ensureSessionMeeting(
	deps: ZoomServiceDeps,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
	},
): Promise<SessionZoomCreateResponse> {
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

	if (existing?.joinUrl) {
		await mirrorJoinUrlToSessionRows(
			deps.db,
			input.orgId,
			input.classId,
			input.dateISO,
			existing.joinUrl,
		);
		return {
			joinUrl: existing.joinUrl,
			zoomMeetingId: existing.zoomMeetingId,
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
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
			"Không tìm thấy buổi học để tạo Zoom.",
			404,
		);
	}
	if (timing.isCancelledOrHoliday) {
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
			"Không thể tạo Zoom cho buổi đã hủy hoặc nghỉ lễ.",
			409,
		);
	}

	const client = resolveZoomClient(deps);
	const created = await client.createMeeting({
		topic: buildMeetingTopic(timing.className, timing.topic),
		agenda: buildMeetingAgenda(timing.className, input.dateISO, timing.time),
		dateISO: input.dateISO,
		time: timing.time,
		durMinutes: timing.dur,
	});
	const { joinUrl, meetingId } = created;

	const saveClaimedMeeting = async (
		winnerId: string,
		winnerHasRecording: boolean,
	) =>
		deps.db
			.update(classSessionMeeting)
			.set({
				joinUrl,
				zoomMeetingId: meetingId,
				recordingStatus: winnerHasRecording ? "ready" : "pending",
			})
			.where(
				and(
					eq(classSessionMeeting.id, winnerId),
					eq(classSessionMeeting.joinUrl, ""),
				),
			)
			.returning({ id: classSessionMeeting.id });

	const deleteSurplusMeeting = async () => {
		try {
			await client.deleteMeeting(meetingId);
		} catch (err) {
			console.warn("[zoom] delete duplicate meeting failed", {
				classId: input.classId,
				date: input.dateISO,
				err,
			});
		}
	};

	const cleanupAndReturnWinner =
		async (): Promise<SessionZoomCreateResponse> => {
			await deleteSurplusMeeting();
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
			if (!winner?.joinUrl) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"Không thể lưu thông tin Zoom cho buổi học.",
					409,
				);
			}
			await mirrorJoinUrlToSessionRows(
				deps.db,
				input.orgId,
				input.classId,
				input.dateISO,
				winner.joinUrl,
			);
			return {
				joinUrl: winner.joinUrl,
				zoomMeetingId: winner.zoomMeetingId,
				warning: null,
			};
		};

	const now = deps.now ? deps.now() : new Date();
	const hasActiveRecording = (row: {
		recordingUrl: string;
		recordingStorageKey: string | null;
		recordingExpiresAt: Date | null;
	}) =>
		Boolean(
			row.recordingUrl ||
				(row.recordingStorageKey &&
					!isStorageExpired(
						row.recordingStorageKey,
						row.recordingExpiresAt,
						now,
					)),
		);

	if (existing) {
		const claimed = await saveClaimedMeeting(
			existing.id,
			hasActiveRecording(existing),
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
				joinUrl,
				zoomMeetingId: meetingId,
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
				await deleteSurplusMeeting();
				throw err;
			}
			if (!winner.joinUrl) {
				const claimed = await saveClaimedMeeting(
					winner.id,
					hasActiveRecording(winner),
				);
				if (claimed.length === 0) {
					return cleanupAndReturnWinner();
				}
			} else {
				return cleanupAndReturnWinner();
			}
		}
	}

	await mirrorJoinUrlToSessionRows(
		deps.db,
		input.orgId,
		input.classId,
		input.dateISO,
		joinUrl,
	);

	return { joinUrl, zoomMeetingId: meetingId, warning: null };
}

function isDailyQuotaError(err: unknown): boolean {
	return (
		err instanceof ZoomIntegrationError &&
		err.code === ZOOM_ERROR_CODES.RATE_LIMITED
	);
}

export async function autoProvisionMeetingsForNewClass(
	deps: ZoomServiceDeps,
	input: {
		orgId: string;
		classId: string;
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
			});
		} catch (err) {
			if (
				err instanceof ZoomIntegrationError &&
				err.code === ZOOM_ERROR_CODES.NOT_CONFIGURED
			) {
				// Chưa cấu hình Zoom — dừng ngay không lặp vô ích.
				return;
			}
			if (isDailyQuotaError(err)) {
				console.warn("[zoom] auto-provision stopped: Zoom quota reached", {
					classId: input.classId,
					date: occ.date,
				});
				return;
			}
			console.warn("[zoom] auto-provision session failed", {
				classId: input.classId,
				date: occ.date,
				err,
			});
		}
	}
}

export async function bulkCreateMeetingsForClass(
	deps: ZoomServiceDeps,
	input: {
		orgId: string;
		classId: string;
	},
): Promise<ClassZoomBulkCreateResponse> {
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
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
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
				joinUrl: classSessionMeeting.joinUrl,
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
		if (m.joinUrl) existingZoomDates.add(m.date);
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

	// Kiểm tra cấu hình Zoom một lần ngay đầu để trả 503 gọn thay vì lỗi từng buổi.
	resolveZoomClient(deps);

	let quotaReached = false;
	for (const dateISO of sortedDates) {
		if (quotaReached) {
			skipped += 1;
			continue;
		}
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
			});
			created += 1;
		} catch (err) {
			failed += 1;
			errors.push({
				date: dateISO,
				message: err instanceof Error ? err.message : "Lỗi tạo Zoom",
			});
			if (isDailyQuotaError(err)) quotaReached = true;
		}
	}

	return { created, skipped, failed, errors };
}

async function deleteZoomMeetingBestEffort(
	deps: ZoomServiceDeps,
	zoomMeetingId: string,
	context: { classId: string; date: string },
): Promise<void> {
	try {
		await resolveZoomClient(deps).deleteMeeting(zoomMeetingId);
	} catch (err) {
		console.warn("[zoom] deleteMeeting failed", { ...context, err });
	}
}

export async function syncZoomOnSessionEdit(
	deps: ZoomServiceDeps,
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
		const [target] = await deps.db
			.select()
			.from(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, input.orgId),
					eq(classSessionMeeting.classId, input.classId),
					eq(classSessionMeeting.date, input.newDateISO),
				),
			)
			.limit(1);
		if (target?.zoomMeetingId) {
			await deleteZoomMeetingBestEffort(deps, target.zoomMeetingId, {
				classId: input.classId,
				date: input.newDateISO,
			});
		}
		await deps.db
			.delete(classSessionMeeting)
			.where(
				and(
					eq(classSessionMeeting.orgId, input.orgId),
					eq(classSessionMeeting.classId, input.classId),
					eq(classSessionMeeting.date, input.newDateISO),
				),
			);
		if (target?.recordingStorageKey) {
			await deleteRecordingObjectBestEffort(
				deps.recordingStore,
				target.recordingStorageKey,
				{
					classId: input.classId,
					date: input.newDateISO,
					reason: "session-move-overwrite",
				},
				deps.runInBackground,
			);
		}
		updatePatch.date = input.newDateISO;
	}
	let detachedFromSystemMeeting = false;
	const hasStoredOrExpiredRecording =
		Boolean(meeting.recordingStorageKey) ||
		meeting.recordingStatus === "expired";
	if (input.zoom !== undefined && input.zoom !== meeting.joinUrl) {
		updatePatch.joinUrl = input.zoom;
		if (meeting.zoomMeetingId) {
			// Link do giáo viên tự nhập thay thế meeting hệ thống: xoá meeting cũ
			// để không mồ côi và cron không theo dõi nhầm.
			await deleteZoomMeetingBestEffort(deps, meeting.zoomMeetingId, {
				classId: input.classId,
				date: input.oldDateISO,
			});
			updatePatch.zoomMeetingId = null;
			if (!hasStoredOrExpiredRecording) {
				updatePatch.recordingStatus = meeting.recordingUrl ? "ready" : "none";
			}
			detachedFromSystemMeeting = true;
		} else if (
			input.zoom === "" &&
			!meeting.recordingUrl &&
			!hasStoredOrExpiredRecording
		) {
			updatePatch.recordingStatus = "none";
		}
	}
	if (Object.keys(updatePatch).length > 0) {
		await deps.db
			.update(classSessionMeeting)
			.set(updatePatch)
			.where(eq(classSessionMeeting.id, meeting.id));
	}

	if (!meeting.zoomMeetingId || detachedFromSystemMeeting) return;

	const timing = await resolveOccurrenceTiming(
		deps.db,
		input.orgId,
		input.classId,
		input.newDateISO,
	);
	if (!timing) return;

	try {
		const client = resolveZoomClient(deps);
		const time = input.time ?? timing.time;
		await client.updateMeeting(meeting.zoomMeetingId, {
			topic: buildMeetingTopic(timing.className, input.topic ?? timing.topic),
			agenda: buildMeetingAgenda(timing.className, input.newDateISO, time),
			dateISO: input.newDateISO,
			time,
			durMinutes: input.dur ?? timing.dur,
		});
	} catch (err) {
		console.warn("[zoom] updateMeeting failed", {
			classId: input.classId,
			date: input.newDateISO,
			err,
		});
	}
}

export async function syncZoomOnSessionCancelOrDelete(
	deps: ZoomServiceDeps,
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

	if (meeting.zoomMeetingId) {
		try {
			const client = resolveZoomClient(deps);
			await client.deleteMeeting(meeting.zoomMeetingId);
		} catch (err) {
			console.warn("[zoom] deleteMeeting failed", {
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
		if (meeting.recordingStorageKey) {
			await deleteRecordingObjectBestEffort(
				deps.recordingStore,
				meeting.recordingStorageKey,
				{
					classId: input.classId,
					date: input.dateISO,
					reason: "session-delete",
				},
				deps.runInBackground,
			);
		}
	} else {
		const nextRecordingStatus =
			meeting.recordingStorageKey || meeting.recordingStatus === "expired"
				? meeting.recordingStatus
				: meeting.recordingUrl
					? "ready"
					: "none";
		await deps.db
			.update(classSessionMeeting)
			.set({
				zoomMeetingId: null,
				joinUrl: "",
				recordingStatus: nextRecordingStatus,
			})
			.where(eq(classSessionMeeting.id, meeting.id));
		await mirrorJoinUrlToSessionRows(
			deps.db,
			input.orgId,
			input.classId,
			input.dateISO,
			"",
		);
	}
}

export interface ZoomRescheduleMovedMeeting {
	zoomMeetingId: string;
	newDateISO: string;
	time: string;
	dur: number;
	topic: string;
}

export interface ZoomRescheduleDeletedMeeting {
	zoomMeetingId: string;
	dateISO: string;
}

export interface ZoomRescheduleSyncPlan {
	movedMeetings: ZoomRescheduleMovedMeeting[];
	deletedZoomMeetingIds: ZoomRescheduleDeletedMeeting[];
}

/**
 * Đồng bộ hàng loạt phòng Zoom sau khi batch đổi ngày khai giảng đã commit DB:
 * gọi trực tiếp `deleteMeeting` / `updateMeeting` theo danh sách kết quả cuối,
 * tránh xóa nhầm đích khi lịch mới gối đè lên các ngày lịch cũ.
 */
export async function syncZoomMeetingsAfterReschedule(
	deps: ZoomServiceDeps,
	input: {
		orgId: string;
		classId: string;
		className: string;
		plan: ZoomRescheduleSyncPlan;
	},
): Promise<void> {
	for (const deleted of input.plan.deletedZoomMeetingIds) {
		await deleteZoomMeetingBestEffort(deps, deleted.zoomMeetingId, {
			classId: input.classId,
			date: deleted.dateISO,
		});
	}

	if (input.plan.movedMeetings.length === 0) return;

	let client: ZoomClient;
	try {
		client = resolveZoomClient(deps);
	} catch (err) {
		console.warn("[zoom] reschedule sync skipped: client unavailable", {
			classId: input.classId,
			err,
		});
		return;
	}

	for (const moved of input.plan.movedMeetings) {
		try {
			await client.updateMeeting(moved.zoomMeetingId, {
				topic: buildMeetingTopic(input.className, moved.topic),
				agenda: buildMeetingAgenda(
					input.className,
					moved.newDateISO,
					moved.time,
				),
				dateISO: moved.newDateISO,
				time: moved.time,
				durMinutes: moved.dur,
			});
		} catch (err) {
			console.warn("[zoom] updateMeeting after reschedule failed", {
				classId: input.classId,
				date: moved.newDateISO,
				zoomMeetingId: moved.zoomMeetingId,
				err,
			});
		}
	}
}

export async function syncRecordingForOccurrence(
	deps: ZoomServiceDeps,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		cachedClient?: ZoomClient;
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

	if (!meeting?.zoomMeetingId) {
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
			"Buổi học này chưa có Zoom meeting được tạo qua hệ thống.",
			404,
		);
	}

	const client = input.cachedClient ?? resolveZoomClient(deps);
	const now = deps.now ? deps.now() : new Date();
	const oldKeyExpired = isStorageExpired(
		meeting.recordingStorageKey,
		meeting.recordingExpiresAt,
		now,
	);

	// Đã lưu sẵn trên R2 và chưa hết hạn 90 ngày → trả ngay trạng thái R2, đồng thời thử dọn lại Zoom Trash nếu đang pending/failed.
	if (meeting.recordingStorageKey && !oldKeyExpired) {
		let trashStatus = normalizeTrashStatus(meeting.recordingZoomTrashStatus);
		if (trashStatus === "pending" || trashStatus === "failed") {
			trashStatus = await tryTrashZoomRecording(
				deps.db,
				client,
				meeting.id,
				meeting.zoomMeetingId,
				now,
			);
		}
		return {
			status: "ready",
			recordingUrl: "",
			recordingPassword: null,
			recordingSource: "r2",
			hasRecordingVideo: true,
			recordingExpiresAt: meeting.recordingExpiresAt
				? meeting.recordingExpiresAt.toISOString()
				: null,
			recordingZoomTrashStatus: trashStatus,
			syncedAt: (meeting.recordingSyncedAt ?? now).toISOString(),
			message: null,
		};
	}

	const rec = await client.getRecording(meeting.zoomMeetingId);

	if (rec.status !== "ready") {
		if (oldKeyExpired && meeting.recordingStorageKey) {
			await deleteRecordingObjectBestEffort(
				deps.recordingStore,
				meeting.recordingStorageKey,
				{ id: meeting.id, reason: "sync-found-expired" },
				deps.runInBackground,
			);
			await deps.db
				.update(classSessionMeeting)
				.set({
					recordingStorageKey: null,
					recordingSizeBytes: null,
					recordingMimeType: null,
					recordingStatus: "expired",
					recordingUrl: "",
					recordingPassword: null,
					recordingError: null,
					recordingSyncedAt: now,
				})
				.where(eq(classSessionMeeting.id, meeting.id));
			return {
				status: "expired",
				recordingUrl: "",
				recordingPassword: null,
				recordingSource: null,
				hasRecordingVideo: false,
				recordingExpiresAt: meeting.recordingExpiresAt
					? meeting.recordingExpiresAt.toISOString()
					: null,
				recordingZoomTrashStatus: normalizeTrashStatus(
					meeting.recordingZoomTrashStatus,
				),
				syncedAt: now.toISOString(),
				message: "Recording đã hết hạn lưu trữ (90 ngày).",
			};
		}

		if (meeting.recordingStatus === "expired" && rec.status === "missing") {
			return {
				status: "expired",
				recordingUrl: "",
				recordingPassword: null,
				recordingSource: null,
				hasRecordingVideo: false,
				recordingExpiresAt: meeting.recordingExpiresAt
					? meeting.recordingExpiresAt.toISOString()
					: null,
				recordingZoomTrashStatus: normalizeTrashStatus(
					meeting.recordingZoomTrashStatus,
				),
				syncedAt: (meeting.recordingSyncedAt ?? now).toISOString(),
				message: "Recording đã hết hạn lưu trữ (90 ngày).",
			};
		}

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
			recordingPassword: meeting.recordingPassword,
			recordingSource: meeting.recordingUrl ? "external" : null,
			hasRecordingVideo: false,
			recordingExpiresAt: null,
			recordingZoomTrashStatus: normalizeTrashStatus(
				meeting.recordingZoomTrashStatus,
			),
			syncedAt: now.toISOString(),
			message:
				"Recording chưa sẵn sàng trên Zoom. Hệ thống sẽ tiếp tục kiểm tra định kỳ.",
		};
	}

	// Lưu link Zoom dự phòng khi không thể reup lên R2 — TUYỆT ĐỐI KHÔNG gọi Zoom Trash.
	const saveZoomFallback = async (
		errMsg: string,
	): Promise<SessionRecordingSyncResponse> => {
		const truncated = errMsg.slice(0, 300);
		await deps.db
			.update(classSessionMeeting)
			.set({
				recordingUrl: rec.shareUrl,
				recordingPassword: rec.password,
				recordingStatus: "failed",
				recordingError: truncated,
				recordingSyncedAt: now,
				recordingStorageKey: null,
				recordingSizeBytes: null,
				recordingMimeType: null,
				recordingUploadedAt: null,
				recordingExpiresAt: null,
				recordingZoomTrashStatus: "none",
			})
			.where(eq(classSessionMeeting.id, meeting.id));

		return {
			status: "failed",
			recordingUrl: rec.shareUrl,
			recordingPassword: rec.password,
			recordingSource: rec.shareUrl ? "external" : null,
			hasRecordingVideo: false,
			recordingExpiresAt: null,
			recordingZoomTrashStatus: "none",
			syncedAt: now.toISOString(),
			message: truncated,
		};
	};

	if (!deps.recordingStore) {
		return saveZoomFallback(
			"Chưa cấu hình kho lưu trữ R2 (RECORDINGS); đang tạm dùng link Zoom.",
		);
	}

	if (!rec.primaryFile) {
		return saveZoomFallback(
			"Zoom chưa có file video MP4 để lưu lên R2; đang tạm dùng link Zoom.",
		);
	}

	if (!client.downloadRecordingFile) {
		return saveZoomFallback(
			"Zoom client không hỗ trợ tải file MP4; đang tạm dùng link Zoom.",
		);
	}

	const storageKey = `${input.orgId}/${input.classId}/${input.dateISO}/${crypto.randomUUID()}.mp4`;
	let downloaded: ZoomRecordingDownloadResult;
	let putRes: RecordingPutResult;
	try {
		downloaded = await client.downloadRecordingFile(
			rec.primaryFile.downloadUrl,
		);
		putRes = await deps.recordingStore.putStream(storageKey, downloaded.body, {
			contentType: downloaded.contentType,
			declaredSize: downloaded.contentLength,
		});
	} catch (err) {
		await deps.recordingStore.delete(storageKey).catch(() => {});
		const msg =
			err instanceof Error
				? err.message
				: "Không thể tải video recording từ Zoom lên R2.";
		return saveZoomFallback(msg);
	}

	const expiresAt = new Date(now.getTime() + RECORDING_RETENTION_MS);
	let claimed: Array<{ id: string }>;
	try {
		claimed = await deps.db
			.update(classSessionMeeting)
			.set({
				recordingStorageKey: storageKey,
				recordingSizeBytes: putRes.sizeBytes,
				recordingMimeType: downloaded.contentType,
				recordingUploadedAt: now,
				recordingExpiresAt: expiresAt,
				recordingStatus: "ready",
				recordingUrl: "",
				recordingPassword: null,
				recordingError: null,
				recordingSyncedAt: now,
				recordingZoomTrashStatus: "pending",
			})
			.where(
				and(
					eq(classSessionMeeting.id, meeting.id),
					or(
						isNull(classSessionMeeting.recordingStorageKey),
						lte(classSessionMeeting.recordingExpiresAt, now),
					),
				),
			)
			.returning({ id: classSessionMeeting.id });
	} catch (err) {
		await deps.recordingStore.delete(storageKey).catch(() => {});
		throw err;
	}

	// Thua race đồng thời: xoá bản dư vừa đẩy lên R2 và trả trạng thái của lượt thắng.
	if (claimed.length === 0) {
		await deps.recordingStore.delete(storageKey).catch(() => {});
		const [winner] = await deps.db
			.select()
			.from(classSessionMeeting)
			.where(eq(classSessionMeeting.id, meeting.id))
			.limit(1);
		if (!winner) {
			throw new ZoomIntegrationError(
				ZOOM_ERROR_CODES.API_ERROR,
				"Không tìm thấy bản ghi buổi học sau khi đồng bộ recording.",
				404,
			);
		}
		const winnerExpired = isStorageExpired(
			winner.recordingStorageKey,
			winner.recordingExpiresAt,
			now,
		);
		const winnerHasVideo =
			Boolean(winner.recordingStorageKey) && !winnerExpired;
		const winnerStatus: RecordingStatus = winnerExpired
			? "expired"
			: (winner.recordingStatus as RecordingStatus) || "ready";
		return {
			status: winnerStatus,
			recordingUrl: winnerHasVideo || winnerExpired ? "" : winner.recordingUrl,
			recordingPassword:
				winnerHasVideo || winnerExpired
					? null
					: (winner.recordingPassword ?? null),
			recordingSource: winnerHasVideo
				? "r2"
				: !winnerExpired && winner.recordingUrl
					? "external"
					: null,
			hasRecordingVideo: winnerHasVideo,
			recordingExpiresAt: winner.recordingExpiresAt
				? winner.recordingExpiresAt.toISOString()
				: null,
			recordingZoomTrashStatus: normalizeTrashStatus(
				winner.recordingZoomTrashStatus,
			),
			syncedAt: (winner.recordingSyncedAt ?? now).toISOString(),
			message: winner.recordingError ?? null,
		};
	}

	if (
		oldKeyExpired &&
		meeting.recordingStorageKey &&
		meeting.recordingStorageKey !== storageKey
	) {
		await deleteRecordingObjectBestEffort(
			deps.recordingStore,
			meeting.recordingStorageKey,
			{ id: meeting.id, reason: "replaced-expired-recording" },
			deps.runInBackground,
		);
	}

	// Chỉ đưa bản gốc trên Zoom vào Trash SAU KHI R2 + D1 đã commit thành công.
	const finalTrashStatus = await tryTrashZoomRecording(
		deps.db,
		client,
		meeting.id,
		meeting.zoomMeetingId,
		now,
	);

	return {
		status: "ready",
		recordingUrl: "",
		recordingPassword: null,
		recordingSource: "r2",
		hasRecordingVideo: true,
		recordingExpiresAt: expiresAt.toISOString(),
		recordingZoomTrashStatus: finalTrashStatus,
		syncedAt: now.toISOString(),
		message: null,
	};
}

export async function runRecordingExpiryCron(deps: {
	db: Db;
	recordingStore?: RecordingStore;
	now?: () => Date;
}): Promise<{ expired: number; failed: number }> {
	const now = deps.now ? deps.now() : new Date();
	const rows = await deps.db
		.select({
			id: classSessionMeeting.id,
			recordingStorageKey: classSessionMeeting.recordingStorageKey,
		})
		.from(classSessionMeeting)
		.where(
			and(
				isNotNull(classSessionMeeting.recordingStorageKey),
				lte(classSessionMeeting.recordingExpiresAt, now),
			),
		)
		.orderBy(asc(classSessionMeeting.recordingExpiresAt))
		.limit(MAX_CRON_EXPIRE_SWEEP_PER_TICK);

	let expired = 0;
	let failed = 0;

	for (const row of rows) {
		const key = row.recordingStorageKey;
		if (!key) continue;
		if (deps.recordingStore) {
			try {
				await deps.recordingStore.delete(key);
			} catch (err) {
				failed += 1;
				console.warn("[zoom] delete expired recording object failed", {
					id: row.id,
					key,
					err,
				});
				continue;
			}
		}
		await deps.db
			.update(classSessionMeeting)
			.set({
				recordingStorageKey: null,
				recordingSizeBytes: null,
				recordingMimeType: null,
				recordingStatus: "expired",
				recordingUrl: "",
				recordingPassword: null,
				recordingError: null,
			})
			.where(
				and(
					eq(classSessionMeeting.id, row.id),
					eq(classSessionMeeting.recordingStorageKey, key),
				),
			);
		expired += 1;
	}

	return { expired, failed };
}

export interface RecordingSyncCronResult {
	checked: number;
	updated: number;
	failed: number;
	expired: number;
	trashed: number;
}

export async function runRecordingSyncCron(
	deps: ZoomServiceDeps,
): Promise<RecordingSyncCronResult> {
	const now = deps.now ? deps.now() : new Date();
	const expiryRes = await runRecordingExpiryCron({
		db: deps.db,
		recordingStore: deps.recordingStore,
		now: () => now,
	});

	if (!isZoomConfigured(deps.zoom) && !deps.getZoomClient) {
		return {
			checked: 0,
			updated: 0,
			failed: expiryRes.failed,
			expired: expiryRes.expired,
			trashed: 0,
		};
	}

	const nowMs = now.getTime();
	const todayISO = vietnamTodayISO(now);
	const minDateISO = addDaysISO(todayISO, -4);

	let cachedClient: ZoomClient | undefined;
	const getClient = (): ZoomClient | null => {
		if (cachedClient) return cachedClient;
		try {
			cachedClient = resolveZoomClient(deps);
			return cachedClient;
		} catch (err) {
			console.warn("[zoom] recording sync cron: client unavailable", err);
			return null;
		}
	};

	let trashed = 0;
	const retryCutoff = new Date(nowMs - CRON_FAILED_RETRY_MS);

	// 1. Thử đưa lại bản gốc Zoom vào Trash cho các bản ghi đã lưu R2 nhưng trash còn pending/failed.
	const trashCandidates = await deps.db
		.select({
			id: classSessionMeeting.id,
			zoomMeetingId: classSessionMeeting.zoomMeetingId,
			recordingZoomTrashStatus: classSessionMeeting.recordingZoomTrashStatus,
			recordingSyncedAt: classSessionMeeting.recordingSyncedAt,
		})
		.from(classSessionMeeting)
		.where(
			and(
				isNotNull(classSessionMeeting.recordingStorageKey),
				isNotNull(classSessionMeeting.zoomMeetingId),
				or(
					eq(classSessionMeeting.recordingZoomTrashStatus, "pending"),
					and(
						eq(classSessionMeeting.recordingZoomTrashStatus, "failed"),
						or(
							isNull(classSessionMeeting.recordingSyncedAt),
							lte(classSessionMeeting.recordingSyncedAt, retryCutoff),
						),
					),
				),
			),
		)
		.orderBy(asc(classSessionMeeting.recordingSyncedAt))
		.limit(MAX_CRON_TRASH_RETRY_PER_TICK);

	const dueTrashCandidates = trashCandidates.filter(
		(row) =>
			Boolean(row.zoomMeetingId) &&
			!(
				row.recordingZoomTrashStatus === "failed" &&
				row.recordingSyncedAt &&
				nowMs - row.recordingSyncedAt.getTime() < CRON_FAILED_RETRY_MS
			),
	);

	if (dueTrashCandidates.length > 0) {
		const client = getClient();
		if (client) {
			for (const row of dueTrashCandidates) {
				if (!row.zoomMeetingId) continue;
				const status = await tryTrashZoomRecording(
					deps.db,
					client,
					row.id,
					row.zoomMeetingId,
					now,
				);
				if (status === "trashed") trashed += 1;
			}
		}
	}

	// 2. Quét các buổi chưa có file R2 (không tự backfill dòng legacy `ready` không có storageKey).
	const candidates = await deps.db
		.select({
			id: classSessionMeeting.id,
			orgId: classSessionMeeting.orgId,
			classId: classSessionMeeting.classId,
			date: classSessionMeeting.date,
			zoomMeetingId: classSessionMeeting.zoomMeetingId,
			recordingUrl: classSessionMeeting.recordingUrl,
			recordingStatus: classSessionMeeting.recordingStatus,
			recordingSyncedAt: classSessionMeeting.recordingSyncedAt,
		})
		.from(classSessionMeeting)
		.where(
			and(
				isNull(classSessionMeeting.recordingStorageKey),
				or(
					eq(classSessionMeeting.recordingStatus, "pending"),
					// Dòng failed chỉ được thử lại khi đã qua chu kỳ retry và còn trong
					// cửa sổ 72 giờ, để không chiếm chỗ của dòng pending.
					and(
						eq(classSessionMeeting.recordingStatus, "failed"),
						gte(classSessionMeeting.date, addDaysISO(todayISO, -3)),
						or(
							isNull(classSessionMeeting.recordingSyncedAt),
							lte(classSessionMeeting.recordingSyncedAt, retryCutoff),
						),
					),
				),
				gte(classSessionMeeting.date, minDateISO),
				lte(classSessionMeeting.date, todayISO),
			),
		)
		.orderBy(
			desc(classSessionMeeting.date),
			asc(classSessionMeeting.recordingSyncedAt),
		)
		.limit(MAX_CRON_SCAN_ROWS);

	const eligible = candidates.filter(
		(row) =>
			Boolean(row.zoomMeetingId) &&
			!(
				row.recordingStatus === "failed" &&
				row.recordingSyncedAt &&
				nowMs - row.recordingSyncedAt.getTime() < CRON_FAILED_RETRY_MS
			),
	);
	if (eligible.length === 0) {
		return {
			checked: 0,
			updated: 0,
			failed: expiryRes.failed,
			expired: expiryRes.expired,
			trashed,
		};
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

	let checked = 0;
	let updated = 0;
	let failed = expiryRes.failed;
	const dueCandidates: typeof candidates = [];
	const timedOutIds: string[] = [];
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
		if (elapsedMs > CRON_MAX_AFTER_END_MS) {
			if (row.recordingStatus === "pending" && row.recordingUrl === "") {
				timedOutIds.push(row.id);
			}
			continue;
		}
		if (elapsedMs >= CRON_MIN_AFTER_END_MS) {
			dueCandidates.push(row);
		}
		if (dueCandidates.length >= MAX_CRON_SYNC_PER_TICK) break;
	}

	for (const id of timedOutIds) {
		checked += 1;
		failed += 1;
		await deps.db
			.update(classSessionMeeting)
			.set({
				recordingStatus: "failed",
				recordingError: RECORDING_TIMEOUT_MESSAGE,
				recordingSyncedAt: now,
			})
			.where(eq(classSessionMeeting.id, id));
	}

	if (dueCandidates.length === 0) {
		return {
			checked,
			updated,
			failed,
			expired: expiryRes.expired,
			trashed,
		};
	}

	const client = getClient();
	if (!client) {
		return {
			checked,
			updated,
			failed,
			expired: expiryRes.expired,
			trashed,
		};
	}

	let reupsAttempted = 0;
	for (const row of dueCandidates) {
		if (reupsAttempted >= MAX_CRON_REUP_PER_TICK) break;
		checked += 1;
		try {
			const res = await syncRecordingForOccurrence(deps, {
				orgId: row.orgId,
				classId: row.classId,
				dateISO: row.date,
				cachedClient: client,
			});
			if (res.status === "ready") {
				updated += 1;
				reupsAttempted += 1;
				if (res.recordingZoomTrashStatus === "trashed") {
					trashed += 1;
				}
			} else if (res.status === "failed") {
				failed += 1;
				reupsAttempted += 1;
			}
		} catch (err) {
			failed += 1;
			reupsAttempted += 1;
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

	return {
		checked,
		updated,
		failed,
		expired: expiryRes.expired,
		trashed,
	};
}

export async function updateSessionRecordingManual(
	db: Db,
	input: {
		orgId: string;
		classId: string;
		dateISO: string;
		recordingUrl: string;
	},
	opts?: {
		recordingStore?: RecordingStore;
		runInBackground?: (promise: Promise<unknown>) => void;
	},
): Promise<{ status: RecordingStatus; recordingUrl: string }> {
	const trimmed = input.recordingUrl.trim();
	const nextStatus: RecordingStatus = trimmed ? "ready" : "none";
	const now = new Date();

	const [existing] = await db
		.select({
			id: classSessionMeeting.id,
			recordingStorageKey: classSessionMeeting.recordingStorageKey,
		})
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
				recordingPassword: null,
				recordingStatus: nextStatus,
				recordingError: null,
				recordingSyncedAt: now,
				recordingStorageKey: null,
				recordingSizeBytes: null,
				recordingMimeType: null,
				recordingUploadedAt: null,
				recordingExpiresAt: null,
				recordingZoomTrashStatus: "none",
			})
			.where(eq(classSessionMeeting.id, existing.id));

		if (existing.recordingStorageKey) {
			await deleteRecordingObjectBestEffort(
				opts?.recordingStore,
				existing.recordingStorageKey,
				{
					classId: input.classId,
					date: input.dateISO,
					reason: "manual-override",
				},
				opts?.runInBackground,
			);
		}
	} else if (trimmed) {
		await db.insert(classSessionMeeting).values({
			id: crypto.randomUUID(),
			orgId: input.orgId,
			classId: input.classId,
			date: input.dateISO,
			joinUrl: "",
			recordingUrl: trimmed,
			recordingStatus: nextStatus,
			recordingSyncedAt: now,
		});
	}

	return { status: nextStatus, recordingUrl: trimmed };
}
