import {
	locatePlacementErrors,
	PLACEMENT_ERROR_EXPLANATION_MAX,
	PLACEMENT_ERROR_QUOTE_MAX,
	PLACEMENT_ERRORS_MAX,
	type PlacementError,
	type PlacementErrorCategory,
	type PlacementErrorSkill,
} from "@teacher-os/api/placement-test-contracts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
	buildHighlightSegments,
	circledNumber,
	domPointToOffset,
	newPlacementErrorId,
	normalizePlacementErrorsForSkill,
	overlappingErrorNumber,
	PLACEMENT_ERROR_STYLES,
	type PlacementErrorDraft,
	placementErrorCategoryOptionsForSkill,
	placementErrorStyle,
	resolvePlacementErrorCategory,
	type TextSpan,
	trimTextSpan,
	validatePlacementErrorDraft,
} from "./placement-error-utils";

type EditorState =
	| { mode: "new"; span: TextSpan; draft: PlacementErrorDraft }
	| { mode: "edit"; id: string; draft: PlacementErrorDraft };

const DEFAULT_CATEGORY: PlacementErrorCategory = "grammar";

/** Chú giải màu + kiểu nét cho 4 tiêu chí IELTS theo từng kỹ năng. */
export function PlacementErrorLegend({
	skill,
}: {
	skill: PlacementErrorSkill;
}) {
	const options = placementErrorCategoryOptionsForSkill(skill);
	return (
		<ul
			aria-label="Chú giải loại lỗi"
			className="flex flex-wrap gap-x-3 gap-y-1.5 text-muted-foreground text-xs"
		>
			{options.map((c) => (
				<li key={c.key} className="inline-flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className={cn(
							"inline-block h-3 w-4 shrink-0 rounded-sm border-b-2",
							PLACEMENT_ERROR_STYLES[c.key].swatchCls,
						)}
					/>
					{c.label}
					<span className="sr-only">
						({PLACEMENT_ERROR_STYLES[c.key].lineLabel})
					</span>
				</li>
			))}
		</ul>
	);
}

/**
 * Bài viết / transcript có tô lỗi theo loại + số thứ tự, kèm danh sách thẻ lỗi
 * sửa/xoá được và thêm lỗi bằng cách bôi đen văn bản. Mọi thay đổi chạy lại
 * `locatePlacementErrors` để sắp xếp và đánh số lại.
 */
export function PlacementErrorHighlighter({
	skill,
	text,
	emptyText,
	errors,
	onChange,
}: {
	skill: PlacementErrorSkill;
	text: string;
	emptyText: string;
	errors: PlacementError[];
	onChange: (next: PlacementError[]) => void;
}) {
	const textRef = useRef<HTMLDivElement>(null);
	const markRefs = useRef(new Map<string, HTMLElement>());
	const cardRefs = useRef(new Map<string, HTMLElement>());
	const [selection, setSelection] = useState<TextSpan | null>(null);
	const [selectionError, setSelectionError] = useState<string | null>(null);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [formError, setFormError] = useState<string | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);

	const hasText = text.trim().length > 0;
	const segments = buildHighlightSegments(text, errors);
	const reachedMax = errors.length >= PLACEMENT_ERRORS_MAX;
	const skillLabel = skill === "writing" ? "bài viết" : "transcript";

	const commit = (next: PlacementError[]) => {
		onChange(
			locatePlacementErrors(
				text,
				normalizePlacementErrorsForSkill(next, skill),
			),
		);
	};

	const readSelection = useCallback(() => {
		const container = textRef.current;
		const sel = window.getSelection();
		if (!container || !sel || sel.rangeCount === 0 || sel.isCollapsed) {
			setSelection(null);
			setSelectionError(null);
			return;
		}
		const range = sel.getRangeAt(0);
		const start = domPointToOffset(
			container,
			text.length,
			range.startContainer,
			range.startOffset,
		);
		const end = domPointToOffset(
			container,
			text.length,
			range.endContainer,
			range.endOffset,
		);
		if (start === null || end === null) {
			setSelection(null);
			setSelectionError(null);
			return;
		}
		const span = trimTextSpan(text, start, end);
		if (!span) {
			setSelection(null);
			setSelectionError(null);
			return;
		}
		if (span.quote.length > PLACEMENT_ERROR_QUOTE_MAX) {
			setSelection(null);
			setSelectionError(
				`Đoạn đã chọn dài quá ${PLACEMENT_ERROR_QUOTE_MAX} ký tự — chọn ngắn hơn.`,
			);
			return;
		}
		const overlap = overlappingErrorNumber(errors, span.start, span.end);
		if (overlap !== null) {
			setSelection(null);
			setSelectionError(
				`Đoạn đã chọn trùng với lỗi ${circledNumber(overlap)} — sửa thẻ đó thay vì thêm mới.`,
			);
			return;
		}
		setSelection(span);
		setSelectionError(null);
	}, [errors, text]);

	// Đọc vùng chọn khi thả chuột/cảm ứng hoặc nhả phím (Shift+mũi tên) trên
	// khối văn bản; nút "Thêm lỗi" chặn mousedown nên vùng chọn đã lưu không mất.
	useEffect(() => {
		const container = textRef.current;
		if (!container) return;
		const events = ["mouseup", "keyup", "touchend"] as const;
		for (const ev of events) container.addEventListener(ev, readSelection);
		return () => {
			for (const ev of events) container.removeEventListener(ev, readSelection);
		};
	}, [readSelection]);

	const focusCard = (id: string) => {
		setActiveId(id);
		const card = cardRefs.current.get(id);
		card?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
		card?.focus();
	};

	const focusMark = (id: string) => {
		setActiveId(id);
		const mark = markRefs.current.get(id);
		mark?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
		mark?.focus();
	};

	const onMarkKeyDown = (e: KeyboardEvent<HTMLElement>, id: string) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			focusCard(id);
		}
	};

	const openNew = () => {
		if (!selection || reachedMax) return;
		setFormError(null);
		setEditor({
			mode: "new",
			span: selection,
			draft: {
				category: DEFAULT_CATEGORY,
				quote: selection.quote,
				correction: "",
				explanation: "",
			},
		});
	};

	const openEdit = (error: PlacementError) => {
		setFormError(null);
		setEditor({
			mode: "edit",
			id: error.id,
			draft: {
				category: resolvePlacementErrorCategory(error.category, skill),
				quote: error.quote,
				correction: error.correction,
				explanation: error.explanation,
			},
		});
	};

	const saveEditor = () => {
		if (!editor) return;
		const invalid = validatePlacementErrorDraft(editor.draft);
		if (invalid) {
			setFormError(invalid);
			return;
		}
		const draft = {
			...editor.draft,
			correction: editor.draft.correction.trim(),
			explanation: editor.draft.explanation.trim(),
		};
		if (editor.mode === "new") {
			const id = newPlacementErrorId();
			commit([
				...errors,
				{
					id,
					...draft,
					start: editor.span.start,
					end: editor.span.end,
				},
			]);
			setSelection(null);
			window.getSelection()?.removeAllRanges();
			setActiveId(id);
		} else {
			commit(
				errors.map((err) =>
					err.id === editor.id ? { ...err, ...draft } : err,
				),
			);
		}
		setEditor(null);
		setFormError(null);
	};

	const removeError = (id: string) => {
		commit(errors.filter((err) => err.id !== id));
		if (editor?.mode === "edit" && editor.id === id) setEditor(null);
	};

	const updateDraft = (patch: Partial<PlacementErrorDraft>) => {
		setEditor((prev) =>
			prev ? { ...prev, draft: { ...prev.draft, ...patch } } : prev,
		);
	};

	return (
		<div className="space-y-2" data-testid={`${skill}-error-highlighter`}>
			{hasText ? (
				<div
					ref={textRef}
					data-testid={`${skill}-highlight-text`}
					className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded border border-border bg-muted/30 p-2.5 text-foreground text-sm leading-[1.85]"
				>
					{segments.map((seg) => {
						if (seg.kind === "text") {
							return (
								<span key={`t-${seg.start}`} data-start={seg.start}>
									{seg.text}
								</span>
							);
						}
						const resolvedCategory = resolvePlacementErrorCategory(
							seg.error.category,
							skill,
						);
						const style = placementErrorStyle(resolvedCategory, skill);
						return (
							<span key={`e-${seg.error.id}`}>
								{/* biome-ignore lint/a11y/useSemanticElements: <button> chặn bôi đen văn bản bên trong — mark cần vừa chọn được chữ vừa bấm/Enter để nhảy tới thẻ lỗi */}
								<span
									ref={(el) => {
										if (el) markRefs.current.set(seg.error.id, el);
										else markRefs.current.delete(seg.error.id);
									}}
									data-start={seg.start}
									data-testid={`${skill}-error-mark`}
									data-category={resolvedCategory}
									role="button"
									tabIndex={0}
									aria-label={`Lỗi ${seg.number}: ${style.label} — “${seg.text}”`}
									onClick={() => focusCard(seg.error.id)}
									onKeyDown={(e) => onMarkKeyDown(e, seg.error.id)}
									className={cn(
										"cursor-pointer rounded-sm px-px text-inherit underline decoration-2 underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
										style.markCls,
										activeId === seg.error.id && "ring-2 ring-ring",
									)}
								>
									{seg.text}
								</span>
								<sup
									data-at={seg.end}
									aria-hidden="true"
									onClick={() => focusCard(seg.error.id)}
									className="ml-0.5 cursor-pointer select-none font-semibold text-foreground text-xs"
								>
									{circledNumber(seg.number)}
								</sup>
							</span>
						);
					})}
				</div>
			) : (
				<p className="rounded border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
					{emptyText}
				</p>
			)}

			{hasText && (
				<div className="flex flex-wrap items-center justify-between gap-2">
					<PlacementErrorLegend skill={skill} />
					<Button
						variant="outline"
						size="sm"
						disabled={!selection || reachedMax}
						onMouseDown={(e) => e.preventDefault()}
						onClick={openNew}
						data-testid={`${skill}-add-error-btn`}
					>
						<Plus className="size-3.5" />
						Thêm lỗi từ đoạn đã chọn
					</Button>
				</div>
			)}
			{hasText && (
				<p className="text-muted-foreground text-xs" aria-live="polite">
					{reachedMax
						? `Đã đủ ${PLACEMENT_ERRORS_MAX} lỗi — xoá bớt để thêm mới.`
						: (selectionError ??
							(selection
								? `Đã chọn: “${selection.quote}”`
								: `Bôi đen một đoạn trong ${skillLabel} rồi bấm “Thêm lỗi từ đoạn đã chọn”.`))}
				</p>
			)}

			{editor && (
				<ErrorForm
					skill={skill}
					editor={editor}
					formError={formError}
					onDraftChange={updateDraft}
					onCancel={() => {
						setEditor(null);
						setFormError(null);
					}}
					onSave={saveEditor}
				/>
			)}

			{errors.length > 0 ? (
				<ol
					aria-label={`Danh sách lỗi ${skillLabel}`}
					className="space-y-1.5"
					data-testid={`${skill}-error-list`}
				>
					{errors.map((error, index) => {
						const number = index + 1;
						const located = error.start !== null && error.end !== null;
						const resolvedCategory = resolvePlacementErrorCategory(
							error.category,
							skill,
						);
						const style = placementErrorStyle(resolvedCategory, skill);
						return (
							<li
								key={error.id}
								ref={(el) => {
									if (el) cardRefs.current.set(error.id, el);
									else cardRefs.current.delete(error.id);
								}}
								tabIndex={-1}
								data-testid={`${skill}-error-card`}
								data-category={resolvedCategory}
								aria-label={`Lỗi ${number}: ${style.label}`}
								className={cn(
									"rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
									activeId === error.id && "border-ring",
									style.borderLeftCls,
								)}
							>
								<div className="flex flex-wrap items-start justify-between gap-2">
									<div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
										<button
											type="button"
											disabled={!located}
											onClick={() => focusMark(error.id)}
											aria-label={
												located
													? `Xem lỗi ${number} trong ${skillLabel}`
													: `Lỗi ${number} không tìm thấy trong ${skillLabel}`
											}
											className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border px-1 font-semibold text-foreground text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60"
										>
											{circledNumber(number)}
										</button>
										<span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-medium text-foreground">
											<span
												aria-hidden="true"
												className={cn(
													"inline-block size-2.5 rounded-full border",
													style.swatchCls,
												)}
											/>
											{style.label}
										</span>
										<span className="min-w-0 break-words text-foreground">
											<span className="line-through decoration-muted-foreground">
												{error.quote}
											</span>
											{error.correction && (
												<>
													<span aria-hidden="true"> → </span>
													<span className="sr-only"> sửa thành </span>
													<strong className="font-semibold">
														{error.correction}
													</strong>
												</>
											)}
										</span>
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Sửa lỗi ${number}`}
											onClick={() => openEdit(error)}
										>
											<Pencil className="size-3.5" />
										</Button>
										<Button
											variant="ghost"
											size="icon-sm"
											aria-label={`Xoá lỗi ${number}`}
											onClick={() => removeError(error.id)}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								</div>
								{error.explanation && (
									<p className="mt-1 break-words text-muted-foreground">
										{error.explanation}
									</p>
								)}
								{!located && (
									<p className="mt-1 text-muted-foreground italic">
										Không tìm thấy đoạn này trong {skillLabel} — thẻ vẫn được
										lưu nhưng không tô.
									</p>
								)}
							</li>
						);
					})}
				</ol>
			) : (
				<p className="text-muted-foreground text-xs">
					Chưa có lỗi nào được đánh dấu.
				</p>
			)}
		</div>
	);
}

function ErrorForm({
	skill,
	editor,
	formError,
	onDraftChange,
	onCancel,
	onSave,
}: {
	skill: PlacementErrorSkill;
	editor: EditorState;
	formError: string | null;
	onDraftChange: (patch: Partial<PlacementErrorDraft>) => void;
	onCancel: () => void;
	onSave: () => void;
}) {
	const { draft } = editor;
	const options = placementErrorCategoryOptionsForSkill(skill);
	const resolvedCategory = resolvePlacementErrorCategory(draft.category, skill);
	return (
		<div
			data-testid={`${skill}-error-form`}
			className="space-y-2.5 rounded-md border border-border bg-background p-3"
		>
			<div className="font-medium text-foreground text-xs">
				{editor.mode === "new" ? "Thêm lỗi mới" : "Sửa lỗi"}
			</div>
			<div className="grid gap-2.5 sm:grid-cols-2">
				<Field label="Loại lỗi">
					<Select
						value={resolvedCategory}
						onChange={(e) =>
							onDraftChange({
								category: e.target.value as PlacementErrorCategory,
							})
						}
					>
						{options.map((c) => (
							<option key={c.key} value={c.key}>
								{c.label}
							</option>
						))}
					</Select>
				</Field>
				{editor.mode === "edit" ? (
					<Field label="Đoạn bị sai">
						<Input
							value={draft.quote}
							maxLength={PLACEMENT_ERROR_QUOTE_MAX}
							onChange={(e) => onDraftChange({ quote: e.target.value })}
						/>
					</Field>
				) : (
					<div className="flex flex-col gap-2">
						<span className="font-medium text-sm leading-none">
							Đoạn bị sai
						</span>
						<span className="break-words rounded-md bg-muted px-3 py-2 text-foreground text-sm">
							{draft.quote}
						</span>
					</div>
				)}
			</div>
			<Field label="Cách sửa">
				<Input
					value={draft.correction}
					maxLength={PLACEMENT_ERROR_QUOTE_MAX}
					onChange={(e) => onDraftChange({ correction: e.target.value })}
				/>
			</Field>
			<Field label="Giải thích">
				<Textarea
					rows={2}
					value={draft.explanation}
					maxLength={PLACEMENT_ERROR_EXPLANATION_MAX}
					onChange={(e) => onDraftChange({ explanation: e.target.value })}
				/>
			</Field>
			{formError && (
				<p role="alert" className="text-destructive text-xs">
					{formError}
				</p>
			)}
			<div className="flex flex-wrap justify-end gap-2">
				<Button variant="outline" size="sm" onClick={onCancel}>
					Huỷ
				</Button>
				<Button
					variant="primary"
					size="sm"
					onClick={onSave}
					data-testid={`${skill}-error-save-btn`}
				>
					{editor.mode === "new" ? "Thêm lỗi" : "Lưu thay đổi"}
				</Button>
			</div>
		</div>
	);
}
