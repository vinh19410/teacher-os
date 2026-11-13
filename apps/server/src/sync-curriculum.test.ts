import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test } from "vitest";
import { buildApp, type Db } from "./app";
import { flattenSyllabusLessons } from "./lib/syllabus-curriculum";

type SnapshotLessonWithBank =
	KernelSnapshot["syllabi"][number]["modules"][number]["lessons"][number] & {
		bankMaterials?: SyllabusBankMaterialRef[];
	};

const bankOf = (
	lesson: KernelSnapshot["syllabi"][number]["modules"][number]["lessons"][number],
): SyllabusBankMaterialRef[] =>
	(lesson as SnapshotLessonWithBank).bankMaterials ?? [];

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

async function setupTestApp() {
	const client = createClient({ url: "file::memory:" });
	await client.execute("PRAGMA foreign_keys = ON");
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
			unauthenticated?: boolean;
		} = {},
	) {
		const headers: Record<string, string> = {
			origin: CORS_ORIGIN,
			...(options.unauthenticated
				? {}
				: { cookie: `better-auth.session_token=${token}` }),
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

	async function bootstrappedOrgId(token: string): Promise<string> {
		await kernel(token);
		const [org] = await db.select().from(schema.organization);
		if (!org) throw new Error("org chưa được bootstrap");
		return org.id;
	}

	async function seedBankMaterials(orgId: string) {
		await db.insert(schema.material).values([
			{
				id: "mat-1",
				orgId,
				title: "Tài liệu 1",
				kind: "link",
				url: "https://example.com/1",
				createdBy: "teacher",
			},
			{
				id: "mat-2",
				orgId,
				title: "Tài liệu 2",
				kind: "link",
				url: "https://example.com/2",
				createdBy: "teacher",
			},
			{
				id: "mat-3",
				orgId,
				title: "Tài liệu 3",
				kind: "link",
				url: "https://example.com/3",
				createdBy: "teacher",
			},
		]);
	}

	async function createTemplate(
		token: string,
		modules: {
			title: string;
			description?: string;
			lessons: {
				title: string;
				objectives?: string;
				materials?: string;
				kind?: "lesson" | "midterm" | "final";
				status?: "done" | "current" | "upcoming";
			}[];
		}[],
		name = "IELTS Template",
	): Promise<string> {
		const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
		const res = await call(token, "/api/syllabus-templates", {
			body: {
				name,
				level: "5.5",
				type: "ielts",
				skills: ["Writing", "Speaking"],
				description: "Template description",
				totalLessons,
				modules: modules.map((m) => ({
					title: m.title,
					description: m.description ?? "",
					lessons: m.lessons.map((l) => ({
						title: l.title,
						objectives: l.objectives ?? "",
						materials: l.materials ?? "",
						kind: l.kind ?? "lesson",
						status: l.status ?? "upcoming",
					})),
				})),
			},
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		return id;
	}

	async function createClass(
		token: string,
		opts: {
			name?: string;
			templateId?: string;
			schedulingMode?: "auto" | "manual";
			sessionsTotal?: number;
		} = {},
	): Promise<string> {
		const res = await call(token, "/api/classes", {
			body: {
				name: opts.name ?? "Lớp IELTS 1",
				type: "ielts",
				level: "5.5",
				skills: ["Writing"],
				mode: "Online",
				templateId: opts.templateId ?? "",
				schedulingMode: opts.schedulingMode ?? "auto",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: opts.sessionsTotal ?? 4,
				startDate: "2026-11-16",
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
		bootstrappedOrgId,
		seedBankMaterials,
		createTemplate,
		createClass,
	};
}

describe("POST /api/classes/:id/curriculum/sync (#700)", () => {
	test("1. Syncs updated multi-module template: preserves copy.id, class.syllabusId, bank links, and flattens statuses 1..N across modules", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Sync 1");
		const orgId = await t.bootstrappedOrgId(teacher.token);
		await t.seedBankMaterials(orgId);

		// Multi-module template: M1 (2 lessons) + M2 (1 lesson) = 3 lessons
		const tplId = await t.createTemplate(teacher.token, [
			{
				title: "Module 1",
				lessons: [
					{ title: "Old M1L1", objectives: "obj1" },
					{ title: "Old M1L2", objectives: "obj2" },
				],
			},
			{
				title: "Module 2",
				lessons: [{ title: "Old M2L1", objectives: "obj3" }],
			},
		]);

		const classId = await t.createClass(teacher.token, {
			templateId: tplId,
			sessionsTotal: 3,
		});

		const snapBefore = await t.kernel(teacher.token);
		const clsBefore = snapBefore.classes.find((c) => c.id === classId);
		const copyId = clsBefore?.syllabusId;
		expect(copyId).toBeTruthy();

		const copyBefore = snapBefore.syllabi.find((s) => s.id === copyId);
		expect(copyBefore?.sourceTemplateId).toBe(tplId);
		const oldMod1 = copyBefore?.modules[0];
		const oldMod2 = copyBefore?.modules[1];
		const oldL1 = oldMod1?.lessons[0];
		const oldL2 = oldMod1?.lessons[1];
		const oldL3 = oldMod2?.lessons[0];
		expect(oldL1 && oldL2 && oldL3).toBeTruthy();

		// Mark class copy lesson statuses across modules: M1L1=done, M1L2=current, M2L1=done
		// (M1L2=position 1 in M1 vs M2L1=position 0 in M2 verifies flattenSyllabusLessons)
		for (const [modId, les, status] of [
			[oldMod1?.id, oldL1, "done"],
			[oldMod1?.id, oldL2, "current"],
			[oldMod2?.id, oldL3, "done"],
		] as const) {
			const upd = await t.call(
				teacher.token,
				`/api/classes/${classId}/curriculum/modules/${modId}/lessons/${les?.id}`,
				{
					body: {
						title: les?.title,
						objectives: les?.objectives,
						materials: les?.materials,
						status,
						materialIds: ["mat-1"],
					},
				},
			);
			expect(upd.status).toBe(200);
		}

		// Update template: M1 (3 lessons), M2 (2 lessons) = 5 lessons with new content & bank links
		const replaceRes = await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/replace-content`,
			{
				body: {
					modules: [
						{
							title: "New Module 1",
							description: "Updated M1 desc",
							lessons: [
								{
									title: "New M1L1",
									objectives: "new obj 1",
									materials: "new mat 1",
									kind: "lesson",
								},
								{
									title: "New M1L2",
									objectives: "new obj 2",
									materials: "new mat 2",
									kind: "midterm",
								},
								{
									title: "New M1L3",
									objectives: "new obj 3",
									materials: "new mat 3",
									kind: "lesson",
								},
							],
						},
						{
							title: "New Module 2",
							description: "Updated M2 desc",
							lessons: [
								{
									title: "New M2L1",
									objectives: "new obj 4",
									materials: "new mat 4",
									kind: "lesson",
								},
								{
									title: "New M2L2",
									objectives: "new obj 5",
									materials: "new mat 5",
									kind: "final",
								},
							],
						},
					],
				},
			},
		);
		expect(replaceRes.status).toBe(200);

		// Attach bank materials to template lessons
		const snapAfterReplace = await t.kernel(teacher.token);
		const tplTree = snapAfterReplace.syllabi.find((s) => s.id === tplId);
		const tplM1 = tplTree?.modules[0];
		const tplM2 = tplTree?.modules[1];
		const tplM1L1 = tplM1?.lessons[0];
		const tplM2L2 = tplM2?.lessons[1];

		await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/modules/${tplM1?.id}/lessons/${tplM1L1?.id}`,
			{
				body: {
					title: tplM1L1?.title,
					objectives: tplM1L1?.objectives,
					materials: tplM1L1?.materials,
					materialIds: ["mat-2", "mat-3"],
				},
			},
		);
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/modules/${tplM2?.id}/lessons/${tplM2L2?.id}`,
			{
				body: {
					title: tplM2L2?.title,
					objectives: tplM2L2?.objectives,
					materials: tplM2L2?.materials,
					materialIds: ["mat-1"],
				},
			},
		);

		// Sync!
		const syncRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(syncRes.status).toBe(200);
		expect(await syncRes.json()).toEqual({ ok: true, id: copyId });

		// Verify snapshot & DB state
		const snapAfterSync = await t.kernel(teacher.token);
		const clsAfter = snapAfterSync.classes.find((c) => c.id === classId);
		expect(clsAfter?.syllabusId).toBe(copyId);
		expect(clsAfter?.sessionsTotal).toBe(5);

		const copyAfter = snapAfterSync.syllabi.find((s) => s.id === copyId);
		expect(copyAfter?.totalLessons).toBe(5);
		expect(copyAfter?.sourceTemplateId).toBe(tplId);
		expect(copyAfter?.modules.map((m) => m.title)).toEqual([
			"New Module 1",
			"New Module 2",
		]);

		const flatLessons = copyAfter?.modules.flatMap((m) => m.lessons) ?? [];
		expect(flatLessons.map((l) => l.title)).toEqual([
			"New M1L1",
			"New M1L2",
			"New M1L3",
			"New M2L1",
			"New M2L2",
		]);
		expect(flatLessons.map((l) => l.status)).toEqual([
			"done",
			"current",
			"done",
			"upcoming",
			"upcoming",
		]);
		expect(flatLessons.map((l) => l.kind)).toEqual([
			"lesson",
			"midterm",
			"lesson",
			"lesson",
			"final",
		]);
		expect(flatLessons[0]?.objectives).toBe("new obj 1");
		expect(flatLessons[0]?.materials).toBe("new mat 1");
		const firstLesson = flatLessons[0];
		const fifthLesson = flatLessons[4];
		if (!firstLesson || !fifthLesson) {
			throw new Error("expected 5 lessons");
		}
		expect(bankOf(firstLesson).map((b) => b.id)).toEqual(["mat-2", "mat-3"]);
		expect(bankOf(fifthLesson).map((b) => b.id)).toEqual(["mat-1"]);

		// Verify old module/lesson/link IDs are completely gone from DB
		const dbModules = await t.db
			.select()
			.from(schema.syllabusModule)
			.where(eq(schema.syllabusModule.syllabusId, copyId as string));
		expect(dbModules.map((m) => m.id)).not.toContain(oldMod1?.id);
		expect(dbModules.map((m) => m.id)).not.toContain(oldMod2?.id);

		const dbOldLessonLinks = await t.db
			.select()
			.from(schema.syllabusLessonMaterial)
			.where(
				eq(schema.syllabusLessonMaterial.syllabusLessonId, oldL1?.id ?? ""),
			);
		expect(dbOldLessonLinks).toHaveLength(0);
	}, 15_000);

	test("2. flattenSyllabusLessons preserves module-major order even when selectTemplateTree interleaves positions", () => {
		const modules = [{ id: "m1" }, { id: "m2" }];
		// Simulate selectTemplateTree output sorted by (position, createdAt) across all modules
		const interleavedLessons = [
			{ id: "m1-l0", moduleId: "m1" },
			{ id: "m2-l0", moduleId: "m2" },
			{ id: "m1-l1", moduleId: "m1" },
			{ id: "m2-l1", moduleId: "m2" },
		];
		expect(
			flattenSyllabusLessons(modules, interleavedLessons).map((l) => l.id),
		).toEqual(["m1-l0", "m1-l1", "m2-l0", "m2-l1"]);
	});

	test("3. Shrinking template lesson count removes surplus lessons & links while preserving first K statuses", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Sync Shrink");
		const orgId = await t.bootstrappedOrgId(teacher.token);
		await t.seedBankMaterials(orgId);

		const tplId = await t.createTemplate(teacher.token, [
			{
				title: "M1",
				lessons: [
					{ title: "L1" },
					{ title: "L2" },
					{ title: "L3" },
					{ title: "L4" },
				],
			},
		]);
		const classId = await t.createClass(teacher.token, {
			templateId: tplId,
			sessionsTotal: 4,
		});

		const snap1 = await t.kernel(teacher.token);
		const copyId =
			snap1.classes.find((c) => c.id === classId)?.syllabusId ?? "";
		const copyMod = snap1.syllabi.find((s) => s.id === copyId)?.modules[0];
		const lessons = copyMod?.lessons ?? [];

		for (const [idx, status] of [
			"done",
			"current",
			"done",
			"upcoming",
		].entries()) {
			const les = lessons[idx];
			await t.call(
				teacher.token,
				`/api/classes/${classId}/curriculum/modules/${copyMod?.id}/lessons/${les?.id}`,
				{
					body: {
						title: les?.title,
						objectives: "",
						materials: "",
						status,
						materialIds: ["mat-1"],
					},
				},
			);
		}

		// Shrink template to 2 lessons
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/replace-content`,
			{
				body: {
					modules: [
						{
							title: "M1 Shrunk",
							lessons: [
								{ title: "L1 v2", objectives: "o1" },
								{ title: "L2 v2", objectives: "o2" },
							],
						},
					],
				},
			},
		);

		const syncRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(syncRes.status).toBe(200);

		const snap2 = await t.kernel(teacher.token);
		const cls2 = snap2.classes.find((c) => c.id === classId);
		expect(cls2?.sessionsTotal).toBe(2);

		const copy2 = snap2.syllabi.find((s) => s.id === copyId);
		expect(copy2?.totalLessons).toBe(2);
		const newLessons = copy2?.modules.flatMap((m) => m.lessons) ?? [];
		expect(newLessons.map((l) => [l.title, l.status])).toEqual([
			["L1 v2", "done"],
			["L2 v2", "current"],
		]);

		// Surplus links from old L3/L4 must be gone
		const remainingLinks = await t.db
			.select()
			.from(schema.syllabusLessonMaterial)
			.where(eq(schema.syllabusLessonMaterial.orgId, orgId));
		expect(remainingLinks).toHaveLength(0);
	});

	test("4. 0-lesson class updates sessionsTotal and rejects >52 lessons with 422 CURRICULUM_TOO_MANY_LESSONS", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Sync >52");
		await t.bootstrappedOrgId(teacher.token);

		const tplId = await t.createTemplate(teacher.token, [
			{ title: "M1", lessons: [{ title: "L1" }, { title: "L2" }] },
		]);
		const classId = await t.createClass(teacher.token, {
			templateId: tplId,
			sessionsTotal: 2,
		});

		// Syncing to 4-lesson template updates sessionsTotal on 0-lesson class
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/replace-content`,
			{
				body: {
					modules: [
						{
							title: "M1 4 lessons",
							lessons: [
								{ title: "L1" },
								{ title: "L2" },
								{ title: "L3" },
								{ title: "L4" },
							],
						},
					],
				},
			},
		);
		const sync4Res = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(sync4Res.status).toBe(200);
		const snap4 = await t.kernel(teacher.token);
		expect(snap4.classes.find((c) => c.id === classId)?.sessionsTotal).toBe(4);

		// Replace template with 53 lessons -> rejected with 422 CURRICULUM_TOO_MANY_LESSONS
		const lessons53 = Array.from({ length: 53 }, (_, i) => ({
			title: `Lesson ${i + 1}`,
		}));
		const replaceRes = await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/replace-content`,
			{
				body: {
					modules: [{ title: "Big Module", lessons: lessons53 }],
				},
			},
		);
		expect(replaceRes.status).toBe(200);

		const syncRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(syncRes.status).toBe(422);
		expect(await syncRes.json()).toMatchObject({
			code: "CURRICULUM_TOO_MANY_LESSONS",
			reason: "too-many-lessons",
		});
		const snapAfterFail = await t.kernel(teacher.token);
		expect(
			snapAfterFail.classes.find((c) => c.id === classId)?.sessionsTotal,
		).toBe(4);
	}, 15_000);

	test("5. Class WITH real lesson rows (active student + session_package) keeps sessionsTotal, lessons, and session_package.total untouched", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Sync Active Class");
		await t.bootstrappedOrgId(teacher.token);

		const tplId = await t.createTemplate(teacher.token, [
			{
				title: "M1",
				lessons: [{ title: "L1" }, { title: "L2" }, { title: "L3" }],
			},
		]);
		const classId = await t.createClass(teacher.token, {
			templateId: tplId,
			sessionsTotal: 3,
		});

		// Enroll and activate student -> materializes 3 lesson rows and session_package.total = 3
		const addStudentRes = await t.call(teacher.token, "/api/students", {
			body: {
				name: "Student Active",
				email: "active@test.local",
				classId,
				activateNow: true,
			},
		});
		expect(addStudentRes.status).toBe(201);

		const snapBefore = await t.kernel(teacher.token);
		const lessonsBefore = snapBefore.lessons
			.filter((l) => l.classId === classId)
			.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
		expect(lessonsBefore).toHaveLength(3);
		const pkgBefore = snapBefore.packages.find((p) => p.total === 3);
		expect(pkgBefore).toBeTruthy();

		// Expand template from 3 -> 5 lessons
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${tplId}/replace-content`,
			{
				body: {
					modules: [
						{
							title: "M1 Expanded",
							lessons: [
								{ title: "L1" },
								{ title: "L2" },
								{ title: "L3" },
								{ title: "L4" },
								{ title: "L5" },
							],
						},
					],
				},
			},
		);

		const syncRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(syncRes.status).toBe(200);

		const snapAfter = await t.kernel(teacher.token);
		const clsAfter = snapAfter.classes.find((c) => c.id === classId);
		expect(clsAfter?.sessionsTotal).toBe(3);

		const lessonsAfter = snapAfter.lessons
			.filter((l) => l.classId === classId)
			.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
		expect(lessonsAfter.map((l) => l.id)).toEqual(
			lessonsBefore.map((l) => l.id),
		);
		expect(lessonsAfter.map((l) => l.date)).toEqual(
			lessonsBefore.map((l) => l.date),
		);

		const pkgAfter = snapAfter.packages.find((p) => p.id === pkgBefore?.id);
		expect(pkgAfter?.total).toBe(3);

		// Curriculum tree itself updated to 5 lessons
		const copyAfter = snapAfter.syllabi.find(
			(s) => s.id === clsAfter?.syllabusId,
		);
		expect(copyAfter?.totalLessons).toBe(5);
		expect(copyAfter?.modules[0]?.lessons).toHaveLength(5);
	});

	test("6. Deleted source template: {} returns 422 CURRICULUM_SOURCE_TEMPLATE_MISSING; { templateId } re-links and succeeds", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Sync Deleted Source");
		await t.bootstrappedOrgId(teacher.token);

		const tpl1Id = await t.createTemplate(
			teacher.token,
			[{ title: "M1", lessons: [{ title: "T1 L1" }] }],
			"Template 1",
		);
		const tpl2Id = await t.createTemplate(
			teacher.token,
			[{ title: "M2", lessons: [{ title: "T2 L1" }, { title: "T2 L2" }] }],
			"Template 2",
		);

		const classId = await t.createClass(teacher.token, {
			templateId: tpl1Id,
			sessionsTotal: 1,
		});
		const snapBefore = await t.kernel(teacher.token);
		const copyId =
			snapBefore.classes.find((c) => c.id === classId)?.syllabusId ?? "";

		// Mark first lesson done before template deletion
		const modBefore = snapBefore.syllabi.find((s) => s.id === copyId)
			?.modules[0];
		await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/modules/${modBefore?.id}/lessons/${modBefore?.lessons[0]?.id}`,
			{
				body: {
					title: "T1 L1",
					objectives: "",
					materials: "",
					status: "done",
				},
			},
		);

		// Delete source template
		const delRes = await t.call(
			teacher.token,
			`/api/syllabus-templates/${tpl1Id}/remove`,
			{ body: {} },
		);
		expect(delRes.status).toBe(200);

		// Empty body fails with 422 CURRICULUM_SOURCE_TEMPLATE_MISSING
		const missingRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: {} },
		);
		expect(missingRes.status).toBe(422);
		expect(await missingRes.json()).toMatchObject({
			code: "CURRICULUM_SOURCE_TEMPLATE_MISSING",
		});

		// Re-link with replacement templateId succeeds and updates sourceTemplateId
		const relinkRes = await t.call(
			teacher.token,
			`/api/classes/${classId}/curriculum/sync`,
			{ body: { templateId: tpl2Id } },
		);
		expect(relinkRes.status).toBe(200);
		expect(await relinkRes.json()).toEqual({ ok: true, id: copyId });

		const snapAfter = await t.kernel(teacher.token);
		const copyAfter = snapAfter.syllabi.find((s) => s.id === copyId);
		expect(copyAfter?.sourceTemplateId).toBe(tpl2Id);
		expect(copyAfter?.name).toBe("Template 2");
		expect(
			copyAfter?.modules
				.flatMap((m) => m.lessons)
				.map((l) => [l.title, l.status]),
		).toEqual([
			["T2 L1", "done"],
			["T2 L2", "upcoming"],
		]);
	});

	test("7. Error and security guards (401, 400 strict, 404 cross-org/copy-id, 409 missing curriculum & manual sessions)", async () => {
		const t = await setupTestApp();
		const teacherA = await t.insertUser("Teacher A");
		const teacherB = await t.insertUser("Teacher B");
		await t.bootstrappedOrgId(teacherA.token);
		await t.bootstrappedOrgId(teacherB.token);

		const tplA = await t.createTemplate(teacherA.token, [
			{ title: "M1", lessons: [{ title: "A1" }] },
		]);
		const tplB = await t.createTemplate(teacherB.token, [
			{ title: "M1", lessons: [{ title: "B1" }] },
		]);

		const classAWithCur = await t.createClass(teacherA.token, {
			templateId: tplA,
			sessionsTotal: 1,
		});
		const classANoCur = await t.createClass(teacherA.token, {
			schedulingMode: "manual",
			sessionsTotal: 4,
		});
		const classB = await t.createClass(teacherB.token, {
			templateId: tplB,
			sessionsTotal: 1,
		});

		const snapA = await t.kernel(teacherA.token);
		const copyIdA =
			snapA.classes.find((c) => c.id === classAWithCur)?.syllabusId ?? "";

		// 401 unauthenticated
		const r401 = await t.call(
			teacherA.token,
			`/api/classes/${classAWithCur}/curriculum/sync`,
			{ body: {}, unauthenticated: true },
		);
		expect(r401.status).toBe(401);

		// 400 unknown body field (.strict())
		const r400 = await t.call(
			teacherA.token,
			`/api/classes/${classAWithCur}/curriculum/sync`,
			{ body: { extraField: true } },
		);
		expect(r400.status).toBe(400);

		// 404 foreign org class
		const r404Class = await t.call(
			teacherA.token,
			`/api/classes/${classB}/curriculum/sync`,
			{ body: {} },
		);
		expect(r404Class.status).toBe(404);

		// 404 foreign org templateId
		const r404Tpl = await t.call(
			teacherA.token,
			`/api/classes/${classAWithCur}/curriculum/sync`,
			{ body: { templateId: tplB } },
		);
		expect(r404Tpl.status).toBe(404);

		// 404 class-copy ID passed as templateId
		const r404CopyAsTpl = await t.call(
			teacherA.token,
			`/api/classes/${classAWithCur}/curriculum/sync`,
			{ body: { templateId: copyIdA } },
		);
		expect(r404CopyAsTpl.status).toBe(404);

		// 409 CURRICULUM_NOT_FOUND on class without curriculum
		const r409NoCur = await t.call(
			teacherA.token,
			`/api/classes/${classANoCur}/curriculum/sync`,
			{ body: {} },
		);
		expect(r409NoCur.status).toBe(409);
		expect(await r409NoCur.json()).toMatchObject({
			code: "CURRICULUM_NOT_FOUND",
		});

		// 409 MANUAL_SESSIONS_EXIST when manual class_session exists
		const classAManual = await t.createClass(teacherA.token, {
			schedulingMode: "manual",
			sessionsTotal: 4,
		});
		const addManualRes = await t.call(
			teacherA.token,
			`/api/classes/${classAManual}/sessions`,
			{
				body: {
					date: "2026-11-20",
					time: "19:00",
					dur: 90,
					topic: "Manual Session",
				},
			},
		);
		expect(addManualRes.status).toBe(201);
		// Seed a copy directly for this manual class to exercise the sync manual-sessions guard
		const manualCopyId = crypto.randomUUID();
		const manualOrgId = (
			await t.db
				.select({ orgId: schema.classTable.orgId })
				.from(schema.classTable)
				.where(eq(schema.classTable.id, classAManual))
		)[0]?.orgId as string;
		await t.db.insert(schema.syllabus).values({
			id: manualCopyId,
			orgId: manualOrgId,
			name: "Manual Copy",
			classId: classAManual,
			sourceTemplateId: tplA,
		});
		const r409Manual = await t.call(
			teacherA.token,
			`/api/classes/${classAManual}/curriculum/sync`,
			{ body: {} },
		);
		expect(r409Manual.status).toBe(409);
		expect(await r409Manual.json()).toMatchObject({
			code: "MANUAL_SESSIONS_EXIST",
			reason: "has-manual-sessions",
		});
	});
});
