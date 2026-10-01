// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendVerificationEmail, useSession } = vi.hoisted(() => ({
	sendVerificationEmail: vi.fn(),
	useSession: vi.fn(),
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
	authClient: { sendVerificationEmail, useSession },
}));

import VerifyEmailView from "./verify-email-view";

beforeEach(() => {
	sendVerificationEmail.mockReset();
	useSession.mockReset();
	// Default: no session at all (signed-out visitor landing on a stale link).
	useSession.mockReturnValue({ data: null, isPending: false });
});
afterEach(cleanup);

describe("VerifyEmailView", () => {
	it("renders the success card for a verified landing", () => {
		render(<VerifyEmailView verified="ok" />);

		expect(screen.getByText("Email verified")).toBeTruthy();
		expect(
			screen.getByText(
				"Your email address has been confirmed. You're all set.",
			),
		).toBeTruthy();
		expect(screen.getByText("Go to workspace")).toBeTruthy();
		expect(screen.queryByText("This link didn't work")).toBeNull();
	});

	it("renders the error card for a failed token and never leaks the raw error code", () => {
		render(<VerifyEmailView error="TOKEN_EXPIRED" />);

		expect(screen.getByText("This link didn't work")).toBeTruthy();
		expect(
			screen.getByText(
				"The verification link is invalid, already used, or has expired. Request a new one, or sign in and continue.",
			),
		).toBeTruthy();
		expect(screen.queryByText("Email verified")).toBeNull();
		expect(screen.queryByText(/TOKEN_EXPIRED/)).toBeNull();
	});

	it("treats a direct nav without params as the error card", () => {
		render(<VerifyEmailView />);

		expect(screen.getByText("This link didn't work")).toBeTruthy();
		expect(screen.queryByText("Go to workspace")).toBeNull();
	});

	it("offers resend for a signed-in unverified user and calls back to /verify-email?verified=ok", async () => {
		useSession.mockReturnValue({
			data: { user: { email: "t@school.edu", emailVerified: false } },
			isPending: false,
		});
		sendVerificationEmail.mockResolvedValue({ error: null });
		render(<VerifyEmailView error="INVALID_TOKEN" />);

		const button = screen.getByText("Send a new link");
		fireEvent.click(button);

		await waitFor(() => expect(sendVerificationEmail).toHaveBeenCalledTimes(1));
		const payload = sendVerificationEmail.mock.calls[0][0] as {
			email: string;
			callbackURL: string;
		};
		expect(payload.email).toBe("t@school.edu");
		expect(payload.callbackURL).toBe(
			`${window.location.origin}/verify-email?verified=ok`,
		);
		expect(
			await screen.findByText("We've sent a new verification email."),
		).toBeTruthy();
		expect(screen.queryByText("Send a new link")).toBeNull();
	});

	it("links back to sign in when there is no unverified session", () => {
		render(<VerifyEmailView error="INVALID_TOKEN" />);

		expect(screen.getByText("Back to sign in")).toBeTruthy();
		expect(screen.queryByText("Send a new link")).toBeNull();
	});

	it("links back to sign in when the session is already verified", () => {
		useSession.mockReturnValue({
			data: { user: { email: "t@school.edu", emailVerified: true } },
			isPending: false,
		});
		render(<VerifyEmailView error="INVALID_TOKEN" />);

		expect(screen.getByText("Back to sign in")).toBeTruthy();
		expect(screen.queryByText("Send a new link")).toBeNull();
	});
});
