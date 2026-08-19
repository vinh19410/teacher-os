/**
 * Org-scoped kernel snapshot loader — shared by the kernel routes and the
 * assignments sub-router (kept in its own module to avoid a circular import
 * between the two route files).
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { assignment } from "@teacher-os/db/schema/assignment";
import { classTable } from "@teacher-os/db/schema/class";
import { enrollment } from "@teacher-os/db/schema/enrollment";
import { sessionPackage } from "@teacher-os/db/schema/session-package";
import { student } from "@teacher-os/db/schema/student";
import {
	syllabus,
	syllabusLesson,
	syllabusModule,
} from "@teacher-os/db/schema/syllabus";
import { asc, eq } from "drizzle-orm";
import type { Db } from "../app";

/** Shared by the kernel routes and the assignments sub-router. */
export async function loadSnapshot(
	db: Db,
	orgId: string,
): Promise<KernelSnapshot> {
	const [
		studentRows,
		classRows,
		enrollmentRows,
		packageRows,
		syllabusRows,
		moduleRows,
		lessonRows,
		assignmentRows,
	] = await Promise.all([
		db
			.select()
			.from(student)
			.where(eq(student.orgId, orgId))
			.orderBy(asc(student.createdAt)),
		db
			.select()
			.from(classTable)
			.where(eq(classTable.orgId, orgId))
			.orderBy(asc(classTable.createdAt)),
		db
			.select()
			.from(enrollment)
			.where(eq(enrollment.orgId, orgId))
			.orderBy(asc(enrollment.createdAt)),
		db
			.select({
				id: sessionPackage.id,
				enrollmentId: sessionPackage.enrollmentId,
				classId: enrollment.classId,
				studentId: enrollment.studentId,
				total: sessionPackage.total,
				price: sessionPackage.price,
				mode: sessionPackage.mode,
				start: sessionPackage.start,
				expiry: sessionPackage.expiry,
				status: sessionPackage.status,
				createdAt: sessionPackage.createdAt,
			})
			.from(sessionPackage)
			.innerJoin(enrollment, eq(sessionPackage.enrollmentId, enrollment.id))
			.where(eq(sessionPackage.orgId, orgId))
			.orderBy(asc(sessionPackage.createdAt)),
		db
			.select()
			.from(syllabus)
			.where(eq(syllabus.orgId, orgId))
			.orderBy(asc(syllabus.createdAt)),
		db
			.select()
			.from(syllabusModule)
			.where(eq(syllabusModule.orgId, orgId))
			.orderBy(asc(syllabusModule.position), asc(syllabusModule.createdAt)),
		db
			.select()
			.from(syllabusLesson)
			.where(eq(syllabusLesson.orgId, orgId))
			.orderBy(asc(syllabusLesson.position), asc(syllabusLesson.createdAt)),
		db
			.select()
			.from(assignment)
			.where(eq(assignment.orgId, orgId))
			.orderBy(asc(assignment.createdAt)),
	]);

	const lessonsByModule = new Map<
		string,
		KernelSnapshot["syllabi"][number]["modules"][number]["lessons"]
	>();
	for (const lesson of lessonRows) {
		const list = lessonsByModule.get(lesson.moduleId) ?? [];
		list.push({
			id: lesson.id,
			title: lesson.title,
			objectives: lesson.objectives,
			materials: lesson.materials,
			status: lesson.status,
		});
		lessonsByModule.set(lesson.moduleId, list);
	}
	const modulesBySyllabus = new Map<
		string,
		KernelSnapshot["syllabi"][number]["modules"]
	>();
	for (const mod of moduleRows) {
		const list = modulesBySyllabus.get(mod.syllabusId) ?? [];
		list.push({
			id: mod.id,
			title: mod.title,
			description: mod.description,
			lessons: lessonsByModule.get(mod.id) ?? [],
		});
		modulesBySyllabus.set(mod.syllabusId, list);
	}

	return {
		students: studentRows.map((row) => ({
			id: row.id,
			name: row.name,
			phone: row.phone,
			zalo: row.zalo,
			parentName: row.parentName,
			parentPhone: row.parentPhone,
		})),
		classes: classRows.map((row) => ({
			id: row.id,
			name: row.name,
			level: row.level,
			skill: row.skill,
			mode: row.mode,
			syllabusId: row.syllabusId,
			schedule: row.schedule,
			sessionsTotal: row.sessionsTotal,
			sessionsDone: row.sessionsDone,
			status: row.status,
			startDate: row.startDate,
			notes: row.notes,
		})),
		enrollments: enrollmentRows.map((row) => ({
			id: row.id,
			classId: row.classId,
			studentId: row.studentId,
			createdAt: row.createdAt.toISOString(),
		})),
		packages: packageRows.map((row) => ({
			id: row.id,
			enrollmentId: row.enrollmentId,
			classId: row.classId,
			studentId: row.studentId,
			total: row.total,
			price: row.price,
			mode: row.mode,
			start: row.start,
			expiry: row.expiry,
			status: row.status,
			createdAt: row.createdAt.toISOString(),
		})),
		syllabi: syllabusRows.map((row) => ({
			id: row.id,
			name: row.name,
			level: row.level,
			skill: row.skill,
			description: row.description,
			totalLessons: row.totalLessons,
			modules: modulesBySyllabus.get(row.id) ?? [],
		})),
		assignments: assignmentRows.map((row) => ({
			id: row.id,
			studentId: row.studentId,
			title: row.title,
			type: row.type,
			due: row.due,
			status: row.status,
			scores: row.scores,
		})),
	};
}
