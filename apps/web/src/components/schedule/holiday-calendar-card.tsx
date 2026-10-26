import { Palmtree } from "lucide-react";

import { formatDayMonth } from "@/lib/week-grid";

/**
 * Thẻ kỳ nghỉ trên 3 view lịch (TOS-14b, #453): warn token dùng chung với
 * nhãn "Nghỉ lễ" của TOS-11. `full` cho agenda Ngày (kèm khoảng ngày khi
 * span > 1); compact mặc định cho ô Tháng và cột Tuần.
 */
export function HolidayCalendarCard({
	name,
	fromDate,
	toDate,
	full = false,
}: {
	name: string;
	fromDate?: string;
	toDate?: string;
	full?: boolean;
}) {
	const multiDay = fromDate != null && toDate != null && fromDate !== toDate;
	if (full) {
		return (
			<div
				data-testid="holiday-calendar-card"
				className="flex items-start gap-3 rounded-lg border border-warn/50 bg-warn-soft px-3 py-2"
			>
				<Palmtree aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
				<div className="min-w-0">
					<div className="font-medium text-sm text-warn">{name}</div>
					{multiDay && (
						<div className="mt-px text-[11px] text-warn/80 tabular-nums">
							{formatDayMonth(fromDate)} – {formatDayMonth(toDate)}
						</div>
					)}
				</div>
			</div>
		);
	}
	return (
		<div
			data-testid="holiday-calendar-card"
			className="flex items-center gap-1 rounded border border-warn/50 bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn"
		>
			<Palmtree aria-hidden className="size-3 shrink-0" />
			<span className="truncate">{name}</span>
		</div>
	);
}
