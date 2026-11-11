import { classSession } from "@teacher-os/db/schema/class-session";
import { and, eq } from "drizzle-orm";
import type { Db } from "../app";
import { findClassCurriculum } from "./syllabus-curriculum";

/**
 * Predicate determining if a class is in "manual sessions" mode (issue #649, #670).
 *
 * A class is manual if:
 * - It has no class curriculum copy attached (`syllabus.class_id = classId`, #394), AND
 * - Either its `schedulingMode` is explicitly "manual", OR
 *   it already has >= 1 `class_session` row.
 *
 * All other classes (classes with an attached curriculum copy or legacy auto-scheduled
 * classes) return false, preserving their schedule generation and tuition packages.
 */
export async function isManualClass(
	db: Db,
	orgId: string,
	classId: string,
	_syllabusId?: string | null,
	schedulingMode?: string | null,
): Promise<boolean> {
	const copy = await findClassCurriculum(db, classId, orgId);
	if (copy) return false;
	if (schedulingMode === "manual") return true;
	const [hasCs] = await db
		.select({ id: classSession.id })
		.from(classSession)
		.where(
			and(eq(classSession.orgId, orgId), eq(classSession.classId, classId)),
		)
		.limit(1);

	return Boolean(hasCs);
}
