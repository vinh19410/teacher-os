import type { StudentClass } from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

export function ClassCard({ cls }: { cls: StudentClass }) {
	const progressPercent =
		cls.sessionsTotal > 0
			? Math.min(100, Math.round((cls.sessionsDone / cls.sessionsTotal) * 100))
			: 0;

	let nextSessionText = "Chưa có lịch buổi tới";
	if (cls.nextSession?.date) {
		const formattedDate = formatVietnamDateFromISO(cls.nextSession.date);
		const time = cls.nextSession.time ? ` · ${cls.nextSession.time}` : "";
		const topic = cls.nextSession.topic ? ` · ${cls.nextSession.topic}` : "";
		nextSessionText = `Buổi tới: ${formattedDate}${time}${topic}`;
	}

	return (
		<div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-line bg-surface/50 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,background] hover:border-line-hover hover:bg-surface">
			<div>
				<div className="flex flex-wrap items-center gap-2">
					{cls.level && (
						<span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-[510] text-[11px] text-accent-blue">
							{cls.level}
						</span>
					)}
					{cls.mode && (
						<span className="rounded-full bg-surface-warm px-2.5 py-0.5 font-[510] text-[11px] text-muted-fg">
							{cls.mode}
						</span>
					)}
				</div>

				<h3 className="mt-3 font-[620] font-display text-[18px] text-fg leading-snug">
					{cls.name}
				</h3>

				{cls.schedule && (
					<p className="mt-1 text-[13px] text-muted-fg leading-normal">
						{formatSchedule(cls.schedule)}
					</p>
				)}
			</div>

			<div className="mt-5 border-line-soft border-t pt-4">
				<div className="flex items-center justify-between text-[12px]">
					<span className="text-muted-fg">Tiến độ khóa học</span>
					<span className="font-[590] text-fg">
						Buổi {cls.sessionsDone}/{cls.sessionsTotal}
					</span>
				</div>
				<div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
					<div
						className="h-full rounded-full bg-accent-blue transition-all duration-300"
						style={{ width: `${progressPercent}%` }}
					/>
				</div>

				<p className="mt-3 truncate text-[12px] text-fg-2">{nextSessionText}</p>
			</div>
		</div>
	);
}
