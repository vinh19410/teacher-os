import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { vietnamDateTimeMs } from "@teacher-os/api/vietnam-date";
import { assignmentPrompt } from "@teacher-os/db/schema/assignment-prompt";
import { classTable } from "@teacher-os/db/schema/class";
import {
	classAssignment,
	classAssignmentTarget,
} from "@teacher-os/db/schema/class-assignment";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import * as schema from "@teacher-os/db/schema/index";
import { organization } from "@teacher-os/db/schema/organization";
import {
	organizationHoliday,
	organizationHolidayClass,
} from "@teacher-os/db/schema/organization-holiday";
import { student } from "@teacher-os/db/schema/student";
import {
	libraryExercise,
	studyPack,
	studyPackItem,
} from "@teacher-os/db/schema/study-pack";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import type { Db } from "../app";
import {
	assignStudyPackToClass,
	backfillStudyPackTargetsForStudent,
	cancelClassStudyPack,
	computeStudyPackSchedule,
	loadClassStudyPacks,
} from "./study-pack-assign";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

describe("study-pack-assign (schedule, assign, cancel, backfill)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(organization).values({
			id: "org-assign-1",
			name: "Org Assign 1",
			createdAt: new Date(),
		});

		await db.insert(classTable).values([
			{
				id: "cls-assign-1",
				orgId: "org-assign-1",
				name: "IELTS 6.5",
				level: "6.5",
				type: "ielts",
				skills: '["reading","listening"]',
				mode: "Online",
				schedule: '{"days":[1,3,5],"start":"18:00","end":"20:00"}',
				sessionsTotal: 24,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-01",
				notes: "",
			},
			{
				id: "cls-assign-other",
				orgId: "org-assign-1",
				name: "Other Class",
				level: "6.0",
				type: "ielts",
				skills: '["reading"]',
				mode: "Online",
				schedule: '{"days":[2,4],"start":"18:00","end":"20:00"}',
				sessionsTotal: 12,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-01",
				notes: "",
			},
		]);

		await db.insert(student).values([
			{
				id: "stu-assign-1",
				orgId: "org-assign-1",
				name: "Student 1",
				phone: "0901111111",
				email: "stu1@assign.local",
				zalo: "",
				parentName: "",
				parentPhone: "",
			},
			{
				id: "stu-assign-late",
				orgId: "org-assign-1",
				name: "Student Late",
				phone: "0902222222",
				email: "stulate@assign.local",
				zalo: "",
				parentName: "",
				parentPhone: "",
			},
		]);

		await db.insert(enrollment).values([
			{
				id: "enr-assign-1",
				orgId: "org-assign-1",
				classId: "cls-assign-1",
				studentId: "stu-assign-1",
				status: "active",
			},
			{
				id: "enr-assign-late",
				orgId: "org-assign-1",
				classId: "cls-assign-1",
				studentId: "stu-assign-late",
				status: "invited",
			},
		]);

		// Org holiday on 2026-11-10..2026-11-11 (2 consecutive days)
		// Class-scoped holiday on 2026-11-13 for cls-assign-1
		// Class-scoped holiday on 2026-11-14 for cls-assign-other (should not affect cls-assign-1)
		await db.insert(organizationHoliday).values([
			{
				id: "hol-org-1",
				orgId: "org-assign-1",
				name: "Nghỉ toàn trung tâm",
				fromDate: "2026-11-10",
				toDate: "2026-11-11",
				scope: "org",
				mode: "shift",
				createdByUserId: "user-1",
			},
			{
				id: "hol-cls-1",
				orgId: "org-assign-1",
				name: "Nghỉ riêng lớp 1",
				fromDate: "2026-11-13",
				toDate: "2026-11-13",
				scope: "classes",
				mode: "shift",
				createdByUserId: "user-1",
			},
			{
				id: "hol-cls-other",
				orgId: "org-assign-1",
				name: "Nghỉ riêng lớp khác",
				fromDate: "2026-11-14",
				toDate: "2026-11-14",
				scope: "classes",
				mode: "shift",
				createdByUserId: "user-1",
			},
		]);

		await db.insert(organizationHolidayClass).values([
			{ id: "hc-1", holidayId: "hol-cls-1", classId: "cls-assign-1" },
			{ id: "hc-2", holidayId: "hol-cls-other", classId: "cls-assign-other" },
		]);

		await db.insert(assignmentPrompt).values({
			id: "pr-assign-g1",
			orgId: "org-assign-1",
			task: "task2",
			genre: "",
			skill: "grammar",
			part: "g1",
			type: "mcq",
			title: "Grammar Day 1",
			band: "6.5",
			source: "",
			prompt: "",
			questions: JSON.stringify([
				{
					stem: "She ____ to school every day.",
					opts: ["go", "goes", "going", "gone"],
					answer: "B",
					alts: "",
				},
			]),
			status: "ready",
		});

		await db.insert(libraryExercise).values([
			{
				id: "lex-assign-v1",
				skill: "vocabulary",
				part: "v1",
				type: "gap",
				title: "Vocabulary Day 2",
				band: "6.5",
				questions: JSON.stringify([
					{
						stem: "Climate ____ is a global challenge.",
						opts: null,
						answer: "change",
						alts: "",
					},
				]),
				status: "ready",
			},
			{
				id: "lex-assign-r1",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Day 3",
				band: "7.0",
				passage: "<p>Solar power is growing rapidly.</p>",
				questions: JSON.stringify([
					{
						stem: "Solar power is declining.",
						opts: null,
						answer: "FALSE",
						alts: "",
					},
				]),
				status: "ready",
			},
		]);

		await db.insert(studyPack).values({
			id: "pack-assign-3d",
			orgId: "org-assign-1",
			title: "Bộ đề 3 ngày",
			description: "Kiểm tra lịch nghỉ",
			status: "ready",
		});

		await db.insert(studyPackItem).values([
			{
				id: "spi-1",
				packId: "pack-assign-3d",
				dayIndex: 1,
				position: 0,
				sourceKind: "org_prompt",
				sourceId: "pr-assign-g1",
				note: "Bài ngày 1",
			},
			{
				id: "spi-2",
				packId: "pack-assign-3d",
				dayIndex: 2,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-assign-v1",
				note: "Bài ngày 2",
			},
			{
				id: "spi-3",
				packId: "pack-assign-3d",
				dayIndex: 3,
				position: 0,
				sourceKind: "library_exercise",
				sourceId: "lex-assign-r1",
				note: "Bài ngày 3",
			},
		]);
	});

	test("computeStudyPackSchedule skips startDate holiday and multi-day consecutive holidays", () => {
		const holidays = new Map<string, string>([
			["2026-11-10", "Nghỉ lễ 1"],
			["2026-11-11", "Nghỉ lễ 2"],
			["2026-11-13", "Nghỉ bù"],
		]);
		const schedule = computeStudyPackSchedule("2026-11-10", 3, holidays);
		expect(schedule.dateByDayIndex.get(1)).toBe("2026-11-12");
		expect(schedule.dateByDayIndex.get(2)).toBe("2026-11-14");
		expect(schedule.dateByDayIndex.get(3)).toBe("2026-11-15");
		expect(schedule.skippedHolidays).toEqual([
			{ date: "2026-11-10", name: "Nghỉ lễ 1" },
			{ date: "2026-11-11", name: "Nghỉ lễ 2" },
			{ date: "2026-11-13", name: "Nghỉ bù" },
		]);
	});

	test("assignStudyPackToClass is idempotent, skips org & class holidays, and supports cancel + reassign + backfill", async () => {
		// Start on 2026-11-10 (org holiday 10..11, class holiday 13):
		// Day 1 -> 2026-11-12
		// Day 2 -> 2026-11-14 (2026-11-13 skipped, 2026-11-14 is another class's holiday so NOT skipped)
		// Day 3 -> 2026-11-15
		const first = await assignStudyPackToClass(db, {
			orgId: "org-assign-1",
			classId: "cls-assign-1",
			packId: "pack-assign-3d",
			startDate: "2026-11-10",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(first.ok).toBe(true);
		if (!first.ok) return;
		expect(first.reused).toBe(false);

		// Retry with identical config -> reused: true, no duplicate rows
		const second = await assignStudyPackToClass(db, {
			orgId: "org-assign-1",
			classId: "cls-assign-1",
			packId: "pack-assign-3d",
			startDate: "2026-11-10",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(second).toEqual({
			ok: true,
			classPackId: first.classPackId,
			reused: true,
		});

		// Retry with different startDate while active -> 409
		const conflict = await assignStudyPackToClass(db, {
			orgId: "org-assign-1",
			classId: "cls-assign-1",
			packId: "pack-assign-3d",
			startDate: "2026-11-12",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(conflict).toEqual({
			ok: false,
			status: 409,
			error: "study pack already active on class",
		});

		const view = await loadClassStudyPacks(
			db,
			"org-assign-1",
			"cls-assign-1",
			new Date(vietnamDateTimeMs("2026-11-12", "10:00")),
		);
		expect(view.packs).toHaveLength(1);
		const assigned = view.packs[0];
		if (!assigned) throw new Error("expected assigned pack");
		expect(assigned.assignments.map((a) => [a.dayIndex, a.date])).toEqual([
			[1, "2026-11-12"],
			[2, "2026-11-14"],
			[3, "2026-11-15"],
		]);
		expect(assigned.assignments.map((a) => a.isReleased)).toEqual([
			true,
			false,
			false,
		]);
		expect(assigned.assignments.every((a) => a.targetsTotal === 1)).toBe(true);

		// Late student backfilled at 2026-11-13 10:00 VN:
		// Day 1 due_at was 2026-11-12 17:00 (past due -> NOT backfilled)
		// Day 2 & Day 3 have due_at > now -> backfilled!
		const backfilled = await backfillStudyPackTargetsForStudent(
			db,
			"org-assign-1",
			"cls-assign-1",
			"stu-assign-late",
			new Date(vietnamDateTimeMs("2026-11-13", "10:00")),
		);
		expect(backfilled).toBe(2);

		const lateTargets = await db
			.select()
			.from(classAssignmentTarget)
			.where(
				and(
					eq(classAssignmentTarget.orgId, "org-assign-1"),
					eq(classAssignmentTarget.studentId, "stu-assign-late"),
				),
			);
		expect(lateTargets).toHaveLength(2);

		// Cancel at 2026-11-13 10:00 VN:
		// Day 1 (2026-11-12 06:00 <= now) is kept; Day 2 & Day 3 (> now) are deleted!
		const cancelled = await cancelClassStudyPack(
			db,
			"org-assign-1",
			"cls-assign-1",
			first.classPackId,
			new Date(vietnamDateTimeMs("2026-11-13", "10:00")),
		);
		expect(cancelled).toEqual({ ok: true });

		const remainingAssignments = await db
			.select()
			.from(classAssignment)
			.where(eq(classAssignment.classStudyPackId, first.classPackId));
		expect(remainingAssignments).toHaveLength(1);
		expect(remainingAssignments[0]?.due).toBe("2026-11-12");

		// Reassigning the same packId after cancellation succeeds with a new classPackId
		const reassigned = await assignStudyPackToClass(db, {
			orgId: "org-assign-1",
			classId: "cls-assign-1",
			packId: "pack-assign-3d",
			startDate: "2026-11-16",
			releaseTime: "06:00",
			dueTime: "17:00",
		});
		expect(reassigned.ok).toBe(true);
		if (reassigned.ok) {
			expect(reassigned.reused).toBe(false);
			expect(reassigned.classPackId).not.toBe(first.classPackId);
		}
	});

	test("interleaved cancelClassStudyPack during fresh and reused assignStudyPackToClass cleans up all unattempted rows, handles D1 FK errors, and returns 409 (#554)", async () => {
		await db.insert(classTable).values([
			{
				id: "cls-race-fresh",
				orgId: "org-assign-1",
				name: "IELTS Race Fresh",
				level: "6.5",
				type: "ielts",
				skills: '["reading"]',
				mode: "Online",
				schedule: '{"days":[1,3],"start":"18:00","end":"20:00"}',
				sessionsTotal: 10,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-20",
				notes: "",
			},
			{
				id: "cls-race-reuse",
				orgId: "org-assign-1",
				name: "IELTS Race Reuse",
				level: "6.5",
				type: "ielts",
				skills: '["reading"]',
				mode: "Online",
				schedule: '{"days":[2,4],"start":"18:00","end":"20:00"}',
				sessionsTotal: 10,
				sessionsDone: 0,
				status: "active",
				startDate: "2026-11-20",
				notes: "",
			},
		]);
		await db.insert(student).values({
			id: "stu-race-2",
			orgId: "org-assign-1",
			name: "Học viên Race 2",
			email: "race2@student.local",
			phone: "0909999999",
		});
		await db.insert(enrollment).values([
			{
				id: "enr-race-fresh-1",
				orgId: "org-assign-1",
				classId: "cls-race-fresh",
				studentId: "stu-assign-1",
				status: "active",
			},
			{
				id: "enr-race-reuse-1",
				orgId: "org-assign-1",
				classId: "cls-race-reuse",
				studentId: "stu-assign-1",
				status: "active",
			},
		]);

		// 1) Fresh (!reused) assign cancelled right before assignment batch runs:
		// startDate = 2026-11-20, releaseTime = 06:00, cancelNow = 2026-11-20 10:00 VN
		// Day 1 has available_at = 06:00 <= cancelNow, Day 2..3 have available_at > cancelNow.
		// Both Day 1 and Day 2..3 MUST be cleaned up because this fresh pack never completed activation!
		const cancelNow = new Date(vietnamDateTimeMs("2026-11-20", "10:00"));
		let freshHookFired = false;
		const freshRacedDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "batch") {
					return async (...args: Parameters<Db["batch"]>) => {
						if (!freshHookFired) {
							freshHookFired = true;
							const [createdPack] = await db
								.select({ id: schema.classStudyPack.id })
								.from(schema.classStudyPack)
								.where(eq(schema.classStudyPack.classId, "cls-race-fresh"));
							if (createdPack) {
								await cancelClassStudyPack(
									db,
									"org-assign-1",
									"cls-race-fresh",
									createdPack.id,
									cancelNow,
								);
							}
						}
						return Reflect.apply(target.batch, target, args);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const freshResult = await assignStudyPackToClass(freshRacedDb, {
			orgId: "org-assign-1",
			classId: "cls-race-fresh",
			packId: "pack-assign-3d",
			startDate: "2026-11-20",
			releaseTime: "06:00",
			dueTime: "17:00",
			now: cancelNow,
		});
		expect(freshHookFired).toBe(true);
		expect(freshResult).toEqual({
			ok: false,
			status: 409,
			error: "study pack was cancelled",
		});
		const leakedFreshAssignments = await db
			.select({ id: classAssignment.id })
			.from(classAssignment)
			.where(eq(classAssignment.classId, "cls-race-fresh"));
		expect(leakedFreshAssignments).toHaveLength(0);

		// 2) Reused target backfill racing with cancelClassStudyPack under PRAGMA foreign_keys = ON:
		const initialReuse = await assignStudyPackToClass(db, {
			orgId: "org-assign-1",
			classId: "cls-race-reuse",
			packId: "pack-assign-3d",
			startDate: "2026-11-25",
			releaseTime: "06:00",
			dueTime: "17:00",
			now: cancelNow,
		});
		expect(initialReuse.ok).toBe(true);
		if (!initialReuse.ok) return;

		await db.insert(enrollment).values({
			id: "enr-race-reuse-2",
			orgId: "org-assign-1",
			classId: "cls-race-reuse",
			studentId: "stu-race-2",
			status: "active",
		});

		let fkHookFired = false;
		const fkRacedDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "batch") {
					return async (...args: Parameters<Db["batch"]>) => {
						if (!fkHookFired) {
							fkHookFired = true;
							await cancelClassStudyPack(
								db,
								"org-assign-1",
								"cls-race-reuse",
								initialReuse.classPackId,
								cancelNow,
							);
						}
						return Reflect.apply(target.batch, target, args);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const reusedRaceResult = await assignStudyPackToClass(fkRacedDb, {
			orgId: "org-assign-1",
			classId: "cls-race-reuse",
			packId: "pack-assign-3d",
			startDate: "2026-11-25",
			releaseTime: "06:00",
			dueTime: "17:00",
			now: cancelNow,
		});
		expect(fkHookFired).toBe(true);
		expect(reusedRaceResult).toEqual({
			ok: false,
			status: 409,
			error: "study pack was cancelled",
		});

		// 3) Self-healing cancelClassStudyPack retry uses original cancelledAt (not later retry now)
		await db.insert(classAssignment).values({
			id: "ca_leaked_after_cancel",
			orgId: "org-assign-1",
			classId: "cls-race-reuse",
			promptId: "pr-assign-g1",
			title: "Leaked Day 1",
			due: "2026-11-25",
			note: "",
			availableAt: new Date(vietnamDateTimeMs("2026-11-25", "06:00")),
			dueAt: new Date(vietnamDateTimeMs("2026-11-25", "17:00")),
			classStudyPackId: initialReuse.classPackId,
		});
		const retryNowAfterOpen = new Date(
			vietnamDateTimeMs("2026-11-25", "06:30"),
		);
		const retryCancel = await cancelClassStudyPack(
			db,
			"org-assign-1",
			"cls-race-reuse",
			initialReuse.classPackId,
			retryNowAfterOpen,
		);
		expect(retryCancel).toEqual({ ok: true });

		const [packAfterRetry] = await db
			.select()
			.from(schema.classStudyPack)
			.where(eq(schema.classStudyPack.id, initialReuse.classPackId));
		expect(packAfterRetry?.cancelledAt?.getTime()).toBe(cancelNow.getTime());

		const remainingLeaked = await db
			.select({ id: classAssignment.id })
			.from(classAssignment)
			.where(eq(classAssignment.id, "ca_leaked_after_cancel"));
		expect(remainingLeaked).toHaveLength(0);
	});
});
