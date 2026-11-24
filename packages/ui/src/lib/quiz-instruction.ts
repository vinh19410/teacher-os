import { extendedAnswerChoices } from "@teacher-os/api/contracts";
import type { QuizPart } from "@teacher-os/api/lib/quiz-parts";
import { collapseWhitespace } from "@teacher-os/api/rich-text";

export const COMPLETION_TYPE_REGEX: Record<string, RegExp> = {
	summary: /\bsummary\b/i,
	flow: /\bflow[\s-]?chart\b/i,
	flowchart: /\bflow[\s-]?chart\b/i,
	notes: /\bnotes?\b/i,
	note: /\bnotes?\b/i,
	sent: /\bsentences?\b/i,
	sent4: /\bsent4|\bsentences?\b/i,
	tablecomp: /\btable\b/i,
	form: /\bform\b/i,
	diagram: /\bdiagram|\bmap\b/i,
	shortans: /\banswer\s+the\s+questions?\b/i,
	fill_blank: /\bblank|\bfill\b/i,
};

/**
 * Tier-1 (specific/long) word-limit patterns evaluated in priority order so JS
 * RegExp leftmost-first matching never truncates `ONE WORD AND/OR A NUMBER` or
 * `ONE WORD ONLY` down to bare `ONE WORD`.
 */
const TIER1_WORD_LIMIT_PATTERNS: readonly RegExp[] = [
	/\b(no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?)\b/i,
	/\b(only\s+one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(?:choose|write|use|using|with)\s+(only\s+one\s+word)\b/i,
	/\b(only\s+one\s+word)\b(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))/i,
	/\b(one\s+word\s+only\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
	/\b(one\s+word\s+only)\b/i,
	/\b(one\s+or\s+two\s+words(?:\s+only)?)\b/i,
	/\b((?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i,
];

/**
 * Tier-2 (bare `ONE WORD`) patterns — only checked when Tier 1 returns null,
 * anchored to directive verbs or IELTS limit suffixes so ordinary prose such as
 * "Please change one word" never false-positives.
 */
const TIER2_WORD_LIMIT_PATTERNS: readonly RegExp[] = [
	/\b(?:choose|write|use|using|with)\s+(one\s+word)\b(?!\s+(?:only|and\s*\/\s*or|or)\b)/i,
	/\b(one\s+word)\b(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b))/i,
];

/** Backward-compatible combined word-limit regex for callers testing presence. */
export const WORD_LIMIT_REGEX =
	/\b(?:no\s+more\s+th[ae]n\s+(?:one|two|three|four|five|\d+)\s+words?(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|only\s+one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?|one\s+word\s+only(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+or\s+two\s+words(?:\s+only)?|(?:one|two|three|four|five|\d+)\s+words?\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?|(?:choose|write|use|using|with)\s+(?:only\s+)?one\s+word(?!\s+(?:only|and\s*\/\s*or|or)\b)|one\s+word(?=\s+(?:from\s+the\b|for\s+each\b|in\s+each\b|per\b)))\b/i;

/**
 * Matches the full word-limit phrase inside static `QUIZ_TYPE_DISPLAY`
 * fallbacks (`NO MORE THAN THREE WORDS AND/OR A NUMBER`, `NO MORE THAN THREE
 * WORDS`, `NO MORE THAN TWO WORDS`, `ONE WORD AND/OR A NUMBER`, `ONE WORD ONLY`)
 * so replacing with a narrower limit never leaves a dangling `AND/OR A NUMBER`.
 */
const FALLBACK_WORD_LIMIT_REGEX =
	/\b(?:no\s+more\s+than\s+(?:one|two|three|four|five|\d+)\s+words?(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+word\s+only(?:\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)?|one\s+word\s+(?:and\s*\/\s*or|or)\s+(?:a\s+)?numbers?)\b/i;

const FORBIDDEN_CONTAINER_TAGS = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"iframe",
	"svg",
	"math",
	"textarea",
	"title",
	"object",
]);

const BLOCK_BREAK_TAGS = new Set([
	"p",
	"div",
	"li",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"tr",
	"blockquote",
	"pre",
	"td",
	"th",
]);

const PAIRED_OR_VOID_HTML_RE =
	/<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img)\b(?:[^>"']|"[^"]*"|'[^']*')*>/i;
const BLOCK_TAG_START_RE =
	/^<(?:p|div|table|ul|ol|blockquote|h[1-6]|pre|hr)\b/i;
const BLOCK_TAG_TOKEN_RE =
	/<(\/?)(p|div|table|ul|ol|blockquote|h[1-6]|pre|hr)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

const WORD_BANK_DIRECTIVE_RE =
	/\b(?:list\s+of\s+(?:words|phrases)|from\s+the\s+(?:list|box)|box\s+below|list\s+below)\b/i;
const CASE_SENSITIVE_LETTER_BANK_RANGE_RE = /\bA\s*[-–—]\s*[B-T]\b/;
const STRICT_PREAMBLE_WORD_BANK_RE =
	/\b(?:list\s+of\s+(?:words|phrases)|from\s+the\s+(?:list|box)|box\s+below|list\s+below|using\s+(?:the\s+)?(?:list|words|letters?)[^.!?\n]{0,40}\bA\s*[-–—]\s*[B-T])\b/i;
const ANSWER_SHEET_BOX_RE =
	/^write\s+(?:your\s+)?answers?\s+in\s+(?:the\s+)?boxes?\b/i;
const INLINE_MARKER_RE =
	/\[(\d+)\]|<strong(?:\s[^>]*)?>\s*\((\d+)\)\s*<\/strong\s*>/gi;
const INLINE_SIBLING_BLOCK_RE = /^<(?:table|ul|ol|p|h[2-4])\b/i;
const VIETNAMESE_DIACRITIC_RE =
	/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

const TFNG_HEADER_RE =
	/^(?:do\s+the\s+following\s+statements?\s+agree\b|are\s+the\s+following\s+statements?\s+(?:true|yes)\b)/i;
const TFNG_BRIDGE_RE =
	/^(?:(?:write|choose|chose)\s*:?|(?:in\s+(?:the\s+)?boxes?\b[^\n]{0,120}(?:write|choose|chose)|on\s+your\s+answer\s+sheet\b[^\n]{0,120}(?:write|choose|chose))[\s:]*)$/i;
const TFNG_LEGEND_RE =
	/^(?:write\s+)?(true|false|yes|no|not\s+given)(?:\s*[-–—:]\s*|\s+)(?:if|when|the\s+statement|the\s+information|there\s+is|it\s+is)\b/i;

const PASSAGE_STRUCTURE_RE =
	/^(?:the\s+)?reading\s+passage(?:\s+\d+)?\s+(?:has|contains)\s+(?:\w+|\d+)\s+(?:paragraphs?|sections?)\b/i;
const PASSAGE_STRUCTURE_CLAUSE_RE =
	/(?:the\s+)?reading\s+passage(?:\s+\d+)?\s+(?:has|contains)\s+[^.!?\n]+[.!?]?/gi;
const LISTENING_MATCHING_LEAD_IN_RE =
	/^(?:what|which)\b[^\n]{0,160}\b(?:each\s+of\s+the\s+following|these)\b/i;

const HEADINGS_ANCHOR_RE =
	/\b(?:list\s+of\s+headings?|correct\s+headings?|suitable\s+headings?|heading\s+for\s+(?:each|paragraphs?|sections?)|match\s+(?:each\s+of\s+the\s+following\s+)?headings?)\b/i;
const INFO_POSITIONAL_ANCHOR_RE =
	/\bwhich\s+(?:paragraphs?|sections?)\s+(?:contains?|states?|has|mentions?)\s+(?:the\s+following\s+)?information\b|\bmatch\s+(?:each|the)\b[^.!?\n]{1,80}\bwith\s+(?:the\s+)?(?:(?:correct|appropriate)\s+)?(?:paragraphs?|sections?)\b(?=\s*(?:[,.;:!?]|$|A\s*[-–—]\s*[B-T]\b|in\s+boxes?\b))/i;
const SENTEND_ANCHOR_RE =
	/\bcomplete\s+(?:each|the(?:\s+following)?)\s+sentences?\s+with\s+(?:the\s+)?(?:correct|best)\s+(?:endings?|letters?)\b/i;
const MAP_ANCHOR_RE = /\blabel\s+the\s+(?:map|plan|floor\s*plan)\b/i;
const CHOOSE_FROM_BOX_RE =
	/\bchoose\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:correct|appropriate|best)\s+)?(?:answers?|letters?|options?)\s+from\s+the\s+(?:box|list)\b/i;
const LOOK_AT_FOLLOWING_RE = /^look\s+at\s+the\s+following\b/i;
const MATCH_VERB_TAIL_RE = /^match\s+(?:each|the)\b/i;
const NAMED_MATCHING_DIRECT_RE =
	/\b(?:match\s+(?:each|the)\b[^.!?\n]{1,100}\bwith\b|use\s+the\s+information\s+in\s+the\s+passage\s+to\s+match|classify\s+the\s+following|choose\s+your\s+answers?\s+from\s+the\s+option\s+bank)\b/i;
const PERSON_COMPANY_HINT_RE =
	/\b(?:people|persons?|researchers?|scientists?|writers?|authors?|inventors?|compan(?:y|ies)|experts?|economists?|historians?|psychologists?)\b/i;

const MATCHING_TAIL_DIRECTIVE_RE =
	/^(?:choose|write)\s+(?:the\s+)?(?:correct|appropriate)\s+(?:heading|number|letter|ending|option|person|place|location|researcher|date|event|answer)s?\b/i;
const MATCHING_TAIL_NB_RE =
	/^(?:nb\b[:.\s]?|you\s+may\s+(?:use|choose)\s+any\s+letter\s+more\s+than\s+once\b)/i;
const MATCHING_TAIL_BOXES_RE =
	/^(?:write|choose)\s+(?:your\s+|the\s+(?:correct|appropriate)\s+)?(?:letters?|answers?|numbers?)\s+in\s+(?:the\s+)?boxes?\b/i;
const HEADINGS_DONE_EXAMPLE_RE =
	/^one\s+of\s+the\s+headings\s+has\s+been\s+done\b/i;
const HEADINGS_EXAMPLE_HEADER_RE = /^example(?:\s+answer)?[:.\s]*$/i;
const HEADINGS_EXAMPLE_INLINE_RE = /^example(?:\s+answer)?\s*:/i;
const HEADINGS_EXAMPLE_PARAGRAPH_RE = /^(?:paragraph|section)\s+[A-Z]\b/i;

const MCQ_MANY_ANCHOR_RE =
	/\b(?:choose|select|pick)\s+(?:two|three|four|five|\d+)\s+(?:(?:correct|appropriate|best)\s+)?(?:letters?|answers?|options?)\b/i;
const MCQ_MANY_WHICH_RE = /^which\s+(?:two|three|four|five|\d+)\b/i;
const MCQ_MANY_NEGATIVE_RE =
	/\bfrom\s+the\s+(?:box|list)\b|\bnext\s+to\s+questions?\b|\bwrite\s+the\s+correct\s+letter,?\s*A\s*[-–—]/i;
const MCQ_MANY_TAIL_NB_RE = /^nb\b[^\n]{0,120}\bany\s+order\b/i;

const MCQ_SINGLE_ANCHOR_RE = /^choose\s+the\s+correct\s+(?:letter|answer)\b/i;
const MCQ_SINGLE_NEGATIVE_RE =
	/\b(?:two|three|four|five|headings?|endings?)\b|\bfrom\s+the\s+(?:list|box)\b/i;
const LETTER_RANGE_TOKEN_RE = /\bA\s*[-–—]\s*([B-T])\b/g;
const ANY_LETTER_RANGE_RE = /\b[A-T]\s*[-–—]\s*[B-T]\b/;
const ENUMERATED_LETTERS_RE =
	/\bA((?:\s*,\s*[B-T]){0,18})\s*(?:,?\s*or\s+|\s*&\s*)([B-T])\b/g;
const ROMAN_RANGE_TOKEN_RE = /\bi\s*(?:[-–—]|to)\s*([ivx]{1,5})\b/g;

const MAX_INLINE_SCAN_BLOCKS = 30;
const MAX_LEAD_IN_WITHOUT_MARKER = 2;

const DEDICATED_NAMED_MATCHING_TYPES: readonly string[] = [
	"features",
	"match_names",
	"matching",
	"match2",
	"match",
];
const PERSON_FIRST_MATCHING_TYPES: readonly string[] = [
	"match_names",
	"features",
	"matching",
	"match2",
	"match",
];

const REQUIRED_BANK_TYPES_BY_SKILL: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	reading: new Set([
		"headings",
		"info",
		"features",
		"match_names",
		"matching",
		"sentend",
	]),
	listening: new Set([
		"match2",
		"matching",
		"info",
		"match_names",
		"features",
		"map",
	]),
	vocabulary: new Set(["match"]),
};

const OPTIONAL_BANK_TYPES_BY_SKILL: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	reading: new Set(["summary"]),
	listening: new Set(["summary", "flow"]),
};

function decodeBasicEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&ndash;|&#8211;/gi, "–")
		.replace(/&mdash;|&#8212;/gi, "—")
		.replace(/&middot;/gi, "·")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&amp;/gi, "&");
}

function escapePlainHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function isAsciiLetter(code: number): boolean {
	return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isTagNameChar(code: number): boolean {
	return (
		isAsciiLetter(code) || (code >= 48 && code <= 57) || code === 45 // '-'
	);
}

/**
 * Single-pass linear O(N) HTML-to-plain-text scanner consistent in both DOM and
 * Node environments:
 * - Strips HTML comments (`<!-- ... -->`, including unclosed comments).
 * - Strips forbidden/non-visible container elements (`script`, `style`,
 *   `noscript`, `template`, `iframe`, `svg`, `math`, `textarea`, `title`,
 *   `object`, `embed`) along with their content (including unclosed tags).
 * - Skips HTML tags while honoring single/double quoted attributes so `>`
 *   inside attribute values never leaks as visible text.
 */
function toAsciiLower(input: string): string {
	// ASCII-only lowercasing preserves 1-to-1 UTF-16 indices (avoids length drift on U+0130 'İ').
	return input.replace(/[A-Z]/g, (ch) => ch.toLowerCase());
}

function toSafePlainText(input: string): string {
	const len = input.length;
	if (len === 0) return "";
	if (!input.includes("<")) {
		return collapseWhitespace(decodeBasicEntities(input));
	}

	const lower = toAsciiLower(input);
	let out = "";
	let i = 0;

	while (i < len) {
		const lt = input.indexOf("<", i);
		if (lt === -1) {
			out += input.slice(i);
			break;
		}
		if (lt > i) {
			out += input.slice(i, lt);
		}

		// HTML comment
		if (input.startsWith("<!--", lt)) {
			const commentEnd = input.indexOf("-->", lt + 4);
			if (commentEnd === -1) break;
			out += " ";
			i = commentEnd + 3;
			continue;
		}

		// Parse tag start
		let pos = lt + 1;
		if (pos >= len) {
			out += "<";
			break;
		}

		const firstCode = input.charCodeAt(pos);
		const isClose = firstCode === 47; // '/'
		if (isClose) {
			pos += 1;
		} else if (firstCode === 33 || firstCode === 63) {
			// Declaration / PI (e.g. <!DOCTYPE ...>, <?xml ...?>)
			const closeIdx = input.indexOf(">", pos + 1);
			if (closeIdx === -1) break;
			i = closeIdx + 1;
			continue;
		}

		if (pos >= len || !isAsciiLetter(input.charCodeAt(pos))) {
			out += "<";
			i = lt + 1;
			continue;
		}

		const nameStart = pos;
		while (pos < len && isTagNameChar(input.charCodeAt(pos))) {
			pos += 1;
		}
		const tagName = lower.slice(nameStart, pos);

		// Scan attributes respecting quotes
		let quote: string | null = null;
		let tagEnd = -1;
		while (pos < len) {
			const ch = input[pos];
			if (quote !== null) {
				if (ch === quote) quote = null;
			} else if (ch === '"' || ch === "'") {
				quote = ch;
			} else if (ch === ">") {
				tagEnd = pos;
				break;
			}
			pos += 1;
		}

		if (tagEnd === -1) {
			// Unclosed tag at EOF — never leak attribute text
			break;
		}

		const isSelfClosing = !isClose && input[tagEnd - 1] === "/";
		// In HTML5, only foreign elements (<svg/>, <math/>) self-close; HTML raw-text/container tags like <style/> do not.
		const isForeignSelfClosing =
			isSelfClosing && (tagName === "svg" || tagName === "math");

		if (
			!isClose &&
			!isForeignSelfClosing &&
			FORBIDDEN_CONTAINER_TAGS.has(tagName)
		) {
			const closeMarker = `</${tagName}`;
			let searchFrom = tagEnd + 1;
			let closeEnd = -1;
			while (searchFrom < len) {
				const found = lower.indexOf(closeMarker, searchFrom);
				if (found === -1) break;
				const afterName = found + closeMarker.length;
				const nextCh = lower[afterName];
				if (
					nextCh === ">" ||
					nextCh === " " ||
					nextCh === "\t" ||
					nextCh === "\n" ||
					nextCh === "\r" ||
					nextCh === "/"
				) {
					const gt = input.indexOf(">", afterName);
					closeEnd = gt === -1 ? len : gt + 1;
					break;
				}
				searchFrom = afterName;
			}
			out += " ";
			i = closeEnd === -1 ? len : closeEnd;
			continue;
		}

		if (tagName === "br" || BLOCK_BREAK_TAGS.has(tagName)) {
			out += " ";
		}
		i = tagEnd + 1;
	}

	return collapseWhitespace(decodeBasicEntities(out));
}

/** True when an instruction string has no visible text after stripping unsafe markup. */
export function isEffectivelyEmptyInstruction(
	input: string | null | undefined,
): boolean {
	if (!input) return true;
	return toSafePlainText(input).length === 0;
}

/**
 * True when a letter option bank only enumerates sequential passage sections
 * (`A, B, C...`, `Paragraph A, Paragraph B...`, or `Section A, Section B...`)
 * rather than named options (e.g. places, sub-families, researchers).
 */
export function isPositionalSectionBank(bank: readonly string[]): boolean {
	if (bank.length === 0 || bank.length > 20) return false;
	const alphabet = extendedAnswerChoices("letter");
	return bank.every((entry, index) => {
		const normalized = entry
			.trim()
			.replace(/^(?:paragraph|section)\s+/i, "")
			.trim()
			.toUpperCase();
		return normalized === (alphabet[index] ?? "").toUpperCase();
	});
}

/**
 * Extracts and normalizes an IELTS word-limit phrase (e.g. `ONE WORD`,
 * `NO MORE THAN TWO WORDS`, `ONE WORD AND/OR A NUMBER`) from plain text or
 * HTML. Strips markup/hidden containers first and evaluates Tier-1 specific
 * patterns before anchored Tier-2 bare `ONE WORD`.
 */
export function extractWordLimit(text: string): string | null {
	const plain = toSafePlainText(text);
	if (!plain) return null;

	for (const pattern of TIER1_WORD_LIMIT_PATTERNS) {
		const match = pattern.exec(plain);
		if (match?.[1]) {
			return normalizeWordLimit(match[1]);
		}
	}
	for (const pattern of TIER2_WORD_LIMIT_PATTERNS) {
		const match = pattern.exec(plain);
		if (match?.[1]) {
			return normalizeWordLimit(match[1]);
		}
	}
	return null;
}

function normalizeWordLimit(raw: string): string {
	return raw
		.toUpperCase()
		.replace(/\bNO\s+MORE\s+THEN\b/g, "NO MORE THAN")
		.replace(/\s*\/\s*/g, "/")
		.replace(/\s+/g, " ")
		.trim();
}

export interface ResolvePartInstructionOptions {
	partBank?: readonly string[];
	/** False when `partBank` comes from an unpartitioned multi-group bank so we avoid emitting fabricated ranges. */
	isBankScoped?: boolean;
	matchedInstruction?: string | null;
	contextIntro?: string;
}

/**
 * Suy luận dòng hướng dẫn hiển thị cho một part (cụm/nhóm câu):
 * 1. Nếu có matchedInstruction từ intro được gán riêng cho part -> dùng luôn (unwrap `<p>` đơn an toàn).
 * 2. Nếu là summary/flow có Word Bank (partBank.length > 0) -> dùng hướng dẫn chọn từ danh sách thay vì "from the passage".
 * 3. Nếu là MCQ -> điều chỉnh A or B, A, B or C theo số lượng opts.
 * 4. Nếu là dạng completion và có chỉ thị giới hạn từ (trong contextIntro) -> thay trọn cụm giới hạn từ.
 * 5. Nếu là dạng matching (`headings`, `info`, `sentend`, `map`, `match2`, `match`):
 *    - Khi `isBankScoped === false` -> trả chuỗi trung tính không hardcode dải `i–viii`/`A–H`.
 *    - Khi `partBank` cô lập (2..20 mục) -> co giãn dải La Mã/chữ cái thực tế và phân biệt `info` đoạn văn vs danh sách có tên.
 * 6. Fallback về chuỗi mặc định.
 */
export function resolvePartInstruction(
	typeId: string,
	questions: ReadonlyArray<{
		type?: string | null;
		opts?: readonly string[] | null;
	}>,
	fallback: string,
	options?: ResolvePartInstructionOptions,
): string {
	if (
		options?.matchedInstruction &&
		!isEffectivelyEmptyInstruction(options.matchedInstruction)
	) {
		const raw = options.matchedInstruction.trim();
		// Chỉ bỏ thẻ bọc khi là MỘT thẻ <p>...</p> đơn (chống unwrap tham lam nhiều <p>).
		const pMatch = /^<p(?:\s[^>]*)?>([\s\S]*)<\/p\s*>$/i.exec(raw);
		if (pMatch && !/<\/p\b/i.test(pMatch[1] ?? "")) {
			return pMatch[1]?.trim() ?? raw;
		}
		return raw;
	}

	const hasBank = Boolean(options?.partBank && options.partBank.length > 0);
	if (
		(typeId === "summary" || typeId === "flow" || typeId === "flowchart") &&
		hasBank &&
		options?.isBankScoped !== false
	) {
		return typeId === "summary"
			? "Complete the summary using the list of words below."
			: "Complete the flow-chart using the list of words below.";
	}

	if (typeId === "mcq") {
		const mcqQuestions = questions.filter((q) => (q.type ?? typeId) === "mcq");
		if (mcqQuestions.length === 0) return fallback;
		const counts = new Set(
			mcqQuestions.map((q) =>
				q.opts?.length ? Math.min(q.opts.length, 4) : 4,
			),
		);
		if (counts.size === 1) {
			if (counts.has(2)) return "Choose the correct letter A or B.";
			if (counts.has(3)) return "Choose the correct letter A, B or C.";
			return fallback;
		}
		return "Choose the correct letter.";
	}

	const isCompletionType = typeId in COMPLETION_TYPE_REGEX;
	if (isCompletionType && options?.contextIntro) {
		const limitText = extractWordLimit(options.contextIntro);
		if (limitText && FALLBACK_WORD_LIMIT_REGEX.test(fallback)) {
			return fallback.replace(FALLBACK_WORD_LIMIT_REGEX, limitText);
		}
	}

	if (
		typeId === "headings" ||
		typeId === "info" ||
		typeId === "sentend" ||
		typeId === "map" ||
		typeId === "match2" ||
		typeId === "match"
	) {
		if (options?.isBankScoped === false) {
			switch (typeId) {
				case "headings":
					return "Choose the correct heading for each paragraph from the list of headings.";
				case "info":
					return "Match each item with the correct section or option. Write the correct letter.";
				case "sentend":
					return "Complete each sentence with the correct ending.";
				case "map":
					return "Label the map below. Write the correct letter for each location.";
				case "match2":
				case "match":
					return "Choose your answers from the option bank.";
			}
		}

		const bank = options?.partBank;
		if (bank && bank.length >= 2 && bank.length <= 20) {
			if (typeId === "headings") {
				const lastRoman = extendedAnswerChoices("roman")[bank.length - 1];
				if (lastRoman) {
					return `Choose the correct heading for each paragraph from the list of headings. Write the correct roman numeral i–${lastRoman}.`;
				}
			} else {
				const lastLetter = extendedAnswerChoices("letter")[bank.length - 1];
				if (lastLetter) {
					switch (typeId) {
						case "info":
							return isPositionalSectionBank(bank)
								? `Which section contains the following information? Write the correct letter A–${lastLetter}.`
								: `Match each item with the correct option from the list below. Write the correct letter A–${lastLetter}.`;
						case "sentend":
							return `Complete each sentence with the correct ending A–${lastLetter}.`;
						case "map":
							return `Label the map below. Write the correct letter A–${lastLetter} for each location.`;
						case "match2":
						case "match":
							return `Choose your answers from the option bank A–${lastLetter}.`;
					}
				}
			}
		}
	}

	return fallback;
}

/**
 * Splits mixed HTML + plain-text intros into top-level blocks:
 * - Only block-level HTML tags (`p|div|table|ul|ol|blockquote|h1-h6|pre|hr`)
 *   form HTML block boundaries so inline tags like `<strong>ONE WORD</strong>`
 *   stay attached to their sentence.
 * - Text segments outside block tags are split on `\n` so flattened
 *   `part.intro` + `group.instruction` lines remain independently inspectable.
 * - Unclosed block tags never swallow subsequent sibling blocks.
 */
function splitMixedIntroBlocks(input: string): string[] {
	const trimmed = input.trim();
	if (!trimmed) return [];

	if (!PAIRED_OR_VOID_HTML_RE.test(trimmed)) {
		return trimmed
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);
	}

	const blocks: string[] = [];
	const pushPlainLines = (segment: string) => {
		for (const line of segment.split(/\r?\n/)) {
			const cleanLine = line.trim();
			if (cleanLine) blocks.push(cleanLine);
		}
	};

	const stack: Array<{ tag: string; start: number }> = [];
	let cursor = 0;

	for (const match of trimmed.matchAll(BLOCK_TAG_TOKEN_RE)) {
		const raw = match[0];
		const isClose = match[1] === "/";
		const tag = (match[2] ?? "").toLowerCase();
		const index = match.index ?? 0;
		const isSelfClosing = !isClose && (tag === "hr" || /\/>$/.test(raw));

		if (stack.length === 0) {
			if (!isClose) {
				if (index > cursor) {
					pushPlainLines(trimmed.slice(cursor, index));
				}
				if (isSelfClosing) {
					blocks.push(raw);
					cursor = index + raw.length;
				} else {
					stack.push({ tag, start: index });
				}
			}
			continue;
		}

		if (!isClose) {
			// HTML5 auto-closes an unclosed <p> whenever another block tag opens.
			const top = stack[stack.length - 1];
			if (top?.tag === "p") {
				stack.pop();
				if (stack.length === 0) {
					const implicitP = trimmed.slice(top.start, index).trim();
					if (implicitP) blocks.push(implicitP);
					cursor = index;
					if (isSelfClosing) {
						blocks.push(raw);
						cursor = index + raw.length;
					} else {
						stack.push({ tag, start: index });
					}
					continue;
				}
			}
			if (!isSelfClosing) {
				stack.push({ tag, start: index });
			}
			continue;
		}

		// Close matching tag from top of stack; if mismatched, unwind to nearest match.
		let matchIdx = -1;
		for (let k = stack.length - 1; k >= 0; k -= 1) {
			if (stack[k]?.tag === tag) {
				matchIdx = k;
				break;
			}
		}
		if (matchIdx === -1) continue;

		const popped = stack[matchIdx];
		stack.length = matchIdx;
		if (stack.length === 0 && popped) {
			blocks.push(trimmed.slice(popped.start, index + raw.length).trim());
			cursor = index + raw.length;
		}
	}

	// Trailing unclosed block or remaining plain text.
	if (stack.length > 0 && stack[0]) {
		pushPlainLines(trimmed.slice(stack[0].start));
	} else if (cursor < trimmed.length) {
		pushPlainLines(trimmed.slice(cursor));
	}

	return blocks.filter(Boolean);
}

function joinMixedBlocks(blocks: readonly string[]): string {
	if (blocks.length === 0) return "";
	const hasAnyHtml = blocks.some((b) => PAIRED_OR_VOID_HTML_RE.test(b));
	if (!hasAnyHtml) {
		return blocks.join("\n");
	}
	return blocks
		.map((block) => {
			const trimmed = block.trim();
			if (BLOCK_TAG_START_RE.test(trimmed)) return trimmed;
			if (PAIRED_OR_VOID_HTML_RE.test(trimmed)) return `<p>${trimmed}</p>`;
			return `<p>${escapePlainHtml(trimmed)}</p>`;
		})
		.join("");
}

function splitOwnInstructionLines(html: string): string[] {
	const lines: string[] = [];
	for (const block of splitMixedIntroBlocks(html)) {
		const whole = toSafePlainText(block);
		if (whole) lines.push(whole);
		for (const piece of block.split(/<br\s*\/?>/gi)) {
			const clean = toSafePlainText(piece);
			if (clean) lines.push(clean);
		}
	}
	return lines;
}

function extractInlineMarkerNumbers(block: string): number[] {
	const numbers: number[] = [];
	for (const match of block.matchAll(INLINE_MARKER_RE)) {
		const raw = match[1] ?? match[2];
		if (!raw) continue;
		const num = Number.parseInt(raw, 10);
		if (Number.isSafeInteger(num) && num >= 1) {
			numbers.push(num);
		}
	}
	return numbers;
}

function hasOrderedTokens(
	text: string,
	first: RegExp,
	second: RegExp,
	third: RegExp,
): boolean {
	const m1 = first.exec(text);
	if (!m1) return false;
	const after1 = text.slice(m1.index + m1[0].length);
	const m2 = second.exec(after1);
	if (!m2) return false;
	const after2 = after1.slice(m2.index + m2[0].length);
	return third.test(after2);
}

function isTfngSelfContained(clean: string): "tfng" | "ynng" | null {
	const hasCondition =
		/\b(?:if|when)\b/i.test(clean) || TFNG_HEADER_RE.test(clean);
	if (!hasCondition) return null;
	if (hasOrderedTokens(clean, /\btrue\b/i, /\bfalse\b/i, /\bnot\s+given\b/i)) {
		return "tfng";
	}
	if (hasOrderedTokens(clean, /\byes\b/i, /\bno\b/i, /\bnot\s+given\b/i)) {
		return "ynng";
	}
	return null;
}

function detectTfngCluster(
	blocks: readonly string[],
	cleans: readonly string[],
	startIdx: number,
): { endIdx: number; targetType: "tfng" | "ynng" } | null {
	const clean = cleans[startIdx] ?? "";
	if (!clean) return null;

	const selfKind = isTfngSelfContained(clean);
	if (selfKind) {
		return { endIdx: startIdx, targetType: selfKind };
	}

	const isHeader = TFNG_HEADER_RE.test(clean);
	const isBridgeStart =
		TFNG_BRIDGE_RE.test(clean) &&
		startIdx + 1 < cleans.length &&
		TFNG_LEGEND_RE.test(cleans[startIdx + 1] ?? "");

	if (!isHeader && !isBridgeStart) return null;

	let endIdx = startIdx;
	let sawTf = false;
	let sawYn = false;
	let sawLegend = false;

	for (let j = startIdx + 1; j < blocks.length; j += 1) {
		const nextClean = cleans[j] ?? "";
		if (!nextClean) break;
		const legendMatch = TFNG_LEGEND_RE.exec(nextClean);
		if (legendMatch) {
			const label = (legendMatch[1] ?? "").toLowerCase();
			if (label === "true" || label === "false") sawTf = true;
			if (label === "yes" || label === "no") sawYn = true;
			sawLegend = true;
			endIdx = j;
			if (label === "not given") {
				break;
			}
			continue;
		}
		if (!sawLegend && TFNG_BRIDGE_RE.test(nextClean)) {
			endIdx = j;
			continue;
		}
		break;
	}

	const targetType: "tfng" | "ynng" = sawTf
		? "tfng"
		: sawYn
			? "ynng"
			: /\b(?:yes|views?\s+of\s+the\s+writer|claims?\s+of\s+the\s+writer)\b/i.test(
						clean,
					)
				? "ynng"
				: "tfng";

	return { endIdx, targetType };
}

type MatchingAnchorKind =
	| "headings"
	| "info_positional"
	| "sentend"
	| "map"
	| "named";

function classifyMatchingLine(
	clean: string,
	nextClean: string,
): MatchingAnchorKind | null {
	if (!clean) return null;
	if (HEADINGS_ANCHOR_RE.test(clean)) return "headings";
	if (INFO_POSITIONAL_ANCHOR_RE.test(clean)) return "info_positional";
	if (SENTEND_ANCHOR_RE.test(clean)) return "sentend";
	if (extractWordLimit(clean) === null && MAP_ANCHOR_RE.test(clean)) {
		return "map";
	}
	if (CHOOSE_FROM_BOX_RE.test(clean) || NAMED_MATCHING_DIRECT_RE.test(clean)) {
		return "named";
	}
	if (
		LOOK_AT_FOLLOWING_RE.test(clean) &&
		(/\blist\s+of\b/i.test(clean) || MATCH_VERB_TAIL_RE.test(nextClean))
	) {
		return "named";
	}
	return null;
}

function isMatchingAnchorAt(
	cleans: readonly string[],
	idx: number,
): MatchingAnchorKind | null {
	const clean = cleans[idx] ?? "";
	const nextClean = cleans[idx + 1] ?? "";
	const direct = classifyMatchingLine(clean, nextClean);
	if (direct) return direct;
	if (PASSAGE_STRUCTURE_RE.test(clean) && nextClean) {
		const nextKind = classifyMatchingLine(nextClean, cleans[idx + 2] ?? "");
		if (nextKind === "headings" || nextKind === "info_positional") {
			return nextKind;
		}
	}
	if (
		LISTENING_MATCHING_LEAD_IN_RE.test(clean) &&
		nextClean &&
		CHOOSE_FROM_BOX_RE.test(nextClean)
	) {
		return "named";
	}
	return null;
}

function isMcqAnchorAt(clean: string): "mcq_many" | "mcq_single" | null {
	if (!clean) return null;
	if (
		(MCQ_MANY_ANCHOR_RE.test(clean) || MCQ_MANY_WHICH_RE.test(clean)) &&
		!MCQ_MANY_NEGATIVE_RE.test(clean)
	) {
		return "mcq_many";
	}
	if (
		MCQ_SINGLE_ANCHOR_RE.test(clean) &&
		!MCQ_SINGLE_NEGATIVE_RE.test(clean) &&
		!ANY_LETTER_RANGE_RE.test(clean)
	) {
		return "mcq_single";
	}
	return null;
}

function findMatchingTargetIndex(
	kind: MatchingAnchorKind,
	anchorClean: string,
	missingParts: readonly QuizPart[],
): number {
	switch (kind) {
		case "headings":
			return missingParts.findIndex((p) => p.typeId === "headings");
		case "info_positional":
			return missingParts.findIndex((p) => p.typeId === "info");
		case "sentend":
			return missingParts.findIndex((p) => p.typeId === "sentend");
		case "map":
			return missingParts.findIndex((p) => p.typeId === "map");
		case "named": {
			const preferred = PERSON_COMPANY_HINT_RE.test(anchorClean)
				? PERSON_FIRST_MATCHING_TYPES
				: DEDICATED_NAMED_MATCHING_TYPES;
			for (const preferredType of preferred) {
				const found = missingParts.findIndex((p) => p.typeId === preferredType);
				if (found !== -1) return found;
			}
			return missingParts.findIndex((p) => p.typeId === "info");
		}
	}
}

function isAnotherCompletionAnchor(
	clean: string,
	currentTypeId: string,
): boolean {
	if (TFNG_HEADER_RE.test(clean)) return true;
	const hasAction =
		/\bcomplete\b|\banswer\s+the\s+questions?\b|\blabel\b|\bfill\b/i.test(
			clean,
		);
	if (!hasAction) return false;
	for (const [typeKey, regex] of Object.entries(COMPLETION_TYPE_REGEX)) {
		if (typeKey === currentTypeId) continue;
		if (
			currentTypeId === "fill_blank" &&
			(typeKey === "shortans" ||
				typeKey === "notes" ||
				typeKey === "note" ||
				typeKey === "diagram")
		) {
			continue;
		}
		if (regex.test(clean)) return true;
	}
	return false;
}

/**
 * Bounded sibling scan for inline `[N]` / `<strong>(N)</strong>` body blocks:
 * - Disabled for `headings` (headings match passage paragraphs, never inline cloze).
 * - Caps total scanned blocks and consecutive non-marker lead-ins.
 * - Stops on Vietnamese notes or any other group anchor.
 * - Rejects marker ranges belonging strictly to another missing part at delta=0.
 */
function scanInlineSiblingEndIdx(
	blocks: readonly string[],
	cleans: readonly string[],
	endIdx: number,
	candidatePart: QuizPart,
	allParts: readonly QuizPart[],
): number {
	if (candidatePart.typeId === "headings") {
		return endIdx;
	}

	const ownNumbers = new Set(candidatePart.questions.map((q) => q.number));
	const otherPartNumberSets = allParts
		.filter(
			(other) => other.id !== candidatePart.id && other.questions.length > 0,
		)
		.map((other) => new Set(other.questions.map((q) => q.number)));

	let scanIdx = endIdx + 1;
	let scanned = 0;
	let consecutiveNoMarker = 0;
	let markerTotal = 0;
	let lastMarkerIdx = -1;
	const collectedMarkers: number[] = [];

	while (scanIdx < blocks.length && scanned < MAX_INLINE_SCAN_BLOCKS) {
		const siblingBlock = blocks[scanIdx] ?? "";
		const siblingClean = cleans[scanIdx] ?? "";
		if (!siblingBlock || !INLINE_SIBLING_BLOCK_RE.test(siblingBlock.trim())) {
			break;
		}
		if (
			detectTfngCluster(blocks, cleans, scanIdx) !== null ||
			isMatchingAnchorAt(cleans, scanIdx) !== null ||
			isMcqAnchorAt(siblingClean) !== null ||
			(siblingClean &&
				isAnotherCompletionAnchor(siblingClean, candidatePart.typeId)) ||
			(siblingClean && extractWordLimit(siblingClean) !== null)
		) {
			break;
		}

		const markers = extractInlineMarkerNumbers(siblingBlock);
		if (markers.length === 0) {
			if (VIETNAMESE_DIACRITIC_RE.test(siblingClean)) {
				break;
			}
			consecutiveNoMarker += 1;
			if (consecutiveNoMarker > MAX_LEAD_IN_WITHOUT_MARKER) {
				break;
			}
		} else {
			if (
				ownNumbers.size > 0 &&
				!markers.some((m) => ownNumbers.has(m)) &&
				otherPartNumberSets.some((otherNums) =>
					markers.every((m) => otherNums.has(m)),
				)
			) {
				break;
			}
			consecutiveNoMarker = 0;
			markerTotal += markers.length;
			lastMarkerIdx = scanIdx;
			collectedMarkers.push(...markers);
		}
		scanIdx += 1;
		scanned += 1;
	}

	if (markerTotal < 2 || lastMarkerIdx === -1) {
		return endIdx;
	}

	if (ownNumbers.size > 0 && collectedMarkers.length > 0) {
		const hitsOwnExact = collectedMarkers.some((m) => ownNumbers.has(m));
		if (!hitsOwnExact) {
			const hitsOtherExact = otherPartNumberSets.some((otherNums) =>
				collectedMarkers.every((m) => otherNums.has(m)),
			);
			if (hitsOtherExact) {
				return endIdx;
			}
		}
	}

	return lastMarkerIdx;
}

function detectMatchingCluster(
	blocks: readonly string[],
	cleans: readonly string[],
	startIdx: number,
	missingParts: readonly QuizPart[],
	allParts: readonly QuizPart[],
): { endIdx: number; targetIdx: number } | null {
	const clean = cleans[startIdx] ?? "";
	const nextClean = cleans[startIdx + 1] ?? "";
	if (!clean) return null;

	let anchorIdx = startIdx;
	let kind = classifyMatchingLine(clean, nextClean);

	if (!kind && PASSAGE_STRUCTURE_RE.test(clean) && nextClean) {
		const nextKind = classifyMatchingLine(
			nextClean,
			cleans[startIdx + 2] ?? "",
		);
		if (nextKind === "headings" || nextKind === "info_positional") {
			kind = nextKind;
			anchorIdx = startIdx + 1;
		}
	}

	if (
		!kind &&
		LISTENING_MATCHING_LEAD_IN_RE.test(clean) &&
		nextClean &&
		CHOOSE_FROM_BOX_RE.test(nextClean)
	) {
		kind = "named";
		anchorIdx = startIdx + 1;
	}

	if (!kind) return null;

	const anchorClean = cleans[anchorIdx] ?? "";
	const targetIdx = findMatchingTargetIndex(kind, anchorClean, missingParts);
	if (targetIdx === -1) return null;
	const targetPart = missingParts[targetIdx];
	if (!targetPart) return null;

	let endIdx = anchorIdx;
	const expectsLeadInResolution =
		kind === "named" &&
		LOOK_AT_FOLLOWING_RE.test(anchorClean) &&
		!NAMED_MATCHING_DIRECT_RE.test(anchorClean) &&
		!CHOOSE_FROM_BOX_RE.test(anchorClean);

	while (endIdx + 1 < blocks.length) {
		const tailClean = cleans[endIdx + 1] ?? "";
		if (!tailClean) break;
		if (detectTfngCluster(blocks, cleans, endIdx + 1) !== null) break;
		if (isMcqAnchorAt(tailClean) !== null) break;
		if (extractWordLimit(tailClean) !== null) break;

		// Only consume "Match each..." / "Choose N answers from the box..." on the
		// immediate next line when resolving a "Look at the following..." lead-in;
		// otherwise a subsequent matching/summary group starting with "Match..."
		// must stay separate.
		const nextMatchKind = isMatchingAnchorAt(cleans, endIdx + 1);
		const isLeadInTail =
			expectsLeadInResolution &&
			endIdx === anchorIdx &&
			(MATCH_VERB_TAIL_RE.test(tailClean) ||
				CHOOSE_FROM_BOX_RE.test(tailClean));
		const isValidContinuation =
			isLeadInTail ||
			MATCHING_TAIL_DIRECTIVE_RE.test(tailClean) ||
			MATCHING_TAIL_NB_RE.test(tailClean) ||
			MATCHING_TAIL_BOXES_RE.test(tailClean) ||
			(kind === "headings" &&
				(HEADINGS_DONE_EXAMPLE_RE.test(tailClean) ||
					HEADINGS_EXAMPLE_HEADER_RE.test(tailClean) ||
					HEADINGS_EXAMPLE_INLINE_RE.test(tailClean)));

		if (!isValidContinuation) {
			break;
		}
		if (!isLeadInTail && nextMatchKind !== null && nextMatchKind !== kind) {
			break;
		}

		endIdx += 1;

		// If `Example` header stood alone on headings, peek at most 1 following `Paragraph X` line.
		if (
			kind === "headings" &&
			HEADINGS_EXAMPLE_HEADER_RE.test(tailClean) &&
			endIdx + 1 < blocks.length &&
			HEADINGS_EXAMPLE_PARAGRAPH_RE.test(cleans[endIdx + 1] ?? "")
		) {
			endIdx += 1;
		}
	}

	endIdx = scanInlineSiblingEndIdx(
		blocks,
		cleans,
		endIdx,
		targetPart,
		allParts,
	);

	return { endIdx, targetIdx };
}

function detectMcqCluster(
	blocks: readonly string[],
	cleans: readonly string[],
	startIdx: number,
	missingParts: readonly QuizPart[],
): { endIdx: number; targetIdx: number } | null {
	const clean = cleans[startIdx] ?? "";
	const mcqKind = isMcqAnchorAt(clean);
	if (!mcqKind) return null;

	if (mcqKind === "mcq_many") {
		const targetIdx = missingParts.findIndex((p) => p.typeId === "mcq_many");
		if (targetIdx === -1) return null;

		let endIdx = startIdx;
		while (endIdx + 1 < blocks.length) {
			const tailClean = cleans[endIdx + 1] ?? "";
			if (!tailClean) break;
			if (
				MCQ_MANY_WHICH_RE.test(tailClean) ||
				MATCHING_TAIL_BOXES_RE.test(tailClean) ||
				MCQ_MANY_TAIL_NB_RE.test(tailClean)
			) {
				endIdx += 1;
				continue;
			}
			break;
		}
		return { endIdx, targetIdx };
	}

	const targetIdx = missingParts.findIndex(
		(p) => p.typeId === "mcq" || p.typeId === "mcq1" || p.typeId === "mcq3",
	);
	if (targetIdx === -1) return null;

	let endIdx = startIdx;
	if (
		endIdx + 1 < blocks.length &&
		MATCHING_TAIL_BOXES_RE.test(cleans[endIdx + 1] ?? "")
	) {
		endIdx += 1;
	}
	return { endIdx, targetIdx };
}

/**
 * Deduplicate & phân bổ preamble cho đề có `groups` (`hasGroupSource === true`)
 * hoặc đề trộn dạng không có marker `Questions X–Y` (`parts.length > 1`):
 * - Loại bỏ các block trong `introPreamble` trùng lặp với `instructionHtml` của các nhóm câu.
 * - Đối với nhóm câu chưa có `instructionHtml`, nhận diện và gom trọn cụm chỉ thị
 *   theo thứ tự ưu tiên chặt: `tfng`/`ynng` → `matching` → `mcq`/`mcq_many` → `completion`
 *   (+ inline body có chặn biên), gán vào `matchedInstructionsByPartId` và loại khỏi preamble.
 * - Giữ nguyên các block preamble chung (ví dụ "Preamble CANARY", ghi chú tiếng Việt).
 */
export function deduplicateGroupIntroPreamble(
	introPreamble: string,
	parts: readonly QuizPart[],
): {
	cleanedPreamble: string;
	matchedInstructionsByPartId: Map<string, string>;
} {
	const matchedInstructionsByPartId = new Map<string, string>();
	if (!introPreamble.trim() || parts.length === 0) {
		return { cleanedPreamble: introPreamble, matchedInstructionsByPartId };
	}

	const blocks = splitMixedIntroBlocks(introPreamble);
	if (blocks.length === 0) {
		return { cleanedPreamble: introPreamble, matchedInstructionsByPartId };
	}
	const cleans = blocks.map(toSafePlainText);

	// Danh sách text sạch của các nhóm đã có instruction riêng
	const ownFullTexts: string[] = [];
	const ownExactLines = new Set<string>();
	for (const part of parts) {
		if (
			!part.instructionHtml ||
			isEffectivelyEmptyInstruction(part.instructionHtml)
		) {
			continue;
		}
		const full = toSafePlainText(part.instructionHtml);
		if (full) {
			ownFullTexts.push(full);
			ownExactLines.add(full);
		}
		for (const line of splitOwnInstructionLines(part.instructionHtml)) {
			ownExactLines.add(line);
		}
	}

	// Danh sách nhóm còn thiếu instructionHtml
	const missingParts = parts.filter((p) =>
		isEffectivelyEmptyInstruction(p.instructionHtml),
	);

	const keptBlocks: string[] = [];

	for (let idx = 0; idx < blocks.length; idx += 1) {
		const block = blocks[idx];
		const clean = cleans[idx] ?? "";
		if (!block || !clean) continue;

		// 1. Kiểm tra trùng lặp với instructionHtml của nhóm đã có
		const isDuplicate =
			ownExactLines.has(clean) ||
			(clean.length >= 20 &&
				ownFullTexts.some(
					(own) =>
						own.includes(clean) || (own.length >= 20 && clean.includes(own)),
				));
		if (isDuplicate) {
			continue;
		}

		// 2a. Kiểm tra cụm TFNG / YNNG nhiều dòng cho nhóm đang thiếu instruction
		const tfngCluster = detectTfngCluster(blocks, cleans, idx);
		if (tfngCluster) {
			const targetIdx = missingParts.findIndex(
				(part) => part.typeId === tfngCluster.targetType,
			);
			if (targetIdx !== -1) {
				const targetPart = missingParts[targetIdx];
				const joined = joinMixedBlocks(
					blocks.slice(idx, tfngCluster.endIdx + 1),
				);
				if (targetPart && !isEffectivelyEmptyInstruction(joined)) {
					matchedInstructionsByPartId.set(targetPart.id, joined);
					missingParts.splice(targetIdx, 1);
					idx = tfngCluster.endIdx;
					continue;
				}
			}
		}

		// 2b. Kiểm tra cụm Matching (headings, info, sentend, map, features, match_names, matching, match2, match)
		// Chạy TRƯỚC completion để sent không cướp sentend và map không bị lọt/xung đột.
		const matchingCluster = detectMatchingCluster(
			blocks,
			cleans,
			idx,
			missingParts,
			parts,
		);
		if (matchingCluster) {
			const targetPart = missingParts[matchingCluster.targetIdx];
			const joined = joinMixedBlocks(
				blocks.slice(idx, matchingCluster.endIdx + 1),
			);
			if (targetPart && !isEffectivelyEmptyInstruction(joined)) {
				matchedInstructionsByPartId.set(targetPart.id, joined);
				missingParts.splice(matchingCluster.targetIdx, 1);
				idx = matchingCluster.endIdx;
				continue;
			}
		}

		// 2c. Kiểm tra cụm MCQ / MCQ_MANY
		const mcqCluster = detectMcqCluster(blocks, cleans, idx, missingParts);
		if (mcqCluster) {
			const targetPart = missingParts[mcqCluster.targetIdx];
			const joined = joinMixedBlocks(blocks.slice(idx, mcqCluster.endIdx + 1));
			if (targetPart && !isEffectivelyEmptyInstruction(joined)) {
				matchedInstructionsByPartId.set(targetPart.id, joined);
				missingParts.splice(mcqCluster.targetIdx, 1);
				idx = mcqCluster.endIdx;
				continue;
			}
		}

		// 2d. Kiểm tra gán cụm completion cho nhóm đang thiếu instruction
		const hasWordLimit = extractWordLimit(clean) !== null;
		const missingCompletionParts = missingParts.filter(
			(part) => part.typeId in COMPLETION_TYPE_REGEX,
		);
		const hasMissingShortans = missingParts.some(
			(part) => part.typeId === "shortans",
		);
		const hasMissingNotes = missingParts.some(
			(part) => part.typeId === "notes" || part.typeId === "note",
		);
		const hasMissingDiagram = missingParts.some(
			(part) => part.typeId === "diagram",
		);

		let matchedPartIndex = -1;

		for (let i = 0; i < missingParts.length; i += 1) {
			const candidatePart = missingParts[i];
			if (!candidatePart) continue;
			const typeRegex = COMPLETION_TYPE_REGEX[candidatePart.typeId];
			let matchesType = typeRegex?.test(clean) ?? false;
			if (!matchesType && candidatePart.typeId === "fill_blank") {
				matchesType =
					(!hasMissingShortans &&
						/\banswer\s+the\s+questions?\b/i.test(clean)) ||
					(!hasMissingNotes && /\bcomplete\s+the\s+notes?\b/i.test(clean)) ||
					(!hasMissingDiagram && /\blabel\s+the\s+diagrams?\b/i.test(clean));
			}
			if (!matchesType && candidatePart.typeId === "summary") {
				matchesType =
					/\bcomplete\s+the\s+following\s+paragraph\b/i.test(clean) &&
					(hasWordLimit ||
						WORD_BANK_DIRECTIVE_RE.test(clean) ||
						CASE_SENSITIVE_LETTER_BANK_RANGE_RE.test(clean));
			}

			const isCandidateCompletion =
				candidatePart.typeId in COMPLETION_TYPE_REGEX;
			const hasDirectiveVerb =
				/\bcomplete\b|\banswer\s+the\s+questions?\b|\blabel\b|\bfill\b/i.test(
					clean,
				);

			if (
				(matchesType && (hasWordLimit || hasDirectiveVerb)) ||
				(missingCompletionParts.length === 1 &&
					hasWordLimit &&
					isCandidateCompletion)
			) {
				matchedPartIndex = i;
				break;
			}
		}

		if (matchedPartIndex !== -1) {
			const candidatePart = missingParts[matchedPartIndex];
			const isWordBankBlock =
				WORD_BANK_DIRECTIVE_RE.test(clean) ||
				CASE_SENSITIVE_LETTER_BANK_RANGE_RE.test(clean);
			const nextClean = cleans[idx + 1] ?? "";
			const nextIsMatchingWithoutLimit =
				!hasWordLimit &&
				!isWordBankBlock &&
				idx + 1 < blocks.length &&
				isMatchingAnchorAt(cleans, idx + 1) !== null &&
				extractWordLimit(nextClean) === null;

			if (candidatePart && !nextIsMatchingWithoutLimit) {
				let endIdx = idx;
				let clusterHasWordLimit = hasWordLimit;

				// Peek block word-limit liền kề khi câu mở đầu chưa có word limit (cấm peek với word-bank summary)
				if (
					!clusterHasWordLimit &&
					!isWordBankBlock &&
					endIdx + 1 < blocks.length
				) {
					const peekClean = cleans[endIdx + 1] ?? "";
					if (
						peekClean &&
						extractWordLimit(peekClean) !== null &&
						!isAnotherCompletionAnchor(peekClean, candidatePart.typeId)
					) {
						endIdx += 1;
						clusterHasWordLimit = true;
					}
				}

				// Peek tối đa 1 dòng thuần hướng dẫn ghi vào answer sheet
				if (clusterHasWordLimit && endIdx + 1 < blocks.length) {
					const peekClean = cleans[endIdx + 1] ?? "";
					if (peekClean && ANSWER_SHEET_BOX_RE.test(peekClean)) {
						endIdx += 1;
					}
				}

				// Peek chuỗi sibling block inline có chặn biên
				endIdx = scanInlineSiblingEndIdx(
					blocks,
					cleans,
					endIdx,
					candidatePart,
					parts,
				);

				const joined = joinMixedBlocks(blocks.slice(idx, endIdx + 1));
				if (!isEffectivelyEmptyInstruction(joined)) {
					matchedInstructionsByPartId.set(candidatePart.id, joined);
					missingParts.splice(matchedPartIndex, 1);
					idx = endIdx;
					continue;
				}
			}
		}

		// 3. Không trùng và không tiêu thụ -> giữ lại trong preamble
		keptBlocks.push(block);
	}

	const cleanedPreamble = joinMixedBlocks(keptBlocks);

	return { cleanedPreamble, matchedInstructionsByPartId };
}

function collectLetterCounts(text: string): Set<number> {
	const counts = new Set<number>();
	const letters = extendedAnswerChoices("letter");

	for (const match of text.matchAll(LETTER_RANGE_TOKEN_RE)) {
		const endLetter = match[1];
		if (!endLetter) continue;
		const idx = letters.indexOf(endLetter as (typeof letters)[number]);
		if (idx >= 1 && idx < 20) {
			counts.add(idx + 1);
		}
	}

	for (const match of text.matchAll(ENUMERATED_LETTERS_RE)) {
		const middle = match[1] ?? "";
		const endLetter = match[2];
		if (!endLetter) continue;
		const endIdx = letters.indexOf(endLetter as (typeof letters)[number]);
		if (endIdx < 1 || endIdx >= 20) continue;

		const middleLetters = middle
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		const seq = ["A", ...middleLetters, endLetter];
		const isContiguous =
			seq.length === endIdx + 1 &&
			seq.every((letter, pos) => letter === letters[pos]);
		if (isContiguous) {
			counts.add(endIdx + 1);
		}
	}

	return counts;
}

/**
 * Extracts an unambiguous option-bank item count (`2..20`) declared inside a
 * part's own/matched instruction:
 * - For `headings`, parses lowercase Roman ranges (`i-vi`, `i–xi`, `i to vii`)
 *   ONLY — never mistakes passage paragraph counts (`five sections`, `A-F`).
 * - For letter-based matching/word-bank types, parses case-sensitive `A–E` or
 *   contiguous `A, B, C or D` enumerations, filtering out passage-structure
 *   clauses if two conflicting letter ranges appear.
 * - Fails closed (`null`) on ambiguity, conflict, or missing range.
 */
export function extractExpectedBankCount(
	typeId: string,
	instruction: string,
): number | null {
	const plain = toSafePlainText(instruction);
	if (!plain) return null;

	if (typeId === "headings") {
		const romans = extendedAnswerChoices("roman");
		const counts = new Set<number>();
		for (const match of plain.matchAll(ROMAN_RANGE_TOKEN_RE)) {
			const endRoman = match[1];
			if (!endRoman) continue;
			const idx = romans.indexOf(endRoman as (typeof romans)[number]);
			if (idx >= 1 && idx < 20) {
				counts.add(idx + 1);
			}
		}
		if (counts.size === 1) {
			const [only] = counts;
			return only ?? null;
		}
		return null;
	}

	const directCounts = collectLetterCounts(plain);
	if (directCounts.size === 1) {
		const [only] = directCounts;
		return only ?? null;
	}
	if (directCounts.size > 1) {
		const withoutStructure = plain.replace(PASSAGE_STRUCTURE_CLAUSE_RE, " ");
		const narrowed = collectLetterCounts(withoutStructure);
		if (narrowed.size === 1) {
			const [only] = narrowed;
			return only ?? null;
		}
	}
	return null;
}

function isPositionalLetterEntry(
	entry: string,
	expectedIndex: number,
): boolean {
	const alphabet = extendedAnswerChoices("letter");
	const expected = alphabet[expectedIndex];
	if (!expected) return false;
	const normalized = entry
		.trim()
		.replace(/^(?:paragraph|section)\s+/i, "")
		.trim()
		.toUpperCase();
	return normalized === expected;
}

/**
 * Detects a mixed option bank where a positional section run (`A, B...` or
 * `Paragraph A, Paragraph B...`) of length >= 2 appears as either a prefix or
 * a suffix alongside non-positional named entries (e.g. collapsed consecutive
 * `MATCHING_INFORMATION` groups).
 */
function hasMixedPositionalRun(bank: readonly string[]): boolean {
	if (bank.length < 3 || isPositionalSectionBank(bank)) return false;

	// Prefix positional run of length >= 2
	let prefixLen = 0;
	while (
		prefixLen < bank.length &&
		isPositionalLetterEntry(bank[prefixLen] ?? "", prefixLen)
	) {
		prefixLen += 1;
	}
	if (prefixLen >= 2) return true;

	// Suffix positional run of length >= 2
	for (let offset = 1; offset <= bank.length - 2; offset += 1) {
		if (isPositionalSectionBank(bank.slice(offset))) {
			return true;
		}
	}

	return false;
}

function effectivePartInstruction(
	part: QuizPart,
	matchedInstructionsByPartId: ReadonlyMap<string, string>,
): string {
	if (
		part.instructionHtml &&
		!isEffectivelyEmptyInstruction(part.instructionHtml)
	) {
		return part.instructionHtml;
	}
	const matched = matchedInstructionsByPartId.get(part.id);
	if (matched && !isEffectivelyEmptyInstruction(matched)) {
		return matched;
	}
	return "";
}

function hasWordBankDirective(
	plain: string,
	typeId: string,
	effInstr: string,
): boolean {
	if (!plain) return false;
	if (/\bfrom\s+the\s+passage\b/i.test(plain)) return false;
	return (
		WORD_BANK_DIRECTIVE_RE.test(plain) ||
		CASE_SENSITIVE_LETTER_BANK_RANGE_RE.test(plain) ||
		extractExpectedBankCount(typeId, effInstr) !== null
	);
}

function preambleHasUnconsumedBankSignal(
	introPreamble: string | undefined,
): boolean {
	if (!introPreamble) return false;
	const blocks = splitMixedIntroBlocks(introPreamble);
	const cleans = blocks.map(toSafePlainText);
	for (let i = 0; i < cleans.length; i += 1) {
		const clean = cleans[i] ?? "";
		if (!clean) continue;
		const stripped = collapseWhitespace(
			clean.replace(PASSAGE_STRUCTURE_CLAUSE_RE, " "),
		);
		if (!stripped) continue;
		if (STRICT_PREAMBLE_WORD_BANK_RE.test(stripped)) {
			return true;
		}
		if (isMatchingAnchorAt(cleans, i) !== null) {
			return true;
		}
	}
	return false;
}

export interface FlattenedOptionBankScope {
	/** Per-part sliced mutable `string[]` banks when safely partitioned; `null` when top-level bank remains authoritative. */
	partitioned: ReadonlyMap<string, string[]> | null;
	/** True only when the bank seen by each matching part is proven unmixed (safe to derive dynamic ranges). */
	isBankScoped: boolean;
}

export interface ScopeFlattenedOptionBankOptions {
	skill: string;
	introPreamble?: string;
}

/**
 * Single source of truth for isolating flattened `detail.optionBank` across
 * parts when `!hasGroupSource`:
 * - Skill-aligned 1-to-1 with `libraryOptionBankKindFor` (never treats
 *   `flowchart` or reading `flow` as bankable).
 * - For `>= 2` bankable parts: partitions ONLY when EVERY bankable part yields
 *   an explicit count from its own/matched instruction AND `sum === optionBank.length`.
 * - For `1` bankable part in a multi-part quiz: fails closed (`partitioned: null,
 *   isBankScoped: false`) if count mismatches, a mixed positional prefix/suffix
 *   exists, another optional-bank part lacks passage/word-limit proof, or
 *   `introPreamble` still holds unconsumed matching/word-bank directives.
 */
export function scopeFlattenedOptionBank(
	parts: readonly QuizPart[],
	optionBank: readonly string[],
	matchedInstructionsByPartId: ReadonlyMap<string, string>,
	options: ScopeFlattenedOptionBankOptions,
): FlattenedOptionBankScope {
	if (optionBank.length === 0) {
		return { partitioned: null, isBankScoped: true };
	}

	const requiredTypes = REQUIRED_BANK_TYPES_BY_SKILL[options.skill];
	const optionalTypes = OPTIONAL_BANK_TYPES_BY_SKILL[options.skill];
	const mixedRun = hasMixedPositionalRun(optionBank);

	if (!requiredTypes && !optionalTypes) {
		return { partitioned: null, isBankScoped: !mixedRun };
	}

	const isReq = (t: string | null | undefined): boolean =>
		Boolean(t && requiredTypes?.has(t));
	const isOpt = (t: string | null | undefined): boolean =>
		Boolean(t && optionalTypes?.has(t));

	// Fail-closed if any single part (e.g. source:"intro") mixes >=2 distinct required-bank types.
	for (const part of parts) {
		const partReqTypes = new Set<string>();
		if (isReq(part.typeId)) partReqTypes.add(part.typeId);
		for (const q of part.questions) {
			if (isReq(q.type)) partReqTypes.add(q.type as string);
		}
		if (partReqTypes.size >= 2) {
			return { partitioned: null, isBankScoped: false };
		}
	}

	interface BankableEntry {
		part: QuizPart;
		bankTypeId: string;
		effInstr: string;
	}

	const bankableParts: BankableEntry[] = [];
	const optionalParts: Array<{
		part: QuizPart;
		optTypeId: string;
		effInstr: string;
		plain: string;
	}> = [];

	for (const part of parts) {
		const effInstr = effectivePartInstruction(
			part,
			matchedInstructionsByPartId,
		);
		const plain = toSafePlainText(effInstr);

		const reqType = isReq(part.typeId)
			? part.typeId
			: part.questions.find((q) => isReq(q.type))?.type;
		if (reqType) {
			bankableParts.push({ part, bankTypeId: reqType, effInstr });
			continue;
		}

		const optType = isOpt(part.typeId)
			? part.typeId
			: part.questions.find((q) => isOpt(q.type))?.type;
		if (optType) {
			optionalParts.push({ part, optTypeId: optType, effInstr, plain });
			if (hasWordBankDirective(plain, optType, effInstr)) {
				bankableParts.push({ part, bankTypeId: optType, effInstr });
			}
		}
	}

	// Single-part quiz: preserve top-level showDetailBank (e.g. map pin test), only report isBankScoped.
	if (parts.length <= 1) {
		if (bankableParts.length === 1) {
			const only = bankableParts[0];
			const expected = only
				? extractExpectedBankCount(only.bankTypeId, only.effInstr)
				: null;
			const countMismatch = expected !== null && expected !== optionBank.length;
			return { partitioned: null, isBankScoped: !(countMismatch || mixedRun) };
		}
		return { partitioned: null, isBankScoped: !mixedRun };
	}

	if (bankableParts.length === 0) {
		return { partitioned: null, isBankScoped: !mixedRun };
	}

	if (bankableParts.length === 1) {
		const only = bankableParts[0];
		if (!only) {
			return { partitioned: null, isBankScoped: false };
		}
		const expected = extractExpectedBankCount(only.bankTypeId, only.effInstr);
		if (expected !== null && expected !== optionBank.length) {
			return { partitioned: null, isBankScoped: false };
		}
		if (mixedRun) {
			return { partitioned: null, isBankScoped: false };
		}
		// Check if any OTHER optional-bank part lacks passage/word-limit proof (might actually own part of the bank).
		for (const opt of optionalParts) {
			if (opt.part.id === only.part.id) continue;
			const isWordBank = hasWordBankDirective(
				opt.plain,
				opt.optTypeId,
				opt.effInstr,
			);
			const isProvenPassageOnly =
				!isWordBank &&
				(extractWordLimit(opt.effInstr) !== null ||
					/\bfrom\s+the\s+passage\b/i.test(opt.plain));
			if (!isProvenPassageOnly) {
				return { partitioned: null, isBankScoped: false };
			}
		}
		if (preambleHasUnconsumedBankSignal(options.introPreamble)) {
			return { partitioned: null, isBankScoped: false };
		}

		const partitioned = new Map<string, string[]>();
		for (const part of parts) {
			partitioned.set(part.id, part.id === only.part.id ? [...optionBank] : []);
		}
		return { partitioned, isBankScoped: true };
	}

	// >= 2 bankable parts: strict exactSum using ONLY each part's own/matched instruction.
	const counts: number[] = [];
	let sum = 0;
	for (const entry of bankableParts) {
		const count = extractExpectedBankCount(entry.bankTypeId, entry.effInstr);
		if (count === null || count < 2) {
			return { partitioned: null, isBankScoped: false };
		}
		counts.push(count);
		sum += count;
	}
	if (sum !== optionBank.length) {
		return { partitioned: null, isBankScoped: false };
	}

	const partitioned = new Map<string, string[]>();
	for (const part of parts) {
		partitioned.set(part.id, []);
	}
	let cursor = 0;
	for (let i = 0; i < bankableParts.length; i += 1) {
		const entry = bankableParts[i];
		const count = counts[i] ?? 0;
		if (!entry) continue;
		partitioned.set(entry.part.id, optionBank.slice(cursor, cursor + count));
		cursor += count;
	}

	return { partitioned, isBankScoped: true };
}
