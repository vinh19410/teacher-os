/**
 * Wave 0 kernel isolation tests — run against the real server handler chain
 * (cors → bootstrap middleware → origin guard → kernel routes) from buildApp.
 *
 * The only seam is the session lookup: tests inject a db-backed reader with
 * Better-Auth cookie semantics (better-auth.session_token → session row →
 * user row, expiry checked) plus test-only user/session inserts.
 */

import { createClient } from "@libsql/client";
import type {
	KernelSnapshot,
	WorkspaceSettings,
} from "@teacher-os/api/contracts";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { assignment } from "@teacher-os/db/schema/assignment";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import { classTable } from "@teacher-os/db/schema/class";
import { commentBank } from "@teacher-os/db/schema/comment-bank";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { lesson } from "@teacher-os/db/schema/lesson";
import { membership } from "@teacher-os/db/schema/membership";
import { notif } from "@teacher-os/db/schema/notif";
import { organization } from "@teacher-os/db/schema/organization";
import { report } from "@teacher-os/db/schema/report";
import { student } from "@teacher-os/db/schema/student";
import { syllabusLesson } from "@teacher-os/db/schema/syllabus";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { generateScheduleLessons } from "./routes/kernel";

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

/** Enrollments are identified by their (classId, studentId) pair on the wire. */
function findEnrollment(
	snapshot: KernelSnapshot,
	classId: string,
	studentId: string,
) {
	return snapshot.enrollments.find(
		(e) => e.classId === classId && e.studentId === studentId,
	);
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

	async function orgIdOf(session: TestSession): Promise<string> {
		let [membershipRow] = await membershipsOf(session.userId);
		if (!membershipRow) {
			await call("/api/readyz", { session });
			[membershipRow] = await membershipsOf(session.userId);
		}
		if (!membershipRow) throw new Error("bootstrap the org before inserting");
		return membershipRow.orgId;
	}

	/**
	 * Wave 4 helper insert: no one-off lesson-create endpoint exists (issue
	 * #55 generates from schedules; manual rows are test-only), so tests seed
	 * scheduled lessons directly — the same way the persist contract is
	 * verified.
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
			zoom?: string;
		},
	): Promise<string> {
		const id = crypto.randomUUID();
		await libsql.insert(lesson).values({
			id,
			orgId: await orgIdOf(session),
			classId: row.classId,
			enrollmentId: row.enrollmentId,
			day: row.day ?? 2,
			time: row.time ?? "19:00",
			dur: row.dur ?? 60,
			type: row.type ?? "1:1",
			status: row.status ?? "upcoming",
			topic: row.topic ?? "Mock test",
			zoom: row.zoom ?? "",
		});
		return id;
	}

	async function insertInvoice(
		session: TestSession,
		row: {
			studentId: string;
			amount?: number;
			status?: string;
			date?: string;
			type?: string;
			method?: string;
			due?: string;
			note?: string;
			enrollmentId?: string;
		},
	): Promise<string> {
		const id = crypto.randomUUID();
		await libsql.insert(invoice).values({
			id,
			orgId: await orgIdOf(session),
			studentId: row.studentId,
			amount: row.amount ?? 400000,
			status: row.status ?? "unpaid",
			date: row.date ?? "19/08",
			type: row.type ?? "Gói buổi",
			method: row.method ?? "—",
			due: row.due ?? "",
			note: row.note ?? "",
			enrollmentId: row.enrollmentId ?? "",
		});
		return id;
	}

	async function kernel(session: TestSession): Promise<KernelSnapshot> {
		const res = await call("/api/kernel", { session });
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	/** `overrides` replaces top-level body fields — keep type and skills consistent. */
	async function createClass(
		session: TestSession,
		name: string,
		overrides: {
			type?: string;
			skills?: string[];
			mode?: "Online" | "Offline";
			schedule?: { days: number[]; start: string; end: string };
			sessionsTotal?: number;
			tuitionFee?: number | null;
		} = {},
	): Promise<string> {
		const res = await call("/api/classes", {
			session,
			method: "POST",
			body: {
				name,
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				templateId: "",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "01/09",
				...overrides,
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
				type: "ielts",
				skills: ["Writing"],
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
		extra: {
			classId?: string;
		} = {},
	): Promise<string> {
		const orgId = await orgIdOf(session);
		const studentId = crypto.randomUUID();
		const email = `stu-${crypto.randomUUID()}@test.local`;
		await libsql.insert(schema.student).values({
			id: studentId,
			orgId,
			name,
			phone: "0900000000",
			email,
			zalo: "0900000000",
			parentName: "Phụ huynh",
			parentPhone: "",
		});
		if (extra.classId) {
			const enrollmentId = crypto.randomUUID();
			await libsql.insert(schema.enrollment).values({
				id: enrollmentId,
				orgId,
				classId: extra.classId,
				studentId,
				status: "invited",
			});
		}
		return studentId;
	}

	async function addActiveStudent(
		session: TestSession,
		name: string,
		extra: {
			classId?: string;
		} = {},
	): Promise<string> {
		const studentId = await addStudent(session, name, extra);
		if (extra.classId) {
			const snap = await kernel(session);
			const en = snap.enrollments.find(
				(e) => e.classId === extra.classId && e.studentId === studentId,
			);
			if (en) {
				const acceptRes = await call(`/api/enrollments/${en.id}/accept`, {
					session,
					method: "POST",
					body: {},
				});
				expect(acceptRes.status).toBe(200);
			}
		}
		return studentId;
	}

	return {
		app,
		db: libsql,
		insertUser,
		call,
		kernel,
		membershipsOf,
		orgIdOf,
		insertLesson,
		insertInvoice,
		createClass,
		createSyllabus,
		createModule,
		addStudent,
		addActiveStudent,
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
		expect(snapshot.reports).toEqual([]);
		expect(snapshot.notifs).toEqual([]);
		expect(snapshot.commentBank).toEqual([]);

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

describe("class type + structured schedule (create-class modal)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Hà");
	});

	const baseBody = {
		name: "IELTS Evening",
		type: "ielts",
		level: "Band 7.0",
		skills: ["Writing"],
		mode: "Online",
		templateId: "",
		schedule: { days: [1, 3], start: "19:00", end: "20:30" },
		sessionsTotal: 12,
		startDate: "01/09",
	};

	function postClass(body: unknown) {
		return t.call("/api/classes", { session, method: "POST", body });
	}

	test("communication class persists type and skills='[]'", async () => {
		const res = await postClass({
			...baseBody,
			name: "Giao tiếp sáng",
			type: "communication",
			skills: [],
		});
		expect(res.status).toBe(201);
		const [row] = await t.db
			.select()
			.from(classTable)
			.where(eq(classTable.name, "Giao tiếp sáng"));
		expect(row?.type).toBe("communication");
		expect(row?.skills).toBe("[]");
	});

	test("schedule missing days or legacy free-text string is 400", async () => {
		const missingDays = await postClass({
			...baseBody,
			schedule: { start: "19:00", end: "20:30" },
		});
		expect(missingDays.status).toBe(400);
		const legacyString = await postClass({
			...baseBody,
			schedule: "T3 19:00",
		});
		expect(legacyString.status).toBe(400);
	});

	test("days out of range, duplicated, or too long is 400", async () => {
		const outOfRange = await postClass({
			...baseBody,
			schedule: { ...baseBody.schedule, days: [7] },
		});
		expect(outOfRange.status).toBe(400);
		const duplicated = await postClass({
			...baseBody,
			schedule: { ...baseBody.schedule, days: [1, 1] },
		});
		expect(duplicated.status).toBe(400);
		const tooLong = await postClass({
			...baseBody,
			schedule: {
				...baseBody.schedule,
				days: [0, 1, 2, 3, 4, 5, 6, 0],
			},
		});
		expect(tooLong.status).toBe(400);
	});

	test("invalid time format is 400; end before start is 400", async () => {
		const badTime = await postClass({
			...baseBody,
			schedule: { days: [2], start: "99:99", end: "20:30" },
		});
		expect(badTime.status).toBe(400);
		// Issue #105: the QC repro — 21:00 → 08:00 must be rejected at
		// creation, not stored as a 660-minute "cross-midnight" class.
		const endBeforeStart = await postClass({
			...baseBody,
			name: "QC repro class",
			schedule: { days: [2], start: "21:00", end: "08:00" },
		});
		expect(endBeforeStart.status).toBe(400);
	});

	test("start equal to end is 400", async () => {
		const res = await postClass({
			...baseBody,
			schedule: { days: [2], start: "19:00", end: "19:00" },
		});
		expect(res.status).toBe(400);
	});

	test("sessionsTotal 0 is 400; omitted sessionsTotal defaults to 12", async () => {
		// Issue #105: "Tổng số buổi 0" must be rejected, not coerced anywhere.
		const zero = await postClass({ ...baseBody, sessionsTotal: 0 });
		expect(zero.status).toBe(400);
		const omitted = await postClass({
			...baseBody,
			name: "Default sessions class",
		});
		expect(omitted.status).toBe(201);
		const [row] = await t.db
			.select()
			.from(classTable)
			.where(eq(classTable.name, "Default sessions class"));
		expect(row?.sessionsTotal).toBe(12);
	});

	test("duplicated or over-long skills arrays are 400", async () => {
		const duplicated = await postClass({
			...baseBody,
			skills: ["Writing", "Writing"],
		});
		expect(duplicated.status).toBe(400);
		const tooLong = await postClass({
			...baseBody,
			skills: ["Writing", "Speaking", "Reading", "Listening", "Writing"],
		});
		expect(tooLong.status).toBe(400);
	});

	test("snapshot returns type, skills as string[], and sorted days", async () => {
		const res = await postClass({
			...baseBody,
			name: "Sort Days",
			schedule: { days: [3, 1], start: "19:00", end: "20:30" },
		});
		expect(res.status).toBe(201);
		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.name === "Sort Days");
		expect(cls?.type).toBe("ielts");
		expect(cls?.skills).toEqual(["Writing"]);
		expect(JSON.parse(cls?.schedule ?? "{}").days).toEqual([1, 3]);
	});

	test("ielts with empty skills is 400", async () => {
		const res = await postClass({ ...baseBody, skills: [] });
		expect(res.status).toBe(400);
	});

	test("communication with skills is 400; unknown skill value is 400", async () => {
		const withSkills = await postClass({
			...baseBody,
			type: "communication",
			skills: ["Writing"],
		});
		expect(withSkills.status).toBe(400);
		const unknownSkill = await postClass({
			...baseBody,
			skills: ["Parkour"],
		});
		expect(unknownSkill.status).toBe(400);
	});
});

describe("syllabus create with imported content (excel/csv import)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Import");
	});

	test("create with modules persists the ordered tree", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "IELTS Writing 7.0 (import)",
				level: "Band 7.0",
				type: "ielts",
				skills: ["Writing"],
				description: "",
				totalLessons: 0,
				modules: [
					{
						title: "M1",
						description: "d1",
						lessons: [
							{
								title: "B1",
								objectives: "o1",
								materials: "m1",
								status: "done",
							},
							{
								title: "B2",
								objectives: "",
								materials: "",
								status: "upcoming",
							},
						],
					},
					{ title: "M2", description: "", lessons: [] },
				],
			},
		});
		expect(res.status).toBe(201);
		expect(((await res.json()) as { id: string }).id).toBeTruthy();

		const listRes = await t.call("/api/syllabi", { session });
		const syllabi = (await listRes.json()) as Array<{
			name: string;
			modules: Array<{
				title: string;
				description: string;
				lessons: Array<{
					title: string;
					objectives: string;
					materials: string;
					status: string;
				}>;
			}>;
		}>;
		expect(syllabi).toHaveLength(1);
		const sy = syllabi[0];
		expect(sy?.name).toBe("IELTS Writing 7.0 (import)");
		expect(sy?.modules.map((m) => m.title)).toEqual(["M1", "M2"]);
		expect(sy?.modules[0]?.description).toBe("d1");
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual(["B1", "B2"]);
		expect(sy?.modules[0]?.lessons[0]).toMatchObject({
			title: "B1",
			objectives: "o1",
			materials: "m1",
			status: "done",
		});
		expect(sy?.modules[1]?.lessons).toEqual([]);
	});

	test("schema rejects oversized payload before any write", async () => {
		const lessons = Array.from({ length: 501 }, (_, i) => ({
			title: `B${i}`,
		}));
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Quá cap",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 0,
				modules: [{ title: "M", lessons }],
			},
		});
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "invalid body" });

		const listRes = await t.call("/api/syllabi", { session });
		const list = (await listRes.json()) as Array<{ name: string }>;
		expect(list.some((row) => row.name === "Quá cap")).toBe(false);
	});

	test("invalid lesson status in modules is 400", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Status lạ",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 0,
				modules: [
					{ title: "M", lessons: [{ title: "B", status: "finished" }] },
				],
			},
		});
		expect(res.status).toBe(400);
	});

	test("create without modules still works (backward compat)", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Flow cũ",
				level: "",
				type: "ielts",
				skills: ["Writing"],
				description: "",
				totalLessons: 0,
			},
		});
		expect(res.status).toBe(201);
	});

	test("create rejects requests above 2 MiB without persisting", async () => {
		const before = await (await t.call("/api/syllabi", { session })).json();
		const body = JSON.stringify({
			name: "Large import",
			type: "communication",
			description: "a".repeat(2 * 1024 * 1024),
		});
		for (const withLength of [false, true]) {
			const res = await t.app.request("/api/syllabi", {
				method: "POST",
				headers: {
					cookie: `better-auth.session_token=${session.token}`,
					origin: CORS_ORIGIN,
					"content-type": "application/json",
					...(withLength ? { "content-length": String(body.length) } : {}),
				},
				body,
			});
			expect(res.status).toBe(413);
			expect(res.headers.get("content-type")).toContain("application/json");
		}
		expect(await (await t.call("/api/syllabi", { session })).json()).toEqual(
			before,
		);
	});
});

describe("syllabus lesson status optional + replace-content (import ghi đè)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	/** Syllabus 1 module "M1" với 1 lesson `status`, trả ids từ snapshot. */
	async function createWithLesson(status: "done" | "current" | "upcoming") {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: `Syllabus ${status}`,
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 1,
				modules: [
					{
						title: "M1",
						lessons: [
							{ title: "B1", objectives: "o1", materials: "m1", status },
						],
					},
				],
			},
		});
		expect(res.status).toBe(201);
		const { id: syllabusId } = (await res.json()) as { id: string };
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		const mod = sy?.modules[0];
		const lesson = mod?.lessons[0];
		if (!sy || !mod || !lesson) throw new Error("setup failed");
		return { syllabusId, moduleId: mod.id, lessonId: lesson.id };
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Replace");
	});

	test("edit-lesson without status preserves the existing status", async () => {
		const { syllabusId, moduleId, lessonId } = await createWithLesson("done");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${lessonId}`,
			{
				session,
				method: "POST",
				body: { title: "B1 mới", objectives: "", materials: "" },
			},
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const lesson = snapshot.syllabi.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons[0];
		expect(lesson).toMatchObject({ title: "B1 mới", status: "done" });
	});

	test("edit-lesson with an explicit status still updates it", async () => {
		const { syllabusId, moduleId, lessonId } = await createWithLesson("done");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${lessonId}`,
			{
				session,
				method: "POST",
				body: {
					title: "B1",
					objectives: "",
					materials: "",
					status: "current",
				},
			},
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const lesson = snapshot.syllabi.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons[0];
		expect(lesson?.status).toBe("current");
	});

	test("add-lesson without status defaults to upcoming", async () => {
		const { syllabusId, moduleId } = await createWithLesson("done");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session,
				method: "POST",
				body: { title: "B2 thêm", objectives: "", materials: "" },
			},
		);
		expect(res.status).toBe(201);
		const snapshot = await t.kernel(session);
		const lessons = snapshot.syllabi.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons;
		expect(lessons?.[1]).toMatchObject({
			title: "B2 thêm",
			status: "upcoming",
		});
	});

	test("replace-content swaps the whole tree and updates totalLessons", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Syllabus bị ghi đè",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 2,
				modules: [
					{
						title: "M1 cũ",
						lessons: [
							{ title: "B1 cũ", status: "done" },
							{ title: "B2 cũ", status: "current" },
						],
					},
					{ title: "M2 cũ", lessons: [] },
				],
			},
		});
		expect(res.status).toBe(201);
		const { id: syllabusId } = (await res.json()) as { id: string };

		const replace = await t.call(`/api/syllabi/${syllabusId}/replace-content`, {
			session,
			method: "POST",
			body: {
				modules: [
					{
						title: "Mới",
						description: "d",
						lessons: [
							{ title: "Buổi 1", objectives: "o", materials: "m" },
							{ title: "Buổi 2", objectives: "", materials: "" },
						],
					},
				],
			},
		});
		expect(replace.status).toBe(200);

		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.totalLessons).toBe(2);
		expect(sy?.modules.map((m) => m.title)).toEqual(["Mới"]);
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual([
			"Buổi 1",
			"Buổi 2",
		]);
		expect(sy?.modules[0]?.lessons[0]?.status).toBe("upcoming");
	});

	test("replace-content on an unknown syllabus is 404", async () => {
		const res = await t.call(
			`/api/syllabi/${crypto.randomUUID()}/replace-content`,
			{
				session,
				method: "POST",
				body: { modules: [{ title: "M", lessons: [] }] },
			},
		);
		expect(res.status).toBe(404);
	});

	test("replace-content with empty modules is 400", async () => {
		const { syllabusId } = await createWithLesson("upcoming");
		const res = await t.call(`/api/syllabi/${syllabusId}/replace-content`, {
			session,
			method: "POST",
			body: { modules: [] },
		});
		expect(res.status).toBe(400);
	});

	test("replace-content from another org is 404 and leaves the tree intact", async () => {
		const { syllabusId } = await createWithLesson("done");
		const other = await t.insertUser("Cô org khác");
		await t.kernel(other); // bootstrap org + membership cho user thứ hai

		const res = await t.call(`/api/syllabi/${syllabusId}/replace-content`, {
			session: other,
			method: "POST",
			body: {
				modules: [{ title: "M phá hoại", lessons: [{ title: "B phá hoại" }] }],
			},
		});
		expect(res.status).toBe(404);

		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.totalLessons).toBe(1);
		expect(sy?.modules.map((m) => m.title)).toEqual(["M1"]);
		expect(sy?.modules[0]?.lessons[0]).toMatchObject({
			title: "B1",
			status: "done",
		});
	});
});

describe("syllabus lesson kind — buổi thi giữa kỳ/cuối kỳ (issue #154)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	/** Syllabus 1 module với 3 lesson kind lesson/midterm/final, trả ids. */
	async function createWithKinds() {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Syllabus buổi thi",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 3,
				modules: [
					{
						title: "M1",
						lessons: [
							{ title: "B1", objectives: "o1", materials: "m1" },
							{
								title: "Giữa kỳ",
								objectives: "",
								materials: "",
								kind: "midterm",
							},
							{
								title: "Cuối kỳ",
								objectives: "",
								materials: "",
								kind: "final",
							},
						],
					},
				],
			},
		});
		expect(res.status).toBe(201);
		const { id: syllabusId } = (await res.json()) as { id: string };
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		const mod = sy?.modules[0];
		if (!sy || !mod || mod.lessons.length !== 3)
			throw new Error("setup failed");
		return { syllabusId, moduleId: mod.id, lessons: mod.lessons };
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Buổi Thi");
	});

	test("create with modules persists kind and snapshot returns it", async () => {
		const { lessons } = await createWithKinds();
		expect(lessons.map((l) => l.kind)).toEqual(["lesson", "midterm", "final"]);
	});

	test("edit-lesson without kind preserves the existing kind", async () => {
		const { syllabusId, moduleId, lessons } = await createWithKinds();
		const midterm = lessons[1];
		if (!midterm) throw new Error("setup failed");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${midterm.id}`,
			{
				session,
				method: "POST",
				body: { title: "Giữa kỳ đổi tên", objectives: "", materials: "" },
			},
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const lesson = snapshot.syllabi
			.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons.find((l) => l.id === midterm.id);
		expect(lesson).toMatchObject({ title: "Giữa kỳ đổi tên", kind: "midterm" });
	});

	test("edit-lesson with an explicit kind updates it", async () => {
		const { syllabusId, moduleId, lessons } = await createWithKinds();
		const normal = lessons[0];
		if (!normal) throw new Error("setup failed");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${normal.id}`,
			{
				session,
				method: "POST",
				body: { title: "B1", objectives: "", materials: "", kind: "final" },
			},
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const lesson = snapshot.syllabi
			.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons.find((l) => l.id === normal.id);
		expect(lesson?.kind).toBe("final");
	});

	test("add-lesson without kind defaults to lesson", async () => {
		const { syllabusId, moduleId } = await createWithKinds();
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session,
				method: "POST",
				body: { title: "B4 thêm", objectives: "", materials: "" },
			},
		);
		expect(res.status).toBe(201);
		const snapshot = await t.kernel(session);
		const lessons = snapshot.syllabi.find((row) => row.id === syllabusId)
			?.modules[0]?.lessons;
		expect(lessons?.[3]).toMatchObject({ title: "B4 thêm", kind: "lesson" });
	});

	test("replace-content preserves mixed kinds", async () => {
		const { syllabusId } = await createWithKinds();
		const res = await t.call(`/api/syllabi/${syllabusId}/replace-content`, {
			session,
			method: "POST",
			body: {
				modules: [
					{
						title: "M mới",
						lessons: [
							{ title: "Thường", objectives: "", materials: "" },
							{
								title: "Thi lại",
								objectives: "",
								materials: "",
								kind: "midterm",
							},
						],
					},
				],
			},
		});
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.modules[0]?.lessons.map((l) => l.kind)).toEqual([
			"lesson",
			"midterm",
		]);
	});

	test("invalid kind in modules is 400", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Kind lạ",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 0,
				modules: [{ title: "M", lessons: [{ title: "B", kind: "exam" }] }],
			},
		});
		expect(res.status).toBe(400);
	});

	test("import template into a class keeps kind and resets status", async () => {
		// Template: 1 lesson thường (status upcoming) + 1 buổi thi giữa kỳ.
		const createRes = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Template buổi thi",
				type: "ielts",
				skills: ["Writing"],
				totalLessons: 2,
				modules: [
					{
						title: "M1",
						lessons: [
							{ title: "B1", objectives: "", materials: "" },
							{
								title: "Thi giữa kỳ",
								objectives: "",
								materials: "",
								kind: "midterm",
							},
						],
					},
				],
			},
		});
		expect(createRes.status).toBe(201);
		const { id: templateId } = (await createRes.json()) as { id: string };
		const tplSnapshot = await t.kernel(session);
		const template = tplSnapshot.syllabi.find((row) => row.id === templateId);
		const tplMidterm = template?.modules[0]?.lessons[1];

		const classId = await t.createClass(session, "Lớp copy buổi thi");
		const importRes = await t.call(`/api/classes/${classId}/import-syllabus`, {
			session,
			method: "POST",
			body: { templateId },
		});
		expect(importRes.status).toBe(201);

		const snapshot = await t.kernel(session);
		const copy = snapshot.syllabi.find(
			(row) => row.classId === classId && row.sourceTemplateId === templateId,
		);
		expect(copy).toBeTruthy();
		expect(copy?.modules[0]?.lessons.map((l) => l.kind)).toEqual([
			"lesson",
			"midterm",
		]);
		// status là tiến độ per-lớp → copy reset upcoming dù template là gì.
		expect(copy?.modules[0]?.lessons.map((l) => l.status)).toEqual([
			"upcoming",
			"upcoming",
		]);
		expect(tplMidterm?.kind).toBe("midterm");
	});
});

describe("invoice persistence", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let studentId: string;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Học phí");
		const classId = await t.createClass(session, "Lớp học phí");
		studentId = await t.addStudent(session, "Học viên HĐ", { classId });
	});

	test("unauthenticated list is 401 and a new org has zero invoices", async () => {
		expect((await t.call("/api/invoices")).status).toBe(401);
		const fresh = await t.insertUser("Cô chưa có HĐ");
		expect((await t.kernel(fresh)).invoices).toEqual([]);
		const list = await t.call("/api/invoices", { session: fresh });
		expect(list.status).toBe(200);
		expect(await list.json()).toEqual([]);
	});

	test("unauthenticated mark-paid is 401", async () => {
		const invoiceId = await t.insertInvoice(session, { studentId });
		const response = await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
			method: "POST",
			body: { method: "CK" },
		});
		expect(response.status).toBe(401);
	});

	test("list and kernel snapshot expose the explicit org-scoped DTO", async () => {
		const invoiceId = await t.insertInvoice(session, {
			studentId,
			amount: 600000,
			status: "overdue",
		});
		const list = await t.call("/api/invoices", { session });
		expect(list.status).toBe(200);
		const rows = (await list.json()) as Array<Record<string, unknown>>;
		const row = rows.find((candidate) => candidate.id === invoiceId);
		expect(row).toMatchObject({
			studentId,
			amount: 600000,
			status: "overdue",
			method: "—",
		});
		expect(row).not.toHaveProperty("orgId");
		expect((await t.kernel(session)).invoices).toEqual(rows);
	});

	test("mark-paid persists through snapshot and paid replay overwrites method", async () => {
		const invoiceId = await t.insertInvoice(session, { studentId });
		const packagesBefore = (await t.kernel(session)).packages;
		const paid = await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
			session,
			method: "POST",
			body: { method: "CK" },
		});
		expect(paid.status).toBe(200);
		expect(
			(await t.kernel(session)).invoices.find((row) => row.id === invoiceId),
		).toMatchObject({ status: "paid", method: "CK" });

		const replay = await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
			session,
			method: "POST",
			body: { method: "MoMo" },
		});
		expect(replay.status).toBe(200);
		const after = await t.kernel(session);
		expect(after.invoices.find((row) => row.id === invoiceId)?.method).toBe(
			"MoMo",
		);
		expect(after.packages).toEqual(packagesBefore);
	});

	test("mark-paid enforces Origin, JSON, and strict bounded body", async () => {
		const invoiceId = await t.insertInvoice(session, { studentId });
		expect(
			(
				await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
					session,
					method: "POST",
					origin: null,
					body: { method: "CK" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
					session,
					method: "POST",
					origin: "https://evil.example",
					body: { method: "CK" },
				})
			).status,
		).toBe(403);
		const form = await t.app.request(`/api/invoices/${invoiceId}/mark-paid`, {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${session.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "method=CK",
		});
		expect(form.status).toBe(415);
		expect(
			(
				await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
					session,
					method: "POST",
					body: { method: "CK", amount: 1 },
				})
			).status,
		).toBe(400);
		expect(
			(
				await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
					session,
					method: "POST",
					body: { method: "x".repeat(33) },
				})
			).status,
		).toBe(400);
	});

	test("cross-org and unknown ids are 404 and cannot change the owner row", async () => {
		const invoiceId = await t.insertInvoice(session, { studentId });
		const other = await t.insertUser("Cô khác org");
		expect((await t.kernel(other)).invoices).toEqual([]);
		const foreign = await t.call(`/api/invoices/${invoiceId}/mark-paid`, {
			session: other,
			method: "POST",
			body: { method: "CK" },
		});
		expect(foreign.status).toBe(404);
		const missing = await t.call("/api/invoices/missing/mark-paid", {
			session,
			method: "POST",
			body: { method: "CK" },
		});
		expect(missing.status).toBe(404);
		expect(
			(await t.kernel(session)).invoices.find((row) => row.id === invoiceId),
		).toMatchObject({ status: "unpaid", method: "—" });
	});

	test("malformed cross-org student relation is hidden from invoice reads", async () => {
		const other = await t.insertUser("Cô relation B");
		await t.kernel(other);
		const foreignStudent = await t.addStudent(other, "Học viên B");
		await t.insertInvoice(session, { studentId: foreignStudent });
		const snapshot = await t.kernel(session);
		expect(
			snapshot.invoices.some((row) => row.studentId === foreignStudent),
		).toBe(false);
	});
});

describe("invoice create (issue #60)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let studentId: string;
	let classId: string;
	let enrollmentId: string;

	function postInvoice(body: unknown) {
		return t.call("/api/invoices", {
			session,
			method: "POST",
			body,
		});
	}

	async function enrollmentIdOf(
		snapshotSession: TestSession,
		forClassId: string,
		forStudentId: string,
	): Promise<string> {
		const enrollmentRow = findEnrollment(
			await t.kernel(snapshotSession),
			forClassId,
			forStudentId,
		);
		if (!enrollmentRow) throw new Error("enrollment not seeded");
		return enrollmentRow.id;
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô tạo invoice");
		classId = await t.createClass(session, "Lớp invoice");
		studentId = await t.addActiveStudent(session, "Học viên invoice", {
			classId,
		});
		enrollmentId = await enrollmentIdOf(session, classId, studentId);
	});

	test("unauthenticated create is 401", async () => {
		const res = await t.call("/api/invoices", {
			method: "POST",
			body: { enrollmentId, amount: 1, due: "2026-09-15" },
		});
		expect(res.status).toBe(401);
	});

	test("create enforces Origin and JSON content-type", async () => {
		expect(
			(
				await t.call("/api/invoices", {
					session,
					method: "POST",
					origin: null,
					body: { enrollmentId, amount: 1, due: "2026-09-15" },
				})
			).status,
		).toBe(403);
		const form = await t.app.request("/api/invoices", {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${session.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "amount=1",
		});
		expect(form.status).toBe(415);
	});

	test("creates an unpaid invoice bound to the enrollment, visible in snapshot", async () => {
		const res = await postInvoice({
			enrollmentId,
			amount: 1500000,
			due: "2026-09-15",
			note: "Học phí tháng 9",
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(session)).invoices.find(
			(candidate) => candidate.id === id,
		);
		expect(row).toMatchObject({
			studentId,
			amount: 1500000,
			status: "unpaid",
			due: "2026-09-15",
			note: "Học phí tháng 9",
			enrollmentId,
		});
	});

	test("duplicates for the same enrollment are allowed (per-period invoices)", async () => {
		const body = { enrollmentId, amount: 400000, due: "2026-10-15" };
		const first = await postInvoice(body);
		const second = await postInvoice(body);
		expect(first.status).toBe(201);
		expect(second.status).toBe(201);
		const firstId = ((await first.json()) as { id: string }).id;
		const secondId = ((await second.json()) as { id: string }).id;
		expect(firstId).not.toBe(secondId);
		const rows = (await t.kernel(session)).invoices.filter(
			(row) => row.enrollmentId === enrollmentId,
		);
		expect(rows).toHaveLength(3);
	});

	test("rejects invalid amount, due, and shape with 400", async () => {
		const base = { enrollmentId, amount: 1, due: "2026-09-15" };
		expect((await postInvoice({ ...base, amount: 0 })).status).toBe(400);
		expect((await postInvoice({ ...base, amount: -5 })).status).toBe(400);
		expect((await postInvoice({ ...base, amount: 1.5 })).status).toBe(400);
		// Regex passes but the calendar date does not exist (rolls to March).
		expect((await postInvoice({ ...base, due: "2026-02-30" })).status).toBe(
			400,
		);
		expect((await postInvoice({ ...base, due: "15/09/2026" })).status).toBe(
			400,
		);
		expect((await postInvoice({ ...base, surprise: true })).status).toBe(400);
		expect((await postInvoice({ amount: 1, due: "2026-09-15" })).status).toBe(
			400,
		);
	});

	test("unknown or foreign enrollment is 404 and creates nothing", async () => {
		const unknown = await postInvoice({
			enrollmentId: crypto.randomUUID(),
			amount: 1,
			due: "2026-09-15",
		});
		expect(unknown.status).toBe(404);

		const other = await t.insertUser("Cô enrollment khác org");
		await t.kernel(other);
		const otherClassId = await t.createClass(other, "Lớp org khác");
		const otherStudentId = await t.addActiveStudent(
			other,
			"Học viên org khác",
			{
				classId: otherClassId,
			},
		);
		const foreignEnrollmentId = await enrollmentIdOf(
			other,
			otherClassId,
			otherStudentId,
		);
		const foreign = await postInvoice({
			enrollmentId: foreignEnrollmentId,
			amount: 1,
			due: "2026-09-15",
		});
		expect(foreign.status).toBe(404);
		expect((await t.kernel(session)).invoices).toHaveLength(3);
	});

	test("enrollment whose student row is cross-org is 404 (snapshot visibility)", async () => {
		const foreignClassId = await t.createClass(session, "Lớp lệch org");
		const foreignStudentId = await t.addActiveStudent(
			session,
			"Học viên lệch org",
			{
				classId: foreignClassId,
			},
		);
		const foreignEnrollmentId = await enrollmentIdOf(
			session,
			foreignClassId,
			foreignStudentId,
		);
		// Corrupt the relation directly: student now belongs to another org
		// while the enrollment still points at this org's class.
		const other = await t.insertUser("Cô student khác org");
		await t.kernel(other);
		await t.db
			.update(student)
			.set({ orgId: await t.orgIdOf(other) })
			.where(eq(student.id, foreignStudentId));

		const res = await postInvoice({
			enrollmentId: foreignEnrollmentId,
			amount: 1,
			due: "2026-09-15",
		});
		expect(res.status).toBe(404);
	});

	test("rejects invoice for invited enrollment with 409", async () => {
		const invitedStudentId = await t.addStudent(
			session,
			"Học viên chờ kích hoạt",
			{
				classId,
			},
		);
		const invitedEnrollmentId = await enrollmentIdOf(
			session,
			classId,
			invitedStudentId,
		);
		const res = await postInvoice({
			enrollmentId: invitedEnrollmentId,
			amount: 500000,
			due: "2026-09-15",
		});
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({
			error: "Học viên chưa đồng ý tham gia lớp",
		});
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
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			origin: null,
			body: { name: "A" },
		});
		expect(res.status).toBe(403);
	});

	test("POST with a foreign Origin is 403", async () => {
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			origin: "https://evil.example",
			body: { name: "A" },
		});
		expect(res.status).toBe(403);
	});

	test("PUT and PATCH without Origin header are 403", async () => {
		const put = await t.call("/api/kernel/settings", {
			session,
			method: "PUT",
			origin: null,
			body: {},
		});
		expect(put.status).toBe(403);
		const patch = await t.call("/api/kernel/settings", {
			session,
			method: "PATCH",
			origin: null,
			body: {},
		});
		expect(patch.status).toBe(403);
	});

	test("PUT with a foreign Origin is 403; allowed Origin reaches validation", async () => {
		const evil = await t.call("/api/kernel/settings", {
			session,
			method: "PUT",
			origin: "https://evil.example",
			body: {},
		});
		expect(evil.status).toBe(403);
		// Origin hợp lệ → qua guard, chết ở zod validation (400) như PUT test
		// "rejects invalid payload" đã chứng minh.
		const legit = await t.call("/api/kernel/settings", {
			session,
			method: "PUT",
			body: { maxAbsencesBeforeAlert: -5 },
		});
		expect(legit.status).toBe(400);
	});

	test("POST with a non-JSON content-type is 415", async () => {
		const res = await t.app.request("/api/classes", {
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
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			body: { name: "" },
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

	test("students with classId create invited enrollment; package created upon accept", async () => {
		const session = await t.insertUser("Cô Pkg");
		const classId = await t.createClass(session, "Lớp pkg");
		const studentId = await t.addStudent(session, "Học viên gói", {
			classId,
		});

		const snapshot = await t.kernel(session);
		expect(snapshot.enrollments).toHaveLength(1);
		expect(snapshot.enrollments[0]).toMatchObject({
			classId,
			studentId,
			status: "invited",
		});
		expect(snapshot.packages).toHaveLength(0);

		// When accepted, package is created atomically
		const acceptRes = await t.call(
			`/api/enrollments/${snapshot.enrollments[0]?.id}/accept`,
			{
				session,
				method: "POST",
				body: {},
			},
		);
		expect(acceptRes.status).toBe(200);

		const acceptedSnapshot = await t.kernel(session);
		expect(acceptedSnapshot.enrollments[0]?.status).toBe("active");
		expect(acceptedSnapshot.packages).toHaveLength(1);
		expect(acceptedSnapshot.packages[0]).toMatchObject({
			enrollmentId: acceptedSnapshot.enrollments[0]?.id,
			total: 12,
			price: 0,
			mode: "Online",
			status: "active",
		});
		// Entitlement only: no done/remaining on the wire — derived downstream.
		expect(acceptedSnapshot.packages[0]).not.toHaveProperty("done");
		expect(acceptedSnapshot.packages[0]).not.toHaveProperty("remaining");
	});

	test("without classId no package is created", async () => {
		const session = await t.insertUser("Cô Parked");
		const personId = await t.addStudent(session, "Học viên tự do");

		const snapshot = await t.kernel(session);
		expect(snapshot.enrollments).toHaveLength(0);
		expect(snapshot.packages).toHaveLength(0);
		expect(snapshot.students.map((s) => s.id)).toContain(personId);
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

	test("snapshot echoes type and skills from createSyllabus", async () => {
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.type).toBe("ielts");
		expect(sy?.skills).toEqual(["Writing"]);
		expect(sy?.level).toBe("Band 7.0");
	});

	test("ielts with empty skills is 400", async () => {
		const res = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Thiếu skill",
				type: "ielts",
				skills: [],
				level: "Band 7.0",
				description: "",
				totalLessons: 0,
			},
		});
		expect(res.status).toBe(400);
	});

	test("communication with skills is 400; communication empty skills persists", async () => {
		const rejected = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Giao tiếp sai",
				type: "communication",
				skills: ["Writing"],
				level: "",
				description: "",
				totalLessons: 0,
			},
		});
		expect(rejected.status).toBe(400);

		const created = await t.call("/api/syllabi", {
			session,
			method: "POST",
			body: {
				name: "Giao tiếp ok",
				type: "communication",
				skills: [],
				level: "",
				description: "",
				totalLessons: 0,
			},
		});
		expect(created.status).toBe(201);
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.name === "Giao tiếp ok");
		expect(sy?.type).toBe("communication");
		expect(sy?.skills).toEqual([]);
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

	test("org B cannot reorder or remove org A's modules/lessons", async () => {
		const reorderModules = await t.call(
			`/api/syllabi/${syllabusId}/modules/reorder`,
			{
				session: orgB,
				method: "POST",
				body: { moduleIds: [moduleId] },
			},
		);
		expect(reorderModules.status).toBe(404);
		const removeModule = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/remove`,
			{ session: orgB, method: "POST", body: {} },
		);
		expect(removeModule.status).toBe(404);
		const reorderLessons = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/reorder`,
			{
				session: orgB,
				method: "POST",
				body: { lessonIds: [lessonId] },
			},
		);
		expect(reorderLessons.status).toBe(404);
		const removeLesson = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${lessonId}/remove`,
			{ session: orgB, method: "POST", body: {} },
		);
		expect(removeLesson.status).toBe(404);
	});

	test("org A's tree is unchanged after every cross-org attempt", async () => {
		const snapshotA = await t.kernel(orgA);
		const sy = snapshotA.syllabi[0];
		expect(sy?.modules.map((m) => m.title)).toEqual(["Module A"]);
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual(["Buổi A"]);
		expect(sy?.modules[0]?.lessons[0]?.status).toBe("upcoming");
	});
});

describe("syllabus module/lesson delete and reorder", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Reorder");
		await t.kernel(session);
	});

	async function createLesson(
		syllabusId: string,
		moduleId: string,
		title: string,
	): Promise<string> {
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session,
				method: "POST",
				body: {
					title,
					objectives: "",
					materials: "",
					status: "upcoming",
				},
			},
		);
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	test("reorder modules then GET snapshot reflects the new order", async () => {
		const syllabusId = await t.createSyllabus(session, "Reorder modules");
		const a = await t.createModule(session, syllabusId, "A");
		const b = await t.createModule(session, syllabusId, "B");
		const res = await t.call(`/api/syllabi/${syllabusId}/modules/reorder`, {
			session,
			method: "POST",
			body: { moduleIds: [b, a] },
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.modules.map((m) => m.id)).toEqual([b, a]);
	});

	test("reorder lessons then GET snapshot reflects the new order", async () => {
		const syllabusId = await t.createSyllabus(session, "Reorder lessons");
		const moduleId = await t.createModule(session, syllabusId, "M");
		const l1 = await createLesson(syllabusId, moduleId, "L1");
		const l2 = await createLesson(syllabusId, moduleId, "L2");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/reorder`,
			{ session, method: "POST", body: { lessonIds: [l2, l1] } },
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const mod = snapshot.syllabi
			.find((row) => row.id === syllabusId)
			?.modules.find((m) => m.id === moduleId);
		expect(mod?.lessons.map((l) => l.id)).toEqual([l2, l1]);
	});

	test("delete module removes its lessons from the snapshot", async () => {
		const syllabusId = await t.createSyllabus(session, "Delete module");
		const keep = await t.createModule(session, syllabusId, "Keep");
		const gone = await t.createModule(session, syllabusId, "Gone");
		await createLesson(syllabusId, gone, "Child 1");
		await createLesson(syllabusId, gone, "Child 2");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${gone}/remove`,
			{ session, method: "POST", body: {} },
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const sy = snapshot.syllabi.find((row) => row.id === syllabusId);
		expect(sy?.modules.map((m) => m.id)).toEqual([keep]);
		expect(sy?.modules.flatMap((m) => m.lessons)).toEqual([]);
	});

	test("delete lesson leaves siblings", async () => {
		const syllabusId = await t.createSyllabus(session, "Delete lesson");
		const moduleId = await t.createModule(session, syllabusId, "M");
		const keep = await createLesson(syllabusId, moduleId, "Keep");
		const gone = await createLesson(syllabusId, moduleId, "Gone");
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${gone}/remove`,
			{ session, method: "POST", body: {} },
		);
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		const mod = snapshot.syllabi
			.find((row) => row.id === syllabusId)
			?.modules.find((m) => m.id === moduleId);
		expect(mod?.lessons.map((l) => l.id)).toEqual([keep]);
	});

	test("duplicate reorder ids are 400; set-mismatch is 409; extra key is 400", async () => {
		const syllabusId = await t.createSyllabus(session, "Reorder errors");
		const a = await t.createModule(session, syllabusId, "A");
		const b = await t.createModule(session, syllabusId, "B");
		const dup = await t.call(`/api/syllabi/${syllabusId}/modules/reorder`, {
			session,
			method: "POST",
			body: { moduleIds: [a, a] },
		});
		expect(dup.status).toBe(400);
		const extra = await t.call(`/api/syllabi/${syllabusId}/modules/reorder`, {
			session,
			method: "POST",
			body: { moduleIds: [a, b], extra: true },
		});
		expect(extra.status).toBe(400);
		const mismatch = await t.call(
			`/api/syllabi/${syllabusId}/modules/reorder`,
			{
				session,
				method: "POST",
				body: { moduleIds: [a] },
			},
		);
		expect(mismatch.status).toBe(409);
		expect(await mismatch.json()).toEqual({ error: "set-mismatch" });
	});

	test("same-cardinality foreign parent ids are 409 and victim order is unchanged", async () => {
		const syA = await t.createSyllabus(session, "Parent A");
		const syB = await t.createSyllabus(session, "Parent B");
		const a1 = await t.createModule(session, syA, "A1");
		const a2 = await t.createModule(session, syA, "A2");
		const b1 = await t.createModule(session, syB, "B1");
		const b2 = await t.createModule(session, syB, "B2");
		const res = await t.call(`/api/syllabi/${syA}/modules/reorder`, {
			session,
			method: "POST",
			body: { moduleIds: [b1, b2] },
		});
		expect(res.status).toBe(409);
		const snapshot = await t.kernel(session);
		expect(
			snapshot.syllabi.find((row) => row.id === syA)?.modules.map((m) => m.id),
		).toEqual([a1, a2]);
		expect(
			snapshot.syllabi.find((row) => row.id === syB)?.modules.map((m) => m.id),
		).toEqual([b1, b2]);
	});

	test("same-cardinality foreign lesson ids are 409 and victim order is unchanged", async () => {
		const sy = await t.createSyllabus(session, "Lesson parents");
		const m1 = await t.createModule(session, sy, "M1");
		const m2 = await t.createModule(session, sy, "M2");
		const a1 = await createLesson(sy, m1, "A1");
		const a2 = await createLesson(sy, m1, "A2");
		const b1 = await createLesson(sy, m2, "B1");
		const b2 = await createLesson(sy, m2, "B2");
		const res = await t.call(
			`/api/syllabi/${sy}/modules/${m1}/lessons/reorder`,
			{ session, method: "POST", body: { lessonIds: [b1, b2] } },
		);
		expect(res.status).toBe(409);
		const snapshot = await t.kernel(session);
		const parent = snapshot.syllabi.find((row) => row.id === sy);
		expect(
			parent?.modules.find((m) => m.id === m1)?.lessons.map((l) => l.id),
		).toEqual([a1, a2]);
		expect(
			parent?.modules.find((m) => m.id === m2)?.lessons.map((l) => l.id),
		).toEqual([b1, b2]);
	});

	test("unauthenticated delete/reorder is 401; Origin and form content-type fail closed", async () => {
		const syllabusId = await t.createSyllabus(session, "Authz");
		const moduleId = await t.createModule(session, syllabusId, "M");
		const lessonId = await createLesson(syllabusId, moduleId, "L");
		const paths: Array<{ path: string; body: unknown }> = [
			{
				path: `/api/syllabi/${syllabusId}/modules/${moduleId}/remove`,
				body: {},
			},
			{
				path: `/api/syllabi/${syllabusId}/modules/reorder`,
				body: { moduleIds: [moduleId] },
			},
			{
				path: `/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/${lessonId}/remove`,
				body: {},
			},
			{
				path: `/api/syllabi/${syllabusId}/modules/${moduleId}/lessons/reorder`,
				body: { lessonIds: [lessonId] },
			},
		];
		for (const { path, body } of paths) {
			const unauth = await t.call(path, { method: "POST", body });
			expect(unauth.status).toBe(401);
			const noOrigin = await t.call(path, {
				session,
				method: "POST",
				origin: null,
				body,
			});
			expect(noOrigin.status).toBe(403);
			const evil = await t.call(path, {
				session,
				method: "POST",
				origin: "https://evil.example",
				body,
			});
			expect(evil.status).toBe(403);
			const form = await t.app.request(path, {
				method: "POST",
				headers: {
					cookie: `better-auth.session_token=${session.token}`,
					origin: CORS_ORIGIN,
					"content-type": "application/x-www-form-urlencoded",
				},
				body: "x=1",
			});
			expect(form.status).toBe(415);
		}
	});

	test("delete module on a template does not touch a class-copy tree", async () => {
		const templateId = await t.createSyllabus(session, "Template shared");
		const templateModule = await t.createModule(session, templateId, "T1");
		await createLesson(templateId, templateModule, "TL");
		const classId = await t.createClass(session, "Lớp copy");
		const imported = await t.call(`/api/classes/${classId}/import-syllabus`, {
			session,
			method: "POST",
			body: { templateId },
		});
		expect(imported.status).toBe(201);
		const before = await t.kernel(session);
		const copy = before.syllabi.find((row) => row.classId === classId);
		expect(copy?.modules).toHaveLength(1);
		const res = await t.call(
			`/api/syllabi/${templateId}/modules/${templateModule}/remove`,
			{ session, method: "POST", body: {} },
		);
		expect(res.status).toBe(200);
		const after = await t.kernel(session);
		const template = after.syllabi.find((row) => row.id === templateId);
		expect(template?.modules).toEqual([]);
		const copyAfter = after.syllabi.find((row) => row.classId === classId);
		expect(copyAfter?.modules).toHaveLength(1);
		expect(copyAfter?.modules[0]?.lessons).toHaveLength(1);
	});
});

describe("assignments grade (Wave 6)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;
	let orgAId: string;
	let orgAStudentId: string;
	let assignmentId: string;

	/** Test-only helper insert — no create endpoint exists by design. */
	async function insertAssignment(
		orgId: string,
		studentId: string,
		status: string,
	): Promise<string> {
		const id = crypto.randomUUID();
		await t.db.insert(assignment).values({
			id,
			orgId,
			studentId,
			title: "Essay 1 — Education",
			type: "Writing Task 2",
			due: "20/08",
			status,
		});
		return id;
	}

	const HALF_BAND = {
		task: 6.5,
		coherence: 7.0,
		lexical: 6.5,
		grammar: 6.0,
	};

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Cô Assignment A");
		orgB = await t.insertUser("Cô Assignment B");
		orgAStudentId = await t.addStudent(orgA, "Học viên bài tập");
		const memberships = await t.membershipsOf(orgA.userId);
		orgAId = memberships[0]?.orgId ?? "";
		assignmentId = await insertAssignment(orgAId, orgAStudentId, "late");
	});

	test("new org sees zero assignments", async () => {
		const snapshot = await t.kernel(orgB);
		expect(snapshot.assignments).toEqual([]);
	});

	test("grade persists half-band scores + status graded across snapshot reloads", async () => {
		const res = await t.call(`/api/assignments/${assignmentId}/grade`, {
			session: orgA,
			method: "POST",
			body: { scores: HALF_BAND },
		});
		expect(res.status).toBe(200);

		const snapshot = await t.kernel(orgA);
		expect(snapshot.assignments).toHaveLength(1);
		expect(snapshot.assignments[0]).toMatchObject({
			id: assignmentId,
			status: "graded",
			scores: HALF_BAND,
		});

		// The list convenience endpoint serves the same org-scoped rows.
		const list = await t.call("/api/assignments", { session: orgA });
		expect(list.status).toBe(200);
		const rows = (await list.json()) as KernelSnapshot["assignments"];
		expect(rows[0]).toMatchObject({ id: assignmentId, status: "graded" });
	});

	test("org B grading org A's assignment is 404 and does not mutate", async () => {
		const freshId = await insertAssignment(
			orgAId,
			orgAStudentId,
			"not-submitted",
		);
		const res = await t.call(`/api/assignments/${freshId}/grade`, {
			session: orgB,
			method: "POST",
			body: { scores: HALF_BAND },
		});
		expect(res.status).toBe(404);

		const snapshot = await t.kernel(orgA);
		const row = snapshot.assignments.find((a) => a.id === freshId);
		expect(row?.status).toBe("not-submitted");
		expect(row?.scores).toBeNull();
	});

	test("grade POST inherits the origin + content-type guards", async () => {
		const noOrigin = await t.call(`/api/assignments/${assignmentId}/grade`, {
			session: orgA,
			method: "POST",
			origin: null,
			body: { scores: HALF_BAND },
		});
		expect(noOrigin.status).toBe(403);

		const form = await t.app.request(`/api/assignments/${assignmentId}/grade`, {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${orgA.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "scores=x",
		});
		expect(form.status).toBe(415);
	});

	test("grade rejects out-of-range, string, missing-key, and extra-key bodies", async () => {
		const badBodies = [
			{ scores: { ...HALF_BAND, task: 10 } },
			{ scores: { ...HALF_BAND, task: "6.5" } },
			{ scores: { task: 6.5, coherence: 7, lexical: 6.5 } },
			{ scores: { ...HALF_BAND, extra: 1 } },
		];
		for (const body of badBodies) {
			const res = await t.call(`/api/assignments/${assignmentId}/grade`, {
				session: orgA,
				method: "POST",
				body,
			});
			expect(res.status, JSON.stringify(body)).toBe(400);
		}
		// The rejected writes must not have clobbered the graded row.
		const snapshot = await t.kernel(orgA);
		const row = snapshot.assignments.find((a) => a.id === assignmentId);
		expect(row?.scores).toEqual(HALF_BAND);
		expect(row?.status).toBe("graded");
	});

	test("unauthenticated grade POST is 401", async () => {
		const res = await t.call(`/api/assignments/${assignmentId}/grade`, {
			method: "POST",
			body: { scores: HALF_BAND },
		});
		expect(res.status).toBe(401);
	});

	test("no create endpoint exists — POST /api/assignments is 404 (Wave 6 lock)", async () => {
		const res = await t.call("/api/assignments", {
			session: orgA,
			method: "POST",
			body: {
				title: "tạo bài lén",
				studentId: orgAStudentId,
				type: "Writing",
				due: "21/08",
			},
		});
		expect(res.status).toBe(404);
		const snapshot = await t.kernel(orgA);
		// Only the helper-inserted rows exist; nothing was created via API.
		expect(snapshot.assignments.length).toBeGreaterThanOrEqual(1);
		expect(snapshot.assignments.some((a) => a.title === "tạo bài lén")).toBe(
			false,
		);
	});
});

describe("reports, notifications, and comment bank (Wave 7)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;
	let orgAId: string;
	let studentAId: string;
	let studentBId: string;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Cô Reporting A");
		orgB = await t.insertUser("Cô Reporting B");
		studentAId = await t.addStudent(orgA, "Học viên báo cáo A");
		studentBId = await t.addStudent(orgB, "Học viên báo cáo B");
		orgAId = (await t.membershipsOf(orgA.userId))[0]?.orgId ?? "";
	});

	test("a new org has three empty collections on snapshot and list endpoints", async () => {
		const snapshot = await t.kernel(orgB);
		expect(snapshot.reports).toEqual([]);
		expect(snapshot.notifs).toEqual([]);
		expect(snapshot.commentBank).toEqual([]);

		for (const path of ["/api/reports", "/api/notifs", "/api/comment-bank"]) {
			const res = await t.call(path, { session: orgB });
			expect(res.status, path).toBe(200);
			expect(await res.json(), path).toEqual([]);
		}
	});

	test("existing rows survive reload and use explicit display DTOs", async () => {
		await t.db.insert(report).values({
			id: "report-a",
			orgId: orgAId,
			studentId: studentAId,
			period: "19–25/08",
			sessions: 2,
			status: "sent",
			sent: "25/08 20:00",
			read: "",
		});
		await t.db.insert(notif).values({
			id: "notif-a",
			orgId: orgAId,
			text: "Bài đã được chấm",
			time: "25/08 20:01",
			channel: "App",
			dot: "accent",
		});
		await t.db.insert(commentBank).values({
			id: "comment-a",
			orgId: orgAId,
			operationId: "00000000-0000-4000-8000-000000000001",
			tag: "chung",
			text: "Cần cải thiện coherence",
		});

		const first = await t.kernel(orgA);
		expect(first.reports).toEqual([
			{
				id: "report-a",
				studentId: studentAId,
				period: "19–25/08",
				sessions: 2,
				status: "sent",
				sent: "25/08 20:00",
				read: "",
			},
		]);
		expect(first.notifs).toEqual([
			{
				id: "notif-a",
				text: "Bài đã được chấm",
				time: "25/08 20:01",
				channel: "App",
				dot: "accent",
			},
		]);
		expect(first.commentBank).toEqual([
			{ id: "comment-a", tag: "chung", text: "Cần cải thiện coherence" },
		]);
		expect(await t.kernel(orgA)).toMatchObject(first);

		const otherOrg = await t.kernel(orgB);
		expect(otherOrg.reports).toEqual([]);
		expect(otherOrg.notifs).toEqual([]);
		expect(otherOrg.commentBank).toEqual([]);
		for (const path of ["/api/reports", "/api/notifs", "/api/comment-bank"]) {
			const res = await t.call(path, { session: orgB });
			expect(await res.json(), path).toEqual([]);
		}
	});

	test("a malformed cross-org report relation is hidden", async () => {
		await t.db.insert(report).values({
			id: "report-cross-org",
			orgId: orgAId,
			studentId: studentBId,
			period: "cross",
			sessions: 1,
			status: "draft",
			sent: "",
			read: "",
		});
		const snapshot = await t.kernel(orgA);
		expect(snapshot.reports.some((row) => row.id === "report-cross-org")).toBe(
			false,
		);
		const list = await t.call("/api/reports", { session: orgA });
		expect(
			((await list.json()) as KernelSnapshot["reports"]).some(
				(row) => row.id === "report-cross-org",
			),
		).toBe(false);
	});

	test("comment append trims, persists duplicates with distinct ids, and reloads", async () => {
		const ids: string[] = [];
		for (const [text, operationId] of [
			["  Nhận xét mới  ", "11111111-1111-4111-8111-111111111111"],
			["Nhận xét mới", "22222222-2222-4222-8222-222222222222"],
		] as const) {
			const res = await t.call("/api/comment-bank", {
				session: orgA,
				method: "POST",
				body: { text, operationId },
			});
			expect(res.status).toBe(201);
			ids.push(((await res.json()) as { id: string }).id);
		}
		expect(new Set(ids).size).toBe(2);
		const rows = (await t.kernel(orgA)).commentBank.filter(
			(row) => row.text === "Nhận xét mới",
		);
		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.tag === "chung")).toBe(true);
	});

	test("retrying after a lost acknowledgement returns the committed id once", async () => {
		const body = {
			text: "ACK có thể bị mất",
			operationId: "33333333-3333-4333-8333-333333333333",
		};
		const first = await t.call("/api/comment-bank", {
			session: orgA,
			method: "POST",
			body,
		});
		expect(first.status).toBe(201);
		const firstId = ((await first.json()) as { id: string }).id;

		const retry = await t.call("/api/comment-bank", {
			session: orgA,
			method: "POST",
			body,
		});
		expect(retry.status).toBe(200);
		expect(await retry.json()).toEqual({ id: firstId });
		expect(
			(await t.kernel(orgA)).commentBank.filter(
				(row) => row.text === body.text,
			),
		).toHaveLength(1);

		const changedPayload = await t.call("/api/comment-bank", {
			session: orgA,
			method: "POST",
			body: { ...body, text: "Không được ghi đè" },
		});
		expect(changedPayload.status).toBe(409);
		expect(
			(await t.kernel(orgA)).commentBank.some(
				(row) => row.text === "Không được ghi đè",
			),
		).toBe(false);

		const otherOrg = await t.call("/api/comment-bank", {
			session: orgB,
			method: "POST",
			body,
		});
		expect(otherOrg.status).toBe(201);
		expect((await otherOrg.json()) as { id: string }).not.toEqual({
			id: firstId,
		});
		expect(
			(await t.kernel(orgB)).commentBank.filter(
				(row) => row.text === body.text,
			),
		).toHaveLength(1);
	});

	test("comment append is guarded and rejects blank, oversized, and extra keys", async () => {
		const noOrigin = await t.call("/api/comment-bank", {
			session: orgA,
			method: "POST",
			origin: null,
			body: {
				text: "x",
				operationId: "44444444-4444-4444-8444-444444444444",
			},
		});
		expect(noOrigin.status).toBe(403);

		for (const body of [
			{
				text: "   ",
				operationId: "55555555-5555-4555-8555-555555555555",
			},
			{
				text: "x".repeat(2001),
				operationId: "66666666-6666-4666-8666-666666666666",
			},
			{
				text: "ok",
				operationId: "77777777-7777-4777-8777-777777777777",
				tag: "forged",
			},
			{ text: "missing operation" },
			{ text: "bad operation", operationId: "not-a-uuid" },
		]) {
			const res = await t.call("/api/comment-bank", {
				session: orgA,
				method: "POST",
				body,
			});
			expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
		}
	});

	test("POST /api/reports persists a sent report with a send stamp (#173)", async () => {
		const res = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentAId,
				period: "08–14/09",
				content: "Tuần này tiến bộ rõ rệt.",
				channel: "Zalo OA",
				status: "sent",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		expect(id).toBeTruthy();

		const row = (await t.kernel(orgA)).reports.find((r) => r.id === id);
		expect(row?.status).toBe("sent");
		expect(row?.sent).not.toBe("");
		expect(row?.read).toBe("");
	});

	test("POST /api/reports keeps a draft unsent with empty content allowed (#173)", async () => {
		const res = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentAId,
				period: "08–14/09",
				content: "",
				channel: "Email",
				status: "draft",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(orgA)).reports.find((r) => r.id === id);
		expect(row?.status).toBe("draft");
		expect(row?.sent).toBe("");
	});

	test("POST /api/reports rejects a send without content (#173)", async () => {
		const res = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentAId,
				period: "08–14/09",
				content: "   ",
				channel: "Zalo OA",
				status: "sent",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/reports rejects a student from another org (#173)", async () => {
		const res = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentBId,
				period: "08–14/09",
				content: "x",
				channel: "Zalo OA",
				status: "draft",
			},
		});
		expect(res.status).toBe(400);
		expect(await t.kernel(orgB).then((s) => s.reports)).toEqual([]);
	});

	test("POST /api/reports rejects malformed bodies and anonymous callers (#173)", async () => {
		const bad = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentAId,
				period: "",
				content: "x",
				channel: "Fax",
				status: "sent",
			},
		});
		expect(bad.status).toBe(400);

		const anon = await t.call("/api/reports", {
			method: "POST",
			body: {
				studentId: studentAId,
				period: "08–14/09",
				content: "x",
				channel: "Zalo OA",
				status: "sent",
			},
		});
		expect(anon.status).toBe(401);
	});

	test("notification mark-read has no write route (#173 shipped report create)", async () => {
		const markRead = await t.call("/api/notifs/notif-a", {
			session: orgA,
			method: "PATCH",
			body: {},
		});
		expect(markRead.status).toBe(404);
		const snapshot = await t.kernel(orgA);
		expect(
			snapshot.reports.filter((row) => row.id === "report-a"),
		).toHaveLength(1);
	});
});

describe("import syllabus + remove curriculum (issue #79)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let templateId: string;
	let moduleAId: string;
	let moduleBId: string;

	async function addLesson(
		session: TestSession,
		syllabusId: string,
		moduleId: string,
		title: string,
		status = "upcoming",
	): Promise<string> {
		const res = await t.call(
			`/api/syllabi/${syllabusId}/modules/${moduleId}/lessons`,
			{
				session,
				method: "POST",
				body: { title, objectives: "", materials: "", status },
			},
		);
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function importSyllabus(
		session: TestSession,
		classId: string,
		templateId: string,
	) {
		return t.call(`/api/classes/${classId}/import-syllabus`, {
			session,
			method: "POST",
			body: { templateId },
		});
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Import");
		templateId = await t.createSyllabus(session, "Template IELTS");
		moduleAId = await t.createModule(session, templateId, "Module A");
		moduleBId = await t.createModule(session, templateId, "Module B");
		// Mixed statuses prove the runtime copy resets them (unlike the
		// migration backfill, which preserves existing class progress).
		await addLesson(session, templateId, moduleAId, "Lesson A1", "done");
		await addLesson(session, templateId, moduleAId, "Lesson A2", "current");
		await addLesson(session, templateId, moduleBId, "Lesson B1", "upcoming");
	});

	test("matrix 12: POST /api/syllabi creates a template (classId null)", async () => {
		const snapshot = await t.kernel(session);
		const tpl = snapshot.syllabi.find((s) => s.id === templateId);
		expect(tpl?.classId).toBeNull();
		expect(tpl?.sourceTemplateId).toBeNull();
	});

	test("matrix 1+2+3+6: import deep-copies the full tree, resets statuses, preserves position + metadata", async () => {
		const classId = await t.createClass(session, "Lớp import 1");
		const res = await importSyllabus(session, classId, templateId);
		expect(res.status).toBe(201);
		const copyId = ((await res.json()) as { id: string }).id;
		expect(copyId).not.toBe(templateId);

		const snapshot = await t.kernel(session);
		const copy = snapshot.syllabi.find((s) => s.id === copyId);
		expect(copy?.classId).toBe(classId);
		expect(copy?.sourceTemplateId).toBe(templateId);
		expect(copy?.name).toBe("Template IELTS");
		// Stored form value copied as-is; the web recomputes from the tree.
		expect(copy?.totalLessons).toBe(0);

		// FK wiring: new module ids hanging off the copy, original ids untouched.
		expect(copy?.modules).toHaveLength(2);
		const copyModuleIds = copy?.modules.map((m) => m.id) ?? [];
		expect(copyModuleIds).not.toContain(moduleAId);
		expect(copyModuleIds).not.toContain(moduleBId);
		const titles = copy?.modules.map((m) => m.title) ?? [];
		expect(titles).toEqual(["Module A", "Module B"]);

		const lessons = copy?.modules.flatMap((m) => m.lessons) ?? [];
		expect(lessons.map((l) => l.title).sort()).toEqual([
			"Lesson A1",
			"Lesson A2",
			"Lesson B1",
		]);
		// Runtime import resets statuses — even done/current template lessons.
		expect(lessons.every((l) => l.status === "upcoming")).toBe(true);

		// Pointer moved to the copy.
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.syllabusId).toBe(copyId);

		// Position preserved within each module.
		const moduleA = copy?.modules.find((m) => m.title === "Module A");
		expect(moduleA?.lessons.map((l) => l.title)).toEqual([
			"Lesson A1",
			"Lesson A2",
		]);
	});

	test("matrix 4: importing into a class that already has a curriculum is 409", async () => {
		const classId = await t.createClass(session, "Lớp import 2");
		expect((await importSyllabus(session, classId, templateId)).status).toBe(
			201,
		);
		const before = await t.kernel(session);
		const res = await importSyllabus(session, classId, templateId);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { error: string }).error).toBe(
			"Lớp đã có giáo trình",
		);
		const after = await t.kernel(session);
		expect(after.syllabi.length).toBe(before.syllabi.length);
	});

	test("matrix 5+10: foreign-org template and cross-class copy are 404", async () => {
		const otherSession = await t.insertUser("Cô khác");
		const foreignTemplateId = await t.createSyllabus(
			otherSession,
			"Syllabus người khác",
		);
		const classId = await t.createClass(session, "Lớp thường");
		expect(
			(await importSyllabus(session, classId, foreignTemplateId)).status,
		).toBe(404);

		// A copy that belongs to another class is not a template.
		const otherClassId = await t.createClass(session, "Lớp có sẵn cây");
		const copyRes = await importSyllabus(session, otherClassId, templateId);
		const copyId = ((await copyRes.json()) as { id: string }).id;
		expect((await importSyllabus(session, classId, copyId)).status).toBe(404);
	});

	test("matrix 7: create class with templateId is atomic; bad template leaves no class behind", async () => {
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			body: {
				name: "Lớp kèm template",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				mode: "Online",
				templateId,
				schedule: { days: [2], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "01/09",
			},
		});
		expect(res.status).toBe(201);
		const classId = ((await res.json()) as { id: string }).id;
		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.syllabusId).not.toBeNull();
		const copy = snapshot.syllabi.find((s) => s.id === cls?.syllabusId);
		expect(copy?.classId).toBe(classId);
		expect(copy?.modules).toHaveLength(2);
		expect(copy?.sourceTemplateId).toBe(templateId);
		expect(copy?.modules.flatMap((m) => m.lessons)).toHaveLength(3);

		const bad = await t.call("/api/classes", {
			session,
			method: "POST",
			body: {
				name: "Lớp template sai",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				mode: "Online",
				templateId: "not-a-template",
				schedule: { days: [2], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "01/09",
			},
		});
		expect(bad.status).toBe(404);
		const classes = (await t.kernel(session)).classes;
		expect(classes.some((c) => c.name === "Lớp template sai")).toBe(false);
	});

	test("matrix 8: remove-curriculum deletes the copy tree and nulls the pointer; second call is a no-op", async () => {
		const classId = await t.createClass(session, "Lớp gỡ");
		const copyRes = await importSyllabus(session, classId, templateId);
		const copyId = ((await copyRes.json()) as { id: string }).id;
		const before = (await t.kernel(session)).syllabi.length;

		const remove = await t.call(`/api/classes/${classId}/remove-curriculum`, {
			session,
			method: "POST",
			body: {},
		});
		expect(remove.status).toBe(200);
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.length).toBe(before - 1);
		expect(snapshot.syllabi.some((s) => s.id === copyId)).toBe(false);
		expect(
			snapshot.classes.find((c) => c.id === classId)?.syllabusId,
		).toBeNull();

		const again = await t.call(`/api/classes/${classId}/remove-curriculum`, {
			session,
			method: "POST",
			body: {},
		});
		expect(again.status).toBe(200);
	});

	test("matrix 9: remove-curriculum on a template pointer nulls the pointer, never deletes the template", async () => {
		const classId = await t.createClass(session, "Lớp pointer thẳng template");
		// Legacy anomaly simulation: pointer straight at a template row.
		await t.db
			.update(classTable)
			.set({ syllabusId: templateId })
			.where(eq(classTable.id, classId));

		const res = await t.call(`/api/classes/${classId}/remove-curriculum`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		// Template survives fully intact.
		const tpl = snapshot.syllabi.find((s) => s.id === templateId);
		expect(tpl?.modules).toHaveLength(2);
		expect(tpl?.classId).toBeNull();
		// The anomalous pointer is cleaned to null (not a dead-end anymore).
		expect(
			snapshot.classes.find((c) => c.id === classId)?.syllabusId,
		).toBeNull();
	});

	test("size guard: import of a template with more than 500 nodes is 422", async () => {
		const bigTemplateId = await t.createSyllabus(session, "Template khổng lồ");
		const moduleId = await t.createModule(session, bigTemplateId, "Khối 501");
		// Direct rows (fast): 501 lessons on one module → modules+lessons > 500.
		const orgId = await t.orgIdOf(session);
		await t.db.insert(syllabusLesson).values(
			Array.from({ length: 501 }, (_, i) => ({
				id: `big-l${i}`,
				orgId,
				moduleId,
				title: `Lesson ${i}`,
				objectives: "",
				materials: "",
				status: "upcoming",
				position: i,
			})),
		);
		const classId = await t.createClass(session, "Lớp nhận template lớn");
		const res = await importSyllabus(session, classId, bigTemplateId);
		expect(res.status).toBe(422);
		expect(((await res.json()) as { error: string }).error).toBe(
			"Template quá lớn để import",
		);
		// Nothing was written: no copy, pointer still null.
		const snapshot = await t.kernel(session);
		expect(
			snapshot.syllabi.some((s) => s.sourceTemplateId === bigTemplateId),
		).toBe(false);
		expect(
			snapshot.classes.find((c) => c.id === classId)?.syllabusId,
		).toBeNull();
	});

	test("matrix 11: snapshot echoes classId/sourceTemplateId on copies", async () => {
		const classId = await t.createClass(session, "Lớp echo");
		const copyRes = await importSyllabus(session, classId, templateId);
		const copyId = ((await copyRes.json()) as { id: string }).id;
		const snapshot = await t.kernel(session);
		const copy = snapshot.syllabi.find((s) => s.id === copyId);
		expect(copy?.classId).toBe(classId);
		expect(copy?.sourceTemplateId).toBe(templateId);
	});

	test("matrix 13: module CRUD works on a class copy (isolation from the template)", async () => {
		const classId = await t.createClass(session, "Lớp edit copy");
		const copyRes = await importSyllabus(session, classId, templateId);
		const copyId = ((await copyRes.json()) as { id: string }).id;
		const added = await t.call(`/api/syllabi/${copyId}/modules`, {
			session,
			method: "POST",
			body: { title: "Module lớp thêm", description: "" },
		});
		expect(added.status).toBe(201);
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.find((s) => s.id === copyId)?.modules).toHaveLength(
			3,
		);
		// Template untouched by the class-copy edit.
		expect(
			snapshot.syllabi.find((s) => s.id === templateId)?.modules,
		).toHaveLength(2);
	});

	test("matrix 14: assign-syllabus endpoint is gone (404)", async () => {
		const classId = await t.createClass(session, "Lớp cũ");
		const res = await t.call(`/api/classes/${classId}/assign-syllabus`, {
			session,
			method: "POST",
			body: { syllabusId: templateId },
		});
		expect(res.status).toBe(404);
	});

	test("class notes still persist after the cutover", async () => {
		const classId = await t.createClass(session, "Lớp ghi chú");
		const notes = await t.call(`/api/classes/${classId}/notes`, {
			session,
			method: "POST",
			body: { notes: "ghi chú mới" },
		});
		expect(notes.status).toBe(200);
		const snapshot = await t.kernel(session);
		expect(snapshot.classes.find((c) => c.id === classId)?.notes).toBe(
			"ghi chú mới",
		);
	});
});

describe("delete syllabus template (xóa template giáo trình)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	// Helper local mirror của describe import (issue #79).
	async function importSyllabus(
		session: TestSession,
		classId: string,
		templateId: string,
	) {
		return t.call(`/api/classes/${classId}/import-syllabus`, {
			session,
			method: "POST",
			body: { templateId },
		});
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Xóa Syllabus");
	});

	test("matrix 15: delete-syllabus xóa template, bản copy của lớp đã import sống sót nguyên vẹn", async () => {
		const templateId = await t.createSyllabus(session, "Template sẽ xóa");
		const moduleAId = await t.createModule(session, templateId, "Module A");
		await t.createModule(session, templateId, "Module B");
		// Thêm 1 lesson qua endpoint (mirror addLesson của describe #79).
		const lessonRes = await t.call(
			`/api/syllabi/${templateId}/modules/${moduleAId}/lessons`,
			{
				session,
				method: "POST",
				body: { title: "L1", objectives: "", materials: "" },
			},
		);
		expect(lessonRes.status).toBe(201);

		// Lớp đã import trước khi xóa.
		const classId = await t.createClass(session, "Lớp đã dùng template");
		const copyRes = await importSyllabus(session, classId, templateId);
		expect(copyRes.status).toBe(201);
		const copyId = ((await copyRes.json()) as { id: string }).id;

		const remove = await t.call(`/api/syllabi/${templateId}/remove`, {
			session,
			method: "POST",
			body: {},
		});
		expect(remove.status).toBe(200);

		const snapshot = await t.kernel(session);
		// Template + cây biến mất.
		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(false);
		// Bản copy của lớp sống sót nguyên vẹn cây (2 modules + 1 lesson).
		const copy = snapshot.syllabi.find((s) => s.id === copyId);
		expect(copy?.classId).toBe(classId);
		expect(copy?.modules).toHaveLength(2);
		expect(copy?.modules.flatMap((m) => m.lessons)).toHaveLength(1);
		// Provenance detached (logical FK phải tự null).
		expect(copy?.sourceTemplateId).toBeNull();
		// Pointer của lớp vẫn trỏ vào copy.
		expect(snapshot.classes.find((c) => c.id === classId)?.syllabusId).toBe(
			copyId,
		);

		// Lớp mới không thể chọn template đã xóa.
		const newClassId = await t.createClass(session, "Lớp mới sau xóa");
		expect((await importSyllabus(session, newClassId, templateId)).status).toBe(
			404,
		);
	});

	test("matrix 16: delete-syllabus từ chối bản copy của lớp (mirror guard import handler)", async () => {
		const templateId = await t.createSyllabus(session, "Template giữ nguyên");
		await t.createModule(session, templateId, "Module A");
		const classId = await t.createClass(session, "Lớp copy bị nhắm");
		const copyRes = await importSyllabus(session, classId, templateId);
		const copyId = ((await copyRes.json()) as { id: string }).id;

		const res = await t.call(`/api/syllabi/${copyId}/remove`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(404);
		// Copy vẫn còn nguyên.
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.some((s) => s.id === copyId)).toBe(true);
		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(true);
	});

	test("anomaly: class trỏ thẳng template vẫn cho xóa template và null pointer", async () => {
		const templateId = await t.createSyllabus(session, "Template bị trỏ thẳng");
		const classId = await t.createClass(session, "Lớp pointer lệch");
		// Legacy anomaly simulation — mirror matrix 9 setup (issue #79).
		await t.db
			.update(classTable)
			.set({ syllabusId: templateId })
			.where(eq(classTable.id, classId));

		const res = await t.call(`/api/syllabi/${templateId}/remove`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(200);
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(false);
		expect(
			snapshot.classes.find((c) => c.id === classId)?.syllabusId,
		).toBeNull();
	});

	test("org-scoping: template của org khác là 404", async () => {
		const other = await t.insertUser("Cô Org Khác");
		const foreignId = await t.createSyllabus(other, "Template người khác");
		const res = await t.call(`/api/syllabi/${foreignId}/remove`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(404);
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.some((s) => s.id === foreignId)).toBe(false);
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

describe("schedule-driven lesson generation (issue #55)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let classId: string;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Lịch");
		classId = await t.createClass(session, "IELTS tối");
	});

	// Characterization: the no-classId path never generates lessons.
	test("student without classId creates zero lessons", async () => {
		await t.addStudent(session, "HV tự do");
		const snapshot = await t.kernel(session);
		expect(snapshot.lessons).toEqual([]);
	});

	test("unit generator: maps schedule rows to upcoming lesson values", () => {
		const rows = generateScheduleLessons({
			schedule: JSON.stringify({ days: [2, 4], start: "19:00", end: "20:30" }),
			startDate: "2026-08-25",
			sessionsTotal: 3,
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
		});
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			expect(row).toMatchObject({
				orgId: "org",
				classId: "cls",
				enrollmentId: "enr",
				day: expect.any(Number), // asserted per-row below
				time: "19:00",
				dur: 90,
				type: "1:1",
				status: "upcoming",
				topic: "",
				zoom: "",
			});
		}
		expect(rows.map((r) => r.day)).toEqual([3, 5, 3]);
	});

	test("unit generator: weekday +1 mapping is Monday-first (schedule 0=Monday → lesson 1=Monday)", () => {
		const rows = generateScheduleLessons({
			schedule: JSON.stringify({ days: [0, 6], start: "09:00", end: "10:30" }),
			startDate: "2026-08-24",
			sessionsTotal: 2,
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
		});
		expect(rows.map((r) => r.day)).toEqual([1, 7]);
	});

	test("unit generator: overnight schedule wraps midnight into duration", () => {
		const rows = generateScheduleLessons({
			schedule: JSON.stringify({ days: [2], start: "23:00", end: "00:30" }),
			startDate: "2026-08-25",
			sessionsTotal: 1,
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
		});
		expect(rows[0]?.dur).toBe(90);
	});

	test("unit generator: cycles evenly across sorted unique days", () => {
		const rows = generateScheduleLessons({
			schedule: JSON.stringify({
				days: [3, 1, 3],
				start: "19:00",
				end: "20:30",
			}),
			startDate: "2026-08-24",
			sessionsTotal: 6,
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
		});
		const dayCounts = new Map<number, number>();
		for (const row of rows)
			dayCounts.set(row.day, (dayCounts.get(row.day) ?? 0) + 1);
		expect(dayCounts.get(2)).toBe(3); // schedule day 1
		expect(dayCounts.get(4)).toBe(3); // schedule day 3 (deduped)
	});

	test("unit generator: zero and invalid inputs fail closed to []", () => {
		const base = {
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
			startDate: "2026-08-25",
		};
		const valid = JSON.stringify({ days: [1], start: "19:00", end: "20:30" });
		expect(
			generateScheduleLessons({ ...base, schedule: valid, sessionsTotal: 0 }),
		).toEqual([]);
		expect(
			generateScheduleLessons({
				...base,
				schedule: "Tối thứ 3",
				sessionsTotal: 12,
			}),
		).toEqual([]);
		expect(
			generateScheduleLessons({
				...base,
				schedule: "not json",
				sessionsTotal: 12,
			}),
		).toEqual([]);
		expect(
			generateScheduleLessons({
				...base,
				schedule: JSON.stringify({ days: [], start: "19:00", end: "20:30" }),
				sessionsTotal: 12,
			}),
		).toEqual([]);
		expect(
			generateScheduleLessons({
				...base,
				schedule: JSON.stringify({ days: [1], start: "19:00", end: "19:00" }),
				sessionsTotal: 12,
			}),
		).toEqual([]);
	});

	test("enrolling and activating a student generates sessionsTotal upcoming lessons on the kernel snapshot", async () => {
		const studentId = await t.addActiveStudent(session, "HV có lớp", {
			classId,
		});
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, classId, studentId);
		expect(enrollment).toBeDefined();
		const rows = snapshot.lessons.filter(
			(l) => l.enrollmentId === enrollment?.id,
		);
		expect(rows).toHaveLength(12);
		const daySet = new Set(rows.map((r) => r.day));
		expect(daySet).toEqual(new Set([2, 4])); // schedule days [1,3] + 1
		for (const row of rows) {
			expect(row.status).toBe("upcoming");
			expect(row.type).toBe("1:1");
			expect(row.time).toBe("19:00");
			expect(row.dur).toBe(90);
		}
	});

	test("large sessionsTotal (50) still generates atomically", async () => {
		const bigClassId = await t.createClass(session, "Khóa dài", {
			type: "communication",
			skills: [],
			schedule: { days: [5], start: "09:00", end: "10:00" },
			sessionsTotal: 50,
		});
		const studentId = await t.addActiveStudent(session, "HV khóa dài", {
			classId: bigClassId,
		});
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, bigClassId, studentId);
		expect(
			snapshot.lessons.filter((l) => l.enrollmentId === enrollment?.id),
		).toHaveLength(50);
	});

	test("stored sessionsTotal = 0 generates zero lessons", async () => {
		// Issue #105: the API now rejects sessionsTotal 0 at creation, but a
		// legacy row (e.g. the QC-created class) can still carry 0 — the
		// generator must mint zero lesson rows on enrollment. Row seeded
		// directly because POST /classes is no longer a valid path to 0.
		const zeroClassId = crypto.randomUUID();
		await t.db.insert(classTable).values({
			id: zeroClassId,
			orgId: await t.orgIdOf(session),
			name: "Chưa định số buổi",
			level: "",
			type: "communication",
			skills: "[]",
			mode: "Online",
			schedule: JSON.stringify({ days: [2], start: "19:00", end: "20:30" }),
			sessionsTotal: 0,
			sessionsDone: 0,
			status: "active",
			startDate: "",
			notes: "",
		});
		const studentId = await t.addStudent(session, "HV zero", {
			classId: zeroClassId,
		});
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, zeroClassId, studentId);
		expect(
			snapshot.lessons.filter((l) => l.enrollmentId === enrollment?.id),
		).toEqual([]);
	});

	test("legacy free-text schedule: student/enrollment/package still create, zero lessons", async () => {
		const legacyClassId = crypto.randomUUID();
		await t.db.insert(classTable).values({
			id: legacyClassId,
			orgId: await t.orgIdOf(session),
			name: "Lớp cũ",
			level: "",
			type: "ielts",
			skills: "[]",
			mode: "Online",
			schedule: "Tối thứ 3",
			sessionsTotal: 12,
			sessionsDone: 0,
			status: "active",
			startDate: "",
			notes: "",
		});
		await t.addActiveStudent(session, "HV lớp cũ", { classId: legacyClassId });
		const snapshot = await t.kernel(session);
		expect(snapshot.lessons.filter((l) => l.classId === legacyClassId)).toEqual(
			[],
		);
		expect(
			snapshot.enrollments.filter((e) => e.classId === legacyClassId),
		).toHaveLength(1);
		expect(
			snapshot.packages.filter((p) => p.classId === legacyClassId),
		).toHaveLength(1);
	});

	test("group class: two enrollments get independent lesson sets (invariant 2)", async () => {
		const firstId = await t.addActiveStudent(session, "HV nhóm 1", { classId });
		const secondId = await t.addActiveStudent(session, "HV nhóm 2", {
			classId,
		});
		const snapshot = await t.kernel(session);
		const firstEnrollment = findEnrollment(snapshot, classId, firstId);
		const secondEnrollment = findEnrollment(snapshot, classId, secondId);
		const firstLessons = snapshot.lessons.filter(
			(l) => l.enrollmentId === firstEnrollment?.id,
		);
		const secondLessons = snapshot.lessons.filter(
			(l) => l.enrollmentId === secondEnrollment?.id,
		);
		expect(firstLessons).toHaveLength(12);
		expect(secondLessons).toHaveLength(12);
		expect(
			new Set(secondLessons.map((l) => l.enrollmentId)).has(
				firstEnrollment?.id ?? "",
			),
		).toBe(false);
	});

	test("enroll mirrors the class package: total = class sessionsTotal", async () => {
		const studentId = await t.addStudent(session, "HV gói chuẩn lớp");
		const res = await t.call(`/api/classes/${classId}/enroll`, {
			session,
			method: "POST",
			body: { studentId },
		});
		expect(res.status).toBe(201);
		const { id: enrollmentId } = (await res.json()) as { id: string };
		const acceptRes = await t.call(`/api/enrollments/${enrollmentId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, classId, studentId);
		expect(
			snapshot.lessons.filter((l) => l.enrollmentId === enrollment?.id),
		).toHaveLength(12);
		expect(
			snapshot.packages.find((p) => p.enrollmentId === enrollment?.id)?.total,
		).toBe(12);
	});

	test("cross-org: org B cannot enroll into org A's class and sees zero generated lessons", async () => {
		const orgB = await t.insertUser("Cô Lịch B");
		const studentIdB = await t.addStudent(orgB, "HV intruder");
		const attempt = await t.call(`/api/classes/${classId}/enroll`, {
			session: orgB,
			method: "POST",
			body: {
				studentId: studentIdB,
			},
		});
		expect(attempt.status).toBe(404);
		const snapshotB = await t.kernel(orgB);
		expect(snapshotB.lessons).toEqual([]);
		expect(
			snapshotB.enrollments.find((e) => e.classId === classId),
		).toBeUndefined();
	});
});

describe("sessionsTotal contract cap (issue #55)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Cap");
	});

	async function createWithTotal(sessionsTotal: number) {
		return t.call("/api/classes", {
			session,
			method: "POST",
			body: {
				name: `Lớp ${sessionsTotal}`,
				type: "communication",
				level: "",
				skills: [],
				mode: "Online",
				templateId: "",
				schedule: { days: [2], start: "19:00", end: "20:30" },
				sessionsTotal,
				startDate: "",
			},
		});
	}

	test("52 is accepted (weekly × 1 year)", async () => {
		expect((await createWithTotal(52)).status).toBe(201);
	});

	test("53 is rejected", async () => {
		expect((await createWithTotal(53)).status).toBe(400);
	});
});

describe("lesson edit (issue #55)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let classId: string;
	let enrollmentId: string;
	let lessonId: string;

	const editBody = {
		day: 4,
		time: "18:30",
		dur: 120,
		topic: "Speaking part 2",
		zoom: "https://zoom.us/j/123",
	};

	async function edit(
		id: string,
		body: unknown,
		options: {
			session?: TestSession;
			origin?: string | null;
		} = {},
	) {
		return t.call(`/api/lessons/${id}/edit`, {
			session: options.session ?? session,
			method: "POST",
			body,
			origin: options.origin,
		});
	}

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Sửa");
		classId = await t.createClass(session, "Lớp sửa buổi");
		const studentId = await t.addStudent(session, "HV sửa buổi", {
			classId,
		});
		const snapshot = await t.kernel(session);
		enrollmentId = findEnrollment(snapshot, classId, studentId)?.id ?? "";
		lessonId = await t.insertLesson(session, {
			classId,
			enrollmentId,
			day: 2,
			time: "19:00",
			dur: 90,
			topic: "Writing task 1",
			zoom: "https://zoom.us/j/old",
		});
	});

	test("happy path: 200, row updated with all five fields", async () => {
		const res = await edit(lessonId, editBody);
		expect(res.status).toBe(200);
		const row = (await t.kernel(session)).lessons.find(
			(l) => l.id === lessonId,
		);
		expect(row).toMatchObject(editBody);
	});

	test("sibling lessons are byte-identical after an edit", async () => {
		const otherId = await t.insertLesson(session, {
			classId,
			enrollmentId,
		});
		const before = await t.kernel(session);
		const res = await edit(lessonId, { ...editBody, topic: "Moved again" });
		expect(res.status).toBe(200);
		const after = await t.kernel(session);
		expect(after.lessons.find((l) => l.id === otherId)).toEqual(
			before.lessons.find((l) => l.id === otherId),
		);
		expect(after.lessons.filter((l) => l.id !== lessonId)).toEqual(
			before.lessons.filter((l) => l.id !== lessonId),
		);
	});

	test("unknown id is 404", async () => {
		expect((await edit("nope", editBody)).status).toBe(404);
	});

	test("org B cannot edit org A's lesson; org A unchanged", async () => {
		const orgB = await t.insertUser("Cô B sửa");
		const before = (await t.kernel(session)).lessons.find(
			(l) => l.id === lessonId,
		);
		const res = await edit(lessonId, editBody, { session: orgB });
		expect(res.status).toBe(404);
		const after = (await t.kernel(session)).lessons.find(
			(l) => l.id === lessonId,
		);
		expect(after).toEqual(before);
	});

	test("completed lesson cannot be edited (409)", async () => {
		const id = await t.insertLesson(session, { classId, enrollmentId });
		expect(
			(
				await t.call(`/api/lessons/${id}/check-in`, {
					session,
					method: "POST",
					body: {},
				})
			).status,
		).toBe(200);
		expect((await edit(id, editBody)).status).toBe(409);
	});

	test("cancelled lesson cannot be edited (409)", async () => {
		const id = await t.insertLesson(session, { classId, enrollmentId });
		expect(
			(
				await t.call(`/api/lessons/${id}/cancel`, {
					session,
					method: "POST",
					body: {},
				})
			).status,
		).toBe(200);
		expect((await edit(id, editBody)).status).toBe(409);
	});

	test("lesson whose enrollment belongs to another class is 409", async () => {
		const otherClassId = await t.createClass(session, "Lớp khác chỗ");
		const otherStudentId = await t.addStudent(session, "HV lệch lớp", {
			classId: otherClassId,
		});
		const snapshot = await t.kernel(session);
		const otherEnrollmentId =
			findEnrollment(snapshot, otherClassId, otherStudentId)?.id ?? "";
		const id = await t.insertLesson(session, {
			classId, // claims class A, enrollment sits in class B
			enrollmentId: otherEnrollmentId,
		});
		expect((await edit(id, editBody)).status).toBe(409);
	});

	test("guards: no Origin 403, form content-type 415, extra key 400, missing day 400, empty body 400", async () => {
		const id = await t.insertLesson(session, { classId, enrollmentId });
		expect((await edit(id, editBody, { origin: null })).status).toBe(403);
		const form = await t.app.request(`/api/lessons/${id}/edit`, {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${session.token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/x-www-form-urlencoded",
			},
			body: "x=1",
		});
		expect(form.status).toBe(415);
		expect((await edit(id, { ...editBody, status: "completed" })).status).toBe(
			400,
		);
		expect((await edit(id, { ...editBody, day: undefined })).status).toBe(400);
		expect((await edit(id, {})).status).toBe(400);
	});

	test("contract boundaries: topic cap 500, zoom scheme https-only", async () => {
		const id = await t.insertLesson(session, { classId, enrollmentId });
		expect(
			(
				await edit(id, {
					...editBody,
					topic: "x".repeat(501),
				})
			).status,
		).toBe(400);
		expect(
			(await edit(id, { ...editBody, zoom: "javascript:alert(1)" })).status,
		).toBe(400);
		expect((await edit(id, { ...editBody, zoom: "not-a-url" })).status).toBe(
			400,
		);
		const ok = await edit(id, { ...editBody, zoom: "https://zoom.us/j/ok" });
		expect(ok.status).toBe(200);
	});

	test("full-replace: omitting topic/zoom resets them to empty strings", async () => {
		const id = await t.insertLesson(session, {
			classId,
			enrollmentId,
			topic: "Sẽ bị wipe",
		});
		const res = await edit(id, { day: 3, time: "20:00", dur: 60 });
		expect(res.status).toBe(200);
		const row = (await t.kernel(session)).lessons.find((l) => l.id === id);
		expect(row).toMatchObject({ day: 3, time: "20:00", dur: 60, topic: "" });
	});

	test("replay with the same body is idempotent (200 twice, same state)", async () => {
		const id = await t.insertLesson(session, { classId, enrollmentId });
		const first = await edit(id, editBody);
		const second = await edit(id, editBody);
		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		const row = (await t.kernel(session)).lessons.find((l) => l.id === id);
		expect(row).toMatchObject(editBody);
	});

	test("cancelling one lesson leaves siblings untouched", async () => {
		const snapshotBefore = await t.kernel(session);
		const target = snapshotBefore.lessons.find(
			(l) =>
				l.classId === classId &&
				l.enrollmentId === enrollmentId &&
				l.status === "upcoming",
		);
		expect(target).toBeDefined();
		const res = await t.call(`/api/lessons/${target?.id}/cancel`, {
			session,
			method: "POST",
			body: {},
		});
		expect(res.status).toBe(200);
		const after = await t.kernel(session);
		expect(after.lessons.find((l) => l.id === target?.id)?.status).toBe(
			"cancelled",
		);
		expect(after.lessons.filter((l) => l.id !== target?.id)).toEqual(
			snapshotBefore.lessons.filter((l) => l.id !== target?.id),
		);
	});
});

describe("lesson edit optimistic concurrency (issue #55)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let lessonId: string;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Đua");
		const classId = await t.createClass(session, "Lớp concurrent");
		const studentId = await t.addStudent(session, "HV concurrent", {
			classId,
		});
		const snapshot = await t.kernel(session);
		const enrollmentId =
			snapshot.enrollments.find(
				(e) => e.classId === classId && e.studentId === studentId,
			)?.id ?? "";
		lessonId = await t.insertLesson(session, {
			classId,
			enrollmentId,
			day: 2,
			time: "19:00",
			dur: 90,
			topic: "Original",
		});
	});

	test("two concurrent edits with different bodies: exactly one wins, the loser gets 409", async () => {
		const [first, second] = await Promise.all([
			t.call(`/api/lessons/${lessonId}/edit`, {
				session,
				method: "POST",
				body: { day: 3, time: "19:00", dur: 90, topic: "Tab A", zoom: "" },
			}),
			t.call(`/api/lessons/${lessonId}/edit`, {
				session,
				method: "POST",
				body: { day: 3, time: "19:00", dur: 90, topic: "Tab B", zoom: "" },
			}),
		]);
		const statuses = [first.status, second.status].sort();
		// Exactly one conditional write matches the pre-read values; the other
		// finds the row already changed → 0 rows → 409, never a silent loss.
		expect(statuses).toEqual([200, 409]);
		const row = (await t.kernel(session)).lessons.find(
			(l) => l.id === lessonId,
		);
		expect(row?.topic).toMatch(/^Tab [AB]$/);
	});
});

describe("enroll existing student (issue #122)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Enroll");
	});

	async function enroll(
		classId: string,
		body: Record<string, unknown>,
		who: TestSession = session,
	) {
		return t.call(`/api/classes/${classId}/enroll`, {
			session: who,
			method: "POST",
			body,
		});
	}

	test("happy path: enrollment creates invited, then accept activates package + generated lessons", async () => {
		const classId = await t.createClass(session, "Lớp enroll #122", {
			sessionsTotal: 24,
			tuitionFee: 600000,
			mode: "Offline",
		});
		const studentId = await t.addStudent(session, "HV có sẵn");

		const res = await enroll(classId, {
			studentId,
		});
		expect(res.status).toBe(201);
		const { id: enrollmentId } = (await res.json()) as { id: string };

		const initialSnapshot = await t.kernel(session);
		const initialEnrollment = findEnrollment(
			initialSnapshot,
			classId,
			studentId,
		);
		expect(initialEnrollment?.id).toBe(enrollmentId);
		expect(initialEnrollment?.status).toBe("invited");
		expect(
			initialSnapshot.packages.filter((p) => p.enrollmentId === enrollmentId),
		).toHaveLength(0);
		expect(
			initialSnapshot.lessons.filter((l) => l.enrollmentId === enrollmentId),
		).toHaveLength(0);

		// Accept
		const acceptRes = await t.call(`/api/enrollments/${enrollmentId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);

		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, classId, studentId);
		expect(enrollment?.status).toBe("active");

		const pkg = snapshot.packages.find((p) => p.enrollmentId === enrollmentId);
		expect(pkg).toMatchObject({
			studentId,
			classId,
			total: 24,
			price: 600000,
			mode: "Offline",
			status: "active",
			expiry: "",
		});
		expect(pkg?.start).not.toBe("");

		const lessons = snapshot.lessons.filter(
			(l) => l.enrollmentId === enrollmentId,
		);
		expect(lessons).toHaveLength(24);
	});

	test("package fields stay field-identical with the create-new branch (D1 derived from class)", async () => {
		const classId = await t.createClass(session, "Lớp enroll gói");
		const studentId = await t.addStudent(session, "HV gói chuẩn");
		const res = await enroll(classId, { studentId });
		expect(res.status).toBe(201);
		const { id: enrollmentId } = (await res.json()) as { id: string };
		const acceptRes = await t.call(`/api/enrollments/${enrollmentId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);

		const pkg = (await t.kernel(session)).packages.find(
			(p) => p.enrollmentId === enrollmentId,
		);
		// D1: mirrors class defaults (sessionsTotal 12, tuitionFee null -> 0, Online).
		expect(pkg).toMatchObject({
			total: 12,
			price: 0,
			mode: "Online",
			status: "active",
		});
	});

	test("404 class not found", async () => {
		const studentId = await t.addStudent(session, "HV lớp mất");
		const res = await enroll("no-such-class", { studentId });
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ error: "class not found" });
	});

	test("404 student not found", async () => {
		const classId = await t.createClass(session, "Lớp HV mất");
		const res = await enroll(classId, { studentId: "no-such-student" });
		expect(res.status).toBe(404);
		expect(await res.json()).toMatchObject({ error: "student not found" });
	});

	test("409 duplicate enroll for the same class", async () => {
		const classId = await t.createClass(session, "Lớp enroll trùng");
		const studentId = await t.addStudent(session, "HV trùng");
		expect((await enroll(classId, { studentId })).status).toBe(201);
		const again = await enroll(classId, { studentId });
		expect(again.status).toBe(409);
		expect(await again.json()).toMatchObject({
			error: "student already enrolled",
		});
	});

	test("org isolation: student of another org is 404", async () => {
		const classId = await t.createClass(session, "Lớp cross-org");
		const other = await t.insertUser("Cô Org Khác");
		const otherStudentId = await t.addStudent(other, "HV org khác");
		const res = await enroll(classId, { studentId: otherStudentId });
		expect(res.status).toBe(404);
	});
});

describe("student package minimums (issue #115)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Min Gói");
	});

	// D1: enroll derives package from class; extra fields in body are ignored
	test("enroll existing student ignores extra package fields (D1)", async () => {
		const classId = await t.createClass(session, "Lớp min gói");
		const studentId = await t.addStudent(session, "HV min gói");
		const res = await t.call(`/api/classes/${classId}/enroll`, {
			session,
			method: "POST",
			body: { studentId, total: 0, price: 400000, mode: "Online" },
		});
		expect(res.status).toBe(201);
		const { id: enrollmentId } = (await res.json()) as { id: string };
		const acceptRes = await t.call(`/api/enrollments/${enrollmentId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, classId, studentId);
		expect(
			snapshot.packages.find((p) => p.enrollmentId === enrollment?.id)?.total,
		).toBe(12);
	});

	test("POST /api/students route is removed and returns 404", async () => {
		const res = await t.call("/api/students", {
			session,
			method: "POST",
			body: {
				name: "HV test",
				phone: "0901234567",
				email: "hv@test.local",
			},
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/students route remains active and returns 200", async () => {
		const res = await t.call("/api/students", {
			session,
			method: "GET",
		});
		expect(res.status).toBe(200);
	});
});

describe("workspace settings persistence (issue #179)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let sessionA: TestSession;
	let sessionB: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		sessionA = await t.insertUser("Giáo viên A");
		sessionB = await t.insertUser("Giáo viên B");
	});

	test("GET returns default settings for new workspace", async () => {
		const res = await t.call("/api/kernel/settings", {
			session: sessionA,
			method: "GET",
		});
		expect(res.status).toBe(200);
		const settings = (await res.json()) as WorkspaceSettings;
		expect(settings).toMatchObject({
			defaultUnitPrice: "400.000đ",
			absenceNoticeHours: "2 giờ trước buổi học",
			unexcusedDeduct: "Có, trừ 1 buổi",
			maxAbsencesBeforeAlert: 2,
			reminderSchedule: "T−24h và T−1h",
			overdueDebtReminder: "Sau 3 ngày và 7 ngày",
			packageEndReminder: "Khi còn 3 buổi",
			preferredChannel: "Zalo trước, email dự phòng",
		});
		expect(typeof settings.tplReminder).toBe("string");
		expect(typeof settings.tplDebt).toBe("string");
		expect(typeof settings.tplReport).toBe("string");
	});

	test("PUT saves settings and GET returns updated values", async () => {
		const update = {
			defaultUnitPrice: "500.000đ",
			tplReminder: "Nhắc lịch mới: {{date}}",
			tplDebt: "Học phí mới: {{amount}}",
			tplReport: "Báo cáo mới: {{sessions}}",
			maxAbsencesBeforeAlert: 3,
			preferredChannel: "Chỉ Zalo",
		};
		const putRes = await t.call("/api/kernel/settings", {
			session: sessionA,
			method: "PUT",
			body: update,
		});
		expect(putRes.status).toBe(200);
		const putJson = (await putRes.json()) as WorkspaceSettings;
		expect(putJson).toMatchObject(update);
		expect(putJson.absenceNoticeHours).toBe("2 giờ trước buổi học"); // unchanged default

		// Verify persistence on subsequent GET
		const getRes = await t.call("/api/kernel/settings", {
			session: sessionA,
			method: "GET",
		});
		expect(getRes.status).toBe(200);
		const getJson = await getRes.json();
		expect(getJson).toMatchObject(update);
	});

	test("POST /api/kernel/settings also updates settings", async () => {
		const postRes = await t.call("/api/kernel/settings", {
			session: sessionA,
			method: "POST",
			body: {
				defaultUnitPrice: "600.000đ",
			},
		});
		expect(postRes.status).toBe(200);
		const postJson = (await postRes.json()) as WorkspaceSettings;
		expect(postJson.defaultUnitPrice).toBe("600.000đ");
		expect(postJson.tplReminder).toBe("Nhắc lịch mới: {{date}}"); // previous update kept
	});

	test("PUT rejects invalid payload with 400", async () => {
		const res = await t.call("/api/kernel/settings", {
			session: sessionA,
			method: "PUT",
			body: {
				maxAbsencesBeforeAlert: -5, // min is 0
			},
		});
		expect(res.status).toBe(400);
	});

	test("multi-tenant isolation: Org A settings do not leak to Org B", async () => {
		const resB = await t.call("/api/kernel/settings", {
			session: sessionB,
			method: "GET",
		});
		expect(resB.status).toBe(200);
		const jsonB = (await resB.json()) as WorkspaceSettings;
		// Org B should still have pristine defaults
		expect(jsonB.defaultUnitPrice).toBe("400.000đ");
		expect(jsonB.preferredChannel).toBe("Zalo trước, email dự phòng");
	});
});

describe("assignment prompt bank (issue #202)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;

	const validBody = {
		skill: "writing",
		part: "task2",
		type: "discuss",
		title: "Writing Task 2 — Discuss both views",
		band: "7.0",
		source: "Cambridge IELTS 10, Test 2",
		prompt:
			"Some people think that all university students should study whatever they like.\n\nDiscuss both these views and give your own opinion.",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		questions: [],
		note: "",
		status: "ready",
	};

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Giáo viên ngân hàng A");
		orgB = await t.insertUser("Giáo viên ngân hàng B");
	});

	test("POST ready prompt persists and lands in the snapshot (#202)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: validBody,
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		expect(id).toBeTruthy();

		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row).toMatchObject({
			id,
			task: "task2",
			genre: "discuss",
			title: "Writing Task 2 — Discuss both views",
			band: "7.0",
			source: "Cambridge IELTS 10, Test 2",
			status: "ready",
		});
	});

	test("POST draft keeps the draft status in the snapshot", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				...validBody,
				title: "Nháp 1",
				status: "draft",
				note: "cần duyệt",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row?.status).toBe("draft");
		expect(row?.note).toBe("cần duyệt");
	});

	test("POST rejects invalid bodies with 400", async () => {
		for (const body of [
			{ ...validBody, title: "" }, // blank title
			{ ...validBody, title: "  " }, // whitespace-only title
			{ ...validBody, prompt: "" }, // blank prompt
			{ ...validBody, skill: "math" }, // enum
			{ ...validBody, band: "8.0" }, // enum
			{ ...validBody, status: "sent" }, // enum
			{ ...validBody, extra: true }, // strict
			{ skill: "writing" }, // missing fields
		]) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body,
			});
			expect(res.status, JSON.stringify(body).slice(0, 60)).toBe(400);
		}
	});

	test("POST without a session is 401", async () => {
		const res = await t.call("/api/assignments/prompts", {
			method: "POST",
			body: validBody,
		});
		expect(res.status).toBe(401);
	});

	test("prompts are org-scoped: org B never sees org A's bank", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: { ...validBody, title: "Đề riêng của A" },
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const bankB = (await t.kernel(orgB)).assignmentPrompts;
		expect(bankB.some((r) => r.id === id)).toBe(false);
		expect(bankB.some((r) => r.title === "Đề riêng của A")).toBe(false);
	});

	test("POST reading ready prompt persists passage and parsed questions", async () => {
		const readingBody = {
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Reading Passage 1 — TFNG",
			band: "7.0",
			source: "Cambridge 10, Test 1",
			prompt: "",
			passage: "Stepwells are underground reservoirs found across India...",
			intro: "Questions 1-2\nDo the following statements agree...",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			questions: [
				{
					stem: "Stepwells were first built in the 20th century.",
					opts: null,
					answer: "FALSE",
					alts: "",
				},
				{
					stem: "Water stored in stepwells stays cool.",
					opts: null,
					answer: "TRUE",
					alts: "",
				},
			],
			note: "",
			status: "ready",
		};
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: readingBody,
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row).toMatchObject({
			id,
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Reading Passage 1 — TFNG",
			passage: "Stepwells are underground reservoirs found across India...",
			status: "ready",
		});
		expect(row?.questions).toHaveLength(2);
		expect(row?.questions?.[0]?.answer).toBe("FALSE");
		expect(row?.questions?.[1]?.answer).toBe("TRUE");
	});

	test("POST reading ready prompt rejects missing answer with 400", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Passage 1",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Some passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [
					{ stem: "Q1", opts: null, answer: "TRUE", alts: "" },
					{ stem: "Q2", opts: null, answer: "", alts: "" },
				],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST listening ready prompt rejects missing audioName with 400", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "listening",
				part: "s1",
				type: "form",
				title: "Listening S1",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q1", opts: null, answer: "answer", alts: "" }],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST listening draft prompt accepts missing audio and missing answer when stem present", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "listening",
				part: "s1",
				type: "form",
				title: "Listening Draft S1",
				band: "6.5",
				source: "",
				prompt: "",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q1", opts: null, answer: "", alts: "" }],
				note: "",
				status: "draft",
			},
		});
		expect(res.status).toBe(201);
	});

	test("POST reading draft prompt rejects missing passage with 400", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Draft",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "   ",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q1", opts: null, answer: "", alts: "" }],
				note: "",
				status: "draft",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST speaking part2 rejects missing cueTopic with 400", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "speaking",
				part: "part2",
				type: "place",
				title: "Speaking Part 2",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "  ",
				cuePoints: "where it is",
				audioName: "",
				questions: [],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST writing or speaking rejects non-empty questions with 400", async () => {
		for (const skill of ["writing", "speaking"] as const) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: {
					...validBody,
					skill,
					part: skill === "writing" ? "task2" : "part1",
					type: skill === "writing" ? "discuss" : "hometown",
					prompt: "Valid prompt text",
					questions: [{ stem: "Q1", opts: null, answer: "A", alts: "" }],
				},
			});
			expect(res.status).toBe(400);
		}
	});

	test("POST rejects questions exceeding 40 items with 400", async () => {
		const items = Array.from({ length: 41 }, (_, i) => ({
			stem: `Question ${i + 1}`,
			opts: null,
			answer: "TRUE",
			alts: "",
		}));
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Too Many Questions",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: items,
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST rejects invalid or cross-skill part/type combinations with 400", async () => {
		for (const [skill, part, type] of [
			["speaking", "task2", "discuss"],
			["reading", "task1", "chart"],
			["writing", "p1", "tfng"],
			["listening", "part2", "place"],
			["writing", "task2", "nonexistent"],
		] as const) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: {
					...validBody,
					skill,
					part,
					type,
				},
			});
			expect(res.status).toBe(400);
		}
	});

	test("POST rejects answer choices outside kind alphabet with 400", async () => {
		const resTfng = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "TFNG Invalid Choice",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q1", opts: null, answer: "BANANA", alts: "" }],
				note: "",
				status: "ready",
			},
		});
		expect(resTfng.status).toBe(400);

		const resMcq = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p3",
				type: "mcq",
				title: "MCQ Invalid Choice",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [
					{ stem: "Q1", opts: ["A", "B", "C", "D"], answer: "E", alts: "" },
				],
				note: "",
				status: "ready",
			},
		});
		expect(resMcq.status).toBe(400);
	});

	test("POST accepts every new reading type id from the 14-type catalog (#269)", async () => {
		for (const [part, type, answer] of [
			["p1", "note", "river"],
			["p1", "shortans", "1800"],
			["p1", "diagram", "steam"],
			["p2", "summary", "hot dry air"],
			["p2", "sentend", "A"],
			["p2", "tablecomp", "1834"],
			["p3", "features", "B"],
			["p3", "flowchart", "tunnelling"],
		] as const) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: {
					skill: "reading",
					part,
					type,
					title: `Reading ${type} — catalog`,
					band: "7.0",
					source: "",
					prompt: "",
					passage: "Passage",
					intro: "",
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					audioName: "",
					questions: [{ stem: "Q1", opts: null, answer, alts: "" }],
					note: "",
					status: "draft",
				},
			});
			expect(res.status, `${part}/${type}`).toBe(201);
		}
	});

	test("POST rejects answers outside A–H for the new matching types with 400 (#269)", async () => {
		for (const [part, type] of [
			["p2", "sentend"],
			["p3", "features"],
		] as const) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: {
					skill: "reading",
					part,
					type,
					title: `Reading ${type} invalid letter`,
					band: "7.0",
					source: "",
					prompt: "",
					passage: "Passage",
					intro: "",
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					audioName: "",
					questions: [{ stem: "Q1", opts: null, answer: "I", alts: "" }],
					note: "",
					status: "ready",
				},
			});
			expect(res.status, `${type} answer "I"`).toBe(400);
		}
	});

	test("POST reading diagram ready prompt rejects missing imageUrl with 400 (#269)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "diagram",
				title: "Reading Diagram — no image",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q1", opts: null, answer: "steam", alts: "" }],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST reading non-diagram ready prompt needs no imageUrl (#269)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p2",
				type: "summary",
				title: "Reading Summary — no image needed",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [
					{ stem: "Q1", opts: null, answer: "hot dry air", alts: "" },
				],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(201);
	});

	test("POST trims the imageUrl before persistence (#269)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "diagram",
				title: "Reading Diagram — padded URL",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "  https://example.com/padded.png  ",
				questions: [
					{
						stem: "Q1",
						opts: null,
						answer: "steam",
						alts: "",
						pin: { x: 50, y: 40 },
					},
				],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row?.imageUrl).toBe("https://example.com/padded.png");
	});

	test("POST rejects lowercase letter answers for matching types (#269)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p3",
				type: "features",
				title: "Reading Features — lowercase letter",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [{ stem: "Q29", opts: null, answer: "b", alts: "" }],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST rejects non-https imageUrl with 400 (#269)", async () => {
		for (const imageUrl of [
			"http://example.com/diagram.png",
			"javascript:alert(1)",
			"data:text/html,leak",
		]) {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: {
					skill: "reading",
					part: "p1",
					type: "diagram",
					title: "Reading Diagram — bad scheme",
					band: "7.0",
					source: "",
					prompt: "",
					passage: "Passage",
					intro: "",
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					audioName: "",
					imageUrl,
					questions: [{ stem: "Q1", opts: null, answer: "steam", alts: "" }],
					note: "",
					status: "draft",
				},
			});
			expect(res.status, imageUrl).toBe(400);
		}
	});

	test("POST reading diagram prompt persists imageUrl through the snapshot (#269)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "diagram",
				title: "Reading Diagram — with image",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "https://example.com/diagram.png",
				questions: [
					{
						stem: "Q1",
						opts: null,
						answer: "steam",
						alts: "",
						pin: { x: 25, y: 75 },
					},
				],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row?.imageUrl).toBe("https://example.com/diagram.png");
	});

	test("POST ready diagram without a pin is 400 (phase-04 FR2)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p1",
				type: "diagram",
				title: "Reading Diagram — missing pin",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "https://example.com/diagram.png",
				questions: [{ stem: "Q1", opts: null, answer: "steam", alts: "" }],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(400);
	});

	test("POST ready listening map requires image and pins (phase-04 FR2)", async () => {
		const base = {
			skill: "listening",
			part: "s2",
			type: "map",
			title: "Listening Map — gates",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "",
			intro: "Label the map.",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "section2.mp3",
			optionBank: ["Reception", "Cafe", "Gym"],
			questions: [
				{ stem: "Q11", opts: null, answer: "A", alts: "" },
				{ stem: "Q12", opts: null, answer: "B", alts: "" },
			],
			note: "",
			status: "ready",
		};
		// No image at all → 400.
		const noImage = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: base,
		});
		expect(noImage.status).toBe(400);
		// Image but one pin missing → 400.
		const missingPin = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				...base,
				imageUrl: "https://example.com/campus-map.png",
				questions: [
					{
						stem: "Q11",
						opts: null,
						answer: "A",
						alts: "",
						pin: { x: 20, y: 30 },
					},
					{ stem: "Q12", opts: null, answer: "B", alts: "" },
				],
			},
		});
		expect(missingPin.status).toBe(400);
		// Full set persists and the pins round-trip through the snapshot.
		const ok = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				...base,
				imageUrl: "https://example.com/campus-map.png",
				questions: [
					{
						stem: "Q11",
						opts: null,
						answer: "A",
						alts: "",
						pin: { x: 20, y: 30 },
					},
					{
						stem: "Q12",
						opts: null,
						answer: "B",
						alts: "",
						pin: { x: 80, y: 60 },
					},
				],
			},
		});
		expect(ok.status).toBe(201);
		const { id } = (await ok.json()) as { id: string };
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === id,
		);
		expect(row?.questions.map((question) => question.pin)).toEqual([
			{ x: 20, y: 30 },
			{ x: 80, y: 60 },
		]);
	});

	test("POST ready writing task1 map needs no image or pins (skill-qualified, phase-04 FR2)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "writing",
				part: "task1",
				type: "map",
				title: "Writing Task1 Map — never gated",
				band: "7.0",
				source: "",
				prompt: "The maps show the town centre in 1990 and today.",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [],
				note: "",
				status: "ready",
			},
		});
		expect(res.status).toBe(201);
	});

	test("POST question item with an unknown field is 400 (inner .strict(), phase-04)", async () => {
		const res = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "reading",
				part: "p2",
				type: "summary",
				title: "Reading Summary — unknown field",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [
					{
						stem: "Q1",
						opts: null,
						answer: "rain",
						alts: "",
						pinn: { x: 1, y: 2 },
					},
				],
				note: "",
				status: "draft",
			},
		});
		expect(res.status).toBe(400);
	});

	test("snapshot forwards legacy pins and nulls corrupt pins (phase-04 FR7)", async () => {
		const legacyId = crypto.randomUUID();
		await t.db.insert(schema.assignmentPrompt).values({
			id: legacyId,
			orgId: await t.orgIdOf(orgA),
			task: "task2",
			genre: "discuss",
			skill: "reading",
			part: "p1",
			type: "diagram",
			title: "Legacy diagram rows with pins",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "Passage",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			questions: JSON.stringify([
				{
					stem: "Q1",
					opts: null,
					answer: "boiler",
					alts: "",
					pin: { x: 10, y: 90 },
				},
				{
					stem: "Q2",
					opts: null,
					answer: "crankshaft",
					alts: "",
					pin: { x: 200, y: "bad" },
				},
				{ stem: "Q3", opts: null, answer: "valve", alts: "" },
			]),
			note: "",
			status: "draft",
		});
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === legacyId,
		);
		expect(row?.questions.map((question) => question.pin)).toEqual([
			{ x: 10, y: 90 },
			null,
			null,
		]);
	});

	test("snapshot falls back to empty imageUrl for legacy rows (#269)", async () => {
		const legacyId = crypto.randomUUID();
		await t.db.insert(schema.assignmentPrompt).values({
			id: legacyId,
			orgId: await t.orgIdOf(orgA),
			task: "task2",
			genre: "discuss",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Legacy row without image",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "Passage",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			questions: "[]",
			note: "",
			status: "draft",
		});
		const row = (await t.kernel(orgA)).assignmentPrompts.find(
			(r) => r.id === legacyId,
		);
		expect(row?.imageUrl).toBe("");
	});

	test("snapshot projection safely parses corrupt or 'null' questions without crashing", async () => {
		const corruptId = crypto.randomUUID();
		await t.db.insert(schema.assignmentPrompt).values({
			id: corruptId,
			orgId: await t.orgIdOf(orgA),
			task: "task2",
			genre: "discuss",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Corrupt questions",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "Passage",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			questions: "null",
			note: "",
			status: "draft",
		});
		const snapshot = await t.kernel(orgA);
		const row = snapshot.assignmentPrompts.find((r) => r.id === corruptId);
		expect(row).toBeDefined();
		expect(row?.questions).toEqual([]);
	});

	describe("option bank (phase-02 FR2/FR7)", () => {
		const bankBody = (overrides: Record<string, unknown> = {}) => ({
			skill: "reading",
			part: "p3",
			type: "features",
			title: "Reading Features — bank",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "Passage",
			intro: "Match each feature with the correct person.",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: ["Ada", "Brunel", "Curie", "Darwin", "Einstein"],
			questions: [
				{ stem: "Q27", opts: null, answer: "A", alts: "" },
				{ stem: "Q28", opts: null, answer: "B", alts: "" },
				{ stem: "Q29", opts: null, answer: "C", alts: "" },
				{ stem: "Q30", opts: null, answer: "A", alts: "" },
			],
			note: "",
			status: "ready",
			...overrides,
		});

		test("POST ready features with a full bank persists optionBank through the snapshot (round-trip)", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					optionBank: ["  Ada ", "Brunel", "Curie", "Darwin", "Einstein"],
				}),
			});
			expect(res.status).toBe(201);
			const { id } = (await res.json()) as { id: string };
			const row = (await t.kernel(orgA)).assignmentPrompts.find(
				(r) => r.id === id,
			);
			expect(row?.optionBank).toEqual([
				"Ada",
				"Brunel",
				"Curie",
				"Darwin",
				"Einstein",
			]);
		});

		test("POST ready bankable without a bank is 400", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({ optionBank: [] }),
			});
			expect(res.status).toBe(400);
		});

		test("POST ready bankable with fewer bank items than questions is 400", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					optionBank: ["Ada", "Brunel", "Curie"],
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST ready bankable with a single bank item is 400 (min 2)", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					optionBank: ["Ada"],
					questions: [{ stem: "Q27", opts: null, answer: "A", alts: "" }],
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST ready bankable with more than 8 questions is 400 (labels A–H only)", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					questions: Array.from({ length: 9 }, (_, i) => ({
						stem: `Q${i}`,
						opts: null,
						answer: "A",
						alts: "",
					})),
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST ready bankable with an answer beyond the bank length is 400", async () => {
			// Bank has 5 items → labels A–E; "F" would point outside the bank.
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					questions: [{ stem: "Q27", opts: null, answer: "F", alts: "" }],
				}),
			});
			expect(res.status).toBe(400);
		});

		test("POST ready sentend rejects duplicate labels with 400; features may reuse", async () => {
			const dupBody = {
				questions: [
					{ stem: "Q34", opts: null, answer: "A", alts: "" },
					{ stem: "Q35", opts: null, answer: "A", alts: "" },
				],
			};
			const sentend = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					part: "p2",
					type: "sentend",
					...dupBody,
				}),
			});
			expect(sentend.status).toBe(400);

			const features = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody(dupBody),
			});
			expect(features.status).toBe(201);
		});

		test("POST draft bankable accepts a partial bank and no answers (rules gate ready only)", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					status: "draft",
					optionBank: ["Ada"],
					questions: [{ stem: "Q27", opts: null, answer: "", alts: "" }],
				}),
			});
			expect(res.status).toBe(201);
		});

		test("POST rejects a bank on non-bankable types — including writing task1 map (skill-qualified)", async () => {
			for (const [skill, part, type] of [
				["reading", "p1", "tfng"],
				["writing", "task1", "map"],
			] as const) {
				const res = await t.call("/api/assignments/prompts", {
					session: orgA,
					method: "POST",
					body: {
						...bankBody({
							questions: [],
						}),
						skill,
						part,
						type,
						title: `Non-bankable ${skill} ${type}`,
						prompt: skill === "writing" ? "Prompt text" : "",
						optionBank: ["Ada", "Brunel"],
					},
				});
				expect(res.status, `${skill}/${type}`).toBe(400);
			}
		});

		test("POST rejects empty, over-cap and over-count bank items with 400", async () => {
			for (const optionBank of [
				["Ada", ""],
				["Ada", " ".repeat(1)],
				["Ada", "x".repeat(201)],
				Array.from({ length: 9 }, (_, i) => `Item ${i}`),
			]) {
				const res = await t.call("/api/assignments/prompts", {
					session: orgA,
					method: "POST",
					body: bankBody({ optionBank }),
				});
				expect(res.status, JSON.stringify(optionBank).slice(0, 40)).toBe(400);
			}
		});

		test("snapshot defaults missing or corrupt option_bank to [] for legacy rows", async () => {
			const orgId = await t.orgIdOf(orgA);
			const legacyId = crypto.randomUUID();
			await t.db.insert(schema.assignmentPrompt).values({
				id: legacyId,
				orgId,
				task: "task2",
				genre: "discuss",
				skill: "reading",
				part: "p2",
				type: "headings",
				title: "Legacy row without bank",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: "[]",
				note: "",
				status: "draft",
			});
			const corruptId = crypto.randomUUID();
			await t.db.insert(schema.assignmentPrompt).values({
				id: corruptId,
				orgId,
				task: "task2",
				genre: "discuss",
				skill: "reading",
				part: "p2",
				type: "headings",
				title: "Corrupt bank JSON",
				band: "7.0",
				source: "",
				prompt: "",
				passage: "Passage",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: "[]",
				optionBank: "not-json",
				note: "",
				status: "draft",
			});
			const rows = (await t.kernel(orgA)).assignmentPrompts;
			expect(rows.find((r) => r.id === legacyId)?.optionBank).toEqual([]);
			expect(rows.find((r) => r.id === corruptId)?.optionBank).toEqual([]);
		});

		test("POST ready headings accepts a roman-labeled bank round-trip", async () => {
			const res = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					part: "p2",
					type: "headings",
					title: "Reading Headings — roman bank",
					optionBank: ["Liệt kê I", "Liệt kê II", "Liệt kê III"],
					questions: [
						{ stem: "Paragraph A", opts: null, answer: "i", alts: "" },
						{ stem: "Paragraph B", opts: null, answer: "ii", alts: "" },
						{ stem: "Paragraph C", opts: null, answer: "iii", alts: "" },
					],
				}),
			});
			expect(res.status).toBe(201);
			const { id } = (await res.json()) as { id: string };
			const row = (await t.kernel(orgA)).assignmentPrompts.find(
				(r) => r.id === id,
			);
			expect(row?.optionBank).toEqual([
				"Liệt kê I",
				"Liệt kê II",
				"Liệt kê III",
			]);
		});

		// #286 — per-question type: snapshot PHẢI forward type (strip nó thì
		// mọi edit/Apply qua test-builder xoá âm thầm type đã soạn), và PATCH
		// mirror validation của create (catalog part + answer-choice theo
		// type hiệu dụng của câu).
		test("per-question type survives the snapshot round-trip and PATCH mirrors create validation (#286)", async () => {
			const post = await t.call("/api/assignments/prompts", {
				session: orgA,
				method: "POST",
				body: bankBody({
					part: "p1",
					type: "note",
					title: "Reading Mixed — per-question type",
					optionBank: [],
					questions: [
						{
							stem: "Statement one",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: "tfng",
						},
						{ stem: "Note ____ two", opts: null, answer: "river", alts: "" },
					],
				}),
			});
			expect(post.status).toBe(201);
			const { id } = (await post.json()) as { id: string };
			const row = (await t.kernel(orgA)).assignmentPrompts.find(
				(r) => r.id === id,
			);
			expect(row?.questions).toEqual([
				{
					stem: "Statement one",
					opts: null,
					answer: "TRUE",
					alts: "",
					type: "tfng",
					pin: null,
				},
				{
					stem: "Note ____ two",
					opts: null,
					answer: "river",
					alts: "",
					type: null,
					pin: null,
				},
			]);

			// PATCH: type câu ngoài catalog part (flowchart là type p3) → 400.
			const badType = await t.call(`/api/assignments/prompts/${id}`, {
				session: orgA,
				method: "PATCH",
				body: {
					questions: [
						{
							stem: "Statement one",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: "flowchart",
						},
					],
				},
			});
			expect(badType.status).toBe(400);

			// PATCH: answer không thuộc bộ choice của type HIỆU DỤNG câu → 400
			// (trước #286 update chỉ soi type prompt là note → bỏ qua).
			const badChoice = await t.call(`/api/assignments/prompts/${id}`, {
				session: orgA,
				method: "PATCH",
				body: {
					questions: [
						{
							stem: "Statement one",
							opts: null,
							answer: "maybe",
							alts: "",
							type: "tfng",
						},
					],
				},
			});
			expect(badChoice.status).toBe(400);

			// PATCH kiểu client THẬT (Apply/edit luôn gửi type prompt + full
			// questions): đề prompt note + câu tfng answer hợp lệ KHÔNG bị
			// superRefine ép choice của prompt type lên mọi câu (finding re-run
			// #1 — schema cũ false-reject payload này mù field).
			const realClient = await t.call(`/api/assignments/prompts/${id}`, {
				session: orgA,
				method: "PATCH",
				body: {
					type: "note",
					questions: [
						{
							stem: "Statement one",
							opts: null,
							answer: "TRUE",
							alts: "",
							type: "tfng",
						},
						{ stem: "Note ____ two", opts: null, answer: "river", alts: "" },
					],
				},
			});
			expect(realClient.status).toBe(200);

			// PATCH hợp lệ: type câu thuộc catalog + answer hợp kind → persist.
			const good = await t.call(`/api/assignments/prompts/${id}`, {
				session: orgA,
				method: "PATCH",
				body: {
					title: "Reading Mixed — edited",
					questions: [
						{
							stem: "Statement one",
							opts: null,
							answer: "FALSE",
							alts: "",
							type: "tfng",
						},
						{ stem: "Note ____ two", opts: null, answer: "river", alts: "" },
					],
				},
			});
			expect(good.status).toBe(200);
			const edited = (await t.kernel(orgA)).assignmentPrompts.find(
				(r) => r.id === id,
			);
			expect(edited?.title).toBe("Reading Mixed — edited");
			expect(edited?.questions[0]).toMatchObject({
				answer: "FALSE",
				type: "tfng",
			});
			expect(edited?.questions[1]).toMatchObject({ type: null });
		});
	});
});

describe("class assignment give flow (#208)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let orgA: TestSession;
	let orgB: TestSession;
	let classIdA: string;
	let studentIdA1: string;
	let studentIdA2: string;
	let promptReadyA: string;
	let promptDraftA: string;

	beforeAll(async () => {
		t = await createTestApp();
		orgA = await t.insertUser("Teacher A");
		orgB = await t.insertUser("Teacher B");

		// Bootstrap orgs via snapshot
		await t.kernel(orgA);
		await t.kernel(orgB);

		// Create class for Org A
		classIdA = await t.createClass(orgA, "Lớp IELTS Tối");

		// Create 2 students for Org A enrolled in classIdA
		studentIdA1 = await t.addActiveStudent(orgA, "Học viên A1", {
			classId: classIdA,
		});
		studentIdA2 = await t.addActiveStudent(orgA, "Học viên A2", {
			classId: classIdA,
		});

		// Create prompts in Org A
		const pReadyRes = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "writing",
				part: "task2",
				type: "opinion",
				title: "Writing Task 2 — Ready",
				band: "7.0",
				source: "Cambridge 12",
				prompt: "Some people think...",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [],
				note: "",
				status: "ready",
			},
		});
		promptReadyA = ((await pReadyRes.json()) as { id: string }).id;

		const pDraftRes = await t.call("/api/assignments/prompts", {
			session: orgA,
			method: "POST",
			body: {
				skill: "writing",
				part: "task1",
				type: "chart",
				title: "Writing Task 1 — Draft",
				band: "6.5",
				source: "",
				prompt: "The chart below shows...",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [],
				note: "",
				status: "draft",
			},
		});
		promptDraftA = ((await pDraftRes.json()) as { id: string }).id;
	});

	test("happy-path: gives assignment to class, snapshot contains row with null submittedAt", async () => {
		const res = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: {
				promptId: promptReadyA,
				due: "2030-01-15",
				note: "Nộp đúng hạn",
				studentIds: [studentIdA1, studentIdA2],
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		expect(id).toBeTruthy();

		const snapshot = await t.kernel(orgA);
		const assigned = snapshot.classAssignments.find((a) => a.id === id);
		expect(assigned).toBeDefined();
		expect(assigned).toMatchObject({
			id,
			classId: classIdA,
			promptId: promptReadyA,
			title: "Writing Task 2 — Ready",
			due: "2030-01-15",
			note: "Nộp đúng hạn",
		});
		expect(assigned?.targets).toHaveLength(2);
		expect(assigned?.targets).toEqual(
			expect.arrayContaining([
				{
					studentId: studentIdA1,
					submittedAt: null,
					attemptId: null,
					gradedAt: null,
					band: null,
				},
				{
					studentId: studentIdA2,
					submittedAt: null,
					attemptId: null,
					gradedAt: null,
					band: null,
				},
			]),
		);
	});

	test("due today in VN timezone is accepted", async () => {
		const todayVN = vietnamTodayISO();
		const res = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: {
				promptId: promptReadyA,
				due: todayVN,
				note: "",
				studentIds: [studentIdA1],
			},
		});
		expect(res.status).toBe(201);
	});

	test("matrix: 400 rejects invalid bodies", async () => {
		const baseValid = {
			promptId: promptReadyA,
			due: "2030-01-15",
			note: "",
			studentIds: [studentIdA1],
		};

		// 1. Due calendar nonexistent (2030-02-30)
		const resCalendar = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, due: "2030-02-30" },
		});
		expect(resCalendar.status).toBe(400);

		// 2. Due in the past (2020-01-01)
		const resPast = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, due: "2020-01-01" },
		});
		expect(resPast.status).toBe(400);

		// 3. studentIds empty
		const resEmpty = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, studentIds: [] },
		});
		expect(resEmpty.status).toBe(400);

		// 4. studentIds duplicates
		const resDupe = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, studentIds: [studentIdA1, studentIdA1] },
		});
		expect(resDupe.status).toBe(400);

		// 5. studentId not enrolled in class
		const resNotEnrolled = await t.call(
			`/api/classes/${classIdA}/assignments`,
			{
				session: orgA,
				method: "POST",
				body: { ...baseValid, studentIds: ["non-existent-student"] },
			},
		);
		expect(resNotEnrolled.status).toBe(400);

		// 6. prompt is draft
		const resDraft = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, promptId: promptDraftA },
		});
		expect(resDraft.status).toBe(400);

		// 7. Extra field (.strict())
		const resStrict = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, extraField: "not-allowed" },
		});
		expect(resStrict.status).toBe(400);

		// 8. studentIds over 100
		const manyStudents = Array.from({ length: 101 }, (_, i) => `s-${i}`);
		const resTooMany = await t.call(`/api/classes/${classIdA}/assignments`, {
			session: orgA,
			method: "POST",
			body: { ...baseValid, studentIds: manyStudents },
		});
		expect(resTooMany.status).toBe(400);
	});

	test("401 when unauthorized", async () => {
		const res = await t.call(`/api/classes/${classIdA}/assignments`, {
			method: "POST",
			body: {
				promptId: promptReadyA,
				due: "2030-01-15",
				note: "",
				studentIds: [studentIdA1],
			},
		});
		expect(res.status).toBe(401);
	});

	test("404 when class or prompt not found in org", async () => {
		// Non-existent class
		const resNoClass = await t.call(
			"/api/classes/non-existent-class/assignments",
			{
				session: orgA,
				method: "POST",
				body: {
					promptId: promptReadyA,
					due: "2030-01-15",
					note: "",
					studentIds: [studentIdA1],
				},
			},
		);
		expect(resNoClass.status).toBe(404);

		// Prompt of Org A called by Org B
		const resForeignPrompt = await t.call(
			`/api/classes/${classIdA}/assignments`,
			{
				session: orgA,
				method: "POST",
				body: {
					promptId: "non-existent-prompt",
					due: "2030-01-15",
					note: "",
					studentIds: [studentIdA1],
				},
			},
		);
		expect(resForeignPrompt.status).toBe(404);
	});

	test("org-scoping: Org B does not see Org A's class assignments", async () => {
		const snapshotB = await t.kernel(orgB);
		const found = snapshotB.classAssignments.find(
			(ca) => ca.classId === classIdA,
		);
		expect(found).toBeUndefined();
	});

	test("cap 200 assignments per class rejects with 400", async () => {
		// Create a separate class for cap test
		const capClassId = await t.createClass(orgA, "Lớp Cap Test");

		// Enroll studentIdA1 in capClassId
		const enrollRes = await t.call(`/api/classes/${capClassId}/enroll`, {
			session: orgA,
			method: "POST",
			body: {
				studentId: studentIdA1,
			},
		});
		expect(enrollRes.status).toBe(201);
		const { id: capEnrollmentId } = (await enrollRes.json()) as { id: string };
		const acceptRes = await t.call(
			`/api/enrollments/${capEnrollmentId}/accept`,
			{
				session: orgA,
				method: "POST",
				body: {},
			},
		);
		expect(acceptRes.status).toBe(200);
		// Insert 200 dummy rows into class_assignment for this class
		const orgId = await t.orgIdOf(orgA);
		const batchStatements = Array.from({ length: 200 }, () =>
			t.db.insert(schema.classAssignment).values({
				id: crypto.randomUUID(),
				orgId,
				classId: capClassId,
				promptId: promptReadyA,
				title: "Dummy Prompt",
				due: "2030-01-01",
				note: "",
			}),
		);
		const [first, ...rest] = batchStatements;
		if (first) {
			await t.db.batch([first, ...rest]);
		}

		// Now the 201st assignment must be rejected
		const res = await t.call(`/api/classes/${capClassId}/assignments`, {
			session: orgA,
			method: "POST",
			body: {
				promptId: promptReadyA,
				due: "2030-01-15",
				note: "",
				studentIds: [studentIdA1],
			},
		});
		expect(res.status).toBe(400);
		const body = await res.json();
		expect(body).toMatchObject({ error: "assignment limit reached" });
	});
});

describe("class tuition fee (học phí lớp theo học viên - issue #227)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let orgOther: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Teacher Fee");
		orgOther = await t.insertUser("Teacher Other Org");
		await t.kernel(session);
		await t.kernel(orgOther);
	});

	test("create class with tuitionFee persists and returns in snapshot", async () => {
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			body: {
				name: "Lớp có học phí",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "01/10",
				tuitionFee: 5_000_000,
			},
		});
		expect(res.status).toBe(201);
		const { id: classId } = (await res.json()) as { id: string };

		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.tuitionFee).toBe(5_000_000);
	});

	test("create class without tuitionFee leaves tuitionFee null", async () => {
		const classId = await t.createClass(session, "Lớp không học phí");
		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.tuitionFee).toBeNull();
	});

	test("POST /classes/:id/tuition-fee updates tuition fee and reflects in snapshot", async () => {
		const classId = await t.createClass(session, "Lớp cập nhật phí");
		const updateRes = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: 6_000_000 },
		});
		expect(updateRes.status).toBe(200);
		expect(await updateRes.json()).toEqual({ ok: true });

		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.tuitionFee).toBe(6_000_000);
	});

	test("POST /classes/:id/tuition-fee with null clears tuition fee", async () => {
		const res = await t.call("/api/classes", {
			session,
			method: "POST",
			body: {
				name: "Lớp xóa học phí",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "01/10",
				tuitionFee: 4_500_000,
			},
		});
		const { id: classId } = (await res.json()) as { id: string };

		const clearRes = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: null },
		});
		expect(clearRes.status).toBe(200);

		const snapshot = await t.kernel(session);
		const cls = snapshot.classes.find((c) => c.id === classId);
		expect(cls?.tuitionFee).toBeNull();
	});

	test("POST /classes/:id/tuition-fee rejects invalid values (<= 0, non-integer, extra fields)", async () => {
		const classId = await t.createClass(session, "Lớp test validate");

		// 0
		const resZero = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: 0 },
		});
		expect(resZero.status).toBe(400);

		// negative
		const resNeg = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: -100_000 },
		});
		expect(resNeg.status).toBe(400);

		// decimal / float
		const resFloat = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: 1.5 },
		});
		expect(resFloat.status).toBe(400);

		// extra field (.strict())
		const resStrict = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: 1_000_000, extra: "invalid" },
		});
		expect(resStrict.status).toBe(400);
	});

	test("POST /classes/:id/tuition-fee returns 404 for class belonging to different org or non-existent", async () => {
		const classId = await t.createClass(session, "Lớp của session");

		// Cross-org call
		const resCross = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session: orgOther,
			method: "POST",
			body: { tuitionFee: 1_000_000 },
		});
		expect(resCross.status).toBe(404);
		expect(await resCross.json()).toEqual({ error: "class not found" });

		// Non-existent
		const resNonExistent = await t.call(
			"/api/classes/non-existent-id/tuition-fee",
			{
				session,
				method: "POST",
				body: { tuitionFee: 1_000_000 },
			},
		);
		expect(resNonExistent.status).toBe(404);
	});
});

describe("enrollment invite -> accept lifecycle (issue #253)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let session: TestSession;
	let otherOrg: TestSession;

	beforeAll(async () => {
		t = await createTestApp();
		session = await t.insertUser("Cô Lifecycle");
		otherOrg = await t.insertUser("Cô Khác Org Lifecycle");
		await t.kernel(session);
		await t.kernel(otherOrg);
	});

	test("POST /students with classId creates enrollment invited, 0 packages, 0 lessons", async () => {
		const classId = await t.createClass(session, "Lớp Invite 1", {
			sessionsTotal: 10,
		});
		const studentId = await t.addStudent(session, "HV Mới 1", { classId });

		const snap = await t.kernel(session);
		const en = snap.enrollments.find(
			(e) => e.classId === classId && e.studentId === studentId,
		);
		expect(en).toBeDefined();
		expect(en?.status).toBe("invited");
		expect(snap.packages.filter((p) => p.enrollmentId === en?.id)).toHaveLength(
			0,
		);
		expect(snap.lessons.filter((l) => l.enrollmentId === en?.id)).toHaveLength(
			0,
		);
	});

	test("POST /classes/:id/enroll creates enrollment invited, 0 packages, 0 lessons", async () => {
		const classId = await t.createClass(session, "Lớp Invite 2", {
			sessionsTotal: 10,
		});
		const studentId = await t.addStudent(session, "HV Sẵn 2");
		const res = await t.call(`/api/classes/${classId}/enroll`, {
			session,
			method: "POST",
			body: { studentId },
		});
		expect(res.status).toBe(201);
		const { id: enrollmentId } = (await res.json()) as { id: string };

		const snap = await t.kernel(session);
		const en = snap.enrollments.find((e) => e.id === enrollmentId);
		expect(en?.status).toBe("invited");
		expect(
			snap.packages.filter((p) => p.enrollmentId === enrollmentId),
		).toHaveLength(0);
		expect(
			snap.lessons.filter((l) => l.enrollmentId === enrollmentId),
		).toHaveLength(0);
	});

	test("POST /api/enrollments/:id/accept transitions invited -> active, generates package and lessons", async () => {
		const classId = await t.createClass(session, "Lớp Accept Test", {
			sessionsTotal: 8,
			tuitionFee: 800000,
			mode: "Offline",
		});
		const studentId = await t.addStudent(session, "HV Chờ Accept", { classId });
		const snapBefore = await t.kernel(session);
		const en = snapBefore.enrollments.find(
			(e) => e.classId === classId && e.studentId === studentId,
		);
		expect(en?.status).toBe("invited");

		const acceptRes = await t.call(`/api/enrollments/${en?.id}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);
		expect(await acceptRes.json()).toEqual({ ok: true });

		const snapAfter = await t.kernel(session);
		const enAfter = snapAfter.enrollments.find((e) => e.id === en?.id);
		expect(enAfter?.status).toBe("active");

		const pkgs = snapAfter.packages.filter((p) => p.enrollmentId === en?.id);
		expect(pkgs).toHaveLength(1);
		expect(pkgs[0]).toMatchObject({
			classId,
			studentId,
			total: 8,
			price: 800000,
			mode: "Offline",
			status: "active",
		});

		const lessons = snapAfter.lessons.filter((l) => l.enrollmentId === en?.id);
		expect(lessons).toHaveLength(8);
	});

	test("accept is idempotent on sequential calls", async () => {
		const classId = await t.createClass(session, "Lớp Idempotent", {
			sessionsTotal: 6,
		});
		await t.addStudent(session, "HV Idempotent", { classId });
		const snap = await t.kernel(session);
		const enId = snap.enrollments.find((e) => e.classId === classId)?.id ?? "";

		const first = await t.call(`/api/enrollments/${enId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(first.status).toBe(200);

		const second = await t.call(`/api/enrollments/${enId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(second.status).toBe(200);

		const snapAfter = await t.kernel(session);
		expect(
			snapAfter.packages.filter((p) => p.enrollmentId === enId),
		).toHaveLength(1);
		expect(
			snapAfter.lessons.filter((l) => l.enrollmentId === enId),
		).toHaveLength(6);
	});

	test("concurrent accept race: two requests in parallel both succeed without 500 or duplicate packages", async () => {
		const classId = await t.createClass(session, "Lớp Race Accept", {
			sessionsTotal: 6,
		});
		await t.addStudent(session, "HV Race Accept", { classId });
		const snap = await t.kernel(session);
		const enId = snap.enrollments.find((e) => e.classId === classId)?.id ?? "";

		// Fire two parallel accept requests
		const [resA, resB] = await Promise.all([
			t.call(`/api/enrollments/${enId}/accept`, {
				session,
				method: "POST",
				body: {},
			}),
			t.call(`/api/enrollments/${enId}/accept`, {
				session,
				method: "POST",
				body: {},
			}),
		]);

		expect(resA.status).toBe(200);
		expect(resB.status).toBe(200);

		const snapAfter = await t.kernel(session);
		expect(snapAfter.enrollments.find((e) => e.id === enId)?.status).toBe(
			"active",
		);
		expect(
			snapAfter.packages.filter((p) => p.enrollmentId === enId),
		).toHaveLength(1);
		expect(
			snapAfter.lessons.filter((l) => l.enrollmentId === enId),
		).toHaveLength(6);
	});

	test("accept returns 404 for unknown id or cross-org enrollment", async () => {
		const resNotFound = await t.call(
			`/api/enrollments/${crypto.randomUUID()}/accept`,
			{
				session,
				method: "POST",
				body: {},
			},
		);
		expect(resNotFound.status).toBe(404);

		const otherClassId = await t.createClass(otherOrg, "Lớp của Other Org");
		await t.addStudent(otherOrg, "HV Other", {
			classId: otherClassId,
		});
		const otherSnap = await t.kernel(otherOrg);
		const otherEnId =
			otherSnap.enrollments.find((e) => e.classId === otherClassId)?.id ?? "";

		const resCross = await t.call(`/api/enrollments/${otherEnId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(resCross.status).toBe(404);
	});

	test("DELETE /api/enrollments/:id deletes invited enrollment and allows re-enrolling", async () => {
		const classId = await t.createClass(session, "Lớp Cancel Test");
		const studentId = await t.addStudent(session, "HV Hủy Lời Mời", {
			classId,
		});
		const snapBefore = await t.kernel(session);
		const en = snapBefore.enrollments.find(
			(e) => e.classId === classId && e.studentId === studentId,
		);
		expect(en?.status).toBe("invited");

		const deleteRes = await t.call(`/api/enrollments/${en?.id}`, {
			session,
			method: "DELETE",
		});
		expect(deleteRes.status).toBe(200);
		expect(await deleteRes.json()).toEqual({ ok: true });

		const snapDeleted = await t.kernel(session);
		expect(
			snapDeleted.enrollments.filter(
				(e) => e.classId === classId && e.studentId === studentId,
			),
		).toHaveLength(0);

		// Re-enrolling same student into the class succeeds without 409
		const reEnrollRes = await t.call(`/api/classes/${classId}/enroll`, {
			session,
			method: "POST",
			body: { studentId },
		});
		expect(reEnrollRes.status).toBe(201);
	});

	test("DELETE /api/enrollments/:id returns 409 for active enrollment", async () => {
		const classId = await t.createClass(session, "Lớp Delete Active");
		const studentId = await t.addActiveStudent(session, "HV Active Delete", {
			classId,
		});
		const snap = await t.kernel(session);
		const enId =
			snap.enrollments.find(
				(e) => e.classId === classId && e.studentId === studentId,
			)?.id ?? "";

		const deleteRes = await t.call(`/api/enrollments/${enId}`, {
			session,
			method: "DELETE",
		});
		expect(deleteRes.status).toBe(409);
		expect(await deleteRes.json()).toEqual({
			error: "cannot delete active enrollment",
		});
	});

	test("DELETE /api/enrollments/:id returns 404 for unknown or cross-org enrollment", async () => {
		const resNotFound = await t.call(
			`/api/enrollments/${crypto.randomUUID()}`,
			{
				session,
				method: "DELETE",
			},
		);
		expect(resNotFound.status).toBe(404);

		const otherClassId = await t.createClass(otherOrg, "Lớp Other Delete");
		await t.addStudent(otherOrg, "HV Other Del", {
			classId: otherClassId,
		});
		const otherSnap = await t.kernel(otherOrg);
		const otherEnId =
			otherSnap.enrollments.find((e) => e.classId === otherClassId)?.id ?? "";

		const resCross = await t.call(`/api/enrollments/${otherEnId}`, {
			session,
			method: "DELETE",
		});
		expect(resCross.status).toBe(404);
	});

	test("assignments rejects studentIds containing invited student with 400", async () => {
		const classId = await t.createClass(session, "Lớp Assign Guard");
		const invitedId = await t.addStudent(session, "HV Invited Assign", {
			classId,
		});
		const activeId = await t.addActiveStudent(session, "HV Active Assign", {
			classId,
		});

		const pRes = await t.call("/api/assignments/prompts", {
			session,
			method: "POST",
			body: {
				skill: "writing",
				part: "task2",
				type: "opinion",
				title: "Prompt Guard",
				band: "7.0",
				source: "",
				prompt: "prompt",
				passage: "",
				intro: "",
				transcript: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				questions: [],
				note: "",
				status: "ready",
			},
		});
		const promptPayload = (await pRes.json()) as { id: string };
		const promptId = promptPayload.id;

		// Attempt to assign with invited student
		const resInvited = await t.call(`/api/classes/${classId}/assignments`, {
			session,
			method: "POST",
			body: {
				promptId,
				due: "2030-01-15",
				note: "",
				studentIds: [invitedId],
			},
		});
		expect(resInvited.status).toBe(400);
		expect(await resInvited.json()).toMatchObject({
			error: "student not enrolled",
		});

		// Active student succeeds
		const resActive = await t.call(`/api/classes/${classId}/assignments`, {
			session,
			method: "POST",
			body: {
				promptId,
				due: "2030-01-15",
				note: "",
				studentIds: [activeId],
			},
		});
		expect(resActive.status).toBe(201);
	});

	test("tuitionFee drift: accept uses tuitionFee at time of accept as package price", async () => {
		const classId = await t.createClass(session, "Lớp Fee Drift", {
			tuitionFee: 500000,
		});
		await t.addStudent(session, "HV Fee Drift", { classId });
		const snapInit = await t.kernel(session);
		const enId =
			snapInit.enrollments.find((e) => e.classId === classId)?.id ?? "";

		// Teacher updates class tuition fee before accept
		const feeRes = await t.call(`/api/classes/${classId}/tuition-fee`, {
			session,
			method: "POST",
			body: { tuitionFee: 750000 },
		});
		expect(feeRes.status).toBe(200);

		// Now accept
		const acceptRes = await t.call(`/api/enrollments/${enId}/accept`, {
			session,
			method: "POST",
			body: {},
		});
		expect(acceptRes.status).toBe(200);

		const snapAfter = await t.kernel(session);
		const pkg = snapAfter.packages.find((p) => p.enrollmentId === enId);
		expect(pkg?.price).toBe(750000);
	});
});
