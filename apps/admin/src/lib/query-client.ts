import { QueryCache, QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/validate-return-url";

export class HttpError extends Error {
	readonly status: number;
	readonly code?: string;

	constructor(status: number, message: string, options?: { code?: string }) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.code = options?.code;
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}

const REAUTH_SIGNOUT_TIMEOUT_MS = 2_000;

let reauthing = false;
let reauthEpoch = 0;
let activeTimer: ReturnType<typeof setTimeout> | undefined;

function cancelPendingReauth(): void {
	reauthing = false;
	reauthEpoch += 1;
	if (activeTimer !== undefined) {
		clearTimeout(activeTimer);
		activeTimer = undefined;
	}
}

if (
	typeof window !== "undefined" &&
	typeof window.addEventListener === "function"
) {
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) cancelPendingReauth();
	});
	window.addEventListener("pagehide", () => {
		cancelPendingReauth();
	});
}

export function reauth(): void {
	if (reauthing) return;
	reauthing = true;
	const epoch = reauthEpoch;
	authClient.clearSessionCache?.();
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = validateReturnUrl(current);
	const targetUrl = `/login?returnUrl=${encodeURIComponent(returnUrl)}`;

	let signOutPromise: Promise<unknown>;
	try {
		signOutPromise = Promise.resolve(authClient.signOut()).catch(
			() => undefined,
		);
	} catch {
		signOutPromise = Promise.resolve();
	}

	void (async () => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			await Promise.race([
				signOutPromise,
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, REAUTH_SIGNOUT_TIMEOUT_MS);
					activeTimer = timer;
				}),
			]);
		} finally {
			if (timer !== undefined) {
				clearTimeout(timer);
				if (activeTimer === timer) activeTimer = undefined;
			}
		}
		if (epoch !== reauthEpoch || typeof window === "undefined") return;
		window.location.assign(targetUrl);
	})();
}

export function createAdminQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60_000,
				gcTime: 5 * 60_000,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: false,
				networkMode: "offlineFirst",
			},
		},
		queryCache: new QueryCache({
			onError: (error) => {
				if (isHttpError(error) && error.status === 401) {
					reauth();
				}
			},
		}),
	});
}

/**
 * App-scoped QueryClient duy nhất của admin app — main.tsx mount vào
 * Provider và route loader dùng cho ensureQueryData để hai phía chia
 * cùng một cache (pattern student #283).
 */
export const adminQueryClient = createAdminQueryClient();
