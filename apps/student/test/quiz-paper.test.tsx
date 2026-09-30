import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizPaper } from "@/components/quiz/quiz-paper";
import {
	type QuizChoiceRow,
	questionChoiceRows,
} from "@/components/quiz/quiz-question-item";

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
				parts={buildQuizParts(questions)}
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
				parts={buildQuizParts(questions)}
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
				parts={buildQuizParts(questions)}
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
				parts={buildQuizParts(questions)}
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
				parts={buildQuizParts(questions)}
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
				parts={buildQuizParts([clozeQuestion("Name: ____")])}
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
