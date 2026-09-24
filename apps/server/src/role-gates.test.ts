/**
 * API role-gate tests (plan #260, phase 3): real better-auth over in-memory
 * libsql with real migrations. Sessions are minted through the real sign-up
 * flow (a hand-seeded session row is not recognized by better-auth's session
 * lookup), and the stale-session scenarios are simulated by flipping
 * `user.role` in the DB afterwards — the cookie stays valid, exactly the
 * shared-cookie-zone case the API gates must defend against.
 */

import { createClient } from "@libsql/client";
import { ACCOUNT_ERROR_CODES } from "@teacher-os/api/contracts";
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
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function sessionTokenFrom(res: Response): string {
	const token = /better-auth\.session_token=([^;]+)/.exec(
		res.headers.getSetCookie().join("\n"),
	)?.[1];
	if (!token) throw new Error("no session cookie on sign-up response");
	return token;
}

/** Cookie value is `token.signature`; DB rows store the bare token. */
function dbToken(token: string): string {
	return decodeURIComponent(token).split(".")[0] ?? token;
}

describe("api role gates", () => {
	let app: ReturnType<typeof buildApp>;
	let raw: ReturnType<typeof createClient>;
	let libsqlDb: ReturnType<typeof drizzle<typeof schema>>;

	/** Row count of a table — typed non-optional access over drizzle's count(). */
	async function countRows(
		table: typeof schema.organization | typeof schema.membership,
	): Promise<number> {
		const [row] = await libsqlDb.select({ n: count() }).from(table);
		return Number(row?.n ?? 0);
	}

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

	async function signUp(options: { origin: string }): Promise<string> {
		const res = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: options.origin,
			},
			body: JSON.stringify({
				name: "Gate Test",
				email: `gate-${crypto.randomUUID()}@test.local`,
				password: "password-8chars",
			}),
		});
		expect(res.status).toBe(200);
		return sessionTokenFrom(res);
	}

	async function setRole(token: string, role: string | null): Promise<void> {
		await raw.execute({
			sql: "UPDATE user SET role = ? WHERE id IN (SELECT user_id FROM session WHERE token = ?)",
			args: [role, dbToken(token)],
		});
	}

	test("student-role session gets 403 ACCOUNT_STUDENT_ROLE from teacher APIs and no org/membership is created", async () => {
		const token = await signUp({ origin: PORTAL_ORIGIN });
		const orgsBefore = await countRows(schema.organization);
		const membershipsBefore = await countRows(schema.membership);

		const res = await app.request("/api/kernel", {
			headers: {
				origin: WEB_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe(ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP);

		const orgsAfter = await countRows(schema.organization);
		const membershipsAfter = await countRows(schema.membership);
		expect(orgsAfter).toBe(orgsBefore);
		expect(membershipsAfter).toBe(membershipsBefore);
	});

	test("stale session flipped to student is rejected by the same gate", async () => {
		const token = await signUp({ origin: WEB_ORIGIN });
		// Simulate a role flip after the session was minted: the cookie stays
		// valid (shared cookie zone) but the account is now a student.
		await setRole(token, "student");

		const res = await app.request("/api/kernel", {
			headers: {
				origin: WEB_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe(ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP);
	});

	test("teacher-role session still bootstraps an org (existing behavior)", async () => {
		const token = await signUp({ origin: WEB_ORIGIN });
		const emailRow = await raw.execute({
			sql: "SELECT email FROM user WHERE id IN (SELECT user_id FROM session WHERE token = ?)",
			args: [dbToken(token)],
		});
		const email = emailRow.rows[0]?.email as string;

		const res = await app.request("/api/kernel", {
			headers: {
				origin: WEB_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(200);
		const snapshot = (await res.json()) as { classes: unknown[] };
		expect(Array.isArray(snapshot.classes)).toBe(true);

		const memberships = await raw.execute({
			sql: "SELECT count(*) AS n FROM membership WHERE user_id IN (SELECT id FROM user WHERE email = ?)",
			args: [email],
		});
		expect(memberships.rows[0]?.n as number).toBe(1);
	});

	test("teacher-role session on the portal gets 403 ACCOUNT_TEACHER_ROLE and no student row is provisioned", async () => {
		const token = await signUp({ origin: WEB_ORIGIN });
		const emailRow = await raw.execute({
			sql: "SELECT email FROM user WHERE id IN (SELECT user_id FROM session WHERE token = ?)",
			args: [dbToken(token)],
		});
		const email = emailRow.rows[0]?.email as string;
		// A matching student profile exists — the gate must fire BEFORE the
		// match/provision step, so the teacher still gets 403.
		await raw.execute({
			sql: "INSERT INTO organization (id, name) VALUES ('org-portal', 'Portal Academy')",
		});
		await raw.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-tp', 'org-portal', 'Shadow Profile', '', ?, '', 1000)",
			args: [email],
		});

		const res = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string; code?: string };
		expect(body.error).toBe(ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL);
		expect(body.code).toBe(ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL);

		const students = await raw.execute({
			sql: "SELECT count(*) AS n FROM student WHERE lower(trim(email)) = ?",
			args: [email],
		});
		expect(students.rows[0]?.n as number).toBe(1);
	});

	test("NULL role session is treated as teacher (student portal rejects it)", async () => {
		const token = await signUp({ origin: WEB_ORIGIN });
		await setRole(token, null);

		const res = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie: `better-auth.session_token=${token}`,
			},
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe(ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL);
	});
});
