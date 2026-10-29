import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { QuizPaper } from "@teacher-os/ui/components/quiz/quiz-paper";
import {
	QuizReviewChip,
	type QuizReviewInfo,
	QuizReviewItem,
	quizReviewChipText,
	quizReviewExplanation,
} from "@teacher-os/ui/components/quiz/quiz-review-item";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

type PaperFields = Parameters<typeof QuizPaper>[0]["detail"];

const paperFields = (overrides: Partial<PaperFields> = {}): PaperFields => ({
	skill: "reading",
	type: "tfng",
	band: "6.5",
	intro: "",
	prompt: "",
	passage: "<p>Đoạn đọc về kênh đào.</p>",
	cueTopic: "",
	cuePoints: "",
	audioName: "",
	imageUrl: "",
	optionBank: [],
	...overrides,
});

const reviewInfo = (
	overrides: Partial<QuizReviewInfo> = {},
): QuizReviewInfo => ({
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

describe("QuizReviewChip — token verdict + icon (issue #351)", () => {
	it("đúng → verdict-correct token, chữ 'Đúng', icon svg aria-hidden", () => {
		const html = renderToStaticMarkup(
			<QuizReviewChip info={reviewInfo({ verdict: "correct" })} />,
		);
		expect(html).toContain('data-testid="quiz-review-chip"');
		expect(html).toContain("bg-verdict-correct-soft");
		expect(html).toContain("text-verdict-correct");
		expect(html).toContain("<svg");
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain(">Đúng</span>");
		// Icon là svg — text node của chip không lẫn ký tự ✓.
		expect(quizReviewChipText({ verdict: "correct", answer: "B" })).toBe(
			"Đúng",
		);
	});

	it("sai → verdict-wrong token, hiển thị đáp án học viên", () => {
		const html = renderToStaticMarkup(
			<QuizReviewChip
				info={reviewInfo({ verdict: "wrong", answer: "tape" })}
			/>,
		);
		expect(html).toContain("bg-verdict-wrong-soft");
		expect(html).toContain("text-verdict-wrong");
		expect(html).toContain(">tape</span>");
	});

	it("bỏ qua → muted 'Chưa trả lời', viền đứt", () => {
		const html = renderToStaticMarkup(
			<QuizReviewChip
				info={reviewInfo({ verdict: "skipped", answer: null })}
			/>,
		);
		expect(html).toContain("text-muted-foreground");
		expect(html).toContain("border-dashed");
		expect(html).toContain(">Chưa trả lời</span>");
		expect(quizReviewChipText({ verdict: "skipped", answer: null })).toBe(
			"Chưa trả lời",
		);
	});
});

describe("QuizReviewItem — dòng Đáp án + Bạn trả lời", () => {
	it("Đáp án: X tô verdict-correct + '— thay thế: a / b' khi có alts", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({
					key: "glue",
					alts: "adhesive / paste",
				})}
			/>,
		);
		expect(html).toContain("Đáp án:");
		expect(html).toContain("text-verdict-correct");
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

	it("wrong → dòng 'Bạn trả lời' gạch ngang màu verdict-wrong", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ verdict: "wrong", key: "C", answer: "A" })}
			/>,
		);
		expect(html).toContain("Bạn trả lời:");
		expect(html).toContain("line-through");
		expect(html).toContain("text-verdict-wrong");
		expect(html).toContain(">A</span>");
	});

	it("correct → không có dòng 'Bạn trả lời'", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ verdict: "correct", answer: "Paris" })}
			/>,
		);
		expect(html).not.toContain("Bạn trả lời");
	});

	it("khối giữ data-testid + data-verdict; khung nền chuyển lên cấp câu", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem info={reviewInfo({ verdict: "wrong" })} />,
		);
		expect(html).toContain('data-testid="quiz-review-item"');
		expect(html).toContain('data-verdict="wrong"');
		// Không còn khối nền surface riêng (nền verdict nằm ở fieldset câu).
		expect(html).not.toContain("bg-surface");
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

describe("QuizReviewItem — giải thích riêng từng câu (#358)", () => {
	it("explanation câu được ưu tiên hơn note chung của đề", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({
					explanation: "<p>Đoạn 2 nêu rõ <strong>Paris</strong>.</p>",
					note: "Ghi chú chung của đề",
				})}
			/>,
		);
		expect(html).toContain('data-testid="quiz-review-explanation"');
		expect(html).toContain('data-source="question"');
		expect(html).toContain("Giải thích");
		expect(html).toContain("Đoạn 2 nêu rõ");
		expect(html).not.toContain("Ghi chú chung của đề");
		// Disclosure native <details>/<summary> — bàn phím + screen reader sẵn.
		expect(html).toMatch(/<details[^>]*>\s*<summary/);
	});

	it("explanation chỉ khoảng trắng → fallback note", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem
				info={reviewInfo({ explanation: "   ", note: "Ghi chú chung" })}
			/>,
		);
		expect(html).toContain('data-source="note"');
		expect(html).toContain("Ghi chú chung");
	});

	it("cả explanation lẫn note rỗng → không render disclosure", () => {
		const html = renderToStaticMarkup(
			<QuizReviewItem info={reviewInfo({ explanation: " ", note: "" })} />,
		);
		expect(html).not.toContain("quiz-review-explanation");
		expect(html).not.toContain("Giải thích");
	});

	it("quizReviewExplanation — explanation → note → null", () => {
		expect(
			quizReviewExplanation(reviewInfo({ explanation: " e ", note: "n" })),
		).toBe("e");
		expect(quizReviewExplanation(reviewInfo({ note: " n " }))).toBe("n");
		expect(quizReviewExplanation(reviewInfo({ note: " " }))).toBeNull();
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
				parts={buildQuizParts(tfngQuestions, "tfng")}
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
		expect((html.match(/data-testid="quiz-review-item"/g) ?? []).length).toBe(
			2,
		);
		expect(html).toContain("Đáp án:");
		expect(html).not.toMatch(/cursor-pointer/);
	});

	it("cloze input disabled với value = đáp án học viên", () => {
		const html = renderToStaticMarkup(
			<QuizPaper
				detail={paperFields({ type: "shortans" })}
				parts={buildQuizParts(
					[{ stem: "The river ____ the city.", opts: null, pin: null }],
					"shortans",
				)}
				answers={{ 0: "gluestick" }}
				onAnswer={() => undefined}
				currentQuestion={null}
				mode="review"
				review={{
					0: reviewInfo({
						verdict: "correct",
						key: "glue",
						answer: "gluestick",
					}),
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
				parts={buildQuizParts(tfngQuestions, "tfng")}
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

describe("QuizNavigator mode=review — nút số câu nền đặc + icon verdict (#351)", () => {
	const parts = buildQuizParts(tfngQuestions, "tfng");

	it("nền đặc theo verdict (chữ verdict-on) + icon svg + status line đếm", () => {
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
		expect(html).toContain("bg-verdict-correct");
		expect(html).toContain("text-verdict-on");
		expect(html).toContain("text-muted-foreground");
		// Icon nhỏ ở góc mỗi nút verdict.
		expect(html).toContain("absolute -top-1 -right-1");
		expect(html.replace(/<[^>]+>/g, "")).toContain(
			"Đúng 1 câu · Sai 0 · Bỏ qua 1",
		);
		// Verdict thay answered-state: nút đúng không dùng fill primary.
		expect(html).not.toContain("bg-primary");
	});

	it("status line tô số theo verdict nhưng textContent giữ nguyên chuỗi", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={parts}
				answers={{}}
				current={null}
				onSelect={() => undefined}
				mode="review"
				verdicts={{ 0: "wrong", 1: "skipped" }}
			/>,
		);
		expect(html).toContain("text-verdict-correct");
		expect(html).toContain("text-verdict-wrong");
		expect(html.replace(/<[^>]+>/g, "")).toContain(
			"Đúng 0 câu · Sai 1 · Bỏ qua 1",
		);
	});

	it("take mode giữ answered-state (không data-verdict, không icon)", () => {
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
