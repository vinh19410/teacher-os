/**
 * Classes read repo (Wave 3) — owns the kernel→display mapping for the
 * classes module. Roster (`ClassGroup.studentIds`) derives from enrollments,
 * never a stored id list (invariant 4). Pure by design: no provider import
 * here, so unit tests stay independent of the env-validated runtime.
 * Selection lives in repos/use-classes.ts; writes stay on the Wave 0
 * command bus.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { ClassGroup } from "@/lib/mock-data";

/**
 * Map kernel class rows to the display shape. `studentIds` comes from the
 * org's enrollments; an unassigned syllabus (null) maps to "" like the
 * reducer did. `sessionsDone` stays the stored value until Wave 4 derives
 * it from completed lessons.
 */
export function mapClasses(snapshot: KernelSnapshot): ClassGroup[] {
	const rosterByClass = new Map<string, string[]>();
	for (const row of snapshot.enrollments) {
		const list = rosterByClass.get(row.classId) ?? [];
		list.push(row.studentId);
		rosterByClass.set(row.classId, list);
	}

	return snapshot.classes.map((row) => ({
		id: row.id,
		name: row.name,
		level: row.level,
		skill: row.skill,
		mode: row.mode,
		syllabusId: row.syllabusId ?? "",
		studentIds: rosterByClass.get(row.id) ?? [],
		schedule: row.schedule,
		sessionsDone: row.sessionsDone,
		sessionsTotal: row.sessionsTotal,
		status: row.status,
		startDate: row.startDate,
		notes: row.notes,
	}));
}
