import { Link } from "@tanstack/react-router";
import type {
	StudentClass,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import { formatSchedule } from "@teacher-os/api/format-schedule";
import {
	vietnamSessionEndMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	Check,
	CircleDashed,
	Clock,
	GraduationCap,
	Sparkles,
	UserRound,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
	formatVietnamDateFromISO,
	VI_DAY_NAMES,
} from "@/lib/vietnam-display-date";

export type ScheduleTab = "upcoming" | "completed" | "all";

export const SCHEDULE_TABS: Array<{ id: ScheduleTab; label: string }> = [
	{ id: "upcoming", label: "Sắp tới" },
	{ id: "completed", label: "Đã học" },
	{ id: "all", label: "Tất cả" },
];

const LESSON_STATUS_CONFIG: Record<
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
	holiday: {
		label: "Nghỉ lễ — Đã dời lịch",
		variant: "outline",
		badgeClass: "text-amber-600 dark:text-amber-400",
	},
	ended: {
		label: "Đã kết thúc",
		variant: "outline",
		badgeClass: "text-muted-foreground",
	},
};

export function isSessionEnded(
	lesson: { status: string; date: string | null; time: string; dur: number },
	now: Date,
): boolean {
	if (lesson.status !== "upcoming" || lesson.date == null) return false;
	const end = vietnamSessionEndMs(lesson.date, lesson.time, lesson.dur);
	if (end == null) return false;
	return end <= now.getTime();
}

export function lessonWeekdayOrDate(lesson: {
	date: string | null;
	day: number;
}): string {
	if (lesson.date) return formatVietnamDateFromISO(lesson.date);
	return VI_DAY_NAMES[lesson.day % 7] ?? "";
}

export interface StudentScheduleViewProps {
	classes: StudentClass[];
	lessons: StudentScheduleLesson[];
	now?: Date;
	selectedTab?: ScheduleTab;
	onTabChange?: (tab: ScheduleTab) => void;
	selectedClassId?: string;
	onClassChange?: (classId: string) => void;
}

export function StudentScheduleView({
	classes,
	lessons,
	now,
	selectedTab: controlledTab,
	onTabChange,
	selectedClassId: controlledClassId,
	onClassChange,
}: StudentScheduleViewProps) {
	const [currentNow] = useState(() => now ?? new Date());
	const todayISO = vietnamTodayISO(currentNow);

	const [internalTab, setInternalTab] = useState<ScheduleTab>("upcoming");
	const activeTab = controlledTab ?? internalTab;

	const [internalClassId, setInternalClassId] = useState<string>("all");
	const activeClassId = controlledClassId ?? internalClassId;

	// Đảm bảo activeClassId luôn hợp lệ nếu class bị mất
	const resolvedClassId = useMemo(() => {
		if (activeClassId === "all") return "all";
		const exists = classes.some((c) => c.id === activeClassId);
		return exists ? activeClassId : "all";
	}, [activeClassId, classes]);

	const handleTabChange = (tab: ScheduleTab) => {
		setInternalTab(tab);
		onTabChange?.(tab);
	};

	const handleClassChange = (classId: string) => {
		setInternalClassId(classId);
		onClassChange?.(classId);
	};

	// Lọc danh sách bài học theo lớp đang chọn trước
	const scopedLessons = useMemo(() => {
		return resolvedClassId === "all"
			? lessons
			: lessons.filter((l) => l.classId === resolvedClassId);
	}, [lessons, resolvedClassId]);

	// Xác định buổi kế tiếp đầu tiên (Next session) dựa trên lớp đang chọn
	const nextSessionId = useMemo(() => {
		const next = scopedLessons.find(
			(l) =>
				l.date != null &&
				l.date >= todayISO &&
				l.status === "upcoming" &&
				!isSessionEnded(l, currentNow),
		);
		return next?.id ?? null;
	}, [scopedLessons, todayISO, currentNow]);
	// Phân loại và đếm số lượng cho từng tab
	const { categorizedLessons, tabCounts } = useMemo(() => {
		const counts: Record<ScheduleTab, number> = {
			upcoming: 0,
			completed: 0,
			all: 0,
		};

		counts.all = scopedLessons.length;

		const upcomingList: StudentScheduleLesson[] = [];
		const completedList: StudentScheduleLesson[] = [];

		for (const l of scopedLessons) {
			const ended = isSessionEnded(l, currentNow);

			if (l.date != null) {
				// Buổi có ngày
				if (
					(l.status === "upcoming" && !ended && l.date >= todayISO) ||
					((l.status === "cancelled" || l.status === "holiday") &&
						l.date >= todayISO)
				) {
					upcomingList.push(l);
				} else {
					completedList.push(l);
				}
			} else {
				// Buổi legacy chưa có ngày
				if (l.status === "upcoming") {
					upcomingList.push(l);
				} else {
					completedList.push(l);
				}
			}
		}
		// Tab "Đã học": hiển thị buổi gần nhất lên đầu (newest first)
		completedList.reverse();

		counts.upcoming = upcomingList.length;
		counts.completed = completedList.length;

		let resultList: StudentScheduleLesson[] = scopedLessons;
		if (activeTab === "upcoming") {
			resultList = upcomingList;
		} else if (activeTab === "completed") {
			resultList = completedList;
		}

		return {
			categorizedLessons: resultList,
			tabCounts: counts,
		};
	}, [scopedLessons, currentNow, todayISO, activeTab]);

	return (
		<div data-testid="student-schedule-page" className="space-y-8">
			{/* Page Header */}
			<header>
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Lịch học · {classes.length} lớp
				</p>
				<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
					Lịch học của tôi
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					Lịch các buổi học từ tất cả các lớp bạn đang tham gia.
				</p>
			</header>

			{classes.length === 0 ? (
				<OverviewEmptyState
					icon="calendar"
					title="Bạn chưa tham gia lớp học nào"
					description="Khi giáo viên ghi danh bạn vào lớp, thông tin khóa học và lịch học sẽ hiển thị tại đây."
				/>
			) : (
				<>
					{/* Section 1: Lịch định kỳ các lớp */}
					<section
						aria-labelledby="recurring-schedule-title"
						className="space-y-3"
					>
						<div className="flex items-center justify-between">
							<h2
								id="recurring-schedule-title"
								className="font-extrabold text-[18px] text-foreground tracking-[-0.02em]"
							>
								Lịch học định kỳ các lớp
							</h2>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{classes.map((cls) => {
								const formattedSchedule = formatSchedule(cls.schedule);
								return (
									<div
										key={cls.id}
										data-testid={`class-schedule-card-${cls.id}`}
										className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
									>
										<div className="space-y-3">
											<div className="flex items-start justify-between gap-2">
												<Link
													to="/classes/$classId"
													params={{ classId: cls.id }}
													className="font-bold text-base text-foreground hover:text-primary hover:underline"
												>
													{cls.name}
												</Link>
												<span className="flex-none rounded-full bg-muted px-2 py-0.5 font-medium text-[11px] text-muted-foreground">
													{cls.mode}
												</span>
											</div>

											<div className="space-y-1.5 text-sm">
												<div className="flex items-center gap-2 text-foreground">
													<Clock
														aria-hidden="true"
														className="size-4 flex-none text-muted-foreground"
													/>
													<span className="font-medium">
														{formattedSchedule || "Chưa có lịch"}
													</span>
												</div>

												{cls.teacher && (
													<div className="flex items-center gap-2 text-muted-foreground">
														<UserRound
															aria-hidden="true"
															className="size-4 flex-none"
														/>
														<span>{cls.teacher.name}</span>
													</div>
												)}

												{cls.level && (
													<div className="flex items-center gap-2 text-muted-foreground">
														<GraduationCap
															aria-hidden="true"
															className="size-4 flex-none"
														/>
														<span>Trình độ: {cls.level}</span>
													</div>
												)}
											</div>
										</div>

										<div className="mt-4 border-border border-t pt-3 text-xs">
											{cls.nextSession?.date ? (
												<span className="text-muted-foreground">
													Buổi tới:{" "}
													<strong className="font-semibold text-foreground">
														{formatVietnamDateFromISO(cls.nextSession.date)}
														{cls.nextSession.time
															? ` (${cls.nextSession.time})`
															: ""}
													</strong>
												</span>
											) : (
												<span className="text-muted-foreground">
													Chưa có lịch buổi tới
												</span>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</section>

					{/* Section 2: Danh sách buổi học */}
					<section
						aria-labelledby="sessions-timeline-title"
						className="space-y-4 pt-2"
					>
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<h2
								id="sessions-timeline-title"
								className="font-extrabold text-[18px] text-foreground tracking-[-0.02em]"
							>
								Danh sách buổi học
							</h2>

							{/* Segmented Filter Tabs */}
							<div
								role="tablist"
								aria-label="Lọc buổi học theo thời gian"
								className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1 text-[13px]"
							>
								{SCHEDULE_TABS.map((tab) => {
									const isSelected = activeTab === tab.id;
									const count = tabCounts[tab.id];

									return (
										<button
											key={tab.id}
											type="button"
											role="tab"
											aria-selected={isSelected}
											onClick={() => handleTabChange(tab.id)}
											className={cn(
												"flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
												isSelected
													? "border border-input bg-background text-foreground shadow-sm"
													: "text-muted-foreground hover:text-foreground",
											)}
										>
											<span>{tab.label}</span>
											<span
												aria-hidden="true"
												className={cn(
													"rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
													isSelected
														? "bg-muted text-foreground"
														: "text-muted-foreground",
												)}
											>
												{count}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						{/* Class Filter Chips (khi học viên học từ 2 lớp trở lên) */}
						{classes.length >= 2 && (
							<fieldset className="flex flex-wrap items-center gap-2 border-0 p-0 pt-1">
								<legend className="sr-only">Lọc theo lớp học</legend>
								<span
									aria-hidden="true"
									className="text-muted-foreground text-xs"
								>
									Lớp học:
								</span>
								<button
									type="button"
									aria-pressed={resolvedClassId === "all"}
									onClick={() => handleClassChange("all")}
									className={cn(
										"rounded-md px-3 py-1 text-xs transition-colors",
										resolvedClassId === "all"
											? "border border-primary bg-primary text-primary-foreground"
											: "border border-input bg-background text-foreground hover:bg-accent",
									)}
								>
									<span>Tất cả lớp</span>
									<span
										aria-hidden="true"
										className={cn(
											"ml-1.5 text-xs tabular-nums",
											resolvedClassId === "all"
												? "text-primary-foreground/80"
												: "text-muted-foreground",
										)}
									>
										{lessons.length}
									</span>
								</button>
								{classes.map((cls) => {
									const isSelected = resolvedClassId === cls.id;
									const count = lessons.filter(
										(l) => l.classId === cls.id,
									).length;
									return (
										<button
											key={cls.id}
											type="button"
											aria-pressed={isSelected}
											onClick={() => handleClassChange(cls.id)}
											className={cn(
												"rounded-md px-3 py-1 text-xs transition-colors",
												isSelected
													? "border border-primary bg-primary text-primary-foreground"
													: "border border-input bg-background text-foreground hover:bg-accent",
											)}
										>
											<span>{cls.name}</span>
											<span
												aria-hidden="true"
												className={cn(
													"ml-1.5 text-xs tabular-nums",
													isSelected
														? "text-primary-foreground/80"
														: "text-muted-foreground",
												)}
											>
												{count}
											</span>
										</button>
									);
								})}
							</fieldset>
						)}

						{/* Sessions List or Empty State */}
						{categorizedLessons.length === 0 ? (
							<OverviewEmptyState
								icon="calendar"
								title={
									activeTab === "upcoming"
										? "Không có buổi học sắp tới"
										: "Không tìm thấy buổi học phù hợp"
								}
								description={
									activeTab === "upcoming"
										? "Tất cả các buổi học hiện tại đã kết thúc hoặc lớp chưa có lịch mới."
										: "Hãy chọn tab khác hoặc lớp học khác để xem lịch các buổi học."
								}
							/>
						) : (
							<div
								data-testid="sessions-list"
								className="rounded-xl border bg-card p-6 shadow-sm"
							>
								<div className="grid gap-3">
									{categorizedLessons.map((lesson) => {
										const isNext = lesson.id === nextSessionId;
										const isEnded = isSessionEnded(lesson, currentNow);
										const displayStatus = isEnded ? "ended" : lesson.status;

										const statusConfig = LESSON_STATUS_CONFIG[
											displayStatus
										] ?? {
											label: displayStatus,
											variant: "outline" as const,
											badgeClass: "text-muted-foreground",
										};

										const StatusIcon =
											displayStatus === "completed"
												? Check
												: displayStatus === "absent" ||
														displayStatus === "cancelled"
													? X
													: displayStatus === "ended"
														? Clock
														: CircleDashed;

										return (
											<div
												key={lesson.id}
												data-testid={`session-row-${lesson.id}`}
												className={cn(
													"flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
													isNext
														? "border-primary/40 bg-accent/20 ring-2 ring-primary/20"
														: "border-border bg-card",
												)}
											>
												<div className="flex items-start gap-3 sm:items-center">
													<span
														aria-hidden="true"
														className={cn(
															"grid size-9 flex-none place-items-center rounded-full border",
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
															isNext && "ring-2 ring-primary ring-offset-2",
														)}
													>
														<StatusIcon className="size-4" />
													</span>

													<div className="min-w-0 space-y-1">
														<div className="flex flex-wrap items-center gap-2">
															<Link
																to="/classes/$classId"
																params={{ classId: lesson.classId }}
																className="font-bold text-foreground text-sm hover:text-primary hover:underline"
															>
																{lesson.className}
															</Link>

															{isNext && (
																<span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[11px] text-primary">
																	<Sparkles className="size-3" />
																	Buổi kế tiếp
																</span>
															)}
														</div>

														<p className="truncate text-muted-foreground text-sm">
															{lesson.topic || "Buổi học"}
														</p>
													</div>
												</div>

												{/* Right Side: Thời gian và Badge trạng thái */}
												<div className="flex items-center justify-between gap-4 border-border/50 border-t pt-2 sm:border-t-0 sm:pt-0">
													<div className="text-left sm:text-right">
														<span className="block font-medium text-foreground text-sm tabular-nums">
															{lessonWeekdayOrDate(lesson)}
														</span>
														<span className="block text-muted-foreground text-xs tabular-nums">
															{lesson.time} · {lesson.dur} phút
														</span>
													</div>

													<div className="flex-none">
														<Badge
															variant={statusConfig.variant}
															className={statusConfig.badgeClass}
														>
															{statusConfig.label}
														</Badge>
													</div>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						)}
					</section>
				</>
			)}
		</div>
	);
}
