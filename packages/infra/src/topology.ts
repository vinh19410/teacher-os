/**
 * Single source of truth for the production topology: one bare domain
 * (APP_DOMAIN) derives every origin, the cookie domain and the Google redirect
 * URI. The runbook never changes topology by itself — changing APP_DOMAIN here
 * is the only way.
 *
 * When APP_DOMAIN is unset the stack keeps the generated workers.dev URLs and
 * per-host cookies (dev/staging behavior).
 */
export interface DomainTopology {
	/** Web app hostname: app.<domain> */
	appHost: string;
	/** API worker hostname: api.<domain> */
	apiHost: string;
	/** Browser origin of the web app (CORS_ORIGIN default). */
	appOrigin: string;
	/** Browser origin of the API (BETTER_AUTH_URL). */
	apiOrigin: string;
	/** better-auth base URL including the /api/auth mount path. */
	authBaseURL: string;
	/** Redirect URI to register in the Google OAuth console. */
	googleRedirectURI: string;
	/** Dot-prefixed parent domain for cross-subdomain session cookies. */
	cookieDomain: string;
}

const AUTH_MOUNT_PATH = "/api/auth";

export function resolveDomainTopology(appDomain: string): DomainTopology {
	const domain = appDomain.trim();
	if (
		!domain ||
		/\s/.test(domain) ||
		domain.includes(":") ||
		domain.includes("/") ||
		domain.startsWith(".") ||
		domain.endsWith(".")
	) {
		throw new Error(
			`APP_DOMAIN must be a bare domain like teacher-os.edu.vn (no scheme, path, port, or leading/trailing dot), got: ${appDomain}`,
		);
	}
	if (domain !== domain.toLowerCase()) {
		throw new Error(`APP_DOMAIN must be lowercase, got: ${appDomain}`);
	}

	const apiOrigin = `https://api.${domain}`;
	return {
		appHost: `app.${domain}`,
		apiHost: `api.${domain}`,
		appOrigin: `https://app.${domain}`,
		apiOrigin,
		authBaseURL: `${apiOrigin}${AUTH_MOUNT_PATH}`,
		googleRedirectURI: `${apiOrigin}${AUTH_MOUNT_PATH}/callback/google`,
		cookieDomain: `.${domain}`,
	};
}
