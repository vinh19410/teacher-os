// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseCatalogResponse } from "@teacher-os/api/course-contracts";
import type {
	PlacementError,
	PlacementPublishedBand,
	PlacementSubmissionDetail,
} from "@teacher-os/api/placement-test-contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const reauthMock = vi.hoisted(() => vi.fn());
const exportPdfMock = vi.hoisted(() =>
	vi.fn<(submission: PlacementSubmissionDetail) => Promise<void>>(),
);
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));
vi.mock("@/lib/placement-result-pdf", () => ({
	exportPlacementResultPdf: (submission: PlacementSubmissionDetail) =>
		exportPdfMock(submission),
}));

import {
	initialPlacementGrading,
	PLACEMENT_AI_POLL_MS,
	PlacementSubmissionPanel,
} from "./placement-submission-panel";

const clipboardWriteMock = vi.fn(async () => {});

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: clipboardWriteMock },
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	exportPdfMock.mockReset();
	clipboardWriteMock.mockClear();
});

const WRITING = "Hello Sarah, I goes to school yesterday.";
const TRANSCRIPT = "I like play football with my friend.";

function err(
	id: string,
	quote: string,
	overrides: Partial<PlacementError> = {},
): PlacementError {
	return {
		id,
		category: "grammar",
		quote,
		start: null,
		end: null,
		correction: "",
		explanation: "",
		...overrides,
	};
}

const BAND: PlacementPublishedBand = {
	min: 0,
	max: 100,
	cefr: "B1",
	course: "comm-2",
	courseLabel: "Giao tiếp 2",
	displayCourse: "Giao tiếp 2",
	advice: "",
};

function makeSub(
	overrides: Partial<PlacementSubmissionDetail> = {},
): PlacementSubmissionDetail {
	return {
		id: "sub-1",
		leadId: "lead-1",
		studentName: "Nguyễn Thu Hà",
		studentPhone: "0909123456",
		testVersion: 2,
		status: "pending_grading",
		submittedAt: "2026-11-14T10:00:00.000Z",
		snapshot: {
			version: 2,
			bands: [BAND],
			parts: [
				{ id: "listening", title: "Listening", clips: [] },
				{ id: "vocab-grammar", title: "G&V", questions: [] },
				{ id: "reading", title: "Reading", passages: [] },
				{
					id: "writing",
					title: "Writing",
					promptTitle: "Email",
					promptBody: "Write",
					minWords: 50,
					maxWords: 80,
				},
				{ id: "speaking", title: "Speaking", tasks: [] },
			],
		},
		answers: { listening: {}, vocabGrammar: {}, reading: {} },
		objective: {
			listening: { correct: 8, total: 10, pct: 80 },
			vocabGrammar: { correct: 6, total: 10, pct: 60 },
			reading: { correct: 7, total: 10, pct: 70 },
			totalCorrect: 21,
			totalQuestions: 30,
			averagePct: 70,
			byLevel: [],
			items: [],
			provisionalBand: BAND,
			provisionalSummary: "Tạm tính B1",
		},
		writingText: WRITING,
		writingWordCount: 7,
		speakingStatus: "uploaded",
		speakingMediaUrl: null,
		speakingMediaMime: "audio/webm",
		speakingMediaSize: 100,
		speakingDurationSec: 30,
		writingRubric: null,
		writingScore: null,
		writingCriterionComments: null,
		speakingRubric: null,
		speakingScore: null,
		speakingCriterionComments: null,
		teacherFeedback: "",
		finalBandLevel: null,
		finalCourseId: null,
		finalCourse: null,
		finalDisplayCourse: null,
		finalScorePct: null,
		finalNote: "",
		gradedAt: null,
		zaloText: "",
		aiStatus: "none",
		aiErrorCode: null,
		aiDraftedAt: null,
		aiWriting: null,
		aiSpeaking: null,
		speakingTranscript: "",
		writingErrors: null,
		speakingErrors: null,
		resultUrl: null,
		resultEmailStatus: null,
		...overrides,
	};
}

const DRAFTED = makeSub({
	aiStatus: "drafted",
	aiDraftedAt: "2026-11-15T09:00:00.000Z",
	speakingTranscript: TRANSCRIPT,
	aiWriting: {
		errors: [err("w1", "goes", { correction: "went" })],
	},
	aiSpeaking: {
		errors: [
			err("s1", "like play", {
				correction: "like playing",
				explanation: "like + V-ing",
			}),
			err("s2", "friend", { category: "pronunciation" }),
		],
	},
});

const ACTIVE_COURSES: CourseCatalogResponse = {
	categories: [
		{
			id: "cat-comm",
			name: "Giao Tiếp",
			sortOrder: 0,
			isActive: true,
			createdAt: "2026-11-01T00:00:00.000Z",
			updatedAt: "2026-11-01T00:00:00.000Z",
			courses: [
				{
					id: "course-comm-1",
					categoryId: "cat-comm",
					name: "Communication English Level 1",
					sortOrder: 0,
					isActive: true,
					createdAt: "2026-11-01T00:00:00.000Z",
					updatedAt: "2026-11-01T00:00:00.000Z",
				},
				{
					id: "course-comm-2",
					categoryId: "cat-comm",
					name: "Communication English Level 2",
					sortOrder: 1,
					isActive: true,
					createdAt: "2026-11-01T00:00:00.000Z",
					updatedAt: "2026-11-01T00:00:00.000Z",
				},
			],
		},
		{
			id: "cat-ielts",
			name: "IELTS",
			sortOrder: 1,
			isActive: true,
			createdAt: "2026-11-01T00:00:00.000Z",
			updatedAt: "2026-11-01T00:00:00.000Z",
			courses: [
				{
					id: "course-ielts-1",
					categoryId: "cat-ielts",
					name: "Foundation",
					sortOrder: 0,
					isActive: true,
					createdAt: "2026-11-01T00:00:00.000Z",
					updatedAt: "2026-11-01T00:00:00.000Z",
				},
				{
					id: "course-ielts-2",
					categoryId: "cat-ielts",
					name: "Pre IELTS",
					sortOrder: 1,
					isActive: true,
					createdAt: "2026-11-01T00:00:00.000Z",
					updatedAt: "2026-11-01T00:00:00.000Z",
				},
			],
		},
	],
};

type Handler = (
	url: string,
	method: string,
	body: unknown,
) => PlacementSubmissionDetail | CourseCatalogResponse | Response | undefined;

function stubFetch(handler: Handler) {
	const calls: Array<{
		url: string;
		method: string;
		body: unknown;
		headers: Headers;
	}> = [];
	const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ url, method, body, headers: new Headers(init?.headers) });
		const data = handler(url, method, body);
		if (data instanceof Response) return Promise.resolve(data);
		if (data) {
			return Promise.resolve(
				new Response(JSON.stringify(data), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		if (url.includes("/api/courses?activeOnly=true") && method === "GET") {
			return Promise.resolve(
				new Response(JSON.stringify(ACTIVE_COURSES), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		}
		return Promise.resolve(new Response("not found", { status: 404 }));
	});
	vi.stubGlobal("fetch", fetchMock);
	return calls;
}

function renderPanel() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<PlacementSubmissionPanel leadId="lead-1" />
		</QueryClientProvider>,
	);
}

const isGet = (url: string, method: string) =>
	url.endsWith("/placement-submission") && method === "GET";

describe("initialPlacementGrading", () => {
	it("chưa chốt + có nháp AI → chỉ lấy lỗi từ AI (định vị offset), điểm IELTS khởi tạo rỗng", () => {
		const init = initialPlacementGrading(DRAFTED);
		expect(init.writingRubric).toEqual({
			task: null,
			coherence: null,
			lexical: null,
			grammar: null,
		});
		expect(init.writingScore).toBeNull();
		expect(init.writingCriterionComments).toEqual({
			task: "",
			coherence: "",
			lexical: "",
			grammar: "",
		});
		expect(init.speakingRubric).toEqual({
			fluency: null,
			lexical: null,
			grammar: null,
			pronunciation: null,
		});
		expect(init.speakingScore).toBeNull();
		expect(init.speakingCriterionComments).toEqual({
			fluency: "",
			lexical: "",
			grammar: "",
			pronunciation: "",
		});
		expect(init.writingErrors[0]).toMatchObject({
			id: "w1",
			start: WRITING.indexOf("goes"),
		});
		expect(init.speakingErrors.map((e) => e.id)).toEqual(["s1", "s2"]);
	});

	it("đã chốt theo IELTS → prefill 4 tiêu chí + điểm tổng và lỗi đã lưu, bỏ qua nháp AI", () => {
		const init = initialPlacementGrading({
			...DRAFTED,
			gradedAt: "2026-11-15T10:00:00.000Z",
			writingRubric: { task: 6, coherence: 6.5, lexical: 6, grammar: 5.5 },
			writingScore: 6.5,
			writingCriterionComments: {
				task: "Trả lời đủ ý.",
				coherence: "",
				lexical: "Từ vựng khá.",
				grammar: "",
			},
			speakingRubric: {
				fluency: 7,
				lexical: 6.5,
				grammar: 6,
				pronunciation: 7,
			},
			speakingScore: 6.5,
			speakingCriterionComments: {
				fluency: "Nói tự nhiên.",
				lexical: "",
				grammar: "",
				pronunciation: "Rõ âm cuối.",
			},
			writingErrors: [],
			speakingErrors: [err("s9", "football")],
		});
		expect(init.writingRubric).toEqual({
			task: 6,
			coherence: 6.5,
			lexical: 6,
			grammar: 5.5,
		});
		expect(init.writingScore).toBe(6.5);
		expect(init.writingCriterionComments).toEqual({
			task: "Trả lời đủ ý.",
			coherence: "",
			lexical: "Từ vựng khá.",
			grammar: "",
		});
		expect(init.speakingRubric).toEqual({
			fluency: 7,
			lexical: 6.5,
			grammar: 6,
			pronunciation: 7,
		});
		expect(init.speakingScore).toBe(6.5);
		expect(init.speakingCriterionComments).toEqual({
			fluency: "Nói tự nhiên.",
			lexical: "",
			grammar: "",
			pronunciation: "Rõ âm cuối.",
		});
		expect(init.writingErrors).toEqual([]);
		expect(init.speakingErrors.map((e) => e.id)).toEqual(["s9"]);
		expect(init.includeSpeaking).toBe(true);
	});

	it("đã chốt theo thang cũ (legacy) → khởi tạo input IELTS rỗng để giáo viên nhập mới", () => {
		const init = initialPlacementGrading({
			...DRAFTED,
			gradedAt: "2026-11-15T10:00:00.000Z",
			writingRubric: { ct: 5, or: 5, lg: 5 },
			writingScore: 15,
			speakingRubric: { gv: 3, dm: 3, pr: 3, ic: 3 },
			speakingScore: 12,
			writingErrors: [],
			speakingErrors: [],
		});
		expect(init.writingRubric).toEqual({
			task: null,
			coherence: null,
			lexical: null,
			grammar: null,
		});
		expect(init.writingScore).toBeNull();
		expect(init.writingCriterionComments).toEqual({
			task: "",
			coherence: "",
			lexical: "",
			grammar: "",
		});
		expect(init.speakingRubric).toEqual({
			fluency: null,
			lexical: null,
			grammar: null,
			pronunciation: null,
		});
		expect(init.speakingScore).toBeNull();
		expect(init.speakingCriterionComments).toEqual({
			fluency: "",
			lexical: "",
			grammar: "",
			pronunciation: "",
		});
		expect(init.includeSpeaking).toBe(true);
	});
});

function setBandInput(testId: string, value: string) {
	fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe("PlacementSubmissionPanel — phân tích lỗi AI & chấm IELTS (#730, #800)", () => {
	it("processing → banner 'AI đang phân tích lỗi…' và poll đến khi có danh sách lỗi AI (không điền điểm)", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let gets = 0;
		stubFetch((url, method) => {
			if (!isGet(url, method)) return undefined;
			gets++;
			return gets === 1 ? makeSub({ aiStatus: "processing" }) : DRAFTED;
		});
		renderPanel();

		const status = await screen.findByTestId("placement-ai-status");
		expect(status.dataset.aiStatus).toBe("processing");
		expect(status.textContent).toContain("AI đang phân tích lỗi…");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS + 50);
		});
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-status").dataset.aiStatus).toBe(
				"drafted",
			),
		);
		expect(gets).toBe(2);
		// Lỗi AI về → highlight hiện, nhưng điểm IELTS vẫn rỗng & nút chốt khóa.
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);
		expect(
			(screen.getByTestId("writing-task-input") as HTMLInputElement).value,
		).toBe("");
		expect(
			(screen.getByTestId("writing-overall-input") as HTMLInputElement).value,
		).toBe("");
		expect(
			(screen.getByTestId("save-placement-grade-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);

		// Hết processing → không poll nữa.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS * 2);
		});
		expect(gets).toBe(2);
	});

	it("failed → thông báo theo mã lỗi + nút 'Phân tích lại bằng AI' gọi POST ai-retry", async () => {
		let server = makeSub({
			aiStatus: "failed",
			aiErrorCode: "AI_GRADING_TIMEOUT",
		});
		const calls = stubFetch((url, method) => {
			if (isGet(url, method)) return server;
			if (url.endsWith("/placement-submission/ai-retry") && method === "POST") {
				server = makeSub({ aiStatus: "processing" });
				return server;
			}
			return undefined;
		});
		renderPanel();

		const status = await screen.findByTestId("placement-ai-status");
		expect(status.dataset.aiStatus).toBe("failed");
		expect(status.textContent).toContain("quá thời gian chờ");

		fireEvent.click(screen.getByTestId("placement-ai-retry-btn"));
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-status").dataset.aiStatus).toBe(
				"processing",
			),
		);
		const retryCall = calls.find(
			(c) => c.method === "POST" && c.url.endsWith("/ai-retry"),
		);
		expect(retryCall?.headers.get("content-type")).toBe("application/json");
		expect(retryCall?.body).toEqual({});
		expect(toastMock.success).toHaveBeenCalled();
	});

	it("aiStatus none, không có bài để chấm → giữ UI chấm tay, không banner, không highlight, nút lưu khóa tới khi nhập đủ", async () => {
		stubFetch((url, method) =>
			isGet(url, method)
				? makeSub({ writingText: "", speakingStatus: "skipped" })
				: undefined,
		);
		renderPanel();
		await screen.findByTestId("placement-submission-panel");
		expect(screen.queryByTestId("placement-ai-status")).toBeNull();
		expect(screen.queryAllByTestId("writing-error-mark")).toHaveLength(0);
		expect(
			(screen.getByTestId("writing-task-input") as HTMLInputElement).value,
		).toBe("");
		expect(
			(screen.getByTestId("save-placement-grade-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(screen.getByTestId("save-placement-grade-hint")).toBeTruthy();
	});

	it("aiStatus none + có bài viết (upload bỏ ngang) → nút 'Phân tích lỗi bằng AI'; server 503 → toast chưa bật", async () => {
		const calls = stubFetch((url, method) => {
			if (isGet(url, method)) {
				return makeSub({ speakingStatus: "pending_upload" });
			}
			if (url.endsWith("/ai-retry") && method === "POST") {
				return Response.json(
					{ error: "AI_GRADING_DISABLED", code: "AI_GRADING_DISABLED" },
					{ status: 503 },
				);
			}
			return undefined;
		});
		renderPanel();
		const status = await screen.findByTestId("placement-ai-status");
		expect(status.dataset.aiStatus).toBe("none");
		const button = screen.getByTestId("placement-ai-retry-btn");
		expect(button.textContent).toContain("Phân tích lỗi bằng AI");
		fireEvent.click(button);
		await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
		expect(String(toastMock.error.mock.calls[0]?.[0])).toContain(
			"Phân tích lỗi AI chưa được bật",
		);
		expect(calls.filter((c) => c.url.endsWith("/ai-retry"))).toHaveLength(1);
	});

	it("kết quả đã chốt → ẩn nút phân tích lại bằng AI", async () => {
		stubFetch((url, method) =>
			isGet(url, method)
				? {
						...DRAFTED,
						status: "graded",
						gradedAt: "2026-11-15T10:00:00.000Z",
						writingRubric: {
							task: 6,
							coherence: 6,
							lexical: 6,
							grammar: 6,
						},
						writingScore: 6,
						speakingRubric: {
							fluency: 6.5,
							lexical: 6.5,
							grammar: 6,
							pronunciation: 6.5,
						},
						speakingScore: 6.5,
						writingErrors: [],
						speakingErrors: [],
						resultUrl: "https://example.test/r",
					}
				: undefined,
		);
		renderPanel();
		const status = await screen.findByTestId("placement-ai-status");
		expect(status.dataset.aiStatus).toBe("drafted");
		expect(screen.queryByTestId("placement-ai-retry-btn")).toBeNull();
	});

	it("danh sách lỗi AI mới về khi form đang sửa → không ghi đè điểm hay nhận xét, 'Áp dụng lỗi AI' chỉ cập nhật lỗi", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let server = makeSub({ aiStatus: "processing" });
		stubFetch((url, method) => (isGet(url, method) ? server : undefined));
		renderPanel();
		await screen.findByTestId("placement-ai-status");

		// Giáo viên nhập điểm IELTS và nhận xét tay trong lúc AI đang chạy.
		setBandInput("writing-task-input", "6.5");
		const feedback = screen.getByLabelText(
			"Nhận xét bài kiểm tra đầu vào",
		) as HTMLTextAreaElement;
		fireEvent.change(feedback, { target: { value: "Nhận xét tay." } });

		server = DRAFTED;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS + 50);
		});
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-status").dataset.aiStatus).toBe(
				"drafted",
			),
		);
		expect(
			(screen.getByTestId("writing-task-input") as HTMLInputElement).value,
		).toBe("6.5");
		expect(feedback.value).toBe("Nhận xét tay.");
		expect(screen.queryAllByTestId("writing-error-mark")).toHaveLength(0);

		fireEvent.click(screen.getByTestId("placement-ai-apply-draft-btn"));
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);
		expect(
			(screen.getByTestId("writing-task-input") as HTMLInputElement).value,
		).toBe("6.5");
		expect(feedback.value).toBe("Nhận xét tay.");
		expect(screen.queryByTestId("placement-ai-apply-draft-btn")).toBeNull();
	});

	it("drafted → không có AiFeedbackNote, tự tính overall từ 4 tiêu chí, cho phép chỉnh tay overall, đồng bộ slider và gửi PATCH IELTS", async () => {
		exportPdfMock.mockResolvedValue(undefined);
		let patchBody: Record<string, unknown> | null = null;
		let server = DRAFTED;
		stubFetch((url, method, body) => {
			if (isGet(url, method)) return server;
			if (url.endsWith("/placement-submission") && method === "PATCH") {
				patchBody = body as Record<string, unknown>;
				server = {
					...DRAFTED,
					status: "graded",
					gradedAt: "2026-11-15T10:00:00.000Z",
					writingRubric: {
						task: 6,
						coherence: 6.5,
						lexical: 6,
						grammar: 6.5,
					},
					writingScore: 7,
					speakingRubric: {
						fluency: 6,
						lexical: 6.5,
						grammar: 6,
						pronunciation: 6.5,
					},
					speakingScore: 6.5,
					finalCourseId: (body as { courseId: string }).courseId,
					finalDisplayCourse: "IELTS - Foundation",
					writingErrors: (body as { writingErrors: PlacementError[] })
						.writingErrors,
					speakingErrors: (body as { speakingErrors: PlacementError[] })
						.speakingErrors,
					resultUrl: "https://example.test/placement-test/results/tok123",
					resultEmailStatus: "failed",
				};
				return server;
			}
			return undefined;
		});
		renderPanel();

		const status = await screen.findByTestId("placement-ai-status");
		expect(status.textContent).toContain(
			"Danh sách lỗi AI — chưa gửi học viên",
		);
		expect(screen.getByTestId("placement-ai-retry-btn")).toBeTruthy();

		// Chưa chốt → không hiện khối PDF hay link kết quả cũ
		expect(screen.queryByTestId("placement-result-pdf")).toBeNull();
		expect(screen.queryByTestId("placement-result-link")).toBeNull();

		// Không còn AiFeedbackNote hay RubricGuideDetails cũ
		expect(screen.queryByTestId("writing-ai-feedback")).toBeNull();
		expect(screen.queryByTestId("speaking-ai-feedback")).toBeNull();
		expect(screen.queryByTestId("writing-rubric-guide")).toBeNull();
		expect(screen.queryByTestId("speaking-rubric-guide")).toBeNull();

		const speakingMarks = screen.getAllByTestId("speaking-error-mark");
		expect(speakingMarks.map((m) => m.textContent)).toEqual([
			"like play",
			"friend",
		]);
		expect(speakingMarks[1]?.getAttribute("aria-label")).toContain(
			"Lỗi 2: Pronunciation",
		);

		const saveBtn = screen.getByTestId(
			"save-placement-grade-btn",
		) as HTMLButtonElement;
		expect(saveBtn.disabled).toBe(true);

		// Nhập đủ 4 tiêu chí Writing: (6 + 6.5 + 6 + 6.5) / 4 = 6.25 -> tự tính 6.5
		setBandInput("writing-task-input", "6");
		setBandInput("writing-coherence-input", "6.5");
		setBandInput("writing-lexical-input", "6");
		setBandInput("writing-grammar-input", "6.5");
		expect(
			(screen.getByTestId("writing-overall-input") as HTMLInputElement).value,
		).toBe("6.5");

		const summary = screen.getByTestId("placement-score-summary");
		expect(summary.textContent).toContain("Writing Band 6.5/9");
		expect(summary.textContent).toContain("Speaking —");

		// Giáo viên chỉnh tay overall Writing thành 7.0 (override)
		setBandInput("writing-overall-input", "7");
		expect(summary.textContent).toContain("Writing Band 7.0/9");

		// Đồng bộ slider Speaking -> input số & tự tính overall Speaking
		const fluencySlider = document.getElementById(
			"speaking-fluency-slider",
		) as HTMLInputElement;
		fireEvent.change(fluencySlider, { target: { value: "6" } });
		expect(
			(screen.getByTestId("speaking-fluency-input") as HTMLInputElement).value,
		).toBe("6.0");

		setBandInput("speaking-lexical-input", "6.5");
		setBandInput("speaking-grammar-input", "6");
		setBandInput("speaking-pronunciation-input", "6.5");
		expect(
			(screen.getByTestId("speaking-overall-input") as HTMLInputElement).value,
		).toBe("6.5");
		expect(summary.textContent).toContain("Speaking Band 6.5/9");

		// Đủ điểm Writing & Speaking nhưng chưa chọn khóa đề xuất -> nút chốt vẫn khóa + hiện gợi ý
		expect(saveBtn.disabled).toBe(true);
		expect(screen.getByTestId("save-placement-grade-hint").textContent).toBe(
			"Chọn khóa học đề xuất để chốt kết quả.",
		);
		expect(screen.getByTestId("selected-course-preview").textContent).toBe(
			"Chưa chọn khóa đề xuất",
		);

		// Chọn khóa IELTS - Foundation -> mở khóa nút chốt, cập nhật preview & Zalo text
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.change(courseSelect, { target: { value: "course-ielts-1" } });

		expect(screen.getByTestId("selected-course-preview").textContent).toBe(
			"IELTS - Foundation",
		);
		expect(saveBtn.disabled).toBe(false);
		expect(screen.queryByTestId("save-placement-grade-hint")).toBeNull();

		// Copy Zalo trước khi chốt phải phản ánh khóa đề xuất đã chọn
		fireEvent.click(screen.getByTestId("copy-zalo-result-btn"));
		await waitFor(() =>
			expect(clipboardWriteMock).toHaveBeenCalledWith(
				expect.stringContaining("IELTS - Foundation"),
			),
		);

		// Nhập nhận xét & xoá lỗi Speaking số 2 rồi chốt.
		fireEvent.change(screen.getByLabelText("Nhận xét bài kiểm tra đầu vào"), {
			target: { value: "Nói khá trôi chảy." },
		});
		fireEvent.click(screen.getAllByLabelText("Xoá lỗi 2")[0] as HTMLElement);
		fireEvent.click(saveBtn);

		await waitFor(() => expect(patchBody).not.toBeNull());
		const sent = patchBody as unknown as {
			writingRubric: unknown;
			writingScore: number;
			writingCriterionComments: unknown;
			speakingRubric: unknown;
			speakingScore: number;
			speakingCriterionComments: unknown;
			courseId: string;
			teacherFeedback: string;
			writingErrors: PlacementError[];
			speakingErrors: PlacementError[];
		};
		expect(sent.writingRubric).toEqual({
			task: 6,
			coherence: 6.5,
			lexical: 6,
			grammar: 6.5,
		});
		expect(sent.writingScore).toBe(7);
		expect(sent.writingCriterionComments).toEqual({
			task: "",
			coherence: "",
			lexical: "",
			grammar: "",
		});
		expect(sent.speakingRubric).toEqual({
			fluency: 6,
			lexical: 6.5,
			grammar: 6,
			pronunciation: 6.5,
		});
		expect(sent.speakingScore).toBe(6.5);
		expect(sent.speakingCriterionComments).toEqual({
			fluency: "",
			lexical: "",
			grammar: "",
			pronunciation: "",
		});
		expect(sent.courseId).toBe("course-ielts-1");
		expect(sent.teacherFeedback).toBe("Nói khá trôi chảy.");
		expect(sent.writingErrors).toEqual([
			{
				...err("w1", "goes", { correction: "went" }),
				start: WRITING.indexOf("goes"),
				end: WRITING.indexOf("goes") + 4,
			},
		]);
		expect(sent.speakingErrors.map((e) => e.id)).toEqual(["s1"]);

		const pdfCard = await screen.findByTestId("placement-result-pdf");
		expect(pdfCard.textContent).toContain("Phiếu kết quả cho học viên (PDF)");
		expect(screen.queryByTestId("placement-result-link")).toBeNull();
		expect(screen.queryByTestId("copy-result-link-btn")).toBeNull();
		expect(
			screen.getByTestId("placement-result-email-status").textContent,
		).toBe("Gửi email kết quả lỗi — hãy tải phiếu PDF gửi qua Zalo.");
		fireEvent.click(screen.getByTestId("export-result-pdf-btn"));
		await waitFor(() => expect(exportPdfMock).toHaveBeenCalledWith(server));
		expect(screen.getByTestId("copy-zalo-result-btn")).toBeTruthy();
	}, 15_000);

	it("chuẩn hóa giá trị nhập số không hợp lệ khi blur và khóa lưu khi xóa trống", async () => {
		stubFetch((url, method) =>
			isGet(url, method) ? makeSub({ speakingStatus: "skipped" }) : undefined,
		);
		renderPanel();
		await screen.findByTestId("placement-submission-panel");

		const taskInput = screen.getByTestId(
			"writing-task-input",
		) as HTMLInputElement;
		fireEvent.focus(taskInput);
		fireEvent.change(taskInput, { target: { value: "6.3" } });
		fireEvent.blur(taskInput);
		expect(taskInput.value).toBe("6.5");

		fireEvent.focus(taskInput);
		fireEvent.change(taskInput, { target: { value: "12" } });
		fireEvent.blur(taskInput);
		expect(taskInput.value).toBe("9.0");

		fireEvent.focus(taskInput);
		fireEvent.change(taskInput, { target: { value: "-1" } });
		fireEvent.blur(taskInput);
		expect(taskInput.value).toBe("0.0");

		setBandInput("writing-coherence-input", "7");
		setBandInput("writing-lexical-input", "7");
		setBandInput("writing-grammar-input", "7");
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.change(courseSelect, { target: { value: "course-comm-1" } });
		const saveBtn = screen.getByTestId(
			"save-placement-grade-btn",
		) as HTMLButtonElement;
		expect(saveBtn.disabled).toBe(false);

		// Xóa trống 1 tiêu chí -> nút lưu khóa lại
		setBandInput("writing-task-input", "");
		expect(saveBtn.disabled).toBe(true);
	});

	it("bài đã chấm thang cũ (legacy) → hiện banner điểm cũ, input IELTS rỗng và copy Zalo giữ nguyên kết quả cũ", async () => {
		const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: clipboardWriteMock },
		});
		const legacyZalo = "Writing: 11/15 (73%)\nSpeaking: 17/20 (85%)";
		stubFetch((url, method) =>
			isGet(url, method)
				? makeSub({
						status: "graded",
						gradedAt: "2026-11-10T10:00:00.000Z",
						writingRubric: { ct: 4, or: 4, lg: 3 },
						writingScore: 11,
						speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 5 },
						speakingScore: 17,
						writingErrors: [],
						speakingErrors: [],
						zaloText: legacyZalo,
					})
				: undefined,
		);
		renderPanel();

		const banner = await screen.findByTestId("legacy-score-banner");
		expect(banner.textContent).toContain("Điểm cũ: Writing 11/15");
		expect(banner.textContent).toContain("Speaking 17/20");
		expect(
			(screen.getByTestId("writing-task-input") as HTMLInputElement).value,
		).toBe("");
		expect(
			(screen.getByTestId("save-placement-grade-btn") as HTMLButtonElement)
				.disabled,
		).toBe(true);

		fireEvent.click(screen.getByTestId("copy-zalo-result-btn"));
		await waitFor(() =>
			expect(clipboardWriteMock).toHaveBeenCalledWith(legacyZalo),
		);
	});

	it("student subject → tải từ /api/students/:id/placement-submission, fallback media URL, retry AI & gọi onGraded khi PATCH", async () => {
		const origCreateObjectURL = URL.createObjectURL;
		const origRevokeObjectURL = URL.revokeObjectURL;
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			writable: true,
			value: vi.fn(() => "blob:student-speaking"),
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			writable: true,
			value: vi.fn(),
		});

		let server = makeSub({
			leadId: null,
			studentId: "st-9",
			speakingStatus: "uploaded",
			speakingMediaUrl: null,
			aiStatus: "failed",
			aiErrorCode: "AI_GRADING_FAILED",
		});
		const calls = stubFetch((url, method) => {
			if (url.endsWith("/api/students/st-9/placement-submission/media")) {
				return new Response(new Uint8Array([1, 2, 3]), {
					status: 200,
					headers: { "content-type": "audio/webm" },
				});
			}
			if (
				url.endsWith("/api/students/st-9/placement-submission") &&
				method === "GET"
			) {
				return server;
			}
			if (
				url.endsWith("/api/students/st-9/placement-submission/ai-retry") &&
				method === "POST"
			) {
				server = { ...server, aiStatus: "processing", aiErrorCode: null };
				return server;
			}
			if (
				url.endsWith("/api/students/st-9/placement-submission") &&
				method === "PATCH"
			) {
				server = {
					...server,
					status: "graded",
					gradedAt: "2026-11-17T05:10:00.000Z",
				};
				return server;
			}
			return undefined;
		});

		const onGraded = vi.fn();
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementSubmissionPanel
					subject={{ kind: "student", id: "st-9" }}
					onGraded={onGraded}
				/>
			</QueryClientProvider>,
		);

		await screen.findByTestId("placement-submission-panel");
		await waitFor(() => {
			expect(
				screen.getByTestId("speaking-media-player").getAttribute("src"),
			).toBe("blob:student-speaking");
		});

		fireEvent.click(screen.getByTestId("placement-ai-retry-btn"));
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-status").dataset.aiStatus).toBe(
				"processing",
			),
		);
		expect(onGraded).not.toHaveBeenCalled();

		setBandInput("writing-task-input", "6.5");
		setBandInput("writing-coherence-input", "6.5");
		setBandInput("writing-lexical-input", "6.5");
		setBandInput("writing-grammar-input", "6.5");
		fireEvent.click(screen.getByTestId("toggle-speaking-grading"));
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.change(courseSelect, { target: { value: "course-ielts-2" } });

		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));
		await waitFor(() => expect(onGraded).toHaveBeenCalledTimes(1));
		expect(
			calls.some(
				(c) =>
					c.method === "PATCH" &&
					c.url.endsWith("/api/students/st-9/placement-submission"),
			),
		).toBe(true);

		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			writable: true,
			value: origCreateObjectURL,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			writable: true,
			value: origRevokeObjectURL,
		});
	});

	it("404 với emptyFallback → render emptyFallback thay vì null", async () => {
		stubFetch(() => undefined);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementSubmissionPanel
					studentId="st-empty"
					emptyFallback={<div>Chưa có bài nộp</div>}
				/>
			</QueryClientProvider>,
		);
		expect(await screen.findByText("Chưa có bài nộp")).toBeTruthy();
	});

	it("hiển thị mô tả chấm tự động 3 phần không chứa chữ 'khách quan'", async () => {
		stubFetch((url, method) => (isGet(url, method) ? makeSub() : undefined));
		renderPanel();
		const panel = await screen.findByTestId("placement-submission-panel");
		expect(panel.textContent).toContain(
			"Chấm tự động 3 phần • giáo viên chấm Writing & Speaking",
		);
		expect(panel.textContent).not.toContain("khách quan");
	});

	it("mở lại bài đã chấm pre-fill đúng finalCourseId (kể cả khi khóa đã ẩn với optgroup fallback)", async () => {
		stubFetch((url, method) =>
			isGet(url, method)
				? makeSub({
						status: "graded",
						gradedAt: "2026-11-16T08:00:00.000Z",
						writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
						writingScore: 6,
						speakingStatus: "skipped",
						speakingRubric: null,
						speakingScore: null,
						finalCourseId: "course-hidden-old",
						finalDisplayCourse: "IELTS - Fast Track",
						writingErrors: [],
						speakingErrors: [],
					})
				: undefined,
		);
		renderPanel();

		const select = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(select.disabled).toBe(false));
		expect(select.value).toBe("course-hidden-old");
		expect(
			select.querySelector('optgroup[label="Khóa đã lưu (đã ẩn)"]'),
		).toBeTruthy();
		expect(select.textContent).toContain("IELTS - Fast Track (đã ẩn)");
		expect(screen.getByTestId("selected-course-preview").textContent).toBe(
			"IELTS - Fast Track",
		);
	});

	it("bài đã chấm cũ không có finalCourseId hiện ghi chú khóa đề xuất trước đó và báo lỗi server COURSE_INACTIVE", async () => {
		stubFetch((url, method) => {
			if (isGet(url, method)) {
				return makeSub({
					status: "graded",
					gradedAt: "2026-11-10T08:00:00.000Z",
					writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
					writingScore: 6,
					speakingStatus: "skipped",
					speakingRubric: null,
					speakingScore: null,
					finalCourseId: null,
					finalDisplayCourse: "Giao tiếp 2",
					writingErrors: [],
					speakingErrors: [],
				});
			}
			if (url.endsWith("/placement-submission") && method === "PATCH") {
				return Response.json(
					{
						error: "COURSE_INACTIVE",
						code: "COURSE_INACTIVE",
						message: "Khóa học đã bị ẩn, vui lòng chọn khóa đang hoạt động.",
					},
					{ status: 400 },
				);
			}
			return undefined;
		});
		renderPanel();

		expect(
			(await screen.findByTestId("legacy-course-note")).textContent,
		).toContain(
			"Khóa đề xuất trước đó: Giao tiếp 2 — chọn khóa từ danh mục hiện tại để cập nhật.",
		);

		const select = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(select.disabled).toBe(false));
		fireEvent.change(select, { target: { value: "course-comm-1" } });
		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));

		await waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith(
				"Khóa học đã bị ẩn, vui lòng chọn khóa đang hoạt động.",
			),
		);
	});
});

describe("PlacementSubmissionPanel — PDF result export", () => {
	function makeGradedSub(
		overrides: Partial<PlacementSubmissionDetail> = {},
	): PlacementSubmissionDetail {
		return makeSub({
			status: "graded",
			gradedAt: "2026-11-15T10:00:00.000Z",
			writingRubric: { task: 6, coherence: 6.5, lexical: 6, grammar: 6 },
			writingScore: 6,
			speakingRubric: {
				fluency: 6.5,
				lexical: 6,
				grammar: 6,
				pronunciation: 6.5,
			},
			speakingScore: 6.5,
			teacherFeedback: "Nhận xét đã lưu.",
			writingErrors: [],
			speakingErrors: [],
			resultUrl: "https://example.test/placement-test/results/tok123",
			resultEmailStatus: "skipped",
			...overrides,
		});
	}

	it("hides placement-result-pdf and placement-result-link when submission is pending (gradedAt is null)", async () => {
		stubFetch((url, method) =>
			isGet(url, method) ? makeSub({ gradedAt: null }) : undefined,
		);
		renderPanel();
		await screen.findByTestId("placement-submission-panel");
		expect(screen.queryByTestId("placement-result-pdf")).toBeNull();
		expect(screen.queryByTestId("placement-result-link")).toBeNull();
		expect(screen.getByTestId("save-placement-grade-btn").textContent).toBe(
			"Chốt kết quả & gửi học viên",
		);
	});

	it("renders placement-result-pdf for legacy graded submission even when resultUrl is null", async () => {
		exportPdfMock.mockResolvedValue(undefined);
		const legacySub = makeSub({
			status: "graded",
			gradedAt: "2026-11-10T10:00:00.000Z",
			writingRubric: { ct: 4, or: 4, lg: 3 },
			writingScore: 11,
			speakingRubric: { gv: 4, dm: 4, pr: 4, ic: 5 },
			speakingScore: 17,
			writingErrors: [],
			speakingErrors: [],
			resultUrl: null,
			resultEmailStatus: "skipped",
		});
		stubFetch((url, method) => (isGet(url, method) ? legacySub : undefined));
		renderPanel();

		const pdfCard = await screen.findByTestId("placement-result-pdf");
		expect(pdfCard.textContent).toContain("Phiếu kết quả cho học viên (PDF)");
		expect(screen.queryByTestId("placement-result-link")).toBeNull();
		expect(screen.getByTestId("save-placement-grade-btn").textContent).toBe(
			"Cập nhật kết quả đã chốt",
		);
		expect(
			screen.getByTestId("placement-result-email-status").textContent,
		).toBe("Học viên không có email — hãy tải phiếu PDF gửi qua Zalo.");

		fireEvent.click(screen.getByTestId("export-result-pdf-btn"));
		await waitFor(() => expect(exportPdfMock).toHaveBeenCalledWith(legacySub));
	});

	it("manages pending state, double-click guard, success toast, and error recovery on export click", async () => {
		let resolveExport: (() => void) | undefined;
		exportPdfMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveExport = resolve;
				}),
		);
		const graded = makeGradedSub({ resultEmailStatus: "sent" });
		stubFetch((url, method) => (isGet(url, method) ? graded : undefined));
		renderPanel();

		const exportBtn = (await screen.findByTestId(
			"export-result-pdf-btn",
		)) as HTMLButtonElement;
		expect(
			screen.getByTestId("placement-result-email-status").textContent,
		).toBe("Đã gửi email kết quả cho học viên.");
		expect(exportBtn.disabled).toBe(false);
		expect(exportBtn.getAttribute("aria-busy")).toBe("false");

		// Click once + double-click while pending: only 1 export call
		fireEvent.click(exportBtn);
		fireEvent.click(exportBtn);

		await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(1));
		expect(exportPdfMock).toHaveBeenCalledWith(graded);
		expect(exportBtn.disabled).toBe(true);
		expect(exportBtn.getAttribute("aria-busy")).toBe("true");
		expect(exportBtn.textContent).toContain("Đang tạo file PDF...");

		// Resolve export -> success toast & reset button state
		await act(async () => {
			resolveExport?.();
		});
		await waitFor(() => expect(exportBtn.disabled).toBe(false));
		expect(exportBtn.getAttribute("aria-busy")).toBe("false");
		expect(exportBtn.textContent).toContain("Tải phiếu kết quả (PDF)");
		expect(toastMock.success).toHaveBeenCalledWith("Đã tải phiếu kết quả PDF.");

		// Reject export -> error toast & reset button state
		exportPdfMock.mockRejectedValueOnce(new Error("pdf failure"));
		fireEvent.click(exportBtn);
		await waitFor(() =>
			expect(toastMock.error).toHaveBeenCalledWith(
				"Không thể tạo file PDF. Vui lòng thử lại.",
			),
		);
		expect(exportBtn.disabled).toBe(false);
		expect(exportBtn.getAttribute("aria-busy")).toBe("false");
	});

	it("shows dirty warning after editing graded submission and still exports saved server submission", async () => {
		exportPdfMock.mockResolvedValue(undefined);
		const graded = makeGradedSub();
		stubFetch((url, method) => (isGet(url, method) ? graded : undefined));
		renderPanel();

		await screen.findByTestId("placement-result-pdf");
		expect(screen.queryByTestId("placement-pdf-dirty-warning")).toBeNull();

		// Edit teacher feedback -> dirty becomes true
		const feedbackInput = screen.getByLabelText(
			"Nhận xét bài kiểm tra đầu vào",
		) as HTMLTextAreaElement;
		fireEvent.change(feedbackInput, {
			target: { value: "Nhận xét nháp chưa lưu" },
		});

		const warning = screen.getByTestId("placement-pdf-dirty-warning");
		expect(warning.getAttribute("role")).toBe("note");
		expect(warning.textContent).toContain("Bạn có thay đổi chưa lưu");

		// Also edit a band score -> warning remains, export still passes saved server submission
		setBandInput("writing-overall-input", "7.5");
		fireEvent.click(screen.getByTestId("export-result-pdf-btn"));

		await waitFor(() => expect(exportPdfMock).toHaveBeenCalledTimes(1));
		expect(exportPdfMock).toHaveBeenCalledWith(graded);
		expect(exportPdfMock.mock.calls[0]?.[0]?.teacherFeedback).toBe(
			"Nhận xét đã lưu.",
		);
		expect(exportPdfMock.mock.calls[0]?.[0]?.writingScore).toBe(6);
	});

	it("renders placement-result-pdf and exports PDF for studentId subject", async () => {
		exportPdfMock.mockResolvedValue(undefined);
		const studentSub = makeGradedSub({
			leadId: null,
			studentId: "st-pdf-1",
			speakingStatus: "skipped",
			resultUrl: null,
			resultEmailStatus: "skipped",
		});
		stubFetch((url, method) =>
			url.endsWith("/api/students/st-pdf-1/placement-submission") &&
			method === "GET"
				? studentSub
				: undefined,
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementSubmissionPanel studentId="st-pdf-1" />
			</QueryClientProvider>,
		);

		const pdfCard = await screen.findByTestId("placement-result-pdf");
		expect(pdfCard.textContent).toContain("Phiếu kết quả cho học viên (PDF)");
		expect(screen.queryByTestId("placement-result-link")).toBeNull();

		fireEvent.click(screen.getByTestId("export-result-pdf-btn"));
		await waitFor(() => expect(exportPdfMock).toHaveBeenCalledWith(studentSub));
		expect(toastMock.success).toHaveBeenCalledWith("Đã tải phiếu kết quả PDF.");
	});
});

describe("PlacementSubmissionPanel — synced criterion colors & per-criterion comments", () => {
	it("applies synced --class-* accent/border styles to the 4 criterion sliders while keeping overall sliders neutral", async () => {
		stubFetch((url, method) => (isGet(url, method) ? DRAFTED : undefined));
		renderPanel();
		await screen.findByTestId("placement-submission-panel");

		const writingExpected = [
			["task", "border-l-class-3", "accent-class-3"],
			["coherence", "border-l-class-4", "accent-class-4"],
			["lexical", "border-l-class-1", "accent-class-1"],
			["grammar", "border-l-class-5", "accent-class-5"],
		] as const;
		for (const [key, borderCls, accentCls] of writingExpected) {
			const field = screen.getByTestId(`writing-${key}-field`);
			expect(field.className).toContain("border-l-4");
			expect(field.className).toContain(borderCls);
			expect(field.dataset.criterionKey).toBe(key);
			const slider = document.getElementById(
				`writing-${key}-slider`,
			) as HTMLInputElement;
			expect(slider.className).toContain(accentCls);
		}
		const writingOverallSlider = document.getElementById(
			"writing-overall-slider",
		) as HTMLInputElement;
		expect(writingOverallSlider.className).not.toMatch(/accent-class-/);

		const speakingExpected = [
			["fluency", "border-l-class-4", "accent-class-4"],
			["lexical", "border-l-class-1", "accent-class-1"],
			["grammar", "border-l-class-5", "accent-class-5"],
			["pronunciation", "border-l-class-2", "accent-class-2"],
		] as const;
		for (const [key, borderCls, accentCls] of speakingExpected) {
			const field = screen.getByTestId(`speaking-${key}-field`);
			expect(field.className).toContain("border-l-4");
			expect(field.className).toContain(borderCls);
			expect(field.dataset.criterionKey).toBe(key);
			const slider = document.getElementById(
				`speaking-${key}-slider`,
			) as HTMLInputElement;
			expect(slider.className).toContain(accentCls);
		}
		const speakingOverallSlider = document.getElementById(
			"speaking-overall-slider",
		) as HTMLInputElement;
		expect(speakingOverallSlider.className).not.toMatch(/accent-class-/);
	});

	it("hydrates per-criterion comments, marks dirty on edit, submits trimmed values, and keeps Zalo & teacherFeedback unchanged", async () => {
		let patchBody: Record<string, unknown> | null = null;
		const savedSub = makeSub({
			status: "graded",
			gradedAt: "2026-11-15T10:00:00.000Z",
			writingRubric: { task: 6, coherence: 6.5, lexical: 6, grammar: 6 },
			writingScore: 6,
			writingCriterionComments: {
				task: "Đủ ý chính.",
				coherence: "",
				lexical: "Dùng từ ổn.",
				grammar: "",
			},
			speakingRubric: {
				fluency: 6.5,
				lexical: 6,
				grammar: 6,
				pronunciation: 6.5,
			},
			speakingScore: 6.5,
			speakingCriterionComments: {
				fluency: "Nói đều nhịp.",
				lexical: "",
				grammar: "",
				pronunciation: "Chú ý âm cuối.",
			},
			teacherFeedback: "Tổng quan tốt.",
			finalCourseId: "course-ielts-1",
			finalDisplayCourse: "IELTS - Foundation",
			writingErrors: [],
			speakingErrors: [],
		});
		stubFetch((url, method, body) => {
			if (isGet(url, method)) return savedSub;
			if (url.endsWith("/placement-submission") && method === "PATCH") {
				patchBody = body as Record<string, unknown>;
				return {
					...savedSub,
					gradedAt: "2026-11-15T12:00:00.000Z",
				};
			}
			return undefined;
		});
		renderPanel();

		const taskComment = (await screen.findByTestId(
			"writing-task-comment",
		)) as HTMLTextAreaElement;
		expect(taskComment.value).toBe("Đủ ý chính.");
		expect(taskComment.rows).toBe(2);
		expect(taskComment.maxLength).toBe(1000);
		expect(
			(screen.getByTestId("writing-lexical-comment") as HTMLTextAreaElement)
				.value,
		).toBe("Dùng từ ổn.");
		expect(
			(screen.getByTestId("speaking-fluency-comment") as HTMLTextAreaElement)
				.value,
		).toBe("Nói đều nhịp.");
		expect(
			(
				screen.getByTestId(
					"speaking-pronunciation-comment",
				) as HTMLTextAreaElement
			).value,
		).toBe("Chú ý âm cuối.");
		expect(screen.queryByTestId("placement-pdf-dirty-warning")).toBeNull();

		// Editing a criterion comment marks dirty -> triggers PDF dirty warning
		fireEvent.change(taskComment, {
			target: { value: "  Đủ ý chính, nên thêm ví dụ cụ thể.  " },
		});
		fireEvent.change(screen.getByTestId("speaking-grammar-comment"), {
			target: { value: "  Cần luyện thì quá khứ.  " },
		});
		expect(screen.getByTestId("placement-pdf-dirty-warning")).toBeTruthy();

		// Zalo text stays unchanged (does not leak per-criterion comments; keeps teacherFeedback)
		const localClipboardWrite = vi
			.fn<(text: string) => Promise<void>>()
			.mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: localClipboardWrite },
		});
		fireEvent.click(screen.getByTestId("copy-zalo-result-btn"));
		await waitFor(() => expect(localClipboardWrite).toHaveBeenCalled());
		const copiedZalo = String(localClipboardWrite.mock.lastCall?.[0] ?? "");
		expect(copiedZalo).toContain("Tổng quan tốt.");
		expect(copiedZalo).not.toContain("nên thêm ví dụ cụ thể");

		// Save sends trimmed per-criterion comments
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));

		await waitFor(() => expect(patchBody).not.toBeNull());
		const sent = patchBody as unknown as Record<string, unknown>;
		expect(sent.writingCriterionComments).toEqual({
			task: "Đủ ý chính, nên thêm ví dụ cụ thể.",
			coherence: "",
			lexical: "Dùng từ ổn.",
			grammar: "",
		});
		expect(sent.speakingCriterionComments).toEqual({
			fluency: "Nói đều nhịp.",
			lexical: "",
			grammar: "Cần luyện thì quá khứ.",
			pronunciation: "Chú ý âm cuối.",
		});
		expect(sent.teacherFeedback).toBe("Tổng quan tốt.");
	});

	it("omits speaking criterion comments when includeSpeaking is unchecked and preserves comments on applyAiDraft", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let server = makeSub({ aiStatus: "processing" });
		let patchBody: Record<string, unknown> | null = null;
		stubFetch((url, method, body) => {
			if (isGet(url, method)) return server;
			if (url.endsWith("/placement-submission") && method === "PATCH") {
				patchBody = body as Record<string, unknown>;
				return {
					...server,
					status: "graded",
					gradedAt: "2026-11-16T09:00:00.000Z",
				};
			}
			return undefined;
		});
		renderPanel();
		await screen.findByTestId("placement-ai-status");

		const writingCoherenceComment = screen.getByTestId(
			"writing-coherence-comment",
		) as HTMLTextAreaElement;
		fireEvent.change(writingCoherenceComment, {
			target: { value: "  Liên kết đoạn ổn.  " },
		});
		fireEvent.change(screen.getByTestId("speaking-fluency-comment"), {
			target: { value: "Ghi chú speaking nháp" },
		});

		// AI draft arrives while editing -> applyAiDraft keeps criterion comments intact
		server = DRAFTED;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS + 50);
		});
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-apply-draft-btn")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("placement-ai-apply-draft-btn"));
		expect(writingCoherenceComment.value).toBe("  Liên kết đoạn ổn.  ");

		// Uncheck Speaking -> hides Speaking comment textareas and submits speakingCriterionComments: null
		fireEvent.click(screen.getByTestId("toggle-speaking-grading"));
		expect(screen.queryByTestId("speaking-fluency-comment")).toBeNull();

		setBandInput("writing-task-input", "6.5");
		setBandInput("writing-coherence-input", "6.5");
		setBandInput("writing-lexical-input", "6.5");
		setBandInput("writing-grammar-input", "6.5");
		const courseSelect = (await screen.findByTestId(
			"placement-course-select",
		)) as HTMLSelectElement;
		await waitFor(() => expect(courseSelect.disabled).toBe(false));
		fireEvent.change(courseSelect, { target: { value: "course-ielts-1" } });

		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));
		await waitFor(() => expect(patchBody).not.toBeNull());
		const sent = patchBody as unknown as Record<string, unknown>;
		expect(sent.writingCriterionComments).toEqual({
			task: "",
			coherence: "Liên kết đoạn ổn.",
			lexical: "",
			grammar: "",
		});
		expect(sent.speakingCriterionComments).toBeNull();
	});
});
