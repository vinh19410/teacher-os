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
 * reducer did. Wave 4: `sessionsDone` derives from completed lessons —
 * distinct (day,time) pairs per class so a 1:2 session (one row per
 * enrollment) counts as one delivered session (invariant 7); the stored
 * class column is no longer read.
 */
export function mapClasses(snapshot: KernelSnapshot): ClassGroup[] {
	const rosterByClass = new Map<string, string[]>();
	for (const row of snapshot.enrollments) {
		const list = rosterByClass.get(row.classId) ?? [];
		list.push(row.studentId);
		rosterByClass.set(row.classId, list);
	}

	const sessionsByClass = new Map<string, Set<string>>();
	for (const row of snapshot.lessons) {
		if (row.status !== "completed") continue;
		const sessions = sessionsByClass.get(row.classId) ?? new Set<string>();
		sessions.add(`${row.day}|${row.time}`);
		sessionsByClass.set(row.classId, sessions);
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
		sessionsDone: sessionsByClass.get(row.id)?.size ?? 0,
		sessionsTotal: row.sessionsTotal,
		status: row.status,
		startDate: row.startDate,
		notes: row.notes,
	}));
}
