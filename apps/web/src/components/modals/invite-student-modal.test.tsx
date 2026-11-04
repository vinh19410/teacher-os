// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inviteMutateAsync = vi.fn();
const resendInvMutateAsync = vi.fn();
const resendStudentMutateAsync = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		error: (...args: unknown[]) => toastError(...args),
	},
}));

vi.mock("@/lib/repos/invitations", () => ({
	useInviteStudent: () => ({
		mutateAsync: inviteMutateAsync,
		isPending: false,
	}),
	useResendInvitation: () => ({
		mutateAsync: resendInvMutateAsync,
		isPending: false,
	}),
	useResendStudentInvite: () => ({
		mutateAsync: resendStudentMutateAsync,
		isPending: false,
	}),
}));

import { InviteStudentModal } from "./invite-student-modal";

beforeEach(() => {
	inviteMutateAsync.mockReset();
	resendInvMutateAsync.mockReset();
	resendStudentMutateAsync.mockReset();
	toastSuccess.mockReset();
	toastError.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("InviteStudentModal", () => {
	it("renders nothing when closed", () => {
		const html = renderToStaticMarkup(
			<InviteStudentModal open={false} onClose={() => {}} />,
		);
		expect(html).toBe("");
	});

	it("renders the modal, email field and buttons when open", () => {
		const html = renderToStaticMarkup(
			<InviteStudentModal open={true} onClose={() => {}} />,
		);
		expect(html).toContain("Mời học viên vào tổ chức");
		expect(html).toContain("Email học viên");
		expect(html).toContain('type="email"');
		expect(html).toContain("Gửi lời mời");
		expect(html).toContain("Hủy");
	});

	it("#570: does NOT toast success or close modal when email sending fails (502)", async () => {
		const onClose = vi.fn();
		inviteMutateAsync.mockRejectedValueOnce(
			Object.assign(new Error("Không gửi được email lời mời."), {
				code: "INVITATION_EMAIL_FAILED",
				status: 502,
			}),
		);
		render(<InviteStudentModal open={true} onClose={onClose} />);
		fireEvent.change(screen.getByPlaceholderText("hocvien@example.com"), {
			target: { value: "fail@bounce.test" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Gửi lời mời" }));

		await waitFor(() => {
			expect(screen.getByText("Không gửi được email lời mời.")).toBeTruthy();
		});
		expect(toastSuccess).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("#570: shows Chờ xác nhận + Gửi lại lời mời when email has unjoined profile (portalLinked=false)", async () => {
		inviteMutateAsync.mockRejectedValueOnce(
			Object.assign(new Error("Học viên này đã ở trong tổ chức của bạn"), {
				code: "STUDENT_ALREADY_IN_ORG",
				existingStudentId: "stu-88",
				existingStudentName: "Nguyễn Minh",
				portalLinked: false,
				status: 409,
			}),
		);
		resendStudentMutateAsync.mockResolvedValueOnce({
			ok: true,
			id: "stu-88",
			updatedAt: Date.now(),
		});
		const onClose = vi.fn();
		render(<InviteStudentModal open={true} onClose={onClose} />);
		fireEvent.change(screen.getByPlaceholderText("hocvien@example.com"), {
			target: { value: "minh@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Gửi lời mời" }));

		await waitFor(() => {
			expect(screen.getByText("Chờ xác nhận")).toBeTruthy();
		});
		const resendBtn = screen.getByRole("button", { name: /Gửi lại lời mời/ });
		fireEvent.click(resendBtn);

		await waitFor(() => {
			expect(resendStudentMutateAsync).toHaveBeenCalledWith({
				studentId: "stu-88",
			});
		});
		expect(toastSuccess).toHaveBeenCalled();
	});

	it("#570: shows joined message without resend button when portalLinked=true", async () => {
		inviteMutateAsync.mockRejectedValueOnce(
			Object.assign(new Error("Học viên này đã ở trong tổ chức của bạn"), {
				code: "STUDENT_ALREADY_IN_ORG",
				existingStudentId: "stu-99",
				existingStudentName: "Trần An",
				portalLinked: true,
				status: 409,
			}),
		);
		render(<InviteStudentModal open={true} onClose={() => {}} />);
		fireEvent.change(screen.getByPlaceholderText("hocvien@example.com"), {
			target: { value: "an@example.com" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Gửi lời mời" }));

		await waitFor(() => {
			expect(screen.getByText(/đã tham gia cổng học viên/i)).toBeTruthy();
		});
		expect(
			screen.queryByRole("button", { name: /Gửi lại lời mời/ }),
		).toBeNull();
	});
});
