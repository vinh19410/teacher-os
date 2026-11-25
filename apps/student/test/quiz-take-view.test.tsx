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
let mockQuizIsError = false;
let mockQuizError: unknown = null;
let mockStartIsPending = false;

const navigateMock = vi.fn();
const toastErrorMock = vi.fn();
const startMutateMock = vi.fn();
const isHttpErrorMock = vi.fn<(error: unknown) => boolean>(() => false);
const isStudentOrgMismatchErrorMock = vi.fn<(error: unknown) => boolean>(
	() => false,
);

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
	useBlocker: () => ({ status: "unblocked", proceed: vi.fn(), reset: vi.fn() }),
	Link: ({
		children,
		to,
		params,
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href = params
			? Object.entries(params).reduce(
					(acc, [key, value]) => acc.replace(`$${key}`, value),
					to,
				)
			: to;
		return <a href={href}>{children}</a>;
	},
}));

vi.mock("sonner", () => ({
	toast: {
		error: (...args: unknown[]) => toastErrorMock(...args),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/query-client", () => ({
	isHttpError: (error: unknown) => isHttpErrorMock(error),
	isStudentOrgMismatchError: (error: unknown) =>
		isStudentOrgMismatchErrorMock(error),
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
	useStudentQuizDetail: () => ({
		data: mockDetail,
		isPending: false,
		isError: mockQuizIsError,
		error: mockQuizError,
	}),
	useStartQuizAttempt: () => ({
		mutate: (...args: unknown[]) => startMutateMock(...args),
		isPending: mockStartIsPending,
	}),
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
		navigateMock.mockClear();
		toastErrorMock.mockClear();
		startMutateMock.mockReset();
		isHttpErrorMock.mockReset().mockReturnValue(false);
		isStudentOrgMismatchErrorMock.mockReset().mockReturnValue(false);
		mockQuizIsError = false;
		mockQuizError = null;
		mockStartIsPending = false;
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

	it("renders inline PracticeIntroScreen without alertdialog for practice attempt=null, blocks audio until start, and exits back to /practice/$skill (#883)", () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			title: "The Falkirk Wheel",
			due: "",
			dueAt: null,
			timeLimitSeconds: 1200,
			partsCount: 1,
			collection: "IELTS Trainer 2",
			testGroup: "TEST 1",
			description: "<p>Đọc kỹ đề.</p>",
			skill: "reading",
			part: "p1",
			hasAudio: true,
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { container } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByTestId("practice-intro-screen")).toBeTruthy();
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(useQuizAudioStreamMock).toHaveBeenCalledWith(
			null,
			expect.any(Object),
		);
		expect(container.querySelector('a[href="/practice/reading"]')).toBeTruthy();

		fireEvent.click(screen.getByTestId("practice-start-btn"));
		expect(startMutateMock).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
		expect(navigateMock).toHaveBeenCalledWith({
			to: "/practice/$skill",
			params: { skill: "reading" },
		});
	});

	it("preserves QuizStartDialog modal and '/' exit link for class assignments with attempt=null (#883)", () => {
		mockDetail = {
			...mockDetail,
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

		expect(screen.queryByTestId("practice-intro-screen")).toBeNull();
		expect(
			screen.getByRole("alertdialog", { name: "Bắt đầu làm bài" }),
		).toBeTruthy();
		expect(container.querySelector('a[href="/"]')).toBeTruthy();
	});

	it("hydrates multi-tab answers into the live autosave store once on attempt null -> in_progress without popping QuizResumeDialog (#883)", async () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "reading",
			part: "p1",
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByTestId("practice-intro-screen")).toBeTruthy();

		// Tab khác đã start và trả lời câu 1 ("B") trước khi tab này bấm Start.
		mockDetail = {
			...mockDetail,
			attempt: {
				id: "att-multitab-1",
				status: "in_progress",
				answers: { "0": "B" },
				essay: "",
				media: null,
			},
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-1" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(screen.getByTestId("navigator-progress").textContent).toBe(
			"Đã trả lời 1/2 câu",
		);
		const q1Radios = screen
			.getByRole("radiogroup", { name: "Câu 1" })
			.querySelectorAll('input[type="radio"]');
		expect((q1Radios[1] as HTMLInputElement).checked).toBe(true);

		// Chọn đáp án câu 2 phải đi qua live store và gửi PATCH (chứng minh storeActive=true).
		const q2Radios = screen
			.getByRole("radiogroup", { name: "Câu 2" })
			.querySelectorAll('input[type="radio"]');
		fireEvent.click(q2Radios[0] as HTMLElement);
		expect(screen.getByTestId("navigator-progress").textContent).toBe(
			"Đã trả lời 2/2 câu",
		);

		await waitFor(
			() => {
				expect(patchAnswerMock).toHaveBeenCalledWith(
					"att-multitab-1",
					1,
					"A",
					expect.anything(),
				);
			},
			{ timeout: 1500 },
		);
	});

	it("does not dispose live store or open QuizResumeDialog when GET /quiz refetches mid-session after starting from intro (#883)", async () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "reading",
			part: "p1",
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-2" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		// Bắt đầu bài mới với answers rỗng.
		mockDetail = {
			...mockDetail,
			attempt: {
				id: "att-refetch-1",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
			},
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-2" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		// Học viên chọn đáp án câu 1.
		const q1Radios = screen
			.getByRole("radiogroup", { name: "Câu 1" })
			.querySelectorAll('input[type="radio"]');
		fireEvent.click(q1Radios[0] as HTMLElement);
		expect(screen.getByTestId("navigator-progress").textContent).toBe(
			"Đã trả lời 1/2 câu",
		);

		// Mô phỏng refetch nền trả về attempt.answers đã có câu 1.
		mockDetail = {
			...mockDetail,
			attempt: {
				id: "att-refetch-1",
				status: "in_progress",
				answers: { "0": "A" },
				essay: "",
				media: null,
			},
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-2" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		// Không bật QuizResumeDialog, không hủy store, chọn tiếp câu 2 vẫn hoạt động.
		expect(screen.queryByRole("alertdialog")).toBeNull();
		const q2Radios = screen
			.getByRole("radiogroup", { name: "Câu 2" })
			.querySelectorAll('input[type="radio"]');
		fireEvent.click(q2Radios[1] as HTMLElement);
		expect(screen.getByTestId("navigator-progress").textContent).toBe(
			"Đã trả lời 2/2 câu",
		);
		await waitFor(
			() => {
				expect(patchAnswerMock).toHaveBeenCalledWith(
					"att-refetch-1",
					1,
					"B",
					expect.anything(),
				);
			},
			{ timeout: 1500 },
		);
	});

	it("renders QuizTakeError instead of stale PracticeIntroScreen when attempt=null and quizQuery.isError, and handles 403 org-mismatch / 404 on Start (#883)", () => {
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "reading",
			part: "p1",
			writing: undefined,
			attempt: null,
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

		// 1) Start trả 403 STUDENT_ORG_MISMATCH → hiện toast đổi tổ chức thay vì lỗi mạng.
		startMutateMock.mockImplementationOnce(
			(_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
				isStudentOrgMismatchErrorMock.mockReturnValueOnce(true);
				opts?.onError?.({ status: 403, code: "STUDENT_ORG_MISMATCH" });
			},
		);
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-err" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		fireEvent.click(screen.getByTestId("practice-start-btn"));
		expect(toastErrorMock).toHaveBeenCalledWith(
			expect.stringContaining("Tổ chức học tập vừa thay đổi"),
		);

		// 2) Start trả 404 → báo đề không còn khả dụng + invalidate query.
		toastErrorMock.mockClear();
		startMutateMock.mockImplementationOnce(
			(_vars: unknown, opts?: { onError?: (err: unknown) => void }) => {
				isHttpErrorMock.mockReturnValue(true);
				opts?.onError?.({ status: 404 });
			},
		);
		fireEvent.click(screen.getByTestId("practice-start-btn"));
		expect(toastErrorMock).toHaveBeenCalledWith(
			"Đề luyện tập này hiện không còn khả dụng.",
		);
		expect(invalidateSpy).toHaveBeenCalled();

		// 3) Refetch sau lỗi rơi vào isError với cache detail cũ (attempt=null) → hiện QuizTakeError.
		mockQuizIsError = true;
		mockQuizError = { status: 404 };
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-err" }}
					serverAnswers={{}}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.queryByTestId("practice-intro-screen")).toBeNull();
		expect(screen.getByText("Không tìm thấy bài tập")).toBeTruthy();
	});

	it("resets gateLifecycleRef on in_progress -> null -> retake so old serverAnswers do not leak into a new practice attempt (#883)", async () => {
		// Bắt đầu từ attempt cũ att-1 đã có đáp án {"0": "A"} trong route loader.
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			skill: "reading",
			part: "p1",
			writing: undefined,
			attempt: {
				id: "att-old-1",
				status: "in_progress",
				answers: { "0": "A" },
				essay: "",
				media: null,
			},
		};
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-retake" }}
					serverAnswers={{ "0": "A" }}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(
			screen.getByRole("alertdialog", { name: "Tiếp tục bài làm" }),
		).toBeTruthy();

		// Tab khác nộp att-old-1 -> GET /quiz trả attempt: null -> hiện màn giới thiệu.
		mockDetail = {
			...mockDetail,
			attempt: null,
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-retake" }}
					serverAnswers={{ "0": "A" }}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);
		expect(screen.getByTestId("practice-intro-screen")).toBeTruthy();

		// Học viên bấm Bắt đầu lượt mới att-new-2 với answers rỗng {}.
		mockDetail = {
			...mockDetail,
			attempt: {
				id: "att-new-2",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
			},
		};
		rerender(
			<QueryClientProvider client={qc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-read-retake" }}
					serverAnswers={{ "0": "A" }}
					serverEssay=""
				/>
			</QueryClientProvider>,
		);

		// Lượt mới phải trống 0/2 (KHÔNG rò đáp án "A" của att-old-1 và KHÔNG bật QuizResumeDialog).
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(screen.getByTestId("navigator-progress").textContent).toBe(
			"Đã trả lời 0/2 câu",
		);
		const q1Radios = screen
			.getByRole("radiogroup", { name: "Câu 1" })
			.querySelectorAll('input[type="radio"]');
		expect((q1Radios[0] as HTMLInputElement).checked).toBe(false);

		// Chọn lại "A" trên att-new-2 phải gửi PATCH thật tới att-new-2 (không bị coi là trùng baseline cũ).
		fireEvent.click(q1Radios[0] as HTMLElement);
		await waitFor(
			() => {
				expect(patchAnswerMock).toHaveBeenCalledWith(
					"att-new-2",
					0,
					"A",
					expect.anything(),
				);
			},
			{ timeout: 1500 },
		);
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
		navigateMock.mockClear();
		toastErrorMock.mockClear();
		startMutateMock.mockClear();
		isHttpErrorMock.mockReset().mockReturnValue(false);
		isStudentOrgMismatchErrorMock.mockReset().mockReturnValue(false);
		useQuizAudioStreamMock.mockClear();
		mockQuizIsError = false;
		mockQuizError = null;
		mockStartIsPending = false;
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
		const assignmentQc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={assignmentQc}>
				<QuizTakeView
					source={{ kind: "assignment", id: "ca-1" }}
					serverAnswers={{}}
				/>
			</QueryClientProvider>,
		);
		expect(screen.queryByTestId("quiz-timer-badge")).toBeNull();
		cleanup();

		// Timed practice intro screen (attempt === null) → transition to in_progress mounts countdown timer
		mockDetail = {
			...mockDetail,
			assignmentId: "",
			timeLimitSeconds: 1200,
			attempt: null,
		};
		const transitionQc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={transitionQc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-timed-1" }}
					serverAnswers={{}}
				/>
			</QueryClientProvider>,
		);
		expect(screen.queryByTestId("quiz-timer-badge")).toBeNull();
		expect(screen.getByTestId("practice-intro-screen")).toBeTruthy();
		expect(screen.getByText("1 câu hỏi", { exact: true })).toBeTruthy();
		expect(screen.getByText("20 phút", { exact: true })).toBeTruthy();

		// Start resolves with server startedAt = BASE_NOW → timer mounts at 20:00 and ticks to 19:59
		mockDetail = {
			...mockDetail,
			attempt: {
				id: "att-started-from-intro",
				status: "in_progress",
				answers: {},
				essay: "",
				media: null,
				startedAt: new Date(BASE_NOW).toISOString(),
			},
		};
		rerender(
			<QueryClientProvider client={transitionQc}>
				<QuizTakeView
					source={{ kind: "practice", testId: "test-timed-1" }}
					serverAnswers={{}}
				/>
			</QueryClientProvider>,
		);
		expect(screen.queryByTestId("practice-intro-screen")).toBeNull();
		const startedBadge = screen.getByTestId("quiz-timer-badge");
		expect(startedBadge.textContent).toBe("20:00");
		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(startedBadge.textContent).toBe("19:59");
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
