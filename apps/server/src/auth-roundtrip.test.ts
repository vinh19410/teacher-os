/**
 * Real Better-Auth round-trip under plain node (issue #59, plan phase 1).
 *
 * Unlike kernel.test.ts / readiness.test.ts — which stub the auth seam — this
 * suite boots the REAL better-auth instance over an in-memory libsql database
 * with the real migrations, wired through the same DI seams the E2E boot shim
 * will use: `createAuth(input)` + `getSessionUser(auth, headers)` +
 * `buildApp(deps)`. Proves sign-up → session cookie → org bootstrap persist
 * end-to-end before any browser E2E is written.
 */

import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { getSessionUser } from "./session";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("real better-auth round-trip under node", () => {
	let app: ReturnType<typeof buildApp>;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

		const auth = createAuth({
			db: libsql,
			corsOrigin: CORS_ORIGIN,
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: "http://localhost:8000",
			googleClientId: "test-dummy",
			googleClientSecret: "test-dummy",
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: (headers) => getSessionUser(auth, headers),
			authHandler: (req) => auth.handler(req),
		});
	});

	test("sign-up/email returns a better-auth session cookie", async () => {
		const res = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: CORS_ORIGIN,
			},
			body: JSON.stringify({
				name: "E2E Teacher",
				email: `t-${crypto.randomUUID()}@test.local`,
				password: "password-8chars",
			}),
		});
		expect(res.status).toBe(200);

		const setCookies = res.headers.getSetCookie().join("\n");
		expect(setCookies).toContain("better-auth.session_token");
	});

	test("signed-up session reaches /api/kernel and bootstraps an org", async () => {
		const email = `t-${crypto.randomUUID()}@test.local`;
		const signUp = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: CORS_ORIGIN,
			},
			body: JSON.stringify({
				name: "E2E Teacher",
				email,
				password: "password-8chars",
			}),
		});
		expect(signUp.status).toBe(200);

		const token = /better-auth\.session_token=([^;]+)/.exec(
			signUp.headers.getSetCookie().join("\n"),
		)?.[1];
		expect(token).toBeTruthy();

		const kernel = await app.request("/api/kernel", {
			headers: {
				origin: CORS_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(kernel.status).toBe(200);
		const snapshot = (await kernel.json()) as { classes: unknown[] };
		expect(Array.isArray(snapshot.classes)).toBe(true);
	});

	test("kernel without a session cookie still answers 401", async () => {
		const res = await app.request("/api/kernel", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(401);
	});
});
