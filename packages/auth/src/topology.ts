const AUTH_MOUNT_PATH = "/api/auth";

/**
 * The server mounts better-auth under /api/auth (apps/server/src/app.ts), so
 * the auth base URL is the API origin plus that exact mount path. BETTER_AUTH_URL
 * is an origin (workers.dev URL or https://api.<domain>); better-auth derives
 * the Google redirect URI from this base, so an origin without the mount path
 * would produce a callback URL that 404s.
 */
export function authBaseURL(origin: string): string {
	const trimmed = origin.trim().replace(/\/+$/, "");
	if (!/^https?:\/\//.test(trimmed)) {
		throw new Error(
			`BETTER_AUTH_URL must be an absolute origin with an http(s) scheme, got: ${origin}`,
		);
	}
	if (trimmed.endsWith(AUTH_MOUNT_PATH)) {
		return trimmed;
	}
	return `${trimmed}${AUTH_MOUNT_PATH}`;
}

/**
 * Validate the COOKIE_DOMAIN binding. Cross-subdomain cookies are only enabled
 * when the binding holds a dot-prefixed parent domain (".<domain>"); an empty
 * binding keeps better-auth's default per-host cookies for workers.dev/dev
 * deployments.
 */
export function crossSubDomainCookieDomain(
	cookieDomain?: string,
): string | undefined {
	const value = cookieDomain?.trim();
	if (!value) {
		return undefined;
	}
	if (value.includes("/") || value.includes(":")) {
		throw new Error(
			`COOKIE_DOMAIN must be a host only (no scheme/path/port), got: ${value}`,
		);
	}
	if (!value.startsWith(".")) {
		throw new Error(
			`COOKIE_DOMAIN must start with a leading dot, got: ${value}`,
		);
	}
	if (value !== value.toLowerCase()) {
		throw new Error(`COOKIE_DOMAIN must be lowercase, got: ${value}`);
	}
	return value;
}
