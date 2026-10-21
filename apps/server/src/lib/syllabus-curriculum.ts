import { classTable } from "@teacher-os/db/schema/class";
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
 * Deep-copy batch of a template tree into a class copy (issue #79).
 * All ids are generated before the batch so the copy is wired with fresh
 * UUIDs; every lesson status resets to `upcoming` (status is per-class
 * progress, not template content); positions are preserved. Callers own
 * the org + template checks and the class pointer statement.
 */
export function buildImportBatch(
	db: Db,
	input: {
		template: typeof syllabus.$inferSelect;
		modules: (typeof syllabusModule.$inferSelect)[];
		lessons: (typeof syllabusLesson.$inferSelect)[];
		classId: string;
		orgId: string;
	},
): {
	copyId: string;
	statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];
} {
	const { template, classId, orgId } = input;
	const copyId = crypto.randomUUID();
	const moduleIds = new Map(
		input.modules.map((m) => [m.id, crypto.randomUUID()]),
	);
	const lessonIds = new Map(
		input.lessons.map((l) => [l.id, crypto.randomUUID()]),
	);
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
		...input.modules.map((m) =>
			db.insert(syllabusModule).values({
				id: moduleIds.get(m.id) as string,
				orgId,
				syllabusId: copyId,
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
				// kind là nội dung giáo trình — copy giữ nguyên (status
				// là tiến độ per-lớp, reset upcoming ở dưới).
				kind: l.kind,
				status: "upcoming",
				position: l.position,
				createdAt: l.createdAt,
			}),
		),
	];
	return { copyId, statements };
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
		.orderBy(asc(syllabusModule.position));
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
				.orderBy(asc(syllabusLesson.position))
		: [];
	return { modules, lessons };
}
