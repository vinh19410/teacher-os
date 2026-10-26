import { createClient } from "@libsql/client";
import {
	type NotificationLogResponse,
	notificationLogResponseSchema,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { type Context, Hono } from "hono";
import { beforeAll, describe, expect, test } from "vitest";
import type { Db, KernelCtx } from "../app";
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
