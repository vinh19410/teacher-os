import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	CLASS_ERROR_CODES,
	type DailyAttendanceResponse,
	HOLIDAY_ERROR_CODES,
	type KernelSnapshot,
	type StudentClassDetail,
	type StudentOverview,
	type StudentScheduleResponse,
} from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import type { Mailer, MailInput } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import {
	activateEnrollment,
	materializeScheduleForEnrollment,
} from "./routes/enrollment-activation";
import type { SessionUser } from "./session";

const WEB_ORIGIN = "http://localhost:8001";
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

function nextDowISO(fromISO: string, utcDay: number): string {
	let d = addDaysISO(fromISO, 1);
	while (new Date(`${d}T00:00:00Z`).getUTCDay() !== utcDay) {
		d = addDaysISO(d, 1);
	}
	return d;
}

async function setupStatusTestApp() {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const baseDb = libsql as unknown as Db;

	// Optional hook to deterministically inject TOCTOU races right before a DB op.
	// Return `false` from the hook to keep it armed for a subsequent DB op.
	let dbWriteInterceptor:
		| ((op: "batch" | "update") => Promise<boolean | undefined>)
		| null = null;
	// Optional post-write hook firing right after a DB op succeeds (before post-commit checks/notifications).
	let dbPostWriteInterceptor:
		| ((op: "batch" | "insert" | "update") => Promise<boolean | undefined>)
		| null = null;

	function wrapWriteChain(op: "insert" | "update", node: unknown): unknown {
		if (!node || (typeof node !== "object" && typeof node !== "function")) {
			return node;
		}
		return new Proxy(node as object, {
			get(uTarget, uProp, uRecv) {
				if (uProp === "then") {
					const origThen = Reflect.get(uTarget, "then", uRecv);
					if (typeof origThen !== "function") return origThen;
					return (onFulfilled?: unknown, onRejected?: unknown) => {
						const run = async () => {
							if (op === "update") {
								const active = dbWriteInterceptor;
								if (active) {
									dbWriteInterceptor = null;
									const shouldConsume = await active("update");
									if (shouldConsume === false) {
										dbWriteInterceptor = active;
									}
								}
							}
							const res = await (uTarget as PromiseLike<unknown>);
							const postHook = dbPostWriteInterceptor;
							if (postHook) {
								dbPostWriteInterceptor = null;
								const shouldConsume = await postHook(op);
								if (shouldConsume === false) {
									dbPostWriteInterceptor = postHook;
								}
							}
							return res;
						};
						return run().then(
							onFulfilled as ((v: unknown) => unknown) | undefined,
							onRejected as ((e: unknown) => unknown) | undefined,
						);
					};
				}
				const val = Reflect.get(uTarget, uProp, uRecv);
				if (
					typeof val === "function" &&
					(uProp === "values" ||
						uProp === "set" ||
						uProp === "where" ||
						uProp === "returning" ||
						uProp === "onConflictDoNothing" ||
						uProp === "onConflictDoUpdate")
				) {
					return (...mArgs: unknown[]) =>
						wrapWriteChain(op, val.apply(uTarget, mArgs));
				}
				return val;
			},
		});
	}

	const db = new Proxy(baseDb as unknown as object, {
		get(target, prop, receiver) {
			if (prop === "batch") {
				return async (stmts: unknown[]) => {
					const hook = dbWriteInterceptor;
					if (hook) {
						dbWriteInterceptor = null;
						const shouldConsume = await hook("batch");
						if (shouldConsume === false) {
							dbWriteInterceptor = hook;
						}
					}
					const res = await (
						baseDb as { batch: (s: unknown[]) => Promise<unknown> }
					).batch(stmts);
					const postHook = dbPostWriteInterceptor;
					if (postHook) {
						dbPostWriteInterceptor = null;
						const shouldConsume = await postHook("batch");
						if (shouldConsume === false) {
							dbPostWriteInterceptor = postHook;
						}
					}
					return res;
				};
			}
			if (prop === "update") {
				return (...args: unknown[]) =>
					wrapWriteChain(
						"update",
						(baseDb as { update: (...a: unknown[]) => unknown }).update(
							...args,
						),
					);
			}
			if (prop === "insert") {
				return (...args: unknown[]) =>
					wrapWriteChain(
						"insert",
						(baseDb as { insert: (...a: unknown[]) => unknown }).insert(
							...args,
						),
					);
			}
			return Reflect.get(target, prop, receiver);
		},
	}) as Db;

	const sessions = new Map<string, SessionUser>();
	const sentEmails: MailInput[] = [];
	const mailer: Mailer = {
		async send(input) {
			sentEmails.push(input);
		},
	};

	const app = buildApp({
		getDb: () => db,
		corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN],
		getSessionUser: async (headers) => {
			const key = headers.get("x-test-user");
			return key ? (sessions.get(key) ?? null) : null;
		},
		authHandler: () => new Response("auth stub", { status: 404 }),
		mailer,
		studentOrigin: STUDENT_ORIGIN,
		inviteResendCooldownMs: 60_000,
	});

	await libsql.insert(schema.organization).values([
		{ id: "org-1", name: "Trung tâm A" },
		{ id: "org-2", name: "Trung tâm B" },
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
		return { userId, key };
	}

	const teacher = await seedStaff("teacher-1", "teacher", "org-1");
	const otherTeacher = await seedStaff("teacher-2", "teacher", "org-2");

	function call(
		userKey: string | null,
		path: string,
		options: {
			method?: string;
			body?: unknown;
			origin?: string | null;
		} = {},
	) {
		const headers: Record<string, string> = {};
		if (userKey) headers["x-test-user"] = userKey;
		if (options.origin !== null) {
			headers.origin = options.origin ?? WEB_ORIGIN;
		}
		if (options.body !== undefined) {
			headers["content-type"] = "application/json";
		}
		return app.request(path, {
			method: options.method ?? "POST",
			headers,
			body:
				options.body !== undefined ? JSON.stringify(options.body) : undefined,
		});
	}

	async function createClass(
		userKey = teacher.key,
		overrides: {
			name?: string;
			schedulingMode?: "auto" | "manual";
			sessionsTotal?: number;
			startDate?: string;
			schedule?: { days: number[]; start: string; end: string };
			templateId?: string;
		} = {},
	): Promise<string> {
		const res = await call(userKey, "/api/classes", {
			body: {
				name: overrides.name ?? "IELTS Foundation",
				type: "ielts",
				level: "Band 6.0",
				skills: ["Writing"],
				mode: "Online",
				templateId: overrides.templateId ?? "",
				schedulingMode: overrides.schedulingMode ?? "auto",
				schedule: overrides.schedule ?? {
					days: [0, 2],
					start: "18:00",
					end: "19:30",
				},
				sessionsTotal: overrides.sessionsTotal ?? 4,
				startDate: overrides.startDate ?? nextDowISO(vietnamTodayISO(), 1),
			},
		});
		expect(res.status).toBe(201);
		const json = (await res.json()) as { id: string };
		return json.id;
	}

	async function seedTemplate(name = "Syllabus A", lessonCount = 4) {
		const res = await call(teacher.key, "/api/syllabus-templates", {
			body: {
				name,
				level: "Band 6.0",
				type: "ielts",
				skills: ["Writing"],
				description: "",
				totalLessons: lessonCount,
				modules: [
					{
						title: "Module 1",
						description: "",
						lessons: Array.from({ length: lessonCount }, (_, i) => ({
							title: `Unit ${i + 1}`,
							objectives: "",
							materials: "",
							kind: "lesson",
							status: "upcoming",
						})),
					},
				],
			},
		});
		expect(res.status).toBe(201);
		return ((await res.json()) as { id: string }).id;
	}

	async function kernel(userKey = teacher.key): Promise<KernelSnapshot> {
		const res = await call(userKey, "/api/kernel", { method: "GET" });
		expect(res.status).toBe(200);
		return (await res.json()) as KernelSnapshot;
	}

	return {
		libsql,
		db,
		app,
		teacher,
		otherTeacher,
		sentEmails,
		seedStaff,
		seedStudentUser,
		call,
		createClass,
		seedTemplate,
		kernel,
		setDbWriteInterceptor(
			hook: ((op: "batch" | "update") => Promise<boolean | undefined>) | null,
		) {
			dbWriteInterceptor = hook;
		},
		setDbPostWriteInterceptor(
			hook:
				| ((op: "batch" | "insert" | "update") => Promise<boolean | undefined>)
				| null,
		) {
			dbPostWriteInterceptor = hook;
		},
	};
}

describe("Issue #694 — Reversible class pause & resume", () => {
	test("1. POST /classes/:id/status transitions active <-> paused idempotently, gates roles, and keeps PATCH strict", async () => {
		const t = await setupStatusTestApp();
		const ta = await t.seedStaff("ta-1", "ta", "org-1");
		const owner = await t.seedStaff("owner-1", "owner", "org-1");
		const admin = await t.seedStaff("admin-1", "admin", "org-1");
		const classTeacher = await t.seedStaff("ct-1", "class_teacher", "org-1");
		await t.seedStudentUser("stu-u", "Student", "stu@test.local");

		const classId = await t.createClass();

		// Unauthenticated -> 401
		expect(
			(
				await t.call(null, `/api/classes/${classId}/status`, {
					body: { status: "paused" },
				})
			).status,
		).toBe(401);

		// Student -> 403
		expect(
			(
				await t.call("stu-u", `/api/classes/${classId}/status`, {
					body: { status: "paused" },
				})
			).status,
		).toBe(403);

		// TA -> 403
		expect(
			(
				await t.call(ta.key, `/api/classes/${classId}/status`, {
					body: { status: "paused" },
				})
			).status,
		).toBe(403);

		// Cross-org / unknown -> 404
		expect(
			(
				await t.call(t.otherTeacher.key, `/api/classes/${classId}/status`, {
					body: { status: "paused" },
				})
			).status,
		).toBe(404);
		expect(
			(
				await t.call(t.teacher.key, "/api/classes/missing-id/status", {
					body: { status: "paused" },
				})
			).status,
		).toBe(404);

		// Invalid values rejected with 400
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
					body: { status: "archived" },
				})
			).status,
		).toBe(400);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
					body: { status: "paused", extra: 1 },
				})
			).status,
		).toBe(400);

		// Pause as class_teacher -> 200
		const pauseRes = await t.call(
			classTeacher.key,
			`/api/classes/${classId}/status`,
			{ body: { status: "paused" } },
		);
		expect(pauseRes.status).toBe(200);
		expect(await pauseRes.json()).toEqual({ ok: true, status: "paused" });

		// Idempotent pause as admin -> 200
		const idempPause = await t.call(
			admin.key,
			`/api/classes/${classId}/status`,
			{
				body: { status: "paused" },
			},
		);
		expect(idempPause.status).toBe(200);
		expect(await idempPause.json()).toEqual({ ok: true, status: "paused" });

		// PATCH /api/classes/:id still rejects status (400), allows normal edits while paused (200)
		const patchWithStatus = await t.call(
			t.teacher.key,
			`/api/classes/${classId}`,
			{
				method: "PATCH",
				body: {
					name: "Updated While Paused",
					type: "ielts",
					level: "Band 6.5",
					skills: ["Writing"],
					mode: "Online",
					status: "active",
				},
			},
		);
		expect(patchWithStatus.status).toBe(400);

		const patchValid = await t.call(t.teacher.key, `/api/classes/${classId}`, {
			method: "PATCH",
			body: {
				name: "Updated While Paused",
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				mode: "Online",
			},
		});
		expect(patchValid.status).toBe(200);

		// Resume as owner -> 200
		const resumeRes = await t.call(
			owner.key,
			`/api/classes/${classId}/status`,
			{ body: { status: "active" } },
		);
		expect(resumeRes.status).toBe(200);
		expect(await resumeRes.json()).toEqual({ ok: true, status: "active" });

		const snap = await t.kernel();
		expect(snap.classes.find((c) => c.id === classId)?.status).toBe("active");
	});

	test("2. Preserves 100% of lesson and class_session rows (auto, manual, legacy) across pause -> resume", async () => {
		const t = await setupStatusTestApp();
		const classId = await t.createClass(t.teacher.key, {
			schedulingMode: "manual",
		});

		await t.libsql.insert(schema.student).values({
			id: "s-preserve",
			orgId: "org-1",
			name: "HV Bảo Toàn",
			email: "baotoan@test.local",
		});
		const enrollRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/enroll`,
			{ body: { studentId: "s-preserve", activateNow: true } },
		);
		expect(enrollRes.status).toBe(201);
		const { id: enrId } = (await enrollRes.json()) as { id: string };

		const d1 = addDaysISO(vietnamTodayISO(), -2);
		const d2 = addDaysISO(vietnamTodayISO(), 5);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
					body: { date: d1, time: "18:00", dur: 90, topic: "Past", zoom: "" },
				})
			).status,
		).toBe(201);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/sessions`, {
					body: {
						date: d2,
						time: "18:00",
						dur: 90,
						topic: "Future",
						zoom: "",
					},
				})
			).status,
		).toBe(201);

		// Also insert a completed lesson + undated legacy lesson row to prove all statuses/modes survive
		await t.libsql.insert(schema.lesson).values({
			id: "les-legacy-keep",
			orgId: "org-1",
			classId,
			enrollmentId: enrId,
			day: 2,
			time: "19:00",
			dur: 90,
			date: null,
			status: "upcoming",
		});
		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${classId}/sessions/${d1}/check-in`,
					{ body: {} },
				)
			).status,
		).toBe(200);

		const snapBefore = await t.kernel();
		const lessonsBefore = snapBefore.lessons
			.filter((l) => l.classId === classId)
			.sort((a, b) => a.id.localeCompare(b.id));
		const sessionsBefore = (snapBefore.classSessions ?? [])
			.filter((s) => s.classId === classId)
			.sort((a, b) => a.id.localeCompare(b.id));

		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "paused" },
		});
		const snapPaused = await t.kernel();
		expect(
			snapPaused.lessons
				.filter((l) => l.classId === classId)
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual(lessonsBefore);
		expect(
			(snapPaused.classSessions ?? [])
				.filter((s) => s.classId === classId)
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual(sessionsBefore);

		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "active" },
		});
		const snapResumed = await t.kernel();
		expect(
			snapResumed.lessons
				.filter((l) => l.classId === classId)
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual(lessonsBefore);
		expect(
			(snapResumed.classSessions ?? [])
				.filter((s) => s.classId === classId)
				.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual(sessionsBefore);
	});

	test("3. Blocks new enrollments & student create+enroll on paused class with 409 CLASS_PAUSED and zero orphan rows (incl. D1 race)", async () => {
		const t = await setupStatusTestApp();
		const pausedId = await t.createClass();
		await t.libsql.insert(schema.student).values({
			id: "s-exist",
			orgId: "org-1",
			name: "Exist",
			email: "exist@test.local",
		});
		await t.libsql.insert(schema.studentInvitation).values({
			id: "inv-pending",
			orgId: "org-1",
			email: "newstu@test.local",
			status: "pending",
			inviterUserId: t.teacher.userId,
		});

		await t.call(t.teacher.key, `/api/classes/${pausedId}/status`, {
			body: { status: "paused" },
		});

		// POST /classes/:id/enroll (activateNow: false & true)
		for (const activateNow of [false, true]) {
			const res = await t.call(
				t.teacher.key,
				`/api/classes/${pausedId}/enroll`,
				{ body: { studentId: "s-exist", activateNow } },
			);
			expect(res.status).toBe(409);
			expect(((await res.json()) as { code: string }).code).toBe(
				CLASS_ERROR_CODES.CLASS_PAUSED,
			);
		}
		expect(
			await t.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, pausedId)),
		).toHaveLength(0);

		// POST /students with paused classId -> 409 CLASS_PAUSED, zero student & invite unchanged
		const createOnPaused = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "New Stu",
				email: "newstu@test.local",
				classId: pausedId,
				activateNow: true,
			},
		});
		expect(createOnPaused.status).toBe(409);
		expect(((await createOnPaused.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "newstu@test.local")),
		).toHaveLength(0);
		const [invStillPending] = await t.libsql
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-pending"));
		expect(invStillPending?.status).toBe("pending");

		// Simulate TOCTOU race in POST /students (activateNow: true): class paused RIGHT BEFORE Batch 1
		const raceClassId = await t.createClass();
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, raceClassId));
			return true;
		});
		const raceCreateBatch1 = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Race Stu 1",
				email: "newstu@test.local",
				classId: raceClassId,
				activateNow: true,
			},
		});
		expect(raceCreateBatch1.status).toBe(409);
		expect(((await raceCreateBatch1.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "newstu@test.local")),
		).toHaveLength(0);
		const [invAfterRace1] = await t.libsql
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-pending"));
		expect(invAfterRace1?.status).toBe("pending");

		// Simulate TOCTOU race AFTER Batch 1, right before activateEnrollment's CAS update
		await t.call(t.teacher.key, `/api/classes/${raceClassId}/status`, {
			body: { status: "active" },
		});
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "update") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, raceClassId));
			return true;
		});
		const raceCreatePostBatch = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Race Stu 2",
				email: "newstu@test.local",
				classId: raceClassId,
				activateNow: true,
			},
		});
		expect(raceCreatePostBatch.status).toBe(409);
		expect(((await raceCreatePostBatch.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "newstu@test.local")),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, raceClassId)),
		).toHaveLength(0);
		const [invAfterRace2] = await t.libsql
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-pending"));
		expect(invAfterRace2?.status).toBe("pending");
	});

	test("4. Blocks enrollment acceptance on paused class (409 CLASS_PAUSED), preserves idempotency for already active, handles materialize/CAS D1 races safely", async () => {
		const t = await setupStatusTestApp();
		const tplId = await t.seedTemplate("Syl Race", 4);
		const classId = await t.createClass(t.teacher.key, { templateId: tplId });

		await t.seedStudentUser("stu-portal", "Portal Stu", "portal@test.local");
		await t.libsql.insert(schema.student).values([
			{
				id: "s-inv",
				orgId: "org-1",
				name: "Portal Stu",
				email: "portal@test.local",
			},
			{
				id: "s-act",
				orgId: "org-1",
				name: "Already Active",
				email: "active@test.local",
			},
		]);

		const enrInvRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/enroll`,
			{ body: { studentId: "s-inv", activateNow: false } },
		);
		const enrInvId = ((await enrInvRes.json()) as { id: string }).id;

		const enrActRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/enroll`,
			{ body: { studentId: "s-act", activateNow: true } },
		);
		const enrActId = ((await enrActRes.json()) as { id: string }).id;

		// Pause class
		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "paused" },
		});

		// Teacher accept invited -> 409 CLASS_PAUSED
		const teacherAccept = await t.call(
			t.teacher.key,
			`/api/enrollments/${enrInvId}/accept`,
			{ body: {} },
		);
		expect(teacherAccept.status).toBe(409);
		expect(((await teacherAccept.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Student portal accept invited -> 409 CLASS_PAUSED
		const studentAccept = await t.call(
			"stu-portal",
			`/api/student/enrollments/${enrInvId}/accept`,
			{ body: {}, origin: STUDENT_ORIGIN },
		);
		expect(studentAccept.status).toBe(409);
		expect(((await studentAccept.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Idempotent accept on ALREADY ACTIVE enrollment of paused class -> 200
		const activeAccept = await t.call(
			t.teacher.key,
			`/api/enrollments/${enrActId}/accept`,
			{ body: {} },
		);
		expect(activeAccept.status).toBe(200);
		expect(await activeAccept.json()).toEqual({ ok: true });

		// Resume, then simulate race: class pauses between CAS UPDATE enrollment and Statement 0 inside materializeScheduleForEnrollment
		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "active" },
		});
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classId));
			return true;
		});
		const raceMaterialize = await activateEnrollment(t.db, "org-1", enrInvId);
		expect(raceMaterialize).toEqual({ ok: false, error: "class-paused" });
		// Compensating rollback returned enrollment to 'invited' cleanly
		const [enrAfterRollback] = await t.libsql
			.select()
			.from(schema.enrollment)
			.where(eq(schema.enrollment.id, enrInvId));
		expect(enrAfterRollback?.status).toBe("invited");
		expect(
			await t.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.enrollmentId, enrInvId)),
		).toHaveLength(0);

		// Deleted enrollment on paused class -> 404 (not 409 CLASS_PAUSED)
		await t.libsql
			.delete(schema.enrollment)
			.where(eq(schema.enrollment.id, enrInvId));
		const deletedAccept = await activateEnrollment(t.db, "org-1", enrInvId);
		expect(deletedAccept).toEqual({ ok: false, error: "enrollment" });

		// Direct materializeScheduleForEnrollment on paused class -> immediate error: "class-paused"
		const directMat = await materializeScheduleForEnrollment(t.db, {
			orgId: "org-1",
			enrollmentId: enrActId,
			studentId: "s-act",
			classId,
			mode: "backfill",
		});
		expect(directMat).toEqual({ ok: false, error: "class-paused" });
	});

	test("5. resend-invite returns 409 CLASS_PAUSED without burning cooldown, prefers active invite if any, avoids false ALREADY_JOINED", async () => {
		const t = await setupStatusTestApp();
		const pausedCls = await t.createClass();
		const activeCls = await t.createClass();

		await t.libsql.insert(schema.student).values([
			{
				id: "s-paused-only",
				orgId: "org-1",
				name: "Paused Only",
				email: "pausedonly@test.local",
			},
			{
				id: "s-onboarded-paused",
				orgId: "org-1",
				name: "Onboarded Paused",
				email: "onbpaused@test.local",
				onboardingCompletedAt: new Date(),
			},
		]);

		const enrPaused1 = (
			(await (
				await t.call(t.teacher.key, `/api/classes/${pausedCls}/enroll`, {
					body: { studentId: "s-paused-only", activateNow: false },
				})
			).json()) as { id: string }
		).id;
		await t.call(t.teacher.key, `/api/classes/${pausedCls}/enroll`, {
			body: { studentId: "s-onboarded-paused", activateNow: false },
		});

		await t.call(t.teacher.key, `/api/classes/${pausedCls}/status`, {
			body: { status: "paused" },
		});
		t.sentEmails.length = 0;

		// Explicit paused enrollmentId -> 409 CLASS_PAUSED & lastInviteEmailAt stays NULL (no cooldown burned)
		const explicitRes = await t.call(
			t.teacher.key,
			"/api/students/s-paused-only/resend-invite",
			{ body: { enrollmentId: enrPaused1 } },
		);
		expect(explicitRes.status).toBe(409);
		expect(((await explicitRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		const [stuRow1] = await t.libsql
			.select()
			.from(schema.student)
			.where(eq(schema.student.id, "s-paused-only"));
		expect(stuRow1?.lastInviteEmailAt).toBeNull();
		expect(t.sentEmails).toHaveLength(0);

		// Omitted enrollmentId when student has only paused invite (non-onboarded & onboarded) -> 409 CLASS_PAUSED
		const implicitUnlinked = await t.call(
			t.teacher.key,
			"/api/students/s-paused-only/resend-invite",
			{ body: {} },
		);
		expect(implicitUnlinked.status).toBe(409);
		expect(((await implicitUnlinked.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		const implicitOnboarded = await t.call(
			t.teacher.key,
			"/api/students/s-onboarded-paused/resend-invite",
			{ body: {} },
		);
		expect(implicitOnboarded.status).toBe(409);
		expect(((await implicitOnboarded.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(t.sentEmails).toHaveLength(0);

		// Now enroll s-paused-only in activeCls (invited) -> omit enrollmentId should pick active class invite (200) since cooldown wasn't burned!
		const enrActiveRes = await t.call(
			t.teacher.key,
			`/api/classes/${activeCls}/enroll`,
			{ body: { studentId: "s-paused-only", activateNow: false } },
		);
		expect(enrActiveRes.status).toBe(201);

		const activeResend = await t.call(
			t.teacher.key,
			"/api/students/s-paused-only/resend-invite",
			{ body: {} },
		);
		expect(activeResend.status).toBe(200);
		expect(t.sentEmails.length).toBeGreaterThanOrEqual(1);
	});

	test("6. Blocks sessions/check-in/attendance writes (409 CLASS_PAUSED) while preserving edit/cancel/delete/notes/fee/DELETE enrollment", async () => {
		const t = await setupStatusTestApp();
		const manualId = await t.createClass(t.teacher.key, {
			schedulingMode: "manual",
		});

		await t.libsql.insert(schema.student).values([
			{
				id: "s-act-1",
				orgId: "org-1",
				name: "Active Stu",
				email: "act1@test.local",
			},
			{
				id: "s-inv-1",
				orgId: "org-1",
				name: "Invited Stu",
				email: "inv1@test.local",
			},
		]);
		const activeEnrRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/enroll`,
			{ body: { studentId: "s-act-1", activateNow: true } },
		);
		expect(activeEnrRes.status).toBe(201);
		const invEnrId = (
			(await (
				await t.call(t.teacher.key, `/api/classes/${manualId}/enroll`, {
					body: { studentId: "s-inv-1", activateNow: false },
				})
			).json()) as { id: string }
		).id;

		const today = vietnamTodayISO();
		const past1 = addDaysISO(today, -3);
		const past2 = addDaysISO(today, -2);
		const future1 = addDaysISO(today, 4);
		const future2 = addDaysISO(today, 5);
		const movedDate = addDaysISO(today, 6);

		for (const date of [past1, past2, future1, future2]) {
			expect(
				(
					await t.call(t.teacher.key, `/api/classes/${manualId}/sessions`, {
						body: { date, time: "18:00", dur: 90, topic: "T", zoom: "" },
					})
				).status,
			).toBe(201);
		}

		// Pause the class
		await t.call(t.teacher.key, `/api/classes/${manualId}/status`, {
			body: { status: "paused" },
		});

		// Blocked: add manual session -> 409 CLASS_PAUSED
		const newSessionDate = addDaysISO(today, 10);
		const addSessionRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions`,
			{
				body: {
					date: newSessionDate,
					time: "18:00",
					dur: 90,
					topic: "Blocked",
					zoom: "",
				},
			},
		);
		expect(addSessionRes.status).toBe(409);
		expect(((await addSessionRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Blocked: check-in occurrence -> 409 CLASS_PAUSED
		const occCheckInRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${past1}/check-in`,
			{ body: {} },
		);
		expect(occCheckInRes.status).toBe(409);
		expect(((await occCheckInRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Blocked: check-in individual lesson -> 409 CLASS_PAUSED
		const [past1Lesson] = await t.libsql
			.select({ id: schema.lesson.id })
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, manualId), eq(schema.lesson.date, past1)),
			);
		const lessonCheckInRes = await t.call(
			t.teacher.key,
			`/api/lessons/${past1Lesson?.id}/check-in`,
			{ body: {} },
		);
		expect(lessonCheckInRes.status).toBe(409);
		expect(((await lessonCheckInRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Blocked: PUT attendance -> 409 CLASS_PAUSED (even if roster mismatched, must report CLASS_PAUSED cleanly)
		const putAttendanceRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${past1}/attendance`,
			{
				method: "PUT",
				body: {
					entries: [
						{
							lessonId: past1Lesson?.id ?? "",
							attendance: "present",
							note: "test",
						},
					],
				},
			},
		);
		expect(putAttendanceRes.status).toBe(409);
		expect(((await putAttendanceRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Allowed while paused: notes, tuition-fee, DELETE invited enrollment, cancel occurrence, edit occurrence, DELETE occurrence
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${manualId}/notes`, {
					body: { notes: "Ghi chú khi tạm dừng" },
				})
			).status,
		).toBe(200);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${manualId}/tuition-fee`, {
					body: { tuitionFee: 250000 },
				})
			).status,
		).toBe(200);
		expect(
			(
				await t.call(t.teacher.key, `/api/enrollments/${invEnrId}`, {
					method: "DELETE",
				})
			).status,
		).toBe(200);

		const cancelOccRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${future1}/cancel`,
			{ body: {} },
		);
		expect(cancelOccRes.status).toBe(200);
		// Cancelling on a paused class must NOT enqueue schedule_changed notifications
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "schedule_changed")),
		).toHaveLength(0);

		const editOccRes = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${future2}/edit`,
			{
				body: { moveDate: movedDate, time: "20:00", dur: 90, topic: "Moved" },
			},
		);
		expect(editOccRes.status).toBe(200);
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "schedule_changed")),
		).toHaveLength(0);

		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${manualId}/sessions/${past2}`,
					{ method: "DELETE" },
				)
			).status,
		).toBe(200);

		// D1 race checks on active class: pause right before batch in POST /sessions, occurrenceUpdate in check-in, and PUT attendance
		await t.call(t.teacher.key, `/api/classes/${manualId}/status`, {
			body: { status: "active" },
		});

		const raceDate = addDaysISO(today, 12);
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, manualId));
			return true;
		});
		const raceAddSession = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions`,
			{
				body: {
					date: raceDate,
					time: "18:00",
					dur: 90,
					topic: "Race",
					zoom: "",
				},
			},
		);
		expect(raceAddSession.status).toBe(409);
		expect(((await raceAddSession.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// D1 race: pause right before check-in update -> 409 CLASS_PAUSED
		await t.call(t.teacher.key, `/api/classes/${manualId}/status`, {
			body: { status: "active" },
		});
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "update") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, manualId));
			return true;
		});
		const raceCheckIn = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${past1}/check-in`,
			{ body: {} },
		);
		expect(raceCheckIn.status).toBe(409);
		expect(((await raceCheckIn.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// D1 race: pause right before PUT attendance batch -> 409 CLASS_PAUSED
		await t.call(t.teacher.key, `/api/classes/${manualId}/status`, {
			body: { status: "active" },
		});
		t.setDbWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, manualId));
			return true;
		});
		const racePutAttendance = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${past1}/attendance`,
			{
				method: "PUT",
				body: {
					entries: [
						{
							lessonId: past1Lesson?.id ?? "",
							attendance: "present",
							note: "race",
						},
					],
				},
			},
		);
		expect(racePutAttendance.status).toBe(409);
		expect(((await racePutAttendance.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// Already settled occurrence check-in on ACTIVE class stays idempotent 200 { updated: 0 }
		await t.call(t.teacher.key, `/api/classes/${manualId}/status`, {
			body: { status: "active" },
		});
		expect(
			(
				await t.call(
					t.teacher.key,
					`/api/classes/${manualId}/sessions/${past1}/check-in`,
					{ body: {} },
				)
			).status,
		).toBe(200);
		const idempCheckIn = await t.call(
			t.teacher.key,
			`/api/classes/${manualId}/sessions/${past1}/check-in`,
			{ body: {} },
		);
		expect(idempCheckIn.status).toBe(200);
		expect(await idempCheckIn.json()).toEqual({ updated: 0, skipped: 1 });
	});

	test("7. Curriculum backfill skips paused class on import/sync, runs automatically when resumed", async () => {
		const t = await setupStatusTestApp();
		const tplId = await t.seedTemplate("Syl Backfill", 3);
		// Create manual class without template + enroll 1 active student (0 lessons stuck when syllabus imported)
		const classId = await t.createClass(t.teacher.key, {
			schedulingMode: "manual",
		});
		await t.libsql.insert(schema.student).values({
			id: "s-stuck",
			orgId: "org-1",
			name: "Stuck Stu",
			email: "stuck@test.local",
		});
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classId}/enroll`, {
					body: { studentId: "s-stuck", activateNow: true },
				})
			).status,
		).toBe(201);

		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "paused" },
		});

		const importRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: tplId } },
		);
		expect(importRes.status).toBe(201);
		// While paused, no lessons generated yet!
		expect(
			await t.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.classId, classId)),
		).toHaveLength(0);

		// Resuming transitions paused -> active and triggers backfillStuckEnrollments!
		const resumeRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/status`,
			{ body: { status: "active" } },
		);
		expect(resumeRes.status).toBe(200);
		expect(
			await t.libsql
				.select()
				.from(schema.lesson)
				.where(eq(schema.lesson.classId, classId)),
		).toHaveLength(3);
	});

	test("8. Holidays: scope 'classes' returns 409 CLASS_PAUSED for paused target; scope 'org' skips paused classes; DELETE undo works even if paused", async () => {
		const t = await setupStatusTestApp();
		const tplId = await t.seedTemplate("Syl Holiday", 4);
		const friday1 = nextDowISO(vietnamTodayISO(), 5);
		const friday2 = addDaysISO(friday1, 7);
		const schedule = { days: [4], start: "18:00", end: "19:30" };

		const activeCls = await t.createClass(t.teacher.key, {
			name: "Lớp Active",
			templateId: tplId,
			schedule,
			startDate: friday1,
		});
		const pausedCls = await t.createClass(t.teacher.key, {
			name: "Lớp Paused",
			templateId: tplId,
			schedule,
			startDate: friday1,
		});
		await t.libsql.insert(schema.student).values([
			{ id: "s-h1", orgId: "org-1", name: "H1", email: "h1@test.local" },
			{ id: "s-h2", orgId: "org-1", name: "H2", email: "h2@test.local" },
		]);
		await t.call(t.teacher.key, `/api/classes/${activeCls}/enroll`, {
			body: { studentId: "s-h1", activateNow: true },
		});
		await t.call(t.teacher.key, `/api/classes/${pausedCls}/enroll`, {
			body: { studentId: "s-h2", activateNow: true },
		});

		await t.call(t.teacher.key, `/api/classes/${pausedCls}/status`, {
			body: { status: "paused" },
		});
		t.sentEmails.length = 0;

		// scope: 'classes' targeting paused class -> 409 CLASS_PAUSED on preview & apply
		const clsPreviewRes = await t.call(t.teacher.key, "/api/holidays/preview", {
			body: {
				name: "Nghỉ riêng",
				fromDate: friday2,
				toDate: friday2,
				scope: "classes",
				classIds: [pausedCls],
				mode: "shift",
			},
		});
		expect(clsPreviewRes.status).toBe(409);
		expect(((await clsPreviewRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		const clsApplyRes = await t.call(t.teacher.key, "/api/holidays", {
			body: {
				name: "Nghỉ riêng",
				fromDate: friday2,
				toDate: friday2,
				scope: "classes",
				classIds: [pausedCls],
				mode: "shift",
				notify: false,
				planHash: "0".repeat(64),
			},
		});
		expect(clsApplyRes.status).toBe(409);
		expect(((await clsApplyRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);

		// scope: 'org' skips pausedCls and shifts only activeCls
		const orgPreviewRes = await t.call(t.teacher.key, "/api/holidays/preview", {
			body: {
				name: "Nghỉ chung",
				fromDate: friday2,
				toDate: friday2,
				scope: "org",
				classIds: [],
				mode: "shift",
			},
		});
		expect(orgPreviewRes.status).toBe(200);
		const previewJson = (await orgPreviewRes.json()) as {
			affectedClassCount: number;
			planHash: string;
		};
		expect(previewJson.affectedClassCount).toBe(1);

		const orgApplyRes = await t.call(t.teacher.key, "/api/holidays", {
			body: {
				name: "Nghỉ chung",
				fromDate: friday2,
				toDate: friday2,
				scope: "org",
				classIds: [],
				mode: "shift",
				notify: false,
				planHash: previewJson.planHash,
			},
		});
		expect(orgApplyRes.status).toBe(200);
		const { holidayId } = (await orgApplyRes.json()) as { holidayId: string };
		void HOLIDAY_ERROR_CODES;

		// Pause activeCls AFTER holiday applied, then DELETE /holidays/:id must STILL succeed (undo restores pre-holiday state)
		await t.call(t.teacher.key, `/api/classes/${activeCls}/status`, {
			body: { status: "paused" },
		});
		const undoRes = await t.call(t.teacher.key, `/api/holidays/${holidayId}`, {
			method: "DELETE",
		});
		expect(undoRes.status).toBe(200);
	});

	test("9. Read filters: daily-attendance mixed bucket + legacy drop + pending count, dashboard-reminders, and Student Portal APIs", async () => {
		const t = await setupStatusTestApp();
		const today = vietnamTodayISO();

		await t.seedStudentUser("stu-p", "Minh Student", "minhp@test.local");
		await t.libsql.insert(schema.student).values([
			{
				id: "s-1",
				orgId: "org-1",
				name: "Minh Student",
				email: "minhp@test.local",
			},
			{ id: "s-2", orgId: "org-1", name: "Lan Two", email: "lan2@test.local" },
		]);

		// Seed 3 classes:
		// cls-paused-mixed: paused dated bucket today with [completed, upcoming] (keeps full roster + classPaused: true)
		// cls-paused-unmarked: paused dated bucket today with [upcoming] only (hidden)
		// cls-paused-legacy: paused undated legacy today (dropped)
		// cls-active: active dated bucket today with [upcoming] (keeps classPaused omitted, counted in pending & reminders)
		const futureDate = addDaysISO(today, 3);
		await t.libsql.insert(schema.classTable).values([
			{
				id: "cls-paused-mixed",
				orgId: "org-1",
				name: "Paused Mixed",
				schedule: "T2 18:00",
				sessionsTotal: 2,
				status: "paused",
			},
			{
				id: "cls-paused-unmarked",
				orgId: "org-1",
				name: "Paused Unmarked",
				schedule: "T2 19:00",
				sessionsTotal: 1,
				status: "paused",
			},
			{
				id: "cls-paused-legacy",
				orgId: "org-1",
				name: "Paused Legacy",
				schedule: "T2 20:00",
				sessionsTotal: 1,
				status: "paused",
			},
			{
				id: "cls-active",
				orgId: "org-1",
				name: "Active Today",
				schedule: "T2 17:00",
				sessionsTotal: 2,
				status: "active",
			},
		]);

		await t.libsql.insert(schema.enrollment).values([
			{
				id: "e-pm-1",
				orgId: "org-1",
				classId: "cls-paused-mixed",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-pm-2",
				orgId: "org-1",
				classId: "cls-paused-mixed",
				studentId: "s-2",
				status: "active",
			},
			{
				id: "e-pu-1",
				orgId: "org-1",
				classId: "cls-paused-unmarked",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-pl-1",
				orgId: "org-1",
				classId: "cls-paused-legacy",
				studentId: "s-1",
				status: "active",
			},
			{
				id: "e-ac-1",
				orgId: "org-1",
				classId: "cls-active",
				studentId: "s-1",
				status: "active",
			},
		]);

		const todayDow = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
		await t.libsql.insert(schema.lesson).values([
			{
				id: "l-pm-done",
				orgId: "org-1",
				classId: "cls-paused-mixed",
				enrollmentId: "e-pm-1",
				day: todayDow,
				time: "18:00",
				dur: 90,
				date: today,
				status: "completed",
				attendance: "present",
			},
			{
				id: "l-pm-late",
				orgId: "org-1",
				classId: "cls-paused-mixed",
				enrollmentId: "e-pm-2",
				day: todayDow,
				time: "18:00",
				dur: 90,
				date: today,
				status: "upcoming",
			},
			{
				id: "l-pm-future",
				orgId: "org-1",
				classId: "cls-paused-mixed",
				enrollmentId: "e-pm-1",
				day: todayDow,
				time: "18:00",
				dur: 90,
				date: futureDate,
				status: "upcoming",
			},
			{
				id: "l-pu-unmarked",
				orgId: "org-1",
				classId: "cls-paused-unmarked",
				enrollmentId: "e-pu-1",
				day: todayDow,
				time: "19:00",
				dur: 90,
				date: today,
				status: "upcoming",
			},
			{
				id: "l-pl-legacy",
				orgId: "org-1",
				classId: "cls-paused-legacy",
				enrollmentId: "e-pl-1",
				day: todayDow,
				time: "20:00",
				dur: 90,
				date: null,
				status: "upcoming",
			},
			{
				id: "l-ac-up",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "e-ac-1",
				day: todayDow,
				time: "17:00",
				dur: 90,
				date: futureDate,
				status: "upcoming",
			},
			{
				id: "l-ac-today",
				orgId: "org-1",
				classId: "cls-active",
				enrollmentId: "e-ac-1",
				day: todayDow,
				time: "17:00",
				dur: 90,
				date: today,
				status: "upcoming",
			},
		]);

		// Daily attendance filter
		const dailyRes = await t.call(
			t.teacher.key,
			`/api/attendance/daily?date=${today}`,
			{ method: "GET" },
		);
		expect(dailyRes.status).toBe(200);
		const daily = (await dailyRes.json()) as DailyAttendanceResponse;
		expect(daily.sessions.map((s) => s.classId)).toEqual([
			"cls-active",
			"cls-paused-mixed",
		]);
		const activeSess = daily.sessions.find((s) => s.classId === "cls-active");
		expect("classPaused" in (activeSess ?? {})).toBe(false);
		const pausedSess = daily.sessions.find(
			(s) => s.classId === "cls-paused-mixed",
		);
		expect(pausedSess?.classPaused).toBe(true);
		expect(pausedSess?.students).toHaveLength(2);
		expect(daily.counts).toEqual({
			all: 2,
			pending: 1,
			completed: 0,
		});

		// Dashboard reminders filter
		const remRes = await t.call(t.teacher.key, "/api/dashboard/reminders", {
			method: "GET",
		});
		expect(remRes.status).toBe(200);
		const rem = (await remRes.json()) as {
			attendance: { items: Array<{ classId: string }> };
		};
		expect(rem.attendance.items.map((i) => i.classId)).toEqual(["cls-active"]);

		// Student portal overview, class detail, schedule
		const ovRes = await t.call("stu-p", "/api/student/overview", {
			method: "GET",
			origin: STUDENT_ORIGIN,
		});
		expect(ovRes.status).toBe(200);
		const ov = (await ovRes.json()) as StudentOverview;
		expect(ov.classes.find((c) => c.id === "cls-paused-mixed")?.status).toBe(
			"paused",
		);
		expect(
			ov.classes.find((c) => c.id === "cls-paused-mixed")?.nextSession,
		).toBeNull();
		expect(
			ov.classes.find((c) => c.id === "cls-active")?.nextSession,
		).not.toBeNull();

		const detailRes = await t.call(
			"stu-p",
			"/api/student/classes/cls-paused-mixed",
			{ method: "GET", origin: STUDENT_ORIGIN },
		);
		expect(detailRes.status).toBe(200);
		const detail = (await detailRes.json()) as StudentClassDetail;
		expect(detail.class.nextSession).toBeNull();
		expect(detail.lessons.length).toBeGreaterThanOrEqual(2);

		const schRes = await t.call("stu-p", "/api/student/schedule", {
			method: "GET",
			origin: STUDENT_ORIGIN,
		});
		expect(schRes.status).toBe(200);
		const sch = (await schRes.json()) as StudentScheduleResponse;
		expect(
			sch.classes.find((c) => c.id === "cls-paused-mixed")?.nextSession,
		).toBeNull();
		const pausedSchLessons = sch.lessons.filter(
			(l) => l.classId === "cls-paused-mixed",
		);
		expect(pausedSchLessons.map((l) => l.id)).toEqual(["l-pm-done"]);
		expect(sch.lessons.some((l) => l.classId === "cls-paused-legacy")).toBe(
			false,
		);
		expect(sch.lessons.some((l) => l.classId === "cls-paused-unmarked")).toBe(
			false,
		);
	});

	test("10. C1/M3: resend-invite concurrent pause rolls back lastInviteEmailAt, avoids 429 false positive, and sends zero email/notification", async () => {
		const t = await setupStatusTestApp();
		const classId = await t.createClass();

		// Case A: post-claim pause -> roll back lastInviteEmailAt to previous value & 409 CLASS_PAUSED
		const createA = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Học viên C1A",
				phone: "0900000101",
				email: "c1a@test.local",
				classId,
				activateNow: false,
			},
		});
		expect(createA.status).toBe(201);
		const stuA = (await createA.json()) as { id: string; enrollmentId: string };
		const prevTs = new Date(Date.now() - 120_000);
		await t.libsql
			.update(schema.student)
			.set({ lastInviteEmailAt: prevTs })
			.where(eq(schema.student.id, stuA.id));
		const sentBeforeA = t.sentEmails.length;
		const notifsBeforeA = (
			await t.libsql.select().from(schema.notificationRecord)
		).length;

		t.setDbWriteInterceptor(async (op) => {
			if (op === "update") {
				await t.libsql
					.update(schema.classTable)
					.set({ status: "paused" })
					.where(eq(schema.classTable.id, classId));
				return true;
			}
			return false;
		});

		const resendA = await t.call(
			t.teacher.key,
			`/api/students/${stuA.id}/resend-invite`,
			{ body: { enrollmentId: stuA.enrollmentId } },
		);
		t.setDbWriteInterceptor(null);
		expect(resendA.status).toBe(409);
		const resendABody = (await resendA.json()) as { code?: string };
		expect(resendABody.code).toBe(CLASS_ERROR_CODES.CLASS_PAUSED);
		expect(t.sentEmails.length).toBe(sentBeforeA);
		expect(
			(await t.libsql.select().from(schema.notificationRecord)).length,
		).toBe(notifsBeforeA);
		const [rowA] = await t.libsql
			.select({ lastInviteEmailAt: schema.student.lastInviteEmailAt })
			.from(schema.student)
			.where(eq(schema.student.id, stuA.id));
		expect(rowA?.lastInviteEmailAt?.getTime()).toBe(prevTs.getTime());

		// Case B: claimed.length === 0 because concurrent update + pause happened before claim -> returns 409 CLASS_PAUSED instead of 429
		const classB = await t.createClass(t.teacher.key, { name: "Lớp C1B" });
		const createB = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Học viên C1B",
				phone: "0900000102",
				email: "c1b@test.local",
				classId: classB,
				activateNow: false,
			},
		});
		expect(createB.status).toBe(201);
		const stuB = (await createB.json()) as { id: string; enrollmentId: string };
		await t.libsql
			.update(schema.student)
			.set({ lastInviteEmailAt: null })
			.where(eq(schema.student.id, stuB.id));
		const sentBeforeB = t.sentEmails.length;

		t.setDbWriteInterceptor(async (op) => {
			if (op === "update") {
				// Concurrent request wins the claim timestamp AND class gets paused
				await t.libsql
					.update(schema.student)
					.set({ lastInviteEmailAt: new Date() })
					.where(eq(schema.student.id, stuB.id));
				await t.libsql
					.update(schema.classTable)
					.set({ status: "paused" })
					.where(eq(schema.classTable.id, classB));
				return true;
			}
			return false;
		});

		const resendB = await t.call(
			t.teacher.key,
			`/api/students/${stuB.id}/resend-invite`,
			{ body: { enrollmentId: stuB.enrollmentId } },
		);
		t.setDbWriteInterceptor(null);
		expect(resendB.status).toBe(409);
		expect(((await resendB.json()) as { code?: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(t.sentEmails.length).toBe(sentBeforeB);

		// Case C (M3): POST /students with concurrent batch -> paused check before batch returns 409 CLASS_PAUSED
		const classC = await t.createClass(t.teacher.key, { name: "Lớp M3" });
		t.setDbWriteInterceptor(async (op) => {
			if (op === "batch") {
				await t.libsql
					.update(schema.classTable)
					.set({ status: "paused" })
					.where(eq(schema.classTable.id, classC));
				return true;
			}
			return false;
		});
		const sentBeforeC = t.sentEmails.length;
		const createC = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Học viên M3",
				phone: "0900000103",
				email: "m3@test.local",
				classId: classC,
				activateNow: false,
			},
		});
		t.setDbWriteInterceptor(null);
		expect(createC.status).toBe(409);
		expect(((await createC.json()) as { code?: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(t.sentEmails.length).toBe(sentBeforeC);
	});

	test("11. I1: POST /lessons/:id/edit updates DB on paused class without enqueuing schedule_changed notifications", async () => {
		const t = await setupStatusTestApp();
		const activeClassId = await t.createClass(t.teacher.key, {
			name: "Active Edit Class",
		});
		const pausedClassId = await t.createClass(t.teacher.key, {
			name: "Paused Edit Class",
		});

		const todayISO = vietnamTodayISO();
		const futureISO = nextDowISO(todayISO, 1);
		const dow = new Date(`${futureISO}T00:00:00Z`).getUTCDay();

		await t.libsql.insert(schema.student).values({
			id: "stu-i1",
			orgId: "org-1",
			name: "HV Edit",
			phone: "0900000201",
			email: "i1@test.local",
			zalo: "0900000201",
		});
		await t.libsql.insert(schema.enrollment).values([
			{
				id: "enr-i1-active",
				orgId: "org-1",
				classId: activeClassId,
				studentId: "stu-i1",
				status: "active",
			},
			{
				id: "enr-i1-paused",
				orgId: "org-1",
				classId: pausedClassId,
				studentId: "stu-i1",
				status: "active",
			},
		]);
		await t.libsql.insert(schema.lesson).values([
			{
				id: "les-i1-active",
				orgId: "org-1",
				classId: activeClassId,
				enrollmentId: "enr-i1-active",
				day: dow,
				time: "18:00",
				dur: 90,
				topic: "Unit 1",
				zoom: "",
				status: "upcoming",
				date: futureISO,
			},
			{
				id: "les-i1-paused-dated",
				orgId: "org-1",
				classId: pausedClassId,
				enrollmentId: "enr-i1-paused",
				day: dow,
				time: "18:00",
				dur: 90,
				topic: "Unit P1",
				zoom: "",
				status: "upcoming",
				date: futureISO,
			},
			{
				id: "les-i1-paused-undated",
				orgId: "org-1",
				classId: pausedClassId,
				enrollmentId: "enr-i1-paused",
				day: dow,
				time: "18:00",
				dur: 90,
				topic: "Unit P2",
				zoom: "",
				status: "upcoming",
				date: null,
			},
		]);
		await t.libsql
			.update(schema.classTable)
			.set({ status: "paused" })
			.where(eq(schema.classTable.id, pausedClassId));

		// Control: active class time edit DOES enqueue schedule_changed
		const resActive = await t.call(
			t.teacher.key,
			"/api/lessons/les-i1-active/edit",
			{
				body: { day: dow, time: "19:00", dur: 90, topic: "Unit 1", zoom: "" },
			},
		);
		expect(resActive.status).toBe(200);
		const afterActive = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.eventType, "schedule_changed"));
		expect(afterActive).toHaveLength(1);

		// Paused dated lesson time edit -> 200 & DB updated, NO extra schedule_changed
		const resPausedDated = await t.call(
			t.teacher.key,
			"/api/lessons/les-i1-paused-dated/edit",
			{
				body: { day: dow, time: "20:00", dur: 90, topic: "Unit P1", zoom: "" },
			},
		);
		expect(resPausedDated.status).toBe(200);
		const [datedRow] = await t.libsql
			.select({ time: schema.lesson.time })
			.from(schema.lesson)
			.where(eq(schema.lesson.id, "les-i1-paused-dated"));
		expect(datedRow?.time).toBe("20:00");

		// Paused undated lesson time edit -> 200 & DB updated, NO extra schedule_changed
		const resPausedUndated = await t.call(
			t.teacher.key,
			"/api/lessons/les-i1-paused-undated/edit",
			{
				body: { day: dow, time: "20:30", dur: 90, topic: "Unit P2", zoom: "" },
			},
		);
		expect(resPausedUndated.status).toBe(200);
		const [undatedRow] = await t.libsql
			.select({ time: schema.lesson.time })
			.from(schema.lesson)
			.where(eq(schema.lesson.id, "les-i1-paused-undated"));
		expect(undatedRow?.time).toBe("20:30");

		const allSchedChanged = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.eventType, "schedule_changed"));
		expect(allSchedChanged).toHaveLength(1);
	});

	test("12. I2: import-syllabus and sync-curriculum skip backfillStuckEnrollments if class pauses before batch finishes", async () => {
		const t = await setupStatusTestApp();
		const tplId = await t.seedTemplate("Syl I2", 2);
		const classId = await t.createClass(t.teacher.key, {
			name: "Class I2",
			schedulingMode: "manual",
			sessionsTotal: 2,
		});

		await t.libsql.insert(schema.student).values({
			id: "stu-i2",
			orgId: "org-1",
			name: "HV Stuck",
			phone: "0900000301",
			email: "i2@test.local",
			zalo: "0900000301",
		});
		await t.libsql.insert(schema.enrollment).values({
			id: "enr-i2",
			orgId: "org-1",
			classId,
			studentId: "stu-i2",
			status: "active",
		});

		// Concurrent pause right when curriculum/import writes its batch
		t.setDbWriteInterceptor(async (op) => {
			if (op === "batch") {
				await t.libsql
					.update(schema.classTable)
					.set({ status: "paused" })
					.where(eq(schema.classTable.id, classId));
				return true;
			}
			return false;
		});

		const importRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/import`,
			{ body: { templateId: tplId } },
		);
		t.setDbWriteInterceptor(null);
		expect(importRes.status).toBe(201);

		const lessonsAfterImport = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-i2"));
		expect(lessonsAfterImport).toHaveLength(0);

		// Same guard for curriculum/sync: resume briefly so initial handler sees active, then pause on batch
		await t.libsql
			.update(schema.classTable)
			.set({ status: "active" })
			.where(eq(schema.classTable.id, classId));

		t.setDbWriteInterceptor(async (op) => {
			if (op === "batch") {
				await t.libsql
					.update(schema.classTable)
					.set({ status: "paused" })
					.where(eq(schema.classTable.id, classId));
				return true;
			}
			return false;
		});

		const syncRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: { templateId: tplId } },
		);
		t.setDbWriteInterceptor(null);
		expect(syncRes.status).toBe(200);

		const lessonsAfterSync = await t.libsql
			.select()
			.from(schema.lesson)
			.where(eq(schema.lesson.enrollmentId, "enr-i2"));
		expect(lessonsAfterSync).toHaveLength(0);
	});

	test("13. Post-batch pause on POST /students (activateNow: false) rolls back student/enrollment and preserves pending invitation", async () => {
		const t = await setupStatusTestApp();
		const classId = await t.createClass();

		await t.libsql.insert(schema.studentInvitation).values({
			id: "inv-race-a",
			orgId: "org-1",
			inviterUserId: t.teacher.userId,
			email: "invite-race@test.local",
			status: "pending",
		});

		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classId));
			return true;
		});

		const withInviteRes = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Race Email",
				phone: "0900000091",
				email: "invite-race@test.local",
				parentName: "",
				parentPhone: "",
				classId,
				activateNow: false,
			},
		});
		t.setDbPostWriteInterceptor(null);
		expect(withInviteRes.status).toBe(409);
		expect(((await withInviteRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.email, "invite-race@test.local")),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, classId)),
		).toHaveLength(0);
		const [invAfter] = await t.libsql
			.select()
			.from(schema.studentInvitation)
			.where(eq(schema.studentInvitation.id, "inv-race-a"));
		expect(invAfter?.status).toBe("pending");
		expect(t.sentEmails).toHaveLength(0);
		expect(
			await t.libsql.select().from(schema.notificationRecord),
		).toHaveLength(0);

		// Repeat with empty email ""
		await t.call(t.teacher.key, `/api/classes/${classId}/status`, {
			body: { status: "active" },
		});
		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classId));
			return true;
		});

		const noEmailRes = await t.call(t.teacher.key, "/api/students", {
			body: {
				name: "Race NoEmail",
				phone: "0900000092",
				email: "",
				parentName: "",
				parentPhone: "",
				classId,
				activateNow: false,
			},
		});
		t.setDbPostWriteInterceptor(null);
		expect(noEmailRes.status).toBe(409);
		expect(((await noEmailRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.student)
				.where(eq(schema.student.name, "Race NoEmail")),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, classId)),
		).toHaveLength(0);
		expect(
			await t.libsql.select().from(schema.notificationRecord),
		).toHaveLength(0);
	});

	test("14. Post-insert pause on POST /classes/:id/enroll (activateNow: false) removes invited enrollment and skips notification", async () => {
		const t = await setupStatusTestApp();
		const classId = await t.createClass();
		await t.libsql.insert(schema.student).values({
			id: "stu-standalone-race",
			orgId: "org-1",
			name: "Standalone Race",
			email: "standalone-race@test.local",
		});

		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "insert") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classId));
			return true;
		});

		const enrollRes = await t.call(
			t.teacher.key,
			`/api/classes/${classId}/enroll`,
			{ body: { studentId: "stu-standalone-race", activateNow: false } },
		);
		t.setDbPostWriteInterceptor(null);
		expect(enrollRes.status).toBe(409);
		expect(((await enrollRes.json()) as { code: string }).code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(
			await t.libsql
				.select()
				.from(schema.enrollment)
				.where(eq(schema.enrollment.classId, classId)),
		).toHaveLength(0);
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "class_enrolled")),
		).toHaveLength(0);
	});

	test("15. Post-write concurrent pause suppresses schedule_changed and holiday_created notifications", async () => {
		const t = await setupStatusTestApp();
		const tplId = await t.seedTemplate("Syl Notif Race", 4);
		const friday1 = nextDowISO(vietnamTodayISO(), 5);
		const friday2 = addDaysISO(friday1, 7);
		const friday3 = addDaysISO(friday1, 14);
		const friday4 = addDaysISO(friday1, 21);
		const schedule = { days: [4], start: "18:00", end: "19:30" };

		const classA = await t.createClass(t.teacher.key, {
			name: "Class A Notif",
			templateId: tplId,
			schedule,
			startDate: friday1,
			sessionsTotal: 4,
		});
		const classB = await t.createClass(t.teacher.key, {
			name: "Class B Notif",
			templateId: tplId,
			schedule,
			startDate: friday1,
			sessionsTotal: 4,
		});
		await t.libsql.insert(schema.student).values([
			{ id: "s-c1", orgId: "org-1", name: "C1", email: "c1@test.local" },
			{ id: "s-c2", orgId: "org-1", name: "C2", email: "c2@test.local" },
		]);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classA}/enroll`, {
					body: { studentId: "s-c1", activateNow: true },
				})
			).status,
		).toBe(201);
		expect(
			(
				await t.call(t.teacher.key, `/api/classes/${classB}/enroll`, {
					body: { studentId: "s-c2", activateNow: true },
				})
			).status,
		).toBe(201);
		await t.libsql.delete(schema.notificationRecord);

		const [lesson1] = await t.libsql
			.select()
			.from(schema.lesson)
			.where(
				and(eq(schema.lesson.classId, classA), eq(schema.lesson.date, friday1)),
			);
		expect(lesson1).toBeTruthy();
		if (!lesson1) {
			throw new Error("Expected scheduled lesson for classA on friday1");
		}

		// 1. POST /lessons/:id/cancel post-update pause -> no schedule_changed
		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "update") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classA));
			return true;
		});
		const lessonCancelRes = await t.call(
			t.teacher.key,
			`/api/lessons/${lesson1.id}/cancel`,
			{ body: {} },
		);
		t.setDbPostWriteInterceptor(null);
		expect(lessonCancelRes.status).toBe(200);
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "schedule_changed")),
		).toHaveLength(0);

		// 2. POST /classes/:id/sessions/:date/cancel post-update pause -> no schedule_changed
		await t.call(t.teacher.key, `/api/classes/${classA}/status`, {
			body: { status: "active" },
		});
		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "update" && op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classA));
			return true;
		});
		const occCancelRes = await t.call(
			t.teacher.key,
			`/api/classes/${classA}/sessions/${friday2}/cancel`,
			{ body: {} },
		);
		t.setDbPostWriteInterceptor(null);
		expect(occCancelRes.status).toBe(200);
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "schedule_changed")),
		).toHaveLength(0);

		// 3. POST /classes/:id/sessions/:date/edit post-write pause -> no schedule_changed
		await t.call(t.teacher.key, `/api/classes/${classA}/status`, {
			body: { status: "active" },
		});
		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "update" && op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classA));
			return true;
		});
		const occEditRes = await t.call(
			t.teacher.key,
			`/api/classes/${classA}/sessions/${friday3}/edit`,
			{
				body: {
					moveDate: addDaysISO(friday3, 1),
					time: "20:00",
					dur: 90,
					topic: "Race Edit",
				},
			},
		);
		t.setDbPostWriteInterceptor(null);
		expect(occEditRes.status).toBe(200);
		expect(
			await t.libsql
				.select()
				.from(schema.notificationRecord)
				.where(eq(schema.notificationRecord.eventType, "schedule_changed")),
		).toHaveLength(0);

		// 4. POST /holidays scope 'org' notify=true: post-batch pause on classB -> only classA's s-c1 notified
		await t.call(t.teacher.key, `/api/classes/${classA}/status`, {
			body: { status: "active" },
		});
		const previewRes = await t.call(t.teacher.key, "/api/holidays/preview", {
			body: {
				name: "Nghỉ race",
				fromDate: friday4,
				toDate: friday4,
				scope: "org",
				classIds: [],
				mode: "shift",
			},
		});
		expect(previewRes.status).toBe(200);
		const previewJson = (await previewRes.json()) as {
			affectedClassCount: number;
			planHash: string;
		};
		expect(previewJson.affectedClassCount).toBe(2);

		t.setDbPostWriteInterceptor(async (op) => {
			if (op !== "batch") return false;
			await t.libsql
				.update(schema.classTable)
				.set({ status: "paused" })
				.where(eq(schema.classTable.id, classB));
			return true;
		});
		const holidayRes = await t.call(t.teacher.key, "/api/holidays", {
			body: {
				name: "Nghỉ race",
				fromDate: friday4,
				toDate: friday4,
				scope: "org",
				classIds: [],
				mode: "shift",
				notify: true,
				planHash: previewJson.planHash,
			},
		});
		t.setDbPostWriteInterceptor(null);
		expect(holidayRes.status).toBe(200);

		const holidayNotifs = await t.libsql
			.select()
			.from(schema.notificationRecord)
			.where(eq(schema.notificationRecord.eventType, "holiday_created"));
		expect(holidayNotifs.map((r) => r.studentId)).toEqual(["s-c1"]);
	});
});
