import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	description?: ReactNode;
	size?: "md" | "xl";
	scrollableBody?: boolean;
	children: ReactNode;
	footer?: ReactNode;
}

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
// Theo dõi thứ tự mở dialog để Escape/Tab chỉ tác động lên modal trên cùng
// khi nhiều Modal cùng mở song song (hoặc modal xác nhận mở từ modal quản lý).
const openModalStack: symbol[] = [];
/**
 * Modal dialog component.
 *
 * Lưu ý về layout: Thân modal áp dụng `[&>form]:flex [&>form]:flex-col [&>form]:gap-4`
 * cho thẻ `<form>` là con trực tiếp (kể cả qua React Fragment), để các field
 * bên trong form tự động nhận khoảng cách 14px (gap-4 = 1rem, cỡ chữ gốc 14px) như các con trực tiếp khác.
 */
export function Modal({
	open,
	onClose,
	title,
	description,
	size = "md",
	scrollableBody = false,
	children,
	footer,
}: ModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const modalRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const hadPointerDownRef = useRef(false);
	const pointerDownAllowedCloseRef = useRef(false);
	// Keep the latest close handler without re-running the focus effect on
	// every parent re-render (callers pass inline closures).
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	const hasOpenChildPopup = useCallback(() => {
		const insideTriggerOpen = Boolean(
			modalRef.current?.querySelector(
				'[aria-haspopup="dialog"][aria-expanded="true"], [data-popup-open]',
			),
		);
		if (insideTriggerOpen) return true;
		return Array.from(document.querySelectorAll('[role="dialog"]')).some(
			(el) =>
				el !== modalRef.current &&
				!el.contains(modalRef.current) &&
				!modalRef.current?.contains(el) &&
				(el.hasAttribute("data-open") ||
					el.closest("[data-base-ui-portal]") !== null),
		);
	}, []);

	const trapFocus = useCallback((e: KeyboardEvent) => {
		if (e.key !== "Tab" || !modalRef.current) return;
		const focusables = Array.from(
			modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
		).filter((el) => el.offsetParent !== null);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}, []);

	useEffect(() => {
		if (!open) return;
		const modalId = Symbol("modal");
		openModalStack.push(modalId);
		const isTopmost = () =>
			openModalStack[openModalStack.length - 1] === modalId;
		previouslyFocused.current = document.activeElement as HTMLElement;
		const onKey = (e: KeyboardEvent) => {
			if (!isTopmost()) return;
			if (e.defaultPrevented || hasOpenChildPopup()) return;
			if (e.key === "Escape") onCloseRef.current();
			trapFocus(e);
		};
		document.addEventListener("keydown", onKey);
		// Move focus into the modal
		requestAnimationFrame(() => {
			const first = modalRef.current?.querySelector<HTMLElement>(FOCUSABLE);
			first?.focus();
		});
		return () => {
			hadPointerDownRef.current = false;
			pointerDownAllowedCloseRef.current = false;
			const idx = openModalStack.lastIndexOf(modalId);
			if (idx !== -1) openModalStack.splice(idx, 1);
			document.removeEventListener("keydown", onKey);
			previouslyFocused.current?.focus();
		};
	}, [open, trapFocus, hasOpenChildPopup]);

	if (!open) return null;

	const maxWidthCls = size === "xl" ? "max-w-4xl" : "max-w-[480px]";

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay click-outside is the mouse equivalent of the global Escape handler; the dialog role element below carries the semantics
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is the global Escape handler attached in the open effect
		<div
			ref={overlayRef}
			className={
				scrollableBody
					? "fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-3 sm:p-6"
					: "fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8"
			}
			onPointerDown={(e) => {
				hadPointerDownRef.current = true;
				pointerDownAllowedCloseRef.current =
					e.target === overlayRef.current && !hasOpenChildPopup();
			}}
			onClick={(e) => {
				const allowedByPointerDown = hadPointerDownRef.current
					? pointerDownAllowedCloseRef.current
					: true;
				hadPointerDownRef.current = false;
				pointerDownAllowedCloseRef.current = false;
				if (
					allowedByPointerDown &&
					e.target === overlayRef.current &&
					!hasOpenChildPopup()
				) {
					onClose();
				}
			}}
		>
			<div
				ref={modalRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className={
					scrollableBody
						? cn(
								"relative flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg sm:max-h-[calc(100dvh-3rem)]",
								maxWidthCls,
							)
						: cn(
								"relative w-full rounded-lg border bg-background shadow-lg",
								maxWidthCls,
							)
				}
			>
				<div
					className={
						scrollableBody
							? "flex shrink-0 items-start justify-between gap-4 border-border border-b px-5 py-4 sm:px-6"
							: "flex items-start justify-between gap-4 px-6 pt-6"
					}
				>
					<div className="min-w-0 flex-1">
						<h3
							className={
								scrollableBody
									? "pr-8 font-semibold text-lg leading-snug"
									: "pr-8 font-semibold text-lg leading-none"
							}
						>
							{title}
						</h3>
						{description && (
							<p className="mt-1 pr-8 text-muted-foreground text-sm">
								{description}
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="absolute top-4 right-4 rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
					>
						<X aria-hidden="true" />
					</button>
				</div>
				{/* Form con trực tiếp là một flex item duy nhất nên phải nhận lại nhịp gap của body */}
				<div
					className={
						scrollableBody
							? "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6 [&>form]:flex [&>form]:flex-col [&>form]:gap-4"
							: "flex flex-col gap-4 p-6 [&>form]:flex [&>form]:flex-col [&>form]:gap-4"
					}
				>
					{children}
				</div>
				{footer && (
					<div
						className={
							scrollableBody
								? "flex shrink-0 justify-end gap-2 border-border border-t bg-card px-5 py-3.5 sm:px-6"
								: "flex justify-end gap-2 px-6 pb-6"
						}
					>
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
