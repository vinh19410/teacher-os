import { useMemo } from "react";
import { classBlockClass } from "@/components/schedule/class-block";
import type { ClassSessionModalRef } from "@/components/schedule/class-session-modal";
import { HolidayCalendarCard } from "@/components/schedule/holiday-calendar-card";
import { OrgEventChip } from "@/components/schedule/org-event-chip";
import { Card } from "@/components/ui/card";
import { classColorIndex } from "@/lib/class-color";
import type { KernelSlice } from "@/lib/repos/kernel";
import { buildDayAgenda } from "@/lib/schedule-day";
import { formatDayLabel, isoDayNumber } from "@/lib/week-grid";

/**
 * View Ngày (TOS-14, D5): agenda theo giờ tăng dần — ca học (dated + legacy
 * theo thứ + projected), sự kiện vận hành. Bấm ca mở ClassSessionModal như
 * view Tuần; projected block vẫn non-interactive (AC3). Cancelled vẫn hiện
 * (agenda chi tiết, khác ô tháng bị cắt).
 */
export function ScheduleDayView({
	data,
	dateISO,
	onOpenSession,
}: {
	data: KernelSlice;
	dateISO: string;
	onOpenSession: (session: ClassSessionModalRef) => void;
}) {
	const items = useMemo(() => buildDayAgenda(data, dateISO), [data, dateISO]);
	const classById = useMemo(() => {
		const map = new Map<string, KernelSlice["classes"][number]>();
		for (const cls of data.classes) map.set(cls.id, cls);
		return map;
	}, [data.classes]);

	return (
		<div
			className="space-y-2"
			data-testid="schedule-day-agenda"
			data-date={dateISO}
		>
			<h2 className="font-medium text-muted-foreground text-sm">
				{formatDayLabel(dateISO)}
			</h2>
			{items.length === 0 && (
				<Card variant="white" className="p-8 text-center">
					<p className="text-muted-foreground text-sm">
						Không có ca học hay sự kiện nào trong ngày này.
					</p>
				</Card>
			)}
			{items.map((item) => {
				if (item.kind === "holiday") {
					// TOS-14b: kỳ nghỉ là mục cả ngày — thẻ full đầu agenda.
					return (
						<HolidayCalendarCard
							key={item.id}
							full
							name={item.name}
							fromDate={item.fromDate}
							toDate={item.toDate}
						/>
					);
				}
				if (item.kind === "event") {
					return <OrgEventChip key={item.id} event={eventOf(data, item.id)} />;
				}
				const cls = classById.get(item.classId);
				const className = cls?.name ?? "Lớp học";
				const projected = item.rows.length === 0;
				const block = (
					<>
						<div className="flex shrink-0 flex-col items-start">
							<span className="text-[11px] text-muted-foreground tabular-nums">
								{item.time}
							</span>
							<span className="text-[10px] text-muted-foreground tabular-nums">
								→ {item.endTime}
							</span>
						</div>
						<div className="min-w-0 flex-1">
							<div
								className={`font-semibold text-sm ${
									item.status === "completed" || item.status === "cancelled"
										? "line-through decoration-muted-foreground"
										: ""
								}`}
							>
								{className}
							</div>
							<div className="mt-px flex items-center gap-2 text-[11px] text-muted-foreground">
								<span className="rounded border border-border bg-background px-1 py-px">
									{item.type}
								</span>
								{projected ? (
									<span>Dự kiến · chưa có học viên</span>
								) : (
									item.topic && <span className="truncate">{item.topic}</span>
								)}
							</div>
						</div>
					</>
				);
				return projected ? (
					<div
						key={item.id}
						title="Buổi dự kiến từ lịch lớp — chưa có học viên"
						className={`lesson-block flex items-start gap-3 rounded-lg border border-border border-l-3 border-l-solid px-3 py-2 opacity-75 ${classBlockClass(item.classId)}`}
						data-class-color={classColorIndex(item.classId)}
					>
						{block}
					</div>
				) : (
					<button
						type="button"
						key={item.id}
						onClick={() =>
							onOpenSession({
								classId: item.classId,
								dateISO: item.dateISO,
								// Dated lẫn legacy đều quy về thứ của ngày đang xem.
								day: isoDayNumber(dateISO),
								time: item.time,
								columnDateISO: dateISO,
							})
						}
						className={`lesson-block flex w-full cursor-pointer items-start gap-3 rounded-lg border border-border border-l-3 border-l-solid px-3 py-2 text-left transition-colors hover:bg-muted/50 ${classBlockClass(item.classId)} ${
							item.status === "completed"
								? "opacity-60"
								: item.status === "cancelled"
									? "opacity-35"
									: ""
						}`}
						data-class-color={classColorIndex(item.classId)}
					>
						{block}
					</button>
				);
			})}
		</div>
	);
}

/** Org events là nguồn của item event trong agenda — lookup theo id. */
function eventOf(data: KernelSlice, id: string) {
	const event = data.events.find((event) => event.id === id);
	if (!event) {
		throw new Error(`org event ${id} missing from snapshot`);
	}
	return event;
}
