import { type EssayAnnotation, QUIZ_ANNOTATION_SPAN_MAX } from "../contracts";

/**
 * Highlight + ghi chú trên essay Writing (#332) — logic thuần dùng chung
 * server (validate) và web/student (render, bắt dính vùng chọn). Không import
 * DOM, compile cho cả workerd lẫn browser.
 */

/** Biên số hợp lệ: index nguyên, 0 ≤ start < end ≤ essay.length. */
function hasValidBounds(essay: string, start: number, end: number): boolean {
	return (
		Number.isInteger(start) &&
		Number.isInteger(end) &&
		start >= 0 &&
		start < end &&
		end <= essay.length
	);
}

/** Biên hợp lệ: biên số + không quá dài + không toàn khoảng trắng. */
export function isValidAnnotationSpan(
	essay: string,
	start: number,
	end: number,
): boolean {
	if (
		!hasValidBounds(essay, start, end) ||
		end - start > QUIZ_ANNOTATION_SPAN_MAX
	) {
		return false;
	}
	return essay.slice(start, end).trim() !== "";
}

/** Chồng khi hai khoảng cắt nhau; chạm biên (a.end === start) không chồng. */
export function overlapsAny(
	spans: ReadonlyArray<{ id?: string; start: number; end: number }>,
	start: number,
	end: number,
	ignoreId?: string,
): boolean {
	return spans.some((a) => a.id !== ignoreId && a.start < end && start < a.end);
}

const WORD_CHAR = /[\p{L}\p{N}'’-]/u;

/** Bắt dính vùng chọn theo ranh giới từ: cắt khoảng trắng hai đầu rồi nới
 * start lùi / end tiến tới hết ký tự từ. Trả null nếu không còn ký tự từ nào. */
export function snapSpanToWords(
	essay: string,
	start: number,
	end: number,
): { start: number; end: number } | null {
	let lo = start;
	let hi = end;
	while (lo < hi && !WORD_CHAR.test(essay[lo] ?? "")) lo += 1;
	while (hi > lo && !WORD_CHAR.test(essay[hi - 1] ?? "")) hi -= 1;
	if (lo >= hi) return null;
	while (lo > 0 && WORD_CHAR.test(essay[lo - 1] ?? "")) lo -= 1;
	while (hi < essay.length && WORD_CHAR.test(essay[hi] ?? "")) hi += 1;
	return { start: lo, end: hi };
}

export type EssaySegment = {
	start: number;
	end: number;
	text: string;
	annotation: EssayAnnotation | null;
	/** Số thứ tự 1-based của highlight theo thứ tự xuất hiện; null với đoạn thường. */
	n: number | null;
};

/** Chia essay thành các đoạn thường xen đoạn highlight. Bỏ qua annotation sai
 * biên số hoặc chồng với cái đã nhận (UI không vỡ nếu dữ liệu lỗi). Nối lại
 * `text` của kết quả phải bằng đúng essay. */
export function segmentEssay(
	essay: string,
	annotations: ReadonlyArray<EssayAnnotation>,
): Array<EssaySegment> {
	const accepted: EssayAnnotation[] = [];
	const sorted = [...annotations].sort((a, b) => a.start - b.start);
	for (const a of sorted) {
		if (
			!hasValidBounds(essay, a.start, a.end) ||
			overlapsAny(accepted, a.start, a.end)
		) {
			continue;
		}
		accepted.push(a);
	}

	const segments: Array<EssaySegment> = [];
	let cursor = 0;
	for (const [i, a] of accepted.entries()) {
		if (a.start > cursor) {
			segments.push({
				start: cursor,
				end: a.start,
				text: essay.slice(cursor, a.start),
				annotation: null,
				n: null,
			});
		}
		segments.push({
			start: a.start,
			end: a.end,
			text: essay.slice(a.start, a.end),
			annotation: a,
			n: i + 1,
		});
		cursor = a.end;
	}
	if (cursor < essay.length) {
		segments.push({
			start: cursor,
			end: essay.length,
			text: essay.slice(cursor),
			annotation: null,
			n: null,
		});
	}
	return segments;
}

/** Danh sách ghi chú theo thứ tự xuất hiện, số `n` khớp highlight trên essay. */
export function orderedAnnotations(
	essay: string,
	annotations: ReadonlyArray<EssayAnnotation>,
): Array<{ annotation: EssayAnnotation; n: number }> {
	return segmentEssay(essay, annotations).flatMap((seg) =>
		seg.annotation && seg.n !== null
			? [{ annotation: seg.annotation, n: seg.n }]
			: [],
	);
}

/** Trích đoạn tối đa `max` ký tự, thêm dấu "…" nếu bị cắt. */
export function excerpt(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}
