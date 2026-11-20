// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: (...args: unknown[]) => signOutMock(...args),
	},
}));

describe("admin reauth", () => {
	const originalLocation = window.location;
	const assignMock = vi.fn();

	beforeEach(() => {
		vi.resetModules();
		signOutMock.mockClear();
		assignMock.mockClear();
	});

	afterEach(() => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: originalLocation,
		});
	});

	it("preserves /admin returnUrl when redirecting to unified /login", async () => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				pathname: "/admin/library/tests",
				search: "?page=2",
				hash: "#top",
				assign: assignMock,
			},
		});

		const { reauth } = await import("./query-client");
		reauth();

		expect(signOutMock).toHaveBeenCalledTimes(1);
		expect(assignMock).toHaveBeenCalledWith(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2%23top",
		);
	});

	it("falls back to /admin returnUrl if current pathname is outside /admin", async () => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				pathname: "/",
				search: "",
				hash: "",
				assign: assignMock,
			},
		});

		const { reauth } = await import("./query-client");
		reauth();

		expect(assignMock).toHaveBeenCalledWith("/login?returnUrl=%2Fadmin");
	});
});
