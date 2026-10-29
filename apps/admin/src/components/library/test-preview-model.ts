import {
	type LibraryQuizViewDetail,
	libraryPartToQuizView,
	type UnsupportedGroupFlag,
} from "@teacher-os/api/lib/library-quiz-preview";
import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import type {
	LibraryPartDto,
	LibraryPartInput,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";
import { resolveEffectivePart } from "./effective-parts";
import {
	computeLibraryTestRanges,
	type PartDraft,
	type PartSlot,
	resolvePartValues,
} from "./test-outline-model";

/** Trạng thái hiển thị của một tab preview (red-team RT10/RT12). */
export type PreviewTabState =
	| "ok"
	| "saved-fallback"
	| "draft-invalid"
	| "groups-corrupt"
	| "empty";

/**
 * Một tab của overlay Xem trước. KHÔNG mang `LibraryPartInput` raw
 * (answer/alts/explanation/transcript) qua ranh giới props — input full-key
 * chỉ sống trong model này (red-team RT6; test assert `JSON.stringify`).
 */
export interface PreviewTab {
	part: string;
	label: string;
	state: PreviewTabState;
	/** Số câu đầu của tab theo CÂY ĐỀ (`resolvePartValues` đếm draft cả khi
	 * render lùi về saved — red-team RT3): `Questions qStart…`. */
	qStart: number;
	/** Số câu theo cây đề; tab `saved-fallback` có thể ≠ số câu của view. */
	questionCount: number;
	/** View render bản đã lưu thay cho bản nháp hỏng schema (RT3) — banner
	 * nêu tên part; có thể kết hợp với `corrupt` (code-review #433 Minor). */
	savedFallback: boolean;
	/** Saved DTO đang `groupsCorrupt` (server fallback `groups: []`, RT10) —
	 * độc lập với `savedFallback` để banner gom đủ cả hai lý do. */
	corrupt: boolean;
	/** Dữ liệu take screen của tab; null = không có nội dung render được. */
	view: {
		detail: LibraryQuizViewDetail;
		parts: QuizPart[];
		unsupportedGroupFlags: {
			groupLabel: string;
			flags: UnsupportedGroupFlag[];
		}[];
	} | null;
}

/**
 * Dựng danh sách tab Xem trước toàn đề: nguồn ĐẾM SỐ từ `resolvePartValues`
 * + `computeLibraryTestRanges` (cùng nguồn với cây đề `buildTestOutline` —
 * qOffset khớp `sections[].qStart` trong mọi trường hợp, kể cả draft hỏng);
 * nguồn NỘI DUNG từ `resolveEffectivePart` (một bản luật draft/saved với
 * ready overlay — kongming C4). Part `groupsCorrupt` (server fallback `[]`)
 * vẫn render dạng blob nhưng mang cờ cảnh báo riêng (RT10).
 */
export function buildTestPreview({
	skill,
	slots,
	partsBySlot,
	drafts,
	savedInputs,
}: {
	skill: LibrarySkill;
	slots: readonly PartSlot[];
	partsBySlot: ReadonlyMap<string, LibraryPartDto>;
	drafts: ReadonlyMap<string, PartDraft>;
	savedInputs?: ReadonlyMap<string, LibraryPartInput>;
}): PreviewTab[] {
	// Nguồn đếm số — giống hệt buildTestOutline.
	const resolved = resolvePartValues(skill, slots, partsBySlot, drafts);
	const ranges = computeLibraryTestRanges(
		resolved.map((entry) => ({
			part: entry.part,
			count: entry.state === "empty" ? 0 : entry.value.questions.length,
		})),
	);

	return slots.map((slot, index) => {
		const qStart = ranges[index]?.qStart ?? 1;
		const count =
			resolved[index]?.state === "empty"
				? 0
				: (resolved[index]?.value.questions.length ?? 0);
		const effective = resolveEffectivePart(
			slot.part,
			partsBySlot.get(slot.part),
			drafts.get(slot.part),
			{ savedInputs },
		);
		const savedFallback = effective.state === "saved-fallback";
		const corrupt =
			effective.input !== null &&
			(partsBySlot.get(slot.part)?.groupsCorrupt ?? false);

		let state: PreviewTabState;
		if (effective.state === "saved-fallback") state = "saved-fallback";
		else if (effective.state === "draft-invalid") state = "draft-invalid";
		else if (effective.state === "empty" || effective.input === null)
			state = "empty";
		else if (corrupt) state = "groups-corrupt";
		else state = "ok";

		const view =
			effective.input !== null
				? libraryPartToQuizView(effective.input, {
						skill,
						qOffset: qStart - 1,
					})
				: null;

		return {
			part: slot.part,
			label: slot.label,
			state,
			qStart,
			questionCount: count,
			savedFallback,
			corrupt,
			view: view
				? {
						detail: view.detail,
						parts: view.parts,
						unsupportedGroupFlags: view.unsupportedGroupFlags,
					}
				: null,
		};
	});
}
