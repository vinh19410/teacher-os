import { createClient } from "@libsql/client";
import {
	type DashboardReminders,
	dashboardRemindersResponseSchema,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "../app";
import { computeReminders, type ReminderScope } from "./dashboard-reminders";

const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const TEACHER = { "x-test-user": "teacher-1" };
const STUDENT = { "x-test-user": "student-u" };
const NO_AUTH = {};

/** Mốc cố định: 2026-10-26 là Thứ Hai (getUTCDay = 1); 03:00 UTC = 10:00 giờ VN. */
const NOW = new Date("2026-10-26T03:00:00Z");
/** 23:30 UTC Chủ nhật 2026-10-25 = 06:30 sáng Thứ Hai 2026-10-26 giờ VN —
 * kiểm weekday suy từ ISO, không theo getDay() của server UTC. */
const NOW_SUNDAY_NIGHT = new Date("2026-10-25T23:30:00Z");

const HOUR_MS = 60 * 60 * 1000;

const sessionFor = async (headers: Headers) => {
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
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

beforeAll(async () => {
	const client = createClient({ url: "file::memory:" });
	const raw = drizzle(client, { schema });
	await migrate(raw, { migrationsFolder: MIGRATIONS_DIR });
	db = raw as unknown as Db;
});

/** Seed mọi bảng computeReminders đọc. todayISO = ngày VN của NOW. */
function seed(base: Db, opts: { todayISO: string; todayWeekday: number }) {
	const today = opts.todayISO;
	return base
		.insert(schema.organization)
		.values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		])
		.run()
		.then(() =>
			base.insert(schema.user).values({
				id: "t-1",
				name: "Cô Lan",
				email: "lan@test.local",
				role: "teacher",
			}),
		)
		.then(() =>
			base.insert(schema.membership).values({
				id: "mem-1",
				orgId: "org-1",
				userId: "t-1",
				role: "teacher",
			}),
		)
		.then(() =>
			base.insert(schema.student).values([
				{
					id: "student-1",
					orgId: "org-1",
					name: "Minh Tran",
					email: "minh@gmail.com",
					phone: "0901234567",
				},
				{
					id: "student-2",
					orgId: "org-1",
					name: "Hoa Nguyen",
					email: "hoa@gmail.com",
					phone: "0902234567",
				},
			]),
		)
		.then(() =>
			base.insert(schema.student).values({
				id: "student-x",
				orgId: "org-2",
				name: "Ky Phong",
				email: "phong@gmail.com",
				phone: "0903234567",
			}),
		)
		.then(() =>
			base.insert(schema.classTable).values([
				{
					id: "class-dated",
					orgId: "org-1",
					name: "Lớp A",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 18:00–19:30",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
				{
					id: "class-legacy",
					orgId: "org-1",
					name: "Lớp B",
					level: "IELTS 6.0–7.0",
					mode: "Offline",
					schedule: "T2 07:00–08:00",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
				{
					id: "class-org2",
					orgId: "org-2",
					name: "LớpOrgKhác",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 18:00–19:30",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
			]),
		)
		.then(() =>
			base.insert(schema.enrollment).values([
				{
					id: "enr-1",
					orgId: "org-1",
					classId: "class-dated",
					studentId: "student-1",
					status: "active",
				},
				{
					id: "enr-2",
					orgId: "org-1",
					classId: "class-legacy",
					studentId: "student-2",
					status: "active",
				},
				{
					id: "enr-x",
					orgId: "org-2",
					classId: "class-org2",
					studentId: "student-x",
					status: "active",
				},
			]),
		)
		.then(() =>
			base.insert(schema.lesson).values([
				// Lớp A (dated): 1 ca upcoming + 1 ca completed cùng hôm nay.
				{
					id: "les-a1",
					orgId: "org-1",
					classId: "class-dated",
					enrollmentId: "enr-1",
					day: opts.todayWeekday,
					time: "18:00",
					dur: 90,
					date: today,
					status: "upcoming",
				},
				{
					id: "les-a2",
					orgId: "org-1",
					classId: "class-dated",
					enrollmentId: "enr-1",
					day: opts.todayWeekday,
					time: "18:00",
					dur: 90,
					date: today,
					status: "completed",
				},
				// Ca cancelled hôm nay — không đếm.
				{
					id: "les-a3",
					orgId: "org-1",
					classId: "class-dated",
					enrollmentId: "enr-1",
					day: opts.todayWeekday,
					time: "20:00",
					dur: 60,
					date: today,
					status: "cancelled",
				},
				// Lớp B (legacy, date NULL): trúng thứ trong tuần hôm nay.
				{
					id: "les-b1",
					orgId: "org-1",
					classId: "class-legacy",
					enrollmentId: "enr-2",
					day: opts.todayWeekday,
					time: "07:00",
					dur: 60,
					status: "upcoming",
				},
				// Lớp B: cùng thứ nhưng khác time → nhóm ca riêng.
				{
					id: "les-b2",
					orgId: "org-1",
					classId: "class-legacy",
					enrollmentId: "enr-2",
					day: opts.todayWeekday,
					time: "09:00",
					dur: 60,
					status: "upcoming",
				},
				// Org khác — không được đếm.
				{
					id: "les-x1",
					orgId: "org-2",
					classId: "class-org2",
					enrollmentId: "enr-x",
					day: opts.todayWeekday,
					time: "06:00",
					dur: 60,
					date: today,
					status: "upcoming",
				},
			]),
		);
}

describe("computeReminders — attendance", () => {
	beforeAll(async () => {
		const today = vietnamTodayISO(NOW);
		const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
		const lessonWeekday = weekday === 0 ? 7 : weekday;
		await seed(db, { todayISO: today, todayWeekday: lessonWeekday });
	});

	test("(a) upcoming hôm nay đếm theo nhóm ca; completed và cancelled không đếm", async () => {
		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		// Lớp A 18:00 (dated), Lớp B 07:00 + 09:00 (legacy) — completed/cancelled không đếm.
		expect(result.attendance.pending).toBe(3);
	});

	test("(b) items gom theo (classId, time), sắp time tăng dần", async () => {
		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		expect(result.attendance.items).toEqual([
			{ classId: "class-legacy", className: "Lớp B", time: "07:00", dur: 60 },
			{ classId: "class-legacy", className: "Lớp B", time: "09:00", dur: 60 },
			{ classId: "class-dated", className: "Lớp A", time: "18:00", dur: 90 },
		]);
	});

	test("(g) cô lập org: lesson org-2 không được đếm", async () => {
		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		expect(
			result.attendance.items.some((item) => item.classId === "class-org2"),
		).toBe(false);
	});

	test("(TOS-11) lesson holiday hôm nay không thành nhắc việc", async () => {
		const today = vietnamTodayISO(NOW);
		const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
		await db.insert(schema.lesson).values({
			id: "les-a-holiday",
			orgId: "org-1",
			classId: "class-dated",
			enrollmentId: "enr-1",
			day: weekday === 0 ? 7 : weekday,
			time: "18:00",
			dur: 90,
			date: today,
			status: "holiday",
		});

		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		// Giữ nguyên 3 ca như (a) — holiday không phải ca cần điểm danh.
		expect(result.attendance.pending).toBe(3);
	});
});

describe("computeReminders — overdue grading", () => {
	test("(d) submitted quá 24h được đếm, trong 24h và đã chấm thì không", async () => {
		await db.insert(schema.assignmentPrompt).values({
			id: "prompt-writing",
			orgId: "org-1",
			task: "task2",
			genre: "essay",
			skill: "writing",
			part: "task2",
			type: "essay",
			title: "Writing Task 2",
			prompt: "<p>Some prompt</p>",
			questions: "[]",
			optionBank: "[]",
			note: "<p>250 từ.</p>",
			status: "ready",
		});
		await db.insert(schema.assignmentTest).values([
			{
				id: "test-writing",
				orgId: "org-1",
				title: "Writing deck",
				skill: "writing",
				status: "ready",
			},
			{
				id: "test-speaking",
				orgId: "org-1",
				title: "Speaking deck",
				skill: "speaking",
				status: "ready",
			},
			{
				id: "test-reading",
				orgId: "org-1",
				title: "Reading deck",
				skill: "reading",
				status: "ready",
			},
		]);
		await db.insert(schema.classAssignment).values({
			id: "ca-1",
			orgId: "org-1",
			classId: "class-dated",
			promptId: "prompt-writing",
			title: "Bài writing tuần",
			due: "2026-10-26",
		});
		await db.insert(schema.student).values({
			id: "student-3",
			orgId: "org-1",
			name: "Nam Pham",
			email: "nam@gmail.com",
			phone: "0904234567",
		});
		await db.insert(schema.quizAttempt).values([
			{
				id: "att-old",
				orgId: "org-1",
				assignmentId: "ca-1",
				studentId: "student-1",
				testId: "test-writing",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				submittedAt: new Date(NOW.getTime() - 25 * HOUR_MS),
			},
			{
				id: "att-recent",
				orgId: "org-1",
				assignmentId: "ca-1",
				studentId: "student-3",
				testId: "test-writing",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				submittedAt: new Date(NOW.getTime() - 23 * HOUR_MS),
			},
			// Đã chấm — không còn là "chờ chấm" (khớp ?status=awaiting).
			{
				id: "att-graded",
				orgId: "org-1",
				assignmentId: "ca-1",
				studentId: "student-2",
				testId: "test-writing",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				submittedAt: new Date(NOW.getTime() - 30 * HOUR_MS),
				gradeScores: { cc: 6 },
				gradedAt: new Date(NOW.getTime() - 5 * HOUR_MS),
			},
			// Practice speaking quá 24h — đếm theo nhánh assignmentTest.skill.
			{
				id: "att-practice",
				orgId: "org-1",
				studentId: "student-2",
				testId: "test-speaking",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				submittedAt: new Date(NOW.getTime() - 30 * HOUR_MS),
			},
			// Skill reading — không đếm.
			{
				id: "att-reading",
				orgId: "org-1",
				studentId: "student-1",
				testId: "test-reading",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				submittedAt: new Date(NOW.getTime() - 30 * HOUR_MS),
			},
		]);

		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		expect(result.overdueGrading).toEqual({
			count: 2,
			writing: 1,
			speaking: 1,
		});
	});
});

describe("computeReminders — tuition", () => {
	test("(e) quá hạn + trong 7 ngày đếm; sau 8 ngày, thu đủ, thiếu due, trả thừa không sai số", async () => {
		const today = vietnamTodayISO(NOW);
		const shift = (n: number) => {
			const d = new Date(`${today}T00:00:00Z`);
			d.setUTCDate(d.getUTCDate() + n);
			return d.toISOString().slice(0, 10);
		};
		await db.insert(schema.invoice).values([
			{
				id: "inv-overdue",
				orgId: "org-1",
				studentId: "student-1",
				amount: 1_000_000,
				status: "unpaid",
				due: shift(-1),
			},
			{
				id: "inv-due-soon",
				orgId: "org-1",
				studentId: "student-2",
				amount: 2_000_000,
				paidAmount: 500_000,
				status: "unpaid",
				due: shift(3),
			},
			{
				id: "inv-late-window",
				orgId: "org-1",
				studentId: "student-1",
				amount: 3_000_000,
				status: "unpaid",
				due: shift(8),
			},
			{
				id: "inv-paid",
				orgId: "org-1",
				studentId: "student-2",
				amount: 1_000_000,
				paidAmount: 1_000_000,
				status: "paid",
				due: shift(-2),
			},
			{
				id: "inv-no-due",
				orgId: "org-1",
				studentId: "student-1",
				amount: 1_000_000,
				status: "unpaid",
				due: "",
			},
			{
				id: "inv-overpay",
				orgId: "org-1",
				studentId: "student-1",
				amount: 1_000,
				paidAmount: 2_000,
				status: "unpaid",
				due: shift(2),
			},
			{
				id: "inv-org2",
				orgId: "org-2",
				studentId: "student-x",
				amount: 9_000_000,
				status: "unpaid",
				due: shift(-3),
			},
		]);

		const result = await computeReminders(db, "org-1", { kind: "org" }, NOW);
		// Chưa thu đủ: overdue (s1), due-soon (s2), overpay (s1) — distinct 2 học viên.
		expect(result.tuition).toEqual({
			students: 2,
			outstanding: 1_000_000 + 1_500_000 + 0,
		});
	});
});

describe("computeReminders — ReminderScope", () => {
	test("(f) scope assigned: chỉ lớp phân công, không trả block tuition", async () => {
		const today = vietnamTodayISO(NOW);
		const scope: ReminderScope = {
			kind: "assigned",
			classIds: ["class-dated"],
			finance: false,
		};
		const result = await computeReminders(
			db,
			"org-1",
			scope,
			new Date(`${today}T03:00:00Z`),
		);
		expect(result.attendance.pending).toBe(1);
		expect(result.attendance.items).toEqual([
			{ classId: "class-dated", className: "Lớp A", time: "18:00", dur: 90 },
		]);
		// Chỉ nhánh assignment của lớp phân công: att-old (class-dated); practice không tính.
		expect(result.overdueGrading).toEqual({
			count: 1,
			writing: 1,
			speaking: 0,
		});
		expect("tuition" in result).toBe(false);
		// Response parse lại bằng schema vẫn hợp lệ khi thiếu block tuition.
		const parsed: DashboardReminders =
			dashboardRemindersResponseSchema.parse(result);
		expect(parsed.date).toBe(today);
	});

	test("(f2) scope assigned với classIds rỗng trả 0, không query", async () => {
		const result = await computeReminders(
			db,
			"org-1",
			{ kind: "assigned", classIds: [], finance: false },
			NOW,
		);
		expect(result.attendance.pending).toBe(0);
		expect(result.attendance.items).toEqual([]);
		expect(result.overdueGrading).toEqual({
			count: 0,
			writing: 0,
			speaking: 0,
		});
		expect("tuition" in result).toBe(false);
	});
});

describe("computeReminders — múi giờ", () => {
	test("(b2) 23:30 UTC Chủ nhật → VN đã sang Thứ Hai, legacy đếm theo day=1", async () => {
		const vnToday = vietnamTodayISO(NOW_SUNDAY_NIGHT);
		expect(vnToday).toBe("2026-10-26");
		// Chuẩn hoá: legacy lesson day = Thứ Hai (1) theo ngày VN.
		await db
			.update(schema.lesson)
			.set({ day: 1 })
			.where(eq(schema.lesson.id, "les-b1"));
		const result = await computeReminders(
			db,
			"org-1",
			{ kind: "org" },
			NOW_SUNDAY_NIGHT,
		);
		// Nếu suy weekday từ getDay() của server UTC (Chủ nhật → 7) thì Lớp B sẽ không đếm.
		expect(
			result.attendance.items.some((item) => item.classId === "class-legacy"),
		).toBe(true);
		expect(result.date).toBe(vnToday);
	});
});

describe("GET /api/dashboard/reminders", () => {
	let app: ReturnType<typeof buildApp>;

	beforeAll(() => {
		app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: sessionFor,
			authHandler: () => new Response("auth OK"),
		});
	});

	test("chưa đăng nhập trả 401", async () => {
		const res = await app.request("/api/dashboard/reminders", {
			headers: NO_AUTH,
		});
		expect(res.status).toBe(401);
	});

	test("session student nhận 403 ACCOUNT_STUDENT_ROLE", async () => {
		const res = await app.request("/api/dashboard/reminders", {
			headers: STUDENT,
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("ACCOUNT_STUDENT_ROLE");
	});

	test("teacher nhận 200 và body khớp schema", async () => {
		const res = await app.request("/api/dashboard/reminders", {
			headers: TEACHER,
		});
		expect(res.status).toBe(200);
		const body = dashboardRemindersResponseSchema.parse(await res.json());
		// Route dùng new Date() thật — date phải là hôm nay giờ VN lúc chạy test.
		expect(body.date).toBe(vietnamTodayISO(new Date()));
	});
});

describe("computeReminders — hiệu năng", () => {
	test("dưới 200ms với bộ seed hiện tại", async () => {
		const start = performance.now();
		await computeReminders(db, "org-1", { kind: "org" }, NOW);
		expect(performance.now() - start).toBeLessThan(200);
	});
});
