import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { describe, expect, it } from "vitest";
import {
	deduplicateGroupIntroPreamble,
	extractExpectedBankCount,
	extractWordLimit,
	isEffectivelyEmptyInstruction,
	isPositionalSectionBank,
	resolvePartInstruction,
	scopeFlattenedOptionBank,
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

		it("chặn hidden-markup spoofing (dấu > trong attribute, HTML comment, unclosed style/script, svg/textarea/iframe)", () => {
			const spoofedAttr =
				'<p title="x > Choose the correct heading, i-vi"></p>';
			expect(isEffectivelyEmptyInstruction(spoofedAttr)).toBe(true);
			expect(extractExpectedBankCount("headings", spoofedAttr)).toBeNull();

			const spoofedHref =
				'<a href="https://example.com/?x=>Match each finding A-E">Lưu ý thi</a>';
			expect(extractExpectedBankCount("info", spoofedHref)).toBeNull();
			const resHref = deduplicateGroupIntroPreamble(spoofedHref, [
				{
					id: "p1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "info",
					questions: [],
				},
			]);
			expect(resHref.matchedInstructionsByPartId.size).toBe(0);
			expect(resHref.cleanedPreamble).toContain("Lưu ý thi");

			for (const hidden of [
				"<!-- > Choose the correct heading i-vi -->",
				'<style data-x=">">Choose the correct number, i-vi</style>',
				"<style>Choose the correct number, i-vi",
				"<script>Match each finding A-E",
				"<svg><title>Choose the correct number, i-vi</title></svg>",
				"<textarea>Match each finding A-E</textarea>",
				"<iframe>Match each finding A-E</iframe>",
			]) {
				expect(isEffectivelyEmptyInstruction(hidden)).toBe(true);
				expect(extractExpectedBankCount("headings", hidden)).toBeNull();
				expect(extractExpectedBankCount("info", hidden)).toBeNull();
			}
		});

		it("tách sạch Neanderthal Technology (headings + info + summary + mcq), cả bản plain text lẫn có body_html", () => {
			const introPlain = [
				"Reading Passage 3 has five sections. Choose the correct heading for each section from the list of headings below.",
				"Choose the correct number, i-vi, in boxes 27-31.",
				"Look at the following findings and the list of places below. Match each finding with the correct place A-E.",
				"NB: You may use any letter more than once.",
				"Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.",
				"Choose the correct answer, A, B, C or D.",
			].join("\n");
			const parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "headings",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "info",
					questions: [],
				},
				{
					id: "part-3",
					label: "Questions 11–13",
					qStart: 11,
					typeId: "summary",
					questions: [],
				},
				{
					id: "part-4",
					label: "Questions 14",
					qStart: 14,
					typeId: "mcq",
					questions: [],
				},
			];
			const res = deduplicateGroupIntroPreamble(introPlain, parts);
			expect(res.cleanedPreamble).toBe("");
			expect(res.matchedInstructionsByPartId.get("part-1")).toContain("i-vi");
			expect(res.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"places",
			);
			expect(res.matchedInstructionsByPartId.get("part-2")).toContain(
				"correct place A-E",
			);
			expect(res.matchedInstructionsByPartId.get("part-2")).toContain(
				"more than once",
			);
			expect(res.matchedInstructionsByPartId.get("part-3")).toContain(
				"NO MORE THAN TWO WORDS",
			);
			expect(res.matchedInstructionsByPartId.get("part-4")).toContain(
				"A, B, C or D",
			);

			const introWithBody = [
				"<p>Reading Passage 3 has five sections. Choose the correct heading for each section from the list of headings below.</p>",
				"<p>Choose the correct number, i-vi, in boxes 27-31.</p>",
				"<p>Look at the following findings and the list of places below. Match each finding with the correct place A-E.</p>",
				"<p>NB: You may use any letter more than once.</p>",
				"<p>32. a burnt piece of wood → [32]</p>",
				"<p>33. evidence of efforts to prevent pools of water forming → [33]</p>",
				"<p>Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.</p>",
				"<table><tbody><tr><td><ul><li>Conditions were [37] and lasted a [38] time.</li></ul></td></tr></tbody></table>",
				"<p>Choose the correct answer, A, B, C or D.</p>",
			].join("");
			const resBody = deduplicateGroupIntroPreamble(introWithBody, parts);
			expect(resBody.cleanedPreamble).toBe("");
			expect(resBody.matchedInstructionsByPartId.get("part-2")).toContain(
				"[32]",
			);
			expect(resBody.matchedInstructionsByPartId.get("part-2")).toContain(
				"[33]",
			);
			expect(resBody.matchedInstructionsByPartId.get("part-3")).toContain(
				"<table>",
			);
		});

		it("tách sạch Bovids (mcq + info + fill_blank gồm 'Answer the questions below.')", () => {
			const bovidsIntro = [
				"Choose the correct letter, A, B, C or D.",
				"Look at the following characteristics and the list of sub-families below.",
				"Match each characteristic with the correct sub-family, A, B, C or D.",
				"NB You may use any letter more than once",
				"Answer the questions below.",
				"Choose NO MORE THAN THREE WORDS from the passage for each answer.",
				"Write your answers in boxes 9-13 on your answer sheet.",
			].join("\n");
			const parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–3",
					qStart: 1,
					typeId: "mcq",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 4–8",
					qStart: 4,
					typeId: "info",
					questions: [],
				},
				{
					id: "part-3",
					label: "Questions 9–13",
					qStart: 9,
					typeId: "fill_blank",
					questions: [],
				},
			];
			const res = deduplicateGroupIntroPreamble(bovidsIntro, parts);
			expect(res.cleanedPreamble).toBe("");
			expect(res.matchedInstructionsByPartId.get("part-1")).toContain(
				"A, B, C or D",
			);
			expect(res.matchedInstructionsByPartId.get("part-2")).toContain(
				"sub-family, A, B, C or D",
			);
			expect(res.matchedInstructionsByPartId.get("part-2")).toContain(
				"more than once",
			);
			expect(res.matchedInstructionsByPartId.get("part-3")).toContain(
				"Answer the questions below.",
			);
			expect(res.matchedInstructionsByPartId.get("part-3")).toContain(
				"NO MORE THAN THREE WORDS",
			);
			expect(res.matchedInstructionsByPartId.get("part-3")).toContain(
				"boxes 9-13",
			);
		});

		it("xử lý chuẩn các ca xung đột multi-matching, sentend, mcq_many Listening, map/diagram và bảo vệ headings khỏi scanInlineSiblingEndIdx", () => {
			// 1. 2 nhóm info (Actual-Test-return-of-monkey-life)
			const twoInfoIntro = [
				"Which paragraph contains the following information? Write the correct letter, A–G, in boxes 14–17.",
				"NB You may use any letter more than once.",
				"Complete the summary below. Choose ONE WORD ONLY from the passage for each answer.",
				"Look at the following features (Questions 22–26) and the list of locations below. Match each feature with the correct location, A, B or C.",
			].join("\n");
			const resTwoInfo = deduplicateGroupIntroPreamble(twoInfoIntro, [
				{
					id: "p1",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "info",
					questions: [],
				},
				{
					id: "p2",
					label: "Questions 5–8",
					qStart: 5,
					typeId: "summary",
					questions: [],
				},
				{
					id: "p3",
					label: "Questions 9–13",
					qStart: 9,
					typeId: "info",
					questions: [],
				},
			]);
			expect(resTwoInfo.cleanedPreamble).toBe("");
			expect(resTwoInfo.matchedInstructionsByPartId.get("p1")).toContain("A–G");
			expect(resTwoInfo.matchedInstructionsByPartId.get("p3")).toContain(
				"A, B or C",
			);

			// 2. info(pos) + features(non-person: list of theories): features được ưu tiên nhận named-matching trước info
			const theoriesIntro = [
				"Look at the following statements and the list of theories below.",
				"Match each statement with the correct theory, A-C.",
			].join("\n");
			const resTheories = deduplicateGroupIntroPreamble(theoriesIntro, [
				{
					id: "p-info",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "info",
					questions: [],
				},
				{
					id: "p-feat",
					label: "Questions 5–8",
					qStart: 5,
					typeId: "features",
					questions: [],
				},
			]);
			expect(resTheories.matchedInstructionsByPartId.has("p-info")).toBe(false);
			expect(resTheories.matchedInstructionsByPartId.get("p-feat")).toContain(
				"correct theory, A-C",
			);

			// 3. sent KHÔNG cướp sentend (cả Collection-diabetes "Complete the following sentences with the best endings...")
			const sentEndIntro = [
				"Complete the following sentences with the best endings from the box below.",
				"Complete the sentences below. Write NO MORE THAN TWO WORDS from the passage for each answer.",
			].join("\n");
			const resSentEnd = deduplicateGroupIntroPreamble(sentEndIntro, [
				{
					id: "p-sent",
					label: "Questions 1–3",
					qStart: 1,
					typeId: "sent",
					questions: [],
				},
				{
					id: "p-sentend",
					label: "Questions 4–7",
					qStart: 4,
					typeId: "sentend",
					questions: [],
				},
			]);
			expect(resSentEnd.cleanedPreamble).toBe("");
			expect(resSentEnd.matchedInstructionsByPartId.get("p-sentend")).toContain(
				"best endings",
			);
			expect(resSentEnd.matchedInstructionsByPartId.get("p-sent")).toContain(
				"NO MORE THAN TWO WORDS",
			);

			// 4. "Match each ending with the correct researcher" (smell-and-memory) KHÔNG bị sentend cướp
			const smellRes = deduplicateGroupIntroPreamble(
				"Match each ending with the correct researcher, A-E.",
				[
					{
						id: "p-sentend",
						label: "Questions 1–4",
						qStart: 1,
						typeId: "sentend",
						questions: [],
					},
					{
						id: "p-names",
						label: "Questions 5–8",
						qStart: 5,
						typeId: "match_names",
						questions: [],
					},
				],
			);
			expect(smellRes.matchedInstructionsByPartId.has("p-sentend")).toBe(false);
			expect(smellRes.matchedInstructionsByPartId.get("p-names")).toContain(
				"researcher, A-E",
			);

			// 5. Listening: mcq_many khớp "Choose TWO correct answers." và KHÔNG cướp "Choose SIX answers from the box..." của matching
			const listenIntro = [
				"What advantage does the speaker mention for each of the following physical activities?",
				"Choose SIX answers from the box and write the correct letter, A-G, next to Questions 11-16.",
				"Choose TWO correct answers.",
				"Which TWO things do the students agree about?",
			].join("\n");
			const resListen = deduplicateGroupIntroPreamble(listenIntro, [
				{
					id: "p-match",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "matching",
					questions: [],
				},
				{
					id: "p-mcqm",
					label: "Questions 7–8",
					qStart: 7,
					typeId: "mcq_many",
					questions: [],
				},
			]);
			expect(resListen.cleanedPreamble).toBe("");
			expect(resListen.matchedInstructionsByPartId.get("p-match")).toContain(
				"Choose SIX answers from the box",
			);
			expect(resListen.matchedInstructionsByPartId.get("p-mcqm")).toContain(
				"Choose TWO correct answers.",
			);
			expect(resListen.matchedInstructionsByPartId.get("p-mcqm")).not.toContain(
				"SIX answers",
			);

			// 6. mcq KHÔNG cướp "Choose the correct letter, A-H, in boxes 14-20"
			const mcqGuardRes = deduplicateGroupIntroPreamble(
				"Choose the correct letter, A-H, in boxes 14-20.",
				[
					{
						id: "p-mcq",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "mcq",
						questions: [],
					},
					{
						id: "p-info",
						label: "Questions 4–8",
						qStart: 4,
						typeId: "info",
						questions: [],
					},
				],
			);
			expect(mcqGuardRes.matchedInstructionsByPartId.has("p-mcq")).toBe(false);

			// 7. map khớp "Label the plan below." nhưng KHÔNG cướp diagram có word limit
			const mapDiagramRes = deduplicateGroupIntroPreamble(
				[
					"Label the map or diagram below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
					"Label the plan below. Write the correct letter, A-H, next to questions 15-20.",
				].join("\n"),
				[
					{
						id: "p-map",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "map",
						questions: [],
					},
					{
						id: "p-diag",
						label: "Questions 6–9",
						qStart: 6,
						typeId: "diagram",
						questions: [],
					},
				],
			);
			expect(mapDiagramRes.matchedInstructionsByPartId.get("p-diag")).toContain(
				"NO MORE THAN TWO WORDS",
			);
			expect(mapDiagramRes.matchedInstructionsByPartId.get("p-map")).toContain(
				"Label the plan below.",
			);

			// 8. headings peek "One of the headings has been done..." + Example + Paragraph H, nhưng KHÔNG nuốt ghi chú/body_html nhóm sau
			const headingsGuardIntro = [
				"<p>Choose the most suitable heading for each paragraph from the List of headings below.</p>",
				"<p>One of the headings has been done for you as an example.</p>",
				"<p>Example</p>",
				"<p>Paragraph H: Answer x</p>",
				"<p>Preamble CANARY — đọc kỹ.</p>",
				"<p>Dinosaurs differed from lizards, because [11] and [12].</p>",
			].join("");
			const resHead = deduplicateGroupIntroPreamble(headingsGuardIntro, [
				{
					id: "p-head",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "headings",
					questions: [],
				},
				{
					id: "p-info",
					label: "Questions 6–9",
					qStart: 6,
					typeId: "info",
					questions: [],
				},
			]);
			expect(resHead.matchedInstructionsByPartId.get("p-head")).toContain(
				"One of the headings has been done",
			);
			expect(resHead.matchedInstructionsByPartId.get("p-head")).toContain(
				"Paragraph H",
			);
			expect(resHead.matchedInstructionsByPartId.get("p-head")).not.toContain(
				"Preamble CANARY",
			);
			expect(resHead.matchedInstructionsByPartId.get("p-head")).not.toContain(
				"[11]",
			);
			expect(resHead.cleanedPreamble).toContain("Preamble CANARY");
		});
	});

	describe("isPositionalSectionBank & dynamic matching resolvePartInstruction", () => {
		it("isPositionalSectionBank phân biệt chính xác nhãn đoạn văn vs danh sách có tên", () => {
			expect(isPositionalSectionBank(["A", "B", "C", "D", "E", "F"])).toBe(
				true,
			);
			expect(
				isPositionalSectionBank(["Paragraph A", "Paragraph B", "Paragraph C"]),
			).toBe(true);
			expect(isPositionalSectionBank(["Section A", "Section B"])).toBe(true);
			expect(
				isPositionalSectionBank([
					"Antelope",
					"Bovinae",
					"Caprinae",
					"Cephalophinae",
				]),
			).toBe(false);
			expect(isPositionalSectionBank(["The Périgord region", "Moldova"])).toBe(
				false,
			);
			expect(isPositionalSectionBank([])).toBe(false);
		});

		it("resolvePartInstruction điều chỉnh động headings, info (positional vs named), sentend/map/match2/match và trả fallback trung tính khi isBankScoped=false", () => {
			const headingsFallback =
				"Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–viii.";
			expect(
				resolvePartInstruction("headings", [], headingsFallback, {
					partBank: ["H1", "H2", "H3", "H4", "H5", "H6"],
				}),
			).toBe(
				"Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–vi.",
			);
			expect(
				resolvePartInstruction("headings", [], headingsFallback, {
					partBank: Array.from({ length: 12 }, (_, i) => `H${i + 1}`),
				}),
			).toBe(
				"Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–xii.",
			);
			const unscopedHeadings = resolvePartInstruction(
				"headings",
				[],
				headingsFallback,
				{
					partBank: Array.from({ length: 11 }, (_, i) => `H${i + 1}`),
					isBankScoped: false,
				},
			);
			expect(unscopedHeadings).not.toContain("i–viii");
			expect(unscopedHeadings).not.toContain("i–xi");

			const infoFallback =
				"Which section contains the following information? Write the correct letter A–H.";
			// Bovids named sub-families (A–D)
			const bovidsInfo = resolvePartInstruction("info", [], infoFallback, {
				partBank: ["Antelope", "Bovinae", "Caprinae", "Cephalophinae"],
			});
			expect(bovidsInfo).toBe(
				"Match each item with the correct option from the list below. Write the correct letter A–D.",
			);
			expect(bovidsInfo).not.toContain("Which section");
			expect(bovidsInfo).not.toContain("A–H");

			// Neanderthal named places (A–E)
			expect(
				resolvePartInstruction("info", [], infoFallback, {
					partBank: [
						"The Périgord region",
						"Moldova",
						"The Grotte du Lazaret",
						"The cave of Baume-Bonne",
						"Krapina",
					],
				}),
			).toBe(
				"Match each item with the correct option from the list below. Write the correct letter A–E.",
			);

			// Positional sections (A–F và Paragraph A–F)
			expect(
				resolvePartInstruction("info", [], infoFallback, {
					partBank: ["A", "B", "C", "D", "E", "F"],
				}),
			).toBe(
				"Which section contains the following information? Write the correct letter A–F.",
			);
			expect(
				resolvePartInstruction("info", [], infoFallback, {
					partBank: [
						"Paragraph A",
						"Paragraph B",
						"Paragraph C",
						"Paragraph D",
						"Paragraph E",
						"Paragraph F",
					],
				}),
			).toBe(
				"Which section contains the following information? Write the correct letter A–F.",
			);

			// Unscoped info fallback
			const unscopedInfo = resolvePartInstruction("info", [], infoFallback, {
				partBank: Array.from({ length: 11 }, (_, i) => `Item ${i + 1}`),
				isBankScoped: false,
			});
			expect(unscopedInfo).not.toContain("A–H");
			expect(unscopedInfo).not.toContain("A–K");
			expect(unscopedInfo).not.toContain("Which section");

			// sentend / map / match2 / match
			const fiveItems = ["One", "Two", "Three", "Four", "Five"];
			expect(
				resolvePartInstruction(
					"sentend",
					[],
					"Complete each sentence with the correct ending A–H.",
					{ partBank: fiveItems },
				),
			).toBe("Complete each sentence with the correct ending A–E.");
			expect(
				resolvePartInstruction(
					"map",
					[],
					"Label the map below. Write the correct letter A–H for each location.",
					{ partBank: fiveItems },
				),
			).toBe(
				"Label the map below. Write the correct letter A–E for each location.",
			);
			expect(
				resolvePartInstruction(
					"match2",
					[],
					"Choose your answers from the option bank A–H.",
					{ partBank: fiveItems },
				),
			).toBe("Choose your answers from the option bank A–E.");
			expect(
				resolvePartInstruction(
					"match",
					[],
					"Choose your answers from the option bank A–H.",
					{ partBank: fiveItems, isBankScoped: false },
				),
			).not.toContain("A–H");
		});
	});

	describe("extractExpectedBankCount & scopeFlattenedOptionBank", () => {
		it("extractExpectedBankCount trích đúng dải La Mã / chữ cái và từ chối dải xung đột hoặc số đoạn của headings", () => {
			expect(
				extractExpectedBankCount(
					"headings",
					"Reading Passage 3 has five sections. Choose the correct heading for each section from the list of headings below.\nChoose the correct number, i-vi, in boxes 27-31.",
				),
			).toBe(6);
			expect(
				extractExpectedBankCount(
					"headings",
					"Reading passage has six paragraphs, A-F. Choose the correct heading for each paragraph from the list of headings below.",
				),
			).toBeNull();
			expect(
				extractExpectedBankCount(
					"info",
					"Look at the following findings and the list of places below. Match each finding with the correct place A-E.",
				),
			).toBe(5);
			expect(
				extractExpectedBankCount(
					"info",
					"Match each characteristic with the correct sub-family, A, B, C or D.",
				),
			).toBe(4);
			expect(extractExpectedBankCount("info", "Choose from A, B or C.")).toBe(
				3,
			);
			// Xung đột hai dải lựa chọn khác nhau → fail-closed
			expect(
				extractExpectedBankCount("info", "Choose A-E or write A-G."),
			).toBeNull();
			// Có câu dẫn số đoạn A-G khác dải lựa chọn A-C → loại câu dẫn đoạn văn, giữ A-C
			expect(
				extractExpectedBankCount(
					"features",
					"Reading Passage 2 has seven paragraphs, A-G. Match each statement with the correct person, A-C.",
				),
			).toBe(3);
		});

		it("scopeFlattenedOptionBank tách chuẩn Neanderthal Technology (6+5=11), Bovids (1 bankable), và headings + word-bank summary (7+7=14)", () => {
			const neanderthalBank = [
				"Evidence of outdoor dwellings",
				"Learning to make fire",
				"A perfect place to live",
				"Examining the cave contents",
				"Contrasting two types of home",
				"A vital source of power",
				"The Périgord region",
				"Moldova",
				"The Grotte du Lazaret",
				"The cave of Baume-Bonne",
				"Krapina",
			];
			const neanderthalParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "headings",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "info",
					questions: [],
				},
				{
					id: "part-3",
					label: "Questions 11–13",
					qStart: 11,
					typeId: "summary",
					questions: [],
				},
				{
					id: "part-4",
					label: "Questions 14",
					qStart: 14,
					typeId: "mcq",
					questions: [],
				},
			];
			const matched = new Map<string, string>([
				[
					"part-1",
					"Reading Passage 3 has five sections. Choose the correct heading...\nChoose the correct number, i-vi, in boxes 27-31.",
				],
				[
					"part-2",
					"Look at the following findings and the list of places below. Match each finding with the correct place A-E.",
				],
				[
					"part-3",
					"Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.",
				],
				["part-4", "Choose the correct answer, A, B, C or D."],
			]);
			const resNeand = scopeFlattenedOptionBank(
				neanderthalParts,
				neanderthalBank,
				matched,
				{ skill: "reading", introPreamble: "" },
			);
			expect(resNeand.isBankScoped).toBe(true);
			expect(resNeand.partitioned?.get("part-1")).toEqual(
				neanderthalBank.slice(0, 6),
			);
			expect(resNeand.partitioned?.get("part-2")).toEqual(
				neanderthalBank.slice(6, 11),
			);
			expect(resNeand.partitioned?.get("part-3")).toEqual([]);
			expect(resNeand.partitioned?.get("part-4")).toEqual([]);

			// Bovids: 1 bankable part + mcq + fill_blank
			const bovidsBank = ["Antelope", "Bovinae", "Caprinae", "Cephalophinae"];
			const resBovids = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "mcq",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 4–8",
						qStart: 4,
						typeId: "info",
						questions: [],
					},
					{
						id: "p3",
						label: "Questions 9–13",
						qStart: 9,
						typeId: "fill_blank",
						questions: [],
					},
				],
				bovidsBank,
				new Map([
					["p1", "Choose the correct letter, A, B, C or D."],
					[
						"p2",
						"Match each characteristic with the correct sub-family, A, B, C or D.",
					],
					[
						"p3",
						"Answer the questions below.\nChoose NO MORE THAN THREE WORDS from the passage for each answer.",
					],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(resBovids.isBankScoped).toBe(true);
			expect(resBovids.partitioned?.get("p1")).toEqual([]);
			expect(resBovids.partitioned?.get("p2")).toEqual(bovidsBank);
			expect(resBovids.partitioned?.get("p3")).toEqual([]);

			// Headings (7) + word-bank summary (7) = 14
			const bank14 = Array.from({ length: 14 }, (_, i) => `Opt ${i + 1}`);
			const resWb = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 6–10",
						qStart: 6,
						typeId: "summary",
						questions: [],
					},
				],
				bank14,
				new Map([
					["p1", "Choose the correct heading, i-vii."],
					["p2", "Complete the summary using the list of words, A-G, below."],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(resWb.isBankScoped).toBe(true);
			expect(resWb.partitioned?.get("p1")).toHaveLength(7);
			expect(resWb.partitioned?.get("p2")).toHaveLength(7);

			// Single-bank matching với PASSAGE_STRUCTURE còn sót trong introPreamble vẫn isBankScoped = true
			const resPassagePreamble = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–3",
						qStart: 1,
						typeId: "tfng",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 4–8",
						qStart: 4,
						typeId: "info",
						questions: [],
					},
				],
				["A", "B", "C", "D", "E", "F", "G", "H"],
				new Map([
					["p1", "Do the following statements agree..."],
					["p2", "Which paragraph contains the following information? A-H."],
				]),
				{
					skill: "reading",
					introPreamble: "Reading Passage 1 has eight paragraphs, A-H.",
				},
			);
			expect(resPassagePreamble.isBankScoped).toBe(true);
			expect(resPassagePreamble.partitioned?.get("p2")).toHaveLength(8);
		});

		it("scopeFlattenedOptionBank fail-closed nghiêm ngặt trên mọi ca trộn không tách được (info+info prefix/suffix, summary word-bank, quá cap 20, flowchart, source:intro trộn)", () => {
			// 1. Collapsed info+info với tiền tố positional (Collection-why-don-t-we-sleep: A..I + 5 names)
			const sleepRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–10",
						qStart: 1,
						typeId: "info",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 11–13",
						qStart: 11,
						typeId: "tfng",
						questions: [],
					},
				],
				[
					"A",
					"B",
					"C",
					"D",
					"E",
					"F",
					"G",
					"H",
					"I",
					"Giulio Tononi",
					"Chiara Cirelli",
					"Paul Shaw",
					"Robert Stickgold",
					"John Winkelman",
				],
				new Map([
					["p1", "Which paragraph contains the following information?"],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(sleepRes).toEqual({ partitioned: null, isBankScoped: false });

			// 2. Collapsed info+info với HẬU TỐ positional (Forecast-Quy-2-2025-world-ecotourism: 5 places + A..G)
			const ecoRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–9",
						qStart: 1,
						typeId: "info",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 10–13",
						qStart: 10,
						typeId: "tfng",
						questions: [],
					},
				],
				[
					"Cuba",
					"Costa Rica",
					"Dominica",
					"Ecuador",
					"Belize",
					"A",
					"B",
					"C",
					"D",
					"E",
					"F",
					"G",
				],
				new Map([["p1", "Match each statement with the correct country."]]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(ecoRes).toEqual({ partitioned: null, isBankScoped: false });

			// 3. Collection-satellite-technology: headings i-ix (9) + summary không khớp directive (6) = 15
			const satRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 6–9",
						qStart: 6,
						typeId: "summary",
						questions: [],
					},
				],
				Array.from({ length: 15 }, (_, i) => `Opt ${i + 1}`),
				new Map([
					["p1", "Choose the correct heading, i-ix."],
					[
						"p2",
						"Match the following reasons for each question according to the information given in the passage.",
					],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(satRes).toEqual({ partitioned: null, isBankScoped: false });

			// 4. Collection-improving-patient-safety: match_names (4) + summary ("Complete the summary below.", không word-limit/from the passage) = 11
			const safetyRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–4",
						qStart: 1,
						typeId: "match_names",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 5–10",
						qStart: 5,
						typeId: "summary",
						questions: [],
					},
				],
				Array.from({ length: 11 }, (_, i) => `Opt ${i + 1}`),
				new Map([
					["p1", "Look at the list of people below."],
					["p2", "Complete the summary below."],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(safetyRes).toEqual({ partitioned: null, isBankScoped: false });

			// 5. Other-sources-delivering-the-goods: info (9) + summary (instruction rỗng) = 20
			const goodsRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "info",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 6–9",
						qStart: 6,
						typeId: "tfng",
						questions: [],
					},
					{
						id: "p3",
						label: "Questions 10–13",
						qStart: 10,
						typeId: "summary",
						questions: [],
					},
				],
				[
					"A",
					"B",
					"C",
					"D",
					"E",
					"F",
					"G",
					"H",
					"I",
					...Array.from({ length: 11 }, (_, i) => `Word ${i + 1}`),
				],
				new Map([
					["p1", "Which paragraph contains the following information? A-I."],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(goodsRes).toEqual({ partitioned: null, isBankScoped: false });

			// 6. Collection-book-review ("with ONE WORD chosen from the box below"): vẫn tính là word-bank summary -> fail-closed vì thiếu range
			const slownessRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–6",
						qStart: 1,
						typeId: "info",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 7–13",
						qStart: 7,
						typeId: "summary",
						questions: [],
					},
				],
				Array.from({ length: 19 }, (_, i) => `Item ${i + 1}`),
				new Map([
					["p1", "Which paragraph contains the following information?"],
					[
						"p2",
						"Complete the summary paragraph described below. Write the correct answer with ONE WORD chosen from the box below.",
					],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(slownessRes).toEqual({ partitioned: null, isBankScoped: false });

			// 7. Quá cap 20 (Actual-Test-what-is-a-dinosaur: 13 + 8 = 21 != 20)
			const dinoRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–7",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 8–11",
						qStart: 8,
						typeId: "info",
						questions: [],
					},
				],
				Array.from({ length: 20 }, (_, i) => `Opt ${i + 1}`),
				new Map([
					["p1", "Choose the correct heading, i-xiii."],
					["p2", "Match with A-H."],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(dinoRes).toEqual({ partitioned: null, isBankScoped: false });

			// 8. Thiếu range trên 1 nhóm (Actual-Test-griffith-and-american-films)
			const griffithRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–6",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 7–10",
						qStart: 7,
						typeId: "match_names",
						questions: [],
					},
				],
				Array.from({ length: 11 }, (_, i) => `Opt ${i + 1}`),
				new Map([
					[
						"p1",
						"Reading passage has six paragraphs, A-F. Choose the correct heading for each paragraph from the list of headings below.",
					],
					["p2", "Match the companies with opinions, A-D."],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(griffithRes).toEqual({ partitioned: null, isBankScoped: false });

			// 9. flowchart trên reading không nằm trong optional bank contract -> không tách ẩn showDetailBank
			const flowchartRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "p2",
						label: "Questions 6–9",
						qStart: 6,
						typeId: "flowchart",
						questions: [],
					},
				],
				Array.from({ length: 11 }, (_, i) => `Opt ${i + 1}`),
				new Map([
					["p1", "Choose the correct heading, i-vi."],
					[
						"p2",
						"Complete the flow-chart using the list of words, A-E, below.",
					],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(flowchartRes).toEqual({ partitioned: null, isBankScoped: false });

			// 10. source: "intro" trộn 2 required-bank type trong cùng 1 part -> fail-closed
			const mixedIntroPartRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–6",
						qStart: 1,
						typeId: "headings",
						source: "intro",
						instructionHtml: "<p>Choose i-vi.</p>",
						questions: [
							{
								q: 0,
								number: 1,
								stem: "Q1",
								opts: null,
								pin: null,
								type: "headings",
							},
							{
								q: 1,
								number: 2,
								stem: "Q2",
								opts: null,
								pin: null,
								type: "info",
							},
						],
					},
					{
						id: "p2",
						label: "Questions 7–9",
						qStart: 7,
						typeId: "mcq",
						questions: [],
					},
				],
				Array.from({ length: 6 }, (_, i) => `Opt ${i + 1}`),
				new Map(),
				{ skill: "reading", introPreamble: "" },
			);
			expect(mixedIntroPartRes).toEqual({
				partitioned: null,
				isBankScoped: false,
			});

			// 11. parts.length === 1 (map pin test): giữ partitioned = null, isBankScoped = true
			const singlePartRes = scopeFlattenedOptionBank(
				[
					{
						id: "p1",
						label: "Questions 1–2",
						qStart: 1,
						typeId: "tfng",
						questions: [],
					},
				],
				["Entrance", "Cafe", "Gate", "Desk"],
				new Map(),
				{ skill: "listening", introPreamble: "" },
			);
			expect(singlePartRes).toEqual({ partitioned: null, isBankScoped: true });
		});

		it("không nuốt cụm matching kế tiếp bắt đầu bằng 'Match each...' (C18T1 & Collection-images-and-places) và tách sạch bank", () => {
			// 1. C18T1 (info A-G + features A, B or C kèm body_html [19] + sent)
			const c18Parts: QuizPart[] = [
				{
					id: "c18-info",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "info",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Info ${i + 1}`,
						opts: null,
						pin: null,
						type: "info",
					})),
				},
				{
					id: "c18-feat",
					label: "Questions 6–8",
					qStart: 6,
					typeId: "features",
					questions: Array.from({ length: 3 }, (_, i) => ({
						q: 5 + i,
						number: 6 + i,
						stem: `Feature ${i + 6}`,
						opts: null,
						pin: null,
						type: "features",
					})),
				},
				{
					id: "c18-sent",
					label: "Questions 9–13",
					qStart: 9,
					typeId: "sent",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: 8 + i,
						number: 9 + i,
						stem: `Sentence ${i + 9} ____`,
						opts: null,
						pin: null,
						type: "sent",
					})),
				},
			];
			const c18Intro = [
				"<p>Reading Passage 2 has seven paragraphs, A-G. Which paragraph contains the following information?</p>",
				"<p>Write the correct letter, A-G, in boxes 14-18 on your answer sheet.</p>",
				"<p>NB You may use any letter more than once.</p>",
				"<p>Match each purpose with the correct timber cut, A, B or C.</p>",
				"<p>Write the correct letter, A, B or C, in boxes 19-21 on your answer sheet.</p>",
				"<p>NB You may use any letter more than once.</p>",
				"<p>6. Purpose one [6]</p><p>7. Purpose two [7]</p><p>8. Purpose three [8]</p>",
				"<p>Choose ONE WORD ONLY from the passage for each answer. Write your answers in boxes 22-26 on your answer sheet.</p>",
			].join("\n");
			const c18Dedup = deduplicateGroupIntroPreamble(c18Intro, c18Parts);
			expect(c18Dedup.cleanedPreamble).toBe("");
			expect(c18Dedup.matchedInstructionsByPartId.get("c18-info")).toContain(
				"Which paragraph contains the following information",
			);
			expect(
				c18Dedup.matchedInstructionsByPartId.get("c18-info"),
			).not.toContain("timber cut");
			expect(c18Dedup.matchedInstructionsByPartId.get("c18-feat")).toContain(
				"Match each purpose with the correct timber cut, A, B or C.",
			);
			expect(c18Dedup.matchedInstructionsByPartId.get("c18-feat")).toContain(
				"[6]",
			);
			expect(c18Dedup.matchedInstructionsByPartId.get("c18-sent")).toContain(
				"ONE WORD ONLY",
			);

			const c18Bank = [
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"G",
				"a shelterwood cut",
				"a salvage cut",
				"a thinning cut",
			];
			const c18Scoped = scopeFlattenedOptionBank(
				c18Parts,
				c18Bank,
				c18Dedup.matchedInstructionsByPartId,
				{ skill: "reading", introPreamble: c18Dedup.cleanedPreamble },
			);
			expect(c18Scoped.isBankScoped).toBe(true);
			expect(c18Scoped.partitioned?.get("c18-info")).toEqual([
				"A",
				"B",
				"C",
				"D",
				"E",
				"F",
				"G",
			]);
			expect(c18Scoped.partitioned?.get("c18-feat")).toEqual([
				"a shelterwood cut",
				"a salvage cut",
				"a thinning cut",
			]);
			expect(c18Scoped.partitioned?.get("c18-sent")).toEqual([]);

			// 2. Collection-images-and-places (headings i-viii + match_names A-G + mcq)
			const imgParts: QuizPart[] = [
				{
					id: "img-head",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "headings",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Section ${i + 1}`,
						opts: null,
						pin: null,
						type: "headings",
					})),
				},
				{
					id: "img-names",
					label: "Questions 7–12",
					qStart: 7,
					typeId: "match_names",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `Observation ${i + 7}`,
						opts: null,
						pin: null,
						type: "match_names",
					})),
				},
				{
					id: "img-mcq",
					label: "Questions 13–14",
					qStart: 13,
					typeId: "mcq",
					questions: Array.from({ length: 2 }, (_, i) => ({
						q: 12 + i,
						number: 13 + i,
						stem: `MCQ ${i + 13}`,
						opts: ["A", "B", "C", "D"],
						pin: null,
						type: "mcq",
					})),
				},
			];
			const imgIntro = [
				"Reading Passage 3 has six sections, A-F.",
				"Choose the correct heading for each section from the list of headings below, i–viii, in boxes 27–32 on your answer sheet.",
				"Match each observation with the correct person, A-G.",
				"Choose the correct letter, A, B, C or D.",
			].join("\n");
			const imgDedup = deduplicateGroupIntroPreamble(imgIntro, imgParts);
			expect(imgDedup.cleanedPreamble).toBe("");
			expect(imgDedup.matchedInstructionsByPartId.get("img-head")).toContain(
				"i–viii",
			);
			expect(
				imgDedup.matchedInstructionsByPartId.get("img-head"),
			).not.toContain("Match each observation");
			expect(imgDedup.matchedInstructionsByPartId.get("img-names")).toContain(
				"Match each observation with the correct person, A-G.",
			);
			expect(imgDedup.matchedInstructionsByPartId.get("img-mcq")).toContain(
				"Choose the correct letter, A, B, C or D.",
			);

			const imgBank = [
				...Array.from({ length: 8 }, (_, i) => `Heading ${i + 1}`),
				...Array.from({ length: 7 }, (_, i) => `Person ${i + 1}`),
			];
			const imgScoped = scopeFlattenedOptionBank(
				imgParts,
				imgBank,
				imgDedup.matchedInstructionsByPartId,
				{ skill: "reading", introPreamble: imgDedup.cleanedPreamble },
			);
			expect(imgScoped.isBankScoped).toBe(true);
			expect(imgScoped.partitioned?.get("img-head")).toEqual(
				imgBank.slice(0, 8),
			);
			expect(imgScoped.partitioned?.get("img-names")).toEqual(imgBank.slice(8));
			expect(imgScoped.partitioned?.get("img-mcq")).toEqual([]);

			// 3. Collection-sign-baby-sign ("Match each statement with the correct section." vào info chứ không cướp features)
			// và Collection-satellite-technology ("Match the following reasons for each question..." không vào named)
			const babyParts: QuizPart[] = [
				{
					id: "baby-feat",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "features",
					questions: [],
				},
				{
					id: "baby-info",
					label: "Questions 5–8",
					qStart: 5,
					typeId: "info",
					questions: [],
				},
			];
			const babyDedup = deduplicateGroupIntroPreamble(
				[
					"Match each statement with the correct section.",
					"Match the following reasons for each question according to the information given in the passage.",
				].join("\n"),
				babyParts,
			);
			expect(babyDedup.matchedInstructionsByPartId.get("baby-info")).toBe(
				"Match each statement with the correct section.",
			);
			expect(babyDedup.matchedInstructionsByPartId.has("baby-feat")).toBe(
				false,
			);
			expect(babyDedup.cleanedPreamble).toContain(
				"Match the following reasons for each question",
			);
		});

		it("chặn hồi quy HTML5 parsing (İ UTF-16 skew, <style/>/<script/>/<textarea/> tự đóng giả, <embed> void, <p> chưa đóng), scanInlineSiblingEndIdx (allParts & consecutiveNoMarker), flowchart fail-closed, a-z lowercase và i-xviii", () => {
			// HIGH-1a: Unicode 'İ' (U+0130) không làm lệch chỉ số tagName khi strip <style>/<script>
			expect(
				extractExpectedBankCount(
					"headings",
					"<p>İstanbul</p><style>Choose the correct number, i-vi</style>",
				),
			).toBeNull();
			expect(
				extractExpectedBankCount(
					"headings",
					"İ<script>Choose the correct number, i-vi</script>",
				),
			).toBeNull();

			// HIGH-1b: HTML5 raw-text/container tags với `/>` KHÔNG tự đóng (chỉ <svg/>/<math/> tự đóng)
			expect(
				isEffectivelyEmptyInstruction(
					"<style/>Choose the correct number, i-vi</style>",
				),
			).toBe(true);
			expect(
				extractExpectedBankCount(
					"headings",
					"<style/>Choose the correct number, i-vi</style>",
				),
			).toBeNull();
			expect(
				extractExpectedBankCount(
					"info",
					"<script/>Match each finding A-E</script>",
				),
			).toBeNull();
			expect(
				extractExpectedBankCount(
					"info",
					"<textarea/>Match each finding A-E</textarea>",
				),
			).toBeNull();
			expect(
				extractExpectedBankCount(
					"headings",
					"<svg/>Choose the correct heading, i-vi.",
				),
			).toBe(6);

			// HIGH-1c: <embed> là void element — không nuốt văn bản thật phía sau
			expect(
				isEffectivelyEmptyInstruction(
					'<embed src="x"><p>Choose the correct heading, i-vi</p>',
				),
			).toBe(false);
			expect(
				extractExpectedBankCount(
					"headings",
					'<embed src="x"><p>Choose the correct heading, i-vi</p>',
				),
			).toBe(6);

			// LOW-1: <p> mở không có thẻ đóng vẫn tách khoảng trắng giữa các block
			expect(extractWordLimit("<p>Choose ONE WORD<p>for each answer</p>")).toBe(
				"ONE WORD",
			);

			// HIGH-2a: scanInlineSiblingEndIdx kiểm trên toàn bộ parts (kể cả part đã có instructionHtml)
			const partsWithPopulatedSecond: QuizPart[] = [
				{
					id: "p-info",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "info",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Info ${i + 1}`,
						opts: null,
						pin: null,
						type: "info",
					})),
				},
				{
					id: "p-summary",
					label: "Questions 6–8",
					qStart: 6,
					typeId: "summary",
					instructionHtml: "<p>Complete the summary below.</p>",
					questions: Array.from({ length: 3 }, (_, i) => ({
						q: 5 + i,
						number: 6 + i,
						stem: `Summary ${i + 6}`,
						opts: null,
						pin: null,
						type: "summary",
					})),
				},
			];
			const inlineOtherRes = deduplicateGroupIntroPreamble(
				"<p>Look at the following findings and the list of places below. Match each finding with the correct place A-E.</p><p>Summary text with [6], [7] and [8].</p>",
				partsWithPopulatedSecond,
			);
			expect(
				inlineOtherRes.matchedInstructionsByPartId.get("p-info"),
			).not.toContain("[6]");
			expect(inlineOtherRes.cleanedPreamble).toContain("[6]");

			// HIGH-2b: scanInlineSiblingEndIdx giới hạn consecutiveNoMarker ngay cả sau marker đầu tiên
			const noteParts: QuizPart[] = [
				{
					id: "p-info",
					label: "Questions 1–3",
					qStart: 1,
					typeId: "info",
					questions: Array.from({ length: 3 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Info ${i + 1}`,
						opts: null,
						pin: null,
						type: "info",
					})),
				},
				{
					id: "p-other",
					label: "Questions 4–5",
					qStart: 4,
					typeId: "fill_blank",
					instructionHtml: "<p>Fill blanks.</p>",
					questions: [
						{
							q: 3,
							number: 4,
							stem: "Q4",
							opts: null,
							pin: null,
							type: "fill_blank",
						},
						{
							q: 4,
							number: 5,
							stem: "Q5",
							opts: null,
							pin: null,
							type: "fill_blank",
						},
					],
				},
			];
			const noteInlineRes = deduplicateGroupIntroPreamble(
				[
					"<p>Look at the following findings and the list of places below. Match each finding with the correct place A-E.</p>",
					"<p>1. First finding [1]</p>",
					"<p>General English note 1.</p>",
					"<p>General English note 2.</p>",
					"<p>General English note 3.</p>",
					"<p>Other section body [4] and [5].</p>",
				].join(""),
				noteParts,
			);
			expect(
				noteInlineRes.matchedInstructionsByPartId.get("p-info"),
			).not.toContain("[4]");
			expect(noteInlineRes.cleanedPreamble).toContain(
				"General English note 1.",
			);
			expect(noteInlineRes.cleanedPreamble).toContain("[4]");

			// MED-1: flowchart khi isBankScoped=false không trả hướng dẫn word-bank
			expect(
				resolvePartInstruction(
					"flowchart",
					[],
					"Complete the flow-chart below. Choose NO MORE THAN TWO WORDS from the passage.",
					{
						partBank: ["Opt 1", "Opt 2"],
						isBankScoped: false,
					},
				),
			).toBe(
				"Complete the flow-chart below. Choose NO MORE THAN TWO WORDS from the passage.",
			);

			// MED-2: chữ thường "a-z" trong summary không được kích hoạt word-bank directive
			const azRes = scopeFlattenedOptionBank(
				[
					{
						id: "h1",
						label: "Questions 1–5",
						qStart: 1,
						typeId: "headings",
						questions: [],
					},
					{
						id: "s1",
						label: "Questions 6–8",
						qStart: 6,
						typeId: "summary",
						questions: [],
					},
				],
				["H1", "H2", "H3", "H4", "H5", "H6"],
				new Map([
					["h1", "Choose the correct heading, i-vi."],
					[
						"s1",
						"Complete the summary below. Write ONE WORD ONLY. Words are sorted a-z.",
					],
				]),
				{ skill: "reading", introPreamble: "" },
			);
			expect(azRes.isBankScoped).toBe(true);
			expect(azRes.partitioned?.get("h1")).toHaveLength(6);
			expect(azRes.partitioned?.get("s1")).toEqual([]);

			// MED-3: i-xviii (18 headings) được trích xuất đầy đủ
			expect(
				extractExpectedBankCount(
					"headings",
					"Choose the correct heading, i-xviii.",
				),
			).toBe(18);
		});
	});

	describe("deduplicateGroupIntroPreamble — Listening instruction isolation & offset safety", () => {
		it("assigns Bikes Q8-10 mcq_many instruction and Q1-7 table without leaking to preamble on ungrouped fallback", () => {
			const bikesParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–7",
					qStart: 1,
					typeId: "tablecomp",
					questions: Array.from({ length: 7 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: i === 4 ? "easier; ride ____" : `Q${i + 1} ____`,
						opts: null,
						pin: null,
						type: "tablecomp",
					})),
				},
				{
					id: "part-2",
					label: "Questions 8–10",
					qStart: 8,
					typeId: "mcq_many",
					questions: Array.from({ length: 3 }, (_, i) => ({
						q: 7 + i,
						number: 8 + i,
						stem: "Choose THREE letters, A-F.",
						opts: ["A", "B", "C", "D", "E", "F"],
						pin: null,
						type: "mcq_many",
					})),
				},
			];
			const flattenedIntro = [
				"<p>Complete the table below. Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.</p>",
				"<h3><strong>Talking about the history of bikes</strong></h3>",
				"<table><tbody><tr><td><p><strong>(1)</strong></p></td><td><p><strong>(2)</strong></p></td><td><p><strong>(3)</strong></p></td><td><p><strong>(4)</strong></p></td><td><p>easier; ride <strong>(5)</strong></p></td><td><p><strong>(6)</strong></p></td><td><p><strong>(7)</strong></p></td></tr></tbody></table>",
				"<p>Choose THREE letters, A-F, and write them next to questions 8-10. The invention of different gears on a bicycle affected which THREE of the following?</p>",
			].join("\n");

			const res = deduplicateGroupIntroPreamble(flattenedIntro, bikesParts);
			expect(res.cleanedPreamble).toBe("");
			expect(res.matchedInstructionsByPartId.get("part-1")).toContain(
				"easier; ride <strong>(5)</strong>",
			);
			expect(res.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"Choose THREE letters",
			);
			expect(res.matchedInstructionsByPartId.get("part-2")).toContain(
				"Choose THREE letters, A-F, and write them next to questions 8-10.",
			);
		});

		it("isolates City Health Services 'Choose the correct answer.' strictly to mcq1 in both grouped and ungrouped modes", () => {
			const formHtml =
				"<p>Complete the form below. Write NO MORE THAN TWO WORDS for each answer.</p>" +
				"<h3><strong>HOUSE SERVICE INFORMATION</strong></h3>" +
				"<table><tbody><tr><td><ul><li>Location: <strong>(1)</strong> London</li><li>Rooms: two <strong>(2)</strong> bedrooms</li><li>an <strong>(3)</strong></li><li>and <strong>(4)</strong></li></ul></td></tr></tbody></table>";
			const mcqHtml = "<p>Choose the correct answer.</p>";
			const sentHtml =
				"<p>Complete the sentences below. Write ONE WORD AND/OR A NUMBER for each answer.</p>" +
				"<table><tbody><tr><td><ul><li>12 <strong>(8)</strong> Road.</li><li>next <strong>(9)</strong></li><li><strong>(10)</strong> hours</li></ul></td></tr></tbody></table>";
			const flattenedIntro = [formHtml, mcqHtml, sentHtml].join("\n");

			const makeQuestions = (start: number, count: number, type: string) =>
				Array.from({ length: count }, (_, i) => ({
					q: start + i,
					number: start + i + 1,
					stem: `Q${start + i + 1}`,
					opts: type === "mcq1" ? ["A", "B", "C"] : null,
					pin: null,
					type,
				}));

			const groupedParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "form",
					source: "group",
					instructionHtml: formHtml,
					questions: makeQuestions(0, 4, "form"),
				},
				{
					id: "part-2",
					label: "Questions 5–7",
					qStart: 5,
					typeId: "mcq1",
					source: "group",
					instructionHtml: mcqHtml,
					questions: makeQuestions(4, 3, "mcq1"),
				},
				{
					id: "part-3",
					label: "Questions 8–10",
					qStart: 8,
					typeId: "sent4",
					source: "group",
					instructionHtml: sentHtml,
					questions: makeQuestions(7, 3, "sent4"),
				},
			];
			const groupedRes = deduplicateGroupIntroPreamble(
				flattenedIntro,
				groupedParts,
			);
			expect(groupedRes.cleanedPreamble).toBe("");

			const ungroupedParts: QuizPart[] = groupedParts.map(
				({ instructionHtml: _i, source: _s, ...rest }) => rest,
			);
			const ungroupedRes = deduplicateGroupIntroPreamble(
				flattenedIntro,
				ungroupedParts,
			);
			expect(ungroupedRes.cleanedPreamble).toBe("");
			expect(ungroupedRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"Complete the form below.",
			);
			expect(
				ungroupedRes.matchedInstructionsByPartId.get("part-1"),
			).not.toContain("Choose the correct answer.");
			expect(ungroupedRes.matchedInstructionsByPartId.get("part-2")).toContain(
				"Choose the correct answer.",
			);
			expect(ungroupedRes.matchedInstructionsByPartId.get("part-3")).toContain(
				"Complete the sentences below.",
			);
			expect(
				ungroupedRes.matchedInstructionsByPartId.get("part-3"),
			).not.toContain("Choose the correct answer.");
		});

		it("stops notes completion before 'Choose the correct answer and move (it) into the gap' matching in C14T3-S3, C15T3-S3, C20T3-S3, and C20T4-S2", () => {
			// C14T3-S3 / C15T3-S3 shape: notes (local 1..6, markers 21..26) + matching (local 7..10, markers 27..30)
			const notesMatchingParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "notes",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Note ${i + 1} ____`,
						opts: null,
						pin: null,
						type: "notes",
					})),
				},
				{
					id: "part-2",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `Member ${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const c14Intro = [
				"<p>Complete the notes below. Write ONE WORD AND/OR A NUMBER for each answer.</p>",
				"<p><strong>Background on school marching band</strong></p>",
				"<p>It consists of around <strong>(21)</strong> students.</p>",
				"<p>It is due to play in a <strong>(22)</strong> band competition.</p>",
				"<p>It has been invited to play in the town’s <strong>(23)</strong></p>",
				"<p>They have listened to a talk by a <strong>(24)</strong></p>",
				"<p>Joe will discuss a <strong>(25)</strong> with the band.</p>",
				"<p>Joe hopes the band will attend a <strong>(26)</strong> next month.</p>",
				"<p>What problem does Joe mention in connection with each of the following band members? Choose the correct answer and move it into the gap.</p>",
				"<p><strong>Band members Problems</strong></p>",
				"<ul><li>flautist <strong>(27)</strong></li><li>trumpeter <strong>(28)</strong></li><li>trombonist <strong>(29)</strong></li><li>percussionist <strong>(30)</strong></li></ul>",
			].join("");

			const c14Res = deduplicateGroupIntroPreamble(
				c14Intro,
				notesMatchingParts,
			);
			expect(c14Res.cleanedPreamble).toBe("");
			expect(c14Res.matchedInstructionsByPartId.get("part-1")).toContain(
				"(26)",
			);
			expect(c14Res.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"Choose the correct answer",
			);
			expect(c14Res.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"(27)",
			);
			expect(c14Res.matchedInstructionsByPartId.get("part-2")).toContain(
				"Choose the correct answer and move it into the gap.",
			);
			expect(c14Res.matchedInstructionsByPartId.get("part-2")).toContain(
				"(30)",
			);

			// C20T3-S3 real shape: mcq3 (21-26) + matching (27-30) with "move into the gap" (no "it")
			const c20T3Parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "mcq3",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Q${i + 1}`,
						opts: ["A", "B", "C"],
						pin: null,
						type: "mcq3",
					})),
				},
				{
					id: "part-2",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `Show ${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const c20T3Intro = [
				"<p>Choose the correct answer.</p>",
				"<p>What comment is made about the programme for each of the following shows? Choose the correct answer and move into the gap.</p>",
				"<ul><li>Show 1 <strong>(27)</strong></li><li>Show 2 <strong>(28)</strong></li><li>Show 3 <strong>(29)</strong></li><li>Show 4 <strong>(30)</strong></li></ul>",
			].join("\n");
			const c20T3Res = deduplicateGroupIntroPreamble(c20T3Intro, c20T3Parts);
			expect(c20T3Res.cleanedPreamble).toBe("");
			expect(c20T3Res.matchedInstructionsByPartId.get("part-1")).toContain(
				"Choose the correct answer.",
			);
			expect(c20T3Res.matchedInstructionsByPartId.get("part-2")).toContain(
				"move into the gap",
			);

			// C20T4-S2 real shape: merged mcq_many (11-14 from 2 consecutive groups) + matching (15-20)
			const c20T4Parts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "mcq_many",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Q${i + 1}`,
						opts: ["A", "B", "C", "D", "E"],
						pin: null,
						type: "mcq_many",
					})),
				},
				{
					id: "part-2",
					label: "Questions 5–10",
					qStart: 5,
					typeId: "matching",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: 4 + i,
						number: 5 + i,
						stem: `Year ${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const c20T4Intro = [
				"<p>Choose TWO correct answers.</p>",
				"<p>Choose TWO correct answers.</p>",
				"<p>Which event in the history of football in the UK took place in each of the following years? Choose the correct answer and move into the gap</p>",
			].join("\n");
			const c20T4Res = deduplicateGroupIntroPreamble(c20T4Intro, c20T4Parts);
			expect(c20T4Res.cleanedPreamble).toBe("");
			expect(c20T4Res.matchedInstructionsByPartId.get("part-1")).toContain(
				"Choose TWO correct answers.",
			);
			expect(c20T4Res.matchedInstructionsByPartId.get("part-2")).toContain(
				"move into the gap",
			);
		});

		it("infers quiz-wide inline delta safely across offset sections, out-of-order tables, non-inline parts, and spoofed HTML", () => {
			// 1. Offset notes (21..26) directly followed by matching inline body (27..30) with NO anchor between them,
			//    plus out-of-order (22),(21) and HTML comment/attribute/link spoof traps.
			const offsetParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "notes",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `N${i + 1}`,
						opts: null,
						pin: null,
						type: "notes",
					})),
				},
				{
					id: "part-2",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `M${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const offsetIntro = [
				"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
				'<p><!-- [100] --><span title="[99]">Line B <strong>(22)</strong> and Line A <strong>(21)</strong></span></p>',
				"<p>Line C <strong>(23)</strong>, <strong>(24)</strong>, <strong>(25)</strong>, <strong>(26)</strong></p>",
				"<p>Part 2 item <strong>(27)</strong>, <strong>(28)</strong>, <strong>(29)</strong>, <strong>(30)</strong></p>",
			].join("");
			const offsetRes = deduplicateGroupIntroPreamble(offsetIntro, offsetParts);
			expect(offsetRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"(26)",
			);
			expect(offsetRes.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"(27)",
			);

			// 2. HTML attribute and <a> href spoofing must not be treated as inline markers
			const spoofIntro = [
				"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
				'<p title="[21][22]">Ghi chú không có chỗ trống.</p>',
				'<p><a href="https://example.com/[21]/[22]">Tham khảo [23]</a></p>',
			].join("");
			const spoofRes = deduplicateGroupIntroPreamble(spoofIntro, offsetParts);
			expect(spoofRes.matchedInstructionsByPartId.get("part-1")).not.toContain(
				"Ghi chú không có chỗ trống.",
			);
			expect(spoofRes.cleanedPreamble).toContain("Ghi chú không có chỗ trống.");

			// 3. Non-inline parts guard (Actual-Test-S3-effects-of-music shape): mcq3(1-4) + mcq_many(5-6) + matching(7-10)
			//    with markers [27..30] must NOT invent delta=23 that touches mcq3/mcq_many.
			const musicParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "mcq3",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `Q${i + 1}`,
						opts: ["A", "B", "C"],
						pin: null,
						type: "mcq3",
					})),
				},
				{
					id: "part-2",
					label: "Questions 5–6",
					qStart: 5,
					typeId: "mcq_many",
					questions: Array.from({ length: 2 }, (_, i) => ({
						q: 4 + i,
						number: 5 + i,
						stem: `Q${5 + i}`,
						opts: ["A", "B", "C", "D", "E"],
						pin: null,
						type: "mcq_many",
					})),
				},
				{
					id: "part-3",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `Music ${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const musicIntro = [
				"<p>Choose the correct letters, A, B or C</p>",
				"<p>Choose TWO letters, A-E.</p>",
				"<p>What is people's attitude toward playing each of the following music in restaurants?</p>",
				"<p>Write the correct letter, A, B or C, next to questions 27-30.</p>",
				"<ul><li>Jazz <strong>(27)</strong></li><li>Rock <strong>(28)</strong></li><li>Classical <strong>(29)</strong></li><li>Pop <strong>(30)</strong></li></ul>",
			].join("\n");
			const musicRes = deduplicateGroupIntroPreamble(musicIntro, musicParts);
			expect(musicRes.cleanedPreamble).toBe("");
			expect(musicRes.matchedInstructionsByPartId.get("part-3")).toContain(
				"(27)",
			);
			expect(musicRes.matchedInstructionsByPartId.get("part-3")).toContain(
				"(30)",
			);

			// 4. delta=0 collision protection (Collection-nineteenth-century-paperback-literature shape:
			//    info 1..6 markers 14..19 + matching 7..10 markers 20..23 + ynng 11..14 non-inline)
			const paperbackParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "info",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `I${i + 1}`,
						opts: null,
						pin: null,
						type: "info",
					})),
				},
				{
					id: "part-2",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 7 + i,
						stem: `M${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
				{
					id: "part-3",
					label: "Questions 11–14",
					qStart: 11,
					typeId: "ynng",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 10 + i,
						number: 11 + i,
						stem: `Y${i + 1}`,
						opts: null,
						pin: null,
						type: "ynng",
					})),
				},
			];
			const paperbackIntro = [
				"<p>Which section contains the following information? Write the correct letter A-F.</p>",
				"<p>14. Popular in America. [14]</p>",
				"<p>15. Cheap editions. [15]</p>",
				"<p>16-19. Details [16] [17] [18] [19]</p>",
				"<p>Match each publisher with the statement A-D.</p>",
				"<p>20-23. Publishers [20] [21] [22] [23]</p>",
			].join("");
			const paperbackRes = deduplicateGroupIntroPreamble(
				paperbackIntro,
				paperbackParts,
			);
			expect(paperbackRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"[14]",
			);
			expect(paperbackRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"[19]",
			);
			expect(
				paperbackRes.matchedInstructionsByPartId.get("part-1"),
			).not.toContain("[20]");

			// 5. Multi-part non-zero qOffset (qStart = 11: 11..16 + 17..20 with Section 3 markers 21..30)
			const nonZeroOffsetParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 11–16",
					qStart: 11,
					typeId: "notes",
					questions: Array.from({ length: 6 }, (_, i) => ({
						q: i,
						number: 11 + i,
						stem: `N${i + 1}`,
						opts: null,
						pin: null,
						type: "notes",
					})),
				},
				{
					id: "part-2",
					label: "Questions 17–20",
					qStart: 17,
					typeId: "matching",
					questions: Array.from({ length: 4 }, (_, i) => ({
						q: 6 + i,
						number: 17 + i,
						stem: `M${i + 1}`,
						opts: null,
						pin: null,
						type: "matching",
					})),
				},
			];
			const nonZeroOffsetRes = deduplicateGroupIntroPreamble(
				[
					"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
					"<p>Notes <strong>(21)</strong>, <strong>(22)</strong>, <strong>(23)</strong>, <strong>(24)</strong>, <strong>(25)</strong>, <strong>(26)</strong></p>",
					"<p>Matching body <strong>(27)</strong>, <strong>(28)</strong>, <strong>(29)</strong>, <strong>(30)</strong></p>",
				].join(""),
				nonZeroOffsetParts,
			);
			expect(
				nonZeroOffsetRes.matchedInstructionsByPartId.get("part-1"),
			).toContain("(26)");
			expect(
				nonZeroOffsetRes.matchedInstructionsByPartId.get("part-1"),
			).not.toContain("(27)");

			// 6. Single-inline-part coverage (< 2 inline parts) must fail closed to delta = 0
			const singleInlineParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "info",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `I${i + 1}`,
						opts: null,
						pin: null,
						type: "info",
					})),
				},
				{
					id: "part-2",
					label: "Questions 6–8",
					qStart: 6,
					typeId: "summary",
					questions: Array.from({ length: 3 }, (_, i) => ({
						q: 5 + i,
						number: 6 + i,
						stem: `S${i + 1}`,
						opts: null,
						pin: null,
						type: "summary",
					})),
				},
			];
			const singleInlineRes = deduplicateGroupIntroPreamble(
				[
					"<p>Which section contains the following information? Write the correct letter A-F.</p>",
					"<p>Complete the summary below. Write ONE WORD ONLY for each answer.</p>",
					"<p>Summary details [19] and [20] and [21].</p>",
				].join(""),
				singleInlineParts,
			);
			expect(
				singleInlineRes.matchedInstructionsByPartId.get("part-2"),
			).toContain("[19]");
			expect(
				singleInlineRes.matchedInstructionsByPartId.get("part-2"),
			).toContain("[21]");
			expect(
				singleInlineRes.matchedInstructionsByPartId.get("part-1"),
			).not.toContain("[19]");

			// 7. Ambiguous tied deltas must fail closed to delta = 0
			const tiedParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "notes",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: i,
						number: i + 1,
						stem: `N${i + 1}`,
						opts: null,
						pin: null,
						type: "notes",
					})),
				},
				{
					id: "part-2",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "summary",
					questions: Array.from({ length: 5 }, (_, i) => ({
						q: 5 + i,
						number: 6 + i,
						stem: `S${i + 1}`,
						opts: null,
						pin: null,
						type: "summary",
					})),
				},
			];
			const tiedRes = deduplicateGroupIntroPreamble(
				[
					"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
					"<p>Notes [22] and [23]</p>",
					"<p>Details [27] and [28]</p>",
				].join(""),
				tiedParts,
			);
			// Because delta=19 -> (3,4)/(8,9) and delta=20 -> (2,3)/(7,8) tie with (clean=2, boundary=0),
			// delta fails closed to 0 so part-1 keeps both inline blocks rather than guessing.
			expect(tiedRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"[22]",
			);
			expect(tiedRes.matchedInstructionsByPartId.get("part-1")).toContain(
				"[28]",
			);
		});

		it("handles Listening 2-line matching, Choose from the list/options, single-MCQ variants, Which are the TWO, and repeated mcq_many blocks", () => {
			// C11T3-S3: Who ... each of the following ... + Write the correct letter, A-D, next to Questions 27 - 30.
			const c11Parts: QuizPart[] = [
				{
					id: "p-notes",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "notes",
					questions: [],
				},
				{
					id: "p-match",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "matching",
					questions: [],
				},
			];
			const c11Res = deduplicateGroupIntroPreamble(
				[
					"<p>Complete the notes below. Write ONE WORD ONLY for each answer.</p>",
					"<p>Who is going to write each of the following parts of the report?</p>",
					"<p>Write the correct letter, A-D, next to Questions 27 - 30.</p>",
				].join("\n"),
				c11Parts,
			);
			expect(c11Res.cleanedPreamble).toBe("");
			expect(c11Res.matchedInstructionsByPartId.get("p-match")).toContain(
				"Who is going to write",
			);
			expect(c11Res.matchedInstructionsByPartId.get("p-match")).toContain(
				"next to Questions 27 - 30",
			);

			// Actual-Test-S2-radio-program-singing-in-the-choir: matching + mcq1 (mcq1 must NOT steal next to questions)
			const choirParts: QuizPart[] = [
				{
					id: "p-match",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "matching",
					questions: [],
				},
				{
					id: "p-mcq1",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "mcq1",
					questions: [],
				},
			];
			const choirRes = deduplicateGroupIntroPreamble(
				[
					"<p>Which choir does each of the following statements apply to?</p>",
					"<p>Choose the correct letter, A, B or C, next to questions 11-15</p>",
					"<p>Choose the correct option A, B or C</p>",
				].join("\n"),
				choirParts,
			);
			expect(choirRes.cleanedPreamble).toBe("");
			expect(choirRes.matchedInstructionsByPartId.get("p-match")).toContain(
				"Which choir",
			);
			expect(choirRes.matchedInstructionsByPartId.get("p-match")).toContain(
				"next to questions 11-15",
			);
			expect(choirRes.matchedInstructionsByPartId.get("p-mcq1")).toContain(
				"Choose the correct option A, B or C",
			);

			// Collection-S3-climate-change-and-allergies: Choose from the list A-G.
			const allergyParts: QuizPart[] = [
				{
					id: "p-mcq3",
					label: "Questions 1–5",
					qStart: 1,
					typeId: "mcq3",
					questions: [],
				},
				{
					id: "p-feat",
					label: "Questions 6–10",
					qStart: 6,
					typeId: "features",
					questions: [],
				},
			];
			const allergyRes = deduplicateGroupIntroPreamble(
				[
					"<p>Circle the correct answer A, B, C or D.</p>",
					"<p>What comment is made about the seasonal changes in pollen in each of the following European countries?</p>",
					"<p>Choose from the list A-G.</p>",
					"<p>NB You may use any letter more than once.</p>",
				].join("\n"),
				allergyParts,
			);
			expect(allergyRes.cleanedPreamble).toBe("");
			expect(allergyRes.matchedInstructionsByPartId.get("p-mcq3")).toContain(
				"Circle the correct answer",
			);
			expect(allergyRes.matchedInstructionsByPartId.get("p-feat")).toContain(
				"Choose from the list A-G.",
			);

			// Single-MCQ variants + Which are the TWO + Choose TWO answers ... next to questions
			const variantCases: Array<{ typeId: string; instr: string }> = [
				{ typeId: "mcq1", instr: "<p>Choose the correct option.</p>" },
				{
					typeId: "mcq1",
					instr: "<p>Choose the correct letters A, B, or C.</p>",
				},
				{
					typeId: "mcq",
					instr:
						"<p>Part 2 — Multiple choice. Choose the correct letter A, B, C or D.</p>",
				},
				{
					typeId: "mcq_many",
					instr:
						"<p>Which are the TWO main duties for Personal Support Workers (PSWs)?</p>",
				},
				{
					typeId: "mcq_many",
					instr:
						"<p>Choose TWO answers and write them next to questions 11-12.</p>",
				},
			];
			for (const vc of variantCases) {
				const res = deduplicateGroupIntroPreamble(vc.instr, [
					{
						id: "p-target",
						label: "Questions 1–4",
						qStart: 1,
						typeId: vc.typeId,
						questions: [],
					},
					{
						id: "p-other",
						label: "Questions 5–8",
						qStart: 5,
						typeId: "notes",
						questions: [],
					},
				]);
				expect(res.cleanedPreamble, vc.instr).toBe("");
				expect(
					res.matchedInstructionsByPartId.get("p-target"),
					vc.instr,
				).toBeTruthy();
			}

			// Consecutive mcq_many with dash/period drift and line-2 Write your answers in boxes
			const dupMcqManyRes = deduplicateGroupIntroPreamble(
				[
					"<p>Choose TWO letters, A–E.</p>",
					"<p>Write your answers in boxes 5-6 on your answer sheet.</p>",
					"<p>Choose TWO letters, A-E</p>",
					"<p>Write your answers in boxes 5-6 on your answer sheet</p>",
				].join("\n"),
				[
					{
						id: "p-many",
						label: "Questions 1–4",
						qStart: 1,
						typeId: "mcq_many",
						questions: [],
					},
					{
						id: "p-notes",
						label: "Questions 5–8",
						qStart: 5,
						typeId: "notes",
						questions: [],
					},
				],
			);
			expect(dupMcqManyRes.cleanedPreamble).toBe("");
			expect(dupMcqManyRes.matchedInstructionsByPartId.get("p-many")).toContain(
				"Choose TWO letters, A–E.",
			);
		});

		it("preserves 2-line MAP_LABELLING bank scoping, 5-option mcq_many (grey-workers), bare MCQ under lead-in, C13T3-S2, and Reading MCQ in boxes", () => {
			// 1. 2-line MAP_LABELLING (C16T1-S2-plan-of-stevensons-site): must keep both lines in map + isBankScoped = true
			const mapParts: QuizPart[] = [
				{
					id: "part-1",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "mcq1",
					questions: [],
				},
				{
					id: "part-2",
					label: "Questions 5–10",
					qStart: 5,
					typeId: "map",
					questions: [],
				},
			];
			const mapIntro = [
				"<p>Choose the correct letter, A, B or C.</p>",
				"<p>Label the map below.</p>",
				"<p>Write the correct letter, A-J, next to Questions 15-20.</p>",
			].join("\n");
			const mapRes = deduplicateGroupIntroPreamble(mapIntro, mapParts);
			expect(mapRes.cleanedPreamble).toBe("");
			expect(mapRes.matchedInstructionsByPartId.get("part-2")).toContain(
				"Label the map below.",
			);
			expect(mapRes.matchedInstructionsByPartId.get("part-2")).toContain(
				"Write the correct letter, A-J, next to Questions 15-20.",
			);
			const mapScope = scopeFlattenedOptionBank(
				mapParts,
				["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"],
				mapRes.matchedInstructionsByPartId,
				{ skill: "listening", introPreamble: mapRes.cleanedPreamble },
			);
			expect(mapScope.isBankScoped).toBe(true);
			expect(mapScope.partitioned?.get("part-2")).toHaveLength(10);

			// 2. 5-option mcq_many + 4-option mcq (Forecast-Quy-2-2025-grey-workers): mcq must NOT steal A, B, C, D or E
			const greyParts: QuizPart[] = [
				{
					id: "p-many",
					label: "Questions 1–4",
					qStart: 1,
					typeId: "mcq_many",
					questions: [],
				},
				{
					id: "p-mcq",
					label: "Questions 5–9",
					qStart: 5,
					typeId: "mcq",
					questions: [],
				},
			];
			const greyRes = deduplicateGroupIntroPreamble(
				[
					"<p>Choose the correct letter, A, B, C, D or E.</p>",
					"<p>Choose the correct letter, A, B, C or D.</p>",
					"<p>Write the correct letter in boxes 9-13 on your answer sheet.</p>",
				].join("\n"),
				greyParts,
			);
			expect(greyRes.matchedInstructionsByPartId.get("p-mcq")).toContain(
				"Choose the correct letter, A, B, C or D.",
			);
			expect(greyRes.matchedInstructionsByPartId.get("p-mcq")).not.toContain(
				"D or E",
			);

			// 3. Lead-in preamble before bare "Choose the correct answer." must NOT let matching steal mcq1
			const bareMcqParts: QuizPart[] = [
				{
					id: "p-mcq1",
					label: "Questions 1–3",
					qStart: 1,
					typeId: "mcq1",
					questions: [],
				},
				{
					id: "p-match",
					label: "Questions 4–6",
					qStart: 4,
					typeId: "matching",
					questions: [],
				},
			];
			const bareMcqRes = deduplicateGroupIntroPreamble(
				[
					"<p>What do these speakers disagree about?</p>",
					"<p>Choose the correct answer.</p>",
				].join("\n"),
				bareMcqParts,
			);
			expect(bareMcqRes.matchedInstructionsByPartId.get("p-mcq1")).toContain(
				"Choose the correct answer.",
			);
			expect(
				bareMcqRes.matchedInstructionsByPartId.get("p-match"),
			).toBeUndefined();

			// 4. C13T3-S2 matching from the box must NOT be stolen by mcq_many
			const c13Parts: QuizPart[] = [
				{
					id: "p-match",
					label: "Questions 1–6",
					qStart: 1,
					typeId: "matching",
					questions: [],
				},
				{
					id: "p-many",
					label: "Questions 7–10",
					qStart: 7,
					typeId: "mcq_many",
					questions: [],
				},
			];
			const c13Res = deduplicateGroupIntroPreamble(
				[
					"<p>Choose SIX answers from the box and write the correct letter, A-G, next to Questions 11-16.</p>",
					"<p>Choose TWO correct answers.</p>",
					"<p>Choose TWO correct answers.</p>",
				].join("\n"),
				c13Parts,
			);
			expect(c13Res.cleanedPreamble).toBe("");
			expect(c13Res.matchedInstructionsByPartId.get("p-match")).toContain(
				"Choose SIX answers from the box",
			);
			expect(c13Res.matchedInstructionsByPartId.get("p-many")).toContain(
				"Choose TWO correct answers.",
			);

			// 5. 2-line mcq_many ("Which TWO of the following..." + "Write the correct letter...")
			//    must NOT be hijacked by matching/features when both parts are missing.
			const twoLineManyParts: QuizPart[] = [
				{
					id: "p-many",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "mcq_many",
					questions: [],
				},
				{
					id: "p-feat",
					label: "Questions 3–6",
					qStart: 3,
					typeId: "features",
					questions: [],
				},
			];
			const twoLineManyRes = deduplicateGroupIntroPreamble(
				[
					"<p>Which TWO of the following statements are true?</p>",
					"<p>Write the correct letter, A-E, in boxes 1-2 on your answer sheet.</p>",
					"<p>Match each researcher with their finding, A-F.</p>",
				].join("\n"),
				twoLineManyParts,
			);
			expect(twoLineManyRes.cleanedPreamble).toBe("");
			expect(
				twoLineManyRes.matchedInstructionsByPartId.get("p-many"),
			).toContain("Which TWO of the following statements are true?");
			expect(
				twoLineManyRes.matchedInstructionsByPartId.get("p-many"),
			).toContain("in boxes 1-2");
			expect(
				twoLineManyRes.matchedInstructionsByPartId.get("p-feat"),
			).toContain("Match each researcher with their finding, A-F.");
			expect(
				twoLineManyRes.matchedInstructionsByPartId.get("p-feat"),
			).not.toContain("Which TWO");

			// 6. Consecutive identical "Which are the TWO..." mcq_many headings must be deduplicated
			//    (not concatenated twice into the first mcq_many cluster).
			const dupWhichRes = deduplicateGroupIntroPreamble(
				[
					"<p>Which are the TWO main duties for Personal Support Workers (PSWs)?</p>",
					"<p>Which are the TWO main duties for Personal Support Workers (PSWs)?</p>",
				].join("\n"),
				[
					{
						id: "p-many",
						label: "Questions 1–4",
						qStart: 1,
						typeId: "mcq_many",
						questions: [],
					},
					{
						id: "p-notes",
						label: "Questions 5–10",
						qStart: 5,
						typeId: "notes",
						questions: [],
					},
				],
			);
			expect(dupWhichRes.cleanedPreamble).toBe("");
			const dupWhichMatches =
				dupWhichRes.matchedInstructionsByPartId
					.get("p-many")
					?.match(/Which are the TWO/g) ?? [];
			expect(dupWhichMatches).toHaveLength(1);
		});
	});
});
