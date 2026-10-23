import { ALT_SEPARATOR } from "@teacher-os/api/lib/grade-quiz";
import type {
	LibraryPartDto,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";
import { effectiveGroups } from "./group-model";
import {
	computeLibraryTestRanges,
	type PartDraft,
	type PartSlot,
	resolvePartValues,
} from "./test-outline-model";

/**
 * Dữ liệu panel kiểm tra đáp án (Task 2.4): hàng cho MỌI câu của đề theo
 * số thứ tự fold (cùng `resolvePartValues` của cây đề), kèm các đáp án
 * thay thế tách bằng đúng separator của grader.
 */

export interface AnswerOverviewRow {
	number: number;
	part: string;
	partLabel: string;
	groupIndex: number;
	answer: string;
	alts: string[];
	missing: boolean;
}

export interface AnswersOverviewSource {
	skill: LibrarySkill;
	slots: readonly PartSlot[];
	partsBySlot: ReadonlyMap<string, LibraryPartDto>;
	drafts: ReadonlyMap<string, PartDraft>;
}

export function buildAnswersOverview(
	source: AnswersOverviewSource,
): AnswerOverviewRow[] {
	const entries = resolvePartValues(
		source.skill,
		source.slots,
		source.partsBySlot,
		source.drafts,
	);
	const ranges = computeLibraryTestRanges(
		entries.map((entry) => ({
			part: entry.part,
			count: entry.state === "empty" ? 0 : entry.value.questions.length,
		})),
	);
	const rows: AnswerOverviewRow[] = [];
	for (const [index, entry] of entries.entries()) {
		if (entry.state === "empty") continue;
		const qStart = ranges[index]?.qStart ?? 1;
		for (const [gi, group] of effectiveGroups(entry.value).entries()) {
			for (const [offset, question] of entry.value.questions
				.slice(group.startIndex, group.startIndex + group.count)
				.entries()) {
				const answer = question.answer.trim();
				rows.push({
					number: qStart + group.startIndex + offset,
					part: entry.part,
					partLabel: entry.label,
					groupIndex: gi,
					answer,
					alts: question.alts
						.split(ALT_SEPARATOR)
						.map((alt) => alt.trim())
						.filter((alt) => alt.length > 0),
					missing: answer.length === 0,
				});
			}
		}
	}
	return rows;
}
