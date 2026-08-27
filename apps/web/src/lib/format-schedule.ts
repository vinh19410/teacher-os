/**
 * Class schedule formatting — the DB stores `schedule` as a raw TEXT column:
 * a JSON `{days,start,end}` written by the structured create-class form, or a
 * legacy free-text string written before migration 0007. Parse defensively and
 * fall back to the raw string so old rows keep rendering verbatim.
 */
import { TIME_REGEX } from "@teacher-os/api/contracts";
import { dayNames } from "@/lib/mock-data";

export interface StructuredSchedule {
	days: number[];
	start: string;
	end: string;
}

export function parseSchedule(raw: string): StructuredSchedule | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;
	const { days, start, end } = parsed as Record<string, unknown>;
	if (
		!Array.isArray(days) ||
		days.length === 0 ||
		!days.every(
			(d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
		)
	) {
		return null;
	}
	if (typeof start !== "string" || typeof end !== "string") return null;
	if (!TIME_REGEX.test(start) || !TIME_REGEX.test(end)) return null;
	return { days, start, end };
}

export function formatSchedule(raw: string): string {
	const schedule = parseSchedule(raw);
	if (!schedule) return raw;
	const days = schedule.days.map((d) => dayNames[d] ?? `day ${d}`).join(" & ");
	return `${days} · ${schedule.start}–${schedule.end}`;
}

/**
 * Label for a lesson's weekday. `lesson.day` is 1-7 with 1 = Monday —
 * the lesson-day convention (server generates `scheduleDay + 1`) — NOT the
 * 0-based `parseSchedule().days` used by the class schedule JSON. Never a
 * calendar date: the schedule grid shows real dates only when backed by
 * real lesson data (issue #56).
 */
export function lessonDayLabel(day: number): string {
	return dayNames[day - 1] ?? `day ${day}`;
}

/** Add minutes to "HH:MM", wrapping past midnight (23:00 + 90 → "00:30"). */
export function addMinutes(hhmm: string, minutes: number): string {
	const [h, m] = hhmm.split(":").map(Number);
	const total = (h * 60 + m + minutes) % (24 * 60);
	const hh = String(Math.floor(total / 60)).padStart(2, "0");
	const mm = String(total % 60).padStart(2, "0");
	return `${hh}:${mm}`;
}
