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
const mockStudentResendMutateAsync = vi.fn();

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
		mutateAsync: mockStudentResendMutateAsync,
		isPending: false,
	}),
}));

import { PendingInvitationsList } from "./pending-invitations-list";

afterEach(() => {
	cleanup();
	mockResendMutateAsync.mockReset();
	mockStudentResendMutateAsync.mockReset();
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

	it("#616: renders pending students alongside invitations with Chờ xác nhận badge and Gửi lại lời mời", async () => {
		mockInvitations.mockReturnValue({
			data: [
				{
					id: "inv-1",
					email: "invitee@example.com",
					status: "pending",
					createdAt: Date.now(),
				},
			],
			isLoading: false,
			error: null,
		});
		mockStudentResendMutateAsync.mockResolvedValueOnce({
			ok: true,
			id: "st-1",
			updatedAt: Date.now(),
		});

		render(
			<PendingInvitationsList
				pendingStudents={[
					{
						id: "st-1",
						name: "Nguyễn Văn Đang Chờ",
						email: "student@example.com",
					},
				]}
			/>,
		);

		expect(screen.getByText("Nguyễn Văn Đang Chờ")).toBeTruthy();
		expect(screen.getByText("student@example.com")).toBeTruthy();
		expect(screen.getByText("Chờ xác nhận")).toBeTruthy();
		expect(screen.getByText("invitee@example.com")).toBeTruthy();
		expect(screen.getByText("Đang chờ chấp nhận")).toBeTruthy();

		// Student row has resend button with label student@example.com, no Thu hồi button
		const resendButtons = screen.getAllByRole("button", {
			name: /Gửi lại lời mời/,
		});
		expect(resendButtons).toHaveLength(2);
		const firstResendBtn = resendButtons[0];
		expect(firstResendBtn).toBeDefined();
		if (firstResendBtn) {
			fireEvent.click(firstResendBtn);
		}
		await waitFor(() => {
			expect(mockStudentResendMutateAsync).toHaveBeenCalledWith({
				studentId: "st-1",
			});
		});

		// Only 1 Thu hồi button (for invitation, not student)
		const cancelButtons = screen.getAllByRole("button", { name: /Thu hồi/ });
		expect(cancelButtons).toHaveLength(1);
	});

	it("#616: still renders pending students when usePendingInvitations is loading or error", () => {
		mockInvitations.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});

		const { rerender } = render(
			<PendingInvitationsList
				pendingStudents={[
					{
						id: "st-1",
						name: "Học Viên Chờ",
						email: "pending@example.com",
					},
				]}
			/>,
		);

		expect(screen.getByText("Học Viên Chờ")).toBeTruthy();
		expect(screen.queryByText("Chưa có lời mời nào đang chờ")).toBeNull();

		mockInvitations.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("Network error"),
		});

		rerender(
			<PendingInvitationsList
				pendingStudents={[
					{
						id: "st-1",
						name: "Học Viên Chờ",
						email: "pending@example.com",
					},
				]}
			/>,
		);

		expect(screen.getByText("Học Viên Chờ")).toBeTruthy();
	});

	it("#616: deduplicates invitation if student has the same email case-insensitively", () => {
		mockInvitations.mockReturnValue({
			data: [
				{
					id: "inv-dupe",
					email: "Duplicate@example.com",
					status: "pending",
					createdAt: Date.now(),
				},
			],
			isLoading: false,
			error: null,
		});

		render(
			<PendingInvitationsList
				pendingStudents={[
					{
						id: "st-dupe",
						name: "Trùng Email",
						email: "duplicate@example.com",
					},
				]}
			/>,
		);

		expect(screen.getByText("Trùng Email")).toBeTruthy();
		expect(screen.getByText("Chờ xác nhận")).toBeTruthy();
		expect(screen.queryByText("Đang chờ chấp nhận")).toBeNull();
		expect(
			screen.getAllByRole("button", { name: /Gửi lại lời mời/ }),
		).toHaveLength(1);
	});
});
