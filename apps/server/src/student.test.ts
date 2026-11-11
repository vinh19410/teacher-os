import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	STUDENT_ERROR_CODES,
	type StudentAssignment,
	type StudentClass,
	type StudentClassDetail,
	type StudentMe,
	type StudentOverview,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { createLogMailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import { loadNextSession } from "./routes/student-class";
import type { SessionUser } from "./session";
import * as studentProvisioning from "./student-provisioning";

const CORS_ORIGINS = ["http://localhost:8001", "http://localhost:8003"];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

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
				if (userKey === "org2-student") {
					return {
						userId: "u-org2",
						userName: "Org Two Student",
						email: "org2@test.local",
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
				if (userKey === "manual-verified") {
					return {
						userId: "u-manual-ver",
						userName: "Minh Manual",
						email: "manual-minh@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "manual-unverified") {
					return {
						userId: "u-manual-unv",
						userName: "Minh Manual Unverified",
						email: "manual-minh@test.local",
						emailVerified: false,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
			mailer: createLogMailer(),
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
				examInterest: null,
				currentLevel: null,
				targetScore: null,
				entryScore: null,
				learningGoals: null,
				learningGoalsNote: null,
				dailyStudyHours: null,
				onboardingCompletedAt: null,
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

	// (c) 2 rows matching email across orgs -> resolves cleanly with multi-org bridge
	test("(c) multi-org student resolves cleanly via header x-student-org-id or fallback", async () => {
		await libsql
			.update(schema.student)
			.set({ email: "trung@test.local" })
			.where(eq(schema.student.id, "student-amb-2"));

		try {
			// Without header: fallback to most recent
			const res = await app.request("/api/student/me", {
				headers: { "x-test-user": "ambiguous" },
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as { student: { orgId: string } };
			expect(["org-1", "org-2"]).toContain(body.student.orgId);

			// With header: resolves specifically to requested org-1
			const resOrg1 = await app.request("/api/student/me", {
				headers: {
					"x-test-user": "ambiguous",
					"x-student-org-id": "org-1",
				},
			});
			expect(resOrg1.status).toBe(200);
			const body1 = (await resOrg1.json()) as { student: { orgId: string } };
			expect(body1.student.orgId).toBe("org-1");
		} finally {
			await libsql
				.update(schema.student)
				.set({ email: "" })
				.where(eq(schema.student.id, "student-amb-2"));
		}
	});

	test("multi-org student can pick the org via ?org= when headers cannot be sent", async () => {
		await libsql
			.update(schema.student)
			.set({ email: "trung@test.local" })
			.where(eq(schema.student.id, "student-amb-2"));

		try {
			for (const orgId of ["org-1", "org-2"]) {
				const res = await app.request(`/api/student/me?org=${orgId}`, {
					headers: { "x-test-user": "ambiguous" },
				});
				expect(res.status).toBe(200);
				const body = (await res.json()) as { student: { orgId: string } };
				expect(body.student.orgId).toBe(orgId);
			}

			// An org the session has no student record in never grants access.
			const foreign = await app.request("/api/student/me?org=org-not-mine", {
				headers: { "x-test-user": "ambiguous" },
			});
			expect(foreign.status).toBe(200);
			const foreignBody = (await foreign.json()) as {
				student: { orgId: string };
			};
			expect(["org-1", "org-2"]).toContain(foreignBody.student.orgId);

			// Header wins over the query fallback.
			const both = await app.request("/api/student/me?org=org-2", {
				headers: { "x-test-user": "ambiguous", "x-student-org-id": "org-1" },
			});
			const bothBody = (await both.json()) as { student: { orgId: string } };
			expect(bothBody.student.orgId).toBe("org-1");
		} finally {
			await libsql
				.update(schema.student)
				.set({ email: "" })
				.where(eq(schema.student.id, "student-amb-2"));
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
				"Access-Control-Request-Headers": "x-student-org-id",
			},
		});
		expect(studentPreflight.headers.get("access-control-allow-origin")).toBe(
			"http://localhost:8003",
		);
		expect(
			studentPreflight.headers.get("access-control-allow-headers"),
		).toContain("x-student-org-id");

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

	// (k) overview formats structured JSON schedule into human-readable text
	test("(k) overview formats structured JSON schedule into human-readable text", async () => {
		await libsql.insert(schema.classTable).values({
			id: "class-json",
			orgId: "org-1",
			name: "[TEST] Foundation 2",
			level: "Band 5.5",
			mode: "Online",
			schedule: JSON.stringify({
				days: [0, 2, 4],
				start: "19:00",
				end: "20:30",
			}),
			sessionsDone: 0,
			sessionsTotal: 26,
			status: "active",
		});
		await libsql.insert(schema.enrollment).values({
			id: "enr-json",
			orgId: "org-1",
			classId: "class-json",
			studentId: "student-1",
		});

		const res = await app.request("/api/student/overview", {
			headers: { "x-test-user": "google-verified" },
		});
		expect(res.status).toBe(200);
		const overview = (await res.json()) as StudentOverview;
		const jsonClass = overview.classes.find((c) => c.id === "class-json");
		expect(jsonClass).toBeDefined();
		expect(jsonClass?.schedule).toBe("T2 & T4 & T6 · 19:00–20:30");
	});

	describe("class teacher & GET /api/student/classes/:classId", () => {
		beforeAll(async () => {
			await libsql.insert(schema.student).values([
				{
					id: "student-org2",
					orgId: "org-2",
					name: "Org Two Student",
					email: "org2@test.local",
					phone: "0903333333",
				},
				{
					id: "student-peer",
					orgId: "org-1",
					name: "Peer Student",
					email: "peer@test.local",
					phone: "0904444444",
				},
			]);
			await libsql.insert(schema.classTable).values([
				{
					id: "class-pending",
					orgId: "org-1",
					name: "IELTS Pending",
					schedule: "T7 09:00–10:30",
					status: "active",
				},
				{
					id: "class-not-mine",
					orgId: "org-1",
					name: "IELTS Not Mine",
					schedule: "CN 09:00–10:30",
					status: "active",
				},
			]);
			await libsql
				.update(schema.classTable)
				.set({ startDate: "2026-01-01" })
				.where(eq(schema.classTable.id, "class-1"));
			await libsql.insert(schema.enrollment).values([
				{
					id: "enr-org2",
					orgId: "org-2",
					classId: "class-2",
					studentId: "student-org2",
				},
				{
					id: "enr-pending",
					orgId: "org-1",
					classId: "class-pending",
					studentId: "student-1",
					status: "invited",
				},
				{
					id: "enr-peer",
					orgId: "org-1",
					classId: "class-1",
					studentId: "student-peer",
				},
				{
					id: "enr-peer-2",
					orgId: "org-1",
					classId: "class-not-mine",
					studentId: "student-peer",
				},
			]);
			await libsql.insert(schema.lesson).values([
				{
					id: "les-0",
					orgId: "org-1",
					classId: "class-1",
					enrollmentId: "enr-1",
					day: 4,
					time: "18:30",
					dur: 90,
					date: "2026-01-05",
					status: "completed",
					topic: "Reading Skimming",
				},
				{
					id: "les-peer",
					orgId: "org-1",
					classId: "class-1",
					enrollmentId: "enr-peer",
					day: 1,
					time: "18:30",
					dur: 90,
					date: "2099-01-01",
					status: "absent",
					topic: "Writing Task 2",
				},
			]);
			// Bài tập của lớp khác cùng học viên — không được lọt vào trang lớp class-1.
			await libsql.insert(schema.classAssignment).values({
				id: "ca-json",
				orgId: "org-1",
				classId: "class-json",
				promptId: "prompt-1",
				title: "Other class essay",
				due: "2099-02-01",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: "cat-json",
				orgId: "org-1",
				assignmentId: "ca-json",
				studentId: "student-1",
			});
		});

		test("overview attaches the org teacher to every class", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			expect(overview.classes.length).toBeGreaterThan(1);
			for (const cls of overview.classes) {
				expect(cls.teacher).toEqual({
					name: "Teacher One",
					email: "teacher@test.local",
					image: null,
				});
			}
		});

		test("overview returns teacher null when the org has no teacher membership", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "org2-student" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			expect(overview.classes.map((c) => c.id)).toEqual(["class-2"]);
			expect(overview.classes[0]?.teacher).toBeNull();
		});

		test("returns the class, the student's own lessons and the class assignments", async () => {
			const res = await app.request("/api/student/classes/class-1", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const detail = (await res.json()) as StudentClassDetail;
			expect(detail.class).toMatchObject({
				id: "class-1",
				name: "IELTS Foundation",
				startDate: "2026-01-01",
				enrollmentId: "enr-1",
				enrollmentStatus: "active",
				nextSession: {
					date: "2099-01-01",
					time: "18:30",
					topic: "Writing Task 2",
				},
			});
			expect(detail.class.teacher?.name).toBe("Teacher One");
			expect(detail.lessons).toEqual([
				{
					id: "les-0",
					date: "2026-01-05",
					day: 4,
					time: "18:30",
					dur: 90,
					status: "completed",
					topic: "Reading Skimming",
				},
				{
					id: "les-1",
					date: "2099-01-01",
					day: 1,
					time: "18:30",
					dur: 90,
					status: "upcoming",
					topic: "Writing Task 2",
				},
			]);
			expect(detail.assignments.map((a) => a.id)).toEqual(["ca-1"]);
			expect(detail.assignments[0]).toMatchObject({
				source: "class_assignment",
				classId: "class-1",
				className: "IELTS Foundation",
			});
		});

		test("404 for an invited enrollment", async () => {
			const res = await app.request("/api/student/classes/class-pending", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(404);
			expect(await res.json()).toEqual({ error: "class not found" });
		});

		test("404 for a class in another org or a class the student is not enrolled in", async () => {
			for (const classId of ["class-2", "class-not-mine", "class-missing"]) {
				const res = await app.request(`/api/student/classes/${classId}`, {
					headers: { "x-test-user": "google-verified" },
				});
				expect(res.status).toBe(404);
				expect(await res.json()).toEqual({ error: "class not found" });
			}
		});

		test("legacy class lessons (no dates) interleave weekday slots, attended first within a slot", async () => {
			await libsql.insert(schema.classTable).values({
				id: "class-legacy",
				orgId: "org-1",
				name: "IELTS Legacy",
				schedule: "T2 & T4 18:30–20:00",
				status: "active",
			});
			await libsql.insert(schema.enrollment).values({
				id: "enr-legacy",
				orgId: "org-1",
				classId: "class-legacy",
				studentId: "student-1",
			});
			const legacy = (id: string, day: number, status: string) => ({
				id,
				orgId: "org-1",
				classId: "class-legacy",
				enrollmentId: "enr-legacy",
				day,
				time: "18:30",
				dur: 90,
				date: null,
				status,
			});
			await libsql
				.insert(schema.lesson)
				.values([
					legacy("leg-a1", 1, "upcoming"),
					legacy("leg-a2", 1, "completed"),
					legacy("leg-a3", 1, "upcoming"),
					legacy("leg-b1", 3, "cancelled"),
					legacy("leg-b2", 3, "upcoming"),
					legacy("leg-b3", 3, "absent"),
				]);

			const res = await app.request("/api/student/classes/class-legacy", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const detail = (await res.json()) as StudentClassDetail;
			expect(detail.lessons.map((l) => l.id)).toEqual([
				"leg-a2",
				"leg-b3",
				"leg-a1",
				"leg-b1",
				"leg-a3",
				"leg-b2",
			]);
		});

		test("401 without a session", async () => {
			const res = await app.request("/api/student/classes/class-1", {
				headers: { "x-test-user": "none" },
			});
			expect(res.status).toBe(401);
		});
	});

	describe("POST /api/student/onboarding", () => {
		test("happy path: valid payload provisions/updates student and returns 200", async () => {
			const payload = {
				examInterest: "ielts",
				currentLevel: "intermediate",
				targetScore: "6.5",
				learningGoals: ["study-abroad", "career"],
				dailyStudyHours: "1-2",
			};
			const res = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as StudentMe;
			expect(body.student.examInterest).toBe("ielts");
			expect(body.student.currentLevel).toBe("intermediate");
			expect(body.student.targetScore).toBe("6.5");
			expect(body.student.learningGoals).toEqual(["study-abroad", "career"]);
			expect(body.student.dailyStudyHours).toBe("1-2");
			expect(body.student.learningGoalsNote).toBeNull();
			expect(body.student.onboardingCompletedAt).toBeTypeOf("string");
			expect(
				Number.isNaN(
					new Date(body.student.onboardingCompletedAt ?? "").getTime(),
				),
			).toBe(false);

			// Assert DB row
			const [row] = await libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "newportal@test.local"));
			expect(row).toBeDefined();
			expect(row?.examInterest).toBe("ielts");
			expect(row?.currentLevel).toBe("intermediate");
			expect(row?.targetScore).toBe("6.5");
			expect(row?.learningGoals).toBe(
				JSON.stringify(["study-abroad", "career"]),
			);
			expect(row?.learningGoalsNote).toBeNull();
			expect(row?.dailyStudyHours).toBe("1-2");
			expect(row?.onboardingCompletedAt).not.toBeNull();
		});

		test("entryScore is trimmed, persisted, and not wiped by a later submit without it", async () => {
			const post = (extra: Record<string, unknown>) =>
				app.request("/api/student/onboarding", {
					method: "POST",
					headers: {
						"x-test-user": "provisioning-user",
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						examInterest: "ielts",
						currentLevel: "intermediate",
						targetScore: "6.5",
						learningGoals: ["study-abroad", "career"],
						dailyStudyHours: "1-2",
						...extra,
					}),
				});
			const first = await post({ entryScore: "  B2  " });
			expect(first.status).toBe(200);
			expect(((await first.json()) as StudentMe).student.entryScore).toBe("B2");
			const second = await post({});
			expect(((await second.json()) as StudentMe).student.entryScore).toBe(
				"B2",
			);
			const tooLong = await post({ entryScore: "x".repeat(51) });
			expect(tooLong.status).toBe(400);
		});

		test("GET /me round-trip reflects persisted onboarding fields", async () => {
			const meRes = await app.request("/api/student/me", {
				headers: { "x-test-user": "provisioning-user" },
			});
			expect(meRes.status).toBe(200);
			const me = (await meRes.json()) as StudentMe;
			expect(me.student.examInterest).toBe("ielts");
			expect(me.student.currentLevel).toBe("intermediate");
			expect(me.student.targetScore).toBe("6.5");
			expect(me.student.learningGoals).toEqual(["study-abroad", "career"]);
			expect(me.student.dailyStudyHours).toBe("1-2");
			expect(me.student.onboardingCompletedAt).toBeTypeOf("string");
		});

		test("idempotent overwrite: successive POST updates answers and refreshes timestamp", async () => {
			const payload2 = {
				examInterest: "toeic",
				currentLevel: "advanced",
				targetScore: "850",
				learningGoals: ["communication"],
				learningGoalsNote: "Need TOEIC for graduation",
				dailyStudyHours: "3-plus",
			};
			const res = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload2),
			});

			expect(res.status).toBe(200);
			const body = (await res.json()) as StudentMe;
			expect(body.student.examInterest).toBe("toeic");
			expect(body.student.currentLevel).toBe("advanced");
			expect(body.student.targetScore).toBe("850");
			expect(body.student.learningGoals).toEqual(["communication"]);
			expect(body.student.learningGoalsNote).toBe("Need TOEIC for graduation");
			expect(body.student.dailyStudyHours).toBe("3-plus");

			// Assert DB row updated
			const [row] = await libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "newportal@test.local"));
			expect(row?.examInterest).toBe("toeic");
			expect(row?.currentLevel).toBe("advanced");
			expect(row?.targetScore).toBe("850");
			expect(row?.learningGoalsNote).toBe("Need TOEIC for graduation");
		});

		test("invalid body returns 400 with { error: 'invalid body' }", async () => {
			// (i) missing examInterest
			const res1 = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					currentLevel: "intermediate",
					targetScore: "6.5",
					learningGoals: ["career"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res1.status).toBe(400);
			expect((await res1.json()) as { error: string }).toEqual({
				error: "invalid body",
			});

			// (ii) missing currentLevel
			const resMissingLevel = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					targetScore: "6.5",
					learningGoals: ["career"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(resMissingLevel.status).toBe(400);
			expect((await resMissingLevel.json()) as { error: string }).toEqual({
				error: "invalid body",
			});

			// (iii) invalid currentLevel: "expert"
			const resInvalidLevel = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "expert",
					targetScore: "6.5",
					learningGoals: ["career"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(resInvalidLevel.status).toBe(400);
			expect((await resInvalidLevel.json()) as { error: string }).toEqual({
				error: "invalid body",
			});

			// (iv) examInterest: "ielts" with invalid targetScore: "999"
			const res2 = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "intermediate",
					targetScore: "999",
					learningGoals: ["career"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res2.status).toBe(400);
			expect((await res2.json()) as { error: string }).toEqual({
				error: "invalid body",
			});

			// (v) empty learningGoals: []
			const res3 = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "intermediate",
					targetScore: "6.5",
					learningGoals: [],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res3.status).toBe(400);
			expect((await res3.json()) as { error: string }).toEqual({
				error: "invalid body",
			});
		});

		test("saves 'unsure' currentLevel without converting to null", async () => {
			const res = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "unsure",
					targetScore: "6.5",
					learningGoals: ["study-abroad"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as StudentMe;
			expect(body.student.currentLevel).toBe("unsure");
		});

		test("CSRF guard: bad origin 403, text/plain 415, oversized body 413", async () => {
			const validPayload = {
				examInterest: "ielts",
				currentLevel: "basic",
				targetScore: "6.5",
				learningGoals: ["study-abroad"],
				dailyStudyHours: "1-2",
			};
			// (i) Disallowed origin
			const resOrigin = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "https://evil.example",
					"Content-Type": "application/json",
				},
				body: JSON.stringify(validPayload),
			});
			expect(resOrigin.status).toBe(403);
			expect((await resOrigin.json()) as { error: string }).toEqual({
				error: "origin not allowed",
			});

			// (ii) Invalid content-type
			const resContentType = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "text/plain",
				},
				body: JSON.stringify(validPayload),
			});
			expect(resContentType.status).toBe(415);
			expect((await resContentType.json()) as { error: string }).toEqual({
				error: "content-type must be application/json",
			});

			// (iii) Oversized body (> 4096 bytes)
			const resSize = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "provisioning-user",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
					"Content-Length": "5000",
				},
				body: JSON.stringify(validPayload),
			});
			expect(resSize.status).toBe(413);
			expect((await resSize.json()) as { error: string }).toEqual({
				error: "payload too large",
			});
		});

		test("unverified user gets 403 STUDENT_EMAIL_UNVERIFIED", async () => {
			const res = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "unverified",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "basic",
					targetScore: "6.5",
					learningGoals: ["study-abroad"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res.status).toBe(403);
			const body = (await res.json()) as { error: string; code: string };
			expect(body.code).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);
		});

		test("unauthenticated user gets 401 unauthorized", async () => {
			const res = await app.request("/api/student/onboarding", {
				method: "POST",
				headers: {
					"x-test-user": "none",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					examInterest: "ielts",
					currentLevel: "basic",
					targetScore: "6.5",
					learningGoals: ["study-abroad"],
					dailyStudyHours: "1-2",
				}),
			});
			expect(res.status).toBe(401);
		});

		test("fail-soft read-side: corrupt DB row values gracefully return null in DTO", async () => {
			await libsql
				.update(schema.student)
				.set({
					learningGoals: "not-json-corrupt-string",
					currentLevel: "corrupt-level-string",
					dailyStudyHours: "bogus-value",
				})
				.where(eq(schema.student.id, "student-1"));

			const res = await app.request("/api/student/me", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const me = (await res.json()) as StudentMe;
			expect(me.student.learningGoals).toBeNull();
			expect(me.student.dailyStudyHours).toBeNull();
			expect(me.student.currentLevel).toBeNull();
		});
	});

	describe("POST /api/student/enrollments/:enrollmentId/accept (student activates own class enrollment)", () => {
		beforeAll(async () => {
			// Học viên khác cùng org — enrollment của bạn ấy phải không thể kích hoạt bởi student-1.
			await libsql.insert(schema.student).values({
				id: "student-2",
				orgId: "org-1",
				name: "Lan Nguyen",
				email: "lan@gmail.com",
				phone: "0909999999",
			});
			await libsql.insert(schema.classTable).values({
				id: "class-inv",
				orgId: "org-1",
				name: "IELTS Sprint",
				level: "Band 6.0",
				mode: "Online",
				schedule: JSON.stringify({
					days: [0, 2],
					start: "18:00",
					end: "19:30",
				}),
				sessionsDone: 0,
				sessionsTotal: 4,
				status: "active",
				startDate: "2099-01-04",
			});
			await libsql.insert(schema.enrollment).values([
				{
					id: "enr-inv",
					orgId: "org-1",
					classId: "class-inv",
					studentId: "student-1",
					status: "invited",
				},
				{
					id: "enr-inv-2",
					orgId: "org-1",
					classId: "class-inv",
					studentId: "student-2",
					status: "invited",
				},
			]);
		});

		test("overview exposes enrollmentId and enrollmentStatus per class", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			const invited = overview.classes.find((c) => c.id === "class-inv");
			expect(invited?.enrollmentId).toBe("enr-inv");
			expect(invited?.enrollmentStatus).toBe("invited");
			const active = overview.classes.find((c) => c.id === "class-1");
			expect(active?.enrollmentId).toBe("enr-1");
			expect(active?.enrollmentStatus).toBe("active");
		});

		test("student accepts own invited enrollment: flips to active and generates package + lessons", async () => {
			const res = await app.request("/api/student/enrollments/enr-inv/accept", {
				method: "POST",
				headers: {
					"x-test-user": "google-verified",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
			});
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({ ok: true });

			const [row] = await libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.id, "enr-inv"));
			expect(row?.status).toBe("active");

			const [pkg] = await libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, "enr-inv"));
			expect(pkg).toBeDefined();
			expect(pkg?.total).toBe(4);
			expect(pkg?.status).toBe("active");

			const lessons = await libsql
				.select({ id: schema.lesson.id })
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, "enr-inv"));
			expect(lessons).toHaveLength(4);
		});

		test("idempotent: second accept returns 200 without duplicating package or lessons", async () => {
			const res = await app.request("/api/student/enrollments/enr-inv/accept", {
				method: "POST",
				headers: {
					"x-test-user": "google-verified",
					Origin: "http://localhost:8003",
					"Content-Type": "application/json",
				},
			});
			expect(res.status).toBe(200);

			const [pkgCount] = await libsql
				.select({ count: count() })
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, "enr-inv"));
			expect(pkgCount?.count).toBe(1);
			const [lessonCount] = await libsql
				.select({ count: count() })
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, "enr-inv"));
			expect(lessonCount?.count).toBe(4);
		});

		test("cannot activate another student's enrollment: 404 and status untouched", async () => {
			const res = await app.request(
				"/api/student/enrollments/enr-inv-2/accept",
				{
					method: "POST",
					headers: {
						"x-test-user": "google-verified",
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
				},
			);
			expect(res.status).toBe(404);
			const [row] = await libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.id, "enr-inv-2"));
			expect(row?.status).toBe("invited");
		});

		test("unknown enrollment id returns 404", async () => {
			const res = await app.request(
				"/api/student/enrollments/enr-does-not-exist/accept",
				{
					method: "POST",
					headers: {
						"x-test-user": "google-verified",
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
				},
			);
			expect(res.status).toBe(404);
		});

		test("CSRF guard: missing origin 403, wrong content-type 415", async () => {
			const res1 = await app.request(
				"/api/student/enrollments/enr-inv-2/accept",
				{
					method: "POST",
					headers: {
						"x-test-user": "google-verified",
						"Content-Type": "application/json",
					},
				},
			);
			expect(res1.status).toBe(403);
			expect((await res1.json()) as { error: string }).toEqual({
				error: "origin not allowed",
			});

			const res2 = await app.request(
				"/api/student/enrollments/enr-inv-2/accept",
				{
					method: "POST",
					headers: {
						"x-test-user": "google-verified",
						Origin: "http://localhost:8003",
						"Content-Type": "text/plain",
					},
				},
			);
			expect(res2.status).toBe(415);
		});

		test("teacher-role session is rejected by the student role gate", async () => {
			const res = await app.request(
				"/api/student/enrollments/enr-inv-2/accept",
				{
					method: "POST",
					headers: {
						"x-test-user": "teacher",
						Origin: "http://localhost:8003",
						"Content-Type": "application/json",
					},
				},
			);
			expect(res.status).toBe(403);
		});
	});

	describe("nextSession skips ended today sessions (#395)", () => {
		// Snapshot MỘT lần: seed và assertion cùng nhìn một mốc, dù suite chạy
		// băng qua nửa đêm VN thì seed/assertion vẫn tự nhất quán với nhau.
		const TODAY = vietnamTodayISO();
		const YESTERDAY = addDaysISO(TODAY, -1);
		const dowOf = (iso: string) =>
			((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

		beforeAll(async () => {
			await libsql.insert(schema.classTable).values([
				{
					id: "class-395a",
					orgId: "org-1",
					name: "IELTS 395 A",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 00:00–00:30",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
				{
					id: "class-395b",
					orgId: "org-1",
					name: "IELTS 395 B",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 00:00–00:30",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
				{
					id: "class-395c",
					orgId: "org-1",
					name: "IELTS 395 C legacy",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 08:00–09:00",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
				{
					id: "class-395d",
					orgId: "org-1",
					name: "IELTS 395 D boundary",
					level: "IELTS 5.0–6.0",
					mode: "Online",
					schedule: "T2 10:30–12:00",
					sessionsDone: 0,
					sessionsTotal: 20,
					status: "active",
				},
			]);
			await libsql.insert(schema.enrollment).values([
				{
					id: "enr-395a",
					orgId: "org-1",
					classId: "class-395a",
					studentId: "student-1",
					status: "active",
				},
				{
					id: "enr-395b",
					orgId: "org-1",
					classId: "class-395b",
					studentId: "student-1",
					status: "active",
				},
				{
					id: "enr-395c",
					orgId: "org-1",
					classId: "class-395c",
					studentId: "student-1",
					status: "active",
				},
				{
					id: "enr-395d",
					orgId: "org-1",
					classId: "class-395d",
					studentId: "student-1",
					status: "active",
				},
			]);
			await libsql.insert(schema.lesson).values([
				{
					// dur 0 ⇒ end = 00:00 hôm nay (giờ VN) ⇒ đã kết thúc ở MỌI thời
					// điểm chạy test (ranh giới <=) — seed độc lập đồng hồ.
					id: "ls-395a-ended",
					orgId: "org-1",
					classId: "class-395a",
					enrollmentId: "enr-395a",
					day: dowOf(TODAY),
					time: "00:00",
					dur: 0,
					date: TODAY,
					status: "upcoming",
					topic: "Sáng đã kết thúc",
				},
				{
					// end = mai 00:30 giờ VN ⇒ chưa kết thúc ở mọi thời điểm chạy test
					// thông thường (trừ cửa sổ băng qua đúng nửa đêm VN — xem mục Rủi ro
					// trong plan).
					id: "ls-395a-evening",
					orgId: "org-1",
					classId: "class-395a",
					enrollmentId: "enr-395a",
					day: dowOf(TODAY),
					time: "23:00",
					dur: 90,
					date: TODAY,
					status: "upcoming",
					topic: "Buổi tối",
				},
				{
					// Hôm qua: bị gte(date, today) loại khỏi ứng viên, không cạnh tranh.
					id: "ls-395b-past",
					orgId: "org-1",
					classId: "class-395b",
					enrollmentId: "enr-395b",
					day: dowOf(YESTERDAY),
					time: "23:00",
					dur: 59,
					date: YESTERDAY,
					status: "upcoming",
					topic: "Hôm qua",
				},
				{
					// Phòng thủ invariant vỡ: time lệch format không thể sinh qua write
					// path (TIME_REGEX); end == null ⇒ không coi là đã kết thúc.
					id: "ls-395b-legacy",
					orgId: "org-1",
					classId: "class-395b",
					enrollmentId: "enr-395b",
					day: dowOf(TODAY),
					time: "7pm",
					dur: 60,
					date: TODAY,
					status: "upcoming",
					topic: "Legacy lệch format",
				},
				{
					id: "ls-395c-nodate",
					orgId: "org-1",
					classId: "class-395c",
					enrollmentId: "enr-395c",
					day: 1,
					time: "08:00",
					dur: 60,
					date: null,
					status: "upcoming",
					topic: "Lớp legacy",
				},
				{
					// 2099-03-10 = thứ Ba ⇒ day 2; end = 12:00 giờ VN — dùng với `now`
					// inject tường minh ở test ranh giới.
					id: "ls-395d-boundary",
					orgId: "org-1",
					classId: "class-395d",
					enrollmentId: "enr-395d",
					day: 2,
					time: "10:30",
					dur: 90,
					date: "2099-03-10",
					status: "upcoming",
					topic: "Ranh giới",
				},
			]);
		});

		test("overview skips today's already-ended session when picking Buổi tới", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			const a = overview.classes.find((c) => c.id === "class-395a");
			expect(a?.nextSession).toEqual({
				date: TODAY,
				time: "23:00",
				topic: "Buổi tối",
			});
		});

		test("class detail skips today's already-ended session too", async () => {
			const res = await app.request("/api/student/classes/class-395a", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const detail = (await res.json()) as StudentClassDetail;
			expect(detail.class.nextSession).toEqual({
				date: TODAY,
				time: "23:00",
				topic: "Buổi tối",
			});
		});

		test("legacy malformed time is never treated as ended (defensive fallback)", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			const b = overview.classes.find((c) => c.id === "class-395b");
			expect(b?.nextSession).toEqual({
				date: TODAY,
				time: "7pm",
				topic: "Legacy lệch format",
			});
		});

		test("legacy class without dates has no next session", async () => {
			const res = await app.request("/api/student/overview", {
				headers: { "x-test-user": "google-verified" },
			});
			expect(res.status).toBe(200);
			const overview = (await res.json()) as StudentOverview;
			const c = overview.classes.find((cls) => cls.id === "class-395c");
			expect(c?.nextSession).toBeNull();
		});

		test("boundary: end == now counts as ended (loader, injected now)", async () => {
			const next = await loadNextSession(
				libsql,
				"org-1",
				"class-395d",
				new Date("2099-03-10T12:00:00+07:00"),
			);
			expect(next).toBeNull();
		});

		test("boundary: end > now still counts as Buổi tới (loader, injected now)", async () => {
			const next = await loadNextSession(
				libsql,
				"org-1",
				"class-395d",
				new Date("2099-03-10T11:59:59+07:00"),
			);
			expect(next).toEqual({
				date: "2099-03-10",
				time: "10:30",
				topic: "Ranh giới",
			});
		});
	});

	describe("manual student creation & instant activation (#508)", () => {
		const teacherHeaders = {
			Origin: "http://localhost:8001",
			"Content-Type": "application/json",
			"x-test-user": "teacher",
		};

		test("POST /api/students creates a student with only name (no email, no phone) and returns 201", async () => {
			const res = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ name: "Bé An" }),
			});
			expect(res.status).toBe(201);
			const created = (await res.json()) as { id: string };
			expect(created.id).toBeTruthy();

			const listRes = await app.request("/api/students", {
				headers: { "x-test-user": "teacher" },
			});
			expect(listRes.status).toBe(200);
			const students = (await listRes.json()) as Array<{
				id: string;
				name: string;
				email: string;
				phone: string;
			}>;
			const found = students.find((s) => s.id === created.id);
			expect(found).toMatchObject({
				id: created.id,
				name: "Bé An",
				email: "",
				phone: "",
			});
		});

		test("POST /api/students creates multiple students without email in the same org without unique collision", async () => {
			const res1 = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ name: "Học viên Không Email 1" }),
			});
			const res2 = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ name: "Học viên Không Email 2" }),
			});
			expect(res1.status).toBe(201);
			expect(res2.status).toBe(201);
		});

		test("POST /api/students with classId and activateNow=true creates active enrollment, session_package, and lessons, unlocking invoice and assignment creation", async () => {
			const classRes = await app.request("/api/classes", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "IELTS Writing #508",
					type: "ielts",
					skills: ["Writing"],
					schedule: { days: [0, 3], start: "18:30", end: "20:00" },
					sessionsTotal: 8,
					tuitionFee: 3000000,
					startDate: "2027-01-04",
				}),
			});
			expect(classRes.status).toBe(201);
			const { id: classId } = (await classRes.json()) as { id: string };

			const stRes = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "Lê Minh",
					classId,
					activateNow: true,
				}),
			});
			expect(stRes.status).toBe(201);
			const stData = (await stRes.json()) as {
				id: string;
				enrollmentId?: string;
				activated?: boolean;
			};
			expect(stData.activated).toBe(true);
			expect(stData.enrollmentId).toBeTruthy();

			const invRes = await app.request("/api/invoices", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					enrollmentId: stData.enrollmentId,
					amount: 3000000,
					due: "2027-01-10",
				}),
			});
			expect(invRes.status).toBe(201);

			const promptRes = await app.request("/api/assignments/prompts", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					skill: "writing",
					part: "task2",
					type: "opinion",
					title: "Đề Writing #508",
					band: "6.5",
					source: "Cambridge",
					prompt: "<p>Discuss both views and give your opinion.</p>",
					passage: "",
					intro: "",
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					audioName: "",
					imageUrl: "",
					questions: [],
					optionBank: [],
					note: "",
					status: "ready",
				}),
			});
			expect(promptRes.status).toBe(201);
			const { id: promptId } = (await promptRes.json()) as { id: string };

			const asgRes = await app.request(`/api/classes/${classId}/assignments`, {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					promptId,
					due: "2099-12-31",
					note: "Làm bài đúng hạn",
					studentIds: [stData.id],
				}),
			});
			expect(asgRes.status).toBe(201);
		});

		test("POST /api/students with duplicate email in same org returns 409 STUDENT_ALREADY_IN_ORG; auto-accepts pending student_invitation on creation", async () => {
			const invRes = await app.request("/api/students/invite", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ email: "manual-minh@test.local" }),
			});
			expect(invRes.status).toBe(201);

			const createRes = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "Minh Manual",
					email: "Manual-Minh@Test.Local",
				}),
			});
			expect(createRes.status).toBe(201);

			const listInvRes = await app.request("/api/students/invitations", {
				headers: { "x-test-user": "teacher" },
			});
			expect(listInvRes.status).toBe(200);
			const invitations = (await listInvRes.json()) as Array<{
				email: string;
				status: string;
			}>;
			const matchedInv = invitations.find(
				(i) => i.email === "manual-minh@test.local",
			);
			expect(matchedInv?.status).toBe("accepted");

			const dupeRes = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "Minh Manual 2",
					email: "manual-minh@test.local",
				}),
			});
			expect(dupeRes.status).toBe(409);
			const dupeBody = (await dupeRes.json()) as {
				code?: string;
				existingStudentName?: string;
			};
			expect(dupeBody.code).toBe("STUDENT_ALREADY_IN_ORG");
			expect(dupeBody.existingStudentName).toBe("Minh Manual");
		});

		test("Student created manually with email links automatically when logging into Student Portal with verified email, and rejects unverified email with 403 EMAIL_UNVERIFIED", async () => {
			const unverifiedRes = await app.request("/api/student/me", {
				headers: { "x-test-user": "manual-unverified" },
			});
			expect(unverifiedRes.status).toBe(403);
			const unverifiedBody = (await unverifiedRes.json()) as { code?: string };
			expect(unverifiedBody.code).toBe(STUDENT_ERROR_CODES.EMAIL_UNVERIFIED);

			const verifiedRes = await app.request("/api/student/me", {
				headers: { "x-test-user": "manual-verified" },
			});
			expect(verifiedRes.status).toBe(200);
			const verifiedBody = (await verifiedRes.json()) as StudentMe;
			expect(verifiedBody.student.name).toBe("Minh Manual");
			expect(verifiedBody.student.orgId).toBe("org-1");
		});

		test("POST /api/classes/:id/enroll with activateNow=true activates enrollment immediately", async () => {
			const stRes = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ name: "Phạm Gia Bảo" }),
			});
			expect(stRes.status).toBe(201);
			const { id: studentId } = (await stRes.json()) as { id: string };

			const enrollRes = await app.request("/api/classes/class-1/enroll", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ studentId, activateNow: true }),
			});
			expect(enrollRes.status).toBe(201);
			const { id: enrollmentId } = (await enrollRes.json()) as { id: string };

			const kernelRes = await app.request("/api/kernel", {
				headers: { "x-test-user": "teacher" },
			});
			expect(kernelRes.status).toBe(200);
			const snap = (await kernelRes.json()) as {
				enrollments: Array<{ id: string; status: string }>;
			};
			const enr = snap.enrollments.find((e) => e.id === enrollmentId);
			expect(enr?.status).toBe("active");
		});

		test("#570: GET /api/students reports portalLinked false before onboarding and true after onboarding; 409 includes portalLinked", async () => {
			const createRes = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "Lan Portal Check",
					email: "lan-portal-570@test.local",
				}),
			});
			expect(createRes.status).toBe(201);
			const created: Record<string, unknown> = await createRes.json();
			expect(created.inviteEmailSent).toBe(true);
			const createdId = String(created.id);

			const listBefore = (await (
				await app.request("/api/students", {
					headers: { "x-test-user": "teacher" },
				})
			).json()) as Array<{ id: string; portalLinked?: boolean }>;
			expect(listBefore.find((s) => s.id === createdId)?.portalLinked).toBe(
				false,
			);

			const dupeBefore = await app.request("/api/students", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					name: "Lan Dup",
					email: "lan-portal-570@test.local",
				}),
			});
			expect(dupeBefore.status).toBe(409);
			const dupeBody: Record<string, unknown> = await dupeBefore.json();
			expect(dupeBody.existingStudentId).toBe(createdId);
			expect(dupeBody.portalLinked).toBe(false);

			await libsql
				.update(schema.student)
				.set({ onboardingCompletedAt: new Date() })
				.where(eq(schema.student.id, createdId));

			const listAfter = (await (
				await app.request("/api/students", {
					headers: { "x-test-user": "teacher" },
				})
			).json()) as Array<{ id: string; portalLinked?: boolean }>;
			expect(listAfter.find((s) => s.id === createdId)?.portalLinked).toBe(
				true,
			);
		});
	});
});
