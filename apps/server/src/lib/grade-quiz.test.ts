import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { gradeQuiz } from "@teacher-os/api/lib/grade-quiz";
import { describe, expect, test } from "vitest";

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

describe("gradeQuiz — answerSet (Choose TWO)", () => {
	test("hoán vị hợp lệ: đáp án của câu này ở câu kia → cả hai correct", () => {
		const grade = gradeQuiz(
			[q({ answer: "B", answerSet: "s" }), q({ answer: "D", answerSet: "s" })],
			{ "0": "D", "1": "B" },
		);
		expect(grade.verdicts).toEqual(["correct", "correct"]);
	});

	test("key không kề không bị khóa visited: đường tăng vẫn tìm được (kongming regression)", () => {
		// q0 candidates {a,z}, q1 candidates {b,z}; trả (A, Z).
		// Z khớp cả hai, A chỉ khớp q0 → phân bố đúng là a0→k0, a1→k1 (2/2).
		const grade = gradeQuiz(
			[
				q({ answer: "A", alts: "Z", answerSet: "s" }),
				q({ answer: "B", alts: "Z", answerSet: "s" }),
			],
			{ "0": "A", "1": "Z" },
		);
		expect(grade.verdicts).toEqual(["correct", "correct"]);
		expect(grade.correctCount).toBe(2);
	});

	test("một đáp án không tính hai lần; thứ tự duyệt cố định index tăng dần", () => {
		const grade = gradeQuiz(
			[q({ answer: "B", answerSet: "s" }), q({ answer: "D", answerSet: "s" })],
			{ "0": "B", "1": "B" },
		);
		expect(grade.verdicts).toEqual(["correct", "wrong"]);
	});

	test("câu bỏ trống trong tập → skipped, câu kia vẫn correct", () => {
		const grade = gradeQuiz(
			[q({ answer: "B", answerSet: "s" }), q({ answer: "D", answerSet: "s" })],
			{ "0": "D" },
		);
		expect(grade.verdicts).toEqual(["correct", "skipped"]);
	});

	test("trộn câu vị trí thường và câu tập: cả ba correct, correctCount === 3", () => {
		const grade = gradeQuiz(
			[
				q({ answer: "Paris" }),
				q({ answer: "B", answerSet: "s" }),
				q({ answer: "D", answerSet: "s" }),
			],
			{ "0": "Paris", "1": "D", "2": "B" },
		);
		expect(grade.verdicts).toEqual(["correct", "correct", "correct"]);
		expect(grade.correctCount).toBe(3);
	});

	test("hai tập khác khóa không lẫn đáp án sang nhau", () => {
		const grade = gradeQuiz(
			[
				q({ answer: "B", answerSet: "s1" }),
				q({ answer: "D", answerSet: "s1" }),
				q({ answer: "X", answerSet: "s2" }),
				q({ answer: "Y", answerSet: "s2" }),
			],
			{ "0": "D", "1": "B", "2": "Y", "3": "X" },
		);
		expect(grade.verdicts).toEqual([
			"correct",
			"correct",
			"correct",
			"correct",
		]);
		// B/D không được chấp nhận ở tập s2:
		const cross = gradeQuiz(
			[
				q({ answer: "B", answerSet: "s1" }),
				q({ answer: "D", answerSet: "s1" }),
				q({ answer: "X", answerSet: "s2" }),
				q({ answer: "Y", answerSet: "s2" }),
			],
			{ "0": "D", "1": "B", "2": "B", "3": "X" },
		);
		expect(cross.verdicts).toEqual(["correct", "correct", "wrong", "correct"]);
	});

	test("alts giao nhau: hoán vị hợp lệ vẫn đúng nhờ khớp cực đại (không greedy)", () => {
		// q0 candidates {a,b}, q1 candidates {b}; trả (B, A) là hoán vị hợp lệ.
		const grade = gradeQuiz(
			[
				q({ answer: "A", alts: "B", answerSet: "s" }),
				q({ answer: "B", answerSet: "s" }),
			],
			{ "0": "B", "1": "A" },
		);
		expect(grade.verdicts).toEqual(["correct", "correct"]);
	});

	test("alts không giao: hoán vị vòng 3 câu vẫn toàn correct (chống hồi quy matching)", () => {
		const grade = gradeQuiz(
			[
				q({ answer: "B", answerSet: "s" }),
				q({ answer: "D", answerSet: "s" }),
				q({ answer: "F", answerSet: "s" }),
			],
			{ "0": "F", "1": "B", "2": "D" },
		);
		expect(grade.verdicts).toEqual(["correct", "correct", "correct"]);
		expect(grade.correctCount).toBe(3);
	});
});
