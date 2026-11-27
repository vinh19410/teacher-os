import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FocusSessionCard } from "@/components/dashboard/focus-session-card";
import { MonthCalendarSection } from "@/components/dashboard/month-calendar-section";
import { OrgStatsSection } from "@/components/dashboard/org-stats-section";
import { ReminderCards } from "@/components/dashboard/reminder-cards";
import { RiskStudentsSection } from "@/components/dashboard/risk-students-section";
import { StudentRiskDrawer } from "@/components/dashboard/student-risk-drawer";
import { TodayScheduleSection } from "@/components/dashboard/today-schedule-section";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import {
	atRiskRows,
	formatDashboardGreeting,
	groupLessonsByClassSession,
	groupUpcomingByDay,
	lessonsToday,
	overdueUnsubmittedSummary,
	resolveDashboardFocus,
	sessionTimelineState,
	studentRiskDetails,
	ungradedAssignmentsCount,
	upcomingLessonsThisWeek,
	vietnamNowMinutes,
} from "@/lib/dashboard-from-kernel";
import { useData } from "@/lib/data-store";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import { dashboardRemindersQueryOptions } from "@/lib/repos/dashboard-reminders";
import { classesByStudent } from "@/lib/repos/enrollments";
import { kernelQueryOptions } from "@/lib/repos/kernel";
import { tuitionTotals } from "@/lib/tuition-from-kernel";
import { todayISOVietnam } from "@/lib/week-grid";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardRoute,
});

function DashboardRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const { data, classById } = useData();
	const [now, setNow] = useState(() => new Date());
	const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
		null,
	);
	const drawerTriggerRef = useRef<HTMLButtonElement | null>(null);
	const riskHeadingRef = useRef<HTMLHeadingElement | null>(null);

	useEffect(() => {
		const tick = () => setNow(new Date());
		const intervalId = window.setInterval(tick, 60_000);
		const onVisibilityChange = () => {
			if (!document.hidden) tick();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => {
			window.clearInterval(intervalId);
			document.removeEventListener("visibilitychange", onVisibilityChange);
		};
	}, []);

	// Bộ đếm thẻ nhắc việc đếm ở server. Observer thứ 2 trên cùng cache entry
	// ["kernel"] (staleTime Infinity → không tự fetch): dataUpdatedAt đổi mỗi
	// khi bus refresh snapshot sau action kernel → query key reminders đổi →
	// TanStack Query tự refetch.
	const baseUrl = getApiBaseUrl();
	const viewerRole = data.viewer?.role ?? "unknown";
	const { dataUpdatedAt: kernelUpdatedAt } = useQuery({
		...kernelQueryOptions(baseUrl),
		staleTime: Number.POSITIVE_INFINITY,
		notifyOnChangeProps: ["dataUpdatedAt"],
	});
	const reminders = useQuery({
		...dashboardRemindersQueryOptions(baseUrl, kernelUpdatedAt, viewerRole),
		// Chưa có snapshot thì chưa fetch — tránh lần fetch thừa với key 0.
		enabled: kernelUpdatedAt > 0,
	});

	// Qua nửa đêm giờ Việt Nam khi giữ tab mở → tự refetch bộ đếm ngày mới.
	const todayIso = todayISOVietnam(now);
	const prevTodayIsoRef = useRef(todayIso);
	const refetchRemindersRef = useRef(reminders.refetch);
	refetchRemindersRef.current = reminders.refetch;
	useEffect(() => {
		if (prevTodayIsoRef.current !== todayIso) {
			prevTodayIsoRef.current = todayIso;
			if (kernelUpdatedAt > 0) {
				void refetchRemindersRef.current();
			}
		}
	}, [todayIso, kernelUpdatedAt]);

	const risk = atRiskRows(
		data.students,
		data.lessons,
		now,
		data.classes,
		data.classAssignments,
		data.assignments,
	);
	const overdueUnsubmitted = overdueUnsubmittedSummary(
		data.students,
		data.lessons,
		now,
		data.classes,
		data.classAssignments,
		data.assignments,
	);
	const selectedRiskRow = selectedStudentId
		? (risk.find((r) => r.student.id === selectedStudentId) ?? null)
		: null;

	// Xóa selectedStudentId ngay khi học viên hết rủi ro sau refresh để tránh
	// drawer tự bật lại ngoài ý muốn khi dữ liệu đổi về sau.
	useEffect(() => {
		if (selectedStudentId !== null && selectedRiskRow === null) {
			setSelectedStudentId(null);
		}
	}, [selectedStudentId, selectedRiskRow]);

	if (!session?.data?.user) {
		throw redirect({ href: "/login", reloadDocument: true });
	}

	const displayName = session.data.user.name || "Giáo viên";
	const today = lessonsToday(data.lessons, now, data.classes);
	const todayGroups = groupLessonsByClassSession(today);
	const upcoming = upcomingLessonsThisWeek(data.lessons, now, data.classes);
	const upcomingGroups = groupUpcomingByDay(upcoming);
	const nowMin = vietnamNowMinutes(now);
	const focus = resolveDashboardFocus({
		todaySessions: todayGroups,
		upcomingGroups,
		now,
	});
	const remainingTodayCount = todayGroups.filter(
		(g) => sessionTimelineState(g, nowMin) !== "past",
	).length;

	// Fail-closed: mọi bề mặt tài chính chỉ mở khi `viewer.canAccessFinance === true`.
	const canAccessFinance = data.viewer?.canAccessFinance === true;
	const outstanding = canAccessFinance
		? tuitionTotals(data.invoices).outstanding
		: 0;
	const dueStudentsCount =
		canAccessFinance && reminders.isSuccess
			? reminders.data.tuition?.students
			: undefined;
	const openTasks = reminders.isSuccess
		? [
				reminders.data.attendance.pending > 0,
				reminders.data.overdueGrading.count > 0,
				canAccessFinance && (reminders.data.tuition?.students ?? 0) > 0,
			].filter(Boolean).length
		: null;

	// Kicker = weekday + date in Vietnam timezone so it stays aligned with
	// greeting, today's schedule, and server-counted reminder cards.
	const kicker = now.toLocaleDateString("vi-VN", {
		timeZone: "Asia/Ho_Chi_Minh",
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const ungraded = ungradedAssignmentsCount(
		data.students,
		data.classes,
		data.classAssignments,
		data.assignmentPrompts,
	);

	const selectedRiskIssues = selectedRiskRow
		? studentRiskDetails(
				selectedRiskRow.student.id,
				data.lessons,
				now,
				data.classes,
				data.classAssignments,
				data.assignments,
			)
		: [];
	const selectedActiveClasses = selectedRiskRow
		? classesByStudent(data, selectedRiskRow.student.id)
				.filter((c) => c.status !== "paused" && c.enrollmentStatus === "active")
				.map((c) => c.name)
		: [];

	return (
		<div>
			<div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:items-end">
				<div className="min-w-0">
					<p className="mb-2 text-muted-foreground text-sm first-letter:uppercase">
						{kicker}
					</p>
					<h1 className="break-words font-semibold text-2xl tracking-tight [overflow-wrap:anywhere] md:text-3xl">
						{formatDashboardGreeting(displayName, now)}
					</h1>
					<p
						data-testid="dashboard-hero-summary"
						className="mt-3 max-w-[60ch] text-base text-muted-foreground"
					>
						{todayGroups.length > 0 ? (
							<>
								Hôm nay có{" "}
								<strong className="font-semibold text-foreground">
									{`${todayGroups.length} buổi dạy`}
								</strong>
								{remainingTodayCount < todayGroups.length &&
									(remainingTodayCount > 0 ? (
										<>
											, còn{" "}
											<strong className="font-semibold text-foreground">
												{`${remainingTodayCount} buổi`}
											</strong>
										</>
									) : (
										", đã hoàn thành hết"
									))}
								.
							</>
						) : (
							"Hôm nay không có buổi dạy nào."
						)}
						{openTasks !== null && (
							<>
								{" "}
								{openTasks > 0 ? (
									<>
										<strong className="font-semibold text-foreground">
											{`${openTasks} việc`}
										</strong>{" "}
										đang chờ bạn xử lý.
									</>
								) : risk.length > 0 ? (
									<>
										Còn{" "}
										<strong className="font-semibold text-foreground">
											{`${risk.length} học viên`}
										</strong>{" "}
										cần kiểm tra.
									</>
								) : (
									"Mọi việc hôm nay đã xong."
								)}
							</>
						)}
					</p>
				</div>
				<FocusSessionCard focus={focus} classById={classById} />
			</div>

			{/* Khu vực "Việc cần làm hôm nay": 3 thẻ lối tắt 1-2-3 từ GET /api/dashboard/reminders. */}
			<section
				aria-labelledby="dashboard-tasks-title"
				aria-busy={reminders.isPending}
				className="mb-10"
			>
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<h2
						id="dashboard-tasks-title"
						className="font-semibold text-lg tracking-tight"
					>
						Việc cần làm hôm nay
					</h2>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void reminders.refetch()}
						disabled={reminders.isFetching}
					>
						<RefreshCw
							className={cn(
								"size-4",
								reminders.isFetching &&
									"animate-spin motion-reduce:animate-none",
							)}
							aria-hidden="true"
						/>
						{reminders.isFetching ? "Đang tải…" : "Làm mới"}
					</Button>
				</div>
				{reminders.isPending ? (
					<div
						aria-hidden="true"
						className={
							canAccessFinance
								? "grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-3"
								: "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-2"
						}
					>
						<div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
						<div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
						{canAccessFinance && (
							<div className="h-56 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
						)}
					</div>
				) : reminders.isError ? (
					<Card
						role="alert"
						className="flex flex-wrap items-center gap-3 p-4 text-sm sm:px-5"
					>
						<AlertTriangle
							className="size-4 shrink-0 text-destructive"
							aria-hidden="true"
						/>
						<span className="min-w-0 flex-1">
							Không tải được bộ đếm nhắc việc. Kiểm tra kết nối mạng rồi thử
							lại.
						</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void reminders.refetch()}
							disabled={reminders.isFetching}
						>
							Thử lại
						</Button>
					</Card>
				) : (
					<ReminderCards
						data={reminders.data}
						canAccessFinance={canAccessFinance}
						overdueUnsubmitted={overdueUnsubmitted}
					/>
				)}
			</section>

			<div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
				<TodayScheduleSection
					todayLessons={today}
					todayGroups={todayGroups}
					upcomingGroups={upcomingGroups}
					nowMin={nowMin}
					classById={classById}
				/>
				<div className="min-w-0 space-y-10 self-start">
					<MonthCalendarSection
						lessons={data.lessons}
						classes={data.classes}
						classById={classById}
						todayIso={todayIso}
					/>
					<RiskStudentsSection
						rows={risk}
						headingRef={riskHeadingRef}
						onSelectStudent={(row, trigger) => {
							drawerTriggerRef.current = trigger;
							setSelectedStudentId(row.student.id);
						}}
					/>
					<OrgStatsSection
						studentCount={data.students.length}
						ungradedCount={ungraded}
						canAccessFinance={canAccessFinance}
						outstanding={outstanding}
						dueStudentsCount={dueStudentsCount}
					/>
				</div>
			</div>

			<StudentRiskDrawer
				row={selectedRiskRow}
				issues={selectedRiskIssues}
				classNames={selectedActiveClasses}
				onClose={() => setSelectedStudentId(null)}
				returnFocusTo={drawerTriggerRef.current}
				fallbackFocusRef={riskHeadingRef}
			/>
		</div>
	);
}
