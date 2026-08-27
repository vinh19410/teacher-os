import type { Lesson, Student } from "@/lib/mock-data";

/**
 * Weekday on a lesson row: Monday=1 … Sunday=7.
 * Matches schedule.tsx `l.day === i + 1` (column T2 = day 1), not class-create 0–6.
 */
export function lessonDayFromDate(now = new Date()): number {
	const day = now.getDay();
	return day === 0 ? 7 : day;
}

export function lessonsToday(lessons: Lesson[], now = new Date()): Lesson[] {
	const day = lessonDayFromDate(now);
	return lessons
		.filter((lesson) => lesson.day === day && lesson.status !== "cancelled")
		.slice()
		.sort((a, b) => a.time.localeCompare(b.time));
}

export type DashboardRiskReason = "absent" | "missed-check-in";

export interface DashboardRiskRow {
	student: Student;
	reasons: DashboardRiskReason[];
}

/**
 * At-risk from kernel lessons only — never `student.atRisk` or tuition tags.
 * `absent` has no kernel write path yet; missed-check-in is the live signal:
 * upcoming on a weekday strictly before today in the Mon=1 week model.
 * Monday therefore yields 0 missed (no wrap from Sunday).
 */
export function atRiskRows(
	students: Student[],
	lessons: Lesson[],
	now = new Date(),
): DashboardRiskRow[] {
	const today = lessonDayFromDate(now);
	const reasonsBySid = new Map<string, Set<DashboardRiskReason>>();

	for (const lesson of lessons) {
		let reason: DashboardRiskReason | null = null;
		if (lesson.status === "absent") {
			reason = "absent";
		} else if (lesson.status === "upcoming" && lesson.day < today) {
			reason = "missed-check-in";
		}
		if (!reason) continue;
		const set = reasonsBySid.get(lesson.sid) ?? new Set<DashboardRiskReason>();
		set.add(reason);
		reasonsBySid.set(lesson.sid, set);
	}

	const rows: DashboardRiskRow[] = [];
	for (const student of students) {
		const set = reasonsBySid.get(student.id);
		if (!set || set.size === 0) continue;
		const reasons: DashboardRiskReason[] = [];
		if (set.has("absent")) reasons.push("absent");
		if (set.has("missed-check-in")) reasons.push("missed-check-in");
		rows.push({ student, reasons });
	}
	return rows;
}

export function formatDashboardLead(now: Date, todayCount: number): string {
	const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "long" }).format(
		now,
	);
	const label = weekday.charAt(0).toLocaleUpperCase("vi-VN") + weekday.slice(1);
	const dd = String(now.getDate()).padStart(2, "0");
	const mm = String(now.getMonth() + 1).padStart(2, "0");
	return `${label}, ${dd}/${mm} · Hôm nay có ${todayCount} buổi học`;
}
