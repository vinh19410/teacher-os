// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentQuizDetail } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const patchAnswerMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve(),
);
const patchEssayMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve(),
);
const submitMock = vi.fn<
	(...args: unknown[]) => Promise<{
		correctCount: number;
		totalCount: number;
		wrongCount: number;
		skippedCount: number;
	}>
>(() =>
	Promise.resolve({
		correctCount: 1,
		totalCount: 2,
		wrongCount: 0,
		skippedCount: 1,
	}),
);

let mockDetail: StudentQuizDetail;

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
	useBlocker: () => ({ status: "unblocked", proceed: vi.fn(), reset: vi.fn() }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("sonner", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/query-client", () => ({
	isHttpError: () => false,
	reauth: vi.fn(),
}));

vi.mock("@/lib/repos/quiz", () => ({
	quizDetailQueryKey: (s: unknown) => ["quiz-detail", s],
	useStudentQuizDetail: () => ({ data: mockDetail, isPending: false }),
	useStartQuizAttempt: () => ({ mutate: vi.fn(), isPending: false }),
	patchQuizAnswer: (...args: unknown[]) => patchAnswerMock(...args),
	patchQuizEssay: (...args: unknown[]) => patchEssayMock(...args),
	submitQuizAttempt: (...args: unknown[]) => submitMock(...args),
}));

import { QuizTakeView } from "@/components/quiz/quiz-take-view";

describe("QuizTakeView — hybrid MCQ + Writing dual-store runtime (#574)", () => {
	beforeEach(() => {
		localStorage.clear();
		patchAnswerMock.mockClear();
		patchEssayMock.mockClear();
		submitMock.mockClear();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { assign: vi.fn(), href: "http://localhost:8003" },
		});
		mockDetail = {
			assignmentId: "ca-hyb-1",
			title: "Grammar + Writing Homework",
			due: "2026-11-15",
			skill: "grammar",
			part: "tenses",
			type: "mcq",
			band: "6.5",
			intro: "",
			prompt: "",
			passage: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			questions: [
				{
					stem: "She ___ coffee every morning.",
					opts: ["drink", "drinks", "drinking", "drank"],
					type: "mcq",
					pin: null,
				},
				{
					stem: "They ___ home early.",
					opts: ["go", "goes", "went", "gone"],
					type: "mcq",
					pin: null,
				},
			],
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Discuss remote work advantages.</p>",
			},
			attempt: {
				id: "att-hyb-1",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
			},
		};
	});

	afterEach(() => {
		cleanup();
	});

	it("routes MCQ answers to patchQuizAnswer and essay edits to patchQuizEssay without key-0 collision, warns on combined incomplete state, and drains both stores on submit", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-hyb-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		// Renders both MCQ question 1 and Phần 2 · Writing
		expect(screen.getByText(/She ___ coffee every morning\./)).toBeDefined();
		expect(screen.getByTestId("hybrid-writing-section")).toBeDefined();

		// Select answer B on question 1 (q = 0)
		const q1RadioGroup = screen.getByRole("radiogroup", { name: "Câu 1" });
		const radios = q1RadioGroup.querySelectorAll('input[type="radio"]');
		fireEvent.click(radios[1] as HTMLElement);

		// Type short essay (< 250 words) in textarea
		const textarea = screen.getByRole("textbox");
		fireEvent.change(textarea, {
			target: { value: "Remote work saves commuting time." },
		});

		// Question 1 radio B stays checked (no key-0 collision!)
		expect((radios[1] as HTMLInputElement).checked).toBe(true);

		// Click Nộp bài -> combined guard dialog opens (1 unanswered MCQ + short essay)
		const submitBtn = screen.getByRole("button", { name: /Nộp bài/i });
		fireEvent.click(submitBtn);

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain(
			"Còn câu chưa trả lời và bài viết chưa hoàn chỉnh",
		);

		// Confirm submit -> drains BOTH answerStore and essayStore before calling submitQuizAttempt
		const confirmBtn = within(dialog).getByRole("button", { name: "Nộp bài" });
		fireEvent.click(confirmBtn);

		await waitFor(() => {
			expect(submitMock).toHaveBeenCalledWith("att-hyb-1");
		});
		// Real timers: either 600ms debounce ({ keepalive: false }) or drain() (undefined) may win.
		expect(patchAnswerMock).toHaveBeenCalledTimes(1);
		expect(patchAnswerMock.mock.calls[0]?.slice(0, 3)).toEqual([
			"att-hyb-1",
			0,
			"B",
		]);
		expect(patchEssayMock).toHaveBeenCalledTimes(1);
		expect(patchEssayMock.mock.calls[0]?.slice(0, 2)).toEqual([
			"att-hyb-1",
			"Remote work saves commuting time.",
		]);
		expect(localStorage.getItem("quiz-attempt:att-hyb-1:essay")).toBeNull();
		expect(localStorage.getItem("quiz-attempt:att-hyb-1")).toBeNull();
	});
});
