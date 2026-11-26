import {
	ATTENDANCE_STATUSES,
	type AttendanceStatus,
	type DailyAttendanceResponse,
	dailyAttendanceResponseSchema,
	type OverdueAttendanceResponse,
	overdueAttendanceResponseSchema,
} from "@teacher-os/api/contracts";
import {
	isoToLessonWeekday,
	parseStartDateStrict,
} from "@teacher-os/api/skeleton";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	classTable,
	enrollment,
	lesson,
	student,
} from "@teacher-os/db/schema/index";
import { and, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import {
	D1_IN_ARRAY_CHUNK,
	type OverdueAttendanceBucket,
	queryOverdueAttendanceBuckets,
	type ReminderScope,
	resolveReminderScope,
} from "./dashboard-reminders";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AttendanceContext = Context<Env>;

export const DEFAULT_OVERDUE_LIMIT = 50;
export const MAX_OVERDUE_LIMIT = 100;
/** 25 cặp (classId, date) = 50 bind params mỗi truy vấn Bước 2 — an toàn dưới trần D1 và ăn trực tiếp `lesson_class_date_idx`. */
const OVERDUE_BUCKET_BATCH = 25;
const POSITIVE_INT_PATTERN = /^[1-9]\d*$/;

export interface RawDailyAttendanceRow {
	lessonId: string;
	classId: string;
	className: string;
	classStatus: string;
	studentId: string;
	studentName: string;
	time: string;
	dur: number;
	date: string | null;
	status: string;
	attendance: string | null;
	attendanceNote: string | null;
}

/**
 * Điểm cắm Lịch nghỉ chung (FR-007, D3): loại bỏ các dòng không diễn ra buổi
 * dạy — `cancelled` và `holiday` (buổi gốc đã dời, TOS-11). Khi story mới
 * thêm trạng thái không diễn ra, chỉ cần mở rộng hàm này mà không đổi
 * `computeDailyAttendance`.
 */
export function excludeNonTeachingSessions(
	rows: readonly RawDailyAttendanceRow[],
	_ctx: { orgId: string; dateISO: string },
): RawDailyAttendanceRow[] {
	return rows.filter(
		(row) => row.status !== "cancelled" && row.status !== "holiday",
	);
}

function coerceDisplayAttendance(
	status: string,
	attendance: string | null,
): AttendanceStatus | null {
	if (
		attendance !== null &&
		(ATTENDANCE_STATUSES as readonly string[]).includes(attendance)
	) {
		return attendance as AttendanceStatus;
	}
	// Quy tắc 6: chỉ coerce hiển thị `completed + NULL -> "present"` (điểm danh
	// 1-click cũ). `absent + NULL` giữ nguyên `null` để UI hiện "Chưa rõ" và bắt
	// giáo viên chủ động chọn trạng thái trước khi lưu — không bịa "excused".
	if (status === "completed") {
		return "present";
	}
	return null;
}

async function queryDailyRows(
	db: Db,
	orgId: string,
	dateISO: string,
	classIdsFilter?: readonly string[],
): Promise<RawDailyAttendanceRow[]> {
	const weekday = isoToLessonWeekday(dateISO);
	const datedMatch = and(isNotNull(lesson.date), eq(lesson.date, dateISO));
	const legacyMatch = and(isNull(lesson.date), eq(lesson.day, weekday));

	if (classIdsFilter !== undefined) {
		const uniqueClassIds = [...new Set(classIdsFilter)];
		if (uniqueClassIds.length === 0) return [];
		const chunks: RawDailyAttendanceRow[][] = [];
		for (let i = 0; i < uniqueClassIds.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = uniqueClassIds.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					lessonId: lesson.id,
					classId: lesson.classId,
					className: classTable.name,
					classStatus: classTable.status,
					studentId: student.id,
					studentName: student.name,
					time: lesson.time,
					dur: lesson.dur,
					date: lesson.date,
					status: lesson.status,
					attendance: lesson.attendance,
					attendanceNote: lesson.attendanceNote,
				})
				.from(lesson)
				.innerJoin(
					classTable,
					and(eq(classTable.id, lesson.classId), eq(classTable.orgId, orgId)),
				)
				.innerJoin(
					enrollment,
					and(
						eq(enrollment.id, lesson.enrollmentId),
						eq(enrollment.classId, lesson.classId),
						eq(enrollment.orgId, orgId),
						eq(enrollment.status, "active"),
					),
				)
				.innerJoin(
					student,
					and(eq(student.id, enrollment.studentId), eq(student.orgId, orgId)),
				)
				.where(
					and(
						eq(lesson.orgId, orgId),
						or(datedMatch, legacyMatch),
						inArray(lesson.classId, [...slice]),
					),
				);
			chunks.push(rows);
		}
		return chunks.flat();
	}

	return db
		.select({
			lessonId: lesson.id,
			classId: lesson.classId,
			className: classTable.name,
			classStatus: classTable.status,
			studentId: student.id,
			studentName: student.name,
			time: lesson.time,
			dur: lesson.dur,
			date: lesson.date,
			status: lesson.status,
			attendance: lesson.attendance,
			attendanceNote: lesson.attendanceNote,
		})
		.from(lesson)
		.innerJoin(
			classTable,
			and(eq(classTable.id, lesson.classId), eq(classTable.orgId, orgId)),
		)
		.innerJoin(
			enrollment,
			and(
				eq(enrollment.id, lesson.enrollmentId),
				eq(enrollment.classId, lesson.classId),
				eq(enrollment.orgId, orgId),
				eq(enrollment.status, "active"),
			),
		)
		.innerJoin(
			student,
			and(eq(student.id, enrollment.studentId), eq(student.orgId, orgId)),
		)
		.where(and(eq(lesson.orgId, orgId), or(datedMatch, legacyMatch)));
}

async function queryRowsForBuckets(
	db: Db,
	orgId: string,
	buckets: readonly OverdueAttendanceBucket[],
): Promise<RawDailyAttendanceRow[]> {
	if (buckets.length === 0) return [];
	const chunks: RawDailyAttendanceRow[][] = [];
	for (let i = 0; i < buckets.length; i += OVERDUE_BUCKET_BATCH) {
		const batch = buckets.slice(i, i + OVERDUE_BUCKET_BATCH);
		const pairPredicates = batch.map((b) =>
			and(eq(lesson.classId, b.classId), eq(lesson.date, b.date)),
		);
		const rows = await db
			.select({
				lessonId: lesson.id,
				classId: lesson.classId,
				className: classTable.name,
				classStatus: classTable.status,
				studentId: student.id,
				studentName: student.name,
				time: lesson.time,
				dur: lesson.dur,
				date: lesson.date,
				status: lesson.status,
				attendance: lesson.attendance,
				attendanceNote: lesson.attendanceNote,
			})
			.from(lesson)
			.innerJoin(
				classTable,
				and(eq(classTable.id, lesson.classId), eq(classTable.orgId, orgId)),
			)
			.innerJoin(
				enrollment,
				and(
					eq(enrollment.id, lesson.enrollmentId),
					eq(enrollment.classId, lesson.classId),
					eq(enrollment.orgId, orgId),
					eq(enrollment.status, "active"),
				),
			)
			.innerJoin(
				student,
				and(eq(student.id, enrollment.studentId), eq(student.orgId, orgId)),
			)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(classTable.status, "active"),
					ne(lesson.status, "cancelled"),
					ne(lesson.status, "holiday"),
					or(...pairPredicates),
				),
			);
		chunks.push(rows);
	}
	return chunks.flat();
}

/**
 * Danh sách ca học trong ngày `dateISO` — hàm thuần để test độc lập với HTTP.
 *
 * - Lớp có ngày (`date !== null`): gom theo bucket `(classId, date)` khớp
 *   invariant "one physical session" của schema `lesson` và của endpoint PUT.
 * - Lớp legacy (`date === null`): gom theo `(classId, time)` khớp `computeReminders`,
 *   trả `mode: "legacy"`, `lessonId: null`.
 * - `recorded = true` khi không còn dòng `upcoming` nào trong ca.
 */
export async function computeDailyAttendance(
	db: Db,
	orgId: string,
	scope: ReminderScope,
	dateISO: string,
): Promise<DailyAttendanceResponse> {
	const rawRows = await queryDailyRows(
		db,
		orgId,
		dateISO,
		scope.kind === "assigned" ? scope.classIds : undefined,
	);
	const teachingRows = excludeNonTeachingSessions(rawRows, { orgId, dateISO });

	const datedBuckets = new Map<string, RawDailyAttendanceRow[]>();
	const legacyBuckets = new Map<string, RawDailyAttendanceRow[]>();

	for (const row of teachingRows) {
		if (row.date !== null) {
			const list = datedBuckets.get(row.classId);
			if (list) list.push(row);
			else datedBuckets.set(row.classId, [row]);
		} else {
			const key = `${row.classId}\u0000${row.time}`;
			const list = legacyBuckets.get(key);
			if (list) list.push(row);
			else legacyBuckets.set(key, [row]);
		}
	}

	const sessions: DailyAttendanceResponse["sessions"] = [];

	for (const [classId, rows] of datedBuckets) {
		if (rows.length === 0) continue;
		const sortedByTime = [...rows].sort(
			(a, b) =>
				a.time.localeCompare(b.time) || a.lessonId.localeCompare(b.lessonId),
		);
		const first = sortedByTime[0];
		if (!first) continue;
		const isPaused = first.classStatus !== "active";
		if (
			isPaused &&
			!rows.some((r) => r.status === "completed" || r.status === "absent")
		) {
			continue;
		}

		// Giữ toàn bộ dòng trong bucket (classId, date) để tập lessonId khớp 1-1
		// với rosterRows của PUT /api/classes/:id/sessions/:date/attendance.
		const students = [...rows]
			.map((row) => ({
				lessonId: row.lessonId,
				studentId: row.studentId,
				studentName: row.studentName,
				attendance: coerceDisplayAttendance(row.status, row.attendance),
				note: row.attendanceNote ?? "",
			}))
			.sort(
				(a, b) =>
					a.studentName.localeCompare(b.studentName, "vi") ||
					a.lessonId.localeCompare(b.lessonId),
			);

		sessions.push({
			classId,
			className: first.className,
			time: first.time,
			dur: first.dur,
			mode: "dated",
			recorded: !rows.some((r) => r.status === "upcoming"),
			...(isPaused ? { classPaused: true } : {}),
			students,
		});
	}

	for (const rows of legacyBuckets.values()) {
		const first = rows[0];
		if (first?.classStatus !== "active") continue;

		const byStudent = new Map<string, RawDailyAttendanceRow>();
		for (const row of rows) {
			if (!byStudent.has(row.studentId)) {
				byStudent.set(row.studentId, row);
			}
		}

		const students = [...byStudent.values()]
			.map((row) => ({
				lessonId: null,
				studentId: row.studentId,
				studentName: row.studentName,
				attendance: null,
				note: "",
			}))
			.sort((a, b) => a.studentName.localeCompare(b.studentName, "vi"));

		sessions.push({
			classId: first.classId,
			className: first.className,
			time: first.time,
			dur: first.dur,
			mode: "legacy",
			recorded: !rows.some((r) => r.status === "upcoming"),
			students,
		});
	}

	sessions.sort(
		(a, b) =>
			a.time.localeCompare(b.time) ||
			a.className.localeCompare(b.className, "vi"),
	);

	const completed = sessions.filter((s) => s.recorded).length;
	const pending = sessions.filter((s) => !s.recorded && !s.classPaused).length;

	return {
		date: dateISO,
		sessions,
		counts: {
			all: sessions.length,
			pending,
			completed,
		},
	};
}

/**
 * Danh sách ca học quá hạn (`date < today` giờ VN) còn tối thiểu 1 dòng
 * `upcoming` trên lớp `active` — truy vấn 2 bước (bucket từ helper dùng chung →
 * nạp đủ roster teaching rows theo từng lô 25 cặp `(classId, date)`) kèm guard
 * TOCTOU để loại bucket đã được chấm xong hoặc bị hủy/tạm dừng giữa 2 bước.
 */
export async function computeOverdueAttendance(
	db: Db,
	orgId: string,
	scope: ReminderScope,
	now: Date = new Date(),
	limit: number = DEFAULT_OVERDUE_LIMIT,
): Promise<OverdueAttendanceResponse> {
	const safeLimit = Number.isFinite(limit)
		? Math.min(MAX_OVERDUE_LIMIT, Math.max(1, Math.floor(limit)))
		: DEFAULT_OVERDUE_LIMIT;
	const today = vietnamTodayISO(now);

	if (scope.kind === "assigned" && scope.classIds.length === 0) {
		return { today, totalCount: 0, hasMore: false, sessions: [] };
	}

	const buckets = await queryOverdueAttendanceBuckets(db, orgId, scope, today);
	const rawTotalCount = buckets.length;
	const pageBuckets = buckets.slice(0, safeLimit);
	if (pageBuckets.length === 0) {
		return { today, totalCount: 0, hasMore: false, sessions: [] };
	}

	const rawRows = await queryRowsForBuckets(db, orgId, pageBuckets);
	const teachingRows = excludeNonTeachingSessions(rawRows, {
		orgId,
		dateISO: today,
	});

	const rowsByBucket = new Map<string, RawDailyAttendanceRow[]>();
	for (const row of teachingRows) {
		if (row.date === null) continue;
		const key = `${row.classId}\u0000${row.date}`;
		const list = rowsByBucket.get(key);
		if (list) list.push(row);
		else rowsByBucket.set(key, [row]);
	}

	const sessions: OverdueAttendanceResponse["sessions"] = [];
	let dropped = 0;

	for (const bucket of pageBuckets) {
		const key = `${bucket.classId}\u0000${bucket.date}`;
		const rows = rowsByBucket.get(key);
		// Guard TOCTOU: giữa Bước 1 và Bước 2 ca có thể đã chấm xong, bị hủy hoặc
		// lớp vừa bị tạm dừng — bỏ qua và điều chỉnh totalCount tương ứng.
		if (
			!rows ||
			rows.length === 0 ||
			!rows.some((r) => r.status === "upcoming")
		) {
			dropped += 1;
			continue;
		}
		const sortedByTime = [...rows].sort(
			(a, b) =>
				a.time.localeCompare(b.time) || a.lessonId.localeCompare(b.lessonId),
		);
		const first = sortedByTime[0];
		if (!first) {
			dropped += 1;
			continue;
		}
		const students = [...rows]
			.map((row) => ({
				lessonId: row.lessonId,
				studentId: row.studentId,
				studentName: row.studentName,
				attendance: coerceDisplayAttendance(row.status, row.attendance),
				note: row.attendanceNote ?? "",
			}))
			.sort(
				(a, b) =>
					a.studentName.localeCompare(b.studentName, "vi") ||
					a.lessonId.localeCompare(b.lessonId),
			);

		sessions.push({
			date: bucket.date,
			classId: bucket.classId,
			className: first.className,
			time: first.time,
			dur: first.dur,
			mode: "dated",
			recorded: false,
			students,
		});
	}

	const totalCount = Math.max(sessions.length, rawTotalCount - dropped);
	return {
		today,
		totalCount,
		hasMore: totalCount > sessions.length,
		sessions,
	};
}

export function dailyAttendanceRoutes(deps: { getDb(): Db; now?: () => Date }) {
	const routes = new Hono<Env>();

	routes.get("/daily", async (c: AttendanceContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const now = deps.now ? deps.now() : new Date();
		const rawDate = c.req.query("date");
		let dateISO: string;
		if (rawDate === undefined || rawDate === "") {
			dateISO = vietnamTodayISO(now);
		} else {
			const parsed = parseStartDateStrict(rawDate);
			if (!parsed) {
				return c.json({ error: "invalid date", reason: "invalid-date" }, 400);
			}
			dateISO = parsed;
		}

		const data = await computeDailyAttendance(
			deps.getDb(),
			ctx.orgId,
			resolveReminderScope(ctx.role),
			dateISO,
		);
		const response = dailyAttendanceResponseSchema.parse(data);
		return c.json(response);
	});

	routes.get("/overdue", async (c: AttendanceContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const rawLimit = c.req.query("limit");
		let limit = DEFAULT_OVERDUE_LIMIT;
		if (rawLimit !== undefined && rawLimit !== "") {
			if (!POSITIVE_INT_PATTERN.test(rawLimit)) {
				return c.json({ error: "invalid limit", reason: "invalid-limit" }, 400);
			}
			limit = Math.min(Number(rawLimit), MAX_OVERDUE_LIMIT);
		}

		const now = deps.now ? deps.now() : new Date();
		const data = await computeOverdueAttendance(
			deps.getDb(),
			ctx.orgId,
			resolveReminderScope(ctx.role),
			now,
			limit,
		);
		const response = overdueAttendanceResponseSchema.parse(data);
		return c.json(response);
	});

	return routes;
}
