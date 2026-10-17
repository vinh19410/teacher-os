const ELIGIBLE_RE = /^[\p{L}\p{M}]+([ '-][\p{L}\p{M}]+)*$/u;
const LETTER_OR_MARK_RE = /^[\p{L}\p{M}]$/u;

export const CHOICE_OPTION_COUNT = 4;
export const MAX_TYPING_CODE_POINTS = 30;

/**
 * Typing comparison key per docs/srs-spec.md §4.1.
 * Order: NFC -> apostrophes -> dashes -> trim -> collapse whitespace -> lowercase.
 * Diacritics are significant (`cafe` !== `café`).
 */
export function normalizeAnswer(text: string): string {
	return text
		.normalize("NFC")
		.replace(/[’‘ʼ]/g, "'")
		.replace(/[–—]/g, "-")
		.trim()
		.replace(/\s+/g, " ")
		.toLowerCase();
}

/**
 * True iff the word can be asked as a typing prompt per docs/srs-spec.md §4.1.
 */
export function typingEligible(word: string): boolean {
	const key = normalizeAnswer(word);
	return (
		key.length > 0 &&
		Array.from(key).length <= MAX_TYPING_CODE_POINTS &&
		ELIGIBLE_RE.test(key)
	);
}

/**
 * Typing hint for a level per docs/srs-spec.md §4.1; spaces, apostrophes and hyphens are kept.
 */
export function typingHint(word: string, level: number): string {
	if (level >= 5) return "";
	const keepFirst = level <= 2;
	let atTokenStart = true;
	let out = "";
	for (const ch of normalizeAnswer(word)) {
		if (LETTER_OR_MARK_RE.test(ch)) {
			out += keepFirst && atTokenStart ? ch : "_";
			atTokenStart = false;
		} else {
			out += ch;
			if (ch === " ") atTokenStart = true;
		}
	}
	return out;
}

/**
 * True iff typed text matches word per docs/srs-spec.md §4.1.
 */
export function matchTyping(word: string, typed: string): boolean {
	return (
		typed.trim() !== "" && normalizeAnswer(typed) === normalizeAnswer(word)
	);
}
