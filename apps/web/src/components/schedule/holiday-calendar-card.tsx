/**
 * Thẻ kỳ nghỉ trên lịch tuần (TOS-13 phase 3, tách riêng để TOS-14 tái dùng):
 * hiển thị tên kỳ nghỉ trong cột ngày thuộc khoảng nghỉ; chỉ hiện nút
 * "Xóa kỳ nghỉ (Hoàn tác)" khi `fromDate > todayISOVietnam()` (kỳ nghỉ tương lai, D3).
 */
import type { KernelHolidaySummary } from "@teacher-os/api/contracts";
import { todayISOVietnam } from "@/lib/week-grid";

export interface HolidayCalendarCardProps {
	holiday: KernelHolidaySummary;
	/** Cho phép ẩn nút hoàn tác ở các cột ngày tiếp theo của cùng kỳ nghỉ nhiều ngày
	 * trong 1 tuần để mỗi kỳ nghỉ chỉ có duy nhất 1 nút hành động trên lưới tuần. */
	showUndoAction?: boolean;
	todayISO?: string;
	onRequestUndo: (holiday: KernelHolidaySummary) => void;
}

export function HolidayCalendarCard({
	holiday,
	showUndoAction = true,
	todayISO = todayISOVietnam(),
	onRequestUndo,
}: HolidayCalendarCardProps) {
	const isFuture = holiday.fromDate > todayISO;

	return (
		<div
			data-testid="holiday-calendar-card"
			data-holiday-id={holiday.id}
			className="mt-2 rounded-lg border border-warn/50 bg-warn-soft px-2.5 py-2 text-left text-xs"
		>
			<div className="font-semibold text-warn">{holiday.name}</div>
			<div className="mt-0.5 text-[11px] text-muted-foreground">
				{holiday.mode === "cancel"
					? "Kỳ nghỉ — Hủy buổi"
					: "Kỳ nghỉ — Đã dời lịch"}
			</div>
			{isFuture && showUndoAction && (
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
	);
}
