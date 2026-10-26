import { createClient } from "@libsql/client";
import type { DebtReminderResponse } from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { membership } from "@teacher-os/db/schema/membership";
import { notificationRecord } from "@teacher-os/db/schema/notification-record";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("POST /api/debt-reminders (TOS-18 #452)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let otherOrgId: string;
	let teacherToken: string;
	let taToken: string;
	let otherToken: string;
	type MailInput = Parameters<Mailer["send"]>[0];
	const sentMails: MailInput[] = [];

	const fakeMailer: Mailer = {
		async send(mail: MailInput) {
			sentMails.push(mail);
		},
	};

	function postReminders(body: unknown, token?: string): Promise<Response> {
		const headers: Record<string, string> = {
			origin: CORS_ORIGIN,
			"content-type": "application/json",
		};
		if (token) {
			headers.cookie = `better-auth.session_token=${token}`;
		}
		return Promise.resolve(
			app.request("/api/debt-reminders", {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			}),
		);
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			mailer: fakeMailer,
			studentOrigin: "http://localhost:8003",
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!t) return null;
				if (t === teacherToken) {
					return {
						userId: "u-teacher",
						userName: "Cô Minh",
						role: "teacher" as const,
					};
				}
				if (t === taToken) {
					return {
						userId: "u-ta",
						userName: "Trợ giảng",
						role: "teacher" as const,
					};
				}
				if (t === otherToken) {
					return {
						userId: "u-other",
						userName: "Cô Khác",
						role: "teacher" as const,
					};
				}
				return null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		teacherToken = crypto.randomUUID();
		taToken = crypto.randomUUID();
		otherToken = crypto.randomUUID();

		await libsql.insert(authUser).values([
			{ id: "u-teacher", name: "Cô Minh", email: "cominh@test.local" },
			{ id: "u-ta", name: "Trợ giảng", email: "ta@test.local" },
			{ id: "u-other", name: "Cô Khác", email: "other@test.local" },
		]);
		await libsql.insert(authSession).values([
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: teacherToken,
				userId: "u-teacher",
			},
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: taToken,
				userId: "u-ta",
			},
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: otherToken,
				userId: "u-other",
			},
		]);

		const boot = await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${teacherToken}` },
		});
		expect(boot.status).toBe(200);
		const otherBoot = await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${otherToken}` },
		});
		expect(otherBoot.status).toBe(200);

		const m1 = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-teacher'",
		});
		orgId = (m1.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		const m2 = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-other'",
		});
		otherOrgId = (m2.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		await libsql.insert(membership).values({
			id: crypto.randomUUID(),
			orgId,
			userId: "u-ta",
			role: "ta",
		});

		await libsql.insert(classTable).values([
			{
				id: "cl-1",
				orgId,
				name: "IELTS 6.5A",
				level: "6.5",
				type: "ielts",
				skills: '["Writing"]',
				mode: "Online",
				schedule: "",
				sessionsTotal: 12,
				sessionsDone: 0,
				status: "active",
				startDate: "01/10",
			},
			{
				id: "cl-2",
				orgId,
				name: "IELTS 5.0B",
				level: "5.0",
				type: "ielts",
				skills: '["Reading"]',
				mode: "Online",
				schedule: "",
				sessionsTotal: 12,
				sessionsDone: 0,
				status: "active",
				startDate: "01/10",
			},
		]);

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', ?, 'Nguyễn Minh Anh', '0901112222', 'minhanh@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-2', ?, 'Trần Hoàng Nam', '0902223333', 'nam@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-clear', ?, 'Lê Thu Hà', '0903334444', 'ha@test.local', '', 1000)",
			args: [orgId],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-foreign', ?, 'Học viên Org Khác', '0909999999', 'foreign@test.local', '', 1000)",
			args: [otherOrgId],
		});

		await libsql.insert(enrollment).values([
			{
				id: "en-1a",
				orgId,
				classId: "cl-1",
				studentId: "stu-1",
				status: "active",
			},
			{
				id: "en-1b",
				orgId,
				classId: "cl-2",
				studentId: "stu-1",
				status: "active",
			},
			{
				id: "en-2",
				orgId,
				classId: "cl-1",
				studentId: "stu-2",
				status: "active",
			},
			{
				id: "en-clear",
				orgId,
				classId: "cl-1",
				studentId: "stu-clear",
				status: "active",
			},
		]);

		// stu-1 có:
		// - inv-1a (lớp cl-1): tổng 4.5M, đã đóng 2M -> còn nợ 2.5M
		// - inv-1b (lớp cl-2): tổng 1.8M, chưa đóng -> còn nợ 1.8M
		// - inv-1-markpaid: đã mark-paid thủ công (status = "paid", paidAmount = 0) -> KHÔNG nhắc
		// stu-2 có:
		// - inv-2a (lớp cl-1): tổng 3.2M, chưa đóng -> còn nợ 3.2M
		// stu-clear có:
		// - inv-clear: đã đóng đủ (status = "paid", paidAmount = 4.5M) -> KHÔNG nhắc
		// stu-foreign có:
		// - inv-foreign (org khác): còn nợ -> KHÔNG nhắc
		await libsql.insert(invoice).values([
			{
				id: "inv-1a",
				orgId,
				studentId: "stu-1",
				enrollmentId: "en-1a",
				amount: 4_500_000,
				paidAmount: 2_000_000,
				status: "unpaid",
				due: "2026-10-20",
			},
			{
				id: "inv-1b",
				orgId,
				studentId: "stu-1",
				enrollmentId: "en-1b",
				amount: 1_800_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-10-28",
			},
			{
				id: "inv-1-markpaid",
				orgId,
				studentId: "stu-1",
				enrollmentId: "en-1a",
				amount: 2_000_000,
				paidAmount: 0,
				status: "paid",
				due: "2026-10-10",
			},
			{
				id: "inv-2a",
				orgId,
				studentId: "stu-2",
				enrollmentId: "en-2",
				amount: 3_200_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-10-29",
			},
			{
				id: "inv-clear",
				orgId,
				studentId: "stu-clear",
				enrollmentId: "en-clear",
				amount: 4_500_000,
				paidAmount: 4_500_000,
				status: "paid",
				due: "2026-10-15",
			},
			{
				id: "inv-foreign",
				orgId: otherOrgId,
				studentId: "stu-foreign",
				enrollmentId: "",
				amount: 5_000_000,
				paidAmount: 0,
				status: "unpaid",
				due: "2026-10-20",
			},
		]);
	});

	test("lọc theo classId chỉ gửi nhắc các hóa đơn còn nợ thuộc lớp đó, dùng đúng số tiền còn nợ", async () => {
		sentMails.length = 0;
		const today = vietnamTodayISO();

		// Chỉ lọc lớp cl-1 cho stu-1 -> chỉ có inv-1a (còn nợ 2.500.000đ) được nhắc; inv-1b ở cl-2 chưa nhắc
		const res = await postReminders(
			{ studentIds: ["stu-1"], classId: "cl-1" },
			teacherToken,
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as DebtReminderResponse;
		expect(body).toEqual({ queued: 1, skipped: 0 });

		const rows = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.orgId, orgId));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.eventType).toBe("tuition_reminder");
		expect(rows[0]?.idempotencyKey).toBe(`tuition_reminder:inv-1a:${today}`);
		// Phải ghi số tiền còn nợ 2.500.000đ chứ không phải tổng gốc 4.500.000đ
		expect(rows[0]?.body).toContain("2.500.000đ");
		expect(rows[0]?.body).not.toContain("4.500.000đ");
		expect(sentMails).toHaveLength(1);
	});

	test("2 học viên đang nợ (tổng 3 hóa đơn còn nợ): inv-1a đã nhắc -> tạo mới 2 hóa đơn còn lại (queued=2, skipped=1); gọi lại lần 2 cùng ngày -> queued=0, skipped=3", async () => {
		sentMails.length = 0;

		const first = await postReminders(
			{
				studentIds: ["stu-1", "stu-2", "stu-clear", "stu-foreign"],
			},
			teacherToken,
		);
		expect(first.status).toBe(200);
		// inv-1a đã nhắc ở test trước (skipped=1), inv-1b và inv-2a mới được nhắc (queued=2);
		// inv-1-markpaid, stu-clear, stu-foreign không phải hóa đơn còn nợ của org nên tạo 0 event.
		expect(await first.json()).toEqual({ queued: 2, skipped: 1 });
		expect(sentMails).toHaveLength(2);

		// Gọi lại cùng ngày cho cả 2 học viên đang nợ -> cả 3 hóa đơn đều bị chặn trùng khóa
		sentMails.length = 0;
		const second = await postReminders(
			{ studentIds: ["stu-1", "stu-2"] },
			teacherToken,
		);
		expect(second.status).toBe(200);
		expect(await second.json()).toEqual({ queued: 0, skipped: 3 });
		expect(sentMails).toHaveLength(0);

		const allNotifs = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.orgId, orgId));
		expect(allNotifs).toHaveLength(3);
	});

	test("từ chối body không hợp lệ (rỗng, trùng studentIds, vượt 100 phần tử) với 400", async () => {
		const empty = await postReminders({ studentIds: [] }, teacherToken);
		expect(empty.status).toBe(400);

		const dup = await postReminders(
			{ studentIds: ["stu-1", "stu-1"] },
			teacherToken,
		);
		expect(dup.status).toBe(400);

		const tooMany = await postReminders(
			{
				studentIds: Array.from({ length: 101 }, (_, i) => `stu-${i}`),
			},
			teacherToken,
		);
		expect(tooMany.status).toBe(400);
	});

	test("chưa đăng nhập trả 401 và role không có quyền tài chính (ta) trả 403 finance-forbidden", async () => {
		const unauth = await postReminders({ studentIds: ["stu-1"] });
		expect(unauth.status).toBe(401);

		const forbidden = await postReminders({ studentIds: ["stu-1"] }, taToken);
		expect(forbidden.status).toBe(403);
		expect(await forbidden.json()).toEqual({ error: "finance-forbidden" });
	});
});
