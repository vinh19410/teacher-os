// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockInvitations = vi.fn();
const mockResendMutateAsync = vi.fn();

vi.mock("@/lib/repos/invitations", () => ({
	usePendingInvitations: () => mockInvitations(),
	useCancelInvitation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useResendInvitation: () => ({
		mutateAsync: mockResendMutateAsync,
		isPending: false,
	}),
	useResendStudentInvite: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

import { PendingInvitationsList } from "./pending-invitations-list";

afterEach(() => {
	cleanup();
	mockResendMutateAsync.mockReset();
});

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

	it("renders pending invitations with email, status badge, Gửi lại lời mời and Thu hồi (#570)", async () => {
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
		mockResendMutateAsync.mockResolvedValueOnce({
			ok: true,
			id: "inv-1",
			updatedAt: Date.now(),
		});

		render(<PendingInvitationsList />);
		expect(screen.getByText("student@example.com")).toBeTruthy();
		expect(screen.getByText("Đang chờ chấp nhận")).toBeTruthy();
		const resendBtn = screen.getByRole("button", { name: /Gửi lại lời mời/ });
		fireEvent.click(resendBtn);
		await waitFor(() => {
			expect(mockResendMutateAsync).toHaveBeenCalledWith("inv-1");
		});
	});
});
