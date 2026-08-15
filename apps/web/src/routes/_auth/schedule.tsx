import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LessonModal } from "@/components/schedule/lesson-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";
import type { LessonType } from "@/lib/mock-data";
import { dayDates, dayNames } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/schedule")({
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
	const [openLessonId, setOpenLessonId] = useState<string | null>(null);
	const todayIdx = 1;

	return (
		<div>
			<PageHead title="Lịch dạy" lead="Tuần 19–25/08 · 11 buổi học" />
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<div className="chip-row flex flex-wrap gap-2">
					{["← Trước", "Tuần này", "Sau →"].map((label, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: static labels
							key={i}
							className={
								i === 1
									? "rounded-full border border-fg border-solid bg-fg px-[14px] py-[6px] font-medium text-bg text-xs"
									: "rounded-full border border-line border-solid bg-bg px-[14px] py-[6px] font-medium text-fg-2 text-xs"
							}
						>
							{label}
						</span>
					))}
				</div>
				<Badge variant="success" dot>
					GCal · Đã bật
				</Badge>
			</div>
			<div className="week-cal grid grid-cols-7 gap-2 max-app:grid-cols-1 max-app:gap-3">
				{dayNames.map((dn, i) => {
					const lessons = data.lessons
						.filter((l) => l.day === i + 1)
						.sort((a, b) => a.time.localeCompare(b.time));
					return (
						<div
							key={dn}
							className={
								i === todayIdx
									? "day-col today flex max-app:items-stretch max-app:gap-3"
									: "day-col flex max-app:items-stretch max-app:gap-3"
							}
						>
							<div className="pt-2 pb-3 text-center max-app:min-w-16 max-app:border-l-3 max-app:border-l-line-soft max-app:border-l-solid max-app:pt-0 max-app:pb-0 max-app:pl-3 max-app:text-left">
								<div className="font-semibold text-[11px] text-muted-fg uppercase tracking-[0.04em]">
									{dn}
								</div>
								<div
									className={
										i === todayIdx
											? "mt-0.5 font-display font-semibold text-accent-blue text-lg"
											: "mt-0.5 font-display font-semibold text-lg"
									}
								>
									{dayDates[i]}
								</div>
							</div>
							<div className="min-w-0 flex-1">
								{lessons.length === 0 && (
									<div className="font-mono text-meta text-xs">—</div>
								)}
								{lessons.map((l) => {
									const s = studentById(l.sid);
									return (
										<button
											type="button"
											key={l.id}
											onClick={() => setOpenLessonId(l.id)}
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
													l.status === "completed" || l.status === "cancelled"
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
								})}
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
				lessonId={openLessonId}
				onClose={() => setOpenLessonId(null)}
			/>
		</div>
	);
}
