import { describe, expect, test } from "vitest";
import worker from "./worker";

const SHELL = "<!doctype html><div id=app></div>";

// Mirrors Cloudflare assets with htmlHandling "auto-trailing-slash".
const ASSETS = {
	async fetch(input: Request | string): Promise<Response> {
		const req = typeof input === "string" ? new Request(input) : input;
		const { pathname } = new URL(req.url);
		const known = ["/", "/index.html", "/assets/app.js"].includes(pathname);
		if (!known) return new Response("Not Found", { status: 404 });
		if (req.headers.has("if-none-match"))
			return new Response(null, { status: 304 });
		if (pathname === "/index.html")
			return new Response(null, { status: 307, headers: { location: "/" } });
		if (pathname === "/")
			return new Response(SHELL, { headers: { "content-type": "text/html" } });
		if (pathname === "/assets/app.js")
			return new Response("js", {
				headers: { "content-type": "text/javascript" },
			});
		return new Response("Not Found", { status: 404 });
	},
};

const get = (path: string, headers: Record<string, string> = {}) =>
	worker.fetch(
		new Request(`https://example.com${path}`, {
			headers: { accept: "text/html", ...headers },
		}),
		{ ASSETS },
	);

describe("SPA deep links (#489)", () => {
	test("a deep link serves the app shell instead of redirecting home", async () => {
		const res = await get("/some/deep/route");
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
		expect(await res.text()).toBe(SHELL);
	});

	test("a cached browser still gets the full shell on a deep link", async () => {
		const res = await get("/some/deep/route", { "if-none-match": '"abc"' });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe(SHELL);
	});

	test("static assets are served as-is", async () => {
		const res = await get("/assets/app.js");
		expect(await res.text()).toBe("js");
	});

	test("sets Content-Security-Policy with blob: and worker-src on non-localhost", async () => {
		const res = await get("/some/deep/route");
		const csp = res.headers.get("Content-Security-Policy") ?? "";
		expect(csp).toContain("script-src 'self'");
		expect(csp).toContain("worker-src 'self'");
		expect(csp).toContain("object-src 'none'");
		expect(csp).toContain("blob:");
	});

	test("omits Content-Security-Policy on localhost for Vite dev HMR", async () => {
		const res = await worker.fetch(
			new Request("http://localhost:8003/some/deep/route", {
				headers: { accept: "text/html" },
			}),
			{ ASSETS },
		);
		expect(res.headers.get("Content-Security-Policy")).toBeNull();
	});
});
