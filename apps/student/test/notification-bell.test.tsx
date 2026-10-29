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
const acceptMutateMock = vi.fn(() =>
	Promise.resolve({ ok: true, orgId: "org-1" }),
);
const rejectMutateMock = vi.fn(() => Promise.resolve({ ok: true }));
const markReadMutateMock = vi.fn(() => Promise.resolve({ ok: true }));

let invitations: Array<Record<string, unknown>> = [];
let inbox: { items: Array<Record<string, unknown>>; unread: number } = {
	items: [],
	unread: 0,
};

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentNotifications: () => ({
		data: invitations,
		isLoading: false,
	}),
	useStudentInbox: () => ({ data: inbox, isLoading: false }),
	useAcceptInvitation: () => ({ mutateAsync: acceptMutateMock }),
	useRejectInvitation: () => ({ mutateAsync: rejectMutateMock }),
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

const invite = {
	id: "inv-1",
	orgName: "Academy 1",
	inviterName: "Nguyễn Giáo Viên",
	status: "pending",
	createdAt: new Date().toISOString(),
};

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
	acceptMutateMock.mockClear();
	rejectMutateMock.mockClear();
	markReadMutateMock.mockClear();
	invitations = [];
	inbox = { items: [], unread: 0 };
});

afterEach(() => {
	cleanup();
});

describe("NotificationBell — inbox in-app (TOS-21 D7)", () => {
	it("badge = lời mời pending + unread, số aria-hidden, aria-label mô tả", () => {
		invitations = [invite];
		inbox = { items: [inboxItem], unread: 2 };
		renderBell();

		const badge = screen.getByTestId("notification-badge");
		expect(badge.textContent).toBe("3");
		expect(badge.getAttribute("aria-hidden")).toBe("true");
		expect(
			screen.getByRole("button", { name: /3 mục chưa xử lý/ }),
		).toBeTruthy();
	});

	it("bấm item thông báo → gọi mark read mutation và navigate theo linkPath", async () => {
		inbox = { items: [inboxItem], unread: 1 };
		renderBell();

		fireEvent.click(
			screen.getByRole("button", { name: "Thông báo (1 mục chưa xử lý)" }),
		);
		const item = await waitFor(() => screen.getByTestId("inbox-item"));
		fireEvent.click(item);

		await waitFor(() => {
			expect(markReadMutateMock).toHaveBeenCalledWith("n-1");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/attempts/at-1" });
		});
	});

	it("hiển thị tiêu đề, nội dung và chấm chưa đọc của item", () => {
		inbox = { items: [inboxItem], unread: 1 };
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: /1 mục chưa xử lý/ }));

		expect(screen.getByText("Bài kiểm tra đã được chấm")).toBeTruthy();
		expect(
			screen.getByText(
				"Giáo viên đã trả điểm bài kiểm tra IELTS Reading giữa kỳ.",
			),
		).toBeTruthy();
	});

	it("đã đọc (readAt có) → không chấm chưa đọc, badge không đếm", () => {
		inbox = {
			items: [{ ...inboxItem, readAt: new Date().toISOString() }],
			unread: 0,
		};
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));

		expect(screen.getByTestId("inbox-item")).toBeTruthy();
		expect(screen.queryByTestId("notification-badge")).toBeNull();
	});

	it("rỗng → 'Chưa có thông báo'", () => {
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByText("Chưa có thông báo")).toBeTruthy();
	});
});

describe("NotificationBell — lời mời org (giữ nguyên v1)", () => {
	it("hiện lời mời pending và bấm Chấp nhận gọi mutation", async () => {
		invitations = [invite];
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: /1 mục chưa xử lý/ }));

		expect(screen.getByText(/đã mời bạn tham gia tổ chức/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /Chấp nhận/ }));
		await waitFor(() => expect(acceptMutateMock).toHaveBeenCalledWith("inv-1"));
	});

	it("bấm Từ chối gọi reject mutation", async () => {
		invitations = [invite];
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: /1 mục chưa xử lý/ }));

		fireEvent.click(screen.getByRole("button", { name: /Từ chối/ }));
		await waitFor(() => expect(rejectMutateMock).toHaveBeenCalledWith("inv-1"));
	});

	it("Esc đóng panel", () => {
		renderBell();
		fireEvent.click(screen.getByRole("button", { name: "Thông báo" }));
		expect(screen.getByRole("dialog")).toBeTruthy();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

// Hai case legacy (port nguyên văn từ test/notification-bell.test.tsx cũ —
// giữ nguyên assertion khi gộp file test chuông TOS-21).
describe("NotificationBell — badge lời mời (case legacy)", () => {
	it("renders bell icon without badge when there are no pending invitations", () => {
		invitations = [];
		const { container } = renderBell();
		const html = container.innerHTML;
		expect(html).toContain('aria-label="Thông báo"');
		expect(html).not.toContain('data-testid="notification-badge"');
	});

	it("renders badge with count when there are pending invitations", () => {
		invitations = [
			{
				id: "inv-1",
				orgId: "org-1",
				orgName: "Academy 1",
				inviterName: "Teacher One",
				status: "pending",
				createdAt: Date.now(),
			},
			{
				id: "inv-2",
				orgId: "org-2",
				orgName: "Academy 2",
				inviterName: "Teacher Two",
				status: "pending",
				createdAt: Date.now(),
			},
		];
		const { container } = renderBell();
		const html = container.innerHTML;
		expect(html).toContain('data-testid="notification-badge"');
		expect(html).toContain(">2</span>");
	});
});
