import { formatCountdown } from "@teacher-os/api/srs/format";
import { useEffect, useState } from "react";

export function VocabCountdown({
	nextDueAt,
	upcomingCount,
	onExpired,
}: {
	nextDueAt: number;
	upcomingCount: number | null;
	onExpired?: () => void;
}) {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const id = window.setInterval(() => {
			const current = Date.now();
			setNow(current);
			if (current >= nextDueAt) {
				onExpired?.();
			}
		}, 1000);
		return () => window.clearInterval(id);
	}, [nextDueAt, onExpired]);

	const remainingMs = Math.max(0, nextDueAt - now);
	const clampedUpcoming = Math.max(1, upcomingCount ?? 1);

	return (
		<div
			data-testid="vocab-countdown"
			className="neu flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
		>
			<div>
				<p className="font-mono text-[11px] text-meta uppercase tracking-[0.15em]">
					Đợt ôn tiếp theo
				</p>
				<p
					data-testid="vocab-countdown-label"
					className="mt-1 font-mono font-semibold text-fg text-lg"
				>
					{formatCountdown(remainingMs)}
				</p>
			</div>
			<span
				data-testid="vocab-upcoming-label"
				className="neu-in rounded-full px-3 py-1 font-mono text-meta text-xs"
			>
				{clampedUpcoming} từ sắp đến hạn
			</span>
		</div>
	);
}
