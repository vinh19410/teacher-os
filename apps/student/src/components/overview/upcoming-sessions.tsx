import type { StudentOverview } from "@teacher-os/api/contracts";
import { CalendarClock } from "lucide-react";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

/**
 * Panel "Sắp tới" của dashboard học viên (design-v2): các buổi học gần nhất
 * của mọi lớp đang học — nguồn dữ liệu là `nextSession` trong overview.
 * Ẩn toàn panel khi không lớp nào có buổi tới.
 */
export function UpcomingSessions({
	classes,
}: {
	classes: StudentOverview["classes"];
}) {
	const upcoming = classes.flatMap((c) =>
		c.nextSession ? [{ cls: c, session: c.nextSession }] : [],
	);
	if (upcoming.length === 0) return null;

	return (
		<section className="neu rounded-lg p-6" data-testid="upcoming-sessions">
			<h2 className="font-display font-extrabold text-[20px] text-fg tracking-[-0.02em]">
				Sắp tới
			</h2>
			<p className="mt-1 text-meta text-sm">Buổi học kế tiếp của các lớp</p>
			<div className="mt-4 grid gap-2">
				{upcoming.map(({ cls, session }) => {
					return (
						<div
							key={cls.id}
							className="flex items-center gap-4 rounded-md border border-line p-3"
						>
							<span className="neu-in flex size-10 flex-none items-center justify-center rounded-md text-meta">
								<CalendarClock aria-hidden="true" className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-fg text-sm">
									{cls.name}
								</span>
								<span className="block truncate text-meta text-sm">
									{session.topic || "Buổi học"}
								</span>
							</span>
							<span className="flex-none text-right text-sm tabular-nums">
								<span className="block text-fg">
									{formatVietnamDateFromISO(session.date)}
								</span>
								{session.time && (
									<span className="block text-meta">{session.time}</span>
								)}
							</span>
						</div>
					);
				})}
			</div>
		</section>
	);
}
