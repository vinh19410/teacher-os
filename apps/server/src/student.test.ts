import { createClient } from "@libsql/client";
import {
	STUDENT_ERROR_CODES,
	type StudentAssignment,
	type StudentClass,
	type StudentMe,
	type StudentOverview,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import type { SessionUser } from "./session";
import * as studentProvisioning from "./student-provisioning";

const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("student portal server bridge & api (/api/student/*)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		// Seed test data
		// 1. Organizations
		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);

		// Seed teacher user & membership for kernel POST test
		await libsql.insert(schema.user).values({
			id: "u-teacher",
			name: "Teacher One",
			email: "teacher@test.local",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
		await libsql.insert(schema.membership).values({
			id: "mem-teacher",
			orgId: "org-1",
			userId: "u-teacher",
			role: "teacher",
		});

		// 2. Students
		await libsql.insert(schema.student).values([
			{
				id: "student-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "student-amb-1",
				orgId: "org-1",
				name: "Trung A",
				email: "trung@test.local",
				phone: "0901111111",
			},
			{
				id: "student-amb-2",
				orgId: "org-2",
				name: "Trung B",
				email: "",
				phone: "0902222222",
			},
		]);

		// 3. Classes
		await libsql.insert(schema.classTable).values([
			{
				id: "class-1",
				orgId: "org-1",
				name: "IELTS Foundation",
				level: "IELTS 5.0–6.0",
				mode: "Online",
				schedule: "T2 & T5 18:30–20:00",
				sessionsDone: 10,
				sessionsTotal: 20,
				status: "active",
			},
			{
				id: "class-2",
				orgId: "org-2",
				name: "IELTS Advanced",
				level: "IELTS 7.0+",
				mode: "Offline",
				schedule: "T3 & T6 19:00–21:00",
				sessionsDone: 5,
				sessionsTotal: 15,
				status: "active",
			},
		]);

		// 4. Enrollments
		await libsql.insert(schema.enrollment).values([
			{
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "student-1",
			},
			{
				id: "enr-2",
				orgId: "org-2",
				classId: "class-2",
				studentId: "student-amb-2",
			},
		]);

		// 5. Lessons (one upcoming session for class-1)
		await libsql.insert(schema.lesson).values([
			{
				id: "les-1",
				orgId: "org-1",
				classId: "class-1",
				enrollmentId: "enr-1",
				day: 1,
				time: "18:30",
				dur: 90,
				date: "2099-01-01",
				topic: "Writing Task 2",
			},
		]);

		// 6. Assignment prompt + Class Assignment + Target for student-1
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-1",
			orgId: "org-1",
			task: "task2",
			genre: "opinion",
			prompt: "Some prompt",
			title: "Prompt Essay",
		});

		await libsql.insert(schema.classAssignment).values({
			id: "ca-1",
			orgId: "org-1",
			classId: "class-1",
			promptId: "prompt-1",
			title: "Writing Task 2 – Opinion Essay",
			due: "2099-01-10",
		});

		await libsql.insert(schema.classAssignmentTarget).values({
			id: "cat-1",
			orgId: "org-1",
			assignmentId: "ca-1",
			studentId: "student-1",
			submittedAt: null,
		});

		// 7. Grading assignment for student-1
		await libsql.insert(schema.assignment).values({
			id: "asg-1",
			orgId: "org-1",
			studentId: "student-1",
			title: "Vocabulary Practice",
			due: "",
			scores: { task: 6.5, coherence: 6.0, lexical: 6.5, grammar: 6.0 },
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const userKey = headers.get("x-test-user");
				if (!userKey || userKey === "none") return null;

				if (userKey === "google-verified") {
					return {
						userId: "u-1",
						userName: "Minh Tran",
						email: "minh@gmail.com",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "mixed-case") {
					return {
						userId: "u-mc",
						userName: "Minh Mixed",
						email: "Minh@Gmail.com",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "unverified") {
					return {
						userId: "u-unv",
						userName: "Minh Unverified",
						email: "minh@gmail.com",
						emailVerified: false,
						role: "student",
					};
				}
				if (userKey === "ambiguous") {
					return {
						userId: "u-amb",
						userName: "Trung",
						email: "trung@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "provisioning-user") {
					return {
						userId: "u-prov",
						userName: "New Portal Student",
						email: "newportal@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "unverified-unlinked") {
					return {
						userId: "u-unv-unl",
						userName: "Unlinked Unverified",
						email: "unv-unl@test.local",
						emailVerified: false,
						role: "student",
					};
				}
				if (userKey === "failing-provision") {
					return {
						userId: "u-fail",
						userName: "Failing User",
						email: "failing@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "fresh-student") {
					return {
						userId: "u-fresh",
						userName: "Fresh Student",
						email: "fresh@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "teacher") {
					return {
						userId: "u-teacher",
						userName: "Teacher One",
						email: "teacher@test.local",
						emailVerified: true,
						role: "teacher",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	// (a) Google-like user verified + email matches 1 row -> /me 200, /overview returns classes/assignments
	test("(a) verified user matching 1 student row gets /me 200 and /overview", async () => {
		const meRes = await app.request("/api/student/me", {
			headers: { "x-test-user": "google-verified" },
		});
		const text = await meRes.text();
		if (meRes.status !== 200) console.error("meRes error:", meRes.status, text);
		expect(meRes.status).toBe(200);
		const me = JSON.parse(text) as StudentMe;
		expect(me).toEqual({
			user: { name: "Minh Tran", email: "minh@gmail.com" },
			student: {
				id: "student-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				orgId: "org-1",
			},
		});

		const overviewRes = await app.request("/api/student/overview", {
			headers: { "x-test-user": "google-verified" },
		});
		expect(overviewRes.status).toBe(200);
		const overview = (await overviewRes.json()) as StudentOverview;
		expect(overview.classes[0]?.id).toBe("class-1");
		expect(overview.classes[0]?.nextSession).toEqual({
			date: "2099-01-01",
			time: "18:30",
			topic: "Writing Task 2",
		});
		expect(overview.assignments).toHaveLength(2);
		const classAsg = overview.assignments.find(
			(a: StudentAssignment) => a.source === "class_assignment",
		);
		expect(classAsg).toBeDefined();
		expect(classAsg?.className).toBe("IELTS Foundation");
		expect(classAsg?.due).toBe("2099-01-10");
		const gradingAsg = overview.assignments.find(
			(a: StudentAssignment) => a.source === "grading",
		);
		expect(gradingAsg).toBeDefined();
		expect(gradingAsg?.scores).toEqual({
			task: 6.5,
			coherence: 6,
			lexical: 6.5,
			grammar: 6,
		});
	});

	// (b) Google-session verified + 0 row -> provisions student into earliest org and returns 200
	test("(b) verified session with 0 student rows provisions student into earliest org and returns 200", async () => {
		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "provisioning-user" },
		});
		expect(res.status).toBe(200);
		const me = (await res.json()) as StudentMe;
		expect(me.student).toMatchObject({
			name: "New Portal Student",
			email: "newportal@test.local",
			orgId: "org-1",
		});

		const [dbStudent] = await libsql
			.select()
			.from(schema.student)
			.where(eq(schema.student.email, "newportal@test.local"));
		expect(dbStudent).toBeDefined();
		expect(dbStudent?.name).toBe("New Portal Student");
		expect(dbStudent?.phone).toBe("");
		expect(dbStudent?.parentName).toBe("");
	});

	test("unverified user with 0 rows does not provision student and returns 403", async () => {
		const [beforeCount] = await libsql
			.select({ count: count() })
			.from(schema.student);

		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "unverified-unlinked" },
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string; code?: string };
		expect(body.error).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);
		expect(body.code).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);

		const [afterCount] = await libsql
			.select({ count: count() })
			.from(schema.student);
		expect(afterCount?.count).toBe(beforeCount?.count);
	});

	test("provisioning failure falls back cleanly to 403 NOT_LINKED without 500", async () => {
		const spy = vi
			.spyOn(studentProvisioning, "provisionStudentForUser")
			.mockRejectedValueOnce(new Error("Simulated transient error"));

		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "failing-provision" },
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe(STUDENT_ERROR_CODES.NOT_LINKED);

		spy.mockRestore();
	});

	// (c) 2 rows matching email across orgs -> 403 STUDENT_AMBIGUOUS (fail-closed)
	test("(c) ambiguous email across orgs fails closed with 403 STUDENT_AMBIGUOUS", async () => {
		// Temporarily drop index and set duplicate email to simulate legacy data before unique expression index
		await libsql.run(sql`DROP INDEX IF EXISTS student_email_uq`);
		await libsql
			.update(schema.student)
			.set({ email: "trung@test.local" })
			.where(eq(schema.student.id, "student-amb-2"));

		try {
			const res = await app.request("/api/student/me", {
				headers: { "x-test-user": "ambiguous" },
			});
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error?: string };
			expect(body.error).toBe(STUDENT_ERROR_CODES.AMBIGUOUS);
		} finally {
			await libsql
				.update(schema.student)
				.set({ email: "" })
				.where(eq(schema.student.id, "student-amb-2"));
			await libsql.run(
				sql`CREATE UNIQUE INDEX student_email_uq ON student(lower(trim(email))) WHERE trim(email) != ''`,
			);
		}
	});

	// (d) email matches but emailVerified = false -> 403 STUDENT_EMAIL_UNVERIFIED
	test("(d) unverified email returns 403 STUDENT_EMAIL_UNVERIFIED", async () => {
		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "unverified" },
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error?: string };
		expect(body.error).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);
	});

	// (e) mixed-case "Minh@Gmail.com" vs "minh@gmail.com" matches
	test("(e) mixed-case email comparison matches correctly", async () => {
		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "mixed-case" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { student: { id: string } };
		expect(body.student.id).toBe("student-1");
	});

	// (f) student in org 1 does not see classes from org 2
	test("(f) student only sees classes in their own org", async () => {
		const res = await app.request("/api/student/overview", {
			headers: { "x-test-user": "google-verified" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { classes: StudentClass[] };
		const classIds = body.classes.map((c: StudentClass) => c.id);
		expect(classIds).toContain("class-1");
		expect(classIds).not.toContain("class-2");
	});

	// (g) 401 when no session
	test("(g) unauthenticated request returns 401", async () => {
		const res = await app.request("/api/student/me", {
			headers: { "x-test-user": "none" },
		});
		expect(res.status).toBe(401);
	});

	// (h) CORS preflight for student origin is allowed, unknown origin is rejected
	test("(h) CORS preflight allows student origin and rejects unknown origin", async () => {
		const studentPreflight = await app.request("/api/student/me", {
			method: "OPTIONS",
			headers: {
				Origin: "http://localhost:8003",
				"Access-Control-Request-Method": "GET",
			},
		});
		expect(studentPreflight.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:8003",
		);

		const unknownPreflight = await app.request("/api/student/me", {
			method: "OPTIONS",
			headers: {
				Origin: "http://localhost:9999",
				"Access-Control-Request-Method": "GET",
			},
		});
		expect(
			unknownPreflight.headers.get("access-control-allow-origin"),
		).not.toBe("http://localhost:9999");
	});

	// (i) kernel POST from origin 2 (web app) succeeds CSRF check with corsOrigins array
	test("(i) kernel POST from web app origin succeeds CSRF check while unknown origin fails", async () => {
		// Bootstrap org for teacher first
		await app.request("/api/readyz", {
			headers: { "x-test-user": "teacher" },
		});

		const allowedPost = await app.request("/api/classes", {
			method: "POST",
			headers: {
				Origin: "http://localhost:8001",
				"Content-Type": "application/json",
				"x-test-user": "teacher",
			},
			body: JSON.stringify({
				name: "New Class From Web",
				schedule: {
					days: [0, 2],
					start: "18:00",
					end: "19:30",
				},
			}),
		});
		// status should not be 403 CSRF rejected
		expect(allowedPost.status).not.toBe(403);

		const forbiddenPost = await app.request("/api/classes", {
			method: "POST",
			headers: {
				Origin: "http://localhost:9999",
				"Content-Type": "application/json",
				"x-test-user": "teacher",
			},
			body: JSON.stringify({
				name: "Malicious Post",
			}),
		});
		expect(forbiddenPost.status).toBe(403);
		const err = (await forbiddenPost.json()) as { error?: string };
		expect(err.error).toBe("origin not allowed");
	});

	// (j) request to /api/student/* with fresh user does NOT create organization or membership
	test("(j) request to /api/student/* skips bootstrap provisioning", async () => {
		const [orgsBefore] = await libsql
			.select({ count: count() })
			.from(schema.organization);
		const [membershipsBefore] = await libsql
			.select({ count: count() })
			.from(schema.membership);

		await app.request("/api/student/me", {
			headers: { "x-test-user": "fresh-student" },
		});

		const [orgsAfter] = await libsql
			.select({ count: count() })
			.from(schema.organization);
		const [membershipsAfter] = await libsql
			.select({ count: count() })
			.from(schema.membership);

		expect(orgsAfter?.count).toBe(orgsBefore?.count);
		expect(membershipsAfter?.count).toBe(membershipsBefore?.count);
	});
});
