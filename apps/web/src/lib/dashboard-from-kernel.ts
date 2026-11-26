import { evaluateAssignmentDeadline } from "@teacher-os/api/vietnam-date";
import type {
	Assignment,
	ClassAssignment,
	ClassGroup,
	Lesson,
	Student,
} from "@/lib/mock-data";
import {
	isoDayNumber,
	isValidISODate,
	startOfWeekMonday,
	todayISOVietnam,
	weekDates,
} from "@/lib/week-grid";

function pausedClassIdSet(
	classes?: readonly Pick<ClassGroup, "id" | "status">[],
): Set<string> | null {
	if (!classes) return null;
	const paused = new Set<string>();
	for (const cls of classes) {
		if (cls.status === "paused") paused.add(cls.id);
	}
	return paused;
}

/**
 * Weekday on a lesson row: Monday=1 … Sunday=7 in Vietnam timezone (UTC+7).
 * Matches schedule.tsx `l.day === i + 1` (column T2 = day 1) and keeps
 * lessonsToday / upcomingLessonsThisWeek / atRiskRows aligned across timezones.
 */
export function lessonDayFromDate(now = new Date()): number {
	return isoDayNumber(todayISOVietnam(now));
}

export function lessonsToday(
	lessons: Lesson[],
	now = new Date(),
	classes?: readonly Pick<ClassGroup, "id" | "status">[],
): Lesson[] {
	const day = lessonDayFromDate(now);
	const pausedIds = pausedClassIdSet(classes);
	return lessons
		.filter(
			(lesson) =>
				!pausedIds?.has(lesson.classId) &&
				lesson.day === day &&
				// Buổi đã hủy và buổi nghỉ lễ đã dời (TOS-11) không phải ca dạy.
				lesson.status !== "cancelled" &&
				lesson.status !== "holiday",
		)
		.slice()
		.sort((a, b) => a.time.localeCompare(b.time));
}

export interface DashboardClassSession {
	classId: string;
	time: string;
	dur: number;
	type: Lesson["type"];
	topic: string;
	lessons: Lesson[];
}

/**
 * Gom các lesson per-student thành buổi-lớp theo (classId, time).
 * Giữ thứ tự xuất hiện của buổi đầu tiên trong input (insertion order).
 * lessons bên trong giữ thứ tự xuất hiện theo input, đồng thời deduplicate theo sid
 * (chỉ giữ row đầu tiên của mỗi học viên) để tránh duplicate khi các lớp
 * legacy/undated có nhiều lesson rows cho cùng một slot.
 */
export function groupLessonsByClassSession(
	lessons: Lesson[],
): DashboardClassSession[] {
	const groups = new Map<string, DashboardClassSession>();
	const seenSidsByGroup = new Map<string, Set<string>>();
	for (const lesson of lessons) {
		const key = `${lesson.classId}|${lesson.time}`;
		const existing = groups.get(key);
		if (existing) {
			const sids = seenSidsByGroup.get(key);
			if (sids && !sids.has(lesson.sid)) {
				sids.add(lesson.sid);
				existing.lessons.push(lesson);
			}
		} else {
			groups.set(key, {
				classId: lesson.classId,
				time: lesson.time,
				dur: lesson.dur,
				type: lesson.type,
				topic: lesson.topic,
				lessons: [lesson],
			});
			seenSidsByGroup.set(key, new Set([lesson.sid]));
		}
	}
	return Array.from(groups.values());
}

/**
 * Dòng meta của một buổi-lớp trên dashboard: chỉ nối các phần có giá trị,
 * nên lesson thiếu topic không còn dấu `·` treo cuối (issue #373).
 */
export function formatClassSessionMeta(g: DashboardClassSession): string {
	return [`${g.dur}'`, g.type, g.topic.trim()].filter(Boolean).join(" · ");
}
/**
 * Phần còn lại của tuần hiện tại (mai → Chủ nhật), khác lessonsToday có
 * chủ ý:
 * - legacy (date == null): day > weekday hôm nay (template weekly);
 * - có date: chỉ tính khi date ∈ các ngày còn lại của tuần chứa "hôm nay"
 *   (Việt Nam) — date đã qua/hôm nay/tuần khác bị loại;
 * - loại cancelled; sort (day asc, time asc); flat Lesson[].
 * lessonsToday giữ semantics day-based (không xét date) — không đổi.
 */
export function upcomingLessonsThisWeek(
	lessons: Lesson[],
	now = new Date(),
	classes?: readonly Pick<ClassGroup, "id" | "status">[],
): Lesson[] {
	const todayDay = lessonDayFromDate(now);
	const todayIso = todayISOVietnam(now);
	const pausedIds = pausedClassIdSet(classes);
	const remaining = new Set(
		weekDates(startOfWeekMonday(todayIso)).filter((iso) => iso > todayIso),
	);
	return lessons
		.filter((lesson) => {
			if (pausedIds?.has(lesson.classId)) return false;
			// TOS-11: `holiday` xử lý như `cancelled` — không phải buổi sắp dạy.
			if (lesson.status === "cancelled" || lesson.status === "holiday") {
				return false;
			}
			if (lesson.date == null) return lesson.day > todayDay;
			return remaining.has(lesson.date);
		})
		.slice()
		.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

export type DashboardRiskReason = "missed-check-in" | "overdue-assignment";

export interface DashboardRiskRow {
	student: Student;
	reasons: DashboardRiskReason[];
}

type DashboardRiskClassInput = Pick<ClassGroup, "id" | "status"> & {
	studentIds?: readonly string[];
};

function pausedOnlyStudentSet(
	classes: readonly DashboardRiskClassInput[] | undefined,
	lessons: readonly Lesson[],
	pausedIds: Set<string> | null,
): Set<string> {
	const pausedOnly = new Set<string>();
	if (!classes || !pausedIds || pausedIds.size === 0) return pausedOnly;

	const activeStudents = new Set<string>();
	const pausedStudents = new Set<string>();
	for (const cls of classes) {
		const targetSet = cls.status === "paused" ? pausedStudents : activeStudents;
		for (const sid of cls.studentIds ?? []) {
			targetSet.add(sid);
		}
	}
	for (const lesson of lessons) {
		if (pausedIds.has(lesson.classId)) {
			pausedStudents.add(lesson.sid);
		} else {
			activeStudents.add(lesson.sid);
		}
	}
	for (const sid of pausedStudents) {
		if (!activeStudents.has(sid)) pausedOnly.add(sid);
	}
	return pausedOnly;
}

/**
 * Attention rows from live kernel data only — never mock `student.atRisk` or
 * tuition tags. Strictly tracks the two actionable teacher issues:
 * - `missed-check-in`: upcoming lessons whose Vietnam date is before today
 *   (or legacy undated lessons with `day < today` in the Mon=1 week model).
 * - `overdue-assignment`: unsubmitted class assignments past deadline (excluding
 *   paused classes and targets that already have a submitted `attemptId`), plus
 *   legacy `assignments` marked `late` for non-paused-only students.
 */
export function atRiskRows(
	students: Student[],
	lessons: Lesson[],
	now = new Date(),
	classes?: readonly DashboardRiskClassInput[],
	classAssignments: readonly Pick<
		ClassAssignment,
		"classId" | "due" | "dueAt" | "targets"
	>[] = [],
	assignments: readonly Pick<Assignment, "sid" | "status">[] = [],
): DashboardRiskRow[] {
	const todayIso = todayISOVietnam(now);
	const today = isoDayNumber(todayIso);
	const nowMs = now.getTime();
	const pausedIds = pausedClassIdSet(classes);
	const reasonsBySid = new Map<string, Set<DashboardRiskReason>>();

	const addReason = (sid: string, reason: DashboardRiskReason) => {
		const set = reasonsBySid.get(sid) ?? new Set<DashboardRiskReason>();
		set.add(reason);
		reasonsBySid.set(sid, set);
	};

	for (const lesson of lessons) {
		if (pausedIds?.has(lesson.classId)) continue;
		if (lesson.status !== "upcoming") continue;
		const isMissedCheckIn =
			lesson.date != null && isValidISODate(lesson.date)
				? lesson.date < todayIso
				: lesson.day < today;
		if (isMissedCheckIn) {
			addReason(lesson.sid, "missed-check-in");
		}
	}

	for (const ca of classAssignments) {
		if (pausedIds?.has(ca.classId)) continue;
		const deadline = evaluateAssignmentDeadline({
			due: ca.due,
			dueAt: ca.dueAt,
			submittedAt: null,
			todayISO: todayIso,
			nowMs,
		});
		if (!deadline.isOverdue) continue;
		for (const target of ca.targets) {
			if (target.submittedAt != null || target.attemptId != null) continue;
			addReason(target.studentId, "overdue-assignment");
		}
	}

	if (assignments.length > 0) {
		const pausedOnlyStudents = pausedOnlyStudentSet(
			classes,
			lessons,
			pausedIds,
		);
		for (const assignment of assignments) {
			if (assignment.status !== "late") continue;
			if (pausedOnlyStudents.has(assignment.sid)) continue;
			addReason(assignment.sid, "overdue-assignment");
		}
	}

	const rows: DashboardRiskRow[] = [];
	for (const student of students) {
		const set = reasonsBySid.get(student.id);
		if (!set || set.size === 0) continue;
		const reasons: DashboardRiskReason[] = [];
		if (set.has("missed-check-in")) reasons.push("missed-check-in");
		if (set.has("overdue-assignment")) reasons.push("overdue-assignment");
		rows.push({ student, reasons });
	}
	return rows;
}

export function formatDashboardLead(now: Date, todayCount: number): string {
	const iso = todayISOVietnam(now);
	const weekday = new Intl.DateTimeFormat("vi-VN", {
		weekday: "long",
		timeZone: "Asia/Ho_Chi_Minh",
	}).format(now);
	const label = weekday.charAt(0).toLocaleUpperCase("vi-VN") + weekday.slice(1);
	const dd = iso.slice(8, 10);
	const mm = iso.slice(5, 7);
	return `${label}, ${dd}/${mm} · Hôm nay có ${todayCount} buổi dạy`;
}

/**
 * Dynamic greeting according to Vietnam time (issue #120):
 * - Sáng (05:00 – 11:59): "Chào buổi sáng, {name}"
 * - Chiều (12:00 – 17:59): "Chào buổi chiều, {name}"
 * - Tối (18:00 – 04:59): "Chào buổi tối, {name}"
 */
export function formatDashboardGreeting(
	name: string,
	now = new Date(),
	timeZone = "Asia/Ho_Chi_Minh",
): string {
	const hourFormatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hour: "numeric",
		hourCycle: "h23",
	});
	const hour = Number.parseInt(hourFormatter.format(now), 10);
	const timeOfDay =
		hour >= 5 && hour < 12
			? "buổi sáng"
			: hour >= 12 && hour < 18
				? "buổi chiều"
				: "buổi tối";
	return `Chào ${timeOfDay}, ${name}`;
}
