import { Button } from "@teacher-os/ui/components/button";
import { useEffect, useId, useRef } from "react";

/**
 * Overlay focus-trapped tối giản — @teacher-os/ui chưa có dialog primitive
 * và kế hoạch cấm thêm dependency. Escape = cancel, Tab xoay trong card.
 */
export function QuizDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
	confirmDisabled,
	tone = "default",
}: {
	open: boolean;
	title: string;
	description: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
	confirmDisabled?: boolean;
	tone?: "default" | "danger";
}) {
	const titleId = useId();
	const descriptionId = useId();
	const cardRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		cardRef.current?.focus();
	}, [open]);

	if (!open) return null;

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onCancel();
			return;
		}
		if (event.key !== "Tab" || cardRef.current === null) return;
		const focusables = cardRef.current.querySelectorAll<HTMLElement>(
			"button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/40 p-4">
			<div
				ref={cardRef}
				role="alertdialog"
				aria-modal="true"
				aria-labelledby={titleId}
				aria-describedby={descriptionId}
				tabIndex={-1}
				onKeyDown={handleKeyDown}
				className="w-full max-w-sm rounded-[var(--radius-lg)] border border-line bg-bg p-5 shadow-lg focus-visible:outline-2 focus-visible:outline-hot"
			>
				<h2 id={titleId} className="font-display font-semibold text-fg">
					{title}
				</h2>
				<p
					id={descriptionId}
					className="mt-2 text-muted-fg text-sm leading-relaxed"
				>
					{description}
				</p>
				<div className="mt-5 flex justify-end gap-2">
					<Button variant="ghost" onClick={onCancel}>
						{cancelLabel}
					</Button>
					<Button
						variant={tone === "danger" ? "destructive" : "default"}
						onClick={onConfirm}
						disabled={confirmDisabled}
					>
						{confirmLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}

/** Vòng đời bắt đầu: vào take screen lần đầu, chưa có attempt. */
export function QuizStartDialog({
	open,
	starting,
	onStart,
	onCancel,
}: {
	open: boolean;
	starting: boolean;
	onStart: () => void;
	onCancel: () => void;
}) {
	return (
		<QuizDialog
			open={open}
			title="Bắt đầu làm bài"
			description="Bạn có muốn bắt đầu làm bài ngay bây giờ không?"
			confirmLabel="Bắt đầu"
			cancelLabel="Quay lại"
			onConfirm={onStart}
			onCancel={onCancel}
			confirmDisabled={starting}
		/>
	);
}

/** Vòng đời resume: vào lại khi còn attempt in_progress + có answers. */
export function QuizResumeDialog({
	open,
	onResume,
	onCancel,
}: {
	open: boolean;
	onResume: () => void;
	onCancel: () => void;
}) {
	return (
		<QuizDialog
			open={open}
			title="Tiếp tục bài làm"
			description="Bạn có bài làm chưa hoàn thành. Bạn có muốn tiếp tục không?"
			confirmLabel="Tiếp tục"
			cancelLabel="Quay lại"
			onConfirm={onResume}
			onCancel={onCancel}
		/>
	);
}

/** Chốt nộp bài khi còn câu trống (Selfomy parity — đếm câu chưa làm).
 * Đề Writing (#304) truyền copy riêng qua `title`/`description`. */
export function QuizSubmitGuardDialog({
	open,
	unansweredCount,
	title,
	description,
	onConfirm,
	onCancel,
}: {
	open: boolean;
	unansweredCount: number;
	title?: string;
	description?: string;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<QuizDialog
			open={open}
			title={title ?? "Bạn còn câu hỏi chưa làm"}
			description={
				description ??
				`Bạn còn ${unansweredCount} câu hỏi chưa làm. Bạn có muốn nộp bài không? Sau khi nộp, bạn không thể thay đổi đáp án.`
			}
			confirmLabel="Nộp bài"
			cancelLabel="Quay lại"
			onConfirm={onConfirm}
			onCancel={onCancel}
			tone="danger"
		/>
	);
}
