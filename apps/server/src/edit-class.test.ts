import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	CLASS_ERROR_CODES,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
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

	function call(
		token: string | null,
		path: string,
		options: {
			method?: string;
			body?: unknown;
			rawBody?: string;
			contentType?: string | null;
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
		if (options.contentType !== null) {
			if (options.contentType !== undefined) {
				headers["content-type"] = options.contentType;
			} else if (options.body !== undefined || options.rawBody !== undefined) {
				headers["content-type"] = "application/json";
			}
		}
		return app.request(path, {
			method: options.method ?? "POST",
			headers,
			body:
				options.rawBody !== undefined
					? options.rawBody
					: options.body !== undefined
						? JSON.stringify(options.body)
						: undefined,
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

	async function createAutoClass(
		token: string,
		overrides: Partial<{
			name: string;
			type: "ielts" | "communication";
			level: string;
			skills: string[];
			mode: string;
			templateId: string;
			schedule: { days: number[]; start: string; end: string };
			sessionsTotal: number;
			startDate: string;
			tuitionFee: number | null;
			schedulingMode: "auto" | "manual";
		}> = {},
	): Promise<string> {
		const res = await call(token, "/api/classes", {
			body: {
				name: overrides.name ?? "IELTS Foundation",
				type: overrides.type ?? "ielts",
				level: overrides.level ?? "Band 6.0",
				skills: overrides.skills ?? ["Writing", "Speaking"],
				mode: overrides.mode ?? "Online",
				templateId: overrides.templateId ?? "",
				schedule: overrides.schedule ?? {
					days: [0, 2],
					start: "19:00",
					end: "20:30",
				},
				sessionsTotal: overrides.sessionsTotal ?? 12,
				startDate: overrides.startDate ?? futureMondayISO(),
				tuitionFee:
					overrides.tuitionFee === undefined ? 3_500_000 : overrides.tuitionFee,
				schedulingMode: overrides.schedulingMode ?? "auto",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	async function seedTemplateWithLessons(
		token: string,
		name: string,
		lessonCount: number,
		skills: ("Writing" | "Speaking" | "Reading" | "Listening")[] = ["Writing"],
	): Promise<string> {
		const lessons = Array.from({ length: lessonCount }, (_, idx) => ({
			title: `Bài ${idx + 1}`,
			objectives: "",
			materials: "",
			kind: "lesson" as const,
			status: "upcoming" as const,
		}));
		const res = await call(token, "/api/syllabus-templates", {
			body: {
				name,
				level: "Band 6.5",
				type: skills.length === 0 ? "communication" : "ielts",
				skills,
				description: "",
				totalLessons: lessonCount,
				modules:
					lessonCount > 0
						? [{ title: "Module 1", description: "", lessons }]
						: [],
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	return {
		db,
		libsql,
		app,
		insertUser,
		call,
		kernel,
		createAutoClass,
		seedTemplateWithLessons,
	};
}

describe("PATCH /api/classes/:id (Issue #693)", () => {
	test("1. enforces auth (401), teacher role (403), CSRF origin (403), content-type (415), invalid JSON (400), and org scope (404)", async () => {
		const t = await setupTestApp();
		const teacherA = await t.insertUser("Teacher A");
		const teacherB = await t.insertUser("Teacher B");
		const studentUser = await t.insertUser("Student User", "student");
		const adminUser = await t.insertUser("Admin User", "admin");

		const classId = await t.createAutoClass(teacherA.token);
		const validBody = {
			name: "Updated Name",
			type: "ielts",
			level: "Band 7.0",
			skills: ["Writing"],
			mode: "Offline",
		};

		// Unauthenticated -> 401
		const unauth = await t.call(null, `/api/classes/${classId}`, {
			method: "PATCH",
			body: validBody,
		});
		expect(unauth.status).toBe(401);

		// Student role -> 403
		const asStudent = await t.call(
			studentUser.token,
			`/api/classes/${classId}`,
			{ method: "PATCH", body: validBody },
		);
		expect(asStudent.status).toBe(403);

		// Admin role -> 403
		const asAdmin = await t.call(adminUser.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: validBody,
		});
		expect(asAdmin.status).toBe(403);

		// Missing or disallowed Origin -> 403
		const noOrigin = await t.call(teacherA.token, `/api/classes/${classId}`, {
			method: "PATCH",
			origin: null,
			body: validBody,
		});
		expect(noOrigin.status).toBe(403);

		const badOrigin = await t.call(teacherA.token, `/api/classes/${classId}`, {
			method: "PATCH",
			origin: "https://evil.example",
			body: validBody,
		});
		expect(badOrigin.status).toBe(403);

		// Non-JSON Content-Type -> 415
		const nonJson = await t.call(teacherA.token, `/api/classes/${classId}`, {
			method: "PATCH",
			contentType: "application/x-www-form-urlencoded",
			rawBody: "name=Test",
		});
		expect(nonJson.status).toBe(415);

		// Malformed JSON -> 400
		const badJson = await t.call(teacherA.token, `/api/classes/${classId}`, {
			method: "PATCH",
			rawBody: "{not-json",
		});
		expect(badJson.status).toBe(400);

		// Cross-org -> 404
		const crossOrg = await t.call(teacherB.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: validBody,
		});
		expect(crossOrg.status).toBe(404);
		expect(await crossOrg.json()).toEqual({ error: "class not found" });

		// Non-existent class -> 404
		const missing = await t.call(
			teacherA.token,
			"/api/classes/non-existent-class",
			{
				method: "PATCH",
				body: validBody,
			},
		);
		expect(missing.status).toBe(404);
	});

	test("2. rejects invalid schema payloads, extra fields, and past new startDate with 400", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Validation");
		const classId = await t.createAutoClass(teacher.token);

		const baseValid = {
			name: "Valid Name",
			type: "ielts",
			level: "Band 6.5",
			skills: ["Writing"],
			mode: "Online",
		};

		const badPayloads: unknown[] = [
			// Empty name
			{ ...baseValid, name: "   " },
			// Missing mode
			{ name: "X", type: "ielts", level: "", skills: ["Writing"] },
			// IELTS with empty skills
			{ ...baseValid, type: "ielts", skills: [] },
			// Communication with skills
			{ ...baseValid, type: "communication", skills: ["Speaking"] },
			// end <= start
			{
				...baseValid,
				schedule: { days: [0], start: "19:00", end: "19:00" },
			},
			{
				...baseValid,
				schedule: { days: [0], start: "20:00", end: "19:00" },
			},
			// Extra strict fields
			{ ...baseValid, status: "paused" },
			{ ...baseValid, syllabusId: "sy-1" },
			{ ...baseValid, schedulingMode: "manual" },
			// Invalid sessionsTotal
			{ ...baseValid, sessionsTotal: 0 },
			{ ...baseValid, sessionsTotal: 53 },
			// Invalid tuitionFee
			{ ...baseValid, tuitionFee: 0 },
			// Invalid calendar date / legacy date
			{ ...baseValid, startDate: "2026-02-30" },
			{ ...baseValid, startDate: "01/10" },
			// Past startDate when changed
			{ ...baseValid, startDate: addDaysISO(vietnamTodayISO(), -1) },
		];

		for (const payload of badPayloads) {
			const res = await t.call(teacher.token, `/api/classes/${classId}`, {
				method: "PATCH",
				body: payload,
			});
			expect(res.status, `expected 400 for ${JSON.stringify(payload)}`).toBe(
				400,
			);
		}
	});

	test("3. updates general info (including communication/ielts switch & tuitionFee null) when no sessions exist and when lesson or class_session exists (with past startDate)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher General Edit");
		const startMonday = futureMondayISO();
		const classId = await t.createAutoClass(teacher.token, {
			name: "Lớp Ban Đầu",
			type: "ielts",
			level: "Band 5.5",
			skills: ["Writing"],
			mode: "Online",
			schedule: { days: [2, 0], start: "19:00", end: "20:30" },
			sessionsTotal: 8,
			startDate: startMonday,
			tuitionFee: 2_000_000,
		});

		// Update general info when 0 sessions exist: switch to communication, clear tuitionFee = null
		const res1 = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "  Giao tiếp Cơ bản  ",
				type: "communication",
				level: "A2",
				skills: [],
				mode: "Offline",
				tuitionFee: null,
			},
		});
		expect(res1.status).toBe(200);
		expect(await res1.json()).toEqual({ ok: true });

		let snap = await t.kernel(teacher.token);
		let cls = snap.classes.find((c) => c.id === classId);
		expect(cls).toMatchObject({
			name: "Giao tiếp Cơ bản",
			type: "communication",
			level: "A2",
			skills: [],
			mode: "Offline",
			tuitionFee: null,
			sessionsTotal: 8,
			startDate: startMonday,
		});

		// Enroll & activate student -> creates lesson rows
		const enrollRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Học viên 1",
				email: "hv1-edit@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(enrollRes.status).toBe(201);
		expect(snap.lessons.filter((l) => l.classId === classId)).toHaveLength(0);
		snap = await t.kernel(teacher.token);
		expect(snap.lessons.filter((l) => l.classId === classId)).toHaveLength(8);

		// Simulate legacy/past startDate on the class with active lessons
		const pastDate = addDaysISO(vietnamTodayISO(), -30);
		await t.libsql
			.update(schema.classTable)
			.set({ startDate: pastDate })
			.where(eq(schema.classTable.id, classId));

		// General edit still succeeds even with lessons AND past startDate (when schedule/startDate/sessionsTotal unchanged)
		// Also test passing semantically identical schedule with unsorted days and unchanged past startDate
		const res2 = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "IELTS Chuyên sâu",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Reading", "Listening"],
				mode: "Hybrid",
				tuitionFee: 4_500_000,
				schedule: { days: [2, 0], start: "19:00", end: "20:30" },
				startDate: pastDate,
				sessionsTotal: 8,
			},
		});
		expect(res2.status).toBe(200);

		// Also allow omitting optional fields on legacy startDate like "01/10"
		await t.libsql
			.update(schema.classTable)
			.set({ startDate: "01/10" })
			.where(eq(schema.classTable.id, classId));

		const res3 = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "IELTS Chuyên sâu 2",
				type: "ielts",
				level: "Band 7.5",
				skills: ["Writing"],
				mode: "Online",
			},
		});
		expect(res3.status).toBe(200);

		snap = await t.kernel(teacher.token);
		cls = snap.classes.find((c) => c.id === classId);
		expect(cls).toMatchObject({
			name: "IELTS Chuyên sâu 2",
			type: "ielts",
			level: "Band 7.5",
			skills: ["Writing"],
			mode: "Online",
			// tuitionFee omitted -> preserved 4_500_000
			tuitionFee: 4_500_000,
			startDate: "01/10",
		});

		// New student enrolled after PATCH receives updated tuitionFee & mode in sessionPackage
		const enroll2Res = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Học viên 2",
				email: "hv2-edit@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(enroll2Res.status).toBe(201);
		const { enrollmentId: enr2Id } = (await enroll2Res.json()) as {
			enrollmentId: string;
		};
		snap = await t.kernel(teacher.token);
		const pkg2 = snap.packages.find((p) => p.enrollmentId === enr2Id);
		expect(pkg2).toMatchObject({
			price: 4_500_000,
			mode: "Online",
			total: 8,
		});

		// General edit also succeeds on a manual class that already has class_session rows
		const manualId = await t.createAutoClass(teacher.token, {
			name: "Manual Class",
			schedulingMode: "manual",
		});
		const addSessionRes = await t.call(
			teacher.token,
			`/api/classes/${manualId}/sessions`,
			{
				body: {
					date: startMonday,
					time: "18:00",
					dur: 90,
					topic: "Session 1",
				},
			},
		);
		expect(addSessionRes.status).toBe(201);

		const manualGeneralRes = await t.call(
			teacher.token,
			`/api/classes/${manualId}`,
			{
				method: "PATCH",
				body: {
					name: "Manual Class Edited",
					type: "ielts",
					level: "Band 6.5",
					skills: ["Speaking"],
					mode: "Offline",
					tuitionFee: 3_000_000,
				},
			},
		);
		expect(manualGeneralRes.status).toBe(200);
		snap = await t.kernel(teacher.token);
		expect(snap.classes.find((c) => c.id === manualId)).toMatchObject({
			name: "Manual Class Edited",
			mode: "Offline",
			tuitionFee: 3_000_000,
			sessionsTotal: 1,
		});
	});

	test("4. updates schedule, startDate, and sessionsTotal when no real sessions exist and syncs sessionPackage.total for 0-lesson legacy packages", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Schedule Edit");
		const startMonday = futureMondayISO(7);
		const nextStart = addDaysISO(startMonday, 7);
		const classId = await t.createAutoClass(teacher.token, {
			schedule: { days: [0, 2], start: "19:00", end: "20:30" },
			sessionsTotal: 10,
			startDate: startMonday,
		});

		// Legacy schedule with active enrollment -> 0 lesson rows, package.total = 10
		await t.libsql
			.update(schema.classTable)
			.set({ schedule: "T2 19:00" })
			.where(eq(schema.classTable.id, classId));
		const studentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Legacy Pkg",
				email: "legacy-pkg@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(studentRes.status).toBe(201);
		const { enrollmentId } = (await studentRes.json()) as {
			enrollmentId: string;
		};

		const patchRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "IELTS New Schedule",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				// Unsorted + duplicate check handled by schema/serializer
				schedule: { days: [4, 1], start: "18:30", end: "20:00" },
				startDate: nextStart,
				sessionsTotal: 16,
			},
		});
		expect(patchRes.status).toBe(200);

		const snap = await t.kernel(teacher.token);
		const cls = snap.classes.find((c) => c.id === classId);
		expect(cls?.schedule).toBe(
			JSON.stringify({ days: [1, 4], start: "18:30", end: "20:00" }),
		);
		expect(cls?.startDate).toBe(nextStart);
		expect(cls?.sessionsTotal).toBe(16);

		const pkg = snap.packages.find((p) => p.enrollmentId === enrollmentId);
		expect(pkg?.total).toBe(16);

		// Also allow setting startDate to vietnamTodayISO()
		const todayVN = vietnamTodayISO();
		const todayRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "IELTS New Schedule",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				startDate: todayVN,
			},
		});
		expect(todayRes.status).toBe(200);
		expect(
			(await t.kernel(teacher.token)).classes.find((c) => c.id === classId)
				?.startDate,
		).toBe(todayVN);
	});

	test("5. returns 409 CLASS_SCHEDULE_LOCKED and leaves DB unchanged when changing schedule, startDate, or sessionsTotal after lesson or class_session exists", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Lock");
		const startMonday = futureMondayISO(7);
		const nextStart = addDaysISO(startMonday, 14);

		// (a) Class with materialized lesson rows
		const autoClassId = await t.createAutoClass(teacher.token, {
			name: "Locked Auto Class",
			schedule: { days: [0, 2], start: "19:00", end: "20:30" },
			sessionsTotal: 6,
			startDate: startMonday,
		});
		const sRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Locked",
				email: "locked-auto@test.local",
				classId: autoClassId,
				activateNow: true,
			},
		});
		expect(sRes.status).toBe(201);

		const baseAuto = {
			name: "Should Not Change Name",
			type: "ielts",
			level: "Band 7.0",
			skills: ["Writing"],
			mode: "Offline",
		};

		for (const attempt of [
			{
				...baseAuto,
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
			},
			{ ...baseAuto, startDate: nextStart },
			{ ...baseAuto, sessionsTotal: 10 },
		]) {
			const res = await t.call(teacher.token, `/api/classes/${autoClassId}`, {
				method: "PATCH",
				body: attempt,
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: CLASS_ERROR_CODES.SCHEDULE_LOCKED,
			});
		}

		let snap = await t.kernel(teacher.token);
		expect(snap.classes.find((c) => c.id === autoClassId)).toMatchObject({
			name: "Locked Auto Class",
			mode: "Online",
			schedule: JSON.stringify({ days: [0, 2], start: "19:00", end: "20:30" }),
			startDate: startMonday,
			sessionsTotal: 6,
		});

		// (b) Manual class with class_session row (even 0 enrollments / 0 lessons)
		const manualClassId = await t.createAutoClass(teacher.token, {
			name: "Locked Manual Class",
			schedule: { days: [0], start: "18:00", end: "19:30" },
			startDate: startMonday,
			schedulingMode: "manual",
		});
		const csRes = await t.call(
			teacher.token,
			`/api/classes/${manualClassId}/sessions`,
			{
				body: {
					date: startMonday,
					time: "18:00",
					dur: 90,
					topic: "Buổi 1",
				},
			},
		);
		expect(csRes.status).toBe(201);

		for (const attempt of [
			{
				...baseAuto,
				schedule: { days: [1], start: "18:00", end: "19:30" },
			},
			{ ...baseAuto, startDate: nextStart },
			{ ...baseAuto, sessionsTotal: 5 },
		]) {
			const res = await t.call(teacher.token, `/api/classes/${manualClassId}`, {
				method: "PATCH",
				body: attempt,
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: CLASS_ERROR_CODES.SCHEDULE_LOCKED,
			});
		}

		snap = await t.kernel(teacher.token);
		expect(snap.classes.find((c) => c.id === manualClassId)).toMatchObject({
			name: "Locked Manual Class",
			schedule: JSON.stringify({ days: [0], start: "18:00", end: "19:30" }),
			startDate: startMonday,
			sessionsTotal: 1,
		});
	});

	test("6. preserves curriculum (syllabusId) and manual schedulingMode invariants", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Curriculum");
		const startMonday = futureMondayISO(7);
		const tplId = await t.seedTemplateWithLessons(
			teacher.token,
			"Giáo trình IELTS 4 buổi",
			4,
		);

		const classId = await t.createAutoClass(teacher.token, {
			name: "Lớp Gắn Giáo Trình",
			templateId: tplId,
			sessionsTotal: 4,
			startDate: startMonday,
		});

		let snap = await t.kernel(teacher.token);
		const initialCls = snap.classes.find((c) => c.id === classId);
		const copyId = initialCls?.syllabusId;
		expect(copyId).toBeTruthy();
		expect(initialCls?.schedulingMode).toBe("auto");

		// Cannot mutate syllabusId or schedulingMode via PATCH
		const hijackRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Hijack",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				syllabusId: null,
			},
		});
		expect(hijackRes.status).toBe(400);

		// Cannot change skills or sessionsTotal away from attached non-empty curriculum
		const badSkillsRes = await t.call(
			teacher.token,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "Lớp Gắn Giáo Trình",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing", "Speaking"],
					mode: "Offline",
				},
			},
		);
		expect(badSkillsRes.status).toBe(400);

		const badSessionsRes = await t.call(
			teacher.token,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "Lớp Gắn Giáo Trình",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing"],
					mode: "Offline",
					sessionsTotal: 8,
				},
			},
		);
		expect(badSessionsRes.status).toBe(400);

		// Valid edit preserves syllabusId, schedulingMode, and attached curriculum tree
		const editBeforeLesson = await t.call(
			teacher.token,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "Lớp Gắn Giáo Trình Đã Sửa",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing"],
					mode: "Offline",
					tuitionFee: 5_000_000,
					schedule: { days: [1, 3], start: "19:30", end: "21:00" },
					startDate: addDaysISO(startMonday, 7),
				},
			},
		);
		expect(editBeforeLesson.status).toBe(200);

		snap = await t.kernel(teacher.token);
		const afterCls = snap.classes.find((c) => c.id === classId);
		expect(afterCls).toMatchObject({
			name: "Lớp Gắn Giáo Trình Đã Sửa",
			syllabusId: copyId,
			schedulingMode: "auto",
			sessionsTotal: 4,
			mode: "Offline",
			tuitionFee: 5_000_000,
		});
		const copySyllabus = snap.syllabi.find((s) => s.id === copyId);
		expect(copySyllabus?.modules[0]?.lessons).toHaveLength(4);

		// Curriculum with empty skills allows editing skills
		const emptySkillsTplId = await t.seedTemplateWithLessons(
			teacher.token,
			"Giáo trình chưa khóa kỹ năng",
			4,
			[],
		);
		const emptySkillsClassId = await t.createAutoClass(teacher.token, {
			name: "Lớp Giáo Trình Skills Rỗng",
			templateId: emptySkillsTplId,
			sessionsTotal: 4,
			startDate: startMonday,
			skills: ["Writing"],
		});
		const editEmptySkillsRes = await t.call(
			teacher.token,
			`/api/classes/${emptySkillsClassId}`,
			{
				method: "PATCH",
				body: {
					name: "Lớp Giáo Trình Skills Rỗng",
					type: "ielts",
					level: "Band 6.5",
					skills: ["Reading", "Listening"],
					mode: "Online",
				},
			},
		);
		expect(editEmptySkillsRes.status).toBe(200);
		snap = await t.kernel(teacher.token);
		expect(
			snap.classes.find((c) => c.id === emptySkillsClassId)?.skills,
		).toEqual(["Reading", "Listening"]);

		// Manual class with 0 sessions: cannot override sessionsTotal (400), omitting keeps 0 & manual
		const manualId = await t.createAutoClass(teacher.token, {
			name: "Manual Empty",
			schedulingMode: "manual",
			startDate: startMonday,
		});
		const badManualSessions = await t.call(
			teacher.token,
			`/api/classes/${manualId}`,
			{
				method: "PATCH",
				body: {
					name: "Manual Empty",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing"],
					mode: "Online",
					sessionsTotal: 12,
				},
			},
		);
		expect(badManualSessions.status).toBe(400);

		const okManualEdit = await t.call(
			teacher.token,
			`/api/classes/${manualId}`,
			{
				method: "PATCH",
				body: {
					name: "Manual Empty Renamed",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing"],
					mode: "Offline",
					schedule: { days: [4], start: "20:00", end: "21:30" },
				},
			},
		);
		expect(okManualEdit.status).toBe(200);
		snap = await t.kernel(teacher.token);
		expect(snap.classes.find((c) => c.id === manualId)).toMatchObject({
			name: "Manual Empty Renamed",
			schedulingMode: "manual",
			sessionsTotal: 0,
			mode: "Offline",
		});
	});

	test("7. stays consistent under concurrent Promise.all race with enrollment activation and manual session creation", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Race");
		const startMonday = futureMondayISO(7);
		const newStart = addDaysISO(startMonday, 7);

		for (let round = 0; round < 5; round += 1) {
			const classId = await t.createAutoClass(teacher.token, {
				name: `Race Auto ${round}`,
				schedule: { days: [0], start: "19:00", end: "20:30" },
				sessionsTotal: 3,
				startDate: startMonday,
			});
			const sRes = await t.call(teacher.token, "/api/students", {
				body: {
					name: `HV Race ${round}`,
					email: `race-${round}@test.local`,
					classId,
					activateNow: false,
				},
			});
			expect(sRes.status).toBe(201);
			const { enrollmentId } = (await sRes.json()) as {
				enrollmentId: string;
			};

			const newSchedule = { days: [2], start: "20:00", end: "21:30" };
			const [patchRes, acceptRes] = await Promise.all([
				t.call(teacher.token, `/api/classes/${classId}`, {
					method: "PATCH",
					body: {
						name: `Race Auto ${round}`,
						type: "ielts",
						level: "Band 6.0",
						skills: ["Writing"],
						mode: "Online",
						schedule: newSchedule,
						startDate: newStart,
						sessionsTotal: 5,
					},
				}),
				t.call(teacher.token, `/api/enrollments/${enrollmentId}/accept`, {
					body: {},
				}),
			]);

			expect(acceptRes.status).toBe(200);
			expect([200, 409]).toContain(patchRes.status);

			const [clsRow] = await t.libsql
				.select()
				.from(schema.classTable)
				.where(eq(schema.classTable.id, classId));
			const lessons = await t.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.classId, classId));
			const [pkg] = await t.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, enrollmentId));

			if (patchRes.status === 200) {
				// PATCH won first -> activation retried with new schedule/sessionsTotal
				expect(clsRow?.sessionsTotal).toBe(5);
				expect(clsRow?.startDate).toBe(newStart);
				expect(lessons).toHaveLength(5);
				expect(pkg?.total).toBe(5);
				expect(lessons.every((l) => l.day === 3 && l.time === "20:00")).toBe(
					true,
				);
			} else {
				// Activation won first -> PATCH returned 409 SCHEDULE_LOCKED
				const body = (await patchRes.json()) as { code?: string };
				expect(body.code).toBe(CLASS_ERROR_CODES.SCHEDULE_LOCKED);
				expect(clsRow?.sessionsTotal).toBe(3);
				expect(clsRow?.startDate).toBe(startMonday);
				expect(lessons).toHaveLength(3);
				expect(pkg?.total).toBe(3);
				expect(lessons.every((l) => l.day === 1 && l.time === "19:00")).toBe(
					true,
				);
			}
		}

		// Race between PATCH schedule and POST /classes/:id/sessions
		for (let round = 0; round < 3; round += 1) {
			const manualId = await t.createAutoClass(teacher.token, {
				name: `Race Manual ${round}`,
				schedule: { days: [0], start: "18:00", end: "19:30" },
				startDate: startMonday,
				schedulingMode: "manual",
			});
			const [patchRes, sessionRes] = await Promise.all([
				t.call(teacher.token, `/api/classes/${manualId}`, {
					method: "PATCH",
					body: {
						name: `Race Manual ${round}`,
						type: "ielts",
						level: "Band 6.0",
						skills: ["Writing"],
						mode: "Online",
						schedule: { days: [3], start: "19:00", end: "20:30" },
					},
				}),
				t.call(teacher.token, `/api/classes/${manualId}/sessions`, {
					body: {
						date: startMonday,
						time: "18:00",
						dur: 90,
						topic: "Manual Session",
					},
				}),
			]);

			expect(sessionRes.status).toBe(201);
			expect([200, 409]).toContain(patchRes.status);
			const [clsRow] = await t.libsql
				.select()
				.from(schema.classTable)
				.where(
					and(
						eq(schema.classTable.id, manualId),
						eq(schema.classTable.sessionsTotal, 1),
					),
				);
			expect(clsRow).toBeDefined();
		}
	});
});
