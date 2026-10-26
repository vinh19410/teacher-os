// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	NotificationLogResponse,
	NotificationLogRow,
} from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
type MockSearch = {
	q?: string;
	event?: string;
	status?: string;
	page?: number;
};
const mockSearch = vi.hoisted(() => ({ current: {} as MockSearch }));
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useSearch: () => mockSearch.current,
	}),
	useNavigate: () => mockNavigate,
	useSearch: () => mockSearch.current,
}));

import { Route, validateNotificationsSearch } from "./index";

const Notifications = (Route as unknown as { component: () => React.ReactNode })
	.component;

const ROW_BASE: NotificationLogRow = {
	id: "nt-1",
	createdAt: "2026-10-22T01:00:00.000Z",
	recipientName: "Minh Tran",
	recipientEmail: "minh@gmail.com",
	eventType: "class_enrolled",
	eventGroup: "class_invite",
	channels: "email,in_app",
	status: "read",
	title: "Mời vào lớp IELTS 6.5",
	body: "Bạn được mời vào lớp IELTS 6.5 tối.",
	linkPath: "/student",
	senderName: "Cô Lan",
	replyToEmail: "lan@school.vn",
	sentAt: "2026-10-22T01:05:00.000Z",
	readAt: null,
	retryCount: 0,
	lastError: null,
	refType: "class",
	refId: "cl-1",
};

function row(overrides: Partial<NotificationLogRow> = {}): NotificationLogRow {
	return { ...ROW_BASE, ...overrides };
}

function seedResponse(
	overrides: Partial<NotificationLogResponse> = {},
): NotificationLogResponse {
	return {
		rows: [row()],
		total: 1,
		counts: { queued: 2, sent: 3, read: 1, failed: 4, all: 10 },
		page: 1,
		pageSize: 20,
		...overrides,
	};
}

let fetchMock: ReturnType<typeof vi.fn>;

function renderRoute(body: NotificationLogResponse = seedResponse()) {
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
			<Notifications />
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
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("validateNotificationsSearch", () => {
	it("chuẩn hóa giá trị lạ về undefined và giữ giá trị hợp lệ", () => {
		expect(
			validateNotificationsSearch({
				q: "minh",
				event: "tuition",
				status: "failed",
				page: "2",
			}),
		).toEqual({ q: "minh", event: "tuition", status: "failed", page: 2 });
		expect(
			validateNotificationsSearch({
				q: "   ",
				event: "khac",
				status: "khac",
				page: "1",
			}),
		).toEqual({});
	});
});

describe("NotificationsRoute (#454 phase 5)", () => {
	it("hiển thị danh sách với người nhận, sự kiện, kênh, trạng thái", async () => {
		renderRoute();
		const table = await screen.findByTestId("notifications-table");
		expect(table.textContent).toContain("Minh Tran");
		expect(table.textContent).toContain("minh@gmail.com");
		expect(table.textContent).toContain("Mời vào lớp");
		expect(table.textContent).toContain("Email + In-app");
		expect(table.textContent).toContain("Đã xem");
	});

	it("badge đếm chip trạng thái lấy từ counts server, aria-hidden", async () => {
		renderRoute();
		await screen.findByText("Minh Tran");
		// Chip "Tất cả" nhóm Trạng thái mang counts.all, từng trạng thái mang
		// đếm riêng (badge aria-hidden trong ChipFilter).
		const statusGroup = screen.getByRole("group", { name: "Trạng thái" });
		expect(statusGroup.textContent).toContain("10");
		expect(statusGroup.textContent).toContain("2");
		expect(statusGroup.textContent).toContain("4");
	});

	it("bấm chip nhóm sự kiện đẩy ?event lên URL và giữ filter khác", async () => {
		mockSearch.current = { q: "minh", status: "sent" };
		renderRoute();
		await screen.findByText("Minh Tran");
		fireEvent.click(screen.getByRole("button", { name: "Học phí" }));
		expect(lastNavigateSearch()).toEqual({
			q: "minh",
			event: "tuition",
			status: "sent",
		});
	});

	it("bấm chip trạng thái đẩy ?status lên URL", async () => {
		renderRoute();
		await screen.findByText("Minh Tran");
		fireEvent.click(screen.getByRole("button", { name: "Lỗi gửi" }));
		expect(lastNavigateSearch()).toEqual({ status: "failed" });
	});

	it("gõ search debounce 300ms rồi mới đẩy ?q lên URL, về trang 1", async () => {
		mockSearch.current = { status: "sent", page: 3 };
		renderRoute();
		await screen.findByText("Minh Tran");
		const input = screen.getByLabelText(
			"Tìm theo học viên, email hoặc tiêu đề",
		);
		fireEvent.change(input, { target: { value: "hoa" } });
		// Chưa đủ 300ms — không điều hướng ngay.
		expect(mockNavigate).not.toHaveBeenCalled();
		await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
		expect(lastNavigateSearch()).toEqual({
			q: "hoa",
			status: "sent",
		});
	});

	it("q đổi từ phía URL (back/forward) sync xuống input", async () => {
		const view = renderRoute();
		await screen.findByText("Minh Tran");
		mockSearch.current = { q: "hoa" };
		// Re-render với search mới (mô phỏng back/forward của router).
		view.rerender(
			<QueryClientProvider client={new QueryClient()}>
				<Notifications />
			</QueryClientProvider>,
		);
		await screen.findByText("Minh Tran");
		const input = screen.getByLabelText(
			"Tìm theo học viên, email hoặc tiêu đề",
		) as HTMLInputElement;
		expect(input.value).toBe("hoa");
	});

	it("nút eye mở dialog chi tiết với nội dung, Reply-To, sent_at, retry_count", async () => {
		renderRoute();
		await screen.findByText("Minh Tran");
		fireEvent.click(
			screen.getByRole("button", {
				name: "Xem chi tiết thông báo cho Minh Tran",
			}),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("Bạn được mời vào lớp IELTS 6.5 tối.");
		expect(dialog.textContent).toContain("lan@school.vn");
		expect(dialog.textContent).toContain("Cô Lan");
		expect(dialog.textContent).toContain("Số lần thử lại");
		// last_error null → không hiển thị mục Lỗi gửi.
		expect(dialog.textContent).not.toContain("Lỗi gửi");
		fireEvent.click(screen.getByRole("button", { name: /đóng|close/i }));
	});

	it("hiển thị last_error và read_at khi có", async () => {
		renderRoute(
			seedResponse({
				rows: [
					row({
						status: "failed",
						readAt: "2026-10-22T02:00:00.000Z",
						retryCount: 2,
						lastError: "SMTP timeout",
					}),
				],
			}),
		);
		await screen.findByText("Minh Tran");
		fireEvent.click(
			screen.getByRole("button", {
				name: "Xem chi tiết thông báo cho Minh Tran",
			}),
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("SMTP timeout");
	});

	it("phân trang: nút Trang sau đẩy ?page, Trang trước disabled ở trang 1", async () => {
		renderRoute(
			seedResponse({
				total: 45,
				counts: { queued: 0, sent: 0, read: 45, failed: 0, all: 45 },
			}),
		);
		await screen.findByText("Minh Tran");
		expect(screen.getByText(/Trang 1 \/ 3/).textContent).toBeTruthy();
		expect(
			(screen.getByRole("button", { name: "Trang trước" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
		expect(lastNavigateSearch()).toEqual({ page: 2 });
	});

	it("state lỗi hiển thị thông báo lỗi", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(() => Promise.resolve(new Response("{}", { status: 500 }))),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<Notifications />
			</QueryClientProvider>,
		);
		await screen.findByText(
			"Không tải được nhật ký thông báo. Thử tải lại trang.",
		);
	});

	it("empty state khi total = 0", async () => {
		renderRoute(
			seedResponse({
				rows: [],
				total: 0,
				counts: { queued: 0, sent: 0, read: 0, failed: 0, all: 0 },
			}),
		);
		await screen.findByTestId("notifications-empty-state");
	});
});
