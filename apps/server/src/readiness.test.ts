/**
 * `/readyz` handler tests (issue #31): the probe proves the Worker can run a
 * bounded, schema-dependent catalog query against D1 — without auth, session
 * bootstrap, or internal-error leakage.
 *
 * The only seams match kernel.test.ts: the real buildApp chain plus an
 * in-memory libsql DB with real migrations. Failure paths replace getDb with
 * throwing/rejecting stubs; no session or cookie helpers are needed.
 */

import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import { type AppDeps, buildApp, type Db } from "./app";
import { PROBE_QUERY } from "./routes/readiness";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

interface TestApp {
	app: ReturnType<typeof buildApp>;
	db: ReturnType<typeof drizzle>;
	getSessionUserCalls: () => number;
}

async function createReadinessApp(
	deps: Partial<AppDeps> = {},
): Promise<TestApp> {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	let sessionCalls = 0;
	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: async () => {
			sessionCalls++;
			return null;
		},
		authHandler: () => new Response("auth stub", { status: 404 }),
		...deps,
	});
	return { app, db: libsql, getSessionUserCalls: () => sessionCalls };
}

function callReadyz(app: ReturnType<typeof buildApp>) {
	return app.request("/readyz", { headers: { origin: CORS_ORIGIN } });
}

describe("/readyz", () => {
	test("healthy migrated DB with zero rows returns 200 {ok:true} (empty-safe, no session lookup, no bootstrap write)", async () => {
		const t = await createReadinessApp();
		const res = await callReadyz(t.app);

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('{"ok":true}');
		expect(res.headers.get("content-type")).toContain("application/json");
		expect(res.headers.get("cache-control")).toBe("no-store");

		// Empty-safe: a fresh deploy has no teacher yet and must still be ready.
		expect(await t.db.select().from(organization)).toEqual([]);
		expect(await t.db.select().from(membership)).toEqual([]);
		// The probe never touches the session/better-auth seam.
		expect(t.getSessionUserCalls()).toBe(0);
	});

	test("probe query stays within Cloudflare D1's 100 bound-parameter limit", () => {
		// libsql in-memory has no such cap, so the healthy-DB test above passed
		// while D1 rejected the ~132-parameter probe and staging /readyz
		// answered 503. Guard the compiled statement directly.
		// https://developers.cloudflare.com/d1/platform/limits/
		const { sql: text, params } = new SQLiteSyncDialect().sqlToQuery(
			PROBE_QUERY,
		);
		expect(params.length).toBeLessThanOrEqual(100);
		// The whole name list rides in one JSON parameter, so the contract
		// still covers every table and index (incl. 0006's unique index).
		expect(text).toContain("json_each(?)");
		const names = JSON.parse(String(params[0])) as string[];
		expect(names).toContain("lesson");
		expect(names).toContain("comment_bank_org_operation_uidx");
	});

	test("GET / stays a plain liveness probe", async () => {
		const t = await createReadinessApp();
		const res = await t.app.request("/", { headers: { origin: CORS_ORIGIN } });
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("OK");
	});

	test("missing schema (a kernel table absent after migrate) returns generic 503", async () => {
		const t = await createReadinessApp();
		await t.db.run(sql`DROP TABLE lesson`);
		const res = await callReadyz(t.app);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('{"ok":false}');
	});

	test("a table-altering migration absent (0006's unique index dropped, all tables present) is not ready", async () => {
		// Migration 0006 adds no table — counting tables alone would wrongly
		// report 200 on a database stuck before it.
		const t = await createReadinessApp();
		await t.db.run(sql`DROP INDEX comment_bank_org_operation_uidx`);
		const res = await callReadyz(t.app);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('{"ok":false}');
	});

	test("columns added by a later migration absent (DB stuck before 0045) is not ready", async () => {
		// TOS-7 #440 — 0045 chỉ ADD COLUMN nên probe tables+indexes không
		// thấy khác biệt: code mới + DB cũ phải 503 ở readyz thay vì 500
		// "no such column" giữa giờ điểm danh.
		const t = await createReadinessApp();
		await t.db.run(sql`ALTER TABLE lesson DROP COLUMN attendance`);
		await t.db.run(sql`ALTER TABLE lesson DROP COLUMN attendance_note`);
		const res = await callReadyz(t.app);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('{"ok":false}');
	});

	test("database error (getDb throws) returns the same generic 503", async () => {
		const t = await createReadinessApp({
			getDb: () => {
				throw new Error("D1_ERROR: ns=teacher_os binding unavailable");
			},
		});
		const res = await callReadyz(t.app);
		expect(res.status).toBe(503);
		expect(await res.text()).toBe('{"ok":false}');
	});

	test("query rejection returns the same generic 503 with no internals in the body", async () => {
		const leaking = new Error(
			"no such table: organization — D1_ERROR: sqlite://prod db=abc123",
		);
		const failingDb = {
			get: () => Promise.reject(leaking),
		} as unknown as Db;
		const t = await createReadinessApp({ getDb: () => failingDb });

		const res = await callReadyz(t.app);
		const body = await res.text();
		expect(res.status).toBe(503);
		// Byte-identical to the other failure bodies — the endpoint must not
		// distinguish binding failure from missing schema for an attacker.
		expect(body).toBe('{"ok":false}');
		expect(body).not.toContain("no such table");
		expect(body).not.toContain("D1_ERROR");
		expect(body).not.toContain("organization");
		expect(body).not.toContain("abc123");
	});

	test("every failure mode answers the byte-identical body", async () => {
		const bodies: string[] = [];

		const dropped = await createReadinessApp();
		await dropped.db.run(sql`DROP TABLE notif`);
		bodies.push(await (await callReadyz(dropped.app)).text());

		const throwing = await createReadinessApp({
			getDb: () => {
				throw new Error("boom");
			},
		});
		bodies.push(await (await callReadyz(throwing.app)).text());

		// A DB object whose driver method is missing exercises the sync-throw
		// branch of the catch-all (the rejecting-get seam is covered above).
		const brokenDb = {} as unknown as Db;
		const broken = await createReadinessApp({ getDb: () => brokenDb });
		bodies.push(await (await callReadyz(broken.app)).text());

		expect(new Set(bodies)).toEqual(new Set(['{"ok":false}']));
	});
});
