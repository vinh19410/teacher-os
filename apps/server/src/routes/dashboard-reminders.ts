import {
	type DashboardReminderItem,
	type DashboardReminders,
	dashboardRemindersResponseSchema,
} from "@teacher-os/api/contracts";
import { essayTaskOf } from "@teacher-os/api/lib/ielts-band";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { canAccessFinance } from "@teacher-os/auth/role";
import {
	assignmentPrompt,
	assignmentTest,
	classAssignment,
	classTable,
	enrollment,
	invoice,
	lesson,
	quizAttempt,
	student,
} from "@teacher-os/db/schema/index";
import {
	and,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	notLike,
	or,
	type SQL,
} from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db, KernelCtx } from "../app";
import { visibleAssignmentFilter } from "../lib/assignment-visibility";

type Env = { Variables: { kernelCtx: KernelCtx } };
type DashboardContext = Context<Env>;

const HOUR_MS = 60 * 60 * 1000;
/** Thẻ bài quá hạn chấm: submitted cách đây hơn 24 giờ (AC-001). */
const OVERDUE_GRADING_MS = 24 * HOUR_MS;
/** Thẻ học phí: hoá đơn hạn trong 7 ngày tới hoặc đã quá hạn. */
const TUITION_DUE_WINDOW_DAYS = 7;
/** Số mục xem trước tối đa cho thẻ điểm danh. */
const ATTENDANCE_PREVIEW_LIMIT = 3;
/** Chia nhỏ inArray theo ngưỡng 50 để tránh trần bind parameter của Cloudflare D1 (#366 RT-F2). */
export const D1_IN_ARRAY_CHUNK = 50;

/**
 * Phạm vi dữ liệu của bộ đếm nhắc việc (TOS-6, issue #439).
 *
 * - `org`: toàn bộ dữ liệu org — scope hiện tại của mọi teacher.
 * - `assigned`: chỉ lớp trong `classIds`, không có quyền tài chính —
 *   Phase 5 (FR-029, vai trò Trợ giảng) mới sinh ra scope này từ session.
 */
export type ReminderScope =
	| { kind: "org"; finance?: boolean }
	| { kind: "assigned"; classIds: string[]; finance: false };

export interface OverdueAttendanceBucket {
	classId: string;
	className: string;
	date: string;
	time: string;
	dur: number;
}

interface UpcomingAttendanceRow {
	lessonId: string;
	classId: string;
	className: string;
	time: string;
	dur: number;
	date: string | null;
}

/** yyyy-mm-dd (UTC-anchored) → lesson weekday 1-7, Monday = 1 — cùng mẫu
 * `isoToLessonWeekday` (kernel.ts). Server chạy UTC: từ 0h–7h giờ VN,
 * `new Date().getDay()` lệch 1 ngày nên weekday PHẢI suy từ ISO giờ VN. */
function lessonWeekdayOf(iso: string): number {
	const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/**
 * Truy vấn dùng chung cho cả `computeReminders` và `computeOverdueAttendance`
 * (#959): 4-table innerJoin có predicate `orgId` ở mọi bảng (chuẩn IDOR),
 * chỉ lớp `active`, ghi danh `active`, dòng `lesson.status = "upcoming"`.
 * Khử trùng `scope.classIds` trước khi chia lô 50 để tránh trần D1 và trùng dòng.
 */
async function queryUpcomingAttendanceRows(
	db: Db,
	orgId: string,
	scope: ReminderScope,
	datePredicate: SQL | undefined,
): Promise<UpcomingAttendanceRow[]> {
	const selectCols = {
		lessonId: lesson.id,
		classId: lesson.classId,
		className: classTable.name,
		time: lesson.time,
		dur: lesson.dur,
		date: lesson.date,
	};

	const baseConditions = (classSlice?: readonly string[]) =>
		and(
			eq(lesson.orgId, orgId),
			eq(classTable.status, "active"),
			eq(lesson.status, "upcoming"),
			datePredicate,
			classSlice ? inArray(lesson.classId, [...classSlice]) : undefined,
		);

	const runQuery = (classSlice?: readonly string[]) =>
		db
			.select(selectCols)
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
			.where(baseConditions(classSlice));

	if (scope.kind === "assigned") {
		const uniqueClassIds = [...new Set(scope.classIds)];
		if (uniqueClassIds.length === 0) return [];
		const chunks: UpcomingAttendanceRow[][] = [];
		for (let i = 0; i < uniqueClassIds.length; i += D1_IN_ARRAY_CHUNK) {
			chunks.push(
				await runQuery(uniqueClassIds.slice(i, i + D1_IN_ARRAY_CHUNK)),
			);
		}
		return chunks.flat();
	}

	return runQuery();
}

/**
 * Danh sách bucket `(classId, date)` quá hạn (`date < todayISO`, hợp lệ theo
 * lịch `parseStartDateStrict`) còn tối thiểu 1 dòng `upcoming` — nguồn chân lý
 * duy nhất chia sẻ giữa `computeReminders` và `GET /api/attendance/overdue`.
 * Sắp mới nhất trước (`date DESC, time ASC, className ASC ("vi")`).
 */
export async function queryOverdueAttendanceBuckets(
	db: Db,
	orgId: string,
	scope: ReminderScope,
	todayISO: string,
): Promise<OverdueAttendanceBucket[]> {
	const rows = await queryUpcomingAttendanceRows(
		db,
		orgId,
		scope,
		and(isNotNull(lesson.date), ne(lesson.date, ""), lt(lesson.date, todayISO)),
	);

	const sorted = [...rows].sort(
		(a, b) =>
			a.time.localeCompare(b.time) || a.lessonId.localeCompare(b.lessonId),
	);
	const buckets = new Map<string, OverdueAttendanceBucket>();
	for (const row of sorted) {
		if (row.date === null) continue;
		const validDate = parseStartDateStrict(row.date);
		if (validDate === null || validDate >= todayISO) continue;
		const key = `${row.classId}\u0000${validDate}`;
		if (!buckets.has(key)) {
			buckets.set(key, {
				classId: row.classId,
				className: row.className,
				date: validDate,
				time: row.time,
				dur: row.dur,
			});
		}
	}

	return [...buckets.values()].sort(
		(a, b) =>
			b.date.localeCompare(a.date) ||
			a.time.localeCompare(b.time) ||
			a.className.localeCompare(b.className, "vi") ||
			a.classId.localeCompare(b.classId),
	);
}

/**
 * Bộ đếm 3 thẻ "Việc cần làm hôm nay" — hàm thuần để test, route chỉ bọc
 * session. Tất cả truy vấn đều có predicate orgId (chuẩn IDOR grading.ts).
 *
 * 1. Ca chưa điểm danh (#439, mở rộng quá hạn #959):
 *    - Hôm nay: lớp `dated` (`date = today`) + lớp `legacy` (`date IS NULL`
 *      khớp thứ trong tuần giờ VN).
 *    - Quá hạn: lớp `dated` (`date` hợp lệ `< today`, loại rỗng/sai lịch và
 *      không tính `legacy`).
 *    - `pending = today + overdue`; `items` tối đa 3 (ưu tiên ca hôm nay theo
 *      giờ tăng dần, sau đó ca quá hạn mới nhất trước).
 * 2. Bài quá hạn chấm > 24h: cùng nguồn hàng chờ /api/grading
 *    (submitted + writing/speaking + 2 mode), thêm `gradeScores IS NULL`
 *    (khớp `?status=awaiting`) và `submittedAt < now - 24h`.
 * 3. Học phí: hoá đơn chưa thu đủ (`status !== "paid" || paidAmount <
 *    amount`) có `due` trong 7 ngày tới hoặc đã quá hạn.
 */
export async function computeReminders(
	db: Db,
	orgId: string,
	scope: ReminderScope,
	now: Date,
): Promise<DashboardReminders> {
	const today = vietnamTodayISO(now);
	const todayWeekday = lessonWeekdayOf(today);
	const emptyScope: boolean =
		scope.kind === "assigned" && scope.classIds.length === 0;

	if (emptyScope) {
		return {
			date: today,
			attendance: { pending: 0, today: 0, overdue: 0, items: [] },
			overdueGrading: { count: 0, writing: 0, speaking: 0 },
		};
	}

	const datedUpToToday = and(
		isNotNull(lesson.date),
		ne(lesson.date, ""),
		lte(lesson.date, today),
	);
	const legacyToday = and(isNull(lesson.date), eq(lesson.day, todayWeekday));
	const attendanceRows = await queryUpcomingAttendanceRows(
		db,
		orgId,
		scope,
		or(datedUpToToday, legacyToday),
	);

	// Gom ca-lớp: lớp dated gom theo (classId, date) khớp bucket vật lý của
	// GET/PUT /attendance; lớp legacy gom theo (classId, time) cho riêng hôm nay.
	const todayGroups = new Map<string, DashboardReminderItem>();
	const overdueGroups = new Map<
		string,
		DashboardReminderItem & { date: string }
	>();
	for (const row of [...attendanceRows].sort(
		(a, b) =>
			a.time.localeCompare(b.time) || a.lessonId.localeCompare(b.lessonId),
	)) {
		if (row.date !== null) {
			const validDate = parseStartDateStrict(row.date);
			if (validDate === null || validDate > today) continue;
			const key = `dated:${row.classId}\u0000${validDate}`;
			if (validDate === today) {
				if (!todayGroups.has(key)) {
					todayGroups.set(key, {
						classId: row.classId,
						className: row.className,
						time: row.time,
						dur: row.dur,
						date: validDate,
					});
				}
			} else if (!overdueGroups.has(key)) {
				overdueGroups.set(key, {
					classId: row.classId,
					className: row.className,
					time: row.time,
					dur: row.dur,
					date: validDate,
				});
			}
		} else {
			const key = `legacy:${row.classId}\u0000${row.time}`;
			if (!todayGroups.has(key)) {
				todayGroups.set(key, {
					classId: row.classId,
					className: row.className,
					time: row.time,
					dur: row.dur,
				});
			}
		}
	}

	const todayItems = [...todayGroups.values()].sort(
		(a, b) =>
			a.time.localeCompare(b.time) ||
			a.className.localeCompare(b.className, "vi"),
	);
	const overdueItems = [...overdueGroups.values()].sort(
		(a, b) =>
			b.date.localeCompare(a.date) ||
			a.time.localeCompare(b.time) ||
			a.className.localeCompare(b.className, "vi") ||
			a.classId.localeCompare(b.classId),
	);
	const items = [...todayItems, ...overdueItems].slice(
		0,
		ATTENDANCE_PREVIEW_LIMIT,
	);

	const overdueCutoff = new Date(now.getTime() - OVERDUE_GRADING_MS);
	const queryAssignmentOverdue = async (classSlice?: readonly string[]) =>
		db
			.select({
				skill: assignmentPrompt.skill,
				writingPart: assignmentPrompt.writingPart,
			})
			.from(quizAttempt)
			.innerJoin(
				classAssignment,
				and(
					eq(classAssignment.id, quizAttempt.assignmentId),
					eq(classAssignment.orgId, orgId),
				),
			)
			.innerJoin(
				assignmentPrompt,
				and(
					eq(assignmentPrompt.id, classAssignment.promptId),
					eq(assignmentPrompt.orgId, orgId),
				),
			)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.status, "submitted"),
					eq(quizAttempt.mode, "assignment"),
					or(
						inArray(assignmentPrompt.skill, ["writing", "speaking"]),
						isNotNull(assignmentPrompt.writingPart),
					),
					isNull(quizAttempt.gradeScores),
					lt(quizAttempt.submittedAt, overdueCutoff),
					visibleAssignmentFilter(now),
					classSlice
						? inArray(classAssignment.classId, [...classSlice])
						: undefined,
				),
			);

	const assignmentRowsPromise =
		scope.kind === "assigned"
			? (async () => {
					const uniqueClassIds = [...new Set(scope.classIds)];
					const chunks: Array<
						Awaited<ReturnType<typeof queryAssignmentOverdue>>
					> = [];
					for (let i = 0; i < uniqueClassIds.length; i += D1_IN_ARRAY_CHUNK) {
						chunks.push(
							await queryAssignmentOverdue(
								uniqueClassIds.slice(i, i + D1_IN_ARRAY_CHUNK),
							),
						);
					}
					return chunks.flat();
				})()
			: queryAssignmentOverdue();

	const [assignmentRows, practiceRows] = await Promise.all([
		assignmentRowsPromise,
		// Practice không gắn lớp — scope assigned không tính nhánh này.
		scope.kind === "assigned"
			? Promise.resolve([])
			: db
					.select({ skill: assignmentTest.skill })
					.from(quizAttempt)
					.innerJoin(
						assignmentTest,
						and(
							eq(assignmentTest.id, quizAttempt.testId),
							eq(assignmentTest.orgId, orgId),
						),
					)
					.where(
						and(
							eq(quizAttempt.orgId, orgId),
							eq(quizAttempt.status, "submitted"),
							eq(quizAttempt.mode, "practice"),
							inArray(assignmentTest.skill, ["writing", "speaking"]),
							isNull(quizAttempt.gradeScores),
							lt(quizAttempt.submittedAt, overdueCutoff),
							notLike(quizAttempt.id, "demo-attempt:%"),
						),
					),
	]);
	const gradingSkills = [
		...assignmentRows.map((row) => ({
			skill: essayTaskOf(row) !== null ? "writing" : row.skill,
		})),
		...practiceRows,
	];

	let tuition: DashboardReminders["tuition"];
	if (scope.kind === "org" && scope.finance !== false) {
		const invoiceRows = await db
			.select({
				studentId: invoice.studentId,
				amount: invoice.amount,
				paidAmount: invoice.paidAmount,
			})
			.from(invoice)
			.where(
				and(
					eq(invoice.orgId, orgId),
					ne(invoice.due, ""),
					lte(invoice.due, addDaysISO(today, TUITION_DUE_WINDOW_DAYS)),
					or(
						ne(invoice.status, "paid"),
						lt(invoice.paidAmount, invoice.amount),
					),
				),
			);
		tuition = {
			students: new Set(invoiceRows.map((row) => row.studentId)).size,
			outstanding: invoiceRows.reduce(
				(sum, row) => sum + (row.amount - Math.min(row.paidAmount, row.amount)),
				0,
			),
		};
	}

	return {
		date: today,
		attendance: {
			pending: todayGroups.size + overdueGroups.size,
			today: todayGroups.size,
			overdue: overdueGroups.size,
			items,
		},
		overdueGrading: {
			count: gradingSkills.length,
			writing: gradingSkills.filter((row) => row.skill === "writing").length,
			speaking: gradingSkills.filter((row) => row.skill === "speaking").length,
		},
		// Scope không có quyền tài chính: bỏ hẳn key (không trả null/0).
		...(tuition ? { tuition } : {}),
	};
}

/** Điểm cắm Phase 5 (FR-029): thay hàm này để suy scope từ session/membership
 * khi vai trò Trợ giảng tồn tại. Hiện tại mọi teacher là toàn org. */
export function resolveReminderScope(role?: string): ReminderScope {
	return {
		kind: "org",
		finance: role === undefined ? true : canAccessFinance(role),
	};
}

export function dashboardReminderRoutes(deps: {
	getDb(): Db;
	now?: () => Date;
}) {
	const routes = new Hono<Env>();

	routes.get("/reminders", async (c: DashboardContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const now = deps.now ? deps.now() : new Date();
		const data = await computeReminders(
			deps.getDb(),
			ctx.orgId,
			resolveReminderScope(ctx.role),
			now,
		);
		// Opt-in `?v=2` cho bundle web mới; client `.strict()` cũ không gửi `?v=2`
		// vẫn nhận `pending = today + overdue` đúng shape v1 để không vỡ ZodError
		// khi `serverWorker` deploy trước `lmsWorker`.
		if (c.req.query("v") === "2") {
			const response = dashboardRemindersResponseSchema.parse(data);
			return c.json(response);
		}
		const legacyResponse = dashboardRemindersResponseSchema.parse({
			...data,
			attendance: {
				pending: data.attendance.pending,
				items: data.attendance.items.map(
					({ classId, className, time, dur }) => ({
						classId,
						className,
						time,
						dur,
					}),
				),
			},
		});
		return c.json(legacyResponse);
	});

	return routes;
}
