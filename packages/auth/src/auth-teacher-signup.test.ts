import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, type Mock, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

/**
 * Single-org (#513): khi TEACHER_EMAILS khác rỗng, user.create.before chỉ cho
 * phép email trong allowlist tạo tài khoản role `teacher`. Rỗng = không giới hạn.
 */
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url),
);

const API_ORIGIN = "http://api.test";
const ADMIN_ORIGIN = "http://admin.test";
const WEB_ORIGIN = "http://web.test";
const STUDENT_ORIGIN = "http://student.test";

interface Ctx {
	auth: Auth;
	raw: Client;
	send: Mock;
}

async function setup(teacherEmails: string[]): Promise<Ctx> {
	const raw = createClient({ url: "file::memory:" });
	const libsql = drizzle(raw, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const auth = createAuth({
		db: libsql,
		corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN, ADMIN_ORIGIN],
		studentOrigins: [STUDENT_ORIGIN],
		adminOrigins: [ADMIN_ORIGIN],
		teacherEmails,
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, raw, send };
}

function signUp(ctx: Ctx, origin: string, email: string) {
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({
				name: "Teacher Gate Test",
				email,
				password: "password-8chars",
			}),
		}),
	);
}

async function countUsers(ctx: Ctx): Promise<number> {
	const rows = await ctx.raw.execute("SELECT count(*) AS n FROM user");
	return Number(rows.rows[0]?.n ?? 0);
}

describe("user.create.before — teacher allowlist gate (#513)", () => {
	test("teacher origin + email ngoài allowlist → 403 TEACHER_SIGNUP_FORBIDDEN, không có row user", async () => {
		const ctx = await setup(["owner@x.vn"]);
		const before = await countUsers(ctx);
		const res = await signUp(ctx, WEB_ORIGIN, "stranger@x.vn");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string; message?: string };
		expect(body.code).toBe("TEACHER_SIGNUP_FORBIDDEN");
		expect(await countUsers(ctx)).toBe(before);
	});

	test("teacher origin + email trong allowlist (khác hoa/thường) → tạo được và role teacher", async () => {
		const ctx = await setup(["owner@x.vn"]);
		const res = await signUp(ctx, WEB_ORIGIN, "Owner@X.vn");
		expect(res.status).toBe(200);
		const rows = await ctx.raw.execute(
			"SELECT role, email FROM user WHERE lower(email) = 'owner@x.vn'",
		);
		expect(rows.rows[0]?.role).toBe("teacher");
	});

	test("allowlist rỗng + email bất kỳ trên teacher origin → tạo được và role teacher", async () => {
		const ctx = await setup([]);
		const res = await signUp(ctx, WEB_ORIGIN, "anyone@x.vn");
		expect(res.status).toBe(200);
		const rows = await ctx.raw.execute(
			"SELECT role FROM user WHERE lower(email) = 'anyone@x.vn'",
		);
		expect(rows.rows[0]?.role).toBe("teacher");
	});

	test("student origin + allowlist ['owner@x.vn'] + email stranger@x.vn → tạo được (role student)", async () => {
		const ctx = await setup(["owner@x.vn"]);
		const res = await signUp(ctx, STUDENT_ORIGIN, "stranger@x.vn");
		expect(res.status).toBe(200);
		const rows = await ctx.raw.execute(
			"SELECT role FROM user WHERE lower(email) = 'stranger@x.vn'",
		);
		expect(rows.rows[0]?.role).toBe("student");
	});

	test("student origin + email thuộc allowlist teacherEmails ('Owner@X.vn') → 403 TEACHER_SIGNUP_FORBIDDEN, chống role-poisoning thành student (#524)", async () => {
		const ctx = await setup(["owner@x.vn"]);
		const before = await countUsers(ctx);
		const res = await signUp(ctx, STUDENT_ORIGIN, "Owner@X.vn");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("TEACHER_SIGNUP_FORBIDDEN");
		expect(await countUsers(ctx)).toBe(before);
	});
});
