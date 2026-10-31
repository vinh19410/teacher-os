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
			{ min: 0, max: 1, cefr: "A1", course: "ielts-foundation" },
			{ min: 2, max: 2, cefr: "B1", course: "ielts-pre" },
		],
		parts: [
			{
				id: "vocab-grammar",
				title: "Vocab + Grammar",
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
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-1",
						audioId: AUDIO_ID,
						maxPlays: 2,
						level: "A2",
						title: "Đoạn nghe 1",
						questions: [
							{
								id: "l-01",
								level: "A2",
								prompt: "Where is the speaker?",
								options: ["Library", "Bank", "Park", "Cafe"],
								answer: 0,
							},
						],
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
				name: "clip-1.mp3",
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
			expect(screen.getByText("Nhập đề gốc (30 câu, 5 audio)")).toBeTruthy();
		});
	});

	it("cập nhật tổng điểm ở mục Ngưỡng khi thêm câu hỏi và chặn Phát hành khi ngưỡng chưa phủ tới tổng điểm", async () => {
		renderEditor(makeStateResponse());

		await waitFor(() => {
			expect(screen.getByTestId("total-questions-count").textContent).toBe("2");
		});

		fireEvent.click(screen.getByText("Thêm câu hỏi Phần 1"));
		expect(screen.getByTestId("total-questions-count").textContent).toBe("3");

		// Bấm Phát hành khi ngưỡng cuối vẫn dừng ở 2 -> hiện lỗi, không mở hộp xác nhận
		fireEvent.click(screen.getByTestId("publish-btn"));

		await waitFor(() => {
			expect(screen.getByTestId("publish-issues-banner")).toBeTruthy();
		});
		const banner = screen.getByTestId("publish-issues-banner");
		expect(
			within(banner).getByText(
				/Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu \(3\)/,
			),
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
									path: "parts.1.clips.0.audioId",
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
});
