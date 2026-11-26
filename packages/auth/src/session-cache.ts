/**
 * Browser-safe, memory-only session cache shared across authenticated portals
 * (`student`, `web`, `admin`).
 *
 * Better-Auth's client (`@better-fetch/fetch`) resolves non-2xx HTTP responses
 * (`429`, `5xx`, `408`) into `{ data: null, error }` instead of throwing. Treating
 * resolved transient errors identically to `200 null` wipes `lastKnownSession`
 * and kicks active users to `/login?returnUrl=...` (where `/login` immediately
 * bounces them back because the cookie is still valid).
 *
 * This module separates definitive unauthenticated responses (`200 null`, `4xx`
 * except `408`/`429`, or non-network errors without numeric status) from
 * transient failures (`408`, `429`, `>= 500`, network errors, timeouts):
 * - Warm navigation falls back to `lastKnownSession` within a bounded window
 *   (`MAX_FALLBACK_AGE_MS`, `MAX_CONSECUTIVE_FALLBACKS`) without wiping cache.
 * - Cold load (or warm requests whose fallback window/cap expired) retries
 *   transient failures with bounded backoff before failing closed.
 * - Hover preloads (`allowStale: true`) reuse `lastKnownSession` within
 *   `MAX_FALLBACK_AGE_MS` without hitting `/api/auth/get-session`.
 */

export const SESSION_CACHE_TTL_MS = 15_000;
export const SESSION_FALLBACK_CACHE_TTL_MS = 5_000;
export const MAX_FALLBACK_AGE_MS = 90_000;
export const MAX_CONSECUTIVE_FALLBACKS = 3;
export const SESSION_REQUEST_TIMEOUT_MS = 5_000;
export const DEFAULT_COLD_RETRY_DELAYS_MS = [250, 600] as const;
export const DEFAULT_MAX_RETRY_JITTER_MS = 50;

export interface SessionErrorLike {
	status?: number | null;
	statusText?: string;
	message?: string;
	code?: string;
}

export interface SessionResultLike<TData = unknown> {
	data?: TData | null;
	error?: SessionErrorLike | null;
}

export interface GetCachedSessionOptions {
	force?: boolean;
	allowStale?: boolean;
}

export interface SessionCacheOptions {
	ttlMs?: number;
	fallbackTtlMs?: number;
	maxFallbackAgeMs?: number;
	maxConsecutiveFallbacks?: number;
	timeoutMs?: number;
	coldRetryDelaysMs?: readonly number[];
	coldTimeoutMaxRetries?: number;
	maxRetryJitterMs?: number;
	now?: () => number;
	sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
	onFallback?: (reason: unknown) => void;
}

export interface SessionCache<TResult extends SessionResultLike> {
	getCachedSession(options?: GetCachedSessionOptions): Promise<TResult>;
	clearSessionCache(): void;
}

/**
 * Classifies a resolved `{ error }` payload from Better-Auth's client.
 * Fail-closed: missing/non-numeric `status`, `status: 0` carrying an auth
 * `code`, and definitive `4xx` responses (`400`, `401`, `403`, `404`, ...)
 * return `false`.
 */
export function isTransientSessionError(
	error: SessionErrorLike | null | undefined,
): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const { status } = error;
	if (typeof status !== "number" || !Number.isFinite(status)) {
		return false;
	}
	if (status === 408 || status === 429 || status >= 500) {
		return true;
	}
	if (status === 0) {
		const hasCode = typeof error.code === "string" && error.code.length > 0;
		return !hasCode;
	}
	return false;
}

function isDefinitiveClientThrownError(err: unknown): boolean {
	if (!err || typeof err !== "object") {
		return false;
	}
	const status = (err as { status?: unknown }).status;
	return (
		typeof status === "number" &&
		Number.isFinite(status) &&
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 429
	);
}

function isTimeoutErrorLike(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"name" in err &&
		err.name === "TimeoutError"
	);
}

function createTimeoutError(timeoutMs: number): Error {
	const error = new Error(`getSession timed out after ${timeoutMs}ms`);
	error.name = "TimeoutError";
	return error;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) {
		return Promise.resolve();
	}
	return new Promise<void>((resolve) => {
		const onAbort = () => {
			clearTimeout(timerId);
			resolve();
		};
		const timerId: ReturnType<typeof setTimeout> = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

type AttemptOutcome<TResult> =
	| { kind: "ok"; value: TResult }
	| { kind: "epoch-aborted" }
	| { kind: "timeout"; error: unknown }
	| { kind: "error"; error: unknown };

export function createSessionCache<TResult extends SessionResultLike>(
	fetchSession: (signal: AbortSignal) => Promise<TResult>,
	options?: SessionCacheOptions,
): SessionCache<TResult> {
	const ttlMs = options?.ttlMs ?? SESSION_CACHE_TTL_MS;
	const fallbackTtlMs = options?.fallbackTtlMs ?? SESSION_FALLBACK_CACHE_TTL_MS;
	const maxFallbackAgeMs = options?.maxFallbackAgeMs ?? MAX_FALLBACK_AGE_MS;
	const maxConsecutiveFallbacks =
		options?.maxConsecutiveFallbacks ?? MAX_CONSECUTIVE_FALLBACKS;
	const timeoutMs = options?.timeoutMs ?? SESSION_REQUEST_TIMEOUT_MS;
	const coldRetryDelaysMs =
		options?.coldRetryDelaysMs ?? DEFAULT_COLD_RETRY_DELAYS_MS;
	const coldTimeoutMaxRetries = options?.coldTimeoutMaxRetries ?? 1;
	const maxRetryJitterMs =
		options?.maxRetryJitterMs ?? DEFAULT_MAX_RETRY_JITTER_MS;

	// Dynamic lookups ensure `vi.useFakeTimers()`, `vi.spyOn(Date, "now")`, and
	// `vi.spyOn(console, "warn")` installed after module import stay effective.
	const now = (): number => (options?.now ? options.now() : Date.now());
	const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
		options?.sleep ? options.sleep(ms, signal) : defaultSleep(ms, signal);
	const notifyFallback = (reason: unknown): void => {
		if (options?.onFallback) {
			options.onFallback(reason);
		} else {
			console.warn(
				"getSession failed; falling back to last known session",
				reason,
			);
		}
	};

	let cacheEpoch = 0;
	let latestRequestSeq = 0;
	let epochAbortController = new AbortController();
	let cachedSession: { data: TResult; expiresAt: number } | null = null;
	let lastKnownSession: TResult | null = null;
	let lastVerifiedAt: number | null = null;
	let consecutiveFallbacks = 0;
	let inFlightSessionPromise: Promise<TResult> | null = null;

	const emptyFailClosed = (): TResult =>
		({ data: null, error: null }) as TResult;

	const isCurrentOwner = (requestEpoch: number, requestSeq: number): boolean =>
		requestEpoch === cacheEpoch && requestSeq === latestRequestSeq;

	const hasFreshAllowStale = (currentNow: number): boolean =>
		lastKnownSession?.data != null &&
		lastVerifiedAt !== null &&
		currentNow - lastVerifiedAt < maxFallbackAgeMs;

	const canUseFallback = (
		currentNow: number,
		requestEpoch: number,
		requestSeq: number,
	): boolean =>
		isCurrentOwner(requestEpoch, requestSeq) &&
		hasFreshAllowStale(currentNow) &&
		consecutiveFallbacks < maxConsecutiveFallbacks;

	function clearSessionCache(): void {
		const prevController = epochAbortController;
		cacheEpoch += 1;
		latestRequestSeq += 1;
		epochAbortController = new AbortController();
		cachedSession = null;
		lastKnownSession = null;
		lastVerifiedAt = null;
		consecutiveFallbacks = 0;
		inFlightSessionPromise = null;
		prevController.abort();
	}

	async function runAttempt(
		epochSignal: AbortSignal,
	): Promise<AttemptOutcome<TResult>> {
		if (epochSignal.aborted) {
			return { kind: "epoch-aborted" };
		}

		const attemptController = new AbortController();
		let settled = false;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		let onEpochAbort: (() => void) | undefined;

		const raceAbort = new Promise<AttemptOutcome<TResult>>((resolve) => {
			onEpochAbort = () => {
				if (settled) return;
				settled = true;
				attemptController.abort();
				resolve({ kind: "epoch-aborted" });
			};
			epochSignal.addEventListener("abort", onEpochAbort, { once: true });

			timeoutId = setTimeout(() => {
				if (settled) return;
				settled = true;
				const err = createTimeoutError(timeoutMs);
				attemptController.abort(err);
				resolve({ kind: "timeout", error: err });
			}, timeoutMs);
		});

		let rawFetchPromise: Promise<TResult>;
		try {
			rawFetchPromise = Promise.resolve(fetchSession(attemptController.signal));
		} catch (syncError) {
			rawFetchPromise = Promise.reject(syncError);
		}

		const fetchOutcome: Promise<AttemptOutcome<TResult>> = rawFetchPromise.then(
			(value): AttemptOutcome<TResult> => ({ kind: "ok", value }),
			(error: unknown): AttemptOutcome<TResult> => {
				if (epochSignal.aborted) {
					return { kind: "epoch-aborted" };
				}
				if (isTimeoutErrorLike(error)) {
					return { kind: "timeout", error };
				}
				return { kind: "error", error };
			},
		);
		// Prevent unhandled rejection if fetch settles after timeout/epoch abort wins.
		void fetchOutcome.catch(() => {});

		try {
			const outcome = await Promise.race([fetchOutcome, raceAbort]);
			settled = true;
			return outcome;
		} finally {
			if (timeoutId !== undefined) {
				clearTimeout(timeoutId);
			}
			if (onEpochAbort) {
				epochSignal.removeEventListener("abort", onEpochAbort);
			}
		}
	}

	function computeRetryDelay(attempt: number): number | null {
		const base = coldRetryDelaysMs[attempt];
		if (base === undefined) {
			return null;
		}
		if (maxRetryJitterMs <= 0) {
			return base;
		}
		return base + Math.floor(Math.random() * (maxRetryJitterMs + 1));
	}

	function applyWarmFallback(
		currentNow: number,
		reason: unknown,
	): TResult | null {
		if (lastKnownSession?.data == null || lastVerifiedAt === null) {
			return null;
		}
		consecutiveFallbacks += 1;
		cachedSession = {
			data: lastKnownSession,
			expiresAt: Math.min(
				currentNow + fallbackTtlMs,
				lastVerifiedAt + maxFallbackAgeMs,
			),
		};
		notifyFallback(reason);
		return lastKnownSession;
	}

	async function getCachedSession({
		force = false,
		allowStale = false,
	}: GetCachedSessionOptions = {}): Promise<TResult> {
		const currentNow = now();
		if (!force && cachedSession && currentNow < cachedSession.expiresAt) {
			return cachedSession.data;
		}

		if (!force && allowStale && hasFreshAllowStale(currentNow)) {
			return lastKnownSession as TResult;
		}

		if (!force && inFlightSessionPromise) {
			return inFlightSessionPromise;
		}

		const requestEpoch = cacheEpoch;
		const requestSeq = ++latestRequestSeq;
		const epochSignal = epochAbortController.signal;

		// Assign inFlightSessionPromise BEFORE invoking execute() so synchronous
		// hooks inside fetchSession() observe the active in-flight slot and any
		// synchronous clearSessionCache() is never overwritten afterward.
		let resolveInFlight!: (value: TResult) => void;
		let rejectInFlight!: (reason?: unknown) => void;
		const promise = new Promise<TResult>((resolve, reject) => {
			resolveInFlight = resolve;
			rejectInFlight = reject;
		});
		inFlightSessionPromise = promise;

		const execute = async (): Promise<TResult> => {
			let timeoutFailures = 0;

			for (let attempt = 0; attempt <= coldRetryDelaysMs.length; attempt += 1) {
				if (requestEpoch !== cacheEpoch) {
					return emptyFailClosed();
				}

				const outcome = await runAttempt(epochSignal);
				if (requestEpoch !== cacheEpoch || outcome.kind === "epoch-aborted") {
					return emptyFailClosed();
				}

				if (outcome.kind === "ok") {
					const res = outcome.value;
					if (res?.data != null) {
						if (isCurrentOwner(requestEpoch, requestSeq)) {
							const verifiedNow = now();
							cachedSession = {
								data: res,
								expiresAt: verifiedNow + ttlMs,
							};
							lastKnownSession = res;
							lastVerifiedAt = verifiedNow;
							consecutiveFallbacks = 0;
						}
						return res;
					}

					if (!isTransientSessionError(res?.error)) {
						if (isCurrentOwner(requestEpoch, requestSeq)) {
							clearSessionCache();
						}
						return res;
					}

					const failureNow = now();
					if (
						attempt === 0 &&
						canUseFallback(failureNow, requestEpoch, requestSeq)
					) {
						const fallback = applyWarmFallback(
							failureNow,
							res?.error ?? new Error("Transient getSession failure"),
						);
						if (fallback) {
							return fallback;
						}
					}

					const delay = computeRetryDelay(attempt);
					if (delay !== null && isCurrentOwner(requestEpoch, requestSeq)) {
						await sleep(delay, epochSignal);
						if (requestEpoch !== cacheEpoch) {
							return emptyFailClosed();
						}
						if (!isCurrentOwner(requestEpoch, requestSeq)) {
							return lastKnownSession ?? res;
						}
						continue;
					}

					if (isCurrentOwner(requestEpoch, requestSeq)) {
						clearSessionCache();
					}
					return res;
				}

				// outcome.kind === "timeout" | "error"
				const err = outcome.error;
				if (isDefinitiveClientThrownError(err)) {
					if (isCurrentOwner(requestEpoch, requestSeq)) {
						clearSessionCache();
					}
					throw err;
				}

				const isTimeout = outcome.kind === "timeout";
				if (isTimeout) {
					timeoutFailures += 1;
				}

				const failureNow = now();
				if (
					attempt === 0 &&
					canUseFallback(failureNow, requestEpoch, requestSeq)
				) {
					const fallback = applyWarmFallback(failureNow, err);
					if (fallback) {
						return fallback;
					}
				}

				const delay = computeRetryDelay(attempt);
				const timeoutBudgetAllowsRetry =
					!isTimeout || timeoutFailures <= coldTimeoutMaxRetries;
				if (
					delay !== null &&
					timeoutBudgetAllowsRetry &&
					isCurrentOwner(requestEpoch, requestSeq)
				) {
					await sleep(delay, epochSignal);
					if (requestEpoch !== cacheEpoch) {
						return emptyFailClosed();
					}
					if (!isCurrentOwner(requestEpoch, requestSeq)) {
						if (lastKnownSession) {
							return lastKnownSession;
						}
						throw err;
					}
					continue;
				}

				if (isCurrentOwner(requestEpoch, requestSeq)) {
					clearSessionCache();
				}
				throw err;
			}

			return emptyFailClosed();
		};

		void execute().then(resolveInFlight, rejectInFlight);

		try {
			return await promise;
		} finally {
			if (inFlightSessionPromise === promise) {
				inFlightSessionPromise = null;
			}
		}
	}

	return {
		getCachedSession,
		clearSessionCache,
	};
}
