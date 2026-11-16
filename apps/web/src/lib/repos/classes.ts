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
 * reducer did. #56: `sessionsDone` derives from real completed lesson rows —
 * the generator emits `sessionsTotal` rows PER ENROLLMENT, so delivered
 * sessions = max completed-row count across the class's enrollments. Weekly
 * recurrence counts every session (12 rows over 2 slots → 12) and a 1:2
 * class (one row per enrollment per session) never double-counts. Known
 * lower-bound: interleaved 1:2 attendance (each student missing different
 * sessions) under-reports — an exact occurrence-union needs a date column on
 * lessons. The stored class column is no longer read.
 */
export function mapClasses(snapshot: KernelSnapshot): ClassGroup[] {
	const activeRosterByClass = new Map<string, string[]>();
	const invitedRosterByClass = new Map<string, string[]>();
	for (const row of snapshot.enrollments) {
		if (row.status === "invited") {
			const list = invitedRosterByClass.get(row.classId) ?? [];
			list.push(row.studentId);
			invitedRosterByClass.set(row.classId, list);
		} else {
			const list = activeRosterByClass.get(row.classId) ?? [];
			list.push(row.studentId);
			activeRosterByClass.set(row.classId, list);
		}
	}

	const completedByClass = new Map<string, Map<string, number>>();
	for (const row of snapshot.lessons) {
		if (row.status !== "completed") continue;
		const perEnrollment =
			completedByClass.get(row.classId) ?? new Map<string, number>();
		perEnrollment.set(
			row.enrollmentId,
			(perEnrollment.get(row.enrollmentId) ?? 0) + 1,
		);
		completedByClass.set(row.classId, perEnrollment);
	}

	const maxCompleted = (classId: string): number => {
		const perEnrollment = completedByClass.get(classId);
		if (!perEnrollment) return 0;
		return Math.max(0, ...perEnrollment.values());
	};

	return snapshot.classes.map((row) => ({
		id: row.id,
		name: row.name,
		level: row.level,
		type: row.type,
		skills: row.skills,
		mode: row.mode,
		syllabusId: row.syllabusId ?? "",
		studentIds: activeRosterByClass.get(row.id) ?? [],
		invitedStudentIds: invitedRosterByClass.get(row.id) ?? [],
		schedule: row.schedule,
		sessionsDone: maxCompleted(row.id),
		sessionsTotal: row.sessionsTotal,
		status: row.status === "paused" ? "paused" : "active",
		startDate: row.startDate,
		tuitionFee: row.tuitionFee ?? null,
		notes: row.notes,
		schedulingMode: row.schedulingMode ?? "auto",
	}));
}
