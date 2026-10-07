import {
	type EssayAnnotation,
	type EssayAnnotationCreate,
	QUIZ_ANNOTATION_NOTE_MAX,
} from "@teacher-os/api/contracts";
import {
	excerpt,
	orderedAnnotations,
	overlapsAny,
	snapSpanToWords,
} from "@teacher-os/api/lib/essay-annotations";
import { EssayWithHighlights } from "@teacher-os/ui/components/quiz/essay-with-highlights";
import {
	type HTMLAttributes,
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/cn";

const APP_MEDIA_QUERY = "(min-width: 921px)";
const POPOVER_WIDTH = 320;

export type AnnotatableEssayProps = {
	essay: string;
	annotations: EssayAnnotation[];
	pending: boolean;
	/** Tất cả callback ném Error với message thân thiện khi thất bại —
	 * component hiển thị ngay tại vị trí thao tác (popover/hàng sửa/xác nhận
	 * xoá). Popover remount theo draft nên lỗi cũ không dính lần chọn mới. */
	onCreate(input: EssayAnnotationCreate): Promise<unknown>;
	onUpdate(id: string, note: string): Promise<unknown>;
	onDelete(id: string): Promise<unknown>;
};

type SelectionDraft = {
	start: number;
	end: number;
	/** Toạ độ popover theo wrapper `relative` (px). */
	top: number;
	left: number;
};

/** Ánh xạ DOM selection → offset ký tự trên essay. Mỗi phần tử đoạn của
 * `EssayWithHighlights` chứa đúng một text node và mang `data-start`, nên
 * offset = data-start + caret offset trong text node đó. Vùng chọn tràn ra
 * ngoài khối essay bị bỏ qua (null). */
function offsetOf(
	container: HTMLElement,
	essay: string,
	node: Node,
	offset: number,
): number | null {
	const startOf = (el: Element | null | undefined) => {
		const seg = el?.closest<HTMLElement>("[data-start]");
		if (!seg || !container.contains(seg)) return null;
		const start = Number(seg.dataset.start);
		return Number.isNaN(start) ? null : start;
	};
	if (node.nodeType === Node.TEXT_NODE) {
		const start = startOf(node.parentElement);
		return start === null ? null : start + offset;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return null;
	const el = node as HTMLElement;
	if (el === container) {
		if (offset === container.childNodes.length) return essay.length;
		const child = container.childNodes[offset];
		if (!child) return null;
		return startOf(
			child.nodeType === Node.TEXT_NODE
				? child.parentElement
				: (child as Element),
		);
	}
	const start = startOf(el);
	if (start === null) return null;
	return offset === 0 ? start : start + (el.textContent?.length ?? 0);
}

/**
 * Bôi đen để highlight trên trang chấm Writing (#332): chọn từ/cụm từ →
 * bắt dính ranh giới từ → popover ghi chú → lưu ngay qua `onCreate`. Sửa
 * và xoá thực hiện tại danh sách "Ghi chú trên bài viết" dưới essay; bấm
 * highlight thì nhảy tới mục tương ứng. Tạo mới cần bôi đen bằng chuột/cảm
 * ứng; duyệt highlight thì bàn phím được hoàn toàn.
 */
export function AnnotatableEssay({
	essay,
	annotations,
	pending,
	onCreate,
	onUpdate,
	onDelete,
}: AnnotatableEssayProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const essayRef = useRef<HTMLDivElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<number | null>(null);
	const [draft, setDraft] = useState<SelectionDraft | null>(null);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	// jsdom/node không có matchMedia — mặc định desktop để test popover 320px.
	const [isWide, setIsWide] = useState(
		() =>
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function" ||
			window.matchMedia(APP_MEDIA_QUERY).matches,
	);

	useEffect(() => {
		// jsdom/node không có matchMedia — giữ giá trị mặc định (desktop).
		if (typeof window.matchMedia !== "function") return;
		const mq = window.matchMedia(APP_MEDIA_QUERY);
		const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);

	const readSelection = useCallback((): SelectionDraft | null => {
		const container = essayRef.current;
		const wrapper = wrapperRef.current;
		if (!container || !wrapper) return null;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
		const range = sel.getRangeAt(0);
		if (
			!container.contains(range.startContainer) ||
			!container.contains(range.endContainer)
		) {
			return null;
		}
		const start = offsetOf(
			container,
			essay,
			range.startContainer,
			range.startOffset,
		);
		const end = offsetOf(container, essay, range.endContainer, range.endOffset);
		if (start === null || end === null || start >= end) return null;
		const snapped = snapSpanToWords(essay, start, end);
		if (!snapped) return null;
		const wrapperRect = wrapper.getBoundingClientRect();
		const rect = range.getBoundingClientRect();
		const rawLeft = rect.left - wrapperRect.left;
		return {
			...snapped,
			top: rect.bottom - wrapperRect.top + 8,
			left: isWide
				? Math.min(
						Math.max(0, rawLeft),
						Math.max(0, wrapper.offsetWidth - POPOVER_WIDTH),
					)
				: 0,
		};
	}, [essay, isWide]);

	const applySelection = useCallback(() => {
		setDraft(readSelection());
	}, [readSelection]);

	// Bắt vùng chọn: pointerup/keyup trên khối essay phủ chuột + bàn phím
	// (Shift+mũi tên); selectionchange (debounce) phủ cảm ứng, khi menu
	// copy/paste native chiếm pointer.
	useEffect(() => {
		const container = essayRef.current;
		if (!container) return;
		container.addEventListener("pointerup", applySelection);
		container.addEventListener("keyup", applySelection);
		return () => {
			container.removeEventListener("pointerup", applySelection);
			container.removeEventListener("keyup", applySelection);
		};
	}, [applySelection]);

	useEffect(() => {
		const onSelectionChange = () => {
			if (debounceRef.current !== null) {
				window.clearTimeout(debounceRef.current);
			}
			debounceRef.current = window.setTimeout(() => {
				const container = essayRef.current;
				const sel = window.getSelection();
				if (
					!container ||
					!sel ||
					sel.isCollapsed ||
					!sel.anchorNode ||
					!container.contains(sel.anchorNode)
				) {
					return;
				}
				applySelection();
			}, 250);
		};
		document.addEventListener("selectionchange", onSelectionChange);
		return () => {
			document.removeEventListener("selectionchange", onSelectionChange);
			if (debounceRef.current !== null) {
				window.clearTimeout(debounceRef.current);
			}
		};
	}, [applySelection]);

	const cancelDraft = useCallback((clearSelection: boolean) => {
		setDraft(null);
		if (clearSelection) {
			window.getSelection()?.removeAllRanges();
		}
	}, []);

	// Esc hoặc bấm ra ngoài khối essay/popover → huỷ popover.
	useEffect(() => {
		if (!draft) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") cancelDraft(true);
		};
		const onPointerDown = (e: PointerEvent) => {
			const target = e.target;
			if (
				target instanceof Node &&
				!popoverRef.current?.contains(target) &&
				!essayRef.current?.contains(target)
			) {
				cancelDraft(false);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [draft, cancelDraft]);

	const buildMarkProps = (
		annotation: EssayAnnotation,
		n: number,
	): HTMLAttributes<HTMLElement> => {
		const jump = () => jumpToList(annotation.id);
		return {
			tabIndex: 0,
			role: "button",
			"aria-label": `Highlight ${n}: ${annotation.note || "chưa có ghi chú"}`,
			className:
				"cursor-pointer focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
			onClick: jump,
			onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					jump();
				}
			},
		};
	};

	/** Bấm/Enter trên highlight → nhảy tới mục tương ứng trong danh sách. */
	function jumpToList(annotationId: string) {
		setActiveId(annotationId);
		const item = document.getElementById(`annotation-${annotationId}`);
		item?.focus();
		item?.scrollIntoView({ block: "nearest" });
	}

	const ordered = orderedAnnotations(essay, annotations);
	const draftOverlaps = draft
		? overlapsAny(annotations, draft.start, draft.end)
		: false;

	return (
		<div className="flex flex-col gap-3">
			<div ref={wrapperRef} className="relative">
				<EssayWithHighlights
					ref={essayRef}
					essay={essay}
					annotations={annotations}
					activeId={activeId}
					markProps={buildMarkProps}
					data-testid="essay-text"
					className="rounded-md border border-line bg-card p-4 text-fg text-sm leading-relaxed focus-visible:outline-none"
					tabIndex={draft === null ? undefined : -1}
				/>
				{draft && (
					<div
						ref={popoverRef}
						role="dialog"
						aria-label="Thêm highlight"
						className={cn(
							"absolute z-20 rounded-lg border border-line bg-bg p-4 shadow-[var(--elev-raised)]",
							isWide ? "w-[320px]" : "right-0 left-0",
						)}
						style={
							isWide ? { top: draft.top, left: draft.left } : { top: draft.top }
						}
						onKeyDown={(e) => {
							if (e.key === "Escape") cancelDraft(true);
						}}
					>
						<p className="text-muted-fg text-sm">
							“{excerpt(essay.slice(draft.start, draft.end), 120)}”
						</p>
						{draftOverlaps && (
							<p role="alert" className="mt-2 text-[11px] text-danger">
								Đoạn này trùng với highlight khác.
							</p>
						)}
						<CreateHighlightForm
							key={`${draft.start}:${draft.end}`}
							pending={pending || draftOverlaps}
							onCancel={() => cancelDraft(true)}
							onSave={async (note) => {
								if (!draft) return;
								await onCreate({ start: draft.start, end: draft.end, note });
								cancelDraft(true);
								essayRef.current?.focus();
							}}
						/>
					</div>
				)}
			</div>

			<SectionLabel>{`Ghi chú trên bài viết (${ordered.length})`}</SectionLabel>
			{ordered.length === 0 ? (
				<p className="text-muted-fg text-sm">
					Bôi đen từ hoặc cụm từ trong bài để highlight và ghi chú.
				</p>
			) : (
				<ol aria-label="Ghi chú trên bài viết" className="flex flex-col gap-2">
					{ordered.map(({ annotation, n }) => (
						<li
							key={annotation.id}
							id={`annotation-${annotation.id}`}
							tabIndex={-1}
							className={cn(
								"rounded-xl border border-line bg-card p-3 focus-visible:outline-none",
								activeId === annotation.id && "ring-1 ring-fg",
							)}
						>
							<div className="flex items-start gap-2">
								<span className="font-mono text-meta text-xs">{n}</span>
								<div className="flex min-w-0 flex-1 flex-col gap-1">
									<p className="text-muted-fg text-sm">
										“
										{excerpt(essay.slice(annotation.start, annotation.end), 80)}
										”
									</p>
									{confirmDeleteId === annotation.id ? (
										<div className="flex flex-col gap-2">
											<div className="flex items-center gap-2">
												<span className="text-fg text-sm">
													Xoá highlight này?
												</span>
												<Button
													variant="danger"
													size="sm"
													disabled={pending}
													onClick={() => {
														setDeleteError(null);
														onDelete(annotation.id)
															.then(() => setConfirmDeleteId(null))
															.catch((e: unknown) =>
																setDeleteError(
																	e instanceof Error
																		? e.message
																		: "Không xoá được highlight. Thử lại.",
																),
															);
													}}
												>
													Xoá
												</Button>
												<Button
													variant="ghost"
													size="sm"
													onClick={() => {
														setConfirmDeleteId(null);
														setDeleteError(null);
													}}
												>
													Huỷ
												</Button>
											</div>
											{deleteError && (
												<p role="alert" className="text-[11px] text-danger">
													{deleteError}
												</p>
											)}
										</div>
									) : editingId === annotation.id ? (
										<EditNoteRow
											key={`${annotation.id}:${annotation.note}`}
											annotation={annotation}
											n={n}
											pending={pending}
											onCancel={() => setEditingId(null)}
											onSave={async (note) => {
												await onUpdate(annotation.id, note);
												setEditingId(null);
											}}
										/>
									) : (
										<>
											{annotation.note === "" ? (
												<p className="text-meta text-sm">Chưa có ghi chú</p>
											) : (
												<p className="whitespace-pre-wrap text-fg text-sm">
													{annotation.note}
												</p>
											)}
											<div className="mt-1 flex gap-1">
												<Button
													variant="ghost"
													size="sm"
													aria-label={`Sửa ghi chú ${n}`}
													onClick={() => setEditingId(annotation.id)}
												>
													Sửa
												</Button>
												<Button
													variant="ghost"
													size="sm"
													aria-label={`Xoá highlight ${n}`}
													onClick={() => {
														setDeleteError(null);
														setConfirmDeleteId(annotation.id);
													}}
												>
													Xoá
												</Button>
											</div>
										</>
									)}
								</div>
							</div>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

/** Form tạo highlight trong popover — remount theo draft nên state note và
 * lỗi lưu sạch theo mỗi lần chọn đoạn mới. */
function CreateHighlightForm({
	pending,
	onSave,
	onCancel,
}: {
	pending: boolean;
	onSave(note: string): Promise<void>;
	onCancel(): void;
}) {
	const [note, setNote] = useState("");
	const [saveError, setSaveError] = useState<string | null>(null);
	return (
		<div className="mt-2 flex flex-col gap-2">
			<Field label="Ghi chú">
				<Textarea
					id="annotation-note"
					value={note}
					maxLength={QUIZ_ANNOTATION_NOTE_MAX}
					placeholder="Tuỳ chọn…"
					autoFocus
					onChange={(e) => setNote(e.target.value)}
				/>
			</Field>
			{saveError && (
				<p role="alert" className="text-[11px] text-danger">
					{saveError}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					disabled={pending}
					onClick={() => {
						setSaveError(null);
						onSave(note).catch((e: unknown) =>
							setSaveError(
								e instanceof Error
									? e.message
									: "Không lưu được highlight. Thử lại.",
							),
						);
					}}
				>
					Lưu highlight
				</Button>
				<Button variant="ghost" onClick={onCancel}>
					Huỷ
				</Button>
			</div>
		</div>
	);
}

/** Sửa ghi chú tại chỗ trong danh sách; Esc huỷ. */
function EditNoteRow({
	annotation,
	n,
	pending,
	onSave,
	onCancel,
}: {
	annotation: EssayAnnotation;
	n: number;
	pending: boolean;
	onSave(note: string): Promise<void>;
	onCancel(): void;
}) {
	const [note, setNote] = useState(annotation.note);
	const [saveError, setSaveError] = useState<string | null>(null);
	return (
		<div className="flex flex-col gap-2">
			<Field label={`Ghi chú highlight ${n}`}>
				<Textarea
					value={note}
					maxLength={QUIZ_ANNOTATION_NOTE_MAX}
					autoFocus
					onChange={(e) => setNote(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") onCancel();
					}}
				/>
			</Field>
			{saveError && (
				<p role="alert" className="text-[11px] text-danger">
					{saveError}
				</p>
			)}
			<div className="flex gap-2">
				<Button
					size="sm"
					disabled={pending}
					onClick={() => {
						setSaveError(null);
						onSave(note).catch((e: unknown) =>
							setSaveError(
								e instanceof Error
									? e.message
									: "Không lưu được ghi chú. Thử lại.",
							),
						);
					}}
				>
					Lưu
				</Button>
				<Button variant="ghost" size="sm" onClick={onCancel}>
					Huỷ
				</Button>
			</div>
		</div>
	);
}
