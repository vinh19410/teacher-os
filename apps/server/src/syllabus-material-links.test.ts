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

/**
 * Type snapshot (packages/api) chưa khai báo field mới #655 — test đọc qua
 * type mở rộng; runtime field luôn có (server gắn [] cho bài không links).
 */
type SnapshotLessonWithBank =
	KernelSnapshot["syllabi"][number]["modules"][number]["lessons"][number] & {
		bankMaterials?: SyllabusBankMaterialRef[];
	};
const bankOf = (
	lesson: KernelSnapshot["syllabi"][number]["modules"][number]["lessons"][number],
): SyllabusBankMaterialRef[] =>
	(lesson as SnapshotLessonWithBank).bankMaterials ?? [];

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

/**
 * Issue #655 — links tài liệu ngân hàng trên bài học giáo trình: upsert
 * lesson, cascade xoá, import copy remap và tree view bankMaterials.
 * PRAGMA foreign_keys = ON để cascade FK thật sự chạy (D1 luôn ON).
 */
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
		options: { method?: string; body?: unknown } = {},
	) {
		const headers: Record<string, string> = {
			cookie: `better-auth.session_token=${token}`,
			origin: CORS_ORIGIN,
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
		// Org được bootstrap ở request API đầu tiên — gọi kernel trước khi đọc.
		await kernel(token);
		const [org] = await db.select().from(schema.organization);
		if (!org) throw new Error("org chưa được bootstrap");
		return org.id;
	}

	/** Ngân hàng 3 tài liệu link trong org bootstrap, id cố định. */
	async function seedBankMaterials(orgId: string): Promise<string> {
		await db.insert(schema.material).values([
			{
				id: "mat-1",
				orgId,
				title: "Đề 1",
				kind: "link",
				url: "https://a.example/1",
				createdBy: "teacher",
			},
			{
				id: "mat-2",
				orgId,
				title: "Đề 2",
				kind: "link",
				url: "https://a.example/2",
				createdBy: "teacher",
			},
			{
				id: "mat-3",
				orgId,
				title: "Đề 3",
				kind: "link",
				url: "https://a.example/3",
				createdBy: "teacher",
			},
		]);
		return orgId;
	}

	async function linksOf(syllabusLessonId: string) {
		return db
			.select()
			.from(schema.syllabusLessonMaterial)
			.where(
				eq(schema.syllabusLessonMaterial.syllabusLessonId, syllabusLessonId),
			)
			.orderBy(schema.syllabusLessonMaterial.position);
	}

	/** Template 1 module / 2 bài, trả id module + bài theo thứ tự. */
	async function seedTemplate(token: string): Promise<{
		templateId: string;
		moduleId: string;
		lessonId1: string;
		lessonId2: string;
	}> {
		const res = await call(token, "/api/syllabus-templates", {
			body: {
				name: "IELTS Foundation",
				level: "5.0",
				type: "ielts",
				skills: ["Reading"],
				description: "",
				totalLessons: 2,
				modules: [
					{
						title: "Module 1",
						description: "",
						lessons: [
							{
								title: "Bài 1",
								objectives: "",
								materials: "",
								kind: "lesson",
								status: "upcoming",
							},
							{
								title: "Bài 2",
								objectives: "",
								materials: "",
								kind: "lesson",
								status: "upcoming",
							},
						],
					},
				],
			},
		});
		expect(res.status).toBe(201);
		const { id: templateId } = (await res.json()) as { id: string };
		const snap = await kernel(token);
		const tpl = snap.syllabi.find((s) => s.id === templateId);
		const mod = tpl?.modules[0];
		if (!tpl || !mod || mod.lessons.length !== 2) {
			throw new Error("template tree không như mong đợi");
		}
		return {
			templateId,
			moduleId: mod.id,
			lessonId1: mod.lessons[0]?.id ?? "",
			lessonId2: mod.lessons[1]?.id ?? "",
		};
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
		linksOf,
		seedTemplate,
	};
}

describe("Syllabus lesson material links (#655)", () => {
	test("1. tạo bài học với materialIds → đúng N links position 0..n-1", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 1");
		const orgId = await t.seedBankMaterials(
			await t.bootstrappedOrgId(teacher.token),
		);
		const { moduleId } = await t.seedTemplate(teacher.token);

		const res = await t.call(
			teacher.token,
			`/api/syllabus-templates/${(await templateIdOf(t, teacher.token)).id}/modules/${moduleId}/lessons`,
			{
				body: {
					title: "Bài mới",
					objectives: "",
					materials: "",
					materialIds: ["mat-2", "mat-1", "mat-2"],
				},
			},
		);
		expect(res.status).toBe(201);
		const { id: lessonId } = (await res.json()) as { id: string };

		const links = await t.linksOf(lessonId);
		// Dedupe giữ thứ tự: mat-2 gửi 2 lần chỉ tạo 1 link (PK chặn).
		expect(links.map((l) => [l.materialId, l.position])).toEqual([
			["mat-2", 0],
			["mat-1", 1],
		]);
		expect(links.every((l) => l.orgId === orgId)).toBe(true);
	});

	test("2. tạo bài học với id lạ → 422 material-not-found, không dở dang dữ liệu", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 2");
		await t.seedBankMaterials(await t.bootstrappedOrgId(teacher.token));
		const { moduleId } = await t.seedTemplate(teacher.token);
		const tpl = await templateIdOf(t, teacher.token);

		const res = await t.call(
			teacher.token,
			`/api/syllabus-templates/${tpl.id}/modules/${moduleId}/lessons`,
			{
				body: {
					title: "Bài hỏng",
					objectives: "",
					materials: "",
					materialIds: ["mat-1", "mat-khac-org"],
				},
			},
		);
		expect(res.status).toBe(422);
		expect(await res.json()).toEqual({
			error: "material-not-found",
			materialId: "mat-khac-org",
		});

		// Không dở dang: bài học chưa tồn tại, không có link mồ côi.
		const snap = await t.kernel(teacher.token);
		const mod = snap.syllabi
			.find((s) => s.id === tpl.id)
			?.modules.find((m) => m.id === moduleId);
		expect(mod?.lessons.map((l) => l.title)).toEqual(["Bài 1", "Bài 2"]);
		const stray = await t.db
			.select()
			.from(schema.syllabusLessonMaterial)
			.where(eq(schema.syllabusLessonMaterial.materialId, "mat-1"));
		expect(stray).toHaveLength(0);
	});

	test("3. update CÓ materialIds → replace-all; VẮNG → giữ nguyên links", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 3");
		await t.seedBankMaterials(await t.bootstrappedOrgId(teacher.token));
		const { moduleId, lessonId1 } = await t.seedTemplate(teacher.token);
		const tpl = await templateIdOf(t, teacher.token);
		const base = `/api/syllabus-templates/${tpl.id}/modules/${moduleId}/lessons/${lessonId1}`;

		await t.call(teacher.token, base, {
			body: {
				title: "Bài 1",
				objectives: "",
				materials: "",
				materialIds: ["mat-1", "mat-2"],
			},
		});
		expect((await t.linksOf(lessonId1)).map((l) => l.materialId)).toEqual([
			"mat-1",
			"mat-2",
		]);

		// Replace-all: tập mới + position đếm lại từ 0.
		await t.call(teacher.token, base, {
			body: {
				title: "Bài 1 (đã sửa)",
				objectives: "",
				materials: "",
				materialIds: ["mat-3", "mat-1", "mat-2"],
			},
		});
		expect(
			(await t.linksOf(lessonId1)).map((l) => [l.materialId, l.position]),
		).toEqual([
			["mat-3", 0],
			["mat-1", 1],
			["mat-2", 2],
		]);

		// Vắng mặt materialIds → links giữ nguyên (title vẫn được cập nhật).
		await t.call(teacher.token, base, {
			body: { title: "Bài 1 (sửa lần 2)", objectives: "", materials: "" },
		});
		expect((await t.linksOf(lessonId1)).map((l) => l.materialId)).toEqual([
			"mat-3",
			"mat-1",
			"mat-2",
		]);
		const snap = await t.kernel(teacher.token);
		const lesson = snap.syllabi
			.find((s) => s.id === tpl.id)
			?.modules.find((m) => m.id === moduleId)
			?.lessons.find((l) => l.id === lessonId1);
		expect(lesson?.title).toBe("Bài 1 (sửa lần 2)");
	});

	test("4. xoá bài học / module cascade dọn links", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 4");
		await t.seedBankMaterials(await t.bootstrappedOrgId(teacher.token));
		const { moduleId, lessonId1, lessonId2 } = await t.seedTemplate(
			teacher.token,
		);
		const tpl = await templateIdOf(t, teacher.token);
		const base = `/api/syllabus-templates/${tpl.id}/modules/${moduleId}/lessons`;

		await t.call(teacher.token, `${base}/${lessonId1}`, {
			body: {
				title: "Bài 1",
				objectives: "",
				materials: "",
				materialIds: ["mat-1"],
			},
		});
		await t.call(teacher.token, `${base}/${lessonId2}`, {
			body: {
				title: "Bài 2",
				objectives: "",
				materials: "",
				materialIds: ["mat-2"],
			},
		});

		// Xoá bài 1 → link của bài 1 biến mất, link bài 2 còn.
		const removeLesson = await t.call(
			teacher.token,
			`${base}/${lessonId1}/remove`,
			{
				body: {},
			},
		);
		expect(removeLesson.status).toBe(200);
		expect(await t.linksOf(lessonId1)).toHaveLength(0);
		expect(await t.linksOf(lessonId2)).toHaveLength(1);

		// Xoá module → link bài 2 cũng biến mất (cascade qua lesson).
		const removeModule = await t.call(
			teacher.token,
			`/api/syllabus-templates/${tpl.id}/modules/${moduleId}/remove`,
			{ body: {} },
		);
		expect(removeModule.status).toBe(200);
		expect(await t.linksOf(lessonId2)).toHaveLength(0);
	});

	test("5. import template → copy remap links, giữ materialId + position", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 5");
		await t.seedBankMaterials(await t.bootstrappedOrgId(teacher.token));
		const { templateId, moduleId, lessonId1, lessonId2 } = await t.seedTemplate(
			teacher.token,
		);

		// Gắn links lên template.
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${templateId}/modules/${moduleId}/lessons/${lessonId1}`,
			{
				body: {
					title: "Bài 1",
					objectives: "",
					materials: "",
					materialIds: ["mat-1", "mat-2"],
				},
			},
		);
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${templateId}/modules/${moduleId}/lessons/${lessonId2}`,
			{
				body: {
					title: "Bài 2",
					objectives: "",
					materials: "",
					materialIds: ["mat-3"],
				},
			},
		);

		// Tạo lớp import template.
		const createRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Lớp import",
				type: "ielts",
				level: "5.0",
				skills: ["Reading"],
				mode: "Online",
				templateId,
				schedule: { days: [1], start: "18:00", end: "20:00" },
				sessionsTotal: 4,
				startDate: "2026-11-10",
			},
		});
		expect(createRes.status).toBe(201);
		const { id: classId } = (await createRes.json()) as { id: string };

		// Links của template còn nguyên.
		expect(await t.linksOf(lessonId1)).toHaveLength(2);
		expect(await t.linksOf(lessonId2)).toHaveLength(1);

		// Copy: bài học id mới, links giữ materialId + position.
		const snap = await t.kernel(teacher.token);
		const copy = snap.syllabi.find((s) => s.classId === classId);
		expect(copy).toBeDefined();
		const copyLessons =
			copy?.modules.flatMap((m) => m.lessons.map((l) => l)) ?? [];
		expect(copyLessons).toHaveLength(2);
		const copyLesson1 = copyLessons.find((l) => l.title === "Bài 1");
		const copyLesson2 = copyLessons.find((l) => l.title === "Bài 2");
		if (!copyLesson1 || !copyLesson2) {
			throw new Error("copy tree không như mong đợi");
		}
		expect(bankOf(copyLesson1).map((m) => m.id)).toEqual(["mat-1", "mat-2"]);
		expect(bankOf(copyLesson2).map((m) => m.id)).toEqual(["mat-3"]);
		const dbLinks = await t.db
			.select()
			.from(schema.syllabusLessonMaterial)
			.where(
				eq(
					schema.syllabusLessonMaterial.orgId,
					await t.bootstrappedOrgId(teacher.token),
				),
			);
		const copyLinkRows = dbLinks.filter(
			(l) =>
				l.syllabusLessonId !== lessonId1 && l.syllabusLessonId !== lessonId2,
		);
		expect(copyLinkRows).toHaveLength(3);
		expect(
			copyLinkRows
				.filter((l) => l.syllabusLessonId === copyLesson1?.id)
				.map((l) => [l.materialId, l.position]),
		).toEqual([
			["mat-1", 0],
			["mat-2", 1],
		]);
	});

	test("6. tree view GET /api/kernel: bankMaterials projection teacher-safe", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 6");
		const orgId = await t.bootstrappedOrgId(teacher.token);
		await t.seedBankMaterials(orgId);
		const { templateId, moduleId, lessonId1 } = await t.seedTemplate(
			teacher.token,
		);

		// mat-4 dạng file có cột teacher-only.
		await t.db.insert(schema.material).values({
			id: "mat-4",
			orgId,
			title: "File đề",
			kind: "file",
			objectKey: `${orgId}/mat-4`,
			mimeType: "application/pdf",
			sizeBytes: 9,
			originalName: "de.pdf",
			createdBy: "teacher",
		});
		await t.call(
			teacher.token,
			`/api/syllabus-templates/${templateId}/modules/${moduleId}/lessons/${lessonId1}`,
			{
				body: {
					title: "Bài 1",
					objectives: "",
					materials: "",
					materialIds: ["mat-4", "mat-1"],
				},
			},
		);

		const snap = await t.kernel(teacher.token);
		const tpl = snap.syllabi.find((s) => s.id === templateId);
		const lesson = tpl?.modules
			.find((m) => m.id === moduleId)
			?.lessons.find((l) => l.id === lessonId1);
		if (!lesson) throw new Error("không tìm thấy lesson trong snapshot");
		expect(bankOf(lesson)).toEqual([
			{
				id: "mat-4",
				title: "File đề",
				description: "",
				kind: "file",
				url: null,
				mimeType: "application/pdf",
				sizeBytes: 9,
				originalName: "de.pdf",
				position: 0,
			},
			{
				id: "mat-1",
				title: "Đề 1",
				description: "",
				kind: "link",
				url: "https://a.example/1",
				mimeType: null,
				sizeBytes: null,
				originalName: null,
				position: 1,
			},
		]);
		// Không lộ field teacher-only.
		const raw = JSON.stringify(snap.syllabi);
		expect(raw).not.toContain("objectKey");
		expect(raw).not.toContain('"createdBy"');
		expect(raw).not.toContain("usageCount");
	});

	test("7. template không có links → import hành vi như cũ, bankMaterials rỗng", async () => {
		const t = await setupTestApp();
		const teacher = await t.insertUser("Teacher Links 7");
		const { templateId } = await t.seedTemplate(teacher.token);
		const createRes = await t.call(teacher.token, "/api/classes", {
			body: {
				name: "Lớp không links",
				type: "ielts",
				level: "5.0",
				skills: ["Reading"],
				mode: "Online",
				templateId,
				schedule: { days: [1], start: "18:00", end: "20:00" },
				sessionsTotal: 4,
				startDate: "2026-11-10",
			},
		});
		expect(createRes.status).toBe(201);
		const { id: classId } = (await createRes.json()) as { id: string };
		const snap = await t.kernel(teacher.token);
		const copy = snap.syllabi.find((s) => s.classId === classId);
		expect(copy?.modules.flatMap((m) => m.lessons)).toHaveLength(2);
		expect(
			copy?.modules
				.flatMap((m) => m.lessons)
				.every((l) => bankOf(l).length === 0),
		).toBe(true);
	});
});

interface TestApp {
	db: Db;
	insertUser(name: string): Promise<{ id: string; token: string }>;
	call(
		token: string,
		path: string,
		options?: { method?: string; body?: unknown },
	): Response | Promise<Response>;
	kernel(token: string): Promise<KernelSnapshot>;
	bootstrappedOrgId(token: string): Promise<string>;
	seedBankMaterials(orgId: string): Promise<string>;
	linksOf(
		syllabusLessonId: string,
	): Promise<(typeof schema.syllabusLessonMaterial.$inferSelect)[]>;
	seedTemplate(token: string): Promise<{
		templateId: string;
		moduleId: string;
		lessonId1: string;
		lessonId2: string;
	}>;
}

/** Id template đọc lại từ snapshot (route chỉ trả id template khi tạo). */
async function templateIdOf(
	t: TestApp,
	token: string,
): Promise<{ id: string }> {
	const snap = await t.kernel(token);
	const tpl = snap.syllabi.find(
		(s) => s.classId === null && s.modules.length > 0,
	);
	if (!tpl) throw new Error("không tìm thấy template");
	return { id: tpl.id };
}
