import { dayNames } from "@/lib/mock-data";
import type { ScheduleConflict } from "@/lib/schedule-conflicts";

/** Banner cảnh báo trùng lịch dùng chung giữa AddClassModal & EditClassModal (#315, #693). */
export function ScheduleConflictBanner({
	conflicts,
}: {
	conflicts: ScheduleConflict[];
}) {
	if (conflicts.length === 0) return null;
	return (
		<div
			role="status"
			data-testid="schedule-conflict-warning"
			className="rounded-md bg-warn-soft p-3 text-warn text-xs"
		>
			<p className="font-medium">
				<span className="mr-2 inline-flex rounded-md border border-warn/30 bg-warn/15 px-2 py-0.5 font-semibold text-warn text-xs">
					Trùng lịch
				</span>
				Lịch bị trùng với lớp đang học
			</p>
			<ul className="mt-1 space-y-0.5">
				{conflicts.slice(0, 3).map(({ cls, sharedDays, schedule }) => (
					<li key={cls.id} className="break-words">
						{cls.name} · {sharedDays.map((d) => dayNames[d]).join(" & ")} ·{" "}
						{schedule.start}–{schedule.end}
					</li>
				))}
				{conflicts.length > 3 && <li>+{conflicts.length - 3} lớp khác</li>}
			</ul>
		</div>
	);
}
