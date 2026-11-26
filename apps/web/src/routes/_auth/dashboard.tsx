import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
import { MorningSpot } from "@teacher-os/ui/components/illustrations";
import { ReminderCards } from "@/components/dashboard/reminder-cards";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { SectionTitle } from "@/components/ui/section-label";
import { Stat } from "@/components/ui/stat";
import {
	atRiskRows,
	type DashboardRiskReason,
	formatClassSessionMeta,
	formatDashboardGreeting,
	groupLessonsByClassSession,
	lessonsToday,
	upcomingLessonsThisWeek,
} from "@/lib/dashboard-from-kernel";
import { useData } from "@/lib/data-store";
import { lessonDayLabel } from "@/lib/format-schedule";
import { fmtVND } from "@/lib/mock-data";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import { dashboardRemindersQueryOptions } from "@/lib/repos/dashboard-reminders";
import { kernelQueryOptions } from "@/lib/repos/kernel";
import { tuitionTotals } from "@/lib/tuition-from-kernel";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardRoute,
});

const RISK_LABEL: Record<DashboardRiskReason, string> = {
	"missed-check-in": "Chưa điểm danh",
	"overdue-assignment": "Bài tập trễ hạn",
};

/**
 * Hàng lịch dùng chung cho "Lịch hôm nay" và "Lịch sắp tới":
 * cột giờ co theo nội dung (`auto` + `min-w-[5ch]` chống FOUT),
 * tên lớp `min-w-0 break-words` để xuống dòng trong cột của nó.
 */
function ScheduleRow(props: { time: string; className: string; meta: string }) {
	return (
		<div className="grid grid-cols-[auto_1fr] items-baseline gap-4 border-border border-t py-4">
			<span className="min-w-[5ch] whitespace-nowrap text-lg tabular-nums leading-none">
				{props.time}
			</span>
			<span className="min-w-0">
				<span className="block break-words font-medium">{props.className}</span>
				<span className="text-muted-foreground text-sm">{props.meta}</span>
			</span>
		</div>
	);
}

function DashboardRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const { data, classById } = useData();
	if (!session?.data?.user) {
		throw redirect({ href: "/login", reloadDocument: true });
	}

	const displayName = session.data.user.name || "Giáo viên";
	const now = new Date();
	const today = lessonsToday(data.lessons, now, data.classes);
	const todayGroups = groupLessonsByClassSession(today);
	const risk = atRiskRows(
		data.students,
		data.lessons,
		now,
		data.classes,
		data.classAssignments,
		data.assignments,
	);
	const upcoming = upcomingLessonsThisWeek(data.lessons, now, data.classes);
	const canAccessFinance = data.viewer?.canAccessFinance === true;
	const viewerRole = data.viewer?.role ?? "unknown";

	// Bộ đếm thẻ nhắc việc đếm ở server. Observer thứ 2 trên cùng cache entry
	// ["kernel"] (staleTime Infinity → không tự fetch): dataUpdatedAt đổi mỗi
	// khi bus refresh snapshot sau action kernel → query key reminders đổi →
	// TanStack Query tự refetch.
	const baseUrl = getApiBaseUrl();
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
	const upcomingGroups: Array<{ day: number; lessons: typeof upcoming }> = [];
	for (const l of upcoming) {
		const last = upcomingGroups[upcomingGroups.length - 1];
		if (last && last.day === l.day) {
			last.lessons.push(l);
		} else {
			upcomingGroups.push({ day: l.day, lessons: [l] });
		}
	}

	// Kicker = weekday + date in Vietnam timezone so it stays aligned with
	// greeting, today's schedule, and server-counted reminder cards.
	const kicker = now.toLocaleDateString("vi-VN", {
		timeZone: "Asia/Ho_Chi_Minh",
		weekday: "long",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const outstanding = tuitionTotals(data.invoices).outstanding;
	const ungraded = data.assignments.filter((a) => a.status !== "graded").length;

	return (
		<div>
			<PageHead
				kicker={kicker}
				title={formatDashboardGreeting(displayName, now)}
				action={
					<MorningSpot decorative className="-mb-4 hidden w-44 md:block" />
				}
			/>
			{/* Khu vực "Việc cần làm hôm nay": 3 thẻ lối tắt 1-2-3 từ GET /api/dashboard/reminders. */}
			<section className="mb-8" aria-busy={reminders.isPending}>
				<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
					<h2 className="font-semibold text-lg tracking-tight">
						Việc cần làm hôm nay
					</h2>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void reminders.refetch()}
						disabled={reminders.isFetching}
					>
						Làm mới
					</Button>
				</div>
				{reminders.isPending ? (
					<div
						className={
							canAccessFinance
								? "grid grid-cols-1 gap-4 lg:grid-cols-3"
								: "grid grid-cols-1 gap-4 lg:grid-cols-2"
						}
					>
						<div className="h-40 animate-pulse rounded-xl bg-muted" />
						<div className="h-40 animate-pulse rounded-xl bg-muted" />
						{canAccessFinance && (
							<div className="h-40 animate-pulse rounded-xl bg-muted" />
						)}
					</div>
				) : reminders.isError ? (
					<p className="flex items-center gap-3 text-muted-foreground text-sm">
						Không tải được bộ đếm nhắc việc.
						<Button
							variant="outline"
							size="sm"
							onClick={() => void reminders.refetch()}
						>
							Thử lại
						</Button>
					</p>
				) : (
					<ReminderCards
						data={reminders.data}
						canAccessFinance={canAccessFinance}
					/>
				)}
			</section>
			{/* Hàng KPI tổng quan toàn org: thống nhất phạm vi, ẩn thẻ tài chính theo quyền. */}
			<div
				className={
					canAccessFinance
						? "mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3"
						: "mb-8 grid grid-cols-2 gap-4"
				}
			>
				<Stat label="Tổng học viên" value={String(data.students.length)} />
				<Stat label="Bài tập chưa có điểm" value={String(ungraded)} />
				{canAccessFinance && (
					<Stat
						label="Còn phải thu"
						value={fmtVND(outstanding)}
						hot={outstanding > 0}
						className="col-span-2 sm:col-span-1"
					/>
				)}
			</div>
			<div className="space-y-8 xl:grid xl:grid-cols-2 xl:gap-8 xl:space-y-0 2xl:grid-cols-[1.2fr_1fr] 2xl:gap-10">
				<section className="min-w-0">
					<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
						<h2 className="font-semibold text-lg tracking-tight">
							Lịch hôm nay
						</h2>
						<Link
							to="/schedule"
							className="text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
						>
							Xem tuần →
						</Link>
					</div>
					<div className="flex flex-col">
						{todayGroups.length === 0 && (
							<p className="text-muted-foreground text-sm">
								Không có buổi dạy hôm nay.
							</p>
						)}
						{todayGroups.map((g) => {
							const className = classById(g.classId)?.name ?? "Lớp";

							return (
								<ScheduleRow
									key={`${g.classId}-${g.time}`}
									time={g.time}
									className={className}
									meta={formatClassSessionMeta(g)}
								/>
							);
						})}
					</div>
					<div className="mt-8">
						<SectionTitle>Lịch sắp tới</SectionTitle>
						{upcoming.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								Không có buổi dạy sắp tới trong tuần.
							</p>
						) : (
							upcomingGroups.map((group) => {
								const classSessions = groupLessonsByClassSession(group.lessons);
								return (
									<div key={group.day}>
										<div className="mt-4 mb-2 font-medium text-sm">
											{lessonDayLabel(group.day)}
										</div>
										<div className="flex flex-col">
											{classSessions.map((g) => {
												const className = classById(g.classId)?.name ?? "Lớp";

												return (
													<ScheduleRow
														key={`${group.day}-${g.classId}-${g.time}`}
														time={g.time}
														className={className}
														meta={formatClassSessionMeta(g)}
													/>
												);
											})}
										</div>
									</div>
								);
							})
						)}
					</div>
				</section>
				<Card
					data-testid="dashboard-risk-card"
					className="min-w-0 self-start p-4 sm:p-6"
				>
					<h2 className="mb-4 font-semibold leading-none">Cần kiểm tra</h2>
					{risk.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Không có học viên cần kiểm tra.
						</p>
					) : (
						<div
							data-testid="dashboard-risk-table-wrap"
							className="w-full overflow-x-auto rounded-xl border bg-card"
						>
							<table className="block w-full border-collapse text-sm sm:table">
								<thead className="hidden sm:table-header-group">
									<tr className="border-b">
										<th className="h-10 whitespace-nowrap px-2.5 text-left align-middle font-medium text-muted-foreground">
											Học viên
										</th>
										<th className="h-10 whitespace-nowrap px-2.5 text-left align-middle font-medium text-muted-foreground">
											Vấn đề
										</th>
										<th className="h-10 whitespace-nowrap px-2.5 text-left align-middle font-medium text-muted-foreground">
											Còn
										</th>
									</tr>
								</thead>
								<tbody className="block sm:table-row-group [&>tr:hover]:bg-muted/50 [&>tr:last-child]:border-b-0">
									{risk.map((row) => {
										const remainingLabel = row.student.hasPackage
											? `còn ${row.student.pkg.remaining} buổi`
											: "Chưa có gói";
										return (
											<tr
												key={row.student.id}
												className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-3 py-3 transition-colors sm:table-row sm:px-0 sm:py-0"
											>
												<td className="order-1 block min-w-0 flex-1 p-0 sm:order-none sm:table-cell sm:flex-none sm:px-2.5 sm:py-2.5 sm:align-middle">
													<div className="flex min-w-0 items-center gap-2">
														<Avatar text={row.student.avatar} size="sm" />
														<span className="min-w-0 break-words font-medium [overflow-wrap:anywhere] sm:font-normal">
															{row.student.name}
														</span>
													</div>
												</td>
												<td className="order-3 block w-full p-0 sm:order-none sm:table-cell sm:w-auto sm:px-2.5 sm:py-2.5 sm:align-middle">
													<div className="flex flex-wrap gap-1">
														{row.reasons.map((reason) => (
															<Badge key={reason} variant="warn">
																{RISK_LABEL[reason]}
															</Badge>
														))}
													</div>
												</td>
												<td className="order-2 block shrink-0 p-0 text-right text-muted-foreground text-xs sm:order-none sm:table-cell sm:px-2.5 sm:py-2.5 sm:text-left sm:align-middle sm:text-foreground sm:text-sm">
													<span className="whitespace-nowrap tabular-nums">
														{remainingLabel}
													</span>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
