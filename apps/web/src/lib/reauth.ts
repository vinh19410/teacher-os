import { authClient } from "@/lib/auth-client";
import { toTeacherReturnUrl, validateReturnUrl } from "@/lib/kernel-load-state";

const REAUTH_SIGNOUT_TIMEOUT_MS = 2_000;

let started = false;
let reauthEpoch = 0;
let activeTimer: ReturnType<typeof setTimeout> | undefined;

function cancelPendingReauth(): void {
	started = false;
	reauthEpoch += 1;
	if (activeTimer !== undefined) {
		clearTimeout(activeTimer);
		activeTimer = undefined;
	}
}

export function resetReauthForTests(): void {
	cancelPendingReauth();
}

// Back/forward cache restores the page (and this module's flag) without a
// fresh load — cancel any stale continuation and allow a later 401 to
// re-authenticate cleanly.
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

/**
 * 401 = the session is dead. Clear client caches and invoke `signOut()`
 * synchronously, waiting for it to settle (bounded by a 2s timeout) so the
 * browser does not abort the cookie-clearing request before bouncing to
 * `/login` with a validated return URL.
 *
 * Single-flight: read (QueryCache.onError) and write (bus onAuthLost) paths
 * can both observe a 401 at the same moment — the module flag guarantees the
 * sign-out/redirect pair runs exactly once per document.
 */
export function reauth(): void {
	if (started) return;
	started = true;
	const epoch = reauthEpoch;
	authClient.clearSessionCache?.();
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = toTeacherReturnUrl(validateReturnUrl(current));
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
