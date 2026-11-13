import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import type { Db } from "../app";
import { resolveCurriculumMaterials } from "./session-curriculum-materials";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

/**
 * Lịch thử nghiệm: 3 buổi dated (d1, d2, d3) và 3 bài giáo trình
 * (ls1 ← mat-1; ls2 ← mat-2, mat-3; ls3 ← mat-4). Buổi N ↔ bài N.
 */
const D1 = "2026-11-02";
const D2 = "2026-11-04";
const D3 = "2026-11-06";
const D4 = "2026-11-09";

describe("resolveCurriculumMaterials (#655)", () => {
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		await client.execute("PRAGMA foreign_keys = ON");
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await db.insert(schema.organization).values({ id: "org-1", name: "A" });
		await db.insert(schema.student).values({
			id: "stu-1",
			orgId: "org-1",
			name: "Minh",
			phone: "0901111111",
		});
		const classBase = {
			orgId: "org-1",
			level: "6.5",
			type: "ielts",
			skills: '["reading"]',
			mode: "Online",
			schedule: '{"days":[1,3,5],"start":"18:00","end":"20:00"}',
			sessionsTotal: 4,
			sessionsDone: 0,
			status: "active",
			startDate: "2026-11-02",
			notes: "",
		};
		// class.syllabus_id là FK thật (NO ACTION) còn syllabus.class_id chỉ là
		// logical FK — seed lớp trước với pointer null, gắn pointer sau.
		await db.insert(schema.classTable).values([
			// Lớp có giáo trình copy.
			{ ...classBase, id: "class-1", name: "IELTS A" },
			// Lớp không có giáo trình.
			{ ...classBase, id: "class-2", name: "IELTS B" },
			// Lớp legacy có copy riêng nhưng chỉ có dòng undated.
			{ ...classBase, id: "class-3", name: "IELTS C" },
		]);
		await db
			.insert(schema.enrollment)
			.values({
				id: "enr-1",
				orgId: "org-1",
				classId: "class-1",
				studentId: "stu-1",
				status: "active",
			})
			// Cùng enrollment dùng cho class-2 để lát nữa seed lesson nhanh.
			.onConflictDoNothing();
		await db.insert(schema.enrollment).values({
			id: "enr-2",
			orgId: "org-1",
			classId: "class-2",
			studentId: "stu-1",
			status: "active",
		});

		// Cây giáo trình copy của class-1: 2 module, 3 bài.
		await db.insert(schema.syllabus).values([
			{
				id: "copy-1",
				orgId: "org-1",
				name: "Giáo trình A",
				level: "6.5",
				type: "ielts",
				skills: '["reading"]',
				description: "",
				totalLessons: 3,
				classId: "class-1",
			},
			{
				id: "copy-3",
				orgId: "org-1",
				name: "Giáo trình C",
				level: "6.5",
				type: "ielts",
				skills: '["reading"]',
				description: "",
				totalLessons: 1,
				classId: "class-3",
			},
		]);
		// Pointer là cột suy ra (source of truth là syllabus.class_id) — gắn cho
		// khớp trạng thái production.
		await db
			.update(schema.classTable)
			.set({ syllabusId: "copy-1" })
			.where(eq(schema.classTable.id, "class-1"));
		await db
			.update(schema.classTable)
			.set({ syllabusId: "copy-3" })
			.where(eq(schema.classTable.id, "class-3"));
		await db.insert(schema.syllabusModule).values([
			{
				id: "m-1",
				orgId: "org-1",
				syllabusId: "copy-1",
				title: "M1",
				position: 0,
			},
			{
				id: "m-2",
				orgId: "org-1",
				syllabusId: "copy-1",
				title: "M2",
				position: 1,
			},
			{
				id: "m-3",
				orgId: "org-1",
				syllabusId: "copy-3",
				title: "M3",
				position: 0,
			},
		]);
		await db.insert(schema.syllabusLesson).values([
			{
				id: "ls-1",
				orgId: "org-1",
				moduleId: "m-1",
				title: "Bài 1",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
			{
				id: "ls-2",
				orgId: "org-1",
				moduleId: "m-1",
				title: "Bài 2",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 1,
			},
			{
				id: "ls-3",
				orgId: "org-1",
				moduleId: "m-2",
				title: "Bài 3",
				objectives: "",
				materials: "",
				kind: "lesson",
				status: "upcoming",
				position: 0,
			},
		]);

		// Ngân hàng tài liệu: mat-1 là file có cột teacher-only (kiểm không lộ),
		// còn lại là link.
		await db.insert(schema.material).values([
			{
				id: "mat-1",
				orgId: "org-1",
				title: "Đề đọc",
				description: "File đề",
				kind: "file",
				objectKey: "org-1/mat-1",
				mimeType: "application/pdf",
				sizeBytes: 123,
				originalName: "de-doc.pdf",
				createdBy: "t-1",
			},
			{
				id: "mat-2",
				orgId: "org-1",
				title: "Link từ vựng",
				kind: "link",
				url: "https://a.example/2",
				createdBy: "t-1",
			},
			{
				id: "mat-3",
				orgId: "org-1",
				title: "Link ngữ pháp",
				kind: "link",
				url: "https://a.example/3",
				createdBy: "t-1",
			},
			{
				id: "mat-4",
				orgId: "org-1",
				title: "Link listening",
				kind: "link",
				url: "https://a.example/4",
				createdBy: "t-1",
			},
		]);
		await db.insert(schema.syllabusLessonMaterial).values([
			{
				orgId: "org-1",
				syllabusLessonId: "ls-1",
				materialId: "mat-1",
				position: 0,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "ls-2",
				materialId: "mat-3",
				position: 1,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "ls-2",
				materialId: "mat-2",
				position: 0,
			},
			{
				orgId: "org-1",
				syllabusLessonId: "ls-3",
				materialId: "mat-4",
				position: 0,
			},
		]);

		const lessonBase = {
			orgId: "org-1",
			day: 1,
			time: "18:00",
			dur: 120,
			type: "1:1",
			status: "upcoming",
			topic: "",
			zoom: "",
		};
		await db.insert(schema.lesson).values([
			{
				...lessonBase,
				id: "l-1a",
				classId: "class-1",
				enrollmentId: "enr-1",
				date: D1,
			},
			{
				...lessonBase,
				id: "l-2a",
				classId: "class-1",
				enrollmentId: "enr-1",
				date: D2,
			},
			{
				...lessonBase,
				id: "l-3a",
				classId: "class-1",
				enrollmentId: "enr-1",
				date: D3,
			},
			// Lớp legacy: chỉ có dòng undated.
			{
				...lessonBase,
				id: "l-legacy",
				classId: "class-3",
				enrollmentId: "enr-1",
				date: null,
			},
		]);
	});

	test("mapping đúng: buổi 1 → bài 1, buổi 2 → bài 2 theo đúng thứ tự position", async () => {
		const d1 = await resolveCurriculumMaterials(db, "org-1", "class-1", D1);
		expect(d1).toHaveLength(1);
		expect(d1[0]).toMatchObject({ id: "mat-1", title: "Đề đọc", position: 0 });

		const d2 = await resolveCurriculumMaterials(db, "org-1", "class-1", D2);
		expect(d2.map((m) => m.id)).toEqual(["mat-2", "mat-3"]);
		expect(d2.map((m) => m.position)).toEqual([0, 1]);
	});

	test("projection teacher-safe: không có objectKey/createdBy/folderId/usageCount", async () => {
		const d1 = await resolveCurriculumMaterials(db, "org-1", "class-1", D1);
		expect(d1[0]).toEqual({
			id: "mat-1",
			title: "Đề đọc",
			description: "File đề",
			kind: "file",
			url: null,
			mimeType: "application/pdf",
			sizeBytes: 123,
			originalName: "de-doc.pdf",
			position: 0,
		});
		expect(Object.keys(d1[0] ?? {}).sort()).toEqual(
			[
				"description",
				"id",
				"kind",
				"mimeType",
				"originalName",
				"position",
				"sizeBytes",
				"title",
				"url",
			].sort(),
		);
	});

	test("lớp không có giáo trình copy → []", async () => {
		expect(
			await resolveCurriculumMaterials(db, "org-1", "class-2", D1),
		).toEqual([]);
	});

	test("ngày ngoài lịch hiện hành → []", async () => {
		expect(
			await resolveCurriculumMaterials(db, "org-1", "class-1", "2026-11-20"),
		).toEqual([]);
	});

	test("lớp legacy không có dòng dated → []", async () => {
		expect(
			await resolveCurriculumMaterials(db, "org-1", "class-3", D1),
		).toEqual([]);
	});

	test("out-of-range: index vượt số bài → []", async () => {
		// Chỉ 3 bài; thêm buổi thứ 4 cùng enrollment.
		await db.insert(schema.lesson).values({
			id: "l-4a",
			orgId: "org-1",
			classId: "class-1",
			enrollmentId: "enr-1",
			day: 1,
			time: "18:00",
			dur: 120,
			type: "1:1",
			status: "upcoming",
			topic: "",
			zoom: "",
			date: D4,
		});
		expect(
			await resolveCurriculumMaterials(db, "org-1", "class-1", D4),
		).toEqual([]);
	});

	test("nhóm holiday không chiếm số buổi: buổi sau nhận bài kế tiếp", async () => {
		// Bucket D2 thành holiday — D3 (thứ 3 dạy) phải nâng lên thành buổi 2
		// → bài 2, còn D2 thì không ánh xạ bài nào.
		await db
			.update(schema.lesson)
			.set({ status: "holiday" })
			.where(
				and(eq(schema.lesson.classId, "class-1"), eq(schema.lesson.date, D2)),
			);
		expect(
			await resolveCurriculumMaterials(db, "org-1", "class-1", D2),
		).toEqual([]);
		const d3 = await resolveCurriculumMaterials(db, "org-1", "class-1", D3);
		expect(d3.map((m) => m.id)).toEqual(["mat-2", "mat-3"]);

		// Dọn lại cho test sau.
		await db
			.update(schema.lesson)
			.set({ status: "upcoming" })
			.where(
				and(eq(schema.lesson.classId, "class-1"), eq(schema.lesson.date, D2)),
			);
	});

	test("nhóm cancelled vẫn chiếm số buổi — index không trượt so với topic", async () => {
		await db
			.update(schema.lesson)
			.set({ status: "cancelled" })
			.where(
				and(eq(schema.lesson.classId, "class-1"), eq(schema.lesson.date, D2)),
			);
		// D2 cancelled vẫn là buổi 2 → bài 2; D3 vẫn là buổi 3 → bài 3.
		const d2 = await resolveCurriculumMaterials(db, "org-1", "class-1", D2);
		expect(d2.map((m) => m.id)).toEqual(["mat-2", "mat-3"]);
		const d3 = await resolveCurriculumMaterials(db, "org-1", "class-1", D3);
		expect(d3.map((m) => m.id)).toEqual(["mat-4"]);

		await db
			.update(schema.lesson)
			.set({ status: "upcoming" })
			.where(
				and(eq(schema.lesson.classId, "class-1"), eq(schema.lesson.date, D2)),
			);
	});

	test("org khác không thấy tài liệu của org-1", async () => {
		await db.insert(schema.organization).values({ id: "org-2", name: "B" });
		// Org khác + cùng classId (id class không thuộc org-2) → không có copy
		// trong org-2 → [].
		expect(
			await resolveCurriculumMaterials(db, "org-2", "class-1", D1),
		).toEqual([]);
	});
});
