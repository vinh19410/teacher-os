// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LeadListResponse, LeadRow } from "@teacher-os/api/lead-contracts";
import type { PlacementSubmissionDetail } from "@teacher-os/api/placement-test-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
type MockSearch = {
	q?: string;
	status?: string;
	page?: number;
};
const mockSearch = vi.hoisted(() => ({ current: {} as MockSearch }));
const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));
const reauthMock = vi.hoisted(() => vi.fn());
const financeGuardState = vi.hoisted(() => ({ canAccessFinance: true }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useSearch: () => mockSearch.current,
	}),
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));
vi.mock("@/lib/use-finance-route-guard", () => ({
	useFinanceRouteGuard: () => financeGuardState.canAccessFinance,
}));

import { Route, validateLeadsSearch } from "./index";

const Leads = (Route as unknown as { component: () => React.ReactNode })
	.component;

const ROW_BASE: LeadRow = {
	id: "lead-1",
	name: "Nguyễn Thu Hà",
	phone: "0909123456",
	email: "ha@example.com",
	birthDate: "2008-05-14",
	course: "ielts-foundation",
	studyMode: "group-online",
	studyDays: "mt",
	timeSlot: "0900",
	note: "Muốn học IELTS cho đi du học",
	placement: "",
	teacherNote: "",
	source: "profile",
	status: "new",
	submitCount: 1,
	createdAt: "2026-10-30T02:00:00.000Z",
	updatedAt: "2026-10-30T02:00:00.000Z",
	statusChangedAt: null,
};

function row(overrides: Partial<LeadRow> = {}): LeadRow {
	return { ...ROW_BASE, ...overrides };
}

function seedResponse(
	overrides: Partial<LeadListResponse> = {},
): LeadListResponse {
	return {
		rows: [row()],
		total: 1,
		page: 1,
		pageSize: 20,
		counts: { new: 2, contacted: 1, enrolled: 0, dropped: 0, all: 3 },
		...overrides,
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderRoute(body: LeadListResponse = seedResponse()) {
	fetchMock = vi.fn(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		),
	);
	vi.stubGlobal("fetch", fetchMock);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<Leads />
		</QueryClientProvider>,
	);
}

function lastNavigateSearch(): Record<string, unknown> {
	const call = mockNavigate.mock.calls.at(-1)?.[0];
	if (call && typeof call === "object" && "search" in call) {
		const search = call.search;
		return search && typeof search === "object"
			? (search as Record<string, unknown>)
			: {};
	}
	return {};
}

beforeEach(() => {
	mockNavigate.mockReset();
	mockSearch.current = {};
	toastMock.success.mockReset();
	toastMock.error.mockReset();
	reauthMock.mockReset();
	financeGuardState.canAccessFinance = true;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("validateLeadsSearch (#506 phase 4)", () => {
	it("chuẩn hóa giá trị lạ về undefined và giữ giá trị hợp lệ", () => {
		expect(validateLeadsSearch({})).toEqual({});
		expect(validateLeadsSearch({ q: "  " })).toEqual({});
		expect(validateLeadsSearch({ status: "archived" })).toEqual({});
		expect(validateLeadsSearch({ page: "1" })).toEqual({});
		expect(validateLeadsSearch({ q: "thu", status: "new", page: "2" })).toEqual(
			{ q: "thu", status: "new", page: 2 },
		);
	});
});

describe("màn /leads (#506 phase 4)", () => {
	it("hiển thị danh sách với tên, SĐT zalo.me, khóa, lịch, trạng thái", async () => {
		renderRoute();
		await screen.findByText("Nguyễn Thu Hà");

		const table = within(screen.getByTestId("leads-table"));
		const phoneLink = table.getByRole("link", { name: "0909123456" });
		expect(phoneLink.getAttribute("href")).toBe("https://zalo.me/0909123456");
		expect(table.getByText("IELTS Foundation (0–3.0)")).toBeTruthy();
		expect(table.getByText("Thứ 2 & Thứ 5 · 9:00")).toBeTruthy();
		expect(table.getByText("Mới")).toBeTruthy();
	});

	it("badge đếm chip trạng thái lấy từ counts server", async () => {
		renderRoute();
		await screen.findByText("Nguyễn Thu Hà");
		// Chip "Tất cả" mang counts.all = 3, chip "Mới" mang đếm riêng = 2
		// (badge aria-hidden trong ChipFilter).
		const statusGroup = screen.getByRole("group", { name: "Trạng thái" });
		expect(statusGroup.textContent).toContain("3");
		expect(statusGroup.textContent).toContain("2");
	});

	it("bấm chip trạng thái đẩy ?status lên URL", async () => {
		renderRoute();
		await screen.findByText("Nguyễn Thu Hà");
		fireEvent.click(screen.getByRole("button", { name: "Đã liên hệ" }));
		expect(lastNavigateSearch()).toEqual({ status: "contacted" });
	});

	it("gõ search debounce 300ms rồi mới đẩy ?q lên URL, về trang 1", async () => {
		mockSearch.current = { status: "new", page: 3 };
		renderRoute();
		await screen.findByText("Nguyễn Thu Hà");
		const input = screen.getByLabelText("Tìm theo tên hoặc số điện thoại");
		fireEvent.change(input, { target: { value: "thu" } });
		// Chưa đủ 300ms — không điều hướng ngay.
		expect(mockNavigate).not.toHaveBeenCalled();
		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(lastNavigateSearch()).toEqual({ q: "thu", status: "new" });
	});

	it("bấm dòng mở modal chi tiết; Lưu gọi PATCH đúng body, toast và làm mới", async () => {
		renderRoute();
		await screen.findByText("Nguyễn Thu Hà");

		fireEvent.click(screen.getByText("Nguyễn Thu Hà"));
		const statusSelect = await screen.findByLabelText("Trạng thái", {
			selector: "select",
		});
		fireEvent.change(statusSelect, {
			target: { value: "contacted" },
		});
		const noteArea = screen.getByLabelText("Ghi chú giáo viên");
		fireEvent.change(noteArea, { target: { value: "Đã nhắn Zalo" } });

		let patchBody: unknown;
		let patchUrl = "";
		let patchMethod = "";
		fetchMock.mockImplementation(
			(input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if ((init?.method ?? "GET") === "PATCH") {
					patchUrl = url;
					patchMethod = "PATCH";
					patchBody = JSON.parse(String(init?.body ?? "{}"));
					return Promise.resolve(
						new Response(JSON.stringify(row({ status: "contacted" })), {
							status: 200,
							headers: { "content-type": "application/json" },
						}),
					);
				}
				// Refetch sau invalidate — trả list shape như GET thật.
				return Promise.resolve(
					new Response(JSON.stringify(seedResponse()), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			},
		);
		fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

		await waitFor(() => expect(patchMethod).toBe("PATCH"));
		expect(patchUrl).toContain("/api/leads/lead-1");
		expect(patchBody).toEqual({
			status: "contacted",
			teacherNote: "Đã nhắn Zalo",
		});
		await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
	});

	it("empty state khi chưa có lead nào", async () => {
		renderRoute(
			seedResponse({
				rows: [],
				total: 0,
				counts: { new: 0, contacted: 0, enrolled: 0, dropped: 0, all: 0 },
			}),
		);
		await screen.findByTestId("leads-empty-state");
		expect(screen.getByText("Chưa có đăng ký nào")).toBeTruthy();
	});

	it("401 ⇒ gọi reauth", async () => {
		fetchMock = vi.fn(() =>
			Promise.resolve(new Response("unauthorized", { status: 401 })),
		);
		vi.stubGlobal("fetch", fetchMock);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<Leads />
			</QueryClientProvider>,
		);
		await waitFor(() => expect(reauthMock).toHaveBeenCalled());
	});

	it("ẩn màn /leads (container rỗng) và không gọi /api/leads khi canAccessFinance = false (#524)", () => {
		financeGuardState.canAccessFinance = false;
		const view = renderRoute();
		expect(view.container.innerHTML).toBe("");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("hiển thị badge Chờ chấm W&S, phát media Speaking blob:, preview quy tắc sàn -1 bậc và lưu điểm chấm (#721)", async () => {
		const sampleSub: PlacementSubmissionDetail = {
			id: "sub-1",
			leadId: "lead-1",
			studentName: "Nguyễn Thu Hà",
			studentPhone: "0909123456",
			testVersion: 1,
			status: "pending_grading",
			submittedAt: "2026-11-14T10:00:00.000Z",
			snapshot: {
				version: 1,
				bands: [
					{
						min: 0,
						max: 24,
						cefr: "A1",
						course: "foundation-core",
						courseLabel: "Xây Nền Từ Gốc",
						displayCourse: "Xây Nền Từ Gốc",
						advice: "",
					},
					{
						min: 25,
						max: 49,
						cefr: "A2",
						course: "comm-1",
						courseLabel: "Giao tiếp 1",
						displayCourse: "Giao tiếp 1",
						advice: "",
					},
					{
						min: 50,
						max: 74,
						cefr: "B1",
						course: "comm-2",
						courseLabel: "Giao tiếp 2",
						displayCourse: "Giao tiếp 2",
						advice: "",
					},
					{
						min: 75,
						max: 100,
						cefr: "B2",
						course: "comm-3",
						courseLabel: "Giao tiếp 3",
						displayCourse: "Giao tiếp 3",
						advice: "Lộ trình B2",
					},
				],
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
			answers: {
				listening: { "l-01": 0 },
				vocabGrammar: { "vg-01": 1 },
				reading: { "r-01": 2 },
			},
			objective: {
				listening: { correct: 11, total: 13, pct: 85 },
				vocabGrammar: { correct: 10, total: 12, pct: 83 },
				reading: { correct: 12, total: 15, pct: 80 },
				totalCorrect: 33,
				totalQuestions: 40,
				averagePct: 83,
				byLevel: [{ level: "B1", correct: 10, total: 12, pct: 83 }],
				items: [
					{
						id: "l-01",
						section: "listening",
						type: "mcq",
						level: "A2",
						prompt: "Where?",
						expected: 0,
						studentAnswer: 0,
						correct: true,
					},
				],
				provisionalBand: {
					min: 75,
					max: 100,
					cefr: "B2",
					course: "comm-3",
					courseLabel: "Giao tiếp 3",
					displayCourse: "Giao tiếp 3",
					advice: "Lộ trình B2",
				},
				provisionalSummary: "Tạm tính B2",
			},
			writingText: "Hello Sarah, I live in District 1 with my family.",
			writingWordCount: 10,
			speakingStatus: "uploaded",
			speakingMediaUrl: "/api/leads/lead-1/placement-submission/media",
			speakingMediaMime: "video/webm",
			speakingMediaSize: 128,
			speakingDurationSec: 42,
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
			zaloText: "ZALO MOCK",
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
		};

		const origCreateObjectURL = URL.createObjectURL;
		const origRevokeObjectURL = URL.revokeObjectURL;
		const createObjectURLMock = vi.fn(() => "blob:mock-speaking");
		const revokeObjectURLMock = vi.fn();
		Object.defineProperty(URL, "createObjectURL", {
			configurable: true,
			writable: true,
			value: createObjectURLMock,
		});
		Object.defineProperty(URL, "revokeObjectURL", {
			configurable: true,
			writable: true,
			value: revokeObjectURLMock,
		});
		const clipboardWriteMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: clipboardWriteMock },
		});

		const listData = seedResponse({
			rows: [
				row({
					source: "placement-test",
					hasPlacementSubmission: true,
					placementSubmissionStatus: "pending_grading",
				}),
			],
		});

		let gradePatchBody: unknown = null;
		fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			if (url.endsWith("/placement-submission/media")) {
				return Promise.resolve(
					new Response(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), {
						status: 200,
						headers: { "content-type": "video/webm" },
					}),
				);
			}
			if (url.endsWith("/placement-submission") && method === "GET") {
				return Promise.resolve(
					new Response(JSON.stringify(sampleSub), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			}
			if (url.endsWith("/placement-submission") && method === "PATCH") {
				gradePatchBody = JSON.parse(String(init?.body ?? "{}"));
				return Promise.resolve(
					new Response(
						JSON.stringify({
							...sampleSub,
							status: "graded",
							writingScore: 9,
							speakingScore: 0,
							finalBandLevel: "A2",
							finalScorePct: 70,
						}),
						{
							status: 200,
							headers: { "content-type": "application/json" },
						},
					),
				);
			}
			return Promise.resolve(
				new Response(JSON.stringify(listData), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		});
		vi.stubGlobal("fetch", fetchMock);

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<Leads />
			</QueryClientProvider>,
		);

		await screen.findByText("Chờ chấm W&S");
		fireEvent.click(screen.getByText("Nguyễn Thu Hà"));

		await screen.findByTestId("placement-submission-panel");
		await waitFor(() => {
			const player = screen.getByTestId("speaking-media-player");
			expect(player.tagName).toBe("VIDEO");
			expect(player.getAttribute("src")).toBe("blob:mock-speaking");
		});

		// Chấm Writing Band 9.0 (100%) và Speaking Band 0.0 (0%, A1) -> trung bình (85+83+80+100+0)/5 = 70% (B1),
		// Speaking bậc 0 (A1) thấp hơn B1 >= 2 bậc => hạ 1 bậc xuống A2 + cảnh báo speaking-floor-note!
		fireEvent.change(screen.getByTestId("writing-task-input"), {
			target: { value: "9" },
		});
		fireEvent.change(screen.getByTestId("writing-coherence-input"), {
			target: { value: "9" },
		});
		fireEvent.change(screen.getByTestId("writing-lexical-input"), {
			target: { value: "9" },
		});
		fireEvent.change(screen.getByTestId("writing-grammar-input"), {
			target: { value: "9" },
		});
		fireEvent.change(screen.getByTestId("speaking-fluency-input"), {
			target: { value: "0" },
		});
		fireEvent.change(screen.getByTestId("speaking-lexical-input"), {
			target: { value: "0" },
		});
		fireEvent.change(screen.getByTestId("speaking-grammar-input"), {
			target: { value: "0" },
		});
		fireEvent.change(screen.getByTestId("speaking-pronunciation-input"), {
			target: { value: "0" },
		});

		await screen.findByTestId("speaking-floor-note");
		expect(screen.getByTestId("final-band-preview").textContent).toContain(
			"A2 (70%)",
		);

		fireEvent.change(screen.getByLabelText("Nhận xét bài kiểm tra đầu vào"), {
			target: { value: "Cần luyện nói thêm" },
		});

		fireEvent.click(screen.getByTestId("copy-zalo-result-btn"));
		await waitFor(() => expect(clipboardWriteMock).toHaveBeenCalled());

		fireEvent.click(screen.getByTestId("save-placement-grade-btn"));
		await waitFor(() => expect(gradePatchBody).not.toBeNull());
		expect(gradePatchBody).toEqual({
			writingRubric: { task: 9, coherence: 9, lexical: 9, grammar: 9 },
			writingScore: 9,
			speakingRubric: {
				fluency: 0,
				lexical: 0,
				grammar: 0,
				pronunciation: 0,
			},
			speakingScore: 0,
			teacherFeedback: "Cần luyện nói thêm",
			writingErrors: [],
			speakingErrors: [],
		});
		expect(toastMock.success).toHaveBeenCalled();
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
});
