import { ROLE_HOME_PATH, resolvePostAuthRedirect } from "@teacher-os/auth/role";

export const DEFAULT_RETURN_URL = ROLE_HOME_PATH.admin;

/**
 * Validate a post-login return URL for the `/admin` app. Delegates to
 * `resolvePostAuthRedirect("admin", raw)` so only safe same-origin `/admin`
 * paths are accepted and everything else falls back to `/admin`.
 */
export function validateReturnUrl(raw: string | undefined | null): string {
	return resolvePostAuthRedirect("admin", raw);
}
