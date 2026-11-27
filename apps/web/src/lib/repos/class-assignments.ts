import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { ClassAssignment } from "@/lib/mock-data";

/** Field-for-field projection of class assignments (#208, #977): embedded
 * targets carry derived submission timestamps, grading band, and auto-graded
 * objective score counts from `/api/kernel`. */
export function mapClassAssignments(
	snapshot: KernelSnapshot,
): ClassAssignment[] {
	return snapshot.classAssignments.map((row) => ({
		id: row.id,
		classId: row.classId,
		promptId: row.promptId,
		title: row.title,
		due: row.due,
		dueAt: row.dueAt ?? null,
		sessionDate: row.sessionDate ?? null,
		...(row.targetScope ? { targetScope: row.targetScope } : {}),
		...(typeof row.hasGradableTask === "boolean"
			? { hasGradableTask: row.hasGradableTask }
			: {}),
		note: row.note,
		createdAt: row.createdAt,
		targets: row.targets.map((target) => ({
			studentId: target.studentId,
			submittedAt: target.submittedAt ?? null,
			attemptId: target.attemptId ?? null,
			gradedAt: target.gradedAt ?? null,
			band: target.band ?? null,
			correctCount: target.correctCount ?? null,
			totalQuestions: target.totalQuestions ?? null,
		})),
	}));
}
