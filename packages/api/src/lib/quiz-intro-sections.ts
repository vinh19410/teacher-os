/**
 * Tách `intro` của đề thành preamble + các section mở đầu bằng marker
 * "Questions X–Y" (#301). Hàm thuần, KHÔNG dùng DOM global: apps/student
 * chạy test với environment "node" nên phải cho cùng kết quả ở browser lẫn
 * node — tự strip tag + decode entity bằng helper nội bộ thay vì
 * `htmlToPlainText` (hai nhánh DOM/regex khác nhau).
 *
 * Trả về null khi không tách được (không có marker, range chồng/trùng/đảo
 * ngược/vượt số câu): caller giữ nguyên hành vi cũ — thà không tách còn hơn
 * tách sai.
 */

export interface QuizIntroSection {
	/** Số câu hiển thị 1-based theo assignment (đã trừ offset). */
	start: number;
	end: number;
	/** Phần instruction của giáo viên, đã bỏ marker; "" = chỉ có marker. */
	html: string;
}

export interface QuizIntroSplit {
	/** Nội dung trước marker đầu tiên ("" nếu không có). */
	preamble: string;
	sections: QuizIntroSection[];
}

/** Marker chỉ được nhận khi nằm ĐẦU block — "Answer questions 1–4 …" không
 * phải marker. Sau số cuối không được phép còn chữ số. */
const MARKER_RE =
	/^(?:questions?|câu)\s+(\d{1,3})(?:\s*(?:[-–—]|to|and)\s*(\d{1,3}))?(?!\d)/i;

/** Nhận diện HTML rich text (vs plain legacy) để chọn nhánh tách block. */
const TAG_RE = /<\/?[a-z][^>]*>/i;

/** Tokenize tag mở/đóng khi quét top-level HTML. */
const TOKEN_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

/** Tag trống không mở scope lồng nhau khi đếm độ sâu. */
const VOID_TAGS = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"source",
	"track",
	"wbr",
]);

const PARAGRAPH_RE = /^<p(\s[^>]*)?>([\s\S]*)<\/p>$/i;
const WRAPPER_RE = /^(<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>)([\s\S]*)(<\/\2\s*>)$/;
const BR_RE = /<br\s*\/?>/gi;

/** Xoá tiền tố marker khỏi block, kèm 1 dấu phân cách theo sau và `<br>`
 * nối dòng. Chấp nhận entity (`&nbsp;`, `&ndash;`, `&mdash;`, `&middot;`)
 * vì chạy trên HTML thô. */
const MARKER_STRIP_RE =
	/^(?:<[^>]+>\s*)*(?:questions?|câu)(?:\s|&nbsp;)+(?:\d{1,3})(?:\s*(?:[-–—]|to|and|&ndash;|&mdash;)\s*(?:\d{1,3}))?(?!\d)(?:\s*<\/[^>]+>)?\s*(?:[·:.\-–—]|&middot;|&ndash;|&mdash;)?\s*(?:<br\s*\/?>\s*)?/i;

/** Decode đúng các entity cần cho marker + separator (thứ tự giữ `&amp;`
 * cuối để không đụng chuỗi escape lồng nhau). */
function decodeEntities(text: string): string {
	return text
		.replace(/&nbsp;/g, " ")
		.replace(/&ndash;|&#8211;/g, "–")
		.replace(/&mdash;|&#8212;/g, "—")
		.replace(/&middot;/g, "·")
		.replace(/&amp;/g, "&");
}

/** Bỏ mọi tag rồi decode entity, trimStart — đầu vào để nhận marker. */
function leadingText(block: string): string {
	return decodeEntities(block.replace(/<[^>]+>/g, "")).trimStart();
}

function markerAt(block: string): { a: number; b: number } | null {
	const match = MARKER_RE.exec(leadingText(block));
	if (!match) return null;
	const a = Number(match[1]);
	const b = match[2] === undefined ? a : Number(match[2]);
	return { a, b };
}

/** Tách HTML thành các block top-level: mỗi phần tử là 1 block, text rời
 * giữa các phần tử cũng là 1 block. Đếm độ sâu theo TÊN THẺ để `<ul>` lồng
 * `<ul>` không bị cắt sai. */
function splitHtmlBlocks(html: string): string[] {
	const blocks: string[] = [];
	let textBuf = "";
	let elemBuf: string | null = null;
	let depth = 0;
	let pos = 0;
	for (const token of html.matchAll(TOKEN_RE)) {
		const raw = token[0];
		const name = (token[2] ?? "").toLowerCase();
		const isClose = token[1] === "/";
		const standalone = !isClose && (VOID_TAGS.has(name) || /\/>$/.test(raw));
		const text = html.slice(pos, token.index);
		pos = token.index + raw.length;
		if (elemBuf === null) {
			textBuf += text;
			if (!isClose && !standalone) {
				// Text rời trước phần tử là 1 block riêng.
				if (textBuf.trim() !== "") blocks.push(textBuf);
				textBuf = "";
				elemBuf = raw;
				depth = 1;
			} else {
				textBuf += raw;
			}
		} else {
			elemBuf += text + raw;
			if (!standalone) depth += isClose ? -1 : 1;
			if (depth === 0) {
				blocks.push(elemBuf);
				elemBuf = null;
			}
		}
	}
	// Tag chưa đóng thì thả phần dở thành block, tránh mất nội dung.
	if (elemBuf !== null) blocks.push(elemBuf);
	else if (textBuf.trim() !== "") blocks.push(textBuf);
	return blocks;
}

/** Block `<p>…</p>` chứa `<br>`: tách tại `<br>` nếu đoạn phía sau bắt đầu
 * bằng marker; mỗi đoạn được bọc lại thành `<p>…</p>`. */
function splitParagraphBlocks(block: string): string[] {
	const wrapper = PARAGRAPH_RE.exec(block.trim());
	if (!wrapper) return [block];
	const inner = wrapper[2] ?? "";
	const pieces: string[] = [];
	let buf = "";
	let pos = 0;
	let split = false;
	for (const br of inner.matchAll(BR_RE)) {
		buf += inner.slice(pos, br.index);
		pos = br.index + br[0].length;
		if (markerAt(inner.slice(pos)) !== null) {
			pieces.push(buf);
			buf = "";
			split = true;
		} else {
			buf += br[0];
		}
	}
	if (!split) return [block];
	buf += inner.slice(pos);
	pieces.push(buf);
	return pieces.map((piece) => `<p>${piece}</p>`);
}

/** Xoá marker khỏi block đã nhận diện: giữ tag mở/đóng bao ngoài, xoá luôn
 * 1 dấu phân cách theo sau (`·`, `:`, `.`, `-`, `–`, `—` kể cả entity). */
function stripMarker(block: string): string {
	const trimmed = block.trim();
	const wrapper = WRAPPER_RE.exec(trimmed);
	if (!wrapper) return trimmed.replace(MARKER_STRIP_RE, "");
	const inner = (wrapper[3] ?? "").replace(MARKER_STRIP_RE, "");
	return (wrapper[1] ?? "") + inner + (wrapper[4] ?? "");
}

export function splitQuizIntro(
	intro: string,
	questionCount: number,
): QuizIntroSplit | null {
	if (questionCount <= 0 || intro.trim() === "") return null;

	// Plain legacy (không tag) tách theo dòng; HTML tách theo block top-level.
	const isHtml = TAG_RE.test(intro);
	const joiner = isHtml ? "" : "\n";
	const blocks = isHtml
		? splitHtmlBlocks(intro).flatMap(splitParagraphBlocks)
		: intro.split("\n");

	// Gom block: trước marker đầu tiên là preamble, marker mở section mới.
	const preambleBlocks: string[] = [];
	const sections: Array<{ a: number; b: number; blocks: string[] }> = [];
	let currentSection: (typeof sections)[number] | null = null;
	for (const block of blocks) {
		const marker = markerAt(block);
		if (marker) {
			currentSection = { a: marker.a, b: marker.b, blocks: [block] };
			sections.push(currentSection);
		} else if (currentSection) {
			currentSection.blocks.push(block);
		} else {
			preambleBlocks.push(block);
		}
	}

	// Hợp lệ hoá strict: không marker / đảo ngược / chồng / trùng / vượt biên.
	const firstSection = sections[0];
	const lastSection = sections[sections.length - 1];
	if (!firstSection || !lastSection) return null;
	let prev: { a: number; b: number } | null = null;
	for (const section of sections) {
		if (section.a > section.b) return null;
		if (prev && section.a <= prev.b) return null;
		prev = section;
	}
	// Đề part 2 ghi "Questions 14–20" → học viên thấy câu 1–7 (offset).
	const offset = firstSection.a - 1;
	if (lastSection.b - offset > questionCount) return null;

	return {
		preamble: preambleBlocks.join(joiner).trim(),
		sections: sections.map((section) => {
			const [first = "", ...rest] = section.blocks;
			const stripped = stripMarker(first);
			// Block đầu chỉ còn marker (rỗng sau strip) thì bỏ block đó.
			const kept = leadingText(stripped) === "" ? rest : [stripped, ...rest];
			return {
				start: section.a - offset,
				end: section.b - offset,
				html: kept.join(joiner).trim(),
			};
		}),
	};
}
