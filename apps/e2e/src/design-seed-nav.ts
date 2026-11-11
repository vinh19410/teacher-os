const TOKEN_RE = /([?&]token=)[^\s&"']+?(?=\)(?:[\s,:|]|$)|[\s&"']|$)/gi;
const ENCODED_TOKEN_RE =
	/((?:%3f|%26)token%3d)(?:(?!%26)[^\s&"'])+?(?=\)(?:[\s,:|]|$)|%26|[\s&"']|$)/gi;
const RESET_TOKEN_RE = /(\/api\/auth\/reset-password\/)[^?\s"'&)]+/gi;
const PAY_TOKEN_RE = /(\/pay\/)[A-Za-z0-9_-]{6,}/gi;
const GH_BEARER_RE = /((?:x-access-token:|Bearer\s+))[^\s@"')]+/gi;
const GH_PAT_RE =
	/\b(gh[pousr]_[A-Za-z0-9_]{10,}|github_pat_[A-Za-z0-9_]{10,})\b/g;

const REFUSED_RE = /ERR_CONNECTION_REFUSED|ECONNREFUSED/i;
const TRANSIENT_NAV_RE =
	/TimeoutError|Timeout\s+\d+ms\s+exceeded|net::ERR_ABORTED|interrupted by another navigation|ECONNRESET|net::ERR_CONNECTION_RESET|socket hang up/i;

/**
 * Che giấu capability token (?token=, %3Ftoken%3D, /reset-password/, /pay/, Bearer, GitHub PAT)
 * trước khi đưa chuỗi vào thông báo lỗi hoặc timeline của design-seed.
 */
export function redactCapabilityUrl(input: string): string {
	return input
		.replace(TOKEN_RE, "$1[redacted]")
		.replace(ENCODED_TOKEN_RE, "$1[redacted]")
		.replace(RESET_TOKEN_RE, "$1[redacted]")
		.replace(PAY_TOKEN_RE, "$1[redacted]")
		.replace(GH_BEARER_RE, "$1[redacted]")
		.replace(GH_PAT_RE, "[redacted]");
}

/** Lỗi HTTP 5xx hoặc trạng thái tạm thời chủ động ném để withNavRetry thử lại. */
export class TransientNavError extends Error {
	constructor(message: string) {
		super(redactCapabilityUrl(message));
		this.name = "TransientNavError";
	}
}

export function isTransientNavError(err: unknown): boolean {
	if (err instanceof TransientNavError) return true;
	const text =
		err instanceof Error ? `${err.name}: ${err.message}` : String(err);
	if (REFUSED_RE.test(text)) return false;
	if (err instanceof Error && err.name === "TimeoutError") return true;
	return TRANSIENT_NAV_RE.test(text);
}

export interface DeadlineBudgetOptions {
	minRemainingMs?: number;
	safetyMarginMs?: number;
	now?: () => number;
}

/**
 * Kẹp timeout của một thao tác theo SEED_DEADLINE chung để kịp fail-loud
 * trước khi tiến trình cha (capture.mjs) gửi SIGTERM.
 */
export function clampTimeoutMs(
	deadline: number,
	maxMs: number,
	label: string,
	opts?: DeadlineBudgetOptions,
): number {
	const minRemainingMs = opts?.minRemainingMs ?? 5_000;
	const safetyMarginMs = opts?.safetyMarginMs ?? 2_000;
	const now = opts?.now ?? Date.now;
	const remaining = deadline - now();
	const budgetMs = Math.min(maxMs, remaining - safetyMarginMs);
	if (remaining < minRemainingMs || budgetMs < minRemainingMs) {
		throw new Error(
			`[design-seed] ${redactCapabilityUrl(label)} vượt SEED_DEADLINE (remaining=${remaining}ms, min=${minRemainingMs}ms)`,
		);
	}
	return budgetMs;
}

export interface RetryOptions extends DeadlineBudgetOptions {
	label: string;
	attempts?: number;
	perAttemptMs?: number;
	deadline: number;
	retryDelayMs?: number;
	isTransient?: (err: unknown) => boolean;
	sleep?: (ms: number) => Promise<void>;
	onRetry?: (info: {
		nextAttempt: number;
		label: string;
		lastEntry: string;
	}) => void;
}

function defaultSleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/**
 * Thực thi thao tác điều hướng/xác thực với số lần thử giới hạn và trần deadline.
 * Tuyệt đối không gắn `{ cause: err }` để tránh Node in raw URL chứa ?token= của Playwright.
 */
export async function withNavRetry<T>(
	attemptFn: (timeoutMs: number, attempt: number) => Promise<T>,
	opts: RetryOptions,
): Promise<T> {
	const safeLabel = redactCapabilityUrl(opts.label);
	const attempts = opts.attempts ?? 2;
	if (!Number.isInteger(attempts) || attempts < 1) {
		throw new RangeError(`attempts phải >= 1 (nhận ${attempts})`);
	}
	const perAttemptMs = opts.perAttemptMs ?? 45_000;
	const minRemainingMs = opts.minRemainingMs ?? 5_000;
	const safetyMarginMs = opts.safetyMarginMs ?? 2_000;
	const retryDelayMs = opts.retryDelayMs ?? 500;
	const now = opts.now ?? Date.now;
	const isTransient = opts.isTransient ?? isTransientNavError;
	const sleep = opts.sleep ?? defaultSleep;

	const timeline: string[] = [];

	for (let attempt = 1; attempt <= attempts; attempt++) {
		if (attempt > 1 && retryDelayMs > 0) {
			const beforeSleepRemaining = opts.deadline - now();
			if (
				beforeSleepRemaining <
				retryDelayMs + minRemainingMs + safetyMarginMs
			) {
				timeline.push(
					`attempt ${attempt}: skipped before backoff (remaining=${beforeSleepRemaining}ms)`,
				);
				break;
			}
			opts.onRetry?.({
				nextAttempt: attempt,
				label: safeLabel,
				lastEntry: timeline.at(-1) ?? "",
			});
			await sleep(retryDelayMs);
		}

		const remaining = opts.deadline - now();
		const budgetMs = Math.min(perAttemptMs, remaining - safetyMarginMs);
		if (remaining < minRemainingMs || budgetMs < minRemainingMs) {
			timeline.push(
				`attempt ${attempt}: skipped (remaining=${remaining}ms, min=${minRemainingMs}ms)`,
			);
			break;
		}

		const t0 = now();
		try {
			return await attemptFn(budgetMs, attempt);
		} catch (err) {
			const elapsed = now() - t0;
			const rawErr =
				err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			timeline.push(
				`attempt ${attempt} (+${elapsed}ms, budget=${budgetMs}ms): ${redactCapabilityUrl(rawErr).slice(0, 240)}`,
			);
			if (!isTransient(err)) {
				throw new Error(
					`[design-seed] ${safeLabel} thất bại không thể retry — ${timeline.join(" -> ")}`,
				);
			}
		}
	}

	throw new Error(
		`[design-seed] ${safeLabel} thất bại sau ${timeline.length}/${attempts} bước — ${timeline.join(" -> ")}`,
	);
}

export interface SessionCookieLike {
	name: string;
	value: string;
}

export interface VerifyEmailApiCheckInput {
	status: number;
	location: string | null | undefined;
	studentOrigin: string;
	cookies: ReadonlyArray<SessionCookieLike>;
}

/**
 * Kiểm tra phản hồi 302 từ GET /api/auth/verify-email (maxRedirects: 0):
 * - Location phải là URL tuyệt đối (không truyền base URL khi parse) cùng origin với studentOrigin
 * - Không chứa userinfo, pathname đúng /verify-email, query chỉ gồm verified=ok (không có error=)
 * - Cookie jar có cookie phiên khác rỗng
 */
export function assertVerifiedEmailRedirect(
	input: VerifyEmailApiCheckInput,
): void {
	const safeLoc = redactCapabilityUrl(String(input.location ?? ""));
	if (input.status !== 302) {
		throw new Error(
			`verify-email kỳ vọng HTTP 302 nhưng nhận ${input.status} (location=${safeLoc || "trống"})`,
		);
	}
	if (typeof input.location !== "string" || input.location.length === 0) {
		throw new Error("verify-email trả 302 nhưng thiếu Location header");
	}

	let locUrl: URL;
	try {
		locUrl = new URL(input.location);
	} catch {
		throw new Error(
			`verify-email Location không phải URL tuyệt đối hợp lệ: ${safeLoc}`,
		);
	}

	if (locUrl.username !== "" || locUrl.password !== "") {
		throw new Error("verify-email Location chứa userinfo không hợp lệ");
	}

	const expectedOrigin = new URL(input.studentOrigin).origin;
	if (locUrl.origin !== expectedOrigin) {
		throw new Error(
			`verify-email Location sai origin: nhận ${locUrl.origin}, kỳ vọng ${expectedOrigin}`,
		);
	}
	if (locUrl.pathname !== "/verify-email") {
		throw new Error(
			`verify-email Location sai pathname: nhận ${locUrl.pathname}, kỳ vọng /verify-email`,
		);
	}
	if (locUrl.searchParams.has("error")) {
		throw new Error(
			`verify-email trả lỗi xác thực trên Location: ${redactCapabilityUrl(locUrl.search)}`,
		);
	}
	if (locUrl.searchParams.get("verified") !== "ok") {
		throw new Error(
			`verify-email Location thiếu verified=ok: ${redactCapabilityUrl(locUrl.search)}`,
		);
	}
	for (const key of locUrl.searchParams.keys()) {
		if (key !== "verified") {
			throw new Error(
				`verify-email Location chứa tham số lạ "${redactCapabilityUrl(key)}"`,
			);
		}
	}

	const hasSessionCookie = input.cookies.some(
		(cookie) =>
			cookie.value.length > 0 &&
			(cookie.name === "better-auth.session_token" ||
				cookie.name === "__Secure-better-auth.session_token" ||
				cookie.name.endsWith(".session_token")),
	);
	if (!hasSessionCookie) {
		throw new Error(
			"verify-email không tìm thấy cookie session_token có giá trị trong studentCtx",
		);
	}
}
