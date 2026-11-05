import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/kernel-load-state";

let started = false;

// Back/forward cache restores the page (and this module's flag) without a
// fresh load — a later 401 must still be able to re-authenticate.
if (typeof window !== "undefined") {
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) started = false;
	});
}

/**
 * 401 = the session is dead. Clear the session cookie best-effort (page state
 * dies with the full navigation that follows), then bounce to the login page
 * carrying a validated return URL so the teacher lands back where they were.
 * Retrying against a dead session is pointless.
 *
 * Single-flight: read (QueryCache.onError) and write (bus onAuthLost) paths
 * can both observe a 401 at the same moment — the module flag guarantees the
 * sign-out/redirect pair runs exactly once per document. `location.assign` is
 * a full page load, so the flag never needs a reset path.
 */
export function reauth(): void {
	if (started) return;
	started = true;
	authClient.clearSessionCache?.();
	void authClient.signOut().catch(() => undefined);
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = validateReturnUrl(current);
	window.location.assign(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}
