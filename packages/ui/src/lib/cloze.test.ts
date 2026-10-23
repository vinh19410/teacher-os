import type { AssignmentQuestion } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import { segmentsToItems } from "./cloze";

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
