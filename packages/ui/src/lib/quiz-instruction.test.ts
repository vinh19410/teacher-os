import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { describe, expect, it } from "vitest";
import {
	deduplicateGroupIntroPreamble,
	extractWordLimit,
	resolvePartInstruction,
	WORD_LIMIT_REGEX,
} from "./quiz-instruction";

describe("quiz-instruction helper suite", () => {
	describe("extractWordLimit & resolvePartInstruction", () => {
		it("dùng matchedInstruction nếu có và unwrap <p> đơn an toàn (kể cả </p >)", () => {
			const res = resolvePartInstruction("summary", [], "fallback", {
				matchedInstruction:
					"<p>Complete the summary below. Write NO MORE THAN TWO WORDS.</p >",
			});
			expect(res).toBe(
				"Complete the summary below. Write NO MORE THAN TWO WORDS.",
			);
		});

		it("giữ nguyên HTML khi matchedInstruction có nhiều thẻ <p> (không unwrap tham lam)", () => {
			const multiP = "<p>Line 1</p><p>Line 2</p>";
			expect(
				resolvePartInstruction("summary", [], "fallback", {
					matchedInstruction: multiP,
				}),
			).toBe(multiP);

			const spacedMultiP = "<p>Line 1</p ><p>Line 2</p>";
			expect(
				resolvePartInstruction("summary", [], "fallback", {
					matchedInstruction: spacedMultiP,
				}),
			).toBe(spacedMultiP);
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

		it("nhận diện 'Use ONE WORD for each answer.' (The History of Tea) và ghi đè fallback NO MORE THAN THREE WORDS", () => {
			const res = resolvePartInstruction(
				"sent",
				[],
				"Complete the sentences below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
				{
					contextIntro:
						"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.",
				},
			);
			expect(res).toBe(
				"Complete the sentences below. Choose ONE WORD from the passage for each answer.",
			);
		});

		it("nhận diện word limit bọc thẻ inline <strong> như dataset reading thật", () => {
			expect(
				extractWordLimit(
					"<p>Fill the blanks. Write <strong>ONE WORD</strong> for each answer.</p>",
				),
			).toBe("ONE WORD");
		});

		it("extractWordLimit không bị cắt cụt leftmost-first và hỗ trợ đầy đủ biến thể dataset reading/listening", () => {
			expect(
				extractWordLimit("Write ONE WORD AND/OR A NUMBER for each answer."),
			).toBe("ONE WORD AND/OR A NUMBER");
			expect(
				extractWordLimit("Choose ONE WORD ONLY from the passage for each."),
			).toBe("ONE WORD ONLY");
			expect(
				extractWordLimit("Choose ONE WORD from the passage for each answer."),
			).toBe("ONE WORD");
			expect(extractWordLimit("Write ONE WORD for each answer.")).toBe(
				"ONE WORD",
			);
			expect(
				extractWordLimit("Write ONE WORD OR A NUMBER for each answer."),
			).toBe("ONE WORD OR A NUMBER");
			expect(
				extractWordLimit("Write ONE WORD AND/OR NUMBERS for each answer."),
			).toBe("ONE WORD AND/OR NUMBERS");
			expect(
				extractWordLimit("Write ONE WORD AND / OR A NUMBER for each answer."),
			).toBe("ONE WORD AND/OR A NUMBER");
			expect(
				extractWordLimit("Write NO MORE THAN FOUR WORDS for each answer."),
			).toBe("NO MORE THAN FOUR WORDS");
			expect(
				extractWordLimit("Write NO MORE THAN FIVE WORDS for each answer."),
			).toBe("NO MORE THAN FIVE WORDS");
			expect(
				extractWordLimit("Write NO MORE THEN TWO WORDS for each answer."),
			).toBe("NO MORE THAN TWO WORDS");
			expect(
				extractWordLimit("Write TWO WORDS AND/OR A NUMBER for each answer."),
			).toBe("TWO WORDS AND/OR A NUMBER");
			expect(
				extractWordLimit("Listen and complete. Use ONE OR TWO WORDS only."),
			).toBe("ONE OR TWO WORDS ONLY");
			expect(
				extractWordLimit("Complete using ONLY ONE WORD OR A NUMBER."),
			).toBe("ONLY ONE WORD OR A NUMBER");
		});

		it("thay trọn cụm giới hạn trong fill_blank, shortans, diagram và form mà không sót đuôi AND/OR A NUMBER", () => {
			expect(
				resolvePartInstruction(
					"fill_blank",
					[],
					"Complete the text below. Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer.",
					{ contextIntro: "Fill the blanks. Write ONE WORD for each answer." },
				),
			).toBe(
				"Complete the text below. Choose ONE WORD from the passage for each answer.",
			);

			expect(
				resolvePartInstruction(
					"diagram",
					[],
					"Label the map or diagram below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
					{
						contextIntro:
							"Label the diagram below. Choose ONE WORD from the passage for each answer.",
					},
				),
			).toBe(
				"Label the map or diagram below. Choose ONE WORD from the passage for each answer.",
			);

			expect(
				resolvePartInstruction(
					"form",
					[],
					"Complete the form below. Write ONE WORD AND/OR A NUMBER for each answer.",
					{ contextIntro: "Write ONE WORD for each answer." },
				),
			).toBe("Complete the form below. Write ONE WORD for each answer.");
		});

		it("không false-positive với văn xuôi thông thường hoặc markup/attribute ẩn", () => {
			expect(
				extractWordLimit("There is only one word missing in paragraph 2."),
			).toBeNull();
			expect(extractWordLimit("Please change one word here.")).toBeNull();
			expect(
				extractWordLimit('<a href="https://x/write-one-word">Link</a>'),
			).toBeNull();
			expect(
				extractWordLimit("<style>use one word for each</style>"),
			).toBeNull();
			expect(
				extractWordLimit("<script>write ONE WORD ONLY</script>"),
			).toBeNull();
			expect(extractWordLimit("Use one word or more.")).toBeNull();
			expect(WORD_LIMIT_REGEX.test("Use one word or more.")).toBe(false);
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
					instructionHtml: "",
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

		it("tách sạch The History of Tea (plain-text multi-line sent + tfng) khi cả 2 part thiếu instructionHtml", () => {
			const intro = [
				"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.",
				"Do the following statements agree with the information given in Reading Passage 1?",
				"Write",
				"TRUE if the statement agrees with the information",
				"FALSE if the statement contradicts the information",
				"NOT GIVEN if there is no information on this",
			].join("\n");
			const parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–7",
					qStart: 1,
					typeId: "sent",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 8–13",
					qStart: 8,
					typeId: "tfng",
					questions: [],
				},
			];
			const { cleanedPreamble, matchedInstructionsByPartId } =
				deduplicateGroupIntroPreamble(intro, parts);
			expect(cleanedPreamble).toBe("");
			expect(matchedInstructionsByPartId.get("part-1")).toContain(
				"Use ONE WORD for each answer.",
			);
			expect(matchedInstructionsByPartId.get("part-1")).not.toContain("TRUE");
			expect(matchedInstructionsByPartId.get("part-2")).toContain(
				"Do the following statements agree",
			);
			expect(matchedInstructionsByPartId.get("part-2")).toContain(
				"NOT GIVEN if there is no information on this",
			);
			expect(matchedInstructionsByPartId.get("part-2")).not.toContain(
				"Use ONE WORD",
			);
		});

		it("xử lý sạch input hỗn hợp HTML (<table>) + plain text nhiều dòng và giữ nguyên ghi chú giáo viên tiếng Việt", () => {
			const intro = [
				"Thời gian làm bài: 20 phút.",
				"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.",
				"<table><tbody><tr><td><ul><li>Item [1]</li><li>Item [2]</li></ul></td></tr></tbody></table>",
				"Do the following statements agree with the information given in Reading Passage 1?",
				"Write",
				"TRUE if the statement agrees with the information",
				"FALSE if the statement contradicts the information",
				"NOT GIVEN if there is no information on this",
				"Chúc các em làm bài tốt.",
			].join("\n");
			const parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "sent",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 3–4",
					qStart: 3,
					typeId: "tfng",
					questions: [],
				},
			];
			const { cleanedPreamble, matchedInstructionsByPartId } =
				deduplicateGroupIntroPreamble(intro, parts);
			expect(cleanedPreamble).toContain("Thời gian làm bài: 20 phút.");
			expect(cleanedPreamble).toContain("Chúc các em làm bài tốt.");
			expect(cleanedPreamble).not.toContain("Use ONE WORD");
			expect(cleanedPreamble).not.toContain("NOT GIVEN");
			const p1 = matchedInstructionsByPartId.get("part-1") ?? "";
			expect(p1).toContain("Use ONE WORD for each answer.");
			expect(p1).toContain("<table>");
			expect(p1).not.toContain("answer.<table>");
		});

		it("gom trọn các biến thể TFNG/YNNG thật (On your answer sheet please choose/write, statement số ít, phân biệt theo nhãn)", () => {
			const intro = [
				"Do the following statements agree with the claims of the writer in Reading Passage ?",
				"On your answer sheet please choose",
				"TRUE if the statement is true",
				"FALSE if the statement is false",
				"NOT GIVEN if the information is not given in the passage.",
			].join("\n");
			const parts: QuizPart[] = [
				{
					id: "p-ynng",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "ynng",
					questions: [],
				},
				{
					id: "p-tfng",
					label: "Questions 5–8",
					qStart: 5,
					typeId: "tfng",
					questions: [],
				},
			];
			const { cleanedPreamble, matchedInstructionsByPartId } =
				deduplicateGroupIntroPreamble(intro, parts);
			expect(cleanedPreamble).toBe("");
			expect(matchedInstructionsByPartId.has("p-ynng")).toBe(false);
			expect(matchedInstructionsByPartId.get("p-tfng")).toContain(
				"On your answer sheet please choose",
			);
			expect(matchedInstructionsByPartId.get("p-tfng")).toContain("NOT GIVEN");
		});

		it("gom trọn cụm completion 2–3 dòng và inline body nhiều block (<h3> + <p> có marker), trim đuôi sau marker cuối", () => {
			const intro = [
				"<p>Complete the notes below.</p>",
				"<p>Choose NO MORE THAN TWO WORDS from the passage for each answer.</p>",
				"<p>Write your answers in boxes 1-2 on your answer sheet.</p>",
				"<h3><strong>Wildfires</strong></h3>",
				"<p>Characteristics:</p>",
				"<p>– movement: [1] and speed [2]</p>",
				"<p>Ghi chú sau bài đọc.</p>",
			].join("");
			const parts: QuizPart[] = [
				{
					id: "p-notes",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "notes",
					questions: [],
				},
				{
					id: "p-tfng",
					label: "Questions 3–4",
					qStart: 3,
					typeId: "tfng",
					questions: [],
				},
			];
			const { cleanedPreamble, matchedInstructionsByPartId } =
				deduplicateGroupIntroPreamble(intro, parts);
			const matched = matchedInstructionsByPartId.get("p-notes") ?? "";
			expect(matched).toContain("NO MORE THAN TWO WORDS");
			expect(matched).toContain("Wildfires");
			expect(matched).toContain("[1]");
			expect(matched).not.toContain("Ghi chú sau bài đọc.");
			expect(cleanedPreamble).toContain("Ghi chú sau bài đọc.");
		});

		it("không để shortans cướp hướng dẫn summary, không để word-bank summary peek word limit của shortans, và hỗ trợ missingCompletionParts.length === 1", () => {
			// 1. shortans đứng trước summary không được cướp "Questions 11–13: Complete the summary..."
			const res1 = deduplicateGroupIntroPreamble(
				"<p>Questions 11–13: Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.</p>",
				[
					{
						id: "p-short",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "shortans",
						questions: [],
					},
					{
						id: "p-sum",
						label: "Questions 11–13",
						qStart: 11,
						typeId: "summary",
						questions: [],
					},
				],
			);
			expect(res1.matchedInstructionsByPartId.has("p-short")).toBe(false);
			expect(res1.matchedInstructionsByPartId.get("p-sum")).toContain(
				"NO MORE THAN TWO WORDS",
			);

			// 2. Word-bank summary KHÔNG được peek word limit của nhóm shortans kế tiếp
			const res2 = deduplicateGroupIntroPreamble(
				[
					"Complete the summary using the list of words, A-L, below.",
					"Choose NO MORE THAN THREE WORDS AND/OR A NUMBER from the passage for each answer.",
				].join("\n"),
				[
					{
						id: "p-sum",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "summary",
						optionBank: ["a", "b"],
						questions: [],
					},
					{
						id: "p-short",
						label: "Questions 6–8",
						qStart: 6,
						typeId: "shortans",
						questions: [],
					},
				],
			);
			expect(res2.matchedInstructionsByPartId.get("p-sum")).not.toContain(
				"NO MORE THAN THREE WORDS",
			);
			expect(res2.matchedInstructionsByPartId.get("p-short")).toContain(
				"NO MORE THAN THREE WORDS",
			);

			// 3. [summary, tfng] cùng thiếu nhưng câu lệnh ghi "Complete the notes below. Choose ONE WORD ONLY..." -> gán cho summary
			const res3 = deduplicateGroupIntroPreamble(
				"Complete the notes below. Choose ONE WORD ONLY from the passage for each answer.",
				[
					{
						id: "p-sum",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "summary",
						questions: [],
					},
					{
						id: "p-tfng",
						label: "Questions 4–6",
						qStart: 4,
						typeId: "tfng",
						questions: [],
					},
				],
			);
			expect(res3.matchedInstructionsByPartId.get("p-sum")).toContain(
				"ONE WORD ONLY",
			);
		});

		it("không nuốt ghi chú tiếng Việt, không xóa nhầm block ngắn, không gán block <style> ẩn làm matchedInstruction", () => {
			const resVn = deduplicateGroupIntroPreamble(
				"Đọc đoạn văn và chọn TRUE / FALSE / NOT GIVEN.",
				[
					{
						id: "p-tfng",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "tfng",
						questions: [],
					},
					{
						id: "p-sent",
						label: "Questions 4–6",
						qStart: 4,
						typeId: "sent",
						questions: [],
					},
				],
			);
			expect(resVn.cleanedPreamble).toBe(
				"Đọc đoạn văn và chọn TRUE / FALSE / NOT GIVEN.",
			);
			expect(resVn.matchedInstructionsByPartId.size).toBe(0);

			const resShort = deduplicateGroupIntroPreamble(
				"<p>Note</p><p>Read carefully before starting.</p>",
				[
					{
						id: "p1",
						label: "Questions 1–2",
						qStart: 1,
						typeId: "notes",
						instructionHtml:
							"<p>Complete the Note completion below with ONE WORD.</p>",
						questions: [],
						source: "group",
					},
				],
			);
			expect(resShort.cleanedPreamble).toContain("Note");

			const resStyle = deduplicateGroupIntroPreamble(
				"<div><style>Complete the sentences below. Use ONE WORD for each answer.</style></div>",
				[
					{
						id: "p1",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "sent",
						questions: [],
					},
				],
			);
			expect(resStyle.matchedInstructionsByPartId.size).toBe(0);

			// Short block containing <br/> must deduplicate cleanly against own instructionHtml
			const brHtml =
				"<p>Write<br/>TRUE / FALSE</p><p>Complete the sentences below with ONE WORD.</p>";
			const resBr = deduplicateGroupIntroPreamble(brHtml, [
				{
					id: "p-br",
					label: "Questions 1–3",
					qStart: 1,
					typeId: "sent",
					instructionHtml: brHtml,
					questions: [],
					source: "group",
				},
			]);
			expect(resBr.cleanedPreamble).toBe("");

			// Unclosed HTML5 <p> before another <p> must not swallow following group instructions
			const unclosedIntro =
				"<p>Complete the sentences below. Use ONE WORD for each answer.<p>Do the following statements agree with the information given in Reading Passage 1?</p>";
			const resUnclosed = deduplicateGroupIntroPreamble(unclosedIntro, [
				{
					id: "p1",
					label: "Questions 1–7",
					qStart: 1,
					typeId: "sent",
					questions: [],
				},
				{
					id: "p2",
					label: "Questions 8–13",
					qStart: 8,
					typeId: "tfng",
					questions: [],
				},
			]);
			expect(resUnclosed.cleanedPreamble).toBe("");
			expect(resUnclosed.matchedInstructionsByPartId.get("p1")).toContain(
				"Use ONE WORD for each answer.",
			);
			expect(resUnclosed.matchedInstructionsByPartId.get("p1")).not.toContain(
				"Do the following statements",
			);
			expect(resUnclosed.matchedInstructionsByPartId.get("p2")).toContain(
				"Do the following statements agree",
			);
		});
	});
});
