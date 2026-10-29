import { quizTypeDisplay } from "@teacher-os/api/contracts";
import type {
	LibraryPartDto,
	LibraryQuestionGroup,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";
import { effectiveGroups } from "./group-model";
import {
	arePartValuesEqual,
	emptyPartValue,
	type PartFormValue,
	partValueFromDto,
} from "./part-form";

/**
 * Model cây đề (Task 2.3): dựng Part → Nhóm → Câu cho mọi slot của đề thư
 * viện, với đánh số FOLD theo số câu thật của các part trước (cùng cơ chế
 * `computeTestRanges` của apps/web — static `qStart` của preset bị CẤM làm
 * nguồn số vì part thật có thể 12 hoặc 15 câu).
 */

export interface OutlineQuestion {
	number: number;
	offset: number;
	hasAnswer: boolean;
}

export interface OutlineGroup {
	index: number;
	label: string;
	typeLabel: string;
	questions: OutlineQuestion[];
}

export interface OutlineSection {
	part: string;
	label: string;
	qStart: number;
	state: "empty" | "saved" | "dirty";
	groupCount: number;
	questionCount: number;
	groups: OutlineGroup[];
}

export interface PartSlot {
	part: string;
	label: string;
}

export interface PartDraft {
	dirty: boolean;
	value: PartFormValue;
}

export interface ResolvedPartValue {
	part: string;
	label: string;
	value: PartFormValue;
	state: "empty" | "saved" | "dirty";
}

/**
 * Nguồn value hiệu lực mỗi slot (mirror gate `if (draft?.dirty)` của
 * `effectiveParts` ở trang $testId): draft dirty thắng bản đã lưu; draft
 * sạch KHÔNG đè bản đã lưu; slot chưa từng mở → baseline rỗng. Slot không
 * có saved mà value đúng bằng baseline rỗng (draft sạch vừa bấm «Thêm nội
 * dung» — form bắn onDraftChange cả khi mount sạch) vẫn là `empty`.
 */
export function resolvePartValues(
	skill: LibrarySkill,
	slots: readonly PartSlot[],
	partsBySlot: ReadonlyMap<string, LibraryPartDto>,
	drafts: ReadonlyMap<string, PartDraft>,
): ResolvedPartValue[] {
	return slots.map(({ part, label }) => {
		const saved = partsBySlot.get(part);
		const draft = drafts.get(part);
		if (draft?.dirty) {
			return { part, label, value: draft.value, state: "dirty" as const };
		}
		const baseline = saved
			? partValueFromDto(saved)
			: emptyPartValue(skill, part);
		const value = draft && !saved ? draft.value : baseline;
		const state =
			!saved && arePartValuesEqual(value, baseline)
				? ("empty" as const)
				: ("saved" as const);
		return { part, label, value, state };
	});
}

export interface LibraryTestRange {
	part: string;
	qStart: number;
	count: number;
}

/**
 * Fold đánh số liên tục theo số câu THẬT của từng part (mirror
 * `computeTestRanges` của apps/web — admin không import được apps/web nên
 * replicate; part trống count 0 giữ nguyên mốc cho part sau).
 */
export function computeLibraryTestRanges(
	entries: readonly { part: string; count: number }[],
): LibraryTestRange[] {
	const ranges: LibraryTestRange[] = [];
	let next = 1;
	for (const entry of entries) {
		ranges.push({ part: entry.part, qStart: next, count: entry.count });
		next += entry.count;
	}
	return ranges;
}

/** Cây đề hoàn chỉnh: mọi slot + nhóm hiệu lực + số câu tuyệt đối. */
export function buildTestOutline(
	skill: LibrarySkill,
	slots: readonly PartSlot[],
	partsBySlot: ReadonlyMap<string, LibraryPartDto>,
	drafts: ReadonlyMap<string, PartDraft>,
): OutlineSection[] {
	const entries = resolvePartValues(skill, slots, partsBySlot, drafts);
	const ranges = computeLibraryTestRanges(
		entries.map((entry) => ({
			part: entry.part,
			count: entry.state === "empty" ? 0 : entry.value.questions.length,
		})),
	);
	return entries.map((entry, index) => {
		const qStart = ranges[index]?.qStart ?? 1;
		if (entry.state === "empty") {
			return {
				part: entry.part,
				label: entry.label,
				qStart,
				state: entry.state,
				groupCount: 0,
				questionCount: 0,
				groups: [],
			};
		}
		const groups = outlineGroups(entry.value, qStart);
		return {
			part: entry.part,
			label: entry.label,
			qStart,
			state: entry.state,
			groupCount: entry.value.groups.length || 1,
			questionCount: entry.value.questions.length,
			groups,
		};
	});
}

function outlineGroups(value: PartFormValue, qStart: number): OutlineGroup[] {
	return effectiveGroups(value).map(
		(group: LibraryQuestionGroup, index: number) => ({
			index,
			label: `Nhóm câu ${index + 1}`,
			typeLabel: quizTypeDisplay(group.type).label,
			questions: value.questions
				.slice(group.startIndex, group.startIndex + group.count)
				.map((question, offset) => ({
					number: qStart + group.startIndex + offset,
					offset,
					hasAnswer: question.answer.trim().length > 0,
				})),
		}),
	);
}
