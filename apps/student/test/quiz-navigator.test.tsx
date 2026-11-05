import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { QuizNavigator } from "@teacher-os/ui/components/quiz/quiz-navigator";
import { scrollToQuestion } from "@teacher-os/ui/components/quiz/quiz-question-item";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	QuizResumeDialog,
	QuizStartDialog,
	QuizSubmitGuardDialog,
} from "@/components/quiz/quiz-lifecycle-dialogs";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";

// QuizRuntimeHeader dùng TanStack Link (exit về overview) — stub thành <a>
// để renderToStaticMarkup chạy không cần router context.
vi.mock("@tanstack/react-router", () => ({
	Link: (props: { to: string; children: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

const fiveQuestions: StudentQuizQuestion[] = Array.from(
	{ length: 5 },
	(_, index) => ({ stem: `Câu ${index + 1}`, opts: null, pin: null }),
);

describe("QuizNavigator — trạng thái nút câu", () => {
	it("đã làm = accent fill; chưa = surface + border; status line đếm đúng", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={buildQuizParts(fiveQuestions, "tfng")}
				answers={{ 0: "TRUE", 2: "glue" }}
				current={null}
				onSelect={() => undefined}
			/>,
		);
		// Progress status semantics.
		expect(html).toContain('role="status"');
		expect(html).toContain("Đã trả lời 2/5 câu");

		// Answered: accent fill (bg-primary + text-primary-foreground).
		expect(html).toContain('data-answered="true"');
		expect(html).toContain('data-answered="false"');
		expect(html).toContain("bg-primary text-primary-foreground");
		// Unanswered: nền trang + viền hairline (v2).
		expect(html).toContain("border-border bg-background");
		// Số câu + aria label trạng thái.
		expect(html).toContain('aria-label="Câu 1 — đã trả lời"');
		expect(html).toContain('aria-label="Câu 2 — chưa trả lời"');
		expect((html.match(/<button/g) ?? []).length).toBe(5);
	});

	it("đề nhiều cụm → không có tab nhóm, đủ nút số câu theo thứ tự", () => {
		const mixed: StudentQuizQuestion[] = [
			{ stem: "A", opts: null, pin: null, type: "tfng" },
			{ stem: "B", opts: null, pin: null, type: "tfng" },
			{ stem: "C ____", opts: null, pin: null, type: "note" },
			{ stem: "D ____", opts: null, pin: null, type: "note" },
			{ stem: "E ____", opts: null, pin: null, type: "note" },
		];
		const parts = buildQuizParts(mixed, "note");
		expect(parts.length).toBeGreaterThan(1);
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={parts}
				answers={{}}
				current={null}
				onSelect={() => undefined}
			/>,
		);
		expect(html).not.toContain("tablist");
		expect(html).not.toContain('role="tab"');
		expect(html).not.toContain("Questions 1–2");
		const order = [...html.matchAll(/data-question="(\d+)"/g)].map((match) =>
			Number(match[1]),
		);
		expect(order).toEqual([0, 1, 2, 3, 4]);
	});

	it("thanh trải full chiều ngang — không còn max-w-[720px]; dưới lg giới hạn chiều cao có cuộn", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={buildQuizParts(fiveQuestions, "tfng")}
				answers={{}}
				current={null}
				onSelect={() => undefined}
			/>,
		);
		expect(html).not.toContain("max-w-[720px]");
		expect(html).toContain("max-h-[30svh]");
		expect(html).toContain("overflow-y-auto");
	});

	it("highlight câu hiện tại qua aria-current + outline", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={buildQuizParts(fiveQuestions, "tfng")}
				answers={{}}
				current={3}
				onSelect={() => undefined}
			/>,
		);
		expect(html).toContain('aria-current="true"');
		expect(html).toContain("outline-primary");
	});
});

describe("scrollToQuestion — scroll-to target", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("cuộn + focus đúng anchor id của câu", () => {
		const scrollIntoView = vi.fn();
		const focus = vi.fn();
		const anchors: Record<string, unknown> = {
			"quiz-q-3": { scrollIntoView, focus },
		};
		vi.stubGlobal("document", {
			getElementById: (id: string) => anchors[id] ?? null,
		});

		scrollToQuestion(2);

		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "start",
		});
		expect(focus).toHaveBeenCalledWith({ preventScroll: true });
	});

	it("câu không tồn tại → no-op an toàn", () => {
		vi.stubGlobal("document", {
			getElementById: () => null,
		});
		expect(() => scrollToQuestion(99)).not.toThrow();
	});
});

describe("QuizRuntimeHeader — save-state element (RT#7)", () => {
	const header = (saveState: "saving" | "saved" | "error" | null) =>
		renderToStaticMarkup(
			<QuizRuntimeHeader
				title="Reading Test 5"
				saveState={saveState}
				onSubmitClick={() => undefined}
				submitDisabled={false}
			/>,
		);

	it("role=status + data-testid + nhãn 3 trạng thái terminal", () => {
		expect(header("saving")).toContain('role="status"');
		expect(header("saving")).toContain('data-testid="save-state"');
		expect(header("saving")).toContain('data-state="saving"');
		expect(header("saving")).toContain("Đang lưu…");
		expect(header("saved")).toContain("Đã lưu");
		expect(header("error")).toContain("Lỗi lưu");
	});

	it("saveState=null (start gate) → không render save-state", () => {
		expect(header(null)).not.toContain('data-testid="save-state"');
	});

	it("nút Nộp bài disable theo prop; onSubmitClick=null giấu nút", () => {
		const enabled = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="T"
				saveState="saved"
				onSubmitClick={() => undefined}
			/>,
		);
		expect(enabled).toContain("Nộp bài");
		expect(enabled).not.toContain('disabled=""');

		const disabled = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="T"
				saveState="saving"
				onSubmitClick={() => undefined}
				submitDisabled
			/>,
		);
		expect(disabled).toContain("disabled");

		const noSubmit = renderToStaticMarkup(
			<QuizRuntimeHeader title="T" saveState={null} onSubmitClick={null} />,
		);
		expect(noSubmit).not.toContain("Nộp bài");
		expect(noSubmit).toContain('href="/"');
	});

	it("nút Nộp bài dùng màu chữ tương phản cao text-primary-foreground và không dùng text-bg (#586)", () => {
		const html = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="T"
				saveState="saved"
				onSubmitClick={() => undefined}
			/>,
		);
		expect(html).not.toContain("text-bg");
		expect(html).toContain("text-primary-foreground");
	});

	it("hiển thị hạn nộp khi có dueText và giấu khi dueText rỗng/null (#587)", () => {
		const withDue = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="Reading Test 5"
				dueText="Hạn: 17:00 15/11"
				saveState="saved"
				onSubmitClick={() => undefined}
			/>,
		);
		expect(withDue).toContain('data-testid="quiz-runtime-due"');
		expect(withDue).toContain("Hạn: 17:00 15/11");
		expect(withDue).toContain("font-mono text-[11px] text-muted-foreground");

		const withoutDue = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="Reading Test 5"
				dueText=""
				saveState="saved"
				onSubmitClick={() => undefined}
			/>,
		);
		expect(withoutDue).not.toContain('data-testid="quiz-runtime-due"');

		const nullDue = renderToStaticMarkup(
			<QuizRuntimeHeader
				title="Practice Test"
				dueText={null}
				saveState={null}
				onSubmitClick={null}
			/>,
		);
		expect(nullDue).not.toContain('data-testid="quiz-runtime-due"');
	});

	it("bảo vệ layout trên mobile khi tiêu đề bài thi dài: tiêu đề truncate, hạn nộp whitespace-nowrap shrink-0 (#587)", () => {
		const longTitle =
			"IELTS Academic Reading Test 2026 - Comprehensive Diagnostic Practice Assignment for Advanced Students";
		const html = renderToStaticMarkup(
			<QuizRuntimeHeader
				title={longTitle}
				dueText="Hạn: 17:00 15/11"
				saveState="saved"
				onSubmitClick={() => undefined}
			/>,
		);
		expect(html).toContain("truncate");
		expect(html).toContain("min-w-0");
		expect(html).toContain("whitespace-nowrap");
		expect(html).toContain("shrink-0");
		expect(html).toContain("Thoát");
		expect(html).toContain("Nộp bài");
	});
});

describe("QuizLifecycleDialogs — copy vòng đời (Selfomy parity)", () => {
	it("start confirm", () => {
		const html = renderToStaticMarkup(
			<QuizStartDialog
				open
				starting={false}
				onStart={() => undefined}
				onCancel={() => undefined}
			/>,
		);
		expect(html).toContain("Bạn có muốn bắt đầu làm bài ngay bây giờ không?");
		expect(html).toContain("Bắt đầu");
		expect(html).toContain("Quay lại");
		expect(html).toContain('role="alertdialog"');
		expect(html).toContain('aria-modal="true"');
	});

	it("resume khi còn bài chưa hoàn thành", () => {
		const html = renderToStaticMarkup(
			<QuizResumeDialog
				open
				onResume={() => undefined}
				onCancel={() => undefined}
			/>,
		);
		expect(html).toContain(
			"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?",
		);
		expect(html).toContain("Tiếp tục");
	});

	it("submit guard đếm câu chưa làm", () => {
		const html = renderToStaticMarkup(
			<QuizSubmitGuardDialog
				open
				unansweredCount={3}
				onConfirm={() => undefined}
				onCancel={() => undefined}
			/>,
		);
		expect(html).toContain("Bạn còn 3 câu hỏi chưa làm");
		expect(html).toContain("Nộp bài");
	});

	it("đóng → không render gì", () => {
		const html = renderToStaticMarkup(
			<QuizStartDialog
				open={false}
				starting={false}
				onStart={() => undefined}
				onCancel={() => undefined}
			/>,
		);
		expect(html).toBe("");
	});
});
