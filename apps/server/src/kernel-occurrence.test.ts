/**
 * Occurrence mutation endpoints — issue #98 Phase 2 matrix.
 *
 * Covers: 200/404/409/400 matrix per phase-02 spec, move-wholly on
 * mixed-state buckets, K3 occurrence-aware /lessons/:id/edit policy,
 * co-tenant isolation, reason transport through garbage bodies, and the CSRF
 * middleware-ordering contract pin (RT13).
 */

import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { lesson } from "@teacher-os/db/schema/lesson";
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
		return { userId: row.userId, userName: row.userName };
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

	const teacherA = await insertUser("Teacher A");
	const teacherB = await insertUser("Teacher B");

	function call(
		token: string,
		path: string,
		options: {
			method?: string;
			body?: unknown;
			rawBody?: string;
			origin?: string | null;
			contentType?: string | null;
		} = {},
	) {
		const headers: Record<string, string> = {
			cookie: `better-auth.session_token=${options.origin === null ? "" : token}`,
			...(options.origin !== null
				? { origin: options.origin ?? CORS_ORIGIN }
				: {}),
		};
		if (options.rawBody !== undefined) {
			headers["content-type"] = options.contentType ?? "application/json";
			headers.cookie = `better-auth.session_token=${token}`;
			return app.request(path, {
				method: options.method ?? "POST",
				headers,
				body: options.rawBody,
			});
		}
		if (options.body !== undefined)
			headers["content-type"] = "application/json";
		headers.cookie = `better-auth.session_token=${token}`;
		return app.request(path, {
			method: options.method ?? "POST",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	return { app, libsql, call, teacherA, teacherB };
}

describe("occurrence mutations (#98 phase 2)", () => {
	let t: Awaited<ReturnType<typeof createTestApp>>;
	let classId: string;

	beforeAll(async () => {
		t = await createTestApp();

		const mkClass = await t.call(t.teacherA.token, "/api/classes", {
			body: {
				name: "Lớp P2",
				type: "ielts",
				level: "",
				skills: ["Writing"],
				mode: "Online",
				templateId: "",
				schedule: { days: [1, 4], start: "19:00", end: "20:30" },
				sessionsTotal: 4,
				startDate: "2026-08-25",
			},
		});
		expect(mkClass.status).toBe(201);
		classId = ((await mkClass.json()) as { id: string }).id;

		for (const name of ["HV Một", "HV Hai"]) {
			const res = await t.call(t.teacherA.token, "/api/students", {
				body: { name, total: 4, price: 0, mode: "Online", classId },
			});
			expect(res.status).toBe(201);
		}

		const snap = await snapshot();
		expect(snap.enrollments.filter((e) => e.classId === classId)).toHaveLength(
			2,
		);
	});

	async function snapshot(): Promise<KernelSnapshot> {
		const res = await t.call(t.teacherA.token, "/api/kernel", {
			method: "GET",
		});
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	async function lessonRows(): Promise<Array<typeof lesson.$inferSelect>> {
		return t.libsql.select().from(lesson);
	}

	test("matrix: happy-path bucket edit updates every sid's rows (count honesty)", async () => {
		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-08-25/edit`,
			{ body: { topic: "Buổi đầu tiên" } },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { updated: number; skipped: number };
		expect(body.updated).toBe(2); // two enrollments × one Tue row
		expect(body.skipped).toBe(0);

		const rows = await lessonRows();
		const bucket = rows.filter((r) => r.date === "2026-08-25");
		for (const r of bucket) expect(r.topic).toBe("Buổi đầu tiên");
	});

	test("move-wholly: settled rows ride along on moveDate (mixed-state bucket)", async () => {
		// Settle one sid's 08-25 row through the legacy per-row endpoint.
		const rows = await lessonRows();
		const first = rows.find((r) => r.date === "2026-08-25")!;
		const settle = await t.call(
			t.teacherA.token,
			`/api/lessons/${first.id}/check-in`,
			{
				body: {},
			},
		);
		expect(settle.status).toBe(200);

		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-08-25/edit`,
			{ body: { moveDate: "2026-09-05" } },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { updated: number };
		expect(body.updated).toBe(2);

		const moved = await lessonRows();
		const destBucket = moved.filter((r) => r.date === "2026-09-05");
		expect(destBucket).toHaveLength(2);
		for (const r of destBucket) expect(r.day).toBe(6); // Fri derived server-side
		expect(moved.filter((r) => r.date === "2026-08-25")).toHaveLength(0);
	});

	test("collision pre-check: occupied destination → 409 date-occupied", async () => {
		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-05/edit`,
			{ body: { moveDate: "2026-09-01" } }, // Tue bucket exists
		);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { reason?: string }).reason).toBe(
			"date-occupied",
		);
	});

	test("check-in bulk marks every upcoming row completed; skipped counts settled", async () => {
		// Fresh bucket: 2026-08-28 has both sids upcoming.
		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-08-28/check-in`,
			{ body: {} },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ updated: 2, skipped: 0 });

		// Replay: all settled → 200 updated=0.
		const replay = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-08-28/check-in`,
			{ body: {} },
		);
		expect(replay.status).toBe(200);
		expect(await replay.json()).toEqual({ updated: 0, skipped: 2 });

		// Unknown date → 404 not-found.
		const ghost = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2099-01-01/cancel`,
			{ body: {} },
		);
		expect(ghost.status).toBe(404);
		expect(((await ghost.json()) as { reason?: string }).reason).toBe(
			"not-found",
		);
	});

	test("cancel bulk flips status; status guard stays in WHERE", async () => {
		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-04/cancel`,
			{ body: {} },
		);
		expect(res.status).toBe(200);
		expect((await res.json()) as { updated: number; skipped: number }).toEqual({
			updated: 2,
			skipped: 0,
		});

		const rows = await lessonRows();
		for (const r of rows.filter((x) => x.date === "2026-09-04")) {
			expect(r.status).toBe("cancelled");
		}
	});

	test("invalid calendar dates and bodies are rejected", async () => {
		const badParam = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-02-30/edit`,
			{ body: { topic: "x" } },
		);
		expect(badParam.status).toBe(400);
		expect(((await badParam.json()) as { reason?: string }).reason).toBe(
			"invalid-date",
		);

		const badMove = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-01/edit`,
			{ body: { moveDate: "2026-13-99" } },
		);
		expect(badMove.status).toBe(400);

		const emptyBody = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-01/edit`,
			{ body: {} },
		);
		expect(emptyBody.status).toBe(400); // ≥1 field refine

		const forgedStatus = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-01/check-in`,
			{ body: { status: "completed" } },
		);
		expect(forgedStatus.status).toBe(400);

		const nonHttps = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-01/edit`,
			{ body: { zoom: "http://evil.example" } },
		);
		expect(nonHttps.status).toBe(400);
	});

	test("co-tenant protection: second org sees neither bucket nor class", async () => {
		const resEdit = await t.call(
			t.teacherB.token,
			`/api/classes/${classId}/sessions/2026-09-01/edit`,
			{ body: { topic: "hijack" } },
		);
		expect(resEdit.status).toBe(404);
		const resCheck = await t.call(
			t.teacherB.token,
			`/api/classes/${classId}/sessions/2026-09-01/check-in`,
			{ body: {} },
		);
		expect(resCheck.status).toBe(404);
	});

	test("K3: dated-row day-change via /lessons/:id/edit → 409 use-occurrence-endpoint", async () => {
		const rows = await lessonRows();
		const datedUpcoming = rows.find(
			(r) => r.date === "2026-09-01" && r.status === "upcoming",
		)!;
		const res = await t.call(
			t.teacherA.token,
			`/api/lessons/${datedUpcoming.id}/edit`,
			{
				body: { day: 3, time: "19:00", dur: 90, topic: "nope", zoom: "" },
			},
		);
		expect(res.status).toBe(409);
		expect(((await res.json()) as { reason?: string }).reason).toBe(
			"use-occurrence-endpoint",
		);
	});

	test("K3: dated-row content edit applies bucket-wide incl. settled rows", async () => {
		const res = await t.call(
			t.teacherA.token,
			`/api/classes/${classId}/sessions/2026-09-01/edit`,
			{ body: { topic: "Chung cả bucket" } },
		);
		expect(((await res.json()) as { updated: number }).updated).toBe(2);

		const changedTopic = await t.call(
			t.teacherA.token,
			`/api/lessons/${(await lessonRows()).find((r) => r.date === "2026-09-01")!.id}/edit`,
			{
				body: { day: 2, time: "20:15", dur: 60, topic: "LWW chung", zoom: "" },
			},
		);
		expect(changedTopic.status).toBe(200);
		for (const r of (await lessonRows()).filter(
			(x) => x.date === "2026-09-01",
		)) {
			expect(r.topic).toBe("LWW chung");
			expect(r.time).toBe("20:15");
		}
	});

	test("K3 legacy path byte-for-byte: undated conditional-write keeps optimistic concurrency", async () => {
		// Hand-insert an undated upcoming row (legacy-style data).
		const orgRow = await t.libsql.select().from(schema.organization);
		const orgId = orgRow[0]!.id;
		const enrollmentRows = await t.libsql.select().from(schema.enrollment);
		const id = crypto.randomUUID();
		await t.libsql.insert(lesson).values({
			id,
			orgId,
			classId,
			enrollmentId: enrollmentRows[0]!.id,
			day: 2,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "upcoming",
			topic: "base",
			zoom: "",
			date: null,
		});
		// Two racing edits share one pre-read ordering like kernel.test.ts:
		// the field-value guards let exactly ONE land; the loser gets 409.
		const [r1, r2] = await Promise.all([
			t.call(t.teacherA.token, `/api/lessons/${id}/edit`, {
				body: { day: 2, time: "19:00", dur: 90, topic: "A", zoom: "" },
			}),
			t.call(t.teacherA.token, `/api/lessons/${id}/edit`, {
				body: { day: 2, time: "19:00", dur: 90, topic: "B", zoom: "" },
			}),
		]);
		const statuses = [r1.status, r2.status].sort();
		expect(statuses).toEqual([200, 409]);
	});

	test("CSRF ordering contract: kernel.use('*') registered before every kernel.post (RT13)", async () => {
		const source = readFileSync(
			new URL("./routes/kernel.ts", import.meta.url).pathname,
			"utf8",
		);
		const useIdx = source.indexOf('kernel.use("*"');
		expect(useIdx).toBeGreaterThan(-1);
		const postMatches = [...source.matchAll(/kernel\.post\(/g)];
		expect(postMatches.length).toBeGreaterThan(5);
		for (const match of postMatches) {
			expect(match.index).toBeGreaterThan(useIdx);
		}
	});
});
