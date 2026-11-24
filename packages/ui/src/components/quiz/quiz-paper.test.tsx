// @vitest-environment jsdom

import {
	buildQuizParts,
	buildQuizPartsFromGroups,
	type QuizPart,
} from "@teacher-os/api/lib/quiz-parts";
import * as quizInstructionModule from "@teacher-os/ui/lib/quiz-instruction";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizPaper, type QuizPaperDetail } from "./quiz-paper";
import { questionChoiceRows } from "./quiz-question-item";
import type { QuizReviewInfo } from "./quiz-review-item";

vi.mock("@teacher-os/ui/lib/quiz-instruction", { spy: true });

afterEach(cleanup);

const baseDetail = (
	overrides: Partial<QuizPaperDetail> = {},
): QuizPaperDetail => ({
	skill: "reading",
	type: "mcq_many",
	band: "6.5",
	intro: "",
	prompt: "",
	passage: "<p>Reading passage.</p>",
	cueTopic: "",
	cuePoints: "",
	audioName: "",
	imageUrl: "",
	optionBank: [],
	...overrides,
});

describe("QuizPaper — Wave 2A (mcq_many, extended banks, summary word bank, diagram)", () => {
	it("groups consecutive mcq_many questions by answerSet into a multi-select card, sorts answers A–H, and disables remaining checkboxes at limit K", () => {
		const part: QuizPart = {
			id: "part-1",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "mcq_many",
			source: "group",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Which TWO reasons are given for the decline?",
					opts: ["Cost", "Weather", "Pollution", "Staffing", "Policy"],
					pin: null,
					type: "mcq_many",
					answerSet: "set-1",
				},
				{
					q: 1,
					number: 2,
					stem: "Which TWO reasons are given for the decline?",
					opts: ["Cost", "Weather", "Pollution", "Staffing", "Policy"],
					pin: null,
					type: "mcq_many",
					answerSet: "set-1",
				},
			],
		};

		function Harness() {
			const [answers, setAnswers] = useState<Record<number, string>>({});
			return (
				<div>
					<QuizPaper
						detail={baseDetail()}
						parts={[part]}
						answers={answers}
						onAnswer={(q, value) =>
							setAnswers((prev) => ({ ...prev, [q]: value }))
						}
						currentQuestion={null}
					/>
					<pre data-testid="answers">{JSON.stringify(answers)}</pre>
				</div>
			);
		}

		const { container, getByLabelText, getByTestId } = render(<Harness />);
		expect(container.textContent).toContain("Questions 1–2");
		expect(container.textContent).toContain("Chọn 2 đáp án");
		expect(container.textContent).toContain(
			"Which TWO reasons are given for the decline?",
		);

		const boxA = getByLabelText("Questions 1–2 lựa chọn A") as HTMLInputElement;
		const boxB = getByLabelText("Questions 1–2 lựa chọn B") as HTMLInputElement;
		const boxD = getByLabelText("Questions 1–2 lựa chọn D") as HTMLInputElement;
		const boxE = getByLabelText("Questions 1–2 lựa chọn E") as HTMLInputElement;

		// Click D first, then B -> answers stored in ascending option order: {0: "B", 1: "D"}
		fireEvent.click(boxD);
		expect(JSON.parse(getByTestId("answers").textContent ?? "{}")).toEqual({
			"0": "D",
		});

		fireEvent.click(boxB);
		expect(JSON.parse(getByTestId("answers").textContent ?? "{}")).toEqual({
			"0": "B",
			"1": "D",
		});

		// Limit K=2 reached -> unchecked boxes disabled, checked boxes remain enabled
		expect(boxB.checked).toBe(true);
		expect(boxD.checked).toBe(true);
		expect(boxA.disabled).toBe(true);
		expect(boxE.disabled).toBe(true);
		expect(boxB.disabled).toBe(false);

		// Uncheck B -> answers shift to {0: "D", 1: ""}, boxA re-enabled
		fireEvent.click(boxB);
		expect(JSON.parse(getByTestId("answers").textContent ?? "{}")).toEqual({
			"0": "D",
			"1": "",
		});
		expect(boxA.disabled).toBe(false);
	});

	it("clusters consecutive mcq_many questions by stem+opts fallback when answerSet is absent", () => {
		const part: QuizPart = {
			id: "part-1",
			label: "Questions 3–4",
			qStart: 3,
			typeId: "mcq_many",
			source: "group",
			questions: [
				{
					q: 2,
					number: 3,
					stem: "Pick TWO",
					opts: ["Alpha", "Beta", "Gamma"],
					pin: null,
					type: "mcq_many",
				},
				{
					q: 3,
					number: 4,
					stem: "Pick TWO",
					opts: ["Alpha", "Beta", "Gamma"],
					pin: null,
					type: "mcq_many",
				},
			],
		};
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail()}
				parts={[part]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Questions 3–4");
		expect(html).toContain("Chọn 2 đáp án");
		expect(html).toContain('id="quiz-q-3"');
		expect(html).toContain('id="quiz-q-4"');
	});

	it("renders mcq_many reviewMode with per-option badges, verdict chips, keys, and explanation", () => {
		const part: QuizPart = {
			id: "part-1",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "mcq_many",
			source: "group",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Which TWO?",
					opts: ["Opt A", "Opt B", "Opt C", "Opt D"],
					pin: null,
					type: "mcq_many",
					answerSet: "set-r",
				},
				{
					q: 1,
					number: 2,
					stem: "Which TWO?",
					opts: ["Opt A", "Opt B", "Opt C", "Opt D"],
					pin: null,
					type: "mcq_many",
					answerSet: "set-r",
				},
			],
		};
		const review: Record<number, QuizReviewInfo> = {
			0: {
				verdict: "correct",
				key: "A",
				alts: "",
				answer: "A",
				note: "",
				explanation: "<p>Vì đoạn 1 nói rõ A và D.</p>",
			},
			1: {
				verdict: "wrong",
				key: "D",
				alts: "",
				answer: "C",
				note: "",
			},
		};
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail()}
				parts={[part]}
				answers={{ 0: "A", 1: "C" }}
				onAnswer={vi.fn()}
				currentQuestion={null}
				mode="review"
				review={review}
			/>,
		);
		expect(html).toContain("Đúng");
		expect(html).toContain("Bạn chọn");
		expect(html).toContain("Đáp án đúng");
		expect(html).toContain("A, D");
		expect(html).toContain("Vì đoạn 1 nói rõ A và D.");
	});

	it("renders summary with > 8 word bank items (A–J) on grouped part", () => {
		const wordBank = Array.from({ length: 10 }, (_, i) => `word-${i + 1}`);
		const part: QuizPart = {
			id: "part-summary",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "summary",
			source: "group",
			optionBank: wordBank,
			questions: [
				{
					q: 0,
					number: 1,
					stem: "First ____ blank.",
					opts: null,
					pin: null,
					type: "summary",
				},
				{
					q: 1,
					number: 2,
					stem: "Second ____ blank.",
					opts: null,
					pin: null,
					type: "summary",
				},
			],
		};
		const rows = questionChoiceRows(part.questions[0], "summary", wordBank);
		expect(rows.map((r) => r.value)).toEqual([
			"A",
			"B",
			"C",
			"D",
			"E",
			"F",
			"G",
			"H",
			"I",
			"J",
		]);

		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({ type: "summary" })}
				parts={[part]}
				answers={{ 0: "J" }}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("word-10");
		expect(html).toContain(">J<");
		expect(html).toContain('checked="" value="J"');
	});

	it("renders headings with > 8 items (i–xii) cleanly", () => {
		const headingBank = Array.from(
			{ length: 12 },
			(_, i) => `Heading text ${i + 1}`,
		);
		const part: QuizPart = {
			id: "part-headings",
			label: "Questions 14–15",
			qStart: 14,
			typeId: "headings",
			source: "group",
			optionBank: headingBank,
			questions: [
				{
					q: 13,
					number: 14,
					stem: "Paragraph A",
					opts: null,
					pin: null,
					type: "headings",
				},
				{
					q: 14,
					number: 15,
					stem: "Paragraph B",
					opts: null,
					pin: null,
					type: "headings",
				},
			],
		};
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({ type: "headings" })}
				parts={[part]}
				answers={{ 13: "xii" }}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Heading text 12");
		expect(html).toContain(">xii<");
		expect(html).toContain('checked="" value="xii"');
	});

	it("renders diagram without pins as image alongside ClozeStemText inputs", () => {
		const part: QuizPart = {
			id: "part-diagram",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "diagram",
			source: "group",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Water enters through the ____ pipe.",
					opts: null,
					pin: null,
					type: "diagram",
				},
				{
					q: 1,
					number: 2,
					stem: "Pressure builds in the ____ chamber.",
					opts: null,
					pin: null,
					type: "diagram",
				},
			],
		};
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({
					type: "diagram",
					imageUrl: "https://example.com/pump.png",
				})}
				parts={[part]}
				answers={{ 0: "inlet" }}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain('src="https://example.com/pump.png"');
		expect(html).toContain('alt="Ảnh đề bài"');
		expect(html).toContain('aria-label="Điền đáp án câu 1"');
		expect(html).toContain('value="inlet"');
		expect(html).toContain('aria-label="Điền đáp án câu 2"');
	});

	it("summary bật cả [table] stem và optionBank render nhãn Hàng — Cột thay vì prefix thô", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({
					type: "summary",
					optionBank: ["water", "steam"],
				})}
				parts={[
					{
						id: "p1",
						label: "Questions 1",
						qStart: 1,
						typeId: "summary",
						optionBank: ["water", "steam"],
						source: "group",
						questions: [
							{
								q: 0,
								number: 1,
								stem: "[table] r1 c1: Input / State",
								opts: null,
								type: "summary",
							},
						],
					},
				]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain("Hàng 1 — Cột 1: Input / State");
		expect(html).not.toContain("[table]");
	});

	it("mcq 3 lựa chọn đồng nhất hiển thị instruction A, B or C; trộn 3 và 4 lựa chọn dùng instruction trung tính", () => {
		const threeOnly = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({ type: "mcq" })}
				parts={[
					{
						id: "p1",
						label: "Questions 1–2",
						qStart: 1,
						typeId: "mcq",
						questions: [
							{
								q: 0,
								number: 1,
								stem: "Q1",
								opts: ["Opt A", "Opt B", "Opt C"],
								type: "mcq",
							},
							{
								q: 1,
								number: 2,
								stem: "Q2",
								opts: ["Opt A", "Opt B", "Opt C"],
								type: "mcq",
							},
						],
					},
				]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(threeOnly).toContain("Choose the correct letter A, B or C.");
		expect(threeOnly).not.toContain("Choose the correct letter A, B, C or D.");

		const mixed = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({ type: "mcq" })}
				parts={[
					{
						id: "p1",
						label: "Questions 1–2",
						qStart: 1,
						typeId: "mcq",
						questions: [
							{
								q: 0,
								number: 1,
								stem: "Q1",
								opts: ["Opt A", "Opt B", "Opt C"],
								type: "mcq",
							},
							{
								q: 1,
								number: 2,
								stem: "Q2",
								opts: ["Opt A", "Opt B", "Opt C", "Opt D"],
								type: "mcq",
							},
						],
					},
				]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(mixed).toContain("Choose the correct letter.");
		expect(mixed).not.toContain("Choose the correct letter A, B, C or D.");
	});
});

describe("QuizPaper — header omits difficulty band", () => {
	it("renders skill without band in take mode when level is absent", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({
					skill: "listening",
					band: "7.0",
					level: undefined,
				})}
				parts={[]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(html).toContain(">Listening</p>");
		expect(html).not.toContain("Band");
		expect(html).not.toContain("7.0");
	});

	it("renders skill and level without band in review mode", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={baseDetail({
					skill: "listening",
					band: "7.0",
					level: "IELTS Academic",
				})}
				parts={[]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
				mode="review"
				review={{}}
			/>,
		);
		expect(html).toContain(">Listening · IELTS Academic</p>");
		expect(html).not.toContain("Band");
		expect(html).not.toContain("7.0");
	});
});

describe("QuizPaper — inline answer inputs", () => {
	it("renders inline text inputs inside structured table instructions, hides duplicated fieldsets, wraps table in overflow-x-auto, and sizes width from learner value", () => {
		const part: QuizPart = {
			id: "part-notes",
			label: "Questions 1–3",
			qStart: 1,
			typeId: "notes",
			source: "group",
			instructionHtml:
				"<p>Complete the notes below. Write ONE WORD ONLY.</p><table><tbody><tr><td><ul><li>Instruments made of <strong>(1)</strong></li><li>Singing at <strong>(2)</strong> events</li><li>Publishers had <strong>(3)</strong> there</li></ul></td></tr></tbody></table>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Instruments made of ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 1,
					number: 2,
					stem: "Singing at ____ events",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 2,
					number: 3,
					stem: "Publishers had ____ there",
					opts: null,
					pin: null,
					type: "notes",
				},
			],
		};

		const onAnswerSpy = vi.fn();

		function Harness() {
			const [answers, setAnswers] = useState<Record<number, string>>({});
			return (
				<QuizPaper
					detail={baseDetail({
						skill: "listening",
						type: "notes",
						passage: "",
					})}
					parts={[part]}
					answers={answers}
					onAnswer={(q, value) => {
						onAnswerSpy(q, value);
						setAnswers((prev) => ({ ...prev, [q]: value }));
					}}
					currentQuestion={0}
				/>
			);
		}

		const { container, getAllByTestId, getByLabelText } = render(<Harness />);

		expect(getAllByTestId("quiz-inline-instruction")).toHaveLength(1);
		expect(
			getAllByTestId("quiz-inline-badge").map((el) => el.textContent),
		).toEqual(["1", "2", "3"]);
		expect(container.querySelectorAll("fieldset[data-question]")).toHaveLength(
			0,
		);

		const table = container.querySelector("table");
		expect(table).not.toBeNull();
		expect(table?.parentElement?.className).toContain("overflow-x-auto");

		const input1 = getByLabelText("Điền đáp án câu 1") as HTMLInputElement;
		const input2 = getByLabelText("Điền đáp án câu 2") as HTMLInputElement;
		expect(input1.id).toBe("quiz-q-1");
		expect(input2.id).toBe("quiz-q-2");
		expect(input1.style.width).toBe("8ch");

		fireEvent.change(input1, { target: { value: "instruments" } });
		expect(onAnswerSpy).toHaveBeenCalledWith(0, "instruments");
		expect(input1.value).toBe("instruments");
		expect(input1.style.width).toBe("13ch");
	});

	it("renders option bank above inline select slots with offset markers, formatted option labels, and unified 1-based badges", () => {
		const part: QuizPart = {
			id: "part-matching",
			label: "Questions 4–5",
			qStart: 4,
			typeId: "matching",
			source: "group",
			instructionHtml:
				"<p>Choose the correct letter A–C.</p><ul><li>Museum 1: <strong>(14)</strong></li><li>Museum 2: <strong>(15)</strong></li></ul>",
			optionBank: ["Earth science", "Astronomy science", "Decoration and art"],
			questions: [
				{
					q: 3,
					number: 4,
					stem: "Museum 1",
					opts: null,
					pin: null,
					type: "matching",
				},
				{
					q: 4,
					number: 5,
					stem: "Museum 2",
					opts: null,
					pin: null,
					type: "matching",
				},
			],
		};

		const onAnswer = vi.fn();
		const {
			container,
			getAllByTestId,
			getByLabelText,
			getByTestId,
			getByText,
		} = render(
			<QuizPaper
				detail={baseDetail({
					skill: "listening",
					type: "matching",
					passage: "",
				})}
				parts={[part]}
				answers={{}}
				onAnswer={onAnswer}
				currentQuestion={null}
			/>,
		);

		const section = container.querySelector(
			'section[aria-label="Questions 4–5"]',
		);
		expect(section).not.toBeNull();

		const bankHeading = getByText("Ngân hàng lựa chọn");
		const inlineInstruction = getByTestId("quiz-inline-instruction");
		expect(
			Boolean(
				bankHeading.compareDocumentPosition(inlineInstruction) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			),
		).toBe(true);

		expect(
			getAllByTestId("quiz-inline-badge").map((el) => el.textContent),
		).toEqual(["4", "5"]);
		expect(container.querySelectorAll("fieldset[data-question]")).toHaveLength(
			0,
		);

		const select4 = getByLabelText("Chọn đáp án câu 4") as HTMLSelectElement;
		expect(select4.id).toBe("quiz-q-4");
		const optionLabels = Array.from(select4.options).map(
			(opt) => opt.textContent,
		);
		expect(optionLabels).toEqual([
			"— Chọn —",
			"A — Earth science",
			"B — Astronomy science",
			"C — Decoration and art",
		]);

		fireEvent.change(select4, { target: { value: "C" } });
		expect(onAnswer).toHaveBeenCalledWith(3, "C");
	});

	it("renders unbound questions as fallback QuizQuestionItem blocks on partial marker matches", () => {
		const part: QuizPart = {
			id: "part-partial",
			label: "Questions 1–3",
			qStart: 1,
			typeId: "notes",
			source: "group",
			instructionHtml:
				"<p>First blank <strong>(1)</strong> and second blank <strong>(2)</strong>.</p>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "First ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 1,
					number: 2,
					stem: "Second ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 2,
					number: 3,
					stem: "Fallback third ____",
					opts: null,
					pin: null,
					type: "notes",
				},
			],
		};

		const { container, getAllByTestId, getByLabelText } = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "notes", passage: "" })}
				parts={[part]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);

		expect(getAllByTestId("quiz-inline-slot")).toHaveLength(2);
		expect(
			getAllByTestId("quiz-inline-badge").map((el) => el.textContent),
		).toEqual(["1", "2"]);

		const fallbackFieldsets = container.querySelectorAll(
			"fieldset[data-question]",
		);
		expect(fallbackFieldsets).toHaveLength(1);
		expect(fallbackFieldsets[0]?.getAttribute("data-question")).toBe("2");
		expect(getByLabelText("Điền đáp án câu 3")).toBeTruthy();
	});

	it("renders review mode with disabled controls, verdicts, key hints, collapsible details, and anchor placement differences", () => {
		const notesPart: QuizPart = {
			id: "part-review-notes",
			label: "Questions 1–3",
			qStart: 1,
			typeId: "notes",
			source: "group",
			instructionHtml:
				"<p>One <strong>(1)</strong>, two <strong>(2)</strong>, three <strong>(3)</strong>.</p>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "One ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 1,
					number: 2,
					stem: "Two ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 2,
					number: 3,
					stem: "Three ____",
					opts: null,
					pin: null,
					type: "notes",
				},
			],
		};
		const matchingPart: QuizPart = {
			id: "part-review-matching",
			label: "Questions 4–5",
			qStart: 4,
			typeId: "matching",
			source: "group",
			instructionHtml:
				"<p>Four <strong>(4)</strong>, five <strong>(5)</strong>.</p>",
			optionBank: ["Earth science", "Astronomy science", "Decoration and art"],
			questions: [
				{
					q: 3,
					number: 4,
					stem: "Four",
					opts: null,
					pin: null,
					type: "matching",
				},
				{
					q: 4,
					number: 5,
					stem: "Five",
					opts: null,
					pin: null,
					type: "matching",
				},
			],
		};

		const review: Record<number, QuizReviewInfo> = {
			0: {
				verdict: "correct",
				key: "brass",
				alts: "metal",
				answer: "brass",
				note: "",
				explanation: "<p>Brass instruments were played outdoors.</p>",
			},
			1: {
				verdict: "wrong",
				key: "sports",
				alts: "",
				answer: "music",
				note: "",
				explanation: "<p>People sang at sports events.</p>",
			},
			2: {
				verdict: "skipped",
				key: "offices",
				alts: "",
				answer: null,
				note: "",
				explanation: "<p>Publishers had offices on Tin Pan Alley.</p>",
			},
			3: {
				verdict: "correct",
				key: "C",
				alts: "",
				answer: "C",
				note: "",
			},
			4: {
				verdict: "wrong",
				key: "A",
				alts: "",
				answer: "B",
				note: "",
			},
		};

		// Take mode anchor check: anchors live directly on <input> / <select>
		const takeRender = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "notes", passage: "" })}
				parts={[notesPart, matchingPart]}
				answers={{ 0: "brass", 3: "C" }}
				onAnswer={vi.fn()}
				currentQuestion={0}
				mode="take"
			/>,
		);
		expect(takeRender.container.querySelector("input#quiz-q-1")).not.toBeNull();
		expect(
			takeRender.container.querySelector("select#quiz-q-4"),
		).not.toBeNull();
		expect(
			takeRender.container.querySelector('span[id="quiz-q-1"]'),
		).toBeNull();
		cleanup();

		// Review mode check
		const { container, getAllByTestId, getByLabelText } = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "notes", passage: "" })}
				parts={[notesPart, matchingPart]}
				answers={{ 0: "brass", 1: "music", 3: "C", 4: "B" }}
				onAnswer={vi.fn()}
				currentQuestion={1}
				mode="review"
				review={review}
			/>,
		);

		const input1 = getByLabelText("Điền đáp án câu 1") as HTMLInputElement;
		const input2 = getByLabelText("Điền đáp án câu 2") as HTMLInputElement;
		const input3 = getByLabelText("Điền đáp án câu 3") as HTMLInputElement;
		const select4 = getByLabelText("Chọn đáp án câu 4") as HTMLSelectElement;
		const select5 = getByLabelText("Chọn đáp án câu 5") as HTMLSelectElement;

		expect(input1.disabled).toBe(true);
		expect(input2.disabled).toBe(true);
		expect(input3.disabled).toBe(true);
		expect(input3.placeholder).toBe("—");
		expect(select4.disabled).toBe(true);
		expect(select5.disabled).toBe(true);

		// Review anchors live on wrapper <span> with tabIndex=-1 (disabled inputs cannot be focused)
		expect(input1.id).toBe("");
		expect(select4.id).toBe("");
		const slot = (q: number) =>
			container.querySelector(
				`[data-testid="quiz-inline-slot"][data-question="${q}"]`,
			);
		for (const q of [0, 1, 2, 3, 4]) {
			const el = slot(q);
			expect(el?.id).toBe(`quiz-q-${q + 1}`);
			expect(el?.getAttribute("tabindex")).toBe("-1");
			expect(el?.querySelector("svg")).not.toBeNull();
		}

		expect(slot(0)?.getAttribute("data-verdict")).toBe("correct");
		expect(slot(1)?.getAttribute("data-verdict")).toBe("wrong");
		expect(slot(2)?.getAttribute("data-verdict")).toBe("skipped");
		expect(slot(3)?.getAttribute("data-verdict")).toBe("correct");
		expect(slot(4)?.getAttribute("data-verdict")).toBe("wrong");
		expect(slot(1)?.className).toContain("ring-2");

		// Inline key hint renders ONLY on wrong/skipped slots
		expect(
			slot(0)?.querySelector('[data-testid="quiz-inline-key"]'),
		).toBeNull();
		expect(
			slot(1)?.querySelector('[data-testid="quiz-inline-key"]')?.textContent,
		).toBe("→ sports");
		expect(
			slot(2)?.querySelector('[data-testid="quiz-inline-key"]')?.textContent,
		).toBe("→ offices");
		expect(
			slot(3)?.querySelector('[data-testid="quiz-inline-key"]'),
		).toBeNull();
		expect(
			slot(4)?.querySelector('[data-testid="quiz-inline-key"]')?.textContent,
		).toBe("→ A");

		// Collapsible details block starts collapsed and includes chips, alts, and explanations
		const detailsBlocks = getAllByTestId(
			"quiz-inline-review-details",
		) as HTMLDetailsElement[];
		expect(detailsBlocks).toHaveLength(2);
		expect(detailsBlocks[0]?.open).toBe(false);
		expect(detailsBlocks[0]?.textContent).toContain(
			"Đáp án & Giải thích (3 câu)",
		);
		expect(detailsBlocks[0]?.textContent).toContain("thay thế: metal");
		expect(detailsBlocks[0]?.textContent).toContain("Giải thích");
		expect(detailsBlocks[0]?.textContent).toContain(
			"Brass instruments were played outdoors.",
		);
		expect(
			Array.from(
				detailsBlocks[0]?.querySelectorAll(
					'[data-testid="quiz-review-chip"]',
				) ?? [],
			).map((el) => el.textContent),
		).toEqual(["Đúng", "music", "Chưa trả lời"]);
		expect(
			detailsBlocks[0]?.querySelectorAll('[data-testid="quiz-review-item"]'),
		).toHaveLength(3);
	});

	it("consumes single-part detail.intro markers inline without rendering a duplicate top RichTextBody", () => {
		const part: QuizPart = {
			id: "part-intro",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "notes",
			questions: [
				{ q: 0, number: 1, stem: "Name ____", opts: null, pin: null },
				{ q: 1, number: 2, stem: "Destination ____", opts: null, pin: null },
			],
		};

		const { container, getAllByTestId } = render(
			<QuizPaper
				detail={baseDetail({
					skill: "listening",
					type: "notes",
					passage: "",
					intro:
						"<p>UNIQUE_INTRO_HEADING: Name <strong>(1)</strong> to <strong>(2)</strong>.</p>",
				})}
				parts={[part]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);

		expect(getAllByTestId("quiz-inline-instruction")).toHaveLength(1);
		expect(getAllByTestId("quiz-inline-slot")).toHaveLength(2);
		expect(container.querySelectorAll("fieldset[data-question]")).toHaveLength(
			0,
		);
		const introOccurrences = (
			container.textContent?.match(/UNIQUE_INTRO_HEADING/g) ?? []
		).length;
		expect(introOccurrences).toBe(1);
	});

	it("excludes MCQ questions with opts and PinOverlay questions from inline slot conversion", () => {
		const mcqPart: QuizPart = {
			id: "part-mcq",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "mcq",
			source: "group",
			instructionHtml:
				"<p>Answer <strong>(1)</strong> and <strong>(2)</strong>.</p>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Question 1",
					opts: ["Option A", "Option B"],
					pin: null,
					type: "mcq",
				},
				{
					q: 1,
					number: 2,
					stem: "Question 2",
					opts: ["Option A", "Option B"],
					pin: null,
					type: "mcq",
				},
			],
		};

		const mcqRender = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "mcq", passage: "" })}
				parts={[mcqPart]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(
			mcqRender.container.querySelector(
				'[data-testid="quiz-inline-instruction"]',
			),
		).toBeNull();
		expect(
			mcqRender.container.querySelectorAll("fieldset[data-question]"),
		).toHaveLength(2);
		cleanup();

		const pinPart: QuizPart = {
			id: "part-pin",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "map",
			source: "group",
			instructionHtml:
				"<p>Label <strong>(1)</strong> and <strong>(2)</strong> on the map.</p>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Entrance",
					opts: null,
					pin: { x: 25, y: 30 },
					type: "map",
				},
				{
					q: 1,
					number: 2,
					stem: "Exit",
					opts: null,
					pin: { x: 75, y: 60 },
					type: "map",
				},
			],
		};

		const pinRender = render(
			<QuizPaper
				detail={baseDetail({
					skill: "listening",
					type: "map",
					passage: "",
					imageUrl: "https://example.com/map.png",
				})}
				parts={[pinPart]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);
		expect(
			pinRender.container.querySelector(
				'[data-testid="quiz-inline-instruction"]',
			),
		).toBeNull();
		expect(
			pinRender.container.querySelectorAll("fieldset[data-question]"),
		).toHaveLength(2);
	});

	it("sanitizes malicious HTML payloads in instructionHtml while keeping inline slots interactive", () => {
		const part: QuizPart = {
			id: "part-xss",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "notes",
			source: "group",
			instructionHtml:
				'<script>window.__xss=1</script><img src="x" onerror="window.__xss=2" /><p>Safe <a href="javascript:alert(1)">bad-link</a> <a href="https://example.com/help">help</a> <strong>(1)</strong> and <strong>(2)</strong>.</p>',
			questions: [
				{
					q: 0,
					number: 1,
					stem: "One ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 1,
					number: 2,
					stem: "Two ____",
					opts: null,
					pin: null,
					type: "notes",
				},
			],
		};

		const { container, getAllByTestId, getByText } = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "notes", passage: "" })}
				parts={[part]}
				answers={{}}
				onAnswer={vi.fn()}
				currentQuestion={null}
			/>,
		);

		expect(getAllByTestId("quiz-inline-slot")).toHaveLength(2);
		expect(container.querySelector("script")).toBeNull();
		expect(container.querySelector("img")).toBeNull();
		expect(container.innerHTML).not.toContain("onerror");
		expect(container.innerHTML).not.toContain("javascript:");

		const badLink = getByText("bad-link");
		expect(badLink.tagName).toBe("SPAN");

		const goodLink = getByText("help") as HTMLAnchorElement;
		expect(goodLink.tagName).toBe("A");
		expect(goodLink.getAttribute("href")).toBe("https://example.com/help");
		expect(goodLink.getAttribute("target")).toBe("_blank");
		expect(goodLink.getAttribute("rel")).toBe("noopener noreferrer");
	});

	it("excludes tfng, ynng, and optionless mcq from inline binding even when detail.optionBank is present", () => {
		for (const excludedType of ["tfng", "ynng", "mcq"] as const) {
			const part: QuizPart = {
				id: `part-${excludedType}`,
				label: "Questions 1–2",
				qStart: 1,
				typeId: excludedType,
				source: "group",
				instructionHtml:
					"<p>Check statements <strong>(1)</strong> and <strong>(2)</strong>.</p>",
				questions: [
					{
						q: 0,
						number: 1,
						stem: "First standalone statement",
						opts: null,
						pin: null,
						type: excludedType,
					},
					{
						q: 1,
						number: 2,
						stem: "Second standalone statement",
						opts: null,
						pin: null,
						type: excludedType,
					},
				],
			};

			const { container } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "headings",
						optionBank: ["Heading One", "Heading Two", "Heading Three"],
					})}
					parts={[part]}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);

			expect(
				container.querySelector('[data-testid="quiz-inline-instruction"]'),
			).toBeNull();
			expect(
				container.querySelectorAll("fieldset[data-question]"),
			).toHaveLength(2);
			expect(container.textContent).toContain("First standalone statement");
			expect(container.textContent).not.toContain("TRUE — Heading One");
			expect(container.textContent).not.toContain("YES — Heading One");
			cleanup();
		}
	});

	it("preserves stale submitted select values in review, formats skipped selects, caps input width, and resets inherited typography", () => {
		const notesPart: QuizPart = {
			id: "part-long",
			label: "Questions 1–2",
			qStart: 1,
			typeId: "notes",
			source: "group",
			instructionHtml:
				"<p><strong><strong>(1)</strong> centre</strong> and <em><strong>(2)</strong></em></p>",
			questions: [
				{
					q: 0,
					number: 1,
					stem: "Q1 ____",
					opts: null,
					pin: null,
					type: "notes",
				},
				{
					q: 1,
					number: 2,
					stem: "Q2 ____",
					opts: null,
					pin: null,
					type: "notes",
				},
			],
		};
		const matchingPart: QuizPart = {
			id: "part-stale-bank",
			label: "Questions 3–4",
			qStart: 3,
			typeId: "matching",
			source: "group",
			instructionHtml:
				"<ul><li>Museum 1: <strong>(3)</strong></li><li>Museum 2: <strong>(4)</strong></li></ul>",
			optionBank: ["Earth science", "Astronomy science", "Decoration and art"],
			questions: [
				{
					q: 2,
					number: 3,
					stem: "M1",
					opts: null,
					pin: null,
					type: "matching",
				},
				{
					q: 3,
					number: 4,
					stem: "M2",
					opts: null,
					pin: null,
					type: "matching",
				},
			],
		};

		const longAnswer = "a".repeat(120);
		const { container, getByLabelText } = render(
			<QuizPaper
				detail={baseDetail({ skill: "listening", type: "notes", passage: "" })}
				parts={[notesPart, matchingPart]}
				answers={{ 0: longAnswer, 2: "F", 3: "" }}
				onAnswer={vi.fn()}
				currentQuestion={null}
				mode="review"
				review={{
					0: {
						verdict: "wrong",
						key: "city",
						alts: "",
						answer: longAnswer,
						note: "",
					},
					1: {
						verdict: "skipped",
						key: "hall",
						alts: "",
						answer: null,
						note: "",
					},
					2: { verdict: "wrong", key: "C", alts: "", answer: "F", note: "" },
					3: { verdict: "skipped", key: "A", alts: "", answer: null, note: "" },
				}}
			/>,
		);

		const input1 = getByLabelText("Điền đáp án câu 1") as HTMLInputElement;
		expect(input1.style.width).toBe("36ch");

		const slot0 = container.querySelector(
			'[data-testid="quiz-inline-slot"][data-question="0"]',
		);
		expect(slot0?.className).toContain("font-normal");
		expect(slot0?.className).toContain("not-italic");
		expect(slot0?.className).toContain("no-underline");

		// Stale submitted value "F" outside shortened A-C optionBank remains visible in <select>.
		const select3 = getByLabelText("Chọn đáp án câu 3") as HTMLSelectElement;
		expect(select3.className).toContain("select-chevron");
		expect(select3.value).toBe("F");
		expect(Array.from(select3.options).some((opt) => opt.value === "F")).toBe(
			true,
		);

		// Skipped <select> shows "—" instead of "— Chọn —".
		const select4 = getByLabelText("Chọn đáp án câu 4") as HTMLSelectElement;
		expect(select4.options[0]?.textContent).toBe("—");
	});

	describe("QuizPaper — Issue #875: Neanderthal Technology reading summary input & group scoping", () => {
		it("cô lập optionBank của part nhóm: nhóm summary không có optionBank render ô nhập văn bản, không render nút A–K", () => {
			const onAnswer = vi.fn();
			const headingsPart: QuizPart = {
				id: "group-1",
				label: "Questions 1–6",
				qStart: 1,
				typeId: "headings",
				source: "group",
				instructionHtml:
					"<p>Choose the correct heading for each section from the list of headings below.</p>",
				optionBank: [
					"Heading i: Origins",
					"Heading ii: Tool types",
					"Heading iii: Hunting techniques",
					"Heading iv: Fire usage",
					"Heading v: Shelters",
					"Heading vi: Language",
				],
				questions: [1, 2, 3, 4, 5, 6].map((num, i) => ({
					q: i,
					number: num,
					stem: `Section ${String.fromCharCode(65 + i)}`,
					opts: null,
					pin: null,
					type: "headings",
				})),
			};

			const infoPart: QuizPart = {
				id: "group-2",
				label: "Questions 7–10",
				qStart: 7,
				typeId: "info",
				source: "group",
				instructionHtml:
					"<p>Which section contains the following information?</p>",
				optionBank: ["A", "B", "C", "D", "E"],
				questions: [7, 8, 9, 10].map((num, i) => ({
					q: 6 + i,
					number: num,
					stem: `Information item ${num}`,
					opts: null,
					pin: null,
					type: "info",
				})),
			};

			const summaryPart: QuizPart = {
				id: "group-3",
				label: "Questions 11–13",
				qStart: 11,
				typeId: "summary",
				source: "group",
				instructionHtml: "", // Không có instruction riêng trên nhóm, phụ thuộc vào intro
				optionBank: [], // Summary completion từ passage, không có Word Bank
				questions: [
					{
						q: 10,
						number: 11,
						stem: "Neanderthals lived in a (11) __________ environment.",
						opts: null,
						pin: null,
						type: "summary",
					},
					{
						q: 11,
						number: 12,
						stem: "Their bodies were adapted to be (12) __________ and strong.",
						opts: null,
						pin: null,
						type: "summary",
					},
					{
						q: 12,
						number: 13,
						stem: "They were skilled hunters of large (13) __________.",
						opts: null,
						pin: null,
						type: "summary",
					},
				],
			};

			const mcqPart: QuizPart = {
				id: "group-4",
				label: "Questions 14",
				qStart: 14,
				typeId: "mcq",
				source: "group",
				instructionHtml: "<p>Choose the correct letter, A, B, C or D.</p>",
				optionBank: [],
				questions: [
					{
						q: 13,
						number: 14,
						stem: "What is the main idea?",
						opts: ["Option A", "Option B", "Option C", "Option D"],
						pin: null,
						type: "mcq",
					},
				],
			};

			const combinedOptionBank = [
				"Heading i: Origins",
				"Heading ii: Tool types",
				"Heading iii: Hunting techniques",
				"Heading iv: Fire usage",
				"Heading v: Shelters",
				"Heading vi: Language",
				"A",
				"B",
				"C",
				"D",
				"E",
			];

			const detail = baseDetail({
				skill: "reading",
				type: "reading",
				intro: `
					<p>Questions 1–6: Choose the correct heading for each section from the list of headings below.</p>
					<p>Questions 7–10: Which section contains the following information?</p>
					<p>Questions 11–13: Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.</p>
					<p>Questions 14: Choose the correct letter, A, B, C or D.</p>
				`,
				optionBank: combinedOptionBank,
			});

			const { container, getByLabelText } = render(
				<QuizPaper
					detail={detail}
					parts={[headingsPart, infoPart, summaryPart, mcqPart]}
					answers={{}}
					onAnswer={onAnswer}
					currentQuestion={10}
					mode="take"
				/>,
			);

			// 1. Không hiển thị option bank 11 mục ở đầu đề (showDetailBank = false vì hasGroupSource = true)
			const topBank = container.querySelector(
				"article > [data-testid='option-bank-list']",
			);
			expect(topBank).toBeNull();

			// 2. Nhóm summary hiển thị đúng hướng dẫn "NO MORE THAN TWO WORDS", KHÔNG hiển thị fallback "ONE WORD ONLY"
			expect(container.textContent).toContain("NO MORE THAN TWO WORDS");
			expect(container.textContent).not.toContain("ONE WORD ONLY");

			// 3. Preamble đầu trang không bị lặp lại dòng Questions 11-13 vì đã bị tiêu thụ
			const preamble = container.querySelector(
				"article > div.text-muted-foreground",
			);
			expect(preamble?.textContent ?? "").not.toContain(
				"Questions 11–13: Complete the summary below",
			);

			// 4. Các câu hỏi Q11, Q12, Q13 render input text, KHÔNG render button radio A–K
			const input11 = getByLabelText("Điền đáp án câu 11") as HTMLInputElement;
			const input12 = getByLabelText("Điền đáp án câu 12") as HTMLInputElement;
			const input13 = getByLabelText("Điền đáp án câu 13") as HTMLInputElement;

			expect(input11).not.toBeNull();
			expect(input12).not.toBeNull();
			expect(input13).not.toBeNull();

			// Không có nút radio lựa chọn A-K cho câu 11–13
			const radiosInSummary = container.querySelectorAll(
				"input[type='radio'][name='quiz-q-10']",
			);
			expect(radiosInSummary).toHaveLength(0);

			// Học viên có thể gõ cụm từ (ví dụ predatory animals có 2 từ)
			fireEvent.change(input13, { target: { value: "predatory animals" } });
			expect(onAnswer).toHaveBeenCalledWith(12, "predatory animals");
		});

		it("đề không nhóm trộn dạng (summary + matching có required bank): summary không mượn bank nhầm", () => {
			const onAnswer = vi.fn();
			const matchingPart: QuizPart = {
				id: "part-1",
				label: "Questions 1–2",
				qStart: 1,
				typeId: "matching",
				questions: [
					{
						q: 0,
						number: 1,
						stem: "Match 1",
						opts: null,
						pin: null,
						type: "matching",
					},
					{
						q: 1,
						number: 2,
						stem: "Match 2",
						opts: null,
						pin: null,
						type: "matching",
					},
				],
			};
			const summaryPart: QuizPart = {
				id: "part-2",
				label: "Questions 3–4",
				qStart: 3,
				typeId: "summary",
				questions: [
					{
						q: 2,
						number: 3,
						stem: "Summary 3",
						opts: null,
						pin: null,
						type: "summary",
					},
					{
						q: 3,
						number: 4,
						stem: "Summary 4",
						opts: null,
						pin: null,
						type: "summary",
					},
				],
			};

			const detail = baseDetail({
				skill: "reading",
				type: "reading",
				optionBank: ["Item A", "Item B", "Item C"],
			});

			const { getByLabelText, container } = render(
				<QuizPaper
					detail={detail}
					parts={[matchingPart, summaryPart]}
					answers={{}}
					onAnswer={onAnswer}
					currentQuestion={2}
					mode="take"
				/>,
			);

			// Matching part có radio pills chọn từ Item A, B, C (3 options A, B, C)
			const radios1 = container.querySelectorAll(
				"input[type='radio'][name='quiz-q-1']",
			);
			expect(radios1).toHaveLength(3);

			// Summary part render input text, không bị biến thành letter options A–C
			const input3 = getByLabelText("Điền đáp án câu 3") as HTMLInputElement;
			expect(input3).not.toBeNull();
			const radios = container.querySelectorAll(
				"input[type='radio'][name='quiz-q-2']",
			);
			expect(radios).toHaveLength(0);

			// Summary part không dùng hướng dẫn chọn từ list của word bank
			expect(container.textContent).not.toContain(
				"Complete the summary using the list of words below",
			);
		});
	});

	describe("QuizPaper — Issue #876: The History of Tea instruction consistency & review detail", () => {
		const teaQuestions = [
			...Array.from({ length: 7 }, (_, i) => ({
				stem:
					i === 2
						? "It was ____ (3) from Japan who brought tea to their native country from China."
						: `Tea sentence ${i + 1} ____.`,
				opts: null,
				pin: null,
				type: "sent",
			})),
			...Array.from({ length: 6 }, (_, i) => ({
				stem: `Tea statement ${i + 8}.`,
				opts: null,
				pin: null,
				type: "tfng",
			})),
		];

		const teaSentInstruction =
			"Complete the sentences below with words taken from Reading Passage 1. Use ONE WORD for each answer.";
		const teaTfngInstruction = [
			"Do the following statements agree with the information given in Reading Passage 1?",
			"Write",
			"TRUE if the statement agrees with the information",
			"FALSE if the statement contradicts the information",
			"NOT GIVEN if there is no information on this",
		].join("\n");
		const teaFlattenedIntro = `${teaSentInstruction}\n${teaTfngInstruction}`;

		const teaReview: Record<number, QuizReviewInfo> = Object.fromEntries(
			teaQuestions.map((_, idx) => [
				idx,
				{
					verdict: idx === 2 ? ("wrong" as const) : ("correct" as const),
					key: idx === 2 ? "monks" : idx < 7 ? "word" : "TRUE",
					alts: "",
					answer: idx === 2 ? "Buddhist monks" : idx < 7 ? "word" : "TRUE",
					note: "",
				},
			]),
		);

		it("pre-0085 fallback (không groups) ở cả mode take và review tách sạch hướng dẫn Q1–7 (Use ONE WORD) và Q8–13 (TFNG), không còn NO MORE THAN THREE WORDS hay preamble lẫn", () => {
			const parts = buildQuizParts(teaQuestions, "sent", teaFlattenedIntro);
			const detail = baseDetail({
				skill: "reading",
				type: "sent",
				intro: teaFlattenedIntro,
			});

			for (const mode of ["take", "review"] as const) {
				const { container, unmount } = render(
					<QuizPaper
						detail={detail}
						parts={parts}
						answers={mode === "review" ? { 2: "Buddhist monks" } : {}}
						onAnswer={vi.fn()}
						currentQuestion={null}
						mode={mode}
						review={mode === "review" ? teaReview : undefined}
					/>,
				);

				// Không còn preamble lẫn ở đầu <article>
				const topPreamble = container.querySelector(
					"article > div.text-muted-foreground",
				);
				expect(topPreamble).toBeNull();

				// Tuyệt đối không còn fallback sai NO MORE THAN THREE WORDS
				expect(container.textContent).not.toContain("NO MORE THAN THREE WORDS");

				const sections = container.querySelectorAll("article section");
				expect(sections).toHaveLength(2);

				const section1 = sections[0]?.textContent ?? "";
				const section2 = sections[1]?.textContent ?? "";

				expect(section1).toContain("Use ONE WORD for each answer.");
				expect(section1).not.toContain("TRUE if the statement");
				expect(section2).toContain("Do the following statements agree");
				expect(section2).toContain("TRUE if the statement");
				expect(section2).not.toContain("Use ONE WORD");

				unmount();
			}
		});

		it("post-0087 có groups (kèm bảng inline ở Group 1 + plain-text TFNG ở Group 2) ở mode review không lặp preamble và hiển thị đúng hướng dẫn từng nhóm", () => {
			const group1Html = `<p>${teaSentInstruction}</p><table><tbody><tr><td><ul><li>Containers in [1].</li><li>Lu Yu wrote a [2].</li><li>It was [3] from Japan.</li><li>Carried by the [4].</li><li>Crime of [5].</li><li>Planted in [6].</li><li>Used [7] for the race.</li></ul></td></tr></tbody></table>`;
			const parts = buildQuizPartsFromGroups(
				teaQuestions,
				[
					{
						id: "grp-1",
						type: "sent",
						instruction: group1Html,
						startIndex: 0,
						count: 7,
						optionBank: [],
					},
					{
						id: "grp-2",
						type: "tfng",
						instruction: teaTfngInstruction,
						startIndex: 7,
						count: 6,
						optionBank: [],
					},
				],
				"sent",
				`${group1Html}\n${teaTfngInstruction}`,
			);
			const detail = baseDetail({
				skill: "reading",
				type: "sent",
				intro: `${group1Html}\n${teaTfngInstruction}`,
			});

			const { container } = render(
				<QuizPaper
					detail={detail}
					parts={parts}
					answers={{ 2: "Buddhist monks" }}
					onAnswer={vi.fn()}
					currentQuestion={null}
					mode="review"
					review={teaReview}
				/>,
			);

			const topPreamble = container.querySelector(
				"article > div.text-muted-foreground",
			);
			expect(topPreamble).toBeNull();
			expect(container.textContent).not.toContain("NO MORE THAN THREE WORDS");

			const sections = container.querySelectorAll("article section");
			expect(sections).toHaveLength(2);
			expect(sections[0]?.textContent).toContain(
				"Use ONE WORD for each answer.",
			);
			expect(sections[0]?.textContent).not.toContain("TRUE if the statement");
			expect(sections[1]?.textContent).toContain("TRUE if the statement");
			expect(sections[1]?.textContent).not.toContain("Use ONE WORD");
		});

		it("pre-0085 fallback (không groups) với bảng inline trong detail.intro bật QuizInlineInstruction qua hasMatchedInstruction ở cả take và review", () => {
			const inlineIntro = `<p>${teaSentInstruction}</p><table><tbody><tr><td><ul><li>Containers in [1].</li><li>Lu Yu wrote a [2].</li><li>It was [3] from Japan.</li><li>Carried by the [4].</li><li>Crime of [5].</li><li>Planted in [6].</li><li>Used [7] for the race.</li></ul></td></tr></tbody></table>\n${teaTfngInstruction}`;
			const parts = buildQuizParts(teaQuestions, "sent", inlineIntro);
			const detail = baseDetail({
				skill: "reading",
				type: "sent",
				intro: inlineIntro,
			});

			for (const mode of ["take", "review"] as const) {
				const { container, getAllByTestId, unmount } = render(
					<QuizPaper
						detail={detail}
						parts={parts}
						answers={mode === "review" ? { 2: "Buddhist monks" } : {}}
						onAnswer={vi.fn()}
						currentQuestion={null}
						mode={mode}
						review={mode === "review" ? teaReview : undefined}
					/>,
				);

				expect(
					container.querySelector("article > div.text-muted-foreground"),
				).toBeNull();
				expect(getAllByTestId("quiz-inline-instruction")).toHaveLength(1);
				expect(getAllByTestId("quiz-inline-slot")).toHaveLength(7);
				expect(container.textContent).not.toContain("NO MORE THAN THREE WORDS");
				unmount();
			}
		});

		it("không làm rò rỉ word limit qua contextIntro khi đề có >= 2 nhóm completion", () => {
			// Case 3a: Part 1 (sent) đã tiêu thụ Use ONE WORD, Part 2 (notes) không có instruction riêng
			const partsA = buildQuizParts(
				[
					{ stem: "Sent 1 ____", opts: null, pin: null, type: "sent" },
					{ stem: "Note 2 ____", opts: null, pin: null, type: "notes" },
				],
				"sent",
				teaSentInstruction,
			);
			const { container: containerA, unmount: unmountA } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "sent",
						intro: teaSentInstruction,
					})}
					parts={partsA}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);
			const sectionsA = containerA.querySelectorAll("article section");
			expect(sectionsA[0]?.textContent).toContain(
				"Use ONE WORD for each answer.",
			);
			expect(sectionsA[1]?.textContent).toContain("NO MORE THAN THREE WORDS");
			expect(sectionsA[1]?.textContent).not.toContain("Choose ONE WORD");
			unmountA();

			// Case 3b: 2 nhóm completion (shortans + summary) cùng không khớp keyword -> intro còn lại không được lây từ Part 1 sang Part 2
			const unmatchedIntro = [
				"Choose ONE WORD ONLY from the passage for each answer.",
				"Complete the table below. Choose ONE WORD AND/OR A NUMBER from the passage for each answer.",
			].join("\n");
			const partsB = buildQuizParts(
				[
					{ stem: "Q1 ____", opts: null, pin: null, type: "shortans" },
					{ stem: "Q2 ____", opts: null, pin: null, type: "summary" },
				],
				"shortans",
				unmatchedIntro,
			);
			const { container: containerB } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "shortans",
						intro: unmatchedIntro,
					})}
					parts={partsB}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);
			const sectionsB = containerB.querySelectorAll("article section");
			// Part 1 (shortans) không bị lây ONE WORD ONLY sai từ intro chung nhiều nhóm
			expect(sectionsB[0]?.textContent).toContain(
				"NO MORE THAN THREE WORDS AND/OR A NUMBER",
			);
		});
	});

	describe("QuizPaper — Issue #877: Neanderthal Technology & Bovids matching instructions and option banks", () => {
		function hasTopLevelOptionBank(container: HTMLElement): boolean {
			const directDivs = Array.from(
				container.querySelectorAll("article > div"),
			).filter((el) => el.querySelector("section") === null);
			return directDivs.some(
				(el) =>
					(el.textContent ?? "").includes("Ngân hàng lựa chọn") ||
					el.querySelector("ol") !== null,
			);
		}

		function sectionBankItems(section: Element | undefined): string[] {
			if (!section) return [];
			return Array.from(section.querySelectorAll("ol > li")).map((li) =>
				(li.textContent ?? "").replace(/\s+/g, " ").trim(),
			);
		}

		const neanderthalHeadings = [
			"Evidence of outdoor dwellings",
			"Learning to make fire",
			"A perfect place to live",
			"Examining the cave contents",
			"Contrasting two types of home",
			"A vital source of power",
		];
		const neanderthalPlaces = [
			"The Périgord region",
			"Moldova",
			"The Grotte du Lazaret",
			"The cave of Baume-Bonne",
			"Krapina",
		];
		const neanderthalCombinedBank = [
			...neanderthalHeadings,
			...neanderthalPlaces,
		];
		const neanderthalQuestions = [
			...[
				"Paragraph A",
				"Paragraph B",
				"Paragraph C",
				"Paragraph D",
				"Paragraph E",
			].map((stem) => ({ stem, opts: null, pin: null, type: "headings" })),
			...[
				"a burnt piece of wood",
				"evidence of efforts to prevent pools of water forming",
				"the remains of sea creatures",
				"a circular arrangement of animal bones",
				"evidence suggesting the use of animal fur for warmth",
			].map((stem) => ({ stem, opts: null, pin: null, type: "info" })),
			...[
				"Neanderthalers could not have survived without fire because the conditions they lived in were ____ (11).",
				"Most evidence suggests that the fires lasted a ____ (12) time.",
				"Fires protected occupants from dangerous ____ (13).",
			].map((stem) => ({ stem, opts: null, pin: null, type: "summary" })),
			{
				stem: "The purpose of the writer of this article is",
				opts: [
					"argue that Neanderthal homes were bigger.",
					"explain why Neanderthal people migrated.",
					"discuss what is known about Neanderthal settlements.",
					"track the progress of early Neanderthal development.",
				],
				pin: null,
				type: "mcq",
			},
		];
		const neanderthalHeadingsInstruction =
			"Reading Passage 3 has five sections. Choose the correct heading for each section from the list of headings below.\nChoose the correct number, i-vi, in boxes 27-31.";
		const neanderthalInfoInstruction =
			"Look at the following findings and the list of places below. Match each finding with the correct place A-E.\nNB: You may use any letter more than once.";
		const neanderthalSummaryInstruction =
			"Complete the summary below. Write NO MORE THAN TWO WORDS from the passage for each answer.";
		const neanderthalMcqInstruction =
			"Choose the correct answer, A, B, C or D.";
		const neanderthalPlainIntro = [
			neanderthalHeadingsInstruction,
			neanderthalInfoInstruction,
			neanderthalSummaryInstruction,
			neanderthalMcqInstruction,
		].join("\n");
		const neanderthalInlineIntro = [
			`<p>${neanderthalHeadingsInstruction}</p>`,
			`<p>${neanderthalInfoInstruction}</p>`,
			"<p>6. a burnt piece of wood → [6]</p><p>7. evidence of efforts to prevent pools of water forming → [7]</p><p>8. the remains of sea creatures → [8]</p><p>9. a circular arrangement of animal bones → [9]</p><p>10. evidence suggesting the use of animal fur for warmth → [10]</p>",
			`<p>${neanderthalSummaryInstruction}</p>`,
			"<table><tbody><tr><td><h2><strong>The use of fire</strong></h2></td></tr><tr><td><ul><li>Conditions were [11]. Fires lasted a [12] time and protected against [13].</li></ul></td></tr></tbody></table>",
			`<p>${neanderthalMcqInstruction}</p>`,
		].join("\n");
		const neanderthalReview: Record<number, QuizReviewInfo> =
			Object.fromEntries(
				neanderthalQuestions.map((_, idx) => [
					idx,
					{
						verdict: "correct" as const,
						key: idx < 5 ? "i" : idx < 10 ? "E" : idx < 13 ? "short" : "C",
						alts: "",
						answer: idx < 5 ? "i" : idx < 10 ? "E" : idx < 13 ? "short" : "C",
						note: "",
					},
				]),
			);

		const bovidsSubFamilies = [
			"Antelope",
			"Bovinae",
			"Caprinae",
			"Cephalophinae",
		];
		const bovidsQuestions = [
			...[
				"In which region is the biggest range of bovids to be found?",
				"Most bovids have a preference for living in",
				"Which of the following features do all bovids have in common?",
			].map((stem) => ({
				stem,
				opts: ["Option A", "Option B", "Option C", "Option D"],
				pin: null,
				type: "mcq",
			})),
			...[
				"can endure very harsh environments",
				"includes the ox and the cow",
				"may supplement its diet with meat",
				"can usually move at speed",
				"does not defend a particular area of land",
			].map((stem) => ({ stem, opts: null, pin: null, type: "info" })),
			...[
				"What is the smallest species of Bovid called?",
				"Which species of Bovinae has now died out?",
				"What facilitates the movement of the sitatunga over wetland?",
				"What sort of terrain do barbary sheep live in?",
				"What is the only living member of the Antilocapridae sub-family?",
			].map((stem) => ({ stem, opts: null, pin: null, type: "fill_blank" })),
		];
		const bovidsMcqInstruction = "Choose the correct letter, A, B, C or D.";
		const bovidsInfoInstruction =
			"Look at the following characteristics and the list of sub-families below.\nMatch each characteristic with the correct sub-family, A, B, C or D.\nNB You may use any letter more than once";
		const bovidsFillInstruction =
			"Answer the questions below.\nChoose NO MORE THAN THREE WORDS from the passage for each answer.\nWrite your answers in boxes 9-13 on your answer sheet.";
		const bovidsPlainIntro = [
			bovidsMcqInstruction,
			bovidsInfoInstruction,
			bovidsFillInstruction,
		].join("\n");
		const bovidsReview: Record<number, QuizReviewInfo> = Object.fromEntries(
			bovidsQuestions.map((_, idx) => [
				idx,
				{
					verdict: "correct" as const,
					key: idx < 3 ? "D" : idx < 8 ? "B" : "auroch",
					alts: "",
					answer: idx < 3 ? "D" : idx < 8 ? "B" : "auroch",
					note: "",
				},
			]),
		);

		it("Case 1 — Neanderthal Technology (!hasGroupSource, plain & inline body_html, mode take & review) tách đúng bank 6 headings (i–vi) + 5 places (A–E) và tách sạch hướng dẫn từng phần", () => {
			for (const variant of [
				{ name: "plain", intro: neanderthalPlainIntro, inline: false },
				{ name: "inline", intro: neanderthalInlineIntro, inline: true },
			]) {
				const parts = buildQuizParts(
					neanderthalQuestions,
					"headings",
					variant.intro,
				);
				const detail = baseDetail({
					skill: "reading",
					type: "headings",
					intro: variant.intro,
					optionBank: neanderthalCombinedBank,
				});

				for (const mode of ["take", "review"] as const) {
					const { container, getByLabelText, unmount } = render(
						<QuizPaper
							detail={detail}
							parts={parts}
							answers={
								mode === "review"
									? { 0: "i", 5: "E", 11: "short", 13: "C" }
									: {}
							}
							onAnswer={vi.fn()}
							currentQuestion={null}
							mode={mode}
							review={mode === "review" ? neanderthalReview : undefined}
						/>,
					);

					// Không còn top-level OptionBankList trộn 11 mục hay preamble lẫn
					expect(hasTopLevelOptionBank(container)).toBe(false);
					expect(
						container.querySelector("article > div.text-muted-foreground"),
					).toBeNull();

					const sections = container.querySelectorAll("article section");
					expect(sections).toHaveLength(4);

					// Section 1: Q1–5 headings -> đúng 6 headings i–vi, KHÔNG chứa địa danh hay i–viii
					const sec1 = sections[0];
					const sec1Items = sectionBankItems(sec1);
					expect(sec1Items).toHaveLength(6);
					expect(sec1Items[0]).toContain("i Evidence of outdoor dwellings");
					expect(sec1Items[5]).toContain("vi A vital source of power");
					expect(sec1?.textContent).not.toContain("The Périgord region");
					expect(sec1?.textContent).not.toContain("Krapina");
					expect(sec1?.textContent).toContain("i-vi");
					expect(sec1?.textContent).not.toContain("i–viii");
					const q1Radios = sec1?.querySelectorAll(
						"input[type='radio'][name='quiz-q-0']",
					);
					expect(q1Radios).toHaveLength(6);

					// Section 2: Q6–10 info -> đúng 5 địa danh A–E, KHÔNG chứa "Which section" hay "A–H"
					const sec2 = sections[1];
					const sec2Items = sectionBankItems(sec2);
					expect(sec2Items).toHaveLength(5);
					expect(sec2Items[0]).toContain("A The Périgord region");
					expect(sec2Items[4]).toContain("E Krapina");
					expect(sec2?.textContent).toContain("A-E");
					expect(sec2?.textContent).not.toContain("Which section");
					expect(sec2?.textContent).not.toContain("A–H");
					if (variant.inline) {
						const select6 = getByLabelText(
							"Chọn đáp án câu 6",
						) as HTMLSelectElement;
						const optionValues = Array.from(select6.options)
							.map((opt) => opt.value)
							.filter(Boolean);
						expect(optionValues).toEqual(["A", "B", "C", "D", "E"]);
					} else {
						const q6Radios = Array.from(
							sec2?.querySelectorAll("input[type='radio'][name='quiz-q-5']") ??
								[],
						).map((el) => (el as HTMLInputElement).value);
						expect(q6Radios).toEqual(["A", "B", "C", "D", "E"]);
					}

					// Section 3: Q11–13 summary -> text input (không radio A–K), NO MORE THAN TWO WORDS
					const sec3 = sections[2];
					expect(sec3?.textContent).toContain("NO MORE THAN TWO WORDS");
					expect(sec3?.textContent).not.toContain("ONE WORD ONLY");
					expect(sectionBankItems(sec3)).toHaveLength(0);
					expect(
						sec3?.querySelectorAll("input[type='radio'][name='quiz-q-10']"),
					).toHaveLength(0);
					expect(getByLabelText("Điền đáp án câu 11")).not.toBeNull();

					// Section 4: Q14 mcq -> giữ đủ 4 lựa chọn A–D
					const sec4 = sections[3];
					expect(
						sec4?.querySelectorAll("input[type='radio'][name='quiz-q-13']"),
					).toHaveLength(4);

					unmount();
				}
			}
		});

		it("Case 2 — Neanderthal Technology (hasGroupSource === true kể cả khi instructionHtml trống) dùng fallback động i–vi và A–E theo đúng bank từng nhóm", () => {
			const parts = buildQuizPartsFromGroups(
				neanderthalQuestions,
				[
					{
						id: "grp-1",
						type: "headings",
						instruction: "",
						startIndex: 0,
						count: 5,
						optionBank: neanderthalHeadings,
					},
					{
						id: "grp-2",
						type: "info",
						instruction: "",
						startIndex: 5,
						count: 5,
						optionBank: neanderthalPlaces,
					},
					{
						id: "grp-3",
						type: "summary",
						instruction: neanderthalSummaryInstruction,
						startIndex: 10,
						count: 3,
						optionBank: [],
					},
					{
						id: "grp-4",
						type: "mcq",
						instruction: neanderthalMcqInstruction,
						startIndex: 13,
						count: 1,
						optionBank: [],
					},
				],
				"headings",
				"",
			);

			const { container } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "headings",
						intro: "",
						optionBank: neanderthalCombinedBank,
					})}
					parts={parts}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
					mode="take"
				/>,
			);

			expect(hasTopLevelOptionBank(container)).toBe(false);
			const sections = container.querySelectorAll("article section");
			expect(sections).toHaveLength(4);

			expect(sectionBankItems(sections[0])).toHaveLength(6);
			expect(sections[0]?.textContent).toContain("i–vi");
			expect(sections[0]?.textContent).not.toContain("i–viii");

			expect(sectionBankItems(sections[1])).toHaveLength(5);
			expect(sections[1]?.textContent).toContain("A–E");
			expect(sections[1]?.textContent).not.toContain("Which section");
			expect(sections[1]?.textContent).not.toContain("A–H");
		});

		it("Case 3 — Bovids (cả hasGroupSource có/trống instructionHtml lẫn !hasGroupSource, take & review) gắn bank 4 sub-families A–D đúng trong Questions 4–8 và không còn 'Which section… A–H'", () => {
			const groupedWithInstr = buildQuizPartsFromGroups(
				bovidsQuestions,
				[
					{
						id: "g1",
						type: "mcq",
						instruction: bovidsMcqInstruction,
						startIndex: 0,
						count: 3,
						optionBank: [],
					},
					{
						id: "g2",
						type: "info",
						instruction: bovidsInfoInstruction,
						startIndex: 3,
						count: 5,
						optionBank: bovidsSubFamilies,
					},
					{
						id: "g3",
						type: "fill_blank",
						instruction: bovidsFillInstruction,
						startIndex: 8,
						count: 5,
						optionBank: [],
					},
				],
				"mcq",
				bovidsPlainIntro,
			);
			const groupedEmptyInstr = buildQuizPartsFromGroups(
				bovidsQuestions,
				[
					{
						id: "g1",
						type: "mcq",
						instruction: "",
						startIndex: 0,
						count: 3,
						optionBank: [],
					},
					{
						id: "g2",
						type: "info",
						instruction: "",
						startIndex: 3,
						count: 5,
						optionBank: bovidsSubFamilies,
					},
					{
						id: "g3",
						type: "fill_blank",
						instruction: bovidsFillInstruction,
						startIndex: 8,
						count: 5,
						optionBank: [],
					},
				],
				"mcq",
				"",
			);
			const ungrouped = buildQuizParts(
				bovidsQuestions,
				"mcq",
				bovidsPlainIntro,
			);

			const cases = [
				{
					parts: groupedWithInstr,
					intro: bovidsPlainIntro,
					expectMatchedFill: true,
				},
				{
					parts: groupedEmptyInstr,
					intro: "",
					expectMatchedFill: true,
				},
				{
					parts: ungrouped,
					intro: bovidsPlainIntro,
					expectMatchedFill: true,
				},
			];

			for (const entry of cases) {
				for (const mode of ["take", "review"] as const) {
					const { container, unmount } = render(
						<QuizPaper
							detail={baseDetail({
								skill: "reading",
								type: "mcq",
								intro: entry.intro,
								optionBank: bovidsSubFamilies,
							})}
							parts={entry.parts}
							answers={mode === "review" ? { 0: "D", 4: "B", 9: "auroch" } : {}}
							onAnswer={vi.fn()}
							currentQuestion={null}
							mode={mode}
							review={mode === "review" ? bovidsReview : undefined}
						/>,
					);

					// Không đặt OptionBankList ở đầu bài trước Questions 1–3
					expect(hasTopLevelOptionBank(container)).toBe(false);
					expect(
						container.querySelector("article > div.text-muted-foreground"),
					).toBeNull();

					const sections = container.querySelectorAll("article section");
					expect(sections).toHaveLength(3);

					// Section 1: MCQ không có bank list
					expect(sectionBankItems(sections[0])).toHaveLength(0);

					// Section 2: Questions 4–8 (info) có đúng 4 sub-families A–D, không "Which section" hay "A–H"
					const sec2 = sections[1];
					const sec2Items = sectionBankItems(sec2);
					expect(sec2Items).toEqual([
						"A Antelope",
						"B Bovinae",
						"C Caprinae",
						"D Cephalophinae",
					]);
					expect(sec2?.textContent).not.toContain("Which section");
					expect(sec2?.textContent).not.toContain("A–H");
					const q4Radios = Array.from(
						sec2?.querySelectorAll("input[type='radio'][name='quiz-q-3']") ??
							[],
					).map((el) => (el as HTMLInputElement).value);
					expect(q4Radios).toEqual(["A", "B", "C", "D"]);

					// Section 3: fill_blank giữ nguyên "Answer the questions below." + "NO MORE THAN THREE WORDS"
					if (entry.expectMatchedFill) {
						expect(sections[2]?.textContent).toContain(
							"Answer the questions below.",
						);
						expect(sections[2]?.textContent).toContain(
							"NO MORE THAN THREE WORDS",
						);
					}

					unmount();
				}
			}
		});

		it("Case 4 — Fail-closed khi multi-bank thiếu range, positional 'Paragraph A..D' ẩn hộp thừa + fallback A–D, và bảo toàn guard #875 trên part source:'intro' trộn dạng", () => {
			// 4a: Unpartitionable multi-bank (!hasGroupSource, headings + match_names không có range trong intro)
			const unpartitionableParts = buildQuizParts(
				[
					{ stem: "Paragraph A", opts: null, pin: null, type: "headings" },
					{ stem: "Statement 2", opts: null, pin: null, type: "match_names" },
				],
				"headings",
				"",
			);
			const { container: c4a, unmount: u4a } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "headings",
						intro: "",
						optionBank: [
							"Heading 1",
							"Heading 2",
							"Heading 3",
							"Dr. Alpha",
							"Dr. Beta",
						],
					})}
					parts={unpartitionableParts}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);
			expect(hasTopLevelOptionBank(c4a)).toBe(true);
			const sec4a = c4a.querySelectorAll("article section");
			expect(sec4a[0]?.textContent).not.toContain("i–viii");
			expect(sec4a[0]?.textContent).not.toContain("i–v");
			expect(sec4a[1]?.textContent).not.toContain("A–H");
			expect(sec4a[1]?.textContent).not.toContain("A–E");
			u4a();

			// 4b: Positional "Paragraph A..D" ẩn hộp OptionBankList thừa + fallback "Which section… A–D"
			const positionalParts = buildQuizPartsFromGroups(
				[{ stem: "Find this info", opts: null, pin: null, type: "info" }],
				[
					{
						id: "pos-1",
						type: "info",
						instruction: "",
						startIndex: 0,
						count: 1,
						optionBank: [
							"Paragraph A",
							"Paragraph B",
							"Paragraph C",
							"Paragraph D",
						],
					},
				],
				"info",
				"",
			);
			const { container: c4b, unmount: u4b } = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "info",
						intro: "",
						optionBank: [
							"Paragraph A",
							"Paragraph B",
							"Paragraph C",
							"Paragraph D",
						],
					})}
					parts={positionalParts}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);
			expect(hasTopLevelOptionBank(c4b)).toBe(false);
			expect(c4b.textContent).not.toContain("Ngân hàng lựa chọn");
			expect(c4b.textContent).toContain(
				"Which section contains the following information? Write the correct letter A–D.",
			);
			u4b();

			// 4c: Part source:'intro' trộn headings + summary ở section 1, mcq ở section 2 -> summary vẫn là ô nhập chữ (#875 guard)
			const mixedIntroParts: QuizPart[] = [
				{
					id: "intro-part-1",
					label: "Questions 1–2",
					qStart: 1,
					typeId: "headings",
					source: "intro",
					instructionHtml: "<p>Choose the correct heading, i-iii.</p>",
					questions: [
						{
							q: 0,
							number: 1,
							stem: "Paragraph A",
							opts: null,
							pin: null,
							type: "headings",
						},
						{
							q: 1,
							number: 2,
							stem: "The process took ____ (2).",
							opts: null,
							pin: null,
							type: "summary",
						},
					],
				},
				{
					id: "intro-part-2",
					label: "Questions 3",
					qStart: 3,
					typeId: "mcq",
					source: "intro",
					instructionHtml: "<p>Choose the correct letter, A, B, C or D.</p>",
					questions: [
						{
							q: 2,
							number: 3,
							stem: "Main point?",
							opts: ["A1", "B1", "C1", "D1"],
							pin: null,
							type: "mcq",
						},
					],
				},
			];
			const {
				container: c4c,
				getByLabelText: get4c,
				unmount: u4c,
			} = render(
				<QuizPaper
					detail={baseDetail({
						skill: "reading",
						type: "headings",
						intro: "",
						optionBank: ["Heading 1", "Heading 2", "Heading 3"],
					})}
					parts={mixedIntroParts}
					answers={{}}
					onAnswer={vi.fn()}
					currentQuestion={null}
				/>,
			);
			expect(get4c("Điền đáp án câu 2")).not.toBeNull();
			expect(
				c4c.querySelectorAll("input[type='radio'][name='quiz-q-1']"),
			).toHaveLength(0);
			u4c();
		});

		it("Case 5 — Memoization theo keystroke: rerender 3 lần khi answers & currentQuestion thay đổi chỉ gọi scopeFlattenedOptionBank và deduplicateGroupIntroPreamble đúng 1 lần", () => {
			const parts = buildQuizParts(
				neanderthalQuestions,
				"headings",
				neanderthalPlainIntro,
			);
			const detail = baseDetail({
				skill: "reading",
				type: "headings",
				intro: neanderthalPlainIntro,
				optionBank: neanderthalCombinedBank,
			});

			vi.clearAllMocks();
			const onAnswer = vi.fn();
			const { rerender } = render(
				<QuizPaper
					detail={detail}
					parts={parts}
					answers={{}}
					onAnswer={onAnswer}
					currentQuestion={0}
					mode="take"
				/>,
			);

			rerender(
				<QuizPaper
					detail={detail}
					parts={parts}
					answers={{ 0: "v" }}
					onAnswer={onAnswer}
					currentQuestion={1}
					mode="take"
				/>,
			);
			rerender(
				<QuizPaper
					detail={detail}
					parts={parts}
					answers={{ 0: "v", 5: "E" }}
					onAnswer={onAnswer}
					currentQuestion={6}
					mode="take"
				/>,
			);
			rerender(
				<QuizPaper
					detail={detail}
					parts={parts}
					answers={{ 0: "v", 5: "E", 10: "sub-arctic" }}
					onAnswer={onAnswer}
					currentQuestion={10}
					mode="take"
				/>,
			);

			expect(
				quizInstructionModule.scopeFlattenedOptionBank,
			).toHaveBeenCalledTimes(1);
			expect(
				quizInstructionModule.deduplicateGroupIntroPreamble,
			).toHaveBeenCalledTimes(1);
		});
	});
});
