import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { Clock } from "lucide-react";
import {
	formatSessionCountdown,
	formatZoomOpenAtLabel,
} from "@/components/class/class-detail-helpers";
import { lessonDayLabel } from "@/components/class/class-lesson-list";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { cn } from "@/lib/cn";

export interface JourneyNextStopHeroProps {
	classId: string;
	nextLesson: StudentClassLesson | null;
	nextTeachingIndex: number | null;
	isPaused: boolean;
	hasDatedLessons: boolean;
	heldCount: number;
	todayISO: string;
	now: Date;
	/** Chỉ truyền xuống ZoomJoinButton — không gán `now.getTime()` để giữ đồng hồ live. */
	zoomNowMs?: number;
	onLocate: () => void;
}

export function JourneyNextStopHero({
	classId,
	nextLesson,
	nextTeachingIndex,
	isPaused,
	hasDatedLessons,
	heldCount,
	todayISO,
	now,
	zoomNowMs,
	onLocate,
}: JourneyNextStopHeroProps) {
	if (isPaused) return null;

	if (!nextLesson) {
		if (!hasDatedLessons || heldCount <= 0) return null;
		return (
			<div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
				<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Hoàn thành
				</p>
				<p className="mt-1 font-semibold text-foreground text-lg tracking-tight">
					Bạn đã đi hết lộ trình — chúc thi tốt!
				</p>
			</div>
		);
	}

	const displayNowMs = zoomNowMs ?? now.getTime();
	const nextTitle =
		nextLesson.topic?.trim() ||
		nextLesson.syllabusTitle?.trim() ||
		(nextTeachingIndex !== null ? `Buổi ${nextTeachingIndex}` : "Buổi học tới");
	const countdown = formatSessionCountdown(
		nextLesson.date,
		nextLesson.time,
		nextLesson.dur,
		displayNowMs,
	);
	const showZoomLink = Boolean(nextLesson.hasZoom ?? nextLesson.joinUrl);
	const openAtLabel = showZoomLink
		? formatZoomOpenAtLabel({
				date: nextLesson.date,
				time: nextLesson.time,
				dur: nextLesson.dur,
				todayISO,
				nowMs: displayNowMs,
			})
		: null;

	return (
		<div
			data-testid="journey-next-hero"
			className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-[1.5px] border-primary bg-card p-4 text-card-foreground shadow-sm sm:p-6"
		>
			<div className="min-w-0 flex-1 basis-[240px]">
				<p className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					Buổi tiếp theo
				</p>
				<p className="mt-1 break-words font-semibold text-foreground text-lg tracking-tight">
					{nextTitle}
				</p>
				<p className="mt-0.5 text-muted-foreground text-sm tabular-nums">
					{nextTeachingIndex !== null ? `Buổi ${nextTeachingIndex} · ` : ""}
					{lessonDayLabel(nextLesson)} · {nextLesson.time} · {nextLesson.dur}{" "}
					phút
				</p>
				{countdown && (
					<p className="mt-2 inline-flex items-center gap-1.5 font-medium text-foreground text-sm tabular-nums">
						<Clock
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<span>{countdown}</span>
					</p>
				)}
			</div>

			<div className="flex w-full flex-wrap items-start gap-2 sm:w-auto sm:items-center sm:justify-end">
				<button
					type="button"
					onClick={onLocate}
					className={cn(
						buttonVariants({ variant: "outline", size: "default" }),
						"cursor-pointer",
					)}
				>
					Chuẩn bị bài
				</button>
				{showZoomLink && (
					<div className="flex flex-col items-start gap-1 sm:items-end">
						<ZoomJoinButton
							classId={classId}
							date={nextLesson.date}
							time={nextLesson.time}
							dur={nextLesson.dur}
							variant="default"
							size="default"
							nowMs={zoomNowMs}
						/>
						{openAtLabel && (
							<span className="text-muted-foreground text-xs tabular-nums">
								Mở lúc {openAtLabel} (trước 30 phút)
							</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
