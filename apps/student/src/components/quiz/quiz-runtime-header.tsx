import { Link } from "@tanstack/react-router";
import type { PracticeSkill } from "@teacher-os/api/contracts";
import { Button, buttonVariants } from "@teacher-os/ui/components/button";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { QuizSaveState } from "@/lib/quiz-attempt-store";

export type QuizRuntimeExitTarget =
	| { to: "/" }
	| { to: "/practice" }
	| { to: "/practice/$skill"; params: { skill: PracticeSkill } };

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
	dueText,
	saveState,
	onSubmitClick,
	submitDisabled,
	exitTarget = { to: "/" },
	children,
}: {
	title: string;
	/** Hạn nộp đã định dạng, ví dụ "Hạn: 17:00 15/11" (#587). Rỗng/null = giấu hoàn toàn. */
	dueText?: string | null;
	/** null = chưa có attempt (start gate) — không hiện save-state. */
	saveState: QuizSaveState | null;
	/** null = giấu nút Nộp bài. */
	onSubmitClick: (() => void) | null;
	submitDisabled?: boolean;
	/** Đích nút Thoát — mặc định "/" cho bài giao lớp; tự luyện trỏ về "/practice/$skill" (#883). */
	exitTarget?: QuizRuntimeExitTarget;
	children?: ReactNode;
}) {
	const exitClassName = cn(buttonVariants({ variant: "ghost" }));
	return (
		<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-border border-b bg-background/95 px-4 backdrop-blur">
			<div className="flex min-w-0 items-center gap-3">
				{exitTarget.to === "/practice/$skill" ? (
					<Link
						to="/practice/$skill"
						params={exitTarget.params}
						className={exitClassName}
					>
						Thoát
					</Link>
				) : exitTarget.to === "/practice" ? (
					<Link to="/practice" className={exitClassName}>
						Thoát
					</Link>
				) : (
					<Link to="/" className={exitClassName}>
						Thoát
					</Link>
				)}
				<div className="flex min-w-0 flex-col justify-center">
					<h1 className="truncate font-semibold text-[15px] tracking-tight">
						{title}
					</h1>
					{dueText ? (
						<span
							data-testid="quiz-runtime-due"
							className="shrink-0 whitespace-nowrap font-mono text-[11px] text-muted-foreground tabular-nums"
						>
							{dueText}
						</span>
					) : null}
				</div>
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
						className="rounded-lg"
					>
						Nộp bài
					</Button>
				)}
			</div>
		</header>
	);
}
