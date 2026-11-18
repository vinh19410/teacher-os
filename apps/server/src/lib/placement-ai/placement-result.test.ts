import { describe, expect, test } from "vitest";
import {
	type PlacementResultEmailSummary,
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
		writingScore: 11,
		speakingScore: 12,
		...overrides,
	};
}

describe("renderPlacementResultEmail", () => {
	test("HTML có lời chào, CEFR, khóa học, điểm tổng hợp và đủ các dòng kỹ năng", () => {
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
		expect(html).toContain("Từ vựng &amp; Ngữ pháp");
		expect(html).toContain("7/10 (70%)");
		expect(html).toContain("5/8 (63%)");
		expect(html).toContain("11/15 điểm");
		expect(html).toContain(">Speaking<");
		expect(html).toContain("12/20 điểm");
		expect(html).toContain(`href="${LINK}"`);
		expect(html).toContain("Xem chi tiết kết quả");
		// Không tài nguyên ngoài.
		expect(html).not.toMatch(/<img|<link|<style|@import/i);
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
			"- Từ vựng & Ngữ pháp: 7/10 (70%)",
			"- Reading: 5/8 (63%)",
			"- Writing: 11/15 điểm",
			"- Speaking: 12/20 điểm",
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
