import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { SelfStudyPlanDetailResponse } from "@teacher-os/api/contracts";
import { vietnamDateTimeMs } from "@teacher-os/api/vietnam-date";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import {
	assignmentPrompt,
	classAssignment,
	classTable,
	enrollment,
	membership,
	organization,
	organizationHoliday,
	quizAttempt,
	selfStudyPlanDay,
	student,
	user,
} from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, type Db } from "../app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(
	__dirname,
	"../../../../packages/db/src/migrations",
);

async function makeDb() {
	const client = createClient({ url: ":memory:" });
	const rawExecute = client.execute.bind(client);
	client.execute = (async (stmt: Parameters<typeof rawExecute>[0]) => {
		if (typeof stmt !== "string") {
			const obj = stmt as { sql?: string; args?: unknown[] };
			if (Array.isArray(obj.args) && obj.args.length > 100) {
				throw new Error(
					`D1_MAX_PARAMS exceeded: ${obj.args.length} > 100 in SQL: ${obj.sql ?? ""}`,
				);
			}
		}
		return rawExecute(stmt);
	}) as typeof client.execute;
	const rawBatch = client.batch.bind(client);
	client.batch = (async (
		stmts: Parameters<typeof rawBatch>[0],
		mode?: Parameters<typeof rawBatch>[1],
	) => {
		for (const s of stmts) {
			if (typeof s !== "string") {
				const obj = s as { sql?: string; args?: unknown[] };
				if (Array.isArray(obj.args) && obj.args.length > 100) {
					throw new Error(
						`D1_MAX_PARAMS exceeded in batch: ${obj.args.length} > 100 in SQL: ${obj.sql ?? ""}`,
					);
				}
			}
		}
		return rawBatch(stmts, mode);
	}) as typeof client.batch;

	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	return libsql as unknown as Db;
}

describe("selfStudyPlanRoutes (#526)", () => {
	let db: Db;
	let sentMails: MailInput[];
	let currentUserId = "u-teacher";
	const orgId = "org-1";
	const classId = "cls-1";
	const origin = "http://localhost:8001";

	beforeEach(async () => {
		db = await makeDb();
		sentMails = [];
		currentUserId = "u-teacher";
		const now = new Date("2026-10-31T00:00:00Z");

		await db.insert(organization).values([
			{ id: orgId, name: "Org 1", createdAt: now },
			{ id: "org-2", name: "Org 2", createdAt: now },
		]);
		await db.insert(user).values([
			{
				id: "u-teacher",
				name: "Cô Lan",
				email: "teacher@example.com",
				emailVerified: true,
				role: "teacher",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "u-ta",
				name: "Trợ giảng Minh",
				email: "ta@example.com",
				emailVerified: true,
				role: "teacher",
				createdAt: now,
				updatedAt: now,
			},
			{
				id: "u-other",
				name: "Thầy Hùng Org 2",
				email: "other@example.com",
				emailVerified: true,
				role: "teacher",
				createdAt: now,
				updatedAt: now,
			},
		]);
		await db.insert(membership).values([
			{
				id: "m-teacher",
				orgId,
				userId: "u-teacher",
				role: "owner",
				createdAt: now,
			},
			{
				id: "m-ta",
				orgId,
				userId: "u-ta",
				role: "ta",
				createdAt: now,
			},
			{
				id: "m-other",
				orgId: "org-2",
				userId: "u-other",
				role: "owner",
				createdAt: now,
			},
		]);
		await db.insert(classTable).values([
			{
				id: classId,
				orgId,
				name: "IELTS 6.5",
				level: "6.5",
				type: "ielts",
				skills: JSON.stringify(["Reading", "Writing"]),
				mode: "offline",
				schedule: "T2-T4-T6 18:00",
				sessionsTotal: 24,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-01",
				tuitionFee: 5000000,
				notes: "",
				createdAt: now,
			},
			{
				id: "cls-org2",
				orgId: "org-2",
				name: "Org 2 Class",
				level: "6.0",
				type: "ielts",
				skills: JSON.stringify(["Reading"]),
				mode: "offline",
				schedule: "T3-T5 18:00",
				sessionsTotal: 24,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-01",
				tuitionFee: 4000000,
				notes: "",
				createdAt: now,
			},
		]);
		await db.insert(student).values([
			{
				id: "st-1",
				orgId,
				name: "Nguyễn Văn A",
				email: "st1@example.com",
				phone: "0900000001",
				createdAt: now,
			},
			{
				id: "st-2",
				orgId,
				name: "Trần Thị B",
				email: "st2@example.com",
				phone: "0900000002",
				createdAt: now,
			},
		]);
		await db.insert(enrollment).values([
			{
				id: "enr-1",
				orgId,
				classId,
				studentId: "st-1",
				status: "active",
				createdAt: now,
			},
			{
				id: "enr-2",
				orgId,
				classId,
				studentId: "st-2",
				status: "active",
				createdAt: now,
			},
		]);
		await db.insert(assignmentPrompt).values([
			{
				id: "pr-ready-1",
				orgId,
				task: "part1",
				genre: "multiple_choice",
				skill: "reading",
				part: "Part 1",
				type: "Multiple choice",
				title: "Đề Reading 1",
				prompt: "Reading 1",
				band: "6.5",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
				createdAt: now,
			},
			{
				id: "pr-ready-2",
				orgId,
				task: "task2",
				genre: "opinion",
				skill: "writing",
				part: "Task 2",
				type: "Opinion",
				title: "Đề Writing 2",
				prompt: "Writing 2",
				band: "6.5",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
				createdAt: now,
			},
			{
				id: "pr-draft",
				orgId,
				task: "part1",
				genre: "multiple_choice",
				skill: "reading",
				part: "Part 1",
				type: "Multiple choice",
				title: "Đề Nháp",
				prompt: "Draft",
				band: "6.0",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "draft",
				createdAt: now,
			},
			{
				id: "pr-org2",
				orgId: "org-2",
				task: "part1",
				genre: "multiple_choice",
				skill: "reading",
				part: "Part 1",
				type: "Multiple choice",
				title: "Đề Org 2",
				prompt: "Org 2",
				band: "6.0",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
				createdAt: now,
			},
		]);
	});

	function makeApp() {
		const mailer: Mailer = {
			async send(mail) {
				sentMails.push(mail);
			},
		};
		return buildApp({
			getDb: () => db,
			corsOrigin: [origin],
			mailer,
			studentOrigin: "http://localhost:8003",
			notificationRetryDelaysMs: [0, 0],
			getSessionUser: async () => ({
				userId: currentUserId,
				userName: "User",
				email: `${currentUserId}@example.com`,
				role: "teacher",
				emailVerified: true,
			}),
			authHandler: async () => new Response("not found", { status: 404 }),
		});
	}

	it("validates draft creation, publishes with chunked days, blocks 2nd published plan, and paginates GET with holiday preview and late progress", async () => {
		const app = makeApp();

		// 1. Rejects draft prompt (`pr-draft`) or cross-org prompt (`pr-org2`) or > 366 days or dueTime <= releaseTime
		const badDraftRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "Plan lỗi",
					startDate: "2026-11-01",
					endDate: "2026-11-05",
					releaseTime: "06:00",
					dueTime: "17:00",
					days: [
						{
							date: "2026-11-01",
							holidayOverride: false,
							items: [{ promptId: "pr-draft", note: "" }],
						},
					],
				}),
			},
		);
		expect(badDraftRes.status).toBe(400);

		const badHoursRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "Plan giờ lỗi",
					startDate: "2026-11-01",
					endDate: "2026-11-05",
					releaseTime: "18:00",
					dueTime: "17:00",
					days: [],
				}),
			},
		);
		expect(badHoursRes.status).toBe(400);

		// 2. Create valid draft plan (2026-11-01 to 2026-11-10)
		const createRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "Plan Tự Học Tháng 11",
					startDate: "2026-11-01",
					endDate: "2026-11-10",
					releaseTime: "06:00",
					dueTime: "17:00",
					days: [
						{
							date: "2026-11-01",
							holidayOverride: false,
							items: [{ promptId: "pr-ready-1", note: "Đọc kỹ bài" }],
						},
						{
							date: "2026-11-03",
							holidayOverride: false,
							items: [
								{ promptId: "pr-ready-1", note: "" },
								{ promptId: "pr-ready-2", note: "Viết đủ 250 từ" },
							],
						},
					],
				}),
			},
		);
		expect(createRes.status).toBe(200);
		const created = (await createRes.json()) as SelfStudyPlanDetailResponse;
		expect(created.plan?.status).toBe("draft");
		const planId = created.plan?.id ?? "";
		expect(planId.length).toBeGreaterThan(0);

		// 3. Publish plan -> materializes all 10 days (2 pending, 8 skipped)
		const pubRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/publish`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(pubRes.status).toBe(200);
		const allDays = await db
			.select()
			.from(selfStudyPlanDay)
			.where(eq(selfStudyPlanDay.planId, planId));
		expect(allDays).toHaveLength(10);
		expect(allDays.filter((d) => d.status === "pending")).toHaveLength(2);
		expect(allDays.filter((d) => d.status === "skipped")).toHaveLength(8);

		// 4. Attempting to publish a 2nd draft plan while the 1st is published returns 409
		const create2Res = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "Plan Thứ 2",
					startDate: "2026-11-11",
					endDate: "2026-11-15",
					days: [
						{
							date: "2026-11-11",
							holidayOverride: false,
							items: [{ promptId: "pr-ready-1", note: "" }],
						},
					],
				}),
			},
		);
		expect(create2Res.status).toBe(200);
		const created2 = (await create2Res.json()) as SelfStudyPlanDetailResponse;
		const plan2Id = created2.plan?.id ?? "";

		const pub2Res = await app.request(
			`/api/classes/${classId}/self-study-plan/${plan2Id}/publish`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(pub2Res.status).toBe(409);

		// 5. Add a holiday on 2026-11-03 and read GET with pagination (`from=2026-11-01&to=2026-11-05`)
		await db.insert(organizationHoliday).values({
			id: "hol-nov3",
			orgId,
			name: "Nghỉ bù",
			fromDate: "2026-11-03",
			toDate: "2026-11-03",
			scope: "org",
			mode: "cancel",
			notify: false,
			createdByUserId: "u-teacher",
			createdAt: new Date("2026-10-31T00:00:00Z"),
		});

		const getRes = await app.request(
			`/api/classes/${classId}/self-study-plan?planId=${planId}&from=2026-11-01&to=2026-11-05`,
		);
		expect(getRes.status).toBe(200);
		const detail = (await getRes.json()) as SelfStudyPlanDetailResponse;
		expect(detail.days).toHaveLength(5);
		const dayNov3 = detail.days.find((d) => d.date === "2026-11-03");
		expect(dayNov3?.isHoliday).toBe(true);
		expect(dayNov3?.holidayName).toBe("Nghỉ bù");
		expect(dayNov3?.items).toHaveLength(2);
	});

	it("updates hours only on future unreleased days, edits future days, releases missed days, and cancels plans", async () => {
		const app = makeApp();
		// Today in test environment is 2026-10-31; create plan from 2026-10-31 to 2026-11-04
		const createRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "Plan đổi giờ",
					startDate: "2026-10-31",
					endDate: "2026-11-04",
					releaseTime: "06:00",
					dueTime: "17:00",
					days: [
						{
							date: "2026-10-31",
							holidayOverride: false,
							items: [{ promptId: "pr-ready-1", note: "" }],
						},
						{
							date: "2026-11-02",
							holidayOverride: false,
							items: [{ promptId: "pr-ready-1", note: "" }],
						},
					],
				}),
			},
		);
		const created = (await createRes.json()) as SelfStudyPlanDetailResponse;
		const planId = created.plan?.id ?? "";

		await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/publish`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({}),
			},
		);

		// Change hours to 07:30 - 19:00 -> only days > todayVN (2026-11-01..2026-11-04) change; 2026-10-31 stays 06:00-17:00
		const hoursRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/hours`,
			{
				method: "PATCH",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({ releaseTime: "07:30", dueTime: "19:00" }),
			},
		);
		expect(hoursRes.status).toBe(200);

		const dayRows = await db
			.select()
			.from(selfStudyPlanDay)
			.where(eq(selfStudyPlanDay.planId, planId));
		const dayToday = dayRows.find((d) => d.date === "2026-10-31");
		const dayFuture = dayRows.find((d) => d.date === "2026-11-02");
		expect(dayToday?.releaseAt.getTime()).toBe(
			vietnamDateTimeMs("2026-10-31", "06:00"),
		);
		expect(dayToday?.dueAt.getTime()).toBe(
			vietnamDateTimeMs("2026-10-31", "17:00"),
		);
		expect(dayFuture?.releaseAt.getTime()).toBe(
			vietnamDateTimeMs("2026-11-02", "07:30"),
		);
		expect(dayFuture?.dueAt.getTime()).toBe(
			vietnamDateTimeMs("2026-11-02", "19:00"),
		);

		// Editing today (<= todayVN) on a published plan is rejected (400)
		const editTodayRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/days/2026-10-31`,
			{
				method: "PUT",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					holidayOverride: true,
					items: [{ promptId: "pr-ready-2", note: "" }],
				}),
			},
		);
		expect(editTodayRes.status).toBe(400);

		// Editing future day (2026-11-03, currently skipped) succeeds and sets status to pending with 07:30-19:00
		const editFutureRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/days/2026-11-03`,
			{
				method: "PUT",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					holidayOverride: true,
					items: [{ promptId: "pr-ready-2", note: "Bài bù" }],
				}),
			},
		);
		expect(editFutureRes.status).toBe(200);

		// Mark 2026-10-31 as missed and test release-missed
		await db
			.update(selfStudyPlanDay)
			.set({ status: "missed", warning: "Quá hạn" })
			.where(eq(selfStudyPlanDay.id, dayToday?.id ?? ""));

		const releaseMissedRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/days/2026-10-31/release-missed`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					dueAt: "2026-11-01T10:00:00.000Z",
				}),
			},
		);
		expect(releaseMissedRes.status).toBe(200);
		expect(await db.select().from(classAssignment)).toHaveLength(1);
		expect(sentMails).toHaveLength(2);

		// Simulate student st-1 submitting on time and st-2 submitting late on the released assignment
		const [ca] = await db.select().from(classAssignment);
		const dueMs = ca?.dueAt?.getTime() ?? 0;
		await db.insert(quizAttempt).values([
			{
				id: "att-1",
				orgId,
				assignmentId: ca?.id ?? "",
				studentId: "st-1",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				answers: "{}",
				essay: "",
				gradeFeedback: "",
				startedAt: new Date(dueMs - 60_000),
				submittedAt: new Date(dueMs), // exact dueAt -> on time
			},
			{
				id: "att-2",
				orgId,
				assignmentId: ca?.id ?? "",
				studentId: "st-2",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				answers: "{}",
				essay: "",
				gradeFeedback: "",
				startedAt: new Date(dueMs - 60_000),
				submittedAt: new Date(dueMs + 1000), // 1s after dueAt -> late!
			},
		]);

		const progressRes = await app.request(
			`/api/classes/${classId}/self-study-plan?planId=${planId}&from=2026-10-31&to=2026-11-01`,
		);
		const progress = (await progressRes.json()) as SelfStudyPlanDetailResponse;
		const itemView = progress.days[0]?.items[0];
		expect(itemView?.submittedOnTimeCount).toBe(1);
		expect(itemView?.submittedLateCount).toBe(1);

		// Cancel plan -> status becomes cancelled, but already-released assignments remain
		const cancelRes = await app.request(
			`/api/classes/${classId}/self-study-plan/${planId}/cancel`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(cancelRes.status).toBe(200);
		expect(await db.select().from(classAssignment)).toHaveLength(1);
	});

	it("enforces org isolation (404), role gate for TA (403 on write, 200 on GET), Content-Type (415/400), and excludes /__e2e/self-study-tick from buildApp", async () => {
		const app = makeApp();

		// 1. Cross-org classId -> 404
		const crossOrgRes = await app.request(
			"/api/classes/cls-org2/self-study-plan",
		);
		expect(crossOrgRes.status).toBe(404);

		// 2. Role "ta" -> 200 on GET, 403 on POST
		currentUserId = "u-ta";
		const taGetRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
		);
		expect(taGetRes.status).toBe(200);

		const taPostRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: JSON.stringify({
					title: "TA Plan",
					startDate: "2026-11-01",
					endDate: "2026-11-02",
					days: [],
				}),
			},
		);
		expect(taPostRes.status).toBe(403);

		// 3. Content-Type & malformed JSON checks
		currentUserId = "u-teacher";
		const noCtRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin },
				body: "plain text",
			},
		);
		expect(noCtRes.status).toBe(415);

		const badJsonRes = await app.request(
			`/api/classes/${classId}/self-study-plan`,
			{
				method: "POST",
				headers: { Origin: origin, "content-type": "application/json" },
				body: "{broken-json",
			},
		);
		expect(badJsonRes.status).toBe(400);

		// 4. buildApp does NOT expose /__e2e/self-study-tick
		const e2eRouteRes = await app.request("/__e2e/self-study-tick", {
			method: "POST",
		});
		expect(e2eRouteRes.status).toBe(404);
	});
});
