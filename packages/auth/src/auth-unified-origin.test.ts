import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, type Mock, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const API_ORIGIN = "http://api.test";
const LMS_ORIGIN = "http://lms.test";
const EVIL_ORIGIN = "https://evil.example.com";
const RESET_SUBJECT = "Đặt lại mật khẩu";

interface UnifiedCtx {
	auth: Auth;
	raw: Client;
	libsql: ReturnType<typeof drizzle<typeof schema>>;
	send: Mock;
}

async function setup(options?: {
	adminEmails?: string[];
	teacherEmails?: string[];
}): Promise<UnifiedCtx> {
	const raw = createClient({ url: "file::memory:" });
	const libsql = drizzle(raw, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const auth = createAuth({
		db: libsql,
		corsOrigin: [LMS_ORIGIN],
		unifiedOrigins: [LMS_ORIGIN],
		adminOrigins: [LMS_ORIGIN],
		adminEmails: options?.adminEmails ?? [
			"admin@example.com",
			"both@example.com",
		],
		teacherEmails: options?.teacherEmails ?? [
			"teacher@example.com",
			"both@example.com",
		],
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, raw, libsql, send };
}

function signUp(
	ctx: UnifiedCtx,
	email: string,
	options?: {
		origin?: string;
		name?: string;
		callbackURL?: string;
	},
) {
	const origin = options?.origin ?? LMS_ORIGIN;
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({
				name: options?.name ?? "Unified User",
				email,
				password: "password-8chars",
				...(options?.callbackURL ? { callbackURL: options.callbackURL } : {}),
			}),
		}),
	);
}

function signIn(ctx: UnifiedCtx, email: string, origin = LMS_ORIGIN) {
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({
				email,
				password: "password-8chars",
			}),
		}),
	);
}

async function roleOf(ctx: UnifiedCtx, email: string): Promise<string | null> {
	const rows = await ctx.raw.execute({
		sql: "SELECT role FROM user WHERE lower(email) = ?",
		args: [email.trim().toLowerCase()],
	});
	return (rows.rows[0]?.role as string | null | undefined) ?? null;
}

function lastVerificationToken(send: Mock): string {
	const text = String(send.mock.calls.at(-1)?.[0]?.text ?? "");
	const token = text.match(/[?&]token=([^&\s]+)/)?.[1];
	expect(token).toBeTruthy();
	return token as string;
}

function resetMails(send: Mock) {
	return send.mock.calls
		.map((call) => call[0] as { to: string; subject: string; text: string })
		.filter((mail) => mail.subject.includes(RESET_SUBJECT));
}

describe("unified origin authentication", () => {
	test("assigns role on sign-up with priority ADMIN_EMAILS > TEACHER_EMAILS > student and provisions verified student", async () => {
		const ctx = await setup();

		// Seed teacher's active org so verified student auto-provisions into it.
		await ctx.libsql.insert(schema.organization).values({
			id: "org-active",
			name: "Active Org",
			createdAt: new Date(1000),
		});
		await ctx.libsql.insert(schema.user).values({
			id: "u-owner",
			name: "Org Owner",
			email: "teacher@example.com",
			emailVerified: true,
			role: "teacher",
		});
		await ctx.libsql.insert(schema.membership).values({
			id: "mem-owner",
			orgId: "org-active",
			userId: "u-owner",
			role: "teacher",
		});

		const adminRes = await signUp(ctx, "ADMIN@Example.COM");
		expect(adminRes.status).toBe(200);
		expect(await roleOf(ctx, "admin@example.com")).toBe("admin");

		// Email present in both adminEmails and teacherEmails resolves to admin.
		const bothRes = await signUp(ctx, "Both@Example.COM");
		expect(bothRes.status).toBe(200);
		expect(await roleOf(ctx, "both@example.com")).toBe("admin");

		// Email in teacherEmails only (using another allowlisted teacher).
		const teacherCtx = await setup({
			adminEmails: ["admin@example.com"],
			teacherEmails: ["coach@example.com"],
		});
		const teacherRes = await signUp(teacherCtx, "COACH@Example.COM");
		expect(teacherRes.status).toBe(200);
		expect(await roleOf(teacherCtx, "coach@example.com")).toBe("teacher");

		// Unknown email registers cleanly as student (no FORBIDDEN error) and
		// provisions a student row once email is verified.
		const studentEmail = "new-learner@example.com";
		const studentRes = await signUp(ctx, studentEmail, {
			name: "New Learner",
			callbackURL: `${LMS_ORIGIN}/verify-email?verified=ok`,
		});
		expect(studentRes.status).toBe(200);
		expect(await roleOf(ctx, studentEmail)).toBe("student");
		expect(await ctx.libsql.select().from(schema.student)).toHaveLength(0);

		const token = lastVerificationToken(ctx.send);
		const verifyRes = await ctx.auth.handler(
			new Request(
				`${API_ORIGIN}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(`${LMS_ORIGIN}/verify-email?verified=ok`)}`,
			),
		);
		expect(verifyRes.status).toBe(302);
		expect(verifyRes.headers.get("location")).toBe(
			`${LMS_ORIGIN}/verify-email?verified=ok`,
		);

		const studentsAfter = await ctx.libsql
			.select()
			.from(schema.student)
			.where(eq(schema.student.email, studentEmail));
		expect(studentsAfter).toHaveLength(1);
		expect(studentsAfter[0]).toMatchObject({
			orgId: "org-active",
			name: "New Learner",
			email: studentEmail,
		});
	});

	test("sign-in from unified origin succeeds for teacher, student, and admin without ROLE_MISMATCH", async () => {
		const ctx = await setup();

		for (const [email, expectedRole] of [
			["admin@example.com", "admin"],
			["teacher@example.com", "teacher"],
			["learner@example.com", "student"],
		] as const) {
			const created = await signUp(ctx, email);
			expect(created.status).toBe(200);
			expect(await roleOf(ctx, email)).toBe(expectedRole);

			const loggedIn = await signIn(ctx, email, LMS_ORIGIN);
			expect(loggedIn.status).toBe(200);
			expect(loggedIn.headers.get("set-cookie")).toContain("session_token=");
		}
	});

	test("verify-email auto-signin with unified callbackURL succeeds for teacher, student, and admin", async () => {
		const ctx = await setup();
		const callback = `${LMS_ORIGIN}/verify-email?verified=ok`;

		for (const email of [
			"admin@example.com",
			"teacher@example.com",
			"learner@example.com",
		]) {
			const res = await signUp(ctx, email, { callbackURL: callback });
			expect(res.status).toBe(200);
			const token = lastVerificationToken(ctx.send);

			const verifyRes = await ctx.auth.handler(
				new Request(
					`${API_ORIGIN}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callback)}`,
				),
			);
			expect(verifyRes.status).toBe(302);
			expect(verifyRes.headers.get("location")).toBe(callback);
			expect(verifyRes.headers.get("set-cookie")).toContain("session_token=");
		}
	});

	test("reset-password sends mail for teacher, student, and admin on unified origin and rejects untrusted callbackURL", async () => {
		const ctx = await setup();
		const accounts = [
			"admin@example.com",
			"teacher@example.com",
			"learner@example.com",
		];

		for (const email of accounts) {
			expect((await signUp(ctx, email)).status).toBe(200);
		}

		for (const email of accounts) {
			const res = await ctx.auth.handler(
				new Request(`${API_ORIGIN}/api/auth/request-password-reset`, {
					method: "POST",
					headers: { "content-type": "application/json", origin: LMS_ORIGIN },
					body: JSON.stringify({
						email,
						redirectTo: `${LMS_ORIGIN}/reset-password`,
					}),
				}),
			);
			expect(res.status).toBe(200);
		}
		expect(resetMails(ctx.send).map((m) => m.to)).toEqual(accounts);

		// Untrusted redirectTo must never send reset mail for any role.
		const countBefore = resetMails(ctx.send).length;
		for (const email of accounts) {
			await ctx.auth.handler(
				new Request(`${API_ORIGIN}/api/auth/request-password-reset`, {
					method: "POST",
					headers: { "content-type": "application/json", origin: LMS_ORIGIN },
					body: JSON.stringify({
						email,
						redirectTo: `${EVIL_ORIGIN}/reset-password`,
					}),
				}),
			);
		}
		expect(resetMails(ctx.send)).toHaveLength(countBefore);
	});

	test("OAuth initiation from unified origin stamps app=unified server-side and overwrites client additionalData", async () => {
		const ctx = await setup();

		const res = await ctx.auth.handler(
			new Request(`${API_ORIGIN}/api/auth/sign-in/social`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: LMS_ORIGIN },
				body: JSON.stringify({
					provider: "google",
					callbackURL: `${LMS_ORIGIN}/login`,
					additionalData: { app: "admin" },
				}),
			}),
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { url?: string };
		const authorize = new URL(body.url ?? "");
		expect(authorize.searchParams.get("prompt")).toBe("select_account");
		const state = authorize.searchParams.get("state");
		expect(state).toBeTruthy();

		const row = await ctx.raw.execute({
			sql: "SELECT value FROM verification WHERE identifier = ?",
			args: [`auth-state:${state}`],
		});
		const parsed = JSON.parse(String(row.rows[0]?.value ?? "{}")) as Record<
			string,
			unknown
		>;
		expect(parsed.app).toBe("unified");
	});
});
