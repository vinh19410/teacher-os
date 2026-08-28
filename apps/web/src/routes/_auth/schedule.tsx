import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LessonModal } from "@/components/schedule/lesson-modal";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";
import type { LessonType } from "@/lib/mock-data";
import { dayNames } from "@/lib/mock-data";
import {
	selectProjectedWeekBlocks,
	selectWeekColumnLessons,
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
	"1:1": "border-l-accent-blue bg-accent-soft",
	"1:2": "border-l-success bg-success-soft",
	trial: "border-l-warn bg-warn-soft",
	mock: "border-l-fg bg-fg-soft",
	review: "border-l-meta bg-line-soft",
};

export function ScheduleRoute() {
	const { data, studentById } = useData();
	const { week: weekParam } = Route.useSearch();
	const navigate = useNavigate();
	const { weekStart, dates, isCurrentWeek } = resolveWeek(weekParam);
	const todayIso = todayISOVietnam();
	const [openLesson, setOpenLesson] = useState<{
		id: string;
		dateIso: string;
	} | null>(null);

	// A garbage ?week renders the current week already (resolveWeek falls
	// back); this scrub replaces the bad param so the URL matches the view
	// and reloads stay deterministic. `replace` avoids a history entry.
	useEffect(() => {
		if (weekParam !== undefined && parseWeekParam(weekParam) === null) {
			void navigate({ to: "/schedule", search: {}, replace: true });
		}
	}, [weekParam, navigate]);

	// Date-accurate week selection (issue #121): dated rows render only in
	// the week containing their occurrence date; undated legacy rows keep the
	// weekday-template behavior; classes with zero lesson rows contribute
	// display-only projected blocks derived from their schedule skeleton.
	const columns = dayNames.map((_, i) =>
		selectWeekColumnLessons(data.lessons, i + 1, dates),
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
				title="Lịch dạy"
				lead={`Tuần ${formatWeekRange(weekStart)} · ${slotCount} buổi`}
			/>
			<div className="mb-4 flex items-center justify-between gap-2">
				<Link
					to="/schedule"
					search={{ week: addWeeks(weekStart, -1) }}
					className="font-mono text-meta text-muted-fg text-xs hover:text-fg"
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
					className={`font-mono text-meta text-xs ${
						isCurrentWeek
							? "pointer-events-none text-fg-2"
							: "text-muted-fg hover:text-fg"
					}`}
				>
					Tuần này
				</Link>
				<Link
					to="/schedule"
					search={{ week: addWeeks(weekStart, 1) }}
					className="font-mono text-meta text-muted-fg text-xs hover:text-fg"
				>
					Tuần sau →
				</Link>
			</div>
			<div className="week-cal grid grid-cols-7 gap-2 max-app:grid-cols-1 max-app:gap-3">
				{dayNames.map((dn, i) => {
					const lessons = columns[i];
					// Real rows and projected blocks interleave chronologically;
					// projected entries render as non-interactive divs — never a
					// button, never a LessonModal write target (AC3).
					const blocks = projected
						.filter((b) => b.day === i + 1)
						.map((b) => ({
							key: `proj:${b.classId}:${b.dateISO}`,
							time: b.time,
							block: b,
						}));
					const entries = [
						...lessons.map((l) => ({
							key: l.id,
							time: l.time,
							lesson: l,
							block: null,
						})),
						...blocks.map((b) => ({
							key: b.key,
							time: b.time,
							lesson: null,
							block: b.block,
						})),
					].sort((a, b) => a.time.localeCompare(b.time));
					const isToday = dates[i] === todayIso;
					return (
						<div
							key={dn}
							className="day-col flex max-app:items-stretch max-app:gap-3"
						>
							<div
								className={`pt-2 pb-3 text-center max-app:min-w-16 max-app:border-l-3 max-app:border-l-solid max-app:pt-0 max-app:pb-0 max-app:pl-3 max-app:text-left ${
									isToday
										? "max-app:border-l-accent-blue"
										: "max-app:border-l-line-soft"
								}`}
							>
								<div className="font-semibold text-[11px] text-muted-fg uppercase tracking-[0.04em]">
									{dn}
								</div>
								<div
									className={`font-mono text-[11px] ${
										isToday ? "text-accent-blue" : "text-line-meta"
									}`}
								>
									{formatDayMonth(dates[i])}
								</div>
							</div>
							<div className="min-w-0 flex-1">
								{entries.length === 0 && (
									<div className="font-mono text-meta text-xs">—</div>
								)}
								{entries.map((entry) =>
									entry.block ? (
										<div
											key={entry.key}
											className={`lesson-block mt-2 rounded-sm border-l-3 border-l-solid px-3 py-2 text-left opacity-75 ${typeBlockClass["1:1"]}`}
											title="Buổi dự kiến từ lịch lớp — chưa có học viên"
										>
											<div className="font-mono text-[11px] text-fg-2">
												{entry.block.time}
											</div>
											<div className="font-semibold text-sm">
												{entry.block.className}
											</div>
											<div className="mt-px text-[11px] text-muted-fg">
												Dự kiến · chưa có học viên
											</div>
										</div>
									) : (
										(() => {
											const l = entry.lesson;
											if (!l) return null;
											const s = studentById(l.sid);
											return (
												<button
													type="button"
													key={l.id}
													onClick={() =>
														setOpenLesson({ id: l.id, dateIso: dates[i] })
													}
													className={`lesson-block mt-2 cursor-pointer rounded-sm border-l-3 border-l-solid px-3 py-2 text-left transition-[transform,box-shadow] duration-[150ms] hover:-translate-y-px hover:shadow-[var(--elev-raised)] ${
														typeBlockClass[l.type]
													} ${
														l.status === "completed"
															? "opacity-60"
															: l.status === "cancelled"
																? "opacity-35"
																: ""
													}`}
												>
													<div className="font-mono text-[11px] text-fg-2">
														{l.time}
													</div>
													<div
														className={
															l.status === "completed" ||
															l.status === "cancelled"
																? "font-semibold text-sm line-through decoration-meta"
																: "font-semibold text-sm"
														}
													>
														{s?.name ?? ""}
													</div>
													<div className="mt-px text-[11px] text-muted-fg">
														{l.type} · {l.topic.substring(0, 30)}
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
			<div className="mt-6 flex flex-wrap gap-4 font-mono text-[11px] text-meta">
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
					Trial
				</span>
				<span>
					<span className="mr-1 inline-block h-2 w-2 rounded-full bg-fg-soft" />
					Mock
				</span>
				<span>
					<span className="mr-1 inline-block h-2 w-2 rounded-full bg-line-soft" />
					Review
				</span>
			</div>
			<LessonModal
				lessonId={openLesson?.id ?? null}
				dateIso={openLesson?.dateIso ?? null}
				onClose={() => setOpenLesson(null)}
			/>
		</div>
	);
}
