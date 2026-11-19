import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getCachedSession: vi.fn(),
	clearSessionCache: vi.fn(),
	signOut: vi.fn(),
	syncStudentSessionUser: vi.fn(),
	redirect: vi.fn((options: unknown) => ({ __redirect: true, options })),
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => options,
	Outlet: () => null,
	redirect: mocks.redirect,
}));

vi.mock("@/lib/auth-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/auth-client")>();
	return {
		...actual,
		authClient: {
			getCachedSession: mocks.getCachedSession,
			clearSessionCache: mocks.clearSessionCache,
			signOut: mocks.signOut,
		},
	};
});

vi.mock("@/lib/query-client", () => ({
	syncStudentSessionUser: mocks.syncStudentSessionUser,
}));

import { Route as AuthRoute } from "@/routes/_auth/route";

type AuthRouteOptions = {
	beforeLoad: (args: { location: { href: string } }) => Promise<unknown>;
};

const beforeLoad = (AuthRoute as unknown as AuthRouteOptions).beforeLoad;

describe("_auth route beforeLoad role guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to /login without signing out when session data is null", async () => {
		mocks.getCachedSession.mockResolvedValue({ data: null });

		await expect(
			beforeLoad({ location: { href: "/classes?tab=active" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				to: "/login",
				search: { returnUrl: "/classes?tab=active" },
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects teacher session to /login without calling signOut", async () => {
		mocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-teacher", email: "teacher@test.local", role: "teacher" },
				session: { id: "s-1" },
			},
		});

		await expect(
			beforeLoad({ location: { href: "/assignments" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				to: "/login",
				search: { returnUrl: "/assignments" },
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects admin session to /login without calling signOut", async () => {
		mocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "admin@test.local", role: "admin" },
				session: { id: "s-2" },
			},
		});

		await expect(
			beforeLoad({ location: { href: "/schedule" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				to: "/login",
				search: { returnUrl: "/schedule" },
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects session with missing role to /login (fail-closed) without calling signOut", async () => {
		mocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-missing-role", email: "user@test.local" },
				session: { id: "s-3" },
			},
		});

		await expect(beforeLoad({ location: { href: "/" } })).rejects.toEqual({
			__redirect: true,
			options: {
				to: "/login",
				search: { returnUrl: "/" },
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("allows student session and syncs active student user id", async () => {
		const studentSession = {
			data: {
				user: { id: "u-student", email: "student@test.local", role: "student" },
				session: { id: "s-4" },
			},
		};
		mocks.getCachedSession.mockResolvedValue(studentSession);

		const result = await beforeLoad({ location: { href: "/classes" } });

		expect(result).toEqual({ session: studentSession });
		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith("u-student");
		expect(mocks.clearSessionCache).not.toHaveBeenCalled();
		expect(mocks.redirect).not.toHaveBeenCalled();
		expect(mocks.signOut).not.toHaveBeenCalled();
	});
});
