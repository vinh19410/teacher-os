import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const TEACHER = {
	"x-test-user": "teacher-1",
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};
const TEACHER_ORG2 = {
	"x-test-user": "teacher-2",
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};

const sessionFor = async (headers: Headers) => {
	const key = headers.get("x-test-user");
	if (key === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
	}
	if (key === "teacher-2") {
		return { userId: "t-2", userName: "Cô Hoa", role: "teacher" as const };
	}
	if (key === "ta-1") {
		return { userId: "ta-1", userName: "Trợ giảng", role: "teacher" as const };
	}
	if (key === "ct-1") {
		return {
			userId: "ct-1",
			userName: "GV đứng lớp",
			role: "teacher" as const,
		};
	}
	if (key === "owner-1") {
		return { userId: "ow-1", userName: "Chủ TT", role: "teacher" as const };
	}
	if (key === "admin-1") {
		return { userId: "ad-1", userName: "Quản trị", role: "teacher" as const };
	}
	return null;
};

let db: Db;

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	await db.insert(schema.organization).values([
		{ id: "org-1", name: "Cô Mỹ" },
		{ id: "org-2", name: "Trung tâm khác" },
	]);
	await db.insert(schema.user).values([
		{ id: "t-1", name: "Cô Lan", email: "lan@test.local", role: "teacher" },
		{ id: "t-2", name: "Cô Hoa", email: "hoa@test.local", role: "teacher" },
		{ id: "ta-1", name: "Trợ giảng", email: "ta@test.local", role: "teacher" },
		{
			id: "ct-1",
			name: "GV đứng lớp",
			email: "ct@test.local",
			role: "teacher",
		},
		{ id: "ow-1", name: "Chủ TT", email: "owner@test.local", role: "teacher" },
		{
			id: "ad-1",
			name: "Quản trị",
			email: "admin@test.local",
			role: "teacher",
		},
	]);
	await db.insert(schema.membership).values([
		{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
		{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
		{ id: "mem-ct", orgId: "org-1", userId: "ct-1", role: "class_teacher" },
		{ id: "mem-ow", orgId: "org-1", userId: "ow-1", role: "owner" },
		{ id: "mem-ad", orgId: "org-1", userId: "ad-1", role: "admin" },
	]);
	await db.insert(schema.lead).values([
		{
			id: "lead-1",
			orgId: "org-1",
			name: "Nguyễn Thu Hà",
			phone: "0909123456",
			email: "ha@example.com",
			course: "ielts-foundation",
			studyDays: "mt",
			timeSlot: "0900",
			status: "new",
			ipHash: "a".repeat(64),
			createdAt: new Date("2026-10-29T02:00:00Z"),
			updatedAt: new Date("2026-10-29T02:00:00Z"),
		},
		{
			id: "lead-2",
			orgId: "org-1",
			name: "Trần Văn Bình",
			phone: "0911222333",
			status: "contacted",
			teacherNote: "Đã nhắn Zalo",
			ipHash: "b".repeat(64),
			createdAt: new Date("2026-10-29T03:00:00Z"),
			updatedAt: new Date("2026-10-29T03:00:00Z"),
			statusChangedAt: new Date("2026-10-29T03:30:00Z"),
		},
		{
			id: "lead-3",
			orgId: "org-2",
			name: "Lead Trung Tâm Khác",
			phone: "0933444555",
			ipHash: "c".repeat(64),
			createdAt: new Date("2026-10-29T04:00:00Z"),
			updatedAt: new Date("2026-10-29T04:00:00Z"),
		},
	]);
});

function app(): ServerApp {
	return buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: sessionFor,
		authHandler: async () => new Response(null, { status: 404 }),
	});
}

describe("GET /api/leads (#506 phase 3)", () => {
	test("list org-scoped, mới nhất trước, không lộ ipHash", async () => {
		const res = await app().request("/api/leads", { headers: TEACHER });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			rows: Array<{ id: string; ipHash?: string; createdAt: string }>;
			total: number;
			pageSize: number;
			counts: Record<string, number>;
		};
		expect(body.rows.map((row) => row.id)).toEqual(["lead-2", "lead-1"]);
		expect(body.total).toBe(2);
		expect(body.pageSize).toBe(20);
		expect(body.counts).toEqual({
			new: 1,
			contacted: 1,
			enrolled: 0,
			dropped: 0,
			all: 2,
		});
		for (const row of body.rows) {
			expect(row.ipHash).toBeUndefined();
			expect(new Date(row.createdAt).toISOString()).toBe(row.createdAt);
		}
	});

	test("chỉ thấy lead org mình (org-2 không thấy lead-3 qua các cửa)", async () => {
		const res = await app().request("/api/leads", { headers: TEACHER_ORG2 });
		const body = (await res.json()) as {
			rows: Array<{ id: string }>;
			total: number;
		};
		expect(body.rows.map((row) => row.id)).toEqual(["lead-3"]);
	});

	test("filter status + q, counts vẫn tính trên q không áp status", async () => {
		const instance = app();
		const byStatus = await instance.request("/api/leads?status=new", {
			headers: TEACHER,
		});
		const statusBody = (await byStatus.json()) as {
			rows: Array<{ id: string }>;
			counts: Record<string, number>;
		};
		expect(statusBody.rows.map((row) => row.id)).toEqual(["lead-1"]);
		// counts theo q (rỗng) — đủ 2 trạng thái, không thu về status filter.
		expect(statusBody.counts.all).toBe(2);

		const byQ = await instance.request("/api/leads?q=thu", {
			headers: TEACHER,
		});
		const qBody = (await byQ.json()) as { rows: Array<{ id: string }> };
		expect(qBody.rows.map((row) => row.id)).toEqual(["lead-1"]);

		const byPhone = await instance.request("/api/leads?q=0911", {
			headers: TEACHER,
		});
		const phoneBody = (await byPhone.json()) as { rows: Array<{ id: string }> };
		expect(phoneBody.rows.map((row) => row.id)).toEqual(["lead-2"]);

		// q khớp cả 2 dòng — counts.all = 2 dù status=new lọc rows về 1.
		const combined = await instance.request("/api/leads?q=0909&status=new", {
			headers: TEACHER,
		});
		const combinedBody = (await combined.json()) as {
			rows: Array<{ id: string }>;
			total: number;
			counts: Record<string, number>;
		};
		expect(combinedBody.rows.map((row) => row.id)).toEqual(["lead-1"]);
	});

	test("phân trang page size 20", async () => {
		await db.insert(schema.lead).values(
			Array.from({ length: 25 }, (_, i) => ({
				id: `bulk-${i}`,
				orgId: "org-1",
				name: `Học viên ${i}`,
				phone: `09000000${String(i).padStart(2, "0")}`,
				createdAt: new Date(Date.now() - i * 60_000),
				updatedAt: new Date(Date.now() - i * 60_000),
			})),
		);
		const page1 = await app().request("/api/leads?page=1", {
			headers: TEACHER,
		});
		const body1 = (await page1.json()) as {
			rows: unknown[];
			total: number;
			page: number;
		};
		expect(body1.rows).toHaveLength(20);
		expect(body1.total).toBe(27);

		const page2 = await app().request("/api/leads?page=2", {
			headers: TEACHER,
		});
		const body2 = (await page2.json()) as { rows: unknown[] };
		expect(body2.rows).toHaveLength(7);
	});

	test("401 khi không có session", async () => {
		const res = await app().request("/api/leads", {
			headers: { origin: CORS_ORIGIN },
		});
		expect(res.status).toBe(401);
	});

	test("query lạ ⇒ 400", async () => {
		const res = await app().request("/api/leads?status=archived", {
			headers: TEACHER,
		});
		expect(res.status).toBe(400);
	});

	test("role gate canAccessFinance (#524): ta và class_teacher bị 403 leads-forbidden; owner và admin được 200", async () => {
		const instance = app();
		for (const userHeader of ["ta-1", "ct-1"]) {
			const res = await instance.request("/api/leads", {
				headers: { ...TEACHER, "x-test-user": userHeader },
			});
			expect(res.status, userHeader).toBe(403);
			const body = (await res.json()) as { error?: string; code?: string };
			expect(body.code).toBe("leads-forbidden");
		}
		for (const userHeader of ["owner-1", "admin-1"]) {
			const res = await instance.request("/api/leads", {
				headers: { ...TEACHER, "x-test-user": userHeader },
			});
			expect(res.status, userHeader).toBe(200);
		}
	});
});

describe("PATCH /api/leads/:id (#506 phase 3)", () => {
	test("đổi status set statusChangedAt, teacherNote lưu, trả LeadRow", async () => {
		const res = await app().request("/api/leads/lead-1", {
			method: "PATCH",
			headers: TEACHER,
			body: JSON.stringify({
				status: "contacted",
				teacherNote: "Nhắn Zalo chiều nay",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			id: string;
			status: string;
			statusChangedAt: string | null;
			teacherNote: string;
			ipHash?: string;
		};
		expect(body.status).toBe("contacted");
		expect(body.teacherNote).toBe("Nhắn Zalo chiều nay");
		expect(body.statusChangedAt).not.toBeNull();
		expect(body.ipHash).toBeUndefined();
	});

	test("PATCH giữ nguyên status không đổi statusChangedAt cũ", async () => {
		const res = await app().request("/api/leads/lead-2", {
			method: "PATCH",
			headers: TEACHER,
			body: JSON.stringify({ status: "contacted" }),
		});
		const body = (await res.json()) as { statusChangedAt: string | null };
		expect(body.statusChangedAt).toBe("2026-10-29T03:30:00.000Z");
	});

	test("lead org khác ⇒ 404 LEAD_NOT_FOUND", async () => {
		const res = await app().request("/api/leads/lead-3", {
			method: "PATCH",
			headers: TEACHER,
			body: JSON.stringify({ status: "enrolled" }),
		});
		expect(res.status).toBe(404);
		const body = (await res.json()) as { code: string };
		expect(body.code).toBe("LEAD_NOT_FOUND");
	});

	test("body lạ ⇒ 400; không session ⇒ 401", async () => {
		const instance = app();
		const bad = await instance.request("/api/leads/lead-1", {
			method: "PATCH",
			headers: TEACHER,
			body: JSON.stringify({ status: "closed" }),
		});
		expect(bad.status).toBe(400);

		const unauthorized = await instance.request("/api/leads/lead-1", {
			method: "PATCH",
			headers: { origin: CORS_ORIGIN, "content-type": "application/json" },
			body: JSON.stringify({ status: "new" }),
		});
		expect(unauthorized.status).toBe(401);
	});

	test("JSON hỏng trả 400 invalid body thay vì 500 (#524)", async () => {
		const res = await app().request("/api/leads/lead-1", {
			method: "PATCH",
			headers: TEACHER,
			body: "{bad-json",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe("invalid body");
	});

	test("role gate canAccessFinance trên PATCH (#524): ta và class_teacher bị 403 leads-forbidden; owner và admin được 200", async () => {
		const instance = app();
		for (const userHeader of ["ta-1", "ct-1"]) {
			const res = await instance.request("/api/leads/lead-1", {
				method: "PATCH",
				headers: { ...TEACHER, "x-test-user": userHeader },
				body: JSON.stringify({ status: "contacted" }),
			});
			expect(res.status, userHeader).toBe(403);
			const body = (await res.json()) as { code?: string };
			expect(body.code).toBe("leads-forbidden");
		}
		for (const userHeader of ["owner-1", "admin-1"]) {
			const res = await instance.request("/api/leads/lead-1", {
				method: "PATCH",
				headers: { ...TEACHER, "x-test-user": userHeader },
				body: JSON.stringify({ status: "contacted" }),
			});
			expect(res.status, userHeader).toBe(200);
		}
	});
});
