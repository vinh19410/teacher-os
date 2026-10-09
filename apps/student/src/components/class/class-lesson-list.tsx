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
		badgeClass: "bg-success-soft text-success",
	},
	upcoming: {
		label: "Sắp tới",
		badgeClass: "border border-hot/40 text-hot",
	},
	absent: {
		label: "Vắng",
		badgeClass: "bg-hot font-medium text-accent-on",
	},
	cancelled: {
		label: "Đã huỷ",
		badgeClass: "neu-in text-muted-fg",
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
		<ol>
			{lessons.map((lesson, i) => {
				const isNext = lesson.id === nextId;
				const status = LESSON_STATUS[lesson.status] ?? {
					label: lesson.status,
					badgeClass: "neu-in text-muted-fg",
				};
				return (
					// Danh sách buổi dạng hàng `border-t` theo design — không card
					// riêng từng buổi; buổi tới nổi bật bằng chip "Buổi tới" cam.
					<li
						key={lesson.id}
						aria-current={isNext ? "true" : undefined}
						className={cn(
							"flex flex-col gap-2 border-line border-t py-3 sm:flex-row sm:items-center sm:justify-between",
							isNext && "text-fg",
						)}
					>
						<div className="min-w-0 flex-1">
							<div className="flex flex-wrap items-baseline gap-2">
								<span
									className={cn(
										"font-medium text-[15px]",
										isNext ? "text-hot" : "text-fg",
									)}
								>
									Buổi {i + 1}
								</span>
								<span className="font-mono text-[12px] text-meta">
									{lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur} phút
								</span>
							</div>
							{lesson.topic && (
								<p className="mt-1 truncate text-[13px] text-meta">
									{lesson.topic}
								</p>
							)}
						</div>
						<div className="flex items-center gap-2">
							{isNext && (
								<span className="rounded-full bg-hot px-2.5 py-0.5 font-medium font-mono text-[10px] text-accent-on uppercase tracking-[0.08em]">
									Buổi tới
								</span>
							)}
							<span
								className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${status.badgeClass}`}
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
