import { isRedirect } from "@tanstack/react-router";
import { MAX_FALLBACK_AGE_MS } from "@teacher-os/auth/session-cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/query-client";

const authMocks = vi.hoisted(() => {
	const clearListeners = new Set<() => void>();
	return {
		getCachedSession: vi.fn(),
		clearSessionCache: vi.fn(() => {
			for (const listener of clearListeners) {
				listener();
			}
		}),
		onSessionCacheClear: (listener: () => void) => {
			clearListeners.add(listener);
			return () => {
				clearListeners.delete(listener);
			};
		},
		getSession: vi.fn(),
		signOut: vi.fn(),
		apiJson: vi.fn(),
		useCachedSessionMethod: true,
	};
});

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		get getCachedSession() {
			return authMocks.useCachedSessionMethod
				? authMocks.getCachedSession
				: undefined;
		},
		clearSessionCache: () => authMocks.clearSessionCache(),
		getSession: (...args: unknown[]) => authMocks.getSession(...args),
		signOut: (...args: unknown[]) => authMocks.signOut(...args),
	},
	onSessionCacheClear: (listener: () => void) =>
		authMocks.onSessionCacheClear(listener),
}));

vi.mock("@/lib/api", () => ({
	apiJson: (...args: unknown[]) => authMocks.apiJson(...args),
}));

vi.mock("@/components/layout/admin-shell", () => ({
	AdminShell: () => null,
}));

import { clearAdminGateCache, Route, toAdminReturnUrl } from "./route";

async function runBeforeLoad(href: string, options?: { preload?: boolean }) {
	const beforeLoad = Route.options.beforeLoad;
	if (!beforeLoad) {
		throw new Error("Route.options.beforeLoad is missing");
	}
	return beforeLoad({
		location: { href },
		preload: options?.preload,
	} as Parameters<typeof beforeLoad>[0]);
}

async function expectRedirectHref(
	href: string,
	options?: { preload?: boolean },
): Promise<string> {
	try {
		await runBeforeLoad(href, options);
	} catch (thrown) {
		expect(isRedirect(thrown)).toBe(true);
		if (isRedirect(thrown)) {
			expect(thrown.options.reloadDocument).toBe(true);
			return thrown.options.href ?? "";
		}
	}
	throw new Error("Expected beforeLoad to throw a redirect");
}

describe("toAdminReturnUrl", () => {
	it("prefixes router-internal admin paths with /admin", () => {
		expect(toAdminReturnUrl("/library/tests")).toBe("/admin/library/tests");
		expect(toAdminReturnUrl("/library/tests?page=2#top")).toBe(
			"/admin/library/tests?page=2#top",
		);
		expect(toAdminReturnUrl("/")).toBe("/admin");
		expect(toAdminReturnUrl("")).toBe("/admin");
		expect(toAdminReturnUrl("/?tab=packs")).toBe("/admin?tab=packs");
		expect(toAdminReturnUrl("/#section")).toBe("/admin#section");
	});

	it("preserves paths that already start with /admin", () => {
		expect(toAdminReturnUrl("/admin")).toBe("/admin");
		expect(toAdminReturnUrl("/admin/")).toBe("/admin/");
		expect(toAdminReturnUrl("/admin/library/tests?page=2")).toBe(
			"/admin/library/tests?page=2",
		);
		expect(toAdminReturnUrl("/admin?page=2")).toBe("/admin?page=2");
	});

	it("handles prefix-collision and unsafe URLs safely", () => {
		expect(toAdminReturnUrl("/administrator")).toBe("/admin/administrator");
		expect(toAdminReturnUrl("//evil.com/admin")).toBe("/admin");
		expect(toAdminReturnUrl("/\\evil.com")).toBe("/admin");
		expect(toAdminReturnUrl("https://evil.com/admin")).toBe("/admin");
	});
});

describe("admin _auth route beforeLoad", () => {
	beforeEach(() => {
		authMocks.useCachedSessionMethod = true;
		authMocks.getCachedSession.mockReset();
		authMocks.clearSessionCache.mockReset();
		authMocks.getSession.mockReset();
		authMocks.signOut.mockReset();
		authMocks.apiJson.mockReset();
		clearAdminGateCache();
	});

	it("redirects unauthenticated user to unified /login with /admin returnUrl", async () => {
		authMocks.getCachedSession.mockResolvedValue({ data: null });

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/login?returnUrl=%2Fadmin%2Flibrary%2Ftests");
		expect(authMocks.getCachedSession).toHaveBeenCalledWith({
			allowStale: false,
		});
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.apiJson).not.toHaveBeenCalled();
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("normalizes root href '/' to /admin returnUrl when unauthenticated", async () => {
		authMocks.getCachedSession.mockResolvedValue({ data: null });

		const target = await expectRedirectHref("/");

		expect(target).toBe("/login?returnUrl=%2Fadmin");
	});

	it("redirects to /login if getCachedSession rejects", async () => {
		authMocks.getCachedSession.mockRejectedValue(new Error("network offline"));

		const target = await expectRedirectHref("/library/tests?page=2");

		expect(target).toBe(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2",
		);
		expect(authMocks.apiJson).not.toHaveBeenCalled();
	});

	it("auto-redirects teacher session to /teacher without calling /api/admin/me or signOut", async () => {
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-teacher", email: "t@example.com", role: "teacher" },
			},
		});

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/teacher");
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.apiJson).not.toHaveBeenCalled();
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("auto-redirects student session to /student without calling /api/admin/me or signOut", async () => {
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-student", email: "s@example.com", role: "student" },
			},
		});

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/student");
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.apiJson).not.toHaveBeenCalled();
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("returns { admin } when admin session passes /api/admin/me", async () => {
		const admin = { email: "admin@example.com", name: "Quản trị viên" };
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: admin.email, role: "admin" },
			},
		});
		authMocks.apiJson.mockResolvedValue(admin);

		const result = await runBeforeLoad("/library/tests");

		expect(authMocks.getCachedSession).toHaveBeenCalledWith({
			allowStale: false,
		});
		expect(authMocks.apiJson).toHaveBeenCalledWith("/api/admin/me");
		expect(result).toEqual({ admin });
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("passes allowStale: true on hover preload and reuses verified admin identity without firing /api/admin/me again", async () => {
		const admin = { email: "admin@example.com", name: "Quản trị viên" };
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: admin.email, role: "admin" },
			},
		});
		authMocks.apiJson.mockResolvedValue(admin);

		// Real navigation populates verified admin identity
		expect(await runBeforeLoad("/library/tests")).toEqual({ admin });
		expect(authMocks.apiJson).toHaveBeenCalledTimes(1);

		// Hover preload passes allowStale: true and skips redundant /api/admin/me call
		expect(
			await runBeforeLoad("/library/tests?page=2", { preload: true }),
		).toEqual({
			admin,
		});
		expect(authMocks.getCachedSession).toHaveBeenLastCalledWith({
			allowStale: true,
		});
		expect(authMocks.apiJson).toHaveBeenCalledTimes(1);

		// Once MAX_FALLBACK_AGE_MS elapses, hover preload must re-verify /api/admin/me
		const realNow = Date.now();
		const dateSpy = vi
			.spyOn(Date, "now")
			.mockReturnValue(realNow + MAX_FALLBACK_AGE_MS + 1_000);
		expect(
			await runBeforeLoad("/library/tests?page=3", { preload: true }),
		).toEqual({ admin });
		expect(authMocks.apiJson).toHaveBeenCalledTimes(2);
		dateSpy.mockRestore();

		// Session cache clear (e.g. signOut / resetPassword) clears lastKnownAdmin automatically
		authMocks.clearSessionCache();
		expect(
			await runBeforeLoad("/library/tests?page=4", { preload: true }),
		).toEqual({ admin });
		expect(authMocks.apiJson).toHaveBeenCalledTimes(3);
	});

	it("does not clear cached session on hover preload failure", async () => {
		authMocks.getCachedSession.mockResolvedValueOnce({ data: null });

		const target = await expectRedirectHref("/library/tests", {
			preload: true,
		});
		expect(target).toBe("/login?returnUrl=%2Fadmin%2Flibrary%2Ftests");
		expect(authMocks.clearSessionCache).not.toHaveBeenCalled();
	});

	it("falls back to getSession when getCachedSession is unavailable", async () => {
		authMocks.useCachedSessionMethod = false;
		const admin = { email: "admin@example.com", name: "Admin Fallback" };
		authMocks.getSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: admin.email, role: "admin" },
			},
		});
		authMocks.apiJson.mockResolvedValue(admin);

		const result = await runBeforeLoad("/library/tests");

		expect(authMocks.getSession).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ admin });
	});

	it("redirects with blocked=1 and clears session cache on /api/admin/me 403 ACCOUNT_NOT_ADMIN", async () => {
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "removed@example.com", role: "admin" },
			},
		});
		authMocks.apiJson.mockRejectedValue(
			new HttpError(403, "API 403 /api/admin/me", {
				code: "ACCOUNT_NOT_ADMIN",
			}),
		);

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/login?blocked=1&error=NOT_ADMIN&gateStatus=403");
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects with blocked=1 on /api/admin/me 500 or network error without looping", async () => {
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "admin@example.com", role: "admin" },
			},
		});
		authMocks.apiJson.mockRejectedValueOnce(
			new HttpError(500, "API 500 /api/admin/me"),
		);

		expect(await expectRedirectHref("/library/tests")).toBe(
			"/login?blocked=1&error=UNKNOWN&gateStatus=500",
		);

		authMocks.apiJson.mockRejectedValueOnce(new Error("network down"));

		expect(await expectRedirectHref("/library/tests")).toBe(
			"/login?blocked=1&error=UNKNOWN",
		);
	});

	it("redirects to /login?returnUrl=... and clears session cache on /api/admin/me 401 (expired session)", async () => {
		authMocks.getCachedSession.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "admin@example.com", role: "admin" },
			},
		});
		authMocks.apiJson.mockRejectedValue(
			new HttpError(401, "API 401 /api/admin/me"),
		);

		const target = await expectRedirectHref("/library/tests?page=3");

		expect(target).toBe(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D3",
		);
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
	});

	it("falls through to /api/admin/me when session user has no role claim", async () => {
		const admin = { email: "admin@example.com", name: "Admin" };
		authMocks.getCachedSession.mockResolvedValue({
			data: { user: { id: "u-admin", email: admin.email } },
		});
		authMocks.apiJson.mockResolvedValue(admin);

		const result = await runBeforeLoad("/");

		expect(authMocks.apiJson).toHaveBeenCalledWith("/api/admin/me");
		expect(result).toEqual({ admin });
	});
});
