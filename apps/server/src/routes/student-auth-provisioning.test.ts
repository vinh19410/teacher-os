import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db } from "../app";
import { getSessionUser } from "../session";

const WEB_ORIGIN = "http://localhost:8001";
const PORTAL_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

describe("Student Email+Password Verification & Profile Matching Integration (#716)", () => {
	let app: ReturnType<typeof buildApp>;
	let raw: ReturnType<typeof createClient>;
	let libsqlDb: ReturnType<typeof drizzle<typeof schema>>;
	let sentMails: Array<{ to: string; subject: string; text: string }> = [];

	beforeAll(async () => {
		raw = createClient({ url: "file::memory:" });
		libsqlDb = drizzle(raw, { schema });
		await migrate(libsqlDb, { migrationsFolder: MIGRATIONS_DIR });

		// Seed a default organization
		await raw.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, ?)",
			args: ["org-default", "Trung tâm tiếng Anh Mẫu", Date.now()],
		});

		const mailer: Mailer = {
			send: vi.fn(async (input) => {
				sentMails.push({
					to: Array.isArray(input.to) ? input.to[0] : input.to,
					subject: input.subject,
					text: input.text ?? "",
				});
			}),
		};

		const auth = createAuth({
			db: libsqlDb,
			corsOrigin: [WEB_ORIGIN, PORTAL_ORIGIN],
			studentOrigins: [PORTAL_ORIGIN],
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: "http://localhost:8000",
			googleClientId: "test-dummy",
			googleClientSecret: "test-dummy",
			mailer,
		});

		app = buildApp({
			getDb: () => libsqlDb as unknown as Db,
			corsOrigin: [WEB_ORIGIN, PORTAL_ORIGIN],
			getSessionUser: (headers) => getSessionUser(auth, headers),
			authHandler: (req) => auth.handler(req),
		});
	});

	async function signUpAndVerifyStudent(
		email: string,
		name = "Học Viên Mới",
	): Promise<string> {
		sentMails = [];
		const signUpRes = await app.request("/api/auth/sign-up/email", {
			method: "POST",
			headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
			body: JSON.stringify({
				name,
				email,
				password: "password-123",
				callbackURL: `${PORTAL_ORIGIN}/verify-email?verified=ok`,
			}),
		});
		expect(signUpRes.status).toBe(200);

		const mail = sentMails.find(
			(m) => m.to.toLowerCase() === email.toLowerCase(),
		);
		expect(mail).toBeDefined();
		const verifyUrl = mail?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
		expect(verifyUrl).toBeTruthy();

		const parsedVerifyUrl = new URL(verifyUrl);
		const verifyRes = await app.request(
			`${parsedVerifyUrl.pathname}${parsedVerifyUrl.search}`,
		);
		expect(verifyRes.status).toBe(302);

		const cookieHeader = verifyRes.headers
			.getSetCookie()
			.find((c) => c.includes("better-auth.session_token="));
		expect(cookieHeader).toBeDefined();
		return (cookieHeader ? cookieHeader.split(";")[0] : undefined) ?? "";
	}

	test("Trường hợp A: Học viên được giáo viên tạo trước hồ sơ -> Xác thực email tự khớp ngay lập tức 200 OK", async () => {
		const email = "pre-created-student@example.com";
		const studentId = "stu-pre-created-1";

		await raw.execute({
			sql: "INSERT INTO student (id, org_id, name, email, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)",
			args: [
				studentId,
				"org-default",
				"Nguyễn Văn A",
				email,
				"0901234567",
				Date.now(),
			],
		});

		const cookie = await signUpAndVerifyStudent(email, "Nguyễn Văn A");

		const meRes = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie,
				"x-student-org-id": "org-default",
			},
		});

		expect(meRes.status).toBe(200);
		const body = (await meRes.json()) as {
			student: { id: string; name: string; email: string };
		};
		expect(body.student.id).toBe(studentId);
		expect(body.student.name).toBe("Nguyễn Văn A");
		expect(body.student.email.toLowerCase()).toBe(email.toLowerCase());
	});

	test("Trường hợp B: Học viên mới tinh -> provisionStudentForUser tự tạo hồ sơ ở org sớm nhất và trả về 200 OK", async () => {
		const email = "brand-new-student@example.com";

		const cookie = await signUpAndVerifyStudent(email, "Học Viên Mới");

		const meRes = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie,
			},
		});

		expect(meRes.status).toBe(200);
		const body = (await meRes.json()) as {
			student: { orgId: string; email: string };
		};
		expect(body.student.orgId).toBe("org-default");
		expect(body.student.email.toLowerCase()).toBe(email.toLowerCase());
	});

	test("Trường hợp C: Học viên có pending studentInvitation -> xác thực email tự tạo hồ sơ, tự accept lời mời và trả về 200 OK (#716)", async () => {
		const email = "invited-student@example.com";

		const now = Date.now();
		await raw.execute({
			sql: "INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: [
				"u-inviter",
				"Teacher Inviter",
				"inviter@example.com",
				1,
				now,
				now,
				"teacher",
			],
		});

		await raw.execute({
			sql: "INSERT INTO student_invitation (id, org_id, inviter_user_id, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: ["inv-1", "org-default", "u-inviter", email, "pending", now, now],
		});

		const cookie = await signUpAndVerifyStudent(email, "Invited Student");

		const studentRes = await raw.execute({
			sql: "SELECT id, org_id, email FROM student WHERE lower(trim(email)) = ?",
			args: [email.toLowerCase()],
		});
		expect(studentRes.rows).toHaveLength(1);
		expect(studentRes.rows[0]?.org_id).toBe("org-default");

		const invRes = await raw.execute({
			sql: "SELECT status FROM student_invitation WHERE id = ?",
			args: ["inv-1"],
		});
		expect(invRes.rows[0]?.status).toBe("accepted");

		const meRes = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie,
			},
		});

		expect(meRes.status).toBe(200);
		const body = (await meRes.json()) as {
			student: { orgId: string; email: string };
		};
		expect(body.student.orgId).toBe("org-default");
		expect(body.student.email.toLowerCase()).toBe(email.toLowerCase());
	});
});
