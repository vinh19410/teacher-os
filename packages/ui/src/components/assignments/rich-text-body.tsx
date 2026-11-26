import { isHtmlRichText } from "@teacher-os/ui/lib/reading-annotations";
import { RICH_TEXT_CONTENT_CLASSES } from "@teacher-os/ui/lib/rich-text-content-classes";
import { sanitizeRichText } from "@teacher-os/ui/lib/rich-text-sanitize";
import { cn } from "@teacher-os/ui/lib/utils";
import { useMemo } from "react";

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
	const isHtml = useMemo(() => isHtmlRichText(text), [text]);

	const legacyClass =
		legacyWhitespace === "pre-wrap"
			? "whitespace-pre-wrap"
			: "whitespace-pre-line";

	if (isHtml && typeof document !== "undefined") {
		return (
			<div
				className={cn(RICH_TEXT_CONTENT_CLASSES, className)}
				dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }}
			/>
		);
	}

	return <div className={cn(legacyClass, className)}>{text}</div>;
}
