import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";

/** Giới hạn số lượng highlight/ghi chú mỗi bài đọc để bảo vệ DOM và storage. */
export const READING_ANNOTATION_MAX_ITEMS = 200;
/** Giới hạn độ dài một ghi chú bài đọc (UTF-16 code units). */
export const READING_ANNOTATION_NOTE_MAX = 1000;
/** Giới hạn trên an toàn cho thuộc tính colspan/rowspan của bảng HTML. */
export const READING_TABLE_SPAN_MAX = 50;

export const READING_ALLOWED_TAGS = [
	"p",
	"br",
	"strong",
	"em",
	"u",
	"s",
	"ul",
	"ol",
	"li",
	"a",
	"code",
	"pre",
	"hr",
	"blockquote",
	"h2",
	"h3",
	"h4",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
] as const;

export type ReadingAllowedTag = (typeof READING_ALLOWED_TAGS)[number];

export interface ReadingElementAttrs {
	href?: string;
	target?: "_blank";
	rel?: "noopener noreferrer";
	colSpan?: number;
	rowSpan?: number;
}

export interface PassageTextLeaf {
	kind: "text";
	start: number;
	end: number;
	text: string;
}

export interface PassageElementNode {
	kind: "element";
	tag: ReadingAllowedTag;
	attrs?: ReadingElementAttrs;
	children: PassageAstNode[];
}

export type PassageAstNode = PassageTextLeaf | PassageElementNode;

export interface PassageModel {
	isHtml: boolean;
	nodes: PassageAstNode[];
	canonicalText: string;
	blockBreakOffsets: Set<number>;
	passageHash: string;
}

export interface ReadingAnnotation {
	id: string;
	start: number;
	end: number;
	note: string;
}

export interface LeafSlice {
	start: number;
	end: number;
	text: string;
	annotation: ReadingAnnotation | null;
	isLastSegment: boolean;
}

export type UpsertNoteTarget = { id: string } | { start: number; end: number };

export type UpsertNoteResult =
	| {
			ok: true;
			items: ReadingAnnotation[];
			targetId: string;
	  }
	| {
			ok: false;
			reason: "multiple_notes_overlap" | "invalid_span" | "not_found";
			items: ReadingAnnotation[];
	  };

const ALLOWED_TAG_SET: ReadonlySet<string> = new Set(READING_ALLOWED_TAGS);
const STRUCTURAL_NO_TEXT_TAGS: ReadonlySet<string> = new Set([
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"ul",
	"ol",
]);
const BLOCK_TAGS: ReadonlySet<string> = new Set([
	"p",
	"h2",
	"h3",
	"h4",
	"ul",
	"ol",
	"li",
	"blockquote",
	"pre",
	"hr",
	"table",
	"thead",
	"tbody",
	"tfoot",
	"tr",
	"th",
	"td",
]);
const BREAK_RECORD_TAGS: ReadonlySet<string> = new Set([
	"p",
	"h2",
	"h3",
	"h4",
	"li",
	"blockquote",
	"pre",
	"tr",
	"th",
	"td",
]);

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const PAIRED_OR_VOID_TAG_RE = /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img)\b[^>]*>/i;
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|#39);/i;
const POSITIVE_INT_RE = /^\d+$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEME_RE = /^(?:https?|mailto|tel):/i;
const COLON_BEFORE_PATH_RE = /^[^/?#]*:/;
const ANNOTATION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);
const WORD_CHAR_RE = /[\p{L}\p{M}\p{N}'’-]/u;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

function isReadingAllowedTag(tag: string): tag is ReadingAllowedTag {
	return ALLOWED_TAG_SET.has(tag);
}

/**
 * Dùng chung heuristic nhận diện HTML của `RichTextBody` để hai nhánh render
 * không bao giờ lệch nhau trên dữ liệu plain text legacy (vd. `"a < b > c"`).
 */
export function isHtmlRichText(text: string): boolean {
	if (HTML_ENTITY_RE.test(text)) return true;
	if (!HTML_TAG_RE.test(text) || !PAIRED_OR_VOID_TAG_RE.test(text)) {
		return false;
	}
	if (typeof DOMParser === "undefined") return true;
	const doc = new DOMParser().parseFromString(text, "text/html");
	return doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(text);
}

/** FNV-1a 32-bit hash cho chuỗi passage — dùng đối chiếu chống lệch offset khi đề thay đổi. */
export function hashPassage(passage: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < passage.length; i += 1) {
		hash ^= passage.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function stripAsciiControlAndSpaces(input: string): string {
	let out = "";
	for (let i = 0; i < input.length; i += 1) {
		const code = input.charCodeAt(i);
		if (code > 0x20 && code !== 0x7f) {
			out += input[i];
		}
	}
	return out;
}

function hasAsciiControlChar(input: string): boolean {
	for (let i = 0; i < input.length; i += 1) {
		const code = input.charCodeAt(i);
		if (code < 0x20 || code === 0x7f) {
			return true;
		}
	}
	return false;
}

/**
 * Kiểm tra allowlist cho `href` (defense-in-depth sau DOMPurify):
 * chỉ cho `http:`, `https:`, `mailto:`, `tel:` hoặc đường dẫn tương đối;
 * từ chối mọi ký tự điều khiển ASCII và toàn bộ biến thể protocol-relative (`//`, `/\`, `\\`, `\/`).
 */
export function sanitizeReadingHref(raw: string | null): string | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	if (hasAsciiControlChar(trimmed)) {
		return undefined;
	}
	const normalized = stripAsciiControlAndSpaces(trimmed);
	const slashNormalized = normalized.replace(/\\/g, "/");
	if (slashNormalized.startsWith("//") || normalized.startsWith("\\")) {
		return undefined;
	}
	if (SCHEME_RE.test(normalized)) {
		return SAFE_SCHEME_RE.test(normalized) ? trimmed : undefined;
	}
	if (COLON_BEFORE_PATH_RE.test(normalized)) {
		return undefined;
	}
	return trimmed;
}

export function isValidReadingAnnotationId(id: string): boolean {
	return ANNOTATION_ID_RE.test(id) && !RESERVED_IDS.has(id);
}

function parseBoundedTableSpan(raw: string | null): number | undefined {
	if (!raw) return undefined;
	const trimmed = raw.trim();
	if (!POSITIVE_INT_RE.test(trimmed)) return undefined;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return undefined;
	return Math.min(parsed, READING_TABLE_SPAN_MAX);
}

function extractElementAttrs(
	el: Element,
	tag: ReadingAllowedTag,
): ReadingElementAttrs | undefined {
	if (tag === "a") {
		const href = sanitizeReadingHref(el.getAttribute("href"));
		if (!href) return undefined;
		return {
			href,
			target: "_blank",
			rel: "noopener noreferrer",
		};
	}
	if (tag === "td" || tag === "th") {
		const colSpan = parseBoundedTableSpan(el.getAttribute("colspan"));
		const rowSpan = parseBoundedTableSpan(el.getAttribute("rowspan"));
		if (colSpan === undefined && rowSpan === undefined) return undefined;
		const attrs: ReadingElementAttrs = {};
		if (colSpan !== undefined) attrs.colSpan = colSpan;
		if (rowSpan !== undefined) attrs.rowSpan = rowSpan;
		return attrs;
	}
	return undefined;
}

function isBlockElementChild(node: ChildNode | null): boolean {
	if (!node || node.nodeType !== ELEMENT_NODE) return false;
	return BLOCK_TAGS.has((node as Element).tagName.toLowerCase());
}

function shouldSkipWhitespaceTextNode(
	textNode: ChildNode,
	parentTag: string | null,
): boolean {
	const value = textNode.nodeValue ?? "";
	if (value.length === 0) return true;
	if (/\S/.test(value)) return false;
	if (parentTag !== null && STRUCTURAL_NO_TEXT_TAGS.has(parentTag)) {
		return true;
	}
	if (parentTag === null || parentTag === "blockquote") {
		const prev = textNode.previousSibling;
		const next = textNode.nextSibling;
		if (
			isBlockElementChild(prev) ||
			isBlockElementChild(next) ||
			(prev === null && next === null)
		) {
			return true;
		}
	}
	return false;
}

/**
 * Parse `passage` thành AST React bất biến với offset UTF-16 liên tục.
 * Fail-closed khi thiếu DOM (`DOMParser` hoặc `document` không tồn tại).
 */
export function buildPassageModel(passage: string): PassageModel {
	const passageHash = hashPassage(passage);
	if (
		!isHtmlRichText(passage) ||
		typeof DOMParser === "undefined" ||
		typeof document === "undefined"
	) {
		const nodes: PassageAstNode[] =
			passage.length > 0
				? [{ kind: "text", start: 0, end: passage.length, text: passage }]
				: [];
		return {
			isHtml: false,
			nodes,
			canonicalText: passage,
			blockBreakOffsets: new Set(),
			passageHash,
		};
	}

	const cleanHtml = sanitizeRichText(passage);
	const doc = new DOMParser().parseFromString(cleanHtml, "text/html");
	const chunks: string[] = [];
	const blockBreakOffsets = new Set<number>();
	let cursor = 0;
	let pendingBreak = false;

	const recordBreak = () => {
		if (cursor > 0) {
			pendingBreak = true;
		}
	};

	const walkChildren = (
		parent: ParentNode,
		parentTag: string | null,
	): PassageAstNode[] => {
		const result: PassageAstNode[] = [];
		for (const child of Array.from(parent.childNodes)) {
			if (child.nodeType === TEXT_NODE) {
				if (shouldSkipWhitespaceTextNode(child, parentTag)) continue;
				const text = child.nodeValue ?? "";
				if (text.length === 0) continue;
				if (pendingBreak) {
					blockBreakOffsets.add(cursor);
					pendingBreak = false;
				}
				const start = cursor;
				cursor += text.length;
				chunks.push(text);
				result.push({ kind: "text", start, end: cursor, text });
				continue;
			}
			if (child.nodeType !== ELEMENT_NODE) continue;
			const el = child as Element;
			const tag = el.tagName.toLowerCase();
			if (!isReadingAllowedTag(tag)) {
				const unwrapped = walkChildren(el, parentTag);
				result.push(...unwrapped);
				continue;
			}
			if (tag === "br" || tag === "hr") {
				recordBreak();
				result.push({ kind: "element", tag, children: [] });
				continue;
			}
			const isBreakTag = BREAK_RECORD_TAGS.has(tag);
			if (isBreakTag) recordBreak();
			const children = walkChildren(el, tag);
			if (isBreakTag) recordBreak();
			const attrs = extractElementAttrs(el, tag);
			result.push(
				attrs
					? { kind: "element", tag, attrs, children }
					: { kind: "element", tag, children },
			);
		}
		return result;
	};

	const nodes = walkChildren(doc.body, null);
	return {
		isHtml: true,
		nodes,
		canonicalText: chunks.join(""),
		blockBreakOffsets,
		passageHash,
	};
}

/**
 * Bắt dính vùng chọn `[start, end)` tới ranh giới từ (hỗ trợ tiếng Anh + Việt),
 * không bao giờ nới vượt qua `blockBreakOffsets` để tránh nối chữ giữa 2 đoạn.
 */
export function snapPassageSpan(
	model: Pick<PassageModel, "canonicalText" | "blockBreakOffsets">,
	start: number,
	end: number,
): { start: number; end: number } | null {
	const text = model.canonicalText;
	const breaks = model.blockBreakOffsets;
	let lo = Math.max(0, Math.min(text.length, Math.trunc(start)));
	let hi = Math.max(0, Math.min(text.length, Math.trunc(end)));
	if (lo >= hi) return null;

	while (lo < hi && !WORD_CHAR_RE.test(text[lo] ?? "")) lo += 1;
	while (hi > lo && !WORD_CHAR_RE.test(text[hi - 1] ?? "")) hi -= 1;
	if (lo >= hi) return null;

	while (lo > 0 && !breaks.has(lo) && WORD_CHAR_RE.test(text[lo - 1] ?? "")) {
		lo -= 1;
	}
	while (
		hi < text.length &&
		!breaks.has(hi) &&
		WORD_CHAR_RE.test(text[hi] ?? "")
	) {
		hi += 1;
	}
	return { start: lo, end: hi };
}

/** Trích đoạn tối đa `max` ký tự, tự chèn khoảng trắng tại các ranh giới block. */
export function getPassageExcerpt(
	model: Pick<PassageModel, "canonicalText" | "blockBreakOffsets">,
	start: number,
	end: number,
	max: number,
): string {
	const text = model.canonicalText;
	const lo = Math.max(0, Math.min(text.length, start));
	const hi = Math.max(lo, Math.min(text.length, end));
	let out = "";
	for (let i = lo; i < hi; i += 1) {
		if (i > lo && model.blockBreakOffsets.has(i)) {
			if (out.length > 0 && !/\s$/.test(out)) {
				out += " ";
			}
		}
		out += text[i] ?? "";
	}
	const collapsed = out.replace(/\s+/g, " ").trim();
	return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed;
}

function hasSafeBounds(start: number, end: number, maxLength: number): boolean {
	return (
		Number.isSafeInteger(start) &&
		Number.isSafeInteger(end) &&
		start >= 0 &&
		start < end &&
		end <= maxLength
	);
}

/** Chuẩn hoá danh sách annotation: sort tăng dần, chặn biên lỗi/ID xấu/chồng lấn, giới hạn độ dài & số lượng. */
export function normalizeReadingAnnotations(
	items: readonly ReadingAnnotation[],
	maxLength: number,
): ReadingAnnotation[] {
	if (!Number.isSafeInteger(maxLength) || maxLength <= 0) return [];
	const candidates: ReadingAnnotation[] = [];
	for (const item of items) {
		if (
			typeof item?.id !== "string" ||
			typeof item.note !== "string" ||
			!isValidReadingAnnotationId(item.id) ||
			!hasSafeBounds(item.start, item.end, maxLength)
		) {
			continue;
		}
		candidates.push({
			id: item.id,
			start: item.start,
			end: item.end,
			note: item.note.slice(0, READING_ANNOTATION_NOTE_MAX),
		});
	}
	candidates.sort((a, b) => a.start - b.start || a.end - b.end);

	const accepted: ReadingAnnotation[] = [];
	const seenIds = new Set<string>();
	let lastEnd = 0;
	for (const item of candidates) {
		if (accepted.length >= READING_ANNOTATION_MAX_ITEMS) break;
		if (seenIds.has(item.id)) continue;
		if (item.start < lastEnd) continue;
		seenIds.add(item.id);
		accepted.push(item);
		lastEnd = item.end;
	}
	return accepted;
}

export function defaultCreateAnnotationId(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return `hl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
	}
	return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortAnnotations(items: ReadingAnnotation[]): ReadingAnnotation[] {
	return [...items].sort((a, b) => a.start - b.start || a.end - b.end);
}

function carvePlainAroundRange(
	plain: ReadingAnnotation,
	cutStart: number,
	cutEnd: number,
	createId: () => string,
): ReadingAnnotation[] {
	const pieces: ReadingAnnotation[] = [];
	if (plain.start < cutStart) {
		pieces.push({
			id: plain.id,
			start: plain.start,
			end: Math.min(plain.end, cutStart),
			note: "",
		});
	}
	if (plain.end > cutEnd) {
		pieces.push({
			id: pieces.length === 0 ? plain.id : createId(),
			start: Math.max(plain.start, cutEnd),
			end: plain.end,
			note: "",
		});
	}
	return pieces;
}

/**
 * Tô sáng vùng `[start, end)`:
 * - Chỉ chạm các highlight không có ghi chú: gộp liền mạch thành 1 khoảng.
 * - Bao trọn đúng 1 highlight có ghi chú: mở rộng khoảng và giữ nguyên ghi chú.
 * - Cắt một phần / vắt qua ghi chú: giữ nguyên mọi highlight có ghi chú, chỉ tô các khoảng trống còn lại.
 */
export function applyHighlightSpan(
	items: readonly ReadingAnnotation[],
	start: number,
	end: number,
	createId: () => string = defaultCreateAnnotationId,
): ReadingAnnotation[] {
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		start >= end
	) {
		return [...items];
	}
	const nonOverlapping: ReadingAnnotation[] = [];
	const plainOverlaps: ReadingAnnotation[] = [];
	const notedOverlaps: ReadingAnnotation[] = [];

	for (const item of items) {
		if (item.start < end && start < item.end) {
			if (item.note.trim() !== "") {
				notedOverlaps.push(item);
			} else {
				plainOverlaps.push(item);
			}
		} else {
			nonOverlapping.push(item);
		}
	}

	if (notedOverlaps.length === 0) {
		let mergedStart = start;
		let mergedEnd = end;
		for (const p of plainOverlaps) {
			if (p.start < mergedStart) mergedStart = p.start;
			if (p.end > mergedEnd) mergedEnd = p.end;
		}
		const id = plainOverlaps[0]?.id ?? createId();
		return sortAnnotations([
			...nonOverlapping,
			{ id, start: mergedStart, end: mergedEnd, note: "" },
		]);
	}

	const singleNoted = notedOverlaps.length === 1 ? notedOverlaps[0] : undefined;
	if (singleNoted && start <= singleNoted.start && end >= singleNoted.end) {
		let mergedStart = Math.min(start, singleNoted.start);
		let mergedEnd = Math.max(end, singleNoted.end);
		for (const p of plainOverlaps) {
			if (p.start < mergedStart) mergedStart = p.start;
			if (p.end > mergedEnd) mergedEnd = p.end;
		}
		return sortAnnotations([
			...nonOverlapping,
			{
				id: singleNoted.id,
				start: mergedStart,
				end: mergedEnd,
				note: singleNoted.note,
			},
		]);
	}

	// Bảo toàn toàn bộ highlight có ghi chú; chỉ tô & gộp phần khoảng trống với plainOverlaps.
	const sortedNoted = sortAnnotations(notedOverlaps);
	const rawGaps: Array<{ start: number; end: number }> = [];
	let cursor = start;
	for (const n of sortedNoted) {
		if (n.start > cursor) {
			rawGaps.push({ start: cursor, end: Math.min(n.start, end) });
		}
		cursor = Math.max(cursor, n.end);
	}
	if (cursor < end) {
		rawGaps.push({ start: cursor, end });
	}

	// Hợp các plainOverlaps và rawGaps thành các khoảng plain không chồng lấn.
	const plainPool: Array<{ id?: string; start: number; end: number }> = [
		...plainOverlaps.map((p) => ({ id: p.id, start: p.start, end: p.end })),
		...rawGaps.map((g) => ({ start: g.start, end: g.end })),
	].sort((a, b) => a.start - b.start || a.end - b.end);

	const mergedPlains: ReadingAnnotation[] = [];
	for (const seg of plainPool) {
		const prev = mergedPlains[mergedPlains.length - 1];
		if (prev && seg.start <= prev.end) {
			prev.end = Math.max(prev.end, seg.end);
		} else {
			mergedPlains.push({
				id: seg.id ?? createId(),
				start: seg.start,
				end: seg.end,
				note: "",
			});
		}
	}

	return sortAnnotations([...nonOverlapping, ...sortedNoted, ...mergedPlains]);
}

/**
 * Thêm hoặc cập nhật ghi chú:
 * - Theo `id`: cập nhật nội dung ghi chú.
 * - Theo `[start, end)`:
 *   - Chồng ≥ 2 highlight đã có ghi chú → trả `{ ok: false, reason: "multiple_notes_overlap", items }`.
 *   - Chồng đúng 1 highlight đã có ghi chú → nới rộng theo hợp và cập nhật ghi chú (carve các plain overlaps xung quanh).
 *   - Không chạm ghi chú nào → carve các plain overlaps quanh `[start, end)` và chèn span mới (hoặc cập nhật tại chỗ nếu khớp biên).
 */
export function upsertNoteSpan(
	items: readonly ReadingAnnotation[],
	target: UpsertNoteTarget,
	note: string,
	createId: () => string = defaultCreateAnnotationId,
): UpsertNoteResult {
	const cleanNote = note.slice(0, READING_ANNOTATION_NOTE_MAX);

	if ("id" in target) {
		const exists = items.some((item) => item.id === target.id);
		if (!exists) {
			return { ok: false, reason: "not_found", items: [...items] };
		}
		return {
			ok: true,
			targetId: target.id,
			items: items.map((item) =>
				item.id === target.id ? { ...item, note: cleanNote } : item,
			),
		};
	}

	const { start, end } = target;
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		start >= end
	) {
		return { ok: false, reason: "invalid_span", items: [...items] };
	}

	const nonOverlapping: ReadingAnnotation[] = [];
	const plainOverlaps: ReadingAnnotation[] = [];
	const notedOverlaps: ReadingAnnotation[] = [];

	for (const item of items) {
		if (item.start < end && start < item.end) {
			if (item.note.trim() !== "") {
				notedOverlaps.push(item);
			} else {
				plainOverlaps.push(item);
			}
		} else {
			nonOverlapping.push(item);
		}
	}

	if (notedOverlaps.length >= 2) {
		return {
			ok: false,
			reason: "multiple_notes_overlap",
			items: [...items],
		};
	}

	const singleExisting = notedOverlaps[0];
	if (notedOverlaps.length === 1 && singleExisting) {
		const unionStart = Math.min(start, singleExisting.start);
		const unionEnd = Math.max(end, singleExisting.end);
		const carvedPlains = plainOverlaps.flatMap((p) =>
			carvePlainAroundRange(p, unionStart, unionEnd, createId),
		);
		return {
			ok: true,
			targetId: singleExisting.id,
			items: sortAnnotations([
				...nonOverlapping,
				...carvedPlains,
				{
					id: singleExisting.id,
					start: unionStart,
					end: unionEnd,
					note: cleanNote,
				},
			]),
		};
	}

	const firstPlain = plainOverlaps[0];
	const exactPlain =
		plainOverlaps.length === 1 &&
		firstPlain &&
		firstPlain.start === start &&
		firstPlain.end === end
			? firstPlain
			: undefined;
	if (exactPlain) {
		return {
			ok: true,
			targetId: exactPlain.id,
			items: sortAnnotations([
				...nonOverlapping,
				{ ...exactPlain, note: cleanNote },
			]),
		};
	}

	const newId = createId();
	const carvedPlains = plainOverlaps.flatMap((p) =>
		carvePlainAroundRange(p, start, end, createId),
	);
	return {
		ok: true,
		targetId: newId,
		items: sortAnnotations([
			...nonOverlapping,
			...carvedPlains,
			{ id: newId, start, end, note: cleanNote },
		]),
	};
}

/** Bỏ tô sáng trên `[start, end)` — hỗ trợ xoá toàn bộ, cắt bớt đầu/cuối, hoặc tách đôi highlight. */
export function removeHighlightRange(
	items: readonly ReadingAnnotation[],
	start: number,
	end: number,
	createId: () => string = defaultCreateAnnotationId,
): ReadingAnnotation[] {
	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(end) ||
		start < 0 ||
		start >= end
	) {
		return [...items];
	}
	const out: ReadingAnnotation[] = [];
	for (const item of items) {
		if (item.end <= start || item.start >= end) {
			out.push(item);
			continue;
		}
		if (item.start < start && item.end > end) {
			out.push({
				id: item.id,
				start: item.start,
				end: start,
				note: item.note,
			});
			out.push({
				id: createId(),
				start: end,
				end: item.end,
				note: "",
			});
		} else if (item.start < start) {
			out.push({
				id: item.id,
				start: item.start,
				end: start,
				note: item.note,
			});
		} else if (item.end > end) {
			out.push({
				id: item.id,
				start: end,
				end: item.end,
				note: item.note,
			});
		}
	}
	return sortAnnotations(out);
}

/** Tính offset kết thúc của đoạn leaf cuối cùng cho mỗi highlight (dùng `Map` chống prototype collision). */
export function computeLastSegmentEndById(
	nodes: readonly PassageAstNode[],
	annotations: readonly ReadingAnnotation[],
): Map<string, number> {
	const lastEnds = new Map<string, number>();
	if (annotations.length === 0) return lastEnds;

	const walk = (list: readonly PassageAstNode[]) => {
		for (const node of list) {
			if (node.kind === "text") {
				for (const ann of annotations) {
					if (ann.end <= node.start) continue;
					if (ann.start >= node.end) break;
					const segEnd = Math.min(node.end, ann.end);
					lastEnds.set(ann.id, segEnd);
				}
			} else {
				walk(node.children);
			}
		}
	};
	walk(nodes);
	return lastEnds;
}

/** Chia một text leaf thành các mảnh thường và mảnh highlight, gắn `isLastSegment` chính xác. */
export function splitLeafByAnnotations(
	leaf: PassageTextLeaf,
	annotations: readonly ReadingAnnotation[],
	lastSegmentEnds: ReadonlyMap<string, number>,
): LeafSlice[] {
	const slices: LeafSlice[] = [];
	let cursor = leaf.start;

	for (const ann of annotations) {
		if (ann.end <= leaf.start) continue;
		if (ann.start >= leaf.end) break;
		const segStart = Math.max(cursor, ann.start);
		const segEnd = Math.min(leaf.end, ann.end);
		if (segStart > cursor) {
			slices.push({
				start: cursor,
				end: segStart,
				text: leaf.text.slice(cursor - leaf.start, segStart - leaf.start),
				annotation: null,
				isLastSegment: false,
			});
		}
		if (segEnd > segStart) {
			slices.push({
				start: segStart,
				end: segEnd,
				text: leaf.text.slice(segStart - leaf.start, segEnd - leaf.start),
				annotation: ann,
				isLastSegment: lastSegmentEnds.get(ann.id) === segEnd,
			});
			cursor = segEnd;
		}
	}

	if (cursor < leaf.end) {
		slices.push({
			start: cursor,
			end: leaf.end,
			text: leaf.text.slice(cursor - leaf.start),
			annotation: null,
			isLastSegment: false,
		});
	}
	return slices;
}

function isInsideReadingUi(node: Node, root: HTMLElement): boolean {
	const el =
		node.nodeType === ELEMENT_NODE ? (node as Element) : node.parentElement;
	if (!el) return false;
	const ui = el.closest("[data-reading-ui]");
	return ui !== null && root.contains(ui);
}

/**
 * Ánh xạ DOM `Range` trong `root` sang khoảng offset `[start, end)` trên `model.canonicalText`.
 * Hỗ trợ đầy đủ boundary `TEXT_NODE` và `ELEMENT_NODE` (kể cả `offset === childNodes.length`),
 * bỏ qua toàn bộ subtree `[data-reading-ui="true"]`.
 */
export function readDomSelectionRange(
	root: HTMLElement,
	range: Range,
	model: Pick<PassageModel, "canonicalText">,
): { start: number; end: number } | null {
	if (
		!root.contains(range.startContainer) ||
		!root.contains(range.endContainer)
	) {
		return null;
	}
	if (
		isInsideReadingUi(range.startContainer, root) ||
		isInsideReadingUi(range.endContainer, root)
	) {
		return null;
	}

	let cursor = 0;
	let startOffset: number | null = null;
	let endOffset: number | null = null;

	const walk = (node: Node) => {
		if (node.nodeType === TEXT_NODE) {
			const text = node.nodeValue ?? "";
			const len = text.length;
			if (range.startContainer === node) {
				startOffset = cursor + Math.min(Math.max(0, range.startOffset), len);
			}
			if (range.endContainer === node) {
				endOffset = cursor + Math.min(Math.max(0, range.endOffset), len);
			}
			cursor += len;
			return;
		}
		if (node.nodeType !== ELEMENT_NODE) return;
		const el = node as Element;
		if (el !== root && el.hasAttribute("data-reading-ui")) {
			return;
		}
		const children = el.childNodes;
		for (let i = 0; i <= children.length; i += 1) {
			if (range.startContainer === el && range.startOffset === i) {
				startOffset = cursor;
			}
			if (range.endContainer === el && range.endOffset === i) {
				endOffset = cursor;
			}
			if (i < children.length) {
				const child = children[i];
				if (child) walk(child);
			}
		}
	};

	walk(root);

	if (startOffset === null || endOffset === null) return null;
	const lo = Math.max(0, Math.min(startOffset, endOffset));
	const hi = Math.min(
		model.canonicalText.length,
		Math.max(startOffset, endOffset),
	);
	if (lo >= hi) return null;
	if (model.canonicalText.slice(lo, hi).trim() === "") return null;
	return { start: lo, end: hi };
}
