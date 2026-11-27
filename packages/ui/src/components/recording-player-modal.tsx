import { RECORDING_RETENTION_DAYS } from "@teacher-os/api/contracts";
import { Button } from "@teacher-os/ui/components/button";
import { AlertCircle, RotateCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

const vnDateFormatter = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

/**
 * Định dạng mốc ISO thành `dd/mm/yyyy` theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`).
 * Trả `null` nếu chuỗi rỗng hoặc không hợp lệ.
 */
export function formatRecordingExpiryVN(
	iso: string | null | undefined,
): string | null {
	if (!iso || typeof iso !== "string") return null;
	const trimmed = iso.trim();
	if (!trimmed) return null;
	const date = new Date(trimmed);
	if (Number.isNaN(date.getTime())) return null;
	const parts = vnDateFormatter.formatToParts(date);
	const day = parts.find((part) => part.type === "day")?.value;
	const month = parts.find((part) => part.type === "month")?.value;
	const year = parts.find((part) => part.type === "year")?.value;
	if (!day || !month || !year) return null;
	return `${day}/${month}/${year}`;
}

function isFocusableVisible(el: HTMLElement): boolean {
	if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
	const style = window.getComputedStyle(el);
	if (style.display === "none" || style.visibility === "hidden") return false;
	return true;
}

export interface RecordingPlayerModalProps {
	open: boolean;
	onClose: () => void;
	title: string;
	subtitle?: string;
	videoUrl: string;
	expiresAt?: string | null;
}

/**
 * Modal xem video recording buổi học ngay trong ứng dụng (không cung cấp nút tải về).
 * Portal ra `document.body` ở tầng `z-[110]` kèm `data-open` để mở chồng an toàn lên
 * các modal sẵn có (ví dụ SessionActionsModal) mà không đóng nhầm modal bên dưới.
 */
export function RecordingPlayerModal({
	open,
	onClose,
	title,
	subtitle,
	videoUrl,
	expiresAt,
}: RecordingPlayerModalProps) {
	const overlayRef = useRef<HTMLDivElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocusedRef = useRef<HTMLElement | null>(null);
	const hadPointerDownRef = useRef(false);
	const pointerDownOnOverlayRef = useRef(false);
	const onCloseRef = useRef(onClose);

	const [loadError, setLoadError] = useState(false);
	const [retryKey, setRetryKey] = useState(0);

	useEffect(() => {
		onCloseRef.current = onClose;
	});

	// Xóa trạng thái lỗi mỗi khi mở lại modal hoặc đổi nguồn video.
	useEffect(() => {
		void open;
		void videoUrl;
		setLoadError(false);
	}, [open, videoUrl]);

	useEffect(() => {
		if (!open) return;
		previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
		closeButtonRef.current?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
				onCloseRef.current();
				return;
			}
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusables = Array.from(
				dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter(isFocusableVisible);
			if (focusables.length === 0) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (!dialogRef.current.contains(document.activeElement)) {
				event.preventDefault();
				event.stopPropagation();
				(event.shiftKey ? last : first)?.focus();
				return;
			}
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				event.stopPropagation();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				event.stopPropagation();
				first?.focus();
			}
		};

		// Dùng capture phase để Escape luôn đóng modal video trước, không lan tới modal cha.
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			hadPointerDownRef.current = false;
			pointerDownOnOverlayRef.current = false;
			document.removeEventListener("keydown", onKeyDown, true);
			previouslyFocusedRef.current?.focus();
		};
	}, [open]);

	if (!open || typeof document === "undefined") return null;

	const formattedExpiry = formatRecordingExpiryVN(expiresAt);

	function handleRetry() {
		setLoadError(false);
		setRetryKey((prev) => prev + 1);
		closeButtonRef.current?.focus();
	}

	return createPortal(
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click đóng dialog tương đương Escape ở document listener
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape đóng dialog đã gắn ở document capture listener
		<div
			ref={overlayRef}
			className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-3 sm:p-6"
			onPointerDown={(e) => {
				e.stopPropagation();
				hadPointerDownRef.current = true;
				pointerDownOnOverlayRef.current = e.target === overlayRef.current;
			}}
			onClick={(e) => {
				e.stopPropagation();
				const allowedByPointerDown = hadPointerDownRef.current
					? pointerDownOnOverlayRef.current
					: true;
				hadPointerDownRef.current = false;
				pointerDownOnOverlayRef.current = false;
				if (allowedByPointerDown && e.target === overlayRef.current) {
					onClose();
				}
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				data-open=""
				className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg sm:max-h-[calc(100dvh-3rem)]"
			>
				<div className="flex shrink-0 items-start justify-between gap-3 border-border border-b px-4 py-3.5 sm:px-6 sm:py-4">
					<div className="min-w-0 flex-1">
						<h3 className="break-words font-semibold text-base text-card-foreground leading-snug sm:text-lg">
							{title}
						</h3>
						{subtitle && (
							<p className="mt-0.5 break-words text-muted-foreground text-xs sm:text-sm">
								{subtitle}
							</p>
						)}
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
					>
						<X aria-hidden="true" className="size-4" />
					</button>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-6">
					{loadError ? (
						<div
							role="alert"
							className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive-soft p-4 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="flex min-w-0 items-start gap-2.5">
								<AlertCircle
									aria-hidden="true"
									className="mt-0.5 size-4 shrink-0 text-destructive"
								/>
								<p className="break-words text-card-foreground text-sm">
									Không phát được video recording. Video có thể đã hết hạn lưu
									trữ ({RECORDING_RETENTION_DAYS} ngày) hoặc kết nối bị gián
									đoạn.
								</p>
							</div>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={handleRetry}
								className="shrink-0 focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0"
							>
								<RotateCw aria-hidden="true" className="size-3.5" />
								Thử tải lại
							</Button>
						</div>
					) : (
						// biome-ignore lint/a11y/useMediaCaption: recording buổi học Zoom không có track phụ đề
						<video
							key={`${videoUrl}:${retryKey}`}
							controls
							controlsList="nodownload"
							preload="metadata"
							playsInline
							src={videoUrl}
							onContextMenu={(e) => e.preventDefault()}
							onError={() => setLoadError(true)}
							aria-label={title}
							className="aspect-video max-h-[65dvh] w-full rounded-lg bg-black"
						/>
					)}
				</div>

				{formattedExpiry && (
					<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-border border-t bg-card px-4 py-3 text-muted-foreground text-xs sm:px-6">
						<span className="tabular-nums">
							Lưu trữ đến {formattedExpiry} (tự động xóa sau{" "}
							{RECORDING_RETENTION_DAYS} ngày)
						</span>
					</div>
				)}
			</div>
		</div>,
		document.body,
	);
}
