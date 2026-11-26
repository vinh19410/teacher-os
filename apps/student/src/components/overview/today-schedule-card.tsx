import { Link } from "@tanstack/react-router";
import { ZOOM_EARLY_JOIN_MINUTES } from "@teacher-os/api/zoom-window";
import { ArrowRight, CalendarClock, Check, Video } from "lucide-react";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { cn } from "@/lib/cn";
import {
	type TodayScheduleData,
	vietnamClockHHMM,
} from "@/lib/student-overview-selectors";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

export interface TodayScheduleCardProps {
	data: TodayScheduleData;
	isLoading: boolean;
	nowMs: number;
}

export function TodayScheduleCard({
	data,
	isLoading,
	nowMs,
}: TodayScheduleCardProps) {
	const nowHHMM = vietnamClockHHMM(nowMs);

	return (
		<section
			id="today"
			aria-labelledby="today-schedule-heading"
			className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm md:p-6"
		>
			<div className="flex flex-wrap items-baseline justify-between gap-3">
				<h2
					id="today-schedule-heading"
					className="font-semibold text-foreground text-lg tracking-tight"
				>
					Lịch hôm nay
				</h2>
				{nowHHMM ? (
					<span className="font-mono text-muted-foreground text-sm tabular-nums">
						Bây giờ {nowHHMM}
					</span>
				) : null}
			</div>

			{isLoading ? (
				<div role="status" aria-busy="true">
					<span className="sr-only">Đang tải lịch hôm nay</span>
					<div aria-hidden="true" className="space-y-4">
						<div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4">
							<div className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
							<div className="space-y-2">
								<div className="h-4 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
								<div className="h-3.5 w-1/2 animate-pulse rounded bg-muted motion-reduce:animate-none" />
							</div>
						</div>
						<div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 border-border border-t pt-4">
							<div className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
							<div className="space-y-2">
								<div className="h-4 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
								<div className="h-3.5 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
							</div>
						</div>
					</div>
				</div>
			) : (
				<>
					{data.isFallback ? (
						<p className="text-muted-foreground text-xs">
							Lịch chi tiết tạm chưa tải đủ — đang hiển thị buổi học kế tiếp của
							các lớp.
						</p>
					) : null}

					{data.todayItems.length > 0 ? (
						<ul className="divide-y divide-border">
							{data.todayItems.map((item) => {
								const isEnded = item.state === "ended";
								return (
									<li
										key={item.id}
										data-state={item.state}
										className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 py-4 first:pt-0 last:pb-0"
									>
										<div className="flex flex-col">
											<span
												className={cn(
													"font-medium font-mono text-sm tabular-nums",
													isEnded ? "text-muted-foreground" : "text-foreground",
												)}
											>
												{item.time}
											</span>
											{item.endTime ? (
												<span className="font-mono text-muted-foreground text-xs tabular-nums">
													{item.endTime}
												</span>
											) : null}
										</div>

										<div className="min-w-0 space-y-1.5">
											<p
												className={cn(
													"truncate font-medium text-sm",
													isEnded ? "text-muted-foreground" : "text-foreground",
												)}
											>
												{item.className}
											</p>
											<p className="flex min-w-0 items-center gap-1.5 text-muted-foreground text-sm">
												{item.hasZoom ? (
													<Video
														aria-hidden="true"
														className="size-3.5 shrink-0"
													/>
												) : (
													<CalendarClock
														aria-hidden="true"
														className="size-3.5 shrink-0"
													/>
												)}
												<span className="truncate">{item.subtitle}</span>
											</p>

											<div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5">
												{item.state === "ended" ? (
													<span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
														<Check aria-hidden="true" className="size-3.5" />
														Đã kết thúc
													</span>
												) : item.state === "live" ? (
													<>
														{item.hasZoom ? (
															<ZoomJoinButton
																classId={item.classId}
																date={item.date}
																time={item.time}
																dur={item.dur}
																variant="default"
																size="sm"
																nowMs={nowMs}
															/>
														) : null}
														<span className="inline-flex items-center gap-1.5 font-medium text-success text-xs">
															<span
																aria-hidden="true"
																className="size-2 rounded-full bg-success"
															/>
															Đang diễn ra
														</span>
													</>
												) : item.state === "open" ? (
													<>
														<ZoomJoinButton
															classId={item.classId}
															date={item.date}
															time={item.time}
															dur={item.dur}
															variant="default"
															size="sm"
															nowMs={nowMs}
														/>
														{item.relativeText ? (
															<span className="text-muted-foreground text-xs">
																Bắt đầu sau {item.relativeText}
															</span>
														) : null}
													</>
												) : item.hasZoom ? (
													<>
														<ZoomJoinButton
															classId={item.classId}
															date={item.date}
															time={item.time}
															dur={item.dur}
															variant="outline"
															size="sm"
															nowMs={nowMs}
														/>
														{item.openAtLabel ? (
															<span className="text-muted-foreground text-xs">
																Mở từ {item.openAtLabel} (trước{" "}
																{ZOOM_EARLY_JOIN_MINUTES} phút)
															</span>
														) : null}
													</>
												) : item.relativeText ? (
													<span className="text-muted-foreground text-xs">
														Bắt đầu sau {item.relativeText}
													</span>
												) : null}
											</div>
										</div>
									</li>
								);
							})}
						</ul>
					) : (
						<div className="flex flex-1 flex-col justify-between gap-4">
							<div className="space-y-3">
								<p className="text-muted-foreground text-sm">
									Hôm nay không có buổi học.
								</p>

								{data.upcomingFallback.length > 0 ? (
									<div className="space-y-3 border-border border-t pt-3">
										<p className="font-medium text-muted-foreground text-xs">
											Buổi học sắp tới
										</p>
										<ul className="space-y-3">
											{data.upcomingFallback.map((up) => (
												<li
													key={up.id}
													className="flex flex-wrap items-center justify-between gap-2"
												>
													<div className="min-w-0">
														<p className="truncate font-medium text-foreground text-sm">
															{up.className}
														</p>
														<p className="truncate text-muted-foreground text-xs">
															{formatVietnamDateFromISO(up.date)} · {up.time} ·{" "}
															{up.subtitle}
														</p>
													</div>
													{up.hasZoom ? (
														<ZoomJoinButton
															classId={up.classId}
															date={up.date}
															time={up.time}
															dur={up.dur}
															variant="outline"
															size="sm"
															nowMs={nowMs}
														/>
													) : null}
												</li>
											))}
										</ul>
									</div>
								) : null}
							</div>

							<div className="border-border border-t pt-3">
								<Link
									to="/schedule"
									className="inline-flex items-center gap-1.5 rounded-md font-medium text-foreground text-sm underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
								>
									<span>Xem lịch học</span>
									<ArrowRight aria-hidden="true" className="size-4" />
								</Link>
							</div>
						</div>
					)}
				</>
			)}
		</section>
	);
}
