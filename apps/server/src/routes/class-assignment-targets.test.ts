import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import {
	CLASS_ERROR_CODES,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const TEACHER_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const CORS_ORIGINS = [TEACHER_ORIGIN, STUDENT_ORIGIN];
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const USERS: Record<string, SessionUser> = {
	"teacher-1": {
		userId: "t-1",
		userName: "Cô Lan",
		email: "lan@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"teacher-2": {
		userId: "t-2",
		userName: "Thầy Nam",
		email: "nam@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"ta-1": {
		userId: "ta-1",
		userName: "Trợ giảng Tuấn",
		email: "tuan@test.local",
		emailVerified: true,
		role: "teacher",
	},
	"student-2": {
		userId: "u-stu-2",
		userName: "Học viên 2",
		email: "st2@student.local",
		emailVerified: true,
		role: "student",
	},
	"student-3": {
		userId: "u-stu-3",
		userName: "Học viên 3",
		email: "st3@student.local",
		emailVerified: true,
		role: "student",
	},
};

async function createTestHarness(initialNowIso = "2026-10-10T03:00:00.000Z") {
	const client = createClient({ url: "file::memory:" });
	await client.execute("PRAGMA foreign_keys = ON");
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	let now = new Date(initialNowIso);
	const app: ServerApp = buildApp({
		getDb: () => db,
		corsOrigin: CORS_ORIGINS,
		getSessionUser: async (headers) => {
			const key = headers.get("x-test-user");
			return key ? (USERS[key] ?? null) : null;
		},
		authHandler: () => new Response("auth stub", { status: 404 }),
		now: () => now,
	});

	await db.insert(schema.organization).values([
		{ id: "org-1", name: "Academy 1" },
		{ id: "org-2", name: "Academy 2" },
	]);
	await db.insert(schema.user).values([
		{ id: "t-1", name: "Cô Lan", email: "lan@test.local", role: "teacher" },
		{ id: "t-2", name: "Thầy Nam", email: "nam@test.local", role: "teacher" },
		{
			id: "ta-1",
			name: "Trợ giảng Tuấn",
			email: "tuan@test.local",
			role: "teacher",
		},
		{
			id: "u-stu-2",
			name: "Học viên 2",
			email: "st2@student.local",
			role: "student",
		},
		{
			id: "u-stu-3",
			name: "Học viên 3",
			email: "st3@student.local",
			role: "student",
		},
	]);
	await db.insert(schema.membership).values([
		{ id: "mem-1", orgId: "org-1", userId: "t-1", role: "teacher" },
		{ id: "mem-2", orgId: "org-2", userId: "t-2", role: "teacher" },
		{ id: "mem-ta", orgId: "org-1", userId: "ta-1", role: "ta" },
	]);

	await db.insert(schema.classTable).values([
		{
			id: "cl-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			schedule: "T2 19:00",
			sessionsTotal: 8,
			startDate: "2026-10-12",
			status: "active",
		},
		{
			id: "cl-paused",
			orgId: "org-1",
			name: "Lớp Tạm Dừng",
			schedule: "T4 19:00",
			sessionsTotal: 8,
			startDate: "2026-10-14",
			status: "paused",
		},
		{
			id: "cl-org2",
			orgId: "org-2",
			name: "Org 2 Class",
			schedule: "T6 19:00",
			sessionsTotal: 8,
			startDate: "2026-10-16",
			status: "active",
		},
	]);

	await db.insert(schema.assignmentPrompt).values([
		{
			id: "pr-1",
			orgId: "org-1",
			task: "task2",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "mcq",
			title: "Bài kiểm nhanh GrammarI",
			prompt: "Choose the correct answer",
			questions: JSON.stringify([
				{
					stem: "She ___ to school.",
					opts: ["go", "goes", "going", "gone"],
					answer: "goes",
					alts: "",
					type: "mcq",
				},
			]),
			status: "ready",
		},
		{
			id: "pr-2",
			orgId: "org-1",
			task: "task2",
			genre: "",
			skill: "writing",
			part: "t2",
			type: "essay",
			title: "Essay Selected",
			prompt: "Write 250 words",
			status: "ready",
		},
	]);

	await db.insert(schema.student).values([
		{
			id: "st-1",
			orgId: "org-1",
			name: "Học viên 1",
			email: "st1@student.local",
		},
		{
			id: "st-2",
			orgId: "org-1",
			name: "Học viên 2",
			email: "st2@student.local",
		},
		{
			id: "st-3",
			orgId: "org-1",
			name: "Học viên 3",
			email: "st3@student.local",
		},
		{
			id: "st-other",
			orgId: "org-1",
			name: "Học viên ngoài lớp",
			email: "other@student.local",
		},
	]);

	await db.insert(schema.enrollment).values([
		{
			id: "en-1",
			orgId: "org-1",
			classId: "cl-1",
			studentId: "st-1",
			status: "active",
		},
		{
			id: "en-2",
			orgId: "org-1",
			classId: "cl-1",
			studentId: "st-2",
			status: "invited",
		},
		{
			id: "en-paused-1",
			orgId: "org-1",
			classId: "cl-paused",
			studentId: "st-1",
			status: "active",
		},
		{
			id: "en-paused-3",
			orgId: "org-1",
			classId: "cl-paused",
			studentId: "st-3",
			status: "active",
		},
	]);

	const req = (
		method: string,
		path: string,
		opts: { user?: string; origin?: string; body?: unknown } = {},
	) => {
		const headers: Record<string, string> = {};
		if (opts.origin !== "") {
			headers.origin =
				opts.origin ??
				(opts.user?.startsWith("student") ? STUDENT_ORIGIN : TEACHER_ORIGIN);
		}
		if (opts.user) headers["x-test-user"] = opts.user;
		if (
			opts.body !== undefined ||
			method === "POST" ||
			method === "PUT" ||
			method === "PATCH"
		) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method,
			headers,
			body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
		});
	};

	return {
		app,
		db,
		req,
		setNow(iso: string) {
			now = new Date(iso);
		},
	};
}

describe("class_assignment target_scope, activation backfill & supplemental targets", () => {
	test("POST /api/classes/:id/assignments resolves targetScope safely, closes stale roster race, and exposes targetScope in snapshot", async () => {
		const { db, req } = await createTestHarness();

		// 1. Default full active roster (only st-1 is active) -> targetScope = "class"
		const resFull = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-15",
				studentIds: ["st-1"],
			},
		});
		expect(resFull.status).toBe(201);
		const { id: caFullId } = (await resFull.json()) as { id: string };

		// Activate st-2 now, then test explicit targetScope="class" with stale modal studentIds=["st-1"]
		await db
			.update(schema.enrollment)
			.set({ status: "active" })
			.where(eq(schema.enrollment.id, "en-2"));

		const resExpanded = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-16",
				studentIds: ["st-1"],
				targetScope: "class",
			},
		});
		expect(resExpanded.status).toBe(201);
		const { id: caExpandedId } = (await resExpanded.json()) as { id: string };

		// Explicit subset ("selected") keeps only st-1 and scope "selected"
		const resSelected = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-2",
				due: "2026-10-16",
				studentIds: ["st-1"],
				targetScope: "selected",
			},
		});
		expect(resSelected.status).toBe(201);
		const { id: caSelectedId } = (await resSelected.json()) as { id: string };

		// Subset without targetScope resolves to "selected"
		const resImplicitSelected = await req(
			"POST",
			"/api/classes/cl-1/assignments",
			{
				user: "teacher-1",
				body: {
					promptId: "pr-2",
					due: "2026-10-17",
					studentIds: ["st-1"],
				},
			},
		);
		expect(resImplicitSelected.status).toBe(201);
		const { id: caImplicitSelectedId } = (await resImplicitSelected.json()) as {
			id: string;
		};

		const snapRes = await req("GET", "/api/kernel", { user: "teacher-1" });
		expect(snapRes.status).toBe(200);
		const snap = (await snapRes.json()) as KernelSnapshot;

		const byId = new Map(snap.classAssignments.map((ca) => [ca.id, ca]));
		expect(byId.get(caFullId)?.targetScope).toBe("class");
		expect(byId.get(caExpandedId)?.targetScope).toBe("class");
		expect(
			byId
				.get(caExpandedId)
				?.targets.map((t) => t.studentId)
				.sort(),
		).toEqual(["st-1", "st-2"]);
		expect(byId.get(caSelectedId)?.targetScope).toBe("selected");
		expect(byId.get(caSelectedId)?.targets.map((t) => t.studentId)).toEqual([
			"st-1",
		]);
		expect(byId.get(caImplicitSelectedId)?.targetScope).toBe("selected");
	});

	test("POST /api/classes/:id/assignments chunks target inserts (>50 active students) and downgrades scope to selected when roster exceeds 100", async () => {
		const { db, req } = await createTestHarness();

		// Seed 101 additional active students into cl-1 (total 102 active including st-1)
		const extraStudents = Array.from({ length: 101 }, (_, i) => ({
			id: `st-bulk-${i + 1}`,
			orgId: "org-1",
			name: `Bulk ${i + 1}`,
		}));
		const extraEnrollments = extraStudents.map((s, i) => ({
			id: `en-bulk-${i + 1}`,
			orgId: "org-1",
			classId: "cl-1",
			studentId: s.id,
			status: "active",
		}));
		for (let i = 0; i < extraStudents.length; i += 25) {
			await db.insert(schema.student).values(extraStudents.slice(i, i + 25));
			await db
				.insert(schema.enrollment)
				.values(extraEnrollments.slice(i, i + 25));
		}

		// Sending 60 studentIds with targetScope="class" while roster=102 (>100):
		// must succeed (chunked inserts <= 50 batch statements) AND downgrade targetScope to "selected".
		const sixtyIds = ["st-1", ...extraStudents.slice(0, 59).map((s) => s.id)];
		const res = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-20",
				studentIds: sixtyIds,
				targetScope: "class",
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };

		const [ca] = await db
			.select()
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, id));
		expect(ca?.targetScope).toBe("selected");

		const targets = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.assignmentId, id));
		expect(targets).toHaveLength(60);
	});

	test("activateEnrollment backfills open class-scope assignments on real activation (not selected, not overdue, not study pack, not replay) and grants Student Portal 200", async () => {
		const { db, req, setNow } = await createTestHarness(
			"2026-10-10T03:00:00.000Z",
		);

		// 1. Open class-scope assignment (dueAt > now)
		const openRes = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-15",
				studentIds: ["st-1"],
				targetScope: "class",
			},
		});
		const { id: openId } = (await openRes.json()) as { id: string };

		// 2. Open selected-scope assignment -> must NOT backfill
		const selRes = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-2",
				due: "2026-10-15",
				studentIds: ["st-1"],
				targetScope: "selected",
			},
		});
		const { id: selId } = (await selRes.json()) as { id: string };

		// 3. Legacy dueAt=null open assignment (due >= todayVN) + legacy overdue assignment (due < todayVN)
		await db.insert(schema.classAssignment).values([
			{
				id: "ca-legacy-open",
				orgId: "org-1",
				classId: "cl-1",
				promptId: "pr-1",
				title: "Legacy Open",
				due: "2026-10-12",
				dueAt: null,
				targetScope: "class",
			},
			{
				id: "ca-legacy-overdue",
				orgId: "org-1",
				classId: "cl-1",
				promptId: "pr-1",
				title: "Legacy Overdue",
				due: "2026-10-11",
				dueAt: null,
				targetScope: "class",
			},
			{
				id: "ca-dueat-overdue",
				orgId: "org-1",
				classId: "cl-1",
				promptId: "pr-1",
				title: "DueAt Overdue",
				due: "2026-10-12",
				dueAt: new Date("2026-10-12T02:00:00.000Z"),
				targetScope: "class",
			},
			{
				id: "ca-study-pack",
				orgId: "org-1",
				classId: "cl-1",
				promptId: "pr-1",
				title: "Study Pack Item",
				due: "2026-10-20",
				dueAt: new Date("2026-10-20T16:59:59.999Z"),
				classStudyPackId: "csp-existing",
				targetScope: "class",
			},
		]);

		// Advance injected clock to 2026-10-12T05:00:00Z (12:00 VN on 2026-10-12)
		setNow("2026-10-12T05:00:00.000Z");

		// Student 2 accepts invite -> triggers real 'invited' -> 'active' activation
		const acceptRes = await req(
			"POST",
			"/api/student/enrollments/en-2/accept",
			{
				user: "student-2",
			},
		);
		expect(acceptRes.status).toBe(200);

		const st2Targets = await db
			.select({ assignmentId: schema.classAssignmentTarget.assignmentId })
			.from(schema.classAssignmentTarget)
			.where(
				and(
					eq(schema.classAssignmentTarget.orgId, "org-1"),
					eq(schema.classAssignmentTarget.studentId, "st-2"),
				),
			);
		expect(st2Targets.map((r) => r.assignmentId).sort()).toEqual(
			["ca-legacy-open", openId].sort(),
		);
		expect(st2Targets.map((r) => r.assignmentId)).not.toContain(selId);
		expect(st2Targets.map((r) => r.assignmentId)).not.toContain(
			"ca-legacy-overdue",
		);
		expect(st2Targets.map((r) => r.assignmentId)).not.toContain(
			"ca-dueat-overdue",
		);
		expect(st2Targets.map((r) => r.assignmentId)).not.toContain(
			"ca-study-pack",
		);

		// Student 2 can open the backfilled quiz on Student Portal -> 200
		const quizRes = await req(
			"GET",
			`/api/student/assignments/${openId}/quiz`,
			{
				user: "student-2",
			},
		);
		expect(quizRes.status).toBe(200);

		// Replay guard: create a brand-new class-scope assignment targeting ONLY st-1 (manually)
		// or simulating a selected/skipped assignment, then replay student accept on ALREADY active enrollment
		await db.insert(schema.classAssignment).values({
			id: "ca-post-active-replay-test",
			orgId: "org-1",
			classId: "cl-1",
			promptId: "pr-1",
			title: "Should Not Self-Assign On Replay",
			due: "2026-10-20",
			dueAt: new Date("2026-10-20T16:59:59.999Z"),
			targetScope: "class",
		});

		const replayRes = await req(
			"POST",
			"/api/student/enrollments/en-2/accept",
			{
				user: "student-2",
			},
		);
		expect(replayRes.status).toBe(200);

		const replayTargets = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(
				and(
					eq(
						schema.classAssignmentTarget.assignmentId,
						"ca-post-active-replay-test",
					),
					eq(schema.classAssignmentTarget.studentId, "st-2"),
				),
			);
		expect(replayTargets).toHaveLength(0);

		// Also verify teacher enroll with activateNow=true backfills open assignments
		const enrollRes = await req("POST", "/api/classes/cl-1/enroll", {
			user: "teacher-1",
			body: { studentId: "st-3", activateNow: true },
		});
		expect(enrollRes.status).toBe(201);
		const st3QuizRes = await req(
			"GET",
			`/api/student/assignments/${openId}/quiz`,
			{
				user: "student-3",
			},
		);
		expect(st3QuizRes.status).toBe(200);

		// Also verify teacher POST /api/students with activateNow=true backfills open assignments
		const createStuRes = await req("POST", "/api/students", {
			user: "teacher-1",
			body: {
				name: "Học viên 4",
				classId: "cl-1",
				activateNow: true,
			},
		});
		expect(createStuRes.status).toBe(201);
		const { id: st4Id } = (await createStuRes.json()) as { id: string };
		const st4Targets = await db
			.select({ assignmentId: schema.classAssignmentTarget.assignmentId })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.studentId, st4Id));
		expect(st4Targets.map((r) => r.assignmentId)).toContain(openId);
	});

	test("POST /api/classes/:id/assignments/:assignmentId/targets adds missing students atomically, notifies only newly added, upgrades scope, and enforces guards", async () => {
		const { db, req, setNow } = await createTestHarness(
			"2026-10-10T03:00:00.000Z",
		);

		// Create a regular assignment targeted only to st-1
		const createRes = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-11",
				studentIds: ["st-1"],
				targetScope: "selected",
			},
		});
		const { id: caId } = (await createRes.json()) as { id: string };

		// Mark st-1 as already submitted
		await db
			.update(schema.classAssignmentTarget)
			.set({ submittedAt: "2026-10-10T10:00:00.000Z" })
			.where(
				and(
					eq(schema.classAssignmentTarget.assignmentId, caId),
					eq(schema.classAssignmentTarget.studentId, "st-1"),
				),
			);

		// Move past deadline and activate st-2 (past-due so NOT auto-backfilled)
		setNow("2026-10-15T05:00:00.000Z");
		await req("POST", "/api/enrollments/en-2/accept", { user: "teacher-1" });

		// Count existing assignment_published notifications before supplement
		const notifsBefore = await db
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.refId, caId));

		// Unauthenticated -> 401
		const unauthRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{ body: { studentIds: ["st-2"] } },
		);
		expect(unauthRes.status).toBe(401);

		// CSRF bad origin -> 403
		const csrfRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{
				user: "teacher-1",
				origin: "https://evil.example",
				body: { studentIds: ["st-2"] },
			},
		);
		expect(csrfRes.status).toBe(403);

		// TA role -> 403 forbidden
		const taRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{
				user: "ta-1",
				body: { studentIds: ["st-2"] },
			},
		);
		expect(taRes.status).toBe(403);

		// Cross-org teacher -> 404
		const crossOrgRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{
				user: "teacher-2",
				body: { studentIds: ["st-2"] },
			},
		);
		expect(crossOrgRes.status).toBe(404);

		// Validation errors -> 400 (empty, dupes, >100, non-active student)
		expect(
			(
				await req("POST", `/api/classes/cl-1/assignments/${caId}/targets`, {
					user: "teacher-1",
					body: { studentIds: [] },
				})
			).status,
		).toBe(400);
		expect(
			(
				await req("POST", `/api/classes/cl-1/assignments/${caId}/targets`, {
					user: "teacher-1",
					body: { studentIds: ["st-2", "st-2"] },
				})
			).status,
		).toBe(400);
		expect(
			(
				await req("POST", `/api/classes/cl-1/assignments/${caId}/targets`, {
					user: "teacher-1",
					body: {
						studentIds: Array.from({ length: 101 }, (_, i) => `s-${i}`),
					},
				})
			).status,
		).toBe(400);
		expect(
			(
				await req("POST", `/api/classes/cl-1/assignments/${caId}/targets`, {
					user: "teacher-1",
					body: { studentIds: ["st-other"] },
				})
			).status,
		).toBe(400);

		// Study Pack assignment -> 404
		await db.insert(schema.classAssignment).values({
			id: "ca-pack-blocked",
			orgId: "org-1",
			classId: "cl-1",
			promptId: "pr-1",
			title: "Pack Item",
			due: "2026-10-20",
			classStudyPackId: "csp-1",
		});
		expect(
			(
				await req(
					"POST",
					"/api/classes/cl-1/assignments/ca-pack-blocked/targets",
					{
						user: "teacher-1",
						body: { studentIds: ["st-2"] },
					},
				)
			).status,
		).toBe(404);

		// Paused class -> 409 CLASS_PAUSED
		await db.insert(schema.classAssignment).values({
			id: "ca-in-paused",
			orgId: "org-1",
			classId: "cl-paused",
			promptId: "pr-1",
			title: "Paused Class Assignment",
			due: "2026-10-20",
		});
		const pausedRes = await req(
			"POST",
			"/api/classes/cl-paused/assignments/ca-in-paused/targets",
			{
				user: "teacher-1",
				body: { studentIds: ["st-3"] },
			},
		);
		expect(pausedRes.status).toBe(409);
		const pausedBody = (await pausedRes.json()) as { code?: string };
		expect(pausedBody.code).toBe(CLASS_ERROR_CODES.CLASS_PAUSED);

		// Happy path: send both existing st-1 and missing st-2 -> added: 1, preserves st-1 submittedAt, upgrades scope to "class"
		const addRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{
				user: "teacher-1",
				body: { studentIds: ["st-1", "st-2"] },
			},
		);
		expect(addRes.status).toBe(200);
		expect(await addRes.json()).toEqual({ id: caId, added: 1 });

		// Verify st-1 submittedAt untouched and scope upgraded to "class"
		const [caRow] = await db
			.select()
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(caRow?.targetScope).toBe("class");

		const targets = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.assignmentId, caId));
		expect(targets.map((t) => t.studentId).sort()).toEqual(["st-1", "st-2"]);
		expect(targets.find((t) => t.studentId === "st-1")?.submittedAt).toBe(
			"2026-10-10T10:00:00.000Z",
		);

		// Only st-2 received notification (not st-1)
		const notifsAfter = await db
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.refId, caId));
		expect(notifsAfter.length).toBeGreaterThan(notifsBefore.length);
		const newNotifs = notifsAfter.filter(
			(n) => !notifsBefore.some((b) => b.id === n.id),
		);
		expect(newNotifs.every((n) => n.studentId === "st-2")).toBe(true);

		// Student 2 can now access the supplemented past-due quiz -> 200
		const st2QuizRes = await req(
			"GET",
			`/api/student/assignments/${caId}/quiz`,
			{
				user: "student-2",
			},
		);
		expect(st2QuizRes.status).toBe(200);

		// Idempotent repeat -> 200 { id, added: 0 } and 0 new notifications
		const repeatRes = await req(
			"POST",
			`/api/classes/cl-1/assignments/${caId}/targets`,
			{
				user: "teacher-1",
				body: { studentIds: ["st-2"] },
			},
		);
		expect(repeatRes.status).toBe(200);
		expect(await repeatRes.json()).toEqual({ id: caId, added: 0 });
		const notifsAfterRepeat = await db
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.refId, caId));
		expect(notifsAfterRepeat).toHaveLength(notifsAfter.length);
	});

	test("guardClassActive rolls back POST .../targets with 409 CLASS_PAUSED on concurrent pause and backfill skips malformed legacy due & demo students", async () => {
		const { db, req, setNow } = await createTestHarness(
			"2026-10-10T03:00:00.000Z",
		);

		// Seed a demo-student active enrollment and a malformed legacy due ("99/99")
		await db.insert(schema.student).values({
			id: "demo-student:1",
			orgId: "org-1",
			name: "Demo Student",
		});
		await db.insert(schema.enrollment).values({
			id: "en-demo-1",
			orgId: "org-1",
			classId: "cl-1",
			studentId: "demo-student:1",
			status: "active",
		});
		await db.insert(schema.classAssignment).values({
			id: "ca-malformed-due",
			orgId: "org-1",
			classId: "cl-1",
			promptId: "pr-1",
			title: "Malformed Legacy Due",
			due: "99/99",
			dueAt: null,
			targetScope: "class",
		});

		// Creating assignment with only real student st-1 (without targetScope) still resolves to "class"
		// because demo-student:1 is excluded from rosterRows.
		const createRes = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-1",
				due: "2026-10-15",
				studentIds: ["st-1"],
			},
		});
		expect(createRes.status).toBe(201);
		const { id: caId } = (await createRes.json()) as { id: string };
		const [createdRow] = await db
			.select()
			.from(schema.classAssignment)
			.where(eq(schema.classAssignment.id, caId));
		expect(createdRow?.targetScope).toBe("class");

		// Activate st-2 -> must NOT receive malformed legacy due ("99/99")
		setNow("2026-10-12T05:00:00.000Z");
		expect(
			(
				await req("POST", "/api/enrollments/en-2/accept", {
					user: "teacher-1",
				})
			).status,
		).toBe(200);
		const malformedTargets = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(
				and(
					eq(schema.classAssignmentTarget.assignmentId, "ca-malformed-due"),
					eq(schema.classAssignmentTarget.studentId, "st-2"),
				),
			);
		expect(malformedTargets).toHaveLength(0);

		// Enroll & activate st-3 so st-3 is missing from a past-due selected assignment
		const selRes = await req("POST", "/api/classes/cl-1/assignments", {
			user: "teacher-1",
			body: {
				promptId: "pr-2",
				due: "2026-10-15",
				studentIds: ["st-1"],
				targetScope: "selected",
			},
		});
		const { id: selCaId } = (await selRes.json()) as { id: string };

		// Wrap db with a proxy that pauses cl-1 right before db.batch runs (concurrent pause race)
		let armPauseRace = true;
		const raceDb = new Proxy(db, {
			get(target, prop, recv) {
				if (prop === "batch") {
					return async (stmts: Parameters<Db["batch"]>[0]) => {
						if (armPauseRace) {
							armPauseRace = false;
							await db
								.update(schema.classTable)
								.set({ status: "paused" })
								.where(eq(schema.classTable.id, "cl-1"));
						}
						return target.batch(stmts);
					};
				}
				const val = Reflect.get(target, prop, recv);
				return typeof val === "function" ? val.bind(target) : val;
			},
		}) as Db;

		const raceApp = buildApp({
			getDb: () => raceDb,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (USERS[key] ?? null) : null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		const raceRes = await raceApp.request(
			`/api/classes/cl-1/assignments/${selCaId}/targets`,
			{
				method: "POST",
				headers: {
					origin: TEACHER_ORIGIN,
					"content-type": "application/json",
					"x-test-user": "teacher-1",
				},
				body: JSON.stringify({ studentIds: ["st-2"] }),
			},
		);
		expect(raceRes.status).toBe(409);
		const raceBody = (await raceRes.json()) as { code?: string };
		expect(raceBody.code).toBe(CLASS_ERROR_CODES.CLASS_PAUSED);

		// Rolled back: st-2 must NOT have been inserted
		const targetsAfterRace = await db
			.select()
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.assignmentId, selCaId));
		expect(targetsAfterRace.map((t) => t.studentId)).toEqual(["st-1"]);
	});

	test("POST /classes/:id/assignments (class scope) and POST .../targets run cleanly on drizzle-orm/d1 adapter", async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

		// Minimal faithful Cloudflare D1Database shim backed by SQLite client
		function makeD1Shim(sqlite: Client): D1Database {
			const makePrepared = (query: string, bound: unknown[] = []) => {
				const execObj = async () => {
					const rs = await sqlite.execute({
						sql: query,
						args: bound as Parameters<Client["execute"]>[0] extends {
							args?: infer A;
						}
							? A
							: never,
					});
					const results = rs.rows.map((row) => {
						const obj: Record<string, unknown> = {};
						for (let i = 0; i < rs.columns.length; i++) {
							const col = rs.columns[i];
							if (col !== undefined) obj[col] = row[i];
						}
						return obj;
					});
					return { results, success: true, meta: { changes: rs.rowsAffected } };
				};
				const execRaw = async (opts?: { columnNames?: boolean }) => {
					const rs = await sqlite.execute({
						sql: query,
						args: bound as Parameters<Client["execute"]>[0] extends {
							args?: infer A;
						}
							? A
							: never,
					});
					const rows = rs.rows.map((row) => rs.columns.map((_, i) => row[i]));
					return opts?.columnNames ? [rs.columns, ...rows] : rows;
				};
				return {
					__query: query,
					__bound: bound,
					bind: (...params: unknown[]) => makePrepared(query, params),
					all: execObj,
					run: execObj,
					raw: execRaw,
					first: async (col?: string) => {
						const res = await execObj();
						const row = res.results[0];
						if (!row) return null;
						return col ? (row[col] ?? null) : row;
					},
				};
			};
			return {
				prepare: (query: string) => makePrepared(query),
				batch: async (stmts: Array<{ all: () => Promise<unknown> }>) => {
					const out: unknown[] = [];
					for (const stmt of stmts) {
						out.push(await stmt.all());
					}
					return out;
				},
			} as unknown as D1Database;
		}

		const d1Db = drizzleD1(makeD1Shim(client), { schema }) as unknown as Db;
		await d1Db.insert(schema.organization).values({ id: "org-1", name: "Org" });
		await d1Db.insert(schema.user).values({
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		});
		await d1Db.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
		await d1Db.insert(schema.classTable).values({
			id: "cl-d1",
			orgId: "org-1",
			name: "D1 Class",
			schedule: "T2 19:00",
			sessionsTotal: 8,
			startDate: "2026-10-12",
			status: "active",
		});
		await d1Db.insert(schema.assignmentPrompt).values({
			id: "pr-d1",
			orgId: "org-1",
			task: "task2",
			genre: "",
			skill: "writing",
			part: "t2",
			type: "essay",
			title: "D1 Prompt",
			prompt: "Write essay",
			status: "ready",
		});
		await d1Db.insert(schema.student).values([
			{ id: "st-1", orgId: "org-1", name: "HV 1" },
			{ id: "st-2", orgId: "org-1", name: "HV 2" },
		]);
		await d1Db.insert(schema.enrollment).values([
			{
				id: "en-1",
				orgId: "org-1",
				classId: "cl-d1",
				studentId: "st-1",
				status: "active",
			},
			{
				id: "en-2",
				orgId: "org-1",
				classId: "cl-d1",
				studentId: "st-2",
				status: "active",
			},
		]);

		const d1App = buildApp({
			getDb: () => d1Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user");
				return key ? (USERS[key] ?? null) : null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
			now: () => new Date("2026-10-10T03:00:00.000Z"),
		});

		// 1. POST /classes/:id/assignments with targetScope: "class" must NOT crash D1 batch
		const createRes = await d1App.request("/api/classes/cl-d1/assignments", {
			method: "POST",
			headers: {
				origin: TEACHER_ORIGIN,
				"content-type": "application/json",
				"x-test-user": "teacher-1",
			},
			body: JSON.stringify({
				promptId: "pr-d1",
				due: "2026-10-20",
				studentIds: ["st-1"],
				targetScope: "class",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: classCaId } = (await createRes.json()) as { id: string };
		const classTargets = await d1Db
			.select()
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.assignmentId, classCaId));
		expect(classTargets.map((t) => t.studentId).sort()).toEqual([
			"st-1",
			"st-2",
		]);

		// 2. POST .../targets on D1 adapter must return exact { id, added: 1 } and upgrade scope
		const selRes = await d1App.request("/api/classes/cl-d1/assignments", {
			method: "POST",
			headers: {
				origin: TEACHER_ORIGIN,
				"content-type": "application/json",
				"x-test-user": "teacher-1",
			},
			body: JSON.stringify({
				promptId: "pr-d1",
				due: "2026-10-20",
				studentIds: ["st-1"],
				targetScope: "selected",
			}),
		});
		expect(selRes.status).toBe(201);
		const { id: selCaId } = (await selRes.json()) as { id: string };

		const addRes = await d1App.request(
			`/api/classes/cl-d1/assignments/${selCaId}/targets`,
			{
				method: "POST",
				headers: {
					origin: TEACHER_ORIGIN,
					"content-type": "application/json",
					"x-test-user": "teacher-1",
				},
				body: JSON.stringify({ studentIds: ["st-1", "st-2"] }),
			},
		);
		expect(addRes.status).toBe(200);
		expect(await addRes.json()).toEqual({ id: selCaId, added: 1 });
	});
});
