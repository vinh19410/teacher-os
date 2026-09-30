/**
 * Legacy rich text adapter (plan decision 9).
 *
 * ProseMirror collapses plain-text newlines the moment legacy content is
 * loaded into the editor, which would permanently destroy line breaks on the
 * next save. Every door that feeds existing content into `RichTextEditor`
 * must pass through `normalizeLegacyRichText` first.
 */

const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

/** Quick heuristic: does this string already contain HTML markup? */
export function looksLikeHtml(text: string): boolean {
	return HTML_TAG_RE.test(text);
}

/**
 * Convert a legacy plain-text value into editor-safe HTML: escape `&`/`<`,
 * then turn each newline into a hard break. Strings that already look like
 * HTML are returned untouched.
 */
export function normalizeLegacyRichText(text: string): string {
	if (looksLikeHtml(text)) return text;
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/\n/g, "<br>");
}
