/**
 * Role-separation round-trip (plan #260, phases 1-2): real better-auth over
 * in-memory libsql with real migrations, asserting that account creation
 * stamps `user.role` from the originating app and that cross-app sign-ins are
 * rejected at session creation — for email/password and for the OAuth state
 * stamping path.
 *
 * corsOrigin MUST contain both app origins: a request carrying the portal
 * origin dies at better-auth's 403 INVALID_ORIGIN before any hook runs
 * otherwise (red-team finding #7).
 */

import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { createAuth } from "@teacher-os/auth";
import { createLogMailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { getSessionUser } from "./session";

const WEB_ORIGIN = "http://localhost:8001";
const PORTAL_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

interface RoleRow {
	role: string | null;
}

describe("account role separation round-trip", () => {
	let app: ReturnType<typeof buildApp>;
	let raw: ReturnType<typeof createClient>;
	let libsqlDb: ReturnType<typeof drizzle<typeof schema>>;

	beforeAll(async () => {
		raw = createClient({ url: "file::memory:" });
		libsqlDb = drizzle(raw, { schema });
		await migrate(libsqlDb, { migrationsFolder: MIGRATIONS_DIR });

		const auth = createAuth({
			db: libsqlDb,
			corsOrigin: [WEB_ORIGIN, PORTAL_ORIGIN],
			studentOrigins: [PORTAL_ORIGIN],
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: "http://localhost:8000",
			googleClientId: "test-dummy",
			googleClientSecret: "test-dummy",
			mailer: createLogMailer(),
		});

		app = buildApp({
			getDb: () => libsqlDb as unknown as Db,
			corsOrigin: [WEB_ORIGIN, PORTAL_ORIGIN],
			getSessionUser: (headers) => getSessionUser(auth, headers),
			authHandler: (req) => auth.handler(req),
		});
	});

	async function roleOf(email: string): Promise<string | null> {
		const result = await raw.execute({
			sql: "SELECT role FROM user WHERE email = ?",
			args: [email],
		});
		return (result.rows[0] as RoleRow | undefined)?.role ?? null;
	}

	async function signUp(options: {
		origin?: string;
		body?: Record<string, unknown>;
	}): Promise<Response> {
		return app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(options.origin ? { origin: options.origin } : {}),
			},
			body: JSON.stringify({
				name: "Role Test",
				email: `role-${crypto.randomUUID()}@test.local`,
				password: "password-8chars",
				...options.body,
			}),
		});
	}

	async function signIn(options: {
		email: string;
		origin?: string;
	}): Promise<Response> {
		return app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(options.origin ? { origin: options.origin } : {}),
			},
			body: JSON.stringify({
				email: options.email,
				password: "password-8chars",
			}),
		});
	}

	test("portal-origin email sign-up stamps role student and can sign in again from the portal", async () => {
		const email = `stu-${crypto.randomUUID()}@test.local`;
		const res = await signUp({
			origin: PORTAL_ORIGIN,
			body: { email },
		});
		expect(res.status).toBe(200);
		expect(await roleOf(email)).toBe("student");

		const again = await signIn({ email, origin: PORTAL_ORIGIN });
		expect(again.status).toBe(200);
	});

	test("teacher-app sign-in of a student account is rejected with ROLE_MISMATCH and no new session row", async () => {
		const email = `stu-${crypto.randomUUID()}@test.local`;
		const signUpRes = await signUp({
			origin: PORTAL_ORIGIN,
			body: { email },
		});
		expect(signUpRes.status).toBe(200);
		// Sign-up auto sign-in created exactly one session.
		const before = await raw.execute({
			sql: "SELECT count(*) AS n FROM session WHERE user_id IN (SELECT id FROM user WHERE email = ?)",
			args: [email],
		});
		const beforeCount = before.rows[0]?.n as number;

		const res = await signIn({ email, origin: WEB_ORIGIN });
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string; message?: string };
		expect(body.code).toBe("ROLE_MISMATCH");
		expect(body.message).toBe(
			"Tài khoản học viên không thể đăng nhập vào trang giáo viên. Vui lòng dùng cổng học viên.",
		);

		const after = await raw.execute({
			sql: "SELECT count(*) AS n FROM session WHERE user_id IN (SELECT id FROM user WHERE email = ?)",
			args: [email],
		});
		expect(after.rows[0]?.n as number).toBe(beforeCount);
	});

	test("teacher-app email sign-up stamps role teacher", async () => {
		const email = `tea-${crypto.randomUUID()}@test.local`;
		const res = await signUp({ origin: WEB_ORIGIN, body: { email } });
		expect(res.status).toBe(200);
		expect(await roleOf(email)).toBe("teacher");
	});

	test("sign-up without an Origin header defaults to student (least privilege)", async () => {
		const res = await signUp({});
		expect(res.status).toBe(200);
		const email = ((await res.json()) as { user?: { email?: string } }).user
			?.email;
		expect(email).toBeTruthy();
		expect(await roleOf(email as string)).toBe("student");
	});

	test('literal "null" Origin never classifies teacher', async () => {
		const res = await signUp({ origin: "null" });
		expect(res.status).toBe(200);
		const email = ((await res.json()) as { user?: { email?: string } }).user
			?.email;
		expect(await roleOf(email as string)).toBe("student");
	});

	test("client-supplied role in the sign-up body is rejected with 400", async () => {
		const res = await signUp({
			origin: PORTAL_ORIGIN,
			body: { role: "teacher" },
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { message?: string };
		expect(body.message).toContain("role is not allowed to be set");
	});

	test("/update-user cannot change the role either", async () => {
		const email = `stu-${crypto.randomUUID()}@test.local`;
		const signUpRes = await signUp({
			origin: PORTAL_ORIGIN,
			body: { email },
		});
		const token = /better-auth\.session_token=([^;]+)/.exec(
			signUpRes.headers.getSetCookie().join("\n"),
		)?.[1];
		expect(token).toBeTruthy();

		const res = await app.request("/api/auth/update-user", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: PORTAL_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
			body: JSON.stringify({ role: "teacher" }),
		});
		expect(res.status).toBe(400);
		expect(await roleOf(email)).toBe("student");
	});

	test("OAuth initiation stamps the app server-side into the verification state", async () => {
		const stamp = async (origin: string) => {
			const res = await app.request("/api/auth/sign-in/social", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin,
				},
				body: JSON.stringify({
					provider: "google",
					callbackURL: `${origin}/overview`,
				}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { url?: string };
			const authorize = new URL(body.url ?? "");
			// Chọn lại tài khoản Google luôn được offer: sau khi bị chặn role
			// mismatch, người dùng phải chọn được Gmail khác (issue #545).
			expect(authorize.searchParams.get("prompt")).toBe("select_account");
			const state = authorize.searchParams.get("state");
			expect(state).toBeTruthy();
			const row = await raw.execute({
				sql: "SELECT value FROM verification WHERE identifier = ?",
				// better-auth ≥1.7 lưu OAuth state dưới khóa có tiền tố `auth-state:`.
				args: [`auth-state:${state}`],
			});
			const value = row.rows[0]?.value as string;
			return JSON.parse(value) as Record<string, unknown>;
		};

		const portalState = await stamp(PORTAL_ORIGIN);
		expect(portalState.app).toBe("student");
		const webState = await stamp(WEB_ORIGIN);
		expect(webState.app).toBe("teacher");
	});

	test("teacher account signing in from the portal is rejected with ROLE_MISMATCH", async () => {
		const email = `tea-${crypto.randomUUID()}@test.local`;
		await signUp({ origin: WEB_ORIGIN, body: { email } });

		const res = await signIn({ email, origin: PORTAL_ORIGIN });
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string; message?: string };
		expect(body.code).toBe("ROLE_MISMATCH");
		expect(body.message).toBe(
			"Tài khoản giáo viên không thể đăng nhập vào cổng học viên.",
		);
	});

	test("/get-session exposes the role field", async () => {
		const email = `tea-${crypto.randomUUID()}@test.local`;
		const signUpRes = await signUp({ origin: WEB_ORIGIN, body: { email } });
		const token = /better-auth\.session_token=([^;]+)/.exec(
			signUpRes.headers.getSetCookie().join("\n"),
		)?.[1];
		expect(token).toBeTruthy();

		const res = await app.request("/api/auth/get-session", {
			headers: {
				origin: WEB_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { user?: { role?: string } };
		expect(body.user?.role).toBe("teacher");
	});
});

describe("unified origin auth and API role guards", () => {
	const LMS_ORIGIN = "http://localhost:8001";
	const ADMIN_EMAIL = "unified-admin@test.local";
	const REMOVED_ADMIN_EMAIL = "revoked-admin@test.local";
	const TEACHER_EMAIL = "unified-teacher@test.local";
	const STUDENT_EMAIL = "unified-student@test.local";

	let app: ReturnType<typeof buildApp>;
	let raw: ReturnType<typeof createClient>;
	let libsqlDb: ReturnType<typeof drizzle<typeof schema>>;
	let adminToken = "";
	let revokedAdminToken = "";
	let teacherToken = "";
	let studentToken = "";

	function extractSessionToken(res: Response): string {
		const token = /better-auth\.session_token=([^;]+)/.exec(
			res.headers.getSetCookie().join("\n"),
		)?.[1];
		if (!token) throw new Error("missing session cookie");
		return token;
	}

	async function countTable(
		table: typeof schema.organization | typeof schema.membership,
	): Promise<number> {
		const [row] = await libsqlDb.select({ n: count() }).from(table);
		return Number(row?.n ?? 0);
	}

	async function signUpUnified(email: string, name: string): Promise<string> {
		const res = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: LMS_ORIGIN,
			},
			body: JSON.stringify({
				name,
				email,
				password: "password-8chars",
			}),
		});
		expect(res.status).toBe(200);
		return extractSessionToken(res);
	}

	async function signInUnified(email: string): Promise<Response> {
		return app.request("/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: LMS_ORIGIN,
			},
			body: JSON.stringify({
				email,
				password: "password-8chars",
			}),
		});
	}

	async function setVerified(email: string, verified: boolean): Promise<void> {
		await raw.execute({
			sql: "UPDATE user SET email_verified = ? WHERE lower(email) = ?",
			args: [verified ? 1 : 0, email.toLowerCase()],
		});
	}

	beforeAll(async () => {
		raw = createClient({ url: "file::memory:" });
		libsqlDb = drizzle(raw, { schema });
		await migrate(libsqlDb, { migrationsFolder: MIGRATIONS_DIR });

		const auth = createAuth({
			db: libsqlDb,
			corsOrigin: [LMS_ORIGIN],
			unifiedOrigins: [LMS_ORIGIN],
			adminOrigins: [LMS_ORIGIN],
			adminEmails: [ADMIN_EMAIL, REMOVED_ADMIN_EMAIL],
			teacherEmails: [TEACHER_EMAIL],
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: "http://localhost:8000",
			googleClientId: "test-dummy",
			googleClientSecret: "test-dummy",
			mailer: createLogMailer(),
		});

		// App-level admin allowlist intentionally omits REMOVED_ADMIN_EMAIL to
		// verify runtime allowlist enforcement on /api/admin/me.
		app = buildApp({
			getDb: () => libsqlDb as unknown as Db,
			corsOrigin: [LMS_ORIGIN],
			adminOrigins: [LMS_ORIGIN],
			adminEmails: [ADMIN_EMAIL],
			teacherEmails: [TEACHER_EMAIL],
			getSessionUser: (headers) => getSessionUser(auth, headers),
			authHandler: (req) => auth.handler(req),
		});

		adminToken = await signUpUnified(ADMIN_EMAIL, "Unified Admin");
		revokedAdminToken = await signUpUnified(
			REMOVED_ADMIN_EMAIL,
			"Revoked Admin",
		);
		teacherToken = await signUpUnified(TEACHER_EMAIL, "Unified Teacher");
		studentToken = await signUpUnified(STUDENT_EMAIL, "Unified Student");
	});

	test("teacher, student, and admin can all sign in via /api/auth/sign-in/email from the unified origin", async () => {
		for (const [email, expectedRole] of [
			[ADMIN_EMAIL, "admin"],
			[TEACHER_EMAIL, "teacher"],
			[STUDENT_EMAIL, "student"],
		] as const) {
			const res = await signInUnified(email);
			expect(res.status).toBe(200);
			const token = extractSessionToken(res);

			const sessionRes = await app.request("/api/auth/get-session", {
				headers: {
					origin: LMS_ORIGIN,
					cookie: `better-auth.session_token=${token}`,
				},
			});
			expect(sessionRes.status).toBe(200);
			const sessionBody = (await sessionRes.json()) as {
				user?: { role?: string };
			};
			expect(sessionBody.user?.role).toBe(expectedRole);
		}
	});

	test("/api/kernel strictly rejects student and admin sessions and enforces teacher email verification", async () => {
		const orgsBefore = await countTable(schema.organization);
		const membershipsBefore = await countTable(schema.membership);

		const studentRes = await app.request("/api/kernel", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${studentToken}`,
			},
		});
		expect(studentRes.status).toBe(403);
		expect(((await studentRes.json()) as { code?: string }).code).toBe(
			ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP,
		);

		const adminRes = await app.request("/api/kernel", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${adminToken}`,
			},
		});
		expect(adminRes.status).toBe(403);
		expect(((await adminRes.json()) as { code?: string }).code).toBe(
			ACCOUNT_ERROR_CODES.ADMIN_ON_TEACHER_APP,
		);

		// Unverified teacher is rejected before org bootstrap.
		const unverifiedTeacherRes = await app.request("/api/kernel", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${teacherToken}`,
			},
		});
		expect(unverifiedTeacherRes.status).toBe(403);
		expect(
			((await unverifiedTeacherRes.json()) as { code?: string }).code,
		).toBe(ACCOUNT_ERROR_CODES.TEACHER_EMAIL_UNVERIFIED);

		expect(await countTable(schema.organization)).toBe(orgsBefore);
		expect(await countTable(schema.membership)).toBe(membershipsBefore);

		await setVerified(TEACHER_EMAIL, true);
		const teacherRes = await app.request("/api/kernel", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${teacherToken}`,
			},
		});
		expect(teacherRes.status).toBe(200);
	});

	test("/api/student/me strictly rejects teacher and admin sessions while allowing student", async () => {
		const teacherRes = await app.request("/api/student/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${teacherToken}`,
			},
		});
		expect(teacherRes.status).toBe(403);
		expect(((await teacherRes.json()) as { code?: string }).code).toBe(
			ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		);

		const adminRes = await app.request("/api/student/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${adminToken}`,
			},
		});
		expect(adminRes.status).toBe(403);
		expect(((await adminRes.json()) as { code?: string }).code).toBe(
			ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
		);

		const unverifiedStudentRes = await app.request("/api/student/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${studentToken}`,
			},
		});
		expect(unverifiedStudentRes.status).toBe(403);
		expect(
			((await unverifiedStudentRes.json()) as { code?: string }).code,
		).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);

		await setVerified(STUDENT_EMAIL, true);
		const studentRes = await app.request("/api/student/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${studentToken}`,
			},
		});
		expect(studentRes.status).toBe(200);
	});

	test("/api/admin/me strictly rejects teacher, student, unverified admin, and non-allowlisted admin", async () => {
		for (const token of [teacherToken, studentToken, adminToken]) {
			const res = await app.request("/api/admin/me", {
				headers: {
					origin: LMS_ORIGIN,
					cookie: `better-auth.session_token=${token}`,
				},
			});
			expect(res.status).toBe(403);
			expect(((await res.json()) as { code?: string }).code).toBe(
				ACCOUNT_ERROR_CODES.NOT_ADMIN,
			);
		}

		// Verified admin whose email is not in app adminEmails must still be 403.
		await setVerified(REMOVED_ADMIN_EMAIL, true);
		const revokedRes = await app.request("/api/admin/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${revokedAdminToken}`,
			},
		});
		expect(revokedRes.status).toBe(403);
		expect(((await revokedRes.json()) as { code?: string }).code).toBe(
			ACCOUNT_ERROR_CODES.NOT_ADMIN,
		);

		// Verified allowlisted admin passes /api/admin/me.
		await setVerified(ADMIN_EMAIL, true);
		const allowedRes = await app.request("/api/admin/me", {
			headers: {
				origin: LMS_ORIGIN,
				cookie: `better-auth.session_token=${adminToken}`,
			},
		});
		expect(allowedRes.status).toBe(200);
		expect(await allowedRes.json()).toEqual({
			email: ADMIN_EMAIL,
			name: "Unified Admin",
		});

		// Cross-origin CSRF write to /api/admin/library/* remains rejected.
		const csrfRes = await app.request("/api/admin/library/tests", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://evil.example.com",
				cookie: `better-auth.session_token=${adminToken}`,
			},
			body: JSON.stringify({}),
		});
		expect(csrfRes.status).toBe(403);
	});
});
