import { classTable } from "@teacher-os/db/schema/class";
import {
	material,
	syllabusLessonMaterial,
} from "@teacher-os/db/schema/material";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import type { Db } from "../app";

/** Full row — import needs classId (template check) + metadata to copy. */
export async function findSyllabus(db: Db, syllabusId: string, orgId: string) {
	const [row] = await db
		.select()
		.from(syllabus)
		.where(and(eq(syllabus.id, syllabusId), eq(syllabus.orgId, orgId)));
	return row;
}

/**
 * The class's own curriculum copy, found by `syllabus.class_id` (org-scoped).
 * This is the single source of truth for the class ↔ curriculum relation —
 * the derived `class.syllabus_id` column is never read to locate a copy.
 */
export async function findClassCurriculum(
	db: Db,
	classId: string,
	orgId: string,
) {
	const [row] = await db
		.select()
		.from(syllabus)
		.where(and(eq(syllabus.classId, classId), eq(syllabus.orgId, orgId)));
	return row;
}

/** Template row: class_id must be NULL — copies are never templates. */
export async function findTemplate(db: Db, id: string, orgId: string) {
	const [row] = await db
		.select()
		.from(syllabus)
		.where(
			and(
				eq(syllabus.id, id),
				eq(syllabus.orgId, orgId),
				isNull(syllabus.classId),
			),
		);
	return row;
}

/**
 * Only sanctioned writer of `class.syllabus_id` per class: the pointer is a
 * derived column mirroring `syllabus.class_id`, kept in step inside the same
 * batch as the copy writes.
 */
export function setClassCurriculumPointer(
	db: Db,
	classId: string,
	orgId: string,
	copyId: string | null,
): BatchItem<"sqlite"> {
	return db
		.update(classTable)
		.set({ syllabusId: copyId })
		.where(and(eq(classTable.id, classId), eq(classTable.orgId, orgId)));
}

/** Detach every same-org class pointer aimed at the given syllabus. */
export function clearPointersTo(
	db: Db,
	syllabusId: string,
	orgId: string,
): BatchItem<"sqlite"> {
	return db
		.update(classTable)
		.set({ syllabusId: null })
		.where(
			and(eq(classTable.syllabusId, syllabusId), eq(classTable.orgId, orgId)),
		);
}

/** Module must belong to the given syllabus AND the org — client ids are never trusted. */
export async function findModule(
	db: Db,
	moduleId: string,
	syllabusId: string,
	orgId: string,
) {
	const [row] = await db
		.select({ id: syllabusModule.id })
		.from(syllabusModule)
		.where(
			and(
				eq(syllabusModule.id, moduleId),
				eq(syllabusModule.syllabusId, syllabusId),
				eq(syllabusModule.orgId, orgId),
			),
		);
	return row;
}

export function hasDuplicateIds(ids: string[]): boolean {
	return new Set(ids).size !== ids.length;
}

export function sameIdSet(payload: string[], dbIds: string[]): boolean {
	if (payload.length !== dbIds.length) return false;
	const dbSet = new Set(dbIds);
	return payload.every((id) => dbSet.has(id));
}

/** Import size guard: modules + lessons above this would brick one D1 batch. */
export const MAX_IMPORT_NODES = 500;

/**
 * Sắp xếp phẳng danh sách bài học theo đúng thứ tự giáo trình: từng module
 * theo thứ tự đầu vào `modules`, bên trong mỗi module giữ nguyên thứ tự
 * đầu vào `lessons`.
 *
 * `selectTemplateTree` query `lessons` bằng `inArray(moduleId, ...)` và sort
 * theo `(position, createdAt)` trên toàn syllabus — nên mảng trả về bị xen kẽ
 * theo position (`[mod1.pos0, mod2.pos0, ...]`) thay vì tuần tự từng module.
 * Luôn đi qua helper này khi đọc `previousStatuses` hoặc map tiến độ 1..N.
 */
export function flattenSyllabusLessons<
	M extends { id: string },
	L extends { moduleId: string },
>(modules: readonly M[], lessons: readonly L[]): L[] {
	const byModule = new Map<string, L[]>();
	for (const lesson of lessons) {
		const list = byModule.get(lesson.moduleId);
		if (list) {
			list.push(lesson);
		} else {
			byModule.set(lesson.moduleId, [lesson]);
		}
	}
	return modules.flatMap((m) => byModule.get(m.id) ?? []);
}

function buildTreeInsertStatements(
	db: Db,
	input: {
		syllabusId: string;
		orgId: string;
		modules: (typeof syllabusModule.$inferSelect)[];
		lessons: (typeof syllabusLesson.$inferSelect)[];
		links?: {
			syllabusLessonId: string;
			materialId: string;
			position: number;
		}[];
		statusForLesson: (lesson: typeof syllabusLesson.$inferSelect) => string;
	},
): BatchItem<"sqlite">[] {
	const { syllabusId, orgId } = input;
	const moduleIds = new Map(
		input.modules.map((m) => [m.id, crypto.randomUUID()]),
	);
	const lessonIds = new Map(
		input.lessons.map((l) => [l.id, crypto.randomUUID()]),
	);
	return [
		...input.modules.map((m) =>
			db.insert(syllabusModule).values({
				id: moduleIds.get(m.id) as string,
				orgId,
				syllabusId,
				title: m.title,
				description: m.description,
				position: m.position,
				createdAt: m.createdAt,
			}),
		),
		...input.lessons.map((l) =>
			db.insert(syllabusLesson).values({
				id: lessonIds.get(l.id) as string,
				orgId,
				moduleId: moduleIds.get(l.moduleId) as string,
				title: l.title,
				objectives: l.objectives,
				materials: l.materials,
				kind: l.kind,
				status: input.statusForLesson(l),
				position: l.position,
				createdAt: l.createdAt,
			}),
		),
		...(input.links ?? []).flatMap((link) => {
			const lessonId = lessonIds.get(link.syllabusLessonId);
			// Link mồ côi (bài học đã bị xoá khỏi cây) không copy.
			if (lessonId === undefined) return [];
			return [
				db.insert(syllabusLessonMaterial).values({
					orgId,
					syllabusLessonId: lessonId,
					materialId: link.materialId,
					position: link.position,
				}),
			];
		}),
	];
}

/**
 * Deep-copy batch of a template tree into a class copy (issue #79).
 * All ids are generated before the batch so the copy is wired with fresh
 * UUIDs; every lesson status resets to `upcoming` (status is per-class
 * progress, not template content); positions are preserved. Callers own
 * the org + template checks and the class pointer statement.
 *
 * #655: `links` là các dòng `syllabus_lesson_material` của template — copy
 * remap `syllabusLessonId` qua map `lessonIds`, giữ nguyên `materialId`
 * (ngân hàng là tài nguyên org dùng chung) và `position`. Link trỏ bài học
 * ngoài cây (dữ liệu mồ côi) bị bỏ qua thay vì nổ batch.
 */
export function buildImportBatch(
	db: Db,
	input: {
		template: typeof syllabus.$inferSelect;
		modules: (typeof syllabusModule.$inferSelect)[];
		lessons: (typeof syllabusLesson.$inferSelect)[];
		links?: {
			syllabusLessonId: string;
			materialId: string;
			position: number;
		}[];
		classId: string;
		orgId: string;
	},
): {
	copyId: string;
	statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
} {
	const { template, classId, orgId } = input;
	const copyId = crypto.randomUUID();
	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db.insert(syllabus).values({
			id: copyId,
			orgId,
			name: template.name,
			level: template.level,
			type: template.type,
			skills: template.skills,
			description: template.description,
			totalLessons: template.totalLessons,
			createdAt: template.createdAt,
			classId,
			sourceTemplateId: template.id,
		}),
		...buildTreeInsertStatements(db, {
			syllabusId: copyId,
			orgId,
			modules: input.modules,
			lessons: input.lessons,
			links: input.links,
			// kind là nội dung giáo trình — copy giữ nguyên (status
			// là tiến độ per-lớp, reset upcoming).
			statusForLesson: () => "upcoming",
		}),
	];
	return { copyId, statements };
}

/**
 * Đồng bộ bản copy giáo trình của lớp từ template (#700): giữ nguyên `copyId`
 * (tránh đứt FK `class.syllabus_id`), thay toàn bộ cây module/lesson/link
 * theo template mới và ánh xạ lại `previousStatuses` theo thứ tự phẳng 1..N
 * (bài thừa nhận `"upcoming"`). Thứ tự câu lệnh nghiêm ngặt: delete child-first
 * → update parent in-place → insert parent-first; toàn bộ org-scoped.
 */
export function buildSyncBatch(
	db: Db,
	input: {
		copyId: string;
		template: typeof syllabus.$inferSelect;
		modules: (typeof syllabusModule.$inferSelect)[];
		lessons: (typeof syllabusLesson.$inferSelect)[];
		links?: {
			syllabusLessonId: string;
			materialId: string;
			position: number;
		}[];
		previousStatuses: readonly string[];
		orgId: string;
	},
): {
	statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
} {
	const { copyId, template, orgId } = input;
	const orderedLessons = flattenSyllabusLessons(input.modules, input.lessons);
	const statusByLessonId = new Map(
		orderedLessons.map((l, idx) => [
			l.id,
			input.previousStatuses[idx] ?? "upcoming",
		]),
	);

	const moduleIdSubquery = db
		.select({ id: syllabusModule.id })
		.from(syllabusModule)
		.where(
			and(
				eq(syllabusModule.syllabusId, copyId),
				eq(syllabusModule.orgId, orgId),
			),
		);

	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db.delete(syllabusLessonMaterial).where(
			and(
				eq(syllabusLessonMaterial.orgId, orgId),
				inArray(
					syllabusLessonMaterial.syllabusLessonId,
					db
						.select({ id: syllabusLesson.id })
						.from(syllabusLesson)
						.where(
							and(
								eq(syllabusLesson.orgId, orgId),
								inArray(syllabusLesson.moduleId, moduleIdSubquery),
							),
						),
				),
			),
		),
		db
			.delete(syllabusLesson)
			.where(
				and(
					eq(syllabusLesson.orgId, orgId),
					inArray(syllabusLesson.moduleId, moduleIdSubquery),
				),
			),
		db
			.delete(syllabusModule)
			.where(
				and(
					eq(syllabusModule.syllabusId, copyId),
					eq(syllabusModule.orgId, orgId),
				),
			),
		db
			.update(syllabus)
			.set({
				name: template.name,
				level: template.level,
				type: template.type,
				skills: template.skills,
				description: template.description,
				totalLessons: orderedLessons.length,
				sourceTemplateId: template.id,
			})
			.where(and(eq(syllabus.id, copyId), eq(syllabus.orgId, orgId))),
		...buildTreeInsertStatements(db, {
			syllabusId: copyId,
			orgId,
			modules: input.modules,
			lessons: orderedLessons,
			links: input.links,
			statusForLesson: (l) => statusByLessonId.get(l.id) ?? "upcoming",
		}),
	];
	return { statements };
}

/** Pre-read of a template's module/lesson tree, ordered by position. */
export async function selectTemplateTree(
	db: Db,
	templateId: string,
	orgId: string,
) {
	const modules = await db
		.select()
		.from(syllabusModule)
		.where(
			and(
				eq(syllabusModule.syllabusId, templateId),
				eq(syllabusModule.orgId, orgId),
			),
		)
		.orderBy(asc(syllabusModule.position), asc(syllabusModule.createdAt));
	const lessons = modules.length
		? await db
				.select()
				.from(syllabusLesson)
				.where(
					and(
						eq(syllabusLesson.orgId, orgId),
						inArray(
							syllabusLesson.moduleId,
							modules.map((m) => m.id),
						),
					),
				)
				.orderBy(asc(syllabusLesson.position), asc(syllabusLesson.createdAt))
		: [];
	// #655: đọc thêm links tài liệu ngân hàng của template — buildImportBatch
	// copy kèm remap lessonId. Template không có links → mảng rỗng, hành vi
	// import giữ nguyên như cũ.
	const links = lessons.length
		? await db
				.select({
					syllabusLessonId: syllabusLessonMaterial.syllabusLessonId,
					materialId: syllabusLessonMaterial.materialId,
					position: syllabusLessonMaterial.position,
				})
				.from(syllabusLessonMaterial)
				.where(
					and(
						eq(syllabusLessonMaterial.orgId, orgId),
						inArray(
							syllabusLessonMaterial.syllabusLessonId,
							lessons.map((l) => l.id),
						),
					),
				)
				.orderBy(
					asc(syllabusLessonMaterial.position),
					asc(syllabusLessonMaterial.createdAt),
				)
		: [];
	return { modules, lessons, links };
}

/**
 * Id tài liệu ngân hàng tồn tại trong org, trong tập ids gửi lên (#655).
 * Caller tự trả 422 `material-not-found` với id đầu tiên thiếu — một câu
 * select duy nhất cho cả list, không query per-id.
 */
export async function findExistingMaterialIds(
	db: Db,
	orgId: string,
	ids: string[],
): Promise<Set<string>> {
	if (ids.length === 0) return new Set();
	const rows = await db
		.select({ id: material.id })
		.from(material)
		.where(and(eq(material.orgId, orgId), inArray(material.id, ids)));
	return new Set(rows.map((row) => row.id));
}
