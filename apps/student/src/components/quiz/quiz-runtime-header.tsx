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
	saving: "text-muted-foreground",
	saved: "text-primary",
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
		<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-border border-b bg-background/95 px-4 backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				<Link to="/" className={cn(buttonVariants({ variant: "ghost" }))}>
					Thoát
				</Link>
				<h1 className="truncate font-semibold text-[15px] tracking-tight">
					{title}
				</h1>
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
						className="rounded-lg bg-primary text-bg hover:bg-primary hover:text-primary-foreground"
					>
						Nộp bài
					</Button>
				)}
			</div>
		</header>
	);
}
