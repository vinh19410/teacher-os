import { createClient } from "@libsql/client";
import { isoToLessonWeekday } from "@teacher-os/api/skeleton";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import {
	activateEnrollment,
	generateScheduleLessons,
} from "./enrollment-activation";

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
	const userKey = headers.get("x-test-user");
	if (userKey === "teacher-1") {
		return { userId: "t-1", userName: "Cô Lan", role: "teacher" as const };
	}
	if (userKey === "teacher-2") {
		return { userId: "t-2", userName: "Cô Hoa", role: "teacher" as const };
	}
	return null;
};

// Ngày động: buổi đầu là Thứ Sáu đầu tiên sau hôm nay để range không rơi
// vào quá khứ ở mọi ngày chạy test.
const TODAY = vietnamTodayISO();
const F1 = nextDowISO(TODAY, 5); // buổi 1 (Thứ Sáu)
const F3 = addDaysISO(F1, 14); // buổi 3 — ngày nghỉ
const F9 = addDaysISO(F1, 56); // makeup tự nhiên sau buổi 8
const SCHEDULE_A = JSON.stringify({ days: [4], start: "19:00", end: "20:30" });
const SCHEDULE_B = JSON.stringify({ days: [4], start: "17:30", end: "18:30" });

function nextDowISO(fromISO: string, utcDay: number): string {
	let d = addDaysISO(fromISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== utcDay) {
		d = addDaysISO(d, 1);
	}
	return d;
}

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
	await db.insert(schema.user).values([
		{ id: "t-1", name: "Cô Lan", email: "lan@test.local", role: "teacher" },
		{ id: "t-2", name: "Cô Hoa", email: "hoa@test.local", role: "teacher" },
	]);
	await db.insert(schema.membership).values([
		{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
		{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
	]);
	await seedClasses();
});

async function seedClasses() {
	await db.insert(schema.classTable).values([
		{
			id: "cls-a",
			orgId: "org-1",
			name: "Lớp A",
			schedule: SCHEDULE_A,
			sessionsTotal: 8,
			startDate: F1,
			status: "active",
		},
		{
			id: "cls-b",
			orgId: "org-1",
			name: "Lớp B",
			schedule: SCHEDULE_B,
			sessionsTotal: 8,
			startDate: F1,
			status: "active",
		},
	]);
	await db.insert(schema.student).values([
		{ id: "s-1", orgId: "org-1", name: "Minh" },
		{ id: "s-2", orgId: "org-1", name: "Lan" },
	]);
	await db.insert(schema.enrollment).values([
		{
			id: "enr-a1",
			orgId: "org-1",
			classId: "cls-a",
			studentId: "s-1",
			status: "active",
		},
		{
			id: "enr-a2",
			orgId: "org-1",
			classId: "cls-a",
			studentId: "s-2",
			status: "active",
		},
		{
			id: "enr-b1",
			orgId: "org-1",
			classId: "cls-b",
			studentId: "s-1",
			status: "active",
		},
	]);
	for (const [classId, schedule, enrollmentId] of [
		["cls-a", SCHEDULE_A, "enr-a1"],
		["cls-a", SCHEDULE_A, "enr-a2"],
		["cls-b", SCHEDULE_B, "enr-b1"],
	] as const) {
		for (const row of generateScheduleLessons({
			schedule,
			startDate: F1,
			sessionsTotal: 8,
			orgId: "org-1",
			classId,
			enrollmentId,
		})) {
			await db
				.insert(schema.lesson)
				.values({ id: crypto.randomUUID(), ...row });
		}
	}
}

function createApp(
	customDb: Db = db,
	opts?: {
		mailer?: Mailer;
		studentOrigin?: string;
	},
) {
	return buildApp({
		getDb: () => customDb,
		corsOrigin: CORS_ORIGIN,
		getSessionUser: sessionFor,
		authHandler: async () => new Response(null, { status: 404 }),
		// #454 D9: đường ống thông báo holiday_created cần mailer + origin.
		...opts,
	});
}

const draft = () => ({
	name: "Nghỉ lễ giữa khóa",
	fromDate: F3,
	toDate: F3,
	scope: "org",
	mode: "shift",
	notify: true,
});

async function preview(app: ServerApp, body: unknown) {
	return app.request("/api/holidays/preview", {
		method: "POST",
		headers: TEACHER,
		body: JSON.stringify(body),
	});
}

async function apply(
	app: ServerApp,
	body: Record<string, unknown>,
	headers = TEACHER,
) {
	return app.request("/api/holidays", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

/** BR-003: đếm theo enrollment — completed và tổng không-holiday. */
async function perEnrollmentCounts() {
	const rows = await db
		.select({
			enrollmentId: schema.lesson.enrollmentId,
			status: schema.lesson.status,
		})
		.from(schema.lesson);
	const counts = new Map<string, { completed: number; nonHoliday: number }>();
	for (const row of rows) {
		const entry = counts.get(row.enrollmentId) ?? {
			completed: 0,
			nonHoliday: 0,
		};
		if (row.status === "completed") entry.completed += 1;
		if (row.status !== "holiday") entry.nonHoliday += 1;
		counts.set(row.enrollmentId, entry);
	}
	return counts;
}

describe("POST /api/holidays/preview", () => {
	test("2 lớp trúng 1 buổi mỗi lớp → 2 shift, ngày bù đúng thứ/giờ, không ghi DB", async () => {
		const app = createApp();
		const res = await preview(app, draft());
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			shifts: Array<{
				classId: string;
				originalDate: string;
				makeupDate: string;
				weekday: number;
				time: string;
				dur: number;
				sessionOrdinal: number;
			}>;
			affectedClassCount: number;
			planHash: string;
		};
		expect(body.shifts).toHaveLength(2);
		const shiftA = body.shifts.find((shift) => shift.classId === "cls-a");
		const shiftB = body.shifts.find((shift) => shift.classId === "cls-b");
		expect(shiftA?.originalDate).toBe(F3);
		expect(shiftA?.makeupDate).toBe(F9);
		expect(shiftA?.weekday).toBe(isoToLessonWeekday(F9));
		expect(isoToLessonWeekday(F9)).toBe(5);
		expect(shiftA?.time).toBe("19:00");
		expect(shiftA?.dur).toBe(90);
		expect(shiftA?.sessionOrdinal).toBe(3);
		expect(shiftB?.makeupDate).toBe(F9);
		expect(shiftB?.time).toBe("17:30");
		expect(shiftB?.dur).toBe(60);
		expect(body.affectedClassCount).toBe(2);
		expect(body.planHash).toMatch(/^[0-9a-f]{64}$/);

		const holidayRows = await db.select().from(schema.organizationHoliday);
		expect(holidayRows).toHaveLength(0);
	});

	test('scope = "classes" chỉ lớp A → 1 shift; lớp lạ thuộc org khác → 404', async () => {
		const app = createApp();
		const scoped = await preview(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
		});
		const body = (await scoped.json()) as { shifts: unknown[] };
		expect(body.shifts).toHaveLength(1);

		const cross = await apply(
			app,
			{
				...draft(),
				scope: "classes",
				classIds: ["cls-a"],
				planHash: "x",
			},
			TEACHER_ORG2,
		);
		expect(cross.status).toBe(404);
	});

	test("input sai contract → 400; 401 khi chưa đăng nhập", async () => {
		const app = createApp();
		const bad = await preview(app, { ...draft(), name: "N" });
		expect(bad.status).toBe(400);
		const past = await preview(app, {
			...draft(),
			fromDate: "2026-02-30",
			toDate: "2026-02-30",
		});
		expect(past.status).toBe(400);
		const unauth = await app.request("/api/holidays/preview", {
			method: "POST",
			headers: { origin: CORS_ORIGIN, "content-type": "application/json" },
			body: JSON.stringify(draft()),
		});
		expect(unauth.status).toBe(401);
	});

	// #453 AC-004 mục 2 — server không tin client: 35 ngày (> 30) bị chặn ở
	// cả preview lẫn apply, kể cả khi client tự gắn planHash.
	test("khoảng 35 ngày → 400 ở cả preview và apply (TOS-14b)", async () => {
		const app = createApp();
		const long35 = {
			...draft(),
			fromDate: F1,
			toDate: addDaysISO(F1, 34), // tính cả hai đầu = 35 ngày
		};
		const previewRes = await preview(app, long35);
		expect(previewRes.status).toBe(400);

		const applyRes = await apply(app, { ...long35, planHash: "x" });
		expect(applyRes.status).toBe(400);
	});
});

describe("POST /api/holidays (apply)", () => {
	test("apply nguyên tử: buổi gốc holiday, bù đủ sĩ số, shift + notif đúng, BR-003 giữ nguyên", async () => {
		const app = createApp();
		const before = await perEnrollmentCounts();
		const previewRes = await preview(app, draft());
		const { planHash } = (await previewRes.json()) as { planHash: string };

		const res = await apply(app, { ...draft(), planHash });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			holidayId: string;
			shiftedCount: number;
			classCount: number;
		};
		expect(body.shiftedCount).toBe(2);
		expect(body.classCount).toBe(2);

		const holidayRows = await db.select().from(schema.organizationHoliday);
		expect(holidayRows).toHaveLength(1);
		expect(holidayRows[0]?.id).toBe(body.holidayId);
		expect(holidayRows[0]?.notifiedAt).toBeNull(); // TOS-19 mới set

		const shifts = await db.select().from(schema.holidaySessionShift);
		expect(shifts).toHaveLength(2);
		expect(shifts.map((s) => s.originalDate)).toEqual([F3, F3]);
		expect(shifts.map((s) => s.makeupDate)).toEqual([F9, F9]);

		const f3Lessons = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(and(eq(schema.lesson.date, F3)));
		expect(f3Lessons).toHaveLength(3);
		expect(f3Lessons.every((row) => row.status === "holiday")).toBe(true);

		const f9Lessons = await db
			.select({ status: schema.lesson.status, time: schema.lesson.time })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F9));
		expect(f9Lessons).toHaveLength(3);
		expect(f9Lessons.every((row) => row.status === "upcoming")).toBe(true);

		const notifs = await db.select().from(schema.notif);
		expect(notifs).toHaveLength(1);
		expect(notifs[0]?.text).toContain("Lịch nghỉ");
		expect(notifs[0]?.text).toContain("2 buổi của 2 lớp");
		expect(notifs[0]?.dot).toBe("warn");

		const after = await perEnrollmentCounts();
		for (const [enrollmentId, beforeEntry] of before) {
			const afterEntry = after.get(enrollmentId);
			expect(afterEntry?.completed).toBe(beforeEntry.completed);
			expect(afterEntry?.nonHoliday).toBe(beforeEntry.nonHoliday);
		}
	});

	test("race C1: điểm danh xen giữa buildPlan và batch → 409, DB sạch (rollback thật)", async () => {
		const app = createApp();
		const previewRes = await preview(app, draft());
		const { planHash } = (await previewRes.json()) as { planHash: string };

		// Mô phỏng race: ngay trước khi batch chạy, 1 dòng upcoming của ca bị
		// dời biến thành completed — guard CASE đếm lệch → NOT NULL fail.
		const victimRows = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(
				and(
					eq(schema.lesson.date, F3),
					eq(schema.lesson.enrollmentId, "enr-a1"),
				),
			);
		const victimId = victimRows[0]?.id;
		if (!victimId) throw new Error("missing victim lesson");
		const originalBatch = db.batch.bind(db);
		// Unchecked cast có kiểm soát: generic overload của `batch` không diễn
		// đạt được wrapper này; nó chèn mutation race ngay trước batch thật
		// (kịch bản không thể gây ra từ API).
		const patchable = db as Db & { batch: Db["batch"] };
		patchable.batch = (async (statements: Parameters<Db["batch"]>[0]) => {
			await db
				.update(schema.lesson)
				.set({ status: "completed" })
				.where(eq(schema.lesson.id, victimId));
			return originalBatch(statements);
		}) as unknown as Db["batch"];

		const res = await apply(app, { ...draft(), planHash });
		expect(res.status).toBe(409);

		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(0);
		expect(await db.select().from(schema.holidaySessionShift)).toHaveLength(0);
		const f9 = await db
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F9));
		expect(f9).toHaveLength(0);
		const f3 = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F3));
		// Toàn bộ buổi gốc còn nguyên (trừ dòng victim đã completed bởi race).
		const upcoming = f3.filter((row) => row.status === "upcoming");
		const completed = f3.filter((row) => row.status === "completed");
		expect(upcoming).toHaveLength(2);
		expect(completed).toHaveLength(1);
	});

	test("planHash lệch (I7) → 409 stale-preview; không trúng buổi nào → 422; quá khứ → 422 past-range", async () => {
		const app = createApp();
		const stale = await apply(app, { ...draft(), planHash: "deadbeef" });
		expect(stale.status).toBe(409);
		expect(((await stale.json()) as { error: string }).error).toBe(
			"stale-preview",
		);

		const empty = await preview(app, {
			...draft(),
			fromDate: addDaysISO(F3, 1),
			toDate: addDaysISO(F3, 1),
		});
		const { planHash } = (await empty.json()) as { planHash: string };
		const emptyApply = await apply(app, {
			name: "Nghỉ trống",
			fromDate: addDaysISO(F3, 1),
			toDate: addDaysISO(F3, 1),
			scope: "org",
			mode: "shift",
			notify: true,
			planHash,
		});
		expect(emptyApply.status).toBe(422);
		expect(((await emptyApply.json()) as { error: string }).error).toBe(
			"no-sessions",
		);

		const pastRes = await apply(app, {
			...draft(),
			fromDate: addDaysISO(TODAY, -3),
			toDate: addDaysISO(TODAY, -3),
			planHash,
		});
		expect(pastRes.status).toBe(422);
		expect(((await pastRes.json()) as { error: string }).error).toBe(
			"past-range",
		);
	});

	test("race I7 đúng nghĩa: completed giữa preview và apply → planHash lệch → 409 trước khi ghi", async () => {
		const app = createApp();
		const previewRes = await preview(app, draft());
		const { planHash } = (await previewRes.json()) as { planHash: string };
		await db
			.update(schema.lesson)
			.set({ status: "completed" })
			.where(
				and(
					eq(schema.lesson.date, F3),
					eq(schema.lesson.enrollmentId, "enr-b1"),
				),
			);

		const res = await apply(app, { ...draft(), planHash });
		expect(res.status).toBe(409);
		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(0);
		// Lớp B giờ keptCompleted — apply lại với preview mới chỉ dời lớp A.
		const rePreview = await preview(app, draft());
		const re = (await rePreview.json()) as {
			shifts: Array<{ classId: string }>;
			keptCompleted: Array<{ classId: string }>;
		};
		expect(re.shifts.map((shift) => shift.classId)).toEqual(["cls-a"]);
		expect(re.keptCompleted).toHaveLength(1);
		expect(re.keptCompleted[0]?.classId).toBe("cls-b");
	});
});

describe("Kích hoạt enrollment sau khi áp kỳ nghỉ (D6)", () => {
	test("học viên mới nhận buổi gốc holiday + đủ buổi bù, không dư buổi", async () => {
		const app = createApp();
		await db.insert(schema.student).values({
			id: "s-3",
			orgId: "org-1",
			name: "Phúc",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-a3",
			orgId: "org-1",
			classId: "cls-a",
			studentId: "s-3",
			status: "invited",
		});
		const applyBody = {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
		};
		const previewRes = await preview(app, applyBody);
		const { planHash } = (await previewRes.json()) as { planHash: string };
		const applyRes = await apply(app, { ...applyBody, planHash });
		expect(applyRes.status).toBe(200);

		const activation = await activateEnrollment(db, "org-1", "enr-a3");
		expect(activation).toEqual({ ok: true });

		const rows = await db
			.select({
				date: schema.lesson.date,
				status: schema.lesson.status,
				time: schema.lesson.time,
			})
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-a3"));
		expect(rows).toHaveLength(9); // 8 buổi khóa + 1 buổi bù
		const f3 = rows.find((row) => row.date === F3);
		expect(f3?.status).toBe("holiday");
		const makeup = rows.filter((row) => row.date === F9);
		expect(makeup).toHaveLength(1);
		expect(makeup[0]?.status).toBe("upcoming");
		expect(makeup[0]?.time).toBe("19:00");
		expect(rows.filter((row) => row.status !== "holiday")).toHaveLength(8);
	});

	test("I6: lớp chưa từng có học viên lúc apply — activation tự sinh shift", async () => {
		await db.insert(schema.classTable).values({
			id: "cls-c",
			orgId: "org-1",
			name: "Lớp C trống",
			schedule: SCHEDULE_A,
			sessionsTotal: 8,
			startDate: F1,
			status: "active",
		});
		// Kỳ nghỉ scope org đã tồn tại (áp cho lớp A/B khi lớp C còn trống).
		await db.insert(schema.organizationHoliday).values({
			id: "hol-org",
			orgId: "org-1",
			name: "Nghỉ giữa khóa",
			fromDate: F3,
			toDate: F3,
			scope: "org",
			mode: "shift",
			notify: false,
			createdByUserId: "t-1",
		});
		const app = createApp();
		const previewRes = await preview(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-c"],
		});
		const emptyBody = (await previewRes.json()) as { shifts: unknown[] };
		expect(emptyBody.shifts).toHaveLength(0); // lớp trống không có buổi để dời

		await db.insert(schema.enrollment).values({
			id: "enr-c1",
			orgId: "org-1",
			classId: "cls-c",
			studentId: "s-1",
			status: "invited",
		});
		const activation = await activateEnrollment(db, "org-1", "enr-c1");
		expect(activation).toEqual({ ok: true });

		const shifts = await db
			.select()
			.from(schema.holidaySessionShift)
			.where(eq(schema.holidaySessionShift.classId, "cls-c"));
		expect(shifts).toHaveLength(1);
		expect(shifts[0]?.originalDate).toBe(F3);
		expect(shifts[0]?.makeupDate).toBe(F9);

		const rows = await db
			.select({ date: schema.lesson.date, status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-c1"));
		expect(rows).toHaveLength(9);
		expect(rows.find((row) => row.date === F3)?.status).toBe("holiday");
		expect(rows.filter((row) => row.status !== "holiday")).toHaveLength(8);
	});

	test("I3: chuỗi 2 kỳ nghỉ nối nhau (makeup kỳ 1 trúng kỳ 2) — activation áp cộng dồn, tổng không-holiday = sessionsTotal", async () => {
		await db.insert(schema.classTable).values({
			id: "cls-d",
			orgId: "org-1",
			name: "Lớp D",
			schedule: SCHEDULE_A,
			sessionsTotal: 8,
			startDate: F1,
			status: "active",
		});
		const F10 = addDaysISO(F1, 63);
		await db.insert(schema.organizationHoliday).values({
			id: "hol-chain",
			orgId: "org-1",
			name: "Chuỗi kỳ nghỉ",
			fromDate: F3,
			toDate: F9,
			scope: "classes",
			mode: "shift",
			notify: false,
			createdByUserId: "t-1",
		});
		await db.insert(schema.organizationHolidayClass).values({
			id: "holc-chain",
			holidayId: "hol-chain",
			classId: "cls-d",
		});
		// Kỳ nghỉ 1: F3 → F9 (endpoint). Kỳ nghỉ 2 trúng F9: F9 → F10.
		await db.insert(schema.holidaySessionShift).values([
			{
				id: "shift-d1",
				orgId: "org-1",
				holidayId: "hol-chain",
				classId: "cls-d",
				originalDate: F3,
				makeupDate: F9,
				createdAt: new Date(1000),
			},
			{
				id: "shift-d2",
				orgId: "org-1",
				holidayId: "hol-chain",
				classId: "cls-d",
				originalDate: F9,
				makeupDate: F10,
				createdAt: new Date(2000),
			},
		]);
		await db.insert(schema.enrollment).values({
			id: "enr-d1",
			orgId: "org-1",
			classId: "cls-d",
			studentId: "s-1",
			status: "invited",
		});

		const activation = await activateEnrollment(db, "org-1", "enr-d1");
		expect(activation).toEqual({ ok: true });

		const rows = await db
			.select({ date: schema.lesson.date, status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-d1"));
		// F3 (gốc kỳ 1) và F9 (gốc kỳ 1 là makeup, trúng kỳ 2) là holiday.
		expect(
			rows.filter((row) => row.status === "holiday").map((row) => row.date),
		).toEqual([F3, F9]);
		// BR-003: dời không trừ — số buổi còn lại vẫn bằng sessionsTotal.
		expect(rows.filter((row) => row.status !== "holiday")).toHaveLength(8);
		const makeupDates = rows
			.filter((row) => row.date !== null && row.status === "upcoming")
			.map((row) => row.date)
			.sort();
		expect(makeupDates.slice(-1)).toEqual([F10]);
	});
});

describe("Điểm danh ngày nghỉ (phase 4 đặm màu)", () => {
	test("/attendance/daily ngày nghỉ không còn ca của lớp đã dời", async () => {
		const app = createApp();
		const previewRes = await preview(app, draft());
		const { planHash } = (await previewRes.json()) as { planHash: string };
		await apply(app, { ...draft(), planHash });

		const res = await app.request(`/api/attendance/daily?date=${F3}`, {
			headers: TEACHER,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			sessions: Array<{ classId: string }>;
		};
		expect(
			body.sessions.filter(
				(session) => session.classId === "cls-a" || session.classId === "cls-b",
			),
		).toHaveLength(0);
	});
});

describe("C2: edit/move khóa nhóm holiday, move makeup kéo shift theo", () => {
	test("moveDate nhóm có dòng holiday → 409 holiday-locked, dữ liệu giữ nguyên", async () => {
		const app = createApp();
		const previewRes = await preview(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
		});
		const { planHash } = (await previewRes.json()) as { planHash: string };
		await apply(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
			planHash,
		});

		const res = await app.request(`/api/classes/cls-a/sessions/${F3}/edit`, {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify({ moveDate: addDaysISO(F3, 1) }),
		});
		expect(res.status).toBe(409);
		expect(((await res.json()) as { reason: string }).reason).toBe(
			"holiday-locked",
		);
		// Dữ liệu không xê dịch: lesson lớp A vẫn holiday ở F3, shift còn nguyên.
		const f3 = await db
			.select({ classId: schema.lesson.classId, status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F3));
		expect(f3.filter((row) => row.classId === "cls-a")).toHaveLength(2);
		expect(
			f3
				.filter((row) => row.classId === "cls-a")
				.every((row) => row.status === "holiday"),
		).toBe(true);
		const shifts = await db.select().from(schema.holidaySessionShift);
		expect(shifts[0]?.makeupDate).toBe(F9);
	});

	test("moveDate nhóm makeup → makeupDate của shift kéo theo ngày mới", async () => {
		// Kỳ nghỉ A dời F3 → F9 (apply). Sau đó move nhóm F9 sang F10 — nhóm
		// F9 là makeupDate của shift; shift phải trỏ sang F10.
		const F10 = addDaysISO(F1, 63);
		const app = createApp();
		const previewRes = await preview(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
		});
		const { planHash } = (await previewRes.json()) as { planHash: string };
		await apply(app, {
			...draft(),
			scope: "classes",
			classIds: ["cls-a"],
			planHash,
		});

		const res = await app.request(`/api/classes/cls-a/sessions/${F9}/edit`, {
			method: "POST",
			headers: TEACHER,
			body: JSON.stringify({ moveDate: F10 }),
		});
		expect(res.status).toBe(200);

		const shifts = await db
			.select()
			.from(schema.holidaySessionShift)
			.where(eq(schema.holidaySessionShift.classId, "cls-a"));
		expect(shifts).toHaveLength(1);
		expect(shifts[0]?.originalDate).toBe(F3);
		expect(shifts[0]?.makeupDate).toBe(F10);
		const f10 = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F10));
		expect(f10.length).toBeGreaterThan(0);
	});
});

describe("TOS-12: skippedHolidays kèm tên và bảo vệ buổi đã điểm danh", () => {
	test("kỳ nghỉ ĐÃ LƯU trong DB phủ ngày bù tự nhiên → preview và apply đều nhảy sang Friday kế tiếp, skippedHolidays có tên (AC-002)", async () => {
		const app = createApp();
		await db.insert(schema.organizationHoliday).values({
			id: "hol-tet",
			orgId: "org-1",
			name: "Nghỉ Tết Dương lịch",
			fromDate: F9,
			toDate: F9,
			scope: "org",
			mode: "shift",
			notify: false,
			createdByUserId: "t-1",
		});

		const previewRes = await preview(app, draft());
		expect(previewRes.status).toBe(200);
		const body = (await previewRes.json()) as {
			shifts: Array<{
				classId: string;
				makeupDate: string;
				skippedHolidays: Array<{
					date: string;
					holidayName: string | null;
				}>;
			}>;
			planHash: string;
		};
		const nextFriday = addDaysISO(F9, 7);
		for (const classId of ["cls-a", "cls-b"]) {
			const shift = body.shifts.find((row) => row.classId === classId);
			expect(shift?.makeupDate).toBe(nextFriday);
			expect(shift?.skippedHolidays).toEqual([
				{ date: F9, holidayName: "Nghỉ Tết Dương lịch" },
			]);
		}

		const applyRes = await apply(app, { ...draft(), planHash: body.planHash });
		expect(applyRes.status).toBe(200);
		const makeup = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, nextFriday));
		expect(makeup).toHaveLength(3);
		expect(makeup.every((row) => row.status === "upcoming")).toBe(true);
		// Ngày bù cũ F9 không bị tạo lesson — chỉ là ngày bị nhảy qua.
		const f9 = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F9));
		expect(f9).toHaveLength(0);
	});

	test("kỳ nghỉ scope classes chỉ lớp A → ngày bù lớp A nhảy, lớp B giữ ngày bù tự nhiên", async () => {
		const app = createApp();
		await db.insert(schema.organizationHoliday).values({
			id: "hol-scoped",
			orgId: "org-1",
			name: "Nghỉ riêng lớp A",
			fromDate: F9,
			toDate: F9,
			scope: "classes",
			mode: "shift",
			notify: false,
			createdByUserId: "t-1",
		});
		await db.insert(schema.organizationHolidayClass).values({
			id: "holc-scoped",
			holidayId: "hol-scoped",
			classId: "cls-a",
		});

		const res = await preview(app, draft());
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			shifts: Array<{
				classId: string;
				makeupDate: string;
				skippedHolidays: Array<{
					date: string;
					holidayName: string | null;
				}>;
			}>;
		};
		const shiftA = body.shifts.find((row) => row.classId === "cls-a");
		expect(shiftA?.makeupDate).toBe(addDaysISO(F9, 7));
		expect(shiftA?.skippedHolidays).toEqual([
			{ date: F9, holidayName: "Nghỉ riêng lớp A" },
		]);
		// Lớp B không thuộc kỳ nghỉ scope classes → không nhảy.
		const shiftB = body.shifts.find((row) => row.classId === "cls-b");
		expect(shiftB?.makeupDate).toBe(F9);
		expect(shiftB?.skippedHolidays).toEqual([]);
	});

	test("buổi trộn completed + upcoming → keptCompleted; apply giữ nguyên cả 2 dòng, không sinh shift cho buổi đó", async () => {
		const app = createApp();
		// enr-a1 tại F3 đã điểm danh → buổi F3 lớp A thành buổi trộn (D2).
		await db
			.update(schema.lesson)
			.set({ status: "completed" })
			.where(
				and(
					eq(schema.lesson.date, F3),
					eq(schema.lesson.enrollmentId, "enr-a1"),
				),
			);

		const previewRes = await preview(app, draft());
		const body = (await previewRes.json()) as {
			shifts: Array<{ classId: string }>;
			keptCompleted: Array<{
				classId: string;
				className: string;
				date: string;
				sessionOrdinal: number;
			}>;
			planHash: string;
		};
		expect(body.shifts.map((shift) => shift.classId)).toEqual(["cls-b"]);
		expect(body.keptCompleted).toEqual([
			{ classId: "cls-a", className: "Lớp A", date: F3, sessionOrdinal: 3 },
		]);

		const applyRes = await apply(app, { ...draft(), planHash: body.planHash });
		expect(applyRes.status).toBe(200);
		const applyBody = (await applyRes.json()) as { shiftedCount: number };
		expect(applyBody.shiftedCount).toBe(1);

		// Cả 2 dòng của lớp A tại F3 giữ nguyên status — không bị đánh holiday.
		const classARows = await db
			.select({
				enrollmentId: schema.lesson.enrollmentId,
				status: schema.lesson.status,
			})
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.date, F3), eq(schema.lesson.classId, "cls-a")),
			);
		expect(classARows).toHaveLength(2);
		expect(classARows).toContainEqual({
			enrollmentId: "enr-a1",
			status: "completed",
		});
		expect(classARows).toContainEqual({
			enrollmentId: "enr-a2",
			status: "upcoming",
		});
		// Không có holiday_session_shift nào cho buổi trộn của lớp A.
		const shiftsA = await db
			.select({ id: schema.holidaySessionShift.id })
			.from(schema.holidaySessionShift)
			.where(eq(schema.holidaySessionShift.classId, "cls-a"));
		expect(shiftsA).toHaveLength(0);
	});
});
// #454 D9: apply notify=true phát holiday_created vào hàng đợi thông báo
// (Email + In-app) cho học viên các lớp bị ảnh hưởng; notify=false thì không.
describe("holiday_created qua hàng đợi thông báo (#454 D9)", () => {
	test("apply notify=true → mỗi học viên active của lớp bị ảnh hưởng 1 bản ghi, khóa theo holidayId", async () => {
		const app = createApp();
		const planHash = await previewHash(app, draft());
		const res = await apply(app, { ...draft(), planHash });
		expect(res.status).toBe(200);
		const { holidayId } = (await res.json()) as { holidayId: string };

		const rows = await db.select().from(schema.notificationRecord);
		// Lớp bị ảnh hưởng: cls-a (s-1, s-2) + cls-b (s-1) — unique theo học viên.
		expect(rows).toHaveLength(2);
		expect([...rows].map((r) => r.studentId).sort()).toEqual(["s-1", "s-2"]);
		for (const row of rows) {
			expect(row.eventType).toBe("holiday_created");
			expect(row.eventGroup).toBe("schedule");
			expect(row.idempotencyKey).toBe(
				`holiday_created:${holidayId}:${row.studentId}`,
			);
			// Học viên seed không có email → chỉ in_app → sent ngay.
			expect(row.status).toBe("sent");
			expect(row.linkPath).toBe("/classes");
		}
	});

	test("apply notify=false → không tạo notification_record", async () => {
		const app = createApp();
		const body = { ...draft(), notify: false };
		const planHash = await previewHash(app, body);
		const res = await apply(app, { ...body, planHash });
		expect(res.status).toBe(200);
		const rows = await db.select().from(schema.notificationRecord);
		expect(rows).toHaveLength(0);
	});

	test("học viên có email → thư qua mailer với link tuyệt đối (studentOrigin)", async () => {
		await db
			.update(schema.student)
			.set({ email: "s1@parent.local" })
			.where(eq(schema.student.id, "s-1"));
		const sentInputs: Parameters<Mailer["send"]>[0][] = [];
		const app = createApp(db, {
			mailer: {
				send: async (input) => {
					sentInputs.push(input);
				},
			},
			studentOrigin: "https://portal.test",
		});
		const planHash = await previewHash(app, draft());
		const res = await apply(app, { ...draft(), planHash });
		expect(res.status).toBe(200);

		// s-1 có email → 1 thư; s-2 không email → chỉ in-app.
		expect(sentInputs).toHaveLength(1);
		const input = sentInputs[0];
		if (!input) throw new Error("mailer was not called");
		expect(input.to).toBe("s1@parent.local");
		expect(input.subject).toBe("Thông báo lịch nghỉ");
		expect(input.text).toContain("Nghỉ lễ giữa khóa");
		expect(input.text).toContain("https://portal.test/classes");

		const rows = await db.select().from(schema.notificationRecord);
		expect(rows).toHaveLength(2);
		const emailed = rows.find((r) => r.studentId === "s-1");
		// Không có runInBackground trong test app → deliver chạy đồng bộ,
		// mailer OK → sent ngay (đúng máy trạng thái D4).
		expect(emailed?.status).toBe("sent");
	});
});

/** Preview rồi trả planHash — helper cho các test apply của #454. */
async function previewHash(app: ServerApp, body: Record<string, unknown>) {
	const res = await preview(app, body);
	expect(res.status).toBe(200);
	const { planHash } = (await res.json()) as { planHash: string };
	return planHash;
}

async function deleteHolidayReq(
	app: ServerApp,
	holidayId: string,
	headers: Record<string, string> = TEACHER,
) {
	return app.request(`/api/holidays/${holidayId}`, {
		method: "DELETE",
		headers,
	});
}

describe("TOS-13 Phase 2: apply mode cancel + DELETE hoàn tác + activation D7 + snapshot", () => {
	test("apply mode cancel: buổi trùng thành cancelled, không sinh lesson mới, max(date) không đổi, có holiday_session_cancel và notif", async () => {
		const app = createApp();
		const maxBefore = await db
			.select({ classId: schema.lesson.classId, date: schema.lesson.date })
			.from(schema.lesson);
		const maxByClassBefore = new Map<string, string>();
		for (const r of maxBefore) {
			if (!r.date) continue;
			const cur = maxByClassBefore.get(r.classId);
			if (!cur || r.date > cur) maxByClassBefore.set(r.classId, r.date);
		}

		const cancelDraft = { ...draft(), mode: "cancel" as const };
		const prevRes = await preview(app, cancelDraft);
		expect(prevRes.status).toBe(200);
		const prevBody = (await prevRes.json()) as {
			shifts: unknown[];
			cancellations: Array<{
				classId: string;
				className: string;
				date: string;
				sessionOrdinal: number;
			}>;
			affectedClassCount: number;
			planHash: string;
		};
		expect(prevBody.shifts).toEqual([]);
		expect(prevBody.cancellations).toHaveLength(2);
		expect(prevBody.affectedClassCount).toBe(2);

		const applyRes = await apply(app, {
			...cancelDraft,
			planHash: prevBody.planHash,
		});
		expect(applyRes.status).toBe(200);
		const applyBody = (await applyRes.json()) as {
			holidayId: string;
			shiftedCount: number;
			cancelledCount: number;
			classCount: number;
		};
		expect(applyBody.shiftedCount).toBe(0);
		expect(applyBody.cancelledCount).toBe(2);
		expect(applyBody.classCount).toBe(2);

		const afterRows = await db
			.select({
				classId: schema.lesson.classId,
				date: schema.lesson.date,
				status: schema.lesson.status,
			})
			.from(schema.lesson);
		expect(afterRows).toHaveLength(maxBefore.length);
		for (const r of afterRows.filter((row) => row.date === F3)) {
			expect(r.status).toBe("cancelled");
		}
		const maxByClassAfter = new Map<string, string>();
		for (const r of afterRows) {
			if (!r.date) continue;
			const cur = maxByClassAfter.get(r.classId);
			if (!cur || r.date > cur) maxByClassAfter.set(r.classId, r.date);
		}
		expect(maxByClassAfter).toEqual(maxByClassBefore);

		const cancels = await db.select().from(schema.holidaySessionCancel);
		expect(cancels).toHaveLength(2);
		expect(cancels.map((c) => c.classId).sort()).toEqual(["cls-a", "cls-b"]);
		for (const c of cancels) {
			expect(c.date).toBe(F3);
			expect(c.holidayId).toBe(applyBody.holidayId);
		}
		const shifts = await db.select().from(schema.holidaySessionShift);
		expect(shifts).toHaveLength(0);

		const notifs = await db.select().from(schema.notif);
		expect(
			notifs.some((n) =>
				n.text.includes("Lịch nghỉ «Nghỉ lễ giữa khóa»: hủy 2 buổi của 2 lớp"),
			),
		).toBe(true);
	});

	test("apply mode cancel: buổi đã điểm danh ở lớp A giữ nguyên, chỉ hủy lớp B", async () => {
		await db
			.update(schema.lesson)
			.set({ status: "completed" })
			.where(
				and(
					eq(schema.lesson.classId, "cls-a"),
					eq(schema.lesson.date, F3),
					eq(schema.lesson.enrollmentId, "enr-a1"),
				),
			);
		const app = createApp();
		const cancelDraft = { ...draft(), mode: "cancel" as const };
		const planHash = await previewHash(app, cancelDraft);
		const res = await apply(app, { ...cancelDraft, planHash });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			cancelledCount: number;
			classCount: number;
		};
		expect(body.cancelledCount).toBe(1);
		expect(body.classCount).toBe(1);

		const f3A = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, "cls-a"), eq(schema.lesson.date, F3)),
			);
		expect(f3A.map((r) => r.status).sort()).toEqual(["completed", "upcoming"]);
	});

	test("apply mode cancel không trúng buổi nào → 422 no-sessions", async () => {
		const app = createApp();
		const res = await apply(app, {
			...draft(),
			mode: "cancel",
			fromDate: addDaysISO(F1, 1),
			toDate: addDaysISO(F1, 2),
			planHash: "any",
		});
		expect(res.status).toBe(422);
		const errBody = (await res.json()) as { reason: string };
		expect(errBody.reason).toBe("no-sessions");
	});

	test("DELETE kỳ nghỉ shift tương lai: buổi gốc về upcoming, buổi bù bị xóa, bảng con trống, đếm buổi không-holiday giữ nguyên", async () => {
		const app = createApp();
		const beforeCounts = await perEnrollmentCounts();
		const planHash = await previewHash(app, draft());
		const applyRes = await apply(app, { ...draft(), planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const delRes = await deleteHolidayReq(app, holidayId);
		expect(delRes.status).toBe(200);
		const delBody = (await delRes.json()) as {
			restoredCount: number;
			removedMakeupCount: number;
		};
		expect(delBody).toEqual({ restoredCount: 2, removedMakeupCount: 2 });

		const f3Rows = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F3));
		expect(f3Rows).toHaveLength(3);
		expect(f3Rows.every((r) => r.status === "upcoming")).toBe(true);

		const f9Rows = await db
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F9));
		expect(f9Rows).toHaveLength(0);

		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(0);
		expect(await db.select().from(schema.holidaySessionShift)).toHaveLength(0);
		expect(await perEnrollmentCounts()).toEqual(beforeCounts);

		const notifs = await db.select().from(schema.notif);
		expect(
			notifs.some((n) =>
				n.text.includes("Đã xóa kỳ nghỉ «Nghỉ lễ giữa khóa»: khôi phục 2 buổi"),
			),
		).toBe(true);
	});

	test("DELETE kỳ nghỉ shift: liên kết tài liệu đã gắn vào buổi bù bị dọn cùng buổi bù", async () => {
		const app = createApp();
		const planHash = await previewHash(app, draft());
		const applyRes = await apply(app, { ...draft(), planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const makeupRows = await db
			.select({ classId: schema.lesson.classId, orgId: schema.lesson.orgId })
			.from(schema.lesson)
			.where(eq(schema.lesson.date, F9));
		const makeup = makeupRows[0];
		if (!makeup) throw new Error("expected a makeup lesson");
		await db.insert(schema.material).values({
			id: "mat-holiday",
			orgId: makeup.orgId,
			kind: "link",
			url: "https://example.com/doc",
			title: "Tài liệu buổi bù",
			createdBy: "teacher-1",
		});
		await db.insert(schema.lessonMaterial).values({
			orgId: makeup.orgId,
			classId: makeup.classId,
			date: F9,
			materialId: "mat-holiday",
		});

		const delRes = await deleteHolidayReq(app, holidayId);
		expect(delRes.status).toBe(200);

		expect(await db.select().from(schema.lessonMaterial)).toHaveLength(0);
		expect(
			await db
				.select({ id: schema.material.id })
				.from(schema.material)
				.where(eq(schema.material.id, "mat-holiday")),
		).toHaveLength(1);
	});

	test("DELETE kỳ nghỉ cancel tương lai: chỉ khôi phục buổi trong holiday_session_cancel, buổi GV hủy tay cùng ngày ở lớp khác giữ cancelled", async () => {
		const app = createApp();
		// GV hủy tay lớp B tại F3 trước khi tạo kỳ nghỉ cancel cho riêng lớp A.
		await db
			.update(schema.lesson)
			.set({ status: "cancelled" })
			.where(
				and(eq(schema.lesson.classId, "cls-b"), eq(schema.lesson.date, F3)),
			);

		const cancelDraft = {
			...draft(),
			mode: "cancel" as const,
			scope: "classes" as const,
			classIds: ["cls-a"],
		};
		const planHash = await previewHash(app, cancelDraft);
		const applyRes = await apply(app, { ...cancelDraft, planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const delRes = await deleteHolidayReq(app, holidayId);
		expect(delRes.status).toBe(200);
		expect(await delRes.json()).toEqual({
			restoredCount: 1,
			removedMakeupCount: 0,
		});

		const f3A = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, "cls-a"), eq(schema.lesson.date, F3)),
			);
		expect(f3A.every((r) => r.status === "upcoming")).toBe(true);

		const f3B = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, "cls-b"), eq(schema.lesson.date, F3)),
			);
		expect(f3B.every((r) => r.status === "cancelled")).toBe(true);
		expect(await db.select().from(schema.holidaySessionCancel)).toHaveLength(0);
	});

	test("DELETE kỳ nghỉ có fromDate <= hôm nay → 422 holiday-started, DB không đổi", async () => {
		const app = createApp();
		await db.insert(schema.organizationHoliday).values({
			id: "hol-today",
			orgId: "org-1",
			name: "Nghỉ bắt đầu hôm nay",
			fromDate: TODAY,
			toDate: F3,
			scope: "org",
			mode: "shift",
			notify: false,
			createdByUserId: "t-1",
		});
		const res = await deleteHolidayReq(app, "hol-today");
		expect(res.status).toBe(422);
		const errBody = (await res.json()) as { reason: string };
		expect(errBody.reason).toBe("holiday-started");
		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(1);
	});

	test("DELETE kỳ nghỉ shift khi buổi bù có dòng completed → 409 makeup-touched kèm danh sách, DB không đổi", async () => {
		const app = createApp();
		const planHash = await previewHash(app, draft());
		const applyRes = await apply(app, { ...draft(), planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		// Điểm danh 1 dòng buổi bù của lớp A tại F9.
		await db
			.update(schema.lesson)
			.set({ status: "completed" })
			.where(
				and(
					eq(schema.lesson.classId, "cls-a"),
					eq(schema.lesson.date, F9),
					eq(schema.lesson.enrollmentId, "enr-a1"),
				),
			);

		const res = await deleteHolidayReq(app, holidayId);
		expect(res.status).toBe(409);
		const body = (await res.json()) as {
			reason: string;
			touched: Array<{ classId: string; makeupDate: string }>;
		};
		expect(body.reason).toBe("makeup-touched");
		expect(body.touched).toEqual([{ classId: "cls-a", makeupDate: F9 }]);

		// DB không đổi: kỳ nghỉ và shift vẫn còn, buổi gốc vẫn holiday.
		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(1);
		expect(await db.select().from(schema.holidaySessionShift)).toHaveLength(2);
		const f3B = await db
			.select({ status: schema.lesson.status })
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, "cls-b"), eq(schema.lesson.date, F3)),
			);
		expect(f3B.every((r) => r.status === "holiday")).toBe(true);
	});

	test("DELETE kỳ nghỉ thuộc org khác hoặc không tồn tại → 404", async () => {
		const app = createApp();
		const planHash = await previewHash(app, draft());
		const applyRes = await apply(app, { ...draft(), planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const crossOrg = await deleteHolidayReq(app, holidayId, TEACHER_ORG2);
		expect(crossOrg.status).toBe(404);
		expect(await db.select().from(schema.organizationHoliday)).toHaveLength(1);

		const missing = await deleteHolidayReq(app, "hol-missing");
		expect(missing.status).toBe(404);
	});

	test("D7: kích hoạt học viên sau kỳ nghỉ cancel → dòng ở ngày hủy là cancelled, không sinh buổi bù", async () => {
		const app = createApp();
		await db.insert(schema.student).values({
			id: "s-3",
			orgId: "org-1",
			name: "Phúc",
		});
		await db.insert(schema.enrollment).values({
			id: "enr-a3",
			orgId: "org-1",
			classId: "cls-a",
			studentId: "s-3",
			status: "invited",
		});

		const cancelDraft = {
			...draft(),
			mode: "cancel" as const,
			scope: "classes" as const,
			classIds: ["cls-a"],
		};
		const planHash = await previewHash(app, cancelDraft);
		const applyRes = await apply(app, { ...cancelDraft, planHash });
		expect(applyRes.status).toBe(200);

		const activation = await activateEnrollment(db, "org-1", "enr-a3");
		expect(activation).toEqual({ ok: true });

		const rows = await db
			.select({ date: schema.lesson.date, status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-a3"));
		expect(rows).toHaveLength(8);
		expect(rows.find((r) => r.date === F3)?.status).toBe("cancelled");
		expect(rows.filter((r) => r.status === "upcoming")).toHaveLength(7);
	});

	test("snapshot trả holidays[].mode và holidayCancels", async () => {
		const app = createApp();
		const cancelDraft = {
			...draft(),
			mode: "cancel" as const,
			scope: "classes" as const,
			classIds: ["cls-a"],
		};
		const planHash = await previewHash(app, cancelDraft);
		const applyRes = await apply(app, { ...cancelDraft, planHash });
		const { holidayId } = (await applyRes.json()) as { holidayId: string };

		const snapRes = await app.request("/api/kernel", { headers: TEACHER });
		expect(snapRes.status).toBe(200);
		const snap = (await snapRes.json()) as {
			holidays: Array<{ id: string; mode: string }>;
			holidayCancels: Array<{
				holidayId: string;
				classId: string;
				date: string;
			}>;
		};
		expect(snap.holidays).toEqual([
			expect.objectContaining({ id: holidayId, mode: "cancel" }),
		]);
		expect(snap.holidayCancels).toEqual([
			{ holidayId, classId: "cls-a", date: F3 },
		]);
	});
});
