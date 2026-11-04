/**
 * E2E API boot shim (issue #59): assembles the real server — buildApp DI +
 * REAL better-auth over libsql with real migrations — under plain node, so
 * Playwright can drive the full stack without Cloudflare credentials.
 * alchemy dev (workerd) cannot run in CI: its state store demands Cloudflare
 * credentials even for emulated resources.
 */

import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { seedVocabLibrary } from "@teacher-os/db/seed/vocab-library";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { buildApp, type Db } from "server/app";
import { createFakeAiGrader } from "server/lib/ai-grading/fake-grader";
import { createFakeExamExtractor } from "server/lib/exam-import/fake-extractor";
import { getSessionUser } from "server/session";
import { createFakeBankHub } from "./fake-bank-hub";
import { createFsMediaStore } from "./fs-media-store";

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
	// Console admin (plan #413) — CORS cho fetch từ app admin lẫn CSRF
	// Origin guard của /api/admin.
	`http://localhost:${Number(process.env.E2E_ADMIN_PORT ?? 8004)}`,
];
// Plan #413: allowlist email admin của e2e — phase 7 đăng ký account admin
// qua /api/auth từ origin 8004 với email nằm trong danh sách này.
const ADMIN_EMAILS = (process.env.E2E_ADMIN_EMAILS ?? "admin@e2e.local")
	.split(",")
	.map((s) => s.trim())
	.filter((s) => s.length > 0);
// Portal origin is the role-classification student origin (plan #260,
// red-team #7): requests carrying it classify as student instead of
// failing the better-auth origin check.
const STUDENT_ORIGIN = `http://localhost:${Number(process.env.E2E_STUDENT_PORT ?? 8003)}`;
const MAIL_LOG_PATH = new URL("../.mail-log.jsonl", import.meta.url).pathname;
rmSync(MAIL_LOG_PATH, { force: true });

const recordingMailer: Mailer = {
	async send(input) {
		const verifyMatch = input.text.match(
			/https?:\/\/[^\s]*\/verify-email\?[^\s]+/,
		);
		const resetMatch = input.text.match(
			/https?:\/\/[^\s]*\/api\/auth\/reset-password\/[^\s?]+\?[^\s]+/,
		);
		const base = {
			// Plan TOS-21 (#454) + #570: lưu TOÀN BỘ thư và khóa idempotency để E2E kiểm chứng.
			to: input.to,
			subject: input.subject,
			replyTo: input.replyTo ?? null,
			fromName: input.fromName ?? null,
			idempotencyKey: input.idempotencyKey ?? null,
		};
		const at = new Date().toISOString();
		if (
			!verifyMatch &&
			!resetMatch &&
			input.to.trim().toLowerCase().endsWith("@bounce.test")
		) {
			const failedLine = JSON.stringify({ ...base, failed: true, at });
			appendFileSync(MAIL_LOG_PATH, `${failedLine}\n`, "utf8");
			throw new Error("mailbox unavailable");
		}
		const line = verifyMatch
			? JSON.stringify({ ...base, url: verifyMatch[0], at })
			: resetMatch
				? JSON.stringify({
						...base,
						url: resetMatch[0],
						kind: "password-reset",
						at,
					})
				: JSON.stringify({ ...base, error: "no-verify-url", at });
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
await client.execute("PRAGMA foreign_keys = ON;");
try {
	await seedVocabLibrary(client);
} catch (err) {
	console.error(
		"[vocab-library-seed] failed — every spec will fail; check CSV/EXPECTED_COUNTS first",
		err,
	);
	throw err;
}

const auth = createAuth({
	db: libsql,
	corsOrigin: CORS_ORIGINS,
	studentOrigins: [STUDENT_ORIGIN],
	// Plan #413: đăng ký account admin từ origin console với email trong
	// allowlist (phase 7 dùng để sign-up admin thật).
	adminOrigins: [
		`http://localhost:${Number(process.env.E2E_ADMIN_PORT ?? 8004)}`,
	],
	adminEmails: ADMIN_EMAILS,
	secret: "e2e-local-secret-0123456789abcdef0123456789abcdef",
	baseURL: `http://localhost:${PORT}`,
	googleClientId: "e2e-dummy",
	googleClientSecret: "e2e-dummy",
	mailer: recordingMailer,
});

// Lead intake (#506): org đích cố định cho POST /public/leads — spec e2e
// reassign membership giáo viên sang org này (cùng trick seedOrgMember) để
// /leads thấy lead. Idempotent: boot chạy 1 lần/run (db bị wipe) nhưng
// INSERT OR IGNORE vẫn an toàn khi retry.
const LEAD_ORG_ID = "e2e-lead-org";
await client.execute({
	sql: "INSERT OR IGNORE INTO organization (id, name, created_at) VALUES (?, ?, ?)",
	args: [LEAD_ORG_ID, "Org Lead E2E", Date.now()],
});
// Origin form profile trong e2e (port 8105, AGENTS.md mục vận hành).
const LEAD_ORIGIN = `http://localhost:${Number(process.env.E2E_PROFILE_PORT ?? 8105)}`;

// File bài nói Speaking (#305) ghi xuống thư mục tạm mỗi lần boot — adapter
// lưu trữ thật cho runtime Node, giống libsql thay D1.
const MEDIA_DIR = mkdtempSync(join(tmpdir(), "teacher-os-e2e-media-"));
const mediaStore = createFsMediaStore(MEDIA_DIR);

// Kho audio thư viện đề (#413 phase 3) — thư mục tạm RIÊNG để xoá sạch
// không đụng media bài nói; cùng adapter FS.
const LIBRARY_AUDIO_DIR = mkdtempSync(
	join(tmpdir(), "teacher-os-e2e-library-audio-"),
);
const libraryAudioStore = createFsMediaStore(LIBRARY_AUDIO_DIR);

// File đề gốc nhập AI (TOS-24 #470) — thư mục tạm RIÊNG, cùng bucket-logic
// MEDIA của production; extractor là fake (đề cố định, pageCount 2) nên
// E2E không đụng Workers AI.
const EXAM_IMPORT_DIR = mkdtempSync(
	join(tmpdir(), "teacher-os-e2e-exam-import-"),
);
const examImportStore = createFsMediaStore(EXAM_IMPORT_DIR);

// Fake Bank Hub (#320): hosted-link pages + client stub cho E2E.
const fakeBankHub = createFakeBankHub({
	origin: `http://localhost:${PORT}`,
});

const app = buildApp({
	getDb: () => libsql as unknown as Db,
	corsOrigin: CORS_ORIGINS,
	getSessionUser: (headers) => getSessionUser(auth, headers),
	authHandler: (req) => auth.handler(req),
	getMediaStore: () => mediaStore,
	getLibraryAudioStore: () => libraryAudioStore,
	// TOS-24 (#470) + TOS-27 (#473): file đề nhập AI (FS thay R2) + extractor
	// fake (tên tệp chứa `ai-fail` ném lỗi để E2E AC-004 kiểm hoàn trả Credit).
	getExamImportStore: () => examImportStore,
	getExamExtractor: () => createFakeExamExtractor(),
	// TOS-30 (#478): grader fake trả điểm cố định 6.5/7.0/6.0/6.5 — E2E
	// AC-001 thấy draft `ai_drafted` mà không đụng Workers AI. Pipeline chạy
	// fire-and-forget (không waitUntil trong Node) — test chờ qua UI.
	getAiGrader: () => createFakeAiGrader(),
	adminEmails: ADMIN_EMAILS,
	adminOrigins: [
		`http://localhost:${Number(process.env.E2E_ADMIN_PORT ?? 8004)}`,
	],
	getBankHub: () => fakeBankHub.hub,
	// Plan TOS-21 (#454): hàng đợi thông báo dùng recordingMailer để E2E đọc được thư đã gửi.
	mailer: recordingMailer,
	// Link tuyệt đối trong email thông báo trỏ cổng học viên e2e.
	studentOrigin: STUDENT_ORIGIN,
	// Plan TOS-22 (#463): không chờ 2s/5s giữa các lượt retry trong E2E.
	notificationRetryDelaysMs: [0, 0],
	// #570: tắt chờ 60s khi gửi lại lời mời học viên trong E2E.
	inviteResendCooldownMs: 0,
	// Plan TOS-33 (#481): không chờ 1s/2s giữa 3 lượt retry chấm bài trong E2E.
	aiRetryDelaysMs: [0, 0],
	// Lead intake (#506): org đích cố định + origin profile e2e (port 8105);
	// secret HMAC tái dùng secret auth; email link trỏ app web e2e.
	leadOrgId: LEAD_ORG_ID,
	leadOrigins: [LEAD_ORIGIN],
	leadIpSecret: "e2e-local-secret-0123456789abcdef0123456789abcdef",
	appOrigin: CORS_ORIGINS[0],
});

// #533 E2E-only helper: deterministically shift available_at / due_at of
// class_assignment rows so Playwright specs can test scheduled release and
// overdue cutoffs without cron or wall-clock waits.
app.post("/__e2e/study-pack-shift", async (c) => {
	const raw: unknown = await c.req.json().catch(() => null);
	if (!raw || typeof raw !== "object") {
		return c.json({ error: "invalid-body" }, 400);
	}
	const assignmentId =
		"assignmentId" in raw && typeof raw.assignmentId === "string"
			? raw.assignmentId.trim()
			: "";
	const classStudyPackId =
		"classStudyPackId" in raw && typeof raw.classStudyPackId === "string"
			? raw.classStudyPackId.trim()
			: "";
	const availableAtMs =
		"availableAtMs" in raw && typeof raw.availableAtMs === "number"
			? Math.trunc(raw.availableAtMs)
			: undefined;
	const dueAtMs =
		"dueAtMs" in raw && typeof raw.dueAtMs === "number"
			? Math.trunc(raw.dueAtMs)
			: undefined;

	if (!assignmentId && !classStudyPackId) {
		return c.json({ error: "missing-target" }, 400);
	}
	const setClauses: string[] = [];
	const args: (string | number)[] = [];
	if (availableAtMs !== undefined) {
		setClauses.push("available_at = ?");
		args.push(availableAtMs);
	}
	if (dueAtMs !== undefined) {
		setClauses.push("due_at = ?");
		args.push(dueAtMs);
	}
	if (setClauses.length === 0) {
		return c.json({ error: "missing-fields" }, 400);
	}
	const whereClauses: string[] = [];
	if (assignmentId) {
		whereClauses.push("id = ?");
		args.push(assignmentId);
	}
	if (classStudyPackId) {
		whereClauses.push("class_study_pack_id = ?");
		args.push(classStudyPackId);
	}
	const res = await client.execute({
		sql: `UPDATE class_assignment SET ${setClauses.join(", ")} WHERE ${whereClauses.join(" AND ")}`,
		args,
	});
	return c.json({ ok: true, rowsAffected: res.rowsAffected });
});

// Fake SePay hosted-link pages (#320) ride the same API server — the iframe
// src is relative (/__fake-bankhub/...) so the postMessage origin check in
// the web app sees the API origin, exactly like the real hosted link.
const server = serve(
	{
		fetch: (request) =>
			fakeBankHub.handleFakePage(request) ?? app.fetch(request),
		port: PORT,
		hostname: HOSTNAME,
	},
	() => console.log(`[e2e-boot] api on http://${HOSTNAME}:${PORT}`),
);

// Playwright teardown SIGTERMs the whole pnpm → tsx → node chain; close
// cleanly so back-to-back runs never fight over the port.
const shutdown = () =>
	server.close(() => {
		rmSync(MEDIA_DIR, { recursive: true, force: true });
		rmSync(LIBRARY_AUDIO_DIR, { recursive: true, force: true });
		rmSync(EXAM_IMPORT_DIR, { recursive: true, force: true });
		process.exit(0);
	});
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
