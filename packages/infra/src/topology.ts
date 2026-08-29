/**
 * Single source of truth for the deploy topology: one bare domain (APP_DOMAIN)
 * derives every origin, the cookie domain and the Google redirect URI —
 * teacheros.io.vn for prod, staging.teacheros.io.vn for staging. The runbook
 * never changes topology by itself — changing APP_DOMAIN is the only way.
 *
 * When APP_DOMAIN is unset (local dev) the stack keeps the generated
 * workers.dev URLs and per-host cookies.
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
	/**
	 * Namespace prefix for auth cookie names, or undefined for the default
	 * `better-auth` namespace. The prod domain keeps the default; any OTHER
	 * member of the prod cookie zone gets "teacheros-staging" — staging's
	 * cookie zone nests inside prod's (Domain=.teacheros.io.vn), and same-name
	 * cookies from the parent zone shadowed staging sessions (issue #125).
	 * Unrelated zones don't share a cookie zone with prod and need no prefix.
	 */
	authCookiePrefix: string | undefined;
}

/** The prod apex — the only member of its cookie zone allowed to keep the
 * default auth cookie namespace. */
export const PROD_APP_DOMAIN = "teacheros.io.vn";

/** Auth cookie namespace assigned to every non-prod member of the prod zone. */
export const AUTH_COOKIE_PREFIX = "teacheros-staging";

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

	const inProdCookieZone =
		domain === PROD_APP_DOMAIN || domain.endsWith(`.${PROD_APP_DOMAIN}`);
	const apiOrigin = `https://api.${domain}`;
	return {
		appHost: `app.${domain}`,
		apiHost: `api.${domain}`,
		appOrigin: `https://app.${domain}`,
		apiOrigin,
		authBaseURL: `${apiOrigin}${AUTH_MOUNT_PATH}`,
		googleRedirectURI: `${apiOrigin}${AUTH_MOUNT_PATH}/callback/google`,
		cookieDomain: `.${domain}`,
		authCookiePrefix:
			inProdCookieZone && domain !== PROD_APP_DOMAIN
				? AUTH_COOKIE_PREFIX
				: undefined,
	};
}
