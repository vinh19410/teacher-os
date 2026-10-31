import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { vietnamDateTimeMs } from "@teacher-os/api/vietnam-date";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import {
	assignmentPrompt,
	classAssignment,
	classAssignmentTarget,
	classTable,
	enrollment,
	membership,
	notificationRecord,
	organization,
	organizationHoliday,
	organizationHolidayClass,
	quizAttempt,
	selfStudyPlan,
	selfStudyPlanDay,
	selfStudyPlanItem,
	student,
	user,
} from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp, type Db } from "../app";
import { loadSnapshot } from "../routes/snapshot";
import { runSelfStudyPlanTick, sspAssignmentId } from "./self-study-plan";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(
	__dirname,
	"../../../../packages/db/src/migrations",
);

async function makeDb() {
	const client = createClient({ url: ":memory:" });
	const rawExecute = client.execute.bind(client);
	// Guard D1 100-bind-parameter limit on every statement executed (#526 Kongming guard)
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
function makeMailer(yieldMicrotask = false): {
	mailer: Mailer;
	sent: MailInput[];
	setShouldFail: (v: boolean) => void;
} {
	const sent: MailInput[] = [];
	let shouldFail = false;
	return {
		sent,
		setShouldFail(v: boolean) {
			shouldFail = v;
		},
		mailer: {
			async send(mail) {
				if (yieldMicrotask) {
					await Promise.resolve();
				}
				if (shouldFail) {
					throw new Error("simulated SMTP failure");
				}
				sent.push(mail);
			},
		},
	};
}
describe("runSelfStudyPlanTick (#526)", () => {
	let db: Db;
	const orgId = "org-1";
	const classId = "cls-1";
	const planId = "ssp-1";

	beforeEach(async () => {
		db = await makeDb();
		const now = new Date("2026-11-01T00:00:00Z");
		await db.insert(organization).values({
			id: orgId,
			name: "Trung tâm IELTS A",
			createdAt: now,
		});
		await db.insert(user).values({
			id: "u-teacher",
			name: "Cô Lan",
			email: "teacher@example.com",
			emailVerified: true,
			role: "teacher",
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(membership).values({
			id: "mem-1",
			orgId,
			userId: "u-teacher",
			role: "owner",
			createdAt: now,
		});
		await db.insert(classTable).values({
			id: classId,
			orgId,
			name: "IELTS 6.5 T2-T4-T6",
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
		});
		for (const idx of [1, 2]) {
			await db.insert(student).values({
				id: `st-${idx}`,
				orgId,
				name: `Học viên ${idx}`,
				email: `st${idx}@example.com`,
				phone: `090000000${idx}`,
				createdAt: now,
			});
			await db.insert(enrollment).values({
				id: `enr-${idx}`,
				orgId,
				classId,
				studentId: `st-${idx}`,
				status: "active",
				createdAt: now,
			});
		}
		for (const idx of [1, 2]) {
			await db.insert(assignmentPrompt).values({
				id: `pr-${idx}`,
				orgId,
				task: "part1",
				genre: "multiple_choice",
				skill: "reading",
				part: "Part 1",
				type: "Multiple choice",
				title: `Đề Reading ngày ${idx}`,
				prompt: `Reading prompt ${idx}`,
				band: "6.5",
				questions: JSON.stringify([{ id: "q1", prompt: "Q1", answer: "A" }]),
				optionBank: "[]",
				note: "",
				status: "ready",
				createdAt: now,
			});
		}
	});

	async function seedSingleDayPlan(opts?: {
		date?: string;
		releaseTime?: string;
		dueTime?: string;
		holidayOverride?: boolean;
		itemPromptIds?: string[];
	}) {
		const date = opts?.date ?? "2026-11-02";
		const releaseTime = opts?.releaseTime ?? "06:00";
		const dueTime = opts?.dueTime ?? "17:00";
		const promptIds = opts?.itemPromptIds ?? ["pr-1"];
		const now = new Date("2026-11-01T00:00:00Z");

		await db.insert(selfStudyPlan).values({
			id: planId,
			orgId,
			classId,
			title: "Plan tháng 11",
			startDate: date,
			endDate: date,
			releaseTime,
			dueTime,
			status: "published",
			publishedAt: now,
			createdAt: now,
			updatedAt: now,
		});
		await db.insert(selfStudyPlanDay).values({
			id: `day-${date}`,
			orgId,
			planId,
			date,
			releaseAt: new Date(vietnamDateTimeMs(date, releaseTime)),
			dueAt: new Date(vietnamDateTimeMs(date, dueTime)),
			status: "pending",
			holidayOverride: opts?.holidayOverride ?? false,
			warning: "",
		});
		for (const [i, promptId] of promptIds.entries()) {
			await db.insert(selfStudyPlanItem).values({
				id: `item-${date}-${i + 1}`,
				orgId,
				planId,
				date,
				promptId,
				position: i,
				note: `Ghi chú ${i + 1}`,
			});
		}
	}

	it("T1: does not release before releaseAt; releases deterministic assignment + targets + notifications at releaseAt", async () => {
		await seedSingleDayPlan();
		const { mailer, sent } = makeMailer();

		// 05:55 VN on 2026-11-02 -> before releaseAt
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "05:55")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(await db.select().from(classAssignment)).toHaveLength(0);
		expect(sent).toHaveLength(0);

		// 06:00 VN on 2026-11-02 -> exact releaseAt
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		const assignments = await db.select().from(classAssignment);
		expect(assignments).toHaveLength(1);
		expect(assignments[0]?.id).toBe(sspAssignmentId("item-2026-11-02-1"));
		expect(assignments[0]?.planItemId).toBe("item-2026-11-02-1");
		expect(assignments[0]?.due).toBe("2026-11-02");
		expect(assignments[0]?.dueAt?.getTime()).toBe(
			vietnamDateTimeMs("2026-11-02", "17:00"),
		);

		const targets = await db.select().from(classAssignmentTarget);
		expect(targets).toHaveLength(2);
		expect(sent).toHaveLength(2);

		const [day] = await db.select().from(selfStudyPlanDay);
		expect(day?.status).toBe("released");
		expect(day?.notifiedAt).not.toBeNull();
	});

	it("T2: re-running and overlapping ticks are idempotent and send zero duplicate emails", async () => {
		await seedSingleDayPlan({ itemPromptIds: ["pr-1", "pr-2"] });
		const { mailer, sent } = makeMailer(true);
		const tickNow = new Date(vietnamDateTimeMs("2026-11-02", "06:00"));

		await Promise.all([
			runSelfStudyPlanTick({
				db,
				now: tickNow,
				mailer,
				studentOrigin: "http://localhost:8003",
				retryDelaysMs: [0, 0],
			}),
			runSelfStudyPlanTick({
				db,
				now: tickNow,
				mailer,
				studentOrigin: "http://localhost:8003",
				retryDelaysMs: [0, 0],
			}),
		]);

		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:05")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});

		expect(await db.select().from(classAssignment)).toHaveLength(2);
		expect(await db.select().from(classAssignmentTarget)).toHaveLength(4);
		expect(await db.select().from(notificationRecord)).toHaveLength(2);
		expect(sent).toHaveLength(2);
	});

	it("T3: catches up missed cron tick when run between releaseAt and dueAt", async () => {
		await seedSingleDayPlan();
		const { mailer, sent } = makeMailer();

		// Delayed tick at 06:25 VN (<= 17:00 dueAt)
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:25")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(await db.select().from(classAssignment)).toHaveLength(1);
		expect(sent).toHaveLength(2);
	});

	it("T4: marks day as missed and does not release assignments if tick runs after dueAt", async () => {
		await seedSingleDayPlan();
		const { mailer, sent } = makeMailer();

		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "17:05")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(await db.select().from(classAssignment)).toHaveLength(0);
		expect(sent).toHaveLength(0);

		const [day] = await db.select().from(selfStudyPlanDay);
		expect(day?.status).toBe("missed");
		expect(day?.warning).toContain("Quá hạn");
	});

	it("T5: skips holiday unless holidayOverride is true", async () => {
		await db.insert(organizationHoliday).values({
			id: "hol-1",
			orgId,
			name: "Nghỉ lễ Quốc khánh",
			fromDate: "2026-11-02",
			toDate: "2026-11-03",
			scope: "classes",
			mode: "cancel",
			notify: false,
			createdByUserId: "u-teacher",
			createdAt: new Date("2026-11-01T00:00:00Z"),
		});
		await db.insert(organizationHolidayClass).values({
			id: "hol-cls-1",
			holidayId: "hol-1",
			classId,
		});

		await seedSingleDayPlan({ holidayOverride: false });
		const { mailer, sent } = makeMailer();

		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		const [daySkipped] = await db.select().from(selfStudyPlanDay);
		expect(daySkipped?.status).toBe("skipped");
		expect(daySkipped?.warning).toContain("Nghỉ lễ Quốc khánh");
		expect(await db.select().from(classAssignment)).toHaveLength(0);
		expect(sent).toHaveLength(0);

		// Now test with holidayOverride: true on 2026-11-03
		await db.delete(selfStudyPlan);
		await seedSingleDayPlan({
			date: "2026-11-03",
			holidayOverride: true,
		});
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-03", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		const [dayReleased] = await db.select().from(selfStudyPlanDay);
		expect(dayReleased?.status).toBe("released");
		expect(await db.select().from(classAssignment)).toHaveLength(1);
		expect(sent).toHaveLength(2);
	});

	it("T6: backfills mid-day new active student on open released day without backfilling past days or duplicating notifications", async () => {
		const now = new Date("2026-11-01T00:00:00Z");
		await db.insert(selfStudyPlan).values({
			id: planId,
			orgId,
			classId,
			title: "Plan 2 ngày",
			startDate: "2026-11-01",
			endDate: "2026-11-02",
			releaseTime: "06:00",
			dueTime: "17:00",
			status: "published",
			publishedAt: now,
			createdAt: now,
			updatedAt: now,
		});
		for (const [idx, d] of ["2026-11-01", "2026-11-02"].entries()) {
			await db.insert(selfStudyPlanDay).values({
				id: `day-${d}`,
				orgId,
				planId,
				date: d,
				releaseAt: new Date(vietnamDateTimeMs(d, "06:00")),
				dueAt: new Date(vietnamDateTimeMs(d, "17:00")),
				status: "pending",
				holidayOverride: false,
				warning: "",
			});
			await db.insert(selfStudyPlanItem).values({
				id: `item-${d}`,
				orgId,
				planId,
				date: d,
				promptId: `pr-${idx + 1}`,
				position: 0,
				note: "",
			});
		}

		const { mailer, sent } = makeMailer();
		// Day 1 release
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-01", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		// Day 2 release at 06:00 (plan also transitions to completed at 06:00 on Day 2)
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(sent).toHaveLength(4); // 2 students * 2 days

		// At 10:00 on 2026-11-02 (before 17:00 dueAt), student st-3 becomes active
		await db.insert(student).values({
			id: "st-3",
			orgId,
			name: "Học viên 3",
			email: "st3@example.com",
			phone: "0900000003",
			createdAt: now,
		});
		await db.insert(enrollment).values({
			id: "enr-3",
			orgId,
			classId,
			studentId: "st-3",
			status: "active",
			createdAt: now,
		});

		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "10:05")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});

		// st-3 receives target ONLY for 2026-11-02, NOT 2026-11-01
		const targetsDay1 = await db
			.select()
			.from(classAssignmentTarget)
			.where(
				eq(
					classAssignmentTarget.assignmentId,
					sspAssignmentId("item-2026-11-01"),
				),
			);
		const targetsDay2 = await db
			.select()
			.from(classAssignmentTarget)
			.where(
				eq(
					classAssignmentTarget.assignmentId,
					sspAssignmentId("item-2026-11-02"),
				),
			);
		expect(targetsDay1).toHaveLength(2);
		expect(targetsDay2).toHaveLength(3);
		expect(sent).toHaveLength(5); // +1 email only for st-3 on Day 2
	});

	it("T7: skips prompt that lost ready status and records warning while releasing remaining ready prompts", async () => {
		await seedSingleDayPlan({ itemPromptIds: ["pr-1", "pr-2"] });
		// pr-1 loses ready status before releaseAt
		await db
			.update(assignmentPrompt)
			.set({ status: "draft" })
			.where(eq(assignmentPrompt.id, "pr-1"));

		const { mailer, sent } = makeMailer();
		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});

		const assignments = await db.select().from(classAssignment);
		expect(assignments).toHaveLength(1);
		expect(assignments[0]?.id).toBe(sspAssignmentId("item-2026-11-02-2"));

		const [day] = await db.select().from(selfStudyPlanDay);
		expect(day?.status).toBe("released");
		expect(day?.warning).toContain("Đề Reading ngày 1");
		expect(sent).toHaveLength(2);

		const notifs = await db.select().from(notificationRecord);
		expect(notifs[0]?.linkPath).toBe(
			`/learn/quizzes/${sspAssignmentId("item-2026-11-02-2")}`,
		);
	});

	it("T8: retries overdue queued notifications (> 5 min) and recovers unnotified released days", async () => {
		await seedSingleDayPlan();
		const { mailer, sent, setShouldFail } = makeMailer();
		setShouldFail(true);

		const t0 = new Date(vietnamDateTimeMs("2026-11-02", "06:00"));
		await runSelfStudyPlanTick({
			db,
			now: t0,
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(sent).toHaveLength(0);
		// Force createdAt to t0 and status back to 'queued' with retryCount = 1 to simulate a stuck queued row
		await db
			.update(notificationRecord)
			.set({ status: "queued", retryCount: 1, createdAt: t0 });

		setShouldFail(false);
		// Tick 6 minutes later -> Step 3 sweeps stale queued records and delivers
		await runSelfStudyPlanTick({
			db,
			now: new Date(t0.getTime() + 6 * 60_000),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});
		expect(sent).toHaveLength(2);
		const records = await db.select().from(notificationRecord);
		expect(records.every((r) => r.status === "sent")).toBe(true);
	});

	it("T9: auto-transitions plan to completed only when 0 pending days remain and todayVN >= endDate", async () => {
		await seedSingleDayPlan({ date: "2026-11-02" });
		const { mailer } = makeMailer();

		await runSelfStudyPlanTick({
			db,
			now: new Date(vietnamDateTimeMs("2026-11-02", "06:00")),
			mailer,
			studentOrigin: "http://localhost:8003",
			retryDelaysMs: [0, 0],
		});

		const [plan] = await db.select().from(selfStudyPlan);
		expect(plan?.status).toBe("completed");
		expect(plan?.completedAt).not.toBeNull();
	});

	it("T10: excludes self-study assignments from the 200 manual assignment cap and from loadSnapshot", async () => {
		const now = new Date("2026-11-01T00:00:00Z");
		// Insert 205 self-study class_assignment rows (planItemId IS NOT NULL)
		for (let i = 1; i <= 205; i++) {
			const caId = `ca_ssp_bulk_${i}`;
			await db.insert(classAssignment).values({
				id: caId,
				orgId,
				classId,
				promptId: "pr-1",
				title: `Self Study ${i}`,
				due: "2026-11-02",
				dueAt: new Date(vietnamDateTimeMs("2026-11-02", "17:00")),
				planItemId: `item-bulk-${i}`,
				note: "",
				createdAt: now,
			});
			await db.insert(classAssignmentTarget).values({
				id: `cat_ssp_bulk_${i}_st1`,
				orgId,
				assignmentId: caId,
				studentId: "st-1",
				submittedAt: now.toISOString(),
			});
			await db.insert(quizAttempt).values({
				id: `att_ssp_bulk_${i}`,
				orgId,
				assignmentId: caId,
				studentId: "st-1",
				mode: "assignment",
				status: "submitted",
				questionsSnapshot: "[]",
				answers: "{}",
				essay: "",
				gradeFeedback: "",
				startedAt: now,
				submittedAt: now,
			});
		}

		// 1. Snapshot does not include any of the 205 self-study assignments
		const snap = await loadSnapshot(db, orgId);
		expect(snap.classAssignments).toHaveLength(0);

		// 2. Manual assignment creation via POST /api/classes/:id/assignments still succeeds!
		const app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: async () => ({
				userId: "u-teacher",
				userName: "Cô Lan",
				email: "teacher@example.com",
				role: "teacher",
				emailVerified: true,
			}),
			authHandler: async () => new Response("not found", { status: 404 }),
		});

		const res = await app.request(`/api/classes/${classId}/assignments`, {
			method: "POST",
			headers: {
				Origin: "http://localhost:8001",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				promptId: "pr-1",
				due: "2099-12-31",
				note: "Bài giao tay",
				studentIds: ["st-1"],
			}),
		});
		expect(res.status).toBe(201);
		const snapAfter = await loadSnapshot(db, orgId);
		expect(snapAfter.classAssignments).toHaveLength(1);
		expect(snapAfter.classAssignments[0]?.note).toBe("Bài giao tay");
	});
});
