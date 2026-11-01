import {
	type DashboardReminders,
	dashboardRemindersResponseSchema,
} from "@teacher-os/api/contracts";
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

/** yyyy-mm-dd (UTC-anchored) → lesson weekday 1-7, Monday = 1 — cùng mẫu
 * `isoToLessonWeekday` (kernel.ts). Server chạy UTC: từ 0h–7h giờ VN,
 * `new Date().getDay()` lệch 1 ngày nên weekday PHẢI suy từ ISO giờ VN. */
function lessonWeekdayOf(iso: string): number {
	const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
	return weekday === 0 ? 7 : weekday;
}

/**
 * Bộ đếm 3 thẻ "Việc cần làm hôm nay" — hàm thuần để test, route chỉ bọc
 * session. Tất cả truy vấn đều có predicate orgId (chuẩn IDOR grading.ts).
 *
 * 1. Ca chưa điểm danh: lesson `upcoming` hôm nay — lớp dated so
 *    `date = today`, lớp legacy (date NULL, per-class theo schema lesson)
 *    so `day` với thứ trong tuần suy từ ISO giờ VN. Gom (classId, time).
 * 2. Bài quá hạn chấm > 24h: cùng nguồn hàng chờ /api/grading
 *    (submitted + writing/speaking + 2 mode), thêm `gradeScores IS NULL`
 *    (khớp `?status=awaiting` — "Chờ chấm" là `grade === null`,
 *    grading/index.tsx:256) và `submittedAt < now - 24h`.
 * 3. Học phí: hoá đơn chưa thu đủ (`status !== "paid" || paidAmount <
 *    amount`, khớp tuition/index.tsx:71) có `due` trong 7 ngày tới hoặc
 *    đã quá hạn; outstanding clamp trả thừa như tuition-from-kernel.ts:259.
 *    Scope `assigned` không trả block này (undefined, không phải 0).
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
			attendance: { pending: 0, items: [] },
			overdueGrading: { count: 0, writing: 0, speaking: 0 },
		};
	}

	const datedToday = and(isNotNull(lesson.date), eq(lesson.date, today));
	const legacyToday = and(isNull(lesson.date), eq(lesson.day, todayWeekday));
	const attendanceRows = await db
		.select({
			classId: lesson.classId,
			className: classTable.name,
			time: lesson.time,
			dur: lesson.dur,
			date: lesson.date,
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
		.where(
			and(
				eq(lesson.orgId, orgId),
				eq(lesson.status, "upcoming"),
				or(datedToday, legacyToday),
				scope.kind === "assigned"
					? inArray(lesson.classId, scope.classIds)
					: undefined,
			),
		);

	// Gom ca-lớp: lớp dated gom theo (classId, date) khớp bucket vật lý của
	// GET/PUT /attendance; lớp legacy gom theo (classId, time).
	const groups = new Map<
		string,
		{ classId: string; className: string; time: string; dur: number }
	>();
	for (const row of [...attendanceRows].sort((a, b) =>
		a.time.localeCompare(b.time),
	)) {
		const key =
			row.date !== null
				? `dated:${row.classId}\u0000${row.date}`
				: `legacy:${row.classId}\u0000${row.time}`;
		if (!groups.has(key)) {
			groups.set(key, {
				classId: row.classId,
				className: row.className,
				time: row.time,
				dur: row.dur,
			});
		}
	}
	const items = [...groups.values()]
		.sort((a, b) => a.time.localeCompare(b.time))
		.slice(0, ATTENDANCE_PREVIEW_LIMIT);

	const overdueCutoff = new Date(now.getTime() - OVERDUE_GRADING_MS);
	const [assignmentRows, practiceRows] = await Promise.all([
		db
			.select({ skill: assignmentPrompt.skill })
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
				eq(assignmentPrompt.id, classAssignment.promptId),
			)
			.where(
				and(
					eq(quizAttempt.orgId, orgId),
					eq(quizAttempt.status, "submitted"),
					eq(quizAttempt.mode, "assignment"),
					inArray(assignmentPrompt.skill, ["writing", "speaking"]),
					isNull(quizAttempt.gradeScores),
					lt(quizAttempt.submittedAt, overdueCutoff),
					visibleAssignmentFilter(now),
					scope.kind === "assigned"
						? inArray(classAssignment.classId, scope.classIds)
						: undefined,
				),
			),
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
	const gradingSkills = [...assignmentRows, ...practiceRows];

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
		attendance: { pending: groups.size, items },
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

export function dashboardReminderRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	routes.get("/reminders", async (c: DashboardContext) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const data = await computeReminders(
			deps.getDb(),
			ctx.orgId,
			resolveReminderScope(ctx.role),
			new Date(),
		);
		// Parse lại qua contract trước khi trả — chuẩn của các route kernel.
		const response = dashboardRemindersResponseSchema.parse(data);
		return c.json(response);
	});

	return routes;
}
