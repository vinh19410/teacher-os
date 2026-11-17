// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	PlacementSnapshot,
	StudentPlacementStatusResponse,
	StudentPlacementSubmissionView,
	StudentPlacementViewResponse,
} from "@teacher-os/api/placement-test-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(),
	},
}));

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => mockNavigate,
	useRouterState: ({
		select,
	}: {
		select: (state: { location: { pathname: string } }) => string;
	}) => select({ location: { pathname: "/" } }),
	Link: ({
		to,
		activeOptions: _activeOptions,
		children,
		...rest
	}: {
		to: string;
		activeOptions?: unknown;
		children?: ReactNode;
	} & Record<string, unknown>) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
	Navigate: ({ to }: { to: string }) => (
		<div data-testid="mock-navigate" data-to={to} />
	),
	createFileRoute: () => () => ({
		useRouteContext: () => ({
			session: {
				data: {
					user: { email: "minh@student.vn" },
				},
			},
		}),
	}),
}));

vi.mock("@/lib/repos/student", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/repos/student")>();
	return {
		...actual,
		useStudentMe: () => ({
			isLoading: false,
			error: null,
			data: {
				user: {
					id: "user-1",
					name: "Nguyễn Minh",
					email: "minh@student.vn",
					role: "student",
				},
				student: {
					id: "stu-1",
					orgId: "org-1",
					name: "Nguyễn Minh",
					email: "minh@student.vn",
					onboardingCompletedAt: "2026-10-01T00:00:00Z",
					examInterest: "ielts",
					currentLevel: "intermediate",
					targetScore: "6.5",
					entryScore: null,
				},
			},
		}),
		useStudentOverview: () => ({
			isLoading: false,
			error: null,
			data: {
				student: { id: "stu-1", name: "Nguyễn Minh" },
				classes: [],
				assignments: [],
			},
		}),
		useStudentInvoices: () => ({ isError: false, data: [] }),
		useStudentOrgs: () => ({
			data: [{ id: "org-1", name: "IELTS Cô Mỹ", isCurrent: true }],
			isLoading: false,
		}),
		useStudentNotifications: () => ({ data: [], isLoading: false }),
		useStudentInbox: () => ({
			data: { items: [], unreadCount: 0, unread: 0 },
			isLoading: false,
		}),
		useAcceptInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
		useRejectInvitation: () => ({ mutateAsync: vi.fn(), isPending: false }),
		useMarkInboxRead: () => ({ mutateAsync: vi.fn(), isPending: false }),
		useAcceptClassEnrollment: () => ({ mutate: vi.fn(), isPending: false }),
		getActiveStudentOrgId: () => "org-1",
	};
});

vi.mock("@/lib/repos/vocab", () => ({
	useVocabOverview: () => ({ data: { dueCount: 0, decks: [] } }),
	useVocabLibraryCourses: () => ({ isSuccess: false, data: undefined }),
}));

import { getPlacementDraftStorageKey } from "@/lib/placement-test-helpers";
import { StudentOverviewPage } from "@/routes/_auth/index";
import { StudentPlacementTestContent } from "@/routes/_auth/placement-test";

const SAMPLE_SNAPSHOT: PlacementSnapshot = {
	version: 3,
	bands: [
		{
			min: 0,
			max: 100,
			cefr: "B1",
			course: "ielts-foundation",
			courseLabel: "IELTS Foundation",
			displayCourse: "IELTS Foundation",
			advice: "Củng cố nền tảng ngữ pháp và từ vựng học thuật.",
		},
	],
	parts: [
		{
			id: "listening",
			title: "Listening Comprehension (A2–B1)",
			clips: [
				{
					id: "clip-1",
					partLabel: "Part 1 (A2)",
					instruction: "Listen carefully.",
					title: "Campus Library (Level A2)",
					notesTitle: "Notes (A2)",
					src: "/public/placement-test/audio/11111111-1111-1111-1111-111111111111",
					maxPlays: 2,
					level: "A2",
					questions: [
						{
							id: "l-q1",
							type: "mcq",
							level: "A2",
							prompt: "When does the library close?",
							options: ["5 p.m.", "6 p.m.", "7 p.m."],
							answer: 1,
						},
						{
							id: "l-q2",
							type: "gap",
							level: "A2",
							prompt: "Write the room number:",
							accept: ["204"],
						},
					],
				},
			],
		},
		{
			id: "vocab-grammar",
			title: "Grammar & Vocabulary",
			questions: [
				{
					id: "vg-q1",
					kind: "grammar",
					level: "B1",
					prompt: "She ____ to London last year. (B1)",
					options: ["go", "went", "gone"],
					answer: 1,
				},
			],
		},
		{
			id: "reading",
			title: "Reading Comprehension",
			passages: [
				{
					id: "p-1",
					partLabel: "Part 1 (A2)",
					kind: "sign",
					instruction: "Read the notice.",
					title: "Museum Notice (A2)",
					body: "No flash photography inside.",
					questions: [
						{
							id: "r-q1",
							level: "A2",
							prompt: "What is forbidden?",
							options: ["Flash photos", "Walking", "Speaking quietly"],
							answer: 0,
						},
					],
				},
				{
					id: "p-2",
					partLabel: "Part 2",
					kind: "cloze",
					instruction: "Choose the best word.",
					title: "Daily Routine",
					body: "Every morning I [1] coffee before work.",
					questions: [
						{
							id: "r-q2",
							level: "A2",
							prompt: "Blank [1]:",
							options: ["drink", "sleep", "run"],
							answer: 0,
						},
					],
				},
			],
		},
		{
			id: "writing",
			title: "Writing",
			promptTitle: "Write an email to your friend",
			promptBody: "Tell your friend about your weekend.",
			minWords: 10,
			maxWords: 50,
		},
		{
			id: "speaking",
			title: "Speaking",
			tasks: [
				{
					id: "s-1",
					partLabel: "Part 1",
					level: "A2",
					prompt: "Introduce yourself briefly.",
					prepSeconds: 5,
					answerSeconds: 15,
				},
			],
		},
	],
};

function createTestQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
}

function makeJsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("Student Portal Placement Test (#748)", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		mockNavigate.mockReset();
		window.localStorage.clear();
		window.scrollTo = vi.fn();
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
	});

	it("shows first-time modal when status=not_started and promptDismissedAt=null; 'Để sau' calls /dismiss while banner and sidebar badge stay visible", async () => {
		let dismissedAt: string | null = null;
		const dismissCalls: string[] = [];

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test/status")) {
				const body: StudentPlacementStatusResponse = {
					status: "not_started",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: dismissedAt,
					submissionId: null,
					testAvailable: true,
					testVersion: 3,
				};
				return makeJsonResponse(body);
			}
			if (
				url.endsWith("/api/student/placement-test/dismiss") &&
				init?.method === "POST"
			) {
				dismissCalls.push(url);
				dismissedAt = "2026-11-17T05:00:00Z";
				return makeJsonResponse({ ok: true, promptDismissedAt: dismissedAt });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentOverviewPage />
			</QueryClientProvider>,
		);

		const modal = await screen.findByTestId("placement-prompt-modal");
		expect(modal.textContent).toContain(
			"Kiểm tra đầu vào miễn phí (5 kỹ năng)",
		);
		expect(screen.getByTestId("placement-highlight-banner")).toBeTruthy();
		expect(screen.getByTestId("nav-placement-badge").textContent).toBe(
			"Chưa làm",
		);

		fireEvent.click(screen.getByRole("button", { name: "Để sau" }));

		await waitFor(() => {
			expect(dismissCalls).toHaveLength(1);
			expect(screen.queryByTestId("placement-prompt-modal")).toBeNull();
		});

		// Highlight banner and sidebar "Chưa làm" badge remain visible after dismissing modal
		expect(screen.getByTestId("placement-highlight-banner")).toBeTruthy();
		expect(screen.getByTestId("nav-placement-badge").textContent).toBe(
			"Chưa làm",
		);
	});

	it.each<{
		name: string;
		status: StudentPlacementStatusResponse;
	}>([
		{
			name: "exempt",
			status: {
				status: "exempt",
				hasEntryScore: true,
				entryScore: "6.5 IELTS",
				promptDismissedAt: null,
				submissionId: null,
				testAvailable: true,
				testVersion: 3,
			},
		},
		{
			name: "graded",
			status: {
				status: "graded",
				hasEntryScore: true,
				entryScore: "B1",
				promptDismissedAt: null,
				submissionId: "sub-1",
				testAvailable: true,
				testVersion: 3,
			},
		},
		{
			name: "not_started with promptDismissedAt set",
			status: {
				status: "not_started",
				hasEntryScore: false,
				entryScore: null,
				promptDismissedAt: "2026-11-16T00:00:00Z",
				submissionId: null,
				testAvailable: true,
				testVersion: 3,
			},
		},
	])(
		"does NOT show first-time modal when status is $name",
		async ({ status }) => {
			globalThis.fetch = vi.fn(async (input) => {
				const url = typeof input === "string" ? input : input.toString();
				if (url.endsWith("/api/student/placement-test/status")) {
					return makeJsonResponse(status);
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			const queryClient = createTestQueryClient();
			render(
				<QueryClientProvider client={queryClient}>
					<StudentOverviewPage />
				</QueryClientProvider>,
			);

			await waitFor(() => {
				expect(globalThis.fetch).toHaveBeenCalled();
			});

			if (status.status === "not_started") {
				expect(
					await screen.findByTestId("placement-highlight-banner"),
				).toBeTruthy();
			} else {
				await waitFor(() => {
					expect(screen.queryByTestId("placement-highlight-banner")).toBeNull();
				});
			}
			expect(screen.queryByTestId("placement-prompt-modal")).toBeNull();
		},
	);

	it("/placement-test renders without lead-gate, strips CEFR labels, counts words, persists/clears draft, submits and shows pending view", async () => {
		let submittedBody: Record<string, unknown> | null = null;
		let currentStatus: StudentPlacementViewResponse["status"] = "not_started";
		let currentSubmission: StudentPlacementSubmissionView | null = null;

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: currentStatus,
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: currentSubmission?.id ?? null,
					testAvailable: true,
					testVersion: 3,
					snapshot: SAMPLE_SNAPSHOT,
					submission: currentSubmission,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith("/api/student/placement-test/submissions") &&
				init?.method === "POST"
			) {
				submittedBody = JSON.parse(String(init.body)) as Record<
					string,
					unknown
				>;
				currentStatus = "pending_grading";
				currentSubmission = {
					id: "sub-new",
					testVersion: 3,
					status: "pending_grading",
					submittedAt: "2026-11-17T05:10:00Z",
					gradedAt: null,
					objective: {
						listening: { correct: 2, total: 2, pct: 100 },
						vocabGrammar: { correct: 1, total: 1, pct: 100 },
						reading: { correct: 2, total: 2, pct: 100 },
					},
					writingText: String(submittedBody.writingText ?? ""),
					writingWordCount: 11,
					writingRubric: null,
					writingScore: null,
					writingErrors: [],
					speakingStatus: "skipped",
					speakingTranscript: "",
					speakingRubric: null,
					speakingScore: null,
					speakingErrors: [],
					finalBandLevel: null,
					finalDisplayCourse: null,
					finalScorePct: null,
					finalNote: "",
					bandAdvice: "",
					teacherFeedback: "",
				};
				return makeJsonResponse({
					submissionId: "sub-new",
					uploadToken: null,
					uploadTokenExpiresAt: null,
					objective: currentSubmission.objective,
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const queryClient = createTestQueryClient();
		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		// Intro renders without lead-gate form and displays 5-part summary table
		const introCard = await screen.findByTestId("placement-intro-card");
		expect(introCard).toBeTruthy();
		expect(introCard.textContent).toContain("5 câu");
		expect(introCard.textContent).not.toContain("khách quan");
		expect(container.querySelector('input[name="phone"]')).toBeNull();
		expect(container.textContent).not.toContain("Nhập thông tin trước khi vào");
		expect(introCard.textContent).toContain("1. Listening");
		expect(introCard.textContent).toContain(
			"1 parts · 2 câu · mỗi đoạn nghe 2 lần",
		);
		expect(introCard.textContent).toContain("2. Grammar & Vocabulary");
		expect(introCard.textContent).toContain("1 câu trắc nghiệm");
		expect(introCard.textContent).toContain("3. Reading");
		expect(introCard.textContent).toContain("2 parts · 2 câu");
		expect(introCard.textContent).toContain("4. Writing");
		expect(introCard.textContent).toContain("1 email 10–50 từ");
		expect(introCard.textContent).toContain("5. Speaking");
		expect(introCard.textContent).toContain("1 câu hỏi ghi âm");
		expect(introCard.textContent).toContain(
			"Không dùng từ điển hay công cụ dịch",
		);

		// Start test -> Listening
		fireEvent.click(screen.getByTestId("start-placement-test-btn"));
		expect(screen.getByTestId("placement-step-listening")).toBeTruthy();
		expect(screen.getByTestId("placement-progress-counter").textContent).toBe(
			"Đã trả lời 0/5 câu",
		);

		// CEFR label stripped on part label, clip title hidden (uses neutral label), notes box shown
		expect(container.textContent).not.toContain("Campus Library");
		expect(container.textContent).toContain("Đoạn nghe 1");
		expect(container.textContent).toContain("Part 1");
		expect(container.textContent).not.toContain("(Level A2)");
		expect(container.textContent).not.toContain("Part 1 (A2)");
		expect(screen.getByTestId("listening-notes-clip-1").textContent).toContain(
			"Notes",
		);
		expect(
			screen.getByTestId("listening-notes-clip-1").textContent,
		).not.toContain("(A2)");

		// Audio tag uses crossOrigin="use-credentials" and rewritten student audio URL
		const audioEl = container.querySelector("audio");
		expect(audioEl).not.toBeNull();
		expect(audioEl?.getAttribute("crossOrigin")).toBe("use-credentials");
		expect(audioEl?.getAttribute("src")).toContain(
			"/api/student/placement-test/audio/11111111-1111-1111-1111-111111111111",
		);
		expect(screen.getByTestId("clip-plays-clip-1").textContent).toContain(
			"Còn 2/2 lượt nghe",
		);

		// Answer Listening MCQ & gap-fill
		fireEvent.click(screen.getByLabelText(/6 p\.m\./));
		fireEvent.change(screen.getByPlaceholderText(/Nhập từ hoặc số/), {
			target: { value: "204" },
		});

		// Draft persisted in localStorage under expected key
		const draftKey = getPlacementDraftStorageKey("stu-1", 3);
		expect(window.localStorage.getItem(draftKey)).toContain("204");

		// Step 2: Grammar & Vocab
		fireEvent.click(screen.getByTestId("placement-tab-vocab-grammar"));
		expect(screen.getByTestId("placement-step-vg")).toBeTruthy();
		expect(container.textContent).toContain("She ____ to London last year.");
		expect(container.textContent).not.toContain("(B1)");
		fireEvent.click(screen.getByLabelText(/went/));

		// Step 3: Reading
		fireEvent.click(screen.getByTestId("placement-tab-reading"));
		expect(screen.getByTestId("placement-step-reading")).toBeTruthy();
		expect(container.textContent).toContain("Biển báo / Thông báo");
		expect(container.textContent).toContain("Đoạn văn điền từ");
		expect(container.textContent).not.toContain("Museum Notice");
		expect(container.textContent).toContain("Daily Routine");
		expect(
			container.querySelector('[data-passage-kind="sign"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-passage-kind="cloze"]'),
		).not.toBeNull();
		fireEvent.click(screen.getByLabelText(/Flash photos/));
		fireEvent.click(screen.getByLabelText(/drink/));
		expect(screen.getByTestId("placement-progress-counter").textContent).toBe(
			"Đã trả lời 5/5 câu",
		);

		// Step 4: Writing
		fireEvent.click(screen.getByTestId("placement-tab-writing"));
		const textarea = screen.getByTestId("placement-writing-textarea");
		fireEvent.change(textarea, {
			target: {
				value:
					"Last weekend I visited my grandparents and cooked dinner with my family.",
			},
		});
		expect(
			screen.getByTestId("placement-writing-word-count").textContent,
		).toContain("12 / 10–50 từ");

		// Step 5: Speaking -> skip & submit
		fireEvent.click(screen.getByTestId("placement-tab-speaking"));
		fireEvent.click(
			screen.getByRole("button", { name: /Bỏ qua phần Speaking/i }),
		);
		expect(screen.getByTestId("speaking-skipped-notice")).toBeTruthy();

		fireEvent.click(screen.getByTestId("submit-placement-test-btn"));

		// Pending result view renders immediately with 2 CEFR cards and draft is cleared
		const pendingView = await screen.findByTestId("placement-pending-view");
		expect(pendingView.textContent).toContain(
			"Đang chờ giáo viên chấm Writing & Speaking",
		);
		expect(screen.getByTestId("pending-cefr-listening").textContent).toBe("B1");
		expect(screen.getByTestId("pending-score-listening").textContent).toBe(
			"2/2 câu đúng · 100%",
		);
		expect(screen.queryByTestId("pending-score-vg")).toBeNull();
		expect(screen.getByTestId("pending-cefr-reading").textContent).toBe("B1");
		expect(screen.getByTestId("pending-score-reading").textContent).toBe(
			"2/2 câu đúng · 100%",
		);
		expect(pendingView.textContent).toContain(
			"Đây là kết quả tự động của hai phần nghe và đọc. Cấp độ cuối cùng và lớp phù hợp sẽ được giáo viên báo sau khi chấm Writing và Speaking.",
		);
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Đã bỏ qua",
		);
		expect(submittedBody).not.toBeNull();
		expect(window.localStorage.getItem(draftKey)).toBeNull();
	});

	it("renders graded result view with CEFR badge, rubrics, highlighted errors, bandAdvice and teacherFeedback", async () => {
		const gradedView: StudentPlacementViewResponse = {
			status: "graded",
			hasEntryScore: true,
			entryScore: "B1",
			promptDismissedAt: "2026-11-10T00:00:00Z",
			submissionId: "sub-graded",
			testAvailable: true,
			testVersion: 3,
			snapshot: null,
			submission: {
				id: "sub-graded",
				testVersion: 3,
				status: "graded",
				submittedAt: "2026-11-15T00:00:00Z",
				gradedAt: "2026-11-16T00:00:00Z",
				objective: {
					listening: { correct: 8, total: 10, pct: 80 },
					vocabGrammar: { correct: 15, total: 20, pct: 75 },
					reading: { correct: 7, total: 10, pct: 70 },
				},
				writingText: "I go to school yesterday.",
				writingWordCount: 5,
				writingRubric: { ct: 4, or: 4, lg: 3 },
				writingScore: 11,
				writingErrors: [
					{
						id: "w-err-1",
						category: "grammar",
						quote: "go",
						start: 2,
						end: 4,
						correction: "went",
						explanation: "Dùng thì quá khứ đơn với yesterday.",
					},
				],
				speakingStatus: "uploaded",
				speakingTranscript: "I am liking English very much.",
				speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 5 },
				speakingScore: 17,
				speakingErrors: [
					{
						id: "s-err-1",
						category: "grammar",
						quote: "am liking",
						start: 2,
						end: 11,
						correction: "like",
						explanation: "Stative verb 'like' không chia tiếp diễn.",
					},
				],
				finalBandLevel: "B1+",
				finalDisplayCourse: "IELTS Pre-Intermediate (4.5–5.5)",
				finalScorePct: 77,
				finalNote: "",
				bandAdvice: "Tập trung luyện thì quá khứ và cấu trúc câu phức.",
				teacherFeedback:
					"Em phát âm rõ ràng, cần chú ý chia thì chính xác hơn.",
			},
		};

		globalThis.fetch = vi.fn(async () => makeJsonResponse(gradedView));

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		const view = await screen.findByTestId("placement-graded-view");
		expect(view).toBeTruthy();
		expect(view.textContent).toContain("Điểm các kỹ năng");
		expect(view.textContent).not.toContain("khách quan");
		expect(screen.getByTestId("graded-cefr-badge").textContent).toBe("B1+");
		expect(screen.getByTestId("graded-display-course").textContent).toBe(
			"IELTS Pre-Intermediate (4.5–5.5)",
		);
		expect(screen.getByTestId("graded-score-pct").textContent).toBe("77%");
		expect(screen.getByTestId("writing-annotated-text").textContent).toContain(
			"I go",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"went",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"Dùng thì quá khứ đơn với yesterday.",
		);
		expect(screen.getByTestId("speaking-error-cards").textContent).toContain(
			"Stative verb 'like' không chia tiếp diễn.",
		);
		expect(screen.getByTestId("graded-band-advice").textContent).toContain(
			"Tập trung luyện thì quá khứ",
		);
		expect(screen.getByTestId("graded-teacher-feedback").textContent).toContain(
			"Em phát âm rõ ràng",
		);
	});

	it("renders exempt card with entryScore and optional start button, and unavailable card cleanly", async () => {
		const exemptView: StudentPlacementViewResponse = {
			status: "exempt",
			hasEntryScore: true,
			entryScore: "6.5 IELTS",
			promptDismissedAt: null,
			submissionId: null,
			testAvailable: true,
			testVersion: 3,
			snapshot: SAMPLE_SNAPSHOT,
			submission: null,
		};

		globalThis.fetch = vi.fn(async () => makeJsonResponse(exemptView));

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		const exemptCard = await screen.findByTestId("placement-exempt-card");
		expect(exemptCard).toBeTruthy();
		expect(screen.getByTestId("placement-entry-score").textContent).toBe(
			"6.5 IELTS",
		);

		fireEvent.click(
			screen.getByRole("button", { name: "Làm bài kiểm tra đầu vào" }),
		);
		expect(screen.getByTestId("placement-intro-card")).toBeTruthy();

		cleanup();
		const unavailableView: StudentPlacementViewResponse = {
			status: "unavailable",
			hasEntryScore: false,
			entryScore: null,
			promptDismissedAt: null,
			submissionId: null,
			testAvailable: false,
			testVersion: null,
			snapshot: null,
			submission: null,
		};
		globalThis.fetch = vi.fn(async () => makeJsonResponse(unavailableView));
		render(
			<QueryClientProvider client={createTestQueryClient()}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);
		expect(
			await screen.findByTestId("placement-unavailable-card"),
		).toBeTruthy();
	});

	it("attaches active org query param on placement audio URLs for multi-org media playback", async () => {
		const { resolveStudentPlacementMediaSrc } = await import(
			"@/lib/repos/placement-test"
		);
		const { setActiveStudentOrgId, clearActiveStudentOrgId } = await import(
			"@/lib/student-org-storage"
		);

		setActiveStudentOrgId("org-secondary");
		try {
			expect(
				resolveStudentPlacementMediaSrc(
					"/api/student/placement-test/audio/clip-1",
				),
			).toContain("/api/student/placement-test/audio/clip-1?org=org-secondary");
			expect(
				resolveStudentPlacementMediaSrc("/public/placement-test/audio/clip-2"),
			).toContain("/api/student/placement-test/audio/clip-2?org=org-secondary");
		} finally {
			clearActiveStudentOrgId();
		}
	});

	it("groups Listening by partLabel without leaking clip titles and wraps gap questions in Phiếu ghi chú with inline [?]", async () => {
		const { PlacementListeningStep } = await import(
			"@/components/placement/placement-listening-step"
		);

		const clips = [
			{
				id: "la",
				partLabel: "Part 1",
				instruction:
					"For each question, choose the correct answer. You will hear each conversation twice.",
				title: "Conversation 1 · Cinema time",
				notesTitle: "",
				src: "/public/placement-test/audio/11111111-1111-1111-1111-111111111111",
				maxPlays: 2,
				level: "A1",
				questions: [
					{
						id: "lq-1",
						type: "mcq" as const,
						level: "A1",
						prompt: "What time does the film start?",
						options: ["7:00", "7:15", "7:45"],
						answer: 1,
					},
				],
			},
			{
				id: "lb",
				partLabel: "Part 1",
				instruction:
					"For each question, choose the correct answer. You will hear each conversation twice.",
				title: "Conversation 2 · Going to work",
				notesTitle: "",
				src: "/public/placement-test/audio/22222222-2222-2222-2222-222222222222",
				maxPlays: 2,
				level: "A1",
				questions: [
					{
						id: "lq-2",
						type: "mcq" as const,
						level: "A1",
						prompt: "How will the woman get to work today?",
						options: ["by bike", "by bus", "by car"],
						answer: 0,
					},
				],
			},
			{
				id: "le",
				partLabel: "Part 2",
				instruction: "Write ONE word or a number.",
				title: "Evening English Course",
				notesTitle: "Evening English Course",
				src: "/public/placement-test/audio/33333333-3333-3333-3333-333333333333",
				maxPlays: 2,
				level: "A2",
				questions: [
					{
						id: "lq-3",
						type: "gap" as const,
						level: "A2",
						prompt: "Start date: Monday ____ March",
						accept: ["15"],
					},
					{
						id: "lq-4",
						type: "gap" as const,
						level: "A2",
						prompt: "Price: $ ____",
						accept: ["240"],
					},
				],
			},
		];

		const qMap = new Map([
			["lq-1", 1],
			["lq-2", 2],
			["lq-3", 3],
			["lq-4", 4],
		]);

		const { container } = render(
			<PlacementListeningStep
				title="Listening"
				clips={clips}
				plays={{}}
				onRecordPlay={vi.fn()}
				onRefundPlay={vi.fn()}
				questionNumbers={qMap}
				answers={{}}
				onAnswerChange={vi.fn()}
			/>,
		);

		// Part 1 header & instruction rendered exactly once across two clips
		expect(screen.getAllByText("Part 1")).toHaveLength(1);
		expect(
			screen.getAllByText(
				"For each question, choose the correct answer. You will hear each conversation twice.",
			),
		).toHaveLength(1);

		// Neutral labels instead of context-leaking titles
		expect(container.textContent).not.toContain("Cinema time");
		expect(container.textContent).not.toContain("Going to work");
		expect(container.textContent).toContain("Đoạn nghe 1");
		expect(container.textContent).toContain("Đoạn nghe 2");
		expect(container.textContent).toContain("Đoạn nghe 3");

		// Test IDs & attributes preserved
		expect(container.querySelector('[data-clip-id="la"]')).not.toBeNull();
		expect(screen.getByTestId("play-clip-la")).toBeTruthy();
		expect(screen.getByTestId("clip-plays-la").textContent).toContain(
			"Còn 2/2 lượt nghe",
		);

		// Part 2 Phiếu ghi chú wraps gap questions and converts ____ to [?]
		const notesBox = screen.getByTestId("listening-notes-le");
		expect(notesBox.textContent).toContain("Phiếu ghi chú");
		expect(notesBox.textContent).toContain("Evening English Course");
		expect(notesBox.textContent).toContain("Start date: Monday");
		expect(notesBox.textContent).toContain("[?]");
		expect(notesBox.textContent).not.toContain("____");
	});

	it("groups Reading by partLabel once and hides title heading on sign/message passages", async () => {
		const { PlacementReadingStep } = await import(
			"@/components/placement/placement-reading-step"
		);

		const passages = [
			{
				id: "ra",
				partLabel: "Part 1",
				kind: "sign" as const,
				instruction: "For each question, choose the correct answer.",
				title: "Pool Notice Secret Heading",
				body: "CITY SWIMMING POOL\nClosed every Monday.",
				questions: [
					{
						id: "rq-1",
						level: "A1",
						prompt: "",
						options: ["Option A", "Option B", "Option C"],
						answer: 0,
					},
				],
			},
			{
				id: "rb",
				partLabel: "Part 1",
				kind: "message" as const,
				instruction: "For each question, choose the correct answer.",
				title: "Message from Mum",
				body: "Tuan,\nThe dentist phoned.",
				questions: [
					{
						id: "rq-2",
						level: "A2",
						prompt: "",
						options: ["Option A", "Option B", "Option C"],
						answer: 0,
					},
				],
			},
			{
				id: "re",
				partLabel: "Part 2",
				kind: "passage" as const,
				instruction: "Read the article.",
				title: "A new start in Auckland",
				body: "Thu Ha moved to Auckland.",
				questions: [
					{
						id: "rq-3",
						level: "A2",
						prompt: "Where did Thu Ha move?",
						options: ["Auckland", "Hanoi", "Tokyo"],
						answer: 0,
					},
				],
			},
		];

		const qMap = new Map([
			["rq-1", 1],
			["rq-2", 2],
			["rq-3", 3],
		]);

		const { container } = render(
			<PlacementReadingStep
				title="Reading"
				passages={passages}
				questionNumbers={qMap}
				answers={{}}
				onAnswerChange={vi.fn()}
			/>,
		);

		// Part 1 label & instruction shown once
		expect(screen.getAllByText("Part 1")).toHaveLength(1);
		expect(
			screen.getAllByText("For each question, choose the correct answer."),
		).toHaveLength(1);

		// Sign and message titles are NOT rendered outside body
		expect(container.textContent).not.toContain("Pool Notice Secret Heading");
		expect(container.textContent).not.toContain("Message from Mum");
		// Body & passage title still render
		expect(container.textContent).toContain("CITY SWIMMING POOL");
		expect(container.textContent).toContain("A new start in Auckland");

		expect(container.querySelector('[data-passage-id="ra"]')).not.toBeNull();
		expect(
			container.querySelector('[data-passage-kind="sign"]'),
		).not.toBeNull();
		expect(
			container.querySelector('[data-passage-kind="message"]'),
		).not.toBeNull();
	});

	it("renders PlacementPendingResultView with 2 CEFR cards using fallback HTML bands when bands are omitted", async () => {
		const { PlacementPendingResultView } = await import(
			"@/components/placement/placement-result-views"
		);

		const submission: StudentPlacementSubmissionView = {
			id: "sub-pending",
			testVersion: 3,
			status: "pending_grading",
			submittedAt: "2026-11-17T06:00:00Z",
			gradedAt: null,
			objective: {
				listening: { correct: 7, total: 13, pct: 54 }, // 53.84% -> A1 (min 30)
				vocabGrammar: { correct: 10, total: 12, pct: 83 },
				reading: { correct: 13, total: 15, pct: 87 }, // 86.67% -> B1 trở lên (min 85)
			},
			writingText: "Hello friend",
			writingWordCount: 2,
			writingRubric: null,
			writingScore: null,
			writingErrors: [],
			speakingStatus: "uploaded",
			speakingTranscript: "",
			speakingRubric: null,
			speakingScore: null,
			speakingErrors: [],
			finalBandLevel: null,
			finalDisplayCourse: null,
			finalScorePct: null,
			finalNote: "",
			bandAdvice: "",
			teacherFeedback: "",
		};

		const { container } = render(
			<PlacementPendingResultView submission={submission} />,
		);

		expect(screen.queryByTestId("pending-score-vg")).toBeNull();
		expect(screen.getByTestId("pending-cefr-listening").textContent).toBe("A1");
		expect(screen.getByTestId("pending-score-listening").textContent).toBe(
			"7/13 câu đúng · 54%",
		);
		expect(
			screen
				.getByTestId("pending-progress-listening")
				.getAttribute("aria-valuenow"),
		).toBe("54");

		expect(screen.getByTestId("pending-cefr-reading").textContent).toBe(
			"B1 trở lên",
		);
		expect(screen.getByTestId("pending-score-reading").textContent).toBe(
			"13/15 câu đúng · 87%",
		);
		expect(
			screen
				.getByTestId("pending-progress-reading")
				.getAttribute("aria-valuenow"),
		).toBe("87");

		expect(container.textContent).toContain(
			"Đây là kết quả tự động của hai phần nghe và đọc. Cấp độ cuối cùng và lớp phù hợp sẽ được giáo viên báo sau khi chấm Writing và Speaking.",
		);
	});

	it("shows unanswered confirmation copy without 'khách quan' when submitting incomplete test", async () => {
		const notStartedView: StudentPlacementViewResponse = {
			status: "not_started",
			hasEntryScore: false,
			entryScore: null,
			promptDismissedAt: null,
			submissionId: null,
			testAvailable: true,
			testVersion: 3,
			snapshot: SAMPLE_SNAPSHOT,
			submission: null,
		};
		globalThis.fetch = vi.fn(async () => makeJsonResponse(notStartedView));

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		await screen.findByTestId("placement-intro-card");
		fireEvent.click(screen.getByTestId("start-placement-test-btn"));
		fireEvent.click(screen.getByTestId("placement-tab-speaking"));
		fireEvent.click(
			screen.getByRole("button", { name: /Bỏ qua phần Speaking/i }),
		);
		fireEvent.click(screen.getByTestId("submit-placement-test-btn"));

		const confirmBox = await screen.findByTestId(
			"placement-unanswered-confirm",
		);
		expect(confirmBox.textContent).toContain("còn 5 câu chưa trả lời");
		expect(confirmBox.textContent).not.toContain("khách quan");
	});
});
