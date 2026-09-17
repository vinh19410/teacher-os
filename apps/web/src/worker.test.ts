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
});
