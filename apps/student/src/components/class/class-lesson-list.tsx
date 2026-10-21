import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { Check, CircleDashed, X } from "lucide-react";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
	formatVietnamDateFromISO,
	VI_DAY_NAMES,
} from "@/lib/vietnam-display-date";

const LESSON_STATUS: Record<
	string,
	{ label: string; variant: BadgeVariant; badgeClass: string }
> = {
	completed: {
		label: "Đã học",
		variant: "outline",
		badgeClass: "text-foreground",
	},
	upcoming: {
		label: "Sắp tới",
		variant: "secondary",
		badgeClass: "",
	},
	absent: {
		label: "Vắng",
		variant: "destructive",
		badgeClass: "",
	},
	cancelled: {
		label: "Đã huỷ",
		variant: "outline",
		badgeClass: "text-muted-foreground line-through",
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
		<div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
			<ol className="relative">
				{lessons.map((lesson, i) => {
					const isNext = lesson.id === nextId;
					const future =
						nextId !== null &&
						lesson.status === "upcoming" &&
						!isNext &&
						lesson.date != null &&
						lesson.date > todayISO;
					const status = LESSON_STATUS[lesson.status] ?? {
						label: lesson.status,
						variant: "outline" as const,
						badgeClass: "text-muted-foreground",
					};
					const Dot =
						lesson.status === "completed"
							? Check
							: lesson.status === "absent" || lesson.status === "cancelled"
								? X
								: CircleDashed;

					return (
						<li
							key={lesson.id}
							aria-current={isNext ? "true" : undefined}
							className={cn(
								"relative grid grid-cols-[2rem_1fr] gap-4 pb-5 last:pb-0",
								future && "opacity-60",
							)}
						>
							{i < lessons.length - 1 && (
								<span
									aria-hidden="true"
									className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
								/>
							)}
							<span
								aria-hidden="true"
								className={cn(
									"relative z-10 grid size-8 place-items-center rounded-full border",
									lesson.status === "completed" &&
										"border-primary bg-primary text-primary-foreground",
									lesson.status === "absent" &&
										"border-destructive bg-destructive text-white",
									lesson.status === "cancelled" &&
										"bg-muted text-muted-foreground",
									lesson.status !== "completed" &&
										lesson.status !== "absent" &&
										lesson.status !== "cancelled" &&
										"bg-background text-muted-foreground",
									isNext && "text-foreground ring-[3px] ring-ring/30",
								)}
							>
								<Dot className="size-4" />
							</span>
							<div
								className={cn(
									"flex flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-1",
									isNext && "-mt-1 rounded-lg border bg-muted/40 p-3",
								)}
							>
								<div className="min-w-0">
									<div className="text-muted-foreground text-xs tabular-nums">
										Buổi {i + 1} · {lessonDayLabel(lesson)} · {lesson.time} ·{" "}
										{lesson.dur} phút
									</div>
									{lesson.topic && (
										<div
											className={cn(
												"font-medium",
												lesson.status === "cancelled" &&
													"text-muted-foreground line-through",
											)}
										>
											{lesson.topic}
										</div>
									)}
								</div>
								{isNext ? (
									<Badge variant="default">Buổi tới</Badge>
								) : (
									<Badge variant={status.variant} className={status.badgeClass}>
										{status.label}
									</Badge>
								)}
							</div>
						</li>
					);
				})}
			</ol>
		</div>
	);
}
