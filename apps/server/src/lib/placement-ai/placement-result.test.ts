import { describe, expect, test } from "vitest";
import {
	type PlacementResultEmailSummary,
	parseAiSpeakingDraft,
	parseAiWritingDraft,
	parseStoredErrors,
	renderPlacementResultEmail,
} from "./placement-result";

const LINK = "https://msmy.io.vn/kiem-tra-dau-vao/ket-qua/?t=abc";

function summary(
	overrides: Partial<PlacementResultEmailSummary> = {},
): PlacementResultEmailSummary {
	return {
		cefr: "A2",
		displayCourse: "Communication English Level 2",
		scorePct: 72.4,
		listening: { correct: 3, total: 4, pct: 75 },
		vocabGrammar: { correct: 7, total: 10, pct: 70 },
		reading: { correct: 5, total: 8, pct: 62.5 },
		writingScore: 6.5,
		speakingScore: 7,
		...overrides,
	};
}

describe("renderPlacementResultEmail", () => {
	test("HTML có lời chào, CEFR, khóa học, điểm tổng hợp và đủ các dòng kỹ năng (mặc định IELTS)", () => {
		const { subject, html } = renderPlacementResultEmail({
			studentName: "Học viên A",
			summary: summary(),
			linkUrl: LINK,
		});
		expect(subject).toBe("Kết quả bài kiểm tra đầu vào tiếng Anh");
		expect(html).toContain("Chào Học viên A,");
		expect(html).toContain("Cô Mỹ đã chấm xong");
		expect(html).toContain("Trình độ CEFR");
		expect(html).toContain(">A2<");
		expect(html).toContain("Communication English Level 2");
		expect(html).toContain(">72%<");
		expect(html).toContain("3/4 (75%)");
		expect(html).toContain("Grammar &amp; Vocabulary");
		expect(html).toContain("7/10 (70%)");
		expect(html).toContain("5/8 (63%)");
		expect(html).toContain("Band 6.5/9");
		expect(html).toContain(">Speaking<");
		expect(html).toContain("Band 7.0/9");
		expect(html).toContain(`href="${LINK}"`);
		expect(html).toContain("Xem chi tiết kết quả");
		// Không tài nguyên ngoài.
		expect(html).not.toMatch(/<img|<link|<style|@import/i);
	});

	test("thang legacy giữ định dạng /15 điểm và /20 điểm", () => {
		const { html, text } = renderPlacementResultEmail({
			studentName: "Học viên B",
			summary: summary({
				writingScore: 11,
				speakingScore: 12,
				writingScale: "legacy",
				speakingScale: "legacy",
			}),
			linkUrl: LINK,
		});
		expect(html).toContain("11/15 điểm");
		expect(html).toContain("12/20 điểm");
		expect(text).toContain("- Writing: 11/15 điểm");
		expect(text).toContain("- Speaking: 12/20 điểm");
	});

	test("không có điểm Speaking → bỏ dòng Speaking", () => {
		const { html, text } = renderPlacementResultEmail({
			studentName: "Học viên A",
			summary: summary({ speakingScore: null }),
			linkUrl: LINK,
		});
		expect(html).not.toContain("Speaking");
		expect(text).not.toContain("Speaking");
		expect(html).toContain(">Writing<");
	});

	test("escape mọi giá trị động", () => {
		const { html, text } = renderPlacementResultEmail({
			studentName: "<script>alert(1)</script>",
			summary: summary({
				displayCourse: 'Khóa "A" <b>',
				cefr: "<A2>",
			}),
			linkUrl: 'https://x.test/?a=1&b="2"',
		});
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
		expect(html).toContain("Khóa &quot;A&quot; &lt;b&gt;");
		expect(html).toContain("&lt;A2&gt;");
		expect(html).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
		// Bản text giữ nguyên giá trị thô.
		expect(text).toContain("Chào <script>alert(1)</script>,");
	});

	test("bản text có tóm tắt và cùng link", () => {
		const { text } = renderPlacementResultEmail({
			studentName: "  ",
			summary: summary(),
			linkUrl: LINK,
		});
		expect(text.startsWith("Chào bạn,")).toBe(true);
		for (const line of [
			"Trình độ CEFR: A2",
			"Khóa học đề xuất: Communication English Level 2",
			"Điểm tổng hợp: 72%",
			"- Listening: 3/4 (75%)",
			"- Grammar & Vocabulary: 7/10 (70%)",
			"- Reading: 5/8 (63%)",
			"- Writing: Band 6.5/9",
			"- Speaking: Band 7.0/9",
			LINK,
			"Chúc bạn học tốt!",
		]) {
			expect(text).toContain(line);
		}
	});

	test("phần không có câu hỏi hiển thị —", () => {
		const { text } = renderPlacementResultEmail({
			studentName: "A",
			summary: summary({ listening: { correct: 0, total: 0, pct: null } }),
			linkUrl: LINK,
		});
		expect(text).toContain("- Listening: —");
	});
});

describe("parseAiWritingDraft / parseAiSpeakingDraft", () => {
	test("đọc được cả bản nháp errors-only mới lẫn bản nháp legacy có rubric/feedback", () => {
		const text = "I lives in Hanoi.";
		const modern = parseAiWritingDraft(
			JSON.stringify({
				errors: [
					{
						id: "w1",
						category: "grammar",
						quote: "I lives",
						start: null,
						end: null,
						correction: "I live",
						explanation: "Chia động từ.",
					},
				],
			}),
			text,
		);
		expect(modern).toEqual({
			errors: [
				{
					id: "w1",
					category: "grammar",
					quote: "I lives",
					start: 0,
					end: 7,
					correction: "I live",
					explanation: "Chia động từ.",
				},
			],
		});

		const legacyTranscript = "I go yesterday.";
		const legacy = parseAiSpeakingDraft(
			JSON.stringify({
				rubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
				feedback: "Tốt.",
				errors: [
					{
						id: "s1",
						category: "grammar",
						quote: "go",
						start: null,
						end: null,
						correction: "went",
						explanation: "Quá khứ.",
					},
				],
			}),
			legacyTranscript,
		);
		expect(legacy).toEqual({
			errors: [
				{
					id: "s1",
					category: "grammar",
					quote: "go",
					start: 2,
					end: 4,
					correction: "went",
					explanation: "Quá khứ.",
				},
			],
		});
		expect(parseAiWritingDraft("not json", text)).toBeNull();
		expect(parseAiWritingDraft(null, text)).toBeNull();
	});

	test("chuẩn hóa category legacy trong parseStoredErrors và AI draft mà không làm rớt cả mảng", () => {
		const essay = "I lives in big city and recieve mail.";
		const writingErrors = parseStoredErrors(
			JSON.stringify([
				{
					id: "w1",
					category: "vocabulary",
					quote: "big city",
					start: null,
					end: null,
					correction: "a big city",
					explanation: "Thiếu mạo từ.",
				},
				{
					id: "w2",
					category: "spelling",
					quote: "recieve",
					start: null,
					end: null,
					correction: "receive",
					explanation: "Sai chính tả.",
				},
				{
					id: "w3",
					category: "pronunciation",
					quote: "mail",
					start: null,
					end: null,
					correction: "letters",
					explanation: "Chuyển về lexical.",
				},
				{
					id: "w4",
					category: "unknown",
					quote: "I lives",
					start: null,
					end: null,
					correction: "I live",
					explanation: "Bị bỏ qua.",
				},
			]),
			essay,
			"writing",
		);
		expect(
			writingErrors?.map((e) => ({
				id: e.id,
				category: e.category,
				start: e.start,
			})),
		).toEqual([
			{ id: "w1", category: "lexical", start: essay.indexOf("big city") },
			{ id: "w2", category: "lexical", start: essay.indexOf("recieve") },
			{ id: "w3", category: "lexical", start: essay.indexOf("mail") },
		]);

		const transcript = "Well I go beach yesterday.";
		const speakingErrors = parseStoredErrors(
			JSON.stringify([
				{
					id: "s1",
					category: "coherence",
					quote: "Well",
					start: null,
					end: null,
					correction: "Actually",
					explanation: "Mạch lạc.",
				},
				{
					id: "s2",
					category: "task",
					quote: "yesterday",
					start: null,
					end: null,
					correction: "last week",
					explanation: "Trả lời ý.",
				},
				{
					id: "s3",
					category: "spelling",
					quote: "beach",
					start: null,
					end: null,
					correction: "seaside",
					explanation: "Từ vựng.",
				},
				{
					id: "s4",
					category: "invalid",
					quote: "go",
					start: null,
					end: null,
					correction: "went",
					explanation: "Bị lọc.",
				},
			]),
			transcript,
			"speaking",
		);
		expect(
			speakingErrors?.map((e) => ({ id: e.id, category: e.category })),
		).toEqual([
			{ id: "s1", category: "fluency" },
			{ id: "s3", category: "lexical" },
			{ id: "s2", category: "fluency" },
		]);

		expect(parseStoredErrors(null, essay, "writing")).toBeNull();
		expect(parseStoredErrors("not-json", essay, "writing")).toEqual([]);

		const legacyWritingDraft = parseAiWritingDraft(
			JSON.stringify({
				errors: [
					{
						id: "w1",
						category: "spelling",
						quote: "recieve",
						start: null,
						end: null,
						correction: "receive",
						explanation: "Chính tả.",
					},
					{
						id: "w2",
						category: "bogus",
						quote: "mail",
						start: null,
						end: null,
						correction: "",
						explanation: "",
					},
				],
			}),
			essay,
		);
		expect(legacyWritingDraft?.errors).toHaveLength(1);
		expect(legacyWritingDraft?.errors[0]?.category).toBe("lexical");

		const legacySpeakingDraft = parseAiSpeakingDraft(
			JSON.stringify({
				errors: [
					{
						id: "s1",
						category: "coherence",
						quote: "Well",
						start: null,
						end: null,
						correction: "Actually",
						explanation: "Mạch lạc.",
					},
				],
			}),
			transcript,
		);
		expect(legacySpeakingDraft?.errors).toHaveLength(1);
		expect(legacySpeakingDraft?.errors[0]?.category).toBe("fluency");
	});
});
