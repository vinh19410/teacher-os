import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { hashPassword } from "better-auth/crypto";
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
	adminEmails: string[];
	teacherEmails: string[];
}

async function setup(options?: {
	adminEmails?: string[];
	teacherEmails?: string[];
}): Promise<UnifiedCtx> {
	const raw = createClient({ url: "file::memory:" });
	const libsql = drizzle(raw, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const adminEmails = options?.adminEmails ?? [
		"admin@example.com",
		"both@example.com",
	];
	const teacherEmails = options?.teacherEmails ?? [
		"teacher@example.com",
		"both@example.com",
	];
	const auth = createAuth({
		db: libsql,
		corsOrigin: [LMS_ORIGIN],
		unifiedOrigins: [LMS_ORIGIN],
		adminOrigins: [LMS_ORIGIN],
		adminEmails,
		teacherEmails,
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, raw, libsql, send, adminEmails, teacherEmails };
}

function signUp(
	ctx: UnifiedCtx,
	email: string,
	options?: {
		origin?: string | null;
		name?: string;
		callbackURL?: string;
	},
) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (options?.origin === undefined) {
		headers.origin = LMS_ORIGIN;
	} else if (options.origin !== null) {
		headers.origin = options.origin;
	}
	return ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers,
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

let cachedDefaultPasswordHash: Promise<string> | null = null;
function getDefaultPasswordHash(): Promise<string> {
	cachedDefaultPasswordHash ??= hashPassword("password-8chars");
	return cachedDefaultPasswordHash;
}

async function seedCredentialUser(
	ctx: UnifiedCtx,
	opts: {
		email: string;
		name?: string;
		role: "admin" | "teacher" | "student";
		password?: string;
		emailVerified?: boolean;
	},
): Promise<string> {
	const userId = crypto.randomUUID();
	const passwordHash = opts.password
		? await hashPassword(opts.password)
		: await getDefaultPasswordHash();
	await ctx.libsql.insert(schema.user).values({
		id: userId,
		name: opts.name ?? "Seeded User",
		email: opts.email.trim().toLowerCase(),
		emailVerified: opts.emailVerified ?? false,
		role: opts.role,
	});
	await ctx.libsql.insert(schema.account).values({
		id: crypto.randomUUID(),
		accountId: userId,
		providerId: "credential",
		userId,
		password: passwordHash,
	});
	return userId;
}

async function roleOf(ctx: UnifiedCtx, email: string): Promise<string | null> {
	const rows = await ctx.raw.execute({
		sql: "SELECT role FROM user WHERE lower(email) = ?",
		args: [email.trim().toLowerCase()],
	});
	return (rows.rows[0]?.role as string | null | undefined) ?? null;
}

async function countUsers(ctx: UnifiedCtx): Promise<number> {
	const rows = await ctx.raw.execute("SELECT count(*) AS n FROM user");
	return Number(rows.rows[0]?.n ?? 0);
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

function cookieHeaderFromSetCookies(res: Response): string {
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.filter(Boolean)
		.join("; ");
}

async function runGoogleOAuthFlow(
	ctx: UnifiedCtx,
	opts: { email: string; name?: string; origin?: string | null },
): Promise<Response> {
	const initHeaders: Record<string, string> = {
		"content-type": "application/json",
	};
	if (opts.origin === undefined) {
		initHeaders.origin = LMS_ORIGIN;
	} else if (opts.origin !== null) {
		initHeaders.origin = opts.origin;
	}
	const initRes = await ctx.auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-in/social`, {
			method: "POST",
			headers: initHeaders,
			body: JSON.stringify({
				provider: "google",
				callbackURL: `${LMS_ORIGIN}/login`,
			}),
		}),
	);
	expect(initRes.status).toBe(200);
	const initBody = (await initRes.json()) as { url?: string };
	const authorize = new URL(initBody.url ?? "");
	const state = authorize.searchParams.get("state");
	expect(state).toBeTruthy();
	const cookies = cookieHeaderFromSetCookies(initRes);

	const originalFetch = globalThis.fetch;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			if (url.includes("oauth2.googleapis.com/token")) {
				const header = Buffer.from(
					JSON.stringify({ alg: "RS256", typ: "JWT" }),
				).toString("base64url");
				const payload = Buffer.from(
					JSON.stringify({
						iss: "https://accounts.google.com",
						aud: "test-dummy",
						sub: `google-${opts.email.toLowerCase()}`,
						email: opts.email,
						email_verified: true,
						name: opts.name ?? "Google User",
						iat: Math.floor(Date.now() / 1000),
						exp: Math.floor(Date.now() / 1000) + 3600,
					}),
				).toString("base64url");
				return new Response(
					JSON.stringify({
						access_token: "fake-google-access-token",
						id_token: `${header}.${payload}.fake-signature`,
						token_type: "Bearer",
						expires_in: 3600,
						scope: "openid email profile",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}
			if (url.includes("userinfo")) {
				return new Response(
					JSON.stringify({
						sub: `google-${opts.email.toLowerCase()}`,
						id: `google-${opts.email.toLowerCase()}`,
						email: opts.email,
						email_verified: true,
						verified_email: true,
						name: opts.name ?? "Google User",
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			}
			return originalFetch(input);
		}),
	);

	try {
		return await ctx.auth.handler(
			new Request(
				`${API_ORIGIN}/api/auth/callback/google?code=fake-code&state=${encodeURIComponent(state as string)}`,
				{
					method: "GET",
					headers: cookies ? { cookie: cookies } : {},
				},
			),
		);
	} finally {
		vi.unstubAllGlobals();
	}
}

describe("unified origin authentication", () => {
	test("blocks email/password sign-up for ADMIN_EMAILS and TEACHER_EMAILS on unified, missing, and null Origin", async () => {
		const ctx = await setup();
		const baselineUsers = await countUsers(ctx);

		// Unified Origin: admin, overlap (both), and teacher emails are rejected with uniform 403 ROLE_SIGNUP_FORBIDDEN.
		for (const privilegedEmail of [
			"ADMIN@Example.COM",
			"Both@Example.COM",
			"TEACHER@Example.COM",
		]) {
			const res = await signUp(ctx, privilegedEmail, { origin: LMS_ORIGIN });
			expect(res.status, privilegedEmail).toBe(403);
			const body = (await res.json()) as { code?: string; message?: string };
			expect(body.code).toBe("ROLE_SIGNUP_FORBIDDEN");
			expect(body.message).toContain("Google");
			expect(await roleOf(ctx, privilegedEmail)).toBeNull();
		}
		expect(await countUsers(ctx)).toBe(baselineUsers);
		expect(ctx.send).not.toHaveBeenCalled();

		// Missing Origin and literal "null" Origin cannot bypass the guard or role-poison admin/teacher into student.
		for (const origin of [null, "null"] as const) {
			for (const privilegedEmail of [
				"admin@example.com",
				"teacher@example.com",
			]) {
				const res = await signUp(ctx, privilegedEmail, { origin });
				expect(res.status, `${String(origin)}:${privilegedEmail}`).toBe(403);
				const body = (await res.json()) as { code?: string };
				expect(body.code).toBe("ROLE_SIGNUP_FORBIDDEN");
				expect(await roleOf(ctx, privilegedEmail)).toBeNull();
			}
		}
		expect(await countUsers(ctx)).toBe(baselineUsers);
		expect(ctx.send).not.toHaveBeenCalled();

		// Already-existing allowlisted admin still receives 403 ROLE_SIGNUP_FORBIDDEN (not 422 USER_ALREADY_EXISTS).
		await seedCredentialUser(ctx, {
			email: "admin@example.com",
			name: "Existing Admin",
			role: "admin",
			emailVerified: true,
		});
		const existingRes = await signUp(ctx, "admin@example.com", {
			origin: LMS_ORIGIN,
		});
		expect(existingRes.status).toBe(403);
		expect(((await existingRes.json()) as { code?: string }).code).toBe(
			"ROLE_SIGNUP_FORBIDDEN",
		);
		expect(ctx.send).not.toHaveBeenCalled();

		// In-place mutation of teacherEmails (used by E2E /__e2e/teacher-emails) takes effect immediately.
		ctx.teacherEmails.push("dynamic-teacher@example.com");
		const dynamicRes = await signUp(ctx, "Dynamic-Teacher@Example.COM", {
			origin: LMS_ORIGIN,
		});
		expect(dynamicRes.status).toBe(403);
		expect(((await dynamicRes.json()) as { code?: string }).code).toBe(
			"ROLE_SIGNUP_FORBIDDEN",
		);
		expect(await roleOf(ctx, "dynamic-teacher@example.com")).toBeNull();
		expect(ctx.send).not.toHaveBeenCalled();
	});

	test("allows non-allowlisted student sign-up on unified and missing Origin and provisions student after verify-email", async () => {
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
			email: "owner-seeded@example.com",
			emailVerified: true,
			role: "teacher",
		});
		await ctx.libsql.insert(schema.membership).values({
			id: "mem-owner",
			orgId: "org-active",
			userId: "u-owner",
			role: "teacher",
		});

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

		const noOriginStudent = "curl-learner@example.com";
		const noOriginRes = await signUp(ctx, noOriginStudent, { origin: null });
		expect(noOriginRes.status).toBe(200);
		expect(await roleOf(ctx, noOriginStudent)).toBe("student");
	});

	test("Google OAuth callback from unified origin assigns ADMIN_EMAILS > TEACHER_EMAILS > student and rejects non-unified OAuth for allowlisted emails", async () => {
		const ctx = await setup();

		// OAuth initiated without Origin stamps app="student" -> must NOT create allowlisted admin/teacher as student.
		const poisonedAdminRes = await runGoogleOAuthFlow(ctx, {
			email: "admin@example.com",
			origin: null,
		});
		expect(poisonedAdminRes.status).toBe(302);
		expect(poisonedAdminRes.headers.get("location")).toContain("error=");
		expect(await roleOf(ctx, "admin@example.com")).toBeNull();

		const poisonedTeacherRes = await runGoogleOAuthFlow(ctx, {
			email: "teacher@example.com",
			origin: null,
		});
		expect(poisonedTeacherRes.status).toBe(302);
		expect(poisonedTeacherRes.headers.get("location")).toContain("error=");
		expect(await roleOf(ctx, "teacher@example.com")).toBeNull();

		// OAuth initiated from unified LMS origin succeeds and assigns allowlist roles with priority admin > teacher > student.
		for (const [email, expectedRole] of [
			["ADMIN@Example.COM", "admin"],
			["Both@Example.COM", "admin"],
			["Teacher@Example.COM", "teacher"],
			["oauth-learner@example.com", "student"],
		] as const) {
			const res = await runGoogleOAuthFlow(ctx, { email, origin: LMS_ORIGIN });
			expect(res.status, email).toBe(302);
			expect(res.headers.get("location"), email).toBe(`${LMS_ORIGIN}/login`);
			expect(await roleOf(ctx, email), email).toBe(expectedRole);
		}
	});

	test("sign-in from unified origin succeeds for teacher, student, and admin without ROLE_MISMATCH", async () => {
		const ctx = await setup();

		await seedCredentialUser(ctx, {
			email: "admin@example.com",
			name: "Unified Admin",
			role: "admin",
		});
		await seedCredentialUser(ctx, {
			email: "teacher@example.com",
			name: "Unified Teacher",
			role: "teacher",
		});
		await seedCredentialUser(ctx, {
			email: "learner@example.com",
			name: "Unified Student",
			role: "student",
		});

		for (const [email, expectedRole] of [
			["admin@example.com", "admin"],
			["teacher@example.com", "teacher"],
			["learner@example.com", "student"],
		] as const) {
			expect(await roleOf(ctx, email)).toBe(expectedRole);

			const loggedIn = await signIn(ctx, email, LMS_ORIGIN);
			expect(loggedIn.status).toBe(200);
			expect(loggedIn.headers.get("set-cookie")).toContain("session_token=");
		}
	});

	test("verify-email auto-signin with unified callbackURL succeeds for teacher, student, and admin", async () => {
		const ctx = await setup();
		const callback = `${LMS_ORIGIN}/verify-email?verified=ok`;

		await seedCredentialUser(ctx, {
			email: "admin@example.com",
			name: "Unified Admin",
			role: "admin",
			emailVerified: false,
		});
		await seedCredentialUser(ctx, {
			email: "teacher@example.com",
			name: "Unified Teacher",
			role: "teacher",
			emailVerified: false,
		});
		expect(
			(await signUp(ctx, "learner@example.com", { callbackURL: callback }))
				.status,
		).toBe(200);

		for (const email of ["admin@example.com", "teacher@example.com"]) {
			const sendRes = await ctx.auth.handler(
				new Request(`${API_ORIGIN}/api/auth/send-verification-email`, {
					method: "POST",
					headers: { "content-type": "application/json", origin: LMS_ORIGIN },
					body: JSON.stringify({ email, callbackURL: callback }),
				}),
			);
			expect(sendRes.status).toBe(200);
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

		// Verify student signup mail (first verification mail sent by signUp above)
		const studentMail = ctx.send.mock.calls
			.map((call) => call[0] as { to: string; text: string })
			.find((m) => m.to === "learner@example.com");
		const studentToken = studentMail?.text.match(/[?&]token=([^&\s]+)/)?.[1];
		expect(studentToken).toBeTruthy();
		const studentVerifyRes = await ctx.auth.handler(
			new Request(
				`${API_ORIGIN}/api/auth/verify-email?token=${studentToken}&callbackURL=${encodeURIComponent(callback)}`,
			),
		);
		expect(studentVerifyRes.status).toBe(302);
		expect(studentVerifyRes.headers.get("location")).toBe(callback);
		expect(studentVerifyRes.headers.get("set-cookie")).toContain(
			"session_token=",
		);
	});

	test("reset-password sends mail for teacher, student, and admin on unified origin and rejects untrusted callbackURL", async () => {
		const ctx = await setup();
		const accounts = [
			"admin@example.com",
			"teacher@example.com",
			"learner@example.com",
		];

		await seedCredentialUser(ctx, {
			email: "admin@example.com",
			role: "admin",
		});
		await seedCredentialUser(ctx, {
			email: "teacher@example.com",
			role: "teacher",
		});
		expect((await signUp(ctx, "learner@example.com")).status).toBe(200);

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
