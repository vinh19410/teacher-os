import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCachedSession, mockClearSessionCache, mockSignOut } = vi.hoisted(
	() => ({
		mockGetCachedSession: vi.fn(),
		mockClearSessionCache: vi.fn(),
		mockSignOut: vi.fn(),
	}),
);

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: mockSignOut,
		getCachedSession: mockGetCachedSession,
		clearSessionCache: mockClearSessionCache,
	},
	getCachedSession: mockGetCachedSession,
}));

import { Route } from "./route";

type BeforeLoadContext = Parameters<
	NonNullable<typeof Route.options.beforeLoad>
>[0];

describe("_auth route beforeLoad guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function callBeforeLoad(overrides: Partial<BeforeLoadContext>) {
		const beforeLoad = Route.options.beforeLoad;
		if (!beforeLoad) throw new Error("beforeLoad is undefined");
		const ctx = {
			location: { href: "/dashboard" },
			context: {},
			...overrides,
		} as unknown as BeforeLoadContext;
		return beforeLoad(ctx);
	}

	it("returns session when getCachedSession resolves with teacher user data", async () => {
		const sampleSession = {
			data: {
				user: {
					id: "u-1",
					name: "Teacher A",
					email: "a@test.local",
					role: "teacher",
				},
				session: { id: "s-1" },
			},
		};
		mockGetCachedSession.mockResolvedValue(sampleSession);

		const result = await callBeforeLoad({
			location: {
				href: "/dashboard",
			} as unknown as BeforeLoadContext["location"],
		});

		expect(result).toEqual({ session: sampleSession });
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("treats session with undefined role as teacher for backward compatibility", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", email: "a@test.local" },
				session: { id: "s-1" },
			},
		};
		mockGetCachedSession.mockResolvedValue(sampleSession);

		const result = await callBeforeLoad({
			location: {
				href: "/dashboard",
			} as unknown as BeforeLoadContext["location"],
		});

		expect(result).toEqual({ session: sampleSession });
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("redirects to root /login carrying /teacher-prefixed returnUrl when session has no data", async () => {
		mockGetCachedSession.mockResolvedValue({ data: null });

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher%2Fgrading",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).toHaveBeenCalledTimes(1);
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("preserves existing /teacher prefix and query string on unauthenticated returnUrl", async () => {
		mockGetCachedSession.mockResolvedValue({ data: null });

		await expect(
			callBeforeLoad({
				location: {
					href: "/teacher/grading?a=1",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher%2Fgrading%3Fa%3D1",
				reloadDocument: true,
			},
		});

		await expect(
			callBeforeLoad({
				location: {
					href: "/",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher",
				reloadDocument: true,
			},
		});
	});

	it("redirects to root /login on network error", async () => {
		mockGetCachedSession.mockRejectedValue(new Error("Network timeout"));

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher%2Fgrading",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).toHaveBeenCalledTimes(1);
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("auto-redirects student session to /student without calling signOut", async () => {
		mockGetCachedSession.mockResolvedValue({
			data: {
				user: {
					id: "u-s1",
					name: "Student A",
					email: "s@test.local",
					role: "student",
				},
				session: { id: "s-s1" },
			},
		});

		await expect(
			callBeforeLoad({
				location: {
					href: "/dashboard",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/student",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).toHaveBeenCalledTimes(1);
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("auto-redirects admin session to /admin without calling signOut", async () => {
		mockGetCachedSession.mockResolvedValue({
			data: {
				user: {
					id: "u-a1",
					name: "Admin A",
					email: "admin@test.local",
					role: "admin",
				},
				session: { id: "s-a1" },
			},
		});

		await expect(
			callBeforeLoad({
				location: {
					href: "/dashboard",
				} as unknown as BeforeLoadContext["location"],
			}),
		).rejects.toMatchObject({
			options: {
				href: "/admin",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).toHaveBeenCalledTimes(1);
		expect(mockSignOut).not.toHaveBeenCalled();
	});

	it("forwards allowStale: true on preload and avoids clearing cache on preload failure", async () => {
		mockGetCachedSession.mockResolvedValueOnce({ data: null });

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
				preload: true,
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher%2Fgrading",
				reloadDocument: true,
			},
		});
		expect(mockGetCachedSession).toHaveBeenCalledWith({ allowStale: true });
		expect(mockClearSessionCache).not.toHaveBeenCalled();

		vi.clearAllMocks();
		mockGetCachedSession.mockRejectedValueOnce(new Error("transient error"));
		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
				preload: true,
			}),
		).rejects.toMatchObject({
			options: {
				href: "/login?returnUrl=%2Fteacher%2Fgrading",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).not.toHaveBeenCalled();
	});

	it("still clears wrong-role session cache on hover preload", async () => {
		mockGetCachedSession.mockResolvedValueOnce({
			data: {
				user: {
					id: "u-s1",
					name: "Student A",
					email: "s@test.local",
					role: "student",
				},
				session: { id: "s-s1" },
			},
		});

		await expect(
			callBeforeLoad({
				location: {
					href: "/grading",
				} as unknown as BeforeLoadContext["location"],
				preload: true,
			}),
		).rejects.toMatchObject({
			options: {
				href: "/student",
				reloadDocument: true,
			},
		});
		expect(mockClearSessionCache).toHaveBeenCalledTimes(1);
	});
});
