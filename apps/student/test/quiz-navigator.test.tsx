import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	QuizResumeDialog,
	QuizStartDialog,
	QuizSubmitGuardDialog,
} from "@/components/quiz/quiz-lifecycle-dialogs";
import { QuizNavigator } from "@/components/quiz/quiz-navigator";
import { scrollToQuestion } from "@/components/quiz/quiz-question-item";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";
import { buildQuizParts } from "@/lib/quiz-parts";

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
				parts={buildQuizParts(fiveQuestions)}
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
		// Unanswered: surface + line border.
		expect(html).toContain("border-line bg-surface");
		// Số câu + aria label trạng thái.
		expect(html).toContain('aria-label="Câu 1 — đã trả lời"');
		expect(html).toContain('aria-label="Câu 2 — chưa trả lời"');
		expect((html.match(/<button/g) ?? []).length).toBe(5);
	});

	it("đề 1 phần → không render part tabs (N=1 hôm nay)", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={buildQuizParts(fiveQuestions)}
				answers={{}}
				current={null}
				onSelect={() => undefined}
			/>,
		);
		expect(html).not.toContain('role="tablist"');
		expect(html).toContain('data-question="4"');
	});

	it("highlight câu hiện tại qua aria-current + outline", () => {
		const html = renderToStaticMarkup(
			<QuizNavigator
				parts={buildQuizParts(fiveQuestions)}
				answers={{}}
				current={3}
				onSelect={() => undefined}
			/>,
		);
		expect(html).toContain('aria-current="true"');
		expect(html).toContain("outline-accent-blue");
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
