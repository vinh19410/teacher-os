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

describe("Student Email OTP Authentication & Profile Matching Integration (#578)", () => {
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

	async function loginWithOtp(email: string): Promise<string> {
		sentMails = [];
		// 1. Send OTP
		const sendRes = await app.request(
			"/api/auth/email-otp/send-verification-otp",
			{
				method: "POST",
				headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
				body: JSON.stringify({ email, type: "sign-in" }),
			},
		);
		expect(sendRes.status).toBe(200);

		// Extract OTP from dispatched email
		const mail = sentMails.find(
			(m) => m.to.toLowerCase() === email.toLowerCase(),
		);
		expect(mail).toBeDefined();
		const otp = mail?.text.match(/\b\d{6}\b/)?.[0] ?? "";
		expect(otp).toBeTruthy();

		// 2. Sign in with OTP
		const signInRes = await app.request("/api/auth/sign-in/email-otp", {
			method: "POST",
			headers: { "content-type": "application/json", origin: PORTAL_ORIGIN },
			body: JSON.stringify({ email, otp }),
		});
		expect(signInRes.status).toBe(200);

		const cookieHeader = signInRes.headers
			.getSetCookie()
			.find((c) => c.includes("better-auth.session_token="));
		expect(cookieHeader).toBeDefined();
		return (cookieHeader ? cookieHeader.split(";")[0] : undefined) ?? "";
	}

	test("Trường hợp A: Học viên được giáo viên tạo trước hồ sơ -> Đăng nhập OTP tự khớp ngay lập tức 200 OK", async () => {
		const email = "pre-created-student@example.com";
		const studentId = "stu-pre-created-1";

		// Teacher creates student profile in advance
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

		// Student logs in via OTP
		const cookie = await loginWithOtp(email);

		// Access student me endpoint
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

		// Student logs in via OTP
		const cookie = await loginWithOtp(email);

		// Access student me endpoint
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

	test("Trường hợp C: Học viên có pending studentInvitation -> createStudentGuard trả về 403 NOT_LINKED", async () => {
		const email = "invited-student@example.com";

		// Create teacher user as inviter
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

		// Teacher sent invitation (pending in studentInvitation)
		await raw.execute({
			sql: "INSERT INTO student_invitation (id, org_id, inviter_user_id, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			args: ["inv-1", "org-default", "u-inviter", email, "pending", now, now],
		});

		// Student logs in via OTP
		const cookie = await loginWithOtp(email);

		// Access student me endpoint
		const meRes = await app.request("/api/student/me", {
			headers: {
				origin: PORTAL_ORIGIN,
				cookie,
			},
		});

		// As designed, pending invitation students get 403 NOT_LINKED to display invitation acceptance UI
		expect(meRes.status).toBe(403);
		const body = (await meRes.json()) as { error: string; code: string };
		expect(body.code).toBe("STUDENT_NOT_LINKED");
	});
});
