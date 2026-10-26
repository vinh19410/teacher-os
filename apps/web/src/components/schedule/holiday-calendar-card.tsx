/**
 * Thẻ kỳ nghỉ trên 3 view lịch (TOS-14b #453 + TOS-13 #448):
 * - `full` cho agenda Ngày (kèm khoảng ngày khi span > 1); compact mặc định
 *   cho ô Tháng và cột Tuần.
 * - Khi được truyền `holiday` + `onRequestUndo` (lịch tuần TOS-13), chỉ hiện
 *   nút "Xóa kỳ nghỉ (Hoàn tác)" khi `holiday.fromDate > todayISOVietnam()`
 *   (kỳ nghỉ tương lai, D3).
 */
import type { KernelHolidaySummary } from "@teacher-os/api/contracts";
import { Palmtree } from "lucide-react";
import { formatDayMonth, todayISOVietnam } from "@/lib/week-grid";

export interface HolidayCalendarCardProps {
	name?: string;
	fromDate?: string;
	toDate?: string;
	full?: boolean;
	holiday?: KernelHolidaySummary;
	/** Cho phép ẩn nút hoàn tác ở các cột ngày tiếp theo của cùng kỳ nghỉ nhiều ngày
	 * trong 1 tuần để mỗi kỳ nghỉ chỉ có duy nhất 1 nút hành động trên lưới tuần. */
	showUndoAction?: boolean;
	todayISO?: string;
	onRequestUndo?: (holiday: KernelHolidaySummary) => void;
}

export function HolidayCalendarCard({
	name,
	fromDate,
	toDate,
	full = false,
	holiday,
	showUndoAction = true,
	todayISO = todayISOVietnam(),
	onRequestUndo,
}: HolidayCalendarCardProps) {
	const resolvedName = holiday?.name ?? name ?? "";
	const resolvedFrom = holiday?.fromDate ?? fromDate;
	const resolvedTo = holiday?.toDate ?? toDate;
	const multiDay =
		resolvedFrom != null && resolvedTo != null && resolvedFrom !== resolvedTo;
	const canUndo =
		holiday != null &&
		onRequestUndo != null &&
		showUndoAction &&
		holiday.fromDate > todayISO;

	if (full) {
		return (
			<div
				data-testid="holiday-calendar-card"
				data-holiday-id={holiday?.id}
				className="flex items-start gap-3 rounded-lg border border-warn/50 bg-warn-soft px-3 py-2"
			>
				<Palmtree aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
				<div className="min-w-0 flex-1">
					<div className="font-medium text-sm text-warn">{resolvedName}</div>
					{multiDay && resolvedFrom && resolvedTo && (
						<div className="mt-px text-[11px] text-warn/80 tabular-nums">
							{formatDayMonth(resolvedFrom)} – {formatDayMonth(resolvedTo)}
						</div>
					)}
					{canUndo && (
						<button
							type="button"
							data-testid="holiday-undo-trigger"
							onClick={() => onRequestUndo(holiday)}
							className="mt-1.5 inline-flex cursor-pointer items-center rounded border border-border bg-background px-2 py-0.5 font-medium text-[11px] text-foreground transition-colors hover:bg-muted"
						>
							Xóa kỳ nghỉ (Hoàn tác)
						</button>
					)}
				</div>
			</div>
		);
	}

	return (
		<div
			data-testid="holiday-calendar-card"
			data-holiday-id={holiday?.id}
			className="rounded border border-warn/50 bg-warn-soft px-1.5 py-1 text-[11px] text-warn"
		>
			<div className="flex items-center gap-1">
				<Palmtree aria-hidden className="size-3 shrink-0" />
				<span className="truncate font-medium">{resolvedName}</span>
			</div>
			{canUndo && (
				<button
					type="button"
					data-testid="holiday-undo-trigger"
					onClick={() => onRequestUndo(holiday)}
					className="mt-1 inline-flex cursor-pointer items-center rounded border border-border bg-background px-1.5 py-0.5 font-medium text-[10px] text-foreground transition-colors hover:bg-muted"
				>
					Xóa kỳ nghỉ (Hoàn tác)
				</button>
			)}
		</div>
	);
}
