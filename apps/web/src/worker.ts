import {
	isDotFilePath,
	isStaticAssetPath,
	isValidAppRoute,
} from "./routes-matcher";
import {
	applySecurityHeaders,
	shouldRedirectToHttps,
} from "./security-headers";

export interface WorkerAssetsBinding {
	fetch(input: Request | string): Promise<Response>;
}

export interface WorkerEnv {
	ASSETS: WorkerAssetsBinding;
}

export default {
	async fetch(request: Request, env: WorkerEnv): Promise<Response> {
		const url = new URL(request.url);
		const pathname = url.pathname;

		// 0. Redirect plain HTTP to HTTPS (except localhost / 127.0.0.1)
		const redirectUrl = shouldRedirectToHttps(request);
		if (redirectUrl) {
			return new Response(null, {
				status: 301,
				statusText: "Moved Permanently",
				headers: {
					Location: redirectUrl,
					"Strict-Transport-Security": "max-age=31536000; includeSubDomains",
				},
			});
		}

		// 1. Block dotfiles (e.g. /.env, /.git) immediately with plain-text 404
		if (isDotFilePath(pathname)) {
			return new Response("Not Found", {
				status: 404,
				statusText: "Not Found",
				headers: applySecurityHeaders(
					new Headers({
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "no-store",
					}),
				),
			});
		}

		// 2. Serve static assets directly from ASSETS
		if (isStaticAssetPath(pathname) && env.ASSETS) {
			const res = await env.ASSETS.fetch(request);
			return new Response(res.body, {
				status: res.status,
				statusText: res.statusText,
				headers: applySecurityHeaders(res.headers),
			});
		}

		// 3. Serve valid SPA routes with 200 OK and index.html
		if (isValidAppRoute(pathname) && env.ASSETS) {
			const res = await env.ASSETS.fetch(
				new Request(new URL("/", request.url), request),
			);
			return new Response(res.body, {
				status: res.status,
				statusText: res.statusText,
				headers: applySecurityHeaders(res.headers),
			});
		}

		// 4. Unknown route (404)
		// For browser HTML requests (accept contains text/html on GET/HEAD), serve the SPA shell with status 404
		// so TanStack Router mounts and displays the branded 404 UI.
		const isGetOrHead = request.method === "GET" || request.method === "HEAD";
		const accept = request.headers.get("accept") ?? "";
		if (isGetOrHead && accept.includes("text/html") && env.ASSETS) {
			// Strip conditional headers (If-None-Match, If-Modified-Since) so ASSETS never returns 304 with an empty body
			const shellRequest = new Request(new URL("/", request.url), {
				method: "GET",
			});
			const shell = await env.ASSETS.fetch(shellRequest);
			const headers = applySecurityHeaders(shell.headers);
			headers.delete("etag");
			headers.delete("last-modified");
			headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
			return new Response(shell.body, {
				status: 404,
				statusText: "Not Found",
				headers,
			});
		}
		// 5. For non-HTML / curl requests to unknown routes, return plain-text 404
		return new Response("Not Found", {
			status: 404,
			statusText: "Not Found",
			headers: applySecurityHeaders(
				new Headers({
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "no-cache, no-store, must-revalidate",
				}),
			),
		});
	},
};
