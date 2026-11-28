import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import {
	user as authUser,
	classSessionMeeting,
	classTable,
	enrollment,
	lesson,
	membership,
	notificationRecord,
	organization,
	student,
} from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { Db } from "../../app";
import { deliverNotifications } from "./deliver";
import { requeueSingleFailedNotification } from "./requeue";
import { runSessionLinkReminderCron } from "./session-link-reminder";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../../packages/db/src/migrations", import.meta.url).href,
);

function vnDate(isoDateTime: string): Date {
	return new Date(Date.parse(`${isoDateTime}+07:00`));
}

function fakeMailer(impl: Mailer["send"] = async () => {}): Mailer {
	return { send: impl };
}

describe("runSessionLinkReminderCron", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
	});

	beforeEach(async () => {
		await libsql.delete(notificationRecord);
		await libsql.delete(classSessionMeeting);
		await libsql.delete(lesson);
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

	async function seedClass(input: {
		orgId: string;
		classId: string;
		name: string;
		mode?: "Online" | "Offline" | string;
		status?: "active" | "paused";
		schedulingMode?: "auto" | "manual";
	}) {
		await libsql.insert(classTable).values({
			id: input.classId,
			orgId: input.orgId,
			name: input.name,
			mode: input.mode ?? "Online",
			status: input.status ?? "active",
			schedulingMode: input.schedulingMode ?? "auto",
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
		const id = `enr-${classId}-${studentId}`;
		await libsql.insert(enrollment).values({
			id,
			orgId,
			classId,
			studentId,
			status,
		});
		return id;
	}

	async function seedLesson(input: {
		id: string;
		orgId: string;
		classId: string;
		enrollmentId: string;
		date: string | null;
		time: string;
		dur?: number;
		status?: "upcoming" | "completed" | "absent" | "cancelled" | "holiday";
		topic?: string;
		zoom?: string;
	}) {
		await libsql.insert(lesson).values({
			id: input.id,
			orgId: input.orgId,
			classId: input.classId,
			enrollmentId: input.enrollmentId,
			day: 6,
			time: input.time,
			dur: input.dur ?? 90,
			date: input.date,
			status: input.status ?? "upcoming",
			topic: input.topic ?? "",
			zoom: input.zoom ?? "",
		});
	}

	test("sends email-only reminder with Zoom CTA and secondary portal link inside [T-2h, T), and is idempotent across ticks", async () => {
		await seedOrgWithOwner("org-1", "Anh ngữ Cô Mỹ", "teacher@comy.vn");
		await seedClass({
			orgId: "org-1",
			classId: "cls-1",
			name: "IELTS Speaking 7.0",
		});
		await seedStudent("org-1", "stu-1", "Nguyễn Minh Anh", "anh@student.vn");
		const enr1 = await seedEnrollment("org-1", "cls-1", "stu-1", "active");
		await seedLesson({
			id: "les-1",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "19:00",
			dur: 90,
			topic: "Cue Card Practice",
			zoom: "https://zoom.us/j/888999000",
		});

		const sent: Parameters<Mailer["send"]>[0][] = [];
		const getMailer = vi.fn(() =>
			fakeMailer(async (msg) => {
				sent.push(msg);
			}),
		);

		const res1 = await runSessionLinkReminderCron({
			db,
			getMailer,
			studentOrigin: "https://lms.msmy.io.vn/student",
			now: () => vnDate("2026-11-28T17:00:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});

		expect(res1).toEqual({
			checkedAtISO: "2026-11-28T10:00:00.000Z",
			candidatesMatched: 1,
			recordsCreated: 1,
			emailsQueued: 1,
			skippedNoLink: 0,
			skippedNoEmail: 0,
			orgsProcessed: 1,
		});
		expect(getMailer).toHaveBeenCalledTimes(1);
		expect(sent).toHaveLength(1);
		expect(sent[0]?.to).toBe("anh@student.vn");
		expect(sent[0]?.subject).toBe(
			"Link buổi học lớp IELTS Speaking 7.0 — 19:00, 28/11/2026",
		);
		expect(sent[0]?.html).toContain('href="https://zoom.us/j/888999000"');
		expect(sent[0]?.html).toContain("Tham gia buổi học");
		expect(sent[0]?.html).toContain(
			'href="https://lms.msmy.io.vn/student/classes/cls-1/sessions/2026-11-28"',
		);
		expect(sent[0]?.html).toContain("Cue Card Practice");
		expect(sent[0]?.text).toContain("https://zoom.us/j/888999000");

		const rows = await libsql.select().from(notificationRecord);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.eventType).toBe("session_link_reminder");
		expect(rows[0]?.eventGroup).toBe("schedule");
		expect(rows[0]?.channels).toBe("email");
		expect(rows[0]?.status).toBe("sent");
		expect(rows[0]?.idempotencyKey).toBe(
			"session_link_reminder:cls-1:2026-11-28:19:00:stu-1",
		);
		expect(rows[0]?.refType).toBe("lesson");
		expect(rows[0]?.refId).toBe("cls-1:2026-11-28");

		// Second cron tick 10 minutes later: idempotent, does not resolve getMailer again
		getMailer.mockClear();
		const res2 = await runSessionLinkReminderCron({
			db,
			getMailer,
			studentOrigin: "https://lms.msmy.io.vn/student",
			now: () => vnDate("2026-11-28T17:10:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(res2.recordsCreated).toBe(0);
		expect(res2.emailsQueued).toBe(0);
		expect(getMailer).not.toHaveBeenCalled();
		expect(sent).toHaveLength(1);
	});

	test("falls back to class_session_meeting.join_url when lesson.zoom is empty/invalid, and prefers valid lesson.zoom", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t@org1.vn");
		await seedClass({ orgId: "org-1", classId: "cls-1", name: "IELTS A" });
		await seedStudent("org-1", "stu-1", "An", "an@test.vn");
		await seedStudent("org-1", "stu-2", "Binh", "binh@test.vn");
		const enr1 = await seedEnrollment("org-1", "cls-1", "stu-1");
		const enr2 = await seedEnrollment("org-1", "cls-1", "stu-2");

		await libsql.insert(classSessionMeeting).values({
			id: "csm-1",
			orgId: "org-1",
			classId: "cls-1",
			date: "2026-11-28",
			joinUrl: "https://zoom.us/j/meeting-fallback",
		});

		await seedLesson({
			id: "les-1",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "19:00",
			zoom: "",
		});
		await seedLesson({
			id: "les-2",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr2,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/lesson-override",
		});

		const sent: Array<{ to: string; html: string }> = [];
		await runSessionLinkReminderCron({
			db,
			mailer: fakeMailer(async (m) => {
				sent.push({ to: m.to, html: m.html });
			}),
			now: () => vnDate("2026-11-28T17:30:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});

		expect(sent).toHaveLength(2);
		expect(sent.find((s) => s.to === "an@test.vn")?.html).toContain(
			"https://zoom.us/j/meeting-fallback",
		);
		expect(sent.find((s) => s.to === "binh@test.vn")?.html).toContain(
			"https://zoom.us/j/lesson-override",
		);
	});

	test("skips session missing valid Zoom link without recording, then sends when teacher adds link before start", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t@org1.vn");
		await seedClass({ orgId: "org-1", classId: "cls-1", name: "IELTS A" });
		await seedStudent("org-1", "stu-1", "An", "an@test.vn");
		const enr1 = await seedEnrollment("org-1", "cls-1", "stu-1");
		await seedLesson({
			id: "les-1",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "19:00",
			zoom: "",
		});

		const sent: string[] = [];
		const getMailer = vi.fn(() =>
			fakeMailer(async (m) => {
				sent.push(m.html);
			}),
		);

		const resMissing = await runSessionLinkReminderCron({
			db,
			getMailer,
			now: () => vnDate("2026-11-28T17:00:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(resMissing.skippedNoLink).toBe(1);
		expect(resMissing.recordsCreated).toBe(0);
		expect(getMailer).not.toHaveBeenCalled();
		expect(await libsql.select().from(notificationRecord)).toHaveLength(0);

		// Teacher adds Zoom link at 17:25 (still inside [17:00, 19:00))
		await libsql
			.update(lesson)
			.set({ zoom: "https://zoom.us/j/late-added-999" })
			.where(eq(lesson.id, "les-1"));

		const resLater = await runSessionLinkReminderCron({
			db,
			getMailer,
			now: () => vnDate("2026-11-28T17:30:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(resLater.recordsCreated).toBe(1);
		expect(resLater.emailsQueued).toBe(1);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toContain("https://zoom.us/j/late-added-999");
	});

	test("filters out too_early, started, Offline, paused, invited, inactive statuses, demo-student, and missing email", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t@org1.vn");
		await seedClass({
			orgId: "org-1",
			classId: "cls-online",
			name: "Online Active",
			mode: "Online",
			status: "active",
		});
		await seedClass({
			orgId: "org-1",
			classId: "cls-offline",
			name: "Offline Active",
			mode: "Offline",
			status: "active",
		});
		await seedClass({
			orgId: "org-1",
			classId: "cls-paused",
			name: "Online Paused",
			mode: "Online",
			status: "paused",
		});

		await seedStudent("org-1", "stu-ok", "OK", "ok@test.vn");
		await seedStudent("org-1", "stu-no-email", "No Email", "   ");
		await seedStudent("org-1", "stu-invited", "Invited", "inv@test.vn");
		await seedStudent("org-1", "demo-student:1", "Demo", "demo@test.vn");

		const eOk = await seedEnrollment("org-1", "cls-online", "stu-ok", "active");
		const eNoEmail = await seedEnrollment(
			"org-1",
			"cls-online",
			"stu-no-email",
			"active",
		);
		const eInvited = await seedEnrollment(
			"org-1",
			"cls-online",
			"stu-invited",
			"invited",
		);
		const eDemo = await seedEnrollment(
			"org-1",
			"cls-online",
			"demo-student:1",
			"active",
		);
		const eOffline = await seedEnrollment(
			"org-1",
			"cls-offline",
			"stu-ok",
			"active",
		);
		const ePaused = await seedEnrollment(
			"org-1",
			"cls-paused",
			"stu-ok",
			"active",
		);

		const zoomUrl = "https://zoom.us/j/111222";
		// Window check at 17:00 -> only 17:01..19:00 sessions are in [T-2h, T)
		await seedLesson({
			id: "l-too-early",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eOk,
			date: "2026-11-28",
			time: "19:01",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-started",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eOk,
			date: "2026-11-28",
			time: "17:00",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-cancelled",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eOk,
			date: "2026-11-28",
			time: "18:30",
			status: "cancelled",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-holiday",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eOk,
			date: "2026-11-28",
			time: "18:30",
			status: "holiday",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-no-email",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eNoEmail,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-invited",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eInvited,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-demo",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eDemo,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-offline",
			orgId: "org-1",
			classId: "cls-offline",
			enrollmentId: eOffline,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});
		await seedLesson({
			id: "l-paused",
			orgId: "org-1",
			classId: "cls-paused",
			enrollmentId: ePaused,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});
		// Valid lesson: 18:30
		await seedLesson({
			id: "l-valid",
			orgId: "org-1",
			classId: "cls-online",
			enrollmentId: eOk,
			date: "2026-11-28",
			time: "18:30",
			zoom: zoomUrl,
		});

		const sent: string[] = [];
		const res = await runSessionLinkReminderCron({
			db,
			mailer: fakeMailer(async (m) => {
				sent.push(m.to);
			}),
			now: () => vnDate("2026-11-28T17:00:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});

		expect(res.candidatesMatched).toBe(2); // stu-ok + stu-no-email
		expect(res.skippedNoEmail).toBe(1);
		expect(res.recordsCreated).toBe(1);
		expect(res.emailsQueued).toBe(1);
		expect(sent).toEqual(["ok@test.vn"]);
	});

	test("handles midnight-crossing tomorrow session, same-day multiple sessions, and rescheduled time", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t@org1.vn");
		await seedClass({ orgId: "org-1", classId: "cls-1", name: "Night Owl" });
		await seedStudent("org-1", "stu-1", "An", "an@test.vn");
		const enr1 = await seedEnrollment("org-1", "cls-1", "stu-1");

		// Tomorrow 00:30 VN (2026-11-29) -> due at 22:30 VN on 2026-11-28
		await seedLesson({
			id: "l-midnight",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-29",
			time: "00:30",
			zoom: "https://zoom.us/j/midnight",
		});
		// Morning & evening sessions on 2026-11-28
		await seedLesson({
			id: "l-morning",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "09:00",
			zoom: "https://zoom.us/j/morning",
		});
		await seedLesson({
			id: "l-evening",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "23:30",
			zoom: "https://zoom.us/j/evening",
		});

		const sentSubjects: string[] = [];
		const mailer = fakeMailer(async (m) => {
			sentSubjects.push(m.subject);
		});

		// 07:00 VN -> morning 09:00 due
		await runSessionLinkReminderCron({
			db,
			mailer,
			now: () => vnDate("2026-11-28T07:00:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(sentSubjects).toEqual([
			"Link buổi học lớp Night Owl — 09:00, 28/11/2026",
		]);

		// 22:30 VN -> both 23:30 today AND 00:30 tomorrow are in [T-2h, T)
		await runSessionLinkReminderCron({
			db,
			mailer,
			now: () => vnDate("2026-11-28T22:30:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(sentSubjects).toHaveLength(3);
		expect(sentSubjects[0]).toBe(
			"Link buổi học lớp Night Owl — 09:00, 28/11/2026",
		);
		expect(sentSubjects.slice(1)).toEqual(
			expect.arrayContaining([
				"Link buổi học lớp Night Owl — 23:30, 28/11/2026",
				"Link buổi học lớp Night Owl — 00:30, 29/11/2026",
			]),
		);

		// Teacher reschedules tomorrow 00:30 -> 01:00 and updates Zoom link -> new window sends new email
		await libsql
			.update(lesson)
			.set({ time: "01:00", zoom: "https://zoom.us/j/rescheduled" })
			.where(eq(lesson.id, "l-midnight"));
		await runSessionLinkReminderCron({
			db,
			mailer,
			now: () => vnDate("2026-11-28T23:05:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 0,
		});
		expect(sentSubjects).toHaveLength(4);
		expect(sentSubjects[3]).toBe(
			"Link buổi học lớp Night Owl — 01:00, 29/11/2026",
		);
	});

	test("keeps record queued without mailer and supports failed retry + manual requeue", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t@org1.vn");
		await seedClass({ orgId: "org-1", classId: "cls-1", name: "IELTS A" });
		await seedStudent("org-1", "stu-1", "An", "an@test.vn");
		const enr1 = await seedEnrollment("org-1", "cls-1", "stu-1");
		await seedLesson({
			id: "l-1",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: enr1,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/123",
		});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const resNoMailer = await runSessionLinkReminderCron({
				db,
				now: () => vnDate("2026-11-28T17:10:00"),
				retryDelaysMs: [0, 0],
				sendIntervalMs: 0,
			});
			expect(resNoMailer.recordsCreated).toBe(1);
			expect(resNoMailer.emailsQueued).toBe(1);
			expect(resNoMailer.orgsProcessed).toBe(0);
		} finally {
			warnSpy.mockRestore();
		}

		const [queued] = await libsql.select().from(notificationRecord);
		expect(queued?.status).toBe("queued");

		// Simulate 3 failed attempts -> failed, then manual requeue -> sent
		await deliverNotifications(
			db,
			fakeMailer(async () => {
				throw new Error("resend 503");
			}),
			[queued?.id ?? ""],
			"https://lms.msmy.io.vn/student",
			{ retryDelaysMs: [0, 0] },
		);
		const [failed] = await libsql.select().from(notificationRecord);
		expect(failed?.status).toBe("failed");

		const requeue = await requeueSingleFailedNotification(
			db,
			"org-1",
			failed?.id ?? "",
		);
		expect(requeue.kind).toBe("ok");
		const resentHtml: string[] = [];
		await deliverNotifications(
			db,
			fakeMailer(async (m) => {
				resentHtml.push(m.html);
			}),
			requeue.kind === "ok" ? requeue.requeuedIds : [],
			"https://lms.msmy.io.vn/student",
			{ retryDelaysMs: [0, 0] },
		);
		expect(resentHtml[0]).toContain("https://zoom.us/j/123");
	});

	test("supports manual schedulingMode classes and paces multi-org sequential delivery with sendIntervalMs", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t1@org.vn");
		await seedOrgWithOwner("org-2", "Org 2", "t2@org.vn");

		await seedClass({
			orgId: "org-1",
			classId: "cls-m1",
			name: "Manual Online 1",
			schedulingMode: "manual",
		});
		await seedClass({
			orgId: "org-2",
			classId: "cls-m2",
			name: "Manual Online 2",
			schedulingMode: "manual",
		});

		await seedStudent("org-1", "stu-1", "An", "an@org1.vn");
		await seedStudent("org-2", "stu-2", "Binh", "binh@org2.vn");

		const e1 = await seedEnrollment("org-1", "cls-m1", "stu-1");
		const e2 = await seedEnrollment("org-2", "cls-m2", "stu-2");

		await seedLesson({
			id: "les-m1",
			orgId: "org-1",
			classId: "cls-m1",
			enrollmentId: e1,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/manual-1",
		});
		await seedLesson({
			id: "les-m2",
			orgId: "org-2",
			classId: "cls-m2",
			enrollmentId: e2,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/manual-2",
		});

		const sendTimes: number[] = [];
		const sentTo: string[] = [];
		const res = await runSessionLinkReminderCron({
			db,
			mailer: fakeMailer(async (m) => {
				sendTimes.push(Date.now());
				sentTo.push(m.to);
			}),
			now: () => vnDate("2026-11-28T17:30:00"),
			retryDelaysMs: [0, 0],
			sendIntervalMs: 35,
		});

		expect(res.recordsCreated).toBe(2);
		expect(res.emailsQueued).toBe(2);
		expect(res.orgsProcessed).toBe(2);
		expect(sentTo).toEqual(["an@org1.vn", "binh@org2.vn"]);
		expect((sendTimes[1] ?? 0) - (sendTimes[0] ?? 0)).toBeGreaterThanOrEqual(
			25,
		);
	});

	test("isolates per-org errors in enqueue/delivery so remaining orgs finish, then rethrows firstError", async () => {
		await seedOrgWithOwner("org-1", "Org 1", "t1@org.vn");
		await seedOrgWithOwner("org-2", "Org 2", "t2@org.vn");
		await seedClass({ orgId: "org-1", classId: "cls-1", name: "Online 1" });
		await seedClass({ orgId: "org-2", classId: "cls-2", name: "Online 2" });
		await seedStudent("org-1", "stu-1", "An", "an@org1.vn");
		await seedStudent("org-2", "stu-2", "Binh", "binh@org2.vn");
		const e1 = await seedEnrollment("org-1", "cls-1", "stu-1");
		const e2 = await seedEnrollment("org-2", "cls-2", "stu-2");
		await seedLesson({
			id: "les-1",
			orgId: "org-1",
			classId: "cls-1",
			enrollmentId: e1,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/111",
		});
		await seedLesson({
			id: "les-2",
			orgId: "org-2",
			classId: "cls-2",
			enrollmentId: e2,
			date: "2026-11-28",
			time: "19:00",
			zoom: "https://zoom.us/j/222",
		});

		let insertCalls = 0;
		const proxyDb = new Proxy(db as object, {
			get(target, prop, receiver) {
				if (prop === "insert") {
					insertCalls += 1;
					if (insertCalls === 1) {
						return () => {
							throw new Error("org-1 d1 write error");
						};
					}
				}
				return Reflect.get(target, prop, receiver);
			},
		}) as Db;

		const sentTo: string[] = [];
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			await expect(
				runSessionLinkReminderCron({
					db: proxyDb,
					mailer: fakeMailer(async (m) => {
						sentTo.push(m.to);
					}),
					now: () => vnDate("2026-11-28T17:30:00"),
					retryDelaysMs: [0, 0],
					sendIntervalMs: 0,
				}),
			).rejects.toThrow("org-1 d1 write error");
			expect(errSpy).toHaveBeenCalledTimes(1);
		} finally {
			errSpy.mockRestore();
		}

		expect(sentTo).toEqual(["binh@org2.vn"]);
	});
});
