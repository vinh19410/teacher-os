/**
 * Pure helpers cho trang kết quả (#730): chia văn bản thành các đoạn có/không
 * có lỗi để UI tô highlight bằng DOM API. Không phụ thuộc DOM.
 * Mirrors PLACEMENT_ERROR_CATEGORIES / rubric trong
 * packages/api/src/placement-test-contracts.ts (profile là JS thuần, không import được TS).
 */

export const PLACEMENT_ERROR_CATEGORIES = [
	{ key: "grammar", label: "Ngữ pháp" },
	{ key: "vocabulary", label: "Từ vựng" },
	{ key: "spelling", label: "Chính tả" },
	{ key: "coherence", label: "Mạch lạc" },
	{ key: "pronunciation", label: "Phát âm" },
];

export const PLACEMENT_WRITING_RUBRIC = [
	{ key: "ct", label: "Content" },
	{ key: "or", label: "Organisation" },
	{ key: "lg", label: "Language" },
];

export const PLACEMENT_SPEAKING_RUBRIC = [
	{ key: "gv", label: "Grammar & Vocabulary" },
	{ key: "dm", label: "Discourse Management" },
	{ key: "pr", label: "Pronunciation" },
	{ key: "ic", label: "Task Response" },
];

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** Số thứ tự hiển thị: ①..⑳, sau đó (21), (22)... */
export function errorNumberLabel(n) {
	return n >= 1 && n <= CIRCLED.length ? CIRCLED[n - 1] : `(${n})`;
}

export function categoryLabel(key) {
	return PLACEMENT_ERROR_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

function isLocated(err) {
	return (
		Number.isInteger(err?.start) &&
		Number.isInteger(err?.end) &&
		err.start >= 0 &&
		err.end > err.start
	);
}

/**
 * Gán số thứ tự cho từng lỗi theo vị trí trong văn bản (lỗi không định vị
 * xếp cuối, giữ thứ tự gốc khi bằng nhau). Trả về mảng mới `{ ...error, number }`.
 */
export function numberErrors(errors) {
	const list = Array.isArray(errors) ? errors : [];
	return list
		.map((err, i) => ({ err, i }))
		.sort((a, b) => {
			const as = isLocated(a.err) ? a.err.start : Number.POSITIVE_INFINITY;
			const bs = isLocated(b.err) ? b.err.start : Number.POSITIVE_INFINITY;
			return as === bs ? a.i - b.i : as - bs;
		})
		.map(({ err }, idx) => ({ ...err, number: idx + 1 }));
}

/**
 * Chia `text` thành segment `{ text, error }` (error = lỗi đã đánh số hoặc null).
 * - Lỗi null offset hoặc nằm ngoài văn bản bị bỏ qua (thẻ vẫn hiện ở danh sách).
 * - Lỗi chồng lấn: giữ lỗi đứng trước, bỏ lỗi chồng.
 * - Nối các segment lại luôn bằng đúng `text`.
 */
export function buildHighlightSegments(text, errors) {
	const source = String(text ?? "");
	const placed = [];
	let cursor = 0;
	for (const err of numberErrors(errors)) {
		if (!isLocated(err) || err.end > source.length || err.start < cursor) {
			continue;
		}
		placed.push(err);
		cursor = err.end;
	}
	const segments = [];
	let pos = 0;
	for (const err of placed) {
		if (err.start > pos) {
			segments.push({ text: source.slice(pos, err.start), error: null });
		}
		segments.push({ text: source.slice(err.start, err.end), error: err });
		pos = err.end;
	}
	if (pos < source.length) {
		segments.push({ text: source.slice(pos), error: null });
	}
	return segments;
}
