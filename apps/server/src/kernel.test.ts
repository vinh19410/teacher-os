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

	async function orgIdOf(session: TestSession): Promise<string> {
		const [membershipRow] = await membershipsOf(session.userId);
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
			schedule?: { days: number[]; start: string; end: string };
			sessionsTotal?: number;
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
		orgIdOf,
		insertLesson,
		insertInvoice,
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

	test("invalid time format is 400; overnight end<start is 201", async () => {
		const badTime = await postClass({
			...baseBody,
			schedule: { days: [2], start: "99:99", end: "20:30" },
		});
		expect(badTime.status).toBe(400);
		const overnight = await postClass({
			...baseBody,
			name: "Overnight class",
			schedule: { days: [2], start: "23:00", end: "00:30" },
		});
		expect(overnight.status).toBe(201);
	});

	test("start equal to end is 400", async () => {
		const res = await postClass({
			...baseBody,
			schedule: { days: [2], start: "19:00", end: "19:00" },
		});
		expect(res.status).toBe(400);
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

	test("mark-paid enforces Origin, JSON, strict bounded body, and no create route", async () => {
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
		expect(
			(
				await t.call("/api/invoices", {
					session,
					method: "POST",
					body: { studentId, amount: 1 },
				})
			).status,
		).toBe(404);
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

	test("org A's tree is unchanged after every cross-org attempt", async () => {
		const snapshotA = await t.kernel(orgA);
		const sy = snapshotA.syllabi[0];
		expect(sy?.modules.map((m) => m.title)).toEqual(["Module A"]);
		expect(sy?.modules[0]?.lessons.map((l) => l.title)).toEqual(["Buổi A"]);
		expect(sy?.modules[0]?.lessons[0]?.status).toBe("upcoming");
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

	test("report create/send and notification mark-read have no write routes", async () => {
		const createReport = await t.call("/api/reports", {
			session: orgA,
			method: "POST",
			body: { studentId: studentAId },
		});
		expect(createReport.status).toBe(404);
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

	test("matrix 9: remove-curriculum on a template pointer is 409 and keeps the template", async () => {
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
		expect(res.status).toBe(409);
		const snapshot = await t.kernel(session);
		expect(snapshot.syllabi.some((s) => s.id === templateId)).toBe(true);
		const tpl = snapshot.syllabi.find((s) => s.id === templateId);
		expect(tpl?.modules).toHaveLength(2);
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
		const base = { orgId: "org", classId: "cls", enrollmentId: "enr" };
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

	test("enrolling a student generates sessionsTotal upcoming lessons on the kernel snapshot", async () => {
		const studentId = await t.addStudent(session, "HV có lớp", { classId });
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
		const studentId = await t.addStudent(session, "HV khóa dài", {
			classId: bigClassId,
		});
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, bigClassId, studentId);
		expect(
			snapshot.lessons.filter((l) => l.enrollmentId === enrollment?.id),
		).toHaveLength(50);
	});

	test("sessionsTotal = 0 generates zero lessons", async () => {
		const zeroClassId = await t.createClass(session, "Chưa định số buổi", {
			type: "communication",
			skills: [],
			schedule: { days: [2], start: "19:00", end: "20:30" },
			sessionsTotal: 0,
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
		await t.addStudent(session, "HV lớp cũ", { classId: legacyClassId });
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
		const firstId = await t.addStudent(session, "HV nhóm 1", { classId });
		const secondId = await t.addStudent(session, "HV nhóm 2", { classId });
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

	test("divergence pin: class sessionsTotal (12) and package total (10) stay independent on the wire", async () => {
		const studentId = await t.addStudent(session, "HV gói lệch", {
			classId,
			total: 10,
		});
		const snapshot = await t.kernel(session);
		const enrollment = findEnrollment(snapshot, classId, studentId);
		expect(
			snapshot.lessons.filter((l) => l.enrollmentId === enrollment?.id),
		).toHaveLength(12);
		expect(
			snapshot.packages.find((p) => p.enrollmentId === enrollment?.id)?.total,
		).toBe(10);
	});

	test("cross-org: org B cannot enroll into org A's class and sees zero generated lessons", async () => {
		const orgB = await t.insertUser("Cô Lịch B");
		const attempt = await t.call("/api/students", {
			session: orgB,
			method: "POST",
			body: {
				name: "HV intruder",
				phone: "0900 000 000",
				parentName: "",
				total: 10,
				price: 400000,
				mode: "Online",
				classId,
			},
		});
		expect(attempt.status).toBe(404);
		const snapshotB = await t.kernel(orgB);
		expect(snapshotB.lessons).toEqual([]);
		expect(
			snapshotB.students.find((s) => s.name === "HV intruder"),
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
