import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
	ClassSessionModal,
	type ClassSessionModalRef,
} from "@/components/schedule/class-session-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";
import type { LessonType } from "@/lib/mock-data";
import { dayNames } from "@/lib/mock-data";
import {
	distinctStudentsBySid,
	resolveWeekColumnEntries,
	selectProjectedWeekBlocks,
	selectWeekColumnSessions,
	weekSlotCount,
} from "@/lib/schedule-week";
import {
	addWeeks,
	formatDayMonth,
	formatWeekRange,
	parseWeekParam,
	resolveWeek,
	todayISOVietnam,
} from "@/lib/week-grid";

export const Route = createFileRoute("/_auth/schedule")({
	// Raw passthrough like the login route: the component parses via
	// parseWeekParam (null → current week) and cleans a garbage param off
	// the URL, so validateSearch itself never throws or redirects.
	validateSearch: (search: Record<string, unknown>): { week?: string } => ({
		week: typeof search.week === "string" ? search.week : undefined,
	}),
	component: ScheduleRoute,
});

const typeBlockClass: Record<LessonType, string> = {
	"1:1": "border-l-primary bg-accent-soft",
	"1:2": "border-l-success bg-success-soft",
	trial: "border-l-warn bg-warn-soft",
	mock: "border-l-foreground bg-fg-soft",
	review: "border-l-muted-foreground/50 bg-border",
};

export function ScheduleRoute() {
	const { data, classById } = useData();
	const { week: weekParam } = Route.useSearch();
	const navigate = useNavigate();
	const { weekStart, dates, isCurrentWeek } = resolveWeek(weekParam);
	const todayIso = todayISOVietnam();
	const [openSession, setOpenSession] = useState<ClassSessionModalRef | null>(
		null,
	);

	// A garbage ?week renders the current week already (resolveWeek falls
	// back); this scrub replaces the bad param so the URL matches the view
	// and reloads stay deterministic. `replace` avoids a history entry.
	useEffect(() => {
		if (weekParam !== undefined && parseWeekParam(weekParam) === null) {
			void navigate({ to: "/schedule", search: {}, replace: true });
		}
	}, [weekParam, navigate]);

	// Date-accurate week selection (issue #121, #162): weekly sessions are
	// grouped by class (a single block represents one physical session).
	// Dated rows render only in the week containing their occurrence date;
	// undated legacy rows keep the weekday-template behavior; classes with
	// zero lesson rows contribute display-only projected blocks.
	const columns = dayNames.map((_, i) =>
		resolveWeekColumnEntries(
			selectWeekColumnSessions(data.lessons, i + 1, dates),
			data.classes,
			data.lessons,
			dates[i],
		),
	);
	const projected = selectProjectedWeekBlocks(
		data.classes,
		data.lessons,
		dates,
	);
	const slotCount = weekSlotCount(columns, projected);

	return (
		<div>
			<PageHead
				kicker={`Tuần ${formatWeekRange(weekStart)} · ${slotCount} buổi`}
				title="Lịch dạy"
			/>
			<div className="mb-4 flex items-center justify-between gap-2">
				<Link
					to="/schedule"
					search={{ week: addWeeks(weekStart, -1) }}
					className="rounded-md border bg-background px-3 py-1.5 font-medium text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
				>
					← Tuần trước
				</Link>
				<Link
					to="/schedule"
					// Function form guarantees the param is dropped, not merged.
					search={() => ({})}
					aria-disabled={isCurrentWeek}
					tabIndex={isCurrentWeek ? -1 : 0}
					onClick={(e) => {
						// aria-disabled alone does not stop keyboard activation.
						if (isCurrentWeek) e.preventDefault();
					}}
					className={`rounded-md px-3 py-1.5 font-medium text-sm underline-offset-4 ${
						isCurrentWeek
							? "pointer-events-none text-muted-foreground"
							: "text-muted-foreground hover:text-foreground hover:underline"
					}`}
				>
					Tuần này
				</Link>
				<Link
					to="/schedule"
					search={{ week: addWeeks(weekStart, 1) }}
					className="rounded-md border bg-background px-3 py-1.5 font-medium text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
				>
					Tuần sau →
				</Link>
			</div>
			{data.classes.length === 0 ? (
				<Card
					variant="white"
					className="p-8 text-center"
					data-testid="schedule-empty-state"
				>
					<h2 className="font-semibold text-lg">Chưa có lịch dạy nào</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
						Lịch dạy được tự động sắp xếp dựa trên các lớp học đang hoạt động.
						Hãy tạo lớp học để bắt đầu theo dõi lịch dạy.
					</p>
					<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
						<Button onClick={() => navigate({ to: "/classes" })}>
							Quản lý lớp học
						</Button>
					</div>
				</Card>
			) : (
				<>
					{slotCount === 0 && (
						<div className="mb-4 rounded-md border border-border bg-muted px-4 py-3 text-center text-muted-foreground text-sm">
							Không có buổi học nào trong tuần này.
						</div>
					)}
					<div className="week-cal grid grid-cols-7 gap-2 max-app:grid-cols-1 max-app:gap-3">
						{dayNames.map((dn, i) => {
							const sessions = columns[i];
							// Real sessions and projected blocks interleave chronologically;
							// projected entries render as non-interactive divs — never a
							// button, never a ClassSessionModal write target (AC3).
							const blocks = projected
								.filter((b) => b.day === i + 1)
								.map((b) => ({
									key: `proj:${b.classId}:${b.dateISO}`,
									time: b.time,
									block: b,
								}));
							const entries = [
								...sessions.map((s) => ({
									key: s.key,
									time: s.time,
									session: s,
									block: null,
								})),
								...blocks.map((b) => ({
									key: b.key,
									time: b.time,
									session: null,
									block: b.block,
								})),
							].sort((a, b) => a.time.localeCompare(b.time));
							const isToday = dates[i] === todayIso;
							return (
								<div
									key={dn}
									className={`day-col flex min-h-[220px] flex-col rounded-xl border bg-card p-3 shadow-sm ${
										isToday ? "border-ring ring-[3px] ring-ring/20" : ""
									}`}
								>
									<div className="flex items-center justify-between pb-3">
										<div
											className={`font-medium text-sm ${
												isToday ? "" : "text-muted-foreground"
											}`}
										>
											{dn} {formatDayMonth(dates[i])}
										</div>
										{isToday && (
											<span className="rounded-md bg-primary px-1.5 py-0.5 font-medium text-[10px] text-primary-foreground">
												Hôm nay
											</span>
										)}
									</div>
									<div className="min-w-0 flex-1">
										{entries.length === 0 && (
											<div className="text-muted-foreground text-xs">—</div>
										)}
										{entries.map((entry) =>
											entry.block ? (
												<div
													key={entry.key}
													className={`lesson-block mt-2 rounded-lg border border-border border-l-3 border-l-solid bg-background px-2.5 py-2 text-left opacity-75 ${typeBlockClass["1:1"]}`}
													title="Buổi dự kiến từ lịch lớp — chưa có học viên"
												>
													<div className="text-[11px] text-muted-foreground tabular-nums">
														{entry.block.time}
													</div>
													<div className="font-semibold text-sm">
														{entry.block.className}
													</div>
													<div className="mt-px text-[11px] text-muted-foreground">
														Dự kiến · chưa có học viên
													</div>
												</div>
											) : (
												(() => {
													const s = entry.session;
													if (!s) return null;
													const cls = classById(s.classId);
													const className = cls?.name ?? "Lớp học";
													return (
														<button
															type="button"
															key={s.key}
															onClick={() =>
																setOpenSession({
																	classId: s.classId,
																	dateISO: s.dateISO,
																	day: s.day,
																	time: s.time,
																	columnDateISO: dates[i],
																})
															}
															className={`lesson-block mt-2 cursor-pointer rounded-lg border border-border border-l-3 border-l-solid bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/50 ${typeBlockClass[s.type]} ${
																s.status === "completed"
																	? "opacity-60"
																	: s.status === "cancelled"
																		? "opacity-35"
																		: ""
															}`}
														>
															<div className="text-[11px] text-muted-foreground tabular-nums">
																{s.time}
															</div>
															<div
																className={
																	s.status === "completed" ||
																	s.status === "cancelled"
																		? "font-semibold text-sm line-through decoration-muted-foreground"
																		: "font-semibold text-sm"
																}
															>
																{className}
																{(() => {
																	// #204: legacy undated entries bundle whole-course rows; the chip
																	// must count students, not rows.
																	const students = distinctStudentsBySid(
																		s.rows,
																	).length;
																	return students > 1 ? (
																		<span className="ml-1 font-normal text-[11px] text-muted-foreground">
																			({students} HV)
																		</span>
																	) : null;
																})()}
															</div>
															<div className="mt-px text-[11px] text-muted-foreground">
																{s.type} · {s.topic.substring(0, 30)}
															</div>
														</button>
													);
												})()
											),
										)}
									</div>
								</div>
							);
						})}
					</div>
					<div className="mt-6 flex flex-wrap gap-4 text-muted-foreground">
						<span>
							<span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent-soft" />
							1:1
						</span>
						<span>
							<span className="mr-1 inline-block h-2 w-2 rounded-full bg-success-soft" />
							1:2
						</span>
						<span>
							<span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn-soft" />
							Học thử (Trial)
						</span>
						<span>
							<span className="mr-1 inline-block h-2 w-2 rounded-full bg-fg-soft" />
							Thi thử (Mock)
						</span>
						<span>
							<span className="mr-1 inline-block h-2 w-2 rounded-full bg-border" />
							Ôn tập (Review)
						</span>
					</div>
				</>
			)}
			<ClassSessionModal
				sessionRef={openSession}
				onClose={() => setOpenSession(null)}
			/>
		</div>
	);
}
