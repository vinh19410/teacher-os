import { classSession } from "@teacher-os/db/schema/class-session";
import { and, eq } from "drizzle-orm";
import type { Db } from "../app";

/**
 * Predicate determining if a class is in "manual sessions" mode (issue #649).
 *
 * A class is manual if:
 * - It has no syllabus attached (`!syllabusId`), AND
 * - Either its `schedulingMode` is explicitly "manual", OR
 *   it already has >= 1 `class_session` row.
 *
 * All other classes (classes with syllabus or legacy auto-scheduled classes)
 * return false, preserving their schedule generation and tuition packages.
 */
export async function isManualClass(
	db: Db,
	orgId: string,
	classId: string,
	syllabusId: string | null | undefined,
	schedulingMode?: string | null,
): Promise<boolean> {
	if (syllabusId) return false;
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
