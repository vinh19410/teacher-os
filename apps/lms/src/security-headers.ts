import { BANK_HUB_LINK_ORIGINS } from "@teacher-os/api/lib/bank-hub-origins";

const FRAME_SRC = BANK_HUB_LINK_ORIGINS.join(" ");

export const HSTS_HEADER_VALUE = "max-age=31536000; includeSubDomains";

export function isLocalHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		normalized === "0.0.0.0" ||
		normalized === "[::1]" ||
		normalized === "::1" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local")
	);
}

export function shouldRedirectToHttps(request: Request): string | null {
	const url = new URL(request.url);
	if (isLocalHost(url.hostname)) {
		return null;
	}
	if (url.protocol === "https:") {
		return null;
	}
	const forwarded = request.headers.get("x-forwarded-proto");
	const firstProto = forwarded?.split(",")[0]?.trim().toLowerCase();
	if (firstProto === "https") {
		return null;
	}
	url.protocol = "https:";
	return url.toString();
}

function isPrefixPath(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function resolveApiOrigin(rawApiUrl?: string): string | null {
	const candidate =
		rawApiUrl ??
		import.meta.env?.VITE_SERVER_URL ??
		globalThis.process?.env?.VITE_SERVER_URL;
	if (!candidate) {
		return null;
	}
	try {
		return new URL(candidate).origin;
	} catch {
		return null;
	}
}

export function buildContentSecurityPolicy(
	pathname: string,
	rawApiUrl?: string,
): string {
	const apiOrigin = resolveApiOrigin(rawApiUrl);
	const isStudent = isPrefixPath(pathname, "/student");
	const isTeacher = isPrefixPath(pathname, "/teacher");

	const directives = [
		"default-src 'self'",
		"script-src 'self' https://static.cloudflareinsights.com",
		...(isStudent ? ["worker-src 'self'"] : []),
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		`media-src 'self' blob:${apiOrigin ? ` ${apiOrigin}` : ""}`,
		"font-src 'self' data:",
		`connect-src 'self' blob:${apiOrigin ? ` ${apiOrigin}` : ""} https:`,
		...(isTeacher ? [`frame-src ${FRAME_SRC}`] : []),
		"frame-ancestors 'none'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self' https://accounts.google.com",
	];

	return `${directives.join("; ")};`;
}

/**
 * Applies production security headers tailored by portal prefix.
 * Omits CSP on localhost/loopback so Vite dev HMR preamble can boot.
 */
export function applySecurityHeaders(
	request: Request,
	headers: Headers,
	rawApiUrl?: string,
): Headers {
	const out = new Headers(headers);
	const url = new URL(request.url);
	const isStudent = isPrefixPath(url.pathname, "/student");

	out.set("Strict-Transport-Security", HSTS_HEADER_VALUE);
	out.set("X-Frame-Options", "DENY");
	out.set("X-Content-Type-Options", "nosniff");
	out.set("Referrer-Policy", "strict-origin-when-cross-origin");
	out.set("Cross-Origin-Resource-Policy", "cross-origin");
	out.set(
		"Permissions-Policy",
		isStudent
			? "camera=(), microphone=(self), geolocation=(), browsing-topics=()"
			: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
	);

	if (isLocalHost(url.hostname)) {
		out.delete("Content-Security-Policy");
		return out;
	}

	out.set(
		"Content-Security-Policy",
		buildContentSecurityPolicy(url.pathname, rawApiUrl),
	);
	return out;
}
