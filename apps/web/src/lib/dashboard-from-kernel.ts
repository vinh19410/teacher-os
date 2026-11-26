import { evaluateAssignmentDeadline } from "@teacher-os/api/vietnam-date";
import type {
	Assignment,
	ClassAssignment,
	ClassGroup,
	Lesson,
	Student,
} from "@/lib/mock-data";
import {
	addDays,
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
	const todayIso = todayISOVietnam(now);
	const day = isoDayNumber(todayIso);
	const pausedIds = pausedClassIdSet(classes);
	return lessons
		.filter((lesson) => {
			if (pausedIds?.has(lesson.classId)) return false;
			// Buổi đã hủy và buổi nghỉ lễ đã dời (TOS-11) không phải ca dạy.
			if (lesson.status === "cancelled" || lesson.status === "holiday") {
				return false;
			}
			// Lớp dated có ngày hợp lệ phải khớp đúng ngày hôm nay (Asia/Ho_Chi_Minh)
			// để không gom nhầm các tuần khác cùng thứ; lớp legacy (date rỗng/null)
			// giữ mô hình weekday.
			return lesson.date != null && isValidISODate(lesson.date)
				? lesson.date === todayIso
				: lesson.day === day;
		})
		.slice()
		.sort((a, b) => compareLessonTime(a.time, b.time));
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
 * Phần còn lại của tuần hiện tại (mai → Chủ nhật):
 * - legacy (date == null): day > weekday hôm nay (template weekly);
 * - có date: chỉ tính khi date ∈ các ngày còn lại của tuần chứa "hôm nay"
 *   (Việt Nam) — date đã qua/hôm nay/tuần khác bị loại;
 * - loại cancelled/holiday; sort (day asc, time asc theo số phút); flat Lesson[].
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
		.sort((a, b) => a.day - b.day || compareLessonTime(a.time, b.time));
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

export interface OverdueUnsubmittedSummary {
	targets: number;
	students: number;
}

/**
 * Counts unsubmitted overdue assignments across active classes and legacy
 * assignments using the exact same student set, paused-class exclusion, and
 * deadline/submission guards as `atRiskRows`.
 */
export function overdueUnsubmittedSummary(
	students: readonly Pick<Student, "id">[],
	lessons: readonly Lesson[],
	now = new Date(),
	classes?: readonly DashboardRiskClassInput[],
	classAssignments: readonly Pick<
		ClassAssignment,
		"classId" | "due" | "dueAt" | "targets"
	>[] = [],
	assignments: readonly Pick<Assignment, "sid" | "status">[] = [],
): OverdueUnsubmittedSummary {
	const validStudentIds = new Set(students.map((student) => student.id));
	if (validStudentIds.size === 0) {
		return { targets: 0, students: 0 };
	}

	const todayIso = todayISOVietnam(now);
	const nowMs = now.getTime();
	const pausedIds = pausedClassIdSet(classes);
	let targets = 0;
	const affectedStudents = new Set<string>();

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
			if (!validStudentIds.has(target.studentId)) continue;
			targets += 1;
			affectedStudents.add(target.studentId);
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
			if (!validStudentIds.has(assignment.sid)) continue;
			if (pausedOnlyStudents.has(assignment.sid)) continue;
			targets += 1;
			affectedStudents.add(assignment.sid);
		}
	}

	return { targets, students: affectedStudents.size };
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

const WEEKDAY_LONG_NAMES = [
	"Thứ Hai",
	"Thứ Ba",
	"Thứ Tư",
	"Thứ Năm",
	"Thứ Sáu",
	"Thứ Bảy",
	"Chủ Nhật",
] as const;

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})$/;

const vietnamClockFormatter = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Asia/Ho_Chi_Minh",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** Số phút kể từ 00:00 trong ngày theo giờ Việt Nam (`Asia/Ho_Chi_Minh`). */
export function vietnamNowMinutes(now = new Date()): number {
	const parts = vietnamClockFormatter.formatToParts(now);
	const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
	const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
	const hour = rawHour === 24 ? 0 : rawHour;
	return hour * 60 + minute;
}

/** Parse `"HH:mm"` nghiêm ngặt (00:00..23:59) → phút trong ngày, hoặc null nếu bẩn. */
export function parseTimeToMinutes(hhmm: string): number | null {
	const match = HHMM_PATTERN.exec(hhmm.trim());
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
	return hour * 60 + minute;
}

/** Tính giờ kết thúc `HH:mm` an toàn (chịu chuỗi giờ/dur bẩn, không bao giờ sinh `NaN:NaN`). */
export function formatEndTime(hhmm: string, dur: number): string {
	const start = parseTimeToMinutes(hhmm);
	if (start === null || !Number.isFinite(dur)) return "";
	const safeDur = Math.max(0, Math.round(dur));
	const total = (((start + safeDur) % 1440) + 1440) % 1440;
	const hh = String(Math.floor(total / 60)).padStart(2, "0");
	const mm = String(total % 60).padStart(2, "0");
	return `${hh}:${mm}`;
}

/** Định dạng thời lượng tiếng Việt (clamp tối thiểu 1 phút). */
export function formatDurationVi(minutes: number): string {
	const safe = Number.isFinite(minutes) ? Math.max(1, Math.round(minutes)) : 1;
	const hours = Math.floor(safe / 60);
	const mins = safe % 60;
	if (hours === 0) return `${mins} phút`;
	return mins === 0 ? `${hours} giờ` : `${hours} giờ ${mins} phút`;
}

/** Tên thứ đầy đủ từ lesson.day (1 = Thứ Hai … 7 = Chủ Nhật). */
export function formatWeekdayLong(day: number): string {
	return WEEKDAY_LONG_NAMES[day - 1] ?? `Thứ ${day}`;
}

export type SessionTimelineState = "past" | "live" | "next";

/** Phân loại trạng thái thời gian của 1 ca dạy hôm nay theo `nowMin` (phút giờ VN). */
export function sessionTimelineState(
	session: Pick<DashboardClassSession, "time" | "dur">,
	nowMin: number,
): SessionTimelineState {
	const start = parseTimeToMinutes(session.time);
	if (start === null) return "next";
	const dur = Number.isFinite(session.dur) ? Math.max(0, session.dur) : 0;
	const end = start + dur;
	if (dur > 0 && nowMin >= start && nowMin < end) return "live";
	if (nowMin >= end) return "past";
	return "next";
}

/**
 * Ca dạy hôm nay còn chưa điểm danh nếu còn bất kỳ dòng lesson nào thuộc
 * `(classId, time)` trong danh sách buổi hôm nay vẫn ở trạng thái `"upcoming"`
 * (đồng bộ predicate `lesson.status === "upcoming"` của `/api/dashboard/reminders`).
 */
export function hasPendingTodayAttendance(
	todayLessons: readonly Lesson[],
	classId: string,
	time: string,
): boolean {
	return todayLessons.some(
		(lesson) =>
			lesson.classId === classId &&
			lesson.time === time &&
			lesson.status === "upcoming",
	);
}

export interface UpcomingDayGroup {
	day: number;
	/** Chỉ gắn `yyyy-mm-dd` khi có lesson `dated` hợp lệ; legacy giữ `null` theo #56. */
	dateIso: string | null;
	sessions: DashboardClassSession[];
}

/** So sánh giờ theo số phút (xử lý được cả `"9:00"` vs `"14:00"`), fallback `localeCompare`. */
function compareLessonTime(a: string, b: string): number {
	const minA = parseTimeToMinutes(a);
	const minB = parseTimeToMinutes(b);
	if (minA !== null && minB !== null) return minA - minB;
	return a.localeCompare(b);
}

/** Gom danh sách `upcomingLessonsThisWeek` theo ngày (dedup `day` an toàn kể cả input chưa sort) và buổi-lớp. */
export function groupUpcomingByDay(
	lessons: readonly Lesson[],
): UpcomingDayGroup[] {
	const byDay = new Map<
		number,
		{ day: number; dateIso: string | null; lessons: Lesson[] }
	>();
	for (const lesson of lessons) {
		const validDate =
			lesson.date != null && isValidISODate(lesson.date) ? lesson.date : null;
		const existing = byDay.get(lesson.day);
		if (existing) {
			existing.lessons.push(lesson);
			if (existing.dateIso === null && validDate !== null) {
				existing.dateIso = validDate;
			}
		} else {
			byDay.set(lesson.day, {
				day: lesson.day,
				dateIso: validDate,
				lessons: [lesson],
			});
		}
	}
	return Array.from(byDay.values()).map((group) => ({
		day: group.day,
		dateIso: group.dateIso,
		sessions: groupLessonsByClassSession(group.lessons),
	}));
}

export type DashboardFocusState =
	| {
			kind: "live";
			session: DashboardClassSession;
			progress: number;
			minutesLeft: number;
	  }
	| {
			kind: "next";
			session: DashboardClassSession;
			minutesUntil: number;
	  }
	| {
			kind: "done-today-with-upcoming";
			session: DashboardClassSession;
			day: number;
			dateIso: string | null;
			isTomorrow: boolean;
	  }
	| {
			kind: "no-today-with-upcoming";
			session: DashboardClassSession;
			day: number;
			dateIso: string | null;
			isTomorrow: boolean;
	  }
	| { kind: "done-today-no-upcoming" }
	| { kind: "empty" };

/** Chọn thẻ trọng tâm (Focus Card) trên Hero theo giờ Việt Nam hiện tại. */
export function resolveDashboardFocus(input: {
	todaySessions: readonly DashboardClassSession[];
	upcomingGroups: readonly UpcomingDayGroup[];
	now?: Date;
}): DashboardFocusState {
	const now = input.now ?? new Date();
	const nowMin = vietnamNowMinutes(now);
	const validToday = input.todaySessions.filter(
		(s) => parseTimeToMinutes(s.time) !== null,
	);

	for (const session of validToday) {
		const start = parseTimeToMinutes(session.time);
		if (start === null) continue;
		const dur = Number.isFinite(session.dur) ? Math.max(0, session.dur) : 0;
		if (dur > 0 && nowMin >= start && nowMin < start + dur) {
			return {
				kind: "live",
				session,
				progress: Math.min(1, Math.max(0, (nowMin - start) / dur)),
				minutesLeft: Math.max(1, start + dur - nowMin),
			};
		}
	}

	for (const session of validToday) {
		const start = parseTimeToMinutes(session.time);
		if (start === null) continue;
		if (nowMin < start) {
			return {
				kind: "next",
				session,
				minutesUntil: Math.max(1, start - nowMin),
			};
		}
	}

	const firstGroup = input.upcomingGroups.find((g) => g.sessions.length > 0);
	const firstSession = firstGroup?.sessions[0];
	if (firstGroup && firstSession) {
		const todayIso = todayISOVietnam(now);
		const todayDay = isoDayNumber(todayIso);
		const tomorrowIso = addDays(todayIso, 1);
		const isTomorrow =
			firstGroup.dateIso !== null
				? firstGroup.dateIso === tomorrowIso
				: firstGroup.day === (todayDay % 7) + 1;
		return {
			kind:
				input.todaySessions.length > 0
					? "done-today-with-upcoming"
					: "no-today-with-upcoming",
			session: firstSession,
			day: firstGroup.day,
			dateIso: firstGroup.dateIso,
			isTomorrow,
		};
	}

	return input.todaySessions.length > 0
		? { kind: "done-today-no-upcoming" }
		: { kind: "empty" };
}

export type DashboardRiskIssue =
	| {
			kind: "missed-check-in";
			classId: string;
			className: string;
			dateIso: string | null;
			day: number;
			time: string;
	  }
	| {
			kind: "overdue-assignment";
			title: string;
			due: string;
			className: string | null;
	  };

type DashboardRiskDetailClassInput = DashboardRiskClassInput & {
	name?: string;
};

/**
 * Chi tiết vấn đề thật của 1 học viên cho `StudentRiskDrawer` — dùng chung chính
 * xác bộ lọc với `atRiskRows` để mọi học viên xuất hiện ở "Cần kiểm tra" luôn có
 * danh sách issue thật khớp 100%.
 */
export function studentRiskDetails(
	studentId: string,
	lessons: readonly Lesson[],
	now = new Date(),
	classes?: readonly DashboardRiskDetailClassInput[],
	classAssignments: readonly Pick<
		ClassAssignment,
		"classId" | "title" | "due" | "dueAt" | "targets"
	>[] = [],
	assignments: readonly Pick<
		Assignment,
		"sid" | "title" | "due" | "status"
	>[] = [],
): DashboardRiskIssue[] {
	const todayIso = todayISOVietnam(now);
	const today = isoDayNumber(todayIso);
	const nowMs = now.getTime();
	const pausedIds = pausedClassIdSet(classes);
	const classNameById = new Map<string, string>();
	for (const cls of classes ?? []) {
		if (cls.name) classNameById.set(cls.id, cls.name);
	}

	const issues: DashboardRiskIssue[] = [];
	const seenMissed = new Set<string>();

	for (const lesson of lessons) {
		if (lesson.sid !== studentId) continue;
		if (pausedIds?.has(lesson.classId)) continue;
		if (lesson.status !== "upcoming") continue;
		const validDate =
			lesson.date != null && isValidISODate(lesson.date) ? lesson.date : null;
		const isMissedCheckIn =
			validDate !== null ? validDate < todayIso : lesson.day < today;
		if (!isMissedCheckIn) continue;
		const dedupKey = `${lesson.classId}|${validDate ?? lesson.day}|${lesson.time}`;
		if (seenMissed.has(dedupKey)) continue;
		seenMissed.add(dedupKey);
		issues.push({
			kind: "missed-check-in",
			classId: lesson.classId,
			className: classNameById.get(lesson.classId) ?? "Lớp",
			dateIso: validDate,
			day: lesson.day,
			time: lesson.time,
		});
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
		const hasUnsubmittedTarget = ca.targets.some(
			(target) =>
				target.studentId === studentId &&
				target.submittedAt == null &&
				target.attemptId == null,
		);
		if (!hasUnsubmittedTarget) continue;
		issues.push({
			kind: "overdue-assignment",
			title: ca.title,
			due: deadline.dueDateISO,
			className: classNameById.get(ca.classId) ?? null,
		});
	}

	if (assignments.length > 0) {
		const pausedOnlyStudents = pausedOnlyStudentSet(
			classes,
			lessons,
			pausedIds,
		);
		if (!pausedOnlyStudents.has(studentId)) {
			for (const assignment of assignments) {
				if (assignment.sid !== studentId) continue;
				if (assignment.status !== "late") continue;
				issues.push({
					kind: "overdue-assignment",
					title: assignment.title,
					due: assignment.due,
					className: null,
				});
			}
		}
	}

	return issues;
}
