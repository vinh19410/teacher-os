import type { HistoryWeekResponse } from "@teacher-os/api/contracts";
import { HISTORY_SKILLS } from "@teacher-os/api/contracts";
import { addDaysISO } from "@teacher-os/api/vietnam-date";
import { HISTORY_SKILL_LABELS } from "@/components/history/history-skill-labels";
import { cn } from "@/lib/cn";

/** "75" → "1h 15m", "40" → "40m" — nhãn cột thời gian gọn như design-v2. */
function formatMinutes(minutes: number): string {
	if (minutes >= 60) {
		return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
	}
	return `${minutes}m`;
}

/**
 * Bảng tuần theo kỹ năng (design-v2 `WeekTable`): 7 hàng Thứ 2 → Chủ nhật,
 * cột = 5 kỹ năng có dữ liệu thật (KHÔNG có Dictation), cột "Thời gian" từ
 * `minutes` của HistoryWeekResponse; hàng Tổng ở footer.
 */
export function WeekTable({
	week,
	todayKey,
}: {
	week: HistoryWeekResponse;
	todayKey: string;
}) {
	const days = Array.from({ length: 7 }, (_, offset) =>
		addDaysISO(week.monday, offset),
	);
	const countBySkill = new Map(week.rows.map((row) => [row.skill, row.days]));
	const cell = (n: number, isFuture: boolean) =>
		isFuture || n === 0 ? (
			<span className="text-muted-foreground/50">—</span>
		) : (
			<span className="inline-flex min-w-7 justify-center rounded-md bg-muted px-1.5 py-0.5 font-medium">
				{n}
			</span>
		);

	const totals = [...HISTORY_SKILLS].map((skill) =>
		(countBySkill.get(skill) ?? []).reduce((sum, n) => sum + n, 0),
	);
	const totalMinutes = week.minutes.reduce((sum, n) => sum + n, 0);

	return (
		<div data-testid="history-week-table" className="w-full overflow-x-auto">
			<table className="w-full text-sm tabular-nums">
				<thead className="border-b">
					<tr>
						<th className="h-10 pr-3 text-left font-medium text-muted-foreground">
							Ngày
						</th>
						{[...HISTORY_SKILLS].map((skill) => (
							<th
								key={skill}
								className="h-10 px-2 text-center font-medium text-muted-foreground"
							>
								{HISTORY_SKILL_LABELS[skill]}
							</th>
						))}
						<th className="h-10 pl-2 text-right font-medium text-muted-foreground">
							Thời gian
						</th>
					</tr>
				</thead>
				<tbody className="[&>tr]:border-b">
					{days.map((day, offset) => {
						const isFuture = day > todayKey;
						const isToday = day === todayKey;
						const [, mm, dd] = day.split("-");
						return (
							<tr key={day} className={cn(isToday && "bg-muted/40")}>
								<td className="whitespace-nowrap py-2.5 pr-3">
									{dd}/{mm}
									{isToday && (
										<span className="ml-2 text-muted-foreground text-xs">
											Hôm nay
										</span>
									)}
								</td>
								{[...HISTORY_SKILLS].map((skill) => (
									<td key={skill} className="px-2 text-center">
										{cell(countBySkill.get(skill)?.[offset] ?? 0, isFuture)}
									</td>
								))}
								<td className="pl-2 text-right">
									{isFuture ? (
										<span className="text-muted-foreground/50">—</span>
									) : (
										formatMinutes(week.minutes[offset] ?? 0)
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
				<tfoot>
					<tr className="font-semibold">
						<td className="pt-3 pr-3">Tổng</td>
						{totals.map((n, index) => (
							<td key={HISTORY_SKILLS[index]} className="px-2 pt-3 text-center">
								{n || (
									<span className="font-normal text-muted-foreground/50">
										—
									</span>
								)}
							</td>
						))}
						<td className="pt-3 pl-2 text-right">
							{formatMinutes(totalMinutes)}
						</td>
					</tr>
				</tfoot>
			</table>
		</div>
	);
}
