import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock better-auth/react using vi.hoisted
const { mockGetSession, mockSignOut, mockUpdateUser, mockResetPassword } =
	vi.hoisted(() => ({
		mockGetSession: vi.fn(),
		mockSignOut: vi.fn(),
		mockUpdateUser: vi.fn(),
		mockResetPassword: vi.fn(),
	}));

vi.mock("better-auth/react", () => ({
	createAuthClient: () => ({
		getSession: mockGetSession,
		signOut: mockSignOut,
		updateUser: mockUpdateUser,
		resetPassword: mockResetPassword,
	}),
}));

import {
	authClient,
	clearSessionCache,
	getCachedSession,
	SESSION_CACHE_TTL_MS,
} from "./auth-client";

describe("auth-client session caching", () => {
	beforeEach(() => {
		clearSessionCache();
		vi.clearAllMocks();
	});

	afterEach(() => {
		clearSessionCache();
		vi.useRealTimers();
	});

	it("returns cached session within TTL without calling getSession again", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", email: "a@test.local" },
				session: { id: "s-1" },
			},
		};
		mockGetSession.mockResolvedValue(sampleSession);

		const first = await getCachedSession();
		expect(first).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		const second = await getCachedSession();
		expect(second).toEqual(sampleSession);
		// Second call within TTL should NOT invoke getSession again
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});

	it("deduplicates concurrent in-flight requests into a single call", async () => {
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A" },
				session: { id: "s-1" },
			},
		};

		let resolve!: (val: typeof sampleSession) => void;
		const promise = new Promise<typeof sampleSession>((r) => {
			resolve = r;
		});
		mockGetSession.mockReturnValue(promise);

		const call1 = getCachedSession();
		const call2 = getCachedSession();
		const call3 = getCachedSession();

		expect(mockGetSession).toHaveBeenCalledTimes(1);

		resolve(sampleSession);

		const [res1, res2, res3] = await Promise.all([call1, call2, call3]);
		expect(res1).toEqual(sampleSession);
		expect(res2).toEqual(sampleSession);
		expect(res3).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});

	it("refetches when TTL expires", async () => {
		vi.useFakeTimers();

		const session1 = {
			data: { user: { id: "u-1", name: "Teacher A" }, session: { id: "s-1" } },
		};
		const session2 = {
			data: {
				user: { id: "u-1", name: "Teacher A Updated" },
				session: { id: "s-1" },
			},
		};

		mockGetSession
			.mockResolvedValueOnce(session1)
			.mockResolvedValueOnce(session2);

		const first = await getCachedSession();
		expect(first).toEqual(session1);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Advance time past TTL (15s)
		vi.advanceTimersByTime(SESSION_CACHE_TTL_MS + 500);

		const second = await getCachedSession();
		expect(second).toEqual(session2);
		expect(mockGetSession).toHaveBeenCalledTimes(2);
	});

	it("bypasses cache when force is true", async () => {
		const session1 = { data: { user: { id: "u-1" }, session: { id: "s-1" } } };
		const session2 = {
			data: { user: { id: "u-1", name: "Updated" }, session: { id: "s-1" } },
		};

		mockGetSession
			.mockResolvedValueOnce(session1)
			.mockResolvedValueOnce(session2);

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		const forced = await getCachedSession({ force: true });
		expect(forced).toEqual(session2);
		expect(mockGetSession).toHaveBeenCalledTimes(2);
	});

	it("purges cache when getSession returns null data", async () => {
		const sampleSession = {
			data: { user: { id: "u-1" }, session: { id: "s-1" } },
		};
		const deadSession = { data: null };

		mockGetSession
			.mockResolvedValueOnce(sampleSession)
			.mockResolvedValueOnce(deadSession)
			.mockResolvedValueOnce(sampleSession);

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Force fetch an expired session
		const expired = await getCachedSession({ force: true });
		expect(expired).toEqual(deadSession);
		expect(mockGetSession).toHaveBeenCalledTimes(2);

		// Next call should NOT return stale cached data, it should fetch again
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(3);
	});

	it("clears cache explicitly with clearSessionCache", async () => {
		const session = { data: { user: { id: "u-1" }, session: { id: "s-1" } } };
		mockGetSession.mockResolvedValue(session);

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		clearSessionCache();

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(2);
	});

	it("clears cache before and after signOut, updateUser, and resetPassword (including in-flight races)", async () => {
		const session = { data: { user: { id: "u-1" }, session: { id: "s-1" } } };
		mockGetSession.mockResolvedValueOnce(session);
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		let resolveSignOut!: (val: { data: { success: boolean } }) => void;
		mockSignOut.mockReturnValueOnce(
			new Promise<{ data: { success: boolean } }>((r) => {
				resolveSignOut = r;
			}),
		);
		mockGetSession.mockResolvedValueOnce(session);

		const signOutPromise = authClient.signOut();
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(2);
		resolveSignOut({ data: { success: true } });
		await signOutPromise;

		mockGetSession.mockResolvedValueOnce(session);
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(3);

		mockUpdateUser.mockResolvedValueOnce({
			data: { status: true },
			error: null,
		});
		await authClient.updateUser({ name: "Updated Teacher" });
		mockGetSession.mockResolvedValueOnce(session);
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(4);

		mockResetPassword.mockResolvedValueOnce({
			data: { status: true },
			error: null,
		});
		await authClient.resetPassword({
			newPassword: "Password123!",
			token: "tok",
		});
		mockGetSession.mockResolvedValueOnce(session);
		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(5);
	});

	it("passes timeout signal to getSession", async () => {
		mockGetSession.mockResolvedValue({ data: null });

		await getCachedSession();

		expect(mockGetSession).toHaveBeenCalledWith(
			expect.objectContaining({
				fetchOptions: expect.objectContaining({
					signal: expect.any(AbortSignal),
				}),
			}),
		);
	});

	it("falls back to lastKnownSession on resolved 429 and 500 errors after TTL expiry without wiping cache", async () => {
		vi.useFakeTimers();
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", role: "teacher" },
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
		expect(await getCachedSession()).toEqual(sampleSession);
		vi.advanceTimersByTime(5_500);
		expect(await getCachedSession()).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(3);
		expect(warnSpy).toHaveBeenCalledTimes(2);
		warnSpy.mockRestore();
	});

	it("reuses lastKnownSession with 0 network calls when allowStale is true after TTL expiry", async () => {
		vi.useFakeTimers();
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", role: "teacher" },
				session: { id: "s-1" },
			},
			error: null,
		};
		mockGetSession.mockResolvedValueOnce(sampleSession);

		expect(await getCachedSession()).toEqual(sampleSession);
		vi.advanceTimersByTime(SESSION_CACHE_TTL_MS + 500);

		expect(await getCachedSession({ allowStale: true })).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(1);
	});

	it("retries cold load on resolved 500 error and recovers on subsequent attempt", async () => {
		vi.useFakeTimers();
		const sampleSession = {
			data: {
				user: { id: "u-1", name: "Teacher A", role: "teacher" },
				session: { id: "s-1" },
			},
			error: null,
		};
		mockGetSession
			.mockResolvedValueOnce({
				data: null,
				error: { status: 500, message: "Failed to get session" },
			})
			.mockResolvedValueOnce(sampleSession);

		const pending = getCachedSession();
		await vi.advanceTimersByTimeAsync(400);

		expect(await pending).toEqual(sampleSession);
		expect(mockGetSession).toHaveBeenCalledTimes(2);
	});
});
