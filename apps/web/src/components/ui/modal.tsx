import { X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
}

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
/**
 * Modal dialog component.
 *
 * Lưu ý về layout: Thân modal áp dụng `[&>form]:flex [&>form]:flex-col [&>form]:gap-4`
 * cho thẻ `<form>` là con trực tiếp (kể cả qua React Fragment), để các field
 * bên trong form tự động nhận khoảng cách 14px (gap-4 = 1rem, cỡ chữ gốc 14px) như các con trực tiếp khác.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const modalRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	// Keep the latest close handler without re-running the focus effect on
	// every parent re-render (callers pass inline closures).
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

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
		previouslyFocused.current = document.activeElement as HTMLElement;
		const onKey = (e: KeyboardEvent) => {
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
			document.removeEventListener("keydown", onKey);
			previouslyFocused.current?.focus();
		};
	}, [open, trapFocus]);

	if (!open) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay click-outside is the mouse equivalent of the global Escape handler; the dialog role element below carries the semantics
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is the global Escape handler attached in the open effect
		<div
			ref={overlayRef}
			className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8"
			onClick={(e) => {
				if (e.target === overlayRef.current) onClose();
			}}
		>
			<div
				ref={modalRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="relative w-full max-w-[480px] rounded-lg border bg-background shadow-lg"
			>
				<div className="flex items-start justify-between gap-4 px-6 pt-6">
					<h3 className="pr-8 font-semibold text-lg leading-none">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="absolute top-4 right-4 rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
					>
						<X />
					</button>
				</div>
				{/* Form con trực tiếp là một flex item duy nhất nên phải nhận lại nhịp gap của body */}
				<div className="flex flex-col gap-4 p-6 [&>form]:flex [&>form]:flex-col [&>form]:gap-4">
					{children}
				</div>
				{footer && (
					<div className="flex justify-end gap-2 px-6 pb-6">{footer}</div>
				)}
			</div>
		</div>
	);
}
