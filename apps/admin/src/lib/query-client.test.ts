// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutMock = vi.fn().mockResolvedValue({ data: null, error: null });
const clearSessionCacheMock = vi.fn();

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: (...args: unknown[]) => signOutMock(...args),
		clearSessionCache: () => clearSessionCacheMock(),
	},
}));

describe("admin reauth", () => {
	const originalLocation = window.location;
	const assignMock = vi.fn();

	beforeEach(() => {
		vi.resetModules();
		signOutMock.mockClear();
		clearSessionCacheMock.mockClear();
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
		await vi.waitFor(() => {
			expect(assignMock).toHaveBeenCalledWith(
				"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2%23top",
			);
		});
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

		await vi.waitFor(() => {
			expect(assignMock).toHaveBeenCalledWith("/login?returnUrl=%2Fadmin");
		});
	});

	it("calls signOut synchronously and waits for it to settle before calling location.assign", async () => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				pathname: "/admin/library/tests",
				search: "",
				hash: "",
				assign: assignMock,
			},
		});

		let resolveSignOut!: () => void;
		signOutMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveSignOut = resolve;
				}),
		);

		const { reauth } = await import("./query-client");
		reauth();
		reauth();

		expect(clearSessionCacheMock).toHaveBeenCalledTimes(1);
		expect(signOutMock).toHaveBeenCalledTimes(1);
		expect(assignMock).not.toHaveBeenCalled();

		resolveSignOut();
		await vi.waitFor(() => {
			expect(assignMock).toHaveBeenCalledTimes(1);
		});
		expect(assignMock).toHaveBeenCalledWith(
			"/login?returnUrl=%2Fadmin%2Flibrary%2Ftests",
		);
	});

	it("still redirects after 2000ms timeout when signOut hangs and after signOut rejects", async () => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				pathname: "/admin/library/tests",
				search: "",
				hash: "",
				assign: assignMock,
			},
		});

		vi.useFakeTimers();
		try {
			signOutMock.mockImplementationOnce(() => new Promise(() => {}));
			const { reauth } = await import("./query-client");
			reauth();

			expect(signOutMock).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1_999);
			expect(assignMock).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			expect(assignMock).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}

		// Reject fallback
		vi.resetModules();
		signOutMock.mockClear();
		assignMock.mockClear();
		signOutMock.mockRejectedValueOnce(new Error("network down"));
		const { reauth: reauthReject } = await import("./query-client");
		reauthReject();

		await vi.waitFor(() => {
			expect(assignMock).toHaveBeenCalledTimes(1);
		});
	});

	it("cancels pending reauth continuation on persisted pageshow (bfcache)", async () => {
		Object.defineProperty(window, "location", {
			configurable: true,
			value: {
				pathname: "/admin/library/tests",
				search: "",
				hash: "",
				assign: assignMock,
			},
		});

		let resolveSignOut!: () => void;
		signOutMock.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveSignOut = resolve;
				}),
		);

		const { reauth } = await import("./query-client");
		reauth();
		expect(clearSessionCacheMock).toHaveBeenCalledTimes(1);
		expect(signOutMock).toHaveBeenCalledTimes(1);
		expect(assignMock).not.toHaveBeenCalled();

		const persistedEvent = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(persistedEvent, "persisted", { value: true });
		window.dispatchEvent(persistedEvent);

		resolveSignOut();
		await Promise.resolve();
		await Promise.resolve();
		expect(assignMock).not.toHaveBeenCalled();
	});
});
