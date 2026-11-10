import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
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

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

async function setupTestApp() {
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
		return {
			userId: row.userId,
			userName: row.userName,
			role: "teacher" as const,
		};
	}

	const app = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGIN,
		getSessionUser,
		authHandler: () => new Response("auth stub", { status: 404 }),
	});

	async function insertUser(
		name: string,
	): Promise<{ id: string; token: string }> {
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
		return { id: userId, token };
	}

	function call(
		token: string,
		path: string,
		options: {
			method?: string;
			body?: unknown;
		} = {},
	) {
		const headers: Record<string, string> = {
			cookie: `better-auth.session_token=${token}`,
			origin: CORS_ORIGIN,
			...(options.body !== undefined
				? { "content-type": "application/json" }
				: {}),
		};
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

	return { db, libsql, app, insertUser, call, kernel };
}

describe("Manual Class Sessions API (Issue #649)", () => {
	test("1. POST /classes/:id/sessions creates a session on a class with 0 students", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Manual 1");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "IELTS Manual Class",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		expect(createClassRes.status).toBe(201);
		const { id: classId } = (await createClassRes.json()) as { id: string };

		const snapBefore = await t.kernel(teacher.token);
		const clsBefore = snapBefore.classes.find((c) => c.id === classId);
		expect(clsBefore?.sessionsTotal).toBe(0);
		expect(clsBefore?.schedulingMode).toBe("manual");

		// Add manual session
		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Writing Task 1 Intro",
					zoom: "https://zoom.us/j/123",
				},
			},
		);
		expect(addRes.status).toBe(201);
		const addJson = (await addRes.json()) as {
			ok: boolean;
			id: string;
			date: string;
		};
		expect(addJson.ok).toBe(true);
		expect(addJson.date).toBe("2026-11-10");

		// Snapshot inspection
		const snap = await t.kernel(teacher.token);
		const cls = snap.classes.find((c) => c.id === classId);
		expect(cls?.sessionsTotal).toBe(1);
		expect(cls?.schedulingMode).toBe("manual");
		expect(snap.classSessions).toHaveLength(1);
		expect(snap.classSessions?.[0]).toMatchObject({
			classId,
			date: "2026-11-10",
			time: "19:00",
			dur: 90,
			topic: "Writing Task 1 Intro",
			zoom: "https://zoom.us/j/123",
		});
		// Since there are 0 students, no rows in lesson
		expect(snap.lessons.filter((l) => l.classId === classId)).toHaveLength(0);
	});

	test("2. Duplicate date in POST /classes/:id/sessions returns 409 date-occupied", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Manual 2");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "IELTS Manual Class 2",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-10", time: "19:00", dur: 90, topic: "Session 1" },
		});

		const dupRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Session 1 duplicate",
				},
			},
		);
		expect(dupRes.status).toBe(409);
		const dupJson = (await dupRes.json()) as { error: string; reason: string };
		expect(dupJson.reason).toBe("date-occupied");
	});

	test("3. Adding manual session to a class with active students materializes lesson rows and updates package total", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Manual 3");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class with Active Student",
				type: "ielts",
				skills: ["Speaking"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		// Add student with activateNow=true
		const addStudentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Alpha",
				email: "alpha@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(addStudentRes.status).toBe(201);

		// Initially 0 class sessions, 0 lessons
		let snap = await t.kernel(teacher.token);
		expect(snap.lessons.filter((l) => l.classId === classId)).toHaveLength(0);

		// Add manual session
		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-12",
					time: "19:00",
					dur: 90,
					topic: "Speaking Part 1 Drill",
					zoom: "https://zoom.us/test",
				},
			},
		);
		expect(addRes.status).toBe(201);

		snap = await t.kernel(teacher.token);
		const classLessons = snap.lessons.filter((l) => l.classId === classId);
		expect(classLessons).toHaveLength(1);
		expect(classLessons[0]).toMatchObject({
			date: "2026-11-12",
			time: "19:00",
			topic: "Speaking Part 1 Drill",
			status: "upcoming",
		});

		// Package total synchronized to 1
		const pkg = snap.packages.find((p) => p.classId === classId);
		expect(pkg?.total).toBe(1);
	});

	test("4. Enrollment activation in a manual class copies existing class_session rows", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Manual 4");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Manual Class with Sessions First",
				type: "ielts",
				skills: ["Reading"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		// Pre-create 2 manual sessions
		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-10", time: "19:00", dur: 90, topic: "Session A" },
		});
		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-12", time: "19:00", dur: 90, topic: "Session B" },
		});

		// Create student without activateNow (invited enrollment)
		const addStudentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Beta",
				email: "beta@test.local",
				classId,
				activateNow: false,
			},
		});
		expect(addStudentRes.status).toBe(201);
		const snapBefore = await t.kernel(teacher.token);
		const enr = snapBefore.enrollments.find((e) => e.classId === classId);
		expect(enr?.status).toBe("invited");

		// Accept / activate enrollment
		const acceptRes = await t.call(
			teacher.token,
			`/api/enrollments/${enr?.id}/accept`,
			{
				method: "POST",
				body: {},
			},
		);
		expect(acceptRes.status).toBe(200);

		// Verify student received the 2 manual sessions
		const snapAfter = await t.kernel(teacher.token);
		const studentLessons = snapAfter.lessons.filter(
			(l) => l.classId === classId,
		);
		expect(studentLessons).toHaveLength(2);
		expect(studentLessons.map((l) => l.topic)).toEqual([
			"Session A",
			"Session B",
		]);
		const pkg = snapAfter.packages.find((p) => p.classId === classId);
		expect(pkg?.total).toBe(2);
	});

	test("5. POST /classes/:id/sessions returns 409 if class has legacy rows and is not manual", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Legacy Guard");

		// Create legacy class (default auto schedulingMode)
		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Legacy Auto Class",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "auto",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		// Activate student -> generates 12 schedule rows
		const addStudentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Legacy Student",
				email: "legacy@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(addStudentRes.status).toBe(201);

		// Calling manual session add on this legacy class is rejected
		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-12-01",
					time: "19:00",
					dur: 90,
					topic: "Rogue session",
				},
			},
		);
		expect(addRes.status).toBe(409);
		const err = (await addRes.json()) as { reason: string };
		expect(err.reason).toBe("not-manual-class");
	});

	test("6. Class with syllabus returns 409 class-has-syllabus", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Syllabus Guard");

		// Create template
		const createSyllabusRes = await t.call(
			teacher.token,
			"/api/syllabus-templates",
			{
				body: {
					name: "Template Syllabus",
					level: "Band 6.0",
					type: "ielts",
					skills: ["Writing"],
					totalLessons: 1,
					description: "Desc",
					modules: [
						{ title: "M1", description: "", lessons: [{ title: "L1" }] },
					],
				},
			},
		);
		const { id: templateId } = (await createSyllabusRes.json()) as {
			id: string;
		};

		// Create class with template
		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Syllabus Class",
				type: "ielts",
				skills: ["Writing"],
				templateId,
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Syllabus manual attempt",
				},
			},
		);
		expect(addRes.status).toBe(409);
		expect((await addRes.json()) as { reason: string }).toMatchObject({
			reason: "class-has-syllabus",
		});

		// Server suy ra mode: client gửi manual + template → vẫn auto.
		const snap = await t.kernel(teacher.token);
		const cls = snap.classes.find((c) => c.id === classId);
		expect(cls?.schedulingMode).toBe("auto");
		expect(cls?.sessionsTotal).toBe(12);
	});

	test("7. DELETE /classes/:id/sessions/:date removes upcoming session and decrements total", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Delete Session");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class to Delete From",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		// Add active student
		await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Delta",
				email: "delta@test.local",
				classId,
				activateNow: true,
			},
		});

		// Add 2 manual sessions
		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-10", time: "19:00", dur: 90, topic: "To Keep" },
		});
		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-12", time: "19:00", dur: 90, topic: "To Delete" },
		});

		let snap = await t.kernel(teacher.token);
		expect(snap.classSessions).toHaveLength(2);
		expect(snap.lessons.filter((l) => l.classId === classId)).toHaveLength(2);

		// Delete the second session
		const delRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-12`,
			{
				method: "DELETE",
			},
		);
		expect(delRes.status).toBe(200);

		snap = await t.kernel(teacher.token);
		expect(snap.classSessions).toHaveLength(1);
		expect(snap.classSessions?.[0]?.date).toBe("2026-11-10");
		const classLessons = snap.lessons.filter((l) => l.classId === classId);
		expect(classLessons).toHaveLength(1);
		expect(classLessons[0]?.date).toBe("2026-11-10");
		const cls = snap.classes.find((c) => c.id === classId);
		expect(cls?.sessionsTotal).toBe(1);
		const pkg = snap.packages.find((p) => p.classId === classId);
		expect(pkg?.total).toBe(1);
	});

	test("8. DELETE /classes/:id/sessions/:date returns 409 if session is completed", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Completed Delete");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class Completed Delete",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Epsilon",
				email: "epsilon@test.local",
				classId,
				activateNow: true,
			},
		});

		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: {
				date: "2026-11-05",
				time: "19:00",
				dur: 90,
				topic: "Completed Session",
			},
		});

		// Check in session
		const checkInRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-05/check-in`,
			{
				body: {},
			},
		);
		expect(checkInRes.status).toBe(200);

		// Attempt delete
		const delRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-05`,
			{
				method: "DELETE",
			},
		);
		expect(delRes.status).toBe(409);
		const err = (await delRes.json()) as { reason: string };
		expect(err.reason).toBe("cannot-delete-completed");
	});

	test("9. Editing an occurrence with class_session updates both lesson and class_session rows", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Edit Session");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class Edit Session",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: { date: "2026-11-10", time: "19:00", dur: 90, topic: "Old Topic" },
		});

		// Edit topic and time via occurrence edit endpoint
		const editRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-10/edit`,
			{
				body: {
					topic: "New Edited Topic",
					time: "20:00",
				},
			},
		);
		expect(editRes.status).toBe(200);

		const snap = await t.kernel(teacher.token);
		const cs = snap.classSessions?.find((s) => s.classId === classId);
		expect(cs?.topic).toBe("New Edited Topic");
		expect(cs?.time).toBe("20:00");
	});

	test("10. POST /classes/:id/sessions rejects non-https zoom or invalid time with 400", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Validation");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class Validation",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		// Invalid zoom scheme
		const resBadZoom = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Bad Zoom",
					zoom: "javascript:alert(1)",
				},
			},
		);
		expect(resBadZoom.status).toBe(400);

		// Invalid time format
		const resBadTime = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "25:00",
					dur: 90,
					topic: "Bad Time",
				},
			},
		);
		expect(resBadTime.status).toBe(400);
	});

	test("11. DELETE /classes/:id/sessions/:date on nonexistent date returns 404 not-found", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Delete Nonexistent");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class Delete Nonexistent",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		const delRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-20`,
			{ method: "DELETE" },
		);
		expect(delRes.status).toBe(404);
		const err = (await delRes.json()) as { reason: string };
		expect(err.reason).toBe("not-found");
	});

	test("12. Editing an occurrence with moveDate on a manual class with active students updates both class_session and lesson atomically", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Move Session");

		const createClassRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Class Move Session",
				type: "ielts",
				skills: ["Writing"],
				templateId: "",
				schedulingMode: "manual",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "2026-11-10",
			},
		});
		const { id: classId } = (await createClassRes.json()) as { id: string };

		await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Move",
				email: "move@test.local",
				classId,
				activateNow: true,
			},
		});

		await t.call(teacher.token, `/api/classes/${classId}/sessions`, {
			body: {
				date: "2026-11-10",
				time: "19:00",
				dur: 90,
				topic: "Before Move",
			},
		});

		const moveRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/2026-11-10/edit`,
			{
				body: {
					moveDate: "2026-11-17",
					topic: "After Move",
				},
			},
		);
		expect(moveRes.status).toBe(200);

		const snap = await t.kernel(teacher.token);
		const cs = snap.classSessions?.filter((s) => s.classId === classId);
		expect(cs).toHaveLength(1);
		expect(cs?.[0]).toMatchObject({
			date: "2026-11-17",
			topic: "After Move",
		});

		const lessons = snap.lessons.filter((l) => l.classId === classId);
		expect(lessons).toHaveLength(1);
		expect(lessons[0]).toMatchObject({
			date: "2026-11-17",
			topic: "After Move",
		});
	});

	test("13. POST /classes/:id/sessions với materialIds → đúng N dòng lesson_material (#655)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Materials 1");

		const { id: classId } = await createManualClass(t, teacher.token);
		const orgId = await orgIdOf(t);

		await t.db.insert(schema.material).values([
			{
				id: "mat-1",
				orgId,
				title: "Đề 1",
				kind: "link",
				url: "https://a.example/1",
				createdBy: "t",
			},
			{
				id: "mat-2",
				orgId,
				title: "Đề 2",
				kind: "link",
				url: "https://a.example/2",
				createdBy: "t",
			},
		]);

		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Buổi có tài liệu",
					materialIds: ["mat-2", "mat-1", "mat-2"],
				},
			},
		);
		expect(addRes.status).toBe(201);

		const links = await t.db
			.select()
			.from(schema.lessonMaterial)
			.where(
				and(
					eq(schema.lessonMaterial.classId, classId),
					eq(schema.lessonMaterial.date, "2026-11-10"),
				),
			)
			.orderBy(schema.lessonMaterial.position);
		// Dedupe giữ thứ tự; position i theo mảng gửi lên; cùng batch với
		// class_session nên buổi + links tồn tại song song.
		expect(links.map((l) => [l.materialId, l.position])).toEqual([
			["mat-2", 0],
			["mat-1", 1],
		]);
		expect(links.every((l) => l.orgId === orgId)).toBe(true);
		const [cs] = await t.db
			.select()
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, classId));
		expect(cs?.date).toBe("2026-11-10");
	});

	test("14. POST /classes/:id/sessions với id lạ → 422, không dở dang dữ liệu (#655)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Materials 2");

		const { id: classId } = await createManualClass(t, teacher.token);
		const orgId = await orgIdOf(t);
		await t.db.insert(schema.material).values({
			id: "mat-1",
			orgId,
			title: "Đề 1",
			kind: "link",
			url: "https://a.example/1",
			createdBy: "t",
		});

		const addRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Buổi hỏng",
					materialIds: ["mat-1", "mat-ghost"],
				},
			},
		);
		expect(addRes.status).toBe(422);
		expect(await addRes.json()).toEqual({
			error: "material-not-found",
			materialId: "mat-ghost",
		});

		// Chặn TRƯỚC batch: không có class_session/links dở dang nào.
		expect(
			await t.db
				.select()
				.from(schema.classSession)
				.where(eq(schema.classSession.classId, classId)),
		).toHaveLength(0);
		expect(await t.db.select().from(schema.lessonMaterial)).toHaveLength(0);

		// Ngày vẫn trống — tạo lại được.
		const retry = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions`,
			{
				body: {
					date: "2026-11-10",
					time: "19:00",
					dur: 90,
					topic: "Buổi lại",
					materialIds: ["mat-1"],
				},
			},
		);
		expect(retry.status).toBe(201);
	});
});

/** Đủ seam cho helpers #655: API call + truy vấn db trực tiếp. */
interface ManualSessionsTestApp {
	db: Db;
	call(
		token: string,
		path: string,
		options?: { method?: string; body?: unknown },
	): Response | Promise<Response>;
}

/** Tạo lớp manual qua API (org bootstrap tại request đầu tiên). */
async function createManualClass(
	t: ManualSessionsTestApp,
	token: string,
): Promise<{ id: string }> {
	const createClassRes = await t.call(token, "/api/classes", {
		body: {
			name: "IELTS Manual Materials",
			type: "ielts",
			skills: ["Writing"],
			templateId: "",
			schedulingMode: "manual",
			schedule: { days: [1, 3], start: "19:00", end: "20:30" },
			sessionsTotal: 12,
			startDate: "2026-11-10",
		},
	});
	expect(createClassRes.status).toBe(201);
	return (await createClassRes.json()) as { id: string };
}

/** Org id bootstrap bởi middleware khi request API đầu tiên. */
async function orgIdOf(t: ManualSessionsTestApp): Promise<string> {
	const [org] = await t.db.select().from(schema.organization);
	if (!org) throw new Error("org chưa được bootstrap");
	return org.id;
}
