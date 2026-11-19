import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock better-auth/react using vi.hoisted
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

import {
	authClient,
	clearSessionCache,
	getCachedSession,
	getSessionUserRole,
	isStudentSession,
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
				user: { id: "u-1", name: "Student A", email: "a@test.local" },
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
				user: { id: "u-1", name: "Student A" },
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
			data: { user: { id: "u-1", name: "Student A" }, session: { id: "s-1" } },
		};
		const session2 = {
			data: {
				user: { id: "u-1", name: "Student A Updated" },
				session: { id: "s-1" },
			},
		};

		mockGetSession
			.mockResolvedValueOnce(session1)
			.mockResolvedValueOnce(session2);

		const first = await getCachedSession();
		expect(first).toEqual(session1);
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		// Advance time past TTL (10s)
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

	it("clears cache when authClient.signOut is called", async () => {
		const session = { data: { user: { id: "u-1" }, session: { id: "s-1" } } };
		mockGetSession.mockResolvedValue(session);
		mockSignOut.mockResolvedValue({ success: true });

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(1);

		await authClient.signOut();

		await getCachedSession();
		expect(mockGetSession).toHaveBeenCalledTimes(2);
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
});

describe("session role helpers", () => {
	it("extracts role string and allows only student role (fail-closed)", () => {
		expect(getSessionUserRole({ user: { role: "student" } })).toBe("student");
		expect(isStudentSession({ user: { role: "student" } })).toBe(true);

		expect(getSessionUserRole({ user: { role: "teacher" } })).toBe("teacher");
		expect(isStudentSession({ user: { role: "teacher" } })).toBe(false);

		expect(getSessionUserRole({ user: { role: "admin" } })).toBe("admin");
		expect(isStudentSession({ user: { role: "admin" } })).toBe(false);
	});

	it("returns null and false for missing, empty, or malformed session data", () => {
		expect(getSessionUserRole(null)).toBeNull();
		expect(getSessionUserRole(undefined)).toBeNull();
		expect(getSessionUserRole({})).toBeNull();
		expect(getSessionUserRole({ user: null })).toBeNull();
		expect(getSessionUserRole({ user: { id: "u-1" } })).toBeNull();
		expect(getSessionUserRole({ user: { role: "" } })).toBeNull();
		expect(getSessionUserRole({ user: { role: 123 } })).toBeNull();

		expect(isStudentSession(null)).toBe(false);
		expect(isStudentSession(undefined)).toBe(false);
		expect(isStudentSession({})).toBe(false);
		expect(isStudentSession({ user: null })).toBe(false);
		expect(isStudentSession({ user: { id: "u-1" } })).toBe(false);
		expect(isStudentSession({ user: { role: "" } })).toBe(false);
		expect(isStudentSession({ user: { role: "student " } })).toBe(false);
	});
});
