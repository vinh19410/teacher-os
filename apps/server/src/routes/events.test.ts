import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";

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
const NO_AUTH = {
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};

/** 2026-10-26 là Thứ Hai (weekday = 1). */
const MONDAY_ISO = "2026-10-26";

const VALID_BODY = {
	title: "Họp chuyên môn giáo viên",
	date: MONDAY_ISO,
	startTime: "19:00",
	endTime: "21:00",
};

const sessionFor = async (headers: Headers) => {
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
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
		{ id: "org-1", name: "Academy 1" },
		{ id: "org-2", name: "Academy 2" },
	]);
	await db.insert(schema.user).values({
		id: "t-1",
		name: "Cô Lan",
		email: "lan@test.local",
		role: "teacher",
	});
	await db.insert(schema.membership).values({
		id: "mem-1",
		orgId: "org-1",
		userId: "t-1",
		role: "teacher",
	});
});

function createApp(customDb: Db = db) {
	return buildApp({
		getDb: () => customDb,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: sessionFor,
		authHandler: async () => new Response(null, { status: 404 }),
	});
}

async function seedLessonOfDay(orgId: string, classId: string, date: string) {
	await db.insert(schema.classTable).values({
		id: classId,
		orgId,
		name: "Lớp A",
		schedule: "T2 19:00",
	});
	await db.insert(schema.student).values({
		id: `s-${classId}`,
		orgId,
		name: "An Nguyễn",
	});
	await db.insert(schema.enrollment).values({
		id: `e-${classId}`,
		orgId,
		classId,
		studentId: `s-${classId}`,
		status: "active",
	});
	await db.insert(schema.lesson).values({
		id: `l-${classId}`,
		orgId,
		classId,
		enrollmentId: `e-${classId}`,
		day: 1,
		time: "19:00",
		dur: 90,
		date,
	});
}

describe("POST /api/events", () => {
	test("tạo sự kiện và trả full KernelEventRow", async () => {
		const app = createApp();
		const res = await app.request("/api/events", {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify(VALID_BODY),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toEqual(expect.any(String));
		expect(body.title).toBe("Họp chuyên môn giáo viên");
		expect(body.date).toBe(MONDAY_ISO);
		expect(body.startTime).toBe("19:00");
		expect(body.endTime).toBe("21:00");
		expect(body.note).toBe("");
		expect(body.createdByUserId).toBe("t-1");
		expect(body.createdAt).toEqual(expect.any(String));

		const rows = await db.select().from(schema.orgEvent);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.orgId).toBe("org-1");
	});

	test("snapshot /api/kernel có events ngay sau lessons chứa sự kiện vừa tạo", async () => {
		const app = createApp();
		const createRes = await app.request("/api/events", {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify(VALID_BODY),
		});
		const created = (await createRes.json()) as { id: string };

		const snapRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher-1", origin: CORS_ORIGIN },
		});
		expect(snapRes.status).toBe(200);
		const snap = (await snapRes.json()) as {
			events?: Array<{ id: string }>;
		};
		expect(snap.events).toBeDefined();
		expect(snap.events?.map((e) => e.id)).toContain(created.id);
	});

	test("note tùy chọn được lưu; dữ liệu nhões → 400", async () => {
		const app = createApp();
		for (const bad of [
			{ ...VALID_BODY, title: "a" }, // title 1 ký tự
			{ ...VALID_BODY, title: "x".repeat(101) }, // title 101 ký tự
			{ ...VALID_BODY, endTime: "19:00" }, // endTime == startTime
			{ ...VALID_BODY, endTime: "18:00" }, // endTime < startTime
			{ ...VALID_BODY, date: "2026-02-30" }, // ngày không có trên lịch
			{ ...VALID_BODY, startTime: "24:00" },
			{ ...VALID_BODY, note: "x".repeat(501) },
			{ title: "Thiếu giờ" },
		]) {
			const res = await app.request("/api/events", {
				method: "POST",
				headers: TEACHER,
				body: JSON.stringify(bad),
			});
			expect(res.status, JSON.stringify(bad)).toBe(400);
		}
		const rows = await db.select().from(schema.orgEvent);
		expect(rows).toHaveLength(0);
	});

	test("401 khi chưa đăng nhập; invalid json → 400", async () => {
		const app = createApp();
		const noAuth = await app.request("/api/events", {
			method: "POST",
			headers: NO_AUTH,
			body: JSON.stringify(VALID_BODY),
		});
		expect(noAuth.status).toBe(401);

		const badJson = await app.request("/api/events", {
			method: "POST",
			headers: TEACHER,
			body: "{not json",
		});
		expect(badJson.status).toBe(400);
	});

	test("sự kiện KHÔNG làm đổi dòng lesson, /attendance/daily hay dashboard reminders cùng ngày", async () => {
		await seedLessonOfDay("org-1", "cls-1", MONDAY_ISO);
		const app = createApp();
		const authHeaders = {
			"x-test-user": "teacher-1",
			origin: CORS_ORIGIN,
		};

		const lessonsBefore = (
			(await (
				await app.request("/api/kernel", { headers: authHeaders })
			).json()) as { lessons: unknown[] }
		).lessons;
		const dailyBefore = await (
			await app.request(`/api/attendance/daily?date=${MONDAY_ISO}`, {
				headers: authHeaders,
			})
		).json();
		const remindersBefore = await (
			await app.request("/api/dashboard/reminders", { headers: authHeaders })
		).json();

		const res = await app.request("/api/events", {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify(VALID_BODY),
		});
		expect(res.status).toBe(201);

		const snap = (await (
			await app.request("/api/kernel", { headers: authHeaders })
		).json()) as { lessons: unknown[] };
		expect(snap.lessons).toEqual(lessonsBefore);

		const dailyAfter = await (
			await app.request(`/api/attendance/daily?date=${MONDAY_ISO}`, {
				headers: authHeaders,
			})
		).json();
		expect(dailyAfter).toEqual(dailyBefore);

		const remindersAfter = await (
			await app.request("/api/dashboard/reminders", { headers: authHeaders })
		).json();
		expect(remindersAfter).toEqual(remindersBefore);
	});
});

describe("DELETE /api/events/:id", () => {
	test("xoá sự kiện của org hiện tại", async () => {
		const app = createApp();
		const res = await app.request("/api/events", {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify(VALID_BODY),
		});
		const created = (await res.json()) as { id: string };

		const del = await app.request(`/api/events/${created.id}`, {
			method: "DELETE",
			headers: TEACHER,
		});
		expect(del.status).toBe(200);

		const rows = await db.select().from(schema.orgEvent);
		expect(rows).toHaveLength(0);
	});

	test("id của org khác → 404, không xoá chéo tenant", async () => {
		await db.insert(schema.orgEvent).values({
			id: "ev-other",
			orgId: "org-2",
			title: "Sự kiện org khác",
			date: MONDAY_ISO,
			startTime: "08:00",
			endTime: "09:00",
			note: "",
			createdByUserId: "someone",
		});

		const app = createApp();
		const del = await app.request("/api/events/ev-other", {
			method: "DELETE",
			headers: TEACHER,
		});
		expect(del.status).toBe(404);

		const rows = await db.select().from(schema.orgEvent);
		expect(rows).toHaveLength(1);
	});

	test("401 khi chưa đăng nhập; id không tồn tại → 404", async () => {
		const app = createApp();
		const noAuth = await app.request("/api/events/ev-x", {
			method: "DELETE",
			headers: NO_AUTH,
		});
		expect(noAuth.status).toBe(401);

		const missing = await app.request("/api/events/ev-x", {
			method: "DELETE",
			headers: TEACHER,
		});
		expect(missing.status).toBe(404);
	});
});
