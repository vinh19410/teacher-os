import type { HistoryDay } from "@teacher-os/api/contracts";
import {
	addDaysISO,
	addMonthsISO,
	mondayOfISO,
} from "@teacher-os/api/vietnam-date";
import { cn } from "@/lib/cn";

/**
 * Heatmap một tháng theo design-v2 `MonthHeatmap`: lưới tuần bắt đầu Thứ 2,
 * ô ngày là `button` có aria-label "Ngày dd/mm: N bài" (phase 11 #378) —
 * bấm ô ngày đặt tuần cho WeekTable (trạng thái tuần sống ở URL `?week=`).
 * Ngày tương lai disabled và mờ; ngày hôm nay khoanh ring.
 */
const LEVEL_CLASSES = [
	"text-muted-foreground",
	"bg-primary/15",
	"bg-primary/35",
	"bg-primary/65 text-primary-foreground",
	"bg-primary text-primary-foreground",
];

const DOW_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

export function MonthHeatmap({
	ym,
	days,
	week,
	onWeek,
	todayKey,
}: {
	/** Tháng hiển thị yyyy-mm. */
	ym: string;
	/** Các ngày CÓ hoạt động (server chỉ trả ngày count > 0). */
	days: HistoryDay[];
	/** Thứ Hai của tuần đang chọn (ISO). */
	week: string;
	onWeek: (monday: string) => void;
	/** Hôm nay theo giờ VN (yyyy-mm-dd). */
	todayKey: string;
}) {
	const [year, month] = ym.split("-").map(Number);
	const countByDate = new Map(days.map((day) => [day.date, day.count]));
	const firstIso = `${ym}-01`;
	const lastIso = addDaysISO(`${addMonthsISO(ym, 1)}-01`, -1);

	// Các tuần giao nhau với tháng: bám mondayOfISO của ngày 1, bước 7 ngày.
	const mondays: string[] = [];
	for (let m = mondayOfISO(firstIso); m <= lastIso; m = addDaysISO(m, 7)) {
		mondays.push(m);
	}

	return (
		<div data-testid="history-heatmap" data-month={ym}>
			<div className="mb-2 font-medium text-sm">
				Tháng {month}/{year}
			</div>
			<div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-y-1 text-xs">
				<span />
				{DOW_LABELS.map((label) => (
					<span key={label} className="pb-1 text-center text-muted-foreground">
						{label}
					</span>
				))}
				{mondays.map((monday, weekIndex) => {
					const weekSelected = monday === week;
					return (
						<div
							key={monday}
							className={cn(
								"col-span-8 grid grid-cols-subgrid items-center rounded-lg py-1",
								weekSelected ? "bg-muted ring-1 ring-border" : "",
							)}
						>
							<span className="pl-2 text-left text-muted-foreground">
								Tuần {weekIndex + 1}
							</span>
							{DOW_LABELS.map((_, offset) => {
								const day = addDaysISO(monday, offset);
								if (!day.startsWith(ym)) return <span key={offset} />;
								const [, mm, dd] = day.split("-");
								const n = countByDate.get(day) ?? 0;
								const isFuture = day > todayKey;
								return (
									<span key={offset} className="flex justify-center">
										<button
											type="button"
											disabled={isFuture}
											aria-pressed={weekSelected}
											aria-label={`Ngày ${dd}/${mm}: ${n} bài`}
											onClick={() => onWeek(monday)}
											className={cn(
												"grid size-7 place-items-center rounded-md tabular-nums outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
												isFuture
													? "text-muted-foreground/40"
													: LEVEL_CLASSES[Math.min(n, 4)],
												day === todayKey &&
													"font-semibold ring-2 ring-ring ring-offset-1 ring-offset-card",
											)}
										>
											{Number(dd)}
										</button>
									</span>
								);
							})}
						</div>
					);
				})}
			</div>
			<div className="mt-5 flex items-center gap-1.5 text-muted-foreground text-xs">
				Ít
				{LEVEL_CLASSES.slice(1).map((levelClass) => (
					<span
						key={levelClass}
						className={cn("size-3 rounded-sm", levelClass)}
					/>
				))}
				<span className="size-3 rounded-sm border" />
				Nhiều
			</div>
		</div>
	);
}
