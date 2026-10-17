import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchTyping, typingEligible, typingHint } from "./quiz-rules";

const vectors = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL("./vectors/level-vectors.json", import.meta.url).href,
		),
		"utf8",
	),
) as {
	typing: Array<{ word: string; typed: string; match: boolean }>;
	eligibility: Array<{ word: string; typingEligible: boolean }>;
	hints: Array<{ word: string; level: number; hint: string }>;
};

describe("quiz-rules (conformance vectors)", () => {
	it.each(vectors.typing)(
		"matchTyping($word, $typed) === $match",
		({ word, typed, match }) => {
			expect(matchTyping(word, typed)).toBe(match);
		},
	);

	it.each(vectors.eligibility)(
		"typingEligible($word) === $typingEligible",
		({ word, typingEligible: expected }) => {
			expect(typingEligible(word)).toBe(expected);
		},
	);

	it.each(vectors.hints)(
		"typingHint($word, $level) === $hint",
		({ word, level, hint }) => {
			expect(typingHint(word, level)).toBe(hint);
		},
	);
});
