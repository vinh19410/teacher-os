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

beforeAll(() => {
	Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	exportPdfMock.mockReset();
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
	it("chưa chốt + có nháp AI → chỉ lấy lỗi từ AI (định vị offset), điểm IELTS khởi tạo rỗng", () => {
		const init = initialPlacementGrading(DRAFTED);
		expect(init.writingRubric).toEqual({
			task: null,
			coherence: null,
			lexical: null,
			grammar: null,
		});
		expect(init.writingScore).toBeNull();
		expect(init.speakingRubric).toEqual({
			fluency: null,
			lexical: null,
			grammar: null,
			pronunciation: null,
		});
		expect(init.speakingScore).toBeNull();
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
			speakingRubric: {
				fluency: 7,
				lexical: 6.5,
				grammar: 6,
				pronunciation: 7,
			},
			speakingScore: 6.5,
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
		expect(init.speakingRubric).toEqual({
			fluency: 7,
			lexical: 6.5,
			grammar: 6,
			pronunciation: 7,
		});
		expect(init.speakingScore).toBe(6.5);
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
		expect(init.speakingRubric).toEqual({
			fluency: null,
			lexical: null,
			grammar: null,
			pronunciation: null,
		});
		expect(init.speakingScore).toBeNull();
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
			"Lỗi 2: Phát âm",
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
		expect(saveBtn.disabled).toBe(false);
		expect(screen.queryByTestId("save-placement-grade-hint")).toBeNull();

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
			speakingRubric: unknown;
			speakingScore: number;
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
		expect(sent.speakingRubric).toEqual({
			fluency: 6,
			lexical: 6.5,
			grammar: 6,
			pronunciation: 6.5,
		});
		expect(sent.speakingScore).toBe(6.5);
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
	});

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
