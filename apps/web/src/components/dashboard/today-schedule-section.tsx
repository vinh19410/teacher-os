import { Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import {
	type DashboardClassSession,
	formatClassSessionMeta,
	formatEndTime,
	formatWeekdayLong,
	hasPendingTodayAttendance,
	sessionTimelineState,
	type UpcomingDayGroup,
} from "@/lib/dashboard-from-kernel";
import type { ClassGroup, Lesson } from "@/lib/mock-data";
import { formatDayMonth } from "@/lib/week-grid";

function SessionMetaLine({
	session,
	cls,
}: {
	session: DashboardClassSession;
	cls: ClassGroup | undefined;
}) {
	const mode = cls?.mode?.trim() || "";
	const sessionMeta = formatClassSessionMeta(session);

	return (
		<div className="flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-sm">
			<span className="tabular-nums">{`${session.lessons.length} học viên`}</span>
			{mode && (
				<>
					<span aria-hidden="true">·</span>
					<span>{mode}</span>
				</>
			)}
			{sessionMeta && (
				<>
					<span aria-hidden="true">·</span>
					<span className="min-w-0 break-words [overflow-wrap:anywhere]">
						{sessionMeta}
					</span>
				</>
			)}
		</div>
	);
}

/**
 * Cột trái dashboard: "Lịch hôm nay" dạng vertical timeline (read-only) kèm
 * pill trạng thái suy từ dữ liệu thật, và "Lịch sắp tới" nhóm theo ngày.
 */
export function TodayScheduleSection({
	todayLessons,
	todayGroups,
	upcomingGroups,
	nowMin,
	classById,
}: {
	todayLessons: readonly Lesson[];
	todayGroups: readonly DashboardClassSession[];
	upcomingGroups: readonly UpcomingDayGroup[];
	nowMin: number;
	classById: (id: string) => ClassGroup | undefined;
}) {
	const showRailLine = todayGroups.length > 1;

	return (
		<section aria-labelledby="dashboard-today-title" className="min-w-0">
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h2
					id="dashboard-today-title"
					className="font-semibold text-lg tracking-tight"
				>
					Lịch hôm nay
				</h2>
				<Link
					to="/schedule"
					className="inline-flex min-h-8 items-center gap-1 rounded-md font-medium text-foreground text-sm underline-offset-4 hover:underline focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
				>
					Xem tuần
					<ArrowRight className="size-4" aria-hidden="true" />
				</Link>
			</div>

			{todayGroups.length === 0 ? (
				<div className="rounded-xl border border-border border-dashed px-5 py-6 text-center text-muted-foreground text-sm">
					<strong className="mb-1 block font-medium text-foreground">
						Không có buổi dạy hôm nay.
					</strong>
					Lịch tuần vẫn xem được ở mục Lịch dạy.
				</div>
			) : (
				<ol className="relative">
					{todayGroups.map((g) => {
						const cls = classById(g.classId);
						const className = cls?.name ?? "Lớp";
						const state = sessionTimelineState(g, nowMin);
						const endTime = formatEndTime(g.time, g.dur);
						const isPending =
							state === "past"
								? hasPendingTodayAttendance(todayLessons, g.classId, g.time)
								: false;

						return (
							<li
								key={`${g.classId}-${g.time}`}
								data-state={state}
								className="group grid grid-cols-[48px_16px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[56px_20px_minmax(0,1fr)] sm:gap-x-3"
							>
								<div className="pt-3 text-right">
									<span className="block font-medium font-mono text-sm tabular-nums">
										{g.time}
									</span>
									{endTime && (
										<span className="block font-mono text-muted-foreground text-xs tabular-nums">
											{endTime}
										</span>
									)}
								</div>
								<div
									aria-hidden="true"
									className="relative flex justify-center"
								>
									{showRailLine && (
										<span className="absolute inset-y-0 w-px bg-border group-first:top-[22px] group-last:bottom-[calc(100%-22px)]" />
									)}
									<span
										className={cn(
											"relative mt-[17px] size-[11px] shrink-0 rounded-full border-2",
											state === "live" &&
												"border-success bg-success ring-4 ring-success/20",
											state === "past" &&
												"border-muted-foreground bg-muted-foreground",
											state === "next" && "border-input bg-background",
										)}
									/>
								</div>
								<div className="flex min-w-0 flex-wrap items-start justify-between gap-2 border-border border-b py-3 pb-4 group-last:border-b-0">
									<div className="grid min-w-[min(140px,100%)] flex-1 gap-0.5">
										<span
											className={cn(
												"break-words font-medium text-base [overflow-wrap:anywhere]",
												state === "past" && "text-muted-foreground",
											)}
										>
											{className}
										</span>
										<SessionMetaLine session={g} cls={cls} />
									</div>
									{state === "live" && (
										<span className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-success-soft px-2 font-medium text-success text-xs">
											<span
												aria-hidden="true"
												className="size-1.5 rounded-full bg-current"
											/>
											Đang dạy
										</span>
									)}
									{state === "past" && !isPending && (
										<span className="inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 font-medium text-success text-xs">
											<Check className="size-3.5" aria-hidden="true" />
											Đã điểm danh
										</span>
									)}
									{state === "past" && isPending && (
										<span className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-warn/35 bg-background px-2 font-medium text-warn text-xs">
											<span
												aria-hidden="true"
												className="size-1.5 rounded-full bg-current"
											/>
											Chưa điểm danh
										</span>
									)}
								</div>
							</li>
						);
					})}
				</ol>
			)}

			<div className="mt-10">
				<h2 className="mb-4 font-semibold text-lg tracking-tight">
					Lịch sắp tới
				</h2>
				{upcomingGroups.length === 0 ? (
					<div className="rounded-xl border border-border border-dashed px-5 py-6 text-center text-muted-foreground text-sm">
						<strong className="block font-medium text-foreground">
							Không có buổi dạy sắp tới trong tuần.
						</strong>
					</div>
				) : (
					<div>
						{upcomingGroups.map((group) => (
							<div key={group.day} className="mt-6 first:mt-0">
								<h3 className="mb-1 flex items-baseline gap-2 font-semibold text-sm">
									<span>{formatWeekdayLong(group.day)}</span>
									{group.dateIso && (
										<span className="font-mono font-normal text-muted-foreground tabular-nums">
											{formatDayMonth(group.dateIso)}
										</span>
									)}
								</h3>
								<ol>
									{group.sessions.map((g) => {
										const cls = classById(g.classId);
										const className = cls?.name ?? "Lớp";
										const endTime = formatEndTime(g.time, g.dur);

										return (
											<li
												key={`${group.day}-${g.classId}-${g.time}`}
												className="group grid grid-cols-[48px_minmax(0,1fr)] gap-x-2 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-x-3"
											>
												<div className="pt-3 text-right">
													<span className="block font-medium font-mono text-sm tabular-nums">
														{g.time}
													</span>
													{endTime && (
														<span className="block font-mono text-muted-foreground text-xs tabular-nums">
															{endTime}
														</span>
													)}
												</div>
												<div className="min-w-0 border-border border-b py-3 pb-4 group-last:border-b-0">
													<div className="grid min-w-0 gap-0.5">
														<span className="break-words font-medium text-base [overflow-wrap:anywhere]">
															{className}
														</span>
														<SessionMetaLine session={g} cls={cls} />
													</div>
												</div>
											</li>
										);
									})}
								</ol>
							</div>
						))}
					</div>
				)}
			</div>
		</section>
	);
}
