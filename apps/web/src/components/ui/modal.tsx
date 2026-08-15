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

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const modalRef = useRef<HTMLDivElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

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
			if (e.key === "Escape") onClose();
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
	}, [open, onClose, trapFocus]);

	if (!open) return null;

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: overlay click-outside is the mouse equivalent of the global Escape handler; the dialog role element below carries the semantics
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is the global Escape handler attached in the open effect
		<div
			ref={overlayRef}
			className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto bg-[color-mix(in_oklab,var(--fg),transparent_55%)] px-4 py-8 backdrop-blur-[4px]"
			onClick={(e) => {
				if (e.target === overlayRef.current) onClose();
			}}
		>
			<div
				ref={modalRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="w-full max-w-[480px] animate-[modal-in_220ms_cubic-bezier(0.28,0,0.22,1)] rounded-lg bg-bg shadow-[var(--elev-raised)]"
			>
				<div className="flex items-center justify-between border-line-soft border-b px-6 py-5">
					<h3 className="font-semibold text-lg">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="cursor-pointer border-none bg-transparent px-2 text-accent-blue text-sm"
					>
						✕
					</button>
				</div>
				<div className="flex flex-col gap-4 p-6">{children}</div>
				{footer && (
					<div className="flex justify-end gap-2 border-line-soft border-t px-6 py-4">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
