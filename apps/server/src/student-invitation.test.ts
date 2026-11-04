import { createClient } from "@libsql/client";
import {
	STUDENT_INVITATION_ERROR_CODES,
	type StudentInvitationItem,
	type StudentInviteResendResponse,
	type StudentMe,
	type StudentOrgItem,
} from "@teacher-os/api/contracts";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import type { SessionUser } from "./session";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("student invitation & multi-org API endpoints", () => {
	let app: ServerApp;
	let libsql: Db;
	const sentEmails: MailInput[] = [];
	let failNextSend = false;
	const testMailer: Mailer = {
		async send(input) {
			if (failNextSend) {
				failNextSend = false;
				throw new Error("503 temporary upstream outage");
			}
			if (input.to.endsWith("@bounce.test")) {
				throw new Error("550 5.1.1 <fail@bounce.test>: Recipient rejected");
			}
			sentEmails.push(input);
		},
	};
	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		// 1. Organizations
		await libsql.insert(schema.organization).values([
			{ id: "org-alpha", name: "Alpha Academy" },
			{ id: "org-beta", name: "Beta School" },
		]);

		// 2. Teachers
		await libsql.insert(schema.user).values([
			{
				id: "u-teacher-alpha",
				name: "Teacher Alpha",
				email: "teacher.alpha@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-teacher-beta",
				name: "Teacher Beta",
				email: "teacher.beta@test.local",
				emailVerified: true,
				role: "teacher",
			},
			{
				id: "u-student-alice",
				name: "Alice Wonderland",
				email: "alice@test.local",
				emailVerified: true,
				role: "student",
			},
			{
				id: "u-student-bob",
				name: "Bob Builder",
				email: "bob@test.local",
				emailVerified: true,
				role: "student",
			},
			{
				id: "u-ta-alpha",
				name: "TA Alpha",
				email: "ta.alpha@test.local",
				emailVerified: true,
				role: "teacher",
			},
		]);
		await libsql.insert(schema.membership).values([
			{
				id: "mem-alpha",
				orgId: "org-alpha",
				userId: "u-teacher-alpha",
				role: "teacher",
			},
			{
				id: "mem-beta",
				orgId: "org-beta",
				userId: "u-teacher-beta",
				role: "teacher",
			},
			{
				id: "mem-ta-alpha",
				orgId: "org-alpha",
				userId: "u-ta-alpha",
				role: "ta",
			},
		]);
		// Existing student in org-alpha
		await libsql.insert(schema.student).values({
			id: "s-existing-alpha",
			orgId: "org-alpha",
			name: "Existing Student",
			email: "existing@test.local",
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: ["http://localhost:8001", "http://localhost:8003"],
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const userKey = headers.get("x-test-user");
				if (userKey === "teacher-alpha") {
					return {
						userId: "u-teacher-alpha",
						userName: "Teacher Alpha",
						email: "teacher.alpha@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (userKey === "teacher-beta") {
					return {
						userId: "u-teacher-beta",
						userName: "Teacher Beta",
						email: "teacher.beta@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				if (userKey === "student-alice") {
					return {
						userId: "u-student-alice",
						userName: "Alice Wonderland",
						email: "alice@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "student-bob") {
					return {
						userId: "u-student-bob",
						userName: "Bob Builder",
						email: "bob@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "ta-alpha") {
					return {
						userId: "u-ta-alpha",
						userName: "TA Alpha",
						email: "ta.alpha@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
			mailer: testMailer,
			studentOrigin: "http://localhost:8003",
		});
	});

	test("Teacher: POST /api/students/invite sends invitation and prevents duplicates", async () => {
		// 1. Send valid invite
		const res1 = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "alice@test.local" }),
		});
		expect(res1.status).toBe(201);
		const created = (await res1.json()) as StudentInvitationItem;
		expect(created.email).toBe("alice@test.local");
		expect(created.orgId).toBe("org-alpha");
		expect(created.status).toBe("pending");

		// 2. Duplicate invite to same email in org-alpha -> 409 INVITATION_ALREADY_PENDING
		const res2 = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "Alice@test.local " }), // case + space
		});
		expect(res2.status).toBe(409);
		const err2 = (await res2.json()) as { code: string };
		expect(err2.code).toBe(
			STUDENT_INVITATION_ERROR_CODES.INVITATION_ALREADY_PENDING,
		);

		// 3. Inviting already enrolled student -> 409 STUDENT_ALREADY_IN_ORG
		const res3 = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "existing@test.local" }),
		});
		expect(res3.status).toBe(409);
		const err3 = (await res3.json()) as { code: string };
		expect(err3.code).toBe(STUDENT_INVITATION_ERROR_CODES.ALREADY_IN_ORG);

		// 4. Another teacher in org-beta can invite the same email
		const res4 = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-beta",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "alice@test.local" }),
		});
		expect(res4.status).toBe(201);
	});

	test("Teacher: GET /api/students/invitations and DELETE /api/students/invitations/:id", async () => {
		// Invite Bob from org-alpha
		const createRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "bob@test.local" }),
		});
		const created = (await createRes.json()) as StudentInvitationItem;

		// List invitations for org-alpha
		const listRes = await app.request("/api/students/invitations", {
			headers: { "x-test-user": "teacher-alpha" },
		});
		expect(listRes.status).toBe(200);
		const list = (await listRes.json()) as StudentInvitationItem[];
		expect(list.some((inv) => inv.id === created.id)).toBe(true);

		// Cancel invitation
		const deleteRes = await app.request(
			`/api/students/invitations/${created.id}`,
			{
				method: "DELETE",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
				},
			},
		);
		expect(deleteRes.status).toBe(200);

		// List again -> status is canceled
		const listAfter = (await (
			await app.request("/api/students/invitations", {
				headers: { "x-test-user": "teacher-alpha" },
			})
		).json()) as StudentInvitationItem[];
		const canceledInv = listAfter.find((inv) => inv.id === created.id);
		expect(canceledInv?.status).toBe("canceled");
	});

	test("Student: GET /api/student/notifications lists pending invites with org & inviter details", async () => {
		const res = await app.request("/api/student/notifications", {
			headers: { "x-test-user": "student-alice" },
		});
		expect(res.status).toBe(200);
		const notifications = (await res.json()) as StudentInvitationItem[];
		// Alice should see invites from org-alpha and org-beta
		expect(notifications.length).toBeGreaterThanOrEqual(2);
		const alphaInvite = notifications.find((n) => n.orgId === "org-alpha");
		expect(alphaInvite?.orgName).toBe("Alpha Academy");
		expect(alphaInvite?.inviterName).toBe("Teacher Alpha");
	});

	test("Student: POST /api/student/invitations/:id/reject updates status without enrolling", async () => {
		// Invite Bob from org-beta
		const inviteRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-beta",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "bob@test.local" }),
		});
		const invite = (await inviteRes.json()) as StudentInvitationItem;

		// Bob rejects
		const rejectRes = await app.request(
			`/api/student/invitations/${invite.id}/reject`,
			{
				method: "POST",
				headers: {
					"x-test-user": "student-bob",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
			},
		);
		expect(rejectRes.status).toBe(200);

		// Verify no student record was created for bob in org-beta
		const [bobStudent] = await libsql
			.select()
			.from(schema.student)
			.where(
				and(
					eq(schema.student.orgId, "org-beta"),
					eq(schema.student.email, "bob@test.local"),
				),
			);
		expect(bobStudent).toBeUndefined();
	});

	test("Student: POST /api/student/invitations/:id/accept creates student record and enables multi-org switching", async () => {
		// Alice gets notifications
		const notifRes = await app.request("/api/student/notifications", {
			headers: { "x-test-user": "student-alice" },
		});
		const notifications = (await notifRes.json()) as StudentInvitationItem[];
		const alphaInvite = notifications.find((n) => n.orgId === "org-alpha");
		const betaInvite = notifications.find((n) => n.orgId === "org-beta");
		expect(alphaInvite).toBeDefined();
		expect(betaInvite).toBeDefined();
		if (!alphaInvite || !betaInvite) throw new Error("Invites not found");

		// Alice accepts alpha invite
		const acceptAlpha = await app.request(
			`/api/student/invitations/${alphaInvite.id}/accept`,
			{
				method: "POST",
				headers: {
					"x-test-user": "student-alice",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
			},
		);
		expect(acceptAlpha.status).toBe(200);
		const alphaData = (await acceptAlpha.json()) as { orgId: string };
		expect(alphaData.orgId).toBe("org-alpha");

		// Alice accepts beta invite
		const acceptBeta = await app.request(
			`/api/student/invitations/${betaInvite.id}/accept`,
			{
				method: "POST",
				headers: {
					"x-test-user": "student-alice",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
			},
		);
		expect(acceptBeta.status).toBe(200);
		const betaData = (await acceptBeta.json()) as { orgId: string };
		expect(betaData.orgId).toBe("org-beta");

		// Alice queries /api/student/orgs
		const orgsRes = await app.request("/api/student/orgs", {
			headers: { "x-test-user": "student-alice" },
		});
		expect(orgsRes.status).toBe(200);
		const orgs = (await orgsRes.json()) as StudentOrgItem[];
		expect(orgs).toHaveLength(2);
		expect(orgs.map((o) => o.id)).toContain("org-alpha");
		expect(orgs.map((o) => o.id)).toContain("org-beta");

		// Alice switches context with x-student-org-id header
		// 1. Request Alpha
		const meAlpha = await app.request("/api/student/me", {
			headers: {
				"x-test-user": "student-alice",
				"x-student-org-id": "org-alpha",
			},
		});
		expect(meAlpha.status).toBe(200);
		expect(((await meAlpha.json()) as StudentMe).student.orgId).toBe(
			"org-alpha",
		);

		// 2. Request Beta
		const meBeta = await app.request("/api/student/me", {
			headers: {
				"x-test-user": "student-alice",
				"x-student-org-id": "org-beta",
			},
		});
		expect(meBeta.status).toBe(200);
		expect(((await meBeta.json()) as StudentMe).student.orgId).toBe("org-beta");
	});

	test("CSRF guard on invitations: bad origin 403, text/plain 415 (valid session)", async () => {
		// (i) Disallowed origin — chặn trước handler dù session hợp lệ
		const resOrigin = await app.request(
			"/api/student/invitations/some-id/accept",
			{
				method: "POST",
				headers: {
					"x-test-user": "student-alice",
					Origin: "https://evil.example",
					"Content-Type": "application/json",
				},
			},
		);
		expect(resOrigin.status).toBe(403);
		expect((await resOrigin.json()) as { error: string }).toEqual({
			error: "origin not allowed",
		});

		// (ii) Invalid content-type (vector simple-request cross-site)
		const resContentType = await app.request(
			"/api/student/invitations/some-id/reject",
			{
				method: "POST",
				headers: {
					"x-test-user": "student-alice",
					Origin: "http://localhost:8003",
					"Content-Type": "text/plain",
				},
			},
		);
		expect(resContentType.status).toBe(415);
		expect((await resContentType.json()) as { error: string }).toEqual({
			error: "content-type must be application/json",
		});
	});

	test("#570: POST /api/students/invite sends real email synchronously, rolls back on 502 failure, guards throwing mailer getter (503), blocks cancel-reinvite spam & TA role", async () => {
		const countBefore = sentEmails.length;
		const okRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "charlie@test.local" }),
		});
		expect(okRes.status).toBe(201);
		const created = (await okRes.json()) as StudentInvitationItem;
		expect(sentEmails.length).toBe(countBefore + 1);
		const lastMail = sentEmails.at(-1);
		expect(lastMail?.to).toBe("charlie@test.local");
		expect(lastMail?.fromName).toBe("Alpha Academy qua Teacher OS");
		expect(lastMail?.replyTo).toBe("teacher.alpha@test.local");
		expect(lastMail?.html).toContain("http://localhost:8003/login");
		expect(lastMail?.idempotencyKey).toBe(`student_invite:${created.id}`);

		// Duplicate pending invite returns invitationId
		const dupRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "charlie@test.local" }),
		});
		expect(dupRes.status).toBe(409);
		const dupBody: Record<string, unknown> = await dupRes.json();
		expect(dupBody.code).toBe(
			STUDENT_INVITATION_ERROR_CODES.INVITATION_ALREADY_PENDING,
		);
		expect(dupBody.invitationId).toBe(created.id);

		// Cancel -> immediate reinvite within 60s hits 429 RESEND_COOLDOWN
		const cancelRes = await app.request(
			`/api/students/invitations/${created.id}`,
			{
				method: "DELETE",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
				},
			},
		);
		expect(cancelRes.status).toBe(200);
		const spamRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "charlie@test.local" }),
		});
		expect(spamRes.status).toBe(429);
		expect(spamRes.headers.get("Retry-After")).toBeTruthy();

		// Mailer send failure -> 502, sanitized message, and NO orphan pending row
		const bounceRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "fail@bounce.test" }),
		});
		expect(bounceRes.status).toBe(502);
		const bounceBody: Record<string, unknown> = await bounceRes.json();
		expect(bounceBody.code).toBe(
			STUDENT_INVITATION_ERROR_CODES.EMAIL_SEND_FAILED,
		);
		expect(String(bounceBody.error ?? "")).not.toContain("550 5.1.1");
		const [orphan] = await libsql
			.select()
			.from(schema.studentInvitation)
			.where(
				and(
					eq(schema.studentInvitation.orgId, "org-alpha"),
					eq(schema.studentInvitation.email, "fail@bounce.test"),
					eq(schema.studentInvitation.status, "pending"),
				),
			);
		expect(orphan).toBeUndefined();

		// Throwing mailer getter must NOT crash buildApp() and returns 503 on invite
		const brokenMailerApp = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: ["http://localhost:8001"],
			getSessionUser: async () => ({
				userId: "u-teacher-alpha",
				userName: "Teacher Alpha",
				email: "teacher.alpha@test.local",
				emailVerified: true,
				role: "teacher",
			}),
			authHandler: () => new Response("auth OK"),
			get mailer(): Mailer {
				throw new Error("RESEND_API_KEY is required");
			},
		});
		const unavailRes = await brokenMailerApp.request("/api/students/invite", {
			method: "POST",
			headers: {
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "new503@test.local" }),
		});
		expect(unavailRes.status).toBe(503);
		const unavailBody: Record<string, unknown> = await unavailRes.json();
		expect(unavailBody.code).toBe(
			STUDENT_INVITATION_ERROR_CODES.EMAIL_UNAVAILABLE,
		);

		// TA role blocked with 403
		const taRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "ta-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "ta-attempt@test.local" }),
		});
		expect(taRes.status).toBe(403);
	});

	test("#570: Resend routes enforce 60s CAS cooldown, revert timestamp on mail error, use fresh Idempotency-Key, and update class_enrolled notification_record in-place", async () => {
		// 1. Org invitation resend flow
		const invRes = await app.request("/api/students/invite", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ email: "daisy@test.local" }),
		});
		expect(invRes.status).toBe(201);
		const inv = (await invRes.json()) as StudentInvitationItem;
		const firstKey = sentEmails.at(-1)?.idempotencyKey;

		// Immediate resend within 60s -> 429
		const earlyResend = await app.request(
			`/api/students/invitations/${inv.id}/resend`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect(earlyResend.status).toBe(429);
		expect(earlyResend.headers.get("Retry-After")).toBeTruthy();

		// Age updatedAt past 60s, simulate transient failure -> 502 & reverts updatedAt so next call succeeds immediately
		const oldDate = new Date(Date.now() - 120_000);
		await libsql
			.update(schema.studentInvitation)
			.set({ updatedAt: oldDate })
			.where(eq(schema.studentInvitation.id, inv.id));

		failNextSend = true;
		const failedResend = await app.request(
			`/api/students/invitations/${inv.id}/resend`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect(failedResend.status).toBe(502);

		const [rolledBackRow] = await libsql
			.select({ updatedAt: schema.studentInvitation.updatedAt })
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, inv.id));
		expect(rolledBackRow?.updatedAt.getTime()).toBe(oldDate.getTime());
		const okResend = await app.request(
			`/api/students/invitations/${inv.id}/resend`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect(okResend.status).toBe(200);
		const resendBody = (await okResend.json()) as StudentInviteResendResponse;
		expect(resendBody.ok).toBe(true);
		const secondKey = sentEmails.at(-1)?.idempotencyKey;
		expect(secondKey).toBeTruthy();
		expect(secondKey).not.toBe(firstKey);
		expect(secondKey).toContain(`student_invite:${inv.id}:resend:`);

		// 2. Unjoined student profile + invited class enrollment resend flow
		await libsql.insert(schema.classTable).values({
			id: "cls-alpha-570",
			orgId: "org-alpha",
			name: "IELTS Speaking 7.0",
			level: "7.0",
			type: "ielts",
			skills: "[]",
			mode: "Online",
			schedule: "T2 19:00",
			sessionsTotal: 12,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-11-10",
			notes: "",
		});
		const createStu = await app.request("/api/students", {
			method: "POST",
			headers: {
				"x-test-user": "teacher-alpha",
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: "Evan Unjoined",
				email: "evan@test.local",
				classId: "cls-alpha-570",
				activateNow: false,
			}),
		});
		expect(createStu.status).toBe(201);
		const createdStu: Record<string, unknown> = await createStu.json();
		expect(createdStu.inviteEmailSent).toBe(true);
		const createdStuId = String(createdStu.id);
		const createdEnrollmentId = String(createdStu.enrollmentId);

		// Age student.lastInviteEmailAt past 60s and resend class invite
		await libsql
			.update(schema.student)
			.set({ lastInviteEmailAt: oldDate })
			.where(eq(schema.student.id, createdStuId));

		const stuResend = await app.request(
			`/api/students/${createdStuId}/resend-invite`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ enrollmentId: createdEnrollmentId }),
			},
		);
		expect(stuResend.status).toBe(200);
		expect(sentEmails.at(-1)?.idempotencyKey).toContain(
			`class_enrolled:${createdEnrollmentId}:resend:`,
		);

		// Verify notification_record was updated IN PLACE (still 1 row, not duplicated!)
		const notifRows = await libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.studentId, createdStuId));
		expect(notifRows).toHaveLength(1);
		expect(notifRows[0]?.status).toBe("sent");

		// Once onboarded (portalLinked = true) and enrollment activated -> 409 STUDENT_ALREADY_JOINED
		await libsql
			.update(schema.student)
			.set({ onboardingCompletedAt: new Date(), lastInviteEmailAt: oldDate })
			.where(eq(schema.student.id, createdStuId));
		await libsql
			.update(schema.enrollment)
			.set({ status: "active" })
			.where(eq(schema.enrollment.id, createdEnrollmentId));

		const joinedResend = await app.request(
			`/api/students/${createdStuId}/resend-invite`,
			{
				method: "POST",
				headers: {
					"x-test-user": "teacher-alpha",
					Origin: "http://localhost:8001",
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect(joinedResend.status).toBe(409);
		const joinedBody: Record<string, unknown> = await joinedResend.json();
		expect(joinedBody.code).toBe(STUDENT_INVITATION_ERROR_CODES.ALREADY_JOINED);
	});
});
