// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	PlacementContent,
	PlacementTeacherStateResponse,
} from "@teacher-os/api/placement-test-contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));
const reauthMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	useBlocker: () => {},
	useNavigate: () => vi.fn(),
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/reauth", () => ({ reauth: reauthMock }));
vi.mock("@/lib/use-finance-route-guard", () => ({
	useFinanceRouteGuard: () => true,
}));

import { PlacementTestRoute } from "./index";

const AUDIO_ID = "11111111-1111-4111-8111-111111111111";

function makeSampleDraft(): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 49,
				cefr: "A1",
				course: "foundation-core",
				displayCourse: "Xây Nền Từ Gốc",
				advice: "Bắt đầu nền tảng.",
			},
			{
				min: 50,
				max: 100,
				cefr: "B1",
				course: "comm-2",
				displayCourse: "Giao tiếp 2",
				advice: "Luyện phản xạ.",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-la",
						partLabel: "Part A",
						instruction: "Listen carefully.",
						title: "Đoạn nghe 1",
						notesTitle: "",
						transcript: "Hello world",
						audioId: AUDIO_ID,
						maxPlays: 2,
						level: "A2",
						questions: [
							{
								id: "l-01",
								type: "mcq",
								level: "A2",
								prompt: "Where is the speaker?",
								options: ["Library", "Bank", "Park", "Cafe"],
								answer: 0,
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
						id: "vg-01",
						kind: "grammar",
						level: "A1",
						prompt: "My brother ______ to school every day.",
						options: ["go", "goes", "going", "went"],
						answer: 1,
					},
				],
			},
			{
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "p-1",
						partLabel: "Signs",
						kind: "sign",
						instruction: "Look at the sign.",
						title: "Park Sign",
						body: "NO DOGS ALLOWED",
						questions: [
							{
								id: "r-01",
								level: "A2",
								prompt: "",
								options: ["Dogs are welcome", "No dogs here", "Free pets"],
								answer: 1,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "Email",
				promptBody: "Write a short email.",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-01",
						partLabel: "Câu 1",
						level: "A2",
						prompt: "Where are you from?",
						prepSeconds: 10,
						answerSeconds: 30,
					},
				],
			},
		],
	};
}

function makeStateResponse(
	overrides: Partial<PlacementTeacherStateResponse> = {},
): PlacementTeacherStateResponse {
	return {
		draft: makeSampleDraft(),
		revision: 1,
		publishedVersion: 1,
		publishedAt: "2026-10-31T08:00:00.000Z",
		dirty: false,
		isLeadOrg: true,
		audio: {
			[AUDIO_ID]: {
				name: "clip-la.mp3",
				size: 102400,
				type: "audio/mpeg",
			},
		},
		...overrides,
	};
}

describe("PlacementTestRoute (/placement-test)", () => {
	beforeEach(() => {
		toastMock.success.mockReset();
		toastMock.error.mockReset();
		reauthMock.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	function renderEditor(initialState: PlacementTeacherStateResponse) {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				if (url.endsWith("/api/placement-test") && method === "GET") {
					return new Response(JSON.stringify(initialState), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				return new Response(JSON.stringify({ revision: 2, dirty: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementTestRoute />
			</QueryClientProvider>,
		);
		return { fetchMock };
	}

	it("hiển thị trạng thái rỗng với nút Nhập đề gốc khi draft === null", async () => {
		renderEditor(
			makeStateResponse({
				draft: null,
				revision: 0,
				publishedVersion: 0,
				publishedAt: null,
			}),
		);

		await waitFor(() => {
			expect(
				screen.getByText("Nhập đề gốc 5 kỹ năng (40 câu, 6 audio)"),
			).toBeTruthy();
		});
	});

	it("chuyển tab 5 kỹ năng và chặn Phát hành khi ngưỡng % chưa kết thúc bằng 100%", async () => {
		const badDraft = makeSampleDraft();
		badDraft.bands[1]!.max = 90;
		renderEditor(makeStateResponse({ draft: badDraft }));

		await waitFor(() => {
			expect(screen.getByTestId("total-questions-count").textContent).toBe("3");
		});

		fireEvent.click(screen.getByRole("tab", { name: /2\. Grammar & Vocab/ }));
		fireEvent.click(screen.getByText("Thêm câu hỏi G&V"));
		expect(screen.getByTestId("total-questions-count").textContent).toBe("4");

		fireEvent.click(screen.getByRole("tab", { name: /4\. Writing/ }));
		expect(screen.getByLabelText("Tiêu đề đề bài Writing")).toBeTruthy();

		fireEvent.click(screen.getByRole("tab", { name: /5\. Speaking/ }));
		expect(screen.getByLabelText("Nội dung Speaking 1")).toBeTruthy();

		fireEvent.click(screen.getByTestId("publish-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("publish-issues-banner")).toBeTruthy();
		});
		const banner = screen.getByTestId("publish-issues-banner");
		expect(
			within(banner).getByText(/Ngưỡng cuối cùng phải kết thúc đúng bằng 100%/),
		).toBeTruthy();
		expect(screen.queryByTestId("confirm-publish-btn")).toBeNull();
	});

	it("hiển thị cảnh báo xung đột 409 khi lưu nháp bị tab khác sửa trước", async () => {
		const state = makeStateResponse();
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				if (url.endsWith("/api/placement-test") && method === "GET") {
					return new Response(JSON.stringify(state), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.endsWith("/api/placement-test/draft") && method === "PUT") {
					return new Response(
						JSON.stringify({
							error: "PLACEMENT_REVISION_CONFLICT",
							code: "PLACEMENT_REVISION_CONFLICT",
						}),
						{
							status: 409,
							headers: { "content-type": "application/json" },
						},
					);
				}
				return new Response("{}", { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementTestRoute />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByLabelText("Nội dung câu 1")).toBeTruthy();
		});

		fireEvent.change(screen.getByLabelText("Nội dung câu 1"), {
			target: { value: "Edited question prompt" },
		});
		fireEvent.click(screen.getByTestId("save-draft-btn"));

		await waitFor(() => {
			expect(
				screen.getByText("Đề đã được sửa ở tab khác, tải lại để tiếp tục"),
			).toBeTruthy();
		});
	});

	it("hiển thị danh sách lỗi 422 từ server khi phát hành bị từ chối", async () => {
		const state = makeStateResponse();
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				if (url.endsWith("/api/placement-test") && method === "GET") {
					return new Response(JSON.stringify(state), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.endsWith("/api/placement-test/publish") && method === "POST") {
					return new Response(
						JSON.stringify({
							error: "PLACEMENT_INVALID",
							code: "PLACEMENT_INVALID",
							issues: [
								{
									path: "parts.0.clips.0.audioId",
									message:
										"File âm thanh không tồn tại hoặc không thuộc tổ chức này.",
								},
							],
						}),
						{
							status: 422,
							headers: { "content-type": "application/json" },
						},
					);
				}
				return new Response(JSON.stringify({ revision: 2, dirty: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementTestRoute />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("publish-btn")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("publish-btn"));
		await waitFor(() => {
			expect(screen.getByTestId("confirm-publish-btn")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("confirm-publish-btn"));
		await waitFor(() => {
			expect(
				screen.getAllByText(
					"File âm thanh không tồn tại hoặc không thuộc tổ chức này.",
				).length,
			).toBeGreaterThan(0);
		});
	});

	it("nút Nhập lại đề gốc mẫu mở hộp xác nhận rồi tải seed + upload audio + lưu nháp", async () => {
		const sampleSeed = makeSampleDraft();
		sampleSeed.parts[0].clips[0]!.audioId = null;

		const state = makeStateResponse();
		let draftPutCalls = 0;
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = typeof input === "string" ? input : input.toString();
				const method = init?.method ?? "GET";
				if (url.endsWith("/api/placement-test") && method === "GET") {
					return new Response(JSON.stringify(state), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.includes("/placement-seed/questions.json")) {
					return new Response(JSON.stringify(sampleSeed), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				if (url.includes("/placement-seed/clip-la.mp3")) {
					return new Response(new Uint8Array([0x49, 0x44, 0x33, 0x03]), {
						status: 200,
						headers: { "content-type": "audio/mpeg" },
					});
				}
				if (url.endsWith("/api/placement-test/draft") && method === "PUT") {
					draftPutCalls += 1;
					return new Response(JSON.stringify({ revision: 2, dirty: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}
				return new Response("{}", { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		// uploadAudio uses XMLHttpRequest; mock minimal XHR for jsdom
		class MockXhr {
			status = 200;
			responseText = JSON.stringify({
				audioId: AUDIO_ID,
				name: "clip-la.mp3",
				size: 4,
				type: "audio/mpeg",
			});
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			onabort: (() => void) | null = null;
			upload = { onprogress: null as ((e: unknown) => void) | null };
			open() {}
			setRequestHeader() {}
			send() {
				queueMicrotask(() => this.onload?.());
			}
		}
		vi.stubGlobal("XMLHttpRequest", MockXhr);

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<PlacementTestRoute />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("reimport-seed-btn")).toBeTruthy();
		});

		fireEvent.click(screen.getByTestId("reimport-seed-btn"));
		const confirmBtn = await screen.findByTestId("confirm-reimport-btn");
		fireEvent.click(confirmBtn);

		await waitFor(() => expect(draftPutCalls).toBe(1));
		expect(toastMock.success).toHaveBeenCalled();
	});
});
