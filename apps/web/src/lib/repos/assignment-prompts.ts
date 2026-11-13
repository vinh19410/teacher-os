import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { AssignmentPrompt } from "@/lib/mock-data";

/** Field-for-field projection of the prompt bank (#202). */
export function mapAssignmentPrompts(
	snapshot: KernelSnapshot,
): AssignmentPrompt[] {
	return snapshot.assignmentPrompts.map((row) => ({
		id: row.id,
		skill: row.skill,
		part: row.part,
		type: row.type,
		task: row.task,
		genre: row.genre,
		title: row.title,
		band: row.band,
		level: row.level ?? "",
		source: row.source,
		prompt: row.prompt,
		intro: row.intro,
		passage: row.passage,
		transcript: row.transcript,
		cueTopic: row.cueTopic,
		cuePoints: row.cuePoints,
		audioName: row.audioName,
		audioUrl: row.audioUrl ?? "",
		imageUrl: row.imageUrl ?? "",
		questions: row.questions,
		// Legacy rows predate option_bank — collapse to [] like imageUrl (#269).
		optionBank: row.optionBank ?? [],
		note: row.note,
		status: row.status === "ready" ? "ready" : "draft",
		writing: row.writing ?? null,
		createdAt: row.createdAt,
	}));
}
