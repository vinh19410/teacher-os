import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";
import { classmateInitials } from "./student-classmates";

const CORS_ORIGINS = ["http://localhost:8003"];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

/** Session test: `x-test-user: hoa` → học viên Hoa (org-1, lớp class-1). */
function sessionFor(email: string, name: string) {
	return {
		userId: `u-${email}`,
		userName: name,
		email,
		emailVerified: true,
		role: "student" as const,
	};
}

describe("student classmates roster (/api/student/classes/:classId/classmates)", () => {
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
			// Học viên cùng org nhưng KHÔNG thuộc class-1 (đang học class-2).
			{
				id: "student-lan",
				orgId: "org-1",
				name: "Lê Thị Lạn",
				email: "lan@test.local",
				phone: "0900000003",
			},
			// Học viên org-2 cùng email với Hoa — test cross-org qua header.
			{
				id: "student-hoa-o2",
				orgId: "org-2",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
				phone: "0900000004",
			},
		]);

		await libsql.insert(schema.classTable).values([
			{
				id: "class-1",
				orgId: "org-1",
				name: "IELTS Foundation",
				level: "IELTS 5.0–6.0",
				mode: "Online",
				schedule: "T2 & T5 18:30–20:00",
				sessionsDone: 2,
				sessionsTotal: 20,
				status: "active",
			},
			{
				id: "class-2",
				orgId: "org-1",
				name: "IELTS Advanced",
				level: "IELTS 6.5–7.5",
				mode: "Offline",
				schedule: "T3 & T6 18:30–20:00",
				sessionsDone: 0,
				sessionsTotal: 20,
				status: "active",
			},
			{
				id: "class-o2",
				orgId: "org-2",
				name: "TOEIC org-2",
				level: "TOEIC 600–700",
				mode: "Online",
				schedule: "T4 18:30–20:00",
				sessionsDone: 0,
				sessionsTotal: 10,
				status: "active",
			},
		]);

		await libsql.insert(schema.enrollment).values([
			// Hoa + Quân active trong class-1.
			{
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-hoa",
				status: "active",
			},
			{
				id: "enr-2",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-quan",
				status: "active",
			},
			// Lạn: invited trong class-1 (chưa kích hoạt) — KHÔNG được thấy roster.
			{
				id: "enr-3",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-lan",
				status: "invited",
			},
			// Lạn active trong class-2.
			{
				id: "enr-4",
				orgId: "org-1",
				classId: "class-2",
				studentId: "student-lan",
				status: "active",
			},
			// Hoa active trong org-2 class.
			{
				id: "enr-5",
				orgId: "org-2",
				classId: "class-o2",
				studentId: "student-hoa-o2",
				status: "active",
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const key = headers.get("x-test-user");
				if (key === "hoa")
					return sessionFor("hoa@test.local", "Nguyễn Thị Hoa");
				if (key === "lan") return sessionFor("lan@test.local", "Lê Thị Lạn");
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function get(path: string, user: string): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: { "x-test-user": user, "x-student-org-id": "org-1" },
		});
	}

	test("trả roster chỉ gồm id/name/initials/isMe, đánh dấu chính mình", async () => {
		const res = await get("/api/student/classes/class-1/classmates", "hoa");
		expect(res.status).toBe(200);
		const body = (await res.json()) as Array<Record<string, unknown>>;
		// Lạn chỉ `invited` trong class-1 → không nằm trong roster.
		expect(body).toHaveLength(2);
		expect(body.map((m) => m.name)).toEqual([
			"Nguyễn Thị Hoa",
			"Trần Văn Quân",
		]);
		expect(body[0]).toEqual({
			id: "student-hoa",
			name: "Nguyễn Thị Hoa",
			initials: "TH",
			isMe: true,
		});
		expect(body[1]).toEqual({
			id: "student-quan",
			name: "Trần Văn Quân",
			initials: "VQ",
			isMe: false,
		});
		// Quy ước quyền riêng: không bao giờ lộ email hay bất kỳ field nào khác.
		for (const mate of body) {
			expect(Object.keys(mate).sort()).toEqual([
				"id",
				"initials",
				"isMe",
				"name",
			]);
		}
	});

	test("học viên không ghi danh active vào lớp → 404", async () => {
		// Lạn không có enrollment nào trong class-1 ngoài `invited`.
		const res = await get("/api/student/classes/class-1/classmates", "lan");
		expect(res.status).toBe(404);
	});

	test("lớp thuộc org khác (dù cùng tên email học viên) → 404", async () => {
		const res = await get("/api/student/classes/class-o2/classmates", "hoa");
		expect(res.status).toBe(404);
	});

	test("lớp không tồn tại → 404", async () => {
		const res = await get("/api/student/classes/class-nope/classmates", "hoa");
		expect(res.status).toBe(404);
	});

	test("chưa đăng nhập → 401", async () => {
		const res = await get("/api/student/classes/class-1/classmates", "none");
		expect(res.status).toBe(401);
	});

	test("classmateInitials: hai chữ cuối, một chữ, tên rỗng", () => {
		expect(classmateInitials("Phạm Bảo Ngọc")).toBe("BN");
		expect(classmateInitials("Minh")).toBe("M");
		expect(classmateInitials("   ")).toBe("?");
	});
});
