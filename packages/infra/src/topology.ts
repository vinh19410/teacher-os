/**
 * Single source of truth for the deploy topology: one bare domain (APP_DOMAIN)
 * derives every origin, the cookie domain and the Google redirect URI —
 * msmy.io.vn for prod, staging.teacheros.io.vn for staging. The runbook
 * never changes topology by itself — changing APP_DOMAIN is the only way.
 *
 * When APP_DOMAIN is unset (local dev) the stack keeps the generated
 * workers.dev URLs and per-host cookies.
 */
export interface DomainTopology {
	/** Unified LMS gateway hostname: lms.<domain> */
	lmsHost: string;
	/** Canonical browser origin of the unified LMS app (CORS_ORIGIN / STUDENT_ORIGINS / ADMIN_ORIGINS default). */
	lmsOrigin: string;
	/**
	 * Legacy portal hostnames attached to the unified LMS Worker as aliases so
	 * the Worker serves 301 redirects to `https://lms.<domain>` (and keeps
	 * `/sw.js` + `/registerSW.js` self-heal stubs on `app.<domain>`).
	 */
	lmsAliases: string[];
	/** Canonical teacher portal URL: https://lms.<domain>/teacher */
	teacherUrl: string;
	/** Canonical student portal URL: https://lms.<domain>/student */
	studentPortalUrl: string;
	/** Canonical admin console URL: https://lms.<domain>/admin */
	adminUrl: string;
	/** Legacy web app hostname (redirected via lmsAliases): app.<domain> */
	appHost: string;
	/** API worker hostname: api.<domain> */
	apiHost: string;
	/** Legacy web app origin (redirected via lmsAliases): https://app.<domain> */
	appOrigin: string;
	/** Legacy student portal hostname (redirected via lmsAliases): student.<domain> */
	studentHost: string;
	/** Legacy student portal origin (redirected via lmsAliases): https://student.<domain> */
	studentOrigin: string;
	/** Legacy admin console hostname (redirected via lmsAliases): admin.<domain> */
	adminHost: string;
	/** Legacy admin console origin (redirected via lmsAliases): https://admin.<domain> */
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
	 * member of the prod or former-prod cookie zone gets "teacheros-staging" —
	 * staging's cookie zone nests inside the former prod zone
	 * (Domain=.teacheros.io.vn), and same-name cookies from the parent zone
	 * shadowed staging sessions (issue #125).
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
	/**
	 * Landing page hostname: the bare APP_DOMAIN itself on staging. Undefined
	 * on prod, where the apex is the teacher profile and landing is not attached.
	 */
	landingHost: string | undefined;
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
export const PROD_APP_DOMAIN = "msmy.io.vn";

/** The prod teacher-profile apex (#536) — only attached when APP_DOMAIN === PROD_APP_DOMAIN. */
export const PROD_PROFILE_DOMAIN = "msmy.io.vn";

/**
 * Former prod apex. Browsers may still hold default-namespace session cookies
 * scoped to `.teacheros.io.vn`, and staging still lives under it, so staging
 * keeps the prefixed namespace to avoid the shadowing from issue #125.
 */
export const LEGACY_PROD_APP_DOMAIN = "teacheros.io.vn";

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

	const inCookieZone = (zone: string) =>
		domain === zone || domain.endsWith(`.${zone}`);
	const inProdCookieZone =
		inCookieZone(PROD_APP_DOMAIN) || inCookieZone(LEGACY_PROD_APP_DOMAIN);
	const lmsHost = `lms.${domain}`;
	const lmsOrigin = `https://${lmsHost}`;
	const appHost = `app.${domain}`;
	const studentHost = `student.${domain}`;
	const adminHost = `admin.${domain}`;
	const lmsAliases = [appHost, studentHost, adminHost];
	const apiOrigin = `https://api.${domain}`;
	const appAliases: string[] = [];
	const isProd = domain === PROD_APP_DOMAIN;
	const profileHost = isProd ? PROD_PROFILE_DOMAIN : `profile.${domain}`;
	const profileAliases = isProd ? [`www.${PROD_PROFILE_DOMAIN}`] : [];
	const profileOrigins = [profileHost, ...profileAliases].map(
		(h) => `https://${h}`,
	);
	return {
		lmsHost,
		lmsOrigin,
		lmsAliases,
		teacherUrl: `${lmsOrigin}/teacher`,
		studentPortalUrl: `${lmsOrigin}/student`,
		adminUrl: `${lmsOrigin}/admin`,
		appHost,
		apiHost: `api.${domain}`,
		appOrigin: `https://${appHost}`,
		studentHost,
		studentOrigin: `https://${studentHost}`,
		adminHost,
		adminOrigin: `https://${adminHost}`,
		apiOrigin,
		authBaseURL: `${apiOrigin}${AUTH_MOUNT_PATH}`,
		googleRedirectURI: `${apiOrigin}${AUTH_MOUNT_PATH}/callback/google`,
		cookieDomain: `.${domain}`,
		authCookiePrefix:
			inProdCookieZone && domain !== PROD_APP_DOMAIN
				? AUTH_COOKIE_PREFIX
				: undefined,
		appAliases,
		// Prod apex belongs to the profile site, so landing gets no domain there.
		landingHost: isProd ? undefined : domain,
		landingAliases: isProd ? [] : [`www.${domain}`],
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

/**
 * Cờ build-time bật menu Luyện tập & Lịch sử ở apps/student (#852).
 * Mặc định tắt ("false") trên PROD và bị chặn fail-closed trên PROD_APP_DOMAIN
 * trong khi nội dung/cổng bản quyền tự luyện trên PROD chưa mở.
 * Staging (deploy-staging.yml) đặt STUDENT_PRACTICE_ENABLED="true" và
 * alchemy.run.ts ánh xạ sang VITE_STUDENT_PRACTICE_ENABLED cho lms Worker.
 * Fail-loud khi nhận giá trị non-empty không hợp lệ để tránh gõ nhầm âm thầm rơi về "false".
 */
export function resolveStudentPracticeEnabled(
	raw: string | undefined,
	appDomain: string | undefined,
): "true" | "false" {
	const value = (raw ?? "").trim();
	if (value === "" || value === "false") {
		return "false";
	}
	if (value === "true") {
		if (appDomain?.trim() === PROD_APP_DOMAIN) {
			throw new Error(
				"STUDENT_PRACTICE_ENABLED must not be enabled on production",
			);
		}
		return "true";
	}
	throw new Error(
		`Invalid STUDENT_PRACTICE_ENABLED value "${raw}" (expected "true", "false", or empty)`,
	);
}
