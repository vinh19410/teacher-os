import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createSessionCache,
	isTransientSessionError,
	MAX_CONSECUTIVE_FALLBACKS,
	MAX_FALLBACK_AGE_MS,
	SESSION_CACHE_TTL_MS,
	SESSION_FALLBACK_CACHE_TTL_MS,
	SESSION_REQUEST_TIMEOUT_MS,
	type SessionResultLike,
} from "./session-cache";

type TestSessionResult = SessionResultLike<{
	user: { id: string; name?: string; role?: string };
	session: { id: string };
}>;

const SAMPLE_SESSION: TestSessionResult = {
	data: {
		user: { id: "u-1", name: "Student A", role: "student" },
		session: { id: "s-1" },
	},
	error: null,
};

const UPDATED_SESSION: TestSessionResult = {
	data: {
		user: { id: "u-1", name: "Student A Updated", role: "student" },
		session: { id: "s-2" },
	},
	error: null,
};

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("isTransientSessionError", () => {
	it("returns true for transient HTTP statuses and network-style status 0 without code", () => {
		for (const status of [408, 429, 500, 502, 503, 504]) {
			expect(isTransientSessionError({ status })).toBe(true);
		}
		expect(isTransientSessionError({ status: 0 })).toBe(true);
		expect(isTransientSessionError({ status: 0, message: "offline" })).toBe(
			true,
		);
	});

	it("returns false for null/undefined, missing/non-numeric status, status 0 with auth code, and definitive 4xx", () => {
		expect(isTransientSessionError(null)).toBe(false);
		expect(isTransientSessionError(undefined)).toBe(false);
		expect(isTransientSessionError({})).toBe(false);
		expect(isTransientSessionError({ code: "SESSION_EXPIRED" })).toBe(false);
		expect(isTransientSessionError({ status: Number.NaN })).toBe(false);
		expect(isTransientSessionError({ status: 0, code: "UNAUTHORIZED" })).toBe(
			false,
		);
		for (const status of [400, 401, 403, 404, 422]) {
			expect(isTransientSessionError({ status })).toBe(false);
		}
	});
});

describe("createSessionCache", () => {
	it("caches verified sessions for SESSION_CACHE_TTL_MS and refetches after TTL using dynamic Date.now()", async () => {
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockResolvedValueOnce(UPDATED_SESSION);

		// Instantiate BEFORE enabling fake timers to verify dynamic Date.now() lookup.
		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		vi.useFakeTimers();

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(SESSION_CACHE_TTL_MS - 1_000);
		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(1_500);
		expect(await cache.getCachedSession()).toEqual(UPDATED_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);
	});

	it("deduplicates concurrent in-flight non-forced requests", async () => {
		let resolve!: (val: TestSessionResult) => void;
		const fetchSession = vi.fn(
			() =>
				new Promise<TestSessionResult>((r) => {
					resolve = r;
				}),
		);

		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		const p1 = cache.getCachedSession();
		const p2 = cache.getCachedSession();
		const p3 = cache.getCachedSession();

		expect(fetchSession).toHaveBeenCalledTimes(1);
		resolve(SAMPLE_SESSION);

		const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
		expect(r1).toEqual(SAMPLE_SESSION);
		expect(r2).toEqual(SAMPLE_SESSION);
		expect(r3).toEqual(SAMPLE_SESSION);
	});

	it("returns lastKnownSession with 0 network calls when allowStale is true within MAX_FALLBACK_AGE_MS", async () => {
		let clock = 1_000;
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockResolvedValueOnce(UPDATED_SESSION);

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(1);

		// Past active TTL (15s), still within MAX_FALLBACK_AGE_MS (90s)
		clock += SESSION_CACHE_TTL_MS + 5_000;
		expect(await cache.getCachedSession({ allowStale: true })).toEqual(
			SAMPLE_SESSION,
		);
		expect(fetchSession).toHaveBeenCalledTimes(1);

		// Past MAX_FALLBACK_AGE_MS (90s): allowStale must hit the network
		clock += MAX_FALLBACK_AGE_MS;
		expect(await cache.getCachedSession({ allowStale: true })).toEqual(
			UPDATED_SESSION,
		);
		expect(fetchSession).toHaveBeenCalledTimes(2);
	});

	it("falls back to lastKnownSession on resolved transient HTTP errors (429/5xx/408) during warm navigation without clearing cache", async () => {
		let clock = 10_000;
		const onFallback = vi.fn();
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockResolvedValueOnce({
				data: null,
				error: { status: 429, message: "Too many requests" },
			})
			.mockResolvedValueOnce({
				data: null,
				error: { status: 503, message: "Service unavailable" },
			})
			.mockResolvedValueOnce(UPDATED_SESSION);

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			maxRetryJitterMs: 0,
			onFallback,
		});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);

		// Expire active TTL -> 429 transient error -> warm fallback
		clock += SESSION_CACHE_TTL_MS + 100;
		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);
		expect(onFallback).toHaveBeenCalledTimes(1);

		// Within 5s fallback cooldown -> cache hit, 0 network calls
		clock += SESSION_FALLBACK_CACHE_TTL_MS - 500;
		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);

		// After 5s cooldown -> 503 transient error -> 2nd warm fallback
		clock += 1_000;
		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(3);
		expect(onFallback).toHaveBeenCalledTimes(2);

		// After 5s cooldown -> recovers and resets fallback counter
		clock += SESSION_FALLBACK_CACHE_TTL_MS + 100;
		expect(await cache.getCachedSession()).toEqual(UPDATED_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(4);
	});

	it("logs via dynamic console.warn when default onFallback fires", async () => {
		let clock = 1_000;
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockResolvedValueOnce({
				data: null,
				error: { status: 500, message: "Failed to get session" },
			});

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			maxRetryJitterMs: 0,
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		clock += SESSION_CACHE_TTL_MS + 100;
		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(warnSpy).toHaveBeenCalledTimes(1);
	});

	it("falls back via Promise.race when a hung fetch ignores AbortSignal and times out", async () => {
		const onFallback = vi.fn();
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockImplementationOnce(
				// Never settles even after signal aborts!
				() => new Promise<TestSessionResult>(() => {}),
			);

		vi.useFakeTimers();
		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback,
		});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);

		vi.advanceTimersByTime(SESSION_CACHE_TTL_MS + 500);
		const pending = cache.getCachedSession();
		await vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS + 50);

		expect(await pending).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);
		expect(onFallback).toHaveBeenCalledTimes(1);
	});

	it("fails closed with 0 retries on definitive unauthenticated responses (200 null, 401, 403, missing status) and thrown 4xx", async () => {
		let clock = 1_000;
		const cases: TestSessionResult[] = [
			{ data: null, error: null },
			{ data: null, error: { status: 401, message: "Unauthorized" } },
			{ data: null, error: { status: 403, message: "Forbidden" } },
			{ data: null, error: { code: "SESSION_EXPIRED" } },
		];

		for (const unauthRes of cases) {
			const onFallback = vi.fn();
			const fetchSession = vi
				.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
				.mockResolvedValueOnce(SAMPLE_SESSION)
				.mockResolvedValueOnce(unauthRes);

			const cache = createSessionCache(fetchSession, {
				now: () => clock,
				maxRetryJitterMs: 0,
				onFallback,
			});

			await cache.getCachedSession();
			clock += SESSION_CACHE_TTL_MS + 100;

			expect(await cache.getCachedSession()).toEqual(unauthRes);
			expect(fetchSession).toHaveBeenCalledTimes(2);
			expect(onFallback).not.toHaveBeenCalled();
		}

		// Thrown 401 must also fail closed without fallback or retry
		const onFallback = vi.fn();
		const err401 = Object.assign(new Error("Unauthorized"), { status: 401 });
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockRejectedValueOnce(err401);

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			maxRetryJitterMs: 0,
			onFallback,
		});
		await cache.getCachedSession();
		clock += SESSION_CACHE_TTL_MS + 100;

		await expect(cache.getCachedSession()).rejects.toBe(err401);
		expect(fetchSession).toHaveBeenCalledTimes(2);
		expect(onFallback).not.toHaveBeenCalled();
	});

	it("caps warm fallback at MAX_CONSECUTIVE_FALLBACKS and falls through to cold retries before failing closed", async () => {
		let clock = 1_000;
		const onFallback = vi.fn();
		const sleep = vi.fn(async () => {});
		const error503: TestSessionResult = {
			data: null,
			error: { status: 503, message: "Service unavailable" },
		};
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockResolvedValue(error503);

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			sleep,
			maxRetryJitterMs: 0,
			onFallback,
		});

		await cache.getCachedSession();

		// First MAX_CONSECUTIVE_FALLBACKS (3) transient errors use warm fallback
		for (let i = 0; i < MAX_CONSECUTIVE_FALLBACKS; i++) {
			clock += SESSION_CACHE_TTL_MS + 100;
			expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		}
		expect(onFallback).toHaveBeenCalledTimes(MAX_CONSECUTIVE_FALLBACKS);
		expect(sleep).not.toHaveBeenCalled();

		// Next transient error exceeds cap -> retries (2 retries = 3 attempts), then fails closed
		clock += SESSION_FALLBACK_CACHE_TTL_MS + 100;
		const result = await cache.getCachedSession();
		expect(result).toEqual(error503);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("falls through to bounded retries instead of 0-retry failure when MAX_FALLBACK_AGE_MS expires mid-flight", async () => {
		let clock = 0;
		const sleep = vi.fn(async () => {});
		const onFallback = vi.fn();
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce(SAMPLE_SESSION)
			.mockImplementationOnce(async () => {
				// Simulate request crossing MAX_FALLBACK_AGE_MS while in-flight
				clock = MAX_FALLBACK_AGE_MS + 1_000;
				return { data: null, error: { status: 503 } };
			})
			.mockResolvedValueOnce(UPDATED_SESSION);

		const cache = createSessionCache(fetchSession, {
			now: () => clock,
			sleep,
			maxRetryJitterMs: 0,
			onFallback,
		});

		await cache.getCachedSession();
		clock = MAX_FALLBACK_AGE_MS - 2_000;

		const recovered = await cache.getCachedSession();
		expect(recovered).toEqual(UPDATED_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(1);
		expect(onFallback).not.toHaveBeenCalled();
	});

	it("retries cold load on resolved 500/429 with [250, 600]ms backoff and recovers or fails closed", async () => {
		const delays: number[] = [];
		const sleep = vi.fn(async (ms: number) => {
			delays.push(ms);
		});
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce({ data: null, error: { status: 500 } })
			.mockResolvedValueOnce({ data: null, error: { status: 429 } })
			.mockResolvedValueOnce(SAMPLE_SESSION);

		const cache = createSessionCache(fetchSession, {
			sleep,
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(3);
		expect(delays).toEqual([250, 600]);

		// Exhausted cold load with thrown network errors rethrows final error
		cache.clearSessionCache();
		const netErr = new TypeError("Failed to fetch");
		fetchSession.mockReset();
		fetchSession.mockRejectedValue(netErr);

		await expect(cache.getCachedSession()).rejects.toBe(netErr);
		expect(fetchSession).toHaveBeenCalledTimes(3);
	});

	it("caps cold-load timeout retries at 1 (2 total attempts)", async () => {
		vi.useFakeTimers();
		const fetchSession = vi.fn(
			(_signal: AbortSignal) => new Promise<TestSessionResult>(() => {}),
		);

		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		const pending = cache.getCachedSession();
		// Prevent unhandled rejection during fake timer advancement
		const settled = pending.catch((err: unknown) => err);

		await vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS + 10);
		await vi.advanceTimersByTimeAsync(250 + 10);
		await vi.advanceTimersByTimeAsync(SESSION_REQUEST_TIMEOUT_MS + 10);

		const err = await settled;
		expect(err).toBeInstanceOf(Error);
		expect(fetchSession).toHaveBeenCalledTimes(2);
	});

	it("classifies non-Error TimeoutError objects and DOMException TimeoutError under coldTimeoutMaxRetries", async () => {
		const plainTimeout = { name: "TimeoutError", message: "timed out" };
		const sleep = vi.fn(async () => {});
		const fetchSession = vi.fn().mockRejectedValue(plainTimeout);

		const cache = createSessionCache(fetchSession, {
			sleep,
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		await expect(cache.getCachedSession()).rejects.toBe(plainTimeout);
		expect(fetchSession).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledTimes(1);

		cache.clearSessionCache();
		const domTimeout = new DOMException("Operation timed out", "TimeoutError");
		fetchSession.mockReset();
		fetchSession.mockRejectedValue(domTimeout);
		sleep.mockClear();

		await expect(cache.getCachedSession()).rejects.toBe(domTimeout);
		expect(fetchSession).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledTimes(1);
	});

	it("adds bounded retry jitter within [0, maxRetryJitterMs]", async () => {
		const delays: number[] = [];
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValueOnce({ data: null, error: { status: 503 } })
			.mockResolvedValueOnce(SAMPLE_SESSION);

		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 50,
			sleep: async (ms) => {
				delays.push(ms);
			},
			onFallback: vi.fn(),
		});

		expect(await cache.getCachedSession()).toEqual(SAMPLE_SESSION);
		expect(delays).toEqual([275]);
	});

	it("returns fail-closed { data: null, error: null } and never mutates cache when clearSessionCache() runs mid-fetch or mid-sleep", async () => {
		// Case 1: clearSessionCache during in-flight fetch
		let resolveFirst!: (val: TestSessionResult) => void;
		let receivedSignal!: AbortSignal;
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockImplementationOnce(
				(signal) =>
					new Promise<TestSessionResult>((r) => {
						receivedSignal = signal;
						resolveFirst = r;
					}),
			)
			.mockResolvedValueOnce(UPDATED_SESSION);

		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		const firstCall = cache.getCachedSession();
		cache.clearSessionCache();
		expect(receivedSignal.aborted).toBe(true);
		resolveFirst(SAMPLE_SESSION);

		expect(await firstCall).toEqual({ data: null, error: null });

		// Fresh call after clearSessionCache succeeds cleanly without stale data
		expect(await cache.getCachedSession()).toEqual(UPDATED_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);

		// Case 2: clearSessionCache during cold retry sleep
		vi.useFakeTimers();
		cache.clearSessionCache();
		fetchSession.mockReset();
		fetchSession.mockResolvedValueOnce({ data: null, error: { status: 503 } });

		const sleepingCall = cache.getCachedSession();
		// Flush microtasks until attempt 0 settles and enters the 250ms retry sleep timer
		for (let i = 0; i < 6; i += 1) {
			await Promise.resolve();
		}
		expect(vi.getTimerCount()).toBe(1);

		cache.clearSessionCache();
		expect(await sleepingCall).toEqual({ data: null, error: null });
		expect(vi.getTimerCount()).toBe(0);
	});

	it("prevents earlier in-flight request from clobbering a concurrent force: true request", async () => {
		let resolveSlow!: (val: TestSessionResult) => void;
		let resolveFast!: (val: TestSessionResult) => void;
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockImplementationOnce(
				() =>
					new Promise<TestSessionResult>((r) => {
						resolveSlow = r;
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<TestSessionResult>((r) => {
						resolveFast = r;
					}),
			);

		const cache = createSessionCache(fetchSession, {
			maxRetryJitterMs: 0,
			onFallback: vi.fn(),
		});

		const pSlow = cache.getCachedSession();
		const pForce = cache.getCachedSession({ force: true });

		// Forced request resolves first with fresh session
		resolveFast(UPDATED_SESSION);
		expect(await pForce).toEqual(UPDATED_SESSION);

		// Older slow request resolves later with unauthenticated null -> must NOT wipe newer valid session!
		resolveSlow({ data: null, error: null });
		await pSlow;

		// Subsequent cache hit must still return UPDATED_SESSION with 0 extra calls
		expect(await cache.getCachedSession()).toEqual(UPDATED_SESSION);
		expect(fetchSession).toHaveBeenCalledTimes(2);
	});

	it("cleans up epoch abort listeners across >15 TTL cycles with zero warnings", async () => {
		let clock = 1_000;
		const fetchSession = vi
			.fn<(signal: AbortSignal) => Promise<TestSessionResult>>()
			.mockResolvedValue(SAMPLE_SESSION);
		const warningSpy = vi.fn();
		process.on("warning", warningSpy);

		try {
			const cache = createSessionCache(fetchSession, {
				now: () => clock,
				maxRetryJitterMs: 0,
				onFallback: vi.fn(),
			});
			for (let i = 0; i < 16; i++) {
				clock += SESSION_CACHE_TTL_MS + 100;
				await cache.getCachedSession();
			}
			expect(fetchSession).toHaveBeenCalledTimes(16);
			expect(warningSpy).not.toHaveBeenCalled();
		} finally {
			process.off("warning", warningSpy);
		}
	});
});
