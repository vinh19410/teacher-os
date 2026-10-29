export interface WorkerAssetsBinding {
	fetch(input: Request | string): Promise<Response>;
}

export interface WorkerEnv {
	ASSETS: WorkerAssetsBinding;
}

function applySecurityHeaders(headers: Headers): void {
	headers.set(
		"Strict-Transport-Security",
		"max-age=31536000; includeSubDomains",
	);
	headers.set("X-Frame-Options", "DENY");
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("Cross-Origin-Resource-Policy", "cross-origin");
	headers.set(
		"Permissions-Policy",
		"camera=(), microphone=(), geolocation=(), browsing-topics=()",
	);
	// Admin app gọi API origin xuyên origin (fetch session + audio bài nghe
	// `<audio src=API>`), nên CSP mở `connect-src` + `media-src` tới đúng
	// origin của `VITE_SERVER_URL` (build-time define, dev = server worker dev
	// URL, deploy = topology.apiOrigin). Không có giá trị → chỉ `'self'`.
	const rawApiUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
	let apiOrigin: string | null = null;
	if (rawApiUrl) {
		try {
			apiOrigin = new URL(rawApiUrl).origin;
		} catch {
			apiOrigin = null;
		}
	}
	const crossOrigin = apiOrigin ?? "'self'";
	headers.set(
		"Content-Security-Policy",
		`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' ${crossOrigin}; media-src 'self' ${crossOrigin}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;`,
	);
}

function isDotFilePath(pathname: string): boolean {
	return pathname
		.split("/")
		.some((segment) => segment.startsWith(".") && segment.length > 1);
}

function shouldRedirectToHttps(request: Request): string | null {
	const url = new URL(request.url);
	const isLocal =
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "0.0.0.0" ||
		url.hostname === "[::1]" ||
		url.hostname === "::1" ||
		url.hostname.endsWith(".localhost") ||
		url.hostname.endsWith(".local");

	if (isLocal || url.protocol === "https:") {
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

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// 1. Redirect plain HTTP to HTTPS
		const httpsRedirect = shouldRedirectToHttps(request);
		if (httpsRedirect) {
			return Response.redirect(httpsRedirect, 301);
		}

		// 2. Block dotfiles
		if (isDotFilePath(pathname)) {
			return new Response("Not Found", {
				status: 404,
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "no-cache, no-store, must-revalidate",
				},
			});
		}

		// 3. Try serving static assets directly from ASSETS
		if (env.ASSETS) {
			const assetRes = await env.ASSETS.fetch(request);
			if (assetRes.status !== 404) {
				const response = new Response(assetRes.body, assetRes);
				applySecurityHeaders(response.headers);
				return response;
			}
		}

		// 4. SPA fallback: for HTML GET/HEAD requests, serve index.html
		const isGetOrHead = request.method === "GET" || request.method === "HEAD";
		const accept = request.headers.get("accept") ?? "";
		if (isGetOrHead && accept.includes("text/html") && env.ASSETS) {
			// Fetch `/`, not `/index.html`: with htmlHandling "auto-trailing-slash"
			// the asset layer answers `/index.html` with a 307 to `/`, which bounced
			// every deep link to the home page (#489). Conditional headers are
			// dropped so the shell can never come back as an empty 304.
			const indexRes = await env.ASSETS.fetch(
				new Request(new URL("/", request.url), { method: request.method }),
			);
			const response = new Response(indexRes.body, indexRes);
			applySecurityHeaders(response.headers);
			return response;
		}

		return new Response("Not Found", {
			status: 404,
			headers: {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "no-cache, no-store, must-revalidate",
			},
		});
	},
};
