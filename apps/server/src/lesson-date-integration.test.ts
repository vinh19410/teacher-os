/**
 * lesson.date integration (issue #98 Phase 1): generator stamps occurrence
 * dates at accept time (originally enrollment time), snapshot projects them, and legacy fixtures stay
 * undated. Runs against the real handler chain like kernel.test.ts.
 */
import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
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

	const userId = crypto.randomUUID();
	const token = crypto.randomUUID();
	await libsql
		.insert(authUser)
		.values({ id: userId, name: "Tester", email: `${userId}@test.local` });
	await libsql.insert(authSession).values({
		id: crypto.randomUUID(),
		expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
		token,
		userId,
	});

	async function call(
		path: string,
		options: { method?: string; body?: unknown } = {},
	) {
		return app.request(path, {
			method: options.method ?? "GET",
			headers: {
				cookie: `better-auth.session_token=${token}`,
				origin: CORS_ORIGIN,
				...(options.body !== undefined
					? { "content-type": "application/json" }
					: {}),
			},
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}
	async function addStudent(name: string, extra: { classId?: string } = {}) {
		const [membershipRow] = await libsql
			.select()
			.from(schema.membership)
			.where(eq(schema.membership.userId, userId));
		if (!membershipRow) throw new Error("bootstrap the org before inserting");
		const studentId = crypto.randomUUID();
		await libsql.insert(schema.student).values({
			id: studentId,
			orgId: membershipRow.orgId,
			name,
			phone: "0900000000",
			email: `stu-${crypto.randomUUID()}@test.local`,
			zalo: "0900000000",
			parentName: "",
			parentPhone: "",
		});
		if (extra.classId) {
			await libsql.insert(schema.enrollment).values({
				id: crypto.randomUUID(),
				orgId: membershipRow.orgId,
				classId: extra.classId,
				studentId,
				status: "invited",
			});
		}
		return studentId;
	}

	return { call, addStudent };
}

describe("lesson.date generator + snapshot projection", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	beforeAll(async () => {
		t = await createTestApp();
	});

	async function kernel(): Promise<KernelSnapshot> {
		const res = await t.call("/api/kernel");
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	async function createClassWith(
		body: Record<string, unknown>,
	): Promise<string> {
		const res = await t.call("/api/classes", { method: "POST", body });
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function enroll(classId: string, name: string): Promise<void> {
		await t.addStudent(name, { classId });
		const snap = await kernel();
		const en = snap.enrollments.find((e) => e.classId === classId);
		if (en) {
			const acceptRes = await t.call(`/api/enrollments/${en.id}/accept`, {
				method: "POST",
				body: {},
			});
			expect(acceptRes.status).toBe(200);
		}
	}

	test("class with ISO startDate generates fully-dated rows matching the skeleton", async () => {
		const classId = await createClassWith({
			name: "Lớp ISO",
			type: "ielts",
			level: "",
			skills: ["Writing"],
			mode: "Online",
			templateId: "",
			schedule: { days: [1, 4], start: "19:00", end: "20:30" },
			sessionsTotal: 6,
			startDate: "2026-08-25",
		});
		await enroll(classId, "HV A");

		const snap = await kernel();
		const rows = snap.lessons.filter((l) => l.classId === classId);
		expect(rows).toHaveLength(6);
		for (const row of rows) {
			expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
		const byDateAsc = [...rows].sort((a, b) =>
			(a.date ?? "").localeCompare(b.date ?? ""),
		);
		expect(byDateAsc.map((r) => r.day)).toEqual([2, 5, 2, 5, 2, 5]);
		expect(byDateAsc.map((r) => r.date)).toEqual([
			"2026-08-25",
			"2026-08-28",
			"2026-09-01",
			"2026-09-04",
			"2026-09-08",
			"2026-09-11",
		]);
	});

	test("legacy startDate fixture ('01/09') still accepts students but rows stay NULL-dated", async () => {
		const classId = await createClassWith({
			name: "Lớp cũ StartDate",
			type: "ielts",
			level: "",
			skills: ["Speaking"],
			mode: "Online",
			templateId: "",
			schedule: { days: [2], start: "19:00", end: "20:30" },
			sessionsTotal: 3,
			startDate: "01/09",
		});
		await enroll(classId, "HV Legacy");

		const snap = await kernel();
		const rows = snap.lessons.filter((l) => l.classId === classId);
		expect(rows).toHaveLength(3);
		for (const row of rows) expect(row.date).toBeNull();
	});

	test("snapshot lessons always carry the date field (null included)", async () => {
		const snap = await kernel();
		for (const row of snap.lessons) expect("date" in row).toBe(true);
	});
});
