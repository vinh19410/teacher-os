// @vitest-environment jsdom
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock window.scrollTo
window.scrollTo = vi.fn();

const { mockGetSession, mockSignOut } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockSignOut: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
	createAuthClient: () => ({
		getSession: mockGetSession,
		signOut: mockSignOut,
	}),
}));

import { clearSessionCache, SESSION_CACHE_TTL_MS } from "@/lib/auth-client";
import { Route as AuthRoute } from "./route";

function RootLayout() {
	return (
		<div>
			<Outlet />
		</div>
	);
}

function DashboardStub() {
	return (
		<div>
			<h1>Tổng quan</h1>
			<Link to="/grading" data-testid="grading-link">
				Chấm bài
			</Link>
		</div>
	);
}

function GradingStub() {
	return (
		<div>
			<h1>Chấm bài</h1>
			<p>Hàng chờ chấm</p>
		</div>
	);
}

function LoginStub() {
	return (
		<div>
			<h1>Đăng nhập</h1>
		</div>
	);
}

describe("isolated grading navigation with session caching", () => {
	beforeEach(() => {
		clearSessionCache();
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
		clearSessionCache();
	});

	function buildTestRouter(initialEntry = "/dashboard") {
		const rootRoute = createRootRoute({
			component: RootLayout,
		});

		const authLayoutRoute = createRoute({
			getParentRoute: () => rootRoute,
			id: "_auth",
			beforeLoad: AuthRoute.options.beforeLoad,
			component: () => <Outlet />,
		});

		const dashboardRoute = createRoute({
			getParentRoute: () => authLayoutRoute,
			path: "/dashboard",
			component: DashboardStub,
		});

		const gradingRoute = createRoute({
			getParentRoute: () => authLayoutRoute,
			path: "/grading",
			component: GradingStub,
		});

		const loginRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: "/login",
			component: LoginStub,
		});

		const routeTree = rootRoute.addChildren([
			authLayoutRoute.addChildren([dashboardRoute, gradingRoute]),
			loginRoute,
		]);

		const history = createMemoryHistory({
			initialEntries: [initialEntry],
		});

		return createRouter({
			routeTree,
			history,
			defaultPreload: "intent",
			defaultPendingMs: 200,
		});
	}

	it("navigates immediately from /dashboard to /grading reusing cached session", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Cô Mỹ", email: "my@test.local" },
				session: { id: "s-1" },
			},
		};
		mockGetSession.mockResolvedValue(sampleSession);

		const router = buildTestRouter("/dashboard");
		render(<RouterProvider router={router} />);

		// Initial dashboard load
		await waitFor(() => {
			expect(router.state.status).toBe("idle");
		});
		expect(screen.getByRole("heading", { name: "Tổng quan" })).toBeDefined();

		const initialCalls = mockGetSession.mock.calls.length;
		expect(initialCalls).toBe(1);

		// Hover over the grading link (intent preload)
		const link = screen.getByTestId("grading-link");
		fireEvent.mouseEnter(link);

		// Click the grading link
		fireEvent.click(link);

		// Router should transition to /grading
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/grading");
		});

		// Content should immediately show "Chấm bài"
		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Chấm bài" })).toBeDefined();
		});

		// Calls to getSession should NOT duplicate (cached within 10s)
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});

	it("falls back to last known session on transient network error during active session", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Cô Mỹ", email: "my@test.local" },
				session: { id: "s-1" },
			},
		};
		mockGetSession.mockResolvedValueOnce(sampleSession);

		const router = buildTestRouter("/dashboard");
		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(router.state.status).toBe("idle");
		});

		// Simulate clock advancing past 10s TTL using Date.now spy so next navigation fetches
		const realNow = Date.now();
		const dateSpy = vi
			.spyOn(Date, "now")
			.mockReturnValue(realNow + SESSION_CACHE_TTL_MS + 1000);

		// Second network call fails with transient error (e.g. timeout / network drop)
		mockGetSession.mockRejectedValueOnce(new Error("Transient network error"));
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const link = screen.getByTestId("grading-link");
		fireEvent.click(link);

		// Router should still navigate without crashing or kicking user to login
		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/grading");
		});

		await waitFor(() => {
			expect(screen.getByRole("heading", { name: "Chấm bài" })).toBeDefined();
		});

		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
		dateSpy.mockRestore();
	});

	it("redirects to /login when unauthenticated user tries to access protected route", async () => {
		mockGetSession.mockResolvedValue({ data: null });

		const router = buildTestRouter("/dashboard");
		render(<RouterProvider router={router} />);

		await waitFor(() => {
			expect(router.state.location.pathname).toBe("/login");
		});

		expect(screen.getByRole("heading", { name: "Đăng nhập" })).toBeDefined();
	});
});
