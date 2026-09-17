import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";

const CORS_ORIGIN = "https://app.teacheros.io.vn";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("API Server HTTPS Redirect & Security Headers", () => {
	let app: ServerApp;
	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async () => null,
			authHandler: () => new Response("auth OK"),
		});
	});

	test("redirects plain HTTP requests on non-local host to HTTPS with 301 and HSTS", async () => {
		const res = await app.request("http://api.teacheros.io.vn/readyz");
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://api.teacheros.io.vn/readyz",
		);
		expect(res.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
	});

	test("does not redirect when already on HTTPS, even if x-forwarded-proto is http (prevents self-redirect loop)", async () => {
		const res = await app.request("https://api.teacheros.io.vn/readyz", {
			headers: { "x-forwarded-proto": "http", origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
	});

	test("does not redirect when upstream proxy already terminated TLS (x-forwarded-proto: https)", async () => {
		const res = await app.request("http://api.teacheros.io.vn/readyz", {
			headers: { "x-forwarded-proto": "https", origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
	});

	test("redirects plain HTTP requests with multi-hop x-forwarded-proto (e.g. 'http, https')", async () => {
		const res = await app.request("http://api.teacheros.io.vn/readyz", {
			headers: { "x-forwarded-proto": "http, https" },
		});
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://api.teacheros.io.vn/readyz",
		);
	});

	test("does not redirect local development requests on localhost, 127.0.0.1, or IPv6 [::1]", async () => {
		const localhostRes = await app.request("http://localhost:8000/readyz", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(localhostRes.status).toBe(200);
		expect(localhostRes.headers.get("location")).toBeNull();

		const ipRes = await app.request("http://127.0.0.1:8000/readyz", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(ipRes.status).toBe(200);
		expect(ipRes.headers.get("location")).toBeNull();

		const ipv6Res = await app.request("http://[::1]:8000/readyz", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(ipv6Res.status).toBe(200);
		expect(ipv6Res.headers.get("location")).toBeNull();
	});

	test("emits security headers suite on API responses", async () => {
		const res = await app.request("https://api.teacheros.io.vn/readyz", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(200);
		expect(res.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("referrer-policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(res.headers.get("cross-origin-resource-policy")).toBe(
			"cross-origin",
		);
	});

	test("preserves CORS headers for cross-origin frontend requests", async () => {
		const res = await app.request("https://api.teacheros.io.vn/readyz", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(res.headers.get("access-control-allow-origin")).toBe(CORS_ORIGIN);
		expect(res.headers.get("access-control-allow-credentials")).toBe("true");
	});
});
