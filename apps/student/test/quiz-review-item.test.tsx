import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizNavigator } from "@/components/quiz/quiz-navigator";
import { QuizPaper } from "@/components/quiz/quiz-paper";
import {
	type QuizReviewInfo,
	QuizReviewItem,
	quizReviewChipText,
} from "@/components/quiz/quiz-review-item";
import { buildQuizParts } from "@/lib/quiz-parts";

type PaperFields = Parameters<typeof QuizPaper>[0]["detail"];

const paperFields = (overrides: Partial<PaperFields> = {}): PaperFields => ({
	skill: "reading",
	type: "tfng",
	band: "6.5",
	intro: "",
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

const reviewInfo = (overrides: Partial<QuizReviewInfo> = {}): QuizReviewInfo => ({
	verdict: "correct",
	key: "Paris",
	alts: "",
	answer: "Paris",
	note: "",
	...overrides,
});

const tfngQuestions: StudentQuizQuestion[] = [
	{ stem: "The canal was built in the iron age.", opts: null, pin: null },
	{ stem: "The river flows north.", opts: null, pin: null },
];

describe("QuizReviewItem — chip verdict", () => {
	it("đúng → chip success token 'Đúng'", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem info={reviewInfo({ verdict: "correct" })} />,
		);
		expect(html).toContain('data-verdict="correct"');
		expect(html).toContain("bg-success-soft");
		expect(html).toMatch(/data-testid="quiz-review-chip"[^>]*>Đúng</);
	});

	it("sai → chip danger hiển thị đáp án học viên", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ verdict: "wrong", answer: "tape" })}
			/>,
		);
		expect(html).toContain('data-verdict="wrong"');
		expect(html).toContain("bg-danger-soft");
		expect(html).toMatch(/data-testid="quiz-review-chip"[^>]*>tape</);
	});

	it("bỏ qua → chip muted 'Chưa trả lời'", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ verdict: "skipped", answer: null })}
			/>,
		);
		expect(html).toContain('data-verdict="skipped"');
		expect(html).toContain("text-muted-fg");
		expect(quizReviewChipText({ verdict: "skipped", answer: null })).toBe(
			"Chưa trả lời",
		);
	});
});

describe("QuizReviewItem — dòng Đáp án", () => {
	it("Đáp án: X + '— thay thế: a / b' khi có alts", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({
					key: "glue",
					alts: "adhesive / paste",
				})}
			/>,
		);
		expect(html).toContain("Đáp án:");
		expect(html).toContain(">glue</span>");
		expect(html).toContain("thay thế:");
		expect(html).toContain("adhesive / paste");
	});

	it("không có alts → không render 'thay thế'", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem info={reviewInfo({ key: "Paris", alts: "" })} />,
		);
		expect(html).toContain("Đáp án:");
		expect(html).not.toContain("thay thế");
	});
});

describe("QuizReviewItem — disclosure Giải thích (note snapshot)", () => {
	it("note có nội dung → disclosure 'Giải thích' chứa note", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ note: "Kênh đào xây thời kỳ đồ sắt." })}
			/>,
		);
		expect(html).toContain("Giải thích");
		expect(html).toContain("Kênh đào xây thời kỳ đồ sắt.");
	});

	it("note rỗng → không render disclosure", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem info={reviewInfo({ note: "  " })} />,
		);
		expect(html).not.toContain("Giải thích");
	});
});

describe("QuizPaper mode=review — paper read-only từ đáp án học viên", () => {
	const review = {
		0: reviewInfo({ verdict: "wrong", key: "FALSE", answer: "TRUE" }),
		1: reviewInfo({ verdict: "skipped", key: "TRUE", answer: null }),
	} satisfies Record<number, QuizReviewInfo>;

	it("fieldset disabled + radio giữ lựa chọn học viên + review item chèn sau câu", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(tfngQuestions)}
				answers={{ 0: "TRUE", 1: "" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={review}
			/>,
		);
		// Cả 2 câu bọc trong disabled fieldset (disabled chặn mọi input con).
		expect((html.match(/ disabled=""/g) ?? []).length).toBe(2);
		// Lựa chọn học viên vẫn hiển thị (value, không editable).
		expect(html).toContain('checked="" value="TRUE"');
		// Chip verdict + Đáp án render trong mỗi câu.
		expect((html.match(/data-testid="quiz-review-item"/g) ?? []).length).toBe(2);
		expect(html).toContain("Đáp án:");
		expect(html).not.toMatch(/cursor-pointer/);
	});

	it("cloze input disabled với value = đáp án học viên", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts([
					{ stem: "The river ____ the city.", opts: null, pin: null },
				])}
				answers={{ 0: "gluestick" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({ verdict: "correct", key: "glue", answer: "gluestick" }),
				}}
			/>,
		);
		expect(html).toContain('value="gluestick"');
		expect(html).toContain('disabled=""');
		expect(html).toContain("Đáp án:");
		expect(html).toContain(">glue</span>");
	});

	it("take mode giữ nguyên hành vi: không disabled, không review item", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields()}
				parts={buildQuizParts(tfngQuestions)}
				answers={{}}
				onAnswer={() => undefined}
				currentQuestion={null}
			/>,
		);
		expect(html).not.toContain("disabled");
		expect(html).not.toContain("quiz-review-item");
		expect(html).toContain("cursor-pointer");
	});
});

describe("QuizNavigator mode=review — nút số câu tô màu theo verdict", () => {
	const parts = buildQuizParts(tfngQuestions);

	it("màu theo verdict + status line đếm đúng/sai/bỏ qua", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={parts}
				answers={{ 0: "TRUE" }}
				current={null}
				onSelect={() => undefined}
				mode="review"
				verdicts={{ 0: "correct", 1: "skipped" }}
			/>,
		);
		expect(html).toContain('data-verdict="correct"');
		expect(html).toContain('data-verdict="skipped"');
		expect(html).toContain("bg-success-soft");
		expect(html).toContain("text-muted-fg");
		expect(html).toContain("Đúng 1 câu · Sai 0 · Bỏ qua 1");
		// Verdict thay answered-state: nút đúng không dùng fill primary.
		expect(html).not.toContain("bg-primary");
	});

	it("take mode giữ answered-state (không data-verdict)", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={parts}
				answers={{ 0: "TRUE" }}
				current={null}
				onSelect={() => undefined}
			/>,
		);
		expect(html).not.toContain("data-verdict");
		expect(html).toContain("bg-primary");
		expect(html).toContain("Đã trả lời 1/2 câu");
	});
});
