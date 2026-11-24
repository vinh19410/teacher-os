import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	CLASS_ERROR_CODES,
	classConfirmOpeningResponseSchema,
	type KernelSnapshot,
	type NotificationLogResponse,
} from "@teacher-os/api/contracts";
import {
	addDaysISO,
	formatViDateDisplay,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import type { Mailer } from "@teacher-os/auth/mail/mailer";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { renderHtml } from "./lib/notifications/deliver";

const CORS_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "https://student.teacheros.example";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function futureMondayISO(minDaysAhead = 7): string {
	let candidate = addDaysISO(vietnamTodayISO(), minDaysAhead);
	while (new Date(`${candidate}T00:00:00Z`).getUTCDay() !== 1) {
		candidate = addDaysISO(candidate, 1);
	}
	return candidate;
}

type MailPayload = Parameters<Mailer["send"]>[0];

async function setupTestApp(options?: {
	mailerImpl?: Mailer["send"];
	studentOrigin?: string;
	now?: () => Date;
}) {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	const sentMails: MailPayload[] = [];
	let currentMailerImpl: Mailer["send"] =
		options?.mailerImpl ??
		(async (input) => {
			sentMails.push(input);
		});

	const mailer: Mailer = {
		send: (input) => currentMailerImpl(input),
	};

	async function getSessionUser(headers: Headers) {
		const cookie = headers.get("cookie") ?? "";
		const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
		if (!token) return null;
		const [row] = await libsql
			.select({
				userId: authSession.userId,
				expiresAt: authSession.expiresAt,
				userName: authUser.name,
				role: authUser.role,
			})
			.from(authSession)
			.innerJoin(authUser, eq(authSession.userId, authUser.id))
			.where(eq(authSession.token, token));
		if (!row || row.expiresAt.getTime() <= Date.now()) return null;
		const role: "teacher" | "student" | "admin" =
			row.role === "student" || row.role === "admin" ? row.role : "teacher";
		return {
			userId: row.userId,
			userName: row.userName,
			role,
		};
	}

	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
		mailer,
		studentOrigin: options?.studentOrigin ?? STUDENT_ORIGIN,
		notificationRetryDelaysMs: [0, 0],
		now: options?.now,
	});

	async function insertUser(
		name: string,
		role: "teacher" | "student" | "admin" = "teacher",
	): Promise<{ id: string; token: string }> {
		const userId = crypto.randomUUID();
		const token = crypto.randomUUID();
		await libsql.insert(authUser).values({
			id: userId,
			name,
			email: `${userId}@test.local`,
			role,
		});
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			token,
			userId,
		});
		return { id: userId, token };
	}

	async function addTaToTeacherOrg(
		teacherUserId: string,
		taName = "TA User",
	): Promise<{ id: string; token: string }> {
		const [mem] = await libsql
			.select({ orgId: schema.membership.orgId })
			.from(schema.membership)
			.where(eq(schema.membership.userId, teacherUserId))
			.limit(1);
		if (!mem) throw new Error("teacher org not bootstrapped");
		const ta = await insertUser(taName, "teacher");
		await libsql.insert(schema.membership).values({
			id: crypto.randomUUID(),
			orgId: mem.orgId,
			userId: ta.id,
			role: "ta",
		});
		return ta;
	}

	async function getOrgIdForUser(userId: string): Promise<string> {
		const [mem] = await libsql
			.select({ orgId: schema.membership.orgId })
			.from(schema.membership)
			.where(eq(schema.membership.userId, userId))
			.limit(1);
		if (!mem) throw new Error("org not bootstrapped");
		return mem.orgId;
	}

	function call(
		token: string | null,
		path: string,
		options: {
			method?: string;
			body?: unknown;
			origin?: string | null;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (token !== null) {
			headers.cookie = `better-auth.session_token=${token}`;
		}
		if (options.origin !== null) {
			headers.origin = options.origin ?? CORS_ORIGIN;
		}
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method: options.method ?? "POST",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function kernel(token: string): Promise<KernelSnapshot> {
		const res = await app.request("/api/kernel", {
			headers: {
				cookie: `better-auth.session_token=${token}`,
				origin: CORS_ORIGIN,
			},
		});
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	async function createClass(
		token: string,
		overrides: Partial<{
			name: string;
			level: string;
			mode: string;
			schedule: { days: number[]; start: string; end: string };
			sessionsTotal: number;
			startDate: string;
			schedulingMode: "auto" | "manual";
		}> = {},
	): Promise<string> {
		const res = await call(token, "/api/classes", {
			body: {
				name: overrides.name ?? "IELTS Foundation 6.0",
				type: "ielts",
				level: overrides.level ?? "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: overrides.mode ?? "Online",
				templateId: "",
				schedule: overrides.schedule ?? {
					days: [0, 2],
					start: "19:00",
					end: "20:30",
				},
				sessionsTotal: overrides.sessionsTotal ?? 12,
				startDate:
					overrides.startDate !== undefined
						? overrides.startDate
						: futureMondayISO(),
				tuitionFee: 3_500_000,
				schedulingMode: overrides.schedulingMode ?? "auto",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	async function seedStudentAndEnroll(params: {
		orgId: string;
		classId: string;
		name: string;
		email: string;
		status: "active" | "invited";
	}): Promise<string> {
		const studentId = crypto.randomUUID();
		await libsql.insert(schema.student).values({
			id: studentId,
			orgId: params.orgId,
			name: params.name,
			email: params.email,
		});
		await libsql.insert(schema.enrollment).values({
			id: crypto.randomUUID(),
			orgId: params.orgId,
			classId: params.classId,
			studentId,
			status: params.status,
		});
		return studentId;
	}

	return {
		db,
		libsql,
		app,
		sentMails,
		setMailerImpl(impl: Mailer["send"]) {
			currentMailerImpl = impl;
		},
		insertUser,
		addTaToTeacherOrg,
		getOrgIdForUser,
		call,
		kernel,
		createClass,
		seedStudentAndEnroll,
	};
}

describe("POST /api/classes/:id/confirm-opening", () => {
	test("enforces auth (401), TA role (403), class not found (404), cross-tenant isolation (404), and paused class (409)", async () => {
		const t = await setupTestApp();
		const teacherA = await t.insertUser("Teacher A");
		const teacherB = await t.insertUser("Teacher B");
		const studentUser = await t.insertUser("Student User", "student");
		const adminUser = await t.insertUser("Admin User", "admin");

		const classId = await t.createClass(teacherA.token);
		const taUser = await t.addTaToTeacherOrg(teacherA.id);

		const validBody = {
			mode: "initial",
			note: "Chuẩn bị bài trước buổi đầu",
			expectedVersion: 0,
		};

		// 401 unauthorized
		const unauth = await t.call(
			null,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: validBody,
			},
		);
		expect(unauth.status).toBe(401);

		// 403 student / admin
		const asStudent = await t.call(
			studentUser.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: validBody },
		);
		expect(asStudent.status).toBe(403);

		const asAdmin = await t.call(
			adminUser.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: validBody },
		);
		expect(asAdmin.status).toBe(403);

		// 403 TA role forbidden
		const asTa = await t.call(
			taUser.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: validBody },
		);
		expect(asTa.status).toBe(403);
		expect(await asTa.json()).toMatchObject({
			error: "forbidden",
			code: "FORBIDDEN",
		});

		// 404 class not found
		const missing = await t.call(
			teacherA.token,
			"/api/classes/non-existent/confirm-opening",
			{ body: validBody },
		);
		expect(missing.status).toBe(404);

		// 404 cross-tenant isolation (org B cannot confirm org A's class)
		const crossTenant = await t.call(
			teacherB.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: validBody },
		);
		expect(crossTenant.status).toBe(404);

		// 409 paused class
		const pauseRes = await t.call(
			teacherA.token,
			`/api/classes/${classId}/status`,
			{ body: { status: "paused" } },
		);
		expect(pauseRes.status).toBe(200);

		const paused = await t.call(
			teacherA.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: validBody },
		);
		expect(paused.status).toBe(409);
		expect(await paused.json()).toMatchObject({
			code: CLASS_ERROR_CODES.CLASS_PAUSED,
		});
	});

	test("validates missing startDate (400), past startDate on change (400), pre-initial mode (400), and schedule lock when changing startDate with real sessions (409)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Validation");
		const classId = await t.createClass(teacher.token, {
			startDate: futureMondayISO(10),
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		// Mode new_only / all before initial confirmation -> 400
		const preInitialNewOnly = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "new_only", expectedVersion: 0 } },
		);
		expect(preInitialNewOnly.status).toBe(400);

		const preInitialAll = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "all", expectedVersion: 0 } },
		);
		expect(preInitialAll.status).toBe(400);

		// Empty startDate on class & omitted in input -> 400
		await t.libsql
			.update(schema.classTable)
			.set({ startDate: "" })
			.where(eq(schema.classTable.id, classId));
		const emptyStartRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "initial", expectedVersion: 0 } },
		);
		expect(emptyStartRes.status).toBe(400);

		// Past startDate when changing -> 400
		const pastDate = addDaysISO(vietnamTodayISO(), -3);
		const pastRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: pastDate,
					expectedVersion: 0,
				},
			},
		);
		expect(pastRes.status).toBe(400);

		// Restore valid startDate and create a real class_session -> changing startDate returns 409 CLASS_SCHEDULE_LOCKED
		const currentStart = futureMondayISO(7);
		const changedStart = futureMondayISO(14);
		await t.libsql
			.update(schema.classTable)
			.set({ startDate: currentStart })
			.where(eq(schema.classTable.id, classId));
		await t.libsql.insert(schema.classSession).values({
			id: crypto.randomUUID(),
			orgId,
			classId,
			date: currentStart,
			time: "19:00",
			dur: 90,
			topic: "Buổi 1",
		});

		const lockedRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: changedStart,
					expectedVersion: 0,
				},
			},
		);
		expect(lockedRes.status).toBe(409);
		expect(await lockedRes.json()).toMatchObject({
			code: CLASS_ERROR_CODES.SCHEDULE_LOCKED,
		});

		// Confirming without changing startDate succeeds even when real sessions exist
		const unchangedStartRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: currentStart,
					note: "Lớp đã có buổi, giữ nguyên ngày",
					expectedVersion: 0,
				},
			},
		);
		expect(unchangedStartRes.status).toBe(200);
		const parsed = classConfirmOpeningResponseSchema.parse(
			await unchangedStartRes.json(),
		);
		expect(parsed.startDate).toBe(currentStart);
		expect(parsed.openingAnnouncementVersion).toBe(1);
	});

	test("happy path initial: syncs startDate when unlocked, sends rich HTML to active & invited students, creates in_app-only for students without email, and updates snapshot", async () => {
		const fixedNow = new Date("2026-05-01T08:00:00.000Z");
		const t = await setupTestApp({ now: () => fixedNow });
		const teacher = await t.insertUser("Cô Mỹ English");

		const initialStart = futureMondayISO(7);
		const updatedStart = futureMondayISO(14);
		const classId = await t.createClass(teacher.token, {
			name: "IELTS 6.5 Intensive",
			level: "Band 6.5",
			mode: "Online",
			schedule: { days: [0, 2], start: "19:00", end: "20:30" },
			sessionsTotal: 20,
			startDate: initialStart,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const activeStudentId = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Nguyễn Văn An",
			email: "an@example.com",
			status: "active",
		});
		const invitedStudentId = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Trần Thu Hà",
			email: "ha@example.com",
			status: "invited",
		});
		const noEmailStudentId = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Phạm Quốc Bảo",
			email: "   ",
			status: "active",
		});

		const teacherNote =
			"Vào lớp sớm 10 phút <script>alert(1)</script>\nMang theo tài liệu";
		const res = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: updatedStart,
					note: teacherNote,
					expectedVersion: 0,
				},
			},
		);
		expect(res.status).toBe(200);
		const body = classConfirmOpeningResponseSchema.parse(await res.json());

		expect(body.ok).toBe(true);
		expect(body.openingConfirmedAt).toBe(fixedNow.toISOString());
		expect(body.openingAnnouncementVersion).toBe(1);
		expect(body.startDate).toBe(updatedStart);
		expect(body.openingNote).toBe(teacherNote);
		expect(body.queuedEmailCount).toBe(2);
		expect(body.inAppOnlyCount).toBe(1);
		expect(body.skippedAlreadySentCount).toBe(0);
		expect(body.skippedNoEmail).toEqual([
			{ studentId: noEmailStudentId, studentName: "Phạm Quốc Bảo" },
		]);
		expect(new Set(body.notifiedStudentIds)).toEqual(
			new Set([activeStudentId, invitedStudentId, noEmailStudentId]),
		);

		// Verify rich HTML emails delivered to both active and invited students
		expect(t.sentMails).toHaveLength(2);
		const mailAn = t.sentMails.find((m) => m.to === "an@example.com");
		const mailHa = t.sentMails.find((m) => m.to === "ha@example.com");
		expect(mailAn).toBeDefined();
		expect(mailHa).toBeDefined();

		const expectedShortDate = formatViDateDisplay(updatedStart);
		for (const [mail, studentName] of [
			[mailAn, "Nguyễn Văn An"],
			[mailHa, "Trần Thu Hà"],
		] as const) {
			if (!mail) throw new Error("missing mail");
			expect(mail.subject).toContain(
				"Thông báo khai giảng lớp IELTS 6.5 Intensive",
			);
			expect(mail.subject).toContain(expectedShortDate);
			expect(mail.html).toContain("<!DOCTYPE html>");
			expect(mail.html).toContain(`Chào ${studentName},`);
			expect(mail.html).toContain("IELTS 6.5 Intensive");
			expect(mail.html).toContain(expectedShortDate);
			expect(mail.html).toContain("19:00 – 20:30");
			expect(mail.html).toContain("20 buổi");
			expect(mail.html).toContain(
				"Vào lớp sớm 10 phút &lt;script&gt;alert(1)&lt;/script&gt;<br>Mang theo tài liệu",
			);
			expect(mail.html).not.toContain("<script>alert(1)</script>");
			expect(mail.html).toContain(`href="${STUDENT_ORIGIN}/classes"`);
		}

		// Verify in_app record exists for student without email
		const noEmailNotifs = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(
				and(
					eq(schema.notificationRecord.orgId, orgId),
					eq(schema.notificationRecord.studentId, noEmailStudentId),
					eq(schema.notificationRecord.eventType, "class_opening_confirmed"),
				),
			);
		expect(noEmailNotifs).toHaveLength(1);
		expect(noEmailNotifs[0]?.channels).toBe("in_app");
		expect(noEmailNotifs[0]?.status).toBe("sent");
		expect(noEmailNotifs[0]?.htmlBody).toContain("Chào Phạm Quốc Bảo,");

		// Verify snapshot projection exposes opening fields
		const snap = await t.kernel(teacher.token);
		const snapCls = snap.classes.find((c) => c.id === classId);
		expect(snapCls).toBeDefined();
		expect(snapCls?.startDate).toBe(updatedStart);
		expect(snapCls?.openingConfirmedAt).toBe(fixedNow.toISOString());
		expect(snapCls?.openingNote).toBe(teacherNote);
		expect(snapCls?.openingAnnouncementVersion).toBe(1);
		expect(new Set(snapCls?.openingNotifiedStudentIds ?? [])).toEqual(
			new Set([activeStudentId, invitedStudentId, noEmailStudentId]),
		);
	});

	test("handles CAS conflicts, new_only idempotent send, and all-student update broadcast", async () => {
		let currentTime = new Date("2026-05-01T08:00:00.000Z");
		const t = await setupTestApp({ now: () => currentTime });
		const teacher = await t.insertUser("Teacher Broadcast");

		const startDate = futureMondayISO(10);
		const classId = await t.createClass(teacher.token, {
			name: "Speaking Mastery",
			startDate,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const s1 = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Học viên 1",
			email: "s1@example.com",
			status: "active",
		});

		// Mismatched expectedVersion before initial -> 409
		const badVersion = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "initial", expectedVersion: 2 } },
		);
		expect(badVersion.status).toBe(409);
		expect(await badVersion.json()).toMatchObject({
			code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
		});

		// Initial confirm (v0 -> v1)
		const initialRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					note: "Lần đầu khai giảng",
					expectedVersion: 0,
				},
			},
		);
		expect(initialRes.status).toBe(200);
		const initialBody = classConfirmOpeningResponseSchema.parse(
			await initialRes.json(),
		);
		expect(initialBody.openingAnnouncementVersion).toBe(1);
		expect(t.sentMails).toHaveLength(1);

		// Calling initial again with stale expectedVersion=0 -> 409
		const staleInitial = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "initial", expectedVersion: 0 } },
		);
		expect(staleInitial.status).toBe(409);
		expect(await staleInitial.json()).toMatchObject({
			code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
		});

		// Calling initial again with current expectedVersion=1 -> 409
		const dupInitial = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{ body: { mode: "initial", expectedVersion: 1 } },
		);
		expect(dupInitial.status).toBe(409);
		expect(await dupInitial.json()).toMatchObject({
			code: CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT,
		});

		// Enroll a new student (invited) and send new_only
		const s2 = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Học viên mới 2",
			email: "s2@example.com",
			status: "invited",
		});

		currentTime = new Date("2026-05-02T09:00:00.000Z");
		t.sentMails.length = 0;

		const newOnlyRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					note: "Chào mừng học viên mới",
					expectedVersion: 1,
				},
			},
		);
		expect(newOnlyRes.status).toBe(200);
		const newOnlyBody = classConfirmOpeningResponseSchema.parse(
			await newOnlyRes.json(),
		);
		expect(newOnlyBody.openingAnnouncementVersion).toBe(1);
		expect(newOnlyBody.openingConfirmedAt).toBe("2026-05-01T08:00:00.000Z");
		expect(newOnlyBody.openingNote).toBe("Lần đầu khai giảng");
		expect(newOnlyBody.queuedEmailCount).toBe(1);
		expect(newOnlyBody.inAppOnlyCount).toBe(0);
		expect(newOnlyBody.skippedAlreadySentCount).toBe(1);
		expect(new Set(newOnlyBody.notifiedStudentIds)).toEqual(new Set([s1, s2]));
		expect(t.sentMails).toHaveLength(1);
		expect(t.sentMails[0]?.to).toBe("s2@example.com");
		expect(t.sentMails[0]?.subject).toContain("Thông báo khai giảng lớp");

		// Second new_only immediately is idempotent: sends 0 emails
		t.sentMails.length = 0;
		const newOnlyAgain = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					note: "Chào mừng học viên mới",
					expectedVersion: 1,
				},
			},
		);
		expect(newOnlyAgain.status).toBe(200);
		const newOnlyAgainBody = classConfirmOpeningResponseSchema.parse(
			await newOnlyAgain.json(),
		);
		expect(newOnlyAgainBody.queuedEmailCount).toBe(0);
		expect(newOnlyAgainBody.inAppOnlyCount).toBe(0);
		expect(newOnlyAgainBody.skippedAlreadySentCount).toBe(2);
		expect(t.sentMails).toHaveLength(0);

		// Mode "all" (update broadcast): v1 -> v2, updates openingConfirmedAt and sends update email to all active + invited
		const shiftedStart = futureMondayISO(17);
		currentTime = new Date("2026-05-03T10:00:00.000Z");
		t.sentMails.length = 0;

		const allRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "all",
					startDate: shiftedStart,
					note: "Dời lịch khai giảng sang tuần sau",
					expectedVersion: 1,
				},
			},
		);
		expect(allRes.status).toBe(200);
		const allBody = classConfirmOpeningResponseSchema.parse(
			await allRes.json(),
		);
		expect(allBody.openingAnnouncementVersion).toBe(2);
		expect(allBody.openingConfirmedAt).toBe("2026-05-03T10:00:00.000Z");
		expect(allBody.startDate).toBe(shiftedStart);
		expect(allBody.queuedEmailCount).toBe(2);
		expect(allBody.inAppOnlyCount).toBe(0);
		expect(allBody.skippedAlreadySentCount).toBe(0);
		expect(allBody.notifiedStudentIds).toHaveLength(2);
		expect(new Set(allBody.notifiedStudentIds)).toEqual(new Set([s1, s2]));

		expect(t.sentMails).toHaveLength(2);
		for (const mail of t.sentMails) {
			expect(mail.subject).toContain(
				"Cập nhật lịch khai giảng lớp Speaking Mastery",
			);
			expect(mail.html).toContain("Cập nhật lịch khai giảng");
			expect(mail.html).toContain("Dời lịch khai giảng sang tuần sau");
		}

		// Snapshot also reports deduplicated openingNotifiedStudentIds and version 2
		const snap = await t.kernel(teacher.token);
		const snapCls = snap.classes.find((c) => c.id === classId);
		expect(snapCls?.openingAnnouncementVersion).toBe(2);
		expect(snapCls?.openingNotifiedStudentIds).toHaveLength(2);
		expect(new Set(snapCls?.openingNotifiedStudentIds ?? [])).toEqual(
			new Set([s1, s2]),
		);
	});

	test("end-to-end resend via POST /api/notification-logs/:id/resend delivers exact stored rich HTML", async () => {
		const t = await setupTestApp({
			mailerImpl: async () => {
				throw new Error("resend upstream 503");
			},
		});
		const teacher = await t.insertUser("Teacher Resend");
		const classId = await t.createClass(teacher.token, {
			name: "IELTS Writing 7.5",
			startDate: futureMondayISO(12),
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Lê Minh Khoa",
			email: "khoa@example.com",
			status: "active",
		});

		const confirmRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					note: "Chuẩn bị sẵn bài luận mẫu",
					expectedVersion: 0,
				},
			},
		);
		expect(confirmRes.status).toBe(200);

		// Verify record landed in notification logs with status=failed & eventGroup=schedule
		const logsRes = await t.call(
			teacher.token,
			"/api/notification-logs?event=schedule&status=failed",
			{ method: "GET" },
		);
		expect(logsRes.status).toBe(200);
		const logsBody = (await logsRes.json()) as NotificationLogResponse;
		expect(logsBody.rows).toHaveLength(1);
		const failedLog = logsBody.rows[0];
		if (!failedLog) throw new Error("expected failed notification log row");
		expect(failedLog.eventType).toBe("class_opening_confirmed");
		expect(failedLog.eventGroup).toBe("schedule");
		expect(failedLog.status).toBe("failed");

		const [storedRow] = await t.libsql
			.select({
				htmlBody: schema.notificationRecord.htmlBody,
				textBody: schema.notificationRecord.textBody,
				body: schema.notificationRecord.body,
				linkPath: schema.notificationRecord.linkPath,
			})
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.id, failedLog.id));
		expect(storedRow?.htmlBody).toBeTruthy();
		expect(storedRow?.textBody).toBeTruthy();

		// Recover mailer and trigger resend via HTTP endpoint
		const resentMails: MailPayload[] = [];
		t.setMailerImpl(async (input) => {
			resentMails.push(input);
		});

		const resendRes = await t.call(
			teacher.token,
			`/api/notification-logs/${failedLog.id}/resend`,
			{ body: {} },
		);
		expect(resendRes.status).toBe(200);

		expect(resentMails).toHaveLength(1);
		const resent = resentMails[0];
		if (!resent) throw new Error("expected resent email");
		expect(resent.to).toBe("khoa@example.com");
		expect(resent.html).toBe(storedRow?.htmlBody);
		expect(resent.text).toBe(storedRow?.textBody);
		expect(resent.html).not.toBe(
			renderHtml(
				storedRow?.body ?? "",
				`${STUDENT_ORIGIN}${storedRow?.linkPath ?? ""}`,
			),
		);
		expect(resent.html).toContain("Chào Lê Minh Khoa,");
		expect(resent.html).toContain("Chuẩn bị sẵn bài luận mẫu");
		expect(resent.text).toContain("Chào Lê Minh Khoa,");
		expect(resent.text).toContain("Chuẩn bị sẵn bài luận mẫu");
	});

	test("new_only rejects startDate change (400) without mutating class, no-ops cleanly with 0 new students, and validates startDate against injected now clock", async () => {
		const fixedNow = new Date("2026-06-10T05:00:00.000Z"); // 2026-06-10 12:00 VN
		const t = await setupTestApp({ now: () => fixedNow });
		const teacher = await t.insertUser("Teacher NewOnly Invariants");
		const initialStart = "2026-06-15";
		const changedStart = "2026-06-22";
		const classId = await t.createClass(teacher.token, {
			name: "IELTS Focus",
			startDate: initialStart,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const s1 = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Nguyễn Minh Anh",
			email: "minhanh@example.com",
			status: "active",
		});

		// Past date relative to injected `now` (2026-06-09 < 2026-06-10) -> 400
		const pastRelativeToClock = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: "2026-06-09",
					note: "Ngày quá khứ theo đồng hồ inject",
					expectedVersion: 0,
				},
			},
		);
		expect(pastRelativeToClock.status).toBe(400);

		// Initial confirm with startDate === vietnamTodayISO(fixedNow) succeeds
		const initialRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: "2026-06-10",
					note: "Ghi chú ban đầu",
					expectedVersion: 0,
				},
			},
		);
		expect(initialRes.status).toBe(200);
		expect(t.sentMails).toHaveLength(1);
		t.sentMails.length = 0;

		// new_only attempting to change startDate -> 400 and does NOT mutate class
		const rejectStartChange = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					startDate: changedStart,
					note: "Không được ghi đè",
					expectedVersion: 1,
				},
			},
		);
		expect(rejectStartChange.status).toBe(400);
		expect(t.sentMails).toHaveLength(0);

		const [clsAfterReject] = await t.libsql
			.select()
			.from(schema.classTable)
			.where(eq(schema.classTable.id, classId));
		expect(clsAfterReject?.startDate).toBe("2026-06-10");
		expect(clsAfterReject?.openingNote).toBe("Ghi chú ban đầu");
		expect(clsAfterReject?.openingAnnouncementVersion).toBe(1);
		expect(clsAfterReject?.openingConfirmedAt?.toISOString()).toBe(
			fixedNow.toISOString(),
		);

		// new_only with 0 new students -> 200, 0 queued, leaves class untouched
		const zeroTargetsRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					note: "Ghi chú không được ghi đè khi 0 học viên mới",
					expectedVersion: 1,
				},
			},
		);
		expect(zeroTargetsRes.status).toBe(200);
		const zeroBody = classConfirmOpeningResponseSchema.parse(
			await zeroTargetsRes.json(),
		);
		expect(zeroBody.queuedEmailCount).toBe(0);
		expect(zeroBody.inAppOnlyCount).toBe(0);
		expect(zeroBody.skippedNoEmail).toEqual([]);
		expect(zeroBody.skippedAlreadySentCount).toBe(1);
		expect(zeroBody.startDate).toBe("2026-06-10");
		expect(zeroBody.openingNote).toBe("Ghi chú ban đầu");
		expect(zeroBody.openingAnnouncementVersion).toBe(1);
		expect(zeroBody.openingConfirmedAt).toBe(fixedNow.toISOString());
		expect(zeroBody.notifiedStudentIds).toEqual([s1]);
		expect(t.sentMails).toHaveLength(0);

		const [clsAfterZero] = await t.libsql
			.select()
			.from(schema.classTable)
			.where(eq(schema.classTable.id, classId));
		expect(clsAfterZero?.startDate).toBe("2026-06-10");
		expect(clsAfterZero?.openingNote).toBe("Ghi chú ban đầu");
		expect(clsAfterZero?.openingAnnouncementVersion).toBe(1);
	});

	test("upgrades student from in_app to email on new_only after email is added, sends full textBody without broken /classes link when studentOrigin is empty, and stays idempotent", async () => {
		const t = await setupTestApp({ studentOrigin: "" });
		const teacher = await t.insertUser("Teacher Upgrade Email");
		const startDate = futureMondayISO(7);
		const classId = await t.createClass(teacher.token, {
			name: "IELTS Speaking Upgrade",
			startDate,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const sWithEmail = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Nguyễn Hải An",
			email: "haian@example.com",
			status: "active",
		});
		const sNoEmail = await t.seedStudentAndEnroll({
			orgId,
			classId,
			name: "Phạm Quốc Bảo",
			email: "",
			status: "active",
		});

		// Initial confirm: sWithEmail gets email, sNoEmail gets in_app only
		const initialRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					note: "Chuẩn bị tai nghe và micro",
					expectedVersion: 0,
				},
			},
		);
		expect(initialRes.status).toBe(200);
		const initialBody = classConfirmOpeningResponseSchema.parse(
			await initialRes.json(),
		);
		expect(initialBody.queuedEmailCount).toBe(1);
		expect(initialBody.inAppOnlyCount).toBe(1);
		expect(initialBody.skippedNoEmail).toEqual([
			{ studentId: sNoEmail, studentName: "Phạm Quốc Bảo" },
		]);
		expect(new Set(initialBody.notifiedStudentIds)).toEqual(
			new Set([sWithEmail, sNoEmail]),
		);

		// Verify initial email has full textBody and no broken relative /classes link
		expect(t.sentMails).toHaveLength(1);
		expect(t.sentMails[0]?.to).toBe("haian@example.com");
		expect(t.sentMails[0]?.html).not.toContain('href="/classes"');
		expect(t.sentMails[0]?.html).not.toContain("Mở cổng học viên");
		expect(t.sentMails[0]?.text).toContain("Chào Nguyễn Hải An,");
		expect(t.sentMails[0]?.text).toContain("Chuẩn bị tai nghe và micro");
		expect(t.sentMails[0]?.text).not.toContain("/classes");

		// Teacher later adds an email to sNoEmail
		await t.libsql
			.update(schema.student)
			.set({ email: "bao@example.com" })
			.where(eq(schema.student.id, sNoEmail));

		// Snapshot now excludes sNoEmail from openingNotifiedStudentIds because they only got in_app
		const snapBeforeUpgrade = await t.kernel(teacher.token);
		const clsBeforeUpgrade = snapBeforeUpgrade.classes.find(
			(c) => c.id === classId,
		);
		expect(clsBeforeUpgrade?.openingNotifiedStudentIds).toEqual([sWithEmail]);

		// Calling new_only upgrades sNoEmail to receive the rich HTML + full textBody email
		t.sentMails.length = 0;
		const upgradeRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					note: "Chuẩn bị tai nghe và micro",
					expectedVersion: 1,
				},
			},
		);
		expect(upgradeRes.status).toBe(200);
		const upgradeBody = classConfirmOpeningResponseSchema.parse(
			await upgradeRes.json(),
		);
		expect(upgradeBody.openingAnnouncementVersion).toBe(1);
		expect(upgradeBody.queuedEmailCount).toBe(1);
		expect(upgradeBody.inAppOnlyCount).toBe(0);
		expect(upgradeBody.skippedAlreadySentCount).toBe(1);
		expect(upgradeBody.skippedNoEmail).toEqual([]);
		expect(new Set(upgradeBody.notifiedStudentIds)).toEqual(
			new Set([sWithEmail, sNoEmail]),
		);

		expect(t.sentMails).toHaveLength(1);
		const upgradedMail = t.sentMails[0];
		expect(upgradedMail?.to).toBe("bao@example.com");
		expect(upgradedMail?.html).toContain("Chào Phạm Quốc Bảo,");
		expect(upgradedMail?.html).not.toContain('href="/classes"');
		expect(upgradedMail?.html).not.toContain("Mở cổng học viên");
		expect(upgradedMail?.text).toContain("Chào Phạm Quốc Bảo,");
		expect(upgradedMail?.text).toContain("Chuẩn bị tai nghe và micro");
		expect(upgradedMail?.text).not.toContain("/classes");

		// Snapshot now includes both students
		const snapAfterUpgrade = await t.kernel(teacher.token);
		const clsAfterUpgrade = snapAfterUpgrade.classes.find(
			(c) => c.id === classId,
		);
		expect(new Set(clsAfterUpgrade?.openingNotifiedStudentIds ?? [])).toEqual(
			new Set([sWithEmail, sNoEmail]),
		);

		// Repeating new_only is strictly idempotent (0 emails sent)
		t.sentMails.length = 0;
		const secondNewOnlyRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "new_only",
					note: "Chuẩn bị tai nghe và micro",
					expectedVersion: 1,
				},
			},
		);
		expect(secondNewOnlyRes.status).toBe(200);
		const secondNewOnlyBody = classConfirmOpeningResponseSchema.parse(
			await secondNewOnlyRes.json(),
		);
		expect(secondNewOnlyBody.queuedEmailCount).toBe(0);
		expect(secondNewOnlyBody.inAppOnlyCount).toBe(0);
		expect(secondNewOnlyBody.skippedAlreadySentCount).toBe(2);
		expect(t.sentMails).toHaveLength(0);
	});

	test("confirms opening cleanly for a class with 10 students across chunked inserts", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Large Class");
		const classId = await t.createClass(teacher.token, {
			name: "IELTS Intensive Cohort",
			startDate: futureMondayISO(10),
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const studentIds: string[] = [];
		for (let i = 1; i <= 10; i += 1) {
			const sid = await t.seedStudentAndEnroll({
				orgId,
				classId,
				name: `Học viên ${i}`,
				email: i === 10 ? "" : `hv${i}@example.com`,
				status: i % 2 === 0 ? "invited" : "active",
			});
			studentIds.push(sid);
		}

		const res = await t.call(
			teacher.token,
			`/api/classes/${classId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					note: "Hẹn gặp cả lớp đúng giờ!",
					expectedVersion: 0,
				},
			},
		);
		expect(res.status).toBe(200);
		const body = classConfirmOpeningResponseSchema.parse(await res.json());
		expect(body.queuedEmailCount).toBe(9);
		expect(body.inAppOnlyCount).toBe(1);
		expect(body.skippedNoEmail).toHaveLength(1);
		expect(new Set(body.notifiedStudentIds)).toEqual(new Set(studentIds));
		expect(t.sentMails).toHaveLength(9);

		const persisted = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(
				and(
					eq(schema.notificationRecord.orgId, orgId),
					eq(schema.notificationRecord.refId, classId),
				),
			);
		expect(persisted).toHaveLength(10);
		for (const row of persisted) {
			expect(row.htmlBody).toContain("<!DOCTYPE html>");
			expect(row.textBody).toContain("Hẹn gặp cả lớp đúng giờ!");
		}
	});
});
