// @vitest-environment jsdom

import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizPaper, type QuizPaperDetail } from "./quiz-paper";
import { questionChoiceRows } from "./quiz-question-item";
import type { QuizReviewInfo } from "./quiz-review-item";

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
