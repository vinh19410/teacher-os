export const DAY_MS = 24 * 60 * 60 * 1000;
/** Wait in days after an answer, indexed by `level - 1`. */
export const LEVEL_INTERVAL_DAYS = [1, 3, 7, 14, 30] as const;
/** A flagged level-5 card is re-tested after this many days. */
export const WARNING_INTERVAL_DAYS = 1;
export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;

export type SrsCardState = "new" | "review";

export interface SrsCard {
	level: number;
	isWarning: boolean;
	state: SrsCardState;
	intervalDays: number;
	dueAt: number;
	lapses: number;
}

export function clamp(value: number, lo: number, hi: number): number {
	return Math.min(hi, Math.max(lo, value));
}

/**
 * Apply the first result of a card in a Review session per docs/srs-spec.md §2.
 */
export function applyAnswer(
	card: SrsCard,
	correct: boolean,
	now: number,
): SrsCard {
	const { level, isWarning } = card;
	let newLevel: number;
	let newWarning: boolean;
	if (correct) {
		newLevel = isWarning ? level - 1 : level + 1;
		newWarning = false;
	} else if (level >= MAX_LEVEL) {
		if (isWarning) {
			newLevel = MIN_LEVEL;
			newWarning = false;
		} else {
			newLevel = MAX_LEVEL;
			newWarning = true;
		}
	} else if (level >= 2) {
		newLevel = level - 1;
		newWarning = false;
	} else {
		newLevel = MIN_LEVEL;
		newWarning = false;
	}
	newLevel = clamp(newLevel, MIN_LEVEL, MAX_LEVEL);
	const intervalDays = newWarning
		? WARNING_INTERVAL_DAYS
		: (LEVEL_INTERVAL_DAYS[newLevel - 1] ?? 1);
	return {
		level: newLevel,
		isWarning: newWarning,
		state: "review",
		intervalDays,
		dueAt: now + intervalDays * DAY_MS,
		lapses: card.lapses + (!correct && level >= 2 ? 1 : 0),
	};
}

/**
 * Card state after completing all Learn steps for a word per docs/srs-spec.md §3b rule 7.
 */
export function learned(card: SrsCard, now: number): SrsCard {
	return {
		level: MIN_LEVEL,
		isWarning: false,
		state: "review",
		intervalDays: 1,
		dueAt: now + DAY_MS,
		lapses: card.lapses,
	};
}

/**
 * Round half away from zero (used by summary recall % in §3.8 and §3b.8).
 * Note: Math.round(-0.5) is -0, whereas for non-negative percentages Math.floor(v + 0.5)
 * matches round-half-away-from-zero. For negative inputs, Math.ceil(v - 0.5) is used.
 */
export function roundHalfAwayFromZero(value: number): number {
	return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}
