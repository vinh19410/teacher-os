/**
 * Stable per-class accent color (TOS-14 D2, issue #447): maps a class id to
 * one of 8 color slots with an FNV-1a 32-bit hash — no randomness, no
 * locale, so the same id always lands on the same slot across sessions and
 * machines.
 */

export const CLASS_COLOR_COUNT = 8;

export type ClassColorIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 1-based color slot (1..8) for a class id — deterministic FNV-1a. */
export function classColorIndex(classId: string): ClassColorIndex {
	let hash = FNV_OFFSET_BASIS;
	for (let i = 0; i < classId.length; i++) {
		hash ^= classId.charCodeAt(i);
		hash = Math.imul(hash, FNV_PRIME);
	}
	return (((hash >>> 0) % CLASS_COLOR_COUNT) + 1) as ClassColorIndex;
}
