import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import {
	buildClozeSegments,
	type ClozeBlankEntry,
	emptyTableGrid,
	parseClozeRaw,
	segmentsToItems,
	tableSegments,
} from "./cloze";

describe("segmentsToItems — apply giữ field câu (#420 Task 4.1b)", () => {
	it("merge vào item cùng vị trí, giữ explanation/answerSet/type/pin", () => {
		const existing: AssignmentQuestion[] = [
			{
				stem: "old ____",
				opts: null,
				answer: "x",
				alts: "",
				explanation: "<p>vì…</p>",
				answerSet: "q21-22",
				type: "note",
				pin: { x: 1, y: 2 },
			},
			{
				stem: "old2 ____",
				opts: null,
				answer: "y",
				alts: "",
				explanation: "<p>e2</p>",
			},
		];
		const next = segmentsToItems(
			[
				{ stem: "new ____", answer: "newA", alts: "altA" },
				{ stem: "new2 ____", answer: "newB", alts: "" },
			],
			existing,
		);
		expect(next[0]).toEqual({
			stem: "new ____",
			opts: null,
			answer: "newA",
			alts: "altA",
			explanation: "<p>vì…</p>",
			answerSet: "q21-22",
			type: "note",
			pin: { x: 1, y: 2 },
		});
		// Câu 2: stem/answer/alts thay mới, explanation giữ nguyên.
		expect(next[1]).toEqual({
			stem: "new2 ____",
			opts: null,
			answer: "newB",
			alts: "",
			explanation: "<p>e2</p>",
		});
	});

	it("segments dài hơn mảng cũ → item mới không có field optional", () => {
		const next = segmentsToItems(
			[
				{ stem: "a ____", answer: "A", alts: "" },
				{ stem: "b ____", answer: "B", alts: "" },
			],
			[
				{
					stem: "old",
					opts: null,
					answer: "x",
					alts: "",
					explanation: "<p>keep</p>",
				},
			],
		);
		expect(next[1]).toEqual({
			stem: "b ____",
			opts: null,
			answer: "B",
			alts: "",
		});
		expect("explanation" in next[1]).toBe(false);
	});

	it("existing dài hơn segments → item dư bị cắt (độ dài = segments)", () => {
		const next = segmentsToItems(
			[{ stem: "only ____", answer: "A", alts: "" }],
			[
				{ stem: "a", opts: null, answer: "x", alts: "" },
				{ stem: "b", opts: null, answer: "y", alts: "" },
			],
		);
		expect(next).toHaveLength(1);
		expect(next[0].stem).toBe("only ____");
	});

	it("không truyền existing giữ hành vi cũ (item mới thuần)", () => {
		expect(
			segmentsToItems([{ stem: "s ____", answer: " A ", alts: "x" }]),
		).toEqual([{ stem: "s ____", opts: null, answer: "A", alts: "x" }]);
	});
});

const TEXT5 = "one two three four five";

function blanks5(): ClozeBlankEntry[] {
	return ["one", "two", "three", "four", "five"].map((answer, tokenIndex) => ({
		tokenIndex,
		answer,
		alts: "",
	}));
}

/** Items gốc theo kịch bản issue #425: explanation q2/q3/q4, answerSet "s" q4/q5. */
function items5(): AssignmentQuestion[] {
	return segmentsToItems(buildClozeSegments(TEXT5, blanks5())).map(
		(item, i) => ({
			...item,
			...(i >= 1 && i <= 3 ? { explanation: `giải thích q${i + 1}` } : {}),
			...(i >= 3 ? { answerSet: "s" } : {}),
		}),
	);
}

describe("segmentsToItems answer-key merge (#425 — metadata theo nội dung, không theo index)", () => {
	it("xóa blank giữa — metadata theo nội dung, không gán chéo", () => {
		const blanks = blanks5().filter((blank) => blank.answer !== "two");
		const merged = segmentsToItems(buildClozeSegments(TEXT5, blanks), items5());
		expect(merged[1]).toMatchObject({
			answer: "three",
			explanation: "giải thích q3",
		});
		expect(merged[1].answerSet).toBeUndefined();
		expect(merged[2]).toMatchObject({
			answer: "four",
			explanation: "giải thích q4",
			answerSet: "s",
		});
		expect(merged[3]).toMatchObject({ answer: "five", answerSet: "s" });
		for (const item of merged) {
			expect(item.explanation).not.toBe("giải thích q2");
		}
	});

	it("apply lại không đổi — giữ nguyên metadata", () => {
		const segments = buildClozeSegments(TEXT5, blanks5());
		expect(segmentsToItems(segments, items5())).toEqual(items5());
	});

	it("chèn blank trước — blank mới sạch, metadata theo nội dung", () => {
		const blanks = [{ tokenIndex: 0, answer: "zero", alts: "" }, ...blanks5()];
		const merged = segmentsToItems(
			buildClozeSegments("zero one two three four five", blanks),
			items5(),
		);
		expect(merged[0]).toMatchObject({ answer: "zero" });
		expect(merged[0].explanation).toBeUndefined();
		expect(merged[0].answerSet).toBeUndefined();
		expect(merged[2]).toMatchObject({
			answer: "two",
			explanation: "giải thích q2",
		});
		expect(merged[3]).toMatchObject({
			answer: "three",
			explanation: "giải thích q3",
		});
	});

	it("trùng answer, không đổi cấu trúc — giữ metadata của từng câu", () => {
		const blanks: ClozeBlankEntry[] = [
			{ tokenIndex: 0, answer: "the", alts: "" },
			{ tokenIndex: 2, answer: "cat", alts: "" },
			{ tokenIndex: 4, answer: "the", alts: "" },
		];
		const segments = buildClozeSegments("the x cat y the", blanks);
		const saved = segmentsToItems(segments).map((item, i) => ({
			...item,
			explanation: ["the-1", "cat", "the-2"][i],
		}));
		const merged = segmentsToItems(segments, saved);
		expect(merged.map((item) => item.explanation)).toEqual([
			"the-1",
			"cat",
			"the-2",
		]);
	});

	it("trùng answer, xóa 1 phần tử nhóm — metadata không rơi ngoài nhóm", () => {
		const blanks: ClozeBlankEntry[] = [
			{ tokenIndex: 0, answer: "the", alts: "" },
			{ tokenIndex: 2, answer: "the", alts: "" },
			{ tokenIndex: 4, answer: "cat", alts: "" },
		];
		const segments = buildClozeSegments("the x the y cat", blanks);
		const saved = segmentsToItems(segments).map((item, i) => ({
			...item,
			explanation: ["the-1", "the-2", "cat"][i],
		}));
		// Xóa blank "the" đầu → run "the" mơ hồ cố hữu (answer giống nhau);
		// chỉ assert điều thuật toán đảm bảo: "cat" giữ metadata của nó,
		// "the" còn lại nhận explanation nằm trong nhóm "the".
		const merged = segmentsToItems(
			buildClozeSegments("the x the y cat", blanks.slice(1)),
			saved,
		);
		expect(merged[1]).toMatchObject({ answer: "cat", explanation: "cat" });
		expect(["the-1", "the-2"]).toContain(merged[0].explanation);
	});

	it("đổi answer, cấu trúc không đổi — giữ metadata (fallback vị trí)", () => {
		const blanks = blanks5().map((blank) =>
			blank.answer === "three" ? { ...blank, answer: "banana" } : blank,
		);
		const merged = segmentsToItems(buildClozeSegments(TEXT5, blanks), items5());
		expect(merged[2]).toMatchObject({
			answer: "banana",
			explanation: "giải thích q3",
		});
		expect(merged[1]).toMatchObject({
			answer: "two",
			explanation: "giải thích q2",
		});
	});

	it("đổi answer + xóa blank cùng lúc — metadata blank đổi answer rơi", () => {
		const blanks = blanks5()
			.filter((blank) => blank.answer !== "two")
			.map((blank) =>
				blank.answer === "three" ? { ...blank, answer: "banana" } : blank,
			);
		const merged = segmentsToItems(buildClozeSegments(TEXT5, blanks), items5());
		expect(merged[1]).toMatchObject({ answer: "banana" });
		expect(merged[1].explanation).toBeUndefined();
		expect(merged[2]).toMatchObject({
			answer: "four",
			explanation: "giải thích q4",
		});
	});

	it("xóa + chèn cùng lúc, số lượng không đổi — blank mới sạch", () => {
		// q1 có metadata để phân biệt: zero phải TRẦN (không hưởng metadata q1
		// qua fallback vị trí) — guard `consumed` của pass 2 (kongming plan-gate).
		const saved = items5().map((item, i) =>
			i === 0 ? { ...item, explanation: "giải thích q1" } : item,
		);
		const blanks = [
			{ tokenIndex: 0, answer: "zero", alts: "" },
			...blanks5().filter((blank) => blank.answer !== "two"),
		];
		const merged = segmentsToItems(
			buildClozeSegments("zero one two three four five", blanks),
			saved,
		);
		expect(merged[0]).toMatchObject({ answer: "zero" });
		expect(merged[0].explanation).toBeUndefined();
		expect(merged[0].answerSet).toBeUndefined();
		expect(merged[1]).toMatchObject({
			answer: "one",
			explanation: "giải thích q1",
		});
		expect(merged[2]).toMatchObject({
			answer: "three",
			explanation: "giải thích q3",
		});
	});

	it("tablecomp xóa ô — ô còn lại giữ metadata của nó", () => {
		const state = {
			...emptyTableGrid(2, 1),
			rowTitles: ["Row 1", "Row 2"],
			colTitles: ["Col 1"],
			blanks: [
				{ row: 0, col: 0, answer: "cat", alts: "" },
				{ row: 1, col: 0, answer: "dog", alts: "" },
			],
		};
		const saved = segmentsToItems(tableSegments(state)).map((item, i) => ({
			...item,
			explanation: i === 0 ? "mèo" : "chó",
		}));
		const merged = segmentsToItems(
			tableSegments({
				...state,
				blanks: state.blanks.slice(1),
			}),
			saved,
		);
		expect(merged[0]).toMatchObject({ answer: "dog", explanation: "chó" });
	});

	it("trùng answer ổn định ở raw mode + tablecomp", () => {
		// Raw mode: 2 blank cùng answer "the" — apply lại giữ đúng từng câu.
		const rawSegments = parseClozeRaw("The *the* and *the* here");
		const rawSaved = segmentsToItems(rawSegments).map((item, i) => ({
			...item,
			explanation: `raw-${i + 1}`,
		}));
		expect(
			segmentsToItems(rawSegments, rawSaved).map((item) => item.explanation),
		).toEqual(["raw-1", "raw-2"]);
		// Tablecomp: 2 hàng cùng answer — apply lại giữ đúng từng câu.
		const gridState = {
			...emptyTableGrid(2, 1),
			rowTitles: ["Row 1", "Row 2"],
			colTitles: ["Col 1"],
			blanks: [
				{ row: 0, col: 0, answer: "the", alts: "" },
				{ row: 1, col: 0, answer: "the", alts: "" },
			],
		};
		const gridSaved = segmentsToItems(tableSegments(gridState)).map(
			(item, i) => ({ ...item, explanation: `grid-${i + 1}` }),
		);
		expect(
			segmentsToItems(tableSegments(gridState), gridSaved).map(
				(item) => item.explanation,
			),
		).toEqual(["grid-1", "grid-2"]);
	});
});
