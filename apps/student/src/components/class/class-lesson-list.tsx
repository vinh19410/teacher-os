import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { Check, CircleDashed, Clock, X } from "lucide-react";
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
	// Buổi `upcoming` đã qua giờ kết thúc (chưa ai check-in) — suy ra ở render.
	ended: {
		label: "Đã kết thúc",
		variant: "outline",
		badgeClass: "text-muted-foreground",
	},
};

export function lessonDayLabel(lesson: StudentClassLesson): string {
	if (lesson.date) return formatVietnamDateFromISO(lesson.date);
	// `lesson.day`: Monday = 1 … Sunday = 7 → `% 7` khớp index getUTCDay.
	return VI_DAY_NAMES[lesson.day % 7] ?? "";
}

/** Buổi `upcoming` đã qua thời điểm kết thúc (ngày + giờ bắt đầu + thời lượng,
 * giờ Việt Nam UTC+7) mặc dù chưa có ai check-in. Chỉ suy luận hiển thị phía
 * client; `now` được tiêm vào để test xác định, không đọc `Date` ngầm. */
export function isLessonEnded(lesson: StudentClassLesson, now: Date): boolean {
	if (lesson.status !== "upcoming" || lesson.date == null) return false;
	const end = new Date(`${lesson.date}T${lesson.time}:00+07:00`).getTime();
	if (Number.isNaN(end)) return false;
	return end + lesson.dur * 60_000 <= now.getTime();
}

/** Buổi tới = buổi `upcoming` chưa kết thúc, có ngày đầu tiên từ hôm nay trở
 * đi. Lớp legacy (`date` null) không có ngày cụ thể nên không highlight;
 * buổi hôm nay đã qua giờ kết thúc cũng bị bỏ qua (#393). */
export function findNextLessonId(
	lessons: StudentClassLesson[],
	todayISO: string,
	now: Date,
): string | null {
	const next = lessons.find(
		(l) =>
			l.status === "upcoming" &&
			l.date != null &&
			l.date >= todayISO &&
			!isLessonEnded(l, now),
	);
	return next?.id ?? null;
}

export function ClassLessonList({
	lessons,
	todayISO,
	now,
}: {
	lessons: StudentClassLesson[];
	todayISO: string;
	now: Date;
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

	const nextId = findNextLessonId(lessons, todayISO, now);

	return (
		<div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
			<ol className="relative">
				{lessons.map((lesson, i) => {
					const isNext = lesson.id === nextId;
					const displayStatus = isLessonEnded(lesson, now)
						? "ended"
						: lesson.status;
					const future =
						nextId !== null &&
						displayStatus === "upcoming" &&
						!isNext &&
						lesson.date != null &&
						lesson.date > todayISO;
					const status = LESSON_STATUS[displayStatus] ?? {
						label: displayStatus,
						variant: "outline" as const,
						badgeClass: "text-muted-foreground",
					};
					const Dot =
						displayStatus === "completed"
							? Check
							: displayStatus === "absent" || displayStatus === "cancelled"
								? X
								: displayStatus === "ended"
									? Clock
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
									displayStatus === "completed" &&
										"border-primary bg-primary text-primary-foreground",
									displayStatus === "absent" &&
										"border-destructive bg-destructive text-white",
									(displayStatus === "cancelled" ||
										displayStatus === "ended") &&
										"bg-muted text-muted-foreground",
									displayStatus !== "completed" &&
										displayStatus !== "absent" &&
										displayStatus !== "cancelled" &&
										displayStatus !== "ended" &&
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
