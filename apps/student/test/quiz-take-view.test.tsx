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
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const patchAnswerMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve(),
);
const patchEssayMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve(),
);
const deleteQuizMediaMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
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
	isHttpError: (err: unknown) =>
		typeof err === "object" && err !== null && "status" in err,
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
	deleteQuizMedia: (...args: unknown[]) => deleteQuizMediaMock(...args),
	uploadQuizMedia: vi.fn(),
	setQuizDetailMedia: vi.fn(),
	quizDetailQueryOptions: vi.fn(),
}));

import { AttemptReviewError } from "@/components/quiz/attempt-review-error";
import { QuizStartDialog } from "@/components/quiz/quiz-lifecycle-dialogs";
import { QuizRuntimeHeader } from "@/components/quiz/quiz-runtime-header";
import {
	attemptSummaryHref,
	QuizTakeError,
	QuizTakeView,
	resolveSubmitDisabledReason,
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

describe("QuizTakeView — submitDisabledReason & QuizResumeDialog explanation", () => {
	const originalResizeObserver = globalThis.ResizeObserver;

	beforeAll(() => {
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as typeof ResizeObserver;
	});

	afterAll(() => {
		globalThis.ResizeObserver = originalResizeObserver;
	});

	beforeEach(() => {
		localStorage.clear();
		patchAnswerMock.mockClear();
		patchEssayMock.mockClear();
		submitMock.mockClear();
		mockDetail = {
			assignmentId: "",
			title: "Reading Practice Resume",
			due: "",
			dueAt: null,
			timeLimitSeconds: 1200,
			skill: "reading",
			part: "p1",
			type: "tfng",
			band: "7.0",
			intro: "",
			prompt: "",
			passage: "<p>Paragraph one.</p>",
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
				id: "att-resume-1",
				status: "in_progress",
				answers: { "0": "TRUE" },
				essay: "",
				media: null,
				startedAt: "2026-11-24T10:00:00.000Z",
			},
		};
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("prioritizes every submit-disabled reason deterministically", () => {
		const base = {
			attemptStatus: "in_progress",
			needsResumeDialog: false,
			isSubmitting: false,
			haltedReason: null as
				| "auth"
				| "submitted"
				| "org_mismatch"
				| "finalized"
				| null,
			isSpeaking: false,
			hasMedia: false,
			mediaUploading: false,
			hasPrimaryStore: true,
			hasHybridWriting: false,
			hasEssayStore: false,
		};

		expect(resolveSubmitDisabledReason(base)).toBeNull();
		expect(
			resolveSubmitDisabledReason({ ...base, attemptStatus: "submitted" }),
		).toBe("Bài làm không còn ở trạng thái đang làm.");
		expect(
			resolveSubmitDisabledReason({
				...base,
				needsResumeDialog: true,
				hasPrimaryStore: false,
			}),
		).toBe('Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.');
		expect(resolveSubmitDisabledReason({ ...base, isSubmitting: true })).toBe(
			"Đang nộp bài…",
		);
		expect(resolveSubmitDisabledReason({ ...base, haltedReason: "auth" })).toBe(
			"Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại.",
		);
		expect(
			resolveSubmitDisabledReason({ ...base, haltedReason: "org_mismatch" }),
		).toBe("Tổ chức học tập vừa thay đổi — vui lòng tải lại trang.");
		expect(
			resolveSubmitDisabledReason({ ...base, haltedReason: "submitted" }),
		).toBe("Bài làm không còn ở trạng thái đang làm.");
		expect(
			resolveSubmitDisabledReason({
				...base,
				isSpeaking: true,
				hasMedia: false,
				mediaUploading: true,
			}),
		).toBe("Đang tải file bài nói lên — vui lòng chờ hoàn tất.");
		expect(
			resolveSubmitDisabledReason({
				...base,
				isSpeaking: true,
				hasMedia: false,
				mediaUploading: false,
			}),
		).toBe("Bạn cần tải file bài nói lên trước khi nộp bài.");
		expect(
			resolveSubmitDisabledReason({ ...base, hasPrimaryStore: false }),
		).toBe("Đang khôi phục dữ liệu bài làm…");
		expect(
			resolveSubmitDisabledReason({
				...base,
				hasHybridWriting: true,
				hasEssayStore: false,
			}),
		).toBe("Đang khôi phục dữ liệu bài làm…");
	});

	it("explains locked submit inside QuizResumeDialog, traps Shift+Tab, and unlocks the same submit button on resume", () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-resume-1" }}
					serverAnswers={{ "0": "TRUE" }}
				/>
			</QueryClientProvider>,
		);

		const dialog = screen.getByRole("alertdialog", {
			name: "Tiếp tục bài làm",
		});
		expect(
			within(dialog).getByText(
				"Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?",
			),
		).toBeTruthy();
		expect(within(dialog).getByTestId("quiz-dialog-helper").textContent).toBe(
			'Hãy chọn "Tiếp tục" để khôi phục bài làm và mở khóa nút "Nộp bài".',
		);

		// Focus starts on dialog card; Shift+Tab wraps inside modal to the last enabled button.
		expect(document.activeElement).toBe(dialog);
		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
		const resumeBtn = within(dialog).getByRole("button", { name: "Tiếp tục" });
		expect(document.activeElement).toBe(resumeBtn);

		const submitBtn = screen.getByRole("button", {
			name: "Nộp bài",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
		const describedById = submitBtn.getAttribute("aria-describedby");
		expect(describedById).toBeTruthy();
		expect(document.getElementById(describedById ?? "")?.textContent).toBe(
			'Hãy chọn "Tiếp tục" trong hộp thoại để mở khóa nút nộp bài.',
		);

		fireEvent.click(resumeBtn);

		expect(
			screen.queryByRole("alertdialog", { name: "Tiếp tục bài làm" }),
		).toBeNull();
		// Same DOM button node stays mounted across disabled -> enabled transition.
		expect(submitBtn.isConnected).toBe(true);
		expect(submitBtn.disabled).toBe(false);
		expect(submitBtn.getAttribute("aria-describedby")).toBeNull();
	});

	it("reveals hover tooltip and aria-describedby on non-modal disabled submit button (Speaking without media)", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		mockDetail = {
			...mockDetail,
			assignmentId: "ca-speak-1",
			skill: "speaking",
			part: "part2",
			type: "cue",
			passage: "",
			questions: [],
			attempt: {
				id: "att-speak-1",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
			},
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-speak-1" }}
					serverAnswers={{}}
				/>
			</QueryClientProvider>,
		);

		const submitBtn = screen.getByRole("button", {
			name: "Nộp bài",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
		const describedById = submitBtn.getAttribute("aria-describedby");
		expect(describedById).toBeTruthy();
		expect(document.getElementById(describedById ?? "")?.textContent).toBe(
			"Bạn cần tải file bài nói lên trước khi nộp bài.",
		);

		// Tooltip portal must not exist before hover (guards against sr-only phantom pass).
		expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();

		fireEvent.mouseEnter(screen.getByTestId("submit-disabled-trigger"));

		await waitFor(() => {
			expect(
				document.querySelector('[data-slot="tooltip-content"]')?.textContent,
			).toBe("Bạn cần tải file bài nói lên trước khi nộp bài.");
		});
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("closes tooltip cleanly and prevents stale reopening across disabled -> enabled -> disabled transitions", async () => {
		const reasonA = "Lý do khóa ban đầu.";
		const reasonB = "Lý do khóa mới.";
		const { rerender } = render(
			<QuizRuntimeHeader
				title="Speaking Test"
				saveState={null}
				onSubmitClick={() => undefined}
				submitDisabled
				submitDisabledReason={reasonA}
			/>,
		);

		fireEvent.mouseEnter(screen.getByTestId("submit-disabled-trigger"));
		await waitFor(() => {
			expect(
				document.querySelector('[data-slot="tooltip-content"]')?.textContent,
			).toBe(reasonA);
		});

		// Transition to enabled while hovered (without mouseLeave): tooltip must close and stay closed.
		rerender(
			<QuizRuntimeHeader
				title="Speaking Test"
				saveState="saved"
				onSubmitClick={() => undefined}
				submitDisabled={false}
				submitDisabledReason={null}
			/>,
		);
		await waitFor(() => {
			const popup = document.querySelector('[data-slot="tooltip-content"]');
			expect(popup === null || popup.className.includes("hidden")).toBe(true);
		});

		const enabledButton = screen.getByRole("button", { name: "Nộp bài" });
		fireEvent.mouseLeave(enabledButton.parentElement as HTMLElement);
		fireEvent.mouseEnter(enabledButton.parentElement as HTMLElement);
		expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();

		// Transition back to disabled with a new reason: must NOT auto-open without a fresh hover.
		rerender(
			<QuizRuntimeHeader
				title="Speaking Test"
				saveState={null}
				onSubmitClick={() => undefined}
				submitDisabled
				submitDisabledReason={reasonB}
			/>,
		);
		expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull();

		fireEvent.mouseLeave(screen.getByTestId("submit-disabled-trigger"));
		fireEvent.mouseEnter(screen.getByTestId("submit-disabled-trigger"));
		await waitFor(() => {
			expect(
				document.querySelector('[data-slot="tooltip-content"]')?.textContent,
			).toBe(reasonB);
		});
	});

	it("skips disabled confirm button in QuizDialog focus trap for Shift+Tab and Tab", () => {
		render(
			<QuizStartDialog
				open
				starting
				onStart={() => undefined}
				onCancel={() => undefined}
			/>,
		);
		const dialog = screen.getByRole("alertdialog", {
			name: "Bắt đầu làm bài",
		});
		const cancelBtn = within(dialog).getByRole("button", { name: "Quay lại" });
		const startBtn = within(dialog).getByRole("button", {
			name: "Bắt đầu",
		}) as HTMLButtonElement;
		expect(startBtn.disabled).toBe(true);
		expect(document.activeElement).toBe(dialog);

		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
		expect(document.activeElement).toBe(cancelBtn);

		fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
		expect(document.activeElement).toBe(cancelBtn);
	});

	it("halts primary store and disables submit with auth reason when Speaking media delete returns 401", async () => {
		deleteQuizMediaMock.mockReset();
		deleteQuizMediaMock.mockRejectedValueOnce({ status: 401 });
		mockDetail = {
			...mockDetail,
			assignmentId: "ca-speak-auth",
			skill: "speaking",
			part: "part2",
			type: "cue",
			passage: "",
			questions: [],
			attempt: {
				id: "att-speak-auth",
				status: "in_progress",
				answers: {},
				essay: "",
				media: {
					name: "speaking.mp3",
					type: "audio/mpeg",
					size: 2048,
					uploadedAt: "2026-11-24T10:00:00.000Z",
				},
			},
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-speak-auth" }}
					serverAnswers={{}}
				/>
			</QueryClientProvider>,
		);

		const submitBtn = screen.getByRole("button", {
			name: "Nộp bài",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(false);

		// Open Speaking delete confirm dialog and confirm deletion → 401 triggers onAuthError.
		fireEvent.click(screen.getByRole("button", { name: "Xoá" }));
		const confirmDialog = screen.getByRole("alertdialog", {
			name: "Xoá file bài nói?",
		});
		fireEvent.click(within(confirmDialog).getByRole("button", { name: "Xoá" }));

		await waitFor(() => {
			expect(screen.getByTestId("auth-error-banner")).toBeTruthy();
		});
		expect(submitBtn.disabled).toBe(true);
		const describedById = submitBtn.getAttribute("aria-describedby");
		expect(describedById).toBeTruthy();
		expect(document.getElementById(describedById ?? "")?.textContent).toBe(
			"Phiên đăng nhập đã hết hạn — vui lòng đăng nhập lại.",
		);
	});
});
