import { useMemo } from "react";
import {
	classBlockClass,
	classDotClass,
} from "@/components/schedule/class-block";
import { OrgEventChip } from "@/components/schedule/org-event-chip";
import { Button } from "@/components/ui/button";
import { classColorIndex } from "@/lib/class-color";
import { dayNames } from "@/lib/mock-data";
import type { KernelSlice } from "@/lib/repos/kernel";
import { buildMonthCells } from "@/lib/schedule-month";
import { formatDayMonth } from "@/lib/week-grid";

/**
 * View Tháng (TOS-14, D5): lưới 6×7 bắt đầu Thứ Hai, mỗi ô tối đa 3 mục
 * (ca học màu lớp, sự kiện) + "+N" mở view Ngày; 375px thu gọn thành chấm
 * màu, bấm ngày mở view Ngày. Dữ liệu thuần client từ snapshot (D6).
 */
export function ScheduleMonthView({
	data,
	anchor,
	onOpenDay,
}: {
	data: KernelSlice;
	/** Ngày neo trong tháng đang xem (yyyy-mm-dd). */
	anchor: string;
	onOpenDay: (dateISO: string) => void;
}) {
	const cells = useMemo(
		() =>
			buildMonthCells(
				{ classes: data.classes, lessons: data.lessons, events: data.events },
				anchor,
			),
		[data, anchor],
	);
	const classById = useMemo(() => {
		const map = new Map<string, KernelSlice["classes"][number]>();
		for (const cls of data.classes) map.set(cls.id, cls);
		return map;
	}, [data.classes]);

	return (
		<div>
			<div className="month-cal grid grid-cols-7 gap-1.5 text-center">
				{dayNames.map((dn) => (
					<div
						key={dn}
						className="pb-1 font-medium text-muted-foreground text-xs"
					>
						{dn}
					</div>
				))}
			</div>
			<div
				className="month-cal grid grid-cols-7 gap-1.5"
				data-testid="schedule-month-grid"
			>
				{cells.map((cell) => (
					<div
						key={cell.date}
						data-date={cell.date}
						className={`month-cell flex min-h-20 flex-col rounded-lg border p-1.5 text-left max-sm:min-h-0 max-sm:items-center max-sm:justify-center max-sm:p-1 ${
							cell.inMonth
								? "border-border bg-card"
								: "border-border/50 bg-muted/40 text-muted-foreground"
						} ${cell.isToday ? "border-ring ring-[3px] ring-ring/20" : ""}`}
					>
						<button
							type="button"
							onClick={() => onOpenDay(cell.date)}
							className="flex w-full flex-col items-center justify-center gap-0.5 rounded text-xs hover:text-foreground"
							aria-label={`Xem lịch ngày ${formatDayMonth(cell.date)}`}
						>
							<span
								className={`rounded px-1 tabular-nums ${
									cell.isToday
										? "bg-primary font-semibold text-primary-foreground"
										: ""
								}`}
							>
								{Number.parseInt(cell.date.slice(8), 10)}
							</span>
							{/* 375px: chấm màu theo lớp + chấm xám sự kiện nằm trong button để bấm mở view Ngày. */}
							<span className="hidden flex-wrap items-center justify-center gap-0.5 max-sm:flex">
								{cell.items.map((item) => (
									<span
										key={item.id}
										aria-hidden
										className={`size-1.5 rounded-full ${
											item.kind === "lesson"
												? classDotClass(item.classId)
												: "bg-muted-foreground"
										}`}
									/>
								))}
								{cell.overflow > 0 && (
									<span className="text-[10px] text-muted-foreground tabular-nums leading-none">
										+{cell.overflow}
									</span>
								)}
							</span>
						</button>
						{/* Desktop/Tablet (>=640px): khối chi tiết. Mobile (<640px): chấm màu ở trên (D5, 375px). */}
						<div className="mt-1 min-w-0 flex-1 max-sm:hidden">
							{cell.items.map((item) =>
								item.kind === "lesson" ? (
									<div
										key={item.id}
										data-class-color={classColorIndex(item.classId)}
										className={`month-item truncate rounded border-l-3 px-1 py-0.5 text-[11px] ${classBlockClass(item.classId)} ${
											item.status === "cancelled"
												? "line-through opacity-35"
												: ""
										}`}
									>
										<span className="text-muted-foreground tabular-nums">
											{item.time}
										</span>{" "}
										{classById.get(item.classId)?.name ?? "Lớp học"}
									</div>
								) : (
									<OrgEventChip
										key={item.id}
										event={eventOf(data, item.id)}
										compact
									/>
								),
							)}
							{cell.overflow > 0 && (
								<Button
									variant="ghost"
									size="sm"
									className="h-5 w-full px-1 text-[11px] text-muted-foreground"
									onClick={() => onOpenDay(cell.date)}
									aria-label={`Xem thêm ${cell.overflow} mục ngày ${formatDayMonth(cell.date)}`}
								>
									+{cell.overflow} xem ngày
								</Button>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

/** Org events là nguồn của item event trong ô — lookup theo id. */
function eventOf(data: KernelSlice, id: string) {
	const event = data.events.find((event) => event.id === id);
	if (!event) {
		throw new Error(`org event ${id} missing from snapshot`);
	}
	return event;
}
