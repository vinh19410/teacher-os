/**
 * E2E API boot shim (issue #59): assembles the real server — buildApp DI +
 * REAL better-auth over libsql with real migrations — under plain node, so
 * Playwright can drive the full stack without Cloudflare credentials.
 * alchemy dev (workerd) cannot run in CI: its state store demands Cloudflare
 * credentials even for emulated resources.
 */

import { rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { buildApp, type Db } from "server/app";
import { getSessionUser } from "server/session";

const PORT = 8000;
// Loopback-only: this shim serves a real better-auth instance; never expose
// it beyond the test machine.
const HOSTNAME = "127.0.0.1";
const CORS_ORIGIN = "http://localhost:8001";
const DB_PATH = new URL("../local.db", import.meta.url).pathname;
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

// Wipe db + WAL siblings so every run starts from a clean slate (orphaned WAL
// files could otherwise replay stale pages into the fresh database).
for (const suffix of ["", "-wal", "-shm"]) {
	rmSync(`${DB_PATH}${suffix}`, { force: true });
}
const client = createClient({ url: `file:${DB_PATH}` });
const libsql = drizzle(client, { schema });
await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

const auth = createAuth({
	db: libsql,
	corsOrigin: CORS_ORIGIN,
	secret: "e2e-local-secret-0123456789abcdef0123456789abcdef",
	baseURL: `http://localhost:${PORT}`,
	googleClientId: "e2e-dummy",
	googleClientSecret: "e2e-dummy",
});

const app = buildApp({
	getDb: () => libsql as unknown as Db,
	corsOrigin: CORS_ORIGIN,
	getSessionUser: (headers) => getSessionUser(auth, headers),
	authHandler: (req) => auth.handler(req),
});

const server = serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME }, () =>
	console.log(`[e2e-boot] api on http://${HOSTNAME}:${PORT}`),
);

// Playwright teardown SIGTERMs the whole pnpm → tsx → node chain; close
// cleanly so back-to-back runs never fight over the port.
const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
