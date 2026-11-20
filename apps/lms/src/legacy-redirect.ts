import { isLocalHost } from "./security-headers.ts";

const UNIFIED_AUTH_PATHS = new Set([
	"/login",
	"/forgot-password",
	"/reset-password",
	"/verify-email",
]);

const SW_PASSTHROUGH_PATHS = new Set(["/sw.js", "/registerSW.js"]);

function isUnifiedAuthPath(pathname: string): boolean {
	const normalized = pathname.replace(/\/+$/, "") || "/";
	return UNIFIED_AUTH_PATHS.has(normalized);
}

function isPayPath(pathname: string): boolean {
	return pathname === "/pay" || pathname.startsWith("/pay/");
}

function prefixPath(pathname: string, prefix: string): string {
	if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
		return pathname;
	}
	if (pathname === "/") {
		return prefix;
	}
	return `${prefix}${pathname}`;
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
		return `https://${teacherTargetHost}${targetPath}${search}`;
	}

	// Student legacy hosts: student.<domain>, www.student.<domain>
	const studentDomain =
		stripDomainPrefix(hostname, "www.student.") ??
		stripDomainPrefix(hostname, "student.");
	if (studentDomain) {
		const targetPath = isUnifiedAuthPath(pathname)
			? pathname
			: prefixPath(pathname, "/student");
		return `https://lms.${studentDomain}${targetPath}${search}`;
	}

	// Admin legacy hosts: admin.<domain>, www.admin.<domain>
	const adminDomain =
		stripDomainPrefix(hostname, "www.admin.") ??
		stripDomainPrefix(hostname, "admin.");
	if (adminDomain) {
		const targetPath = isUnifiedAuthPath(pathname)
			? pathname
			: prefixPath(pathname, "/admin");
		return `https://lms.${adminDomain}${targetPath}${search}`;
	}

	// Canonical www alias: www.lms.<domain> -> lms.<domain>
	const lmsDomain = stripDomainPrefix(hostname, "www.lms.");
	if (lmsDomain) {
		return `https://lms.${lmsDomain}${pathname}${search}`;
	}

	return null;
}
