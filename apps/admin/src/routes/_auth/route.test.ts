import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/query-client";

const getSessionMock = vi.fn();
const signOutMock = vi.fn();
const apiJsonMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		getSession: (...args: unknown[]) => getSessionMock(...args),
		signOut: (...args: unknown[]) => signOutMock(...args),
	},
}));

vi.mock("@/lib/api", () => ({
	apiJson: (...args: unknown[]) => apiJsonMock(...args),
}));

vi.mock("@/components/layout/admin-shell", () => ({
	AdminShell: () => null,
}));

import { Route, toAdminReturnUrl } from "./route";

async function runBeforeLoad(href: string) {
	const beforeLoad = Route.options.beforeLoad;
	if (!beforeLoad) {
		throw new Error("Route.options.beforeLoad is missing");
	}
	return beforeLoad({
		location: { href },
	} as Parameters<typeof beforeLoad>[0]);
}

async function expectRedirectHref(href: string): Promise<string> {
	try {
		await runBeforeLoad(href);
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
		getSessionMock.mockReset();
		signOutMock.mockReset();
		apiJsonMock.mockReset();
	});

	it("redirects unauthenticated user to unified /login with /admin returnUrl", async () => {
		getSessionMock.mockResolvedValue({ data: null });

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/login?returnUrl=%2Fadmin%2Flibrary%2Ftests");
		expect(apiJsonMock).not.toHaveBeenCalled();
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("normalizes root href '/' to /admin returnUrl when unauthenticated", async () => {
		getSessionMock.mockResolvedValue({ data: null });

		const target = await expectRedirectHref("/");

		expect(target).toBe("/login?returnUrl=%2Fadmin");
	});

	it("redirects to /login if getSession rejects", async () => {
		getSessionMock.mockRejectedValue(new Error("network offline"));

		const target = await expectRedirectHref("/library/tests?page=2");

		expect(target).toBe(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2",
		);
		expect(apiJsonMock).not.toHaveBeenCalled();
	});

	it("auto-redirects teacher session to /teacher without calling /api/admin/me or signOut", async () => {
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-teacher", email: "t@example.com", role: "teacher" },
			},
		});

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/teacher");
		expect(apiJsonMock).not.toHaveBeenCalled();
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("auto-redirects student session to /student without calling /api/admin/me or signOut", async () => {
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-student", email: "s@example.com", role: "student" },
			},
		});

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/student");
		expect(apiJsonMock).not.toHaveBeenCalled();
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("returns { admin } when admin session passes /api/admin/me", async () => {
		const admin = { email: "admin@example.com", name: "Quản trị viên" };
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: admin.email, role: "admin" },
			},
		});
		apiJsonMock.mockResolvedValue(admin);

		const result = await runBeforeLoad("/library/tests");

		expect(apiJsonMock).toHaveBeenCalledWith("/api/admin/me");
		expect(result).toEqual({ admin });
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("redirects with blocked=1 on /api/admin/me 403 ACCOUNT_NOT_ADMIN to prevent redirect loop", async () => {
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "removed@example.com", role: "admin" },
			},
		});
		apiJsonMock.mockRejectedValue(
			new HttpError(403, "API 403 /api/admin/me", {
				code: "ACCOUNT_NOT_ADMIN",
			}),
		);

		const target = await expectRedirectHref("/library/tests");

		expect(target).toBe("/login?blocked=1&error=NOT_ADMIN&gateStatus=403");
		expect(signOutMock).not.toHaveBeenCalled();
	});

	it("redirects with blocked=1 on /api/admin/me 500 or network error without looping", async () => {
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "admin@example.com", role: "admin" },
			},
		});
		apiJsonMock.mockRejectedValueOnce(
			new HttpError(500, "API 500 /api/admin/me"),
		);

		expect(await expectRedirectHref("/library/tests")).toBe(
			"/login?blocked=1&error=UNKNOWN&gateStatus=500",
		);

		apiJsonMock.mockRejectedValueOnce(new Error("network down"));

		expect(await expectRedirectHref("/library/tests")).toBe(
			"/login?blocked=1&error=UNKNOWN",
		);
	});

	it("redirects to /login?returnUrl=... on /api/admin/me 401 (expired session)", async () => {
		getSessionMock.mockResolvedValue({
			data: {
				user: { id: "u-admin", email: "admin@example.com", role: "admin" },
			},
		});
		apiJsonMock.mockRejectedValue(new HttpError(401, "API 401 /api/admin/me"));

		const target = await expectRedirectHref("/library/tests?page=3");

		expect(target).toBe(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D3",
		);
	});

	it("falls through to /api/admin/me when session user has no role claim", async () => {
		const admin = { email: "admin@example.com", name: "Admin" };
		getSessionMock.mockResolvedValue({
			data: { user: { id: "u-admin", email: admin.email } },
		});
		apiJsonMock.mockResolvedValue(admin);

		const result = await runBeforeLoad("/");

		expect(apiJsonMock).toHaveBeenCalledWith("/api/admin/me");
		expect(result).toEqual({ admin });
	});
});
