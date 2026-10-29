import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const ORIGIN = "http://localhost:8003";
const CORS_ORIGINS = [ORIGIN];
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function sessionFor(email: string, name: string) {
	return {
		userId: `u-${email}`,
		userName: name,
		email,
		emailVerified: true,
		role: "student" as const,
	};
}

describe("student inbox (/api/student/inbox)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);

		await libsql.insert(schema.student).values([
			{
				id: "student-hoa",
				orgId: "org-1",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
				phone: "0900000001",
			},
			{
				id: "student-quan",
				orgId: "org-1",
				name: "Trần Văn Quân",
				email: "quan@test.local",
				phone: "0900000002",
			},
			// Cùng email với Hoa nhưng org khác — test cross-org qua header.
			{
				id: "student-hoa-o2",
				orgId: "org-2",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
				phone: "0900000003",
			},
		]);

		const t0 = Date.now() - 10_000;
		await libsql.insert(schema.notificationRecord).values([
			{
				id: "n-invite",
				orgId: "org-1",
				studentId: "student-hoa",
				eventType: "class_enrolled",
				eventGroup: "class_invite",
				idempotencyKey: "k1",
				title: "Bạn được thêm vào lớp IELTS",
				body: "Giáo viên đã thêm bạn vào lớp.",
				linkPath: "/classes/class-1",
				channels: "in_app",
				status: "sent",
				sentAt: new Date(t0),
				createdAt: new Date(t0),
			},
			{
				// Bản ghi của Quân — Hoa KHÔNG được thấy.
				id: "n-quan",
				orgId: "org-1",
				studentId: "student-quan",
				eventType: "assignment_published",
				eventGroup: "assignment",
				idempotencyKey: "k2",
				title: "Bài tập mới",
				body: "Bạn có bài tập mới.",
				linkPath: "/assignments/a-1",
				channels: "in_app",
				createdAt: new Date(t0 + 1000),
			},
			{
				// Bản ghi org-2 — Hoa (org-1) KHÔNG được thấy.
				id: "n-o2",
				orgId: "org-2",
				studentId: "student-hoa-o2",
				eventType: "invoice_issued",
				eventGroup: "tuition",
				idempotencyKey: "k3",
				title: "Hóa đơn mới",
				body: "Hóa đơn tháng 10.",
				linkPath: "/invoices/inv-1",
				channels: "in_app",
				createdAt: new Date(t0 + 2000),
			},
			{
				// Bản ghi queued của Hoa — mark read: read_at có, status giữ queued.
				id: "n-queued",
				orgId: "org-1",
				studentId: "student-hoa",
				eventType: "grade_returned",
				eventGroup: "assignment",
				idempotencyKey: "k4",
				title: "Đã trả điểm",
				body: "Bài kiểm tra đã được chấm.",
				linkPath: "/attempts/at-1",
				channels: "email,in_app",
				recipientEmail: "hoa@test.local",
				senderName: "Academy 1",
				replyToEmail: "teacher@academy1.vn",
				status: "queued",
				createdAt: new Date(t0 + 3000),
			},
			{
				// Bản ghi sent của Hoa — mark read → status read.
				id: "n-sent",
				orgId: "org-1",
				studentId: "student-hoa",
				eventType: "schedule_changed",
				eventGroup: "schedule",
				idempotencyKey: "k5",
				title: "Lịch học thay đổi",
				body: "Buổi T4 dời sang T5.",
				linkPath: "/schedule",
				channels: "email,in_app",
				recipientEmail: "hoa@test.local",
				status: "sent",
				sentAt: new Date(t0 + 4000),
				createdAt: new Date(t0 + 4000),
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const key = headers.get("x-test-user");
				if (key === "hoa") return sessionFor("hoa@test.local", "Hoa");
				if (key === "quan") return sessionFor("quan@test.local", "Quân");
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function get(
		path: string,
		user: string,
		orgId = "org-1",
	): Promise<Response> {
		return await app.request(path, {
			method: "GET",
			headers: { "x-test-user": user, "x-student-org-id": orgId },
		});
	}

	async function postRead(
		id: string,
		user: string,
		orgId = "org-1",
		extraHeaders: Record<string, string> = {},
	): Promise<Response> {
		return await app.request(`/api/student/inbox/${id}/read`, {
			method: "POST",
			headers: {
				"x-test-user": user,
				"x-student-org-id": orgId,
				Origin: ORIGIN,
				"Content-Type": "application/json",
				...extraHeaders,
			},
		});
	}

	test("GET /inbox: chỉ thấy bản ghi của mình trong org, mới nhất trước, không lộ email/last_error", async () => {
		const res = await get("/api/student/inbox", "hoa");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			items: Array<Record<string, unknown>>;
			unread: number;
		};
		// Không thấy n-quan (học viên khác) hay n-o2 (org khác).
		expect(body.items.map((i) => i.id)).toEqual([
			"n-sent",
			"n-queued",
			"n-invite",
		]);
		expect(body.unread).toBe(3);
		const firstItem = body.items[0] as Record<string, unknown>;
		const keys = Object.keys(firstItem).sort();
		expect(keys).toEqual([
			"body",
			"createdAt",
			"eventType",
			"id",
			"linkPath",
			"readAt",
			"status",
			"title",
		]);
	});

	test("GET /inbox cùng email nhưng org khác → chỉ thấy bản ghi org đó", async () => {
		const res = await get("/api/student/inbox", "hoa", "org-2");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { items: Array<{ id: string }> };
		expect(body.items.map((i) => i.id)).toEqual(["n-o2"]);
	});

	test("POST read: bản ghi của học viên khác → 404", async () => {
		const res = await postRead("n-quan", "hoa");
		expect(res.status).toBe(404);
	});

	test("POST read: bản ghi org khác (org-2) nhưng đang đứng ở org-1 → 404", async () => {
		const res = await postRead("n-o2", "hoa", "org-1");
		expect(res.status).toBe(404);
	});

	test("POST read bản ghi queued: đặt read_at, status giữ queued", async () => {
		const res = await postRead("n-queued", "hoa");
		expect(res.status).toBe(200);
		const [row] = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "n-queued"));
		expect(row?.readAt).not.toBeNull();
		expect(row?.status).toBe("queued");
	});

	test("POST read bản ghi sent: đặt read_at và status → read", async () => {
		const res = await postRead("n-sent", "hoa");
		expect(res.status).toBe(200);
		const [row] = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "n-sent"));
		expect(row?.readAt).not.toBeNull();
		expect(row?.status).toBe("read");
	});

	test("POST read idempotent: gọi lại không lỗi, giữ nguyên read_at/status", async () => {
		const before = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "n-sent"));
		const res = await postRead("n-sent", "hoa");
		expect(res.status).toBe(200);
		const [after] = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "n-sent"));
		expect(after?.readAt?.getTime()).toBe(before[0]?.readAt?.getTime());
		expect(after?.status).toBe("read");
	});

	test("POST read: bản ghi không tồn tại → 404", async () => {
		const res = await postRead("n-nope", "hoa");
		expect(res.status).toBe(404);
	});

	test("POST read chặn CSRF: Origin lạ → 403", async () => {
		const res = await postRead("n-invite", "hoa", "org-1", {
			Origin: "https://evil.example",
		});
		expect(res.status).toBe(403);
	});

	test("GET /inbox sau khi đọc: unread giảm", async () => {
		const res = await get("/api/student/inbox", "hoa");
		const body = (await res.json()) as { unread: number };
		expect(body.unread).toBe(1);
	});

	test("bản ghi failed vẫn hiển thị trong inbox học viên; POST read đặt read_at nhưng giữ nguyên status = failed (TOS-22 D5)", async () => {
		await libsql.insert(schema.notificationRecord).values({
			id: "n-quan-failed",
			orgId: "org-1",
			studentId: "student-quan",
			eventType: "tuition_reminder",
			eventGroup: "tuition",
			idempotencyKey: "k-quan-failed",
			title: "Nhắc học phí",
			body: "Hóa đơn đến hạn thanh toán.",
			linkPath: "/tuition",
			channels: "email,in_app",
			recipientEmail: "quan@bounce.test",
			status: "failed",
			retryCount: 3,
			lastError: "E-selfomy-alignment-010: mailbox unavailable",
			createdAt: new Date(),
		});

		const listRes = await get("/api/student/inbox", "quan");
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as {
			items: Array<{ id: string; status: string; readAt: string | null }>;
		};
		const failedItem = listBody.items.find((i) => i.id === "n-quan-failed");
		expect(failedItem).toBeDefined();
		expect(failedItem?.status).toBe("failed");

		const readRes = await postRead("n-quan-failed", "quan");
		expect(readRes.status).toBe(200);

		const [row] = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, "n-quan-failed"));
		expect(row?.readAt).not.toBeNull();
		expect(row?.status).toBe("failed");
	});
});
