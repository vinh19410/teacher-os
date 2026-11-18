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
						writingErrors: [],
						speakingStatus: "pending_upload",
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
				writingText: "I go to school yesterday.",
				writingWordCount: 5,
				writingRubric: { task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
				writingScore: 6.5,
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
				speakingRubric: {
					fluency: 7,
					lexical: 6.5,
					grammar: 6,
					pronunciation: 7,
				},
				speakingScore: 6.5,
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

		const writingSection = screen.getByTestId("graded-writing-section");
		expect(writingSection.textContent).toContain("Band 6.5/9");
		expect(writingSection.textContent).toContain("Task Response");
		expect(writingSection.textContent).toContain("6.5/9");
		expect(writingSection.textContent).toContain("6.0/9");

		const speakingSection = screen.getByTestId("graded-speaking-section");
		expect(speakingSection.textContent).toContain("Band 6.5/9");
		expect(speakingSection.textContent).toContain("Fluency & Coherence");
		expect(speakingSection.textContent).toContain("7.0/9");
		expect(speakingSection.textContent).toContain("6.5/9");

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

	it("renders legacy graded result view with /15 and /20 fallback", async () => {
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
			writingErrors: [],
			speakingStatus: "uploaded",
			speakingTranscript: "Hi",
			speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 5 },
			speakingScore: 17,
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

		const speakingSection = screen.getByTestId("graded-speaking-section");
		expect(speakingSection.textContent).toContain("17/20 điểm");
		expect(speakingSection.textContent).toContain("Grammar & Vocabulary");
		expect(speakingSection.textContent).toContain("5/5");
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
