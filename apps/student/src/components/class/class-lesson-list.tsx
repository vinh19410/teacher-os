import { Link } from "@tanstack/react-router";
import {
	RECORDING_RETENTION_DAYS,
	type StudentClassLesson,
	type StudentClassSyllabusSummary,
} from "@teacher-os/api/contracts";
import { isSafeMaterialUrl } from "@teacher-os/api/material-contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { buttonVariants } from "@teacher-os/ui/components/button";
import {
	formatRecordingExpiryVN,
	RecordingPlayerModal,
} from "@teacher-os/ui/components/recording-player-modal";
import {
	BookOpen,
	Check,
	ChevronRight,
	CircleDashed,
	ClipboardList,
	Clock,
	PlayCircle,
	X,
} from "lucide-react";
import { useState, useSyncExternalStore } from "react";
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

export const LESSON_STATUS: Record<
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

interface IndexedLesson {
	lesson: StudentClassLesson;
	/** 1-based teaching session index skipping holiday rows (khớp GET /sessions/:date và TOS-11 I4). */
	teachingIndex: number | null;
}

function buildIndexedLessons(lessons: StudentClassLesson[]): IndexedLesson[] {
	let teachingIndex = 0;
	return lessons.map((lesson) => {
		if (lesson.status === "holiday") {
			return { lesson, teachingIndex: null };
		}
		teachingIndex += 1;
		return { lesson, teachingIndex };
	});
}

interface ModuleGroup {
	id: string;
	title: string;
	description?: string;
	items: IndexedLesson[];
	completedCount: number;
	teachingCount: number;
}

/**
 * Nhóm 100% buổi học theo Module giáo trình khi có `syllabus` và ít nhất 1 buổi
 * có `moduleId`. Buổi `holiday` (không có `moduleId`) bám theo module của buổi
 * học liền kề để giữ nguyên trình tự thời gian và KHÔNG tính vào mẫu số tiến độ.
 * Buổi vượt quá số tiết giáo trình vào cụm "Buổi học bổ sung" ở cuối.
 */
function groupLessonsByModules(
	lessons: StudentClassLesson[],
	syllabus: StudentClassSyllabusSummary,
): ModuleGroup[] {
	const moduleIds = new Set(syllabus.modules.map((m) => m.id));
	const buckets = new Map<string, IndexedLesson[]>();
	for (const mod of syllabus.modules) {
		buckets.set(mod.id, []);
	}
	const extra: IndexedLesson[] = [];

	// Tìm module mục tiêu gần nhất cho buổi holiday
	const findAdjacentModuleId = (idx: number): string | null => {
		for (let back = idx - 1; back >= 0; back -= 1) {
			const mid = lessons[back]?.moduleId;
			if (mid && moduleIds.has(mid)) return mid;
		}
		for (let fwd = idx + 1; fwd < lessons.length; fwd += 1) {
			const mid = lessons[fwd]?.moduleId;
			if (mid && moduleIds.has(mid)) return mid;
		}
		return syllabus.modules[0]?.id ?? null;
	};

	const indexed = buildIndexedLessons(lessons);
	for (let i = 0; i < indexed.length; i += 1) {
		const entry = indexed[i];
		if (!entry) continue;
		const item = entry.lesson;
		if (item.moduleId && moduleIds.has(item.moduleId)) {
			buckets.get(item.moduleId)?.push(entry);
		} else if (item.status === "holiday") {
			const targetModId = findAdjacentModuleId(i);
			if (targetModId && buckets.has(targetModId)) {
				buckets.get(targetModId)?.push(entry);
			} else {
				extra.push(entry);
			}
		} else {
			extra.push(entry);
		}
	}

	const groups: ModuleGroup[] = [];
	for (const mod of syllabus.modules) {
		const items = buckets.get(mod.id) ?? [];
		if (items.length === 0) continue;
		const teaching = items.filter((e) => e.lesson.status !== "holiday");
		const completed = teaching.filter(
			(e) => e.lesson.status === "completed",
		).length;
		groups.push({
			id: mod.id,
			title: mod.title,
			description: mod.description,
			items,
			completedCount: completed,
			teachingCount: teaching.length,
		});
	}

	if (extra.length > 0) {
		const teaching = extra.filter((e) => e.lesson.status !== "holiday");
		const completed = teaching.filter(
			(e) => e.lesson.status === "completed",
		).length;
		groups.push({
			id: "__extra__",
			title: "Buổi học bổ sung",
			items: extra,
			completedCount: completed,
			teachingCount: teaching.length,
		});
	}

	return groups;
}

interface ActiveRecording {
	date: string;
	title: string;
	subtitle: string;
	expiresAt: string | null;
}

function LessonRow({
	classId,
	entry,
	isLastInList,
	isPaused,
	nextId,
	todayISO,
	now,
	zoomNowMs,
	onOpenRecording,
}: {
	classId: string;
	entry: IndexedLesson;
	isLastInList: boolean;
	isPaused: boolean;
	nextId: string | null;
	todayISO: string;
	now: Date;
	zoomNowMs?: number;
	onOpenRecording: (recording: ActiveRecording) => void;
}) {
	const { lesson, teachingIndex } = entry;
	const isNext = lesson.id === nextId;
	const isEnded = isLessonEnded(lesson, now);
	const displayStatus =
		isPaused && lesson.status === "upcoming"
			? "paused_upcoming"
			: isEnded
				? "ended"
				: lesson.status;
	const showZoomLink =
		displayStatus === "upcoming" && Boolean(lesson.hasZoom ?? lesson.joinUrl);
	const canShowRecording =
		lesson.status !== "cancelled" && lesson.status !== "holiday";
	const hasR2Video =
		canShowRecording &&
		lesson.date != null &&
		Boolean(lesson.hasRecordingVideo) &&
		lesson.recordingStatus !== "expired";
	const safeRecordingUrl =
		canShowRecording &&
		!hasR2Video &&
		lesson.recordingStatus !== "expired" &&
		lesson.recordingUrl &&
		isSafeMaterialUrl(lesson.recordingUrl)
			? lesson.recordingUrl
			: null;
	const showRecordingLink = safeRecordingUrl !== null;
	const showExpiredRecording =
		canShowRecording &&
		!hasR2Video &&
		!safeRecordingUrl &&
		lesson.recordingStatus === "expired";
	const showPendingRecording =
		!hasR2Video &&
		!safeRecordingUrl &&
		!showExpiredRecording &&
		lesson.recordingStatus === "pending" &&
		(isEnded || lesson.status === "completed" || lesson.status === "absent");
	const recordingExpiryLabel = hasR2Video
		? formatRecordingExpiryVN(lesson.recordingExpiresAt)
		: null;
	const hasActions =
		showZoomLink ||
		hasR2Video ||
		showRecordingLink ||
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

	const isClickable = lesson.date != null && lesson.status !== "holiday";
	const primaryTitle =
		lesson.topic?.trim() || lesson.syllabusTitle?.trim() || "";
	const secondarySyllabusTitle =
		lesson.topic?.trim() &&
		lesson.syllabusTitle?.trim() &&
		lesson.topic.trim() !== lesson.syllabusTitle.trim()
			? lesson.syllabusTitle.trim()
			: null;
	const lectureCount =
		lesson.status !== "cancelled" && lesson.status !== "holiday"
			? (lesson.lectureCount ?? 0)
			: 0;
	const homeworkFileCount =
		lesson.status !== "cancelled" && lesson.status !== "holiday"
			? (lesson.homeworkCount ?? 0)
			: 0;
	const assignmentCount =
		lesson.status !== "holiday" ? (lesson.assignmentCount ?? 0) : 0;
	const homeworkTotal = homeworkFileCount + assignmentCount;

	return (
		<li
			aria-current={isNext ? "true" : undefined}
			className={cn(
				"relative grid grid-cols-[2rem_minmax(0,1fr)] gap-4 pb-5 last:pb-0",
				future && "opacity-60",
			)}
		>
			{!isLastInList && (
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
					"group relative -mt-1 -ml-1 flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1.5 rounded-lg p-3 transition-colors",
					isNext
						? "border bg-muted/40"
						: isClickable
							? "border border-transparent hover:border-border hover:bg-muted/30"
							: "px-1 py-1",
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
						<span>
							{teachingIndex !== null ? `Buổi ${teachingIndex} · ` : ""}
							{lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur} phút
						</span>
						{lesson.lessonKind === "midterm" && (
							<Badge variant="outline" className="text-[11px]">
								Giữa kỳ
							</Badge>
						)}
						{lesson.lessonKind === "final" && (
							<Badge variant="outline" className="text-[11px]">
								Cuối kỳ
							</Badge>
						)}
					</div>

					{isClickable && lesson.date ? (
						<Link
							to="/classes/$classId/sessions/$date"
							params={{ classId, date: lesson.date }}
							data-testid={`session-link-${lesson.date}`}
							className={cn(
								"mt-0.5 inline-block max-w-full rounded-sm font-medium text-foreground text-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:shadow-[var(--focus-ring)] group-hover:text-primary",
								lesson.status === "cancelled" &&
									"text-muted-foreground line-through",
							)}
						>
							{primaryTitle ||
								(teachingIndex !== null
									? `Buổi ${teachingIndex} · Xem chi tiết`
									: "Xem chi tiết buổi học")}
						</Link>
					) : primaryTitle ? (
						<div
							className={cn(
								"mt-0.5 font-medium text-sm",
								lesson.status === "cancelled" &&
									"text-muted-foreground line-through",
							)}
						>
							{primaryTitle}
						</div>
					) : null}

					{secondarySyllabusTitle && (
						<p className="mt-0.5 truncate text-muted-foreground text-xs">
							{secondarySyllabusTitle}
						</p>
					)}

					{(lectureCount > 0 || homeworkTotal > 0) && (
						<div className="mt-1.5 flex flex-wrap items-center gap-2 text-muted-foreground text-xs tabular-nums">
							{lectureCount > 0 && (
								<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
									<BookOpen aria-hidden="true" className="size-3" />
									{lectureCount} bài giảng
								</span>
							)}
							{homeworkTotal > 0 && (
								<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
									<ClipboardList aria-hidden="true" className="size-3" />
									{homeworkTotal} bài tập
								</span>
							)}
						</div>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1.5">
					{isNext ? (
						<Badge variant="default">Buổi tới</Badge>
					) : (
						<Badge variant={status.variant} className={status.badgeClass}>
							{status.label}
						</Badge>
					)}
					{isClickable && (
						<ChevronRight
							aria-hidden="true"
							className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					)}
				</div>

				{hasActions && (
					<div className="relative z-10 mt-1.5 flex w-full min-w-0 flex-wrap items-center gap-2">
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
									const sessionLabel =
										teachingIndex !== null
											? `Buổi ${teachingIndex}`
											: "Buổi học";
									onOpenRecording({
										date: lesson.date,
										title: primaryTitle
											? `Recording — ${primaryTitle}`
											: `Recording ${sessionLabel.toLowerCase()}`,
										subtitle: `${sessionLabel} · ${lessonDayLabel(lesson)} · ${lesson.time}`,
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
						{showRecordingLink && safeRecordingUrl && (
							<a
								href={safeRecordingUrl}
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
						{showRecordingLink &&
							safeRecordingUrl &&
							lesson.recordingPassword && (
								<RecordingPassword password={lesson.recordingPassword} />
							)}
						{showExpiredRecording && (
							<Badge variant="outline" className="text-muted-foreground">
								Recording đã hết hạn ({RECORDING_RETENTION_DAYS} ngày)
							</Badge>
						)}
						{showPendingRecording && (
							<Badge variant="outline" className="text-muted-foreground">
								<Clock aria-hidden="true" className="size-3" />
								Đang chờ recording
							</Badge>
						)}
					</div>
				)}
			</div>
		</li>
	);
}

export function ClassLessonList({
	classId,
	isPaused = false,
	lessons,
	syllabus,
	todayISO,
	now,
	zoomNowMs,
}: {
	classId: string;
	isPaused?: boolean;
	lessons: StudentClassLesson[];
	syllabus?: StudentClassSyllabusSummary | null;
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
	const [activeRecording, setActiveRecording] =
		useState<ActiveRecording | null>(null);
	const recordingModal = activeRecording !== null && (
		<RecordingPlayerModal
			open={true}
			onClose={() => setActiveRecording(null)}
			title={activeRecording.title}
			subtitle={activeRecording.subtitle}
			videoUrl={studentSessionRecordingVideoUrl(classId, activeRecording.date)}
			expiresAt={activeRecording.expiresAt}
		/>
	);

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
	const useModuleGrouping = Boolean(
		syllabus &&
			syllabus.modules.length > 0 &&
			lessons.some((l) => Boolean(l.moduleId)),
	);

	if (useModuleGrouping && syllabus) {
		const groups = groupLessonsByModules(lessons, syllabus);
		const totalTeaching = lessons.filter((l) => l.status !== "holiday").length;
		const totalCompleted = lessons.filter(
			(l) => l.status === "completed",
		).length;
		const pct =
			totalTeaching > 0
				? Math.round((totalCompleted / totalTeaching) * 100)
				: 0;

		return (
			<div className="space-y-4">
				<div
					data-testid="journey-syllabus-header"
					className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm"
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="min-w-0">
							<p className="font-semibold text-base text-foreground tracking-tight">
								{syllabus.name}
							</p>
							{syllabus.description && (
								<p className="mt-0.5 text-muted-foreground text-xs">
									{syllabus.description}
								</p>
							)}
						</div>
						<span className="shrink-0 font-medium text-muted-foreground text-xs tabular-nums">
							{totalCompleted}/{totalTeaching} buổi ({pct}%)
						</span>
					</div>
					<div
						aria-hidden="true"
						className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
					>
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{ width: `${pct}%` }}
						/>
					</div>
				</div>

				{groups.map((group) => {
					const moduleDone =
						group.teachingCount > 0 &&
						group.completedCount >= group.teachingCount;
					return (
						<section
							key={group.id}
							aria-label={group.title}
							data-testid={`journey-module-${group.id}`}
							className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
						>
							<div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b pb-3">
								<div className="flex min-w-0 items-center gap-2.5">
									{moduleDone ? (
										<span
											aria-hidden="true"
											className="grid size-5 flex-none place-items-center rounded-full bg-primary text-primary-foreground"
										>
											<Check className="size-3" />
										</span>
									) : (
										<CircleDashed
											aria-hidden="true"
											className="size-5 flex-none text-muted-foreground"
										/>
									)}
									<div className="min-w-0">
										<h3 className="font-semibold text-foreground text-sm tracking-tight">
											{group.title}
										</h3>
										{group.description && (
											<p className="mt-0.5 text-muted-foreground text-xs">
												{group.description}
											</p>
										)}
									</div>
								</div>
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{group.completedCount}/{group.teachingCount} buổi
								</span>
							</div>

							<ol className="relative">
								{group.items.map((entry, idx) => (
									<LessonRow
										key={entry.lesson.id}
										classId={classId}
										entry={entry}
										isLastInList={idx === group.items.length - 1}
										isPaused={isPaused}
										nextId={nextId}
										todayISO={todayISO}
										now={now}
										zoomNowMs={zoomNowMs}
										onOpenRecording={setActiveRecording}
									/>
								))}
							</ol>
						</section>
					);
				})}
				{recordingModal}
			</div>
		);
	}

	const flatEntries = buildIndexedLessons(lessons);

	return (
		<div className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
			<ol className="relative">
				{flatEntries.map((entry, i) => (
					<LessonRow
						key={entry.lesson.id}
						classId={classId}
						entry={entry}
						isLastInList={i === flatEntries.length - 1}
						isPaused={isPaused}
						nextId={nextId}
						todayISO={todayISO}
						now={now}
						zoomNowMs={zoomNowMs}
						onOpenRecording={setActiveRecording}
					/>
				))}
			</ol>
			{recordingModal}
		</div>
	);
}
