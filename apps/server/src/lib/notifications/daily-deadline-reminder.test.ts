import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { NOTIFICATION_ERROR_CODES } from "@teacher-os/api/contracts";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import {
	assignmentPrompt,
	user as authUser,
	classAssignment,
	classAssignmentTarget,
	classStudyPack,
	classTable,
	enrollment,
	membership,
	notificationRecord,
	organization,
	quizAttempt,
	student,
	studyPack,
} from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "../../app";
import { runDailyDeadlineReminderCron } from "./daily-deadline-reminder";
import { deliverNotifications } from "./deliver";
import { requeueSingleFailedNotification } from "./requeue";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

/** 2026-05-14T23:00:00Z === 2026-05-15T06:00:00+07:00 (06:00 sáng giờ VN ngày 15/05/2026). */
const CRON_6AM_VN_2026_05_15 = new Date("2026-05-14T23:00:00.000Z");
const CRON_6AM_VN_2026_05_16 = new Date("2026-05-15T23:00:00.000Z");

function vnDate(isoDateTime: string): Date {
	return new Date(Date.parse(`${isoDateTime}+07:00`));
}

function fakeMailer(impl: Mailer["send"] = async () => {}): Mailer {
	return { send: impl };
}

describe("runDailyDeadlineReminderCron", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	beforeEach(async () => {
		await libsql.delete(notificationRecord);
		await libsql.delete(quizAttempt);
		await libsql.delete(classAssignmentTarget);
		await libsql.delete(classAssignment);
		await libsql.delete(classStudyPack);
		await libsql.delete(studyPack);
		await libsql.delete(assignmentPrompt);
		await libsql.delete(enrollment);
		await libsql.delete(classTable);
		await libsql.delete(student);
		await libsql.delete(membership);
		await libsql.delete(organization);
		await libsql.delete(authUser);
	});

	async function seedOrgWithOwner(
		orgId: string,
		name: string,
		ownerEmail: string,
	) {
		await libsql.insert(organization).values({ id: orgId, name });
		const userId = `owner-${orgId}`;
		await libsql.insert(authUser).values({
			id: userId,
			name: `Owner ${name}`,
			email: ownerEmail,
		});
		await libsql.insert(membership).values({
			id: `mem-${orgId}`,
			orgId,
			userId,
			role: "owner",
		});
	}

	async function seedClass(
		orgId: string,
		classId: string,
		name: string,
		status: "active" | "paused" = "active",
	) {
		await libsql.insert(classTable).values({
			id: classId,
			orgId,
			name,
			status,
		});
	}

	async function seedStudent(
		orgId: string,
		studentId: string,
		name: string,
		email: string,
	) {
		await libsql.insert(student).values({
			id: studentId,
			orgId,
			name,
			email,
		});
	}

	async function seedEnrollment(
		orgId: string,
		classId: string,
		studentId: string,
		status: "active" | "invited" = "active",
	) {
		await libsql.insert(enrollment).values({
			id: `enr-${classId}-${studentId}`,
			orgId,
			classId,
			studentId,
			status,
		});
	}

	async function seedPrompt(orgId: string, promptId: string) {
		await libsql.insert(assignmentPrompt).values({
			id: promptId,
			orgId,
			task: "task2",
			genre: "opinion",
			title: `Prompt ${promptId}`,
			prompt: "Write an essay.",
		});
	}

	async function seedStudyPackForClass(input: {
		orgId: string;
		classId: string;
		packId: string;
		classStudyPackId: string;
		status?: "active" | "cancelled";
		cancelledAt?: Date | null;
	}) {
		await libsql
			.insert(studyPack)
			.values({
				id: input.packId,
				orgId: input.orgId,
				title: `Pack ${input.packId}`,
				status: "ready",
			})
			.onConflictDoNothing();

		await libsql.insert(classStudyPack).values({
			id: input.classStudyPackId,
			orgId: input.orgId,
			classId: input.classId,
			packId: input.packId,
			title: `Class Pack ${input.classStudyPackId}`,
			startDate: "2026-05-15",
			status: input.status ?? "active",
			cancelledAt: input.cancelledAt ?? null,
		});
	}

	async function seedAssignment(input: {
		orgId: string;
		classId: string;
		promptId: string;
		assignmentId: string;
		title: string;
		due: string;
		dueAt?: Date | null;
		availableAt?: Date | null;
		classStudyPackId?: string | null;
	}) {
		await libsql.insert(classAssignment).values({
			id: input.assignmentId,
			orgId: input.orgId,
			classId: input.classId,
			promptId: input.promptId,
			title: input.title,
			due: input.due,
			dueAt: input.dueAt ?? null,
			availableAt: input.availableAt ?? null,
			classStudyPackId: input.classStudyPackId ?? null,
		});
	}

	async function seedTarget(input: {
		orgId: string;
		assignmentId: string;
		studentId: string;
		submittedAt?: string | null;
	}) {
		await libsql.insert(classAssignmentTarget).values({
			id: `tgt-${input.assignmentId}-${input.studentId}`,
			orgId: input.orgId,
			assignmentId: input.assignmentId,
			studentId: input.studentId,
			submittedAt: input.submittedAt ?? null,
		});
	}

	async function seedAttempt(input: {
		orgId: string;
		assignmentId: string;
		studentId: string;
		status: "in_progress" | "submitted";
	}) {
		await libsql.insert(quizAttempt).values({
			id: `att-${input.assignmentId}-${input.studentId}`,
			orgId: input.orgId,
			assignmentId: input.assignmentId,
			studentId: input.studentId,
			mode: "assignment",
			status: input.status,
			questionsSnapshot: "[]",
			submittedAt: input.status === "submitted" ? new Date() : null,
		});
	}

	test("sends one consolidated digest email separating homework and self-study with direct links", async () => {
		await seedOrgWithOwner("org-1", "IELTS Pro", "teacher@ieltspro.vn");
		await seedClass("org-1", "cls-1", "IELTS 6.5");
		await seedStudent("org-1", "stu-1", "Minh Anh", "minh@example.com");
		await seedEnrollment("org-1", "cls-1", "stu-1", "active");
		await seedPrompt("org-1", "prompt-1");
		await seedStudyPackForClass({
			orgId: "org-1",
			classId: "cls-1",
			packId: "pack-1",
			classStudyPackId: "csp-1",
		});

		await seedAssignment({
			orgId: "org-1",
			classId: "cls-1",
			promptId: "prompt-1",
			assignmentId: "hw-1",
			title: "Writing Task 2 — Education",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T23:59:00"),
		});
		await seedAssignment({
			orgId: "org-1",
			classId: "cls-1",
			promptId: "prompt-1",
			assignmentId: "ss-1",
			title: "Reading Day 1",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-15T06:00:00"),
			dueAt: vnDate("2026-05-15T17:00:00"),
			classStudyPackId: "csp-1",
		});
		await seedAssignment({
			orgId: "org-1",
			classId: "cls-1",
			promptId: "prompt-1",
			assignmentId: "ss-2",
			title: "Listening Day 1",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-15T08:30:00"),
			dueAt: vnDate("2026-05-15T19:00:00"),
			classStudyPackId: "csp-1",
		});

		await seedTarget({
			orgId: "org-1",
			assignmentId: "hw-1",
			studentId: "stu-1",
		});
		await seedTarget({
			orgId: "org-1",
			assignmentId: "ss-1",
			studentId: "stu-1",
		});
		await seedTarget({
			orgId: "org-1",
			assignmentId: "ss-2",
			studentId: "stu-1",
		});

		const sent: Parameters<Mailer["send"]>[0][] = [];
		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(async (input) => {
				sent.push(input);
			}),
			studentOrigin: "https://lms.msmy.io.vn/student",
			now: () => CRON_6AM_VN_2026_05_15,
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});

		expect(result).toEqual({
			dateISO: "2026-05-15",
			studentsMatched: 1,
			recordsCreated: 1,
			emailsQueued: 1,
			skippedNoEmail: 0,
			orgsProcessed: 1,
		});

		expect(sent).toHaveLength(1);
		const mail = sent[0];
		if (!mail) throw new Error("expected email");
		expect(mail.to).toBe("minh@example.com");
		expect(mail.subject).toBe("Nhắc bài tập đến hạn hôm nay (15/05/2026)");
		expect(mail.replyTo).toBe("teacher@ieltspro.vn");
		expect(mail.fromName).toBe("IELTS Pro qua Cô Mỹ Dạy Tiếng Anh");

		expect(mail.html).toContain("Bài tập về nhà (1)");
		expect(mail.html).toContain("Bộ đề tự học (2)");
		expect(mail.html).toContain("Writing Task 2 — Education");
		expect(mail.html).toContain("Reading Day 1");
		expect(mail.html).toContain("Listening Day 1");
		expect(mail.html).toContain("(mở lúc 08:30)");
		expect(mail.html).not.toContain("(mở lúc 06:00)");
		expect(mail.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/hw-1"',
		);
		expect(mail.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/ss-1"',
		);
		expect(mail.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/ss-2"',
		);
		expect(mail.html).toContain(
			'href="https://lms.msmy.io.vn/student/assignments"',
		);

		const records = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-1"));
		expect(records).toHaveLength(1);
		const rec = records[0];
		if (!rec) throw new Error("expected record");
		expect(rec.channels).toBe("email");
		expect(rec.eventType).toBe("daily_deadline_reminder");
		expect(rec.eventGroup).toBe("assignment");
		expect(rec.idempotencyKey).toBe("daily_deadline_reminder:stu-1:2026-05-15");
		expect(rec.status).toBe("sent");
		expect(rec.sentAt).not.toBeNull();
		expect(rec.htmlBody).toContain("Bài tập về nhà (1)");
		expect(rec.htmlBody).toContain("Bộ đề tự học (2)");
		expect(rec.textBody).toContain(
			"https://lms.msmy.io.vn/student/assignments",
		);
	});

	test("handles Vietnam timezone boundaries and legacy due without dueAt accurately", async () => {
		await seedOrgWithOwner("org-tz", "TZ Academy", "tz@academy.vn");
		await seedClass("org-tz", "cls-tz", "IELTS TZ");
		await seedStudent("org-tz", "stu-tz", "Lan", "lan@example.com");
		await seedEnrollment("org-tz", "cls-tz", "stu-tz", "active");
		await seedPrompt("org-tz", "prompt-tz");

		// Included: start of today VN (00:00 +07:00 = previous day 17:00 UTC)
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-start",
			title: "Start Of Day",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T00:00:00"),
		});
		// Included: end of today VN (23:59 +07:00 = today 16:59 UTC)
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-end",
			title: "End Of Day",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T23:59:00"),
		});
		// Included: legacy dueAt = null with due = todayISO
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-legacy-today",
			title: "Legacy Today",
			due: "2026-05-15",
			dueAt: null,
		});
		// Excluded: yesterday VN (23:59:59 +07:00)
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-yesterday",
			title: "Yesterday",
			due: "2026-05-14",
			dueAt: vnDate("2026-05-14T23:59:59"),
		});
		// Excluded: tomorrow VN exact midnight (00:00 +07:00), even if due column says today
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-tomorrow-boundary",
			title: "Tomorrow Midnight",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-16T00:00:00"),
		});
		// Excluded: legacy dueAt = null with due = yesterday or tomorrow
		await seedAssignment({
			orgId: "org-tz",
			classId: "cls-tz",
			promptId: "prompt-tz",
			assignmentId: "a-legacy-tomorrow",
			title: "Legacy Tomorrow",
			due: "2026-05-16",
			dueAt: null,
		});

		for (const assignmentId of [
			"a-start",
			"a-end",
			"a-legacy-today",
			"a-yesterday",
			"a-tomorrow-boundary",
			"a-legacy-tomorrow",
		]) {
			await seedTarget({ orgId: "org-tz", assignmentId, studentId: "stu-tz" });
		}

		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(),
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});

		expect(result.recordsCreated).toBe(1);
		const [rec] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-tz"));
		const html = rec?.htmlBody ?? "";
		expect(html).toContain("/learn/quizzes/a-start");
		expect(html).toContain("/learn/quizzes/a-end");
		expect(html).toContain("/learn/quizzes/a-legacy-today");
		expect(html).not.toContain("/learn/quizzes/a-yesterday");
		expect(html).not.toContain("/learn/quizzes/a-tomorrow");
		expect(html).not.toContain("/learn/quizzes/a-legacy-tomorrow");
		expect(html.indexOf("/learn/quizzes/a-start")).toBeLessThan(
			html.indexOf("/learn/quizzes/a-end"),
		);
		expect(html.indexOf("/learn/quizzes/a-end")).toBeLessThan(
			html.indexOf("/learn/quizzes/a-legacy-today"),
		);
		expect(rec?.body).toContain("Hạn 00:00");
		expect(rec?.body).toContain("Hạn 23:59");
		expect(rec?.body).toContain("Hạn Trong ngày");
	});

	test("excludes submitted targets and submitted quiz attempts while keeping in-progress attempts", async () => {
		await seedOrgWithOwner("org-sub", "Sub Academy", "sub@academy.vn");
		await seedClass("org-sub", "cls-sub", "IELTS Sub");
		await seedStudent("org-sub", "stu-partial", "Partial", "p@example.com");
		await seedStudent("org-sub", "stu-done", "All Done", "done@example.com");
		await seedEnrollment("org-sub", "cls-sub", "stu-partial", "active");
		await seedEnrollment("org-sub", "cls-sub", "stu-done", "active");
		await seedPrompt("org-sub", "prompt-sub");

		await seedAssignment({
			orgId: "org-sub",
			classId: "cls-sub",
			promptId: "prompt-sub",
			assignmentId: "a-target-sub",
			title: "Submitted Target",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T18:00:00"),
		});
		await seedAssignment({
			orgId: "org-sub",
			classId: "cls-sub",
			promptId: "prompt-sub",
			assignmentId: "a-attempt-sub",
			title: "Submitted Attempt",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T19:00:00"),
		});
		await seedAssignment({
			orgId: "org-sub",
			classId: "cls-sub",
			promptId: "prompt-sub",
			assignmentId: "a-in-progress",
			title: "In Progress Task",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T20:00:00"),
		});

		// Partial student: 1 submitted via target, 1 submitted via attempt, 1 in_progress
		await seedTarget({
			orgId: "org-sub",
			assignmentId: "a-target-sub",
			studentId: "stu-partial",
			submittedAt: "2026-05-15T01:00:00.000Z",
		});
		await seedTarget({
			orgId: "org-sub",
			assignmentId: "a-attempt-sub",
			studentId: "stu-partial",
			submittedAt: null,
		});
		await seedAttempt({
			orgId: "org-sub",
			assignmentId: "a-attempt-sub",
			studentId: "stu-partial",
			status: "submitted",
		});
		await seedTarget({
			orgId: "org-sub",
			assignmentId: "a-in-progress",
			studentId: "stu-partial",
			submittedAt: null,
		});
		await seedAttempt({
			orgId: "org-sub",
			assignmentId: "a-in-progress",
			studentId: "stu-partial",
			status: "in_progress",
		});

		// All-done student: only submitted assignments
		await seedTarget({
			orgId: "org-sub",
			assignmentId: "a-target-sub",
			studentId: "stu-done",
			submittedAt: "2026-05-15T01:00:00.000Z",
		});
		await seedTarget({
			orgId: "org-sub",
			assignmentId: "a-attempt-sub",
			studentId: "stu-done",
			submittedAt: null,
		});
		await seedAttempt({
			orgId: "org-sub",
			assignmentId: "a-attempt-sub",
			studentId: "stu-done",
			status: "submitted",
		});

		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(),
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});

		expect(result.studentsMatched).toBe(1);
		expect(result.recordsCreated).toBe(1);

		const [partialRec] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-partial"));
		expect(partialRec?.htmlBody).toContain("Bài tập về nhà (1)");
		expect(partialRec?.htmlBody).toContain("/learn/quizzes/a-in-progress");
		expect(partialRec?.htmlBody).not.toContain("/learn/quizzes/a-target-sub");
		expect(partialRec?.htmlBody).not.toContain("/learn/quizzes/a-attempt-sub");

		const doneRecs = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-done"));
		expect(doneRecs).toHaveLength(0);
	});

	test("excludes paused classes, invited/missing enrollments, demo students, future-release and cancelled study packs", async () => {
		await seedOrgWithOwner("org-ex", "Ex Academy", "ex@academy.vn");
		await seedClass("org-ex", "cls-active", "Active Class", "active");
		await seedClass("org-ex", "cls-paused", "Paused Class", "paused");
		await seedPrompt("org-ex", "prompt-ex");

		await seedStudent("org-ex", "stu-active", "Active", "active@example.com");
		await seedStudent("org-ex", "stu-invited", "Invited", "inv@example.com");
		await seedStudent(
			"org-ex",
			"stu-unenrolled",
			"Unenrolled",
			"un@example.com",
		);
		await seedStudent(
			"org-ex",
			"demo-student:org-ex",
			"Demo Student",
			"demo@example.com",
		);

		await seedEnrollment("org-ex", "cls-active", "stu-active", "active");
		await seedEnrollment("org-ex", "cls-paused", "stu-active", "active");
		await seedEnrollment("org-ex", "cls-active", "stu-invited", "invited");
		await seedEnrollment(
			"org-ex",
			"cls-active",
			"demo-student:org-ex",
			"active",
		);

		// Study pack cancelled at 07:00 VN
		await seedStudyPackForClass({
			orgId: "org-ex",
			classId: "cls-active",
			packId: "pack-cancelled",
			classStudyPackId: "csp-cancelled",
			status: "cancelled",
			cancelledAt: vnDate("2026-05-15T07:00:00"),
		});
		// Study pack cancelled without cancelledAt timestamp
		await seedStudyPackForClass({
			orgId: "org-ex",
			classId: "cls-active",
			packId: "pack-cancelled-null",
			classStudyPackId: "csp-cancelled-null",
			status: "cancelled",
			cancelledAt: null,
		});
		// Active study pack
		await seedStudyPackForClass({
			orgId: "org-ex",
			classId: "cls-active",
			packId: "pack-active",
			classStudyPackId: "csp-active",
			status: "active",
		});

		// Paused class assignment → excluded
		await seedAssignment({
			orgId: "org-ex",
			classId: "cls-paused",
			promptId: "prompt-ex",
			assignmentId: "a-paused",
			title: "Paused HW",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T18:00:00"),
		});
		// Cancelled study pack item released BEFORE cancellation (06:00 <= 07:00) → INCLUDED
		await seedAssignment({
			orgId: "org-ex",
			classId: "cls-active",
			promptId: "prompt-ex",
			assignmentId: "ss-released-before-cancel",
			title: "Released Before Cancel",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-15T06:00:00"),
			dueAt: vnDate("2026-05-15T17:00:00"),
			classStudyPackId: "csp-cancelled",
		});
		// Cancelled study pack item scheduled AFTER cancellation (08:00 > 07:00) → EXCLUDED
		await seedAssignment({
			orgId: "org-ex",
			classId: "cls-active",
			promptId: "prompt-ex",
			assignmentId: "ss-after-cancel",
			title: "After Cancel",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-15T08:00:00"),
			dueAt: vnDate("2026-05-15T17:00:00"),
			classStudyPackId: "csp-cancelled",
		});
		// Cancelled study pack with null cancelledAt → EXCLUDED
		await seedAssignment({
			orgId: "org-ex",
			classId: "cls-active",
			promptId: "prompt-ex",
			assignmentId: "ss-null-cancel",
			title: "Null Cancel",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-15T06:00:00"),
			dueAt: vnDate("2026-05-15T17:00:00"),
			classStudyPackId: "csp-cancelled-null",
		});
		// Study pack whose availableAt is tomorrow (>= tomorrowStartMs) → EXCLUDED
		await seedAssignment({
			orgId: "org-ex",
			classId: "cls-active",
			promptId: "prompt-ex",
			assignmentId: "ss-tomorrow-open",
			title: "Opens Tomorrow",
			due: "2026-05-15",
			availableAt: vnDate("2026-05-16T06:00:00"),
			dueAt: vnDate("2026-05-15T23:00:00"),
			classStudyPackId: "csp-active",
		});

		for (const assignmentId of [
			"a-paused",
			"ss-released-before-cancel",
			"ss-after-cancel",
			"ss-null-cancel",
			"ss-tomorrow-open",
		]) {
			await seedTarget({
				orgId: "org-ex",
				assignmentId,
				studentId: "stu-active",
			});
		}
		for (const studentId of [
			"stu-invited",
			"stu-unenrolled",
			"demo-student:org-ex",
		]) {
			await seedTarget({
				orgId: "org-ex",
				assignmentId: "ss-released-before-cancel",
				studentId,
			});
		}

		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(),
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});

		expect(result.studentsMatched).toBe(1);
		expect(result.recordsCreated).toBe(1);

		const allRecs = await libsql.select().from(notificationRecord);
		expect(allRecs).toHaveLength(1);
		expect(allRecs[0]?.studentId).toBe("stu-active");
		expect(allRecs[0]?.htmlBody).not.toContain("Bài tập về nhà");
		expect(allRecs[0]?.htmlBody).toContain("Bộ đề tự học (1)");
		expect(allRecs[0]?.htmlBody).toContain(
			"/learn/quizzes/ss-released-before-cancel",
		);
		expect(allRecs[0]?.htmlBody).not.toContain("ss-after-cancel");
		expect(allRecs[0]?.htmlBody).not.toContain("ss-null-cancel");
		expect(allRecs[0]?.htmlBody).not.toContain("ss-tomorrow-open");
		expect(allRecs[0]?.htmlBody).not.toContain("a-paused");
	});

	test("consolidates assignments across multiple classes with deterministic sorting and skips students without email", async () => {
		await seedOrgWithOwner("org-multi", "Multi Academy", "multi@academy.vn");
		await seedClass("org-multi", "cls-a", "IELTS Writing");
		await seedClass("org-multi", "cls-b", "IELTS Speaking");
		await seedStudent("org-multi", "stu-1", "Hùng", "hung@example.com");
		await seedStudent("org-multi", "stu-no-mail", "Không Email", "   ");
		await seedEnrollment("org-multi", "cls-a", "stu-1", "active");
		await seedEnrollment("org-multi", "cls-b", "stu-1", "active");
		await seedEnrollment("org-multi", "cls-a", "stu-no-mail", "active");
		await seedPrompt("org-multi", "prompt-multi");

		await seedAssignment({
			orgId: "org-multi",
			classId: "cls-a",
			promptId: "prompt-multi",
			assignmentId: "hw-null",
			title: "Bài không giờ",
			due: "2026-05-15",
			dueAt: null,
		});
		await seedAssignment({
			orgId: "org-multi",
			classId: "cls-b",
			promptId: "prompt-multi",
			assignmentId: "hw-18-z",
			title: "Đề B",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T18:00:00"),
		});
		await seedAssignment({
			orgId: "org-multi",
			classId: "cls-a",
			promptId: "prompt-multi",
			assignmentId: "hw-18-a",
			title: "Đề A",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T18:00:00"),
		});
		await seedAssignment({
			orgId: "org-multi",
			classId: "cls-b",
			promptId: "prompt-multi",
			assignmentId: "hw-10",
			title: "Speaking Part 2",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T10:00:00"),
		});

		for (const assignmentId of ["hw-null", "hw-18-z", "hw-18-a", "hw-10"]) {
			await seedTarget({
				orgId: "org-multi",
				assignmentId,
				studentId: "stu-1",
			});
		}
		await seedTarget({
			orgId: "org-multi",
			assignmentId: "hw-18-a",
			studentId: "stu-no-mail",
		});

		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(),
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});

		expect(result).toEqual({
			dateISO: "2026-05-15",
			studentsMatched: 2,
			recordsCreated: 1,
			emailsQueued: 1,
			skippedNoEmail: 1,
			orgsProcessed: 1,
		});

		const [rec] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-1"));
		const html = rec?.htmlBody ?? "";
		expect(html).toContain("Bài tập về nhà (4)");
		expect(html.indexOf("/learn/quizzes/hw-10")).toBeLessThan(
			html.indexOf("/learn/quizzes/hw-18-a"),
		);
		expect(html.indexOf("/learn/quizzes/hw-18-a")).toBeLessThan(
			html.indexOf("/learn/quizzes/hw-18-z"),
		);
		expect(html.indexOf("/learn/quizzes/hw-18-z")).toBeLessThan(
			html.indexOf("/learn/quizzes/hw-null"),
		);
		expect(rec?.body).toContain("(IELTS Speaking) — Hạn 10:00");
		expect(rec?.body).toContain("(IELTS Writing) — Hạn 18:00");
		expect(rec?.body).toContain("(IELTS Speaking) — Hạn 18:00");
		expect(rec?.body).toContain("(IELTS Writing) — Hạn Trong ngày");

		const noEmailRecs = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-no-mail"));
		expect(noEmailRecs).toHaveLength(0);
	});

	test("is idempotent on same-day re-run and creates a fresh reminder on the next day", async () => {
		await seedOrgWithOwner("org-idem", "Idem Academy", "idem@academy.vn");
		await seedClass("org-idem", "cls-idem", "IELTS Idem");
		await seedStudent("org-idem", "stu-idem", "Trang", "trang@example.com");
		await seedEnrollment("org-idem", "cls-idem", "stu-idem", "active");
		await seedPrompt("org-idem", "prompt-idem");

		await seedAssignment({
			orgId: "org-idem",
			classId: "cls-idem",
			promptId: "prompt-idem",
			assignmentId: "hw-day1",
			title: "Day 1 Essay",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T20:00:00"),
		});
		await seedAssignment({
			orgId: "org-idem",
			classId: "cls-idem",
			promptId: "prompt-idem",
			assignmentId: "hw-day2",
			title: "Day 2 Essay",
			due: "2026-05-16",
			dueAt: vnDate("2026-05-16T20:00:00"),
		});
		await seedTarget({
			orgId: "org-idem",
			assignmentId: "hw-day1",
			studentId: "stu-idem",
		});
		await seedTarget({
			orgId: "org-idem",
			assignmentId: "hw-day2",
			studentId: "stu-idem",
		});

		let sentCount = 0;
		const mailer = fakeMailer(async () => {
			sentCount += 1;
		});

		const run1 = await runDailyDeadlineReminderCron({
			db,
			mailer,
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});
		expect(run1.recordsCreated).toBe(1);
		expect(run1.emailsQueued).toBe(1);
		expect(sentCount).toBe(1);

		const run2 = await runDailyDeadlineReminderCron({
			db,
			mailer,
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});
		expect(run2.studentsMatched).toBe(1);
		expect(run2.recordsCreated).toBe(0);
		expect(run2.emailsQueued).toBe(0);
		expect(sentCount).toBe(1);

		const nextDayRun = await runDailyDeadlineReminderCron({
			db,
			mailer,
			now: () => CRON_6AM_VN_2026_05_16,
			sendIntervalMs: 0,
		});
		expect(nextDayRun.dateISO).toBe("2026-05-16");
		expect(nextDayRun.recordsCreated).toBe(1);
		expect(nextDayRun.emailsQueued).toBe(1);
		expect(sentCount).toBe(2);
	});

	test("processes multiple orgs independently with per-org sender metadata and isolates org errors", async () => {
		await seedOrgWithOwner("org-a", "Alpha Center", "alpha@center.vn");
		await seedOrgWithOwner("org-b", "Beta Center", "beta@center.vn");
		await seedClass("org-a", "cls-a", "Alpha IELTS");
		await seedClass("org-b", "cls-b", "Beta IELTS");
		await seedStudent("org-a", "stu-a", "An", "an@alpha.vn");
		await seedStudent("org-b", "stu-b", "Bình", "binh@beta.vn");
		await seedEnrollment("org-a", "cls-a", "stu-a", "active");
		await seedEnrollment("org-b", "cls-b", "stu-b", "active");
		await seedPrompt("org-a", "prompt-a");
		await seedPrompt("org-b", "prompt-b");

		await seedAssignment({
			orgId: "org-a",
			classId: "cls-a",
			promptId: "prompt-a",
			assignmentId: "hw-a",
			title: "Alpha HW",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T19:00:00"),
		});
		await seedAssignment({
			orgId: "org-b",
			classId: "cls-b",
			promptId: "prompt-b",
			assignmentId: "hw-b",
			title: "Beta HW",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T20:00:00"),
		});
		await seedTarget({
			orgId: "org-a",
			assignmentId: "hw-a",
			studentId: "stu-a",
		});
		await seedTarget({
			orgId: "org-b",
			assignmentId: "hw-b",
			studentId: "stu-b",
		});

		const sent: Parameters<Mailer["send"]>[0][] = [];
		const result = await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(async (input) => {
				sent.push(input);
			}),
			now: () => CRON_6AM_VN_2026_05_15,
			sendIntervalMs: 0,
		});

		expect(result.orgsProcessed).toBe(2);
		expect(result.recordsCreated).toBe(2);
		expect(sent).toHaveLength(2);
		expect(sent.find((m) => m.to === "an@alpha.vn")?.replyTo).toBe(
			"alpha@center.vn",
		);
		expect(sent.find((m) => m.to === "binh@beta.vn")?.replyTo).toBe(
			"beta@center.vn",
		);

		// Verify failure in one org does not abort subsequent orgs on a fresh day
		await seedAssignment({
			orgId: "org-a",
			classId: "cls-a",
			promptId: "prompt-a",
			assignmentId: "hw-a-2",
			title: "Alpha Day 2",
			due: "2026-05-16",
			dueAt: vnDate("2026-05-16T19:00:00"),
		});
		await seedAssignment({
			orgId: "org-b",
			classId: "cls-b",
			promptId: "prompt-b",
			assignmentId: "hw-b-2",
			title: "Beta Day 2",
			due: "2026-05-16",
			dueAt: vnDate("2026-05-16T20:00:00"),
		});
		await seedTarget({
			orgId: "org-a",
			assignmentId: "hw-a-2",
			studentId: "stu-a",
		});
		await seedTarget({
			orgId: "org-b",
			assignmentId: "hw-b-2",
			studentId: "stu-b",
		});

		let insertCall = 0;
		const flakyDb = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "insert") {
					return (...args: Parameters<Db["insert"]>) => {
						insertCall += 1;
						if (insertCall === 1) {
							throw new Error("simulated org-a insert failure");
						}
						return target.insert(...args);
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const sentDay2: string[] = [];
		try {
			const isolated = await runDailyDeadlineReminderCron({
				db: flakyDb,
				mailer: fakeMailer(async (input) => {
					sentDay2.push(input.to);
				}),
				now: () => CRON_6AM_VN_2026_05_16,
				sendIntervalMs: 0,
			});
			expect(isolated.orgsProcessed).toBe(1);
			expect(isolated.recordsCreated).toBe(1);
			expect(sentDay2).toEqual(["binh@beta.vn"]);
			expect(errSpy).toHaveBeenCalledTimes(1);
		} finally {
			errSpy.mockRestore();
		}
	});

	test("retries failed delivery up to 3 attempts and supports manual requeue/resend with structured digest HTML", async () => {
		await seedOrgWithOwner("org-retry", "Retry Academy", "retry@academy.vn");
		await seedClass("org-retry", "cls-retry", "IELTS Retry");
		await seedStudent("org-retry", "stu-retry", "Chi", "chi@example.com");
		await seedEnrollment("org-retry", "cls-retry", "stu-retry", "active");
		await seedPrompt("org-retry", "prompt-retry");
		await seedAssignment({
			orgId: "org-retry",
			classId: "cls-retry",
			promptId: "prompt-retry",
			assignmentId: "hw-retry",
			title: "Retry Essay",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T21:00:00"),
		});
		await seedTarget({
			orgId: "org-retry",
			assignmentId: "hw-retry",
			studentId: "stu-retry",
		});

		let failAttempts = 0;
		await runDailyDeadlineReminderCron({
			db,
			mailer: fakeMailer(async () => {
				failAttempts += 1;
				throw new Error("resend 503");
			}),
			studentOrigin: "https://lms.msmy.io.vn/student",
			now: () => CRON_6AM_VN_2026_05_15,
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});

		expect(failAttempts).toBe(3);
		const [failed] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-retry"));
		if (!failed) throw new Error("expected failed row");
		expect(failed.status).toBe("failed");
		expect(failed.retryCount).toBe(3);
		expect(failed.channels).toBe("email");
		expect(failed.lastError).toContain(
			NOTIFICATION_ERROR_CODES.DELIVERY_FAILED,
		);

		const requeued = await requeueSingleFailedNotification(
			db,
			"org-retry",
			failed.id,
		);
		expect(requeued.kind).toBe("ok");
		if (requeued.kind !== "ok") throw new Error("expected ok requeue");

		const resent: Parameters<Mailer["send"]>[0][] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (input) => {
				resent.push(input);
			}),
			requeued.requeuedIds,
			"https://lms.msmy.io.vn/student",
			{ retryDelaysMs: [0, 0] },
		);

		expect(resent).toHaveLength(1);
		expect(resent[0]?.html).toContain("Bài tập về nhà (1)");
		expect(resent[0]?.html).toContain(
			'href="https://lms.msmy.io.vn/student/learn/quizzes/hw-retry"',
		);
		expect(resent[0]?.html).toContain("Xem tất cả bài tập");

		const [afterResend] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.id, failed.id));
		expect(afterResend?.status).toBe("sent");
		expect(afterResend?.channels).toBe("email");
	});

	test("leaves records queued without throwing when mailer is unavailable", async () => {
		await seedOrgWithOwner("org-nomailer", "NoMailer", "owner@nm.vn");
		await seedClass("org-nomailer", "cls-nm", "IELTS NM");
		await seedStudent("org-nomailer", "stu-nm", "Dũng", "dung@example.com");
		await seedEnrollment("org-nomailer", "cls-nm", "stu-nm", "active");
		await seedPrompt("org-nomailer", "prompt-nm");
		await seedAssignment({
			orgId: "org-nomailer",
			classId: "cls-nm",
			promptId: "prompt-nm",
			assignmentId: "hw-nm",
			title: "Task NM",
			due: "2026-05-15",
			dueAt: vnDate("2026-05-15T18:00:00"),
		});
		await seedTarget({
			orgId: "org-nomailer",
			assignmentId: "hw-nm",
			studentId: "stu-nm",
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const res = await runDailyDeadlineReminderCron({
				db,
				mailer: undefined,
				now: () => CRON_6AM_VN_2026_05_15,
				sendIntervalMs: 0,
			});
			expect(res.recordsCreated).toBe(1);
			expect(res.emailsQueued).toBe(1);
			expect(warnSpy).toHaveBeenCalledTimes(1);
		} finally {
			warnSpy.mockRestore();
		}

		const [rec] = await libsql
			.select()
			.from(notificationRecord)
			.where(eq(notificationRecord.studentId, "stu-nm"));
		expect(rec?.status).toBe("queued");
		expect(rec?.channels).toBe("email");
	});
});
