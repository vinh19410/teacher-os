// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
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

const sessionMock = vi.hoisted(() => ({
	data: null as { user?: { id: string; role?: string | null } } | null,
	isPending: false,
}));
vi.mock("@/lib/auth-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth-client")>();
	return {
		...actual,
		authClient: {
			useSession: () => ({
				data: sessionMock.data,
				isPending: sessionMock.isPending,
			}),
		},
	};
});

import { Route as IndexRoute } from "./index";

const IndexPage = (IndexRoute as unknown as { component: () => ReactNode })
	.component;

beforeEach(() => {
	resetRouterState();
	sessionMock.data = null;
	sessionMock.isPending = false;
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("LMS root / auto-redirect", () => {
	it("shows Loader while session is pending and does not redirect yet", () => {
		sessionMock.isPending = true;
		render(<IndexPage />);
		expect(screen.getByRole("status", { name: "Đang tải" })).toBeDefined();
		expect(navMock.redirectReplace).not.toHaveBeenCalled();
		expect(routerState.navigate).not.toHaveBeenCalled();
	});

	it("navigates unauthenticated users to /login preserving returnUrl, error, and error_description", () => {
		routerState.search = {
			returnUrl: "/teacher/classes",
			error: "access_denied",
			error_description: "Cancelled",
		};
		render(<IndexPage />);
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/login",
			search: {
				returnUrl: "/teacher/classes",
				error: "access_denied",
				error_description: "Cancelled",
			},
			replace: true,
		});
		expect(navMock.redirectReplace).not.toHaveBeenCalled();
	});

	it("redirects authenticated teacher to /teacher or matching returnUrl and ignores foreign/open returnUrl", () => {
		sessionMock.data = { user: { id: "u1", role: "teacher" } };
		routerState.search = { returnUrl: "/teacher/classes/c-1?tab=students" };
		render(<IndexPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith(
			"/teacher/classes/c-1?tab=students",
		);

		cleanup();
		vi.clearAllMocks();
		routerState.search = { returnUrl: "/student/classes/c-1" };
		render(<IndexPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith("/teacher");

		cleanup();
		vi.clearAllMocks();
		routerState.search = { returnUrl: "https://evil.example/phish" };
		render(<IndexPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith("/teacher");
	});

	it("redirects authenticated student to /student and honors /student/* returnUrl", () => {
		sessionMock.data = { user: { id: "u2", role: "student" } };
		routerState.search = { returnUrl: "/student/classes/c-9" };
		render(<IndexPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith(
			"/student/classes/c-9",
		);
	});

	it("redirects authenticated admin to /admin", () => {
		sessionMock.data = { user: { id: "u3", role: "admin" } };
		render(<IndexPage />);
		expect(navMock.redirectReplace).toHaveBeenCalledWith("/admin");
	});
});
