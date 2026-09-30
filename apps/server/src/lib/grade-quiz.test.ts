import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { gradeQuiz } from "./grade-quiz";

function q(partial: Partial<AssignmentQuestion> = {}): AssignmentQuestion {
	return {
		stem: "stem",
		opts: null,
		answer: "Paris",
		alts: "",
		pin: null,
		...partial,
	};
}

describe("gradeQuiz (pure, #283)", () => {
	test("exact match is correct", () => {
		const grade = gradeQuiz([q()], { "0": "Paris" });
		expect(grade.verdicts).toEqual(["correct"]);
		expect(grade.correctCount).toBe(1);
		expect(grade.wrongCount).toBe(0);
		expect(grade.skippedCount).toBe(0);
		expect(grade.totalCount).toBe(1);
	});

	test("case-insensitive after normalize (trim + collapse whitespace + lowercase)", () => {
		const grade = gradeQuiz([q()], { "0": "  pARis   " });
		expect(grade.verdicts).toEqual(["correct"]);
	});

	test("whitespace-only answer counts as skipped, not wrong", () => {
		const grade = gradeQuiz([q()], { "0": "   " });
		expect(grade.verdicts).toEqual(["skipped"]);
	});

	test("missing key counts as skipped", () => {
		const grade = gradeQuiz([q()], {});
		expect(grade.verdicts).toEqual(["skipped"]);
	});

	test("empty string answer counts as skipped", () => {
		const grade = gradeQuiz([q()], { "0": "" });
		expect(grade.verdicts).toEqual(["skipped"]);
	});

	test("wrong answer is wrong", () => {
		const grade = gradeQuiz([q()], { "0": "London" });
		expect(grade.verdicts).toEqual(["wrong"]);
	});

	test("alts split on the pinned ' / ' separator — each alt is an accepted candidate", () => {
		const question = q({
			answer: "northern",
			alts: "north / Northern / NORTHERN",
		});
		expect(gradeQuiz([question], { "0": "north" }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([question], { "0": "NORTHERN" }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([question], { "0": "south" }).verdicts).toEqual(["wrong"]);
	});

	test("alts without the separator is a single candidate, not split", () => {
		// Separator is exactly " / " (space slash space) — a slash without
		// spaces is part of the value, never a split point.
		const question = q({ answer: "a/b", alts: "" });
		expect(gradeQuiz([question], { "0": "a/b" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([question], { "0": "a" }).verdicts).toEqual(["wrong"]);
	});

	test("choice labels compare exact-after-normalize", () => {
		const question = q({ answer: "B", opts: ["A", "B", "C", "D"] });
		expect(gradeQuiz([question], { "0": "b" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([question], { "0": "B " }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([question], { "0": "BB" }).verdicts).toEqual(["wrong"]);
	});

	test("empty answer key normalizes to no candidates — any value is wrong", () => {
		const question = q({ answer: "", alts: "" });
		expect(gradeQuiz([question], { "0": "anything" }).verdicts).toEqual([
			"wrong",
		]);
	});

	test("empty alts entries are dropped as candidates", () => {
		const question = q({ answer: "Paris", alts: " / " });
		// The lone empty candidate must not make a blank answer "correct".
		expect(gradeQuiz([question], { "0": "" }).verdicts).toEqual(["skipped"]);
		expect(gradeQuiz([question], { "0": "Paris" }).verdicts).toEqual([
			"correct",
		]);
	});

	test("mixed verdicts across questions with 0-based keys", () => {
		const questions = [
			q({ answer: "Paris" }),
			q({ answer: "B" }),
			q({ answer: "TRUE" }),
		];
		const grade = gradeQuiz(questions, { "0": "paris", "1": "C", "2": "true" });
		expect(grade.verdicts).toEqual(["correct", "wrong", "correct"]);
		expect(grade.correctCount).toBe(2);
		expect(grade.wrongCount).toBe(1);
		expect(grade.skippedCount).toBe(0);
		expect(grade.totalCount).toBe(3);
	});

	test("answers keyed beyond the snapshot range are ignored", () => {
		const grade = gradeQuiz([q()], { "0": "Paris", "9": "Z" });
		expect(grade.totalCount).toBe(1);
		expect(grade.correctCount).toBe(1);
	});

	test("pin field is carried through untouched (grading never reads it)", () => {
		const question = q({ pin: { x: 10, y: 20 } });
		const grade = gradeQuiz([question], { "0": "Paris" });
		expect(grade.verdicts).toEqual(["correct"]);
	});

	test("no questions yields zero counters", () => {
		const grade = gradeQuiz([], {});
		expect(grade).toEqual({
			verdicts: [],
			correctCount: 0,
			wrongCount: 0,
			skippedCount: 0,
			totalCount: 0,
		});
	});
});
