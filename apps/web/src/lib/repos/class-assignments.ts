import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { ClassAssignment } from "@/lib/mock-data";

/** Field-for-field projection of class assignments (#208); targets embedded
 * server-side, `submittedAt` stays null until a write-path exists. */
export function mapClassAssignments(
	snapshot: KernelSnapshot,
): ClassAssignment[] {
	return snapshot.classAssignments.map((row) => ({
		id: row.id,
		classId: row.classId,
		promptId: row.promptId,
		title: row.title,
		due: row.due,
		note: row.note,
		createdAt: row.createdAt,
		targets: row.targets.map((target) => ({
			studentId: target.studentId,
			submittedAt: target.submittedAt ?? null,
		})),
	}));
}
