// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBell } from "@/components/layout/notification-bell";

const navigateMock = vi.fn();
const markReadMutateMock = vi.fn(() => Promise.resolve({ ok: true }));

let inbox: { items: Array<Record<string, unknown>>; unread: number } = {
	items: [],
	unread: 0,
};
let inboxLoading = false;

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentInbox: () => ({ data: inbox, isLoading: inboxLoading }),
	useMarkInboxRead: () => ({
		mutateAsync: markReadMutateMock,
		isPending: false,
	}),
}));

function renderBell() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<NotificationBell />
		</QueryClientProvider>,
	);
}

const inboxItem = {
	id: "n-1",
	eventType: "grade_returned",
	title: "Bài kiểm tra đã được chấm",
	body: "Giáo viên đã trả điểm bài kiểm tra IELTS Reading giữa kỳ.",
	linkPath: "/attempts/at-1",
	status: "sent",
	readAt: null,
	createdAt: new Date().toISOString(),
};

beforeEach(() => {
	const store = new Map<string, string>();
	Object.defineProperty(window, "localStorage", {
		value: {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => store.set(key, value),
			removeItem: (key: string) => store.delete(key),
		},
		configurable: true,
	});
	navigateMock.mockReset();
	markReadMutateMock.mockClear();
	inbox = { items: [], unread: 0 };
	inboxLoading = false;
});

afterEach(() => {
	cleanup();
});

describe("NotificationBell — inbox-only (#716)", () => {
	it("badge bằng inbox.unread, số aria-hidden, aria-label mô tả", () => {
		inbox = { items: [inboxItem], unread: 2 };
		renderBell();

		const badge = screen.getByTestId("notification-badge");
		expect(badge.textContent).toBe("2");
		expect(badge.getAttribute("aria-hidden")).toBe("true");
		expect(
			screen.getByRole("button", { name: /2 mục chưa xử lý/ }),
		).toBeTruthy();
	});

	it("không hiển thị badge khi inbox.unread === 0", () => {
		inbox = { items: [], unread: 0 };
		const { container } = renderBell();
		expect(screen.getByRole("button", { name: "Thông báo" })).toBeTruthy();
		expect(container.innerHTML).not.toContain(
			'data-testid="notification-badge"',
		);
	});

	it("bấm item thông báo chưa đọc → đánh dấu đã đọc, navigate theo linkPath và đóng popover", async () => {
		inbox = { items: [inboxItem], unread: 1 };
		renderBell();

		fireEvent.click(
			screen.getByRole("button", { name: "Thông báo (1 mục chưa xử lý)" }),
		);
		expect(screen.getByRole("dialog")).toBeTruthy();
		const item = await waitFor(() => screen.getByTestId("inbox-item"));
		fireEvent.click(item);

		await waitFor(() => {
			expect(markReadMutateMock).toHaveBeenCalledWith("n-1");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/attempts/at-1" });
			expect(screen.queryByRole("dialog")).toBeNull();
		});
	});

	it("hiển thị tiêu đề, nội dung của item và không có UI lời mời org", () => {
		inbox = { items: [inboxItem], unread: 1 };
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: /1 mục chưa xử lý/ }));

		expect(screen.getByText("Bài kiểm tra đã được chấm")).toBeTruthy();
		expect(
			screen.getByText(
				"Giáo viên đã trả điểm bài kiểm tra IELTS Reading giữa kỳ.",
			),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Chấp nhận/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /Từ chối/ })).toBeNull();
		expect(screen.queryByText("Lời mời")).toBeNull();
	});

	it("đã đọc (readAt có) → không hiển thị badge", () => {
		inbox = {
			items: [{ ...inboxItem, readAt: new Date().toISOString() }],
			unread: 0,
		};
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));

		expect(screen.getByTestId("inbox-item")).toBeTruthy();
		expect(screen.queryByTestId("notification-badge")).toBeNull();
	});

	it("rỗng → 'Chưa có thông báo' và không có nút Chấp nhận / Từ chối", () => {
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByText("Chưa có thông báo")).toBeTruthy();
		expect(screen.queryByRole("button", { name: /Chấp nhận/ })).toBeNull();
		expect(screen.queryByRole("button", { name: /Từ chối/ })).toBeNull();
	});

	it("hiển thị trạng thái đang tải khi isInboxLoading=true", () => {
		inboxLoading = true;
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByText("Đang tải thông báo...")).toBeTruthy();
	});

	it("Esc đóng dialog", () => {
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByRole("dialog")).toBeTruthy();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
