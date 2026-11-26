import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	type DailyAttendanceResponse,
	dailyAttendanceResponseSchema,
	overdueAttendanceResponseSchema,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";
import {
	computeDailyAttendance,
	computeOverdueAttendance,
} from "./daily-attendance";
import { computeReminders } from "./dashboard-reminders";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

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
const ADMIN = {
	"x-test-user": "admin-u",
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};
const STUDENT = {
	"x-test-user": "student-u",
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};
const NO_AUTH = {
	origin: CORS_ORIGIN,
	"content-type": "application/json",
};

/** 2026-10-26 là Thứ Hai (weekday = 1). */
const MONDAY_ISO = "2026-10-26";
const NOW_MONDAY = new Date("2026-10-26T03:00:00Z");
const NOW_SUNDAY_NIGHT_UTC = new Date("2026-10-25T23:30:00Z");

const sessionFor = async (headers: Headers) => {
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
	}
	if (userKey === "teacher-2") {
		return { userId: "t-2", userName: "Cô Mai", role: "teacher" as const };
	}
	if (userKey === "admin-u") {
		return { userId: "a-1", userName: "Admin", role: "admin" as const };
	}
	if (userKey === "student-u") {
		return {
			userId: "u-s",
			userName: "Minh",
			email: "minh@gmail.com",
			emailVerified: true,
			role: "student" as const,
		};
	}
	return null;
};

let db: Db;
let rawClient: ReturnType<typeof createClient>;

beforeEach(async () => {
	const client = createClient({ url: "file::memory:" });
	rawClient = client;
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;

	await db.insert(schema.organization).values([
		{ id: "org-1", name: "Academy 1" },
		{ id: "org-2", name: "Academy 2" },
	]);
	await db.insert(schema.user).values([
		{
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		},
		{
			id: "t-2",
			name: "Cô Mai",
			email: "mai@test.local",
			role: "teacher",
		},
	]);
	await db.insert(schema.membership).values([
		{
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		},
		{
			id: "mem-2",
			orgId: "org-2",
			userId: "t-2",
			role: "teacher",
		},
	]);
});

function createApp(customDb: Db = db, now?: () => Date) {
	return buildApp({
		getDb: () => customDb,
		now,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: sessionFor,
		authHandler: async () => new Response(null, { status: 404 }),
	});
}

describe("computeDailyAttendance — GET /api/attendance/daily", () => {
	test("(a) lớp có ngày có 2 dòng time khác nhau cùng date được gom vào 1 ca duy nhất theo (classId, date), sắp ca theo giờ rồi tên lớp, học viên theo localeCompare vi", async () => {
		await db.insert(schema.classTable).values([
			{
				id: "cls-late",
				orgId: "org-1",
				name: "Lớp B",
				schedule: "T2 19:00",
			},
			{
				id: "cls-early",
				orgId: "org-1",
				name: "Lớp A",
				schedule: "T2 17:00",
			},
		]);
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "Đặng Văn B" },
			{ id: "s-2", orgId: "org-1", name: "An Nguyễn" },
			{ id: "s-3", orgId: "org-1", name: "Bình Trần" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "e-1",
				orgId: "org-1",
				classId: "cls-early",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-2",
				orgId: "org-1",
				classId: "cls-early",
				studentId: "s-2",
				status: "active",
			},
			{
				id: "e-3",
				orgId: "org-1",
				classId: "cls-late",
				studentId: "s-3",
				status: "active",
			},
		]);
		// cls-early có 2 dòng khác time (17:00 và 18:00) trong cùng ngày MONDAY_ISO -> gom thành 1 ca.
		await db.insert(schema.lesson).values([
			{
				id: "l-1",
				orgId: "org-1",
				classId: "cls-early",
				enrollmentId: "e-1",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
			{
				id: "l-2",
				orgId: "org-1",
				classId: "cls-early",
				enrollmentId: "e-2",
				day: 1,
				time: "17:00",
				dur: 60,
				date: MONDAY_ISO,
				status: "upcoming",
			},
			{
				id: "l-3",
				orgId: "org-1",
				classId: "cls-late",
				enrollmentId: "e-3",
				day: 1,
				time: "19:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "completed",
				attendance: "present",
				attendanceNote: "Đúng giờ",
			},
		]);

		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "org" },
			MONDAY_ISO,
		);
		const parsed = dailyAttendanceResponseSchema.parse(res);
		expect(parsed.sessions).toHaveLength(2);
		expect(parsed.sessions[0]?.classId).toBe("cls-early");
		expect(parsed.sessions[0]?.time).toBe("17:00");
		expect(parsed.sessions[0]?.recorded).toBe(false);
		expect(parsed.sessions[0]?.students.map((s) => s.studentName)).toEqual([
			"An Nguyễn",
			"Đặng Văn B",
		]);
		expect(parsed.sessions[1]?.classId).toBe("cls-late");
		expect(parsed.sessions[1]?.recorded).toBe(true);
		expect(parsed.counts).toEqual({ all: 2, pending: 1, completed: 1 });
	});

	test("(b) lớp legacy đúng thứ được liệt kê với mode='legacy' và lessonId=null (kể cả mốc 23:30 UTC = Thứ Hai VN)", async () => {
		const vnMonday = vietnamTodayISO(NOW_SUNDAY_NIGHT_UTC);
		expect(vnMonday).toBe(MONDAY_ISO);

		await db.insert(schema.classTable).values({
			id: "cls-leg",
			orgId: "org-1",
			name: "Lớp Legacy",
			schedule: "T2 08:00",
		});
		await db.insert(schema.student).values({
			id: "s-leg",
			orgId: "org-1",
			name: "Học Viên Cũ",
		});
		await db.insert(schema.enrollment).values({
			id: "e-leg",
			orgId: "org-1",
			classId: "cls-leg",
			studentId: "s-leg",
			status: "active",
		});
		await db.insert(schema.lesson).values([
			{
				id: "l-leg-1",
				orgId: "org-1",
				classId: "cls-leg",
				enrollmentId: "e-leg",
				day: 1,
				time: "08:00",
				dur: 90,
				date: null,
				status: "upcoming",
			},
			{
				id: "l-leg-2",
				orgId: "org-1",
				classId: "cls-leg",
				enrollmentId: "e-leg",
				day: 1,
				time: "08:00",
				dur: 90,
				date: null,
				status: "completed",
			},
		]);

		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "org" },
			vnMonday,
		);
		expect(res.sessions).toHaveLength(1);
		expect(res.sessions[0]).toEqual({
			classId: "cls-leg",
			className: "Lớp Legacy",
			time: "08:00",
			dur: 90,
			mode: "legacy",
			recorded: false,
			students: [
				{
					lessonId: null,
					studentId: "s-leg",
					studentName: "Học Viên Cũ",
					attendance: null,
					note: "",
				},
			],
		});
	});

	test("(c) buổi cancelled toàn ca bị loại; huỷ lẻ chỉ bỏ học viên đó", async () => {
		await db.insert(schema.classTable).values([
			{ id: "cls-all-cancel", orgId: "org-1", name: "Lớp Huỷ Hết" },
			{ id: "cls-part-cancel", orgId: "org-1", name: "Lớp Huỷ Lẻ" },
		]);
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "HV 1" },
			{ id: "s-2", orgId: "org-1", name: "HV 2" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "e-c1",
				orgId: "org-1",
				classId: "cls-all-cancel",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-p1",
				orgId: "org-1",
				classId: "cls-part-cancel",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-p2",
				orgId: "org-1",
				classId: "cls-part-cancel",
				studentId: "s-2",
				status: "active",
			},
		]);
		await db.insert(schema.lesson).values([
			{
				id: "l-c1",
				orgId: "org-1",
				classId: "cls-all-cancel",
				enrollmentId: "e-c1",
				day: 1,
				time: "09:00",
				dur: 60,
				date: MONDAY_ISO,
				status: "cancelled",
			},
			{
				id: "l-p1",
				orgId: "org-1",
				classId: "cls-part-cancel",
				enrollmentId: "e-p1",
				day: 1,
				time: "10:00",
				dur: 60,
				date: MONDAY_ISO,
				status: "cancelled",
			},
			{
				id: "l-p2",
				orgId: "org-1",
				classId: "cls-part-cancel",
				enrollmentId: "e-p2",
				day: 1,
				time: "10:00",
				dur: 60,
				date: MONDAY_ISO,
				status: "upcoming",
			},
		]);

		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "org" },
			MONDAY_ISO,
		);
		expect(res.sessions.map((s) => s.classId)).toEqual(["cls-part-cancel"]);
		expect(res.sessions[0]?.students.map((s) => s.studentId)).toEqual(["s-2"]);
		expect(res.counts).toEqual({ all: 1, pending: 1, completed: 0 });
	});

	test("(d) completed + attendance=NULL trả 'present'; absent + attendance=NULL trả null (không bịa 'excused')", async () => {
		await db.insert(schema.classTable).values({
			id: "cls-1",
			orgId: "org-1",
			name: "Lớp Cũ 1-click",
		});
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "HV A" },
			{ id: "s-2", orgId: "org-1", name: "HV B" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "e-1",
				orgId: "org-1",
				classId: "cls-1",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-2",
				orgId: "org-1",
				classId: "cls-1",
				studentId: "s-2",
				status: "active",
			},
		]);
		await db.insert(schema.lesson).values([
			{
				id: "l-done",
				orgId: "org-1",
				classId: "cls-1",
				enrollmentId: "e-1",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "completed",
				attendance: null,
			},
			{
				id: "l-abs",
				orgId: "org-1",
				classId: "cls-1",
				enrollmentId: "e-2",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "absent",
				attendance: null,
			},
		]);

		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "org" },
			MONDAY_ISO,
		);
		expect(res.sessions[0]?.recorded).toBe(true);
		expect(res.sessions[0]?.students).toEqual([
			{
				lessonId: "l-done",
				studentId: "s-1",
				studentName: "HV A",
				attendance: "present",
				note: "",
			},
			{
				lessonId: "l-abs",
				studentId: "s-2",
				studentName: "HV B",
				attendance: null,
				note: "",
			},
		]);
	});

	test("(e) enrollment không active và (f) dữ liệu org khác bị loại", async () => {
		await db.insert(schema.classTable).values([
			{ id: "cls-1", orgId: "org-1", name: "Lớp Org 1" },
			{ id: "cls-2", orgId: "org-2", name: "Lớp Org 2" },
		]);
		await db.insert(schema.student).values([
			{ id: "s-inv", orgId: "org-1", name: "HV Invited" },
			{ id: "s-org2", orgId: "org-2", name: "HV Org 2" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "e-inv",
				orgId: "org-1",
				classId: "cls-1",
				studentId: "s-inv",
				status: "invited",
			},
			{
				id: "e-org2",
				orgId: "org-2",
				classId: "cls-2",
				studentId: "s-org2",
				status: "active",
			},
		]);
		await db.insert(schema.lesson).values([
			{
				id: "l-inv",
				orgId: "org-1",
				classId: "cls-1",
				enrollmentId: "e-inv",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
			{
				id: "l-org2",
				orgId: "org-2",
				classId: "cls-2",
				enrollmentId: "e-org2",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
		]);

		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "org" },
			MONDAY_ISO,
		);
		expect(res.sessions).toEqual([]);
	});

	test("(g) scope assigned chỉ trả lớp trong classIds và chunk >50 classIds không lỗi", async () => {
		await db.insert(schema.classTable).values([
			{ id: "cls-keep", orgId: "org-1", name: "Lớp Được Giao" },
			{ id: "cls-drop", orgId: "org-1", name: "Lớp Không Giao" },
		]);
		await db.insert(schema.student).values({
			id: "s-1",
			orgId: "org-1",
			name: "HV 1",
		});
		await db.insert(schema.enrollment).values([
			{
				id: "e-keep",
				orgId: "org-1",
				classId: "cls-keep",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-drop",
				orgId: "org-1",
				classId: "cls-drop",
				studentId: "s-1",
				status: "active",
			},
		]);
		await db.insert(schema.lesson).values([
			{
				id: "l-keep",
				orgId: "org-1",
				classId: "cls-keep",
				enrollmentId: "e-keep",
				day: 1,
				time: "18:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
			{
				id: "l-drop",
				orgId: "org-1",
				classId: "cls-drop",
				enrollmentId: "e-drop",
				day: 1,
				time: "19:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
		]);

		const manyClassIds = [
			...Array.from({ length: 65 }, (_, i) => `cls-dummy-${i}`),
			"cls-keep",
		];
		const res = await computeDailyAttendance(
			db,
			"org-1",
			{ kind: "assigned", classIds: manyClassIds, finance: false },
			MONDAY_ISO,
		);
		expect(res.sessions.map((s) => s.classId)).toEqual(["cls-keep"]);
	});

	test("(h) GET /api/attendance/daily: 401 khi chưa đăng nhập, 403 cho student, 400 invalid-date cho ngày sai định dạng", async () => {
		const app = createApp();

		const unauth = await app.request(
			`/api/attendance/daily?date=${MONDAY_ISO}`,
			{ headers: NO_AUTH },
		);
		expect(unauth.status).toBe(401);

		const studentRes = await app.request(
			`/api/attendance/daily?date=${MONDAY_ISO}`,
			{ headers: STUDENT },
		);
		expect(studentRes.status).toBe(403);
		expect(await studentRes.json()).toMatchObject({
			code: "ACCOUNT_STUDENT_ROLE",
		});

		const badDate = await app.request("/api/attendance/daily?date=26-10-2026", {
			headers: TEACHER,
		});
		expect(badDate.status).toBe(400);
		expect(await badDate.json()).toEqual({
			error: "invalid date",
			reason: "invalid-date",
		});

		const defaultDate = await app.request("/api/attendance/daily", {
			headers: TEACHER,
		});
		expect(defaultDate.status).toBe(200);
		const body = (await defaultDate.json()) as DailyAttendanceResponse;
		expect(body.date).toBe(vietnamTodayISO());
	});
});

describe("PUT /api/classes/:id/sessions/:date/attendance", () => {
	async function seedClassSession(dateISO: string, studentCount = 4) {
		await db.insert(schema.classTable).values({
			id: "cls-put",
			orgId: "org-1",
			name: "Lớp Điểm Danh",
		});
		const lessonIds: string[] = [];
		for (let i = 1; i <= studentCount; i++) {
			const sid = `s-${i}`;
			const eid = `e-${i}`;
			const lid = `l-${i}`;
			lessonIds.push(lid);
			await db.insert(schema.student).values({
				id: sid,
				orgId: "org-1",
				name: `Học viên ${i}`,
			});
			await db.insert(schema.enrollment).values({
				id: eid,
				orgId: "org-1",
				classId: "cls-put",
				studentId: sid,
				status: "active",
			});
			await db.insert(schema.lesson).values({
				id: lid,
				orgId: "org-1",
				classId: "cls-put",
				enrollmentId: eid,
				day: 1,
				time: "18:00",
				dur: 90,
				date: dateISO,
				status: "upcoming",
			});
		}
		return lessonIds;
	}

	test("lưu đủ 4 trạng thái -> status trong DB đúng bảng ánh xạ D2, note được trim và lưu, tích hợp computeReminders giảm đúng 1", async () => {
		const today = vietnamTodayISO();
		await seedClassSession(today, 4);
		const app = createApp();

		const before = await computeReminders(
			db,
			"org-1",
			{ kind: "org" },
			new Date(),
		);
		expect(before.attendance.pending).toBe(1);

		const res = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [
						{ lessonId: "l-1", attendance: "present", note: "  Tốt  " },
						{ lessonId: "l-2", attendance: "late", note: "Muộn 10p" },
						{ lessonId: "l-3", attendance: "excused", note: "Có phép" },
						{ lessonId: "l-4", attendance: "unexcused", note: "" },
					],
				}),
			},
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ updated: 4, recorded: true });

		const rows = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, "cls-put"));
		const byId = new Map(rows.map((r) => [r.id, r]));
		expect(byId.get("l-1")).toMatchObject({
			status: "completed",
			attendance: "present",
			attendanceNote: "Tốt",
		});
		expect(byId.get("l-2")).toMatchObject({
			status: "completed",
			attendance: "late",
			attendanceNote: "Muộn 10p",
		});
		expect(byId.get("l-3")).toMatchObject({
			status: "absent",
			attendance: "excused",
			attendanceNote: "Có phép",
		});
		expect(byId.get("l-4")).toMatchObject({
			status: "completed",
			attendance: "unexcused",
			attendanceNote: "",
		});

		const after = await computeReminders(
			db,
			"org-1",
			{ kind: "org" },
			new Date(),
		);
		expect(after.attendance.pending).toBe(0);

		// Lưu lại ca đã điểm danh (đổi present -> excused): completed -> absent.
		const resave = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [
						{ lessonId: "l-1", attendance: "excused", note: "Đổi sang nghỉ" },
						{ lessonId: "l-2", attendance: "late", note: "Muộn 10p" },
						{ lessonId: "l-3", attendance: "excused", note: "Có phép" },
						{ lessonId: "l-4", attendance: "unexcused", note: "" },
					],
				}),
			},
		);
		expect(resave.status).toBe(200);
		const [l1After] = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.id, "l-1"));
		expect(l1After).toMatchObject({
			status: "absent",
			attendance: "excused",
			attendanceNote: "Đổi sang nghỉ",
		});
	});

	test("thiếu học viên -> 422 incomplete-roster; thừa id lạ -> 422 unknown-lesson; DB không đổi", async () => {
		const today = vietnamTodayISO();
		await seedClassSession(today, 2);
		const app = createApp();

		const missingRes = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(missingRes.status).toBe(422);
		expect(await missingRes.json()).toEqual({
			error: "incomplete roster",
			reason: "incomplete-roster",
			missing: ["l-2"],
		});

		const unknownRes = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [
						{ lessonId: "l-1", attendance: "present", note: "" },
						{ lessonId: "l-2", attendance: "present", note: "" },
						{ lessonId: "l-stranger", attendance: "present", note: "" },
					],
				}),
			},
		);
		expect(unknownRes.status).toBe(422);
		expect(await unknownRes.json()).toEqual({
			error: "unknown lesson",
			reason: "unknown-lesson",
		});

		const rows = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, "cls-put"));
		expect(rows.every((r) => r.status === "upcoming")).toBe(true);
	});

	test("thêm dòng upcoming vào bucket giữa lúc đọc roster và ghi batch -> guard lệch -> 409 roster-changed, DB không đổi", async () => {
		const today = vietnamTodayISO();
		await seedClassSession(today, 2);

		// Tạo học viên thứ 3 được kích hoạt chen ngang ngay trước khi db.batch chạy.
		await db.insert(schema.student).values({
			id: "s-race",
			orgId: "org-1",
			name: "HV Chen Ngang",
		});
		await db.insert(schema.enrollment).values({
			id: "e-race",
			orgId: "org-1",
			classId: "cls-put",
			studentId: "s-race",
			status: "active",
		});

		const origBatch = db.batch.bind(db);
		const racingDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "batch") {
					return async (statements: Parameters<Db["batch"]>[0]) => {
						await db.insert(schema.lesson).values({
							id: "l-race",
							orgId: "org-1",
							classId: "cls-put",
							enrollmentId: "e-race",
							day: 1,
							time: "18:00",
							dur: 90,
							date: today,
							status: "upcoming",
						});
						return origBatch(statements);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const app = createApp(racingDb);
		const res = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [
						{ lessonId: "l-1", attendance: "present", note: "" },
						{ lessonId: "l-2", attendance: "present", note: "" },
					],
				}),
			},
		);
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error: "roster changed",
			reason: "roster-changed",
		});

		const rows = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, "cls-put"));
		expect(rows.every((r) => r.status === "upcoming")).toBe(true);
	});

	test("ngày tương lai -> 422 future-session; ngày sai -> 400 invalid-date; body sai -> 400 invalid body; chưa đăng nhập 401; student 403", async () => {
		await seedClassSession("2099-12-31", 1);
		const app = createApp();

		const futureRes = await app.request(
			"/api/classes/cls-put/sessions/2099-12-31/attendance",
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(futureRes.status).toBe(422);
		expect(await futureRes.json()).toEqual({
			error: "future-session",
			reason: "future-session",
		});

		const badDate = await app.request(
			"/api/classes/cls-put/sessions/31-12-2099/attendance",
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(badDate.status).toBe(400);
		expect(await badDate.json()).toEqual({
			error: "invalid date",
			reason: "invalid-date",
		});

		const badBody = await app.request(
			`/api/classes/cls-put/sessions/${MONDAY_ISO}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({ entries: [] }),
			},
		);
		expect(badBody.status).toBe(400);
		expect(await badBody.json()).toEqual({ error: "invalid body" });

		const unauth = await app.request(
			`/api/classes/cls-put/sessions/${MONDAY_ISO}/attendance`,
			{
				method: "PUT",
				headers: NO_AUTH,
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(unauth.status).toBe(401);

		const studentRes = await app.request(
			`/api/classes/cls-put/sessions/${MONDAY_ISO}/attendance`,
			{
				method: "PUT",
				headers: STUDENT,
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(studentRes.status).toBe(403);

		const nonJsonPut = await app.request(
			`/api/classes/cls-put/sessions/${MONDAY_ISO}/attendance`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher-1",
					origin: CORS_ORIGIN,
					"content-type": "text/plain",
				},
				body: JSON.stringify({
					entries: [{ lessonId: "l-1", attendance: "present", note: "" }],
				}),
			},
		);
		expect(nonJsonPut.status).toBe(415);
	});
	test("ca 30 học viên lưu trong < 300ms ở server", async () => {
		const today = vietnamTodayISO();
		const lessonIds = await seedClassSession(today, 30);
		const app = createApp();

		const t0 = performance.now();
		const res = await app.request(
			`/api/classes/cls-put/sessions/${today}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: lessonIds.map((lessonId) => ({
						lessonId,
						attendance: "present",
						note: "",
					})),
				}),
			},
		);
		const elapsed = performance.now() - t0;
		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(300);
	});
});

describe("computeOverdueAttendance — GET /api/attendance/overdue", () => {
	async function seedBaseOrg() {
		await db.insert(schema.classTable).values([
			{
				id: "cls-found",
				orgId: "org-1",
				name: "IELTS Foundation 5.5",
				status: "active",
			},
			{
				id: "cls-early",
				orgId: "org-1",
				name: "IELTS Basic",
				status: "active",
			},
			{
				id: "cls-paused",
				orgId: "org-1",
				name: "IELTS Tạm Dừng",
				status: "paused",
			},
			{
				id: "cls-legacy",
				orgId: "org-1",
				name: "Lớp Legacy",
				status: "active",
			},
			{
				id: "cls-org2",
				orgId: "org-2",
				name: "Lớp Org 2",
				status: "active",
			},
		]);
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "Đặng Văn B" },
			{ id: "s-2", orgId: "org-1", name: "An Nguyễn" },
			{ id: "s-3", orgId: "org-1", name: "Cường Tạm Dừng" },
			{ id: "s-org2", orgId: "org-2", name: "Học Viên Org 2" },
		]);
		await db.insert(schema.enrollment).values([
			{
				id: "e-1",
				orgId: "org-1",
				classId: "cls-found",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-2",
				orgId: "org-1",
				classId: "cls-found",
				studentId: "s-2",
				status: "active",
			},
			{
				id: "e-early",
				orgId: "org-1",
				classId: "cls-early",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-paused",
				orgId: "org-1",
				classId: "cls-paused",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-inactive",
				orgId: "org-1",
				classId: "cls-found",
				studentId: "s-3",
				status: "paused",
			},
			{
				id: "e-legacy",
				orgId: "org-1",
				classId: "cls-legacy",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-cross-student",
				orgId: "org-1",
				classId: "cls-found",
				studentId: "s-org2",
				status: "active",
			},
			{
				id: "e-org2",
				orgId: "org-2",
				classId: "cls-org2",
				studentId: "s-org2",
				status: "active",
			},
		]);
	}

	test("trả đúng 6 ca quá hạn sắp date DESC, time ASC, className ASC và sort học viên theo tiếng Việt", async () => {
		await seedBaseOrg();
		const dates = [
			"2026-10-05",
			"2026-10-08",
			"2026-10-12",
			"2026-10-15",
			"2026-10-19",
			"2026-10-24",
		];
		await db.insert(schema.lesson).values([
			...dates.flatMap((date, idx) => [
				{
					id: `ov-a-${idx}`,
					orgId: "org-1",
					classId: "cls-found",
					enrollmentId: "e-1",
					day: 1,
					time: "19:00",
					dur: 90,
					date,
					status: "upcoming",
				},
				{
					id: `ov-b-${idx}`,
					orgId: "org-1",
					classId: "cls-found",
					enrollmentId: "e-2",
					day: 1,
					time: "19:00",
					dur: 90,
					date,
					status: "upcoming",
				},
			]),
			// Cùng ngày 2026-10-24 nhưng giờ sớm hơn (18:00 < 19:00) -> đứng trước cls-found
			{
				id: "ov-early-24",
				orgId: "org-1",
				classId: "cls-early",
				enrollmentId: "e-early",
				day: 6,
				time: "18:00",
				dur: 90,
				date: "2026-10-24",
				status: "upcoming",
			},
		]);

		const res = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
		);
		const parsed = overdueAttendanceResponseSchema.parse(res);
		expect(parsed.today).toBe(MONDAY_ISO);
		expect(parsed.totalCount).toBe(7);
		expect(parsed.hasMore).toBe(false);
		expect(parsed.sessions.map((s) => `${s.date}|${s.classId}`)).toEqual([
			"2026-10-24|cls-early",
			"2026-10-24|cls-found",
			"2026-10-19|cls-found",
			"2026-10-15|cls-found",
			"2026-10-12|cls-found",
			"2026-10-08|cls-found",
			"2026-10-05|cls-found",
		]);
		expect(parsed.sessions[1]?.students.map((s) => s.studentName)).toEqual([
			"An Nguyễn",
			"Đặng Văn B",
		]);
	});

	test("ca quá hạn điểm danh dở dang (1 completed + 1 upcoming) nạp đủ cả 2 HV và lưu PUT 200 giảm đúng 1 ở cả overdue và reminders", async () => {
		await seedBaseOrg();
		// Ngày quá khứ chắc chắn nhỏ hơn cả NOW_MONDAY lẫn đồng hồ thật khi PUT HTTP.
		const pastDate = "2025-05-10";
		await db.insert(schema.lesson).values([
			{
				id: "l-part-1",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 6,
				time: "19:00",
				dur: 90,
				date: pastDate,
				status: "completed",
				attendance: null,
			},
			{
				id: "l-part-2",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-2",
				day: 6,
				time: "19:00",
				dur: 90,
				date: pastDate,
				status: "upcoming",
				attendance: null,
			},
		]);

		const beforeOverdue = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
		);
		expect(beforeOverdue.totalCount).toBe(1);
		expect(beforeOverdue.sessions[0]?.students).toEqual([
			{
				lessonId: "l-part-2",
				studentId: "s-2",
				studentName: "An Nguyễn",
				attendance: null,
				note: "",
			},
			{
				lessonId: "l-part-1",
				studentId: "s-1",
				studentName: "Đặng Văn B",
				attendance: "present",
				note: "",
			},
		]);

		const app = createApp(db, () => NOW_MONDAY);
		const putRes = await app.request(
			`/api/classes/cls-found/sessions/${pastDate}/attendance`,
			{
				method: "PUT",
				headers: TEACHER,
				body: JSON.stringify({
					entries: [
						{ lessonId: "l-part-1", attendance: "present", note: "" },
						{ lessonId: "l-part-2", attendance: "late", note: "Muộn 5p" },
					],
				}),
			},
		);
		expect(putRes.status).toBe(200);

		const afterOverdue = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
		);
		const afterReminders = await computeReminders(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
		);
		expect(afterOverdue.totalCount).toBe(0);
		expect(afterOverdue.sessions).toEqual([]);
		expect(afterReminders.attendance.overdue).toBe(0);
		expect(afterReminders.attendance.pending).toBe(0);
	});

	test("loại trừ hôm nay, tương lai, cancelled, holiday, đã điểm danh đủ, lớp paused, enrollment inactive, student khác org, legacy, date rỗng/sai lịch và org khác", async () => {
		await seedBaseOrg();
		await db.insert(schema.lesson).values([
			// Hợp lệ duy nhất:
			{
				id: "l-ok",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-20",
				status: "upcoming",
			},
			// Hôm nay & tương lai:
			{
				id: "l-today",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: MONDAY_ISO,
				status: "upcoming",
			},
			{
				id: "l-future",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 2,
				time: "19:00",
				dur: 90,
				date: "2026-10-27",
				status: "upcoming",
			},
			// Đã xử lý / nghỉ:
			{
				id: "l-done",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-19",
				status: "completed",
			},
			{
				id: "l-abs",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-18",
				status: "absent",
			},
			{
				id: "l-can",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-17",
				status: "cancelled",
			},
			{
				id: "l-hol",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-16",
				status: "holiday",
			},
			// Lớp paused / inactive / cross-student / legacy / rác date / org2:
			{
				id: "l-p",
				orgId: "org-1",
				classId: "cls-paused",
				enrollmentId: "e-paused",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-15",
				status: "upcoming",
			},
			{
				id: "l-inact",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-inactive",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-14",
				status: "upcoming",
			},
			{
				id: "l-xst",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-cross-student",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-13",
				status: "upcoming",
			},
			{
				id: "l-leg",
				orgId: "org-1",
				classId: "cls-legacy",
				enrollmentId: "e-legacy",
				day: 1,
				time: "08:00",
				dur: 60,
				date: null,
				status: "upcoming",
			},
			{
				id: "l-empty",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "",
				status: "upcoming",
			},
			{
				id: "l-bad-date",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-02-30",
				status: "upcoming",
			},
			{
				id: "l-org2",
				orgId: "org-2",
				classId: "cls-org2",
				enrollmentId: "e-org2",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-12",
				status: "upcoming",
			},
		]);

		const res = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
		);
		expect(res.totalCount).toBe(1);
		expect(res.sessions.map((s) => `${s.classId}:${s.date}`)).toEqual([
			"cls-found:2026-10-20",
		]);
	});

	test("hỗ trợ limit, scope assigned 65 classIds và kiểm soát HTTP 401/403/400/cross-org", async () => {
		await seedBaseOrg();
		await db.insert(schema.lesson).values([
			...["2026-10-10", "2026-10-15", "2026-10-20", "2026-10-24"].map(
				(date, i) => ({
					id: `lim-${i}`,
					orgId: "org-1",
					classId: "cls-found",
					enrollmentId: "e-1",
					day: 1,
					time: "19:00",
					dur: 90,
					date,
					status: "upcoming",
				}),
			),
			{
				id: "lim-org2",
				orgId: "org-2",
				classId: "cls-org2",
				enrollmentId: "e-org2",
				day: 1,
				time: "19:00",
				dur: 90,
				date: "2026-10-21",
				status: "upcoming",
			},
		]);

		const limited = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
			2,
		);
		expect(limited.totalCount).toBe(4);
		expect(limited.hasMore).toBe(true);
		expect(limited.sessions.map((s) => s.date)).toEqual([
			"2026-10-24",
			"2026-10-20",
		]);

		const manyClassIds = [
			...Array.from({ length: 64 }, (_, i) => `cls-dummy-${i}`),
			"cls-found",
		];
		const scoped = await computeOverdueAttendance(
			db,
			"org-1",
			{ kind: "assigned", classIds: manyClassIds, finance: false },
			NOW_MONDAY,
		);
		expect(scoped.totalCount).toBe(4);

		const app = createApp(db, () => NOW_MONDAY);
		expect(
			(await app.request("/api/attendance/overdue", { headers: NO_AUTH }))
				.status,
		).toBe(401);

		const studentRes = await app.request("/api/attendance/overdue", {
			headers: STUDENT,
		});
		expect(studentRes.status).toBe(403);
		expect(await studentRes.json()).toMatchObject({
			code: "ACCOUNT_STUDENT_ROLE",
		});

		const adminRes = await app.request("/api/attendance/overdue", {
			headers: ADMIN,
		});
		expect(adminRes.status).toBe(403);
		expect(await adminRes.json()).toMatchObject({
			code: "ACCOUNT_ADMIN_ROLE",
		});

		// Cross-org IDOR: teacher-2 (org-2) chỉ thấy 1 ca của org-2, không thấy 4 ca của org-1.
		const org2Res = await app.request("/api/attendance/overdue", {
			headers: TEACHER_ORG2,
		});
		expect(org2Res.status).toBe(200);
		const org2Body = overdueAttendanceResponseSchema.parse(
			await org2Res.json(),
		);
		expect(org2Body.totalCount).toBe(1);
		expect(org2Body.sessions[0]?.classId).toBe("cls-org2");

		// ?limit= empty -> mặc định 50; ?limit=200 -> clamp 100 (200 OK); ?limit=2 -> 2 ca.
		const emptyLim = await app.request("/api/attendance/overdue?limit=", {
			headers: TEACHER,
		});
		expect(emptyLim.status).toBe(200);
		expect(
			overdueAttendanceResponseSchema.parse(await emptyLim.json()).sessions,
		).toHaveLength(4);

		const hugeLim = await app.request("/api/attendance/overdue?limit=200", {
			headers: TEACHER,
		});
		expect(hugeLim.status).toBe(200);

		const twoLim = await app.request("/api/attendance/overdue?limit=2", {
			headers: TEACHER,
		});
		expect(twoLim.status).toBe(200);
		const twoBody = overdueAttendanceResponseSchema.parse(await twoLim.json());
		expect(twoBody.totalCount).toBe(4);
		expect(twoBody.hasMore).toBe(true);
		expect(twoBody.sessions).toHaveLength(2);

		for (const bad of ["0", "-1", "5abc", "1.5", "1e2"]) {
			const badRes = await app.request(
				`/api/attendance/overdue?limit=${encodeURIComponent(bad)}`,
				{ headers: TEACHER },
			);
			expect(badRes.status).toBe(400);
			expect(await badRes.json()).toEqual({
				error: "invalid limit",
				reason: "invalid-limit",
			});
		}
	});

	test("TOCTOU guard: bucket được đánh dấu xong giữa Bước 1 và Bước 2 bị loại bỏ và giảm totalCount/hasMore chính xác", async () => {
		await seedBaseOrg();
		await db.insert(schema.lesson).values([
			{
				id: "toc-1",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 6,
				time: "19:00",
				dur: 90,
				date: "2026-10-24",
				status: "upcoming",
			},
			{
				id: "toc-2",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 4,
				time: "19:00",
				dur: 90,
				date: "2026-10-22",
				status: "upcoming",
			},
			{
				id: "toc-3",
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 2,
				time: "19:00",
				dur: 90,
				date: "2026-10-20",
				status: "upcoming",
			},
		]);

		let execCount = 0;
		const origExecute = rawClient.execute.bind(rawClient);
		const racingClient = new Proxy(rawClient, {
			get(target, prop, receiver) {
				if (prop === "execute") {
					return async (...args: Parameters<typeof rawClient.execute>) => {
						execCount += 1;
						const result = await origExecute(...args);
						// Sau Bước 1 (tìm bucket), giả lập tab khác vừa lưu xong ca 2026-10-24 trước Bước 2.
						if (execCount === 1) {
							await origExecute({
								sql: "UPDATE lesson SET status = 'completed', attendance = 'present' WHERE id = ?",
								args: ["toc-1"],
							});
						}
						return result;
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});
		const racingDb = drizzle(racingClient, { schema }) as unknown as Db;

		const res = await computeOverdueAttendance(
			racingDb,
			"org-1",
			{ kind: "org" },
			NOW_MONDAY,
			2,
		);
		const parsed = overdueAttendanceResponseSchema.parse(res);
		expect(parsed.sessions.map((s) => s.date)).toEqual(["2026-10-22"]);
		expect(parsed.totalCount).toBe(2);
		expect(parsed.hasMore).toBe(true);
	});

	test("đa lô Bước 2 (>25 cặp) và ?limit=200 clamp đúng về MAX_OVERDUE_LIMIT = 100 với hasMore = true", async () => {
		await seedBaseOrg();
		// Seed 105 ngày quá khứ liên tiếp (105 > 100 và > 25*4 lô Bước 2).
		const baseMs = Date.UTC(2026, 9, 25); // 2026-10-25
		const rows = Array.from({ length: 105 }, (_, i) => {
			const d = new Date(baseMs - i * 86_400_000).toISOString().slice(0, 10);
			return {
				id: `batch-ov-${i}`,
				orgId: "org-1",
				classId: "cls-found",
				enrollmentId: "e-1",
				day: 1,
				time: "19:00",
				dur: 90,
				date: d,
				status: "upcoming" as const,
			};
		});
		await db.insert(schema.lesson).values(rows);

		const app = createApp(db, () => NOW_MONDAY);
		const res = await app.request("/api/attendance/overdue?limit=200", {
			headers: TEACHER,
		});
		expect(res.status).toBe(200);
		const body = overdueAttendanceResponseSchema.parse(await res.json());
		expect(body.totalCount).toBe(105);
		expect(body.sessions).toHaveLength(100);
		expect(body.hasMore).toBe(true);
		expect(body.sessions[0]?.date).toBe("2026-10-25");
	});
});
