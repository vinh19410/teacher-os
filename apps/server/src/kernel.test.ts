/**
 * Wave 0 kernel isolation tests — run against the real server handler chain
 * (cors → bootstrap middleware → origin guard → kernel routes) from buildApp.
 *
 * The only seam is the session lookup: tests inject a db-backed reader with
 * Better-Auth cookie semantics (better-auth.session_token → session row →
 * user row, expiry checked) plus test-only user/session inserts.
 */

import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { lesson } from "@teacher-os/db/schema/lesson";
import { membership } from "@teacher-os/db/schema/membership";
import { organization } from "@teacher-os/db/schema/organization";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

interface TestSession {
	userId: string;
	userName: string;
	token: string;
}

async function createTestApp() {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	async function getSessionUser(headers: Headers) {
		const cookie = headers.get("cookie") ?? "";
		const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
		if (!token) return null;
		const [row] = await libsql
			.select({
				userId: authSession.userId,
				expiresAt: authSession.expiresAt,
				userName: authUser.name,
			})
			.from(authSession)
			.innerJoin(authUser, eq(authSession.userId, authUser.id))
			.where(eq(authSession.token, token));
		if (!row || row.expiresAt.getTime() <= Date.now()) return null;
		return { userId: row.userId, userName: row.userName };
	}

	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
	});

	// Test-only helper inserts (never exported to prod code paths).
	async function insertUser(name: string): Promise<TestSession> {
		const userId = crypto.randomUUID();
		const token = crypto.randomUUID();
		await libsql
			.insert(authUser)
			.values({ id: userId, name, email: `${userId}@test.local` });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			token,
			userId,
		});
		return { userId, userName: name, token };
	}

	async function call(
		path: string,
		options: {
			method?: string;
			session?: TestSession;
			origin?: string | null;
			body?: unknown;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (options.session)
			headers.cookie = `better-auth.session_token=${options.session.token}`;
		if (options.origin !== null) headers.origin = options.origin ?? CORS_ORIGIN;
		if (options.body !== undefined)
			headers["content-type"] = "application/json";
		return app.request(path, {
			method: options.method ?? "GET",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function membershipsOf(userId: string) {
		return libsql
			.select()
			.from(membership)
			.where(eq(membership.userId, userId));
	}

	/**
	 * Wave 4 helper insert: no lesson-create endpoint exists yet (non-goal),
	 * so tests seed scheduled lessons directly — the same way the persist
	 * contract is verified.
	 */
	async function insertLesson(
		session: TestSession,
		row: {
			classId: string;
			enrollmentId: string;
			day?: number;
			time?: string;
			dur?: number;
			type?: string;
			status?: string;
			topic?: string;
		},
	): Promise<string> {
		const [membershipRow] = await membershipsOf(session.userId);
		if (!membershipRow) throw new Error("bootstrap the org before inserting");
		const id = crypto.randomUUID();
		await libsql.insert(lesson).values({
			id,
			orgId: membershipRow.orgId,
			classId: row.classId,
			enrollmentId: row.enrollmentId,
			day: row.day ?? 2,
			time: row.time ?? "19:00",
			dur: row.dur ?? 60,
			type: row.type ?? "1:1",
			status: row.status ?? "upcoming",
			topic: row.topic ?? "Mock test",
			zoom: "",
		});
		return id;
	}

	async function kernel(session: TestSession): Promise<KernelSnapshot> {
		const res = await call("/api/kernel", { session });
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	async function createClass(
		session: TestSession,
		name: string,
	): Promise<string> {
		const res = await call("/api/classes", {
			session,
			method: "POST",
			body: {
				name,
				level: "Band 7.0",
				skill: "Writing",
				mode: "Online",
				syllabusId: "",
				schedule: "T3 19:00",
				sessionsTotal: 12,
				startDate: "01/09",
			},
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function createSyllabus(
		session: TestSession,
		name: string,
	): Promise<string> {
		const res = await call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name,
				level: "Band 7.0",
				skill: "Writing",
				description: "",
				totalLessons: 0,
			},
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function createModule(
		session: TestSession,
		syllabusId: string,
		title: string,
	): Promise<string> {
		const res = await call(`/api/syllabi/${syllabusId}/modules`, {
			session,
			method: "POST",
			body: { title, description: "" },
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function addStudent(
		session: TestSession,
		name: string,
		extra: { classId?: string; total?: number; price?: number } = {},
	): Promise<string> {
		const res = await call("/api/students", {
			session,
			method: "POST",
			body: {
				name,
				phone: "0900 000 000",
				parentName: "Phụ huynh",
				total: extra.total ?? 10,
				price: extra.price ?? 400000,
				mode: "Online",
				...(extra.classId ? { classId: extra.classId } : {}),
			},
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	return {
		app,
		db: libsql,
		insertUser,
		call,
		kernel,
		membershipsOf,
		insertLesson,
		createClass,
		createSyllabus,
		createModule,
		addStudent,
	};
}

describe("kernel bootstrap", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;

	beforeAll(async () => {
		t = await createTestApp();
	});

	test("unauthenticated kernel request is 401", async () => {
		const res = await t.call("/api/kernel");
		expect(res.status).toBe(401);
	});

	test("first request bootstraps an empty org with a teacher membership, idempotently", async () => {
		const session = await t.insertUser("Cô Trang");
		const snapshot = await t.kernel(session);
		expect(snapshot.students).toEqual([]);
		expect(snapshot.classes).toEqual([]);
		expect(snapshot.syllabi).toEqual([]);

		const memberships = await t.membershipsOf(session.userId);
		expect(memberships).toHaveLength(1);
		expect(memberships[0]?.role).toBe("teacher");

		const first = memberships[0];
		expect(first).toBeDefined();
		const [org] = await t.db
			.select()
			.from(organization)
			.where(eq(organization.id, first?.orgId ?? ""));
		expect(org?.name).toBe("Cô Trang");

		// Second request must not create a second org or membership.
		await t.kernel(session);
		expect(await t.membershipsOf(session.userId)).toHaveLength(1);
	});

	test("auth routes skip the bootstrap middleware", async () => {
		const res = await t.call("/api/auth/get-session", { origin: null });
		// The stub auth handler answers (404) — proof the request bypassed bootstrap 401/403.
		expect(res.status).toBe(404);
	});
});

describe("kernel origin + content-type guards", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Guard");
	});

	test("POST without Origin header is 403", async () => {
		const res = await t.call("/api/students", {
			session,
			method: "POST",
			origin: null,
			body: { name: "A" },
		});
		expect(res.status).toBe(403);
	});

	test("POST with a foreign Origin is 403", async () => {
		const res = await t.call("/api/students", {
			session,
			method: "POST",
			origin: "https://evil.example",
			body: { name: "A" },
		});
		expect(res.status).toBe(403);
	});

	test("POST with a non-JSON content-type is 415", async () => {
		const res = await t.app.request("/api/students", {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${session.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "name=A",
		});
		expect(res.status).toBe(415);
	});

	test("invalid body fails zod validation with 400", async () => {
		const res = await t.call("/api/students", {
			session,
			method: "POST",
			body: { phone: "" },
		});
		expect(res.status).toBe(400);
	});
});

describe("org isolation", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Cô A");
		orgB = await t.insertUser("Cô B");
	});

	test("org B never reads org A rows, and cross-org ids 404", async () => {
		const classA = await t.createClass(orgA, "Lớp của A");
		await t.addStudent(orgA, "Học viên A", { classId: classA });

		const snapshotB = await t.kernel(orgB);
		expect(snapshotB.students).toEqual([]);
		expect(snapshotB.classes).toEqual([]);

		// Cross-org write on a foreign class id must not reveal or mutate it.
		const notes = await t.call(`/api/classes/${classA}/notes`, {
			session: orgB,
			method: "POST",
			body: { notes: "đánh cắp" },
		});
		expect(notes.status).toBe(404);

		const snapshotA = await t.kernel(orgA);
		expect(snapshotA.classes[0]?.notes).toBe("");
		expect(snapshotA.students).toHaveLength(1);
	});

	test("students with classId create enrollment + package atomically; without classId, person only", async () => {
		const session = await t.insertUser("Cô Pkg");
		const classId = await t.createClass(session, "Lớp pkg");
		const studentId = await t.addStudent(session, "Học viên gói", {
			classId,
			total: 12,
			price: 500000,
		});

		const snapshot = await t.kernel(session);
		expect(snapshot.enrollments).toHaveLength(1);
		expect(snapshot.enrollments[0]).toMatchObject({ classId, studentId });
		expect(snapshot.packages).toHaveLength(1);
		expect(snapshot.packages[0]).toMatchObject({
			enrollmentId: snapshot.enrollments[0]?.id,
			total: 12,
			price: 500000,
			status: "active",
		});
		// Entitlement only: no done/remaining on the wire — derived downstream.
		expect(snapshot.packages[0]).not.toHaveProperty("done");
		expect(snapshot.packages[0]).not.toHaveProperty("remaining");

		const personId = await t.addStudent(session, "Học viên tự do");
		const after = await t.kernel(session);
		expect(after.enrollments).toHaveLength(1); // unchanged
		expect(after.packages).toHaveLength(1); // unchanged
		expect(after.students.map((s) => s.id)).toContain(personId);
	});
});

describe("syllabus tree and nested binding", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let syllabusId: string;
	let moduleId: string;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Syllabus");
	});

	test("create syllabus → module → lesson, then snapshot returns an ordered tree", async () => {
		syllabusId = await t.createSyllabus(session, "IELTS Writing");
		moduleId = await t.createModule(session, syllabusId, "Module 1");
		const secondModuleId = await t.createModule(
			session,
			syllabusId,
			"Module 2",
		);

		const lessonRes = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session,
				method: "POST",
				body: {
					title: "Line chart",
					objectives: "trend vocab",
					materials: "Cam 15",
					status: "upcoming",
				},
			},
		);
		expect(lessonRes.status).toBe(201);

		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi).toHaveLength(1);
		const sy = snapshot.syllabi[0];
		expect(sy?.modules.map((m) => m.title)).toEqual(["Module 1", "Module 2"]);
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual(["Line chart"]);
		expect(sy?.modules[1]?.id).toBe(secondModuleId);
		expect(sy?.modules[1]?.lessons).toEqual([]);
	});

	test("module edit under a foreign syllabus is 404", async () => {
		const otherSyllabusId = await t.createSyllabus(session, "IELTS Speaking");
		const res = await t.call(
			`/api/syllabi/${otherSyllabusId}/modules/${moduleId}`,
			{
				session,
				method: "POST",
				body: { title: "đánh cắp module", description: "" },
			},
		);
		expect(res.status).toBe(404);
	});

	test("lesson edit under a foreign module is 404", async () => {
		const otherModuleId = await t.createModule(
			session,
			syllabusId,
			"Module khác",
		);
		const tree = await t.kernel(session);
		const lessonId = tree.syllabi[0]?.modules[0]?.lessons[0]?.id ?? "";
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${otherModuleId}/lessons/${lessonId}`,
			{
				session,
				method: "POST",
				body: {
					title: "đánh cắp lesson",
					objectives: "",
					materials: "",
					status: "done",
				},
			},
		);
		expect(res.status).toBe(404);
	});
});

describe("cross-org syllabus writes (Wave 2 isolation lock)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;
	let syllabusId: string;
	let moduleId: string;
	let lessonId: string;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Cô Syllabus A");
		orgB = await t.insertUser("Cô Syllabus B");
		syllabusId = await t.createSyllabus(orgA, "Cây giáo trình A");
		moduleId = await t.createModule(orgA, syllabusId, "Module A");
		const lessonRes = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session: orgA,
				method: "POST",
				body: {
					title: "Buổi A",
					objectives: "mục tiêu A",
					materials: "tài liệu A",
					status: "upcoming",
				},
			},
		);
		expect(lessonRes.status).toBe(201);
		lessonId = ((await lessonRes.json()) as { id: string }).id;
	});

	test("org B sees none of org A's syllabus tree", async () => {
		const snapshotB = await t.kernel(orgB);
		expect(snapshotB.syllabi).toEqual([]);
	});

	test("org B cannot add a module under org A's syllabus", async () => {
		const res = await t.call(`/api/syllabi/${syllabusId}/modules`, {
			session: orgB,
			method: "POST",
			body: { title: "module gián điệp", description: "" },
		});
		expect(res.status).toBe(404);
	});

	test("org B cannot edit org A's module", async () => {
		const res = await t.call(`/api/syllabi/${syllabusId}/modules/${moduleId}`, {
			session: orgB,
			method: "POST",
			body: { title: "đánh cắp module", description: "" },
		});
		expect(res.status).toBe(404);
	});

	test("org B cannot add a lesson under org A's module", async () => {
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session: orgB,
				method: "POST",
				body: {
					title: "buổi gián điệp",
					objectives: "",
					materials: "",
					status: "upcoming",
				},
			},
		);
		expect(res.status).toBe(404);
	});

	test("org B cannot edit org A's lesson", async () => {
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${lessonId}`,
			{
				session: orgB,
				method: "POST",
				body: {
					title: "đánh cắp buổi",
					objectives: "",
					materials: "",
					status: "done",
				},
			},
		);
		expect(res.status).toBe(404);
	});

	test("org A's tree is unchanged after every cross-org attempt", async () => {
		const snapshotA = await t.kernel(orgA);
		const sy = snapshotA.syllabi[0];
		expect(sy?.modules.map((m) => m.title)).toEqual(["Module A"]);
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual(["Buổi A"]);
		expect(sy?.modules[0]?.lessons[0]?.status).toBe("upcoming");
	});
});

describe("assign syllabus + class notes", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Assign");
	});

	test("assign then unassign syllabus, and persist notes", async () => {
		const classId = await t.createClass(session, "Lớp gán");
		const syllabusId = await t.createSyllabus(session, "Syllabus gán");

		const assign = await t.call(`/api/classes/${classId}/assign-syllabus`, {
			session,
			method: "POST",
			body: { syllabusId },
		});
		expect(assign.status).toBe(200);
		expect((await t.kernel(session)).classes[0]?.syllabusId).toBe(syllabusId);

		const unassign = await t.call(`/api/classes/${classId}/assign-syllabus`, {
			session,
			method: "POST",
			body: { syllabusId: "" },
		});
		expect(unassign.status).toBe(200);
		expect((await t.kernel(session)).classes[0]?.syllabusId).toBeNull();

		const notes = await t.call(`/api/classes/${classId}/notes`, {
			session,
			method: "POST",
			body: { notes: "ghi chú mới" },
		});
		expect(notes.status).toBe(200);
		const snapshot = await t.kernel(session);
		expect(snapshot.classes[0]?.notes).toBe("ghi chú mới");
	});

	test("assigning a foreign-org syllabus is 404", async () => {
		const otherSession = await t.insertUser("Cô khác");
		const foreignSyllabusId = await t.createSyllabus(
			otherSession,
			"Syllabus người khác",
		);
		const classId = await t.createClass(session, "Lớp thường");
		const res = await t.call(`/api/classes/${classId}/assign-syllabus`, {
			session,
			method: "POST",
			body: { syllabusId: foreignSyllabusId },
		});
		expect(res.status).toBe(404);
	});
});

describe("lesson check-in/cancel (Wave 4)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let classId: string;
	let enrollmentId: string;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Lịch");
		classId = await t.createClass(session, "Lớp 1:1");
		const studentId = await t.addStudent(session, "Học viên lịch", {
			classId,
			total: 10,
		});
		const snapshot = await t.kernel(session);
		enrollmentId =
			snapshot.enrollments.find(
				(e) => e.classId === classId && e.studentId === studentId,
			)?.id ?? "";
		expect(enrollmentId).not.toBe("");
	});

	test("new org snapshot carries an empty lessons array (no seed)", async () => {
		const fresh = await t.insertUser("Cô mới");
		const snapshot = await t.kernel(fresh);
		expect(snapshot.lessons).toEqual([]);
	});

	test("snapshot exposes inserted lesson rows bound to class + enrollment", async () => {
		const lessonId = await t.insertLesson(session, {
			classId,
			enrollmentId,
			day: 2,
			time: "19:00",
			topic: "Writing task 2",
		});
		const snapshot = await t.kernel(session);
		const row = snapshot.lessons.find((l) => l.id === lessonId);
		expect(row).toMatchObject({
			classId,
			enrollmentId,
			day: 2,
			time: "19:00",
			status: "upcoming",
			topic: "Writing task 2",
		});
	});

	test("check-in flips upcoming→completed and persists; second check-in is 409", async () => {
		const lessonId = await t.insertLesson(session, { classId, enrollmentId });
		const before = await t.kernel(session);

		const first = await t.call(`/api/lessons/${lessonId}/check-in`, {
			session,
			method: "POST",
			body: {},
		});
		expect(first.status).toBe(200);

		const after = await t.kernel(session);
		expect(after.lessons.find((l) => l.id === lessonId)?.status).toBe(
			"completed",
		);
		// Invariant 6/7: check-in writes only the lesson row — no package
		// counters, no stored class sessionsDone.
		expect(after.packages).toEqual(before.packages);
		expect(after.classes.find((c) => c.id === classId)?.sessionsDone).toBe(
			before.classes.find((c) => c.id === classId)?.sessionsDone,
		);

		const second = await t.call(`/api/lessons/${lessonId}/check-in`, {
			session,
			method: "POST",
			body: {},
		});
		expect(second.status).toBe(409);
	});

	test("cancel flips upcoming→cancelled; cancelled cannot be checked in; completed cannot be cancelled", async () => {
		const cancelledId = await t.insertLesson(session, {
			classId,
			enrollmentId,
		});
		const cancel = await t.call(`/api/lessons/${cancelledId}/cancel`, {
			session,
			method: "POST",
			body: {},
		});
		expect(cancel.status).toBe(200);
		expect(
			(await t.kernel(session)).lessons.find((l) => l.id === cancelledId)
				?.status,
		).toBe("cancelled");
		const checkCancelled = await t.call(
			`/api/lessons/${cancelledId}/check-in`,
			{ session, method: "POST", body: {} },
		);
		expect(checkCancelled.status).toBe(409);

		const completedId = await t.insertLesson(session, {
			classId,
			enrollmentId,
			status: "completed",
		});
		const cancelCompleted = await t.call(`/api/lessons/${completedId}/cancel`, {
			session,
			method: "POST",
			body: {},
		});
		expect(cancelCompleted.status).toBe(409);
	});

	test("lesson whose enrollment belongs to another class is rejected (binding)", async () => {
		const otherClassId = await t.createClass(session, "Lớp khác");
		const otherStudentId = await t.addStudent(session, "HV khác", {
			classId: otherClassId,
		});
		const snapshot = await t.kernel(session);
		const otherEnrollmentId =
			snapshot.enrollments.find(
				(e) => e.classId === otherClassId && e.studentId === otherStudentId,
			)?.id ?? "";
		const lessonId = await t.insertLesson(session, {
			classId, // claims class A but the enrollment sits in class B
			enrollmentId: otherEnrollmentId,
		});
		const res = await t.call(`/api/lessons/${lessonId}/check-in`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(409);
	});

	test("guards: no Origin → 403, form content-type → 415, extra body key → 400", async () => {
		const lessonId = await t.insertLesson(session, { classId, enrollmentId });

		const noOrigin = await t.call(`/api/lessons/${lessonId}/check-in`, {
			session,
			method: "POST",
			origin: null,
			body: {},
		});
		expect(noOrigin.status).toBe(403);

		const form = await t.app.request(`/api/lessons/${lessonId}/check-in`, {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${session.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "x=1",
		});
		expect(form.status).toBe(415);

		const forged = await t.call(`/api/lessons/${lessonId}/check-in`, {
			session,
			method: "POST",
			body: { status: "completed" },
		});
		expect(forged.status).toBe(400);
	});

	test("unknown lesson id is 404", async () => {
		const res = await t.call("/api/lessons/nope/check-in", {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(404);
	});
});

describe("cross-org lesson writes (Wave 4 isolation lock)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;
	let lessonAId: string;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Cô Lịch A");
		orgB = await t.insertUser("Cô Lịch B");
		const classId = await t.createClass(orgA, "Lớp của A");
		const studentId = await t.addStudent(orgA, "Học viên A", { classId });
		const snapshot = await t.kernel(orgA);
		const enrollmentId =
			snapshot.enrollments.find(
				(e) => e.classId === classId && e.studentId === studentId,
			)?.id ?? "";
		lessonAId = await t.insertLesson(orgA, { classId, enrollmentId });
	});

	test("org B snapshot contains zero lessons", async () => {
		const snapshotB = await t.kernel(orgB);
		expect(snapshotB.lessons).toEqual([]);
	});

	test("org B cannot check in or cancel org A's lesson", async () => {
		const checkIn = await t.call(`/api/lessons/${lessonAId}/check-in`, {
			session: orgB,
			method: "POST",
			body: {},
		});
		expect(checkIn.status).toBe(404);

		const cancel = await t.call(`/api/lessons/${lessonAId}/cancel`, {
			session: orgB,
			method: "POST",
			body: {},
		});
		expect(cancel.status).toBe(404);
	});

	test("org A's lesson is unchanged after the cross-org attempts", async () => {
		const snapshotA = await t.kernel(orgA);
		expect(snapshotA.lessons.find((l) => l.id === lessonAId)?.status).toBe(
			"upcoming",
		);
	});
});
