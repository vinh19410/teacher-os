import { splitQuizIntro } from "@teacher-os/api/lib/quiz-intro-sections";
import { describe, expect, it } from "vitest";

const expectSplit = (intro: string, questionCount: number) => {
	const split = splitQuizIntro(intro, questionCount);
	if (split === null) throw new Error("expected non-null split");
	return split;
};

describe("splitQuizIntro — tách intro theo marker Questions X–Y (#301)", () => {
	it("HTML ví dụ user: 3 marker → 3 sections đúng range, text giáo viên ưu tiên", () => {
		const intro =
			"<p>Questions 1–4</p><p>Do the following statements agree…</p>" +
			"<p>Questions 5–8 · Flow-chart completion — Complete the flow-chart below. Write ONE WORD ONLY from the passage for each answer.</p>" +
			"<p>Questions 9–13</p><p>Complete the notes below.</p>";
		const { sections } = expectSplit(intro, 13);
		expect(sections.map((s) => [s.start, s.end])).toEqual([
			[1, 4],
			[5, 8],
			[9, 13],
		]);
		expect(sections[1].html).toContain(
			"Flow-chart completion — Complete the flow-chart below. Write ONE WORD ONLY",
		);
		expect(sections[1].html).not.toContain("Questions 5–8");
	});

	it("block trước marker đầu tiên thuộc preamble", () => {
		const { preamble } = expectSplit(
			"<p>Read the passage.</p><p>Questions 1–2</p><p>x</p>",
			2,
		);
		expect(preamble).toContain("Read the passage.");
	});

	it("nhận các biến thể marker: dấu gạch, hoa/thường, to, entity, số ít, Câu", () => {
		const variants: Array<[string, number]> = [
			["<p>Questions 1-4</p><p>abc</p>", 4],
			["<p>Questions 1 — 4</p><p>abc</p>", 4],
			["<p>QUESTIONS 1 to 4</p><p>abc</p>", 4],
			["<p>Questions 1&ndash;4</p><p>abc</p>", 4],
			["<p>Questions&nbsp;1–4</p><p>abc</p>", 4],
		];
		for (const [intro, count] of variants) {
			const { sections } = expectSplit(intro, count);
			expect(sections.map((s) => [s.start, s.end])).toEqual([[1, 4]]);
		}
		// Số ít "Question 5" đứng sau marker thường → range [5,5] không offset.
		const { sections: singular } = expectSplit(
			"<p>Questions 1–4</p><p>abc</p><p>Question 5</p><p>def</p>",
			5,
		);
		expect(singular.map((s) => [s.start, s.end])).toEqual([
			[1, 4],
			[5, 5],
		]);
		// Marker tiếng Việt.
		const { sections: vietnamese } = expectSplit("<p>Câu 1–4</p><p>abc</p>", 4);
		expect(vietnamese.map((s) => [s.start, s.end])).toEqual([[1, 4]]);
	});

	it("marker bọc trong <strong>: bỏ marker, giữ instruction phía sau", () => {
		const { sections } = expectSplit(
			"<p><strong>Questions 1–2</strong> · Choose TRUE</p>",
			2,
		);
		expect(sections).toHaveLength(1);
		expect(sections[0].html).toContain("Choose TRUE");
		expect(sections[0].html).not.toContain("Questions 1–2");
	});

	it("<p> chứa <br>: tách tại <br> trước marker, mỗi đoạn bọc lại <p>", () => {
		const { sections } = expectSplit(
			"<p>Questions 1–2<br>Write TRUE<br>Questions 3–4<br>Write ONE WORD</p>",
			4,
		);
		expect(sections.map((s) => [s.start, s.end])).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it("plain legacy không tag: tách theo dòng, join bằng \\n", () => {
		const { sections } = expectSplit(
			"Questions 1–2\nWrite TRUE\nQuestions 3–4\nWrite ONE WORD",
			4,
		);
		expect(sections.map((s) => [s.start, s.end])).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(sections[0].html).toBe("Write TRUE");
	});

	it("marker nằm giữa câu không được nhận → null", () => {
		expect(
			splitQuizIntro("<p>Answer questions 1–4 using the passage.</p>", 4),
		).toBeNull();
	});

	it("offset: intro ghi 14–20 trên 7 câu → học viên thấy 1–7", () => {
		const { sections } = expectSplit(
			"<p>Questions 14–16</p><p>a</p><p>Questions 17–20</p><p>b</p>",
			7,
		);
		expect(sections.map((s) => [s.start, s.end])).toEqual([
			[1, 3],
			[4, 7],
		]);
	});

	it("range vượt số câu → null", () => {
		expect(
			splitQuizIntro(
				"<p>Questions 1–4</p><p>x</p><p>Questions 5–14</p><p>y</p>",
				13,
			),
		).toBeNull();
	});

	it("range chồng / trùng / đảo ngược → null", () => {
		expect(
			splitQuizIntro("<p>Questions 1–4</p><p>Questions 3–6</p>", 6),
		).toBeNull();
		expect(
			splitQuizIntro("<p>Questions 1–4</p><p>Questions 1–4</p>", 4),
		).toBeNull();
		expect(splitQuizIntro("<p>Questions 4–1</p>", 4)).toBeNull();
	});

	it("section chỉ có marker → html rỗng, block sau marker bình thường", () => {
		const { sections } = expectSplit(
			"<p>Questions 1–2</p><p>Questions 3–4</p><p>x</p>",
			4,
		);
		expect(sections.map((s) => [s.start, s.end])).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(sections[0].html).toBe("");
		expect(sections[1].html).toContain("x");
	});

	it("intro rỗng / không marker / questionCount = 0 → null", () => {
		expect(splitQuizIntro("", 4)).toBeNull();
		expect(splitQuizIntro("<p></p>", 4)).toBeNull();
		expect(splitQuizIntro("<p>Questions 1–4</p>", 0)).toBeNull();
	});

	it("list lồng trong section: giữ trọn khối <ul> lồng nhau", () => {
		const { sections } = expectSplit(
			"<p>Questions 1–2</p><ul><li>a<ul><li>b</li></ul></li></ul><p>Questions 3–4</p>",
			4,
		);
		expect(sections[0].html).toContain(
			"<ul><li>a<ul><li>b</li></ul></li></ul>",
		);
	});
});
