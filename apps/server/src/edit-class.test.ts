import { fileURLToPath } from "node:url";
import { createClient, type InArgs, type InStatement } from "@libsql/client";
import {
	CLASS_ERROR_CODES,
	type KernelSnapshot,
	RECORDING_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { parseStoredSchedule, skeletonOf } from "@teacher-os/api/skeleton";
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
import { type AppDeps, buildApp, type Db, type RecordingStore } from "./app";
import type { ZoomClient, ZoomMeetingInput } from "./lib/zoom/zoom-client";

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

function expectedSkeletonDates(
	scheduleJson: string,
	startISO: string,
	total: number,
): string[] {
	const parsed = parseStoredSchedule(scheduleJson);
	if (!parsed) throw new Error("invalid schedule");
	const skeleton = skeletonOf(parsed, startISO, total);
	if (!skeleton) throw new Error("invalid skeleton");
	return [...skeleton.values()].flat().sort((a, b) => a.localeCompare(b));
}

function countArgs(args?: InArgs): number {
	if (!args) return 0;
	return Array.isArray(args) ? args.length : Object.keys(args).length;
}

function countBindParams(
	stmt: InStatement | [string, InArgs?],
	args?: InArgs,
): number {
	if (typeof stmt === "string") {
		return countArgs(args);
	}
	if (Array.isArray(stmt)) {
		return countArgs(stmt[1]);
	}
	return countArgs(stmt.args);
}

function createMemoryRecordingStore(): RecordingStore & {
	objects: Map<string, Uint8Array>;
} {
	const objects = new Map<string, Uint8Array>();
	return {
		objects,
		async putStream(key, body) {
			const buf = new Uint8Array(await new Response(body).arrayBuffer());
			objects.set(key, buf);
			return { sizeBytes: buf.byteLength };
		},
		async head(key) {
			const item = objects.get(key);
			return item
				? { contentType: "video/mp4", size: item.byteLength, etag: '"1"' }
				: null;
		},
		async get(key) {
			const item = objects.get(key);
			if (!item) return null;
			return {
				body: new ReadableStream({
					start(c) {
						c.enqueue(item);
						c.close();
					},
				}),
				contentType: "video/mp4",
				size: item.byteLength,
				etag: '"1"',
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
}

async function setupTestApp(options?: {
	getZoomClient?: () => ZoomClient;
	getRecordingStore?: AppDeps["getRecordingStore"];
	now?: AppDeps["now"];
}) {
	const client = createClient({ url: "file::memory:" });
	let maxBoundParams = 0;
	const origExecute = client.execute.bind(client);
	const origBatch = client.batch.bind(client);
	client.execute = async (stmt: InStatement, args?: InArgs) => {
		const count = countBindParams(stmt, args);
		if (count > maxBoundParams) maxBoundParams = count;
		return typeof stmt === "string"
			? origExecute(stmt, args)
			: origExecute(stmt);
	};
	client.batch = async (stmts, mode) => {
		for (const stmt of stmts) {
			const count = countBindParams(stmt);
			if (count > maxBoundParams) maxBoundParams = count;
		}
		return origBatch(stmts, mode);
	};
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
		getZoomClient: options?.getZoomClient,
		getRecordingStore: options?.getRecordingStore,
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

	async function getOrgIdForUser(userId: string): Promise<string> {
		const [mem] = await libsql
			.select({ orgId: schema.membership.orgId })
			.from(schema.membership)
			.where(eq(schema.membership.userId, userId))
			.limit(1);
		if (!mem) throw new Error("org not bootstrapped");
		return mem.orgId;
	}

	async function addTaToTeacherOrg(
		teacherUserId: string,
		taName = "TA User",
	): Promise<{ id: string; token: string }> {
		const orgId = await getOrgIdForUser(teacherUserId);
		const ta = await insertUser(taName, "teacher");
		await libsql.insert(schema.membership).values({
			id: crypto.randomUUID(),
			orgId,
			userId: ta.id,
			role: "ta",
		});
		return ta;
	}

	function resetMaxBoundParams() {
		maxBoundParams = 0;
	}

	function getMaxBoundParams() {
		return maxBoundParams;
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
		getOrgIdForUser,
		addTaToTeacherOrg,
		resetMaxBoundParams,
		getMaxBoundParams,
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

	test("5. locks schedule and sessionsTotal once real sessions exist (409 CLASS_SCHEDULE_LOCKED) and locks startDate once class has started (409 CLASS_START_DATE_LOCKED)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Lock");
		const startMonday = futureMondayISO(7);
		const nextStart = addDaysISO(startMonday, 14);

		// (a) Auto class with materialized upcoming lessons: schedule and sessionsTotal stay locked (409 CLASS_SCHEDULE_LOCKED)
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
			{ ...baseAuto, sessionsTotal: 10 },
			// Combining schedule + startDate still rejects atomically with CLASS_SCHEDULE_LOCKED
			{
				...baseAuto,
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				startDate: nextStart,
			},
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

		// Once any lesson has started (completed / absent / attendance / attendanceNote / manual cancelled), changing startDate returns 409 CLASS_START_DATE_LOCKED
		const firstLessons = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, autoClassId));
		const firstLessonId = firstLessons[0]?.id ?? "";
		expect(firstLessonId).toBeTruthy();

		const startedMutations: Array<Partial<typeof schema.lesson.$inferInsert>> =
			[
				{ status: "completed", attendance: null, attendanceNote: null },
				{ status: "absent", attendance: null, attendanceNote: null },
				{ status: "upcoming", attendance: "present", attendanceNote: null },
				{ status: "upcoming", attendance: null, attendanceNote: "Đi muộn" },
				{ status: "cancelled", attendance: null, attendanceNote: null },
			];

		for (const patch of startedMutations) {
			await t.libsql
				.update(schema.lesson)
				.set(patch)
				.where(eq(schema.lesson.id, firstLessonId));

			const res = await t.call(teacher.token, `/api/classes/${autoClassId}`, {
				method: "PATCH",
				body: { ...baseAuto, startDate: nextStart },
			});
			expect(res.status).toBe(409);
			expect(await res.json()).toMatchObject({
				code: CLASS_ERROR_CODES.START_DATE_LOCKED,
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

		// (b) Manual class with class_session row: schedule & sessionsTotal stay locked (409 CLASS_SCHEDULE_LOCKED)
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

	test("8. reschedules unstarted auto class with active students (overlapping shift, past original startDate, silent notifications, and late enrollment parity)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Unstarted Auto");
		const startMonday = futureMondayISO(7);
		const schedule = { days: [0, 2], start: "19:00", end: "20:30" };
		const scheduleJson = JSON.stringify(schedule);

		const classId = await t.createAutoClass(teacher.token, {
			name: "IELTS Unstarted Auto",
			schedule,
			sessionsTotal: 4,
			startDate: startMonday,
		});

		for (const idx of [1, 2]) {
			const res = await t.call(teacher.token, "/api/students", {
				body: {
					name: `HV Auto ${idx}`,
					email: `hv-auto-${idx}@test.local`,
					classId,
					activateNow: true,
				},
			});
			expect(res.status).toBe(201);
		}

		const beforeLessons = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(beforeLessons).toHaveLength(8);
		// Author custom topic and zoom on session 1 to verify preservation across date remap
		await t.libsql
			.update(schema.lesson)
			.set({ topic: "Orientation Day", zoom: "https://zoom.us/j/custom1" })
			.where(
				and(
					eq(schema.lesson.classId, classId),
					eq(schema.lesson.date, startMonday),
				),
			);
		const idsBefore = new Set(beforeLessons.map((l) => l.id));

		// Shift into an overlapping range (Wednesday of the same week -> overlaps Wed & next Mon/Wed)
		const overlapStart = addDaysISO(startMonday, 2);
		const patchOverlap = await t.call(
			teacher.token,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "IELTS Unstarted Auto",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: overlapStart,
				},
			},
		);
		expect(patchOverlap.status).toBe(200);

		const expectedOverlapDates = expectedSkeletonDates(
			scheduleJson,
			overlapStart,
			4,
		);
		const afterOverlap = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(afterOverlap).toHaveLength(8);
		expect(new Set(afterOverlap.map((l) => l.id))).toEqual(idsBefore);
		expect([...new Set(afterOverlap.map((l) => l.date))].sort()).toEqual(
			expectedOverlapDates,
		);
		const movedSession1 = afterOverlap.filter((l) => l.date === overlapStart);
		expect(movedSession1).toHaveLength(2);
		expect(
			movedSession1.every(
				(l) =>
					l.topic === "Orientation Day" &&
					l.zoom === "https://zoom.us/j/custom1" &&
					l.day === 3,
			),
		).toBe(true);

		// Silent edit: no schedule_changed or class_opening_confirmed notification emitted
		const notifs = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.refId, classId));
		expect(notifs).toHaveLength(0);

		// Simulate delayed opening where old startDate is already in the past but 0 lessons started
		const pastStart = addDaysISO(vietnamTodayISO(), -5);
		await t.libsql
			.update(schema.classTable)
			.set({ startDate: pastStart })
			.where(eq(schema.classTable.id, classId));
		const nextStart = addDaysISO(startMonday, 14);
		const patchFromPast = await t.call(
			teacher.token,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "IELTS Unstarted Auto",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: nextStart,
				},
			},
		);
		expect(patchFromPast.status).toBe(200);

		// 3rd student activated AFTER startDate change must get the exact same dates as students 1 & 2
		const lateStudentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Auto 3",
				email: "hv-auto-3@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(lateStudentRes.status).toBe(201);
		const allLessonsAfter3 = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(allLessonsAfter3).toHaveLength(12);
		const expectedFinalDates = expectedSkeletonDates(
			scheduleJson,
			nextStart,
			4,
		);
		const byEnrollment = new Map<string, string[]>();
		for (const row of allLessonsAfter3) {
			const list = byEnrollment.get(row.enrollmentId) ?? [];
			list.push(row.date ?? "");
			byEnrollment.set(row.enrollmentId, list);
		}
		expect(byEnrollment.size).toBe(3);
		for (const dates of byEnrollment.values()) {
			expect(dates.sort()).toEqual(expectedFinalDates);
		}
	});

	test("9. remaps lesson_material and Zoom class_session_meeting on overlapping shifts and handles 0-lesson Online auto-provisioned Zoom classes", async () => {
		let createdSeq = 0;
		const updatedZoomCalls: Array<{
			meetingId: string;
			input: ZoomMeetingInput;
		}> = [];
		const deletedZoomIds: string[] = [];
		const mockZoom: ZoomClient = {
			async createMeeting() {
				createdSeq += 1;
				return {
					meetingId: `zm-${createdSeq}`,
					joinUrl: `https://zoom.us/j/${createdSeq}`,
				};
			},
			async updateMeeting(meetingId, input) {
				updatedZoomCalls.push({ meetingId, input });
			},
			async deleteMeeting(meetingId) {
				deletedZoomIds.push(meetingId);
			},
			async getRecording() {
				return { status: "missing" };
			},
		};

		const t = await setupTestApp({ getZoomClient: () => mockZoom });
		const teacher = await t.insertUser("Teacher Zoom Mat");
		const startMonday = futureMondayISO(7);
		const schedule = { days: [0, 2], start: "19:00", end: "20:30" };

		// (a) Auto class with active student, lesson_material, and Zoom meetings on overlapping dates
		const classId = await t.createAutoClass(teacher.token, {
			name: "Zoom Overlap Class",
			mode: "Online",
			schedule,
			sessionsTotal: 4,
			startDate: startMonday,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const enrollRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Zoom",
				email: "hv-zoom@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(enrollRes.status).toBe(201);

		const matId = crypto.randomUUID();
		await t.libsql.insert(schema.material).values({
			id: matId,
			orgId,
			title: "Slide Buổi 1-2",
			kind: "link",
			url: "https://example.com/slides",
			createdBy: teacher.id,
		});
		const wedSameWeek = addDaysISO(startMonday, 2);
		await t.libsql.insert(schema.lessonMaterial).values([
			{ orgId, classId, date: startMonday, materialId: matId, position: 0 },
			{ orgId, classId, date: wedSameWeek, materialId: matId, position: 0 },
		]);

		updatedZoomCalls.length = 0;
		deletedZoomIds.length = 0;

		const patchRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Zoom Overlap Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: wedSameWeek,
			},
		});
		expect(patchRes.status).toBe(200);

		const nextMon = addDaysISO(startMonday, 7);
		const nextWed = addDaysISO(startMonday, 9);
		const movedMats = await t.libsql
			.select({ date: schema.lessonMaterial.date })
			.from(schema.lessonMaterial)
			.where(eq(schema.lessonMaterial.classId, classId));
		expect(movedMats.map((m) => m.date).sort()).toEqual([wedSameWeek, nextMon]);

		const movedMeetings = await t.libsql
			.select({
				date: schema.classSessionMeeting.date,
				zoomMeetingId: schema.classSessionMeeting.zoomMeetingId,
			})
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.classId, classId));
		expect(movedMeetings.map((m) => m.date).sort()).toEqual([
			wedSameWeek,
			nextMon,
			nextWed,
			addDaysISO(startMonday, 14),
		]);
		expect(updatedZoomCalls).toHaveLength(4);
		expect(updatedZoomCalls.map((c) => c.input.dateISO).sort()).toEqual([
			wedSameWeek,
			nextMon,
			nextWed,
			addDaysISO(startMonday, 14),
		]);

		// (b) 0-lesson Online auto class with 5 auto-provisioned Zoom meetings:
		// simultaneous schedule + sessionsTotal shrink (5 -> 3) + startDate + sessionPackage sync
		const zeroClassId = await t.createAutoClass(teacher.token, {
			name: "Zero Lesson Auto Zoom",
			mode: "Online",
			schedule,
			sessionsTotal: 5,
			startDate: startMonday,
		});
		// Seed a 0-lesson sessionPackage to verify syncPackageTotal runs in Branch B too
		const dummyStudentId = crypto.randomUUID();
		const dummyEnrId = crypto.randomUUID();
		await t.libsql.insert(schema.student).values({
			id: dummyStudentId,
			orgId,
			name: "HV Legacy Pkg",
		});
		await t.libsql.insert(schema.enrollment).values({
			id: dummyEnrId,
			orgId,
			classId: zeroClassId,
			studentId: dummyStudentId,
			status: "invited",
		});
		await t.libsql.insert(schema.sessionPackage).values({
			id: crypto.randomUUID(),
			orgId,
			studentId: dummyStudentId,
			enrollmentId: dummyEnrId,
			total: 5,
			price: 0,
			mode: "Online",
			start: "01/12",
			expiry: "",
			status: "active",
		});

		updatedZoomCalls.length = 0;
		deletedZoomIds.length = 0;
		const shiftedStart = addDaysISO(startMonday, 14);
		const shrinkRes = await t.call(
			teacher.token,
			`/api/classes/${zeroClassId}`,
			{
				method: "PATCH",
				body: {
					name: "Zero Lesson Auto Zoom",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					schedule: { days: [1, 3], start: "18:00", end: "19:30" },
					sessionsTotal: 3,
					startDate: shiftedStart,
				},
			},
		);
		expect(shrinkRes.status).toBe(200);
		const remainingZeroMeetings = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.classId, zeroClassId));
		expect(remainingZeroMeetings).toHaveLength(3);
		expect(updatedZoomCalls).toHaveLength(3);
		expect(updatedZoomCalls.every((c) => c.input.time === "18:00")).toBe(true);
		expect(deletedZoomIds).toHaveLength(2);
		const [syncedPkg] = await t.libsql
			.select({ total: schema.sessionPackage.total })
			.from(schema.sessionPackage)
			.where(eq(schema.sessionPackage.enrollmentId, dummyEnrId));
		expect(syncedPkg?.total).toBe(3);

		// Clearing startDate to "" on 0-lesson Online class succeeds (200) and cleans remaining Zoom meetings
		deletedZoomIds.length = 0;
		const clearRes = await t.call(
			teacher.token,
			`/api/classes/${zeroClassId}`,
			{
				method: "PATCH",
				body: {
					name: "Zero Lesson Auto Zoom",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: "",
				},
			},
		);
		expect(clearRes.status).toBe(200);
		expect(deletedZoomIds).toHaveLength(3);
		expect(
			await t.libsql
				.select()
				.from(schema.classSessionMeeting)
				.where(eq(schema.classSessionMeeting.classId, zeroClassId)),
		).toHaveLength(0);
	});

	test("10. unwinds chained holiday shifts & holiday-cancelled makeups cleanly without ghost lessons and cleans Zoom on newly hit holiday cancels", async () => {
		let createdSeq = 0;
		const deletedZoomIds: string[] = [];
		const updatedZoomCalls: Array<{
			meetingId: string;
			input: ZoomMeetingInput;
		}> = [];
		const mockZoom: ZoomClient = {
			async createMeeting() {
				createdSeq += 1;
				return {
					meetingId: `zm-h-${createdSeq}`,
					joinUrl: `https://zoom.us/j/h${createdSeq}`,
				};
			},
			async updateMeeting(meetingId, input) {
				updatedZoomCalls.push({ meetingId, input });
			},
			async deleteMeeting(meetingId) {
				deletedZoomIds.push(meetingId);
			},
			async getRecording() {
				return { status: "missing" };
			},
		};

		const t = await setupTestApp({ getZoomClient: () => mockZoom });
		const teacher = await t.insertUser("Teacher Holiday Chain");
		const startMonday = futureMondayISO(7);
		const schedule = { days: [0, 2], start: "19:00", end: "20:30" };

		// Class with 2 sessions: Mon1 (startMonday), Wed1 (startMonday+2)
		const classId = await t.createAutoClass(teacher.token, {
			name: "Holiday Chain Class",
			mode: "Online",
			schedule,
			sessionsTotal: 2,
			startDate: startMonday,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		const sRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Holiday",
				email: "hv-holiday@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(sRes.status).toBe(201);

		// Create holiday chain:
		// H1 (shift): Mon1 -> Mon2 (startMonday+7)
		// H2 (shift): Mon2 -> Wed2 (startMonday+9)
		// H3 (cancel): Wed2 cancelled AND future target date (startMonday+14) cancelled
		const mon2 = addDaysISO(startMonday, 7);
		const wed2 = addDaysISO(startMonday, 9);
		const mon3 = addDaysISO(startMonday, 14);
		const wed3 = addDaysISO(startMonday, 16);

		const h1Id = crypto.randomUUID();
		const h2Id = crypto.randomUUID();
		const h3Id = crypto.randomUUID();
		const hNewCancelId = crypto.randomUUID();
		const sameTs = new Date();
		await t.libsql.insert(schema.organizationHoliday).values([
			{
				id: h1Id,
				orgId,
				name: "Nghỉ lễ 1",
				fromDate: startMonday,
				toDate: startMonday,
				scope: "org",
				mode: "shift",
				createdByUserId: teacher.id,
				createdAt: sameTs,
			},
			{
				id: h2Id,
				orgId,
				name: "Nghỉ lễ 2",
				fromDate: mon2,
				toDate: mon2,
				scope: "org",
				mode: "shift",
				createdByUserId: teacher.id,
				createdAt: sameTs,
			},
			{
				id: h3Id,
				orgId,
				name: "Nghỉ hủy 3",
				fromDate: wed2,
				toDate: wed2,
				scope: "org",
				mode: "cancel",
				createdByUserId: teacher.id,
				createdAt: sameTs,
			},
			{
				id: hNewCancelId,
				orgId,
				name: "Nghỉ hủy tuần 3",
				fromDate: mon3,
				toDate: mon3,
				scope: "org",
				mode: "cancel",
				createdByUserId: teacher.id,
				createdAt: sameTs,
			},
		]);

		// Simulate chained shifts + cancelled tip makeup in DB (with reverse UUID order to prove topological sort)
		const [existingEnr] = await t.libsql
			.select({ id: schema.enrollment.id })
			.from(schema.enrollment)
			.where(eq(schema.enrollment.classId, classId));
		const enrId = existingEnr?.id ?? "";
		await t.libsql
			.update(schema.lesson)
			.set({ status: "holiday", zoom: "" })
			.where(
				and(
					eq(schema.lesson.classId, classId),
					eq(schema.lesson.date, startMonday),
				),
			);
		await t.libsql.insert(schema.lesson).values([
			{
				id: crypto.randomUUID(),
				orgId,
				classId,
				enrollmentId: enrId,
				day: 1,
				time: "19:00",
				dur: 90,
				date: mon2,
				status: "holiday",
				topic: "",
				zoom: "",
			},
			{
				id: crypto.randomUUID(),
				orgId,
				classId,
				enrollmentId: enrId,
				day: 3,
				time: "19:00",
				dur: 90,
				date: wed2,
				status: "cancelled",
				topic: "",
				zoom: "",
			},
		]);
		await t.libsql.insert(schema.holidaySessionShift).values([
			{
				id: "0000-tip-first",
				orgId,
				holidayId: h2Id,
				classId,
				originalDate: mon2,
				makeupDate: wed2,
				createdAt: sameTs,
			},
			{
				id: "zzzz-root-second",
				orgId,
				holidayId: h1Id,
				classId,
				originalDate: startMonday,
				makeupDate: mon2,
				createdAt: sameTs,
			},
		]);
		await t.libsql.insert(schema.holidaySessionCancel).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId: h3Id,
			classId,
			date: wed2,
			createdAt: sameTs,
		});
		// Move session 1's Zoom meeting to wed2 so unwind must bring it back, then newCancel on mon3 must cancel it
		await t.libsql
			.update(schema.classSessionMeeting)
			.set({ date: wed2 })
			.where(
				and(
					eq(schema.classSessionMeeting.classId, classId),
					eq(schema.classSessionMeeting.date, startMonday),
				),
			);

		deletedZoomIds.length = 0;
		updatedZoomCalls.length = 0;

		// Shift startDate to mon3 -> Session 1 lands on mon3 (hits hNewCancelId cancel), Session 2 lands on wed3 (upcoming)
		const res = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Holiday Chain Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: mon3,
			},
		});
		expect(res.status).toBe(200);

		const lessonsAfter = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		// Exactly 2 sessions (NO ghost lessons from mon2 or wed2!)
		expect(lessonsAfter).toHaveLength(2);
		const byDate = new Map(lessonsAfter.map((l) => [l.date, l]));
		expect(byDate.get(mon3)?.status).toBe("cancelled");
		expect(byDate.get(mon3)?.zoom).toBe("");
		expect(byDate.get(wed3)?.status).toBe("upcoming");
		expect(byDate.get(wed3)?.zoom).toContain("https://zoom.us/j/h");

		// Old shifts gone; only hNewCancelId cancel exists on mon3
		expect(
			await t.libsql
				.select()
				.from(schema.holidaySessionShift)
				.where(eq(schema.holidaySessionShift.classId, classId)),
		).toHaveLength(0);
		const cancelsAfter = await t.libsql
			.select()
			.from(schema.holidaySessionCancel)
			.where(eq(schema.holidaySessionCancel.classId, classId));
		expect(cancelsAfter.map((c) => c.date)).toEqual([mon3]);

		// Zoom meeting that landed on cancelled mon3 was cleared & deleted on Zoom API; wed3 meeting updated
		const [mon3Meeting] = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(
				and(
					eq(schema.classSessionMeeting.classId, classId),
					eq(schema.classSessionMeeting.date, mon3),
				),
			);
		expect(mon3Meeting?.zoomMeetingId).toBeNull();
		expect(mon3Meeting?.joinUrl).toBe("");
		expect(deletedZoomIds).toHaveLength(1);
		expect(updatedZoomCalls.map((c) => c.input.dateISO)).toEqual([wed3]);
	});

	test("11. updates startDate metadata on unstarted manual class without modifying manual class_session or lesson dates", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Manual StartDate");
		const startMonday = futureMondayISO(7);
		const sessionDate = addDaysISO(startMonday, 2);
		const nextStart = addDaysISO(startMonday, 14);

		const manualId = await t.createAutoClass(teacher.token, {
			name: "Manual Unstarted",
			schedulingMode: "manual",
			startDate: startMonday,
		});
		const csRes = await t.call(
			teacher.token,
			`/api/classes/${manualId}/sessions`,
			{
				body: {
					date: sessionDate,
					time: "18:00",
					dur: 90,
					topic: "Buổi thủ công 1",
				},
			},
		);
		expect(csRes.status).toBe(201);
		const stRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Manual",
				email: "hv-manual@test.local",
				classId: manualId,
				activateNow: true,
			},
		});
		expect(stRes.status).toBe(201);

		const patchRes = await t.call(teacher.token, `/api/classes/${manualId}`, {
			method: "PATCH",
			body: {
				name: "Manual Unstarted",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: nextStart,
			},
		});
		expect(patchRes.status).toBe(200);

		const snap = await t.kernel(teacher.token);
		expect(snap.classes.find((c) => c.id === manualId)?.startDate).toBe(
			nextStart,
		);
		const csRows = await t.libsql
			.select({ date: schema.classSession.date })
			.from(schema.classSession)
			.where(eq(schema.classSession.classId, manualId));
		expect(csRows.map((r) => r.date)).toEqual([sessionDate]);
		const lessonRows = await t.libsql
			.select({ date: schema.lesson.date })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, manualId));
		expect(lessonRows.map((r) => r.date)).toEqual([sessionDate]);

		// Once manual lesson is marked completed -> startDate locks with 409 CLASS_START_DATE_LOCKED
		await t.libsql
			.update(schema.lesson)
			.set({ status: "completed" })
			.where(eq(schema.lesson.classId, manualId));
		const lockedRes = await t.call(teacher.token, `/api/classes/${manualId}`, {
			method: "PATCH",
			body: {
				name: "Manual Unstarted",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: addDaysISO(nextStart, 7),
			},
		});
		expect(lockedRes.status).toBe(409);
		expect(await lockedRes.json()).toMatchObject({
			code: CLASS_ERROR_CODES.START_DATE_LOCKED,
		});
	});

	test("12. enforces empty startDate (400), past startDate (400), legacy undated (409), diverged enrollments (409), and TA role forbidden (403)", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Guards");
		const startMonday = futureMondayISO(7);
		const nextStart = addDaysISO(startMonday, 14);

		const classId = await t.createAutoClass(teacher.token, {
			name: "Guarded Auto Class",
			schedule: { days: [0, 2], start: "19:00", end: "20:30" },
			sessionsTotal: 2,
			startDate: startMonday,
		});
		const ta = await t.addTaToTeacherOrg(teacher.id);

		const st1Res = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Guard 1",
				email: "hv-guard-1@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(st1Res.status).toBe(201);

		const base = {
			name: "Guarded Auto Class",
			type: "ielts",
			level: "Band 6.0",
			skills: ["Writing", "Speaking"],
			mode: "Online",
		};

		// TA cannot change startDate -> 403 FORBIDDEN
		const taRes = await t.call(ta.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: { ...base, startDate: nextStart },
		});
		expect(taRes.status).toBe(403);
		expect(await taRes.json()).toMatchObject({ code: "FORBIDDEN" });

		// Empty startDate on auto class with lessons -> 400
		const emptyRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: { ...base, startDate: "" },
		});
		expect(emptyRes.status).toBe(400);

		// Past startDate -> 400
		const pastRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: { ...base, startDate: addDaysISO(vietnamTodayISO(), -1) },
		});
		expect(pastRes.status).toBe(400);

		// Diverged enrollments after moveDate + activating 2nd student -> 409 CLASS_START_DATE_LOCKED
		const movedDate = addDaysISO(startMonday, 1);
		const moveRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/sessions/${startMonday}/edit`,
			{ body: { moveDate: movedDate } },
		);
		expect(moveRes.status).toBe(200);
		const st2Res = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Guard 2",
				email: "hv-guard-2@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(st2Res.status).toBe(201);

		const divergedRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: { ...base, startDate: nextStart },
		});
		expect(divergedRes.status).toBe(409);
		expect(await divergedRes.json()).toMatchObject({
			code: CLASS_ERROR_CODES.START_DATE_LOCKED,
		});

		// Legacy undated lesson (date: null) -> 409 CLASS_START_DATE_LOCKED
		const legacyClassId = await t.createAutoClass(teacher.token, {
			name: "Legacy Undated Class",
			schedule: { days: [0], start: "19:00", end: "20:30" },
			sessionsTotal: 2,
			startDate: startMonday,
		});
		await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Legacy",
				email: "hv-legacy@test.local",
				classId: legacyClassId,
				activateNow: true,
			},
		});
		await t.libsql
			.update(schema.lesson)
			.set({ date: null })
			.where(eq(schema.lesson.classId, legacyClassId));
		const legacyRes = await t.call(
			teacher.token,
			`/api/classes/${legacyClassId}`,
			{
				method: "PATCH",
				body: { ...base, name: "Legacy Undated Class", startDate: nextStart },
			},
		);
		expect(legacyRes.status).toBe(409);
		expect(await legacyRes.json()).toMatchObject({
			code: CLASS_ERROR_CODES.START_DATE_LOCKED,
		});
	});

	test("13. allows rescheduling paused unstarted class via PATCH without applying new org holidays created while paused", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Paused Reschedule");
		const startMonday = futureMondayISO(7);
		const nextStart = addDaysISO(startMonday, 14);

		const classId = await t.createAutoClass(teacher.token, {
			name: "Paused Unstarted Class",
			schedule: { days: [0, 2], start: "19:00", end: "20:30" },
			sessionsTotal: 2,
			startDate: startMonday,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);
		await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Paused",
				email: "hv-paused@test.local",
				classId,
				activateNow: true,
			},
		});

		// Pause the class
		const pauseRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/status`,
			{ body: { status: "paused" } },
		);
		expect(pauseRes.status).toBe(200);

		// Create an org holiday covering nextStart while the class is paused
		await t.libsql.insert(schema.organizationHoliday).values({
			id: crypto.randomUUID(),
			orgId,
			name: "Nghỉ lễ khi lớp đang tạm dừng",
			fromDate: nextStart,
			toDate: nextStart,
			scope: "org",
			mode: "shift",
			createdByUserId: teacher.id,
		});

		const patchRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Paused Unstarted Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: nextStart,
			},
		});
		expect(patchRes.status).toBe(200);

		// Lessons moved cleanly to [nextStart, nextStart+2], and NO holiday shift was newly applied to the paused class
		const lessons = await t.libsql
			.select({ date: schema.lesson.date, status: schema.lesson.status })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(lessons).toHaveLength(2);
		expect(lessons.every((l) => l.status === "upcoming")).toBe(true);
		expect(lessons.map((l) => l.date).sort()).toEqual([
			nextStart,
			addDaysISO(nextStart, 2),
		]);
		expect(
			await t.libsql
				.select()
				.from(schema.holidaySessionShift)
				.where(eq(schema.holidaySessionShift.classId, classId)),
		).toHaveLength(0);
	});

	test("14. handles 52-session class with holiday shift, materials, and Zoom meetings while keeping every SQL statement <= 100 bound parameters", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher 52 Sessions");
		const startMonday = futureMondayISO(7);
		const schedule = { days: [0, 2], start: "19:00", end: "20:30" };
		const scheduleJson = JSON.stringify(schedule);

		const classId = await t.createAutoClass(teacher.token, {
			name: "Max 52 Sessions Class",
			schedule,
			sessionsTotal: 52,
			startDate: startMonday,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);

		await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV 52",
				email: "hv-52@test.local",
				classId,
				activateNow: true,
			},
		});

		// Seed materials and meetings across all 52 dates to stress-test every chunked statement
		const initialDates = expectedSkeletonDates(scheduleJson, startMonday, 52);
		const matId = crypto.randomUUID();
		await t.libsql.insert(schema.material).values({
			id: matId,
			orgId,
			title: "Tài liệu 52 buổi",
			kind: "link",
			url: "https://example.com/52",
			createdBy: teacher.id,
		});
		for (const d of initialDates) {
			await t.libsql.insert(schema.lessonMaterial).values({
				orgId,
				classId,
				date: d,
				materialId: matId,
				position: 0,
			});
			await t.libsql.insert(schema.classSessionMeeting).values({
				id: crypto.randomUUID(),
				orgId,
				classId,
				date: d,
				joinUrl: `https://zoom.us/j/${d}`,
			});
		}

		// Add a holiday on date 0 so unwind + re-apply also execute under 52 sessions
		const hId = crypto.randomUUID();
		const nextStart = addDaysISO(startMonday, 7);
		await t.libsql.insert(schema.organizationHoliday).values({
			id: hId,
			orgId,
			name: "Lễ test 52",
			fromDate: startMonday,
			toDate: startMonday,
			scope: "org",
			mode: "shift",
			createdByUserId: teacher.id,
		});
		const [enr] = await t.libsql
			.select({ id: schema.enrollment.id })
			.from(schema.enrollment)
			.where(eq(schema.enrollment.classId, classId));
		const extraMakeup = addDaysISO(initialDates[51] ?? startMonday, 5);
		await t.libsql
			.update(schema.lesson)
			.set({ status: "holiday" })
			.where(
				and(
					eq(schema.lesson.classId, classId),
					eq(schema.lesson.date, startMonday),
				),
			);
		await t.libsql.insert(schema.lesson).values({
			id: crypto.randomUUID(),
			orgId,
			classId,
			enrollmentId: enr?.id ?? "",
			day: 1,
			time: "19:00",
			dur: 90,
			date: extraMakeup,
			status: "upcoming",
			topic: "",
			zoom: "",
		});
		await t.libsql.insert(schema.holidaySessionShift).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId: hId,
			classId,
			originalDate: startMonday,
			makeupDate: extraMakeup,
		});

		t.resetMaxBoundParams();
		const res = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Max 52 Sessions Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: nextStart,
			},
		});
		expect(res.status).toBe(200);
		expect(t.getMaxBoundParams()).toBeGreaterThan(0);
		expect(t.getMaxBoundParams()).toBeLessThanOrEqual(100);

		const expectedNewDates = expectedSkeletonDates(scheduleJson, nextStart, 52);
		const lessonsAfter = await t.libsql
			.select({ date: schema.lesson.date })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		expect(lessonsAfter.map((l) => l.date).sort()).toEqual(expectedNewDates);
		const matsAfter = await t.libsql
			.select({ date: schema.lessonMaterial.date })
			.from(schema.lessonMaterial)
			.where(eq(schema.lessonMaterial.classId, classId));
		expect(matsAfter.map((m) => m.date).sort()).toEqual(expectedNewDates);
		const meetingsAfter = await t.libsql
			.select({ date: schema.classSessionMeeting.date })
			.from(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.classId, classId));
		expect(meetingsAfter.map((m) => m.date).sort()).toEqual(expectedNewDates);
	});

	test("15. clears resurrected stale lesson.zoom after holiday-shift unwind and survives concurrent activation CAS retry", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Unwind Race");
		const startMonday = futureMondayISO(14);
		const mon3 = addDaysISO(startMonday, 14);
		const mon4 = addDaysISO(startMonday, 21);

		// Part A: holiday row still carries stale lesson.zoom while makeup meeting joinUrl was cleared to ""
		const classId = await t.createAutoClass(teacher.token, {
			name: "Stale Zoom Unwind",
			schedule: { days: [0], start: "19:00", end: "20:30" },
			startDate: startMonday,
			sessionsTotal: 2,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);
		await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Unwind 1",
				email: "hv-unwind-1@test.local",
				classId,
				activateNow: true,
			},
		});
		const [enr1Row] = await t.libsql
			.select({ id: schema.enrollment.id })
			.from(schema.enrollment)
			.where(eq(schema.enrollment.classId, classId));
		const enr1 = enr1Row?.id ?? "";
		expect(enr1).toBeTruthy();

		const holId = crypto.randomUUID();
		await t.libsql.insert(schema.organizationHoliday).values({
			id: holId,
			orgId,
			name: "Lễ 1",
			fromDate: startMonday,
			toDate: startMonday,
			scope: "classes",
			mode: "shift",
			createdByUserId: teacher.id,
		});
		await t.libsql.insert(schema.organizationHolidayClass).values({
			id: crypto.randomUUID(),
			holidayId: holId,
			classId,
		});
		// Simulate shifted session where old holiday lesson retained dead zoom URL and makeup meeting was cleared
		await t.libsql
			.update(schema.lesson)
			.set({ status: "holiday", zoom: "https://zoom.us/j/dead-old-link" })
			.where(
				and(
					eq(schema.lesson.classId, classId),
					eq(schema.lesson.date, startMonday),
				),
			);
		await t.libsql.insert(schema.lesson).values({
			id: crypto.randomUUID(),
			orgId,
			classId,
			enrollmentId: enr1,
			day: 1,
			time: "19:00",
			dur: 90,
			date: mon3,
			status: "upcoming",
			topic: "",
			zoom: "",
		});
		await t.libsql.insert(schema.holidaySessionShift).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId: holId,
			classId,
			originalDate: startMonday,
			makeupDate: mon3,
		});
		await t.libsql.insert(schema.classSessionMeeting).values({
			id: crypto.randomUUID(),
			orgId,
			classId,
			date: mon3,
			zoomMeetingId: "",
			joinUrl: "",
		});

		const unwindRes = await t.call(teacher.token, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Stale Zoom Unwind",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: mon4,
			},
		});
		expect(unwindRes.status).toBe(200);
		const lessonsAfterUnwind = await t.libsql
			.select({ date: schema.lesson.date, zoom: schema.lesson.zoom })
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		const byDate = new Map(lessonsAfterUnwind.map((r) => [r.date, r.zoom]));
		// Must NOT resurrect "https://zoom.us/j/dead-old-link"
		expect(byDate.get(mon4)).toBe("");

		// Part B: Concurrent PATCH startDate-only vs enrollment activation keeps all enrollments aligned
		const createSt2 = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Race 2",
				email: "hv-race-2@test.local",
				classId,
				activateNow: false,
			},
		});
		expect(createSt2.status).toBe(201);
		const enrs = await t.libsql
			.select({ id: schema.enrollment.id })
			.from(schema.enrollment)
			.where(eq(schema.enrollment.classId, classId));
		const enr2 = enrs.find((e) => e.id !== enr1)?.id ?? "";
		expect(enr2).toBeTruthy();

		const mon5 = addDaysISO(mon4, 7);
		const [patchRes, acceptRes] = await Promise.all([
			t.call(teacher.token, `/api/classes/${classId}`, {
				method: "PATCH",
				body: {
					name: "Stale Zoom Unwind",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: mon5,
				},
			}),
			t.call(teacher.token, `/api/enrollments/${enr2}/accept`, {
				method: "POST",
				body: {},
			}),
		]);
		expect(patchRes.status).toBe(200);
		expect(acceptRes.status).toBe(200);

		const finalLessons = await t.libsql
			.select({
				enrollmentId: schema.lesson.enrollmentId,
				date: schema.lesson.date,
			})
			.from(schema.lesson)
			.where(eq(schema.lesson.classId, classId));
		const enr1Dates = finalLessons
			.filter((r) => r.enrollmentId === enr1)
			.map((r) => r.date)
			.sort();
		const enr2Dates = finalLessons
			.filter((r) => r.enrollmentId === enr2)
			.map((r) => r.date)
			.sort();
		const expectedFinal = [mon5, addDaysISO(mon5, 7)];
		expect(enr1Dates).toEqual(expectedFinal);
		expect(enr2Dates).toEqual(expectedFinal);
	});

	test("16. protects live R2 recordings across surplusOldDates, Pass 1.5, buildMeetingMovePair, and confirm-opening while cleaning expired objects and preserving safe shifts/cancels", async () => {
		const store = createMemoryRecordingStore();
		const fixedNow = new Date("2026-12-01T10:00:00Z");
		const t = await setupTestApp({
			getRecordingStore: () => store,
			now: () => fixedNow,
		});
		const teacher = await t.insertUser("Teacher R2 Reschedule");
		const startMonday = futureMondayISO(10);
		const schedule = { days: [0, 2], start: "19:00", end: "20:30" };
		const dates4 = expectedSkeletonDates(
			JSON.stringify(schedule),
			startMonday,
			4,
		);
		const [d1, , d3, d4] = dates4 as [string, string, string, string];

		// (a) Projected 0-lesson class: surplusOldDates (shrink 4 -> 2, and clear startDate: "")
		const projId = await t.createAutoClass(teacher.token, {
			name: "Proj R2 Class",
			mode: "Online",
			schedule,
			sessionsTotal: 4,
			startDate: startMonday,
		});
		const orgId = await t.getOrgIdForUser(teacher.id);
		const surplusKey = `org/${projId}/${d4}/surplus.mp4`;
		store.objects.set(surplusKey, new Uint8Array([1, 2, 3]));
		await t.libsql.insert(schema.classSessionMeeting).values({
			id: "m-proj-surplus",
			orgId,
			classId: projId,
			date: d4,
			joinUrl: "",
			recordingStatus: "ready",
			recordingStorageKey: surplusKey,
			recordingExpiresAt: new Date(fixedNow.getTime() + 60_000),
		});

		const shrinkBlocked = await t.call(
			teacher.token,
			`/api/classes/${projId}`,
			{
				method: "PATCH",
				body: {
					name: "Proj R2 Class",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					sessionsTotal: 2,
					startDate: addDaysISO(startMonday, 7),
				},
			},
		);
		expect(shrinkBlocked.status).toBe(409);
		expect(await shrinkBlocked.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.LOCKED,
		});
		expect(store.objects.has(surplusKey)).toBe(true);

		const clearBlocked = await t.call(teacher.token, `/api/classes/${projId}`, {
			method: "PATCH",
			body: {
				name: "Proj R2 Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: "",
			},
		});
		expect(clearBlocked.status).toBe(409);
		expect(await clearBlocked.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.LOCKED,
		});
		expect(store.objects.has(surplusKey)).toBe(true);

		// Expire surplus -> shrink succeeds 200 and cleans expired R2 even without Zoom configured
		await t.libsql
			.update(schema.classSessionMeeting)
			.set({ recordingExpiresAt: new Date(fixedNow.getTime() - 1000) })
			.where(eq(schema.classSessionMeeting.id, "m-proj-surplus"));
		const shrinkOk = await t.call(teacher.token, `/api/classes/${projId}`, {
			method: "PATCH",
			body: {
				name: "Proj R2 Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				sessionsTotal: 2,
				startDate: addDaysISO(startMonday, 7),
			},
		});
		expect(shrinkOk.status).toBe(200);
		expect(store.objects.has(surplusKey)).toBe(false);

		// (b) Materialized class: Pass 1.5 collision (unmapped leftover live R2 on newDate) + confirm-opening
		const matId = await t.createAutoClass(teacher.token, {
			name: "Mat R2 Class",
			mode: "Online",
			schedule,
			sessionsTotal: 2,
			startDate: startMonday,
		});
		const enrollMat = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Mat R2",
				email: "hv-mat-r2@test.local",
				classId: matId,
				activateNow: true,
			},
		});
		expect(enrollMat.status).toBe(201);

		// Safe live R2 on d1, plus leftover live R2 on d3 (target of moving d1 -> d3)
		const safeKey = `org/${matId}/${d1}/safe.mp4`;
		const pass15Key = `org/${matId}/${d3}/pass15.mp4`;
		store.objects.set(safeKey, new Uint8Array([4, 5]));
		store.objects.set(pass15Key, new Uint8Array([6, 7]));
		await t.libsql.insert(schema.classSessionMeeting).values([
			{
				id: "m-mat-safe",
				orgId,
				classId: matId,
				date: d1,
				joinUrl: "",
				recordingStatus: "ready",
				recordingStorageKey: safeKey,
				recordingExpiresAt: new Date(fixedNow.getTime() + 60_000),
			},
			{
				id: "m-mat-pass15",
				orgId,
				classId: matId,
				date: d3,
				joinUrl: "",
				recordingStatus: "ready",
				recordingStorageKey: pass15Key,
				recordingExpiresAt: new Date(fixedNow.getTime() + 60_000),
			},
		]);

		const pass15Blocked = await t.call(teacher.token, `/api/classes/${matId}`, {
			method: "PATCH",
			body: {
				name: "Mat R2 Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: d3,
			},
		});
		expect(pass15Blocked.status).toBe(409);
		expect(await pass15Blocked.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.LOCKED,
		});
		expect(store.objects.has(pass15Key)).toBe(true);

		// POST /confirm-opening hitting same live R2 -> 409 RECORDING_LOCKED
		const confirmBlocked = await t.call(
			teacher.token,
			`/api/classes/${matId}/confirm-opening`,
			{
				body: {
					mode: "initial",
					startDate: d3,
					note: "",
					expectedVersion: 0,
				},
			},
		);
		expect(confirmBlocked.status).toBe(409);
		expect(await confirmBlocked.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.LOCKED,
		});

		// Expire Pass 1.5 blocker -> shift d1 -> d3 succeeds, cleans pass15Key, moves safeKey cleanly to d3
		await t.libsql
			.update(schema.classSessionMeeting)
			.set({ recordingExpiresAt: new Date(fixedNow.getTime() - 1000) })
			.where(eq(schema.classSessionMeeting.id, "m-mat-pass15"));
		const matShiftOk = await t.call(teacher.token, `/api/classes/${matId}`, {
			method: "PATCH",
			body: {
				name: "Mat R2 Class",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				startDate: d3,
			},
		});
		expect(matShiftOk.status).toBe(200);
		expect(store.objects.has(pass15Key)).toBe(false);
		expect(store.objects.has(safeKey)).toBe(true);
		const movedSafe = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(
				and(
					eq(schema.classSessionMeeting.classId, matId),
					eq(schema.classSessionMeeting.date, d3),
				),
			);
		expect(movedSafe.map((r) => r.recordingStorageKey)).toEqual([safeKey]);

		// (c) Holiday shift Step A unwind collision via buildMeetingMovePair & Step C newCancels preserve
		const holClassId = await t.createAutoClass(teacher.token, {
			name: "Hol R2 Class",
			mode: "Online",
			schedule,
			sessionsTotal: 2,
			startDate: startMonday,
		});
		const enrollHol = await t.call(teacher.token, "/api/students", {
			body: {
				name: "HV Hol R2",
				email: "hv-hol-r2@test.local",
				classId: holClassId,
				activateNow: true,
			},
		});
		expect(enrollHol.status).toBe(201);
		// Shift d1 -> d3; place live meeting at d3 AND leftover live R2 at d1 so unwind (d3 -> d1) collides!
		const hShiftId = crypto.randomUUID();
		await t.libsql.insert(schema.organizationHoliday).values({
			id: hShiftId,
			orgId,
			name: "Lễ shift R2",
			fromDate: d1,
			toDate: d1,
			scope: "classes",
			mode: "shift",
			createdByUserId: teacher.id,
		});
		await t.libsql.insert(schema.organizationHolidayClass).values({
			id: crypto.randomUUID(),
			holidayId: hShiftId,
			classId: holClassId,
		});
		await t.libsql
			.update(schema.lesson)
			.set({ status: "holiday" })
			.where(
				and(eq(schema.lesson.classId, holClassId), eq(schema.lesson.date, d1)),
			);
		const [holEnr] = await t.libsql
			.select({ id: schema.enrollment.id })
			.from(schema.enrollment)
			.where(eq(schema.enrollment.classId, holClassId));
		await t.libsql.insert(schema.lesson).values({
			id: crypto.randomUUID(),
			orgId,
			classId: holClassId,
			enrollmentId: holEnr?.id ?? "",
			day: 1,
			time: "19:00",
			dur: 90,
			date: d3,
			status: "upcoming",
			topic: "",
			zoom: "",
		});
		await t.libsql.insert(schema.holidaySessionShift).values({
			id: crypto.randomUUID(),
			orgId,
			holidayId: hShiftId,
			classId: holClassId,
			originalDate: d1,
			makeupDate: d3,
		});
		const unwindTargetKey = `org/${holClassId}/${d1}/unwind-target.mp4`;
		const makeupSrcKey = `org/${holClassId}/${d3}/makeup-src.mp4`;
		store.objects.set(unwindTargetKey, new Uint8Array([8, 9]));
		store.objects.set(makeupSrcKey, new Uint8Array([10, 11]));
		await t.libsql.insert(schema.classSessionMeeting).values([
			{
				id: "m-hol-unwind-target",
				orgId,
				classId: holClassId,
				date: d1,
				joinUrl: "",
				recordingStatus: "ready",
				recordingStorageKey: unwindTargetKey,
				recordingExpiresAt: new Date(fixedNow.getTime() + 60_000),
			},
			{
				id: "m-hol-makeup-src",
				orgId,
				classId: holClassId,
				date: d3,
				joinUrl: "",
				recordingStatus: "ready",
				recordingStorageKey: makeupSrcKey,
				recordingExpiresAt: new Date(fixedNow.getTime() + 60_000),
			},
		]);

		const unwindBlocked = await t.call(
			teacher.token,
			`/api/classes/${holClassId}`,
			{
				method: "PATCH",
				body: {
					name: "Hol R2 Class",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: addDaysISO(startMonday, 14),
				},
			},
		);
		expect(unwindBlocked.status).toBe(409);
		expect(await unwindBlocked.json()).toMatchObject({
			code: RECORDING_ERROR_CODES.LOCKED,
		});
		expect(store.objects.has(unwindTargetKey)).toBe(true);

		// Remove unwind collision, add a cancel holiday hitting the moved date -> Step C newCancels preserves R2!
		await t.libsql
			.delete(schema.classSessionMeeting)
			.where(eq(schema.classSessionMeeting.id, "m-hol-unwind-target"));
		store.objects.delete(unwindTargetKey);
		const cancelTargetDate = addDaysISO(startMonday, 14);
		const hCancelId = crypto.randomUUID();
		await t.libsql.insert(schema.organizationHoliday).values({
			id: hCancelId,
			orgId,
			name: "Lễ cancel R2",
			fromDate: cancelTargetDate,
			toDate: cancelTargetDate,
			scope: "classes",
			mode: "cancel",
			createdByUserId: teacher.id,
		});
		await t.libsql.insert(schema.organizationHolidayClass).values({
			id: crypto.randomUUID(),
			holidayId: hCancelId,
			classId: holClassId,
		});
		const cancelRescheduleOk = await t.call(
			teacher.token,
			`/api/classes/${holClassId}`,
			{
				method: "PATCH",
				body: {
					name: "Hol R2 Class",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					startDate: cancelTargetDate,
				},
			},
		);
		expect(cancelRescheduleOk.status).toBe(200);
		expect(store.objects.has(makeupSrcKey)).toBe(true);
		const [cancelledRow] = await t.libsql
			.select()
			.from(schema.classSessionMeeting)
			.where(
				and(
					eq(schema.classSessionMeeting.classId, holClassId),
					eq(schema.classSessionMeeting.date, cancelTargetDate),
				),
			);
		expect(cancelledRow?.recordingStorageKey).toBe(makeupSrcKey);
		expect(cancelledRow?.recordingStatus).toBe("ready");
		expect(cancelledRow?.zoomMeetingId).toBeNull();
	});
});
