import { answerChoices, kindOf, type QuestionItem } from "./assignment-presets";

/**
 * Bulk answer-key paste (phase-01 FR7): each line is `số. giá trị` or
 * `số. giá trị / alt1 / alt2`. Lines map **by parsed question number** —
 * line `n` targets the row displaying `Q{n}` (index `n − qStart`) — never
 * by silent row order (red-team #9: order-mapping misaligns answer keys).
 */

export const PASTE_LINE_PATTERN = /^\s*(\d+)[.)]\s*(.+)$/;

export type PasteLineErrorReason =
	| "unparsable"
	| "out-of-range"
	| "duplicate"
	| "invalid-choice";

export interface BulkKeyPasteLineError {
	/** 1-based line number inside the pasted text. */
	line: number;
	raw: string;
	reason: PasteLineErrorReason;
	message: string;
}

export interface BulkKeyPasteInput {
	raw: string;
	typeId: string;
	qStart: number;
	items: QuestionItem[];
}

export interface BulkKeyPasteOutcome {
	/** Next items array: valid lines applied, everything else untouched. */
	items: QuestionItem[];
	errors: BulkKeyPasteLineError[];
	appliedCount: number;
}

export function applyBulkKeyPaste(
	input: BulkKeyPasteInput,
): BulkKeyPasteOutcome {
	const { raw, typeId, qStart, items } = input;
	const kind = kindOf(typeId);
	const choices = answerChoices(kind);
	const next = items.map((item) => ({ ...item }));
	const errors: BulkKeyPasteLineError[] = [];
	const seenNumbers = new Set<number>();
	let appliedCount = 0;

	for (const [lineIndex, line] of raw.split(/\r?\n/).entries()) {
		const lineNumber = lineIndex + 1;
		if (!line.trim()) continue;
		const match = PASTE_LINE_PATTERN.exec(line);
		if (!match) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "unparsable",
				message:
					"Dòng không đọc được — dùng mẫu “số. giá trị” (ví dụ: 1. TRUE).",
			});
			continue;
		}
		const number = Number(match[1]);
		const index = number - qStart;
		if (index < 0 || index >= next.length) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "out-of-range",
				message: next.length
					? `Q${number} ngoài phạm vi phần này (đang có Q${qStart}–Q${qStart + next.length - 1}).`
					: `Q${number} ngoài phạm vi — phần này chưa có câu nào.`,
			});
			continue;
		}
		if (seenNumbers.has(number)) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "duplicate",
				message: `Q${number} bị lặp trong nội dung dán — mỗi số câu chỉ nhận một dòng hợp lệ.`,
			});
			continue;
		}

		const segments = match[2]
			.split("/")
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0);
		if (segments.length === 0) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "unparsable",
				message: "Dòng trống giá trị.",
			});
			continue;
		}

		if (kind === "text") {
			next[index] = {
				...next[index],
				answer: segments[0],
				alts: segments.slice(1).join(" / "),
			};
		} else {
			const requested = segments[0];
			const canonical = choices?.find(
				(choice) => choice.toLowerCase() === requested.toLowerCase(),
			);
			if (!canonical) {
				errors.push({
					line: lineNumber,
					raw: line,
					reason: "invalid-choice",
					message: `Q${number}: “${requested}” không thuộc bộ đáp án (${choices?.join(", ")}).`,
				});
				continue;
			}
			next[index] = { ...next[index], answer: canonical };
		}
		// Mark only lines that actually applied — an errored line for Qn must
		// not block a later valid line for the same number (review #6).
		seenNumbers.add(number);
		appliedCount += 1;
	}

	return { items: next, errors, appliedCount };
}
