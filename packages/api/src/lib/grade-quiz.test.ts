import { describe, expect, test } from "vitest";
import type { AssignmentQuestion } from "../contracts";
import { gradeQuiz } from "./grade-quiz";

const question = (
	overrides: Partial<AssignmentQuestion> = {},
): AssignmentQuestion => ({
	stem: "Câu hỏi",
	opts: null,
	answer: "Paris",
	alts: "",
	pin: null,
	...overrides,
});

describe("gradeQuiz — verdicts (#283)", () => {
	test("blank hoặc thiếu key → skipped; khớp candidate → correct; lệch → wrong", () => {
		const grade = gradeQuiz(
			[
				question({ answer: "Paris", alts: "" }),
				question({ answer: "northern", alts: "north / Northern" }),
				question({ answer: "TRUE", alts: "" }),
			],
			{ "0": "   ", "1": "NORTH" },
		);
		expect(grade.verdicts).toEqual(["skipped", "correct", "skipped"]);
		expect(grade).toMatchObject({
			correctCount: 1,
			wrongCount: 0,
			skippedCount: 2,
			totalCount: 3,
		});
	});

	test("normalize: hoa/thường + whitespace dư vẫn correct; đáp án lệch dấu → wrong", () => {
		const grade = gradeQuiz([question({ answer: "Hà Nội", alts: "" })], {
			"0": "  hà   nội  ",
		});
		expect(grade.verdicts).toEqual(["correct"]);

		// Pin hành vi hiện tại (scenario I6): normalize KHÔNG canonicalize
		// Unicode — NFD (dấu tổ hợp) không khớp NFC (dấu dựng sẵn). Nếu muốn
		// chấp nhận cả hai, phải thêm normalize("NFC") vào grader trước.
		const nfd = "Ha\u0323 No\u0323i";
		expect(
			gradeQuiz([question({ answer: "Hà Nội" })], { "0": nfd }).verdicts,
		).toEqual(["wrong"]);
	});
});

describe("gradeQuiz — alts với separator ' / ' (scenario I5)", () => {
	test("alt phân tách đúng ' / ' — space-slash-space", () => {
		const grade = gradeQuiz(
			[question({ answer: "northern", alts: "north / Northern" })],
			{ "0": "north" },
		);
		expect(grade.verdicts).toEqual(["correct"]);
	});

	test("slash trong giá trị alt không phải điểm tách — chỉ ' / ' mới tách", () => {
		// alt "a/b" chứa slash không space: tách đúng phải cho đúng 2 candidate
		// "a/b" và "c". Nếu tách theo "/" trần thì nửa mảnh "a"/"b" sẽ được
		// chấm đúng — sai ngữ nghĩa đáp án.
		const q = question({ answer: "none of these", alts: "a/b / c" });
		expect(gradeQuiz([q], { "0": "a/b" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "c" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "a" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "b" }).verdicts).toEqual(["wrong"]);
	});

	test("answer chứa slash không bao giờ bị tách dù separator thế nào", () => {
		// "24/7" là một đáp án nguyên vẹn; "24 / 7" phải sai, và nửa mảnh "24"
		// cũng phải sai — nếu grader tách theo "/" thì "24" sẽ được chấm đúng.
		const q = question({ answer: "24/7", alts: "" });
		expect(gradeQuiz([q], { "0": "24/7" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "24 / 7" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "24" }).verdicts).toEqual(["wrong"]);
		expect(gradeQuiz([q], { "0": "7" }).verdicts).toEqual(["wrong"]);
	});

	test("alts nhiều mức + alt rỗng bị bỏ — không khớp chuỗi trắng", () => {
		const q = question({ answer: "ii", alts: " / two /  " });
		expect(gradeQuiz([q], { "0": "two" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([q], { "0": "ii" }).verdicts).toEqual(["correct"]);
		// Blank alt bị drop nên submission trắng vẫn là skipped, không correct.
		expect(gradeQuiz([q], {}).verdicts).toEqual(["skipped"]);
	});

	test("candidate chỉ khớp sau normalize — 'NORTH' khớp alt 'north'", () => {
		const grade = gradeQuiz(
			[question({ answer: "northern", alts: "north / Northern" })],
			{ "0": "  NoRtH  " },
		);
		expect(grade.verdicts).toEqual(["correct"]);
	});
});

describe("gradeQuiz — đáp án chứa ký tự JSON đặc biệt (scenario I4)", () => {
	test("answer/alts chứa quote và backslash vẫn chấm đúng (không bị làm hỏng)", () => {
		const quoted = question({ answer: 'he said "ok"', alts: "ok" });
		expect(gradeQuiz([quoted], { "0": 'He said "ok"' }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([quoted], { "0": "ok" }).verdicts).toEqual(["correct"]);
		expect(gradeQuiz([quoted], { "0": 'he said "no"' }).verdicts).toEqual([
			"wrong",
		]);

		const path = question({ answer: "C:\\Users", alts: "" });
		expect(gradeQuiz([path], { "0": "c:\\users" }).verdicts).toEqual([
			"correct",
		]);
		expect(gradeQuiz([path], { "0": "c:\\users2" }).verdicts).toEqual([
			"wrong",
		]);
	});
});
