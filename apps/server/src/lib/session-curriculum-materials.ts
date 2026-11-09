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
	// Occurrence identity (#98): mọi dòng cùng (classId, date) là một buổi.
	const byDate = new Map<string, { status: string }[]>();
	for (const row of rows) {
		if (row.date === null) continue;
		const bucket = byDate.get(row.date);
		if (bucket) bucket.push(row);
		else byDate.set(row.date, [row]);
	}
	const target = byDate.get(dateISO);
	if (!target) return null;
	// Nhóm holiday toàn phần không chiếm số buổi (I4) — không ánh xạ bài.
	if (target.length > 0 && target.every((row) => row.status === "holiday")) {
		return null;
	}
	let teachingIndex = 0;
	for (const date of [...byDate.keys()].sort()) {
		const bucket = byDate.get(date) ?? [];
		if (bucket.length > 0 && bucket.every((row) => row.status === "holiday")) {
			continue;
		}
		teachingIndex += 1;
		if (date === dateISO) break;
	}

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
