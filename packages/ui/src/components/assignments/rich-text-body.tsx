import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";
import { cn } from "@teacher-os/ui/lib/utils";
import { useMemo } from "react";

// Quick "does this already contain HTML markup?" heuristic — same regex as
// web's `rich-text-legacy` (kept private per surface: the web adapter also
// feeds the Tiptap editor, this copy only picks the render branch here).
const HTML_TAG_RE = /<\/?[a-z][^>]*>/i;

/**
 * The single rendering sink for rich text content.
 *
 * Legacy plain rows (no markup) render exactly as before: escaped text with
 * `whitespace-pre-line` (or `pre-wrap` for surfaces that used it), so old
 * data needs no migration. Rows containing HTML are sanitized with DOMPurify
 * before `dangerouslySetInnerHTML` — and only when a DOM exists; without one
 * (node tests) we always take the escaped-text branch, never unsanitized
 * innerHTML.
 */
export function RichTextBody({
	text,
	className,
	legacyWhitespace = "pre-line",
}: {
	text: string;
	className?: string;
	legacyWhitespace?: "pre-line" | "pre-wrap";
}) {
	const isHtml = useMemo(() => {
		if (!HTML_TAG_RE.test(text)) return false;
		if (typeof DOMParser === "undefined") return true;
		// Regex pre-check passed; confirm with a real parse so text like "a<b>c"
		// that happens to contain a closing angle bracket is not misdetected.
		const doc = new DOMParser().parseFromString(text, "text/html");
		return doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(text);
	}, [text]);

	const legacyClass =
		legacyWhitespace === "pre-wrap"
			? "whitespace-pre-wrap"
			: "whitespace-pre-line";

	if (isHtml && typeof document !== "undefined") {
		return (
			<div
				className={cn(
					// Tailwind preflight strips list styling — restore it for rendered markup
					"[&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
					className,
				)}
				dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }}
			/>
		);
	}

	return <div className={cn(legacyClass, className)}>{text}</div>;
}
