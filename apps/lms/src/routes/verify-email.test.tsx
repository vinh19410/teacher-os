// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

const navMock = vi.hoisted(() => ({
	redirectReplace: vi.fn(),
	redirectAssign: vi.fn(),
	reloadPage: vi.fn(),
}));
vi.mock("@/lib/navigation", () => navMock);

const authMock = vi.hoisted(() => ({
	session: null as {
		user?: {
			id: string;
			email?: string;
			role?: string | null;
			emailVerified?: boolean;
		};
	} | null,
	isPending: false,
	sendVerificationEmail: vi.fn(),
}));

vi.mock("@/lib/auth-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth-client")>();
	return {
		...actual,
		authClient: {
			useSession: () => ({
				data: authMock.session,
				isPending: authMock.isPending,
			}),
			sendVerificationEmail: authMock.sendVerificationEmail,
		},
	};
});

import { Route as VerifyEmailRoute } from "./verify-email";

const VerifyEmailPage = (
	VerifyEmailRoute as unknown as { component: () => ReactNode }
).component;

beforeEach(() => {
	resetRouterState();
	authMock.session = null;
	authMock.isPending = false;
	authMock.sendVerificationEmail.mockReset();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("Unified /verify-email route", () => {
	it("offers role-specific CTA button on verified=ok", () => {
		const cases = [
			{ role: "teacher", label: "Vào trang giáo viên", href: "/teacher" },
			{ role: "admin", label: "Vào trang quản trị", href: "/admin" },
			{ role: "student", label: "Vào cổng học viên", href: "/student" },
			{ role: null, label: "Vào cổng học viên", href: "/student" },
		] as const;

		for (const item of cases) {
			routerState.search = { verified: "ok" };
			authMock.session = item.role
				? { user: { id: "u1", role: item.role, emailVerified: true } }
				: null;

			render(<VerifyEmailPage />);
			const button = screen.getByRole("button", { name: item.label });
			fireEvent.click(button);
			expect(navMock.redirectAssign).toHaveBeenCalledWith(item.href);

			cleanup();
			vi.clearAllMocks();
		}
	});

	it("allows resending verification email when link fails for signed-in unverified user", async () => {
		routerState.search = { error: "INVALID_TOKEN" };
		authMock.session = {
			user: {
				id: "u2",
				email: "unverified@example.com",
				role: "student",
				emailVerified: false,
			},
		};
		authMock.sendVerificationEmail.mockResolvedValue({
			data: { status: true },
			error: null,
		});

		render(<VerifyEmailPage />);
		fireEvent.click(
			screen.getByRole("button", { name: "Gửi lại email xác thực" }),
		);

		await waitFor(() => {
			expect(authMock.sendVerificationEmail).toHaveBeenCalledWith({
				email: "unverified@example.com",
				callbackURL: `${window.location.origin}/verify-email?verified=ok`,
			});
		});
		expect(screen.getByText(/Đã gửi lại — kiểm tra hộp thư/i)).toBeDefined();
	});
});
