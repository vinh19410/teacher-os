import { describe, expect, test } from "vitest";

import type { TestAnswerKind, TestAnswerRange } from "./test-answer-key";
import {
	compareAnswerKey,
	normalizeAlts,
	parseTestAnswerKey,
	summarizeAnswerKeyDiff,
	testAnswerCells,
} from "./test-answer-key";

const range = (
	part: string,
	qStart: number,
	count: number,
	kind: TestAnswerKind = "text",
): TestAnswerRange => ({ part, qStart, count, kind });

/** Reading 3 passage chuẩn 13/13/14 — p2 lệch 13 câu là case precedence. */
const readingRanges = [
	range("p1", 1, 13, "tfng"),
	range("p2", 14, 13, "mcq4"),
	range("p3", 27, 14, "text"),
];

describe("parseTestAnswerKey (phase-05 Task 5.1)", () => {
	test("parse dòng cơ bản: mcq hoa, tfng/ynng chuẩn hóa, text alts join ' / '", () => {
		const { entries, errors } = parseTestAnswerKey(
			[
				"1. true", // p1 tfng
				"14. b", // p2 mcq4 (số tuyệt đối, không phải index)
				"27. Car / Cars", // p3 text
				"28. northern / north / n", // nhiều alt
				"15) c", // biến thể "số)" vẫn match pattern
			].join("\n"),
			readingRanges,
		);
		expect(entries).toEqual([
			{ number: 1, answer: "TRUE", alts: "" },
			{ number: 14, answer: "B", alts: "" },
			{ number: 27, answer: "Car", alts: "Cars" },
			{ number: 28, answer: "northern", alts: "north / n" },
			{ number: 15, answer: "C", alts: "" },
		]);
		expect(errors).toEqual([]);
	});

	test("bỏ dòng trống; dòng thiếu số thành error unparsable và bị bỏ", () => {
		const { entries, errors } = parseTestAnswerKey(
			"1. A\n\n   \nhello world\n2. B",
			[range("p1", 1, 2, "mcq4")],
		);
		expect(entries.map((entry) => entry.number)).toEqual([1, 2]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ line: 4, reason: "unparsable" });
	});

	test("dòng trùng số: dòng hợp lệ đầu thắng, dòng sau thành error duplicate", () => {
		const { entries, errors } = parseTestAnswerKey("1. A\n1. B\n2. B", [
			range("p1", 1, 2, "mcq4"),
		]);
		expect(entries.find((entry) => entry.number === 1)?.answer).toBe("A");
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ line: 2, reason: "duplicate" });
	});

	test("dòng lỗi cho Qn không chặn dòng hợp lệ sau đó của cùng Qn", () => {
		const { entries, errors } = parseTestAnswerKey("1. maybe\n1. TRUE\n", [
			range("p1", 1, 1, "tfng"),
		]);
		expect(entries).toEqual([{ number: 1, answer: "TRUE", alts: "" }]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ reason: "invalid-choice" });
	});

	test("sai bộ đáp án theo kind: tfng 'maybe', mcq 'E' đều invalid-choice", () => {
		const { entries, errors } = parseTestAnswerKey(
			"1. maybe\n14. E",
			readingRanges,
		);
		expect(entries).toEqual([]);
		expect(errors.map((error) => error.reason)).toEqual([
			"invalid-choice",
			"invalid-choice",
		]);
	});

	test("roman/letter chuẩn hóa case-insensitive về dạng canonical", () => {
		const { entries } = parseTestAnswerKey("1. III\n2. v", [
			range("p1", 1, 1, "roman"),
			range("p2", 2, 1, "roman"),
		]);
		expect(entries).toEqual([
			{ number: 1, answer: "iii", alts: "" },
			{ number: 2, answer: "v", alts: "" },
		]);
	});

	test("số ngoài range vẫn thành entry (kind fallback text) — không bị loại thầm", () => {
		const { entries, errors } = parseTestAnswerKey("41. X", readingRanges);
		expect(entries).toEqual([{ number: 41, answer: "X", alts: "" }]);
		expect(errors).toEqual([]);
	});
});

describe("testAnswerCells — đánh số tuyệt đối theo ranges", () => {
	test("part sau nối mốc part trước: Q15 là câu thứ 2 của p2, không phải index 14", () => {
		const cells = testAnswerCells([
			{
				part: "p1",
				qStart: 1,
				kind: "tfng",
				questions: Array.from({ length: 13 }, () => ({
					answer: "TRUE",
					alts: "",
				})),
			},
			{
				part: "p2",
				qStart: 14,
				kind: "mcq4",
				questions: [
					{ answer: "A", alts: "" },
					{ answer: "B", alts: "" },
				],
			},
		]);
		expect(cells).toHaveLength(15);
		expect(cells[14]).toMatchObject({ number: 15, part: "p2", answer: "B" });
	});
});

describe("compareAnswerKey (phase-05 Task 5.1)", () => {
	const cellsFor = (
		questions: { answer: string; alts?: string }[],
		qStart = 1,
		kind: TestAnswerKind = "tfng",
	) =>
		testAnswerCells([
			{
				part: "p1",
				qStart,
				kind,
				questions: questions.map((question) => ({
					answer: question.answer,
					alts: question.alts ?? "",
				})),
			},
		]);

	test("đủ 4 trạng thái theo số tuyệt đối + summary đếm đúng", () => {
		const { entries } = parseTestAnswerKey("1. TRUE\n2. FALSE\n9. TRUE", [
			range("p1", 1, 3, "tfng"),
		]);
		const rows = compareAnswerKey(
			entries,
			cellsFor([{ answer: "TRUE" }, { answer: "TRUE" }, { answer: "FALSE" }]),
		);
		expect(rows.map((row) => [row.number, row.status])).toEqual([
			[1, "match"],
			[2, "mismatch"],
			[3, "missing"], // key không có dòng 3
			[9, "extra"], // 41-style: số ngoài đề
		]);
		expect(rows[1]).toMatchObject({
			expected: { answer: "FALSE", alts: "" },
			actual: { answer: "TRUE", alts: "" },
		});
		expect(summarizeAnswerKeyDiff(rows)).toEqual({
			match: 1,
			mismatch: 1,
			missing: 1,
			extra: 1,
		});
	});

	test("text so khớp: phân biệt chữ hoa; alts khác spacing vẫn match", () => {
		const { entries } = parseTestAnswerKey(
			"1. Car / Cars\n2. CAR\n3. bus / coach",
			[range("p1", 1, 3, "text")],
		);
		const rows = compareAnswerKey(
			entries,
			cellsFor(
				[
					{ answer: "Car", alts: " Cars " }, // match — alts normalize spacing
					{ answer: "Car", alts: "" }, // mismatch — "CAR" ≠ "Car"
					{ answer: "bus", alts: "coach" }, // match
				],
				1,
				"text",
			),
		);
		expect(rows.map((row) => row.status)).toEqual([
			"match",
			"mismatch",
			"match",
		]);
	});

	test("actual legacy chưa canonical ('true') vẫn match key 'TRUE'", () => {
		const { entries } = parseTestAnswerKey("1. TRUE", [
			range("p1", 1, 1, "tfng"),
		]);
		const rows = compareAnswerKey(entries, cellsFor([{ answer: "true" }]));
		expect(rows[0]?.status).toBe("match");
	});

	test("đề trống đáp án: mọi dòng key thành mismatch (Áp dụng sẽ ghi đủ)", () => {
		const { entries } = parseTestAnswerKey("1. TRUE\n2. FALSE", [
			range("p1", 1, 2, "tfng"),
		]);
		const rows = compareAnswerKey(
			entries,
			cellsFor([{ answer: "" }, { answer: "" }]),
		);
		expect(rows.map((row) => row.status)).toEqual(["mismatch", "mismatch"]);
	});
});

describe("normalizeAlts", () => {
	test("chuẩn hóa spacing về join ' / ' và bỏ segment trống", () => {
		expect(normalizeAlts(" Cars ")).toBe("Cars");
		expect(normalizeAlts("north/n")).toBe("north / n");
		expect(normalizeAlts("a // b")).toBe("a / b");
	});
});
