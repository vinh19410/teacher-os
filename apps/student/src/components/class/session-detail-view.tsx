import { Link } from "@tanstack/react-router";
import type { StudentSessionDetailResponse } from "@teacher-os/api/contracts";
import { isSafeMaterialUrl } from "@teacher-os/api/material-contracts";
import { buttonVariants } from "@teacher-os/ui/components/button";
import {
	ArrowLeft,
	ArrowRight,
	BookOpen,
	Calendar,
	ClipboardList,
	Clock,
	PlayCircle,
	Target,
} from "lucide-react";
import { ClassAssignmentTable } from "@/components/class/class-assignment-table";
import {
	isLessonEnded,
	LESSON_STATUS,
} from "@/components/class/class-lesson-list";
import { LessonMaterialItemRow } from "@/components/class/lesson-materials";
import { RecordingPassword } from "@/components/class/recording-password";
import { ZoomJoinButton } from "@/components/class/zoom-join-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatVietnamDateFromISO } from "@/lib/vietnam-display-date";

export function SessionDetailView({
	detail,
	todayISO,
	now,
	zoomNowMs,
}: {
	detail: StudentSessionDetailResponse;
	todayISO: string;
	now: Date;
	zoomNowMs?: number;
}) {
	const {
		class: cls,
		session,
		curriculum,
		lectures,
		homeworkMaterials,
		assignments,
	} = detail;
	const isPaused = cls.status === "paused";
	const sessionDate = session.date ?? "";
	const isEnded = isLessonEnded(session, now);
	const displayStatus =
		isPaused && session.status === "upcoming"
			? "paused_upcoming"
			: isEnded
				? "ended"
				: session.status;
	const statusInfo = LESSON_STATUS[displayStatus] ?? {
		label: displayStatus,
		variant: "outline" as const,
		badgeClass: "text-muted-foreground",
	};

	const showZoom = displayStatus === "upcoming" && Boolean(session.hasZoom);
	const canShowRecording =
		session.status !== "cancelled" && session.status !== "holiday";
	const safeRecordingUrl =
		canShowRecording &&
		session.recordingUrl &&
		isSafeMaterialUrl(session.recordingUrl)
			? session.recordingUrl
			: null;
	const showPendingRecording =
		!safeRecordingUrl &&
		session.recordingStatus === "pending" &&
		(isEnded || session.status === "completed" || session.status === "absent");

	const formattedDate = sessionDate
		? formatVietnamDateFromISO(sessionDate)
		: "";
	const headingTitle =
		session.topic.trim() ||
		curriculum?.title.trim() ||
		(session.sessionNumber != null && session.sessionNumber > 0
			? `Buổi ${session.sessionNumber}`
			: `Buổi học ${formattedDate}`);
	const secondaryCurriculumTitle =
		session.topic.trim() &&
		curriculum?.title.trim() &&
		session.topic.trim() !== curriculum.title.trim()
			? curriculum.title.trim()
			: null;
	const totalHomework = assignments.length + homeworkMaterials.length;

	return (
		<div className="space-y-6">
			<div className="min-w-0">
				<Link
					to="/classes/$classId"
					params={{ classId: cls.id }}
					className={cn(
						buttonVariants({ variant: "ghost", size: "sm" }),
						"-ml-3 max-w-full text-muted-foreground",
					)}
				>
					<ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
					<span className="truncate">Quay lại {cls.name}</span>
				</Link>
			</div>

			{isPaused && (
				<div
					data-testid="session-paused-banner"
					className="rounded-xl border bg-muted/50 px-5 py-3.5 text-foreground text-sm"
				>
					Lớp đang tạm dừng — lịch buổi học sắp tới tạm hoãn. Bạn vẫn có thể xem
					bài giảng và làm bài tập của buổi này.
				</div>
			)}

			{(session.status === "cancelled" || session.status === "holiday") && (
				<div
					data-testid="session-inactive-banner"
					className="rounded-xl border bg-muted/50 px-5 py-3.5 text-foreground text-sm"
				>
					{session.status === "holiday"
						? "Buổi học này rơi vào ngày nghỉ lễ và đã được dời lịch. Tài liệu và đường dẫn lớp học không áp dụng cho ngày này."
						: "Buổi học này đã được huỷ. Tài liệu bài giảng và đường dẫn phòng học không còn hiệu lực cho ngày này."}
				</div>
			)}

			{/* Header thông tin buổi học */}
			<header className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6">
				<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
					{session.sessionNumber != null && session.sessionNumber > 0 && (
						<span className="font-medium text-foreground tabular-nums">
							Buổi {session.sessionNumber}/{session.totalTeachingSessions}
						</span>
					)}
					{curriculum?.moduleTitle && (
						<Badge variant="secondary">{curriculum.moduleTitle}</Badge>
					)}
					{curriculum?.kind === "midterm" && (
						<Badge variant="outline">Thi giữa kỳ</Badge>
					)}
					{curriculum?.kind === "final" && (
						<Badge variant="outline">Thi cuối kỳ</Badge>
					)}
					<Badge variant={statusInfo.variant} className={statusInfo.badgeClass}>
						{statusInfo.label}
					</Badge>
				</div>

				<h1 className="mt-2 font-semibold text-2xl text-foreground tracking-tight">
					{headingTitle}
				</h1>
				{secondaryCurriculumTitle && (
					<p className="mt-1 text-muted-foreground text-sm">
						{secondaryCurriculumTitle}
					</p>
				)}

				<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-muted-foreground text-sm tabular-nums">
					<span className="inline-flex items-center gap-1.5">
						<Calendar aria-hidden="true" className="size-4" />
						{formattedDate}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Clock aria-hidden="true" className="size-4" />
						{session.time} · {session.dur} phút
					</span>
				</div>

				{(showZoom || safeRecordingUrl || showPendingRecording) && (
					<div className="mt-4 flex flex-wrap items-center gap-2">
						{showZoom && (
							<ZoomJoinButton
								classId={cls.id}
								date={session.date}
								time={session.time}
								dur={session.dur}
								variant="default"
								size="sm"
								nowMs={zoomNowMs}
							/>
						)}
						{safeRecordingUrl && (
							<a
								href={safeRecordingUrl}
								target="_blank"
								rel="noopener noreferrer"
								className={cn(
									buttonVariants({ variant: "outline", size: "sm" }),
									"focus-visible:shadow-[var(--focus-ring)] focus-visible:ring-0",
								)}
							>
								<PlayCircle aria-hidden="true" className="size-3.5" />
								Xem recording
							</a>
						)}
						{safeRecordingUrl && session.recordingPassword && (
							<RecordingPassword password={session.recordingPassword} />
						)}
						{showPendingRecording && (
							<Badge variant="outline" className="text-muted-foreground">
								<Clock aria-hidden="true" className="size-3" />
								Đang chờ recording
							</Badge>
						)}
					</div>
				)}

				{curriculum?.objectives?.trim() && (
					<div className="mt-4 rounded-lg border bg-muted/40 p-3.5">
						<div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
							<Target aria-hidden="true" className="size-3.5 text-primary" />
							Mục tiêu buổi học
						</div>
						<p className="mt-1 whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
							{curriculum.objectives}
						</p>
					</div>
				)}
			</header>

			{/* Khối 1: Bài giảng */}
			<section
				aria-labelledby="session-lectures-heading"
				data-testid="session-lectures-section"
				className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
			>
				<div className="mb-4 flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<BookOpen
							aria-hidden="true"
							className="size-4 text-muted-foreground"
						/>
						<h2
							id="session-lectures-heading"
							className="font-semibold text-base tracking-tight"
						>
							Bài giảng
						</h2>
						<Badge variant="secondary" className="tabular-nums">
							{lectures.length}
						</Badge>
					</div>
				</div>

				{lectures.length === 0 ? (
					<div
						data-testid="session-lectures-empty"
						className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm"
					>
						Chưa có bài giảng nào được đăng cho buổi học này.
					</div>
				) : (
					<ul className="divide-y" aria-label="Danh sách bài giảng">
						{lectures.map((item) => (
							<LessonMaterialItemRow
								key={item.id}
								material={item}
								classId={cls.id}
								date={sessionDate}
								testId="session-lecture-item"
							/>
						))}
					</ul>
				)}
			</section>

			{/* Khối 2: Bài tập của buổi */}
			<section
				aria-labelledby="session-homework-heading"
				data-testid="session-homework-section"
				className="rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
			>
				<div className="mb-4 flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<ClipboardList
							aria-hidden="true"
							className="size-4 text-muted-foreground"
						/>
						<h2
							id="session-homework-heading"
							className="font-semibold text-base tracking-tight"
						>
							Bài tập của buổi
						</h2>
						<Badge variant="secondary" className="tabular-nums">
							{totalHomework}
						</Badge>
					</div>
				</div>

				{totalHomework === 0 ? (
					<div
						data-testid="session-homework-empty"
						className="rounded-lg border border-dashed p-5 text-center text-muted-foreground text-sm"
					>
						Chưa có bài tập nào cho buổi này. Giáo viên có thể cập nhật bài tập
						trước hoặc sau buổi học.
					</div>
				) : (
					<div className="space-y-5">
						{assignments.length > 0 && (
							<div className="space-y-2.5">
								{homeworkMaterials.length > 0 && (
									<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Bài tập làm trên hệ thống
									</h3>
								)}
								<ClassAssignmentTable
									assignments={assignments}
									todayISO={todayISO}
									nowMs={now.getTime()}
								/>
							</div>
						)}

						{homeworkMaterials.length > 0 && (
							<div className="space-y-2.5">
								{assignments.length > 0 && (
									<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										Tài liệu & liên kết bài tập
									</h3>
								)}
								<ul
									className="divide-y"
									aria-label="Danh sách tài liệu bài tập"
								>
									{homeworkMaterials.map((item) => (
										<LessonMaterialItemRow
											key={item.id}
											material={item}
											classId={cls.id}
											date={sessionDate}
											testId="session-homework-item"
										/>
									))}
								</ul>
							</div>
						)}
					</div>
				)}
			</section>

			{/* Điều hướng Buổi trước / Buổi tiếp theo */}
			{(detail.prevSessionDate || detail.nextSessionDate) && (
				<nav
					aria-label="Chuyển buổi học"
					className="flex flex-wrap items-center justify-between gap-3 pt-2"
				>
					{detail.prevSessionDate ? (
						<Link
							to="/classes/$classId/sessions/$date"
							params={{ classId: cls.id, date: detail.prevSessionDate }}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"max-w-full",
							)}
						>
							<ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
							<span className="truncate">
								Buổi trước ({formatVietnamDateFromISO(detail.prevSessionDate)})
							</span>
						</Link>
					) : (
						<span />
					)}
					{detail.nextSessionDate && (
						<Link
							to="/classes/$classId/sessions/$date"
							params={{ classId: cls.id, date: detail.nextSessionDate }}
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"max-w-full",
							)}
						>
							<span className="truncate">
								Buổi tiếp theo (
								{formatVietnamDateFromISO(detail.nextSessionDate)})
							</span>
							<ArrowRight aria-hidden="true" className="size-4 shrink-0" />
						</Link>
					)}
				</nav>
			)}
		</div>
	);
}

export function SessionNotFound({ classId }: { classId: string }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
			<h1 className="font-semibold text-foreground text-xl tracking-tight">
				Không tìm thấy buổi học
			</h1>
			<p className="mt-2 max-w-[44ch] text-muted-foreground text-sm">
				Buổi học này không tồn tại, đã bị dời lịch hoặc bạn chưa tham gia lớp
				này.
			</p>
			<div className="mt-5">
				<Link
					to="/classes/$classId"
					params={{ classId }}
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<ArrowLeft aria-hidden="true" className="size-4" />
					Quay lại lớp học
				</Link>
			</div>
		</div>
	);
}
