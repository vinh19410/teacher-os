import { describe, expect, it, vi } from "vitest";
import worker, { type WorkerEnv } from "./worker";

function createMockEnv(
	assetsHandler?: (req: Request) => Promise<Response>,
): WorkerEnv {
	return {
		ASSETS: {
			fetch: vi.fn(async (input: Request | string) => {
				const req = typeof input === "string" ? new Request(input) : input;
				if (assetsHandler) {
					return assetsHandler(req);
				}
				const url = new URL(req.url);
				if (url.pathname === "/" || url.pathname === "/index.html") {
					return new Response("<!doctype html><title>App Shell</title>", {
						status: 200,
						headers: { "Content-Type": "text/html; charset=utf-8" },
					});
				}
				if (url.pathname === "/sw.js") {
					return new Response("self.addEventListener('install', () => {})", {
						status: 200,
						headers: { "Content-Type": "text/javascript" },
					});
				}
				return new Response("Not Found", { status: 404 });
			}),
		},
	};
}

describe("apps/web worker fetch handler", () => {
	it("blocks dotfile requests like /.env and /.git with plain-text 404", async () => {
		const env = createMockEnv();

		const envRes = await worker.fetch(
			new Request("https://app.teacheros.io.vn/.env"),
			env,
		);
		expect(envRes.status).toBe(404);
		expect(envRes.headers.get("content-type")).toContain("text/plain");
		expect(await envRes.text()).toBe("Not Found");

		const gitRes = await worker.fetch(
			new Request("https://app.teacheros.io.vn/.git/config"),
			env,
		);
		expect(gitRes.status).toBe(404);
		expect(gitRes.headers.get("content-type")).toContain("text/plain");
		expect(await gitRes.text()).toBe("Not Found");

		// ASSETS.fetch must not be called for dotfiles
		expect(env.ASSETS.fetch).not.toHaveBeenCalled();
	});

	it("serves static assets like /sw.js directly with 200", async () => {
		const env = createMockEnv();

		const res = await worker.fetch(
			new Request("https://app.teacheros.io.vn/sw.js"),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/javascript");
		expect(await res.text()).toContain("addEventListener");
	});

	it("serves valid SPA routes with HTTP 200 and index.html shell", async () => {
		const env = createMockEnv();

		for (const path of [
			"/",
			"/login",
			"/dashboard",
			"/classes/c-123",
			"/students/s-456",
		]) {
			const res = await worker.fetch(
				new Request(`https://app.teacheros.io.vn${path}`),
				env,
			);
			expect(res.status, `Path ${path} should return 200`).toBe(200);
			expect(res.headers.get("content-type")).toContain("text/html");
			const body = await res.text();
			expect(body).toContain("<title>App Shell</title>");
		}
	});

	it("returns HTTP 404 with SPA shell for browser HTML requests to unknown routes", async () => {
		const env = createMockEnv();

		const unknownPaths = [
			"/this-page-does-not-exist-qc-test",
			"/help",
			"/about",
			"/signup",
			"/register",
		];

		for (const path of unknownPaths) {
			const res = await worker.fetch(
				new Request(`https://app.teacheros.io.vn${path}`, {
					headers: {
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					},
				}),
				env,
			);
			expect(res.status, `Path ${path} should return 404`).toBe(404);
			expect(res.headers.get("content-type")).toContain("text/html");
			expect(res.headers.get("cache-control")).toMatch(/no-cache|no-store/);
			const body = await res.text();
			expect(body).toContain("<title>App Shell</title>");
		}
	});

	it("strips client conditional headers (If-None-Match) so ASSETS never returns 304 with null body", async () => {
		const env = createMockEnv(async (req) => {
			// If conditional header was passed through, it would return 304 with null body
			if (
				req.headers.has("if-none-match") ||
				req.headers.has("if-modified-since")
			) {
				return new Response(null, { status: 304 });
			}
			return new Response("<!doctype html><title>App Shell</title>", {
				status: 200,
				headers: {
					"Content-Type": "text/html; charset=utf-8",
					ETag: '"12345"',
					"Last-Modified": "Wed, 21 Oct 2026 07:28:00 GMT",
				},
			});
		});

		const res = await worker.fetch(
			new Request(
				"https://app.teacheros.io.vn/this-page-does-not-exist-qc-test",
				{
					headers: {
						Accept: "text/html",
						"If-None-Match": '"12345"',
					},
				},
			),
			env,
		);

		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("text/html");
		expect(res.headers.get("etag")).toBeNull();
		expect(res.headers.get("last-modified")).toBeNull();
		const body = await res.text();
		expect(body).toContain("<title>App Shell</title>");
	});

	it("returns plain-text 404 for mutating requests (POST) to unknown routes", async () => {
		const env = createMockEnv();

		const res = await worker.fetch(
			new Request(
				"https://app.teacheros.io.vn/this-page-does-not-exist-qc-test",
				{
					method: "POST",
					headers: { Accept: "text/html" },
				},
			),
			env,
		);

		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("text/plain");
		expect(await res.text()).toBe("Not Found");
	});
	it("returns HTTP 404 plain text for non-HTML / curl requests to unknown routes", async () => {
		const env = createMockEnv();

		const res = await worker.fetch(
			new Request(
				"https://app.teacheros.io.vn/this-page-does-not-exist-qc-test",
			),
			env,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("content-type")).toContain("text/plain");
		expect(await res.text()).toBe("Not Found");
	});

	it("redirects plain HTTP requests on non-local host to HTTPS with 301 and HSTS", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("http://app.teacheros.io.vn/dashboard?tab=classes"),
			env,
		);
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://app.teacheros.io.vn/dashboard?tab=classes",
		);
		expect(res.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(env.ASSETS.fetch).not.toHaveBeenCalled();
	});

	it("does not redirect when already on HTTPS, even if x-forwarded-proto is http (prevents self-redirect loop)", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("https://app.teacheros.io.vn/login", {
				headers: { "x-forwarded-proto": "http" },
			}),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
	});

	it("does not redirect when upstream proxy already terminated TLS (x-forwarded-proto: https)", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("http://app.teacheros.io.vn/login", {
				headers: { "x-forwarded-proto": "https" },
			}),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
	});

	it("redirects plain HTTP requests with multi-hop x-forwarded-proto (e.g. 'http, https')", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("http://app.teacheros.io.vn/dashboard", {
				headers: { "x-forwarded-proto": "http, https" },
			}),
			env,
		);
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://app.teacheros.io.vn/dashboard",
		);
	});

	it("does not redirect local development requests on localhost, 127.0.0.1, or IPv6 [::1]", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("http://localhost:8001/dashboard"),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();

		const ipRes = await worker.fetch(
			new Request("http://127.0.0.1:8001/dashboard"),
			env,
		);
		expect(ipRes.status).toBe(200);
		expect(ipRes.headers.get("location")).toBeNull();

		const ipv6Res = await worker.fetch(
			new Request("http://[::1]:8001/dashboard"),
			env,
		);
		expect(ipv6Res.status).toBe(200);
		expect(ipv6Res.headers.get("location")).toBeNull();
	});
	it("applies full security headers suite to 200 OK SPA responses", async () => {
		const env = createMockEnv();
		const res = await worker.fetch(
			new Request("https://app.teacheros.io.vn/dashboard"),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("referrer-policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(res.headers.get("permissions-policy")).toBe(
			"camera=(), microphone=(), geolocation=(), browsing-topics=()",
		);
		expect(res.headers.get("content-security-policy")).toContain(
			"default-src 'self'",
		);
		expect(res.headers.get("content-security-policy")).toContain(
			"frame-ancestors 'none'",
		);
		expect(res.headers.get("content-security-policy")).toContain(
			"script-src 'self' https://static.cloudflareinsights.com",
		);
	});

	it("applies security headers to 404 responses and dotfile rejections", async () => {
		const env = createMockEnv();
		const dotfileRes = await worker.fetch(
			new Request("https://app.teacheros.io.vn/.env"),
			env,
		);
		expect(dotfileRes.status).toBe(404);
		expect(dotfileRes.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(dotfileRes.headers.get("x-content-type-options")).toBe("nosniff");
		expect(dotfileRes.headers.get("x-frame-options")).toBe("DENY");

		const notFoundHtmlRes = await worker.fetch(
			new Request("https://app.teacheros.io.vn/missing-page", {
				headers: { Accept: "text/html" },
			}),
			env,
		);
		expect(notFoundHtmlRes.status).toBe(404);
		expect(notFoundHtmlRes.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(notFoundHtmlRes.headers.get("content-security-policy")).toContain(
			"default-src 'self'",
		);
	});
});
