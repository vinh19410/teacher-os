/**
 * Pure first-load state machine for the kernel snapshot.
 *
 * Kept free of React/fetch imports so classification, transitions and the
 * return-URL guard are unit-testable in the node Vitest environment.
 */

/**
 * Transport failure with an HTTP status (`!res.ok` from the kernel API).
 * `reason` (#98) carries the server's machine-readable `{reason}` body field
 * when the body was JSON with that exact string — garbage/non-JSON bodies
 * leave it undefined so classification stays status-code-based.
 */
export class HttpError extends Error {
	readonly status: number;
	readonly reason?: string;

	constructor(status: number, message: string, options?: { reason?: string }) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.reason = options?.reason;
	}
}

/** A `2xx` response whose body is not JSON or does not match the snapshot shape. */
export class MalformedSnapshotError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "MalformedSnapshotError";
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}

export type LoadFailureKind = "reauth" | "retryable" | "fatal";

export type LoadFailureReason =
	| "unauthorized"
	| "timeout"
	| "network"
	| "server"
	| "malformed"
	| "http-client-error"
	| "unknown";

export interface LoadFailure {
	kind: LoadFailureKind;
	reason: LoadFailureReason;
	message: string;
}

export type LoadState =
	| { status: "loading" }
	| { status: "ready" }
	| { status: "error"; failure: LoadFailure };

export function beginLoad(): LoadState {
	return { status: "loading" };
}

/** Map any thrown value to the blocking state the provider should render. */
export function classifyLoadError(error: unknown): LoadFailure {
	if (isHttpError(error)) {
		if (error.status === 401) {
			return {
				kind: "reauth",
				reason: "unauthorized",
				message: "Phiên đăng nhập đã hết hạn.",
			};
		}
		if (error.status >= 500) {
			return {
				kind: "retryable",
				reason: "server",
				message: "Máy chủ gặp sự cố. Vui lòng thử lại sau ít phút.",
			};
		}
		return {
			kind: "fatal",
			reason: "http-client-error",
			message: `Không tải được dữ liệu workspace (HTTP ${error.status}).`,
		};
	}
	// MalformedSnapshotError = a 2xx body with the wrong shape;
	// SyntaxError = res.json() on a non-JSON body.
	if (error instanceof MalformedSnapshotError || error instanceof SyntaxError) {
		return {
			kind: "retryable",
			reason: "malformed",
			message: "Dữ liệu máy chủ trả về không đúng định dạng.",
		};
	}
	if (error instanceof DOMException && error.name === "TimeoutError") {
		return {
			kind: "retryable",
			reason: "timeout",
			message: "Tải dữ liệu vượt quá thời gian chờ.",
		};
	}
	if (error instanceof TypeError) {
		return {
			kind: "retryable",
			reason: "network",
			message: "Không kết nối được với máy chủ.",
		};
	}
	return {
		kind: "retryable",
		reason: "unknown",
		message: "Không tải được dữ liệu lớp/học viên từ máy chủ.",
	};
}

export function settleLoadSuccess(): LoadState {
	return { status: "ready" };
}

export function settleLoadFailure(error: unknown): LoadState {
	return { status: "error", failure: classifyLoadError(error) };
}

/**
 * Only the newest attempt may settle provider state — a stale rejection must
 * never flip an already-ready workspace back to the error screen.
 */
export function shouldSettle(attemptSeq: number, latestSeq: number): boolean {
	return attemptSeq === latestSeq;
}

export const DEFAULT_RETURN_URL = "/dashboard";

/**
 * C0–C1 control characters and DEL. Checked as code units rather than a regex
 * character class on purpose: linters reject control characters in regex
 * patterns, and a plain loop states the intent just as clearly.
 */
function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

/**
 * Validate a post-login return URL. Only same-app paths are allowed: it must
 * decode to a value starting with exactly one `/`, never `//` or `/\` (which
 * browsers treat as foreign origins), and never a `scheme:` URL. Control
 * characters are rejected outright — the WHATWG URL parser strips tab/LF/CR
 * before parsing, so `/\t/evil.com` would otherwise pass this guard and
 * resolve to a foreign origin. Anything else falls back to the dashboard, so
 * a crafted `?returnUrl=` can never become an open redirect.
 */
export function validateReturnUrl(raw: string | undefined | null): string {
	if (!raw) {
		return DEFAULT_RETURN_URL;
	}
	let candidate = raw;
	// Decode up to twice: recheck the decoded form so `%2F%2Fevil.com` and
	// `%252F%252Fevil.com` are caught by the same rules.
	for (let round = 0; round < 2; round += 1) {
		try {
			const decoded = decodeURIComponent(candidate);
			if (decoded === candidate) {
				break;
			}
			candidate = decoded;
		} catch {
			return DEFAULT_RETURN_URL;
		}
	}
	// Stripped by the URL parser before parsing — must reject, not strip,
	// or `/\t/evil.com` sneaks past the `//` rule below.
	if (hasControlCharacter(candidate)) {
		return DEFAULT_RETURN_URL;
	}
	if (
		!candidate.startsWith("/") ||
		candidate.startsWith("//") ||
		candidate.startsWith("/\\")
	) {
		return DEFAULT_RETURN_URL;
	}
	// Unreachable while the leading-slash rule above holds (a `scheme:` URL
	// never starts with `/`); kept as defense-in-depth in case that rule is
	// ever relaxed or reordered.
	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
		return DEFAULT_RETURN_URL;
	}
	return candidate;
}
