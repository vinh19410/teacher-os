import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	computeQuizTimerState,
	getServerClockSkewMs,
	type QuizTimerPhase,
} from "@/lib/attempt-format";
import { cn } from "@/lib/cn";

const PHASE_CLASSES: Record<QuizTimerPhase, string> = {
	running: "border-border bg-muted/50 text-foreground",
	warn: "border-warn/40 bg-warn-soft text-warn",
	expired: "border-destructive/40 bg-destructive-soft text-destructive",
};

/**
 * Leaf component tự sở hữu vòng lặp 1s + đồng bộ `visibilitychange` để
 * `QuizTakeView` và `QuizPaper` không bị re-render mỗi giây. Dừng hẳn
 * interval khi chạm `00:00` và chỉ báo `onExpiredChange` một lần khi đổi pha.
 */
export function QuizTimerBadge({
	timeLimitSeconds,
	startedAt,
	onExpiredChange,
}: {
	timeLimitSeconds: number;
	startedAt: string;
	onExpiredChange?: (expired: boolean) => void;
}) {
	const [nowMs, setNowMs] = useState(() => Date.now());
	const onExpiredChangeRef = useRef(onExpiredChange);
	onExpiredChangeRef.current = onExpiredChange;

	const timerState = computeQuizTimerState({
		timeLimitSeconds,
		startedAt,
		nowMs,
		clockSkewMs: getServerClockSkewMs(),
	});
	const isExpired = timerState?.phase === "expired";
	const hasTimer = timerState !== null;

	useEffect(() => {
		if (!hasTimer || isExpired) return;
		const tick = () => setNowMs(Date.now());
		const id = window.setInterval(tick, 1000);
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") tick();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.clearInterval(id);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, [hasTimer, isExpired]);

	useEffect(() => {
		onExpiredChangeRef.current?.(isExpired);
	}, [isExpired]);

	if (!timerState) return null;

	return (
		<span
			role="timer"
			data-testid="quiz-timer-badge"
			data-state={timerState.phase}
			aria-label={
				isExpired
					? "Đã hết thời gian làm bài"
					: `Thời gian còn lại ${timerState.formatted}`
			}
			className={cn(
				"inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-medium font-mono text-xs tabular-nums sm:gap-1.5 sm:px-2.5 sm:py-1",
				PHASE_CLASSES[timerState.phase],
			)}
		>
			<Clock aria-hidden="true" className="hidden size-3.5 shrink-0 sm:block" />
			<span>{timerState.formatted}</span>
		</span>
	);
}
