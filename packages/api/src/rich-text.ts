import { z } from "zod";

/**
 * Rich text helpers shared by the server contract and the web app.
 *
 * Values are stored as raw HTML strings; these utilities only measure or
 * inspect them — they are NOT a security boundary. Rendering sanitizes via
 * DOMPurify in `apps/web` (`RichTextBody`), never here.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

// Structural DOM types — this package also compiles for workerd, which has no
// DOM lib, so we never reference browser globals by name.
type DomNodeLike = {
	nodeType: number;
	textContent: string | null;
	tagName?: string;
	childNodes: { forEach: (callback: (child: DomNodeLike) => void) => void };
};

type DomParserLike = {
	parseFromString: (html: string, mimeType: string) => { body: DomNodeLike };
};

const getDomParser = (): (new () => DomParserLike) | undefined =>
	(globalThis as { DOMParser?: new () => DomParserLike }).DOMParser;

const BLOCK_TAGS = new Set([
	"p",
	"div",
	"li",
	"ul",
	"ol",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"pre",
	"tr",
	"table",
]);

/** Collapse runs of spaces/tabs but keep newlines (block boundaries). */
function normalizeSpacing(text: string): string {
	return text.replace(/[ \t]+/g, " ").trim();
}

function collectText(node: DomNodeLike, parts: string[]): void {
	node.childNodes.forEach((child) => {
		if (child.nodeType === TEXT_NODE) {
			parts.push(child.textContent ?? "");
			return;
		}
		if (child.nodeType !== ELEMENT_NODE) return;
		const tag = child.tagName?.toLowerCase() ?? "";
		if (tag === "br" || tag === "hr") {
			parts.push("\n");
			return;
		}
		collectText(child, parts);
		if (BLOCK_TAGS.has(tag)) parts.push("\n");
	});
}

function domHtmlToPlainText(
	html: string,
	Parser: new () => DomParserLike,
): string {
	const doc = new Parser().parseFromString(html, "text/html");
	const parts: string[] = [];
	collectText(doc.body, parts);
	return normalizeSpacing(parts.join(""));
}

/**
 * No-DOM fallback (Cloudflare Workers / node tests). Good enough for length
 * measurement and word counting; never used for rendering or security.
 */
function regexHtmlToPlainText(html: string): string {
	return normalizeSpacing(
		html
			.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote|pre)>/gi, "\n")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;/gi, " ")
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&quot;/gi, '"')
			.replace(/&#39;/gi, "'")
			.replace(/&amp;/gi, "&"),
	);
}

/** Extract plain text from an HTML string, keeping newlines at block boundaries. */
export function htmlToPlainText(html: string): string {
	const Parser = getDomParser();
	if (Parser) return domHtmlToPlainText(html, Parser);
	return regexHtmlToPlainText(html);
}

/** Collapse all whitespace (including newlines) — the basis for length caps. */
export function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

/**
 * Emptiness check for rich text fields: "<p></p>" or "<p><br></p>" is empty.
 * Works for legacy plain text too (plain whitespace is empty).
 */
export function isEmptyRichText(html: string): boolean {
	return collapseWhitespace(htmlToPlainText(html)).length === 0;
}

/**
 * zod string field for rich text HTML content.
 *
 * The meaningful cap (`plainMax`) is measured on the collapsed plain text so
 * markup overhead never counts toward the teacher's content budget; the raw
 * cap protects transport/storage. Deliberately has NO non-empty refine —
 * drafts must be allowed to save empty; emptiness gating happens at the
 * client and at the server's `ready` superRefine.
 */
export function richTextField(
	plainMax: number,
	rawMax: number = Math.ceil(plainMax * 2.5),
) {
	return z
		.string()
		.trim()
		.max(rawMax, {
			message: `Nội dung vượt quá ${rawMax} ký tự tính cả định dạng`,
		})
		.refine(
			(value) => collapseWhitespace(htmlToPlainText(value)).length <= plainMax,
			{
				message: `Nội dung vượt quá ${plainMax} ký tự (không tính định dạng)`,
			},
		);
}
