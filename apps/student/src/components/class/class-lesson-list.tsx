import { Link } from "@tanstack/react-router";
import {
	RECORDING_RETENTION_DAYS,
	type StudentAssignment,
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
	AlertCircle,
	BookOpen,
	CalendarOff,
	Check,
	ChevronDown,
	ChevronRight,
	CircleDashed,
	ClipboardList,
	Clock,
	Crosshair,
	Flag,
	Mountain,
	Pause,
	PlayCircle,
	X,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	type JourneyFilter,
	prefersReducedMotion,
	scrollElementToCenterAndFocus,
} from "@/components/class/class-detail-helpers";
import { JourneyNextStopHero } from "@/components/class/journey-next-stop-hero";
import { RecordingPassword } from "@/components/class/recording-password";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { deriveAssignmentStatus } from "@/lib/assignment-status";
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

/** Override tone nội bộ cho badge trong Hành trình học (tránh làm đổi SessionDetailView). */
const JOURNEY_BADGE_TONE: Partial<
	Record<string, { variant: BadgeVariant; badgeClass: string }>
> = {
	completed: {
		variant: "outline",
		badgeClass: "border-success/30 bg-success-soft text-success",
	},
	absent: {
		variant: "outline",
		badgeClass: "border-warn/30 bg-warn-soft text-warn",
	},
	holiday: {
		variant: "outline",
		badgeClass: "border-dashed text-warn",
	},
};

const JOURNEY_FILTER_OPTIONS: readonly { id: JourneyFilter; label: string }[] =
	[
		{ id: "all", label: "Tất cả" },
		{ id: "done", label: "Đã đi qua" },
		{ id: "ahead", label: "Phía trước" },
	];

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

type RailPosition = "before" | "pivot" | "after";

interface IndexedLesson {
	lesson: StudentClassLesson;
	/** 1-based teaching session index skipping holiday rows (khớp GET /sessions/:date và TOS-11 I4). */
	teachingIndex: number | null;
	railPosition: RailPosition;
}

interface ActiveRecording {
	date: string;
	title: string;
	subtitle: string;
	expiresAt: string | null;
}

function resolveRailPosition(
	lesson: StudentClassLesson,
	idx: number,
	pivotIndex: number,
	hasHeldAny: boolean,
	isPaused: boolean,
): RailPosition {
	if (isPaused && lesson.status === "upcoming") return "after";
	if (pivotIndex === -1) return hasHeldAny ? "before" : "after";
	if (idx < pivotIndex) return "before";
	if (idx === pivotIndex) return "pivot";
	return "after";
}

function buildIndexedLessons(
	lessons: StudentClassLesson[],
	nextId: string | null,
	hasHeldAny: boolean,
	isPaused: boolean,
): IndexedLesson[] {
	const pivotIndex =
		nextId !== null ? lessons.findIndex((l) => l.id === nextId) : -1;
	let teachingIndex = 0;
	return lessons.map((lesson, idx) => {
		const railPosition = resolveRailPosition(
			lesson,
			idx,
			pivotIndex,
			hasHeldAny,
			isPaused,
		);
		if (lesson.status === "holiday") {
			return { lesson, teachingIndex: null, railPosition };
		}
		teachingIndex += 1;
		return { lesson, teachingIndex, railPosition };
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

function toModuleGroup(
	id: string,
	title: string,
	items: IndexedLesson[],
	description?: string,
): ModuleGroup {
	let teachingCount = 0;
	let completedCount = 0;
	for (const { lesson } of items) {
		if (lesson.status === "holiday") continue;
		teachingCount += 1;
		if (lesson.status === "completed") {
			completedCount += 1;
		}
	}
	return {
		id,
		title,
		description,
		items,
		completedCount,
		teachingCount,
	};
}

/**
 * Nhóm 100% buổi học theo Module giáo trình khi có `syllabus` và ít nhất 1 buổi
 * có `moduleId`. Buổi `holiday` (không có `moduleId`) bám theo module của buổi
 * học liền kề để giữ nguyên trình tự thời gian và KHÔNG tính vào mẫu số tiến độ.
 * Buổi vượt quá số tiết giáo trình vào cụm "Buổi học bổ sung" ở cuối.
 */
function groupLessonsByModules(
	indexed: IndexedLesson[],
	syllabus: StudentClassSyllabusSummary,
): ModuleGroup[] {
	const moduleIds = new Set(syllabus.modules.map((m) => m.id));
	const buckets = new Map<string, IndexedLesson[]>();
	for (const mod of syllabus.modules) {
		buckets.set(mod.id, []);
	}
	const extra: IndexedLesson[] = [];

	const findAdjacentModuleId = (idx: number): string | null => {
		for (let back = idx - 1; back >= 0; back -= 1) {
			const mid = indexed[back]?.lesson.moduleId;
			if (mid && moduleIds.has(mid)) return mid;
		}
		for (let fwd = idx + 1; fwd < indexed.length; fwd += 1) {
			const mid = indexed[fwd]?.lesson.moduleId;
			if (mid && moduleIds.has(mid)) return mid;
		}
		return syllabus.modules[0]?.id ?? null;
	};

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
		groups.push(toModuleGroup(mod.id, mod.title, items, mod.description));
	}

	if (extra.length > 0) {
		groups.push(toModuleGroup("__extra__", "Buổi học bổ sung", extra));
	}

	return groups;
}

function getDisplayStatus(
	lesson: StudentClassLesson,
	isPaused: boolean,
	now: Date,
): string {
	if (isPaused && lesson.status === "upcoming") return "paused_upcoming";
	if (isLessonEnded(lesson, now)) return "ended";
	return lesson.status;
}

function matchesJourneyFilter(
	lesson: StudentClassLesson,
	filter: JourneyFilter,
	isPaused: boolean,
	now: Date,
): boolean {
	if (filter === "all") return true;
	if (lesson.status === "holiday") return false;
	const displayStatus = getDisplayStatus(lesson, isPaused, now);
	if (filter === "done") {
		return (
			displayStatus === "completed" ||
			displayStatus === "absent" ||
			displayStatus === "ended" ||
			displayStatus === "cancelled"
		);
	}
	return displayStatus === "upcoming" || displayStatus === "paused_upcoming";
}

function emptyDetailMessageForStatus(displayStatus: string): string {
	switch (displayStatus) {
		case "cancelled":
			return "Buổi học này đã được huỷ.";
		case "paused_upcoming":
			return "Buổi học đang tạm hoãn do lớp tạm dừng.";
		case "upcoming":
			return "Giáo viên sẽ đăng tài liệu chuẩn bị trước buổi học. Bạn sẽ thấy chúng tại đây.";
		default:
			return "Chưa có thông tin chi tiết cho buổi học này.";
	}
}

const STOP_NODE_BASE = "relative z-10 mt-2 grid size-8 place-items-center";
const NEXT_RING_CLASS =
	"ring-2 ring-primary/30 ring-offset-2 ring-offset-background";
const MUTED_CIRCLE_CLASS =
	"border border-border bg-muted text-muted-foreground";
const DETAIL_LABEL_CLASS =
	"font-semibold text-muted-foreground text-xs uppercase tracking-wider";

function midtermNodeTone(displayStatus: string, isAhead: boolean): string {
	if (displayStatus === "completed") {
		return "border-success bg-success text-primary-foreground";
	}
	if (displayStatus === "absent") {
		return "border-warn bg-background text-warn";
	}
	if (isAhead) {
		return "border-primary bg-background text-foreground";
	}
	return "border-primary bg-primary text-primary-foreground";
}

function circleNodeSpec(
	displayStatus: string,
	teachingIndex: number | null,
	isNext: boolean,
): { tone: string; content: ReactNode } {
	if (isNext) {
		return {
			tone: cn("border-2 border-primary bg-background", NEXT_RING_CLASS),
			content: <span className="size-2.5 rounded-full bg-primary" />,
		};
	}
	switch (displayStatus) {
		case "completed":
			return {
				tone: "border-2 border-primary bg-primary text-primary-foreground",
				content: <Check className="size-4" />,
			};
		case "absent":
			return {
				tone: "border-2 border-warn bg-background text-warn",
				content: <AlertCircle className="size-4" />,
			};
		case "holiday":
			return {
				tone: "border-2 border-input border-dashed bg-background text-muted-foreground",
				content: <CalendarOff className="size-3.5" />,
			};
		case "cancelled":
			return { tone: MUTED_CIRCLE_CLASS, content: <X className="size-4" /> };
		case "ended":
			return {
				tone: MUTED_CIRCLE_CLASS,
				content: <Clock className="size-4" />,
			};
		case "paused_upcoming":
			return {
				tone: MUTED_CIRCLE_CLASS,
				content: <Pause className="size-3.5" />,
			};
		default:
			return {
				tone: "border-2 border-input border-dashed bg-background font-semibold text-muted-foreground text-xs tabular-nums",
				content:
					teachingIndex !== null ? (
						teachingIndex
					) : (
						<CircleDashed className="size-4" />
					),
			};
	}
}

function renderStopNode({
	lesson,
	teachingIndex,
	displayStatus,
	isNext,
	isAhead,
}: {
	lesson: StudentClassLesson;
	teachingIndex: number | null;
	displayStatus: string;
	isNext: boolean;
	isAhead: boolean;
}) {
	if (lesson.lessonKind === "final") {
		return (
			<span
				aria-hidden="true"
				className={cn(
					STOP_NODE_BASE,
					"rounded-lg border-2",
					displayStatus === "completed"
						? "border-success bg-success text-primary-foreground"
						: "border-primary bg-primary text-primary-foreground",
					isNext && NEXT_RING_CLASS,
				)}
			>
				<Mountain className="size-4" />
			</span>
		);
	}

	if (lesson.lessonKind === "midterm") {
		return (
			<span
				aria-hidden="true"
				className={cn(
					"relative z-10 mt-2.5 ml-[3px] grid size-[26px] rotate-45 place-items-center rounded-sm border-2",
					midtermNodeTone(displayStatus, isAhead),
					isNext && NEXT_RING_CLASS,
				)}
			>
				<Flag className="size-3.5 -rotate-45" />
			</span>
		);
	}

	const { tone, content } = circleNodeSpec(
		displayStatus,
		teachingIndex,
		isNext,
	);
	return (
		<span
			aria-hidden="true"
			className={cn(STOP_NODE_BASE, "rounded-full", tone)}
		>
			{content}
		</span>
	);
}

function assignmentStatusTone(status: string): string {
	switch (status) {
		case "graded":
			return "border-success/30 bg-success-soft text-success";
		case "overdue":
			return "border-danger/30 bg-danger-soft text-danger";
		case "due-soon":
			return "border-warn/30 bg-warn-soft text-warn";
		default:
			return "text-muted-foreground";
	}
}

function LessonDetailPanel({
	classId,
	lesson,
	teachingIndex,
	primaryTitle,
	detailId,
	open,
	displayStatus,
	isNext,
	objectives,
	showZoomLink,
	hasR2Video,
	recordingExpiryLabel,
	safeRecordingUrl,
	showExpiredRecording,
	showPendingRecording,
	showSessionMaterialsBlock,
	matchedAssignments,
	todayISO,
	nowMs,
	zoomNowMs,
	onOpenRecording,
	onOpenAssignment,
}: {
	classId: string;
	lesson: StudentClassLesson;
	teachingIndex: number | null;
	primaryTitle: string;
	detailId: string;
	open: boolean;
	displayStatus: string;
	isNext: boolean;
	objectives: string;
	showZoomLink: boolean;
	hasR2Video: boolean;
	recordingExpiryLabel: string | null;
	safeRecordingUrl: string | null;
	showExpiredRecording: boolean;
	showPendingRecording: boolean;
	showSessionMaterialsBlock: boolean;
	matchedAssignments: StudentAssignment[];
	todayISO: string;
	nowMs: number;
	zoomNowMs?: number;
	onOpenRecording: (recording: ActiveRecording) => void;
	onOpenAssignment?: (assignmentId: string) => void;
}) {
	const hasRecordingBlock =
		hasR2Video ||
		safeRecordingUrl !== null ||
		showExpiredRecording ||
		showPendingRecording;
	const hasDetailContent =
		displayStatus === "absent" ||
		objectives.length > 0 ||
		showZoomLink ||
		hasRecordingBlock ||
		(showSessionMaterialsBlock && lesson.date != null) ||
		matchedAssignments.length > 0;

	return (
		<div
			id={detailId}
			hidden={!open}
			className="mt-2 space-y-4 rounded-lg border border-border/70 bg-muted/30 p-3.5 text-sm sm:p-4"
		>
			{open ? (
				<>
					{displayStatus === "absent" && (
						<p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-warn">
							<AlertCircle
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0"
							/>
							<span>
								Bạn vắng buổi này — xem lại recording và nộp bài tập để không bị
								hụt tiến độ.
							</span>
						</p>
					)}

					{objectives && (
						<div className="space-y-1">
							<p className={DETAIL_LABEL_CLASS}>Mục tiêu buổi học</p>
							<p className="whitespace-pre-line break-words text-foreground text-sm">
								{objectives}
							</p>
						</div>
					)}

					{showZoomLink &&
						(isNext ? (
							<p className="text-muted-foreground text-sm">
								Link vào lớp mở trước giờ học 30 phút, ngay trên thẻ “Buổi tiếp
								theo”.
							</p>
						) : (
							<div className="space-y-1.5">
								<p className={DETAIL_LABEL_CLASS}>Phòng học trực tuyến</p>
								<ZoomJoinButton
									classId={classId}
									date={lesson.date}
									time={lesson.time}
									dur={lesson.dur}
									variant="outline"
									size="sm"
									className="max-w-full"
									nowMs={zoomNowMs}
								/>
							</div>
						))}

					{hasRecordingBlock && (
						<div className="space-y-1.5">
							<p className={DETAIL_LABEL_CLASS}>Recording</p>
							<div className="flex flex-wrap items-center gap-2">
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
											"max-w-full cursor-pointer whitespace-normal text-center focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
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
								{safeRecordingUrl && (
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
								{safeRecordingUrl && lesson.recordingPassword && (
									<RecordingPassword password={lesson.recordingPassword} />
								)}
								{showExpiredRecording && (
									<Badge
										variant="outline"
										className="whitespace-normal text-left text-muted-foreground"
									>
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
						</div>
					)}

					{showSessionMaterialsBlock && lesson.date && (
						<div className="space-y-2">
							<p className={DETAIL_LABEL_CLASS}>
								{isNext || displayStatus === "upcoming"
									? "Tài liệu chuẩn bị"
									: "Tài liệu buổi học"}
							</p>
							<p className="text-muted-foreground text-sm">
								Xem đầy đủ tài liệu bài giảng và phiếu bài tập trên trang chi
								tiết buổi học.
							</p>
							<Link
								to="/classes/$classId/sessions/$date"
								params={{ classId, date: lesson.date }}
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"w-fit",
								)}
							>
								Mở trang buổi học
								<ChevronRight aria-hidden="true" className="size-3.5" />
							</Link>
						</div>
					)}

					{matchedAssignments.length > 0 && (
						<div className="space-y-2">
							<p className={DETAIL_LABEL_CLASS}>Bài tập gắn buổi</p>
							<div className="space-y-2">
								{matchedAssignments.map((item) => {
									const derived = deriveAssignmentStatus(item, todayISO, nowMs);
									return (
										<div
											key={item.id}
											className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
										>
											<div className="flex min-w-0 flex-1 basis-[160px] items-center gap-2">
												<ClipboardList
													aria-hidden="true"
													className="size-4 shrink-0 text-muted-foreground"
												/>
												<span className="min-w-0 break-words font-medium text-foreground text-sm">
													{item.title}
												</span>
											</div>
											<div className="flex max-w-full flex-wrap items-center gap-2">
												<Badge
													variant="outline"
													className={cn(
														"whitespace-normal text-left tabular-nums",
														assignmentStatusTone(derived.status),
													)}
												>
													{derived.statusLabel}
												</Badge>
												{onOpenAssignment && (
													<button
														type="button"
														onClick={() => onOpenAssignment(item.id)}
														className={cn(
															buttonVariants({
																variant: "outline",
																size: "sm",
															}),
															"cursor-pointer",
														)}
													>
														Mở trong Bài tập
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{!hasDetailContent && (
						<p className="rounded-md border border-border border-dashed px-3 py-2.5 text-muted-foreground text-sm">
							{emptyDetailMessageForStatus(displayStatus)}
						</p>
					)}
				</>
			) : null}
		</div>
	);
}

function LessonRow({
	classId,
	entry,
	isFirstInList,
	isLastInList,
	isPaused,
	nextId,
	todayISO,
	now,
	zoomNowMs,
	open,
	isFlashed,
	matchedAssignments,
	onToggle,
	onOpenRecording,
	onOpenAssignment,
	registerButtonRef,
}: {
	classId: string;
	entry: IndexedLesson;
	isFirstInList: boolean;
	isLastInList: boolean;
	isPaused: boolean;
	nextId: string | null;
	todayISO: string;
	now: Date;
	zoomNowMs?: number;
	open: boolean;
	isFlashed: boolean;
	matchedAssignments: StudentAssignment[];
	onToggle: (lessonId: string) => void;
	onOpenRecording: (recording: ActiveRecording) => void;
	onOpenAssignment?: (assignmentId: string) => void;
	registerButtonRef: (lessonId: string, el: HTMLButtonElement | null) => void;
}) {
	const { lesson, teachingIndex, railPosition } = entry;
	const isNext = lesson.id === nextId;
	const isEnded = isLessonEnded(lesson, now);
	const displayStatus = getDisplayStatus(lesson, isPaused, now);
	const isActiveSession =
		lesson.status !== "cancelled" && lesson.status !== "holiday";
	const showZoomLink =
		displayStatus === "upcoming" && Boolean(lesson.hasZoom ?? lesson.joinUrl);
	const hasR2Video =
		isActiveSession &&
		lesson.date != null &&
		Boolean(lesson.hasRecordingVideo) &&
		lesson.recordingStatus !== "expired";
	const safeRecordingUrl =
		isActiveSession &&
		!hasR2Video &&
		lesson.recordingStatus !== "expired" &&
		lesson.recordingUrl &&
		isSafeMaterialUrl(lesson.recordingUrl)
			? lesson.recordingUrl
			: null;
	const showExpiredRecording =
		isActiveSession &&
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
	const isFutureUpcoming =
		nextId !== null &&
		displayStatus === "upcoming" &&
		!isNext &&
		lesson.date != null &&
		lesson.date > todayISO;

	const baseStatus = LESSON_STATUS[displayStatus] ?? {
		label: displayStatus,
		variant: "outline" as const,
		badgeClass: "text-muted-foreground",
	};
	const statusTone = JOURNEY_BADGE_TONE[displayStatus];
	const badgeVariant = statusTone?.variant ?? baseStatus.variant;
	const badgeClass = statusTone?.badgeClass ?? baseStatus.badgeClass;

	const isClickable = lesson.date != null && lesson.status !== "holiday";
	const topic = lesson.topic?.trim() ?? "";
	const syllabusTitle = lesson.syllabusTitle?.trim() ?? "";
	const primaryTitle = topic || syllabusTitle;
	const secondarySyllabusTitle =
		topic && syllabusTitle && topic !== syllabusTitle ? syllabusTitle : null;
	const lectureCount = isActiveSession ? (lesson.lectureCount ?? 0) : 0;
	const homeworkFileCount = isActiveSession ? (lesson.homeworkCount ?? 0) : 0;
	const assignmentCount =
		lesson.status !== "holiday" ? (lesson.assignmentCount ?? 0) : 0;
	const homeworkTotal = homeworkFileCount + assignmentCount;
	const detailId = `lesson-detail-${lesson.id}`;
	const objectives = lesson.objectives?.trim() ?? "";

	const showSessionMaterialsBlock =
		isClickable &&
		lesson.date != null &&
		(lectureCount > 0 ||
			homeworkFileCount > 0 ||
			isNext ||
			displayStatus === "completed" ||
			displayStatus === "absent" ||
			displayStatus === "ended");

	return (
		<li
			aria-current={isNext ? "true" : undefined}
			className="relative grid grid-cols-[2rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0 sm:gap-4"
		>
			{!isFirstInList && (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute top-0 left-4 h-6 -translate-x-1/2 border-l-2",
						railPosition === "after"
							? "border-input border-dashed"
							: "border-primary",
					)}
				/>
			)}
			{!isLastInList && (
				<span
					aria-hidden="true"
					className={cn(
						"pointer-events-none absolute top-6 bottom-0 left-4 -translate-x-1/2 border-l-2",
						railPosition === "before"
							? "border-primary"
							: "border-input border-dashed",
					)}
				/>
			)}

			{renderStopNode({
				lesson,
				teachingIndex,
				displayStatus,
				isNext,
				isAhead: railPosition === "after",
			})}

			<div className="min-w-0">
				{lesson.status === "holiday" ? (
					<div className="flex min-h-12 min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2">
						<div className="min-w-0 flex-1">
							<div className="text-muted-foreground text-xs tabular-nums">
								{lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur} phút
							</div>
							{primaryTitle && (
								<div className="mt-0.5 break-words text-muted-foreground text-sm">
									{primaryTitle}
								</div>
							)}
						</div>
						<Badge variant={badgeVariant} className={badgeClass}>
							{baseStatus.label}
						</Badge>
					</div>
				) : (
					<>
						<div
							className={cn(
								"flex min-w-0 flex-wrap items-center gap-2 rounded-lg border p-2.5 transition-colors duration-150 motion-reduce:transition-none sm:px-3",
								isNext
									? "border-primary bg-muted/40"
									: open
										? "border-border bg-muted/40"
										: "border-transparent hover:border-border hover:bg-muted/30",
								isFlashed && "bg-accent",
							)}
						>
							<button
								type="button"
								ref={(el) => registerButtonRef(lesson.id, el)}
								aria-expanded={open}
								aria-controls={detailId}
								onClick={() => onToggle(lesson.id)}
								className="flex min-h-10 min-w-0 flex-1 basis-[200px] cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
							>
								<span className="min-w-0 flex-1 basis-[140px]">
									<span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs tabular-nums">
										<span>
											{teachingIndex !== null ? `Buổi ${teachingIndex} · ` : ""}
											{lessonDayLabel(lesson)} · {lesson.time} · {lesson.dur}{" "}
											phút
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
									</span>

									<span
										className={cn(
											"mt-0.5 block break-words text-sm sm:text-base",
											isNext
												? "font-semibold text-foreground"
												: isFutureUpcoming
													? "font-normal text-muted-foreground"
													: "font-medium text-foreground",
											lesson.status === "cancelled" &&
												"text-muted-foreground line-through",
										)}
									>
										{primaryTitle ||
											(teachingIndex !== null
												? `Buổi ${teachingIndex}`
												: "Buổi học")}
									</span>

									{secondarySyllabusTitle && (
										<span className="mt-0.5 block truncate text-muted-foreground text-xs">
											{secondarySyllabusTitle}
										</span>
									)}

									{(lectureCount > 0 || homeworkTotal > 0) && (
										<span className="mt-1.5 flex flex-wrap items-center gap-2 text-muted-foreground text-xs tabular-nums">
											{lectureCount > 0 && (
												<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
													<BookOpen aria-hidden="true" className="size-3" />
													{lectureCount} bài giảng
												</span>
											)}
											{homeworkTotal > 0 && (
												<span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
													<ClipboardList
														aria-hidden="true"
														className="size-3"
													/>
													{homeworkTotal} bài tập
												</span>
											)}
										</span>
									)}
								</span>

								<span className="flex shrink-0 items-center gap-1.5">
									{isNext ? (
										<Badge variant="default">Buổi tới</Badge>
									) : (
										<Badge variant={badgeVariant} className={badgeClass}>
											{baseStatus.label}
										</Badge>
									)}
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"size-4 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none",
											open && "rotate-180",
										)}
									/>
								</span>
							</button>

							{isClickable && lesson.date && (
								<Link
									to="/classes/$classId/sessions/$date"
									params={{ classId, date: lesson.date }}
									data-testid={`session-link-${lesson.date}`}
									className={cn(
										buttonVariants({ variant: "ghost", size: "sm" }),
										"shrink-0 text-muted-foreground hover:text-foreground",
									)}
								>
									Chi tiết
									<ChevronRight aria-hidden="true" className="size-3.5" />
								</Link>
							)}
						</div>

						<LessonDetailPanel
							classId={classId}
							lesson={lesson}
							teachingIndex={teachingIndex}
							primaryTitle={primaryTitle}
							detailId={detailId}
							open={open}
							displayStatus={displayStatus}
							isNext={isNext}
							objectives={objectives}
							showZoomLink={showZoomLink}
							hasR2Video={hasR2Video}
							recordingExpiryLabel={recordingExpiryLabel}
							safeRecordingUrl={safeRecordingUrl}
							showExpiredRecording={showExpiredRecording}
							showPendingRecording={showPendingRecording}
							showSessionMaterialsBlock={showSessionMaterialsBlock}
							matchedAssignments={matchedAssignments}
							todayISO={todayISO}
							nowMs={now.getTime()}
							zoomNowMs={zoomNowMs}
							onOpenRecording={onOpenRecording}
							onOpenAssignment={onOpenAssignment}
						/>
					</>
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
	assignments = [],
	todayISO,
	now,
	zoomNowMs,
	filter,
	onFilterChange,
	onOpenAssignment,
}: {
	classId: string;
	isPaused?: boolean;
	lessons: StudentClassLesson[];
	syllabus?: StudentClassSyllabusSummary | null;
	assignments?: StudentAssignment[];
	todayISO: string;
	now: Date;
	/** Chỉ dùng trong unit test để cố định đồng hồ cục bộ cho ZoomJoinButton. */
	zoomNowMs?: number;
	filter?: JourneyFilter;
	onFilterChange?: (next: JourneyFilter) => void;
	onOpenAssignment?: (assignmentId: string) => void;
}) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const [activeRecording, setActiveRecording] =
		useState<ActiveRecording | null>(null);

	const nextId = useMemo(
		() => (isPaused ? null : findNextLessonId(lessons, todayISO, now)),
		[isPaused, lessons, todayISO, now],
	);

	const [localFilter, setLocalFilter] = useState<JourneyFilter>("all");
	const activeFilter = filter ?? localFilter;
	const setFilter = useCallback(
		(next: JourneyFilter) => {
			if (onFilterChange) {
				onFilterChange(next);
			} else {
				setLocalFilter(next);
			}
		},
		[onFilterChange],
	);

	const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
		!isPaused && nextId ? new Set([nextId]) : new Set(),
	);
	const [pendingLocate, setPendingLocate] = useState(false);
	const [flashedId, setFlashedId] = useState<string | null>(null);
	const stopBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

	const prevClassIdRef = useRef(classId);
	const prevPausedRef = useRef(isPaused);

	useEffect(() => {
		if (prevClassIdRef.current === classId) return;
		prevClassIdRef.current = classId;
		setLocalFilter("all");
		setExpandedIds(!isPaused && nextId ? new Set([nextId]) : new Set());
		setPendingLocate(false);
		setFlashedId(null);
		setActiveRecording(null);
	}, [classId, nextId, isPaused]);

	useEffect(() => {
		if (prevPausedRef.current === isPaused) return;
		prevPausedRef.current = isPaused;
		if (isPaused) {
			setExpandedIds(new Set());
		} else if (nextId) {
			setExpandedIds((prev) => (prev.size === 0 ? new Set([nextId]) : prev));
		}
	}, [isPaused, nextId]);

	useEffect(() => {
		if (!flashedId) return;
		const timer = setTimeout(() => {
			setFlashedId((cur) => (cur === flashedId ? null : cur));
		}, 220);
		return () => clearTimeout(timer);
	}, [flashedId]);

	const registerButtonRef = useCallback(
		(lessonId: string, el: HTMLButtonElement | null) => {
			if (el) {
				stopBtnRefs.current.set(lessonId, el);
			} else {
				stopBtnRefs.current.delete(lessonId);
			}
		},
		[],
	);

	const handleToggle = useCallback((lessonId: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(lessonId)) {
				next.delete(lessonId);
			} else {
				next.add(lessonId);
			}
			return next;
		});
	}, []);

	const handleLocate = useCallback(() => {
		if (!nextId) return;
		if (activeFilter === "done") {
			setFilter("all");
		}
		setExpandedIds((prev) => {
			if (prev.has(nextId)) return prev;
			const next = new Set(prev);
			next.add(nextId);
			return next;
		});
		setPendingLocate(true);
	}, [activeFilter, nextId, setFilter]);

	useEffect(() => {
		if (!pendingLocate || !nextId || activeFilter === "done") return;
		const btn = stopBtnRefs.current.get(nextId);
		if (!btn) return;
		const reduceMotion = prefersReducedMotion();
		scrollElementToCenterAndFocus(btn, reduceMotion);
		setPendingLocate(false);
		if (!reduceMotion) {
			setFlashedId(nextId);
		}
	}, [pendingLocate, nextId, activeFilter]);

	// Gom bài tập gắn buổi theo ngày (chặn legacy `sessionDate == null`).
	const assignmentsByDate = useMemo(() => {
		const map = new Map<string, StudentAssignment[]>();
		for (const item of assignments) {
			if (!item.sessionDate) continue;
			const bucket = map.get(item.sessionDate);
			if (bucket) {
				bucket.push(item);
			} else {
				map.set(item.sessionDate, [item]);
			}
		}
		return map;
	}, [assignments]);

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

	const teachingLessons = lessons.filter((l) => l.status !== "holiday");
	const heldCount = teachingLessons.filter(
		(l) => l.status === "completed" || l.status === "absent",
	).length;
	const hasDatedLessons = teachingLessons.some((l) => l.date != null);

	// Đánh số, chia module và xác định pivot TRƯỚC khi áp bộ lọc.
	const allIndexed = buildIndexedLessons(
		lessons,
		nextId,
		heldCount > 0,
		isPaused,
	);
	const nextEntry = nextId
		? (allIndexed.find((e) => e.lesson.id === nextId) ?? null)
		: null;

	const useModuleGrouping = Boolean(
		syllabus &&
			syllabus.modules.length > 0 &&
			lessons.some((l) => Boolean(l.moduleId)),
	);
	const allGroups =
		useModuleGrouping && syllabus
			? groupLessonsByModules(allIndexed, syllabus)
			: null;

	const visibleGroups = allGroups
		? allGroups
				.map((g) => ({
					...g,
					items: g.items.filter((e) =>
						matchesJourneyFilter(e.lesson, activeFilter, isPaused, now),
					),
				}))
				.filter((g) => g.items.length > 0)
		: null;
	const visibleFlat = allGroups
		? null
		: allIndexed.filter((e) =>
				matchesJourneyFilter(e.lesson, activeFilter, isPaused, now),
			);
	const visibleTotal = visibleGroups
		? visibleGroups.reduce((sum, g) => sum + g.items.length, 0)
		: (visibleFlat?.length ?? 0);

	const getMatchedAssignments = (lesson: StudentClassLesson) =>
		lesson.date && lesson.status !== "holiday"
			? (assignmentsByDate.get(lesson.date) ?? [])
			: [];

	const renderLessonList = (items: IndexedLesson[]) => (
		<ol className="relative">
			{items.map((entry, idx) => (
				<LessonRow
					key={entry.lesson.id}
					classId={classId}
					entry={entry}
					isFirstInList={idx === 0}
					isLastInList={idx === items.length - 1}
					isPaused={isPaused}
					nextId={nextId}
					todayISO={todayISO}
					now={now}
					zoomNowMs={zoomNowMs}
					open={expandedIds.has(entry.lesson.id)}
					isFlashed={flashedId === entry.lesson.id}
					matchedAssignments={getMatchedAssignments(entry.lesson)}
					onToggle={handleToggle}
					onOpenRecording={setActiveRecording}
					onOpenAssignment={onOpenAssignment}
					registerButtonRef={registerButtonRef}
				/>
			))}
		</ol>
	);

	return (
		<div className="space-y-5">
			<JourneyNextStopHero
				classId={classId}
				nextLesson={nextEntry?.lesson ?? null}
				nextTeachingIndex={nextEntry?.teachingIndex ?? null}
				isPaused={isPaused}
				hasDatedLessons={hasDatedLessons}
				heldCount={heldCount}
				todayISO={todayISO}
				now={now}
				zoomNowMs={zoomNowMs}
				onLocate={handleLocate}
			/>

			<div className="flex flex-wrap items-center justify-between gap-3 pt-1">
				<p className="font-semibold text-foreground text-lg tracking-tight">
					Lộ trình chinh phục
				</p>
				<div className="flex max-w-full flex-wrap items-center gap-2">
					{/* biome-ignore lint/a11y/useSemanticElements: nhóm nút lọc dùng role="group" + aria-label theo pattern ChipFilter cho SR/e2e */}
					<div
						role="group"
						aria-label="Lọc buổi học"
						className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1"
					>
						{JOURNEY_FILTER_OPTIONS.map((opt) => {
							const active = activeFilter === opt.id;
							return (
								<button
									key={opt.id}
									type="button"
									aria-pressed={active}
									onClick={() => setFilter(opt.id)}
									className={cn(
										"min-h-8 cursor-pointer rounded-md px-3 font-medium text-xs transition-colors duration-150 sm:text-sm",
										active
											? "bg-background font-semibold text-foreground shadow-xs"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{opt.label}
								</button>
							);
						})}
					</div>

					{nextId !== null && (
						<button
							type="button"
							onClick={handleLocate}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"cursor-pointer",
							)}
						>
							<Crosshair aria-hidden="true" className="size-3.5" />
							Vị trí hiện tại
						</button>
					)}
				</div>
			</div>

			{visibleTotal === 0 ? (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border border-dashed px-4 py-5 text-muted-foreground text-sm">
					<span>
						Không có buổi học nào khớp bộ lọc. Chọn “Tất cả” để xem toàn bộ lộ
						trình.
					</span>
					<button
						type="button"
						onClick={() => setFilter("all")}
						className={cn(
							buttonVariants({ variant: "outline", size: "sm" }),
							"cursor-pointer",
						)}
					>
						Xem tất cả
					</button>
				</div>
			) : visibleGroups ? (
				<div className="space-y-4">
					{visibleGroups.map((group) => {
						const moduleCompleted =
							group.teachingCount > 0 &&
							group.completedCount >= group.teachingCount;
						return (
							<section
								key={group.id}
								aria-label={group.title}
								data-testid={`journey-module-${group.id}`}
								className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6"
							>
								<div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b pb-3">
									<div className="flex min-w-0 items-center gap-2.5">
										{moduleCompleted ? (
											<span
												aria-hidden="true"
												className="grid size-5 flex-none place-items-center rounded-full bg-success text-primary-foreground"
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
											<h3 className="font-semibold text-foreground text-sm tracking-tight sm:text-base">
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

								{renderLessonList(group.items)}
							</section>
						);
					})}
				</div>
			) : (
				<div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
					{renderLessonList(visibleFlat ?? [])}
				</div>
			)}

			{recordingModal}
		</div>
	);
}
