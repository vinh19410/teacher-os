import { ASSIGNMENT_ANSWER_CHOICES } from "@teacher-os/api/contracts";
import type { TestRange } from "@/lib/test-ranges";

/**
 * Answers checking (phase-05 Task 5.1) — parse + compare thuần cho panel
 * "Soát đáp án" của full-test builder. Generalize pattern đã chứng minh ở
 * `PASTE_LINE_PATTERN` (components/assignments/bulk-key-paste.ts:10): mỗi
 * dòng `số. giá trị / alt1 / alt2`, map THEO SỐ CÂU TUYỆT ĐỐI tính từ
 * `computeTestRanges` — không bao giờ theo index part-local (cùng lỗi
 * precedence bulk-key-paste đã chặn: part lệch 13 câu thì index lệch theo).
 *
 * `alts` là chuỗi join `" / "` (shape `AssignmentQuestion.alts`,
 * contracts.ts:1118) — mọi hàm ở đây tiêu thụ/trả về `alts: string`.
 *
 * Pure module — no React imports; unit-tested in test-answer-key.test.ts.
 */

/** Same regex as bulk-key-paste.ts:10 — re-declared vì lib không import
 * ngược từ components; hai pattern phải giữ cùng hình `số. giá trị`. */
export const TEST_KEY_LINE_PATTERN = /^\s*(\d+)[.)]\s*(.+)$/;

/** Kind đáp án của câu — khớp union `AnswerKind` của assignment-presets. */
export type TestAnswerKind = keyof typeof ASSIGNMENT_ANSWER_CHOICES | "text";

/** Range của part + kind đáp án (từ kindOf(prompt.type ?? genre)). */
export interface TestAnswerRange extends TestRange {
	kind?: TestAnswerKind;
}

export interface TestAnswerKeyEntry {
	/** Số câu tuyệt đối từ dòng key. */
	number: number;
	answer: string;
	alts: string;
}

export type TestKeyLineErrorReason =
	| "unparsable"
	| "duplicate"
	| "invalid-choice";

export interface TestKeyLineError {
	/** 1-based dòng trong nội dung dán. */
	line: number;
	raw: string;
	reason: TestKeyLineErrorReason;
	message: string;
}

/** Một ô đáp án hiện tại của test — số câu tuyệt đối theo ranges. */
export interface TestAnswerCell {
	number: number;
	part: string;
	kind: TestAnswerKind;
	answer: string;
	alts: string;
}

export type TestAnswerDiffStatus = "match" | "mismatch" | "missing" | "extra";

export interface TestAnswerDiffRow {
	number: number;
	status: TestAnswerDiffStatus;
	/** Đáp án key paste (có ở match/mismatch/extra). */
	expected?: { answer: string; alts: string };
	/** Đáp án đang lưu trong prompt (có ở match/mismatch/missing). */
	actual?: { answer: string; alts: string };
}

/** Slot part có prompt gán — nguồn build cells (questions từ snapshot). */
export interface TestAnswerSlot {
	part: string;
	qStart: number;
	kind?: TestAnswerKind;
	questions: { answer: string; alts: string }[];
}

/** Case-insensitive lookup về dạng canonical (TRUE/NOT GIVEN/A/i…); null =
 * không thuộc bộ đáp án của kind. */
function canonicalChoice(value: string, kind: TestAnswerKind): string | null {
	const choices = kind === "text" ? null : ASSIGNMENT_ANSWER_CHOICES[kind];
	if (!choices) return null;
	return (
		choices.find(
			(choice) => choice.toLowerCase() === value.trim().toLowerCase(),
		) ?? null
	);
}

/** Alts so sánh/hiển thị cùng một dạng spacing: split `/` → trim → join " / ". */
export function normalizeAlts(alts: string): string {
	return alts
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
		.join(" / ");
}

/**
 * Parse chuỗi key dán vào. Dòng trống bị bỏ; dòng thiếu số/trùng số/sai bộ
 * đáp án thành error (entry không tạo). Số NGOÀI range vẫn thành entry
 * (kind fallback "text") để compare đánh dấu `extra` — không bị loại thầm.
 * Kind tra theo số câu tuyệt đối từ ranges; dòng `n` luôn nhắm Q`n`.
 */
export function parseTestAnswerKey(
	text: string,
	ranges: TestAnswerRange[],
): { entries: TestAnswerKeyEntry[]; errors: TestKeyLineError[] } {
	const kindByNumber = new Map<number, TestAnswerKind>();
	for (const range of ranges) {
		for (let offset = 0; offset < range.count; offset += 1)
			kindByNumber.set(range.qStart + offset, range.kind ?? "text");
	}
	const entries: TestAnswerKeyEntry[] = [];
	const errors: TestKeyLineError[] = [];
	const seenNumbers = new Set<number>();
	for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
		const lineNumber = lineIndex + 1;
		if (!line.trim()) continue;
		const match = TEST_KEY_LINE_PATTERN.exec(line);
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
		// Chỉ dòng hợp lệ đánh dấu seen — dòng lỗi cho Qn không chặn dòng
		// hợp lệ sau đó của cùng Qn (mirror bulk-key-paste review #6).
		if (seenNumbers.has(number)) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "duplicate",
				message: `Q${number} bị lặp trong nội dung dán — dòng hợp lệ đầu tiên thắng.`,
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
		const kind = kindByNumber.get(number) ?? "text";
		if (kind === "text") {
			seenNumbers.add(number);
			entries.push({
				number,
				answer: segments[0],
				alts: segments.slice(1).join(" / "),
			});
			continue;
		}
		const canonical = canonicalChoice(segments[0], kind);
		if (!canonical) {
			errors.push({
				line: lineNumber,
				raw: line,
				reason: "invalid-choice",
				message: `Q${number}: “${segments[0]}” không thuộc bộ đáp án (${ASSIGNMENT_ANSWER_CHOICES[kind].join(", ")}).`,
			});
			continue;
		}
		seenNumbers.add(number);
		// Choice kinds không có alts (mirror bulk-key-paste).
		entries.push({ number, answer: canonical, alts: "" });
	}
	return { entries, errors };
}

/** Flatten slots → cells đánh số tuyệt đối (nguồn cho View All + compare). */
export function testAnswerCells(slots: TestAnswerSlot[]): TestAnswerCell[] {
	const cells: TestAnswerCell[] = [];
	for (const slot of slots) {
		for (const [index, question] of slot.questions.entries()) {
			cells.push({
				number: slot.qStart + index,
				part: slot.part,
				kind: slot.kind ?? "text",
				answer: question.answer,
				alts: question.alts,
			});
		}
	}
	return cells;
}

/**
 * Expected (key paste) vs actual (prompt questions) theo số câu tuyệt đối:
 * có cả hai → match/mismatch; chỉ actual → missing (key thiếu dòng); chỉ
 * key → extra (ngoài đề). Cùng predicate này quyết định câu nào Apply ghi
 * (chỉ mismatch) — nên chạy lại Apply sau khi ghi ra 0 thay đổi.
 */
export function compareAnswerKey(
	entries: TestAnswerKeyEntry[],
	cells: TestAnswerCell[],
): TestAnswerDiffRow[] {
	const keyByNumber = new Map(entries.map((entry) => [entry.number, entry]));
	const actualByNumber = new Map(cells.map((cell) => [cell.number, cell]));
	const numbers = [
		...new Set([...keyByNumber.keys(), ...actualByNumber.keys()]),
	].sort((a, b) => a - b);
	return numbers.map((number) => {
		const expected = keyByNumber.get(number);
		const cell = actualByNumber.get(number);
		if (expected && cell) {
			return {
				number,
				status: answerKeyMatches(expected, cell, cell.kind)
					? ("match" as const)
					: ("mismatch" as const),
				expected,
				actual: cell,
			};
		}
		if (expected) return { number, status: "extra" as const, expected };
		return { number, status: "missing" as const, actual: cell };
	});
}

/** Text so khớp sau trim (giữ phân biệt chữ hoa — "CAR" ≠ "Car"), alts so
 * theo dạng spacing chuẩn hóa; choice kinds so dạng canonical hai chiều.
 * Exported: predicate dùng chung cho compare display và quyết định Apply. */
export function answerKeyMatches(
	expected: TestAnswerKeyEntry,
	actual: { answer: string; alts: string },
	kind: TestAnswerKind,
): boolean {
	if (kind === "text") {
		return (
			expected.answer.trim() === actual.answer.trim() &&
			normalizeAlts(expected.alts) === normalizeAlts(actual.alts)
		);
	}
	// Actual từ server vốn canonical — canonicalize lại để phòng legacy row.
	return canonicalChoice(actual.answer, kind) === expected.answer;
}

/** Đếm theo trạng thái cho dòng tóm tắt "38 match, 2 mismatch". */
export function summarizeAnswerKeyDiff(
	rows: TestAnswerDiffRow[],
): Record<TestAnswerDiffStatus, number> {
	const summary: Record<TestAnswerDiffStatus, number> = {
		match: 0,
		mismatch: 0,
		missing: 0,
		extra: 0,
	};
	for (const row of rows) summary[row.status] += 1;
	return summary;
}
