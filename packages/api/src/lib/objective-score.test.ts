import { describe, expect, test } from "vitest";
import {
	formatObjectiveScore,
	hasValidGradedBand,
	normalizeObjectiveScore,
} from "./objective-score";

describe("objective-score (#977)", () => {
	test("normalizes and formats valid objective scores including 0/N", () => {
		expect(normalizeObjectiveScore(3, 3)).toEqual({
			correctCount: 3,
			totalQuestions: 3,
		});
		expect(formatObjectiveScore({ correctCount: 3, totalQuestions: 3 })).toBe(
			"3/3",
		);

		expect(normalizeObjectiveScore(0, 3)).toEqual({
			correctCount: 0,
			totalQuestions: 3,
		});
		expect(formatObjectiveScore({ correctCount: 0, totalQuestions: 3 })).toBe(
			"0/3",
		);

		expect(normalizeObjectiveScore(2, 10)).toEqual({
			correctCount: 2,
			totalQuestions: 10,
		});
		expect(formatObjectiveScore({ correctCount: 2, totalQuestions: 10 })).toBe(
			"2/10",
		);
	});

	test("returns null for invalid, zero-total, out-of-range, non-safe-integer, or malformed scores", () => {
		expect(normalizeObjectiveScore(0, 0)).toBeNull();
		expect(normalizeObjectiveScore(null, 3)).toBeNull();
		expect(normalizeObjectiveScore(3, null)).toBeNull();
		expect(normalizeObjectiveScore(undefined, 3)).toBeNull();
		expect(normalizeObjectiveScore(3, undefined)).toBeNull();
		expect(normalizeObjectiveScore(-1, 3)).toBeNull();
		expect(normalizeObjectiveScore(4, 3)).toBeNull();
		expect(normalizeObjectiveScore(1.5, 3)).toBeNull();
		expect(normalizeObjectiveScore(2, 3.5)).toBeNull();
		expect(normalizeObjectiveScore(Number.NaN, 3)).toBeNull();
		expect(normalizeObjectiveScore(3, Number.POSITIVE_INFINITY)).toBeNull();
		expect(
			normalizeObjectiveScore(
				Number.MAX_SAFE_INTEGER + 1,
				Number.MAX_SAFE_INTEGER + 1,
			),
		).toBeNull();
		expect(normalizeObjectiveScore(1e21, 1e21)).toBeNull();
		expect(normalizeObjectiveScore("3", "3")).toBeNull();
	});

	test("validates graded band + parseable timestamp in hasValidGradedBand", () => {
		const validDate = "2026-11-26T08:00:00.000Z";
		expect(hasValidGradedBand({ band: 0, gradedAt: validDate })).toBe(true);
		expect(hasValidGradedBand({ band: 6.5, gradedAt: validDate })).toBe(true);
		expect(hasValidGradedBand({ band: 9, gradedAt: validDate })).toBe(true);

		expect(hasValidGradedBand({ band: null, gradedAt: validDate })).toBe(false);
		expect(hasValidGradedBand({ band: 9.5, gradedAt: validDate })).toBe(false);
		expect(hasValidGradedBand({ band: -0.5, gradedAt: validDate })).toBe(false);
		expect(hasValidGradedBand({ band: 6.3, gradedAt: validDate })).toBe(false);
		expect(hasValidGradedBand({ band: Number.NaN, gradedAt: validDate })).toBe(
			false,
		);
		expect(hasValidGradedBand({ band: 6.5, gradedAt: null })).toBe(false);
		expect(hasValidGradedBand({ band: 6.5, gradedAt: "   " })).toBe(false);
		expect(hasValidGradedBand({ band: 6.5, gradedAt: "not-a-date" })).toBe(
			false,
		);
	});
});
