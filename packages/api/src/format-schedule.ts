/**
 * Class schedule formatting — the DB stores `schedule` as a raw TEXT column:
 * a JSON `{days,start,end}` written by the structured create-class form, or a
 * legacy free-text string written before migration 0007. Parse defensively and
 * fall back to the raw string so old rows keep rendering verbatim.
 */
import { TIME_REGEX } from "./contracts";

export const SCHEDULE_DAY_NAMES = [
	"T2",
	"T3",
	"T4",
	"T5",
	"T6",
	"T7",
	"CN",
] as const;

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
	const uniqueDays = [...new Set(days)].sort((a, b) => a - b);
	return { days: uniqueDays, start, end };
}

export function formatSchedule(raw: string): string {
	const schedule = parseSchedule(raw);
	if (!schedule) return raw;
	const days = schedule.days
		.map((d) => SCHEDULE_DAY_NAMES[d] ?? `day ${d}`)
		.join(" & ");
	return `${days} · ${schedule.start}–${schedule.end}`;
}
