import type { StudentOverview } from "@teacher-os/api/contracts";
import { CalendarClock } from "lucide-react";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

/**
 * Panel "Sắp tới" của dashboard học viên (design-v2): các buổi học gần nhất
 * của mọi lớp đang học — nguồn dữ liệu là `nextSession` trong overview.
 * Ẩn toàn panel khi không lớp nào có buổi tới.
 */
export function UpcomingSessions({
	classes,
	nowMs,
}: {
	classes: StudentOverview["classes"];
	nowMs?: number;
}) {
	const upcoming = classes.flatMap((c) =>
		c.enrollmentStatus === "active" && c.nextSession
			? [{ cls: c, session: c.nextSession }]
			: [],
	);
	if (upcoming.length === 0) return null;

	return (
		<section
			className="rounded-lg rounded-xl border bg-card p-6 shadow-sm"
			data-testid="upcoming-sessions"
		>
			<h2 className="font-extrabold text-[20px] text-foreground tracking-[-0.02em]">
				Sắp tới
			</h2>
			<p className="mt-1 text-muted-foreground text-sm">
				Buổi học kế tiếp của các lớp
			</p>
			<div className="mt-4 grid gap-2">
				{upcoming.map(({ cls, session }) => {
					return (
						<div
							key={cls.id}
							className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
						>
							<div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
								<span className="flex size-10 flex-none items-center justify-center rounded-md bg-muted text-muted-foreground">
									<CalendarClock aria-hidden="true" className="size-4" />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium text-foreground text-sm">
										{cls.name}
									</span>
									<span className="block truncate text-muted-foreground text-sm">
										{session.topic || "Buổi học"}
									</span>
								</span>
								<span className="flex-none text-right text-sm tabular-nums">
									<span className="block text-foreground">
										{formatVietnamDateFromISO(session.date)}
									</span>
									{session.time && (
										<span className="block text-muted-foreground">
											{session.time}
										</span>
									)}
								</span>
							</div>
							{cls.status !== "paused" &&
								cls.enrollmentStatus === "active" &&
								Boolean(session.hasZoom ?? session.joinUrl) && (
									<ZoomJoinButton
										classId={cls.id}
										date={session.date}
										time={session.time}
										dur={session.dur}
										variant="default"
										size="sm"
										className="w-full shrink-0 sm:w-auto"
										nowMs={nowMs}
									/>
								)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
