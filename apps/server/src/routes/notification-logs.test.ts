import { createClient } from "@libsql/client";
import {
	type NotificationLogResponse,
	type NotificationResendResponse,
	notificationLogResponseSchema,
	notificationResendResponseSchema,
	studentInboxResponseSchema,
} from "@teacher-os/api/contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { type Context, Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type KernelCtx } from "../app";
import { kernelRoutes } from "./kernel";
import { notificationLogRoutes } from "./notification-logs";

const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

type TestEnv = { Variables: { kernelCtx: KernelCtx } };

let db: Db;

beforeAll(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	await raw
		.insert(schema.organization)
		.values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		])
		.run();
	await raw
		.insert(schema.student)
		.values([
			{
				id: "st-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "st-2",
				orgId: "org-1",
				name: "Hoa Nguyen",
				email: "hoa@gmail.com",
				phone: "0902234567",
			},
			{
				id: "st-x",
				orgId: "org-2",
				name: "Ky Phong",
				email: "phong@gmail.com",
				phone: "0903234567",
			},
		])
		.run();
	await raw
		.insert(schema.notificationRecord)
		.values([
			{
				id: "nt-1",
				orgId: "org-1",
				studentId: "st-1",
				eventType: "class_enrolled",
				eventGroup: "class_invite",
				idempotencyKey: "class_enrolled:st-1",
				title: "Mời vào lớp IELTS 6.5",
				body: "Bạn được mời vào lớp.",
				channels: "email,in_app",
				recipientEmail: "minh@gmail.com",
				senderName: "Cô Lan",
				replyToEmail: "lan@school.vn",
				status: "read",
				sentAt: new Date("2026-10-20T01:00:00Z"),
				readAt: new Date("2026-10-20T02:00:00Z"),
				createdAt: new Date("2026-10-20T01:00:00Z"),
			},
			{
				id: "nt-2",
				orgId: "org-1",
				studentId: "st-1",
				eventType: "grade_returned",
				eventGroup: "assignment",
				idempotencyKey: "grade:task-1",
				title: "Đã trả điểm Writing Task 1",
				body: "Band 6.5.",
				channels: "in_app",
				status: "sent",
				sentAt: new Date("2026-10-21T01:00:00Z"),
				createdAt: new Date("2026-10-21T01:00:00Z"),
			},
			{
				id: "nt-3",
				orgId: "org-1",
				studentId: "st-2",
				eventType: "invoice_issued",
				eventGroup: "tuition",
				idempotencyKey: "invoice:inv-1",
				title: "Hóa đơn học phí tháng 10 (100%)",
				body: "Vui lòng thanh toán.",
				channels: "email",
				recipientEmail: "hoa@gmail.com",
				status: "queued",
				createdAt: new Date("2026-10-22T01:00:00Z"),
			},
			{
				id: "nt-4",
				orgId: "org-1",
				studentId: "st-2",
				eventType: "schedule_changed",
				eventGroup: "schedule",
				idempotencyKey: "schedule:les-1",
				title: "Đổi lịch buổi học",
				body: "Buổi học dời sang T5.",
				channels: "in_app",
				status: "failed",
				retryCount: 2,
				lastError: "SMTP timeout",
				createdAt: new Date("2026-10-23T01:00:00Z"),
			},
			{
				id: "nt-x",
				orgId: "org-2",
				studentId: "st-x",
				eventType: "class_enrolled",
				eventGroup: "class_invite",
				idempotencyKey: "class_enrolled:st-x",
				title: "Mời vào lớp org-2",
				body: ".",
				channels: "in_app",
				status: "sent",
				createdAt: new Date("2026-10-21T01:00:00Z"),
			},
		])
		.run();
});

/** App thử nghiệm: middleware đặt kernelCtx theo header x-test-org — thay
 * vai trò middleware role gate của kernel.ts (không được sửa trong phase 5). */
function buildTestApp(orgId: string) {
	const app = new Hono<TestEnv>();
	app.use("*", async (c: Context<TestEnv>, next) => {
		c.set("kernelCtx", { orgId, userId: "t-1" });
		await next();
	});
	app.route("/", notificationLogRoutes({ getDb: () => db }));
	return app;
}

async function getLog(
	orgId = "org-1",
	query = "",
): Promise<{ status: number; body: NotificationLogResponse }> {
	const res = await buildTestApp(orgId).request(`/${query}`);
	return { status: res.status, body: await res.json() };
}

describe("GET /api/notification-logs (#454)", () => {
	test("chỉ thấy thông báo của org mình (org-scoped)", async () => {
		const { status, body } = await getLog();
		expect(status).toBe(200);
		expect(body.rows.map((r) => r.id)).toEqual([
			"nt-4",
			"nt-3",
			"nt-2",
			"nt-1",
		]);
	});

	test("org khác chỉ thấy dữ liệu của org đó", async () => {
		const { body } = await getLog("org-2");
		expect(body.rows.map((r) => r.id)).toEqual(["nt-x"]);
		expect(body.total).toBe(1);
	});

	test("lọc theo event group", async () => {
		const { body } = await getLog("org-1", "?event=tuition");
		expect(body.rows.map((r) => r.id)).toEqual(["nt-3"]);
	});

	test("lọc theo status", async () => {
		const { body } = await getLog("org-1", "?status=failed");
		expect(body.rows.map((r) => r.id)).toEqual(["nt-4"]);
		expect(body.rows[0]?.lastError).toBe("SMTP timeout");
	});

	test("q tìm trên tên học viên, email và tiêu đề, không phân biệt hoa thường", async () => {
		const byName = await getLog("org-1", "?q=minh");
		expect(byName.body.rows.map((r) => r.id)).toEqual(["nt-2", "nt-1"]);
		const byEmail = await getLog("org-1", "?q=HOA@gmail");
		expect(byEmail.body.rows.map((r) => r.id)).toEqual(["nt-3"]);
		const byTitle = await getLog("org-1", "?q=hóa đơn");
		expect(byTitle.body.rows.map((r) => r.id)).toEqual(["nt-3"]);
	});

	test("q chứa % _ không thành wildcard", async () => {
		const { body } = await getLog("org-1", "?q=100%25");
		// "100%" là nghĩa đen — chỉ khớp đúng tiêu đề chứa chuỗi đó, không
		// thành wildcard khớp mọi dòng.
		expect(body.rows.map((r) => r.id)).toEqual(["nt-3"]);
		const underscore = await getLog("org-1", "?q=m_nh");
		// "m_nh" nếu _ là wildcard sẽ khớp "Minh" — phải là 0 dòng.
		expect(underscore.body.rows).toEqual([]);
	});

	test("phân trang: trang 2 đúng thứ tự created_at desc, id desc", async () => {
		const page1 = await getLog("org-1", "?page=1");
		expect(page1.body.rows.map((r) => r.id)).toEqual([
			"nt-4",
			"nt-3",
			"nt-2",
			"nt-1",
		]);
		const page2 = await getLog("org-1", "?page=2");
		expect(page2.body.rows).toEqual([]);
		// Seed 25 dòng org-1 thêm để vượt 1 trang.
	});
});

describe("GET /api/notification-logs — phân trang 20 dòng/trang", () => {
	let seedDb: Db;
	let app: Hono<TestEnv>;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const raw = drizzle(client, { schema });
		await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
		seedDb = raw as unknown as Db;
		await raw
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy" })
			.run();
		await raw
			.insert(schema.student)
			.values({
				id: "st-1",
				orgId: "org-1",
				name: "Học viên",
				email: "",
				phone: "",
			})
			.run();
		await raw
			.insert(schema.notificationRecord)
			.values(
				Array.from({ length: 25 }, (_, i) => ({
					id: `n-${String(i).padStart(2, "0")}`,
					orgId: "org-1",
					studentId: "st-1",
					eventType: "class_enrolled",
					eventGroup: "class_invite",
					idempotencyKey: `k-${i}`,
					title: `Thông báo ${i}`,
					body: "",
					status: "queued" as const,
					createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
				})),
			)
			.run();
		const a = new Hono<TestEnv>();
		a.use("*", async (c: Context<TestEnv>, next) => {
			c.set("kernelCtx", { orgId: "org-1", userId: "t-1" });
			await next();
		});
		a.route("/", notificationLogRoutes({ getDb: () => seedDb }));
		app = a;
	});

	test("trang 1 có 20 dòng mới nhất, trang 2 có 5 dòng còn lại", async () => {
		const res1 = await app.request("/?page=1");
		const body1 = notificationLogResponseSchema.parse(await res1.json());
		expect(body1.rows).toHaveLength(20);
		expect(body1.total).toBe(25);
		expect(body1.pageSize).toBe(20);
		expect(body1.rows[0]?.id).toBe("n-24");
		const res2 = await app.request("/?page=2");
		const body2 = notificationLogResponseSchema.parse(await res2.json());
		expect(body2.rows).toHaveLength(5);
		expect(body2.rows[0]?.id).toBe("n-04");
	});

	test("counts đúng theo bộ lọc q + event và không áp status; gồm tổng 'all'", async () => {
		const res = await app.request("/?status=queued");
		const body = notificationLogResponseSchema.parse(await res.json());
		// Cả 25 dòng queued: counts.all = 25 dù status filter đã áp lên rows.
		expect(body.counts).toEqual({
			queued: 25,
			sent: 0,
			read: 0,
			failed: 0,
			all: 25,
		});

		const resQ = await app.request("/?q=thông báo 1");
		const bodyQ = notificationLogResponseSchema.parse(await resQ.json());
		// "thông báo 1" khớp n-10..n-19 và n-1 (tổng 11) — counts tính trên q.
		expect(bodyQ.counts.all).toBe(11);
		expect(bodyQ.counts.queued).toBe(11);
		expect(bodyQ.total).toBe(11);
	});

	test("query param lạ trả 400", async () => {
		const res = await app.request("/?event=khac");
		expect(res.status).toBe(400);
	});
});

describe("POST /api/notification-logs resend (#464)", () => {
	let resendDb: Db;
	let rawDb: LibSQLDatabase<typeof schema>;

	beforeEach(async () => {
		const client = createClient({ url: "file::memory:" });
		rawDb = drizzle(client, { schema });
		await migrate(rawDb, { migrationsFolder: MIGRATIONS_DIR });
		resendDb = rawDb as unknown as Db;

		await rawDb
			.insert(schema.organization)
			.values([
				{ id: "org-1", name: "Academy 1" },
				{ id: "org-2", name: "Academy 2" },
			])
			.run();
		await rawDb
			.insert(schema.student)
			.values([
				{
					id: "st-1",
					orgId: "org-1",
					name: "Minh Tran",
					email: "minh@gmail.com",
					phone: "0901234567",
				},
				{
					id: "st-2",
					orgId: "org-1",
					name: "Hoa Nguyen",
					email: "hoa@gmail.com",
					phone: "0902234567",
				},
				{
					id: "st-no-email",
					orgId: "org-1",
					name: "Nam Khong Email",
					email: "   ",
					phone: "0904234567",
				},
				{
					id: "st-x",
					orgId: "org-2",
					name: "Ky Phong",
					email: "phong@gmail.com",
					phone: "0903234567",
				},
			])
			.run();
		await rawDb
			.insert(schema.notificationRecord)
			.values([
				{
					id: "nt-failed-1",
					orgId: "org-1",
					studentId: "st-1",
					eventType: "class_enrolled",
					eventGroup: "class_invite",
					idempotencyKey: "class_enrolled:st-1",
					title: "Mời vào lớp IELTS 6.5",
					body: "Bạn được mời vào lớp.",
					linkPath: "/student",
					channels: "email,in_app",
					recipientEmail: "minh.cu@wrong.vn",
					senderName: "Cô Lan",
					replyToEmail: "lan@school.vn",
					status: "failed",
					retryCount: 3,
					lastError: "E-selfomy-alignment-010: mailbox unavailable",
					createdAt: new Date("2026-10-23T01:00:00Z"),
				},
				{
					id: "nt-sent-1",
					orgId: "org-1",
					studentId: "st-1",
					eventType: "grade_returned",
					eventGroup: "assignment",
					idempotencyKey: "grade:task-1",
					title: "Đã trả điểm Writing Task 1",
					body: "Band 6.5.",
					channels: "email,in_app",
					recipientEmail: "minh@gmail.com",
					status: "sent",
					sentAt: new Date("2026-10-21T01:00:00Z"),
					createdAt: new Date("2026-10-21T01:00:00Z"),
				},
				{
					id: "nt-failed-org2",
					orgId: "org-2",
					studentId: "st-x",
					eventType: "class_enrolled",
					eventGroup: "class_invite",
					idempotencyKey: "class_enrolled:st-x",
					title: "Mời vào lớp org-2",
					body: ".",
					channels: "email,in_app",
					recipientEmail: "phong@gmail.com",
					status: "failed",
					retryCount: 3,
					lastError: "E-selfomy-alignment-010: smtp error",
					createdAt: new Date("2026-10-21T01:00:00Z"),
				},
			])
			.run();
	});

	function buildResendApp(opts?: {
		orgId?: string;
		mailer?: Mailer;
		runInBackground?: (promise: Promise<unknown>) => void;
	}) {
		const app = new Hono<TestEnv>();
		app.use("*", async (c: Context<TestEnv>, next) => {
			c.set("kernelCtx", {
				orgId: opts?.orgId ?? "org-1",
				userId: "t-1",
				role: "owner",
			});
			await next();
		});
		app.route(
			"/",
			notificationLogRoutes({
				getDb: () => resendDb,
				mailer: opts?.mailer,
				runInBackground: opts?.runInBackground,
				studentOrigin: "https://student.example.com",
				notificationRetryDelaysMs: [0, 0],
			}),
		);
		return app;
	}

	test("resend 1 bản ghi failed → về queued (retry_count=0, last_error=null) rồi gửi lại 1 lần, không nhân bản bản ghi hay inbox học viên", async () => {
		const sentCalls: Parameters<Mailer["send"]>[0][] = [];
		const backgroundJobs: Promise<unknown>[] = [];
		const app = buildResendApp({
			mailer: {
				async send(input) {
					sentCalls.push(input);
				},
			},
			runInBackground: (promise) => {
				backgroundJobs.push(promise);
			},
		});

		const res = await app.request("/nt-failed-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const body = notificationResendResponseSchema.parse(await res.json());
		expect(body).toEqual({ requeued: 1, skipped: [], remaining: 0 });

		// Trước khi background job hoàn tất (hoặc ngay tại bước reset), retryCount=0, lastError=null
		await Promise.all(backgroundJobs);
		expect(sentCalls).toHaveLength(1);
		expect(sentCalls[0]?.to).toBe("minh@gmail.com");

		const rows = await rawDb
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.studentId, "st-1"));
		// Vẫn đúng 2 bản ghi ban đầu của st-1 (nt-failed-1 + nt-sent-1), không tạo thêm dòng
		expect(rows).toHaveLength(2);
		const updated = rows.find((r) => r.id === "nt-failed-1");
		expect(updated?.status).toBe("sent");
		expect(updated?.retryCount).toBe(0);
		expect(updated?.lastError).toBeNull();
		expect(updated?.recipientEmail).toBe("minh@gmail.com");

		// Inbox học viên st-1 vẫn chỉ có đúng 2 mục (1 class_enrolled + 1 grade_returned)
		const fullApp = buildApp({
			getDb: () => resendDb,
			corsOrigin: ["http://localhost:8003"],
			getSessionUser: async () => ({
				userId: "u-st-1",
				userName: "Minh Tran",
				email: "minh@gmail.com",
				emailVerified: true,
				role: "student" as const,
			}),
			authHandler: () => new Response("auth OK"),
		});
		const inboxRes = await fullApp.request("/api/student/inbox", {
			headers: { "x-student-org-id": "org-1" },
		});
		expect(inboxRes.status).toBe(200);
		const inbox = studentInboxResponseSchema.parse(await inboxRes.json());
		expect(
			inbox.items.filter((i) => i.eventType === "class_enrolled"),
		).toHaveLength(1);
	});

	test("email học viên đổi trước khi resend → mailer nhận địa chỉ mới, recipient_email cập nhật; bảo toàn read_at chuyển thẳng sang read", async () => {
		const readTime = new Date("2026-10-23T02:00:00Z");
		await rawDb
			.update(schema.student)
			.set({ email: "  minh.moi@school.edu.vn  " })
			.where(eq(schema.student.id, "st-1"))
			.run();
		await rawDb
			.update(schema.notificationRecord)
			.set({ readAt: readTime })
			.where(eq(schema.notificationRecord.id, "nt-failed-1"))
			.run();

		const sentCalls: Parameters<Mailer["send"]>[0][] = [];
		const app = buildResendApp({
			mailer: {
				async send(input) {
					sentCalls.push(input);
				},
			},
		});

		const res = await app.request("/nt-failed-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		expect(sentCalls).toHaveLength(1);
		expect(sentCalls[0]?.to).toBe("minh.moi@school.edu.vn");

		const [updated] = await rawDb
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "nt-failed-1"));
		expect(updated?.recipientEmail).toBe("minh.moi@school.edu.vn");
		expect(updated?.status).toBe("read");
		expect(updated?.readAt?.toISOString()).toBe(readTime.toISOString());
	});

	test("bản ghi sent → 409; id org khác hoặc không tồn tại → 404; resend 2 lần liên tiếp → lần 2 409, mailer chỉ gọi 1 lần", async () => {
		const sentCalls: Parameters<Mailer["send"]>[0][] = [];
		const app = buildResendApp({
			mailer: {
				async send(input) {
					sentCalls.push(input);
				},
			},
		});

		const resSent = await app.request("/nt-sent-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(resSent.status).toBe(409);
		expect(await resSent.json()).toEqual({ error: "not_failed" });

		const resOtherOrg = await app.request("/nt-failed-org2/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(resOtherOrg.status).toBe(404);

		const resMissing = await app.request("/khong-ton-tai/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(resMissing.status).toBe(404);

		const resFirst = await app.request("/nt-failed-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(resFirst.status).toBe(200);

		const resSecond = await app.request("/nt-failed-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(resSecond.status).toBe(409);
		expect(sentCalls).toHaveLength(1);
	});

	test("học viên email trống → skipped với reason no_email, giữ nguyên failed", async () => {
		await rawDb
			.insert(schema.notificationRecord)
			.values({
				id: "nt-no-email",
				orgId: "org-1",
				studentId: "st-no-email",
				eventType: "invoice_issued",
				eventGroup: "tuition",
				idempotencyKey: "invoice:no-email",
				title: "Hóa đơn học phí",
				body: ".",
				channels: "email,in_app",
				status: "failed",
				retryCount: 3,
				lastError: "E-selfomy-alignment-010: invalid recipient",
				createdAt: new Date("2026-10-24T01:00:00Z"),
			})
			.run();

		let calls = 0;
		const app = buildResendApp({
			mailer: {
				async send() {
					calls++;
				},
			},
		});

		const res = await app.request("/nt-no-email/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		const body: NotificationResendResponse =
			notificationResendResponseSchema.parse(await res.json());
		expect(body).toEqual({
			requeued: 0,
			skipped: [{ id: "nt-no-email", reason: "no_email" }],
			remaining: 0,
		});
		expect(calls).toBe(0);
	});

	test("resend-failed lọc theo event + q, giới hạn 50 bản ghi, tính đúng remaining và không bị nghẽn bởi học viên thiếu email", async () => {
		// Thêm 54 bản ghi failed hợp lệ thuộc nhóm tuition (tổng 54 tuition + 1 class_invite = 55 hợp lệ)
		// và 2 bản ghi failed mới nhất của học viên không có email
		await rawDb
			.insert(schema.notificationRecord)
			.values([
				...Array.from({ length: 54 }, (_, i) => ({
					id: `nt-bulk-${String(i).padStart(2, "0")}`,
					orgId: "org-1",
					studentId: "st-2",
					eventType: "tuition_reminder" as const,
					eventGroup: "tuition" as const,
					idempotencyKey: `bulk:${i}`,
					title: `Nhắc học phí đợt ${i}`,
					body: "Vui lòng đóng học phí.",
					channels: "email,in_app",
					recipientEmail: "hoa@gmail.com",
					status: "failed" as const,
					retryCount: 3,
					lastError: "E-selfomy-alignment-010: timeout",
					createdAt: new Date(Date.UTC(2026, 9, 24, 0, 0, i)),
				})),
				{
					id: "nt-skip-1",
					orgId: "org-1",
					studentId: "st-no-email",
					eventType: "tuition_reminder" as const,
					eventGroup: "tuition" as const,
					idempotencyKey: "skip:1",
					title: "Nhắc học phí thiếu email 1",
					body: ".",
					channels: "email,in_app",
					status: "failed" as const,
					retryCount: 3,
					lastError: "E-selfomy-alignment-010: no email",
					createdAt: new Date(Date.UTC(2026, 9, 25, 1, 0, 0)),
				},
				{
					id: "nt-skip-2",
					orgId: "org-1",
					studentId: "st-no-email",
					eventType: "tuition_reminder" as const,
					eventGroup: "tuition" as const,
					idempotencyKey: "skip:2",
					title: "Nhắc học phí thiếu email 2",
					body: ".",
					channels: "email,in_app",
					status: "failed" as const,
					retryCount: 3,
					lastError: "E-selfomy-alignment-010: no email",
					createdAt: new Date(Date.UTC(2026, 9, 25, 2, 0, 0)),
				},
			])
			.run();

		const app = buildResendApp({
			mailer: {
				async send() {},
			},
		});

		// Lọc chỉ event=tuition: có 54 bản ghi hợp lệ + 2 bản ghi no_email
		const res1 = await app.request("/resend-failed", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ event: "tuition" }),
		});
		expect(res1.status).toBe(200);
		const body1 = notificationResendResponseSchema.parse(await res1.json());
		expect(body1.requeued).toBe(50);
		expect(body1.skipped).toHaveLength(2);
		expect(body1.remaining).toBe(4);

		// nt-failed-1 (eventGroup = class_invite) không bị đụng tới
		const [classInviteRow] = await rawDb
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "nt-failed-1"));
		expect(classInviteRow?.status).toBe("failed");

		// Lần bấm thứ 2 cho event=tuition: giải quyết nốt 4 bản ghi còn lại
		const res2 = await app.request("/resend-failed", {
			method: "POST",
			headers: { "content-type": "application/json" },
		});
		expect(res2.status).toBe(200);
		const body2 = notificationResendResponseSchema.parse(await res2.json());
		// Không truyền filter → lấy cả 4 tuition còn lại + 1 class_invite = 5
		expect(body2.requeued).toBe(5);
		expect(body2.remaining).toBe(0);
	});

	test("gửi lại vẫn lỗi → thử đủ 3 lượt rồi quay lại failed kèm E-selfomy-alignment-010", async () => {
		let attempts = 0;
		const app = buildResendApp({
			mailer: {
				async send() {
					attempts++;
					throw new Error("mailbox still full");
				},
			},
		});

		const res = await app.request("/nt-failed-1/resend", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{}",
		});
		expect(res.status).toBe(200);
		expect(attempts).toBe(3);

		const [row] = await rawDb
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "nt-failed-1"));
		expect(row?.status).toBe("failed");
		expect(row?.retryCount).toBe(3);
		expect(row?.lastError).toBe("E-selfomy-alignment-010: mailbox still full");
	});

	test("request qua kernelRoutes thiếu Origin hợp lệ → 403; thiếu Content-Type application/json → 415", async () => {
		const kApp = new Hono<TestEnv>();
		kApp.use("*", async (c, next) => {
			c.set("kernelCtx", { orgId: "org-1", userId: "t-1", role: "owner" });
			await next();
		});
		kApp.route(
			"/api",
			kernelRoutes({
				getDb: () => resendDb,
				corsOrigins: ["http://localhost:5173"],
			}),
		);

		const noOriginRes = await kApp.request(
			"/api/notification-logs/nt-failed-1/resend",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: "{}",
			},
		);
		expect(noOriginRes.status).toBe(403);

		const noContentTypeRes = await kApp.request(
			"/api/notification-logs/nt-failed-1/resend",
			{
				method: "POST",
				headers: { Origin: "http://localhost:5173" },
			},
		);
		expect(noContentTypeRes.status).toBe(415);
	});
});
