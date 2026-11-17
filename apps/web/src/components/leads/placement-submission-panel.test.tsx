// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));

import {
	PLACEMENT_RUBRIC_INTERMEDIATE_NOTE,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_WRITING_RUBRIC,
} from "@teacher-os/api/placement-test-contracts";
import {
	initialPlacementGrading,
	PLACEMENT_AI_POLL_MS,
	PlacementSubmissionPanel,
} from "./placement-submission-panel";

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
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
		speakingRubric: null,
		speakingScore: null,
		teacherFeedback: "",
		finalBandLevel: null,
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
		rubric: { ct: 4, or: 3, lg: 2 },
		feedback: "Bài viết đủ ý nhưng sai thì quá khứ.",
		errors: [err("w1", "goes", { correction: "went" })],
	},
	aiSpeaking: {
		rubric: { gv: 3, dm: 3, pr: 2, ic: 4 },
		feedback: "Nói khá trôi chảy.",
		errors: [
			err("s1", "like play", {
				correction: "like playing",
				explanation: "like + V-ing",
			}),
			err("s2", "friend", { category: "pronunciation" }),
		],
	},
});

type Handler = (
	url: string,
	method: string,
	body: unknown,
) => PlacementSubmissionDetail | Response | undefined;

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
		return Promise.resolve(
			data
				? new Response(JSON.stringify(data), {
						status: 200,
						headers: { "content-type": "application/json" },
					})
				: new Response("not found", { status: 404 }),
		);
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
	it("chưa chốt + có nháp AI → điền rubric/lỗi từ AI, đã định vị offset", () => {
		const init = initialPlacementGrading(DRAFTED);
		expect(init.writingRubric).toEqual({ ct: 4, or: 3, lg: 2 });
		expect(init.speakingRubric).toEqual({ gv: 3, dm: 3, pr: 2, ic: 4 });
		expect(init.writingErrors[0]).toMatchObject({
			id: "w1",
			start: WRITING.indexOf("goes"),
		});
		expect(init.speakingErrors.map((e) => e.id)).toEqual(["s1", "s2"]);
	});

	it("đã chốt → dùng rubric/lỗi đã lưu, bỏ qua nháp AI", () => {
		const init = initialPlacementGrading({
			...DRAFTED,
			gradedAt: "2026-11-15T10:00:00.000Z",
			writingRubric: { ct: 5, or: 5, lg: 5 },
			speakingRubric: { gv: 1, dm: 1, pr: 1, ic: 1 },
			writingErrors: [],
			speakingErrors: [err("s9", "football")],
		});
		expect(init.writingRubric).toEqual({ ct: 5, or: 5, lg: 5 });
		expect(init.writingErrors).toEqual([]);
		expect(init.speakingErrors.map((e) => e.id)).toEqual(["s9"]);
		expect(init.includeSpeaking).toBe(true);
	});
});

describe("PlacementSubmissionPanel — chấm nháp AI (#730)", () => {
	it("processing → banner 'AI đang chấm…' và poll đến khi có nháp AI", async () => {
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
		expect(status.textContent).toContain("AI đang chấm…");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS + 50);
		});
		await waitFor(() =>
			expect(screen.getByTestId("placement-ai-status").dataset.aiStatus).toBe(
				"drafted",
			),
		);
		expect(gets).toBe(2);
		// Nháp AI về → form được điền sẵn.
		expect(
			screen.getByTestId("writing-ct-4").getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);

		// Hết processing → không poll nữa.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(PLACEMENT_AI_POLL_MS * 2);
		});
		expect(gets).toBe(2);
	});

	it("failed → thông báo theo mã lỗi + nút 'Chấm lại bằng AI' gọi POST ai-retry", async () => {
		// Server có trạng thái: sau POST ai-retry, GET trả "processing".
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
		// Kernel chỉ nhận POST JSON: phải có Content-Type + body `{}`.
		const retryCall = calls.find(
			(c) => c.method === "POST" && c.url.endsWith("/ai-retry"),
		);
		expect(retryCall?.headers.get("content-type")).toBe("application/json");
		expect(retryCall?.body).toEqual({});
		expect(toastMock.success).toHaveBeenCalled();
	});

	it("aiStatus none, không có bài để chấm → giữ UI chấm tay, không banner, không highlight", async () => {
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
			screen.getByTestId("writing-ct-3").getAttribute("aria-pressed"),
		).toBe("true");
	});

	it("aiStatus none + có bài viết (upload bỏ ngang) → nút 'Chấm bằng AI'; server 503 → toast AI chưa bật", async () => {
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
		expect(button.textContent).toContain("Chấm bằng AI");
		fireEvent.click(button);
		await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
		expect(String(toastMock.error.mock.calls[0]?.[0])).toContain(
			"AI chấm điểm chưa được bật",
		);
		expect(calls.filter((c) => c.url.endsWith("/ai-retry"))).toHaveLength(1);
	});

	it("kết quả đã chốt → ẩn nút chấm lại bằng AI", async () => {
		stubFetch((url, method) =>
			isGet(url, method)
				? {
						...DRAFTED,
						status: "graded",
						gradedAt: "2026-11-15T10:00:00.000Z",
						writingRubric: { ct: 4, or: 3, lg: 2 },
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

	it("nháp AI mới về khi form đang sửa → không xoá chỉnh sửa, hiện 'Áp dụng nháp AI'", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		let server = makeSub({ aiStatus: "processing" });
		stubFetch((url, method) => (isGet(url, method) ? server : undefined));
		renderPanel();
		await screen.findByTestId("placement-ai-status");

		// Giáo viên chấm tay trong lúc AI đang chạy.
		fireEvent.click(screen.getByTestId("writing-ct-1"));
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
		// Không ghi đè: điểm tay + nhận xét giữ nguyên, chưa có highlight AI.
		expect(
			screen.getByTestId("writing-ct-1").getAttribute("aria-pressed"),
		).toBe("true");
		expect(feedback.value).toBe("Nhận xét tay.");
		expect(screen.queryAllByTestId("writing-error-mark")).toHaveLength(0);

		fireEvent.click(screen.getByTestId("placement-ai-apply-draft-btn"));
		expect(
			screen.getByTestId("writing-ct-4").getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByTestId("speaking-ic-4").getAttribute("aria-pressed"),
		).toBe("true");
		expect(screen.getAllByTestId("writing-error-mark")).toHaveLength(1);
		expect(feedback.value).toBe("Nhận xét tay.");
		expect(screen.queryByTestId("placement-ai-apply-draft-btn")).toBeNull();
	});

	it("drafted → nhãn nháp, highlight bài viết + transcript, điểm live, PATCH gửi kèm lỗi rồi hiện link kết quả", async () => {
		const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: clipboardWriteMock },
		});
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
					writingRubric: { ct: 4, or: 3, lg: 2 },
					speakingRubric: { gv: 3, dm: 3, pr: 2, ic: 4 },
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
		expect(status.textContent).toContain("Bản nháp AI — chưa gửi học viên");
		expect(screen.getByTestId("placement-ai-retry-btn")).toBeTruthy();

		expect(screen.getByTestId("writing-ai-feedback").textContent).toContain(
			"sai thì quá khứ",
		);
		const speakingMarks = screen.getAllByTestId("speaking-error-mark");
		expect(speakingMarks.map((m) => m.textContent)).toEqual([
			"like play",
			"friend",
		]);
		expect(speakingMarks[1]?.getAttribute("aria-label")).toContain(
			"Lỗi 2: Phát âm",
		);

		// Điểm tổng tính live: W 9/15 (60%), S 12/20 (60%) → (80+60+70+60+60)/5 = 66%.
		const summary = screen.getByTestId("placement-score-summary");
		expect(summary.textContent).toContain("Writing 9/15");
		expect(summary.textContent).toContain("Speaking 12/20");
		expect(summary.textContent).toContain("Tổng 66%");
		expect(summary.textContent).toContain("CEFR B1");
		fireEvent.click(screen.getByTestId("writing-lg-5"));
		expect(summary.textContent).toContain("Writing 12/15");

		// Chèn nhận xét AI vào ô nhận xét.
		fireEvent.click(
			screen
				.getByTestId("speaking-ai-feedback")
				.querySelector("button") as HTMLButtonElement,
		);
		expect(
			(
				screen.getByLabelText(
					"Nhận xét bài kiểm tra đầu vào",
				) as HTMLTextAreaElement
			).value,
		).toBe("Nói khá trôi chảy.");

		// Xoá lỗi Speaking số 2 rồi chốt.
		fireEvent.click(screen.getAllByLabelText("Xoá lỗi 2")[0] as HTMLElement);
		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));

		await waitFor(() => expect(patchBody).not.toBeNull());
		const sent = patchBody as unknown as {
			writingRubric: unknown;
			speakingRubric: unknown;
			teacherFeedback: string;
			writingErrors: PlacementError[];
			speakingErrors: PlacementError[];
		};
		expect(sent.writingRubric).toEqual({ ct: 4, or: 3, lg: 5 });
		expect(sent.speakingRubric).toEqual({ gv: 3, dm: 3, pr: 2, ic: 4 });
		expect(sent.teacherFeedback).toBe("Nói khá trôi chảy.");
		expect(sent.writingErrors).toEqual([
			{
				...err("w1", "goes", { correction: "went" }),
				start: WRITING.indexOf("goes"),
				end: WRITING.indexOf("goes") + 4,
			},
		]);
		expect(sent.speakingErrors.map((e) => e.id)).toEqual(["s1"]);

		const result = await screen.findByTestId("placement-result-link");
		expect(result.textContent).toContain(
			"https://example.test/placement-test/results/tok123",
		);
		expect(
			screen.getByTestId("placement-result-email-status").textContent,
		).toContain("Gửi email kết quả lỗi");
		fireEvent.click(screen.getByTestId("copy-result-link-btn"));
		await waitFor(() =>
			expect(clipboardWriteMock).toHaveBeenCalledWith(
				"https://example.test/placement-test/results/tok123",
			),
		);
		// Copy Zalo vẫn còn.
		expect(screen.getByTestId("copy-zalo-result-btn")).toBeTruthy();
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

	it("hiển thị hướng dẫn thang điểm 5 / 3 / 1 và ghi chú 4 / 2 / 0 cho Writing & Speaking", async () => {
		stubFetch((url, method) => (isGet(url, method) ? makeSub() : undefined));
		renderPanel();

		const writingGuide = await screen.findByTestId("writing-rubric-guide");
		const speakingGuide = screen.getByTestId("speaking-rubric-guide");

		expect(writingGuide.textContent).toContain("Xem thang mô tả 5 / 3 / 1");
		expect(speakingGuide.textContent).toContain("Xem thang mô tả 5 / 3 / 1");
		expect(writingGuide.textContent).toContain(
			PLACEMENT_RUBRIC_INTERMEDIATE_NOTE,
		);
		expect(speakingGuide.textContent).toContain(
			PLACEMENT_RUBRIC_INTERMEDIATE_NOTE,
		);

		for (const item of PLACEMENT_WRITING_RUBRIC) {
			expect(writingGuide.textContent).toContain(item.levels[5]);
			expect(writingGuide.textContent).toContain(item.levels[3]);
			expect(writingGuide.textContent).toContain(item.levels[1]);
		}
		for (const item of PLACEMENT_SPEAKING_RUBRIC) {
			expect(speakingGuide.textContent).toContain(item.levels[5]);
			expect(speakingGuide.textContent).toContain(item.levels[3]);
			expect(speakingGuide.textContent).toContain(item.levels[1]);
		}

		// Bỏ tick Speaking → ẩn cả rubric lẫn thang mô tả Speaking.
		fireEvent.click(screen.getByTestId("toggle-speaking-grading"));
		expect(screen.queryByTestId("speaking-rubric-guide")).toBeNull();
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
});
