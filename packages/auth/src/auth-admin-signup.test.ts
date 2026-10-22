import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, type Mock, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

/**
 * Plan #413 phase 1: cổng admin không được để origin admin tự cấp quyền admin
 * cho người lạ — user.create.before phải chặn email ngoài ADMIN_EMAILS.
 */
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const API_ORIGIN = "http://api.test";
const ADMIN_ORIGIN = "http://admin.test";
const WEB_ORIGIN = "http://web.test";
const STUDENT_ORIGIN = "http://student.test";

interface Ctx {
	auth: Auth;
	raw: Client;
	send: Mock;
}

let ctx: Ctx;

async function setup(adminEmails: string[]): Promise<Ctx> {
	const raw = createClient({ url: "file::memory:" });
	const libsql = drizzle(raw, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const auth = createAuth({
		db: libsql,
		corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN, ADMIN_ORIGIN],
		studentOrigins: [STUDENT_ORIGIN],
		adminOrigins: [ADMIN_ORIGIN],
		adminEmails,
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, raw, send };
}

function signUp(origin: string, email: string) {
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: origin },
			body: JSON.stringify({
				name: "Gate Test",
				email,
				password: "password-8chars",
			}),
		}),
	);
}

async function countUsers(): Promise<number> {
	const rows = await ctx.raw.execute("SELECT count(*) AS n FROM user");
	return Number(rows.rows[0]?.n ?? 0);
}

beforeAll(async () => {
	ctx = await setup(["root@example.com"]);
});

describe("user.create.before — admin allowlist gate (plan #413 phase 1)", () => {
	test("admin origin + email ngoài allowlist → 403 ADMIN_SIGNUP_FORBIDDEN, không có row user", async () => {
		const before = await countUsers();
		const res = await signUp(ADMIN_ORIGIN, "stranger@example.com");
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string; message?: string };
		expect(body.code).toBe("ADMIN_SIGNUP_FORBIDDEN");
		expect(await countUsers()).toBe(before);
	});

	test("admin origin + email trong allowlist (khác hoa/thường) → tạo user role admin", async () => {
		const res = await signUp(ADMIN_ORIGIN, "ROOT@Example.COM");
		expect(res.status).toBe(200);
		const rows = await ctx.raw.execute(
			"SELECT role, email FROM user WHERE lower(email) = 'root@example.com'",
		);
		expect(rows.rows[0]?.role).toBe("admin");
	});

	test("email allowlist nhưng origin teacher → vẫn là teacher, không bị chặn", async () => {
		const res = await signUp(WEB_ORIGIN, "root@example.com");
		// sign-up trùng email sẽ lỗi địa chỉ đã tồn tại — đủ để biết không rơi
		// vào nhánh ADMIN_SIGNUP_FORBIDDEN.
		expect(res.status).not.toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).not.toBe("ADMIN_SIGNUP_FORBIDDEN");
	});

	test("origin lạ → student (least privilege), không đụng allowlist admin", async () => {
		const res = await signUp("https://stranger.example.com", "x@example.com");
		expect(res.status).toBe(200);
		const rows = await ctx.raw.execute(
			"SELECT role FROM user WHERE email = 'x@example.com'",
		);
		expect(rows.rows[0]?.role).toBe("student");
	});
});

describe("session.create.before — ROLE_MISMATCH với admin (plan #413 phase 1)", () => {
	test("tài khoản teacher đăng nhập trên admin origin → 403 ROLE_MISMATCH", async () => {
		// Tạo teacher trên web origin (email khác allowlist admin).
		const webCtx = ctx;
		const res = await signUp(WEB_ORIGIN, "teacher@example.com");
		expect(res.status).toBe(200);
		void webCtx;
		const cookie = res.headers
			.getSetCookie()
			.join("\n")
			.match(/better-auth\.session_token=[^;]+/)?.[0];
		expect(cookie).toBeTruthy();
		// Đăng nhập lại bằng tài khoản teacher nhưng từ admin origin.
		const signIn = await ctx.auth.handler(
			new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: ADMIN_ORIGIN,
				},
				body: JSON.stringify({
					email: "teacher@example.com",
					password: "password-8chars",
				}),
			}),
		);
		expect(signIn.status).toBe(403);
		const body = (await signIn.json()) as { code?: string };
		expect(body.code).toBe("ROLE_MISMATCH");
	});
});
