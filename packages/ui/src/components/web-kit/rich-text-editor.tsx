import { Popover } from "@base-ui/react/popover";
import { Toolbar } from "@base-ui/react/toolbar";
import { RICH_TEXT_CONTENT_CLASSES } from "@teacher-os/ui/lib/rich-text-content-classes";
import { cn } from "@teacher-os/ui/lib/utils";
import Placeholder from "@tiptap/extension-placeholder";
import {
	type Editor,
	EditorContent,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Code,
	Heading2,
	Heading3,
	Heading4,
	Italic,
	Link,
	List,
	ListOrdered,
	type LucideIcon,
	Minus,
	Redo2,
	SquareCode,
	Strikethrough,
	TextQuote,
	Underline,
	Undo2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Authoring-side scheme allowlist for the link popover. The render sink
 * (`RichTextBody` → `sanitizeRichText`) strips dangerous URIs when students
 * read content, but stored HTML can reach other consumers — so payloads like
 * `javascript:` never enter the document from the editor in the first place.
 */
function isAllowedHref(href: string): boolean {
	if (href.startsWith("#")) return true;
	if (
		href.startsWith("/") &&
		!href.startsWith("//") &&
		!href.startsWith("/\\")
	) {
		return true;
	}
	try {
		const protocol = new URL(href).protocol;
		return (
			protocol === "http:" || protocol === "https:" || protocol === "mailto:"
		);
	} catch {
		return false;
	}
}

const LINK_HREF_ERROR =
	"Chỉ hỗ trợ liên kết http(s):, mailto:, neo #… hoặc đường dẫn /…";

/**
 * Toolbar state the live subscription exposes. Every key is derived from the
 * editor on each transaction; the toolbar re-renders only when a value here
 * actually changes (useEditorState compares with deep equality).
 */
type ToolbarState = {
	isBold: boolean;
	isItalic: boolean;
	isUnderline: boolean;
	isStrike: boolean;
	isH2: boolean;
	isH3: boolean;
	isH4: boolean;
	isBulletList: boolean;
	isOrderedList: boolean;
	isBlockquote: boolean;
	isCode: boolean;
	isCodeBlock: boolean;
	isLink: boolean;
	canUndo: boolean;
	canRedo: boolean;
};

type ToolbarButton = {
	label: string;
	icon: LucideIcon;
	run: (editor: Editor) => void;
	/** Toggle marker — when set, the button renders aria-pressed from this key. */
	toggleKey?: keyof ToolbarState;
	/** Button is disabled while this state key is false. */
	enabledKey?: "canUndo" | "canRedo";
	/** The link button is a disclosure trigger (popover), not a plain toggle. */
	kind?: "link";
};

const TOOLBAR_BUTTONS: ToolbarButton[] = [
	{
		label: "In đậm",
		icon: Bold,
		toggleKey: "isBold",
		run: (e) => e.chain().focus().toggleBold().run(),
	},
	{
		label: "In nghiêng",
		icon: Italic,
		toggleKey: "isItalic",
		run: (e) => e.chain().focus().toggleItalic().run(),
	},
	{
		label: "Gạch chân",
		icon: Underline,
		toggleKey: "isUnderline",
		run: (e) => e.chain().focus().toggleUnderline().run(),
	},
	{
		label: "Gạch ngang chữ",
		icon: Strikethrough,
		toggleKey: "isStrike",
		run: (e) => e.chain().focus().toggleStrike().run(),
	},
	{
		label: "Đề mục cấp 2",
		icon: Heading2,
		toggleKey: "isH2",
		run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
	},
	{
		label: "Đề mục cấp 3",
		icon: Heading3,
		toggleKey: "isH3",
		run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
	},
	{
		label: "Đề mục cấp 4",
		icon: Heading4,
		toggleKey: "isH4",
		run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
	},
	{
		label: "Danh sách gạch đầu dòng",
		icon: List,
		toggleKey: "isBulletList",
		run: (e) => e.chain().focus().toggleBulletList().run(),
	},
	{
		label: "Danh sách đánh số",
		icon: ListOrdered,
		toggleKey: "isOrderedList",
		run: (e) => e.chain().focus().toggleOrderedList().run(),
	},
	{
		label: "Trích dẫn",
		icon: TextQuote,
		toggleKey: "isBlockquote",
		run: (e) => e.chain().focus().toggleBlockquote().run(),
	},
	{
		label: "Đoạn mã",
		icon: Code,
		toggleKey: "isCode",
		run: (e) => e.chain().focus().toggleCode().run(),
	},
	{
		label: "Khối mã",
		icon: SquareCode,
		toggleKey: "isCodeBlock",
		run: (e) => e.chain().focus().toggleCodeBlock().run(),
	},
	{
		label: "Chèn liên kết",
		icon: Link,
		kind: "link",
		run: () => {}, // handled by the link popover (RichTextToolbar)
	},
	{
		label: "Đường kẻ ngang",
		icon: Minus,
		run: (e) => e.chain().focus().setHorizontalRule().run(),
	},
	{
		label: "Hoàn tác",
		icon: Undo2,
		enabledKey: "canUndo",
		run: (e) => e.chain().focus().undo().run(),
	},
	{
		label: "Làm lại",
		icon: Redo2,
		enabledKey: "canRedo",
		run: (e) => e.chain().focus().redo().run(),
	},
];

/**
 * The toolbar lives in its own component so `useEditorState` can subscribe to
 * editor transactions here: `useEditor` alone does not re-render on
 * transactions, so state read during the parent's render (aria-pressed,
 * disabled) would go stale the moment a transaction does not change the doc
 * (stored marks, caret moves).
 */
function RichTextToolbar({ editor }: { editor: Editor }) {
	const state = useEditorState({
		editor,
		selector: ({ editor: e }): ToolbarState => ({
			isBold: e.isActive("bold"),
			isItalic: e.isActive("italic"),
			isUnderline: e.isActive("underline"),
			isStrike: e.isActive("strike"),
			isH2: e.isActive("heading", { level: 2 }),
			isH3: e.isActive("heading", { level: 3 }),
			isH4: e.isActive("heading", { level: 4 }),
			isBulletList: e.isActive("bulletList"),
			isOrderedList: e.isActive("orderedList"),
			isBlockquote: e.isActive("blockquote"),
			isCode: e.isActive("code"),
			isCodeBlock: e.isActive("codeBlock"),
			isLink: e.isActive("link"),
			canUndo: e.can().undo(),
			canRedo: e.can().redo(),
		}),
	});

	const [linkOpen, setLinkOpen] = useState(false);
	const [linkHref, setLinkHref] = useState("");
	const [linkError, setLinkError] = useState<string | null>(null);
	const linkInputRef = useRef<HTMLInputElement>(null);
	const closingViaApplyRef = useRef(false);
	const linkInputId = useId();
	const linkErrorId = `${linkInputId}-error`;

	// Pressing the trigger while the caret sits inside a link removes the link
	// and must NOT open the popover (parity with the pre-popover behavior).
	// The decision lives solely in onOpenChange: the trigger's own click order
	// relative to ours is not guaranteed, and an uncontrolled trigger would
	// still toggle open.
	const handleLinkOpenChange = (
		next: boolean,
		details: {
			reason?: unknown;
		},
	) => {
		if (next && details.reason === "trigger-press" && editor.isActive("link")) {
			editor.chain().focus().extendMarkRange("link").unsetLink().run();
			return;
		}
		if (next) {
			setLinkError(null);
			closingViaApplyRef.current = false;
		}
		setLinkOpen(next);
	};

	const applyLink = () => {
		const href = linkHref.trim();
		if (!href) return;
		if (!isAllowedHref(href)) {
			setLinkError(LINK_HREF_ERROR);
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
		// Return focus to the editor when the close is ours — Base UI would
		// otherwise restore it to the trigger and kill the stored mark / leave
		// the caret outside the text the teacher was editing.
		closingViaApplyRef.current = true;
		setLinkOpen(false);
	};

	// The popover input must not live in a <form>: the popup renders through a
	// portal, so a submit would bubble to the page's own form (assignment
	// builder) and save the document. Enter is handled on the input itself.
	const linkPanelKeyDown = (event: React.KeyboardEvent) => {
		if (
			[
				"ArrowLeft",
				"ArrowRight",
				"ArrowUp",
				"ArrowDown",
				"Home",
				"End",
			].includes(event.key)
		) {
			// Keep caret keys inside the input — the toolbar's composite
			// keyboard handling must not steal them when the caret is at an
			// edge of the field.
			event.stopPropagation();
		}
	};

	const toolbarButtonClass = (pressed?: boolean) =>
		cn(
			"flex h-7 w-7 items-center justify-center rounded-sm hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
			pressed && "bg-muted text-foreground",
		);

	// Base UI's composite handles arrows but not Home/End — move focus to the
	// first/last enabled button ourselves (WAI-ARIA toolbar pattern).
	const toolbarKeyDown = (event: React.KeyboardEvent) => {
		if (event.key !== "Home" && event.key !== "End") return;
		const enabled = Array.from(
			event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
		).filter((button) => !button.disabled);
		if (enabled.length === 0) return;
		event.preventDefault();
		const target =
			event.key === "Home" ? enabled[0] : enabled[enabled.length - 1];
		target.focus();
	};

	return (
		<Toolbar.Root
			aria-label="Định dạng văn bản"
			className="flex flex-wrap items-center gap-1 border-border border-b border-solid px-1 py-1"
			onKeyDown={toolbarKeyDown}
		>
			{TOOLBAR_BUTTONS.map(
				({ label, icon: Icon, run, toggleKey, enabledKey, kind }) => {
					const pressed = toggleKey ? state[toggleKey] : undefined;
					const disabled = enabledKey ? !state[enabledKey] : false;

					if (kind === "link") {
						return (
							<Popover.Root
								key={label}
								open={linkOpen}
								onOpenChange={handleLinkOpenChange}
								modal={true}
							>
								<Popover.Trigger
									render={
										<Toolbar.Button
											aria-label={label}
											aria-haspopup="dialog"
											title={label}
											className={toolbarButtonClass(state.isLink)}
										>
											<Icon size={14} aria-hidden="true" />
										</Toolbar.Button>
									}
								/>
								<Popover.Portal>
									<Popover.Positioner align="start" sideOffset={6}>
										<Popover.Popup
											className="rounded-md border border-border border-solid bg-background text-foreground shadow-md"
											initialFocus={linkInputRef}
											finalFocus={() =>
												closingViaApplyRef.current
													? (editor.view.dom as HTMLElement)
													: null
											}
											onKeyDown={linkPanelKeyDown}
										>
											<div className="flex w-72 flex-col gap-2 p-3">
												<label
													htmlFor={linkInputId}
													className="text-muted-foreground text-xs"
												>
													Địa chỉ liên kết
												</label>
												<input
													ref={linkInputRef}
													id={linkInputId}
													type="text"
													inputMode="url"
													placeholder="https://…"
													value={linkHref}
													onChange={(e) => {
														setLinkHref(e.target.value);
														setLinkError(null);
													}}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															applyLink();
														}
													}}
													aria-invalid={linkError ? true : undefined}
													aria-describedby={linkError ? linkErrorId : undefined}
													className="h-8 w-full rounded-sm border border-input border-solid bg-background px-2 text-sm focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
												/>
												{linkError && (
													<p
														id={linkErrorId}
														className="text-destructive text-xs"
													>
														{linkError}
													</p>
												)}
												<div className="flex items-center justify-end gap-1">
													<Popover.Close
														aria-label="Hủy"
														className="rounded-sm px-2 py-1 text-sm hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
													>
														Hủy
													</Popover.Close>
													<button
														type="button"
														onClick={applyLink}
														className="rounded-sm bg-primary px-2 py-1 text-primary-foreground text-sm hover:bg-primary/90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
													>
														Áp dụng
													</button>
												</div>
											</div>
										</Popover.Popup>
									</Popover.Positioner>
								</Popover.Portal>
							</Popover.Root>
						);
					}

					return (
						<Toolbar.Button
							key={label}
							aria-label={label}
							{...(pressed === undefined ? {} : { "aria-pressed": pressed })}
							title={label}
							disabled={disabled}
							focusableWhenDisabled={false}
							// Keep the editor focused across mouse clicks: TipTap's
							// focus command defers view.focus() to a rAF, so keys
							// typed right after a click would land on the toolbar
							// (Space/Enter would even re-trigger the button). Same
							// pattern as library/tests/$testId.tsx.
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => run(editor)}
							className={toolbarButtonClass(pressed)}
						>
							<Icon size={14} aria-hidden="true" />
						</Toolbar.Button>
					);
				},
			)}
		</Toolbar.Root>
	);
}

/**
 * A contenteditable div is not a labelable element, so the Field contract
 * pairs the injected `id` (landed on the .ProseMirror element below) with the
 * label element's `${id}-label` id via `aria-labelledby` — that is what makes
 * `getByLabelText`/e2e `getByLabel` resolve to the editor.
 */
function buildEditorAttributes({
	id,
	ariaLabel,
	ariaInvalid,
	ariaDescribedby,
}: {
	id?: string;
	ariaLabel?: string;
	ariaInvalid?: boolean | "true" | "false" | "grammar" | "spelling";
	ariaDescribedby?: string;
}) {
	return {
		...(id ? { id } : {}),
		...(ariaLabel ? { "aria-label": ariaLabel } : {}),
		...(id ? { "aria-labelledby": `${id}-label` } : {}),
		...(ariaInvalid === true || ariaInvalid === "true"
			? { "aria-invalid": "true" }
			: {}),
		...(ariaDescribedby ? { "aria-describedby": ariaDescribedby } : {}),
	};
}

export function RichTextEditor({
	value,
	onChange,
	placeholder,
	id,
	"aria-invalid": ariaInvalid,
	"aria-describedby": ariaDescribedby,
	ariaLabel,
	className,
	contentClassName,
}: {
	value: string;
	onChange: (html: string) => void;
	placeholder?: string;
	id?: string;
	"aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
	"aria-describedby"?: string;
	/** Standalone label when not rendered inside a Field. */
	ariaLabel?: string;
	className?: string;
	/** Extra classes for the editable area (e.g. a taller min-height). */
	contentClassName?: string;
}) {
	const onChangeRef = useRef(onChange);
	useEffect(() => {
		onChangeRef.current = onChange;
	});

	const editor = useEditor(
		{
			immediatelyRender: false,
			extensions: [
				StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
				Placeholder.configure({ placeholder: placeholder ?? "" }),
			],
			content: value,
			editorProps: {
				attributes: buildEditorAttributes({
					id,
					ariaLabel,
					ariaInvalid,
					ariaDescribedby,
				}),
			},
			onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
		},
		[id],
	);

	// Keep a11y attributes fresh without recreating the editor (recreating
	// would drop undo history and caret position on every error-state change).
	useEffect(() => {
		if (!editor) return;
		editor.setOptions({
			editorProps: {
				attributes: buildEditorAttributes({
					id,
					ariaLabel,
					ariaInvalid,
					ariaDescribedby,
				}),
			},
		});
	}, [editor, id, ariaLabel, ariaInvalid, ariaDescribedby]);

	// External value changes (form reset, draft restore) sync into the editor;
	// emitUpdate:false prevents a controlled update loop, and the history meta
	// keeps the sync out of the undo stack — an untouched or just-reopened
	// editor must not offer an Undo that wipes its initial content.
	useEffect(() => {
		if (editor && value !== editor.getHTML()) {
			editor
				.chain()
				.setMeta("addToHistory", false)
				.setContent(value, { emitUpdate: false })
				.run();
		}
	}, [value, editor]);

	if (!editor) {
		// No DOM yet (SSR/node tests) or editor not mounted: inert shell.
		return (
			<div
				aria-busy="true"
				className={cn(
					"min-h-20 w-full rounded-sm border border-border border-solid bg-background px-3 py-[10px] text-muted-foreground text-sm",
					className,
				)}
			>
				{placeholder ?? ""}
			</div>
		);
	}

	return (
		<div
			className={cn(
				"w-full rounded-sm border border-border border-solid transition-[border-color,box-shadow] duration-[150ms] has-[.ProseMirror:focus]:border-ring has-[.ProseMirror:focus]:ring-[3px] has-[.ProseMirror:focus]:ring-ring/50",
				className,
			)}
		>
			<RichTextToolbar editor={editor} />
			{/* WYSIWYG: the editable area shows authored markup with the same
			    treatment the student-facing sink uses. */}
			<EditorContent
				editor={editor}
				className={cn(RICH_TEXT_CONTENT_CLASSES, contentClassName)}
			/>
		</div>
	);
}
