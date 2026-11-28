import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	ENROLLMENT_ERROR_CODES,
	type KernelSnapshot,
	type StudentOverview,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db, enforceDeclaredSize, type MediaStore } from "./app";
import { backfillStuckEnrollments } from "./routes/syllabus";
import type { SessionUser } from "./session";

const WEB_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function createMemoryMediaStore() {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	const store: MediaStore = {
		async put(key, body, { contentType, size }) {
			const counted = enforceDeclaredSize(body, size);
			const bytes = new Uint8Array(
				await new Response(counted.stream).arrayBuffer(),
			);
			objects.set(key, { bytes, contentType });
		},
		async get(key) {
			const object = objects.get(key);
			if (!object) return null;
			return {
				body: new Response(object.bytes).body as ReadableStream<Uint8Array>,
				contentType: object.contentType,
				size: object.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
	return { store, objects };
}

function nextDowISO(fromISO: string, utcDay: number): string {
	let d = addDaysISO(fromISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== utcDay) {
		d = addDaysISO(d, 1);
	}
	return d;
}

async function setupHarness() {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const db = libsql as unknown as Db;

	const sessions = new Map<string, SessionUser>();
	const media = createMemoryMediaStore();
	const bgPromises: Promise<void>[] = [];
	const currentNow = new Date();

	const app = buildApp({
		getDb: () => db,
		corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN],
		getSessionUser: async (headers) => {
			const key = headers.get("x-test-user");
			return key ? (sessions.get(key) ?? null) : null;
		},
		authHandler: () => new Response("auth stub", { status: 404 }),
		getMediaStore: () => media.store,
		runInBackground: (p) => {
			bgPromises.push(p.then(() => undefined));
		},
		now: () => currentNow,
	});

	await libsql.insert(schema.organization).values([
		{ id: "org-1", name: "Org 1" },
		{ id: "org-2", name: "Org 2" },
	]);

	async function seedStaff(
		key: string,
		role: "teacher" | "owner" | "admin" | "class_teacher" | "ta",
		orgId = "org-1",
	) {
		const userId = `u-${key}`;
		const email = `${key}@test.local`;
		await libsql.insert(schema.user).values({
			id: userId,
			name: key,
			email,
			emailVerified: true,
			role: "teacher",
		});
		await libsql.insert(schema.membership).values({
			id: `mem-${key}`,
			orgId,
			userId,
			role,
		});
		sessions.set(key, {
			userId,
			userName: key,
			email,
			emailVerified: true,
			role: "teacher",
		});
		return { userId, key };
	}

	async function seedStudentUser(key: string, name: string, email: string) {
		const userId = `u-${key}`;
		await libsql.insert(schema.user).values({
			id: userId,
			name,
			email,
			emailVerified: true,
			role: "student",
		});
		sessions.set(key, {
			userId,
			userName: name,
			email,
			emailVerified: true,
			role: "student",
		});
		return { userId, key, email };
	}

	const teacher = await seedStaff("teacher-1", "teacher", "org-1");

	function call(
		userKey: string | null,
		path: string,
		options: {
			method?: string;
			body?: unknown;
			origin?: string;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (userKey) headers["x-test-user"] = userKey;
		headers.origin = options.origin ?? WEB_ORIGIN;
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method: options.method ?? "GET",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function createAutoClass(
		opts: { sessionsTotal?: number; startDate?: string; name?: string } = {},
	) {
		const todayISO = vietnamTodayISO(currentNow);
		const startDate = opts.startDate ?? nextDowISO(todayISO, 1); // Monday
		const res = await call(teacher.key, "/api/classes", {
			method: "POST",
			body: {
				name: opts.name ?? "IELTS Core",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Reading", "Writing", "Speaking", "Listening"],
				mode: "Online",
				templateId: "",
				schedulingMode: "auto",
				schedule: { days: [0, 2], start: "18:00", end: "19:30" },
				sessionsTotal: opts.sessionsTotal ?? 4,
				startDate,
			},
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function createStudentAndEnroll(
		name: string,
		email: string,
		classId: string,
		activateNow = true,
	) {
		const sRes = await call(teacher.key, "/api/students", {
			method: "POST",
			body: {
				name,
				email,
				phone: "0900000001",
				parentName: "PH",
				parentPhone: "0900000002",
				entryScore: "5.0",
				classId,
				activateNow: false,
			},
		});
		expect(sRes.status).toBe(201);
		const studentId = ((await sRes.json()) as { id: string }).id;
		const rows = await libsql
			.select()
			.from(schema.enrollment)
			.where(
				and(
					eq(schema.enrollment.classId, classId),
					eq(schema.enrollment.studentId, studentId),
				),
			);
		const enrollmentId = rows[0]?.id ?? "";
		if (activateNow && enrollmentId) {
			const actRes = await call(
				teacher.key,
				`/api/enrollments/${enrollmentId}/accept`,
				{
					method: "POST",
					body: {},
				},
			);
			expect(actRes.status).toBe(200);
		}
		return { studentId, enrollmentId };
	}

	async function createHoliday(input: {
		name: string;
		fromDate: string;
		toDate: string;
		scope: "org" | "classes";
		classIds: string[];
		mode: "shift" | "cancel";
	}) {
		const prevRes = await call(teacher.key, "/api/holidays/preview", {
			method: "POST",
			body: input,
		});
		expect(prevRes.status).toBe(200);
		const prev = (await prevRes.json()) as { planHash: string };
		const applyRes = await call(teacher.key, "/api/holidays", {
			method: "POST",
			body: { ...input, planHash: prev.planHash },
		});
		expect(applyRes.status).toBe(200);
		return ((await applyRes.json()) as { holidayId: string }).holidayId;
	}

	async function flushBackground() {
		await Promise.all(bgPromises.splice(0, bgPromises.length));
	}

	return {
		client,
		libsql,
		db,
		app,
		media,
		teacher,
		currentNow,
		seedStaff,
		seedStudentUser,
		call,
		createAutoClass,
		createStudentAndEnroll,
		createHoliday,
		flushBackground,
	};
}

describe("DELETE /api/enrollments/:id soft removal & isolation", () => {
	test("soft-deletes active enrollment, preserves attended lessons/submitted work/invoices, cleans up upcoming/unattended/drafts+R2", async () => {
		const h = await setupHarness();
		try {
			const classId = await h.createAutoClass({ sessionsTotal: 4 });
			const { studentId, enrollmentId } = await h.createStudentAndEnroll(
				"Nguyen Van A",
				"a@student.local",
				classId,
			);

			const lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, enrollmentId))
				.orderBy(schema.lesson.date);
			expect(lessons).toHaveLength(4);

			// 1 completed, 1 absent (kept), 1 unattended holiday + 1 upcoming (deleted)
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(eq(schema.lesson.id, lessons[0]?.id ?? ""));
			await h.libsql
				.update(schema.lesson)
				.set({ status: "absent", attendance: "unexcused" })
				.where(eq(schema.lesson.id, lessons[1]?.id ?? ""));
			await h.libsql
				.update(schema.lesson)
				.set({ status: "holiday" })
				.where(eq(schema.lesson.id, lessons[2]?.id ?? ""));

			// Create invoice + payment transaction
			const invRes = await h.call(h.teacher.key, "/api/invoices", {
				method: "POST",
				body: {
					enrollmentId,
					amount: 2_000_000,
					due: "2027-07-01",
					note: "Học phí kỳ 1",
				},
			});
			expect(invRes.status).toBe(201);
			const invoiceId = ((await invRes.json()) as { id: string }).id;
			await h.libsql.insert(schema.paymentTransaction).values({
				id: "txn-1",
				orgId: "org-1",
				provider: "manual",
				providerTxnId: "manual-txn-1",
				amount: 500_000,
				invoiceId,
				matchStatus: "matched",
			});

			await h.libsql.insert(schema.assignmentPrompt).values([
				{
					id: "p-draft",
					orgId: "org-1",
					task: "part1",
					genre: "speaking",
					skill: "speaking",
					type: "speaking",
					title: "Speaking draft",
					prompt: "Talk",
					questions: "[]",
				},
				{
					id: "p-sub",
					orgId: "org-1",
					task: "part1",
					genre: "reading",
					skill: "reading",
					type: "mcq",
					title: "Reading sub",
					prompt: "Read",
					questions: "[]",
				},
				{
					id: "p-flip",
					orgId: "org-1",
					task: "part1",
					genre: "reading",
					skill: "reading",
					type: "mcq",
					title: "Reading flip-first",
					prompt: "Read",
					questions: "[]",
				},
			]);
			await h.libsql.insert(schema.classAssignment).values([
				{
					id: "ca-draft",
					orgId: "org-1",
					classId,
					promptId: "p-draft",
					title: "Draft Speaking",
					due: "2027-07-10",
				},
				{
					id: "ca-sub",
					orgId: "org-1",
					classId,
					promptId: "p-sub",
					title: "Submitted Reading",
					due: "2027-07-10",
				},
				{
					id: "ca-flip",
					orgId: "org-1",
					classId,
					promptId: "p-flip",
					title: "Flip First",
					due: "2027-07-10",
				},
			]);
			await h.libsql.insert(schema.classAssignmentTarget).values([
				{
					id: "cat-draft",
					orgId: "org-1",
					assignmentId: "ca-draft",
					studentId,
					submittedAt: null,
				},
				{
					id: "cat-sub",
					orgId: "org-1",
					assignmentId: "ca-sub",
					studentId,
					submittedAt: "2026-11-28T07:00:00.000Z",
				},
				{
					id: "cat-flip",
					orgId: "org-1",
					assignmentId: "ca-flip",
					studentId,
					submittedAt: null,
				},
			]);
			const draftKey = "quiz-media/org-1/qa-draft/test.webm";
			const subKey = "quiz-media/org-1/qa-sub/test.webm";
			await h.media.store.put(
				draftKey,
				new Response(new Uint8Array([1, 2, 3]))
					.body as ReadableStream<Uint8Array>,
				{ contentType: "audio/webm", size: 3 },
			);
			await h.media.store.put(
				subKey,
				new Response(new Uint8Array([4, 5, 6]))
					.body as ReadableStream<Uint8Array>,
				{ contentType: "audio/webm", size: 3 },
			);
			await h.libsql.insert(schema.quizAttempt).values([
				{
					id: "qa-draft",
					orgId: "org-1",
					assignmentId: "ca-draft",
					studentId,
					mode: "assignment",
					status: "in_progress",
					questionsSnapshot: "[]",
					mediaKey: draftKey,
				},
				{
					id: "qa-sub",
					orgId: "org-1",
					assignmentId: "ca-sub",
					studentId,
					mode: "assignment",
					status: "submitted",
					questionsSnapshot: "[]",
					mediaKey: subKey,
					submittedAt: new Date("2026-11-28T07:00:00.000Z"),
				},
				{
					id: "qa-flip",
					orgId: "org-1",
					assignmentId: "ca-flip",
					studentId,
					mode: "assignment",
					status: "submitted",
					questionsSnapshot: "[]",
					submittedAt: new Date("2026-11-28T07:30:00.000Z"),
				},
			]);

			const delRes = await h.call(
				h.teacher.key,
				`/api/enrollments/${enrollmentId}`,
				{ method: "DELETE" },
			);
			expect(delRes.status).toBe(200);
			expect(await delRes.json()).toEqual({ ok: true });
			await h.flushBackground();

			const [enrAfter] = await h.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.id, enrollmentId));
			expect(enrAfter?.status).toBe("removed");
			expect(enrAfter?.removedAt).toBeInstanceOf(Date);

			const [pkgAfter] = await h.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, enrollmentId));
			expect(pkgAfter?.status).toBe("cancelled");

			const keptLessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, enrollmentId));
			expect(keptLessons.map((l) => l.status).sort()).toEqual([
				"absent",
				"completed",
			]);

			const keptAttempts = await h.libsql
				.select()
				.from(schema.quizAttempt)
				.where(eq(schema.quizAttempt.studentId, studentId));
			expect(keptAttempts.map((a) => a.id).sort()).toEqual([
				"qa-flip",
				"qa-sub",
			]);
			expect(h.media.objects.has(draftKey)).toBe(false);
			expect(h.media.objects.has(subKey)).toBe(true);

			const keptTargets = await h.libsql
				.select()
				.from(schema.classAssignmentTarget)
				.where(eq(schema.classAssignmentTarget.studentId, studentId));
			expect(keptTargets.map((t) => t.id).sort()).toEqual([
				"cat-flip",
				"cat-sub",
			]);

			const [keptInv] = await h.libsql
				.select()
				.from(schema.invoice)
				.where(eq(schema.invoice.id, invoiceId));
			expect(keptInv).toBeTruthy();

			const snapRes = await h.call(h.teacher.key, "/api/kernel");
			const snap = (await snapRes.json()) as KernelSnapshot;
			const wireEnr = snap.enrollments.find((e) => e.id === enrollmentId);
			expect(wireEnr?.removedAt).toBeTruthy();
		} finally {
			h.client.close();
		}
	});

	test("enforces roles (403 ta), paused class allowed, rejects removed accept/invoice with 409, and stale E1 delete does not touch E2", async () => {
		const h = await setupHarness();
		try {
			const ta = await h.seedStaff("ta-1", "ta", "org-1");
			const classTeacher = await h.seedStaff("ct-1", "class_teacher", "org-1");
			const studentUser = await h.seedStudentUser(
				"stu-b",
				"HV B",
				"b@student.local",
			);
			const classId = await h.createAutoClass({ sessionsTotal: 4 });
			const { studentId, enrollmentId: e1 } = await h.createStudentAndEnroll(
				"HV B",
				studentUser.email,
				classId,
			);

			expect(
				(await h.call(ta.key, `/api/enrollments/${e1}`, { method: "DELETE" }))
					.status,
			).toBe(403);

			// Pause class -> class_teacher still allowed to remove
			expect(
				(
					await h.call(h.teacher.key, `/api/classes/${classId}/status`, {
						method: "POST",
						body: { status: "paused" },
					})
				).status,
			).toBe(200);

			expect(
				(
					await h.call(classTeacher.key, `/api/enrollments/${e1}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			// Kernel & Student accept on removed enrollment while class is paused MUST return 409 ENROLLMENT_ALREADY_REMOVED (not CLASS_PAUSED)
			const acceptKernelRes = await h.call(
				h.teacher.key,
				`/api/enrollments/${e1}/accept`,
				{ method: "POST", body: {} },
			);
			expect(acceptKernelRes.status).toBe(409);
			expect(await acceptKernelRes.json()).toMatchObject({
				code: ENROLLMENT_ERROR_CODES.ALREADY_REMOVED,
			});

			const acceptStudentRes = await h.call(
				studentUser.key,
				`/api/student/enrollments/${e1}/accept`,
				{ method: "POST", body: {}, origin: STUDENT_ORIGIN },
			);
			expect(acceptStudentRes.status).toBe(409);
			expect(await acceptStudentRes.json()).toMatchObject({
				code: ENROLLMENT_ERROR_CODES.ALREADY_REMOVED,
			});

			const invRes = await h.call(h.teacher.key, "/api/invoices", {
				method: "POST",
				body: {
					enrollmentId: e1,
					amount: 1_000_000,
					due: "2027-07-01",
					note: "",
				},
			});
			expect(invRes.status).toBe(409);
			expect(await invRes.json()).toMatchObject({
				code: ENROLLMENT_ERROR_CODES.ALREADY_REMOVED,
			});

			// Resume class and re-enroll as E2
			await h.call(h.teacher.key, `/api/classes/${classId}/status`, {
				method: "POST",
				body: { status: "active" },
			});
			const reEnrollRes = await h.call(
				h.teacher.key,
				`/api/classes/${classId}/enroll`,
				{
					method: "POST",
					body: { studentId, activateNow: true },
				},
			);
			expect(reEnrollRes.status).toBe(201);
			const e2 = ((await reEnrollRes.json()) as { id: string }).id;
			expect(e2).not.toBe(e1);

			await h.libsql.insert(schema.assignmentPrompt).values({
				id: "p-e2",
				orgId: "org-1",
				task: "part1",
				genre: "reading",
				skill: "reading",
				type: "mcq",
				title: "E2 Prompt",
				prompt: "P",
				questions: "[]",
			});
			await h.libsql.insert(schema.classAssignment).values({
				id: "ca-e2",
				orgId: "org-1",
				classId,
				promptId: "p-e2",
				title: "E2 Assignment",
				due: "2027-07-15",
			});
			await h.libsql.insert(schema.classAssignmentTarget).values({
				id: "cat-e2",
				orgId: "org-1",
				assignmentId: "ca-e2",
				studentId,
				submittedAt: null,
			});
			await h.libsql.insert(schema.quizAttempt).values({
				id: "qa-e2",
				orgId: "org-1",
				assignmentId: "ca-e2",
				studentId,
				mode: "assignment",
				status: "in_progress",
				questionsSnapshot: "[]",
			});

			const staleDelRes = await h.call(
				h.teacher.key,
				`/api/enrollments/${e1}`,
				{
					method: "DELETE",
				},
			);
			expect(staleDelRes.status).toBe(409);
			expect(await staleDelRes.json()).toMatchObject({
				code: ENROLLMENT_ERROR_CODES.ALREADY_REMOVED,
			});

			expect(
				await h.libsql
					.select()
					.from(schema.classAssignmentTarget)
					.where(eq(schema.classAssignmentTarget.id, "cat-e2")),
			).toHaveLength(1);
			expect(
				await h.libsql
					.select()
					.from(schema.quizAttempt)
					.where(eq(schema.quizAttempt.id, "qa-e2")),
			).toHaveLength(1);
		} finally {
			h.client.close();
		}
	});

	test("re-enrollment skips priorDates, maintains reduced sessionPackage.total across manual sessions, and avoids backfill loops when total=0", async () => {
		const h = await setupHarness();
		try {
			const mRes = await h.call(h.teacher.key, "/api/classes", {
				method: "POST",
				body: {
					name: "Manual Re-enroll",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Writing"],
					mode: "Online",
					templateId: "",
					schedulingMode: "manual",
					schedule: { days: [0, 2], start: "18:00", end: "19:30" },
					sessionsTotal: 12,
					startDate: "",
				},
			});
			expect(mRes.status).toBe(201);
			const classId = ((await mRes.json()) as { id: string }).id;
			const today = vietnamTodayISO(h.currentNow);
			const d1 = addDaysISO(today, 3);
			const d2 = addDaysISO(today, 5);
			const d3 = addDaysISO(today, 7);
			const d4 = addDaysISO(today, 9);
			for (const date of [d1, d2, d3]) {
				const sRes = await h.call(
					h.teacher.key,
					`/api/classes/${classId}/sessions`,
					{
						method: "POST",
						body: { date, time: "18:00", dur: 90, topic: date, zoom: "" },
					},
				);
				expect(sRes.status).toBe(201);
			}

			const { studentId, enrollmentId: e1 } = await h.createStudentAndEnroll(
				"HV Manual",
				"manual@student.local",
				classId,
			);
			const e1Lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, e1))
				.orderBy(schema.lesson.date);
			expect(e1Lessons).toHaveLength(3);

			// Mark d1 completed -> retained on delete
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(eq(schema.lesson.id, e1Lessons[0]?.id ?? ""));

			expect(
				(
					await h.call(h.teacher.key, `/api/enrollments/${e1}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);
			const reRes = await h.call(
				h.teacher.key,
				`/api/classes/${classId}/enroll`,
				{
					method: "POST",
					body: { studentId, activateNow: true },
				},
			);
			expect(reRes.status).toBe(201);
			const e2 = ((await reRes.json()) as { id: string }).id;

			const e2Lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, e2))
				.orderBy(schema.lesson.date);
			expect(e2Lessons.map((l) => l.date)).toEqual([d2, d3]);
			const [e2Pkg] = await h.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, e2));
			expect(e2Pkg?.total).toBe(2);

			// Adding d4 -> e2 pkg.total becomes 3 (NOT 4)
			expect(
				(
					await h.call(h.teacher.key, `/api/classes/${classId}/sessions`, {
						method: "POST",
						body: { date: d4, time: "18:00", dur: 90, topic: "S4", zoom: "" },
					})
				).status,
			).toBe(201);
			const [e2PkgAfterAdd] = await h.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, e2));
			expect(e2PkgAfterAdd?.total).toBe(3);

			// Deleting d3 -> e2 pkg.total becomes 2
			expect(
				(
					await h.call(
						h.teacher.key,
						`/api/classes/${classId}/sessions/${d3}`,
						{ method: "DELETE" },
					)
				).status,
			).toBe(200);
			const [e2PkgAfterDel] = await h.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, e2));
			expect(e2PkgAfterDel?.total).toBe(2);

			// Auto class: re-enroll when ALL dates completed (total = 0) does NOT loop backfillStuckEnrollments
			const autoId = await h.createAutoClass({
				sessionsTotal: 1,
				name: "Single Session Auto",
			});
			const { studentId: sid2, enrollmentId: autoE1 } =
				await h.createStudentAndEnroll(
					"HV FullDone",
					"done@student.local",
					autoId,
				);
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(eq(schema.lesson.enrollmentId, autoE1));
			await h.call(h.teacher.key, `/api/enrollments/${autoE1}`, {
				method: "DELETE",
			});
			const reAuto = await h.call(
				h.teacher.key,
				`/api/classes/${autoId}/enroll`,
				{
					method: "POST",
					body: { studentId: sid2, activateNow: true },
				},
			);
			expect(reAuto.status).toBe(201);
			const healed = await backfillStuckEnrollments(h.db, "org-1", autoId);
			expect(healed).toBe(0);
		} finally {
			h.client.close();
		}
	});

	test("holidays, startDate reschedule, org-holiday while 0 active students, and occurrence/lesson guards isolate removed enrollments", async () => {
		const h = await setupHarness();
		try {
			const today = vietnamTodayISO(h.currentNow);
			const firstMon = nextDowISO(today, 1);

			// 1. Unstarted class with holiday -> remove sole student -> delete holiday + edit startDate succeed
			const classId = await h.createAutoClass({
				sessionsTotal: 2,
				startDate: firstMon,
			});
			const { enrollmentId } = await h.createStudentAndEnroll(
				"HV Holiday",
				"hol@student.local",
				classId,
			);
			const holidayId = await h.createHoliday({
				name: "Nghỉ lễ lớp",
				fromDate: firstMon,
				toDate: firstMon,
				scope: "classes",
				classIds: [classId],
				mode: "shift",
			});

			expect(
				(
					await h.call(h.teacher.key, `/api/enrollments/${enrollmentId}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			expect(
				(
					await h.call(h.teacher.key, `/api/holidays/${holidayId}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			const newTue = nextDowISO(firstMon, 2);
			const patchRes = await h.call(h.teacher.key, `/api/classes/${classId}`, {
				method: "PATCH",
				body: {
					name: "IELTS Core Renamed",
					type: "ielts",
					level: "Band 6.0",
					skills: ["Reading", "Writing", "Speaking", "Listening"],
					mode: "Online",
					tuitionFee: null,
					schedule: { days: [1, 3], start: "18:00", end: "19:30" },
					sessionsTotal: 3,
					startDate: newTue,
				},
			});
			expect(patchRes.status).toBe(200);

			// 2. Two students: A attended on session 1 & removed; B upcoming -> holiday on session 1 shifts B; occurrence & lesson guards protect A
			const class2 = await h.createAutoClass({
				sessionsTotal: 2,
				startDate: firstMon,
				name: "Two Students",
			});
			const a = await h.createStudentAndEnroll("HV A", "a2@s.local", class2);
			const b = await h.createStudentAndEnroll("HV B", "b2@s.local", class2);
			const [aLesson1] = await h.libsql
				.select()
				.from(schema.lesson)
				.where(
					and(
						eq(schema.lesson.enrollmentId, a.enrollmentId),
						eq(schema.lesson.date, firstMon),
					),
				);
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(eq(schema.lesson.id, aLesson1?.id ?? ""));
			await h.call(h.teacher.key, `/api/enrollments/${a.enrollmentId}`, {
				method: "DELETE",
			});

			await h.createHoliday({
				name: "Holiday 2",
				fromDate: firstMon,
				toDate: firstMon,
				scope: "classes",
				classIds: [class2],
				mode: "shift",
			});
			const bLessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, b.enrollmentId));
			expect(bLessons.find((l) => l.date === firstMon)?.status).toBe("holiday");

			// Lesson action on removed student's historical lesson returns 409 ENROLLMENT_ALREADY_REMOVED
			const lessonCheckRes = await h.call(
				h.teacher.key,
				`/api/lessons/${aLesson1?.id}/check-in`,
				{ method: "POST", body: {} },
			);
			expect(lessonCheckRes.status).toBe(409);
			expect(await lessonCheckRes.json()).toMatchObject({
				code: ENROLLMENT_ERROR_CODES.ALREADY_REMOVED,
			});

			// Now remove B too -> class2 only has A's completed row on firstMon (0 active rows)
			await h.call(h.teacher.key, `/api/enrollments/${b.enrollmentId}`, {
				method: "DELETE",
			});
			const occCancelOnlyRemoved = await h.call(
				h.teacher.key,
				`/api/classes/${class2}/sessions/${firstMon}/cancel`,
				{ method: "POST", body: {} },
			);
			expect(occCancelOnlyRemoved.status).toBe(404);

			// 3. Sole student attended session 1, removed, org holiday created while 0 active students, then re-enroll -> holiday applied to remaining sessions
			const class3 = await h.createAutoClass({
				sessionsTotal: 2,
				startDate: firstMon,
				name: "Solo Re-enroll Holiday",
			});
			const c1 = await h.createStudentAndEnroll("HV C", "c3@s.local", class3);
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(
					and(
						eq(schema.lesson.enrollmentId, c1.enrollmentId),
						eq(schema.lesson.date, firstMon),
					),
				);
			await h.call(h.teacher.key, `/api/enrollments/${c1.enrollmentId}`, {
				method: "DELETE",
			});
			const secondWed = nextDowISO(firstMon, 3);
			// Create org holiday directly (since 0 active classes would reject NO_SESSIONS if scope='classes' with 0 lessons)
			await h.libsql.insert(schema.organizationHoliday).values({
				id: "org-hol-solo",
				orgId: "org-1",
				name: "Nghỉ toàn TT",
				fromDate: secondWed,
				toDate: secondWed,
				scope: "org",
				mode: "shift",
				createdByUserId: h.teacher.userId,
			});
			const reC = await h.call(h.teacher.key, `/api/classes/${class3}/enroll`, {
				method: "POST",
				body: { studentId: c1.studentId, activateNow: true },
			});
			expect(reC.status).toBe(201);
			const c2Id = ((await reC.json()) as { id: string }).id;
			const c2Lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, c2Id));
			expect(c2Lessons.find((l) => l.date === secondWed)?.status).toBe(
				"holiday",
			);
		} finally {
			h.client.close();
		}
	});

	test("Student Portal revokes removed class/quiz/attempt write access while preserving invoices, history & submitted audio/media", async () => {
		const h = await setupHarness();
		try {
			const studentUser = await h.seedStudentUser(
				"stu-user",
				"HV Portal",
				"portal@student.local",
			);
			const classId = await h.createAutoClass({ sessionsTotal: 2 });
			const { studentId, enrollmentId } = await h.createStudentAndEnroll(
				"HV Portal",
				studentUser.email,
				classId,
			);

			await h.libsql.insert(schema.assignmentPrompt).values([
				{
					id: "p-unsub",
					orgId: "org-1",
					task: "part1",
					genre: "listening",
					skill: "listening",
					type: "mcq",
					title: "Unsub Listening",
					prompt: "Listen",
					audioUrl: "https://example.com/unsub.mp3",
					questions: JSON.stringify([
						{ stem: "Q1", opts: ["A", "B"], answer: "A" },
					]),
				},
				{
					id: "p-done",
					orgId: "org-1",
					task: "part1",
					genre: "speaking",
					skill: "speaking",
					type: "speaking",
					title: "Done Speaking",
					prompt: "Speak",
					questions: "[]",
				},
				{
					id: "p-done-listen",
					orgId: "org-1",
					task: "part1",
					genre: "listening",
					skill: "listening",
					type: "mcq",
					title: "Done Listening",
					prompt: "Listen",
					audioKey: "library/audio/done.mp3",
					questions: JSON.stringify([
						{ stem: "Q1", opts: ["A", "B"], answer: "A" },
					]),
				},
			]);
			await h.libsql.insert(schema.classAssignment).values([
				{
					id: "ca-unsub",
					orgId: "org-1",
					classId,
					promptId: "p-unsub",
					title: "Unsub Listening",
					due: "2027-07-20",
				},
				{
					id: "ca-done",
					orgId: "org-1",
					classId,
					promptId: "p-done",
					title: "Done Speaking",
					due: "2027-07-20",
				},
				{
					id: "ca-done-listen",
					orgId: "org-1",
					classId,
					promptId: "p-done-listen",
					title: "Done Listening",
					due: "2027-07-20",
				},
			]);
			await h.libsql.insert(schema.classAssignmentTarget).values([
				{
					id: "cat-unsub",
					orgId: "org-1",
					assignmentId: "ca-unsub",
					studentId,
					submittedAt: null,
				},
				{
					id: "cat-done",
					orgId: "org-1",
					assignmentId: "ca-done",
					studentId,
					submittedAt: "2026-11-28T06:00:00.000Z",
				},
				{
					id: "cat-done-listen",
					orgId: "org-1",
					assignmentId: "ca-done-listen",
					studentId,
					submittedAt: "2026-11-28T06:00:00.000Z",
				},
			]);
			const doneMediaKey = "quiz-media/org-1/qa-done/speech.webm";
			await h.media.store.put(
				doneMediaKey,
				new Response(new Uint8Array([9, 8, 7]))
					.body as ReadableStream<Uint8Array>,
				{ contentType: "audio/webm", size: 3 },
			);
			await h.libsql.insert(schema.quizAttempt).values([
				{
					id: "qa-unsub",
					orgId: "org-1",
					assignmentId: "ca-unsub",
					studentId,
					mode: "assignment",
					status: "in_progress",
					questionsSnapshot: JSON.stringify([
						{ stem: "Q1", opts: ["A", "B"], answer: "A" },
					]),
				},
				{
					id: "qa-done",
					orgId: "org-1",
					assignmentId: "ca-done",
					studentId,
					mode: "assignment",
					status: "submitted",
					questionsSnapshot: "[]",
					mediaKey: doneMediaKey,
					mediaName: "speech.webm",
					mediaType: "audio/webm",
					mediaSize: 3,
					submittedAt: new Date("2026-11-28T06:00:00.000Z"),
				},
				{
					id: "qa-done-listen",
					orgId: "org-1",
					assignmentId: "ca-done-listen",
					studentId,
					mode: "assignment",
					status: "submitted",
					questionsSnapshot: JSON.stringify([
						{ stem: "Q1", opts: ["A", "B"], answer: "A" },
					]),
					submittedAt: new Date("2026-11-28T06:00:00.000Z"),
				},
			]);
			await h.call(h.teacher.key, "/api/invoices", {
				method: "POST",
				body: { enrollmentId, amount: 3_000_000, due: "2027-07-01", note: "" },
			});

			// Soft-remove student from class
			expect(
				(
					await h.call(h.teacher.key, `/api/enrollments/${enrollmentId}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			// Overview omits class & assignments from removed class
			const ovRes = await h.call(studentUser.key, "/api/student/overview", {
				origin: STUDENT_ORIGIN,
			});
			expect(ovRes.status).toBe(200);
			const ov = (await ovRes.json()) as StudentOverview;
			expect(ov.classes).toHaveLength(0);
			expect(ov.assignments.filter((a) => a.classId === classId)).toHaveLength(
				0,
			);

			expect(
				(
					await h.call(studentUser.key, `/api/student/classes/${classId}`, {
						origin: STUDENT_ORIGIN,
					})
				).status,
			).toBe(404);
			expect(
				(
					await h.call(
						studentUser.key,
						"/api/student/assignments/ca-unsub/quiz",
						{ origin: STUDENT_ORIGIN },
					)
				).status,
			).toBe(404);
			expect(
				(
					await h.call(
						studentUser.key,
						"/api/student/assignments/ca-unsub/quiz/start",
						{ method: "POST", body: {}, origin: STUDENT_ORIGIN },
					)
				).status,
			).toBe(404);
			expect(
				(
					await h.call(
						studentUser.key,
						"/api/student/assignments/ca-unsub/audio",
						{ origin: STUDENT_ORIGIN },
					)
				).status,
			).toBe(404);

			// Simulate orphaned in_progress attempt surviving a race -> mutation routes MUST return 404
			await h.libsql.insert(schema.classAssignmentTarget).values({
				id: "cat-orphan",
				orgId: "org-1",
				assignmentId: "ca-unsub",
				studentId,
				submittedAt: null,
			});
			await h.libsql.insert(schema.quizAttempt).values({
				id: "qa-orphan",
				orgId: "org-1",
				assignmentId: "ca-unsub",
				studentId,
				mode: "assignment",
				status: "in_progress",
				questionsSnapshot: JSON.stringify([
					{ stem: "Q1", opts: ["A", "B"], answer: "A" },
				]),
			});
			expect(
				(
					await h.call(
						studentUser.key,
						"/api/student/attempts/qa-orphan/answer",
						{
							method: "PATCH",
							body: { q: 0, value: "A" },
							origin: STUDENT_ORIGIN,
						},
					)
				).status,
			).toBe(404);
			expect(
				(
					await h.call(
						studentUser.key,
						"/api/student/attempts/qa-orphan/submit",
						{ method: "POST", body: {}, origin: STUDENT_ORIGIN },
					)
				).status,
			).toBe(404);

			// Invoices, history, and submitted attempt review/media remain accessible
			const invsRes = await h.call(studentUser.key, "/api/student/invoices", {
				origin: STUDENT_ORIGIN,
			});
			expect(invsRes.status).toBe(200);
			expect((await invsRes.json()) as unknown[]).toHaveLength(1);

			expect(
				(
					await h.call(studentUser.key, "/api/student/history", {
						origin: STUDENT_ORIGIN,
					})
				).status,
			).toBe(200);
			expect(
				(
					await h.call(studentUser.key, "/api/student/attempts/qa-done", {
						origin: STUDENT_ORIGIN,
					})
				).status,
			).toBe(200);
			expect(
				(
					await h.call(studentUser.key, "/api/student/attempts/qa-done/media", {
						origin: STUDENT_ORIGIN,
					})
				).status,
			).toBe(200);
		} finally {
			h.client.close();
		}
	});

	test("bucketMoved moves meeting/assignment when removed student has historical lesson at dateISO, and priorDates filters before holiday planning on re-enroll", async () => {
		const h = await setupHarness();
		try {
			const today = vietnamTodayISO(h.currentNow);
			const firstMon = nextDowISO(today, 1);

			// Part A: bucketMoved with removed student historical completed lesson at d1
			const classId = await h.createAutoClass({
				sessionsTotal: 2,
				startDate: firstMon,
				name: "Bucket Move Class",
			});
			const { enrollmentId: e1 } = await h.createStudentAndEnroll(
				"HV Active",
				"active@student.local",
				classId,
			);
			const { enrollmentId: e2 } = await h.createStudentAndEnroll(
				"HV Removed",
				"removed@student.local",
				classId,
			);
			const e1Lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, e1))
				.orderBy(schema.lesson.date);
			const d1 = e1Lessons[0]?.date ?? "";
			const d2 = e1Lessons[1]?.date ?? "";
			expect(d1).not.toBe("");
			const moveDate = addDaysISO(d2, 3);

			// Removed student attended d1 before removal -> d1 row remains after DELETE
			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(
					and(eq(schema.lesson.enrollmentId, e2), eq(schema.lesson.date, d1)),
				);
			expect(
				(
					await h.call(h.teacher.key, `/api/enrollments/${e2}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			// Seed classSessionMeeting + classAssignment linked to sessionDate = d1
			await h.libsql.insert(schema.classSessionMeeting).values({
				id: "csm-move-1",
				orgId: "org-1",
				classId,
				date: d1,
				joinUrl: "https://zoom.us/j/123456789",
				zoomMeetingId: "123456789",
			});
			await h.libsql.insert(schema.assignmentPrompt).values({
				id: "prm-move-1",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "info",
				title: "Prompt Move",
				prompt: "Read",
				questions: "[]",
				optionBank: "[]",
				note: "",
				status: "ready",
			});
			await h.libsql.insert(schema.classAssignment).values({
				id: "ca-move-1",
				orgId: "org-1",
				classId,
				promptId: "prm-move-1",
				title: "Homework D1",
				due: d2,
				sessionDate: d1,
			});

			const editRes = await h.call(
				h.teacher.key,
				`/api/classes/${classId}/sessions/${d1}/edit`,
				{
					method: "POST",
					body: {
						moveDate,
						time: "18:00",
						dur: 90,
						topic: "Moved",
						zoom: "https://zoom.us/j/123456789",
					},
				},
			);
			expect(editRes.status).toBe(200);

			const [movedAssignment] = await h.libsql
				.select()
				.from(schema.classAssignment)
				.where(eq(schema.classAssignment.id, "ca-move-1"));
			expect(movedAssignment?.sessionDate).toBe(moveDate);

			const [movedMeeting] = await h.libsql
				.select()
				.from(schema.classSessionMeeting)
				.where(eq(schema.classSessionMeeting.id, "csm-move-1"));
			expect(movedMeeting?.date).toBe(moveDate);

			const [keptRemovedLesson] = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, e2));
			expect(keptRemovedLesson?.date).toBe(d1);

			// Part B: sole active student completes future session m1 -> removed -> org holiday hits m1 (via another active class) -> re-enroll does not shift m1
			const nextMon = addDaysISO(firstMon, 7);
			const anchorClassId = await h.createAutoClass({
				sessionsTotal: 1,
				startDate: nextMon,
				name: "Anchor Org Holiday Class",
			});
			await h.createStudentAndEnroll(
				"HV Anchor",
				"anchor@student.local",
				anchorClassId,
			);
			const holClassId = await h.createAutoClass({
				sessionsTotal: 2,
				startDate: nextMon,
				name: "PriorDates Before Holiday",
			});
			const { studentId: sidHol, enrollmentId: eHol1 } =
				await h.createStudentAndEnroll(
					"HV HolPrior",
					"holprior@student.local",
					holClassId,
				);
			const holLessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, eHol1))
				.orderBy(schema.lesson.date);
			const m1 = holLessons[0]?.date ?? "";
			const m2 = holLessons[1]?.date ?? "";

			await h.libsql
				.update(schema.lesson)
				.set({ status: "completed", attendance: "present" })
				.where(
					and(
						eq(schema.lesson.enrollmentId, eHol1),
						eq(schema.lesson.date, m1),
					),
				);
			expect(
				(
					await h.call(h.teacher.key, `/api/enrollments/${eHol1}`, {
						method: "DELETE",
					})
				).status,
			).toBe(200);

			await h.createHoliday({
				name: "Nghỉ toàn TT đè buổi đã học",
				fromDate: m1,
				toDate: m1,
				scope: "org",
				classIds: [],
				mode: "shift",
			});

			const reRes = await h.call(
				h.teacher.key,
				`/api/classes/${holClassId}/enroll`,
				{
					method: "POST",
					body: { studentId: sidHol, activateNow: true },
				},
			);
			expect(reRes.status).toBe(201);
			const eHol2 = ((await reRes.json()) as { id: string }).id;

			const eHol2Lessons = await h.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, eHol2))
				.orderBy(schema.lesson.date);
			expect(eHol2Lessons.map((l) => l.date)).toEqual([m2]);

			const holShifts = await h.libsql
				.select()
				.from(schema.holidaySessionShift)
				.where(eq(schema.holidaySessionShift.classId, holClassId));
			expect(holShifts).toHaveLength(0);

			const [pkgHol2] = await h.libsql
				.select()
				.from(schema.sessionPackage)
				.where(eq(schema.sessionPackage.enrollmentId, eHol2));
			expect(pkgHol2?.total).toBe(1);
		} finally {
			h.client.close();
		}
	});
});
