// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentQuizDetail } from "@teacher-os/api/contracts";
import {
	act,
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
	isStudentOrgMismatchError: () => false,
	isTeacherOnStudentPortalError: () => false,
	reauth: vi.fn(),
}));

const useQuizAudioStreamMock = vi.fn(
	(_source: unknown, _options?: unknown) => ({
		audioSrc: null as string | null,
		audioLoading: false,
		audioError: false,
		onAudioError: vi.fn(),
		retry: vi.fn(),
	}),
);

vi.mock("@/lib/repos/quiz", () => ({
	quizTakeSourceId: (
		s:
			| { kind: "assignment"; id: string }
			| { kind: "practice"; testId: string },
	) => (s.kind === "assignment" ? s.id : s.testId),
	quizDetailQueryKey: (s: unknown) => ["quiz-detail", s],
	useStudentQuizDetail: () => ({ data: mockDetail, isPending: false }),
	useStartQuizAttempt: () => ({ mutate: vi.fn(), isPending: false }),
	useQuizAudioStream: (source: unknown, options?: unknown) =>
		useQuizAudioStreamMock(source, options),
	useQuizAudioObjectUrl: () => ({
		audioSrc: null,
		audioLoading: false,
		audioError: false,
	}),
	useAssignmentAudioObjectUrl: () => ({
		audioSrc: null,
		audioLoading: false,
		audioError: false,
	}),
	patchQuizAnswer: (...args: unknown[]) => patchAnswerMock(...args),
	patchQuizEssay: (...args: unknown[]) => patchEssayMock(...args),
	submitQuizAttempt: (...args: unknown[]) => submitMock(...args),
}));

import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import {
	attemptSummaryHref,
	QuizTakeError,
	QuizTakeView,
} from "@/components/quiz/quiz-take-view";
import {
	resetServerClockForTests,
	syncServerClock,
} from "@/lib/attempt-format";

describe("QuizTakeView — hybrid MCQ + Writing dual-store runtime (#574)", () => {
	beforeEach(() => {
		localStorage.clear();
		patchAnswerMock.mockClear();
		patchEssayMock.mockClear();
		submitMock.mockClear();
		useQuizAudioStreamMock.mockClear();
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

	it("renders due date in header for assignment with due date and dueAt (#587)", () => {
		mockDetail = {
			...mockDetail,
			due: "2026-11-15",
			dueAt: "2026-11-15T10:00:00.000Z", // 17:00 VN
		};
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
		const dueElem = screen.getByTestId("quiz-runtime-due");
		expect(dueElem.textContent).toBe("Hạn: 17:00 15/11");
	});

	it("hides due date in header for practice or untimed assignment (#587)", () => {
		mockDetail = {
			...mockDetail,
			due: "",
			dueAt: null,
		};
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
		expect(screen.queryByTestId("quiz-runtime-due")).toBeNull();
	});

	it("keeps hook order stable when transitioning from attempt=null to started attempt (#702)", () => {
		mockDetail = {
			...mockDetail,
			hasAudio: true,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-hyb-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByText("Bắt đầu làm bài")).toBeTruthy();

		mockDetail = {
			...mockDetail,
			hasAudio: true,
			attempt: {
				id: "att-hyb-started",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
			},
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-hyb-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByTestId("navigator-progress")).toBeTruthy();
	});

	it("streams practice audio through useQuizAudioStream with auth recovery callback when practice listening test hasAudio", () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "listening",
			part: "s4",
			type: "notes",
			hasAudio: true,
			audioName: "talking-about-the-history-of-bikes.mp3",
			writing: undefined,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-listen-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(useQuizAudioStreamMock).toHaveBeenCalledWith(
			{
				kind: "practice",
				testId: "test-listen-1",
			},
			expect.objectContaining({
				onAuthError: expect.any(Function),
			}),
		);
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-listen-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(invalidateSpy).not.toHaveBeenCalled();
	});

	it("hides band on start gate for practice auto-graded quiz without hybrid writing", () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "listening",
			part: "s4",
			type: "notes",
			band: "7.0",
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-listen-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByText("2 câu hỏi", { exact: true })).toBeTruthy();
		expect(container.textContent).not.toContain("Band");
	});

	it("hides band on start gate for hybrid assignment", () => {
		mockDetail = {
			...mockDetail,
			band: "6.5",
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-hyb-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(
			screen.getByText("2 câu hỏi + Bài viết", { exact: true }),
		).toBeTruthy();
		expect(container.textContent).not.toContain("Band");
	});

	it("hides band on start gate for writing assignment", () => {
		mockDetail = {
			...mockDetail,
			skill: "writing",
			part: "task2",
			type: "discuss",
			band: "7.0",
			questions: [],
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-w-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(
			screen.getByText("Bài viết · tối thiểu 250 từ", { exact: true }),
		).toBeTruthy();
		expect(container.textContent).not.toContain("Band");
	});

	it("hides band on start gate for speaking assignment", () => {
		mockDetail = {
			...mockDetail,
			skill: "speaking",
			part: "part2",
			type: "cue",
			band: "7.5",
			questions: [],
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-s-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(
			screen.getByText(
				"Bài nói · Part 2 · nộp 1 file audio/video (tối đa 50 MB)",
				{ exact: true },
			),
		).toBeTruthy();
		expect(container.textContent).not.toContain("Band");
	});

	it("keeps quiz summary redirect and error home links under /student subpath", () => {
		expect(attemptSummaryHref("att-1")).toBe(
			"/student/learn/quizzes/attempt/att-1",
		);
		expect(attemptSummaryHref("att/with space")).toBe(
			"/student/learn/quizzes/attempt/att%2Fwith%20space",
		);

		const takeError = render(<QuizTakeError error={new Error("boom")} />);
		expect(
			takeError.container
				.querySelector('a[href="/student"]')
				?.textContent?.trim(),
		).toBe("Về trang chủ");
		cleanup();

		const reviewError = render(
			<AttemptReviewError error={new Error("boom")} />,
		);
		expect(
			reviewError.container
				.querySelector('a[href="/student"]')
				?.textContent?.trim(),
		).toBe("Về trang chủ");
	});
});

describe("QuizTakeView — practice countdown timer & split-pane height safety", () => {
	const BASE_NOW = Date.parse("2026-11-24T10:03:00.000Z");
	const STARTED_AT = "2026-11-24T10:00:00.000Z";

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(BASE_NOW);
		resetServerClockForTests();
		localStorage.clear();
		patchAnswerMock.mockClear();
		patchEssayMock.mockClear();
		submitMock.mockClear();
		mockDetail = {
			assignmentId: "",
			title: "Reading Practice Timed",
			due: "",
			dueAt: null,
			timeLimitSeconds: 1200,
			skill: "reading",
			part: "p1",
			type: "tfng",
			band: "7.0",
			intro: "",
			prompt: "",
			passage: "<p>Paragraph one.</p><p>Paragraph two.</p>",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			questions: [
				{
					stem: "Question 1",
					opts: null,
					type: "tfng",
					pin: null,
				},
			],
			attempt: {
				id: "att-prac-1",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
				startedAt: STARTED_AT,
			},
		};
	});

	afterEach(() => {
		cleanup();
		resetServerClockForTests();
		vi.useRealTimers();
	});

	function renderPractice(serverAnswers: Record<string, string> = {}) {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		return render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-timed-1" }}
					serverAnswers={serverAnswers}
				/>
			</QueryClientProvider>,
		);
	}

	it("renders live MM:SS countdown badge, ticks every second, and compensates client clock skew", () => {
		renderPractice();
		const badge = screen.getByTestId("quiz-timer-badge");
		expect(badge.textContent).toBe("17:00");
		expect(badge.getAttribute("data-state")).toBe("running");
		expect(badge.getAttribute("aria-live")).toBeNull();

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(badge.textContent).toBe("16:59");

		cleanup();

		// Client clock skewed +5m ahead of server → syncServerClock compensates back to 17:00
		const skewedNow = BASE_NOW + 300_000;
		vi.setSystemTime(skewedNow);
		syncServerClock(new Date(BASE_NOW).toISOString(), skewedNow);
		renderPractice();
		expect(screen.getByTestId("quiz-timer-badge").textContent).toBe("17:00");
	});

	it("switches to warn phase at threshold and transitions to soft expiry without auto-submit or lingering intervals", () => {
		// 10m limit, 8m elapsed -> 02:00 (warn)
		mockDetail = {
			...mockDetail,
			timeLimitSeconds: 600,
		};
		vi.setSystemTime(Date.parse(STARTED_AT) + 480_000);
		renderPractice();
		const warnBadge = screen.getByTestId("quiz-timer-badge");
		expect(warnBadge.textContent).toBe("02:00");
		expect(warnBadge.getAttribute("data-state")).toBe("warn");
		expect(screen.queryByTestId("quiz-time-expired-banner")).toBeNull();

		cleanup();

		// Reload on an already-expired attempt (10m05s elapsed) → immediate banner, 00:00, no interval, submit still enabled
		vi.setSystemTime(Date.parse(STARTED_AT) + 605_000);
		renderPractice();
		const expiredBadge = screen.getByTestId("quiz-timer-badge");
		expect(expiredBadge.textContent).toBe("00:00");
		expect(expiredBadge.getAttribute("data-state")).toBe("expired");
		expect(screen.getByTestId("quiz-time-expired-banner")).toBeTruthy();
		expect(vi.getTimerCount()).toBe(0);
		expect(submitMock).not.toHaveBeenCalled();
		const submitBtn = screen.getByRole("button", {
			name: "Nộp bài",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(false);

		cleanup();

		// Live tick crossing 00:01 → 00:00 clears running interval (1 → 0) and shows banner on the same instance
		vi.setSystemTime(Date.parse(STARTED_AT) + 599_000);
		renderPractice();
		const liveBadge = screen.getByTestId("quiz-timer-badge");
		expect(liveBadge.textContent).toBe("00:01");
		expect(liveBadge.getAttribute("data-state")).toBe("warn");
		expect(screen.queryByTestId("quiz-time-expired-banner")).toBeNull();
		expect(vi.getTimerCount()).toBe(1);

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(liveBadge.textContent).toBe("00:00");
		expect(liveBadge.getAttribute("data-state")).toBe("expired");
		expect(screen.getByTestId("quiz-time-expired-banner")).toBeTruthy();
		expect(vi.getTimerCount()).toBe(0);
		expect(submitMock).not.toHaveBeenCalled();
	});

	it("keeps ticking from original startedAt while QuizResumeDialog is open on reload", () => {
		renderPractice({ "0": "TRUE" });
		expect(
			screen.getByText(
				"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?",
			),
		).toBeTruthy();
		const badge = screen.getByTestId("quiz-timer-badge");
		expect(badge.textContent).toBe("17:00");

		act(() => {
			vi.advanceTimersByTime(2000);
		});
		expect(badge.textContent).toBe("16:58");
	});

	it("hides timer badge on untimed practice and assignments, and displays static duration on start gate", () => {
		// Untimed practice
		mockDetail = { ...mockDetail, timeLimitSeconds: null };
		renderPractice();
		expect(screen.queryByTestId("quiz-timer-badge")).toBeNull();
		cleanup();

		// Assignment (timeLimitSeconds omitted)
		mockDetail = {
			...mockDetail,
			assignmentId: "ca-1",
			timeLimitSeconds: undefined,
		};
		renderPractice();
		expect(screen.queryByTestId("quiz-timer-badge")).toBeNull();
		cleanup();

		// Timed practice start gate (attempt === null)
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			timeLimitSeconds: 1200,
			attempt: null,
		};
		renderPractice();
		expect(screen.queryByTestId("quiz-timer-badge")).toBeNull();
		expect(screen.getByText("1 câu hỏi · 20 phút")).toBeTruthy();
	});

	it("locks Reading split-pane wrapper to lg:h-svh with min-h-0 flex-1 child around fillParent layout", () => {
		const { container } = renderPractice();
		const root = container.firstElementChild;
		expect(root?.className).toContain("lg:h-svh");
		expect(root?.className).toContain("lg:overflow-hidden");
		const splitWrapper = screen.getByTestId("reading-passage-pane")
			.parentElement?.parentElement;
		expect(splitWrapper?.className).toContain("min-h-0");
		expect(splitWrapper?.className).toContain("flex-1");
	});
});
