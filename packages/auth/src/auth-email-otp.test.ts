import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, type Mock, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url),
);

const API_ORIGIN = "http://api.test";
const TEACHER_ORIGIN = "http://teacher.test";
const STUDENT_ORIGIN = "http://student.test";
const ADMIN_ORIGIN = "http://admin.test";

interface Ctx {
	auth: Auth;
	raw: Client;
	send: Mock;
}

interface SetupOptions {
	teacherEmails?: string[];
	adminEmails?: string[];
}

async function setup(options: SetupOptions = {}): Promise<Ctx> {
	const raw = createClient({ url: "file::memory:" });
	const libsql = drizzle(raw, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const auth = createAuth({
		db: libsql,
		corsOrigin: [TEACHER_ORIGIN, STUDENT_ORIGIN, ADMIN_ORIGIN],
		studentOrigins: [STUDENT_ORIGIN],
		adminOrigins: [ADMIN_ORIGIN],
		teacherEmails: options.teacherEmails,
		adminEmails: options.adminEmails,
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, raw, send };
}

function sendOtp(ctx: Ctx, origin: string, email: string, type = "sign-in") {
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/email-otp/send-verification-otp`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ email, type }),
		}),
	);
}

function signInOtp(
	ctx: Ctx,
	origin: string,
	email: string,
	otp: string,
	extra: Record<string, unknown> = {},
) {
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-in/email-otp`, {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify({ email, otp, ...extra }),
		}),
	);
}

describe("Email OTP authentication in packages/auth (#578)", () => {
	test("happy path: student receives OTP and signs in successfully with role=student and emailVerified=true", async () => {
		const ctx = await setup();
		const email = "new-student@example.com";

		// 1. Request OTP
		const sendRes = await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(sendRes.status).toBe(200);
		expect(ctx.send).toHaveBeenCalledTimes(1);

		const mailInput = ctx.send.mock.calls[0][0];
		expect(mailInput.to).toBe(email);
		expect(mailInput.subject).toContain("Mã xác thực");
		// Extract 6-digit OTP code from mail text
		const otpMatch = mailInput.text.match(/\b\d{6}\b/);
		expect(otpMatch).toBeTruthy();
		const otp = otpMatch[0];

		// 2. Sign in with OTP
		const signInRes = await signInOtp(ctx, STUDENT_ORIGIN, email, otp);
		expect(signInRes.status).toBe(200);

		// Cookie session token must be returned
		const cookies = signInRes.headers.getSetCookie();
		expect(cookies.some((c) => c.includes("better-auth.session_token="))).toBe(
			true,
		);

		// Verify user row in database
		const userResult = await ctx.raw.execute({
			sql: "SELECT * FROM user WHERE email = ?",
			args: [email],
		});
		expect(userResult.rows.length).toBe(1);
		const userRow = userResult.rows[0];
		expect(userRow.role).toBe("student");
		expect(userRow.email_verified).toBe(1);
		// Default name should be email prefix
		expect(userRow.name).toBe("new-student");
	});

	test("rejects invalid or expired OTP code", async () => {
		const ctx = await setup();
		const email = "invalid-otp@example.com";

		await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(ctx.send).toHaveBeenCalledTimes(1);

		// Try wrong OTP
		const wrongRes = await signInOtp(ctx, STUDENT_ORIGIN, email, "999999");
		expect(wrongRes.status).toBeGreaterThanOrEqual(400);

		// Verify no session was created
		const cookies = wrongRes.headers.getSetCookie();
		expect(cookies.some((c) => c.includes("better-auth.session_token="))).toBe(
			false,
		);
	});

	test("cooldown: second OTP request within 60s does not dispatch a second email or destroy previous OTP", async () => {
		const ctx = await setup();
		const email = "cooldown-student@example.com";

		// First send
		const res1 = await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(res1.status).toBe(200);
		expect(ctx.send).toHaveBeenCalledTimes(1);
		const firstOtp = ctx.send.mock.calls[0][0].text.match(/\b\d{6}\b/)?.[0];
		expect(firstOtp).toBeTruthy();

		// Immediate second send within 60s
		const res2 = await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(res2.status).toBe(200);
		// Mailer must NOT be called again
		expect(ctx.send).toHaveBeenCalledTimes(1);

		expect(typeof firstOtp).toBe("string");
		const signInRes = await signInOtp(
			ctx,
			STUDENT_ORIGIN,
			email,
			firstOtp as string,
		);
		expect(signInRes.status).toBe(200);
	});

	test("role security: blocks OTP endpoints from teacher or admin origins", async () => {
		const ctx = await setup();
		const email = "teacher@example.com";

		// Attempt to request OTP from teacher origin
		const teacherSendRes = await sendOtp(ctx, TEACHER_ORIGIN, email);
		expect(teacherSendRes.status).toBe(403);
		expect(ctx.send).not.toHaveBeenCalled();

		// Attempt to request OTP from admin origin
		const adminSendRes = await sendOtp(ctx, ADMIN_ORIGIN, email);
		expect(adminSendRes.status).toBe(403);
		expect(ctx.send).not.toHaveBeenCalled();
	});

	test("role security: does not send OTP to teacher or admin emails from student origin", async () => {
		const ctx = await setup({
			teacherEmails: ["boss-teacher@example.com"],
			adminEmails: ["super-admin@example.com"],
		});

		// Attempt to request OTP for a known teacher email from student portal
		const teacherRes = await sendOtp(
			ctx,
			STUDENT_ORIGIN,
			"boss-teacher@example.com",
		);
		// Returns neutral 200 without sending email to prevent email enumeration and spam
		expect(teacherRes.status).toBe(200);
		expect(ctx.send).not.toHaveBeenCalled();

		// Attempt to request OTP for a known admin email from student portal
		const adminRes = await sendOtp(
			ctx,
			STUDENT_ORIGIN,
			"super-admin@example.com",
		);
		expect(adminRes.status).toBe(200);
		expect(ctx.send).not.toHaveBeenCalled();
	});

	test("role security: existing teacher account cannot log in via student OTP", async () => {
		const ctx = await setup();
		const teacherEmail = "existing-teacher@example.com";

		// Create a teacher user directly in DB
		const now = Date.now();
		await ctx.raw.execute({
			sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: ["u-teacher-1", "Teacher", teacherEmail, 0, now, now, "teacher"],
		});

		// Attempt OTP request from student portal
		const sendRes = await sendOtp(ctx, STUDENT_ORIGIN, teacherEmail);
		expect(sendRes.status).toBe(200);
		// Should NOT send OTP to teacher account
		expect(ctx.send).not.toHaveBeenCalled();

		// Even if an OTP existed, signInEmailOTP from student origin must be rejected with ROLE_MISMATCH
		// and must not alter the teacher's email_verified state
		const signInRes = await signInOtp(
			ctx,
			STUDENT_ORIGIN,
			teacherEmail,
			"123456",
		);
		expect(signInRes.status).toBe(403);

		const teacherRow = (
			await ctx.raw.execute({
				sql: "SELECT email_verified FROM user WHERE id = ?",
				args: ["u-teacher-1"],
			})
		).rows[0];
		expect(teacherRow.email_verified).toBe(0);
	});

	test("disables dangerous password reset endpoints in emailOTP plugin", async () => {
		const ctx = await setup();

		// POST /api/auth/email-otp/request-password-reset must be blocked
		const reqResetRes = await ctx.auth.handler(
			new Request(`${API_ORIGIN}/api/auth/email-otp/request-password-reset`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: STUDENT_ORIGIN },
				body: JSON.stringify({ email: "victim@example.com" }),
			}),
		);
		expect(reqResetRes.status).toBeGreaterThanOrEqual(400);

		// POST /api/auth/email-otp/reset-password must be blocked
		const resetRes = await ctx.auth.handler(
			new Request(`${API_ORIGIN}/api/auth/email-otp/reset-password`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: STUDENT_ORIGIN },
				body: JSON.stringify({
					email: "victim@example.com",
					otp: "123456",
					password: "new-password",
				}),
			}),
		);
		expect(resetRes.status).toBeGreaterThanOrEqual(400);
	});

	test("pre-hijack protection: unverified user with credential password has credential revoked upon OTP login", async () => {
		const ctx = await setup();
		const email = "unverified-hijack@example.com";
		const now = Date.now();

		// Attacker registered account with password, but never verified email
		await ctx.raw.execute({
			sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: ["u-hijack", "Victim", email, 0, now, now, "student"],
		});
		await ctx.raw.execute({
			sql: "INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				"acc-hijack",
				email,
				"credential",
				"u-hijack",
				"attacker-password-hash",
				now,
				now,
			],
		});

		// Victim logs in via OTP
		const sendRes = await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(sendRes.status).toBe(200);
		const mailText = String(ctx.send.mock.calls[0]?.[0]?.text ?? "");
		const otp = mailText.match(/\b\d{6}\b/)?.[0] ?? "";
		expect(otp).toBeTruthy();

		const signInRes = await signInOtp(ctx, STUDENT_ORIGIN, email, otp);
		expect(signInRes.status).toBe(200);

		// Account credential created by attacker must be revoked!
		const accountRows = (
			await ctx.raw.execute({
				sql: "SELECT * FROM account WHERE user_id = ?",
				args: ["u-hijack"],
			})
		).rows;
		expect(accountRows.length).toBe(0);

		// User email_verified is now true
		const userRow = (
			await ctx.raw.execute({
				sql: "SELECT email_verified FROM user WHERE id = ?",
				args: ["u-hijack"],
			})
		).rows[0];
		expect(userRow.email_verified).toBe(1);
	});

	test("OTP sign-in from STUDENT_ORIGIN auto-provisions student into teacher's active org and auto-accepts pending invitation (#716)", async () => {
		const ctx = await setup({ teacherEmails: ["boss-teacher@example.com"] });

		// Seed an earlier empty org and a later org owned by TEACHER_EMAILS
		await ctx.raw.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
			args: ["org-empty-early", "Empty Lead Org", 1000],
		});
		await ctx.raw.execute({
			sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				"u-boss-teacher",
				"Boss Teacher",
				"boss-teacher@example.com",
				1,
				1500,
				1500,
				"teacher",
			],
		});
		await ctx.raw.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
			args: ["org-teacher-active", "Active Academy", 2000],
		});
		await ctx.raw.execute({
			sql: "INSERT INTO membership (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)",
			args: [
				"mem-boss-teacher",
				"org-teacher-active",
				"u-boss-teacher",
				"teacher",
				2000,
			],
		});

		const email = "otp-invited-student@example.com";
		await ctx.raw.execute({
			sql: "INSERT INTO student_invitation (id, org_id, inviter_user_id, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				"inv-otp-1",
				"org-teacher-active",
				"u-boss-teacher",
				email,
				"pending",
				2500,
				2500,
			],
		});

		const sendRes = await sendOtp(ctx, STUDENT_ORIGIN, email);
		expect(sendRes.status).toBe(200);
		const mailText = String(ctx.send.mock.calls[0]?.[0]?.text ?? "");
		const otp = mailText.match(/\b\d{6}\b/)?.[0] ?? "";
		expect(otp).toBeTruthy();

		const signInRes = await signInOtp(ctx, STUDENT_ORIGIN, email, otp);
		expect(signInRes.status).toBe(200);

		const studentRows = (
			await ctx.raw.execute({
				sql: "SELECT org_id, name, email FROM student WHERE lower(trim(email)) = ?",
				args: [email],
			})
		).rows;
		expect(studentRows).toHaveLength(1);
		expect(studentRows[0]).toMatchObject({
			org_id: "org-teacher-active",
			name: "otp-invited-student",
			email,
		});

		const invitationRow = (
			await ctx.raw.execute({
				sql: "SELECT status FROM student_invitation WHERE id = ?",
				args: ["inv-otp-1"],
			})
		).rows[0];
		expect(invitationRow?.status).toBe("accepted");
	});
});
