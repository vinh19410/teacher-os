import {
	isMaterialKind,
	type SyllabusBankMaterialRef,
} from "@teacher-os/api/material-contracts";
import { lesson } from "@teacher-os/db/schema/lesson";
import {
	material,
	syllabusLessonMaterial,
} from "@teacher-os/db/schema/material";
import { syllabusLesson, syllabusModule } from "@teacher-os/db/schema/syllabus";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";

import type { Db } from "../app";
import { findClassCurriculum } from "./syllabus-curriculum";

/**
 * Tài liệu ngân hàng ứng với một buổi dạy của lớp có giáo trình copy (#655):
 * resolve bài học theo vị trí buổi N ↔ bài N rồi lấy links của bài đó.
 */

/**
 * Đếm chỉ số buổi học (1-based) cho từng ngày có dòng `lesson` của lớp:
 * nhóm `holiday` toàn phần không chiếm số (TOS-11 I4); các nhóm còn lại
 * (kể cả `cancelled`) vẫn chiếm số theo thứ tự ngày tăng dần.
 */
function buildTeachingDateIndexMap(
	rows: Array<{ date: string | null; status: string }>,
): Map<string, number> {
	const byDate = new Map<string, { status: string }[]>();
	for (const row of rows) {
		if (row.date === null) continue;
		const bucket = byDate.get(row.date);
		if (bucket) bucket.push(row);
		else byDate.set(row.date, [row]);
	}
	const indexByDate = new Map<string, number>();
	let teachingIndex = 0;
	for (const date of [...byDate.keys()].sort()) {
		const bucket = byDate.get(date) ?? [];
		if (bucket.length > 0 && bucket.every((row) => row.status === "holiday")) {
			continue;
		}
		teachingIndex += 1;
		indexByDate.set(date, teachingIndex);
	}
	return indexByDate;
}

export interface ClassCurriculumSessionEntry {
	moduleId: string;
	moduleTitle: string;
	syllabusLessonId: string;
	title: string;
	objectives: string;
	kind: string;
	bankMaterialIds: string[];
}

export interface ClassCurriculumSummary {
	syllabus: {
		name: string;
		description: string;
		modules: Array<{ id: string; title: string; description: string }>;
	} | null;
	byDate: Map<string, ClassCurriculumSessionEntry>;
}

/**
 * Tải một lần cấu trúc giáo trình của lớp + ánh xạ theo ngày buổi học
 * (buổi N ↔ bài N, không N+1) phục vụ cổng học viên. Whitelist trường
 * student-safe: tuyệt đối không chiếu ghi chú nội bộ (`syllabusLesson.materials`)
 * hay trạng thái nội bộ (`syllabusLesson.status`).
 */
export async function loadClassCurriculumSummary(
	db: Db,
	orgId: string,
	classId: string,
): Promise<ClassCurriculumSummary> {
	const copy = await findClassCurriculum(db, classId, orgId);
	if (!copy) return { syllabus: null, byDate: new Map() };

	const [modules, datedLessons] = await Promise.all([
		db
			.select({
				id: syllabusModule.id,
				title: syllabusModule.title,
				description: syllabusModule.description,
			})
			.from(syllabusModule)
			.where(
				and(
					eq(syllabusModule.syllabusId, copy.id),
					eq(syllabusModule.orgId, orgId),
				),
			)
			.orderBy(asc(syllabusModule.position), asc(syllabusModule.createdAt)),
		db
			.select({ date: lesson.date, status: lesson.status })
			.from(lesson)
			.where(
				and(
					eq(lesson.orgId, orgId),
					eq(lesson.classId, classId),
					isNotNull(lesson.date),
				),
			),
	]);

	const summarySyllabus = {
		name: copy.name,
		description: copy.description,
		modules,
	};
	if (modules.length === 0) {
		return { syllabus: summarySyllabus, byDate: new Map() };
	}

	const lessonRows = await db
		.select({
			id: syllabusLesson.id,
			moduleId: syllabusLesson.moduleId,
			title: syllabusLesson.title,
			objectives: syllabusLesson.objectives,
			kind: syllabusLesson.kind,
		})
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
		.orderBy(asc(syllabusLesson.position), asc(syllabusLesson.createdAt));

	const lessonIds = lessonRows.map((row) => row.id);
	const linkRows =
		lessonIds.length > 0
			? await db
					.select({
						syllabusLessonId: syllabusLessonMaterial.syllabusLessonId,
						materialId: syllabusLessonMaterial.materialId,
					})
					.from(syllabusLessonMaterial)
					.where(
						and(
							eq(syllabusLessonMaterial.orgId, orgId),
							inArray(syllabusLessonMaterial.syllabusLessonId, lessonIds),
						),
					)
					.orderBy(
						asc(syllabusLessonMaterial.position),
						asc(syllabusLessonMaterial.createdAt),
					)
			: [];

	const materialIdsByLesson = new Map<string, string[]>();
	for (const link of linkRows) {
		const list = materialIdsByLesson.get(link.syllabusLessonId) ?? [];
		list.push(link.materialId);
		materialIdsByLesson.set(link.syllabusLessonId, list);
	}

	const byModule = new Map<string, typeof lessonRows>();
	for (const row of lessonRows) {
		const list = byModule.get(row.moduleId) ?? [];
		list.push(row);
		byModule.set(row.moduleId, list);
	}
	const flat: Array<{
		moduleId: string;
		moduleTitle: string;
		row: (typeof lessonRows)[number];
	}> = [];
	for (const mod of modules) {
		for (const row of byModule.get(mod.id) ?? []) {
			flat.push({ moduleId: mod.id, moduleTitle: mod.title, row });
		}
	}

	const indexByDate = buildTeachingDateIndexMap(datedLessons);
	const byDate = new Map<string, ClassCurriculumSessionEntry>();
	for (const [date, teachingIndex] of indexByDate) {
		const matched = flat[teachingIndex - 1];
		if (!matched) continue;
		byDate.set(date, {
			moduleId: matched.moduleId,
			moduleTitle: matched.moduleTitle,
			syllabusLessonId: matched.row.id,
			title: matched.row.title,
			objectives: matched.row.objectives,
			kind: matched.row.kind,
			bankMaterialIds: materialIdsByLesson.get(matched.row.id) ?? [],
		});
	}

	return { syllabus: summarySyllabus, byDate };
}

/**
 * Bài học ứng với buổi `dateISO`: buổi N ↔ bài N theo ĐÚNG định nghĩa index
 * của tab Lịch học (apps/web `buildClassSessionsV2`, TOS-11 I4) — chronology
 * là sort tăng dần các distinct date của dòng `lesson` hiện hành, nhóm
 * `holiday` ("Nghỉ lễ — Đã dời lịch") không chiếm số, các nhóm còn lại kể cả
 * `cancelled` vẫn chiếm số như khi topic tự syllabus được hiển thị. Không dùng
 * skeleton từ schedule vì buổi có thể đã bị dời ngày (occurrence edit).
 *
 * Trả `null` khi lớp không có giáo trình copy, ngày không thuộc lịch hiện
 * hành (không có dòng lesson), hoặc là nhóm holiday (buổi không ánh xạ bài).
 */
async function findCurriculumLessonForDate(
	db: Db,
	orgId: string,
	classId: string,
	dateISO: string,
): Promise<typeof syllabusLesson.$inferSelect | null> {
	// Bản copy quyết định (syllabus.class_id là nguồn sự thật, pointer
	// `class.syllabus_id` chỉ là cột suy ra) — cùng quy ước findClassCurriculum.
	const copy = await findClassCurriculum(db, classId, orgId);
	if (!copy) return null;

	const rows = await db
		.select({ date: lesson.date, status: lesson.status })
		.from(lesson)
		.where(
			and(
				eq(lesson.orgId, orgId),
				eq(lesson.classId, classId),
				isNotNull(lesson.date),
			),
		);
	const indexByDate = buildTeachingDateIndexMap(rows);
	const teachingIndex = indexByDate.get(dateISO);
	if (teachingIndex === undefined) return null;

	// Cây giáo trình theo (module position, lesson position) — cùng thứ tự
	// build tree của snapshot (modulesBySyllabus/lessonsByModule).
	const modules = await db
		.select({ id: syllabusModule.id })
		.from(syllabusModule)
		.where(
			and(
				eq(syllabusModule.syllabusId, copy.id),
				eq(syllabusModule.orgId, orgId),
			),
		)
		.orderBy(asc(syllabusModule.position), asc(syllabusModule.createdAt));
	if (modules.length === 0) return null;
	const lessonRows = await db
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
		.orderBy(asc(syllabusLesson.position), asc(syllabusLesson.createdAt));
	const byModule = new Map<string, typeof lessonRows>();
	for (const row of lessonRows) {
		const list = byModule.get(row.moduleId) ?? [];
		list.push(row);
		byModule.set(row.moduleId, list);
	}
	const flat = modules.flatMap((m) => byModule.get(m.id) ?? []);
	return flat[teachingIndex - 1] ?? null;
}

/**
 * Tài liệu ngân hàng của buổi dạy suy từ giáo trình của lớp (#655) — cùng
 * mapping buổi N ↔ bài N với topic trên tab Lịch học. Projection teacher-safe
 * (`SyllabusBankMaterialRef`): KHÔNG có objectKey/createdBy/folderId/
 * usageCount, sort theo link position.
 *
 * Trả [] khi: lớp không có giáo trình copy, không xác định được index (ngày
 * ngoài lịch hiện hành / nhóm holiday), index vượt số bài, hoặc bài không có
 * links. Caller (GET sessions materials) tự dedupe với tài liệu direct của
 * buổi — direct ưu tiên.
 */
export async function resolveCurriculumMaterials(
	db: Db,
	orgId: string,
	classId: string,
	dateISO: string,
): Promise<SyllabusBankMaterialRef[]> {
	const lessonRow = await findCurriculumLessonForDate(
		db,
		orgId,
		classId,
		dateISO,
	);
	if (!lessonRow) return [];
	const rows = await db
		.select({
			id: material.id,
			title: material.title,
			description: material.description,
			kind: material.kind,
			url: material.url,
			mimeType: material.mimeType,
			sizeBytes: material.sizeBytes,
			originalName: material.originalName,
			position: syllabusLessonMaterial.position,
		})
		.from(syllabusLessonMaterial)
		.innerJoin(
			material,
			and(
				eq(material.id, syllabusLessonMaterial.materialId),
				eq(material.orgId, orgId),
			),
		)
		.where(
			and(
				eq(syllabusLessonMaterial.orgId, orgId),
				eq(syllabusLessonMaterial.syllabusLessonId, lessonRow.id),
			),
		)
		.orderBy(
			asc(syllabusLessonMaterial.position),
			asc(syllabusLessonMaterial.createdAt),
		);
	return rows.map((row) => ({
		...row,
		// Cột kind là text tự do — guard cùng quy ước toMaterialView.
		kind: (isMaterialKind(row.kind)
			? row.kind
			: "file") as SyllabusBankMaterialRef["kind"],
	}));
}
