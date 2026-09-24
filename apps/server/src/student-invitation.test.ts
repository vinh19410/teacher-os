import { createClient } from "@libsql/client";
import {
	STUDENT_INVITATION_ERROR_CODES,
	type StudentInvitationItem,
	type StudentMe,
	type StudentOrgItem,
} from "@teacher-os/api/contracts";
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
				return null;
			},
			authHandler: () => new Response("auth OK"),
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
				headers: { "x-test-user": "student-bob" },
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
				headers: { "x-test-user": "student-alice" },
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
				headers: { "x-test-user": "student-alice" },
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
});
