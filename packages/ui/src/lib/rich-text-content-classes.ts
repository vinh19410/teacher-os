/**
 * Visual treatment for rich-text markup, shared by the two surfaces that show
 * authored HTML: the editor's editable area (`RichTextEditor`) and the
 * rendering sink (`RichTextBody`). Keeping one source of truth is what makes
 * the editor WYSIWYG-faithful — a blockquote looks the same while authoring
 * and while a student reads it.
 *
 * Tags here mirror the `sanitizeRichText` allowlist. Notes:
 * - `em`-based sizes keep headings proportional inside small-text callsites
 *   (e.g. text-xs previews).
 * - `pre` wraps instead of scrolling horizontally so narrow flex/grid parents
 *   without `min-w-0` are not blown out, and authoring matches reading.
 * - The `a`/`ul`/`ol` rules restore what Tailwind preflight resets
 *   (`list-style`, `text-decoration`, list padding) — both surfaces need them.
 */
export const RICH_TEXT_CONTENT_CLASSES = [
	"[&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5",
	"[&_blockquote]:border-l-[3px] [&_blockquote]:border-l-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
	"[&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono",
	"[&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0",
	"[&_pre]:rounded-[var(--radius)] [&_pre]:bg-muted [&_pre]:break-words [&_pre]:p-3 [&_pre]:text-sm [&_pre]:whitespace-pre-wrap [&_pre]:font-mono",
	"[&_h2]:text-[1.25em] [&_h2]:font-semibold",
	"[&_h3]:text-[1.1em] [&_h3]:font-semibold",
	"[&_hr]:my-2 [&_hr]:border-border",
].join(" ");
