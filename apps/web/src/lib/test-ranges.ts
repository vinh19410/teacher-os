/**
 * Continuous question numbering for the full-test builder (design
 * "IELTS Full Test Builder", 2026-09-28). `computeTestRanges` is the ONLY
 * numbering source for test-builder code — the static `qStart` values on
 * catalog part presets describe the canonical 13/13/14 paper and are
 * FORBIDDEN as numbering input here: a real part may carry 12 or 15
 * questions and a hardcoded start would skew every later part (and the
 * answers panel built on top of it).
 *
 * Pure module — no React imports; unit-tested in test-ranges.test.ts.
 */

export interface TestRangePartInput {
	part: string;
	/** Chủ động ghi đè số câu bắt đầu (nullable — null = đánh số liên tục). */
	qStartOverride: number | null;
	/** Câu hỏi của prompt gắn vào slot — count = số phần tử. */
	promptQuestions: { stem: string }[];
}

export interface TestRange {
	part: string;
	qStart: number;
	count: number;
}

/**
 * Fold parts theo thứ tự slot: qStart của part đầu = 1 (hoặc
 * qStartOverride nếu có); qStart part sau = qStart + count của part trước,
 * trừ khi part đó có qStartOverride. Part chưa gắn prompt (count 0) giữ
 * nguyên mốc cho part sau — một slot trống không dịch số.
 */
export function computeTestRanges(test: {
	parts: TestRangePartInput[];
}): TestRange[] {
	const ranges: TestRange[] = [];
	let next = 1;
	for (const part of test.parts) {
		const qStart = part.qStartOverride ?? next;
		const count = part.promptQuestions.length;
		ranges.push({ part: part.part, qStart, count });
		next = qStart + count;
	}
	return ranges;
}
