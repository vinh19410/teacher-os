import DOMPurify from "dompurify";

/**
 * The only HTML sanitizer in the app (single sink: `RichTextBody`).
 *
 * Only call this when a DOM exists (browser or jsdom) — with
 * `isSupported === false` DOMPurify returns its input untouched.
 */
const CONFIG = {
	ALLOWED_TAGS: [
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
	],
	ALLOWED_ATTR: ["href", "target"],
	ALLOW_DATA_ATTR: false,
};

// Force every link to open in a new tab safely. Payloads cannot smuggle their
// own rel — it is not in ALLOWED_ATTR, and this hook re-sets it after filtering.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
	if (node.nodeName === "A") {
		(node as Element).setAttribute("target", "_blank");
		(node as Element).setAttribute("rel", "noopener noreferrer");
	}
});

export function sanitizeRichText(dirty: string): string {
	// String(): widen away the TrustedHTML overload — trusted types are off,
	// so sanitize returns a plain string here.
	return String(DOMPurify.sanitize(dirty, CONFIG));
}
