import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getCachedSession: vi.fn(),
	clearSessionCache: vi.fn(),
	signOut: vi.fn(),
	syncStudentSessionUser: vi.fn(),
	clearStudentQueryCacheIfUserChanged: vi.fn(),
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
	clearStudentQueryCacheIfUserChanged:
		mocks.clearStudentQueryCacheIfUserChanged,
}));

import { Route as AuthRoute, toStudentReturnUrl } from "@/routes/_auth/route";

type AuthRouteOptions = {
	beforeLoad: (args: {
		location: { href: string };
		preload?: boolean;
	}) => Promise<unknown>;
};

const beforeLoad = (AuthRoute as unknown as AuthRouteOptions).beforeLoad;

describe("toStudentReturnUrl", () => {
	it("ensures student returnUrl starts with /student without double prefixing", () => {
		expect(toStudentReturnUrl("/")).toBe("/student");
		expect(toStudentReturnUrl("/?tab=1")).toBe("/student?tab=1");
		expect(toStudentReturnUrl("/#top")).toBe("/student#top");
		expect(toStudentReturnUrl("/classes")).toBe("/student/classes");
		expect(toStudentReturnUrl("/classes?tab=active")).toBe(
			"/student/classes?tab=active",
		);
		expect(toStudentReturnUrl("/student")).toBe("/student");
		expect(toStudentReturnUrl("/student/classes?x=1")).toBe(
			"/student/classes?x=1",
		);
		expect(toStudentReturnUrl("/student-notes")).toBe("/student/student-notes");
	});

	it("falls back to /student on open-redirect or traversal payloads", () => {
		expect(toStudentReturnUrl("")).toBe("/student");
		expect(toStudentReturnUrl("//evil.com/phish")).toBe("/student");
		expect(toStudentReturnUrl("/\\evil.com/phish")).toBe("/student");
		expect(toStudentReturnUrl("https://evil.com/student")).toBe("/student");
		expect(toStudentReturnUrl("/../teacher/classes")).toBe("/student");
		expect(toStudentReturnUrl("/student/../admin")).toBe("/student");
	});
});

describe("_auth route beforeLoad role guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("redirects to root /login with /student returnUrl without signing out when session data is null", async () => {
		mocks.getCachedSession.mockResolvedValue({ data: null });

		await expect(
			beforeLoad({ location: { href: "/classes?tab=active" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student/classes?tab=active")}`,
				reloadDocument: true,
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("treats session fetch error as unauthenticated and redirects to root /login", async () => {
		mocks.getCachedSession.mockRejectedValue(new Error("network down"));

		await expect(
			beforeLoad({ location: { href: "/classes?tab=active" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student/classes?tab=active")}`,
				reloadDocument: true,
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects unauthenticated root / to /login?returnUrl=%2Fstudent and avoids double /student prefix", async () => {
		mocks.getCachedSession.mockResolvedValue({ data: null });

		await expect(beforeLoad({ location: { href: "/" } })).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student")}`,
				reloadDocument: true,
			},
		});

		await expect(
			beforeLoad({ location: { href: "/student/classes?x=1" } }),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student/classes?x=1")}`,
				reloadDocument: true,
			},
		});
	});

	it("auto-redirects teacher session to /teacher without calling signOut", async () => {
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
				href: "/teacher",
				reloadDocument: true,
			},
		});

		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith(null);
		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("auto-redirects admin session to /admin without calling signOut", async () => {
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
				href: "/admin",
				reloadDocument: true,
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
				href: "/login",
				reloadDocument: true,
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
		expect(mocks.getCachedSession).toHaveBeenCalledWith({ allowStale: false });
		expect(mocks.syncStudentSessionUser).toHaveBeenCalledWith("u-student");
		expect(mocks.clearSessionCache).not.toHaveBeenCalled();
		expect(mocks.redirect).not.toHaveBeenCalled();
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("passes allowStale: true on hover preload and skips destructive cache/storage cleanup on null or error", async () => {
		mocks.getCachedSession.mockResolvedValueOnce({ data: null });

		await expect(
			beforeLoad({
				location: { href: "/practice/listening?page=1" },
				preload: true,
			}),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student/practice/listening?page=1")}`,
				reloadDocument: true,
			},
		});
		expect(mocks.getCachedSession).toHaveBeenCalledWith({ allowStale: true });
		expect(mocks.syncStudentSessionUser).not.toHaveBeenCalled();
		expect(mocks.clearSessionCache).not.toHaveBeenCalled();

		vi.clearAllMocks();
		mocks.getCachedSession.mockRejectedValueOnce(new Error("transient blip"));
		await expect(
			beforeLoad({
				location: { href: "/practice/listening?page=1" },
				preload: true,
			}),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: `/login?returnUrl=${encodeURIComponent("/student/practice/listening?page=1")}`,
				reloadDocument: true,
			},
		});
		expect(mocks.syncStudentSessionUser).not.toHaveBeenCalled();
		expect(mocks.clearSessionCache).not.toHaveBeenCalled();
	});

	it("clears wrong-role session cache on hover preload without wiping active student storage/QueryClient", async () => {
		mocks.getCachedSession.mockResolvedValueOnce({
			data: {
				user: { id: "u-teacher", email: "t@test.local", role: "teacher" },
				session: { id: "s-t" },
			},
		});

		await expect(
			beforeLoad({
				location: { href: "/practice/listening?page=1" },
				preload: true,
			}),
		).rejects.toEqual({
			__redirect: true,
			options: {
				href: "/teacher",
				reloadDocument: true,
			},
		});

		expect(mocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(mocks.syncStudentSessionUser).not.toHaveBeenCalled();
		expect(mocks.signOut).not.toHaveBeenCalled();
	});

	it("returns valid student session on hover preload while running RAM-only user mismatch check instead of localStorage sync", async () => {
		const studentSession = {
			data: {
				user: { id: "u-student-b", email: "b@test.local", role: "student" },
				session: { id: "s-b" },
			},
		};
		mocks.getCachedSession.mockResolvedValueOnce(studentSession);

		const result = await beforeLoad({
			location: { href: "/learn/quizzes/as-1" },
			preload: true,
		});

		expect(result).toEqual({ session: studentSession });
		expect(mocks.getCachedSession).toHaveBeenCalledWith({ allowStale: true });
		expect(mocks.clearStudentQueryCacheIfUserChanged).toHaveBeenCalledWith(
			"u-student-b",
		);
		expect(mocks.syncStudentSessionUser).not.toHaveBeenCalled();
		expect(mocks.clearSessionCache).not.toHaveBeenCalled();
	});
});
