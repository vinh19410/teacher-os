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
	within,
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
		useStudentSchedule: () => ({
			isPending: false,
			isSuccess: true,
			isError: false,
			error: null,
			data: { classes: [], lessons: [] },
		}),
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

	it("shows first-time modal when status=not_started and promptDismissedAt=null; 'Để sau' calls /dismiss while banner stays visible and sidebar has no entry", async () => {
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
		expect(screen.queryByTestId("nav-placement-badge")).toBeNull();
		expect(screen.queryByRole("link", { name: "Kiểm tra đầu vào" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Để sau" }));

		await waitFor(() => {
			expect(dismissCalls).toHaveLength(1);
			expect(screen.queryByTestId("placement-prompt-modal")).toBeNull();
		});

		// Highlight banner remains visible after dismissing modal, without sidebar placement entry
		expect(screen.getByTestId("placement-highlight-banner")).toBeTruthy();
		expect(screen.queryByTestId("nav-placement-badge")).toBeNull();
		expect(screen.queryByRole("link", { name: "Kiểm tra đầu vào" })).toBeNull();
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

	it("/placement-test renders without lead-gate, strips CEFR labels, counts words, persists/clears draft, blocks missing speaking, submits with recording and shows pending view", async () => {
		const originalMediaDevices = navigator.mediaDevices;
		const originalMediaRecorder = window.MediaRecorder;
		const originalAudioContext = window.AudioContext;
		const originalCreateObjectURL = URL.createObjectURL;

		const fakeStream = {
			getTracks: () => [{ stop: vi.fn() }],
			getAudioTracks: () => [{ addEventListener: vi.fn(), stop: vi.fn() }],
		} as unknown as MediaStream;
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
		});
		class SimpleMockRecorder {
			static isTypeSupported(mime: string) {
				return mime === "audio/webm";
			}
			state: RecordingState = "inactive";
			mimeType = "audio/webm";
			private listeners = new Map<string, Set<(evt: unknown) => void>>();
			addEventListener(type: string, cb: (evt: unknown) => void) {
				if (!this.listeners.has(type)) this.listeners.set(type, new Set());
				this.listeners.get(type)?.add(cb);
			}
			private emit(type: string, evt: unknown) {
				for (const cb of this.listeners.get(type) ?? []) cb(evt);
			}
			start() {
				this.state = "recording";
			}
			stop() {
				this.state = "inactive";
				this.emit("dataavailable", {
					data: new Blob([new Uint8Array([1, 2, 3, 4])], {
						type: "audio/webm",
					}),
				});
				this.emit("stop", {});
			}
		}
		Object.defineProperty(window, "MediaRecorder", {
			configurable: true,
			writable: true,
			value: SimpleMockRecorder,
		});
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		URL.createObjectURL = vi.fn(() => "blob:mock-full-flow");

		let submittedBody: Record<string, unknown> | null = null;
		let uploadedSpeaking = false;
		let currentStatus: StudentPlacementViewResponse["status"] = "not_started";
		let currentSubmission: StudentPlacementSubmissionView | null = null;

		try {
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
						writingCriterionComments: null,
						writingErrors: [],
						speakingStatus: "pending_upload",
						speakingTranscript: "",
						speakingRubric: null,
						speakingScore: null,
						speakingCriterionComments: null,
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
						uploadToken: "tok-upload-1",
						uploadTokenExpiresAt: "2026-11-18T00:00:00Z",
						objective: currentSubmission.objective,
					});
				}
				if (
					url.endsWith(
						"/api/student/placement-test/submissions/sub-new/speaking",
					) &&
					init?.method === "PUT"
				) {
					uploadedSpeaking = true;
					if (currentSubmission) {
						currentSubmission = {
							...currentSubmission,
							speakingStatus: "uploaded",
						};
					}
					return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});

			const queryClient = createTestQueryClient();
			const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
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
			expect(introCard.textContent).not.toContain("bỏ qua phần Speaking");
			expect(container.querySelector('input[name="phone"]')).toBeNull();
			expect(container.textContent).not.toContain(
				"Nhập thông tin trước khi vào",
			);
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
			expect(
				screen.getByTestId("listening-notes-clip-1").textContent,
			).toContain("Notes");
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
			expect(container.textContent).not.toContain("Biển báo / Thông báo");
			expect(container.textContent).not.toContain("Tin nhắn / Email");
			expect(container.textContent).not.toContain("Bài đọc hiểu");
			expect(container.textContent).not.toContain("Đoạn văn điền từ");
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

			// Step 5: Speaking -> no skip button; submit blocked until recorded; record -> submit
			fireEvent.click(screen.getByTestId("placement-tab-speaking"));
			expect(
				screen.queryByRole("button", { name: /Bỏ qua phần Speaking/i }),
			).toBeNull();

			fireEvent.click(screen.getByTestId("submit-placement-test-btn"));
			expect(
				await screen.findByText(/Phần Speaking là bắt buộc/i),
			).toBeTruthy();
			expect(screen.queryByTestId("placement-unanswered-confirm")).toBeNull();
			expect(submittedBody).toBeNull();

			// Record Speaking task
			fireEvent.click(
				screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
			);
			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
				).toBeTruthy();
			});
			fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
			fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
			fireEvent.click(
				screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
			);
			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
				).toBeTruthy();
			});
			fireEvent.click(
				screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
			);
			await waitFor(() => {
				expect(screen.getByTestId("speaking-review-box")).toBeTruthy();
				expect(
					(screen.getByTestId("submit-placement-test-btn") as HTMLButtonElement)
						.disabled,
				).toBe(false);
			});

			fireEvent.click(screen.getByTestId("submit-placement-test-btn"));

			// Pending result view renders immediately with 2 CEFR cards and draft is cleared
			const pendingView = await screen.findByTestId("placement-pending-view");
			expect(pendingView.textContent).toContain(
				"Đang chờ giáo viên chấm Writing & Speaking",
			);
			expect(screen.getByTestId("pending-cefr-listening").textContent).toBe(
				"B1",
			);
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
				"Đã gửi bài nói",
			);
			expect(submittedBody).toMatchObject({ speakingMode: "upload" });
			expect(uploadedSpeaking).toBe(true);
			expect(window.localStorage.getItem(draftKey)).toBeNull();
			expect(invalidateSpy).toHaveBeenCalledWith({
				queryKey: ["student", "inbox"],
			});
		} finally {
			Object.defineProperty(navigator, "mediaDevices", {
				configurable: true,
				value: originalMediaDevices,
			});
			Object.defineProperty(window, "MediaRecorder", {
				configurable: true,
				writable: true,
				value: originalMediaRecorder,
			});
			Object.defineProperty(window, "AudioContext", {
				configurable: true,
				writable: true,
				value: originalAudioContext,
			});
			URL.createObjectURL = originalCreateObjectURL;
		}
	});

	it("renders graded result view with IELTS bands, rubrics, highlighted errors, bandAdvice and teacherFeedback", async () => {
		const gradedView: StudentPlacementViewResponse = {
			status: "graded",
			hasEntryScore: true,
			entryScore: "B1+",
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
				writingText: "I go to school yesterday and bought a big book.",
				writingWordCount: 9,
				writingRubric: { task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
				writingScore: 6.5,
				writingCriterionComments: {
					task: "Trả lời đủ ý chính nhưng cần mở rộng ví dụ.",
					coherence: "   ",
					lexical: "Từ vựng tự nhiên ở mức cơ bản.",
					grammar: "",
				},
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
					{
						id: "w-err-2",
						category: "lexical",
						quote: "big book",
						start: 38,
						end: 46,
						correction: "thick reference book",
						explanation: "Chọn tính từ cụ thể hơn thay vì 'big'.",
					},
				],
				speakingStatus: "uploaded",
				speakingTranscript: "I am liking English very much and speak clearly.",
				speakingRubric: {
					fluency: 7,
					lexical: 6.5,
					grammar: 6,
					pronunciation: 7,
				},
				speakingScore: 6.5,
				speakingCriterionComments: {
					fluency: "Nói trôi chảy, ít ngập ngừng.",
					lexical: "",
					grammar: "",
					pronunciation: "Phát âm rõ các âm cuối.",
				},
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
					{
						id: "s-err-2",
						category: "pronunciation",
						quote: "clearly",
						start: 40,
						end: 47,
						correction: "/ˈklɪəli/",
						explanation: "Nhấn trọng âm rõ ở âm tiết đầu.",
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

		const writingSection = screen.getByTestId("graded-writing-section");
		expect(writingSection.textContent).toContain("Band 6.5/9");
		expect(writingSection.textContent).toContain("Task Response");
		expect(writingSection.textContent).toContain("6.5/9");
		expect(writingSection.textContent).toContain("6.0/9");

		// Writing criterion colors synced with error legend tokens
		expect(
			screen.getByTestId("student-writing-criterion-task").className,
		).toContain("border-l-class-3");
		expect(
			screen.getByTestId("student-writing-criterion-coherence").className,
		).toContain("border-l-class-4");
		expect(
			screen.getByTestId("student-writing-criterion-lexical").className,
		).toContain("border-l-class-1");
		expect(
			screen.getByTestId("student-writing-criterion-grammar").className,
		).toContain("border-l-class-5");

		// Writing per-criterion comments render when non-empty and hide when empty/whitespace
		expect(screen.getByTestId("student-writing-task-comment").textContent).toBe(
			"Trả lời đủ ý chính nhưng cần mở rộng ví dụ.",
		);
		expect(
			screen.getByTestId("student-writing-lexical-comment").textContent,
		).toBe("Từ vựng tự nhiên ở mức cơ bản.");
		expect(
			screen.queryByTestId("student-writing-coherence-comment"),
		).toBeNull();
		expect(screen.queryByTestId("student-writing-grammar-comment")).toBeNull();

		// Writing error legend displays ONLY 4 Writing English IELTS criteria
		const writingLegend = within(writingSection).getByRole("list", {
			name: "Chú giải loại lỗi",
		});
		const writingLegendItems = within(writingLegend).getAllByRole("listitem");
		expect(writingLegendItems).toHaveLength(4);
		expect(writingLegend.textContent).toContain("Task Response");
		expect(writingLegend.textContent).toContain("Coherence & Cohesion");
		expect(writingLegend.textContent).toContain("Lexical Resource");
		expect(writingLegend.textContent).toContain("Grammatical Range & Accuracy");
		expect(writingLegend.textContent).not.toContain("Pronunciation");
		expect(writingLegend.textContent).not.toContain("Fluency & Coherence");
		expect(writingLegend.textContent).not.toContain("Chính tả");
		expect(writingLegend.textContent).not.toContain("Ngữ pháp");

		const speakingSection = screen.getByTestId("graded-speaking-section");
		expect(speakingSection.textContent).toContain("Band 6.5/9");
		expect(speakingSection.textContent).toContain("Fluency & Coherence");
		expect(speakingSection.textContent).toContain("7.0/9");
		expect(speakingSection.textContent).toContain("6.5/9");

		// Speaking criterion colors synced with error legend tokens
		expect(
			screen.getByTestId("student-speaking-criterion-fluency").className,
		).toContain("border-l-class-4");
		expect(
			screen.getByTestId("student-speaking-criterion-lexical").className,
		).toContain("border-l-class-1");
		expect(
			screen.getByTestId("student-speaking-criterion-grammar").className,
		).toContain("border-l-class-5");
		expect(
			screen.getByTestId("student-speaking-criterion-pronunciation").className,
		).toContain("border-l-class-2");

		// Speaking per-criterion comments render when non-empty and hide when empty
		expect(
			screen.getByTestId("student-speaking-fluency-comment").textContent,
		).toBe("Nói trôi chảy, ít ngập ngừng.");
		expect(
			screen.getByTestId("student-speaking-pronunciation-comment").textContent,
		).toBe("Phát âm rõ các âm cuối.");
		expect(screen.queryByTestId("student-speaking-lexical-comment")).toBeNull();
		expect(screen.queryByTestId("student-speaking-grammar-comment")).toBeNull();

		// Speaking error legend displays ONLY 4 Speaking English IELTS criteria
		const speakingLegend = within(speakingSection).getByRole("list", {
			name: "Chú giải loại lỗi",
		});
		const speakingLegendItems = within(speakingLegend).getAllByRole("listitem");
		expect(speakingLegendItems).toHaveLength(4);
		expect(speakingLegend.textContent).toContain("Fluency & Coherence");
		expect(speakingLegend.textContent).toContain("Lexical Resource");
		expect(speakingLegend.textContent).toContain(
			"Grammatical Range & Accuracy",
		);
		expect(speakingLegend.textContent).toContain("Pronunciation");
		expect(speakingLegend.textContent).not.toContain("Task Response");
		expect(speakingLegend.textContent).not.toContain("Coherence & Cohesion");
		expect(speakingLegend.textContent).not.toContain("Chính tả");
		expect(speakingLegend.textContent).not.toContain("Phát âm");

		expect(screen.getByTestId("writing-annotated-text").textContent).toContain(
			"I go",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"Grammatical Range & Accuracy",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"Lexical Resource",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"went",
		);
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"Dùng thì quá khứ đơn với yesterday.",
		);
		expect(screen.getByTestId("speaking-error-cards").textContent).toContain(
			"Pronunciation",
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

	it("renders legacy graded result view with /15 and /20 fallback without IELTS accent colors or criterion comments", async () => {
		const { PlacementGradedResultView } = await import(
			"@/components/placement/placement-result-views"
		);
		const legacySubmission: StudentPlacementSubmissionView = {
			id: "sub-legacy",
			testVersion: 2,
			status: "graded",
			submittedAt: "2026-10-15T00:00:00Z",
			gradedAt: "2026-10-16T00:00:00Z",
			objective: {
				listening: { correct: 8, total: 10, pct: 80 },
				vocabGrammar: { correct: 15, total: 20, pct: 75 },
				reading: { correct: 7, total: 10, pct: 70 },
			},
			writingText: "Hello",
			writingWordCount: 1,
			writingRubric: { ct: 4, or: 4, lg: 3 },
			writingScore: 11,
			writingCriterionComments: null,
			writingErrors: [],
			speakingStatus: "uploaded",
			speakingTranscript: "Hi",
			speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 5 },
			speakingScore: 17,
			speakingCriterionComments: null,
			speakingErrors: [],
			finalBandLevel: "B1",
			finalDisplayCourse: "Giao tiếp 2",
			finalScorePct: 76,
			finalNote: "",
			bandAdvice: "",
			teacherFeedback: "",
		};

		render(<PlacementGradedResultView submission={legacySubmission} />);
		const writingSection = screen.getByTestId("graded-writing-section");
		expect(writingSection.textContent).toContain("11/15 điểm");
		expect(writingSection.textContent).toContain("Content");
		expect(writingSection.textContent).toContain("4/5");
		expect(writingSection.querySelector(".border-l-4")).toBeNull();
		expect(
			writingSection.querySelector('[data-testid$="-comment"]'),
		).toBeNull();

		const speakingSection = screen.getByTestId("graded-speaking-section");
		expect(speakingSection.textContent).toContain("17/20 điểm");
		expect(speakingSection.textContent).toContain("Grammar & Vocabulary");
		expect(speakingSection.textContent).toContain("5/5");
		expect(speakingSection.querySelector(".border-l-4")).toBeNull();
		expect(
			speakingSection.querySelector('[data-testid$="-comment"]'),
		).toBeNull();
	});

	it("handles null criterion comments and normalizes legacy or cross-skill error categories safely", async () => {
		const { PlacementGradedResultView } = await import(
			"@/components/placement/placement-result-views"
		);
		const { resolvePlacementErrorStyle } = await import(
			"@/lib/placement-test-helpers"
		);

		expect(resolvePlacementErrorStyle("vocabulary", "writing").label).toBe(
			"Lexical Resource",
		);
		expect(resolvePlacementErrorStyle("spelling", "writing").label).toBe(
			"Lexical Resource",
		);
		expect(resolvePlacementErrorStyle("pronunciation", "writing").label).toBe(
			"Lexical Resource",
		);
		expect(resolvePlacementErrorStyle("fluency", "writing").label).toBe(
			"Coherence & Cohesion",
		);
		expect(resolvePlacementErrorStyle("task", "speaking").label).toBe(
			"Fluency & Coherence",
		);
		expect(resolvePlacementErrorStyle("coherence", "speaking").label).toBe(
			"Fluency & Coherence",
		);
		expect(resolvePlacementErrorStyle("unknown-cat", "speaking").label).toBe(
			"Grammatical Range & Accuracy",
		);

		const submissionWithNullComments: StudentPlacementSubmissionView = {
			id: "sub-ielts-null-comments",
			testVersion: 3,
			status: "graded",
			submittedAt: "2026-11-15T00:00:00Z",
			gradedAt: "2026-11-16T00:00:00Z",
			objective: {
				listening: { correct: 8, total: 10, pct: 80 },
				vocabGrammar: { correct: 15, total: 20, pct: 75 },
				reading: { correct: 7, total: 10, pct: 70 },
			},
			writingText: "Recieve this note.",
			writingWordCount: 3,
			writingRubric: { task: 6, coherence: 6, lexical: 5.5, grammar: 6 },
			writingScore: 6,
			writingCriterionComments: null,
			writingErrors: [
				{
					id: "legacy-w-err",
					category: "spelling" as unknown as "lexical",
					quote: "Recieve",
					start: 0,
					end: 7,
					correction: "Receive",
					explanation: "Sai chính tả.",
				},
			],
			speakingStatus: "uploaded",
			speakingTranscript: "Hello everyone.",
			speakingRubric: {
				fluency: 6,
				lexical: 6,
				grammar: 6,
				pronunciation: 6,
			},
			speakingScore: 6,
			speakingCriterionComments: null,
			speakingErrors: [],
			finalBandLevel: "B1",
			finalDisplayCourse: "IELTS Foundation",
			finalScorePct: 70,
			finalNote: "",
			bandAdvice: "",
			teacherFeedback: "",
		};

		render(
			<PlacementGradedResultView submission={submissionWithNullComments} />,
		);

		const writingSection = screen.getByTestId("graded-writing-section");
		expect(
			writingSection.querySelector('[data-testid$="-comment"]'),
		).toBeNull();
		expect(screen.getByTestId("writing-error-cards").textContent).toContain(
			"Lexical Resource",
		);
		const speakingSection = screen.getByTestId("graded-speaking-section");
		expect(
			speakingSection.querySelector('[data-testid$="-comment"]'),
		).toBeNull();
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
				kind: " Message " as unknown as "message",
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
			{
				id: "rf",
				partLabel: "Part 3",
				kind: "cloze" as const,
				instruction: "Choose the best word.",
				title: "(B1)",
				body: "Read [1] carefully.",
				questions: [
					{
						id: "rq-4",
						level: "B1",
						prompt: "Gap 1",
						options: ["books", "cars", "trees"],
						answer: 0,
					},
				],
			},
		];

		const qMap = new Map([
			["rq-1", 1],
			["rq-2", 2],
			["rq-3", 3],
			["rq-4", 4],
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

		// No redundant Vietnamese reading kind labels anywhere in reading step
		for (const redundantLabel of [
			"Biển báo / Thông báo",
			"Tin nhắn / Email",
			"Bài đọc hiểu",
			"Đoạn văn điền từ",
		]) {
			expect(container.textContent).not.toContain(redundantLabel);
		}

		// Sign and message titles are NOT rendered outside body, and their cards omit CardHeader
		expect(container.textContent).not.toContain("Pool Notice Secret Heading");
		expect(container.textContent).not.toContain("Message from Mum");
		const signCard = container.querySelector('[data-passage-id="ra"]');
		const messageCard = container.querySelector('[data-passage-id="rb"]');
		const passageCard = container.querySelector('[data-passage-id="re"]');
		const untitledClozeCard = container.querySelector('[data-passage-id="rf"]');

		expect(signCard?.querySelector('[data-slot="card-header"]')).toBeNull();
		expect(messageCard?.querySelector('[data-slot="card-header"]')).toBeNull();
		expect(
			untitledClozeCard?.querySelector('[data-slot="card-header"]'),
		).toBeNull();

		const passageHeader = passageCard?.querySelector(
			'[data-slot="card-header"]',
		);
		expect(passageHeader).not.toBeNull();
		expect(passageHeader?.textContent?.trim()).toBe("A new start in Auckland");

		// Body & passage title still render
		expect(container.textContent).toContain("CITY SWIMMING POOL");
		expect(container.textContent).toContain("A new start in Auckland");

		expect(signCard).not.toBeNull();
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
			writingCriterionComments: null,
			writingErrors: [],
			speakingStatus: "uploaded",
			speakingTranscript: "",
			speakingRubric: null,
			speakingScore: null,
			speakingCriterionComments: null,
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

	it("blocks submit without Speaking recording and shows unanswered confirmation copy without 'khách quan' once Speaking is recorded", async () => {
		const originalMediaDevices = navigator.mediaDevices;
		const originalMediaRecorder = window.MediaRecorder;
		const originalAudioContext = window.AudioContext;
		const originalCreateObjectURL = URL.createObjectURL;

		const fakeStream = {
			getTracks: () => [{ stop: vi.fn() }],
			getAudioTracks: () => [{ addEventListener: vi.fn(), stop: vi.fn() }],
		} as unknown as MediaStream;
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
		});
		class IncompleteFlowRecorder {
			static isTypeSupported(mime: string) {
				return mime === "audio/webm";
			}
			state: RecordingState = "inactive";
			mimeType = "audio/webm";
			private listeners = new Map<string, Set<(evt: unknown) => void>>();
			addEventListener(type: string, cb: (evt: unknown) => void) {
				if (!this.listeners.has(type)) this.listeners.set(type, new Set());
				this.listeners.get(type)?.add(cb);
			}
			private emit(type: string, evt: unknown) {
				for (const cb of this.listeners.get(type) ?? []) cb(evt);
			}
			start() {
				this.state = "recording";
			}
			stop() {
				this.state = "inactive";
				this.emit("dataavailable", {
					data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
				});
				this.emit("stop", {});
			}
		}
		Object.defineProperty(window, "MediaRecorder", {
			configurable: true,
			writable: true,
			value: IncompleteFlowRecorder,
		});
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		URL.createObjectURL = vi.fn(() => "blob:mock-incomplete");

		try {
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
			expect(
				screen.queryByRole("button", { name: /Bỏ qua phần Speaking/i }),
			).toBeNull();

			// Record Speaking first so submit checks remaining objective/writing
			fireEvent.click(
				screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
			);
			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
				).toBeTruthy();
			});
			fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
			fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
			fireEvent.click(
				screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
			);
			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
				).toBeTruthy();
			});
			fireEvent.click(
				screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
			);
			await waitFor(() => {
				expect(screen.getByTestId("speaking-review-box")).toBeTruthy();
				expect(
					(screen.getByTestId("submit-placement-test-btn") as HTMLButtonElement)
						.disabled,
				).toBe(false);
			});

			fireEvent.click(screen.getByTestId("submit-placement-test-btn"));

			const confirmBox = await screen.findByTestId(
				"placement-unanswered-confirm",
			);
			expect(confirmBox.textContent).toContain("còn 5 câu chưa trả lời");
			expect(confirmBox.textContent).not.toContain("khách quan");
			expect(confirmBox.textContent).not.toContain("Speaking chưa ghi âm");
		} finally {
			Object.defineProperty(navigator, "mediaDevices", {
				configurable: true,
				value: originalMediaDevices,
			});
			Object.defineProperty(window, "MediaRecorder", {
				configurable: true,
				writable: true,
				value: originalMediaRecorder,
			});
			Object.defineProperty(window, "AudioContext", {
				configurable: true,
				writable: true,
				value: originalAudioContext,
			});
			URL.createObjectURL = originalCreateObjectURL;
		}
	});
});

describe("Placement Speaking state machine, audio merger & UI (#780)", () => {
	const SPEAKING_TASKS = [
		{
			id: "sp-1",
			partLabel: "Part 1 (A2)",
			level: "A2",
			prompt: "Describe your favorite hobby.",
			prepSeconds: 5,
			answerSeconds: 20,
		},
		{
			id: "sp-2",
			partLabel: "Part 2",
			level: "B1",
			prompt: "Describe a memorable trip.",
			prepSeconds: 10,
			answerSeconds: 30,
		},
	] as const;

	const originalMediaDevices = navigator.mediaDevices;
	const originalMediaRecorder = window.MediaRecorder;
	const originalAudioContext = window.AudioContext;
	const originalCreateObjectURL = URL.createObjectURL;

	afterEach(() => {
		cleanup();
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: originalMediaDevices,
		});
		window.MediaRecorder = originalMediaRecorder;
		window.AudioContext = originalAudioContext;
		URL.createObjectURL = originalCreateObjectURL;
		vi.restoreAllMocks();
	});

	it("transitions speaking state machine through paused, up to 2 retries per task, and resets retries on next task", async () => {
		const {
			MAX_SPEAKING_RETRIES_PER_TASK,
			canRetrySpeakingTask,
			createInitialSpeakingSession,
			retrySpeakingCurrentTask,
			startSpeakingTaskReading,
			transitionSpeakingAfterReading,
			transitionSpeakingNextTask,
			transitionSpeakingToPaused,
		} = await import("@/lib/placement-test-helpers");

		expect(MAX_SPEAKING_RETRIES_PER_TASK).toBe(2);

		let state = createInitialSpeakingSession(SPEAKING_TASKS.length);
		expect(state.retriesUsedForCurrentTask).toBe(0);
		expect(canRetrySpeakingTask(state)).toBe(false);

		state = startSpeakingTaskReading(state, 0, SPEAKING_TASKS);
		expect(state.phase).toBe("reading");
		expect(state.retriesUsedForCurrentTask).toBe(0);

		state = transitionSpeakingAfterReading(state, SPEAKING_TASKS);
		expect(state.phase).toBe("prep");

		// Cannot pause or retry before answer
		expect(transitionSpeakingToPaused(state)).toEqual(state);
		expect(canRetrySpeakingTask(state)).toBe(false);

		const { transitionSpeakingToAnswer } = await import(
			"@/lib/placement-test-helpers"
		);
		state = transitionSpeakingToAnswer(state, SPEAKING_TASKS);
		expect(state.phase).toBe("answer");
		expect(state.secondsLeft).toBe(20);

		state = transitionSpeakingToPaused(state);
		expect(state.phase).toBe("paused");
		expect(state.secondsLeft).toBe(0);
		expect(canRetrySpeakingTask(state)).toBe(true);

		// Retry 1
		state = retrySpeakingCurrentTask(state, SPEAKING_TASKS);
		expect(state.phase).toBe("answer");
		expect(state.secondsLeft).toBe(20);
		expect(state.retriesUsedForCurrentTask).toBe(1);

		state = transitionSpeakingToPaused(state);
		expect(canRetrySpeakingTask(state)).toBe(true);

		// Retry 2
		state = retrySpeakingCurrentTask(state, SPEAKING_TASKS);
		expect(state.phase).toBe("answer");
		expect(state.retriesUsedForCurrentTask).toBe(2);

		state = transitionSpeakingToPaused(state);
		expect(state.phase).toBe("paused");
		expect(canRetrySpeakingTask(state)).toBe(false);

		// 3rd retry is blocked
		const blockedState = retrySpeakingCurrentTask(state, SPEAKING_TASKS);
		expect(blockedState).toEqual(state);

		// Advancing to next task resets retriesUsedForCurrentTask to 0
		state = transitionSpeakingNextTask(state, SPEAKING_TASKS);
		expect(state.status).toBe("active");
		expect(state.taskIndex).toBe(1);
		expect(state.phase).toBe("reading");
		expect(state.retriesUsedForCurrentTask).toBe(0);

		// Advancing from last task (answer or paused) completes session
		state = transitionSpeakingToAnswer(state, SPEAKING_TASKS);
		state = transitionSpeakingToPaused(state);
		state = transitionSpeakingNextTask(state, SPEAKING_TASKS);
		expect(state.status).toBe("completed");
		expect(state.phase).toBe("done");
		expect(state.secondsLeft).toBe(0);
	});

	it("encodePcm16Wav writes valid 16 kHz mono 16-bit PCM WAV header and mergeSpeakingAudioSegments handles AudioContext + fallbacks", async () => {
		const { encodePcm16Wav, mergeSpeakingAudioSegments } = await import(
			"@/lib/speaking-audio-merger"
		);

		const samples = new Float32Array([0, 0.5, -0.5, 1]);
		const wavBlob = encodePcm16Wav(samples, 16_000);
		expect(wavBlob.type).toBe("audio/wav");
		expect(wavBlob.size).toBe(44 + samples.length * 2);

		const wavBuf = await new Promise<ArrayBuffer>((resolve, reject) => {
			if (typeof wavBlob.arrayBuffer === "function") {
				wavBlob.arrayBuffer().then(resolve, reject);
				return;
			}
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(wavBlob);
		});
		const view = new DataView(wavBuf);
		const riff = String.fromCharCode(
			view.getUint8(0),
			view.getUint8(1),
			view.getUint8(2),
			view.getUint8(3),
		);
		const wave = String.fromCharCode(
			view.getUint8(8),
			view.getUint8(9),
			view.getUint8(10),
			view.getUint8(11),
		);
		expect(riff).toBe("RIFF");
		expect(wave).toBe("WAVE");
		expect(view.getUint16(22, true)).toBe(1); // mono
		expect(view.getUint32(24, true)).toBe(16_000); // 16 kHz
		expect(view.getUint16(34, true)).toBe(16); // 16-bit PCM
		expect(view.getUint32(40, true)).toBe(samples.length * 2);

		// Fallback when AudioContext is unavailable
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			value: undefined,
		});
		const seg1 = {
			blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
			durationMs: 2_000,
		};
		const seg2 = {
			blob: new Blob([new Uint8Array([4, 5, 6, 7])], { type: "audio/webm" }),
			durationMs: 3_000,
		};

		const singleFallback = await mergeSpeakingAudioSegments([seg1]);
		expect(singleFallback.blob).toBe(seg1.blob);
		expect(singleFallback.mimeType).toBe("audio/webm");
		expect(singleFallback.durationSec).toBe(2);

		const multiFallback = await mergeSpeakingAudioSegments([seg1, seg2]);
		expect(multiFallback.mimeType).toBe("audio/webm");
		expect(multiFallback.blob.size).toBe(7);
		expect(multiFallback.durationSec).toBe(5);

		// Mocked AudioContext merges decoded segments into audio/wav
		class MockAudioContext {
			async decodeAudioData(_buf: ArrayBuffer) {
				return {
					sampleRate: 48_000,
					numberOfChannels: 1,
					length: 48_000,
					getChannelData: () => new Float32Array(48_000).fill(0.25),
				} as unknown as AudioBuffer;
			}
			async close() {}
		}
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			value: MockAudioContext,
		});

		const mergedWav = await mergeSpeakingAudioSegments([seg1, seg2]);
		expect(mergedWav.mimeType).toBe("audio/wav");
		expect(mergedWav.durationSec).toBe(2);
		expect(mergedWav.blob.size).toBe(44 + 32_000 * 2);

		// Fallback when decodeAudioData throws
		class FailingAudioContext {
			async decodeAudioData() {
				throw new Error("decode failed");
			}
			async close() {}
		}
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			value: FailingAudioContext,
		});
		const decodeFallback = await mergeSpeakingAudioSegments([seg1, seg2]);
		expect(decodeFallback.mimeType).toBe("audio/webm");
		expect(decodeFallback.blob.size).toBe(7);
	});

	it("PlacementSpeakingStep omits redundant instructions/retake and supports per-task pause, max 2 retries, and confirmed early finish", async () => {
		const { PlacementSpeakingStep } = await import(
			"@/components/placement/placement-speaking-step"
		);

		const trackStop = vi.fn();
		const fakeStream = {
			getTracks: () => [{ stop: trackStop }],
			getAudioTracks: () => [{ addEventListener: vi.fn(), stop: trackStop }],
		} as unknown as MediaStream;
		const getUserMediaMock = vi.fn().mockResolvedValue(fakeStream);
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: getUserMediaMock },
		});

		const recorderInstances: MockMediaRecorder[] = [];
		class MockMediaRecorder {
			static isTypeSupported(mime: string) {
				return mime === "audio/webm";
			}
			state: RecordingState = "inactive";
			mimeType = "audio/webm";
			private listeners = new Map<string, Set<(evt: unknown) => void>>();

			constructor(_stream: MediaStream, _opts?: MediaRecorderOptions) {
				recorderInstances.push(this);
			}
			addEventListener(type: string, cb: (evt: unknown) => void) {
				if (!this.listeners.has(type)) this.listeners.set(type, new Set());
				this.listeners.get(type)?.add(cb);
			}
			private emit(type: string, evt: unknown) {
				for (const cb of this.listeners.get(type) ?? []) cb(evt);
			}
			start() {
				this.state = "recording";
			}
			stop() {
				this.state = "inactive";
				const attemptIndex = recorderInstances.length;
				this.emit("dataavailable", {
					data: new Blob([new Uint8Array([attemptIndex, 2, 3, 4])], {
						type: "audio/webm",
					}),
				});
				this.emit("stop", {});
			}
		}

		Object.defineProperty(window, "MediaRecorder", {
			configurable: true,
			value: MockMediaRecorder,
		});
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			value: undefined,
		});
		URL.createObjectURL = vi.fn(() => "blob:mock-speaking");

		const onRecordedAudioChange = vi.fn();
		const { container, rerender } = render(
			<PlacementSpeakingStep
				tasks={SPEAKING_TASKS}
				recordedAudio={null}
				onRecordedAudioChange={onRecordedAudioChange}
				onBusyChange={vi.fn()}
			/>,
		);

		// Idle view: concise title, no long description, no 3-step <ol>
		expect(container.textContent).toContain("Phần 5 / 5 · Nói (Speaking)");
		expect(container.textContent).toContain("Kiểm tra Speaking");
		expect(container.textContent).not.toContain(
			"Hệ thống sẽ tự động đọc lần lượt từng câu hỏi",
		);
		expect(container.querySelector("ol")).toBeNull();
		expect(container.textContent).toContain("Số câu hỏi");
		expect(container.textContent).toContain("Thời lượng ước tính");
		expect(container.textContent).toContain("Phương thức");

		// Start speaking -> single getUserMedia call
		fireEvent.click(
			screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
			).toBeTruthy();
		});
		expect(getUserMediaMock).toHaveBeenCalledTimes(1);

		// Reading -> Prep: centered countdown & concise buttons without long hint
		fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
		const prepStage = screen.getByTestId("speaking-prep-stage");
		expect(prepStage.textContent).toContain("Thời gian chuẩn bị");
		expect(screen.getByTestId("speaking-prep-timer").textContent).toBe("00:05");
		expect(container.textContent).not.toContain(
			"Bạn có thể bấm Nghe lại câu hỏi tối đa 1 lần trước khi trả lời.",
		);

		// Early finish button in separated footer opens inline confirmation instead of ending immediately
		const footerBtn = screen.getByRole("button", {
			name: "Kết thúc phần Speaking",
		});
		expect(footerBtn.closest(".border-t")).not.toBeNull();
		fireEvent.click(footerBtn);
		expect(screen.getByTestId("speaking-early-finish-confirm")).toBeTruthy();
		expect(onRecordedAudioChange).not.toHaveBeenCalled();

		// Cancel early finish confirmation
		fireEvent.click(screen.getByRole("button", { name: "Tiếp tục làm bài" }));
		expect(screen.queryByTestId("speaking-early-finish-confirm")).toBeNull();

		// Prep -> Answer: centered round red Pause button & live timer
		fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
		expect(recorderInstances).toHaveLength(1);
		const pauseBtn = screen.getByRole("button", {
			name: "Dừng ghi âm câu hiện tại",
		});
		expect(pauseBtn.className).toContain("rounded-full");
		expect(pauseBtn.className).toContain("bg-destructive");
		expect(screen.getByTestId("speaking-answer-timer").textContent).toBe(
			"00:20",
		);

		// Pause -> Paused state with 2 retries remaining
		fireEvent.click(pauseBtn);
		await waitFor(() => {
			expect(screen.getByTestId("speaking-paused-stage")).toBeTruthy();
		});
		expect(
			screen.getByRole("button", { name: "Ghi lại câu này (còn 2/2)" }),
		).toBeTruthy();

		// Retry 1 -> creates fresh MediaRecorder (#2)
		fireEvent.click(
			screen.getByRole("button", { name: "Ghi lại câu này (còn 2/2)" }),
		);
		expect(recorderInstances).toHaveLength(2);
		fireEvent.click(
			screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Ghi lại câu này (còn 1/2)" }),
			).toBeTruthy();
		});

		// Retry 2 -> creates fresh MediaRecorder (#3), then retry button is exhausted & disabled
		fireEvent.click(
			screen.getByRole("button", { name: "Ghi lại câu này (còn 1/2)" }),
		);
		expect(recorderInstances).toHaveLength(3);
		fireEvent.click(
			screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
		);
		await waitFor(() => {
			const exhaustedBtn = screen.getByRole("button", {
				name: "Đã hết lượt ghi lại (0/2)",
			}) as HTMLButtonElement;
			expect(exhaustedBtn.disabled).toBe(true);
		});

		// Advance to Question 2 (retries reset to 2/2) -> answer -> pause -> finish
		fireEvent.click(screen.getByRole("button", { name: "Câu tiếp theo →" }));
		fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
		fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
		expect(recorderInstances).toHaveLength(4);
		fireEvent.click(
			screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Ghi lại câu này (còn 2/2)" }),
			).toBeTruthy();
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
		);

		await waitFor(() => {
			expect(onRecordedAudioChange).toHaveBeenCalledTimes(1);
		});
		const recorded = onRecordedAudioChange.mock.calls[0]?.[0];
		expect(recorded).toBeTruthy();
		// Only 2 segments merged (task 1's 3rd attempt + task 2's 1st attempt, 4 bytes each = 8 bytes)
		expect(recorded.blob.size).toBe(8);
		expect(getUserMediaMock).toHaveBeenCalledTimes(1);

		// Review view renders without "Ghi lại từ đầu"
		rerender(
			<PlacementSpeakingStep
				tasks={SPEAKING_TASKS}
				recordedAudio={recorded}
				onRecordedAudioChange={onRecordedAudioChange}
				onBusyChange={vi.fn()}
			/>,
		);
		expect(screen.getByTestId("speaking-review-box")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: /Ghi lại từ đầu/i }),
		).toBeNull();

		// Oversized (> 50 MB) recording provides reset button to avoid dead-end
		const oversizedBlob = {
			size: 51 * 1024 * 1024,
			type: "audio/webm",
		} as Blob;
		rerender(
			<PlacementSpeakingStep
				tasks={SPEAKING_TASKS}
				recordedAudio={{
					blob: oversizedBlob,
					url: "blob:mock-oversized",
					mimeType: "audio/webm",
					durationSec: 60,
				}}
				onRecordedAudioChange={onRecordedAudioChange}
				onBusyChange={vi.fn()}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: /Xóa bản ghi & ghi lại/i }),
		);
		expect(onRecordedAudioChange).toHaveBeenLastCalledWith(null);
	});

	it("transitions to paused when answer timer hits 0 and merges active recording on confirmed early finish", async () => {
		vi.useFakeTimers();
		try {
			const { PlacementSpeakingStep } = await import(
				"@/components/placement/placement-speaking-step"
			);

			const shortTasks = [
				{
					id: "sp-short-1",
					partLabel: "Part 1",
					level: "A2",
					prompt: "Short question 1",
					prepSeconds: 0,
					answerSeconds: 5,
				},
				{
					id: "sp-short-2",
					partLabel: "Part 1",
					level: "A2",
					prompt: "Short question 2",
					prepSeconds: 0,
					answerSeconds: 5,
				},
			] as const;

			const fakeStream = {
				getTracks: () => [{ stop: vi.fn() }],
				getAudioTracks: () => [{ addEventListener: vi.fn(), stop: vi.fn() }],
			} as unknown as MediaStream;
			Object.defineProperty(navigator, "mediaDevices", {
				configurable: true,
				value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
			});

			class MockMediaRecorder {
				static isTypeSupported(mime: string) {
					return mime === "audio/webm";
				}
				state: RecordingState = "inactive";
				mimeType = "audio/webm";
				private listeners = new Map<string, Set<(evt: unknown) => void>>();

				addEventListener(type: string, cb: (evt: unknown) => void) {
					if (!this.listeners.has(type)) this.listeners.set(type, new Set());
					this.listeners.get(type)?.add(cb);
				}
				private emit(type: string, evt: unknown) {
					for (const cb of this.listeners.get(type) ?? []) cb(evt);
				}
				start() {
					this.state = "recording";
				}
				stop() {
					this.state = "inactive";
					this.emit("dataavailable", {
						data: new Blob([new Uint8Array([9, 8, 7])], { type: "audio/webm" }),
					});
					this.emit("stop", {});
				}
			}

			Object.defineProperty(window, "MediaRecorder", {
				configurable: true,
				value: MockMediaRecorder,
			});
			Object.defineProperty(window, "AudioContext", {
				configurable: true,
				value: undefined,
			});
			URL.createObjectURL = vi.fn(() => "blob:mock-early-finish");

			const onRecordedAudioChange = vi.fn();
			render(
				<PlacementSpeakingStep
					tasks={shortTasks}
					recordedAudio={null}
					onRecordedAudioChange={onRecordedAudioChange}
					onBusyChange={vi.fn()}
				/>,
			);

			fireEvent.click(
				screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
			);
			await vi.waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
				).toBeTruthy();
			});

			// prepSeconds is 0 -> reading advances directly to answer
			fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
			expect(screen.getByTestId("speaking-answer-stage")).toBeTruthy();
			expect(screen.getByTestId("speaking-answer-timer").textContent).toBe(
				"00:05",
			);

			// Advance 5 seconds so answer timer hits 0 -> transitions to paused
			await vi.advanceTimersByTimeAsync(5_000);
			await vi.waitFor(() => {
				expect(screen.getByTestId("speaking-paused-stage")).toBeTruthy();
			});

			// Advance to task 2, start answer, then confirm early finish while recording
			fireEvent.click(screen.getByRole("button", { name: "Câu tiếp theo →" }));
			fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
			expect(screen.getByTestId("speaking-answer-stage")).toBeTruthy();

			fireEvent.click(
				screen.getByRole("button", { name: "Kết thúc phần Speaking" }),
			);
			fireEvent.click(
				screen.getByRole("button", { name: "Xác nhận kết thúc sớm" }),
			);

			await vi.waitFor(() => {
				expect(onRecordedAudioChange).toHaveBeenCalledTimes(1);
			});
			const merged = onRecordedAudioChange.mock.calls[0]?.[0];
			expect(merged.blob.size).toBe(6);
		} finally {
			vi.useRealTimers();
		}
	});
});

function makeMp4FtypBytes(): Uint8Array<ArrayBuffer> {
	return new Uint8Array([
		0x00,
		0x00,
		0x00,
		0x18, // box size = 24
		0x66,
		0x74,
		0x79,
		0x70, // "ftyp"
		0x4d,
		0x34,
		0x41,
		0x20, // major brand "M4A "
		0x00,
		0x00,
		0x00,
		0x00, // minor version
		0x4d,
		0x34,
		0x41,
		0x20, // compatible brand "M4A "
		0x69,
		0x73,
		0x6f,
		0x6d, // compatible brand "isom"
	]);
}

function createInMemoryIdbFactory() {
	const stores = new Map<string, Map<string, unknown>>();

	const factory = {
		open: (_name: string, _version?: number) => {
			const req: Record<string, unknown> = {
				result: null,
				error: null,
				onupgradeneeded: null,
				onsuccess: null,
				onerror: null,
				onblocked: null,
			};

			const db = {
				objectStoreNames: {
					contains: (storeName: string) => stores.has(storeName),
				},
				createObjectStore: (storeName: string) => {
					if (!stores.has(storeName)) {
						stores.set(storeName, new Map());
					}
					return {};
				},
				close: vi.fn(),
				transaction: (_storeName: string, _mode?: IDBTransactionMode) => {
					const tx: Record<string, unknown> = {
						error: null,
						oncomplete: null,
						onerror: null,
						onabort: null,
						objectStore: (name: string) => {
							const map = stores.get(name) ?? new Map<string, unknown>();
							stores.set(name, map);
							return {
								put: (value: { key: string }) => {
									const opReq: Record<string, unknown> = {
										result: value.key,
										error: null,
										onsuccess: null,
										onerror: null,
									};
									queueMicrotask(() => {
										map.set(value.key, value);
										(opReq.onsuccess as (() => void) | null)?.();
										(tx.oncomplete as (() => void) | null)?.();
									});
									return opReq;
								},
								get: (key: string) => {
									const opReq: Record<string, unknown> = {
										result: undefined,
										error: null,
										onsuccess: null,
										onerror: null,
									};
									queueMicrotask(() => {
										opReq.result = map.get(key);
										(opReq.onsuccess as (() => void) | null)?.();
										(tx.oncomplete as (() => void) | null)?.();
									});
									return opReq;
								},
								delete: (key: string) => {
									const opReq: Record<string, unknown> = {
										result: undefined,
										error: null,
										onsuccess: null,
										onerror: null,
									};
									queueMicrotask(() => {
										map.delete(key);
										(opReq.onsuccess as (() => void) | null)?.();
										(tx.oncomplete as (() => void) | null)?.();
									});
									return opReq;
								},
							};
						},
					};
					return tx;
				},
			};

			req.result = db;
			queueMicrotask(() => {
				(req.onupgradeneeded as (() => void) | null)?.();
				(req.onsuccess as (() => void) | null)?.();
			});

			return req as unknown as IDBOpenDBRequest;
		},
	};

	return {
		factory: factory as unknown as IDBFactory,
		stores,
	};
}

function createPendingSubmissionFixture(
	overrides?: Partial<StudentPlacementSubmissionView>,
): StudentPlacementSubmissionView {
	return {
		id: "sub-pending-speaking",
		testVersion: 3,
		status: "pending_grading",
		submittedAt: "2026-11-20T10:00:00Z",
		gradedAt: null,
		objective: {
			listening: { correct: 2, total: 2, pct: 100 },
			vocabGrammar: { correct: 1, total: 1, pct: 100 },
			reading: { correct: 2, total: 2, pct: 100 },
		},
		writingText: "My sample writing response for placement test.",
		writingWordCount: 8,
		writingRubric: null,
		writingScore: null,
		writingCriterionComments: null,
		writingErrors: [],
		speakingStatus: "pending_upload",
		speakingTranscript: "",
		speakingRubric: null,
		speakingScore: null,
		speakingCriterionComments: null,
		speakingErrors: [],
		finalBandLevel: null,
		finalDisplayCourse: null,
		finalScorePct: null,
		finalNote: "",
		bandAdvice: "",
		teacherFeedback: "",
		...overrides,
	};
}

describe("Placement Speaking upload resilience, WebKit compatibility & recovery", () => {
	const originalFetch = globalThis.fetch;
	const originalMediaDevices = navigator.mediaDevices;
	const originalMediaRecorder = window.MediaRecorder;
	const originalAudioContext = window.AudioContext;
	const originalCreateObjectURL = URL.createObjectURL;
	const originalIndexedDb = globalThis.indexedDB;
	const originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(
		window.navigator,
		"userAgent",
	);

	function installMockRecorder(options?: {
		recorderMimeType?: string;
		supportedMime?: string;
		chunkBytes?: Uint8Array<ArrayBuffer>;
		chunkType?: string;
	}) {
		const fakeStream = {
			getTracks: () => [{ stop: vi.fn() }],
			getAudioTracks: () => [{ addEventListener: vi.fn(), stop: vi.fn() }],
		} as unknown as MediaStream;
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: { getUserMedia: vi.fn().mockResolvedValue(fakeStream) },
		});
		const recorderMimeType = options?.recorderMimeType ?? "audio/webm";
		const supportedMime = options?.supportedMime ?? "audio/webm";
		const chunkBytes =
			options?.chunkBytes ?? new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]);
		const chunkType = options?.chunkType ?? recorderMimeType;

		class ConfigurableMockRecorder {
			static isTypeSupported(mime: string) {
				return Boolean(supportedMime) && mime === supportedMime;
			}
			state: RecordingState = "inactive";
			mimeType = recorderMimeType;
			private listeners = new Map<string, Set<(evt: unknown) => void>>();
			addEventListener(type: string, cb: (evt: unknown) => void) {
				if (!this.listeners.has(type)) this.listeners.set(type, new Set());
				this.listeners.get(type)?.add(cb);
			}
			private emit(type: string, evt: unknown) {
				for (const cb of this.listeners.get(type) ?? []) cb(evt);
			}
			start() {
				this.state = "recording";
			}
			stop() {
				this.state = "inactive";
				this.emit("dataavailable", {
					data: chunkType
						? new Blob([chunkBytes], { type: chunkType })
						: new Blob([chunkBytes]),
				});
				this.emit("stop", {});
			}
		}

		Object.defineProperty(window, "MediaRecorder", {
			configurable: true,
			writable: true,
			value: ConfigurableMockRecorder,
		});
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		URL.createObjectURL = vi.fn(() => "blob:mock-speaking-resilience");
	}

	async function completeSingleSpeakingTaskRecording() {
		fireEvent.click(
			screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
			).toBeTruthy();
		});
		fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
		fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
		fireEvent.click(
			screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
			).toBeTruthy();
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
		);
		await waitFor(() => {
			expect(screen.getByTestId("speaking-review-box")).toBeTruthy();
		});
	}

	beforeEach(() => {
		mockNavigate.mockReset();
		window.localStorage.clear();
		window.scrollTo = vi.fn();
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: undefined,
		});
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: originalMediaDevices,
		});
		Object.defineProperty(window, "MediaRecorder", {
			configurable: true,
			writable: true,
			value: originalMediaRecorder,
		});
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: originalAudioContext,
		});
		URL.createObjectURL = originalCreateObjectURL;
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: originalIndexedDb,
		});
		if (originalUserAgentDescriptor) {
			Object.defineProperty(
				window.navigator,
				"userAgent",
				originalUserAgentDescriptor,
			);
		}
		vi.restoreAllMocks();
	});

	it("keeps PlacementTestRunner mounted while Speaking PUT is in-flight, delays view refetch until upload settles, and prevents stale pending_upload cache from overwriting uploaded status", async () => {
		installMockRecorder();

		let resolveSpeakingPut!: (res: Response) => void;
		const speakingPutPromise = new Promise<Response>((resolve) => {
			resolveSpeakingPut = resolve;
		});

		let viewFetchCount = 0;
		let submitted = false;
		const submissionId = "sub-race-1";

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				viewFetchCount += 1;
				if (!submitted) {
					const notStarted: StudentPlacementViewResponse = {
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
					return makeJsonResponse(notStarted);
				}
				// Intentionally return stale `pending_upload` on refetch after upload completes
				const stalePending: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: submissionId,
						speakingStatus: "pending_upload",
					}),
					speakingTasks: SAMPLE_SNAPSHOT.parts[4].tasks,
				};
				return makeJsonResponse(stalePending);
			}
			if (
				url.endsWith("/api/student/placement-test/submissions") &&
				init?.method === "POST"
			) {
				submitted = true;
				return makeJsonResponse(
					{
						submissionId,
						uploadToken: "tok-race-1",
						uploadTokenExpiresAt: "2026-11-26T00:00:00Z",
						objective: {
							listening: { correct: 2, total: 2, pct: 100 },
							vocabGrammar: { correct: 1, total: 1, pct: 100 },
							reading: { correct: 2, total: 2, pct: 100 },
						},
					},
					201,
				);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				return speakingPutPromise;
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		await screen.findByTestId("placement-intro-card");
		expect(viewFetchCount).toBe(1);

		fireEvent.click(screen.getByTestId("start-placement-test-btn"));
		fireEvent.click(screen.getByTestId("placement-tab-writing"));
		fireEvent.change(screen.getByTestId("placement-writing-textarea"), {
			target: { value: "This is a complete writing answer for placement." },
		});
		fireEvent.click(screen.getByTestId("placement-tab-speaking"));
		await completeSingleSpeakingTaskRecording();

		// Submit -> confirm unanswered objective -> POST resolves immediately while PUT stays pending
		await waitFor(() => {
			expect(
				(screen.getByTestId("submit-placement-test-btn") as HTMLButtonElement)
					.disabled,
			).toBe(false);
		});
		fireEvent.click(screen.getByTestId("submit-placement-test-btn"));
		const confirmBox = await screen.findByTestId(
			"placement-unanswered-confirm",
		);
		fireEvent.click(
			within(confirmBox).getByRole("button", { name: "Vẫn nộp bài ngay" }),
		);

		// Runner stays mounted with uploading banner, disabled tabs, and ZERO premature view refetch
		const progressBanner = await screen.findByTestId(
			"speaking-upload-progress-banner",
		);
		expect(progressBanner.textContent).toContain("Đang tải bản ghi Speaking");
		expect(screen.getByTestId("placement-runner")).toBeTruthy();
		expect(screen.queryByTestId("placement-pending-view")).toBeNull();
		expect(
			(screen.getByTestId("placement-tab-writing") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			screen.getByTestId("submit-placement-test-btn").textContent,
		).toContain("Đang tải bài nói Speaking...");
		expect(viewFetchCount).toBe(1);

		// beforeunload listener is active while uploading Speaking
		const unloadEvent = new Event("beforeunload", { cancelable: true });
		window.dispatchEvent(unloadEvent);
		expect(unloadEvent.defaultPrevented).toBe(true);

		// Now finish Speaking PUT -> view transitions to pending result and refetches
		resolveSpeakingPut(
			makeJsonResponse({ ok: true, speakingStatus: "uploaded" }),
		);

		await screen.findByTestId("placement-pending-view");
		await waitFor(() => {
			expect(viewFetchCount).toBeGreaterThanOrEqual(2);
		});
		// Even though the refetched view returned stale `pending_upload`, UI preserves confirmed `uploaded`
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Đã gửi bài nói",
		);
	});

	it("resolves Speaking upload Content-Type and filename from MP4 ftyp magic bytes regardless of declared MIME type", async () => {
		const { uploadStudentPlacementSpeaking } = await import(
			"@/lib/repos/placement-test"
		);
		const mp4Bytes = makeMp4FtypBytes();
		const capturedHeaders: Array<{ contentType: string; filename: string }> =
			[];

		globalThis.fetch = vi.fn(async (_input, init) => {
			const headers = (init?.headers ?? {}) as Record<string, string>;
			capturedHeaders.push({
				contentType: headers["Content-Type"] ?? "",
				filename: headers["X-Media-Filename"] ?? "",
			});
			return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
		});

		for (const declaredMime of ["video/mp4", "", "audio/webm"]) {
			const blob = declaredMime
				? new Blob([mp4Bytes], { type: declaredMime })
				: new Blob([mp4Bytes]);
			await uploadStudentPlacementSpeaking(
				"sub-magic",
				"tok-magic",
				blob,
				declaredMime,
				12,
				{ retryDelaysMs: [] },
			);
		}

		expect(capturedHeaders).toEqual([
			{ contentType: "audio/mp4", filename: "speaking.m4a" },
			{ contentType: "audio/mp4", filename: "speaking.m4a" },
			{ contentType: "audio/mp4", filename: "speaking.m4a" },
		]);
	});

	it("retries Speaking upload on transient 503 and network errors up to 2 times, but fails immediately on 415", async () => {
		const { uploadStudentPlacementSpeaking } = await import(
			"@/lib/repos/placement-test"
		);
		const { HttpError } = await import("@/lib/query-client");
		const blob = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])], {
			type: "audio/webm",
		});

		// 1. 503 twice then 200
		const sleepDelays503: number[] = [];
		let attempts503 = 0;
		globalThis.fetch = vi.fn(async () => {
			attempts503 += 1;
			if (attempts503 <= 2) {
				return makeJsonResponse({ error: "TEMPORARY_UNAVAILABLE" }, 503);
			}
			return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
		});
		const res503 = await uploadStudentPlacementSpeaking(
			"sub-retry-503",
			"tok-1",
			blob,
			"audio/webm",
			10,
			{
				retryDelaysMs: [50, 100],
				sleepImpl: async (ms) => {
					sleepDelays503.push(ms);
				},
			},
		);
		expect(res503.ok).toBe(true);
		expect(attempts503).toBe(3);
		expect(sleepDelays503).toEqual([50, 100]);

		// 2. Network error twice then 200
		let attemptsNet = 0;
		globalThis.fetch = vi.fn(async () => {
			attemptsNet += 1;
			if (attemptsNet <= 2) {
				throw new TypeError("Failed to fetch");
			}
			return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
		});
		const resNet = await uploadStudentPlacementSpeaking(
			"sub-retry-net",
			"tok-2",
			blob,
			"audio/webm",
			10,
			{ retryDelaysMs: [10, 20], sleepImpl: async () => {} },
		);
		expect(resNet.ok).toBe(true);
		expect(attemptsNet).toBe(3);

		// 3. Persistent network failure throws HttpError(0, ...)
		let attemptsNetFail = 0;
		globalThis.fetch = vi.fn(async () => {
			attemptsNetFail += 1;
			throw new TypeError("Network offline");
		});
		await expect(
			uploadStudentPlacementSpeaking(
				"sub-retry-net-fail",
				"tok-3",
				blob,
				"audio/webm",
				10,
				{ retryDelaysMs: [10, 20], sleepImpl: async () => {} },
			),
		).rejects.toSatisfy(
			(err: unknown) =>
				err instanceof HttpError &&
				err.status === 0 &&
				err.message.includes("Không thể kết nối máy chủ"),
		);
		expect(attemptsNetFail).toBe(3);

		// 4. 415 Unsupported Media Type fails immediately with ZERO retries
		let attempts415 = 0;
		const sleep415 = vi.fn(async () => {});
		globalThis.fetch = vi.fn(async () => {
			attempts415 += 1;
			return makeJsonResponse({ error: "UNSUPPORTED_AUDIO_FORMAT" }, 415);
		});
		await expect(
			uploadStudentPlacementSpeaking(
				"sub-no-retry-415",
				"tok-4",
				blob,
				"audio/webm",
				10,
				{ retryDelaysMs: [50, 100], sleepImpl: sleep415 },
			),
		).rejects.toSatisfy(
			(err: unknown) => err instanceof HttpError && err.status === 415,
		);
		expect(attempts415).toBe(1);
		expect(sleep415).not.toHaveBeenCalled();
	});

	it("transparently mints a fresh upload token when manual retry receives 401 UPLOAD_TOKEN_EXPIRED", async () => {
		installMockRecorder();

		const submissionId = "sub-token-refresh";
		let currentStatus: StudentPlacementViewResponse["status"] = "not_started";
		let currentSpeakingStatus: StudentPlacementSubmissionView["speakingStatus"] =
			"pending_upload";
		let putAttempt = 0;
		let tokenMintCalls = 0;
		const seenTokens: string[] = [];

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: currentStatus,
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: currentStatus === "not_started" ? null : submissionId,
					testAvailable: true,
					testVersion: 3,
					snapshot: currentStatus === "not_started" ? SAMPLE_SNAPSHOT : null,
					submission:
						currentStatus === "not_started"
							? null
							: createPendingSubmissionFixture({
									id: submissionId,
									speakingStatus: currentSpeakingStatus,
								}),
					speakingTasks:
						currentSpeakingStatus === "pending_upload"
							? SAMPLE_SNAPSHOT.parts[4].tasks
							: null,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith("/api/student/placement-test/submissions") &&
				init?.method === "POST"
			) {
				currentStatus = "pending_grading";
				return makeJsonResponse(
					{
						submissionId,
						uploadToken: "tok-expired-1",
						uploadTokenExpiresAt: "2026-11-26T00:00:00Z",
						objective: {
							listening: { correct: 2, total: 2, pct: 100 },
							vocabGrammar: { correct: 1, total: 1, pct: 100 },
							reading: { correct: 2, total: 2, pct: 100 },
						},
					},
					201,
				);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				tokenMintCalls += 1;
				return makeJsonResponse({
					uploadToken: "tok-fresh-2",
					uploadTokenExpiresAt: "2026-11-26T01:00:00Z",
				});
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				putAttempt += 1;
				const headers = (init.headers ?? {}) as Record<string, string>;
				const sentToken = headers["X-Upload-Token"] ?? "";
				seenTokens.push(sentToken);
				if (putAttempt === 1) {
					// Initial submit fails with non-retryable 400 so pendingRetry retains tok-expired-1
					return makeJsonResponse({ message: "Tải tạm thất bại" }, 400);
				}
				if (sentToken === "tok-expired-1") {
					return makeJsonResponse(
						{ error: "UPLOAD_TOKEN_EXPIRED", code: "UPLOAD_TOKEN_EXPIRED" },
						401,
					);
				}
				currentSpeakingStatus = "uploaded";
				return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const queryClient = createTestQueryClient();
		render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		await screen.findByTestId("placement-intro-card");
		fireEvent.click(screen.getByTestId("start-placement-test-btn"));
		fireEvent.click(screen.getByTestId("placement-tab-writing"));
		fireEvent.change(screen.getByTestId("placement-writing-textarea"), {
			target: { value: "Writing text before speaking upload retry." },
		});
		fireEvent.click(screen.getByTestId("placement-tab-speaking"));
		await completeSingleSpeakingTaskRecording();

		await waitFor(() => {
			expect(
				(screen.getByTestId("submit-placement-test-btn") as HTMLButtonElement)
					.disabled,
			).toBe(false);
		});
		fireEvent.click(screen.getByTestId("submit-placement-test-btn"));
		const confirmBox = await screen.findByTestId(
			"placement-unanswered-confirm",
		);
		fireEvent.click(
			within(confirmBox).getByRole("button", { name: "Vẫn nộp bài ngay" }),
		);

		const retryBtn = await screen.findByTestId("retry-speaking-upload-btn");
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Chưa tải lên được bài nói",
		);

		// Click manual retry -> PUT returns 401 -> mints fresh token -> PUT succeeds
		fireEvent.click(retryBtn);

		const successBanner = await screen.findByTestId(
			"speaking-upload-success-banner",
		);
		expect(successBanner.textContent).toContain(
			"Đã tải lên thành công bản ghi Speaking.",
		);
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Đã gửi bài nói",
		);
		expect(tokenMintCalls).toBe(1);
		expect(seenTokens).toEqual([
			"tok-expired-1",
			"tok-expired-1",
			"tok-fresh-2",
		]);
	});

	it("saves, loads, auto-expires, and fail-opens IndexedDB speaking backups, and auto-recovers pending_upload on reload", async () => {
		const {
			SPEAKING_BACKUP_TTL_MS,
			deleteStudentSpeakingBackup,
			loadStudentSpeakingBackup,
			saveStudentSpeakingBackup,
		} = await import("@/lib/placement-speaking-backup");

		// Fail-open when IndexedDB is unavailable
		const sampleBlob = new Blob([makeMp4FtypBytes()], { type: "audio/mp4" });
		expect(
			await saveStudentSpeakingBackup(
				{
					studentId: "stu-1",
					submissionId: "sub-none",
					blob: sampleBlob,
					mimeType: "audio/mp4",
					durationSec: 8,
				},
				{ idbFactory: null },
			),
		).toBe(false);
		expect(
			await loadStudentSpeakingBackup("stu-1", "sub-none", {
				idbFactory: null,
			}),
		).toBeNull();
		expect(
			await deleteStudentSpeakingBackup("stu-1", "sub-none", {
				idbFactory: null,
			}),
		).toBe(false);

		// TTL expiry auto-deletes expired records
		const mockIdb = createInMemoryIdbFactory();
		const baseNow = 1_700_000_000_000;
		expect(
			await saveStudentSpeakingBackup(
				{
					studentId: "stu-1",
					submissionId: "sub-exp",
					blob: sampleBlob,
					mimeType: "audio/mp4",
					durationSec: 15,
				},
				{ now: baseNow, idbFactory: mockIdb.factory },
			),
		).toBe(true);
		const loadedFresh = await loadStudentSpeakingBackup("stu-1", "sub-exp", {
			now: baseNow + 1000,
			idbFactory: mockIdb.factory,
		});
		expect(loadedFresh?.durationSec).toBe(15);
		expect(
			await loadStudentSpeakingBackup("stu-1", "sub-exp", {
				now: baseNow + SPEAKING_BACKUP_TTL_MS + 1,
				idbFactory: mockIdb.factory,
			}),
		).toBeNull();
		expect(mockIdb.stores.get("recordings")?.has("stu-1:sub-exp")).toBe(false);

		// Auto-recovery on reload when IndexedDB has a valid backup
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: mockIdb.factory,
		});
		const submissionId = "sub-reload-recover";
		await saveStudentSpeakingBackup({
			studentId: "stu-1",
			submissionId,
			blob: sampleBlob,
			mimeType: "audio/mp4",
			durationSec: 18,
		});
		expect(mockIdb.stores.get("recordings")?.has(`stu-1:${submissionId}`)).toBe(
			true,
		);

		let speakingStatus: StudentPlacementSubmissionView["speakingStatus"] =
			"pending_upload";
		let tokenMintCalls = 0;
		let speakingPutCalls = 0;

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: submissionId,
						speakingStatus,
					}),
					speakingTasks:
						speakingStatus === "pending_upload"
							? SAMPLE_SNAPSHOT.parts[4].tasks
							: null,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				tokenMintCalls += 1;
				return makeJsonResponse({
					uploadToken: "tok-auto-recover",
					uploadTokenExpiresAt: "2026-11-26T02:00:00Z",
				});
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				speakingPutCalls += 1;
				const headers = (init.headers ?? {}) as Record<string, string>;
				expect(headers["X-Upload-Token"]).toBe("tok-auto-recover");
				expect(headers["Content-Type"]).toBe("audio/mp4");
				expect(headers["X-Media-Filename"]).toBe("speaking.m4a");
				speakingStatus = "uploaded";
				return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		render(
			<QueryClientProvider client={createTestQueryClient()}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		const successBanner = await screen.findByTestId(
			"speaking-upload-success-banner",
		);
		expect(successBanner.textContent).toContain(
			"Đã tải lên thành công bản ghi Speaking.",
		);
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Đã gửi bài nói",
		);
		expect(tokenMintCalls).toBe(1);
		expect(speakingPutCalls).toBe(1);
		// Backup deleted from IndexedDB after successful recovery upload
		await waitFor(() => {
			expect(
				mockIdb.stores.get("recordings")?.has(`stu-1:${submissionId}`),
			).toBe(false);
		});
	});

	it("allows re-recording Speaking inline when backup blob is lost without exposing any file upload input", async () => {
		installMockRecorder();

		const submissionId = "sub-lost-blob";
		let speakingStatus: StudentPlacementSubmissionView["speakingStatus"] =
			"pending_upload";
		let tokenMintCalls = 0;
		let speakingPutCalls = 0;

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: submissionId,
						speakingStatus,
					}),
					speakingTasks:
						speakingStatus === "pending_upload"
							? SAMPLE_SNAPSHOT.parts[4].tasks
							: null,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				tokenMintCalls += 1;
				return makeJsonResponse({
					uploadToken: "tok-rerecord-1",
					uploadTokenExpiresAt: "2026-11-26T03:00:00Z",
				});
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${submissionId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				speakingPutCalls += 1;
				speakingStatus = "uploaded";
				return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const { container } = render(
			<QueryClientProvider client={createTestQueryClient()}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		const rerecordBtn = await screen.findByTestId("rerecord-speaking-btn");
		expect(container.querySelector('input[type="file"]')).toBeNull();
		expect(container.textContent).not.toContain(
			"nếu bản ghi vẫn còn trong phiên làm việc",
		);

		// Open inline recovery panel without repeated Phần 5 / 5 header and with zero file inputs
		fireEvent.click(rerecordBtn);
		const recoveryPanel = await screen.findByTestId("speaking-recovery-panel");
		expect(recoveryPanel.textContent).not.toContain("Phần 5 / 5");
		expect(container.querySelector('input[type="file"]')).toBeNull();

		const uploadRecoveredBtn = screen.getByTestId(
			"upload-recovered-speaking-btn",
		) as HTMLButtonElement;
		expect(uploadRecoveredBtn.disabled).toBe(true);

		await completeSingleSpeakingTaskRecording();
		await waitFor(() => {
			expect(
				(
					screen.getByTestId(
						"upload-recovered-speaking-btn",
					) as HTMLButtonElement
				).disabled,
			).toBe(false);
		});

		fireEvent.click(screen.getByTestId("upload-recovered-speaking-btn"));

		const successBanner = await screen.findByTestId(
			"speaking-upload-success-banner",
		);
		expect(successBanner.textContent).toContain(
			"Đã tải lên thành công bản ghi Speaking.",
		);
		expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
			"Đã gửi bài nói",
		);
		expect(screen.queryByTestId("speaking-recovery-panel")).toBeNull();
		expect(tokenMintCalls).toBe(1);
		expect(speakingPutCalls).toBe(1);
	});

	it("renders in-app browser guidance when navigator.userAgent indicates Zalo or Facebook WebView", async () => {
		const { PlacementSpeakingStep } = await import(
			"@/components/placement/placement-speaking-step"
		);
		const { PlacementPendingResultView } = await import(
			"@/components/placement/placement-result-views"
		);

		Object.defineProperty(window.navigator, "userAgent", {
			configurable: true,
			value:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Zalo/24.04",
		});

		render(
			<PlacementSpeakingStep
				tasks={SAMPLE_SNAPSHOT.parts[4].tasks}
				recordedAudio={null}
				onRecordedAudioChange={vi.fn()}
				onBusyChange={vi.fn()}
			/>,
		);
		expect(
			screen.getByTestId("speaking-in-app-browser-hint").textContent,
		).toContain("Safari / Chrome");

		cleanup();

		Object.defineProperty(window.navigator, "userAgent", {
			configurable: true,
			value:
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
		});

		render(
			<PlacementPendingResultView
				submission={createPendingSubmissionFixture({
					speakingStatus: "pending_upload",
				})}
				recoverySpeakingTasks={SAMPLE_SNAPSHOT.parts[4].tasks}
				onUploadRecoveredSpeaking={vi.fn(async () => ({ ok: true }))}
			/>,
		);
		expect(
			screen.getByTestId("speaking-in-app-browser-hint").textContent,
		).toContain("Safari / Chrome");
	});

	it("supports WebKit callback-based decodeAudioData and detects MP4 magic bytes during audio merger fallback", async () => {
		const { mergeSpeakingAudioSegments } = await import(
			"@/lib/speaking-audio-merger"
		);

		// 1. Legacy WebKit callback-only decodeAudioData (returns undefined)
		class WebKitCallbackAudioContext {
			decodeAudioData(
				_buf: ArrayBuffer,
				onSuccess: (decoded: AudioBuffer) => void,
			) {
				queueMicrotask(() => {
					onSuccess({
						sampleRate: 16_000,
						numberOfChannels: 1,
						length: 16_000,
						getChannelData: () => new Float32Array(16_000).fill(0.1),
					} as unknown as AudioBuffer);
				});
			}
			async close() {}
		}
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: WebKitCallbackAudioContext,
		});

		const mp4RawBlob = new Blob([makeMp4FtypBytes()]);
		const decodedWav = await mergeSpeakingAudioSegments([
			{ blob: mp4RawBlob, durationMs: 1_000 },
		]);
		expect(decodedWav.mimeType).toBe("audio/wav");
		expect(decodedWav.blob.size).toBe(44 + 16_000 * 2);

		// 2. Fallback when decodeAudioData fails via callback -> detects audio/mp4 from ftyp bytes even with empty or wrong blob.type
		class WebKitFailingCallbackAudioContext {
			decodeAudioData(
				_buf: ArrayBuffer,
				_onSuccess: (decoded: AudioBuffer) => void,
				onError?: (err: unknown) => void,
			) {
				queueMicrotask(() => {
					onError?.(new Error("WebKit decode error"));
				});
			}
			async close() {}
		}
		Object.defineProperty(window, "AudioContext", {
			configurable: true,
			writable: true,
			value: WebKitFailingCallbackAudioContext,
		});

		const singleMp4Fallback = await mergeSpeakingAudioSegments([
			{ blob: new Blob([makeMp4FtypBytes()]), durationMs: 2_000 },
		]);
		expect(singleMp4Fallback.mimeType).toBe("audio/mp4");

		const mislabelledMp4Fallback = await mergeSpeakingAudioSegments([
			{
				blob: new Blob([makeMp4FtypBytes()], { type: "audio/webm" }),
				durationMs: 2_000,
			},
			{
				blob: new Blob([makeMp4FtypBytes()], { type: "audio/webm" }),
				durationMs: 3_000,
			},
		]);
		expect(mislabelledMp4Fallback.mimeType).toBe("audio/mp4");
		expect(mislabelledMp4Fallback.blob.type).toBe("audio/mp4");
	});

	it("preserves empty recorder MIME until magic-byte sniffing resolves audio/mp4 on iOS WebKit", async () => {
		const { PlacementSpeakingStep } = await import(
			"@/components/placement/placement-speaking-step"
		);
		installMockRecorder({
			recorderMimeType: "",
			supportedMime: "",
			chunkBytes: makeMp4FtypBytes(),
			chunkType: "",
		});

		const onRecordedAudioChange = vi.fn();
		render(
			<PlacementSpeakingStep
				tasks={SAMPLE_SNAPSHOT.parts[4].tasks}
				recordedAudio={null}
				onRecordedAudioChange={onRecordedAudioChange}
				onBusyChange={vi.fn()}
			/>,
		);

		fireEvent.click(
			screen.getByRole("button", { name: /Bắt đầu làm bài Speaking/i }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Chuẩn bị ngay →" }),
			).toBeTruthy();
		});
		fireEvent.click(screen.getByRole("button", { name: "Chuẩn bị ngay →" }));
		fireEvent.click(screen.getByRole("button", { name: /Trả lời ngay/i }));
		fireEvent.click(
			screen.getByRole("button", { name: "Dừng ghi âm câu hiện tại" }),
		);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
			).toBeTruthy();
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Hoàn thành phần Speaking" }),
		);

		await waitFor(() => {
			expect(onRecordedAudioChange).toHaveBeenCalledTimes(1);
		});
		const recorded = onRecordedAudioChange.mock.calls[0]?.[0];
		expect(recorded?.mimeType).toBe("audio/mp4");
	});

	it("keeps manual retry and re-record options visible if IndexedDB auto-recovery fails and clears backup cleanly on 409 already settled", async () => {
		const { saveStudentSpeakingBackup } = await import(
			"@/lib/placement-speaking-backup"
		);

		const mockIdb = createInMemoryIdbFactory();
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: mockIdb.factory,
		});

		// Case 1: auto-recovery fails with 415 -> keeps retry + re-record buttons visible
		const failSubId = "sub-auto-fail";
		await saveStudentSpeakingBackup({
			studentId: "stu-1",
			submissionId: failSubId,
			blob: new Blob([makeMp4FtypBytes()], { type: "audio/mp4" }),
			mimeType: "audio/mp4",
			durationSec: 11,
		});

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: failSubId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: failSubId,
						speakingStatus: "pending_upload",
					}),
					speakingTasks: SAMPLE_SNAPSHOT.parts[4].tasks,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${failSubId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				return makeJsonResponse({
					uploadToken: "tok-fail-1",
					uploadTokenExpiresAt: "2026-11-26T03:00:00Z",
				});
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${failSubId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				return makeJsonResponse(
					{ message: "Định dạng âm thanh không hợp lệ" },
					415,
				);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		render(
			<QueryClientProvider client={createTestQueryClient()}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		expect(await screen.findByTestId("retry-speaking-upload-btn")).toBeTruthy();
		expect(screen.getByTestId("rerecord-speaking-btn")).toBeTruthy();
		expect(screen.getByText(/Định dạng âm thanh không hợp lệ/)).toBeTruthy();

		cleanup();

		// Case 2: token mint returns 409 SPEAKING_UPLOAD_NOT_PENDING -> clears backup and refreshes cleanly
		const settledSubId = "sub-already-settled";
		await saveStudentSpeakingBackup({
			studentId: "stu-1",
			submissionId: settledSubId,
			blob: new Blob([makeMp4FtypBytes()], { type: "audio/mp4" }),
			mimeType: "audio/mp4",
			durationSec: 9,
		});

		let viewCalls = 0;
		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				viewCalls += 1;
				const view: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: settledSubId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: settledSubId,
						speakingStatus: viewCalls === 1 ? "pending_upload" : "uploaded",
					}),
					speakingTasks:
						viewCalls === 1 ? SAMPLE_SNAPSHOT.parts[4].tasks : null,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${settledSubId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				return makeJsonResponse(
					{
						error: "SPEAKING_UPLOAD_NOT_PENDING",
						code: "SPEAKING_UPLOAD_NOT_PENDING",
					},
					409,
				);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		render(
			<QueryClientProvider client={createTestQueryClient()}>
				<StudentPlacementTestContent studentId="stu-1" />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
				"Đã gửi bài nói",
			);
		});
		expect(mockIdb.stores.get("recordings")?.has(`stu-1:${settledSubId}`)).toBe(
			false,
		);
	});

	it("ignores rapid double-click on Upload Recovered Speaking button without cancelling loading state or showing fake error", async () => {
		const { PlacementPendingResultView } = await import(
			"@/components/placement/placement-result-views"
		);

		installMockRecorder({
			recorderMimeType: "audio/mp4",
			supportedMime: "audio/mp4",
			chunkBytes: makeMp4FtypBytes(),
		});

		const deferred: {
			resolve?: (res: { ok: boolean; errorMessage?: string }) => void;
		} = {};
		const onUploadRecovered = vi.fn(
			() =>
				new Promise<{ ok: boolean; errorMessage?: string }>((resolve) => {
					deferred.resolve = resolve;
				}),
		);

		render(
			<PlacementPendingResultView
				submission={createPendingSubmissionFixture({
					speakingStatus: "pending_upload",
				})}
				recoverySpeakingTasks={SAMPLE_SNAPSHOT.parts[4].tasks}
				onUploadRecoveredSpeaking={onUploadRecovered}
			/>,
		);

		fireEvent.click(screen.getByTestId("rerecord-speaking-btn"));
		await completeSingleSpeakingTaskRecording();

		const uploadBtn = await screen.findByTestId(
			"upload-recovered-speaking-btn",
		);
		await waitFor(() => {
			expect((uploadBtn as HTMLButtonElement).disabled).toBe(false);
		});

		// Fire two synchronous clicks before React flushes disabled state
		fireEvent.click(uploadBtn);
		fireEvent.click(uploadBtn);

		expect(onUploadRecovered).toHaveBeenCalledTimes(1);
		expect(
			screen.getByText(/Đang tải bản ghi Speaking lên máy chủ/i),
		).toBeTruthy();
		expect(
			screen.queryByText(/Đang có tiến trình tải Speaking khác/i),
		).toBeNull();

		deferred.resolve?.({ ok: true });
		await waitFor(() => {
			expect(
				screen.queryByText(/Đang tải bản ghi Speaking lên máy chủ/i),
			).toBeNull();
		});
	});

	it("rejects corrupted non-Blob records in IndexedDB backup and resets state cleanly on studentId/org switch", async () => {
		const mockIdb = createInMemoryIdbFactory();
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: mockIdb.factory,
		});
		const { loadStudentSpeakingBackup } = await import(
			"@/lib/placement-speaking-backup"
		);

		// 1. Corrupt non-Blob object in IndexedDB must be rejected and auto-deleted
		mockIdb.stores.set(
			"recordings",
			new Map([
				[
					"stu-1:sub-corrupt",
					{
						key: "stu-1:sub-corrupt",
						studentId: "stu-1",
						submissionId: "sub-corrupt",
						blob: { size: 256 },
						mimeType: "audio/mp4",
						durationSec: 10,
						savedAt: Date.now(),
						expiresAt: Date.now() + 60_000,
					},
				],
			]),
		);
		const corrupt = await loadStudentSpeakingBackup("stu-1", "sub-corrupt");
		expect(corrupt).toBeNull();
		expect(mockIdb.stores.get("recordings")?.has("stu-1:sub-corrupt")).toBe(
			false,
		);

		// 2. Switching studentId via key remount prevents Org A state from leaking into Org B
		const queryClient = createTestQueryClient();
		let activeOrg = "org-a";
		globalThis.fetch = vi.fn(async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				if (activeOrg === "org-a") {
					const orgAView: StudentPlacementViewResponse = {
						status: "pending_grading",
						hasEntryScore: false,
						entryScore: null,
						promptDismissedAt: null,
						submissionId: "sub-org-a",
						testAvailable: true,
						testVersion: 3,
						snapshot: null,
						submission: createPendingSubmissionFixture({
							id: "sub-org-a",
							speakingStatus: "uploaded",
						}),
						speakingTasks: null,
					};
					return makeJsonResponse(orgAView);
				}
				const orgBView: StudentPlacementViewResponse = {
					status: "not_started",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: null,
					testAvailable: true,
					testVersion: 3,
					snapshot: SAMPLE_SNAPSHOT,
					submission: null,
					speakingTasks: null,
				};
				return makeJsonResponse(orgBView);
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent key="stu-org-a" studentId="stu-org-a" />
			</QueryClientProvider>,
		);
		expect(await screen.findByTestId("placement-pending-view")).toBeTruthy();

		activeOrg = "org-b";
		await queryClient.invalidateQueries();
		rerender(
			<QueryClientProvider client={queryClient}>
				<StudentPlacementTestContent key="stu-org-b" studentId="stu-org-b" />
			</QueryClientProvider>,
		);
		expect(await screen.findByTestId("placement-intro-card")).toBeTruthy();
		expect(screen.queryByTestId("placement-pending-view")).toBeNull();
	});

	it("survives initial active_student_org_id hydration (null -> orgId) mid-recovery and isolates in-flight multi-org view caches", async () => {
		const { clearActiveStudentOrgId, setActiveStudentOrgId } = await import(
			"@/lib/student-org-storage"
		);
		const { saveStudentSpeakingBackup } = await import(
			"@/lib/placement-speaking-backup"
		);

		const mockIdb = createInMemoryIdbFactory();
		Object.defineProperty(globalThis, "indexedDB", {
			configurable: true,
			writable: true,
			value: mockIdb.factory,
		});

		// Case A: fresh login (active_student_org_id starts null), hydrates to "org-a" mid-PUT -> must NOT abort finalization!
		clearActiveStudentOrgId();
		const hydrateSubId = "sub-hydrate-1";
		await saveStudentSpeakingBackup({
			studentId: "stu-org-a",
			submissionId: hydrateSubId,
			blob: new Blob([makeMp4FtypBytes()], { type: "audio/mp4" }),
			mimeType: "audio/mp4",
			durationSec: 12,
		});

		const sentOrgHeaders: Array<string | null> = [];
		let putCount = 0;
		globalThis.fetch = vi.fn(async (input, init) => {
			const url = typeof input === "string" ? input : input.toString();
			const headers = new Headers(init?.headers);
			sentOrgHeaders.push(headers.get("x-student-org-id"));
			if (url.endsWith("/api/student/placement-test")) {
				const view: StudentPlacementViewResponse = {
					status: "pending_grading",
					hasEntryScore: false,
					entryScore: null,
					promptDismissedAt: null,
					submissionId: hydrateSubId,
					testAvailable: true,
					testVersion: 3,
					snapshot: null,
					submission: createPendingSubmissionFixture({
						id: hydrateSubId,
						speakingStatus: putCount > 0 ? "uploaded" : "pending_upload",
					}),
					speakingTasks: putCount > 0 ? null : SAMPLE_SNAPSHOT.parts[4].tasks,
				};
				return makeJsonResponse(view);
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${hydrateSubId}/speaking-upload-token`,
				) &&
				init?.method === "POST"
			) {
				// Simulate org-switcher hydrating localStorage from null -> "org-a" mid-flight!
				setActiveStudentOrgId("org-a");
				return makeJsonResponse({
					uploadToken: "tok-hydrate-1",
					uploadTokenExpiresAt: "2026-11-26T03:00:00Z",
				});
			}
			if (
				url.endsWith(
					`/api/student/placement-test/submissions/${hydrateSubId}/speaking`,
				) &&
				init?.method === "PUT"
			) {
				putCount += 1;
				return makeJsonResponse({ ok: true, speakingStatus: "uploaded" });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		const sharedQueryClient = createTestQueryClient();
		const { rerender } = render(
			<QueryClientProvider client={sharedQueryClient}>
				<StudentPlacementTestContent
					key="org-a:stu-org-a"
					studentId="stu-org-a"
					orgId="org-a"
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("pending-speaking-status").textContent).toBe(
				"Đã gửi bài nói",
			);
		});
		expect(putCount).toBe(1);
		expect(
			mockIdb.stores.get("recordings")?.has(`stu-org-a:${hydrateSubId}`),
		).toBe(false);
		expect(sentOrgHeaders.every((h) => h === "org-a")).toBe(true);

		// Case B: switch to Org B while Org B's GET /placement-test is STILL IN-FLIGHT (without awaiting invalidate) -> must NOT render Org A's cached view!
		setActiveStudentOrgId("org-b");
		const orgBDeferred: { resolve?: (res: Response) => void } = {};
		globalThis.fetch = vi.fn(async (input) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.endsWith("/api/student/placement-test")) {
				return new Promise<Response>((resolve) => {
					orgBDeferred.resolve = resolve;
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});

		rerender(
			<QueryClientProvider client={sharedQueryClient}>
				<StudentPlacementTestContent
					key="org-b:stu-org-b"
					studentId="stu-org-b"
					orgId="org-b"
				/>
			</QueryClientProvider>,
		);

		// While Org B fetch is pending, Org A's pending view must NOT leak onto screen
		expect(screen.queryByTestId("placement-pending-view")).toBeNull();
		expect(screen.queryByTestId("placement-intro-card")).toBeNull();

		const orgBView: StudentPlacementViewResponse = {
			status: "not_started",
			hasEntryScore: false,
			entryScore: null,
			promptDismissedAt: null,
			submissionId: null,
			testAvailable: true,
			testVersion: 3,
			snapshot: SAMPLE_SNAPSHOT,
			submission: null,
			speakingTasks: null,
		};
		orgBDeferred.resolve?.(makeJsonResponse(orgBView));
		expect(await screen.findByTestId("placement-intro-card")).toBeTruthy();
		expect(screen.queryByTestId("placement-pending-view")).toBeNull();
		clearActiveStudentOrgId();
	});
});
