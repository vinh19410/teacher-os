import type {
	KernelAssignmentTestRow,
	KernelSnapshot,
} from "@teacher-os/api/contracts";

/**
 * Full-test builder (phase-02): field-for-field projection của snapshot
 * `assignmentTests` — defensive theo style mapAssignmentPrompts: thiếu key
 * (server cũ/corrupt) collapse về `[]`/null thay vì undefined để UI không
 * bao giờ thấy hole; status lạ collapse "draft" (honest UI default).
 */
export function mapAssignmentTests(
	snapshot: KernelSnapshot,
): KernelAssignmentTestRow[] {
	return (snapshot.assignmentTests ?? []).map((row) => ({
		id: row.id,
		title: row.title,
		description: row.description ?? null,
		skill: row.skill,
		timeLimitSeconds: row.timeLimitSeconds ?? null,
		collection: row.collection ?? null,
		testGroup: row.testGroup ?? null,
		status: row.status === "ready" ? "ready" : "draft",
		parts: (row.parts ?? []).map((part) => ({
			testId: part.testId,
			promptId: part.promptId,
			part: part.part,
			position: part.position,
			qStartOverride: part.qStartOverride ?? null,
		})),
	}));
}
