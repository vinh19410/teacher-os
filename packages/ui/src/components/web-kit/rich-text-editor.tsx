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
import { useEffect, useRef } from "react";

function promptLinkHref(): string | null {
	const url = window.prompt("Địa chỉ liên kết (https://…)");
	return url?.trim() || null;
}

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
		toggleKey: "isLink",
		run: (e) => {
			if (e.isActive("link")) {
				e.chain().focus().unsetLink().run();
				return;
			}
			const href = promptLinkHref();
			if (href) e.chain().focus().setLink({ href }).run();
		},
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

	return (
		<div
			role="toolbar"
			aria-label="Định dạng văn bản"
			className="flex flex-wrap items-center gap-0.5 border-border border-b border-solid px-1 py-1"
		>
			{TOOLBAR_BUTTONS.map(
				({ label, icon: Icon, run, toggleKey, enabledKey }) => {
					const pressed = toggleKey ? state[toggleKey] : undefined;
					const disabled = enabledKey ? !state[enabledKey] : false;
					return (
						<button
							key={label}
							type="button"
							aria-label={label}
							{...(pressed === undefined ? {} : { "aria-pressed": pressed })}
							title={label}
							disabled={disabled}
							onClick={() => run(editor)}
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
								pressed && "bg-muted text-foreground",
							)}
						>
							<Icon size={14} aria-hidden="true" />
						</button>
					);
				},
			)}
		</div>
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
				StarterKit.configure({ heading: { levels: [2, 3] } }),
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
				"w-full rounded-sm border border-border border-solid transition-[border-color,box-shadow] duration-[150ms] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
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
