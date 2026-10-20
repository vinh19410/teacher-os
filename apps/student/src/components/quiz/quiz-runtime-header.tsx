import { Link } from "@tanstack/react-router";
import { Button, buttonVariants } from "@teacher-os/ui/components/button";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { QuizSaveState } from "@/lib/quiz-attempt-store";

export const QUIZ_SAVE_STATE_LABELS: Record<QuizSaveState, string> = {
	saving: "Đang lưu…",
	saved: "Đã lưu",
	error: "Lỗi lưu",
};

const SAVE_STATE_CLASSES: Record<QuizSaveState, string> = {
	saving: "text-meta",
	saved: "text-hot",
	error: "text-danger",
};

/**
 * Header runtime của take screen (Selfomy parity): thoát về overview + tiêu
 * đề đề + trạng thái autosave + nút Nộp bài. `onSubmitClick === null` giấu
 * nút (màn start gate chưa có attempt); nút disable khi đang drain/submit
 * hoặc autosave đã halt.
 */
export function QuizRuntimeHeader({
	title,
	saveState,
	onSubmitClick,
	submitDisabled,
	children,
}: {
	title: string;
	/** null = chưa có attempt (start gate) — không hiện save-state. */
	saveState: QuizSaveState | null;
	/** null = giấu nút Nộp bài. */
	onSubmitClick: (() => void) | null;
	submitDisabled?: boolean;
	children?: ReactNode;
}) {
	return (
		// Khung ExamFrame design-v2: thanh trên nền chìm, nhãn đề bên trái,
		// trạng thái lưu + hành động bên phải. Logic chấm/lưu không đổi.
		<header className="sticky top-0 z-30 flex items-center justify-between gap-3 rounded-t-xl border-line border-b bg-muted/50 px-4 py-2.5 text-xs backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				<Link
					to="/"
					className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
				>
					Thoát
				</Link>
				<h1 className="truncate font-medium text-[13px] text-fg">{title}</h1>
			</div>
			<div className="flex flex-none items-center gap-3">
				{saveState !== null && (
					<span
						role="status"
						data-testid="save-state"
						data-state={saveState}
						aria-live="polite"
						className={cn(
							"font-mono text-xs uppercase tracking-[0.08em]",
							SAVE_STATE_CLASSES[saveState],
						)}
					>
						{QUIZ_SAVE_STATE_LABELS[saveState]}
					</span>
				)}
				{children}
				{onSubmitClick !== null && (
					<Button
						onClick={onSubmitClick}
						disabled={submitDisabled}
						className="rounded-lg bg-fg text-bg hover:bg-hot hover:text-accent-on"
					>
						Nộp bài
					</Button>
				)}
			</div>
		</header>
	);
}
