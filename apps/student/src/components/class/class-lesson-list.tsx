import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { cn } from "@/lib/cn";
import {
	formatVietnamDateFromISO,
	VI_DAY_NAMES,
} from "@/lib/vietnam-display-date";

const LESSON_STATUS: Record<string, { label: string; badgeClass: string }> = {
	completed: {
		label: "Đã học",
		badgeClass: "border-success/20 bg-success-soft text-success",
	},
	upcoming: {
		label: "Sắp tới",
		badgeClass: "border-accent-blue/20 bg-accent-soft text-accent-blue",
	},
	absent: {
		label: "Vắng",
		badgeClass: "border-warn/20 bg-warn-soft text-warn",
	},
	cancelled: {
		label: "Đã huỷ",
		badgeClass: "border-line bg-surface-warm text-muted-fg",
	},
};

export function lessonDayLabel(lesson: StudentClassLesson): string {
	if (lesson.date) return formatVietnamDateFromISO(lesson.date);
	// `lesson.day`: Monday = 1 … Sunday = 7 → `% 7` khớp index getUTCDay.
	return VI_DAY_NAMES[lesson.day % 7] ?? "";
}

/** Buổi tới = buổi `upcoming` có ngày đầu tiên từ hôm nay trở đi. Lớp legacy
 * (`date` null) không có ngày cụ thể nên không highlight. */
export function findNextLessonId(
	lessons: StudentClassLesson[],
	todayISO: string,
): string | null {
	const next = lessons.find(
		(l) => l.status === "upcoming" && l.date != null && l.date >= todayISO,
	);
	return next?.id ?? null;
}

export function ClassLessonList({
	lessons,
	todayISO,
}: {
	lessons: StudentClassLesson[];
	todayISO: string;
}) {
	if (lessons.length === 0) {
		return (
			<OverviewEmptyState
				icon="calendar"
				title="Chưa có buổi học"
				description="Giáo viên chưa xếp lịch buổi học cho lớp này."
			/>
		);
	}

	const nextId = findNextLessonId(lessons, todayISO);

	return (
		<ol className="space-y-2.5">
			{lessons.map((lesson, i) => {
				const isNext = lesson.id === nextId;
				const status = LESSON_STATUS[lesson.status] ?? {
					label: lesson.status,
					badgeClass: "border-line bg-surface-warm text-muted-fg",
				};
				return (
					<li
						key={lesson.id}
						aria-current={isNext ? "true" : undefined}
						className={cn(
							"flex flex-col gap-2 rounded-[var(--radius-md)] border bg-surface/30 p-4 sm:flex-row sm:items-center sm:justify-between",
							isNext ? "border-accent-blue bg-accent-soft/40" : "border-line",
						)}
					>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-baseline gap-2">
								<span className="font-[590] text-[15px] text-fg">
									Buổi {i + 1}
								</span>
								<span className="text-[13px] text-fg-2">
									{lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur} phút
								</span>
							</div>
							{lesson.topic && (
								<p className="mt-1 truncate text-[13px] text-muted-fg">
									{lesson.topic}
								</p>
							)}
						</div>
						<div className="flex items-center gap-2">
							{isNext && (
								<span className="rounded-full bg-accent-blue px-2.5 py-0.5 font-[590] text-[12px] text-accent-on">
									Buổi tới
								</span>
							)}
							<span
								className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-[590] text-[12px] tracking-tight ${status.badgeClass}`}
							>
								{status.label}
							</span>
						</div>
					</li>
				);
			})}
		</ol>
	);
}
