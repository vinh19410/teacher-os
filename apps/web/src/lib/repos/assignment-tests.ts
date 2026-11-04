import {
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentQuestion,
	type AssignmentSkill,
	type AssignmentTestPartsSet,
	type KernelAssignmentTestRow,
	type KernelSnapshot,
} from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import type { ComposerValue } from "@/components/assignments/prompt-composer";
import type { AssignmentPrompt } from "@/lib/mock-data";
import { normalizeLegacyRichText } from "@/lib/rich-text-legacy";
import type { TestAnswerDiffRow } from "@/lib/test-answer-key";

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
	// Bank rows may be legacy plain text — the editor load must go through the
	// legacy adapter or their newlines collapse and vanish on the next save.
	return {
		skill: (prompt.skill ?? "writing") as string,
		part: prompt.part ?? prompt.task,
		type: prompt.type ?? prompt.genre,
		title: prompt.title,
		band: prompt.band,
		source: prompt.source,
		prompt: normalizeLegacyRichText(prompt.prompt ?? ""),
		passage: normalizeLegacyRichText(prompt.passage ?? ""),
		intro: normalizeLegacyRichText(prompt.intro ?? ""),
		transcript: normalizeLegacyRichText(prompt.transcript ?? ""),
		cueTopic: prompt.cueTopic ?? "",
		cuePoints: prompt.cuePoints ?? "",
		audioName: prompt.audioName ?? "",
		imageUrl: prompt.imageUrl ?? "",
		optionBank: prompt.optionBank ?? [],
		note: normalizeLegacyRichText(prompt.note ?? ""),
		items: (prompt.questions ?? []).map((question) => ({
			stem: question.stem,
			opts: question.opts ?? null,
			answer: question.answer,
			alts: question.alts ?? "",
			// Per-question type (#286) — bridge giữ nguyên để edit/Apply qua
			// test-builder không xoá type đã soạn của đề trộn dạng.
			type: question.type ?? null,
			pin: question.pin ?? null,
			...(typeof question.explanation === "string" &&
			!isEmptyRichText(question.explanation)
				? { explanation: normalizeLegacyRichText(question.explanation) }
				: {}),
			...(typeof question.answerSet === "string" &&
			question.answerSet.trim().length > 0
				? { answerSet: question.answerSet }
				: {}),
		})),
	};
}

/**
 * Apply answer key (phase-05 Task 5.3) — slot part có prompt gán, nguồn
 * questions là snapshot (panel không fetch riêng). Số câu tuyệt đối =
 * `qStart + index` từ computeTestRanges — mọi lookup theo number, không
 * bao giờ theo vị trí trong part.
 */
export interface AnswerKeyApplySlot {
	part: string;
	promptId: string;
	qStart: number;
	questions: AssignmentQuestion[];
}

export interface AnswerKeyPartChange {
	part: string;
	promptId: string;
	/** Số câu (tuyệt đối) sẽ bị ghi đè answer/alts. */
	numbers: number[];
	/** Questions mới: giữ nguyên stem/opts/pin, chỉ thay answer + alts
	 * (alts là chuỗi join " / " — cùng shape prompt đang lưu). */
	questions: AssignmentQuestion[];
}

/**
 * Diff → thay đổi theo part. CHỈ câu `mismatch` được ghi (câu match giữ
 * nguyên, không ghi lại — chống đè mất alts đang có); part không còn câu
 * lệch rơi khỏi kết quả. Part-local index không bao giờ dùng làm số câu.
 */
export function answerKeyPartChanges(
	diffs: TestAnswerDiffRow[],
	slots: AnswerKeyApplySlot[],
): AnswerKeyPartChange[] {
	const expectedByNumber = new Map<number, { answer: string; alts: string }>();
	for (const row of diffs) {
		if (row.status === "mismatch" && row.expected)
			expectedByNumber.set(row.number, row.expected);
	}
	const changes: AnswerKeyPartChange[] = [];
	for (const slot of slots) {
		const numbers: number[] = [];
		const questions = slot.questions.map((question, index) => {
			const expected = expectedByNumber.get(slot.qStart + index);
			if (!expected) return question;
			numbers.push(slot.qStart + index);
			return { ...question, answer: expected.answer, alts: expected.alts };
		});
		if (numbers.length > 0)
			changes.push({
				part: slot.part,
				promptId: slot.promptId,
				numbers,
				questions,
			});
	}
	return changes;
}

export interface AnswerKeyApplyOutcome {
	appliedParts: number;
	appliedQuestions: number;
	/** Part lỗi khiến vòng dừng — null = ghi hết. */
	failedPart: string | null;
}

/**
 * Ghi key tuần tự từng part qua PATCH prompt (phase-2 route, org-scoped).
 * Part lỗi → DỪNG, KHÔNG rollback part đã ghi (idempotent: chạy lại Apply
 * chỉ đụng câu còn lệch — compare sau ghi ra 0 mismatch thì 0 PATCH).
 * `patch` resolve false = part đó chưa ghi được.
 */
export async function runAnswerKeyApply(
	changes: AnswerKeyPartChange[],
	patch: (change: AnswerKeyPartChange) => Promise<boolean>,
): Promise<AnswerKeyApplyOutcome> {
	let appliedParts = 0;
	let appliedQuestions = 0;
	for (const change of changes) {
		const ok = await patch(change);
		if (!ok) return { appliedParts, appliedQuestions, failedPart: change.part };
		appliedParts += 1;
		appliedQuestions += change.numbers.length;
	}
	return { appliedParts, appliedQuestions, failedPart: null };
}
