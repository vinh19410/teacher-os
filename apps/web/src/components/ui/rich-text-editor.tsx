import Placeholder from "@tiptap/extension-placeholder";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link, List, ListOrdered, Underline } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type ToolbarAction = {
	label: string;
	icon: ReactNode;
	isActive: (editor: Editor) => boolean;
	run: (editor: Editor) => void;
};

function promptLinkHref(): string | null {
	const url = window.prompt("Địa chỉ liên kết (https://…)");
	return url?.trim() || null;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
	{
		label: "In đậm",
		icon: <Bold size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("bold"),
		run: (editor) => editor.chain().focus().toggleBold().run(),
	},
	{
		label: "In nghiêng",
		icon: <Italic size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("italic"),
		run: (editor) => editor.chain().focus().toggleItalic().run(),
	},
	{
		label: "Gạch chân",
		icon: <Underline size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("underline"),
		run: (editor) => editor.chain().focus().toggleUnderline().run(),
	},
	{
		label: "Danh sách gạch đầu dòng",
		icon: <List size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("bulletList"),
		run: (editor) => editor.chain().focus().toggleBulletList().run(),
	},
	{
		label: "Danh sách đánh số",
		icon: <ListOrdered size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("orderedList"),
		run: (editor) => editor.chain().focus().toggleOrderedList().run(),
	},
	{
		label: "Chèn liên kết",
		icon: <Link size={14} aria-hidden="true" />,
		isActive: (editor) => editor.isActive("link"),
		run: (editor) => {
			if (editor.isActive("link")) {
				editor.chain().focus().unsetLink().run();
				return;
			}
			const href = promptLinkHref();
			if (href) editor.chain().focus().setLink({ href }).run();
		},
	},
];

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
	// emitUpdate:false prevents a controlled update loop.
	useEffect(() => {
		if (editor && value !== editor.getHTML()) {
			editor.commands.setContent(value, { emitUpdate: false });
		}
	}, [value, editor]);

	if (!editor) {
		// No DOM yet (SSR/node tests) or editor not mounted: inert shell.
		return (
			<div
				aria-busy="true"
				className={cn(
					"min-h-20 w-full rounded-sm border border-line border-solid bg-bg px-3 py-[10px] text-meta text-sm",
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
				"w-full rounded-sm border border-line border-solid transition-[border-color,box-shadow] duration-[150ms] focus-within:border-accent-blue focus-within:shadow-[var(--focus-ring)]",
				className,
			)}
		>
			<div
				role="toolbar"
				aria-label="Định dạng văn bản"
				className="flex flex-wrap items-center gap-0.5 border-line border-b border-solid px-1 py-1"
			>
				{TOOLBAR_ACTIONS.map((action) => {
					const active = action.isActive(editor);
					return (
						<button
							key={action.label}
							type="button"
							aria-label={action.label}
							aria-pressed={active}
							title={action.label}
							onClick={() => action.run(editor)}
							className={cn(
								"flex h-7 w-7 items-center justify-center rounded-sm hover:bg-fg/10",
								active && "bg-fg/10 text-accent-blue",
							)}
						>
							{action.icon}
						</button>
					);
				})}
			</div>
			<EditorContent
				editor={editor}
				className="[&_.ProseMirror]:min-h-20 [&_.ProseMirror]:px-3 [&_.ProseMirror]:py-[10px] [&_.ProseMirror]:text-sm [&_.ProseMirror]:leading-[1.5]"
			/>
		</div>
	);
}
