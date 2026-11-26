import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import {
	applyHighlightSpan,
	buildPassageModel,
	computeLastSegmentEndById,
	getPassageExcerpt,
	normalizeReadingAnnotations,
	type PassageAstNode,
	READING_ANNOTATION_NOTE_MAX,
	type ReadingAnnotation,
	readDomSelectionRange,
	removeHighlightRange,
	snapPassageSpan,
	splitLeafByAnnotations,
	upsertNoteSpan,
} from "@teacher-os/ui/lib/reading-annotations";
import { RICH_TEXT_CONTENT_CLASSES } from "@teacher-os/ui/lib/rich-text-content-classes";
import { cn } from "@teacher-os/ui/lib/utils";
import { Eraser, Highlighter, StickyNote, Trash2, X } from "lucide-react";
import {
	createElement,
	Fragment,
	type KeyboardEvent as ReactKeyboardEvent,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";

export type ReadingAnnotationMode = "edit" | "readonly";

export interface ReadingAnnotationConfig {
	mode: ReadingAnnotationMode;
	items: readonly ReadingAnnotation[];
	onChange?: (next: ReadingAnnotation[]) => void;
}

type ActiveOverlay =
	| null
	| {
			kind: "toolbar";
			start: number;
			end: number;
			top: number;
			left: number;
			overlaps: boolean;
	  }
	| {
			kind: "contextMenu";
			x: number;
			y: number;
			start: number;
			end: number;
			highlightId?: string;
			overlaps: boolean;
	  }
	| {
			kind: "notePopover";
			start: number;
			end: number;
			highlightId?: string;
			top: number;
			left: number;
			triggerEl?: HTMLElement | null;
	  };

const MOBILE_BREAKPOINT_PX = 921;
const VIEWPORT_MARGIN_PX = 8;
const TOOLBAR_TWO_BTN_EST_WIDTH = 200;
const TOOLBAR_THREE_BTN_EST_WIDTH = 304;
const TOOLBAR_EST_HEIGHT = 44;
const MENU_EST_WIDTH = 200;
const MENU_EST_HEIGHT = 132;
const POPOVER_EST_WIDTH = 320;
const POPOVER_EST_HEIGHT = 240;

function getViewportBounds(): {
	width: number;
	height: number;
	offsetTop: number;
	offsetLeft: number;
} {
	if (typeof window === "undefined") {
		return { width: 1280, height: 800, offsetTop: 0, offsetLeft: 0 };
	}
	const vv = window.visualViewport;
	if (vv) {
		return {
			width: vv.width,
			height: vv.height,
			offsetTop: vv.offsetTop,
			offsetLeft: vv.offsetLeft,
		};
	}
	return {
		width: window.innerWidth,
		height: window.innerHeight,
		offsetTop: 0,
		offsetLeft: 0,
	};
}

function clampPosition(
	rawLeft: number,
	rawTop: number,
	boxWidth: number,
	boxHeight: number,
): { left: number; top: number } {
	const vp = getViewportBounds();
	const minLeft = vp.offsetLeft + VIEWPORT_MARGIN_PX;
	const maxLeft = Math.max(
		minLeft,
		vp.offsetLeft + vp.width - boxWidth - VIEWPORT_MARGIN_PX,
	);
	const minTop = vp.offsetTop + VIEWPORT_MARGIN_PX;
	const maxTop = Math.max(
		minTop,
		vp.offsetTop + vp.height - boxHeight - VIEWPORT_MARGIN_PX,
	);
	const safeLeft = Number.isFinite(rawLeft) ? rawLeft : minLeft;
	const safeTop = Number.isFinite(rawTop) ? rawTop : minTop;
	return {
		left: Math.min(Math.max(minLeft, safeLeft), maxLeft),
		top: Math.min(Math.max(minTop, safeTop), maxTop),
	};
}

function computeToolbarPosition(
	rect: DOMRect,
	overlaps: boolean,
): { top: number; left: number } {
	const vp = getViewportBounds();
	const estWidth = Math.min(
		overlaps ? TOOLBAR_THREE_BTN_EST_WIDTH : TOOLBAR_TWO_BTN_EST_WIDTH,
		vp.width - VIEWPORT_MARGIN_PX * 2,
	);
	const estHeight = vp.width < 360 && overlaps ? 84 : TOOLBAR_EST_HEIGHT;
	const placeBelow = vp.width < MOBILE_BREAKPOINT_PX || rect.top < 120;
	const rawTop = placeBelow ? rect.bottom + 8 : rect.top - estHeight - 8;
	const rawLeft = rect.left + rect.width / 2 - estWidth / 2;
	return clampPosition(rawLeft, rawTop, estWidth, estHeight);
}

function computePopoverPosition(rect: DOMRect): { top: number; left: number } {
	const vp = getViewportBounds();
	const width = Math.min(POPOVER_EST_WIDTH, vp.width - VIEWPORT_MARGIN_PX * 2);
	if (vp.width < MOBILE_BREAKPOINT_PX) {
		// Tránh bị bàn phím ảo che trên mobile: neo sát nửa trên visualViewport dưới header.
		const top = Math.max(
			vp.offsetTop + 64,
			Math.min(rect.bottom + 8, vp.offsetTop + 96),
		);
		return clampPosition(
			vp.offsetLeft + VIEWPORT_MARGIN_PX,
			top,
			width,
			POPOVER_EST_HEIGHT,
		);
	}
	const placeAbove =
		rect.bottom + POPOVER_EST_HEIGHT + 16 > vp.offsetTop + vp.height;
	const rawTop = placeAbove
		? rect.top - POPOVER_EST_HEIGHT - 8
		: rect.bottom + 8;
	return clampPosition(rect.left, rawTop, width, POPOVER_EST_HEIGHT);
}

function findMarkByHighlightId(
	root: HTMLElement | null,
	highlightId: string,
): HTMLElement | null {
	if (!root) return null;
	const marks = root.querySelectorAll<HTMLElement>("mark[data-highlight-id]");
	for (const mark of marks) {
		if (mark.dataset.highlightId === highlightId) {
			return mark;
		}
	}
	return null;
}

/**
 * Bài đọc Reading có công cụ tô sáng (highlight) & gắn ghi chú chuẩn IELTS CBT:
 * - Parse HTML đã sanitize thành React AST cắt text-leaf theo offset UTF-16.
 * - Floating selection toolbar + right-click context menu + note popover +
 *   collapsible notes panel + xác nhận xoá tất cả.
 * - Tôn trọng modal focus trap, outside-click, Escape guard, mobile pointercancel,
 *   và ancestor-filtered capture scroll.
 */
export function AnnotatableReadingPassage({
	passage,
	annotations,
}: {
	passage: string;
	annotations: ReadingAnnotationConfig;
}) {
	const { mode, items, onChange } = annotations;
	const isEdit = mode === "edit";
	const panelId = useId();
	const passageRef = useRef<HTMLDivElement>(null);
	const portalOverlayRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);
	const selectionTimerRef = useRef<number | null>(null);
	const overlayRef = useRef<ActiveOverlay>(null);

	const [overlay, setOverlay] = useState<ActiveOverlay>(null);
	const [panelOpen, setPanelOpen] = useState(false);
	const [confirmClearAll, setConfirmClearAll] = useState(false);
	const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
		null,
	);
	overlayRef.current = overlay;

	const isBrowserDom =
		typeof document !== "undefined" && typeof DOMParser !== "undefined";

	const model = useMemo(() => buildPassageModel(passage), [passage]);
	const normalized = useMemo(
		() => normalizeReadingAnnotations(items, model.canonicalText.length),
		[items, model.canonicalText.length],
	);
	const normalizedRef = useRef(normalized);
	normalizedRef.current = normalized;

	const lastSegmentEnds = useMemo(
		() => computeLastSegmentEndById(model.nodes, normalized),
		[model.nodes, normalized],
	);

	const clearSelectionTimer = useCallback(() => {
		if (selectionTimerRef.current !== null && typeof window !== "undefined") {
			window.clearTimeout(selectionTimerRef.current);
			selectionTimerRef.current = null;
		}
	}, []);

	const restoreFocus = useCallback((triggerEl?: HTMLElement | null) => {
		if (triggerEl?.isConnected) {
			triggerEl.focus();
			return;
		}
		passageRef.current?.focus();
	}, []);

	const closeOverlay = useCallback(
		(opts?: { clearSelection?: boolean; restoreTriggerFocus?: boolean }) => {
			const prev = overlayRef.current;
			clearSelectionTimer();
			setOverlay(null);
			if (opts?.clearSelection && typeof window !== "undefined") {
				window.getSelection()?.removeAllRanges();
			}
			if (opts?.restoreTriggerFocus && prev?.kind === "notePopover") {
				restoreFocus(prev.triggerEl);
			}
		},
		[clearSelectionTimer, restoreFocus],
	);

	// Reset mọi trạng thái tạm (popover, toolbar, context menu, xác nhận xoá) khi passage hoặc mode đổi.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset when passage or mode changes
	useEffect(() => {
		clearSelectionTimer();
		draggingRef.current = false;
		setOverlay(null);
		setConfirmClearAll(false);
		setActiveHighlightId(null);
	}, [passage, mode, clearSelectionTimer]);

	const readCurrentSelection = useCallback((): {
		start: number;
		end: number;
		rect: DOMRect;
		overlaps: boolean;
	} | null => {
		const container = passageRef.current;
		if (!container || typeof window === "undefined") return null;
		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
		const range = sel.getRangeAt(0);
		const raw = readDomSelectionRange(container, range, model);
		if (!raw) return null;
		const snapped = snapPassageSpan(model, raw.start, raw.end);
		if (!snapped) return null;
		const rect = range.getBoundingClientRect();
		const overlaps = normalizedRef.current.some(
			(a) => a.start < snapped.end && snapped.start < a.end,
		);
		return {
			start: snapped.start,
			end: snapped.end,
			rect,
			overlaps,
		};
	}, [model]);

	const openToolbarFromSelection = useCallback(() => {
		if (!isEdit) return;
		const info = readCurrentSelection();
		if (!info) {
			setOverlay((prev) => (prev?.kind === "toolbar" ? null : prev));
			return;
		}
		const pos = computeToolbarPosition(info.rect, info.overlaps);
		setOverlay({
			kind: "toolbar",
			start: info.start,
			end: info.end,
			top: pos.top,
			left: pos.left,
			overlaps: info.overlaps,
		});
	}, [isEdit, readCurrentSelection]);

	const handleContextMenu = useCallback(
		(e: MouseEvent) => {
			if (!isEdit) return;
			clearSelectionTimer();
			draggingRef.current = false;

			const hasValidPointer =
				Number.isFinite(e.clientX) &&
				Number.isFinite(e.clientY) &&
				!(e.clientX === 0 && e.clientY === 0);

			const selInfo = readCurrentSelection();
			if (selInfo) {
				e.preventDefault();
				const rawX = hasValidPointer ? e.clientX : selInfo.rect.left;
				const rawY = hasValidPointer ? e.clientY : selInfo.rect.bottom + 4;
				const pos = clampPosition(rawX, rawY, MENU_EST_WIDTH, MENU_EST_HEIGHT);
				setOverlay({
					kind: "contextMenu",
					x: pos.left,
					y: pos.top,
					start: selInfo.start,
					end: selInfo.end,
					overlaps: selInfo.overlaps,
				});
				return;
			}

			const targetEl =
				e.target instanceof Element
					? e.target
					: e.target instanceof Node
						? e.target.parentElement
						: null;
			const markEl = targetEl?.closest<HTMLElement>("mark[data-highlight-id]");
			const highlightId = markEl?.dataset.highlightId;
			if (!markEl || !highlightId || !passageRef.current?.contains(markEl)) {
				closeOverlay({ clearSelection: false, restoreTriggerFocus: false });
				return;
			}
			const existing = normalizedRef.current.find((a) => a.id === highlightId);
			if (!existing) {
				closeOverlay({ clearSelection: false, restoreTriggerFocus: false });
				return;
			}
			e.preventDefault();
			const markRect = markEl.getBoundingClientRect();
			const rawX = hasValidPointer ? e.clientX : markRect.left;
			const rawY = hasValidPointer ? e.clientY : markRect.bottom + 4;
			const pos = clampPosition(rawX, rawY, MENU_EST_WIDTH, MENU_EST_HEIGHT);
			setOverlay({
				kind: "contextMenu",
				x: pos.left,
				y: pos.top,
				start: existing.start,
				end: existing.end,
				highlightId: existing.id,
				overlaps: true,
			});
		},
		[isEdit, clearSelectionTimer, readCurrentSelection, closeOverlay],
	);

	// Pointer, keyboard, contextmenu & mobile touch selection listeners (chỉ bật ở edit mode).
	useEffect(() => {
		if (!isEdit || !isBrowserDom) return;
		const container = passageRef.current;
		if (!container) return;

		const onPointerDown = (e: PointerEvent) => {
			if (e.button === 0) {
				draggingRef.current = true;
				clearSelectionTimer();
				setOverlay((prev) =>
					prev?.kind === "toolbar" || prev?.kind === "contextMenu"
						? null
						: prev,
				);
			}
		};

		const onPointerUp = (e: PointerEvent) => {
			if (e.button !== 0 || !draggingRef.current) return;
			draggingRef.current = false;
			openToolbarFromSelection();
		};

		const onPointerCancel = () => {
			draggingRef.current = false;
		};

		const onKeyUp = (e: KeyboardEvent) => {
			if (
				e.key === "Escape" ||
				e.key === "Enter" ||
				e.key === " " ||
				e.key === "Tab"
			) {
				return;
			}
			const current = overlayRef.current;
			if (current?.kind === "notePopover" || current?.kind === "contextMenu") {
				return;
			}
			openToolbarFromSelection();
		};

		const onSelectionChange = () => {
			clearSelectionTimer();
			selectionTimerRef.current = window.setTimeout(() => {
				selectionTimerRef.current = null;
				if (draggingRef.current) return;
				const current = overlayRef.current;
				if (
					current?.kind === "contextMenu" ||
					current?.kind === "notePopover"
				) {
					return;
				}
				const sel = window.getSelection();
				if (
					!sel ||
					sel.isCollapsed ||
					!sel.anchorNode ||
					!container.contains(sel.anchorNode)
				) {
					if (
						current?.kind === "toolbar" &&
						!portalOverlayRef.current?.contains(document.activeElement)
					) {
						setOverlay((prev) => (prev?.kind === "toolbar" ? null : prev));
					}
					return;
				}
				openToolbarFromSelection();
			}, 250);
		};

		container.addEventListener("pointerdown", onPointerDown);
		container.addEventListener("keyup", onKeyUp);
		container.addEventListener("contextmenu", handleContextMenu);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerCancel);
		document.addEventListener("selectionchange", onSelectionChange);

		return () => {
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("keyup", onKeyUp);
			container.removeEventListener("contextmenu", handleContextMenu);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerCancel);
			document.removeEventListener("selectionchange", onSelectionChange);
			clearSelectionTimer();
		};
	}, [
		isEdit,
		isBrowserDom,
		openToolbarFromSelection,
		clearSelectionTimer,
		handleContextMenu,
	]);

	// Outside-click dismissal (đóng lớp nổi khi bấm vùng ngoài hoặc text thường trong passage).
	useEffect(() => {
		if (!overlay || !isBrowserDom) return;
		const onDocPointerDown = (e: PointerEvent) => {
			const target = e.target;
			if (!(target instanceof Node)) return;
			if (portalOverlayRef.current?.contains(target)) return;
			const targetEl =
				target instanceof Element ? target : target.parentElement;
			const hitAnnotationTrigger = Boolean(
				targetEl?.closest("mark[data-highlight-id], [data-note-trigger]"),
			);
			if (
				overlay.kind === "notePopover" &&
				e.button === 0 &&
				hitAnnotationTrigger &&
				passageRef.current?.contains(target)
			) {
				return;
			}
			closeOverlay({ clearSelection: false, restoreTriggerFocus: false });
		};
		document.addEventListener("pointerdown", onDocPointerDown);
		return () => document.removeEventListener("pointerdown", onDocPointerDown);
	}, [overlay, isBrowserDom, closeOverlay]);

	// Capture-phase Escape guard: đóng lớp đọc trước mà không đóng nhầm TestPreviewOverlay,
	// nhưng nhường hoàn toàn cho QuizDialog (role="alertdialog" aria-modal="true") nếu đang mở.
	useEffect(() => {
		if (!overlay || !isBrowserDom) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape") return;
			if (document.querySelector('[role="alertdialog"][aria-modal="true"]')) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			closeOverlay({ clearSelection: true, restoreTriggerFocus: true });
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [overlay, isBrowserDom, closeOverlay]);

	// Ancestor-filtered capture scroll: chỉ đóng toolbar/contextMenu khi tổ tiên của passage cuộn;
	// không đóng Note Popover đang gõ dở và không bị nhiễu bởi pane câu hỏi/textarea.
	useEffect(() => {
		if (
			!isBrowserDom ||
			!overlay ||
			(overlay.kind !== "toolbar" && overlay.kind !== "contextMenu")
		) {
			return;
		}
		const onScroll = (e: Event) => {
			const target = e.target;
			const passageEl = passageRef.current;
			const isAncestor =
				target === window ||
				target === document ||
				(target instanceof Node && passageEl
					? target.contains(passageEl)
					: false);
			if (isAncestor) {
				closeOverlay({ clearSelection: false, restoreTriggerFocus: false });
			}
		};
		window.addEventListener("scroll", onScroll, {
			capture: true,
			passive: true,
		});
		return () => {
			window.removeEventListener("scroll", onScroll, { capture: true });
		};
	}, [overlay, isBrowserDom, closeOverlay]);

	const commitChange = useCallback(
		(next: ReadingAnnotation[]) => {
			if (!isEdit || !onChange) return;
			onChange(normalizeReadingAnnotations(next, model.canonicalText.length));
		},
		[isEdit, onChange, model.canonicalText.length],
	);

	const handleHighlightRange = useCallback(
		(start: number, end: number) => {
			commitChange(applyHighlightSpan(normalizedRef.current, start, end));
			closeOverlay({ clearSelection: true, restoreTriggerFocus: false });
		},
		[commitChange, closeOverlay],
	);

	const handleRemoveRange = useCallback(
		(start: number, end: number) => {
			commitChange(removeHighlightRange(normalizedRef.current, start, end));
			closeOverlay({ clearSelection: true, restoreTriggerFocus: false });
			passageRef.current?.focus();
		},
		[commitChange, closeOverlay],
	);

	const openNoteForAnnotation = useCallback(
		(
			e: ReactMouseEvent<HTMLElement> | ReactKeyboardEvent<HTMLElement>,
			ann: ReadingAnnotation,
		) => {
			e.preventDefault();
			e.stopPropagation();
			clearSelectionTimer();
			setActiveHighlightId(ann.id);
			const rect = e.currentTarget.getBoundingClientRect();
			const pos = computePopoverPosition(rect);
			setOverlay({
				kind: "notePopover",
				start: ann.start,
				end: ann.end,
				highlightId: ann.id,
				top: pos.top,
				left: pos.left,
				triggerEl: e.currentTarget,
			});
		},
		[clearSelectionTimer],
	);

	const handleMarkClick = useCallback(
		(e: ReactMouseEvent<HTMLElement>, ann: ReadingAnnotation) => {
			const sel = typeof window !== "undefined" ? window.getSelection() : null;
			if (sel && !sel.isCollapsed) return;
			openNoteForAnnotation(e, ann);
		},
		[openNoteForAnnotation],
	);

	const handleMarkKeyDown = useCallback(
		(e: ReactKeyboardEvent<HTMLElement>, ann: ReadingAnnotation) => {
			if (e.key === "Enter" || e.key === " ") {
				openNoteForAnnotation(e, ann);
			}
		},
		[openNoteForAnnotation],
	);

	const openNoteFromRange = useCallback(
		(
			start: number,
			end: number,
			anchorX: number,
			anchorY: number,
			highlightId?: string,
		) => {
			clearSelectionTimer();
			// Nếu vùng chọn chạm đúng 1 highlight đã có ghi chú, mở sẵn ghi chú đó để sửa/mở rộng.
			const touchedNoted = highlightId
				? normalizedRef.current.find((a) => a.id === highlightId)
				: (() => {
						const hits = normalizedRef.current.filter(
							(a) => a.note.trim() !== "" && a.start < end && start < a.end,
						);
						return hits.length === 1 ? hits[0] : undefined;
					})();
			const fakeRect = {
				top: anchorY,
				bottom: anchorY + 20,
				left: anchorX,
				right: anchorX + 80,
				width: 80,
				height: 20,
				x: anchorX,
				y: anchorY,
				toJSON: () => ({}),
			} as DOMRect;
			const pos = computePopoverPosition(fakeRect);
			if (typeof window !== "undefined") {
				window.getSelection()?.removeAllRanges();
			}
			setOverlay({
				kind: "notePopover",
				start,
				end,
				highlightId: touchedNoted?.id ?? highlightId,
				top: pos.top,
				left: pos.left,
				triggerEl: null,
			});
		},
		[clearSelectionTimer],
	);

	const jumpToHighlight = useCallback((id: string) => {
		setActiveHighlightId(id);
		const mark = findMarkByHighlightId(passageRef.current, id);
		if (!mark) return;
		mark.scrollIntoView({ block: "center" });
		mark.focus();
	}, []);

	const renderAstNodes = (
		nodes: readonly PassageAstNode[],
		insideAnchor: boolean,
		keyPrefix: string,
	): ReactNode[] => {
		return nodes.map((node, idx) => {
			const key = `${keyPrefix}-${idx}`;
			if (node.kind === "text") {
				const slices = splitLeafByAnnotations(
					node,
					normalized,
					lastSegmentEnds,
				);
				return (
					<Fragment key={key}>
						{slices.map((slice) => {
							const ann = slice.annotation;
							if (!ann) {
								return (
									<Fragment key={`${key}-t-${slice.start}`}>
										{slice.text}
									</Fragment>
								);
							}
							const hasNote = ann.note.trim() !== "";
							const ariaLabel = hasNote
								? `Đoạn tô sáng có ghi chú: ${ann.note.slice(0, 80)}`
								: isEdit
									? "Đoạn tô sáng, bấm để thêm ghi chú hoặc bỏ tô sáng"
									: "Đoạn tô sáng, bấm để xem chi tiết";
							return (
								<Fragment key={`${key}-m-${ann.id}-${slice.start}`}>
									{/* biome-ignore lint/a11y/useSemanticElements: <button> breaks native drag text selection and cannot wrap arbitrary inline passage text */}
									<mark
										data-highlight-id={ann.id}
										data-has-note={hasNote ? "true" : undefined}
										tabIndex={0}
										// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: <mark className="reading-hl"> must remain the highlight element and focus() target
										role="button"
										aria-label={ariaLabel}
										className={cn(
											"reading-hl cursor-pointer focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
											activeHighlightId === ann.id && "ring-1 ring-ring",
										)}
										onClick={(e) => handleMarkClick(e, ann)}
										onKeyDown={(e) => handleMarkKeyDown(e, ann)}
									>
										{slice.text}
									</mark>
									{slice.isLastSegment &&
										hasNote &&
										(insideAnchor ? (
											// biome-ignore lint/a11y/useSemanticElements: interactive <button> cannot be nested inside <a>
											<span
												role="button"
												tabIndex={0}
												data-reading-ui="true"
												data-note-trigger={ann.id}
												aria-label={`Xem ghi chú: ${ann.note.slice(0, 80)}`}
												className="ml-0.5 inline-flex size-4 cursor-pointer select-none items-center justify-center rounded-sm align-middle text-warn hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
												onClick={(e) => openNoteForAnnotation(e, ann)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														openNoteForAnnotation(e, ann);
													}
												}}
											>
												<StickyNote aria-hidden="true" className="size-3" />
											</span>
										) : (
											<button
												type="button"
												data-reading-ui="true"
												data-note-trigger={ann.id}
												aria-label={`Xem ghi chú: ${ann.note.slice(0, 80)}`}
												className="ml-0.5 inline-flex size-4 select-none items-center justify-center rounded-sm align-middle text-warn hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
												onClick={(e) => openNoteForAnnotation(e, ann)}
											>
												<StickyNote aria-hidden="true" className="size-3" />
											</button>
										))}
								</Fragment>
							);
						})}
					</Fragment>
				);
			}

			if (node.tag === "br") return <br key={key} />;
			if (node.tag === "hr") return <hr key={key} />;

			if (node.tag === "a") {
				const href = node.attrs?.href;
				if (!href) {
					return (
						<span key={key}>
							{renderAstNodes(node.children, insideAnchor, key)}
						</span>
					);
				}
				return (
					<a
						key={key}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => {
							const sel =
								typeof window !== "undefined" ? window.getSelection() : null;
							if (sel && !sel.isCollapsed) {
								e.preventDefault();
							}
						}}
					>
						{renderAstNodes(node.children, true, key)}
					</a>
				);
			}

			if (node.tag === "table") {
				return (
					<div key={key} className="my-2 max-w-full overflow-x-auto">
						<table>{renderAstNodes(node.children, insideAnchor, key)}</table>
					</div>
				);
			}

			const props: Record<string, unknown> = { key };
			if (node.tag === "td" || node.tag === "th") {
				if (node.attrs?.colSpan !== undefined) {
					props.colSpan = node.attrs.colSpan;
				}
				if (node.attrs?.rowSpan !== undefined) {
					props.rowSpan = node.attrs.rowSpan;
				}
			}

			return createElement(
				node.tag,
				props,
				...renderAstNodes(node.children, insideAnchor, key),
			);
		});
	};

	const showNotesToggle = isEdit || normalized.length > 0;
	const portalRoot = isBrowserDom
		? (passageRef.current?.closest<HTMLElement>(
				'[role="dialog"][aria-modal="true"]',
			) ?? document.body)
		: null;
	const portalZClass =
		portalRoot && portalRoot !== document.body ? "z-30" : "z-40";

	const headerBar = (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
				Bài đọc
			</p>
			<div className="flex flex-wrap items-center gap-1.5">
				{showNotesToggle && (
					<button
						type="button"
						aria-expanded={panelOpen}
						aria-controls={panelId}
						onClick={() => setPanelOpen((prev) => !prev)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-xs transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
							panelOpen
								? "border-primary bg-primary text-primary-foreground"
								: "border-input bg-background text-foreground hover:bg-accent",
						)}
					>
						<StickyNote aria-hidden="true" className="size-3.5" />
						<span>Ghi chú</span>
						{normalized.length > 0 && (
							<span
								aria-hidden="true"
								className={cn(
									"rounded-full px-1.5 py-0.25 font-mono text-[11px] tabular-nums",
									panelOpen
										? "bg-primary-foreground/20 text-primary-foreground"
										: "bg-muted text-muted-foreground",
								)}
							>
								{normalized.length}
							</span>
						)}
					</button>
				)}
				{isEdit &&
					normalized.length > 0 &&
					(confirmClearAll ? (
						<div className="inline-flex flex-wrap items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-xs">
							<span className="text-foreground">Xoá tất cả?</span>
							<button
								type="button"
								aria-label="Xác nhận xoá tất cả"
								onClick={() => {
									commitChange([]);
									setConfirmClearAll(false);
									closeOverlay({ clearSelection: true });
								}}
								className="rounded bg-destructive px-1.5 py-0.5 font-medium text-primary-foreground hover:opacity-90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								Xoá
							</button>
							<button
								type="button"
								onClick={() => setConfirmClearAll(false)}
								className="rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								Huỷ
							</button>
						</div>
					) : (
						<button
							type="button"
							onClick={() => setConfirmClearAll(true)}
							className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							<Trash2 aria-hidden="true" className="size-3.5" />
							<span>Xoá tất cả</span>
						</button>
					))}
			</div>
		</div>
	);

	// Nhánh SSR thuần (Node không có DOM/DOMParser): fallback sạch bằng RichTextBody.
	if (!isBrowserDom) {
		return (
			<div>
				{headerBar}
				<RichTextBody text={passage} className="mt-2 text-sm leading-[1.85]" />
			</div>
		);
	}

	const existingForPopover =
		overlay?.kind === "notePopover" && overlay.highlightId
			? normalized.find((a) => a.id === overlay.highlightId)
			: undefined;

	return (
		<div>
			{headerBar}
			{panelOpen && (
				<div
					id={panelId}
					data-testid="reading-notes-panel"
					className="mt-2 rounded-lg border border-border bg-card p-3 text-sm shadow-sm"
				>
					{normalized.length === 0 ? (
						<p className="text-muted-foreground text-xs">
							{isEdit
								? "Chưa có đoạn tô sáng hay ghi chú nào. Bôi đen đoạn văn bên dưới để tô sáng hoặc gắn ghi chú."
								: "Không có đoạn tô sáng hay ghi chú nào trong bài đọc này."}
						</p>
					) : (
						<ol
							aria-label="Danh sách tô sáng và ghi chú bài đọc"
							className="flex max-h-60 flex-col gap-2 overflow-y-auto"
						>
							{normalized.map((item) => {
								const excerptText = getPassageExcerpt(
									model,
									item.start,
									item.end,
									90,
								);
								return (
									<li
										key={item.id}
										className={cn(
											"rounded-md border border-border bg-background p-2.5",
											activeHighlightId === item.id && "ring-1 ring-ring",
										)}
									>
										<div className="flex items-start justify-between gap-2">
											<button
												type="button"
												aria-label={`Đi tới đoạn: ${excerptText}`}
												onClick={() => jumpToHighlight(item.id)}
												className="min-w-0 flex-1 text-left text-muted-foreground text-xs hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
											>
												“{excerptText}”
											</button>
											{isEdit && (
												<div className="flex shrink-0 items-center gap-1">
													<button
														type="button"
														aria-label={`Sửa ghi chú cho đoạn: ${excerptText}`}
														onClick={(e) => openNoteForAnnotation(e, item)}
														className="rounded px-1.5 py-0.5 text-foreground text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
													>
														Sửa
													</button>
													<button
														type="button"
														aria-label={`Xoá tô sáng đoạn: ${excerptText}`}
														onClick={() =>
															handleRemoveRange(item.start, item.end)
														}
														className="rounded px-1.5 py-0.5 text-muted-foreground text-xs hover:bg-accent hover:text-destructive focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
													>
														Xoá
													</button>
												</div>
											)}
										</div>
										{item.note.trim() !== "" ? (
											<p className="mt-1 whitespace-pre-wrap break-words text-foreground text-xs">
												{item.note}
											</p>
										) : (
											<p className="mt-1 text-muted-foreground text-xs italic">
												Chỉ tô sáng (chưa có ghi chú)
											</p>
										)}
									</li>
								);
							})}
						</ol>
					)}
				</div>
			)}

			<div
				ref={passageRef}
				data-testid="reading-passage-content"
				tabIndex={-1}
				className={cn(
					"mt-2 text-sm leading-[1.85] focus-visible:outline-none",
					model.isHtml ? RICH_TEXT_CONTENT_CLASSES : "whitespace-pre-line",
				)}
			>
				{renderAstNodes(model.nodes, false, "p")}
			</div>

			{overlay &&
				portalRoot &&
				createPortal(
					<div ref={portalOverlayRef} data-reading-ui="true">
						{overlay.kind === "toolbar" && (
							<div
								role="toolbar"
								aria-label="Công cụ bài đọc"
								style={{ top: overlay.top, left: overlay.left }}
								className={cn(
									"fixed flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
									portalZClass,
								)}
							>
								<button
									type="button"
									onPointerDown={(e) => e.preventDefault()}
									onClick={() =>
										handleHighlightRange(overlay.start, overlay.end)
									}
									className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									<Highlighter aria-hidden="true" className="size-3.5" />
									<span>Tô sáng</span>
								</button>
								<button
									type="button"
									onPointerDown={(e) => e.preventDefault()}
									onClick={() =>
										openNoteFromRange(
											overlay.start,
											overlay.end,
											overlay.left,
											overlay.top,
										)
									}
									className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									<StickyNote aria-hidden="true" className="size-3.5" />
									<span>Ghi chú</span>
								</button>
								{overlay.overlaps && (
									<button
										type="button"
										onPointerDown={(e) => e.preventDefault()}
										onClick={() =>
											handleRemoveRange(overlay.start, overlay.end)
										}
										className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										<Eraser aria-hidden="true" className="size-3.5" />
										<span>Bỏ tô sáng</span>
									</button>
								)}
							</div>
						)}

						{overlay.kind === "contextMenu" && (
							<div
								role="menu"
								aria-label="Menu bài đọc"
								style={{ top: overlay.y, left: overlay.x }}
								className={cn(
									"fixed flex min-w-44 max-w-[calc(100vw-16px)] flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
									portalZClass,
								)}
							>
								{!overlay.highlightId && (
									<button
										type="button"
										role="menuitem"
										onClick={() =>
											handleHighlightRange(overlay.start, overlay.end)
										}
										className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										<Highlighter aria-hidden="true" className="size-3.5" />
										<span>Tô sáng</span>
									</button>
								)}
								<button
									type="button"
									role="menuitem"
									onClick={() =>
										openNoteFromRange(
											overlay.start,
											overlay.end,
											overlay.x,
											overlay.y,
											overlay.highlightId,
										)
									}
									className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									<StickyNote aria-hidden="true" className="size-3.5" />
									<span>
										{overlay.highlightId &&
										normalized
											.find((a) => a.id === overlay.highlightId)
											?.note.trim()
											? "Sửa ghi chú"
											: overlay.highlightId
												? "Thêm ghi chú"
												: "Ghi chú"}
									</span>
								</button>
								{overlay.overlaps && (
									<button
										type="button"
										role="menuitem"
										onClick={() =>
											handleRemoveRange(overlay.start, overlay.end)
										}
										className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-medium text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										<Eraser aria-hidden="true" className="size-3.5" />
										<span>Bỏ tô sáng</span>
									</button>
								)}
							</div>
						)}

						{overlay.kind === "notePopover" && (
							<ReadingNotePopover
								key={`${overlay.highlightId ?? "new"}:${overlay.start}:${overlay.end}`}
								mode={mode}
								top={overlay.top}
								left={overlay.left}
								zClass={portalZClass}
								excerpt={getPassageExcerpt(
									model,
									existingForPopover
										? Math.min(overlay.start, existingForPopover.start)
										: overlay.start,
									existingForPopover
										? Math.max(overlay.end, existingForPopover.end)
										: overlay.end,
									120,
								)}
								initialNote={existingForPopover?.note ?? ""}
								isExisting={Boolean(existingForPopover)}
								onClose={() =>
									closeOverlay({
										clearSelection: true,
										restoreTriggerFocus: true,
									})
								}
								onSave={(note) => {
									const target = existingForPopover
										? {
												start: Math.min(
													overlay.start,
													existingForPopover.start,
												),
												end: Math.max(overlay.end, existingForPopover.end),
											}
										: { start: overlay.start, end: overlay.end };
									const res = existingForPopover
										? overlay.start === existingForPopover.start &&
											overlay.end === existingForPopover.end
											? upsertNoteSpan(
													normalizedRef.current,
													{ id: existingForPopover.id },
													note,
												)
											: upsertNoteSpan(normalizedRef.current, target, note)
										: upsertNoteSpan(normalizedRef.current, target, note);
									if (!res.ok) {
										return res.reason === "multiple_notes_overlap"
											? "Vùng chọn đang cắt qua nhiều ghi chú khác nhau. Hãy sửa từng ghi chú riêng lẻ."
											: "Không thể lưu ghi chú cho vùng chọn này.";
									}
									commitChange(res.items);
									setActiveHighlightId(res.targetId);
									closeOverlay({
										clearSelection: true,
										restoreTriggerFocus: false,
									});
									// Trả focus về đúng mark sau khi DOM cập nhật, fallback passageRef.
									window.setTimeout(() => {
										const savedMark = findMarkByHighlightId(
											passageRef.current,
											res.targetId,
										);
										restoreFocus(savedMark);
									}, 0);
									return null;
								}}
								onClearNote={
									existingForPopover && existingForPopover.note.trim() !== ""
										? () => {
												const res = upsertNoteSpan(
													normalizedRef.current,
													{ id: existingForPopover.id },
													"",
												);
												if (res.ok) commitChange(res.items);
												closeOverlay({
													clearSelection: true,
													restoreTriggerFocus: true,
												});
											}
										: undefined
								}
								onRemoveHighlight={
									existingForPopover
										? () => {
												handleRemoveRange(
													existingForPopover.start,
													existingForPopover.end,
												);
											}
										: undefined
								}
							/>
						)}
					</div>,
					portalRoot,
				)}
		</div>
	);
}

function ReadingNotePopover({
	mode,
	top,
	left,
	zClass,
	excerpt,
	initialNote,
	isExisting,
	onClose,
	onSave,
	onClearNote,
	onRemoveHighlight,
}: {
	mode: ReadingAnnotationMode;
	top: number;
	left: number;
	zClass: string;
	excerpt: string;
	initialNote: string;
	isExisting: boolean;
	onClose: () => void;
	onSave: (note: string) => string | null;
	onClearNote?: () => void;
	onRemoveHighlight?: () => void;
}) {
	const noteInputId = useId();
	const dialogRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const closeBtnRef = useRef<HTMLButtonElement>(null);
	const [note, setNote] = useState(initialNote);
	const [error, setError] = useState<string | null>(null);
	const isEdit = mode === "edit";

	useEffect(() => {
		if (isEdit) {
			textareaRef.current?.focus();
		} else {
			closeBtnRef.current?.focus();
		}
	}, [isEdit]);

	// Giữ Tab quay vòng trong popover + stopPropagation để không bị TestPreviewOverlay trapTab cướp focus.
	const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "Tab" || !dialogRef.current) return;
		e.stopPropagation();
		const focusables = Array.from(
			dialogRef.current.querySelectorAll<HTMLElement>(
				'button, textarea, [href], input, [tabindex]:not([tabindex="-1"])',
			),
		).filter((el) => !el.hasAttribute("disabled"));
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (
			e.shiftKey &&
			(active === first || !dialogRef.current.contains(active))
		) {
			e.preventDefault();
			last?.focus();
		} else if (
			!e.shiftKey &&
			(active === last || !dialogRef.current.contains(active))
		) {
			e.preventDefault();
			first?.focus();
		}
	};

	const saveDisabled = !isExisting && note.trim() === "";

	return (
		<div
			ref={dialogRef}
			role="dialog"
			aria-label="Ghi chú bài đọc"
			onKeyDown={handleKeyDown}
			style={{ top, left }}
			className={cn(
				"fixed w-[min(320px,calc(100vw-16px))] rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg",
				zClass,
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<p className="min-w-0 flex-1 text-muted-foreground text-xs leading-snug">
					“{excerpt}”
				</p>
				<button
					ref={closeBtnRef}
					type="button"
					aria-label="Đóng ghi chú"
					onClick={onClose}
					className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					<X aria-hidden="true" className="size-3.5" />
				</button>
			</div>

			{isEdit ? (
				<div className="mt-2 flex flex-col gap-2">
					<label htmlFor={noteInputId} className="sr-only">
						Nội dung ghi chú
					</label>
					<textarea
						id={noteInputId}
						ref={textareaRef}
						value={note}
						maxLength={READING_ANNOTATION_NOTE_MAX}
						placeholder="Nhập ghi chú cho đoạn văn này…"
						onChange={(e) => {
							setNote(e.target.value);
							if (error) setError(null);
						}}
						className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-2.5 py-2 text-base text-foreground placeholder:text-muted-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none md:text-sm"
					/>
					{error && (
						<p role="alert" className="text-destructive text-xs">
							{error}
						</p>
					)}
					<div className="flex flex-wrap items-center justify-between gap-1.5">
						<div className="flex flex-wrap items-center gap-1.5">
							<button
								type="button"
								disabled={saveDisabled}
								onClick={() => {
									const err = onSave(note.trim());
									if (err) setError(err);
								}}
								className="rounded-md bg-primary px-2.5 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
							>
								Lưu ghi chú
							</button>
							<button
								type="button"
								onClick={onClose}
								className="rounded-md px-2 py-1.5 text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
							>
								Huỷ
							</button>
						</div>
						<div className="flex items-center gap-1">
							{onClearNote && (
								<button
									type="button"
									onClick={onClearNote}
									className="rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									Xoá ghi chú
								</button>
							)}
							{onRemoveHighlight && (
								<button
									type="button"
									onClick={onRemoveHighlight}
									className="rounded-md px-2 py-1 text-destructive text-xs hover:bg-destructive-soft focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									Bỏ tô sáng
								</button>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="mt-2 flex flex-col gap-2">
					{initialNote.trim() !== "" ? (
						<p className="whitespace-pre-wrap break-words text-foreground text-sm">
							{initialNote}
						</p>
					) : (
						<p className="text-muted-foreground text-xs italic">
							Đã tô sáng (chưa có ghi chú)
						</p>
					)}
					<div className="flex justify-end">
						<button
							type="button"
							onClick={onClose}
							className="rounded-md border border-input bg-background px-2.5 py-1 font-medium text-foreground text-xs hover:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							Đóng
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
