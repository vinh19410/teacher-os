// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LeadListResponse, LeadRow } from "@teacher-os/api/lead-contracts";
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
});
