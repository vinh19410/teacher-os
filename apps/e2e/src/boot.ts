/**
 * E2E API boot shim (issue #59): assembles the real server — buildApp DI +
 * REAL better-auth over libsql with real migrations — under plain node, so
 * Playwright can drive the full stack without Cloudflare credentials.
 * alchemy dev (workerd) cannot run in CI: its state store demands Cloudflare
 * credentials even for emulated resources.
 */

import { appendFileSync, rmSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { buildApp, type Db } from "server/app";
import { getSessionUser } from "server/session";

// Port override chỉ phục vụ chạy e2e song song với dev server đang chiếm
// 8000 (workerd của main worktree) — mặc định giữ 8000 như CI (playwright
// config cùng đọc E2E_API_PORT để fail-loud semantics không đổi).
const PORT = Number(process.env.E2E_API_PORT ?? 8000);
// Loopback-only: this shim serves a real better-auth instance; never expose
// it beyond the test machine.
const HOSTNAME = process.env.E2E_HOSTNAME ?? "::";
const CORS_ORIGINS = [
	`http://localhost:${Number(process.env.E2E_WEB_PORT ?? 8001)}`,
	`http://localhost:${Number(process.env.E2E_STUDENT_PORT ?? 8003)}`,
];
const MAIL_LOG_PATH = new URL("../.mail-log.jsonl", import.meta.url).pathname;
rmSync(MAIL_LOG_PATH, { force: true });

const recordingMailer: Mailer = {
	async send(input) {
		const match = input.text.match(/https?:\/\/[^\s]*\/verify-email\?[^\s]+/);
		const line = match
			? JSON.stringify({
					to: input.to,
					subject: input.subject,
					url: match[0],
					at: new Date().toISOString(),
				})
			: JSON.stringify({
					to: input.to,
					subject: input.subject,
					error: "no-verify-url",
					at: new Date().toISOString(),
				});
		appendFileSync(MAIL_LOG_PATH, `${line}\n`, "utf8");
	},
};
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
await client.execute("PRAGMA journal_mode = WAL;");
await client.execute("PRAGMA busy_timeout = 5000;");
const libsql = drizzle(client, { schema });
await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

const auth = createAuth({
	db: libsql,
	corsOrigin: CORS_ORIGINS,
	secret: "e2e-local-secret-0123456789abcdef0123456789abcdef",
	baseURL: `http://localhost:${PORT}`,
	googleClientId: "e2e-dummy",
	googleClientSecret: "e2e-dummy",
	mailer: recordingMailer,
});

const app = buildApp({
	getDb: () => libsql as unknown as Db,
	corsOrigin: CORS_ORIGINS,
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
