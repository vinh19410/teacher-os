// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { resetPassword, toastError } = vi.hoisted(() => ({
	resetPassword: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		to,
		children,
		...rest
	}: {
		to: string;
		children?: React.ReactNode;
	}) => (
		<a href={to} {...rest}>
			{children}
		</a>
	),
}));
vi.mock("@/lib/auth-client", () => ({
	authClient: { resetPassword },
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import ResetPasswordForm from "./reset-password-form";

const INVALID_LINK = "This reset link is invalid or has expired.";

function submitPasswords(
	container: HTMLElement,
	newPassword: string,
	confirmPassword: string,
) {
	fireEvent.change(screen.getByLabelText("New password"), {
		target: { value: newPassword },
	});
	fireEvent.change(screen.getByLabelText("Confirm password"), {
		target: { value: confirmPassword },
	});
	const form = container.querySelector("form");
	if (!form) throw new Error("form not rendered");
	fireEvent.submit(form);
}

beforeEach(() => {
	resetPassword.mockReset();
	toastError.mockReset();
});
afterEach(cleanup);

describe("ResetPasswordForm", () => {
	it("updates the password with the token only and offers a sign-in link", async () => {
		resetPassword.mockResolvedValue({ error: null });
		const { container } = render(<ResetPasswordForm token="tok-123" />);
		expect(container.querySelector("form")?.className).toContain("grid gap-4");

		submitPasswords(container, "new-password-1", "new-password-1");

		expect(await screen.findByText("Password updated")).toBeTruthy();
		expect(resetPassword).toHaveBeenCalledWith({
			newPassword: "new-password-1",
			token: "tok-123",
		});
		const link = screen.getByRole("link", { name: "Sign in" });
		expect(link.getAttribute("href")).toBe("/login");
	});

	it("swaps the form for the invalid-link view on INVALID_TOKEN", async () => {
		resetPassword.mockResolvedValue({
			error: { code: "INVALID_TOKEN", status: 400 },
		});
		const { container } = render(<ResetPasswordForm token="tok-123" />);

		submitPasswords(container, "new-password-1", "new-password-1");

		expect(await screen.findByText(INVALID_LINK)).toBeTruthy();
		expect(container.querySelector("form")).toBeNull();
		const link = screen.getByRole("link", { name: /request a new link/i });
		expect(link.getAttribute("href")).toBe("/forgot-password");
	});

	it("keeps the form and toasts on other failures so the token can be retried", async () => {
		resetPassword.mockResolvedValue({ error: { status: 500 } });
		const { container } = render(<ResetPasswordForm token="tok-123" />);

		submitPasswords(container, "new-password-1", "new-password-1");

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"Couldn't update your password. Try again.",
			),
		);
		expect(container.querySelector("form")).not.toBeNull();
		expect(screen.queryByText(INVALID_LINK)).toBeNull();
	});

	it("blocks mismatched passwords without calling the API", async () => {
		const { container } = render(<ResetPasswordForm token="tok-123" />);

		submitPasswords(container, "new-password-1", "new-password-2");

		expect(await screen.findByText("Passwords do not match")).toBeTruthy();
		expect(resetPassword).not.toHaveBeenCalled();
	});

	it("enforces the minimum password length", async () => {
		const { container } = render(<ResetPasswordForm token="tok-123" />);

		submitPasswords(container, "short", "short");

		expect(
			await screen.findByText("Password must be at least 8 characters"),
		).toBeTruthy();
		expect(resetPassword).not.toHaveBeenCalled();
	});

	it("shows the invalid-link view without a token and never calls the API", () => {
		const { container } = render(<ResetPasswordForm token={undefined} />);

		expect(screen.getByText(INVALID_LINK)).toBeTruthy();
		expect(container.querySelector("form")).toBeNull();
		expect(resetPassword).not.toHaveBeenCalled();
	});
});
