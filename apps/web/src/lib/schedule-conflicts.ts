/**
 * Schedule-conflict detector for the create-class modal — issue #315.
 *
 * A stored class conflicts with the draft when ALL hold:
 * 1. its schedule parses (`parseStoredSchedule`; legacy free-text never
 *    conflicts) and is not a legacy overnight row (`end <= start` still
 *    parses but the interval math below would lie — skipped as a documented
 *    false-negative),
 * 2. it shares at least one weekday with the draft,
 * 3. the time ranges overlap (`start < c.end && c.start < end`; touching
 *    edges do not overlap),
 * 4–5. the class's run window `[startDate, last occurrence date via
 *    skeletonOf]` intersects the draft's own run window. An unparseable
 *    startDate (legacy) or an unusable skeleton (total ≤ 0) means "no known
 *    end" — the class stays eligible instead of being silently dropped.
 *
 * `status` is deliberately NOT consulted: the server insert is the only
 * class-status write (kernel.ts), so a finished class still reads "active" —
 * date liveness is the honest "đang chạy" signal.
 */
import { TIME_REGEX } from "@teacher-os/api/contracts";
import {
	type ParsedSchedule,
	parseStartDateStrict,
	parseStoredSchedule,
	skeletonOf,
} from "@teacher-os/api/skeleton";
import type { ClassGroup } from "@/lib/mock-data";

export interface ScheduleConflictDraft {
	days: number[];
	start: string;
	end: string;
	startDate: string;
	sessionsTotal: number;
	/** ID lớp đang chỉnh sửa — loại trừ khỏi danh sách kiểm tra trùng (#693). */
	excludeClassId?: string;
}

export interface ScheduleConflict {
	cls: ClassGroup;
	/** Parsed stored schedule — re-render never re-parses `cls.schedule`. */
	schedule: ParsedSchedule;
	/** Sorted ascending, 0 = Monday — render with `dayNames`. */
	sharedDays: number[];
}

/** Max occurrence date of a run; null when the skeleton walk cannot produce one. */
function lastSessionDate(
	schedule: ParsedSchedule,
	startISO: string,
	total: number,
): string | null {
	const skeleton = skeletonOf(schedule, startISO, total);
	if (!skeleton) return null;
	let max: string | null = null;
	for (const dates of skeleton.values()) {
		for (const dateISO of dates) {
			if (max === null || dateISO > max) max = dateISO;
		}
	}
	return max;
}

export function findScheduleConflicts(
	draft: ScheduleConflictDraft,
	classes: ClassGroup[],
): ScheduleConflict[] {
	// `<input type="time">` yields "" while cleared — never warn on a draft
	// the create schema would reject anyway.
	if (draft.days.length === 0) return [];
	if (!TIME_REGEX.test(draft.start) || !TIME_REGEX.test(draft.end)) return [];
	if (draft.end <= draft.start) return [];

	const draftDays = [...new Set(draft.days)].sort((a, b) => a - b);
	const draftStart = parseStartDateStrict(draft.startDate);
	const draftEnd =
		draftStart === null
			? null
			: lastSessionDate(
					{ days: draftDays, start: draft.start, end: draft.end },
					draftStart,
					draft.sessionsTotal,
				);

	const conflicts: ScheduleConflict[] = [];
	for (const cls of classes) {
		if (draft.excludeClassId !== undefined && cls.id === draft.excludeClassId) {
			continue;
		}
		const schedule = parseStoredSchedule(cls.schedule);
		if (!schedule) continue; // legacy free-text
		if (schedule.end <= schedule.start) continue; // legacy overnight
		const sharedDays = schedule.days.filter((day) => draftDays.includes(day));
		if (sharedDays.length === 0) continue;
		if (!(draft.start < schedule.end && schedule.start < draft.end)) continue;
		// Run-window intersection; unknown bound = vô cực — chỉ bỏ qua lớp
		// khi một bất đẳng thức chắc chắn sai (finished class không bao giờ
		// warn dù user đang sửa tổng số buổi).
		const classStart = parseStartDateStrict(cls.startDate);
		if (draftStart !== null && classStart !== null) {
			// Stored rows pre-date the 1..52 schema cap — mirror class-sessions'
			// guard: a legacy total must not walk the O(total) skeleton into a
			// render hang. Out-of-range ⇒ unknown end ⇒ treated as still running.
			const classEnd =
				cls.sessionsTotal >= 1 && cls.sessionsTotal <= 52
					? lastSessionDate(schedule, classStart, cls.sessionsTotal)
					: null;
			if (classEnd !== null && draftStart > classEnd) continue;
			if (draftEnd !== null && classStart > draftEnd) continue;
		}
		conflicts.push({ cls, schedule, sharedDays });
	}
	return conflicts;
}
