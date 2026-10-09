import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { stripEssayControls } from "@teacher-os/ui/components/quiz/quiz-essay-input";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import {
	type QuizChoiceRow,
	questionChoiceRows,
} from "@teacher-os/ui/components/quiz/quiz-question-item";
import type { QuizReviewInfo } from "@teacher-os/ui/components/quiz/quiz-review-item";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

type PaperFields = Parameters<typeof QuizPaper>[0]["detail"];

const paperFields = (overrides: Partial<PaperFields> = {}): PaperFields => ({
	skill: "reading",
	type: "tfng",
	band: "6.5",
	intro: "Đọc đoạn văn và chọn TRUE / FALSE / NOT GIVEN.",
	prompt: "",
	passage: "<p>Đoạn đọc về kênh đào.</p>",
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

describe("QuizPaper — instruction giáo viên theo từng cụm (#301)", () => {
	const sectionQuestions: StudentQuizQuestion[] = Array.from(
		{ length: 6 },
		(_, i) => ({ stem: `Câu ${i + 1} ____`, opts: null, pin: null }),
	);
	const introSections =
		"<p>Read carefully.</p><p>Questions 1–2</p><p>Write TRUE or FALSE.</p>" +
		"<p>Questions 3–6 · Flow-chart completion — Write ONE WORD ONLY from the passage for each answer.</p>";

	function renderIntro(introValue: string) {
		return renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "note", intro: introValue })}
				parts={buildQuizParts(sectionQuestions, "note", introValue)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
	}

	it("header theo section: aria-label = Questions X–Y, không hậu tố dạng bài", () => {
		const html = renderIntro(introSections);
		expect(html).toContain('aria-label="Questions 1–2"');
		expect(html).toContain('aria-label="Questions 3–6"');
	});

	it("instruction của giáo viên đứng ngay trên đúng nhóm câu của nó", () => {
		const html = renderIntro(introSections);
		const writeTrue = html.indexOf("Write TRUE or FALSE.");
		expect(writeTrue).toBeGreaterThan(-1);
		expect(writeTrue).toBeLessThan(html.indexOf('data-question="0"'));
		const oneWord = html.indexOf("Write ONE WORD ONLY");
		expect(oneWord).toBeGreaterThan(html.indexOf('data-question="1"'));
		expect(oneWord).toBeLessThan(html.indexOf('data-question="2"'));
	});

	it("marker không lặp trong instruction; preamble 1 lần đứng trước header", () => {
		const html = renderIntro(introSections);
		// 2 lần = aria-label section + header h2; instruction không lặp marker.
		expect((html.match(/Questions 1–2/g) ?? []).length).toBe(2);
		expect((html.match(/Read carefully\./g) ?? []).length).toBe(1);
		expect(html.indexOf("Read carefully.")).toBeLessThan(
			html.indexOf("Questions 1–2"),
		);
	});

	it("section chỉ có marker → fallback nhãn + instruction chuẩn của map", () => {
		const html = renderIntro(
			"<p>Questions 1–2</p><p>Questions 3–6</p><p>x</p>",
		);
		expect(html).toContain("Note completion");
		expect(html).toContain(
			"Complete the notes below. Choose NO MORE THAN THREE WORDS",
		);
		expect(html).toContain('aria-label="Questions 1–2"');
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

describe("QuizPaper — đề Writing essay input (#304)", () => {
	const writingFields = paperFields({
		skill: "writing",
		type: "chart",
		prompt: "<p>The graph shows marriage and age…</p>",
		passage: "",
	});

	it("render textarea 'Bài viết của bạn', không empty-state", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={writingFields}
				parts={buildQuizParts([], "chart")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Bài viết của bạn");
		expect(html).toContain("quiz-essay-input");
		expect(html).toContain('spellCheck="false"');
		expect(html).not.toContain("không có câu hỏi tự chấm");
	});

	it("stripEssayControls bỏ C0 control char, giữ \\n \\t \\r (chặn wedge 413)", () => {
		expect(stripEssayControls("Line one\nLine two\u0007")).toBe(
			"Line one\nLine two",
		);
		expect(stripEssayControls("a\u0000b\u001Fc")).toBe("abc");
		// U+2028/U+2029 cũng escape 6 byte trong JSON — strip cùng lớp lỗi
		// (code-review F3, paste từ PDF/editor khác).
		expect(stripEssayControls("x\u2028y\u2029z")).toBe("xyz");
		expect(stripEssayControls("keep \n\t\r")).toBe("keep \n\t\r");
		expect(stripEssayControls("")).toBe("");
	});

	it("mode review: textarea readOnly, value từ answers[0] (đề đã nộp)", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={writingFields}
				parts={buildQuizParts([], "chart")}
				answers={{ 0: "Bài đã nộp." }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
			/>,
		);
		expect(html).toContain("readonly");
		expect(html).toContain("Bài đã nộp.");
	});

	it("đề Writing vi phạm invariant (có questions) → KHÔNG render essay, câu hỏi thật giữ nguyên", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={writingFields}
				parts={buildQuizParts(
					[{ stem: "Câu lạ", opts: null, pin: null }],
					"chart",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).not.toContain("Bài viết của bạn");
		// Fail-safe: widget câu hỏi vẫn render bình thường, không có key `0`
		// đè lẫn essay.
		expect(html).toContain("Câu lạ");
	});

	it("Reading không có textarea essay", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Câu 1", opts: null, pin: null }],
					"tfng",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).not.toContain("Bài viết của bạn");
	});
});

describe("QuizPaper — đề Speaking hiển thị đúng theo part (#305)", () => {
	const renderSpeaking = (overrides: Partial<PaperFields>) =>
		renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({
					skill: "speaking",
					type: "place",
					intro: "",
					passage: "",
					...overrides,
				})}
				parts={buildQuizParts([], "place")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);

	it("Part 2: cue card có topic + bullet, không empty-state", () => {
		const html = renderSpeaking({
			cueTopic: "a place you like to visit",
			cuePoints: "where it is\nwhy you like it",
		});
		expect(html).toContain("Describe a place you like to visit.");
		expect(html).toContain("You should say:");
		expect(html).toContain("<li>where it is</li>");
		expect(html).toContain("<li>why you like it</li>");
		expect(html).not.toContain("không có câu hỏi tự chấm");
	});

	it("Part 1: hiện câu hỏi prompt, không có cue card rỗng", () => {
		const html = renderSpeaking({
			prompt: "<p>Do you work or are you a student?</p>",
		});
		expect(html).toContain("Do you work or are you a student?");
		expect(html).not.toContain("Describe");
		expect(html).not.toContain("You should say:");
		expect(html).not.toContain("không có câu hỏi tự chấm");
	});

	it("intro của giáo viên hiện dưới eyebrow", () => {
		const html = renderSpeaking({
			intro: "<p>Hãy ghi âm trong một lần, không cắt ghép.</p>",
			cueTopic: "a book",
		});
		expect(html).toContain("Hãy ghi âm trong một lần");
		expect(html.indexOf("Hãy ghi âm")).toBeLessThan(html.indexOf("Describe"));
	});

	it("hướng dẫn thêm (note) của giáo viên hiện cho Speaking", () => {
		const html = renderSpeaking({
			note: "<p>Nói tự nhiên, không đọc giấy.</p>",
			cueTopic: "a book",
		});
		expect(html).toContain("Nói tự nhiên, không đọc giấy.");
	});

	it("Part 2 không hiện prompt cũ còn sót khi giáo viên đổi part", () => {
		const html = renderSpeaking({
			cueTopic: "a place you like to visit",
			prompt: "<p>Do you work or are you a student?</p>",
		});
		expect(html).toContain("Describe a place you like to visit.");
		expect(html).not.toContain("Do you work or are you a student?");
	});

	it("Reading không đổi: đề rỗng câu vẫn có empty-state", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts([], "tfng")}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("không có câu hỏi tự chấm");
	});
});

describe("QuizPaper mode=review — tô verdict từng câu (#351)", () => {
	const reviewInfo = (overrides: Partial<QuizReviewInfo>): QuizReviewInfo => ({
		verdict: "wrong",
		key: "B",
		alts: "",
		answer: "A",
		note: "",
		...overrides,
	});

	it("học viên chọn sai: hàng đã chọn 'Bạn chọn' gạch ngang verdict-wrong, hàng key 'Đáp án đúng' verdict-correct", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Statement 1.", opts: null, pin: null }],
					"tfng",
				)}
				answers={{ 0: "TRUE" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "wrong", key: "FALSE", answer: "TRUE" }),
				}}
			/>,
		);
		// Hàng đã chọn sai: gạch ngang + nhãn "Bạn chọn".
		expect(html).toContain("line-through");
		expect(html).toContain("Bạn chọn");
		// Hàng đáp án đúng: nhãn + viền xanh.
		expect(html).toContain("Đáp án đúng");
		expect(html).toContain("border-verdict-correct");
		expect(html).toContain("text-verdict-wrong");
		// Fieldset câu mang data-verdict + viền trái verdict.
		expect(html).toContain('data-verdict="wrong"');
		expect(html).toContain("border-l-verdict-wrong");
	});

	it("học viên chọn đúng: hàng đã chọn có ✓, không nhãn 'Đáp án đúng'/'Bạn chọn'", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Statement 1.", opts: null, pin: null }],
					"tfng",
				)}
				answers={{ 0: "TRUE" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "correct", key: "TRUE", answer: "TRUE" }),
				}}
			/>,
		);
		expect(html).toContain("text-verdict-correct");
		// Icon ✓ ở 2 chỗ: chip verdict + cuối hàng đã chọn (check path SVG).
		expect(
			(html.match(/M2 6\.5 5 9\.5 10 3\.5/g) ?? []).length,
		).toBeGreaterThanOrEqual(2);
		expect(html).not.toContain("Đáp án đúng");
		expect(html).not.toContain("Bạn chọn");
	});

	it("bỏ qua: hàng đáp án đúng được đánh dấu; khối câu viền đứt", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Statement 1.", opts: null, pin: null }],
					"tfng",
				)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "skipped", key: "TRUE", answer: null }),
				}}
			/>,
		);
		expect(html).toContain("Đáp án đúng");
		expect(html).toContain('data-verdict="skipped"');
		expect(html).toContain("border-l-meta border-dashed");
	});

	it("review không còn text-hot; câu đang mở có outline cam đè nền verdict", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Statement 1.", opts: null, pin: null }],
					"tfng",
				)}
				answers={{ 0: "TRUE" }}
				onAnswer={() => undefined}
				currentQuestion={0}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "correct", key: "TRUE", answer: "TRUE" }),
				}}
			/>,
		);
		expect(html).not.toContain("text-hot");
		// Câu current trong review: outline cam đè LÊN nền verdict (F1 #351),
		// không dùng bg-accent-soft vì nó xoá nền verdict của khối câu.
		expect(html).toContain("outline-hot");
		expect(html).not.toContain("bg-accent-soft");
	});

	it("câu MCQ đánh dấu hàng key theo rule normalize của grader (letter)", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "mcq3" })}
				parts={buildQuizParts(
					[
						{
							stem: "What binds the model?",
							opts: ["Glue", "Tape", "Nails"],
							pin: null,
						},
					],
					"mcq4",
				)}
				answers={{ 0: "B" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "wrong", key: "A", answer: "B" }),
				}}
			/>,
		);
		// Hàng A (key) được đánh dấu dù học viên chọn B.
		expect(html).toContain("Đáp án đúng");
		expect(html).toContain("Bạn chọn");
	});

	it("câu cloze review: ô input tô viền dưới theo verdict", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts(
					[{ stem: "The river ____ the city.", opts: null, pin: null }],
					"shortans",
				)}
				answers={{ 0: "northside" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({
						verdict: "wrong",
						key: "north",
						answer: "northside",
					}),
				}}
			/>,
		);
		expect(html).toContain("border-b-verdict-wrong");
		expect(html).toContain("line-through");
		expect(html).toContain("disabled:opacity-100");
	});

	it("take mode: không có class verdict, không nhãn phụ, giữ text-hot cho selected", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(
					[{ stem: "Statement 1.", opts: null, pin: null }],
					"tfng",
				)}
				answers={{ 0: "TRUE" }}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).not.toContain("data-verdict");
		expect(html).not.toContain("Đáp án đúng");
		expect(html).not.toContain("Bạn chọn");
		expect(html).toContain("text-hot");
	});
});
