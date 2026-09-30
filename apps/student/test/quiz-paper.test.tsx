import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizPaper } from "@/components/quiz/quiz-paper";
import {
	type QuizChoiceRow,
	questionChoiceRows,
} from "@/components/quiz/quiz-question-item";
import { buildQuizParts } from "@/lib/quiz-parts";

type PaperFields = Parameters<typeof QuizPaper>[0]["detail"];

const paperFields = (overrides: Partial<PaperFields> = {}): PaperFields => ({
	skill: "reading",
	type: "tfng",
	band: "6.5",
	intro: "Đọc đoạn văn và chọn TRUE / FALSE / NOT GIVEN.",
	prompt: "",
	passage: "<p>Đoạn đọc về kênh đào.</p>",
	transcript: "",
	cueTopic: "",
	cuePoints: "",
	audioName: "",
	imageUrl: "",
	optionBank: [],
	...overrides,
});

const clozeQuestion = (stem: string): StudentQuizQuestion => ({
	stem,
	opts: null,
	pin: null,
});

/** Số câu render dưới dạng <strong>N.</strong> — đúng thứ tự xuất hiện. */
function questionNumbers(html: string): number[] {
	return Array.from(html.matchAll(/<strong[^>]*>(\d+)\.<\/strong>/g), (match) =>
		Number(match[1]),
	);
}

describe("QuizPaper — choice (tfng) full-row radio pills", () => {
	const questions: StudentQuizQuestion[] = [
		{ stem: "The canal was built in the iron age.", opts: null, pin: null },
		{ stem: "The river flows north.", opts: null, pin: null },
	];

	it("render radiogroup aria 'Câu n' với 3 pill TRUE/FALSE/NOT GIVEN", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(questions, "tfng")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain('role="radiogroup"');
		expect(html).toContain('aria-label="Câu 1"');
		expect(html).toContain('aria-label="Câu 2"');
		for (const pill of ["TRUE", "FALSE", "NOT GIVEN"]) {
			expect(html).toContain(`value="${pill}"`);
		}
		// Full-row click: mỗi pill là một <label> bọc input.
		expect((html.match(/<label /g) ?? []).length).toBe(6);
		expect(questionNumbers(html)).toEqual([1, 2]);
	});

	it("đánh dấu selected theo answers (value = lựa chọn)", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(questions, "tfng")}
				answers={{ 0: "FALSE" }}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain('checked="" value="FALSE"');
		expect(html).not.toContain('checked="" value="TRUE"');
	});
});

describe("QuizPaper — cloze input width theo GIÁ TRỊ học viên", () => {
	const questions = [clozeQuestion("The river ____ the city.")];

	it("empty → width sàn 6ch; có value → width theo độ dài value", () => {
		const base = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts(questions, "tfng")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(base).toContain('aria-label="Điền đáp án câu 1"');
		expect(base).toMatch(/width:\s*6ch/);

		const filled = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts(questions, "tfng")}
				answers={{ 0: "gluestick" }}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		// gluestick = 9 ký tự → max(6, 9+2) = 11ch — suy từ value, KHÔNG từ key.
		expect(filled).toMatch(/width:\s*11ch/);
		expect(filled).toContain('value="gluestick"');
	});
});

describe("QuizPaper — pin questions trả lời qua PinOverlay", () => {
	const questions: StudentQuizQuestion[] = [
		{ stem: "", opts: null, pin: { x: 30, y: 40 } },
		{
			stem: "Entrance",
			opts: null,
			pin: { x: 70, y: 60 },
		},
	];

	it("input pin controlled theo answers; câu pin KHÔNG có radio pills", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({
					skill: "listening",
					type: "map",
					imageUrl: "https://example.com/map.png",
					optionBank: ["Entrance", "Cafe", "Gate", "Desk"],
				})}
				parts={buildQuizParts(questions, "tfng")}
				answers={{ 0: "A" }}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain('aria-label="Điền đáp án câu 1"');
		expect(html).toContain('value="A"');
		expect(html).not.toContain('role="radiogroup"');
		// Bank map render labeled list.
		expect(html).toContain("Ngân hàng lựa chọn");
	});
});

describe("QuizPaper — không render answer key", () => {
	it("markup không chứa giá trị key (payload take đã sanitize — répond không bao giờ truyền answer)", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts([clozeQuestion("Name: ____")], "shortans")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		// Key không tồn tại trong graph render; kiểm tra kép: không có attr
		// answer/alts nào trong markup.
		expect(html).not.toMatch(/answer=|alts/);
	});
});

describe("questionChoiceRows — suy luận pills theo type + bank", () => {
	const rows = (
		partial: { opts: string[] | null },
		type: string,
		bank: string[],
	): QuizChoiceRow[] => questionChoiceRows(partial, type, bank);

	it("mcq có opts → letter + text, value là LETTER", () => {
		const result = rows({ opts: ["Plumbing", "Glue", "Wood"] }, "mcq3", []);
		expect(result).toEqual([
			{ label: "A", text: "Plumbing", value: "A" },
			{ label: "B", text: "Glue", value: "B" },
			{ label: "C", text: "Wood", value: "C" },
		]);
	});

	it("headings không opts → roman pills cắt theo bank (5 hàng)", () => {
		const result = rows({ opts: null }, "headings", [
			"Người xây kênh",
			"Thời kỳ đồ sắt",
			"Giao thương",
			"Cách mạng",
			"Khai mỏ",
		]);
		expect(result.map((row) => row.value)).toEqual([
			"i",
			"ii",
			"iii",
			"iv",
			"v",
		]);
	});

	it("type text (shortans/notes) → không pills (cloze input)", () => {
		expect(rows({ opts: null }, "shortans", [])).toEqual([]);
	});
});

describe("QuizPaper — header cụm theo type từng câu (#286)", () => {
	const mixedQuestions: StudentQuizQuestion[] = [
		{ stem: "T/F/NG statement 1", opts: null, pin: null, type: "tfng" },
		{ stem: "T/F/NG statement 2", opts: null, pin: null, type: "tfng" },
		{ stem: "Flow ____ one", opts: null, pin: null, type: "flowchart" },
		{ stem: "Note ____ two", opts: null, pin: null },
	];

	function renderMixed() {
		return renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({
					type: "note",
					intro: "<p>Ghi chú riêng của giáo viên.</p>",
				})}
				parts={buildQuizParts(mixedQuestions, "note")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
	}

	it("mỗi cụm có header Questions X–Y + nhãn dạng bài + instruction chuẩn", () => {
		const html = renderMixed();
		expect(html).toContain("Questions 1–2");
		expect(html).toContain("True / False / Not Given");
		expect(html).toContain(
			"Do the following statements agree with the information given in the passage?",
		);
		expect(html).toContain("Questions 3");
		expect(html).toContain("Flow-chart completion");
		expect(html).toContain("Questions 4");
		expect(html).toContain("Note completion");
		// Section aria mô tả cụm.
		expect(html).toContain(
			'aria-label="Questions 1–2 · True / False / Not Given"',
		);
	});

	it("câu tfng trong đề note có pill lựa chọn (hết lỗi không chỗ nhập)", () => {
		const html = renderMixed();
		expect(html).toContain('aria-label="Câu 1"');
		expect(html).toContain('value="TRUE"');
		expect(html).toContain('value="NOT GIVEN"');
		// Câu note (type prompt) vẫn là cloze input.
		expect(html).toContain('aria-label="Điền đáp án câu 4"');
	});

	it("intro prompt vẫn render 1 lần phía trên, không lặp theo cụm", () => {
		const html = renderMixed();
		expect(html.indexOf("Ghi chú riêng của giáo viên.")).toBeGreaterThanOrEqual(
			0,
		);
		expect((html.match(/Ghi chú riêng của giáo viên\./g) ?? []).length).toBe(1);
	});

	it("đề cũ 1 type hiển thị 1 header cụm duy nhất", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[
						{ stem: "s1", opts: null, pin: null },
						{ stem: "s2", opts: null, pin: null },
					],
					"tfng",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Questions 1–2");
		expect(html).toContain("True / False / Not Given");
	});
});

describe("QuizPaper — option bank cho đề trộn dạng (#286 H2)", () => {
	it("hiện bank khi CÂU bankable trong prompt không-bankable", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({
					type: "summary", // p2, không bankable
					optionBank: ["Heading I", "Heading II"],
				})}
				parts={buildQuizParts(
					[
						{
							stem: "Paragraph A ____",
							opts: null,
							pin: null,
							type: "headings", // p2 bankable
						},
					],
					"summary",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Heading I");
	});

	it("prompt không bankable + không câu bankable → không có bank", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "note", optionBank: [] })}
				parts={buildQuizParts(
					[{ stem: "Note ____", opts: null, pin: null }],
					"note",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).not.toContain("Ngân hàng lựa chọn");
	});
});
