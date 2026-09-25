import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockNotifications = vi.fn();

vi.mock("@/lib/repos/student", () => ({
	useStudentNotifications: () => mockNotifications(),
	useAcceptInvitation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useRejectInvitation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

import { NotificationBell } from "@/components/layout/notification-bell";

describe("NotificationBell", () => {
	it("renders bell icon without badge when there are no pending invitations", () => {
		mockNotifications.mockReturnValue({
			data: [],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<NotificationBell />);
		expect(html).toContain('aria-label="Thông báo"');
		expect(html).not.toContain('data-testid="notification-badge"');
	});

	it("renders badge with count when there are pending invitations", () => {
		mockNotifications.mockReturnValue({
			data: [
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
			],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<NotificationBell />);
		expect(html).toContain('data-testid="notification-badge"');
		expect(html).toContain(">2</span>");
	});

	it("renders sidebar variant with text and badge", () => {
		mockNotifications.mockReturnValue({
			data: [
				{
					id: "inv-1",
					orgId: "org-1",
					orgName: "Academy 1",
					inviterName: "Teacher One",
					status: "pending",
					createdAt: Date.now(),
				},
			],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<NotificationBell variant="sidebar" />);
		expect(html).toContain("Thông báo");
		expect(html).toContain('data-testid="notification-badge"');
		expect(html).toContain(">1</span>");
	});
});
