import {
	ATTENDANCE_STATUSES,
	type AttendanceStatus,
	type DailyAttendanceResponse,
	dailyAttendanceResponseSchema,
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
import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import {
	type ReminderScope,
	resolveReminderScope,
} from "./dashboard-reminders";

type Env = { Variables: { kernelCtx: KernelCtx } };
type AttendanceContext = Context<Env>;

/** Chia nhỏ inArray theo ngưỡng 50 để tránh trần bind parameter của Cloudflare D1 (#366 RT-F2). */
const D1_IN_ARRAY_CHUNK = 50;

export interface RawDailyAttendanceRow {
	lessonId: string;
	classId: string;
	className: string;
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
		if (classIdsFilter.length === 0) return [];
		const chunks: RawDailyAttendanceRow[][] = [];
		for (let i = 0; i < classIdsFilter.length; i += D1_IN_ARRAY_CHUNK) {
			const slice = classIdsFilter.slice(i, i + D1_IN_ARRAY_CHUNK);
			const rows = await db
				.select({
					lessonId: lesson.id,
					classId: lesson.classId,
					className: classTable.name,
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
			students,
		});
	}

	for (const rows of legacyBuckets.values()) {
		const first = rows[0];
		if (!first) continue;

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
	const pending = sessions.length - completed;

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

export function dailyAttendanceRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	routes.get("/daily", async (c: AttendanceContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		const rawDate = c.req.query("date");
		let dateISO: string;
		if (rawDate === undefined || rawDate === "") {
			dateISO = vietnamTodayISO();
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
			resolveReminderScope(),
			dateISO,
		);
		const response = dailyAttendanceResponseSchema.parse(data);
		return c.json(response);
	});

	return routes;
}
