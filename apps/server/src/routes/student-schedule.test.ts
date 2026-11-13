import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

function sessionFor(email: string, name: string) {
	return {
		userId: `u-${email}`,
		userName: name,
		email,
		emailVerified: true,
		role: "student" as const,
	};
}

describe("student schedule endpoint (GET /api/student/schedule)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		// 1. Tạo 2 tổ chức
		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);

		// 2. Tạo giáo viên cho org-1
		await libsql.insert(schema.user).values([
			{
				id: "u-teacher-1",
				name: "Thầy Hùng",
				email: "hung@teacher.local",
				role: "teacher",
			},
		]);
		await libsql.insert(schema.membership).values([
			{
				id: "mem-t1",
				orgId: "org-1",
				userId: "u-teacher-1",
				role: "teacher",
				createdAt: new Date("2026-01-01"),
			},
		]);

		// 3. Tạo học viên: Hoa (học viên chính), Quân (bạn cùng lớp), Lạn (học viên chưa có lớp active)
		await libsql.insert(schema.student).values([
			{
				id: "student-hoa",
				orgId: "org-1",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
			{
				id: "student-quan",
				orgId: "org-1",
				name: "Trần Văn Quân",
				email: "quan@test.local",
			},
			{
				id: "student-lan",
				orgId: "org-1",
				name: "Lê Thị Lạn",
				email: "lan@test.local",
			},
			{
				id: "student-hoa-o2",
				orgId: "org-2",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
		]);

		// 4. Tạo các lớp học
		await libsql.insert(schema.classTable).values([
			{
				id: "class-1",
				orgId: "org-1",
				name: "IELTS 6.5A",
				level: "IELTS 6.5",
				mode: "1:1",
				schedule: '{"days":[1,4],"start":"18:00","end":"19:30"}',
				startDate: "2026-11-01",
				sessionsDone: 2,
				sessionsTotal: 10,
				status: "active",
			},
			{
				id: "class-2",
				orgId: "org-1",
				name: "Writing Intensive",
				level: "IELTS 7.0",
				mode: "1:1",
				schedule: '{"days":[0,3],"start":"09:00","end":"10:30"}',
				startDate: "2026-11-01",
				sessionsDone: 0,
				sessionsTotal: 10,
				status: "active",
			},
			{
				id: "class-invited",
				orgId: "org-1",
				name: "Speaking Club",
				level: "IELTS 6.0",
				mode: "group",
				schedule: '{"days":[5],"start":"20:00","end":"21:30"}',
				startDate: "2026-11-01",
				sessionsDone: 0,
				sessionsTotal: 8,
				status: "active",
			},
			{
				id: "class-legacy",
				orgId: "org-1",
				name: "Lớp Legacy Chưa Gắn Ngày",
				level: "IELTS 5.5",
				mode: "1:1",
				schedule: "T2 & T5 19:00",
				startDate: "2026-11-01",
				sessionsDone: 0,
				sessionsTotal: 2,
				status: "active",
			},
			{
				id: "class-o2",
				orgId: "org-2",
				name: "Lớp Org 2",
				level: "IELTS 6.5",
				mode: "1:1",
				schedule: '{"days":[2],"start":"14:00","end":"15:30"}',
				startDate: "2026-11-01",
				sessionsDone: 0,
				sessionsTotal: 5,
				status: "active",
			},
		]);

		// 5. Tạo Enrollments
		await libsql.insert(schema.enrollment).values([
			// Hoa: active trong class-1, class-2, và class-legacy; invited trong class-invited
			{
				id: "enr-hoa-c1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-hoa",
				status: "active",
			},
			{
				id: "enr-hoa-c2",
				orgId: "org-1",
				classId: "class-2",
				studentId: "student-hoa",
				status: "active",
			},
			{
				id: "enr-hoa-invited",
				orgId: "org-1",
				classId: "class-invited",
				studentId: "student-hoa",
				status: "invited",
			},
			{
				id: "enr-hoa-legacy",
				orgId: "org-1",
				classId: "class-legacy",
				studentId: "student-hoa",
				status: "active",
			},
			// Quân: active trong class-1 (học cùng lớp Hoa)
			{
				id: "enr-quan-c1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-quan",
				status: "active",
			},
			// Hoa ở org-2
			{
				id: "enr-hoa-o2",
				orgId: "org-2",
				classId: "class-o2",
				studentId: "student-hoa-o2",
				status: "active",
			},
		]);

		// 6. Tạo bài học (lessons)
		await libsql.insert(schema.lesson).values([
			// Hoa: class-1 lessons
			{
				id: "les-hoa-c1-1",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-hoa-c1",
				day: 2,
				time: "18:00",
				dur: 90,
				date: "2026-11-10",
				status: "upcoming",
				topic: "Reading Task 1",
			},
			{
				id: "les-hoa-c1-2",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-hoa-c1",
				day: 5,
				time: "18:00",
				dur: 90,
				date: "2026-11-15",
				status: "upcoming",
				topic: "Reading Task 2",
			},
			// Hoa: class-2 lessons (xen kẽ ngày với class-1)
			{
				id: "les-hoa-c2-1",
				orgId: "org-1",
				classId: "class-2",
				enrollmentId: "enr-hoa-c2",
				day: 1,
				time: "09:00",
				dur: 90,
				date: "2026-11-08",
				status: "upcoming",
				topic: "Writing Essay Overview",
			},
			{
				id: "les-hoa-c2-2",
				orgId: "org-1",
				classId: "class-2",
				enrollmentId: "enr-hoa-c2",
				day: 4,
				time: "09:00",
				dur: 90,
				date: "2026-11-12",
				status: "upcoming",
				topic: "Writing Task 1 Process",
			},
			// Hoa: class-invited lessons (không được xuất hiện)
			{
				id: "les-hoa-inv-1",
				orgId: "org-1",
				classId: "class-invited",
				enrollmentId: "enr-hoa-invited",
				day: 6,
				time: "20:00",
				dur: 90,
				date: "2026-11-20",
				status: "upcoming",
				topic: "Speaking Part 1",
			},
			// Hoa: class-legacy lessons (date: null)
			{
				id: "les-hoa-leg-1",
				orgId: "org-1",
				classId: "class-legacy",
				enrollmentId: "enr-hoa-legacy",
				day: 1,
				time: "19:00",
				dur: 90,
				date: null,
				status: "upcoming",
				topic: "Grammar Basics",
			},
			// Quân: class-1 lessons (Quân bị absent ở buổi 2026-11-10 — KHÔNG được làm ảnh hưởng Hoa!)
			{
				id: "les-quan-c1-1",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-quan-c1",
				day: 2,
				time: "18:00",
				dur: 90,
				date: "2026-11-10",
				status: "absent",
				topic: "Reading Task 1 (Quân vắng)",
			},
			// Hoa ở org-2
			{
				id: "les-hoa-o2-1",
				orgId: "org-2",
				classId: "class-o2",
				enrollmentId: "enr-hoa-o2",
				day: 3,
				time: "14:00",
				dur: 90,
				date: "2026-11-11",
				status: "upcoming",
				topic: "Org 2 Exclusive Lesson",
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const key = headers.get("x-test-user");
				if (key === "hoa")
					return sessionFor("hoa@test.local", "Nguyễn Thị Hoa");
				if (key === "quan")
					return sessionFor("quan@test.local", "Trần Văn Quân");
				if (key === "lan") return sessionFor("lan@test.local", "Lê Thị Lạn");
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function getSchedule(user?: string, orgId?: string): Promise<Response> {
		const headers: Record<string, string> = {};
		if (user) headers["x-test-user"] = user;
		if (orgId) headers["x-student-org-id"] = orgId;
		return app.request("/api/student/schedule", {
			method: "GET",
			headers,
		});
	}

	test("1. Chưa đăng nhập → HTTP 401", async () => {
		const res = await getSchedule();
		expect(res.status).toBe(401);
	});

	test("2. Học viên không có lớp active nào trong org → HTTP 200 { classes: [], lessons: [] }", async () => {
		const res = await getSchedule("lan", "org-1");
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			classes: unknown[];
			lessons: unknown[];
		};
		expect(data.classes).toEqual([]);
		expect(data.lessons).toEqual([]);
	});

	test("3. Gộp bài học của mọi lớp active và sắp xếp theo trình tự thời gian toàn cục", async () => {
		const res = await getSchedule("hoa", "org-1");
		expect(res.status).toBe(200);
		const data = (await res.json()) as {
			classes: Array<{ id: string; name: string }>;
			lessons: Array<{
				id: string;
				classId: string;
				className: string;
				date: string | null;
				time: string;
				topic: string;
			}>;
		};

		// 3 lớp active của Hoa trong org-1: class-1, class-2, class-legacy
		expect(data.classes.map((c) => c.id).sort()).toEqual([
			"class-1",
			"class-2",
			"class-legacy",
		]);

		// Các buổi có ngày phải được sắp xếp theo date ASC, time ASC
		const dated = data.lessons.filter((l) => l.date !== null);
		expect(
			dated.map((l) => ({ date: l.date, time: l.time, id: l.id })),
		).toEqual([
			{ date: "2026-11-08", time: "09:00", id: "les-hoa-c2-1" },
			{ date: "2026-11-10", time: "18:00", id: "les-hoa-c1-1" },
			{ date: "2026-11-12", time: "09:00", id: "les-hoa-c2-2" },
			{ date: "2026-11-15", time: "18:00", id: "les-hoa-c1-2" },
		]);
	});

	test("4. Loại trừ lớp và bài học ở trạng thái invited", async () => {
		const res = await getSchedule("hoa", "org-1");
		const data = (await res.json()) as {
			classes: Array<{ id: string }>;
			lessons: Array<{ id: string; classId: string }>;
		};

		// class-invited không xuất hiện
		expect(data.classes.some((c) => c.id === "class-invited")).toBe(false);
		expect(data.lessons.some((l) => l.id === "les-hoa-inv-1")).toBe(false);
	});

	test("5. IDOR Isolation: không rò rỉ bài học của học viên khác hoặc org khác", async () => {
		const res = await getSchedule("hoa", "org-1");
		const data = (await res.json()) as {
			lessons: Array<{
				id: string;
				status: string;
				topic: string;
			}>;
		};

		// Không có bài học của Quân
		expect(data.lessons.some((l) => l.id === "les-quan-c1-1")).toBe(false);
		// Buổi 2026-11-10 của Hoa vẫn giữ trạng thái 'upcoming', không bị ảnh hưởng bởi việc Quân bị 'absent'
		const hoaNov10 = data.lessons.find((l) => l.id === "les-hoa-c1-1");
		expect(hoaNov10?.status).toBe("upcoming");
		expect(hoaNov10?.topic).toBe("Reading Task 1");

		// Không rò rỉ bài học của org-2 khi đang ở org-1
		expect(data.lessons.some((l) => l.id === "les-hoa-o2-1")).toBe(false);

		// Khi Hoa chuyển sang org-2, chỉ thấy bài học của org-2
		const resOrg2 = await getSchedule("hoa", "org-2");
		const dataOrg2 = (await resOrg2.json()) as {
			classes: Array<{ id: string }>;
			lessons: Array<{ id: string }>;
		};
		expect(dataOrg2.classes.map((c) => c.id)).toEqual(["class-o2"]);
		expect(dataOrg2.lessons.map((l) => l.id)).toEqual(["les-hoa-o2-1"]);
	});

	test("6. Lớp legacy (date null) xuất hiện an toàn ở cuối danh sách mà không gây lỗi", async () => {
		const res = await getSchedule("hoa", "org-1");
		const data = (await res.json()) as {
			lessons: Array<{
				id: string;
				classId: string;
				date: string | null;
				topic: string;
			}>;
		};

		const undated = data.lessons.filter((l) => l.date === null);
		expect(undated).toHaveLength(1);
		expect(undated[0]?.id).toBe("les-hoa-leg-1");
		expect(undated[0]?.classId).toBe("class-legacy");
		expect(undated[0]?.topic).toBe("Grammar Basics");

		// Buổi legacy nằm sau tất cả các buổi có ngày
		const lastIndex = data.lessons.findIndex((l) => l.id === "les-hoa-leg-1");
		expect(lastIndex).toBe(data.lessons.length - 1);
	});
});
