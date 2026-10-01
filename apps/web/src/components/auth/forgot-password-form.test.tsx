// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestPasswordReset, toastError } = vi.hoisted(() => ({
	requestPasswordReset: vi.fn(),
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
	authClient: { requestPasswordReset },
}));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import ForgotPasswordForm from "./forgot-password-form";

const SENT =
	"If an account exists for that email, we sent a reset link. It expires in 1 hour.";

function submitEmail(container: HTMLElement, email: string) {
	fireEvent.change(screen.getByLabelText("Email"), {
		target: { value: email },
	});
	const form = container.querySelector("form");
	if (!form) throw new Error("form not rendered");
	fireEvent.submit(form);
}

beforeEach(() => {
	requestPasswordReset.mockReset();
	toastError.mockReset();
});
afterEach(cleanup);

describe("ForgotPasswordForm", () => {
	it("sends the reset request, shows the neutral notice and locks the button with a countdown", async () => {
		requestPasswordReset.mockResolvedValue({ error: null });
		const { container } = render(<ForgotPasswordForm />);

		submitEmail(container, "  teacher@school.edu ");

		expect(await screen.findByText(SENT)).toBeTruthy();
		expect(requestPasswordReset).toHaveBeenCalledTimes(1);
		const payload = requestPasswordReset.mock.calls[0][0] as {
			email: string;
			redirectTo: string;
		};
		expect(payload.email).toBe("teacher@school.edu");
		expect(payload.redirectTo).toBe(`${window.location.origin}/reset-password`);
		const button = screen.getByRole("button", { name: /Resend in \d+s/ });
		expect((button as HTMLButtonElement).disabled).toBe(true);
		expect(toastError).not.toHaveBeenCalled();
	});

	it("shows dedicated copy on 429 and never the success notice", async () => {
		requestPasswordReset.mockResolvedValue({ error: { status: 429 } });
		const { container } = render(<ForgotPasswordForm />);

		submitEmail(container, "teacher@school.edu");

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"Too many requests. Wait a minute and try again.",
			),
		);
		expect(screen.queryByText(SENT)).toBeNull();
	});

	it("keeps the form and toasts on a network rejection", async () => {
		requestPasswordReset.mockRejectedValue(new Error("offline"));
		const { container } = render(<ForgotPasswordForm />);

		submitEmail(container, "teacher@school.edu");

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"Couldn't send the reset email. Try again.",
			),
		);
		expect(screen.queryByText(SENT)).toBeNull();
		const button = screen.getByRole("button", { name: "Send reset link" });
		expect((button as HTMLButtonElement).disabled).toBe(false);
	});

	it("rejects an invalid email without calling the API", async () => {
		const { container } = render(<ForgotPasswordForm />);

		submitEmail(container, "not-an-email");

		expect(await screen.findByText("Invalid email address")).toBeTruthy();
		expect(requestPasswordReset).not.toHaveBeenCalled();
	});
});
