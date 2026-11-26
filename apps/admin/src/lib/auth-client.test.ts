import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockSignOut, mockResetPassword } = vi.hoisted(() => ({
	mockGetSession: vi.fn(),
	mockSignOut: vi.fn(),
	mockResetPassword: vi.fn(),
}));

vi.mock("better-auth/react", () => ({
	createAuthClient: () => ({
		getSession: mockGetSession,
		signOut: mockSignOut,
		resetPassword: mockResetPassword,
	}),
}));

import {
	authClient,
	clearSessionCache,
	getCachedSession,
	SESSION_CACHE_TTL_MS,
} from "./auth-client";

describe("admin auth-client session caching", () => {
	beforeEach(() => {
		clearSessionCache();
		vi.clearAllMocks();
	});

	afterEach(() => {
		clearSessionCache();
		vi.useRealTimers();
	});

	it("caches valid sessions within TTL and deduplicates concurrent calls", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-admin", name: "Admin", role: "admin" },
				session: { id: "s-1" },
			},
			error: null,
		};
		let resolve!: (val: typeof sampleSession) => void;
		mockGetSession.mockReturnValueOnce(
			new Promise<typeof sampleSession>((r) => {
				resolve = r;
			}),
		);

		const p1 = getCachedSession();
		const p2 = getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		resolve(sampleSession);
		expect(await p1).toEqual(sampleSession);
		expect(await p2).toEqual(sampleSession);
		expect(await getCachedSession()).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});

	it("falls back to lastKnownSession on resolved 429/500 errors and reuses lastKnownSession on allowStale", async () => {
		vi.useFakeTimers();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const sampleSession = {
			data: {
				user: { id: "u-admin", name: "Admin", role: "admin" },
				session: { id: "s-1" },
			},
			error: null,
		};
		mockGetSession
			.mockResolvedValueOnce(sampleSession)
			.mockResolvedValueOnce({
				data: null,
				error: { status: 429, message: "Too many requests" },
			})
			.mockResolvedValueOnce({
				data: null,
				error: { status: 500, message: "Failed to get session" },
			});

		expect(await getCachedSession()).toEqual(sampleSession);

		vi.advanceTimersByTime(SESSION_CACHE_TTL_MS + 500);
		expect(await getCachedSession({ allowStale: true })).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		expect(await getCachedSession()).toEqual(sampleSession);
		vi.advanceTimersByTime(5_500);
		expect(await getCachedSession()).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(3);
		expect(warnSpy).toHaveBeenCalledTimes(2);
		warnSpy.mockRestore();
	});

	it("clears cache both before and after signOut and resetPassword", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-admin", name: "Admin", role: "admin" },
				session: { id: "s-1" },
			},
			error: null,
		};
		mockGetSession.mockResolvedValue(sampleSession);

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Simulate a concurrent getCachedSession populating cache while signOut is in flight
		mockSignOut.mockImplementationOnce(async () => {
			await getCachedSession();
			return { data: { success: true }, error: null };
		});
		await authClient.signOut();
		// Cache must have been cleared again in finally -> next call fetches fresh
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(3);

		mockResetPassword.mockResolvedValueOnce({
			data: { status: true },
			error: null,
		});
		await authClient.resetPassword({
			newPassword: "Password123!",
			token: "tok",
		});
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(4);
	});
});
