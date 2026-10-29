/**
 * Chuẩn hoá bài viết Writing chứa HTML sang plain text kèm bản đồ offset
 * hai chiều `rawStart`/`rawEnd` (#382).
 *
 * Thuần chuỗi (không phụ thuộc DOM), chạy đồng nhất trên workerd lẫn browser.
 * KHÔNG idempotent với dữ liệu đã decode entity (`<p>&lt;p&gt;</p>` → `"<p>"`) —
 * chỉ gọi đúng một lần ở tầng server khi đọc từ DB.
 */

export type PlainEssayView = {
	text: string;
	/** null khi fast path (essay không chứa thẻ HTML đã biết). */
	rawStart: ReadonlyArray<number> | null;
	rawEnd: ReadonlyArray<number> | null;
	rawLength: number;
};

export type OffsetSpan = {
	start: number;
	end: number;
};

/**
 * Chỉ coi là HTML khi có thẻ đóng thuộc whitelist rich-text hoặc `<br>`/`<hr>`.
 * Văn bản plain có `a < b`, `"if a<b and c>d"`, `"x <i and y> z"`, `<3` không
 * khớp thẻ đóng nào nên đi qua fast path giữ nguyên từng byte.
 */
const HTML_DETECTION_RE =
	/<\/(?:p|div|li|h[1-6]|blockquote|pre|ul|ol|strong|em|b|i|u|s|sub|sup|span|a|code|script|style)\s*>|<(?:br|hr)\s*\/?>/i;

const COMMENT_RE = /^<!--[\s\S]*?-->/;
const IGNORED_BLOCK_RE = /^<(script|style)\b[^<>]*>[\s\S]*?<\/\1\s*>/i;
const TAG_RE = /^<\/?([A-Za-z][A-Za-z0-9:-]*)(?:\s[^<>]*)?\/?>/;
const ENTITY_RE = /^&(#\d+|#x[0-9a-fA-F]+|[A-Za-z]+);/;

const BLOCK_TAGS: Record<string, true> = {
	p: true,
	div: true,
	li: true,
	h1: true,
	h2: true,
	h3: true,
	h4: true,
	h5: true,
	h6: true,
	blockquote: true,
	pre: true,
	ul: true,
	ol: true,
	hr: true,
};

const NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: "\u00a0",
	rsquo: "\u2019",
	lsquo: "\u2018",
	rdquo: "\u201d",
	ldquo: "\u201c",
	mdash: "\u2014",
	ndash: "\u2013",
	hellip: "\u2026",
};

function decodeEntityBody(body: string): string | null {
	if (body.startsWith("#x") || body.startsWith("#X")) {
		const cp = Number.parseInt(body.slice(2), 16);
		if (
			!Number.isInteger(cp) ||
			cp <= 0 ||
			cp > 0x10ffff ||
			(cp >= 0xd800 && cp <= 0xdfff)
		) {
			return null;
		}
		return String.fromCodePoint(cp);
	}
	if (body.startsWith("#")) {
		const cp = Number.parseInt(body.slice(1), 10);
		if (
			!Number.isInteger(cp) ||
			cp <= 0 ||
			cp > 0x10ffff ||
			(cp >= 0xd800 && cp <= 0xdfff)
		) {
			return null;
		}
		return String.fromCodePoint(cp);
	}
	return NAMED_ENTITIES[body] ?? null;
}

/**
 * Chuyển `raw` sang plain text kèm bản đồ offset từng UTF-16 code unit.
 * Essay plain trả nguyên bản (`rawStart = rawEnd = null`).
 */
export function essayToPlain(raw: string): PlainEssayView {
	if (!HTML_DETECTION_RE.test(raw)) {
		return {
			text: raw,
			rawStart: null,
			rawEnd: null,
			rawLength: raw.length,
		};
	}

	const out: string[] = [];
	const rawStart: number[] = [];
	const rawEnd: number[] = [];
	let pendingBlockBreak: OffsetSpan | null = null;

	const pushChar = (ch: string, start: number, end: number) => {
		out.push(ch);
		rawStart.push(start);
		rawEnd.push(end);
	};

	const flushPendingBreakBeforeContent = () => {
		if (pendingBlockBreak === null) return;
		const brk = pendingBlockBreak;
		pendingBlockBreak = null;
		if (out.length > 0 && out[out.length - 1] !== "\n") {
			pushChar("\n", brk.start, brk.end);
		}
	};

	let i = 0;
	while (i < raw.length) {
		const ch = raw[i] ?? "";

		if (ch === "<") {
			const rest = raw.slice(i);

			const commentMatch = COMMENT_RE.exec(rest);
			if (commentMatch) {
				i += commentMatch[0].length;
				continue;
			}

			const ignoredMatch = IGNORED_BLOCK_RE.exec(rest);
			if (ignoredMatch) {
				i += ignoredMatch[0].length;
				continue;
			}

			const tagMatch = TAG_RE.exec(rest);
			if (tagMatch) {
				const tagName = (tagMatch[1] ?? "").toLowerCase();
				const tagEnd = i + tagMatch[0].length;
				if (tagName === "br") {
					pendingBlockBreak = null;
					pushChar("\n", i, tagEnd);
				} else if (BLOCK_TAGS[tagName]) {
					pendingBlockBreak = { start: i, end: tagEnd };
				}
				i = tagEnd;
				continue;
			}
			// Dấu `<` không khớp mẫu thẻ hợp lệ → rơi xuống nhánh text literal.
		}

		if (
			(ch === " " || ch === "\t" || ch === "\r" || ch === "\n") &&
			(out.length === 0 || pendingBlockBreak !== null)
		) {
			i += 1;
			continue;
		}

		flushPendingBreakBeforeContent();

		if (ch === "&") {
			const entityMatch = ENTITY_RE.exec(raw.slice(i));
			if (entityMatch) {
				const decoded = decodeEntityBody(entityMatch[1] ?? "");
				if (decoded !== null) {
					const entEnd = i + entityMatch[0].length;
					for (let k = 0; k < decoded.length; k += 1) {
						pushChar(decoded[k] ?? "", i, entEnd);
					}
					i = entEnd;
					continue;
				}
			}
		}

		pushChar(ch, i, i + 1);
		i += 1;
	}

	return {
		text: out.join(""),
		rawStart,
		rawEnd,
		rawLength: raw.length,
	};
}

function hasValidBounds(length: number, start: number, end: number): boolean {
	return (
		Number.isInteger(start) &&
		Number.isInteger(end) &&
		start >= 0 &&
		start < end &&
		end <= length
	);
}

/** Ánh xạ đoạn `[start, end)` trên `view.text` (plain) sang đoạn trên `raw`. */
export function plainToRaw(
	view: PlainEssayView,
	start: number,
	end: number,
): OffsetSpan | null {
	if (!hasValidBounds(view.text.length, start, end)) {
		return null;
	}
	if (view.rawStart === null || view.rawEnd === null) {
		return { start, end };
	}
	const rStart = view.rawStart[start];
	const rEnd = view.rawEnd[end - 1];
	if (rStart === undefined || rEnd === undefined || rStart >= rEnd) {
		return null;
	}
	return { start: rStart, end: rEnd };
}

/**
 * Ánh xạ đoạn `[start, end)` trên `raw` sang đoạn trên `view.text` (plain).
 * Trả `null` nếu đoạn nằm trọn trong thẻ HTML hoặc ngoài biên.
 */
export function rawToPlain(
	view: PlainEssayView,
	start: number,
	end: number,
): OffsetSpan | null {
	if (!hasValidBounds(view.rawLength, start, end)) {
		return null;
	}
	if (view.rawStart === null || view.rawEnd === null) {
		return { start, end };
	}
	const n = view.text.length;
	let lo = -1;
	let hi = -1;
	for (let i = 0; i < n; i += 1) {
		const rs = view.rawStart[i] ?? 0;
		const re = view.rawEnd[i] ?? 0;
		if (re > start && rs < end) {
			if (lo === -1) lo = i;
			hi = i;
		}
	}
	if (lo === -1 || hi === -1 || lo > hi) {
		return null;
	}
	return { start: lo, end: hi + 1 };
}
