import {
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentSkill,
	type AssignmentTestPartsSet,
	type KernelAssignmentTestRow,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import type { ComposerValue } from "@/components/assignments/prompt-composer";
import type { AssignmentPrompt } from "@/lib/mock-data";

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

/**
 * PUT /tests/:id/parts payload (phase-03 Task 3.5): slots theo THỨ TỰ
 * preset của skill — thứ tự mảng chính là position 0,1,2… trên server.
 * `assignedByPart` chỉ chứa slot đã gán prompt (replace-all: slot trống
 * rơi khỏi mảng). qStartOverride giữ nguyên giá trị hiện có khi part còn
 * được gán lại.
 */
export function partsSetPayload(
	skill: string,
	assignedByPart: Record<string, string | null>,
	overridesByPart: Record<string, number | null> = {},
): AssignmentTestPartsSet {
	const preset = ASSIGNMENT_TEST_PRESETS[skill as AssignmentSkill];
	const slots = preset?.slots ?? [];
	return slots
		.filter((slot) => assignedByPart[slot.part])
		.map((slot) => {
			const item: AssignmentTestPartsSet[number] = {
				part: slot.part,
				promptId: assignedByPart[slot.part] as string,
			};
			const override = overridesByPart[slot.part];
			if (override != null) item.qStartOverride = override;
			return item;
		});
}

/** Distinct collection names cho datalist header form (bỏ trống, giữ thứ tự xuất hiện). */
export function collectionOptions(tests: KernelAssignmentTestRow[]): string[] {
	const seen = new Set<string>();
	for (const test of tests) {
		const name = test.collection?.trim();
		if (name) seen.add(name);
	}
	return [...seen];
}

/** Distinct group names cho datalist header form (bỏ trống, giữ thứ tự xuất hiện). */
export function groupOptions(tests: KernelAssignmentTestRow[]): string[] {
	const seen = new Set<string>();
	for (const test of tests) {
		const name = test.testGroup?.trim();
		if (name) seen.add(name);
	}
	return [...seen];
}

/**
 * Bridge bank prompt → ComposerValue cho composer nhúng lockPart (nút
 * "Chỉnh sửa" của slot). Legacy rows fallback task/genre như trang ngân
 * hàng; mọi field nullable collapse về "" để composer không thấy hole.
 */
export function composerFromPrompt(prompt: AssignmentPrompt): ComposerValue {
	return {
		skill: (prompt.skill ?? "writing") as string,
		part: prompt.part ?? prompt.task,
		type: prompt.type ?? prompt.genre,
		title: prompt.title,
		band: prompt.band,
		source: prompt.source,
		prompt: prompt.prompt,
		passage: prompt.passage ?? "",
		intro: prompt.intro ?? "",
		transcript: prompt.transcript ?? "",
		cueTopic: prompt.cueTopic ?? "",
		cuePoints: prompt.cuePoints ?? "",
		audioName: prompt.audioName ?? "",
		imageUrl: prompt.imageUrl ?? "",
		optionBank: prompt.optionBank ?? [],
		note: prompt.note,
		items: (prompt.questions ?? []).map((question) => ({
			stem: question.stem,
			opts: question.opts ?? null,
			answer: question.answer,
			alts: question.alts ?? "",
			pin: question.pin ?? null,
		})),
	};
}
