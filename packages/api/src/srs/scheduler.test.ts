import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	applyAnswer,
	learned,
	roundHalfAwayFromZero,
	type SrsCard,
} from "./scheduler";

const vectors = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL("./vectors/level-vectors.json", import.meta.url).href,
		),
		"utf8",
	),
) as {
	answers: Array<{
		name: string;
		input: SrsCard;
		correct: boolean;
		now: number;
		expected: SrsCard;
	}>;
	learnCommit: Array<{
		name: string;
		input: SrsCard;
		now: number;
		expected: SrsCard;
	}>;
};

describe("scheduler (conformance vectors)", () => {
	it.each(vectors.answers)(
		"applyAnswer: $name",
		({ input, correct, now, expected }) => {
			expect(applyAnswer(input, correct, now)).toEqual(expected);
		},
	);

	it.each(vectors.learnCommit)("learned: $name", ({ input, now, expected }) => {
		expect(learned(input, now)).toEqual(expected);
	});

	it("roundHalfAwayFromZero rounds .5 away from zero", () => {
		expect(roundHalfAwayFromZero(0)).toBe(0);
		expect(roundHalfAwayFromZero(50.4)).toBe(50);
		expect(roundHalfAwayFromZero(50.5)).toBe(51);
		expect(roundHalfAwayFromZero(-50.5)).toBe(-51);
	});
});
