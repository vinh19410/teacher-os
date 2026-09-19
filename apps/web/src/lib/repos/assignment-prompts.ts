import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { AssignmentPrompt } from "@/lib/mock-data";

/** Field-for-field projection of the prompt bank (#202). */
export function mapAssignmentPrompts(
	snapshot: KernelSnapshot,
): AssignmentPrompt[] {
	return snapshot.assignmentPrompts.map((row) => ({
		id: row.id,
		task: row.task,
		genre: row.genre,
		title: row.title,
		band: row.band,
		source: row.source,
		prompt: row.prompt,
		note: row.note,
		status: row.status === "ready" ? "ready" : "draft",
		createdAt: row.createdAt,
	}));
}
