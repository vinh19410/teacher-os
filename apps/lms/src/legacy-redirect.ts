import { isLocalHost } from "./security-headers.ts";

const UNIFIED_AUTH_PATHS = new Set([
	"/login",
	"/forgot-password",
	"/reset-password",
	"/verify-email",
]);

const SW_PASSTHROUGH_PATHS = new Set(["/sw.js", "/registerSW.js"]);

const PORTAL_PREFIXES = ["/teacher", "/student", "/admin"] as const;
const REDIRECT_SCHEME_PREFIX_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const ENCODED_CONTROL_CHAR_RE = /%(?:25)*(?:0[0-9a-f]|1[0-9a-f]|7f)/i;
const REDIRECT_BASE_ORIGIN = "https://lms.invalid";

function isUnifiedAuthPath(pathname: string): boolean {
	const normalized = pathname.replace(/\/+$/, "") || "/";
	return UNIFIED_AUTH_PATHS.has(normalized);
}

function isPayPath(pathname: string): boolean {
	return pathname === "/pay" || pathname.startsWith("/pay/");
}

function matchesSegmentPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function prefixPath(pathname: string, prefix: string): string {
	if (matchesSegmentPrefix(pathname, prefix)) {
		return pathname;
	}
	if (pathname === "/") {
		return prefix;
	}
	return `${prefix}${pathname}`;
}

function hasControlCharacter(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) {
			return true;
		}
	}
	return false;
}

function stripReturnUrlParam(url: URL): string {
	const nextParams = new URLSearchParams(url.searchParams);
	nextParams.delete("returnUrl");
	const serialized = nextParams.toString();
	return serialized.length > 0 ? `?${serialized}` : "";
}

function isSafeRelativeReturnUrl(raw: string): boolean {
	if (
		raw.length === 0 ||
		hasControlCharacter(raw) ||
		ENCODED_CONTROL_CHAR_RE.test(raw) ||
		!raw.startsWith("/") ||
		raw.startsWith("//") ||
		raw.startsWith("/\\") ||
		REDIRECT_SCHEME_PREFIX_RE.test(raw)
	) {
		return false;
	}

	// Read-only multi-round decode on the pathname portion to reject encoded
	// open-redirect bypasses (%2F%2F, %5C, double-encoded invalid UTF-8, or
	// control characters) without mangling valid %26/%23/%25 in query/hash.
	const pathEnd = raw.search(/[?#]/);
	let probe = pathEnd === -1 ? raw : raw.slice(0, pathEnd);
	for (let round = 0; round < 2; round += 1) {
		if (
			hasControlCharacter(probe) ||
			!probe.startsWith("/") ||
			probe.startsWith("//") ||
			probe.startsWith("/\\") ||
			probe.includes("\\") ||
			REDIRECT_SCHEME_PREFIX_RE.test(probe)
		) {
			return false;
		}
		try {
			const decoded = decodeURIComponent(probe);
			if (decoded === probe) break;
			probe = decoded;
		} catch {
			return false;
		}
	}
	if (
		hasControlCharacter(probe) ||
		!probe.startsWith("/") ||
		probe.startsWith("//") ||
		probe.startsWith("/\\") ||
		probe.includes("\\") ||
		REDIRECT_SCHEME_PREFIX_RE.test(probe)
	) {
		return false;
	}

	try {
		const parsed = new URL(raw, REDIRECT_BASE_ORIGIN);
		const parsedProbe = new URL(probe, REDIRECT_BASE_ORIGIN);
		if (
			parsed.origin !== REDIRECT_BASE_ORIGIN ||
			!parsed.pathname.startsWith("/") ||
			parsed.pathname.startsWith("//") ||
			parsedProbe.origin !== REDIRECT_BASE_ORIGIN ||
			!parsedProbe.pathname.startsWith("/") ||
			parsedProbe.pathname.startsWith("//")
		) {
			return false;
		}
	} catch {
		return false;
	}

	return true;
}

function rewriteLegacyLoginSearch(
	pathname: string,
	url: URL,
	portalPrefix: (typeof PORTAL_PREFIXES)[number],
): string {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";
	if (normalizedPath !== "/login" || !url.searchParams.has("returnUrl")) {
		return url.search;
	}

	const rawValues = url.searchParams.getAll("returnUrl");
	if (rawValues.length !== 1) {
		return stripReturnUrlParam(url);
	}
	const raw = rawValues[0] ?? "";
	if (!isSafeRelativeReturnUrl(raw)) {
		return stripReturnUrlParam(url);
	}

	const parsed = new URL(raw, REDIRECT_BASE_ORIGIN);
	if (
		PORTAL_PREFIXES.some((p) => matchesSegmentPrefix(parsed.pathname, p)) ||
		isPayPath(parsed.pathname) ||
		isUnifiedAuthPath(parsed.pathname)
	) {
		return url.search;
	}

	const rewritten = `${prefixPath(parsed.pathname, portalPrefix)}${parsed.search}${parsed.hash}`;
	const nextParams = new URLSearchParams(url.searchParams);
	nextParams.set("returnUrl", rewritten);
	return `?${nextParams.toString()}`;
}

function stripDomainPrefix(hostname: string, prefix: string): string | null {
	if (!hostname.startsWith(prefix)) {
		return null;
	}
	const rest = hostname.slice(prefix.length);
	return rest.length > 0 ? rest : null;
}

/**
 * Resolves 301 redirects from legacy subdomains (`app.`, `student.`, `admin.`,
 * `www.lms.`, former `teacheros.io.vn` hosts) to canonical `https://lms.<domain>`.
 * Returns `null` when the request should be handled in place (canonical `lms.`,
 * local/loopback, `workers.dev`, unknown host, or SW self-unregister stubs).
 */
export function resolveLegacyHostRedirect(request: Request): string | null {
	const url = new URL(request.url);
	const hostname = url.hostname.toLowerCase();

	if (
		isLocalHost(hostname) ||
		hostname === "workers.dev" ||
		hostname.endsWith(".workers.dev")
	) {
		return null;
	}

	const { pathname, search } = url;

	// Teacher legacy hosts: app.<domain>, www.app.<domain>, teacheros.io.vn, www.teacheros.io.vn
	let teacherTargetHost: string | null = null;
	if (
		hostname === "teacheros.io.vn" ||
		hostname === "www.teacheros.io.vn" ||
		hostname === "app.teacheros.io.vn" ||
		hostname === "www.app.teacheros.io.vn"
	) {
		teacherTargetHost = "lms.msmy.io.vn";
	} else {
		const domain =
			stripDomainPrefix(hostname, "www.app.") ??
			stripDomainPrefix(hostname, "app.");
		if (domain) {
			teacherTargetHost = `lms.${domain}`;
		}
	}

	if (teacherTargetHost) {
		// Service-worker self-heal stubs must return 200 text/javascript directly
		// on legacy app hosts so browsers holding old SW registrations can purge them.
		if (SW_PASSTHROUGH_PATHS.has(pathname)) {
			return null;
		}
		const targetPath =
			isPayPath(pathname) || isUnifiedAuthPath(pathname)
				? pathname
				: prefixPath(pathname, "/teacher");
		const targetSearch = rewriteLegacyLoginSearch(pathname, url, "/teacher");
		return `https://${teacherTargetHost}${targetPath}${targetSearch}`;
	}

	// Student legacy hosts: student.<domain>, www.student.<domain>
	const studentDomain =
		stripDomainPrefix(hostname, "www.student.") ??
		stripDomainPrefix(hostname, "student.");
	if (studentDomain) {
		const targetPath = isUnifiedAuthPath(pathname)
			? pathname
			: prefixPath(pathname, "/student");
		const targetSearch = rewriteLegacyLoginSearch(pathname, url, "/student");
		return `https://lms.${studentDomain}${targetPath}${targetSearch}`;
	}

	// Admin legacy hosts: admin.<domain>, www.admin.<domain>
	const adminDomain =
		stripDomainPrefix(hostname, "www.admin.") ??
		stripDomainPrefix(hostname, "admin.");
	if (adminDomain) {
		const targetPath = isUnifiedAuthPath(pathname)
			? pathname
			: prefixPath(pathname, "/admin");
		const targetSearch = rewriteLegacyLoginSearch(pathname, url, "/admin");
		return `https://lms.${adminDomain}${targetPath}${targetSearch}`;
	}

	// Canonical www alias: www.lms.<domain> -> lms.<domain>
	const lmsDomain = stripDomainPrefix(hostname, "www.lms.");
	if (lmsDomain) {
		return `https://lms.${lmsDomain}${pathname}${search}`;
	}

	return null;
}
