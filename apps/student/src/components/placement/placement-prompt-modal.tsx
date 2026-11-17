import { Button } from "@teacher-os/ui/components/button";
import { ClipboardCheck, Clock, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";

export interface PlacementPromptModalProps {
	open: boolean;
	isDismissing?: boolean;
	onStart: () => void;
	onDismiss: () => void;
}

/**
 * Modal nhắc làm bài kiểm tra đầu vào 5 kỹ năng lần đầu sau onboarding (#748).
 * Escape, bấm nền tối, nút đóng ✕ hoặc "Để sau" đều gọi `onDismiss`.
 */
export function PlacementPromptModal({
	open,
	isDismissing = false,
	onStart,
	onDismiss,
}: PlacementPromptModalProps) {
	const titleId = useId();
	const descriptionId = useId();
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		panelRef.current?.focus();
	}, [open]);

	if (!open) return null;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onDismiss();
			return;
		}
		if (event.key !== "Tab" || panelRef.current === null) return;
		const focusables = panelRef.current.querySelectorAll<HTMLElement>(
			"button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (!first || !last) return;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				tabIndex={-1}
				aria-label="Đóng hộp thoại"
				data-testid="placement-prompt-backdrop"
				onClick={onDismiss}
				className="fixed inset-0 bg-black/50"
			/>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				tabIndex={-1}
				data-testid="placement-prompt-modal"
				onKeyDown={handleKeyDown}
				className="relative z-10 w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-lg focus-visible:outline-none"
			>
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Đóng"
					className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<X aria-hidden="true" className="size-4" />
				</button>

				<div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
					<ClipboardCheck aria-hidden="true" className="size-5" />
				</div>

				<h2
					id={titleId}
					className="pr-8 font-semibold text-foreground text-lg tracking-tight"
				>
					Kiểm tra đầu vào miễn phí (5 kỹ năng)
				</h2>

				<p
					id={descriptionId}
					className="mt-2 text-muted-foreground text-sm leading-relaxed"
				>
					Bạn sẽ làm chung bộ đề đánh giá chuẩn CEFR gồm 5 kỹ năng (Listening,
					Grammar &amp; Vocabulary, Reading, Writing, Speaking) trong khoảng 40
					phút để giáo viên xác định đúng trình độ và cá nhân hóa lộ trình học
					phù hợp nhất cho bạn.
				</p>

				<ul className="mt-4 space-y-2 rounded-lg border bg-muted/50 p-3 text-muted-foreground text-xs">
					<li className="flex items-center gap-2">
						<Clock
							aria-hidden="true"
							className="size-3.5 shrink-0 text-foreground"
						/>
						<span>
							Thời lượng gợi ý ~40 phút, lưu tiến độ tự động trên trình duyệt
						</span>
					</li>
					<li className="flex items-center gap-2">
						<Sparkles
							aria-hidden="true"
							className="size-3.5 shrink-0 text-foreground"
						/>
						<span>
							Có kết quả trắc nghiệm ngay sau khi nộp; giáo viên chấm chi tiết
							Writing &amp; Speaking
						</span>
					</li>
				</ul>

				<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button
						type="button"
						variant="outline"
						onClick={onDismiss}
						disabled={isDismissing}
					>
						Để sau
					</Button>
					<Button type="button" onClick={onStart}>
						Làm bài ngay
					</Button>
				</div>
			</div>
		</div>
	);
}
