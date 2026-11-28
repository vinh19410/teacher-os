import { formatCountdown } from "@teacher-os/api/srs/format";
import { useEffect, useRef, useState } from "react";

export function VocabCountdown({
	nextDueAt,
	upcomingCount,
	variant = "card",
	onExpired,
}: {
	nextDueAt: number;
	upcomingCount: number | null;
	variant?: "card" | "inline";
	onExpired?: () => void;
}) {
	const [now, setNow] = useState(() => Date.now());
	const onExpiredRef = useRef(onExpired);
	onExpiredRef.current = onExpired;
	const expiredForRef = useRef<number | null>(null);

	useEffect(() => {
		const id = window.setInterval(() => {
			const current = Date.now();
			setNow(current);
			if (current >= nextDueAt && expiredForRef.current !== nextDueAt) {
				expiredForRef.current = nextDueAt;
				onExpiredRef.current?.();
			}
		}, 1000);
		return () => window.clearInterval(id);
	}, [nextDueAt]);

	const remainingMs = Math.max(0, nextDueAt - now);
	const clampedUpcoming = Math.max(1, upcomingCount ?? 1);

	if (variant === "inline") {
		return (
			<p
				data-testid="vocab-countdown"
				className="mt-2 text-muted-foreground text-sm sm:text-base"
			>
				Lượt ôn tiếp theo sau{" "}
				<span
					data-testid="vocab-countdown-label"
					className="font-medium font-mono text-foreground tabular-nums"
				>
					{formatCountdown(remainingMs)}
				</span>{" "}
				·{" "}
				<span data-testid="vocab-upcoming-label" className="tabular-nums">
					{clampedUpcoming} từ
				</span>
			</p>
		);
	}

	return (
		<div
			data-testid="vocab-countdown"
			className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm"
		>
			<div>
				<p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.15em]">
					Đợt ôn tiếp theo
				</p>
				<p
					data-testid="vocab-countdown-label"
					className="mt-1 font-mono font-semibold text-foreground text-lg tabular-nums"
				>
					{formatCountdown(remainingMs)}
				</p>
			</div>
			<span
				data-testid="vocab-upcoming-label"
				className="rounded-full bg-muted px-3 py-1 font-mono text-muted-foreground text-xs tabular-nums"
			>
				{clampedUpcoming} từ sắp đến hạn
			</span>
		</div>
	);
}
