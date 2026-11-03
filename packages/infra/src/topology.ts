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
	/** Student portal hostname: student.<domain> */
	studentHost: string;
	/** Browser origin of the student portal. */
	studentOrigin: string;
	/** Admin console hostname: admin.<domain> (plan #413). */
	adminHost: string;
	/** Browser origin of the admin console (plan #413). */
	adminOrigin: string;
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
	/**
	 * Additional hostnames attached to the web Worker.
	 * Currently empty: apex and www are now attached to the landing Worker instead.
	 * Note: Historical note — using WorkerDomainConfig `aliases` (rather than `redirects`)
	 * avoids calling Cloudflare Rulesets API, which requires extra Zone Ruleset permissions
	 * not present on standard CI deploy tokens (still holds true for landingAliases).
	 */
	appAliases: string[];
	/** Landing page hostname: the bare APP_DOMAIN itself (prod apex). */
	landingHost: string;
	/**
	 * Additional hostnames attached to the landing Worker. Serves the same
	 * content (no 301 to apex — Redirect Rules need the Rulesets API the CI
	 * token lacks); duplicate content is handled by the page's canonical tag.
	 */
	landingAliases: string[];
	/**
	 * Teacher profile hostname (#536): `msmy.io.vn` on production
	 * (`APP_DOMAIN === PROD_APP_DOMAIN`), `profile.<domain>` everywhere else.
	 */
	profileHost: string;
	/**
	 * Additional hostnames attached to the profile Worker (#536):
	 * `["www.msmy.io.vn"]` on production, empty elsewhere.
	 */
	profileAliases: string[];
	/**
	 * Browser origins of the profile site (`https://` + host and aliases, #536).
	 * Drives the default `LEAD_ORIGINS` binding via `resolveLeadOrigins`.
	 */
	profileOrigins: string[];
}

/** The prod apex — the only member of its cookie zone allowed to keep the
 * default auth cookie namespace. */
export const PROD_APP_DOMAIN = "teacheros.io.vn";

/** The prod teacher-profile apex (#536) — only attached when APP_DOMAIN === PROD_APP_DOMAIN. */
export const PROD_PROFILE_DOMAIN = "msmy.io.vn";

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
	const appAliases: string[] = [];
	const isProd = domain === PROD_APP_DOMAIN;
	const profileHost = isProd ? PROD_PROFILE_DOMAIN : `profile.${domain}`;
	const profileAliases = isProd ? [`www.${PROD_PROFILE_DOMAIN}`] : [];
	const profileOrigins = [profileHost, ...profileAliases].map(
		(h) => `https://${h}`,
	);
	return {
		appHost: `app.${domain}`,
		apiHost: `api.${domain}`,
		appOrigin: `https://app.${domain}`,
		studentHost: `student.${domain}`,
		studentOrigin: `https://student.${domain}`,
		adminHost: `admin.${domain}`,
		adminOrigin: `https://admin.${domain}`,
		apiOrigin,
		authBaseURL: `${apiOrigin}${AUTH_MOUNT_PATH}`,
		googleRedirectURI: `${apiOrigin}${AUTH_MOUNT_PATH}/callback/google`,
		cookieDomain: `.${domain}`,
		authCookiePrefix:
			inProdCookieZone && domain !== PROD_APP_DOMAIN
				? AUTH_COOKIE_PREFIX
				: undefined,
		appAliases,
		landingHost: domain,
		landingAliases: [`www.${domain}`],
		profileHost,
		profileAliases,
		profileOrigins,
	};
}

/** Staging QA flag AUTH_ASSUME_EMAIL_VERIFIED. Throws on the prod domain so
 * the flag can never weaken email verification in production. */
export function resolveAssumeEmailVerified(
	flag: string | undefined,
	appDomain: string | undefined,
): boolean {
	const enabled = flag === "true";
	if (enabled && appDomain?.trim() === PROD_APP_DOMAIN) {
		throw new Error(
			"AUTH_ASSUME_EMAIL_VERIFIED must never be enabled on production",
		);
	}
	return enabled;
}

/** Single-org theo chính sách (#513): rỗng = không giới hạn (dev/e2e/staging);
 * trên production bắt buộc phải có ít nhất một email hợp lệ sau khi tách dấu phẩy. */
export function resolveTeacherEmails(
	raw: string | undefined,
	appDomain: string | undefined,
): string {
	const value = raw?.trim() ?? "";
	const entries = value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (entries.length === 0 && appDomain?.trim() === PROD_APP_DOMAIN) {
		throw new Error(
			"TEACHER_EMAILS must be set on production (single-org owner mode)",
		);
	}
	return value;
}

/** Origin mặc định của trang profile công khai ở môi trường dev local. */
export const DEFAULT_DEV_LEAD_ORIGINS = "http://localhost:8005";

/**
 * Lead intake (#506, #524, #536): chuẩn hóa danh sách origin cho phép gửi
 * `/public/leads` và đọc `/public/placement-test`. Khi biến GitHub Environment
 * chưa đặt (`""`), khoảng trắng hoặc chỉ có dấu phẩy (`,`), tự rơi về
 * `topology.profileOrigins` (prod: `msmy.io.vn` + `www`; staging:
 * `profile.<domain>`) hoặc `DEFAULT_DEV_LEAD_ORIGINS` ở dev thay vì để chuỗi
 * rỗng chặn toàn bộ POST.
 */
export function resolveLeadOrigins(
	raw: string | undefined,
	options: {
		topology?: Pick<DomainTopology, "profileOrigins">;
		isDev: boolean;
	},
): string {
	const entries = (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	if (entries.length > 0) {
		return entries.join(",");
	}
	if (options.topology) {
		return options.topology.profileOrigins.join(",");
	}
	if (options.isDev) {
		return DEFAULT_DEV_LEAD_ORIGINS;
	}
	throw new Error("LEAD_ORIGINS must be set when deploying without APP_DOMAIN");
}
