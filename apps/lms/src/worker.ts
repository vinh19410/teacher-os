import { resolveLegacyHostRedirect } from "./legacy-redirect.ts";
import {
	isDotFilePath,
	isStaticAssetPath,
	isValidLmsRootRoute,
	isValidTeacherSubRoute,
} from "./routes-matcher.ts";
import {
	applySecurityHeaders,
	HSTS_HEADER_VALUE,
	shouldRedirectToHttps,
} from "./security-headers.ts";

export interface WorkerAssetsBinding {
	fetch(input: Request | string): Promise<Response>;
}

export interface WorkerEnv {
	ASSETS?: WorkerAssetsBinding;
	VITE_SERVER_URL?: string;
}

type ShellPath = "/" | "/teacher/" | "/student/" | "/admin/";

const NO_CACHE_VALUE = "no-cache, no-store, must-revalidate";
const ROBOTS_TXT_BODY = "User-agent: *\nDisallow: /\n";

function permanentRedirect(location: string): Response {
	return new Response(null, {
		status: 301,
		statusText: "Moved Permanently",
		headers: {
			Location: location,
			"Strict-Transport-Security": HSTS_HEADER_VALUE,
		},
	});
}

function plainTextNotFound(
	request: Request,
	env: WorkerEnv,
	cacheControl: string = NO_CACHE_VALUE,
): Response {
	return new Response("Not Found", {
		status: 404,
		statusText: "Not Found",
		headers: applySecurityHeaders(
			request,
			new Headers({
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": cacheControl,
			}),
			env.VITE_SERVER_URL,
		),
	});
}

async function serveShell(
	request: Request,
	env: WorkerEnv,
	shellPath: ShellPath,
	status: 200 | 404,
): Promise<Response> {
	if (!env.ASSETS) {
		return plainTextNotFound(request, env);
	}
	// Strip conditional headers (If-None-Match, If-Modified-Since) so ASSETS
	// never returns an empty 304 when serving an SPA shell.
	const shellRequest = new Request(new URL(shellPath, request.url), {
		method: request.method === "HEAD" ? "HEAD" : "GET",
	});
	const shell = await env.ASSETS.fetch(shellRequest);
	const headers = applySecurityHeaders(
		request,
		shell.headers,
		env.VITE_SERVER_URL,
	);
	if (status === 404) {
		headers.delete("etag");
		headers.delete("last-modified");
		headers.set("Cache-Control", NO_CACHE_VALUE);
		return new Response(shell.body, {
			status: 404,
			statusText: "Not Found",
			headers,
		});
	}
	return new Response(shell.body, {
		status: shell.status,
		statusText: shell.statusText,
		headers,
	});
}

export async function handleLmsRequest(
	request: Request,
	env: WorkerEnv,
): Promise<Response> {
	const url = new URL(request.url);
	const { pathname } = url;

	// 0a. Legacy subdomain redirects -> canonical https://lms.<domain>
	const legacyRedirect = resolveLegacyHostRedirect(request);
	if (legacyRedirect) {
		return permanentRedirect(legacyRedirect);
	}

	// 0b. Plain HTTP -> HTTPS redirect (non-local hosts)
	const httpsRedirect = shouldRedirectToHttps(request);
	if (httpsRedirect) {
		return permanentRedirect(httpsRedirect);
	}

	// 1. Block dotfiles and path traversal immediately
	if (isDotFilePath(pathname)) {
		return plainTextNotFound(request, env, "no-store");
	}

	// 2. Serve /robots.txt with guaranteed 200 text/plain
	if (pathname === "/robots.txt") {
		if (env.ASSETS) {
			const res = await env.ASSETS.fetch(
				new Request(new URL("/robots.txt", request.url), {
					method: request.method === "HEAD" ? "HEAD" : "GET",
				}),
			);
			if (res.ok) {
				const headers = applySecurityHeaders(
					request,
					res.headers,
					env.VITE_SERVER_URL,
				);
				if (!headers.has("Content-Type")) {
					headers.set("Content-Type", "text/plain; charset=utf-8");
				}
				return new Response(res.body, {
					status: res.status,
					statusText: res.statusText,
					headers,
				});
			}
		}
		return new Response(ROBOTS_TXT_BODY, {
			status: 200,
			statusText: "OK",
			headers: applySecurityHeaders(
				request,
				new Headers({
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "public, max-age=86400",
				}),
				env.VITE_SERVER_URL,
			),
		});
	}

	// 2b. Serve SW self-unregister stubs with guaranteed text/javascript & no-cache
	if (pathname === "/sw.js" || pathname === "/registerSW.js") {
		if (!env.ASSETS) {
			return plainTextNotFound(request, env);
		}
		const stubReq = new Request(new URL(pathname, request.url), {
			method: request.method === "HEAD" ? "HEAD" : "GET",
		});
		const res = await env.ASSETS.fetch(stubReq);
		const headers = applySecurityHeaders(
			request,
			res.headers,
			env.VITE_SERVER_URL,
		);
		if (res.ok) {
			headers.set("Content-Type", "text/javascript; charset=utf-8");
			headers.set("Cache-Control", NO_CACHE_VALUE);
		}
		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers,
		});
	}

	// 3. Static assets pass directly through ASSETS
	if (isStaticAssetPath(pathname)) {
		if (!env.ASSETS) {
			return plainTextNotFound(request, env);
		}
		const res = await env.ASSETS.fetch(request);
		return new Response(res.body, {
			status: res.status,
			statusText: res.statusText,
			headers: applySecurityHeaders(request, res.headers, env.VITE_SERVER_URL),
		});
	}

	// 4. Prefix SPA dispatch
	const isGetOrHead = request.method === "GET" || request.method === "HEAD";
	const acceptsHtml = (request.headers.get("accept") ?? "").includes(
		"text/html",
	);

	// 4a. Teacher portal: /teacher or /teacher/*
	if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
		const subPath =
			pathname === "/teacher" ? "/" : pathname.slice("/teacher".length) || "/";
		if (isGetOrHead && isValidTeacherSubRoute(subPath)) {
			return serveShell(request, env, "/teacher/", 200);
		}
		if (isGetOrHead && acceptsHtml) {
			return serveShell(request, env, "/teacher/", 404);
		}
		return plainTextNotFound(request, env);
	}

	// 4b. Student portal: /student or /student/*
	if (pathname === "/student" || pathname.startsWith("/student/")) {
		if (isGetOrHead && acceptsHtml) {
			return serveShell(request, env, "/student/", 200);
		}
		return plainTextNotFound(request, env);
	}

	// 4c. Admin console: /admin or /admin/*
	if (pathname === "/admin" || pathname.startsWith("/admin/")) {
		if (isGetOrHead && acceptsHtml) {
			return serveShell(request, env, "/admin/", 200);
		}
		return plainTextNotFound(request, env);
	}

	// 4d. Root unified LMS gateway routes
	if (isGetOrHead && isValidLmsRootRoute(pathname)) {
		return serveShell(request, env, "/", 200);
	}

	if (isGetOrHead && acceptsHtml) {
		return serveShell(request, env, "/", 404);
	}

	return plainTextNotFound(request, env);
}

export default {
	fetch: handleLmsRequest,
};
