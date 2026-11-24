import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { describe, expect, it } from "vitest";
import {
	deduplicateGroupIntroPreamble,
	resolvePartInstruction,
} from "./quiz-instruction";

describe("quiz-instruction helper suite", () => {
	describe("resolvePartInstruction", () => {
		it("dùng matchedInstruction nếu có", () => {
			const res = resolvePartInstruction("summary", [], "fallback", {
				matchedInstruction:
					"<p>Complete the summary below. Write NO MORE THAN TWO WORDS.</p>",
			});
			expect(res).toBe(
				"Complete the summary below. Write NO MORE THAN TWO WORDS.",
			);
		});

		it("summary có Word Bank (partBank > 0) trả về hướng dẫn chọn từ danh sách", () => {
			const res = resolvePartInstruction(
				"summary",
				[],
				"Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
				{ partBank: ["word1", "word2"] },
			);
			expect(res).toBe("Complete the summary using the list of words below.");
		});

		it("flow có Word Bank trả về hướng dẫn flow-chart list of words", () => {
			const res = resolvePartInstruction(
				"flow",
				[],
				"Complete the flow-chart below. Choose ONE WORD ONLY from the passage for each answer.",
				{ partBank: ["stepA", "stepB"] },
			);
			expect(res).toBe(
				"Complete the flow-chart using the list of words below.",
			);
		});

		it("MCQ 2 options trả về A or B", () => {
			const res = resolvePartInstruction(
				"mcq",
				[{ opts: ["A", "B"] }],
				"fallback",
			);
			expect(res).toBe("Choose the correct letter A or B.");
		});

		it("MCQ 3 options trả về A, B or C", () => {
			const res = resolvePartInstruction(
				"mcq",
				[{ opts: ["A", "B", "C"] }],
				"fallback",
			);
			expect(res).toBe("Choose the correct letter A, B or C.");
		});

		it("completion type override word limit theo contextIntro", () => {
			const res = resolvePartInstruction(
				"summary",
				[],
				"Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
				{
					contextIntro: "Please choose NO MORE THAN TWO WORDS for each answer.",
				},
			);
			expect(res).toBe(
				"Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
			);
		});

		it("completion type với NO MORE THAN THREE WORDS AND/OR A NUMBER", () => {
			const res = resolvePartInstruction(
				"summary",
				[],
				"Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
				{
					contextIntro:
						"Write NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage.",
				},
			);
			expect(res).toBe(
				"Complete the summary below. Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer.",
			);
		});
	});

	describe("deduplicateGroupIntroPreamble", () => {
		it("loại bỏ block trùng lặp với instructionHtml của nhóm đã có", () => {
			const intro =
				"<p>Questions 1–2</p><p>Instruction của nhóm 1</p><p>Instruction của nhóm 2</p>";
			const parts: QuizPart[] = [
				{
					id: "p1",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "headings",
					instructionHtml: "<p>Instruction của nhóm 1</p>",
					questions: [],
					source: "group",
				},
				{
					id: "p2",
					label: "Questions 3–4",
					qStart: 3,
					typeId: "info",
					instructionHtml: "<p>Instruction của nhóm 2</p>",
					questions: [],
					source: "group",
				},
			];
			const { cleanedPreamble } = deduplicateGroupIntroPreamble(intro, parts);
			// Questions 1-2 block không bị coi là trùng nếu không khớp text, nhưng 2 block instruction đã bị bỏ
			expect(cleanedPreamble).not.toContain("Instruction của nhóm 1");
			expect(cleanedPreamble).not.toContain("Instruction của nhóm 2");
		});

		it("tiêu thụ hướng dẫn trong intro cho nhóm bị thiếu instructionHtml (Neanderthal Technology case)", () => {
			const intro =
				"<p>Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.</p>";
			const parts: QuizPart[] = [
				{
					id: "p1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "headings",
					instructionHtml: "<p>Choose the correct heading...</p>",
					questions: [],
					source: "group",
				},
				{
					id: "p2",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "info",
					instructionHtml: "<p>Match each finding...</p>",
					questions: [],
					source: "group",
				},
				{
					id: "p3",
					label: "Questions 11–13",
					qStart: 11,
					typeId: "summary",
					instructionHtml: "", // thiếu instruction
					questions: [],
					source: "group",
				},
			];
			const { cleanedPreamble, matchedInstructionsByPartId } =
				deduplicateGroupIntroPreamble(intro, parts);
			expect(cleanedPreamble).toBe("");
			expect(matchedInstructionsByPartId.get("p3")).toContain(
				"NO MORE THAN TWO WORDS",
			);
		});

		it("giữ nguyên preamble Canary (RT11)", () => {
			const intro = "<p>Questions 1–2</p><p>Preamble CANARY giữ nguyên.</p>";
			const parts: QuizPart[] = [
				{
					id: "p1",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "headings",
					instructionHtml: "<p>Instruction headings</p>",
					questions: [],
					source: "group",
				},
			];
			const { cleanedPreamble } = deduplicateGroupIntroPreamble(intro, parts);
			expect(cleanedPreamble).toContain("Preamble CANARY giữ nguyên.");
		});
	});
});
