/**
 * Hàm thuần cho highlight lỗi Writing/Speaking trên panel chấm bài test đầu
 * vào (#730): nhãn/màu theo loại lỗi, chia văn bản thành đoạn thường/đoạn lỗi,
 * quy đổi vị trí DOM selection → offset trong văn bản nguồn.
 */
import {
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_ERROR_EXPLANATION_MAX,
	PLACEMENT_ERROR_QUOTE_MAX,
	type PlacementError,
	type PlacementErrorCategory,
} from "@teacher-os/api/placement-test-contracts";

export type PlacementErrorCategoryStyle = {
	label: string;
	/** Tên kiểu gạch chân (nói bằng chữ trong chú giải — không chỉ dựa vào màu). */
	lineLabel: string;
	/** Lớp cho `<mark>` trong bài: nền soft + gạch chân màu + kiểu nét riêng. */
	markCls: string;
	/** Lớp cho ô mẫu ở chú giải và chấm màu trên thẻ lỗi. */
	swatchCls: string;
};

/**
 * Năm loại lỗi dùng 5 hue phân tách sẵn có `--class-*` (globals.css) và mỗi
 * loại có một kiểu nét gạch chân khác nhau để phân biệt cả khi không thấy màu.
 */
export const PLACEMENT_ERROR_STYLES: Record<
	PlacementErrorCategory,
	PlacementErrorCategoryStyle
> = {
	grammar: {
		label: "Ngữ pháp",
		lineLabel: "gạch liền",
		markCls: "bg-class-5-soft decoration-class-5 decoration-solid",
		swatchCls: "bg-class-5-soft border-class-5 border-solid",
	},
	vocabulary: {
		label: "Từ vựng",
		lineLabel: "gạch đứt",
		markCls: "bg-class-1-soft decoration-class-1 decoration-dashed",
		swatchCls: "bg-class-1-soft border-class-1 border-dashed",
	},
	spelling: {
		label: "Chính tả",
		lineLabel: "gạch sóng",
		markCls: "bg-class-3-soft decoration-class-3 decoration-wavy",
		swatchCls: "bg-class-3-soft border-class-3 border-solid",
	},
	coherence: {
		label: "Mạch lạc",
		lineLabel: "gạch chấm",
		markCls: "bg-class-4-soft decoration-class-4 decoration-dotted",
		swatchCls: "bg-class-4-soft border-class-4 border-dotted",
	},
	pronunciation: {
		label: "Phát âm",
		lineLabel: "gạch đôi",
		markCls: "bg-class-2-soft decoration-class-2 decoration-double",
		swatchCls: "bg-class-2-soft border-class-2 border-double",
	},
};

export const PLACEMENT_ERROR_CATEGORY_OPTIONS = PLACEMENT_ERROR_CATEGORIES.map(
	(c) => ({ key: c.key, label: PLACEMENT_ERROR_STYLES[c.key].label }),
);

export function placementErrorLabel(category: PlacementErrorCategory): string {
	return PLACEMENT_ERROR_STYLES[category]?.label ?? category;
}

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** Số thứ tự kiểu ① ② (1–20), từ 21 trở đi dùng "(21)". */
export function circledNumber(n: number): string {
	return n >= 1 && n <= CIRCLED.length ? (CIRCLED[n - 1] ?? `${n}`) : `(${n})`;
}

export type HighlightSegment =
	| { kind: "text"; start: number; text: string }
	| {
			kind: "error";
			start: number;
			end: number;
			text: string;
			error: PlacementError;
			number: number;
	  };

/**
 * Chia `text` thành đoạn thường + đoạn lỗi. `errors` phải là kết quả của
 * `locatePlacementErrors` (đã sắp theo vị trí, không chồng lấn); số thứ tự =
 * vị trí trong danh sách (khớp số trên thẻ lỗi). Lỗi không định vị được hoặc
 * offset lệch văn bản thì bỏ qua (thẻ vẫn hiện).
 */
export function buildHighlightSegments(
	text: string,
	errors: readonly PlacementError[],
): HighlightSegment[] {
	const segments: HighlightSegment[] = [];
	let cursor = 0;
	errors.forEach((error, index) => {
		const { start, end } = error;
		if (start === null || end === null) return;
		if (start < cursor || end <= start || end > text.length) return;
		if (start > cursor) {
			segments.push({
				kind: "text",
				start: cursor,
				text: text.slice(cursor, start),
			});
		}
		segments.push({
			kind: "error",
			start,
			end,
			text: text.slice(start, end),
			error,
			number: index + 1,
		});
		cursor = end;
	});
	if (cursor < text.length) {
		segments.push({ kind: "text", start: cursor, text: text.slice(cursor) });
	}
	return segments;
}

/**
 * Quy đổi một điểm DOM (node + offset của Selection/Range) về offset trong văn
 * bản nguồn. Mỗi đoạn văn bản render với `data-start` và chứa đúng một text
 * node; badge số thứ tự mang `data-at` (offset cuối lỗi) và không được tính
 * vào văn bản. Trả về null khi điểm nằm ngoài `container`.
 */
export function domPointToOffset(
	container: HTMLElement,
	textLength: number,
	node: Node,
	offset: number,
): number | null {
	if (node !== container && !container.contains(node)) return null;
	if (node.nodeType === Node.TEXT_NODE) {
		const parent = node.parentElement;
		const seg = parent?.closest<HTMLElement>("[data-start]");
		if (seg && container.contains(seg)) {
			const start = Number(seg.dataset.start);
			if (Number.isNaN(start)) return null;
			return Math.min(start + offset, textLength);
		}
		const badge = parent?.closest<HTMLElement>("[data-at]");
		if (badge && container.contains(badge)) {
			const at = Number(badge.dataset.at);
			return Number.isNaN(at) ? null : at;
		}
		return null;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return null;
	// Điểm giữa các con của một element: lấy đầu đoạn văn bản đầu tiên nằm
	// tại/sau điểm đó; hết đoạn → cuối văn bản.
	const el = node as Element;
	const boundary = el.childNodes[offset] ?? null;
	const segments = container.querySelectorAll<HTMLElement>("[data-start]");
	for (const seg of segments) {
		const isAfter = boundary
			? boundary === seg ||
				boundary.contains(seg) ||
				Boolean(
					boundary.compareDocumentPosition(seg) &
						Node.DOCUMENT_POSITION_FOLLOWING,
				)
			: !el.contains(seg) &&
				Boolean(
					el.compareDocumentPosition(seg) & Node.DOCUMENT_POSITION_FOLLOWING,
				);
		if (isAfter) {
			const start = Number(seg.dataset.start);
			return Number.isNaN(start) ? null : start;
		}
	}
	return textLength;
}

export type TextSpan = { start: number; end: number; quote: string };

/** Bỏ khoảng trắng hai đầu vùng chọn; rỗng → null. */
export function trimTextSpan(
	text: string,
	start: number,
	end: number,
): TextSpan | null {
	let s = Math.max(0, Math.min(start, end));
	let e = Math.min(text.length, Math.max(start, end));
	while (s < e && /\s/.test(text[s] ?? "")) s++;
	while (e > s && /\s/.test(text[e - 1] ?? "")) e--;
	if (e <= s) return null;
	return { start: s, end: e, quote: text.slice(s, e) };
}

/** Lỗi đã định vị đầu tiên chồng lấn [start, end) — trả về số thứ tự (1-based). */
export function overlappingErrorNumber(
	errors: readonly PlacementError[],
	start: number,
	end: number,
): number | null {
	const idx = errors.findIndex(
		(e) => e.start !== null && e.end !== null && start < e.end && e.start < end,
	);
	return idx < 0 ? null : idx + 1;
}

export type PlacementErrorDraft = {
	category: PlacementErrorCategory;
	quote: string;
	correction: string;
	explanation: string;
};

/** Kiểm tra bản nháp thẻ lỗi theo giới hạn contract; trả về thông báo lỗi hoặc null. */
export function validatePlacementErrorDraft(
	draft: PlacementErrorDraft,
): string | null {
	if (!draft.quote.trim()) return "Đoạn bị sai không được để trống.";
	if (draft.quote.length > PLACEMENT_ERROR_QUOTE_MAX) {
		return `Đoạn bị sai tối đa ${PLACEMENT_ERROR_QUOTE_MAX} ký tự.`;
	}
	if (draft.correction.length > PLACEMENT_ERROR_QUOTE_MAX) {
		return `Cách sửa tối đa ${PLACEMENT_ERROR_QUOTE_MAX} ký tự.`;
	}
	if (draft.explanation.length > PLACEMENT_ERROR_EXPLANATION_MAX) {
		return `Giải thích tối đa ${PLACEMENT_ERROR_EXPLANATION_MAX} ký tự.`;
	}
	return null;
}

/** Id cho lỗi giáo viên thêm tay (≤ 40 ký tự theo contract). */
export function newPlacementErrorId(): string {
	const rand =
		typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
			? crypto.randomUUID()
			: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
	return `t-${rand}`.slice(0, 40);
}
