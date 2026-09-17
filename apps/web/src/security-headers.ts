export const SECURITY_HEADERS: Record<string, string> = {
	"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Permissions-Policy":
		"camera=(), microphone=(), geolocation=(), browsing-topics=()",
	"Content-Security-Policy":
		"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;",
};

export function isLocalHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "0.0.0.0" ||
		hostname === "[::1]" ||
		hostname === "::1" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local")
	);
}

export function shouldRedirectToHttps(request: Request): string | null {
	const url = new URL(request.url);
	if (isLocalHost(url.hostname)) {
		return null;
	}
	// If already HTTPS, never redirect to avoid self-redirect loop
	if (url.protocol === "https:") {
		return null;
	}
	const forwarded = request.headers.get("x-forwarded-proto");
	const firstProto = forwarded?.split(",")[0]?.trim().toLowerCase();
	// If an upstream reverse proxy terminated TLS and forwarded as https, do not redirect
	if (firstProto === "https") {
		return null;
	}
	url.protocol = "https:";
	return url.toString();
}

export function applySecurityHeaders(headers: Headers): Headers {
	const out = new Headers(headers);
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		out.set(key, value);
	}
	return out;
}
