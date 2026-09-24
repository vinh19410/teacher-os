import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockInvitations = vi.fn();

vi.mock("@/lib/repos/invitations", () => ({
	usePendingInvitations: () => mockInvitations(),
	useCancelInvitation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

import { PendingInvitationsList } from "./pending-invitations-list";

describe("PendingInvitationsList", () => {
	it("renders empty state when there are no pending invitations", () => {
		mockInvitations.mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
		});

		const html = renderToStaticMarkup(<PendingInvitationsList />);
		expect(html).toContain("Chưa có lời mời nào đang chờ");
	});

	it("renders pending invitations with email and status badge", () => {
		mockInvitations.mockReturnValue({
			data: [
				{
					id: "inv-1",
					email: "student@example.com",
					status: "pending",
					createdAt: Date.now(),
				},
			],
			isLoading: false,
			error: null,
		});

		const html = renderToStaticMarkup(<PendingInvitationsList />);
		expect(html).toContain("student@example.com");
		expect(html).toContain("Đang chờ chấp nhận");
		expect(html).toContain("Thu hồi");
	});
});
