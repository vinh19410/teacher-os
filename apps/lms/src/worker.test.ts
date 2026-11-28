import { describe, expect, it, vi } from "vitest";
import worker, { handleLmsRequest, type WorkerEnv } from "./worker.ts";

const LMS_SHELL = "<!doctype html><title>LMS Gateway</title>";
const TEACHER_SHELL = "<!doctype html><title>Teacher Portal</title>";
const STUDENT_SHELL = "<!doctype html><title>Student Portal</title>";
const ADMIN_SHELL = "<!doctype html><title>Admin Console</title>";

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
				// Mirror Cloudflare ASSETS conditional 304 behavior to catch missing header stripping
				if (
					req.headers.has("if-none-match") ||
					req.headers.has("if-modified-since")
				) {
					return new Response(null, { status: 304 });
				}

				const { pathname } = new URL(req.url);
				if (pathname === "/") {
					return new Response(LMS_SHELL, {
						status: 200,
						headers: {
							"Content-Type": "text/html; charset=utf-8",
							ETag: '"lms-1"',
							"Last-Modified": "Wed, 21 Oct 2026 07:28:00 GMT",
						},
					});
				}
				if (pathname === "/teacher/") {
					return new Response(TEACHER_SHELL, {
						status: 200,
						headers: {
							"Content-Type": "text/html; charset=utf-8",
							ETag: '"teacher-1"',
						},
					});
				}
				if (pathname === "/student/") {
					return new Response(STUDENT_SHELL, {
						status: 200,
						headers: { "Content-Type": "text/html; charset=utf-8" },
					});
				}
				if (pathname === "/admin/") {
					return new Response(ADMIN_SHELL, {
						status: 200,
						headers: { "Content-Type": "text/html; charset=utf-8" },
					});
				}
				if (pathname === "/sw.js") {
					return new Response(
						"self.registration.unregister(); caches.delete('workbox');",
						{
							status: 200,
							headers: { "Content-Type": "application/javascript" },
						},
					);
				}
				if (pathname === "/registerSW.js") {
					return new Response("// No-op SW stub", {
						status: 200,
						headers: { "Content-Type": "application/javascript" },
					});
				}
				if (pathname === "/robots.txt") {
					return new Response("User-agent: *\nDisallow: /\n", {
						status: 200,
						headers: { "Content-Type": "text/plain; charset=utf-8" },
					});
				}
				if (
					pathname === "/assets/app.js" ||
					pathname === "/teacher/assets/main.js" ||
					pathname === "/student/assets/chunk.css" ||
					pathname === "/admin/assets/admin.js" ||
					pathname === "/theme-init.js"
				) {
					return new Response("/* asset */", {
						status: 200,
						headers: { "Content-Type": "text/javascript; charset=utf-8" },
					});
				}
				return new Response("Not Found", { status: 404 });
			}),
		},
	};
}

describe("apps/lms worker fetch handler", () => {
	it("exports default.fetch pointing to handleLmsRequest", () => {
		expect(worker.fetch).toBe(handleLmsRequest);
	});

	it("returns 301 with Location and HSTS for legacy subdomains without hitting ASSETS", async () => {
		const env = createMockEnv();
		const cases = [
			{
				from: "https://app.msmy.io.vn/classes/c-1?tab=students",
				to: "https://lms.msmy.io.vn/teacher/classes/c-1?tab=students",
			},
			{
				from: "https://student.msmy.io.vn/assignments",
				to: "https://lms.msmy.io.vn/student/assignments",
			},
			{
				from: "https://admin.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/admin",
			},
			{
				from: "https://www.lms.msmy.io.vn/login",
				to: "https://lms.msmy.io.vn/login",
			},
		];

		for (const { from, to } of cases) {
			const res = await handleLmsRequest(new Request(from), env);
			expect(res.status, from).toBe(301);
			expect(res.headers.get("location"), from).toBe(to);
			expect(res.headers.get("strict-transport-security")).toBe(
				"max-age=31536000; includeSubDomains",
			);
		}
		expect(env.ASSETS?.fetch).not.toHaveBeenCalled();
	});

	it("serves /sw.js and /registerSW.js as 200 text/javascript no-cache on BOTH lms. and legacy app. hosts", async () => {
		const env = createMockEnv();
		const urls = [
			"https://lms.msmy.io.vn/sw.js",
			"https://lms.msmy.io.vn/registerSW.js",
			"https://app.msmy.io.vn/sw.js",
			"https://app.msmy.io.vn/registerSW.js",
			"https://app.staging.teacheros.io.vn/sw.js",
			"https://app.staging.teacheros.io.vn/registerSW.js",
		];

		for (const url of urls) {
			const res = await handleLmsRequest(
				new Request(url, { headers: { "If-None-Match": '"old"' } }),
				env,
			);
			expect(res.status, url).toBe(200);
			expect(res.headers.get("location"), url).toBeNull();
			expect(res.headers.get("content-type"), url).toBe(
				"text/javascript; charset=utf-8",
			);
			expect(res.headers.get("cache-control"), url).toBe(
				"no-cache, no-store, must-revalidate",
			);
			const body = await res.text();
			expect(body.length, url).toBeGreaterThan(0);
		}
	});

	it("redirects plain HTTP to HTTPS on non-local canonical host, but never on localhost or terminated TLS", async () => {
		const env = createMockEnv();

		const httpRes = await handleLmsRequest(
			new Request("http://lms.msmy.io.vn/login?returnUrl=%2Fteacher"),
			env,
		);
		expect(httpRes.status).toBe(301);
		expect(httpRes.headers.get("location")).toBe(
			"https://lms.msmy.io.vn/login?returnUrl=%2Fteacher",
		);
		expect(httpRes.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);

		const multiHopRes = await handleLmsRequest(
			new Request("http://lms.msmy.io.vn/login", {
				headers: { "x-forwarded-proto": "http, https" },
			}),
			env,
		);
		expect(multiHopRes.status).toBe(301);

		const terminatedRes = await handleLmsRequest(
			new Request("http://lms.msmy.io.vn/login", {
				headers: { "x-forwarded-proto": "https" },
			}),
			env,
		);
		expect(terminatedRes.status).toBe(200);

		const alreadyHttpsRes = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/login", {
				headers: { "x-forwarded-proto": "http" },
			}),
			env,
		);
		expect(alreadyHttpsRes.status).toBe(200);

		const localRes = await handleLmsRequest(
			new Request("http://localhost:8001/login"),
			env,
		);
		expect(localRes.status).toBe(200);
		expect(localRes.headers.get("content-security-policy")).toBeNull();
	});

	it("blocks dotfiles and path traversal immediately with plain-text 404", async () => {
		const env = createMockEnv();
		for (const path of [
			"/.env",
			"/.git/config",
			"/teacher/..%2F.env",
			"/student/.htaccess",
		]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`, {
					headers: { Accept: "text/html" },
				}),
				env,
			);
			expect(res.status, path).toBe(404);
			expect(res.headers.get("content-type")).toContain("text/plain");
			expect(res.headers.get("cache-control")).toBe("no-store");
			expect(res.headers.get("x-frame-options")).toBe("DENY");
			expect(await res.text()).toBe("Not Found");
		}
		expect(env.ASSETS?.fetch).not.toHaveBeenCalled();
	});

	it("serves /robots.txt with 200 text/plain from ASSETS and falls back when ASSETS returns 404", async () => {
		const env = createMockEnv();
		const res = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/robots.txt"),
			env,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toContain("text/plain");
		expect(await res.text()).toContain("Disallow: /");

		const emptyEnv = createMockEnv(
			async () => new Response("Not Found", { status: 404 }),
		);
		const fallbackRes = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/robots.txt"),
			emptyEnv,
		);
		expect(fallbackRes.status).toBe(200);
		expect(fallbackRes.headers.get("content-type")).toContain("text/plain");
		expect(await fallbackRes.text()).toBe("User-agent: *\nDisallow: /\n");
	});

	it("serves static assets directly from ASSETS with security headers and 404s missing assets", async () => {
		const env = createMockEnv();
		for (const path of [
			"/assets/app.js",
			"/teacher/assets/main.js",
			"/student/assets/chunk.css",
			"/admin/assets/admin.js",
			"/theme-init.js",
		]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`),
				env,
			);
			expect(res.status, path).toBe(200);
			expect(res.headers.get("x-content-type-options")).toBe("nosniff");
			expect(await res.text()).toBe("/* asset */");
		}

		const missingAsset = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/student/assets/missing.js", {
				headers: { Accept: "text/html" },
			}),
			env,
		);
		expect(missingAsset.status).toBe(404);
		expect(await missingAsset.text()).toBe("Not Found");
	});

	it("serves valid /teacher routes with teacher shell, no frame-src, and microphone=()", async () => {
		const env = createMockEnv();
		for (const path of [
			"/teacher",
			"/teacher/",
			"/teacher/dashboard",
			"/teacher/classes/c-123",
			"/teacher/assignments/tests/t-9",
			"/teacher/assignments/packs/p-4",
			"/teacher/tuition/inv-1",
		]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`, {
					headers: { "If-None-Match": '"cached"' },
				}),
				env,
			);
			expect(res.status, path).toBe(200);
			expect(await res.text()).toBe(TEACHER_SHELL);
			expect(res.headers.get("permissions-policy")).toBe(
				"camera=(), microphone=(), geolocation=(), browsing-topics=()",
			);
			const csp = res.headers.get("content-security-policy") ?? "";
			expect(csp).not.toContain("frame-src");
			expect(csp).not.toContain("bankhub.sepay.vn");
			expect(csp).toContain("frame-ancestors 'none'");
		}
	});

	it("returns 404 teacher shell for HTML unknown /teacher routes and plain-text 404 for non-HTML", async () => {
		const env = createMockEnv();

		const htmlRes = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/teacher/does-not-exist", {
				headers: {
					Accept: "text/html,application/xhtml+xml",
					"If-None-Match": '"teacher-1"',
				},
			}),
			env,
		);
		expect(htmlRes.status).toBe(404);
		expect(htmlRes.headers.get("cache-control")).toBe(
			"no-cache, no-store, must-revalidate",
		);
		expect(htmlRes.headers.get("etag")).toBeNull();
		expect(await htmlRes.text()).toBe(TEACHER_SHELL);

		const curlRes = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/teacher/does-not-exist"),
			env,
		);
		expect(curlRes.status).toBe(404);
		expect(curlRes.headers.get("content-type")).toContain("text/plain");
		expect(await curlRes.text()).toBe("Not Found");
	});

	it("serves /student routes with student shell, microphone=(self), and worker-src 'self'", async () => {
		const env = createMockEnv();

		for (const path of ["/student", "/student/", "/student/classes/c-1"]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`, {
					headers: { Accept: "text/html", "If-None-Match": '"s1"' },
				}),
				env,
			);
			expect(res.status, path).toBe(200);
			expect(await res.text()).toBe(STUDENT_SHELL);
			expect(res.headers.get("permissions-policy")).toBe(
				"camera=(), microphone=(self), geolocation=(), browsing-topics=()",
			);
			const csp = res.headers.get("content-security-policy") ?? "";
			expect(csp).toContain("worker-src 'self'");
			expect(csp).not.toContain("frame-src");
		}

		const nonHtml = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/student/classes/c-1"),
			env,
		);
		expect(nonHtml.status).toBe(404);
		expect(nonHtml.headers.get("content-type")).toContain("text/plain");
	});

	it("serves /admin routes with admin shell for HTML GET/HEAD and 404 plain text for non-HTML", async () => {
		const env = createMockEnv();

		for (const path of ["/admin", "/admin/", "/admin/library/tests"]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`, {
					headers: { Accept: "text/html", "If-None-Match": '"a1"' },
				}),
				env,
			);
			expect(res.status, path).toBe(200);
			expect(await res.text()).toBe(ADMIN_SHELL);
			expect(res.headers.get("permissions-policy")).toBe(
				"camera=(), microphone=(), geolocation=(), browsing-topics=()",
			);
			const csp = res.headers.get("content-security-policy") ?? "";
			expect(csp).not.toContain("worker-src");
			expect(csp).not.toContain("frame-src");
		}

		const nonHtml = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/admin/library/tests"),
			env,
		);
		expect(nonHtml.status).toBe(404);
		expect(nonHtml.headers.get("content-type")).toContain("text/plain");
	});

	it("serves valid root LMS routes with 200 and handles unknown root routes with 404 HTML vs plain text", async () => {
		const env = createMockEnv();

		for (const path of [
			"/",
			"/login",
			"/forgot-password",
			"/reset-password",
			"/verify-email",
			"/pay/token-123",
		]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`),
				env,
			);
			expect(res.status, path).toBe(200);
			expect(await res.text()).toBe(LMS_SHELL);
			expect(res.headers.get("cross-origin-resource-policy")).toBe(
				"cross-origin",
			);
			expect(res.headers.get("referrer-policy")).toBe(
				"strict-origin-when-cross-origin",
			);
			expect(res.headers.get("content-security-policy")).toContain(
				"form-action 'self' https://accounts.google.com",
			);
		}

		const html404 = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/unknown-root-page", {
				headers: {
					Accept: "text/html",
					"If-None-Match": '"lms-1"',
				},
			}),
			env,
		);
		expect(html404.status).toBe(404);
		expect(html404.headers.get("etag")).toBeNull();
		expect(html404.headers.get("last-modified")).toBeNull();
		expect(html404.headers.get("cache-control")).toBe(
			"no-cache, no-store, must-revalidate",
		);
		expect(await html404.text()).toBe(LMS_SHELL);

		const curl404 = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/unknown-root-page"),
			env,
		);
		expect(curl404.status).toBe(404);
		expect(curl404.headers.get("content-type")).toContain("text/plain");
		expect(await curl404.text()).toBe("Not Found");

		const post404 = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/unknown-root-page", {
				method: "POST",
				headers: { Accept: "text/html" },
			}),
			env,
		);
		expect(post404.status).toBe(404);
		expect(post404.headers.get("content-type")).toContain("text/plain");
	});

	it("includes runtime env.VITE_SERVER_URL origin in CSP media-src and connect-src across all portals", async () => {
		const env: WorkerEnv = {
			...createMockEnv(),
			VITE_SERVER_URL: "https://api.msmy.io.vn/extra/path",
		};
		for (const path of [
			"/",
			"/teacher/dashboard",
			"/student/classes",
			"/admin/library/tests",
		]) {
			const res = await handleLmsRequest(
				new Request(`https://lms.msmy.io.vn${path}`, {
					headers: { Accept: "text/html" },
				}),
				env,
			);
			expect(res.status, path).toBe(200);
			const csp = res.headers.get("content-security-policy") ?? "";
			expect(csp, path).toContain(
				"media-src 'self' blob: https://api.msmy.io.vn;",
			);
			expect(csp, path).toContain(
				"connect-src 'self' blob: https://api.msmy.io.vn https:;",
			);
		}

		const malformedEnv: WorkerEnv = {
			...createMockEnv(),
			VITE_SERVER_URL: "not-a-valid-url",
		};
		const res = await handleLmsRequest(
			new Request("https://lms.msmy.io.vn/"),
			malformedEnv,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-security-policy") ?? "").toContain(
			"media-src 'self' blob:;",
		);
	});
});
