import {
	RECORDING_RETENTION_DAYS,
	type StudentClassLesson,
} from "@teacher-os/api/contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import {
	formatRecordingExpiryVN,
	RecordingPlayerModal,
} from "@teacher-os/ui/components/recording-player-modal";
import { Check, CircleDashed, Clock, PlayCircle, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { LessonMaterialsDisclosure } from "@/components/class/lesson-materials";
import { RecordingPassword } from "@/components/class/recording-password";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
	getActiveStudentOrgId,
	studentSessionRecordingVideoUrl,
} from "@/lib/repos/student";
import { subscribeActiveStudentOrg } from "@/lib/student-org-storage";
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
	// TOS-11: buổi gốc bị Lịch nghỉ chung dời — "Nghỉ lễ — Đã dời lịch".
	holiday: {
		label: "Nghỉ lễ — Đã dời lịch",
		variant: "outline",
		badgeClass: "text-amber-600 dark:text-amber-400",
	},
	// Buổi `upcoming` đã qua giờ kết thúc (chưa ai check-in) — suy ra ở render.
	ended: {
		label: "Đã kết thúc",
		variant: "outline",
		badgeClass: "text-muted-foreground",
	},
	paused_upcoming: {
		label: "Tạm hoãn",
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
 * giờ Việt Nam UTC+7) mặc dù chưa có ai check-in. Toán học end-time dùng chung
 * `vietnamSessionEndMs` (server `loadNextSession` #395 cùng nguồn); policy
 * hiển thị (chỉ áp cho `upcoming`, fallback không đoán) là của client. `now`
 * được tiêm vào để test xác định, không đọc `Date` ngầm. */
export function isLessonEnded(lesson: StudentClassLesson, now: Date): boolean {
	if (lesson.status !== "upcoming" || lesson.date == null) return false;
	const end = vietnamSessionEndMs(lesson.date, lesson.time, lesson.dur);
	if (end == null) return false;
	return end <= now.getTime();
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
	classId,
	isPaused = false,
	lessons,
	todayISO,
	now,
	zoomNowMs,
}: {
	classId: string;
	isPaused?: boolean;
	lessons: StudentClassLesson[];
	todayISO: string;
	now: Date;
	/** Chỉ dùng trong unit test để cố định đồng hồ cục bộ cho ZoomJoinButton. */
	zoomNowMs?: number;
}) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const [activeRecording, setActiveRecording] = useState<{
		date: string;
		title: string;
		subtitle: string;
		expiresAt: string | null;
	} | null>(null);

	if (lessons.length === 0) {
		return (
			<OverviewEmptyState
				icon="calendar"
				title="Chưa có buổi học"
				description="Giáo viên chưa xếp lịch buổi học cho lớp này."
			/>
		);
	}

	const nextId = isPaused ? null : findNextLessonId(lessons, todayISO, now);

	return (
		<div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
			<ol className="relative">
				{lessons.map((lesson, i) => {
					const isNext = lesson.id === nextId;
					const isEnded = isLessonEnded(lesson, now);
					const displayStatus =
						isPaused && lesson.status === "upcoming"
							? "paused_upcoming"
							: isEnded
								? "ended"
								: lesson.status;
					const showZoomLink =
						displayStatus === "upcoming" &&
						Boolean(lesson.hasZoom ?? lesson.joinUrl);
					const canShowRecording =
						lesson.status !== "cancelled" && lesson.status !== "holiday";
					const hasR2Video =
						canShowRecording &&
						lesson.date != null &&
						Boolean(lesson.hasRecordingVideo) &&
						lesson.recordingStatus !== "expired";
					const showExternalRecordingLink =
						canShowRecording && !hasR2Video && Boolean(lesson.recordingUrl);
					const showExpiredRecording =
						canShowRecording &&
						!hasR2Video &&
						!lesson.recordingUrl &&
						lesson.recordingStatus === "expired";
					const showPendingRecording =
						!hasR2Video &&
						!lesson.recordingUrl &&
						lesson.recordingStatus === "pending" &&
						(isEnded ||
							lesson.status === "completed" ||
							lesson.status === "absent");
					const recordingExpiryLabel = hasR2Video
						? formatRecordingExpiryVN(lesson.recordingExpiresAt)
						: null;
					const hasActions =
						showZoomLink ||
						hasR2Video ||
						showExternalRecordingLink ||
						showExpiredRecording ||
						showPendingRecording;
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
								"relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-5 last:pb-0",
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
										displayStatus === "ended" ||
										displayStatus === "paused_upcoming") &&
										"bg-muted text-muted-foreground",
									displayStatus !== "completed" &&
										displayStatus !== "absent" &&
										displayStatus !== "cancelled" &&
										displayStatus !== "ended" &&
										displayStatus !== "paused_upcoming" &&
										"bg-background text-muted-foreground",
									isNext && "text-foreground ring-[3px] ring-ring/30",
								)}
							>
								<Dot className="size-4" />
							</span>
							<div
								className={cn(
									"flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 pt-1",
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
								{hasActions && (
									<div className="mt-2 flex w-full min-w-0 flex-wrap items-center gap-2">
										{showZoomLink && (
											<ZoomJoinButton
												classId={classId}
												date={lesson.date}
												time={lesson.time}
												dur={lesson.dur}
												variant={isNext ? "default" : "outline"}
												size="sm"
												className="max-w-full"
												nowMs={zoomNowMs}
											/>
										)}
										{hasR2Video && lesson.date && (
											<button
												type="button"
												onClick={() => {
													if (!lesson.date) return;
													setActiveRecording({
														date: lesson.date,
														title: lesson.topic
															? `Recording — ${lesson.topic}`
															: `Recording buổi ${i + 1}`,
														subtitle: `Buổi ${i + 1} · ${lessonDayLabel(lesson)} · ${lesson.time}`,
														expiresAt: lesson.recordingExpiresAt ?? null,
													});
												}}
												className={cn(
													buttonVariants({
														variant: "outline",
														size: "sm",
													}),
													"max-w-full whitespace-normal text-center focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
												)}
											>
												<PlayCircle aria-hidden="true" className="size-3.5" />
												Xem recording
											</button>
										)}
										{hasR2Video && recordingExpiryLabel && (
											<span className="text-muted-foreground text-xs tabular-nums">
												Lưu đến {recordingExpiryLabel}
											</span>
										)}
										{showExternalRecordingLink && lesson.recordingUrl && (
											<a
												href={lesson.recordingUrl}
												target="_blank"
												rel="noopener noreferrer"
												className={cn(
													buttonVariants({
														variant: "outline",
														size: "sm",
													}),
													"max-w-full whitespace-normal text-center focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
												)}
											>
												<PlayCircle aria-hidden="true" className="size-3.5" />
												Xem recording
											</a>
										)}
										{showExternalRecordingLink &&
											lesson.recordingUrl &&
											lesson.recordingPassword && (
												<RecordingPassword
													password={lesson.recordingPassword}
												/>
											)}
										{showExpiredRecording && (
											<Badge
												variant="outline"
												className="text-muted-foreground"
											>
												Recording đã hết hạn ({RECORDING_RETENTION_DAYS} ngày)
											</Badge>
										)}
										{showPendingRecording && (
											<Badge
												variant="outline"
												className="text-muted-foreground"
											>
												<Clock aria-hidden="true" className="size-3" />
												Đang chờ recording
											</Badge>
										)}
									</div>
								)}
								{lesson.date != null &&
									lesson.status !== "holiday" &&
									lesson.status !== "cancelled" && (
										<LessonMaterialsDisclosure
											classId={classId}
											date={lesson.date}
										/>
									)}
							</div>
						</li>
					);
				})}
			</ol>
			{activeRecording !== null && (
				<RecordingPlayerModal
					open={true}
					onClose={() => setActiveRecording(null)}
					title={activeRecording.title}
					subtitle={activeRecording.subtitle}
					videoUrl={studentSessionRecordingVideoUrl(
						classId,
						activeRecording.date,
					)}
					expiresAt={activeRecording.expiresAt}
				/>
			)}
		</div>
	);
}
