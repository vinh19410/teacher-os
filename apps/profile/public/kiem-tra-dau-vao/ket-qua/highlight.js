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
	{
		key: "ct",
		label: "Content",
		desc: "Đủ 3 ý, đúng yêu cầu",
		levels: {
			5: "Đủ cả 3 ý, ý 3 có lý do rõ ràng; người đọc hiểu đầy đủ.",
			3: "Đủ 3 ý nhưng 1 ý sơ sài, hoặc thiếu 1 ý.",
			1: "Chỉ có 1 ý / lạc đề một phần.",
		},
	},
	{
		key: "or",
		label: "Organisation",
		desc: "Bố cục email, từ nối",
		levels: {
			5: "Có mở/kết email phù hợp; ý sắp xếp mạch lạc; dùng nhiều từ nối (because, so, but, also…).",
			3: "Có bố cục cơ bản; dùng and, but, because.",
			1: "Câu rời rạc, không có bố cục email.",
		},
	},
	{
		key: "lg",
		label: "Language",
		desc: "Ngữ pháp & từ vựng",
		levels: {
			5: "Dùng đúng hiện tại đơn, quá khứ, so sánh; có câu phức; từ vựng phong phú. Lỗi nhỏ.",
			3: "Câu đơn khá chính xác; từ vựng cơ bản đủ dùng; lỗi không cản trở hiểu.",
			1: "Lỗi cơ bản dày đặc (thiếu động từ, sai chia), từ vựng rất hạn chế.",
		},
	},
];

export const PLACEMENT_SPEAKING_RUBRIC = [
	{
		key: "gv",
		label: "Grammar & Vocabulary",
		desc: "Ngữ pháp & từ vựng",
		levels: {
			5: "Dùng tốt câu đơn và một số câu phức (because, if, when, which). Từ vựng đủ để nói về chủ đề quen thuộc và nêu ý kiến; lỗi không gây hiểu lầm.",
			3: "Kiểm soát khá tốt câu đơn (hiện tại, quá khứ, going to). Từ vựng đủ cho chủ đề hằng ngày; còn lỗi nhưng vẫn hiểu được.",
			1: "Chỉ dùng từ đơn, cụm có sẵn (I'm…, My name is…). Lỗi cơ bản thường xuyên.",
		},
	},
	{
		key: "dm",
		label: "Discourse Management",
		desc: "Độ dài, mạch lạc, phát triển ý",
		levels: {
			5: "Nói gần hết thời gian cho phép; có lý do và ví dụ (Answer → Reason → Example); dùng từ nối (because, so, but, for example, in my opinion). Ít ngập ngừng.",
			3: "Trả lời được 1–2 câu liên quan mỗi câu hỏi; có dùng and, but, because. Còn ngập ngừng nhưng không đứt mạch.",
			1: "Câu trả lời rất ngắn, rời rạc; im lặng lâu, bỏ trống nhiều câu.",
		},
	},
	{
		key: "pr",
		label: "Pronunciation",
		desc: "Phát âm, trọng âm, ngữ điệu",
		levels: {
			5: "Dễ hiểu trong toàn bộ bài nói; âm cuối, trọng âm từ và ngữ điệu câu nhìn chung đúng.",
			3: "Phần lớn dễ hiểu dù còn giọng Việt rõ; đôi khi mất âm cuối, sai trọng âm.",
			1: "Thường khó hiểu; mất âm cuối, sai nguyên âm khiến người nghe phải đoán.",
		},
	},
	{
		key: "ic",
		label: "Task Response",
		desc: "Hiểu và trả lời đúng câu hỏi (thay cho Interactive Communication)",
		levels: {
			5: "Hiểu và trả lời đúng trọng tâm tất cả câu hỏi, kể cả Part 3.",
			3: "Trả lời đúng phần lớn câu hỏi Part 1–2; Part 3 còn chung chung hoặc lạc ý.",
			1: "Chỉ trả lời được vài câu Part 1; nhiều câu hiểu sai hoặc bỏ trống.",
		},
	},
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
