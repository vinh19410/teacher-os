import { isEmptyRichText } from "@teacher-os/api/rich-text";
import type { QuestionItem } from "@/components/assignments/assignment-presets";

/**
 * Legacy rich text adapter (plan decision 9).
 *
 * ProseMirror collapses plain-text newlines the moment legacy content is
 * loaded into the editor, which would permanently destroy line breaks on the
 * next save. Every door that feeds existing content into `RichTextEditor`
 * must pass through `normalizeLegacyRichText` first.
 */

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;
const PAIRED_OR_VOID_TAG_RE = /<\/[a-z][a-z0-9]*\s*>|<(?:br|hr|img)\b[^>]*>/i;
const HTML_ENTITY_RE = /&(?:amp|lt|gt|quot|#39);/i;

/** Quick heuristic: does this string already contain real HTML markup or entities? */
export function looksLikeHtml(text: string): boolean {
	if (HTML_ENTITY_RE.test(text)) return true;
	if (!HTML_TAG_RE.test(text) || !PAIRED_OR_VOID_TAG_RE.test(text)) {
		return false;
	}
	if (typeof DOMParser === "undefined") return true;
	const doc = new DOMParser().parseFromString(text, "text/html");
	return doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(text);
}

/**
 * Convert a legacy plain-text value into editor-safe HTML: escape `&`/`<`/`>`,
 * then turn each newline into a hard break. Strings that already look like
 * HTML are returned untouched.
 */
export function normalizeLegacyRichText(text: string): string {
	if (looksLikeHtml(text)) return text;
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\n/g, "<br>");
}

/**
 * Normalize `explanation` across restored draft items: plain-text explanations
 * have newlines converted to `<br>`, while empty/whitespace-only markup drops
 * the `explanation` key so wire payloads match `AnswerKeyGrid` invariants.
 */
export function normalizeDraftItems(items: QuestionItem[]): QuestionItem[] {
	return items.map((item) => {
		const { explanation, ...rest } = item;
		if (typeof explanation === "string" && !isEmptyRichText(explanation)) {
			return { ...rest, explanation: normalizeLegacyRichText(explanation) };
		}
		return rest;
	});
}
