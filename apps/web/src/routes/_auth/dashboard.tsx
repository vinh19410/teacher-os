import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
import { MorningSpot } from "@teacher-os/ui/components/illustrations";
import {
	ReminderCards,
	remindersSectionTitle,
} from "@/components/dashboard/reminder-cards";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
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
	absent: "Vắng",
	"missed-check-in": "Miss check-in",
};

/**
 * Hàng lịch dùng chung cho "Lịch hôm nay" và "Lịch sắp tới" (issue #373):
 * cột giờ co theo nội dung (`auto` + `min-w-[5ch]` chống FOUT), giờ
 * `text-lg tabular-nums` đúng thứ bậc design thay vì token 40px;
 * tên lớp `min-w-0 break-words` để xuống dòng trong cột của nó.
 */
function ScheduleRow(props: { time: string; className: string; meta: string }) {
	return (
		<div className="grid grid-cols-[auto_1fr] items-baseline gap-4 border-border border-t py-4">
			<span className="min-w-[5ch] whitespace-nowrap text-lg tabular-nums tabular-nums leading-none">
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
		throw redirect({ to: "/login" });
	}

	const displayName = session.data.user.name || "Giáo viên";
	const now = new Date();
	const today = lessonsToday(data.lessons, now);
	const todayGroups = groupLessonsByClassSession(today);
	const risk = atRiskRows(data.students, data.lessons, now);
	const upcoming = upcomingLessonsThisWeek(data.lessons, now);

	// Bộ đếm thẻ nhắc việc đếm ở server (TOS-6 #439). Observer thứ 2 trên
	// cùng cache entry ["kernel"] (staleTime Infinity → không tự fetch):
	// dataUpdatedAt đổi mỗi khi bus refresh snapshot sau action kernel →
	// query key reminders đổi → TanStack Query tự refetch (refresh chạy
	// exact:true nên prefix không tự phủ — xem repos/dashboard-reminders.ts).
	const baseUrl = getApiBaseUrl();
	const { dataUpdatedAt: kernelUpdatedAt } = useQuery({
		...kernelQueryOptions(baseUrl),
		staleTime: Number.POSITIVE_INFINITY,
		notifyOnChangeProps: ["dataUpdatedAt"],
	});
	const reminders = useQuery({
		...dashboardRemindersQueryOptions(baseUrl, kernelUpdatedAt),
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

	// Kicker = weekday + date in Vietnamese, per the design's dashboard head.
	const kicker = now.toLocaleDateString("vi-VN", {
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
			{/* Khu vực "Việc cần làm hôm nay" (TOS-6 #439): 3 thẻ đếm từ
			GET /api/dashboard/reminders, đặt trên hàng KPI. */}
			<section className="mb-8" aria-busy={reminders.isPending}>
				<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
					<h2 className="font-semibold text-lg tracking-tight">
						{reminders.data
							? remindersSectionTitle(reminders.data.date)
							: "Việc cần làm hôm nay"}
					</h2>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => void reminders.refetch()}
						disabled={reminders.isFetching}
					>
						Làm mới dữ liệu
					</Button>
				</div>
				{reminders.isPending ? (
					<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
						<div className="h-40 animate-pulse rounded-lg bg-muted" />
						<div className="h-40 animate-pulse rounded-lg bg-muted" />
						<div className="h-40 animate-pulse rounded-lg bg-muted" />
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
					<ReminderCards data={reminders.data} />
				)}
			</section>
			{/* Hàng KPI v2 (design `Dashboard`): 4 thẻ Stat, số liệu tính từ
			kernel — không hard-code. */}
			<div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
				<Stat
					label="Buổi học hôm nay"
					value={String(todayGroups.length)}
					sub={
						upcoming.length > 0
							? `${upcoming.length} buổi còn lại tuần này`
							: undefined
					}
				/>
				<Stat
					label="Học viên"
					value={String(data.students.length)}
					sub={`${risk.length} cần kiểm tra`}
				/>
				<Stat
					label="Bài tập chưa có điểm"
					value={String(ungraded)}
					sub="trên tổng bài đã giao"
				/>
				<Stat
					label="Còn phải thu"
					value={fmtVND(outstanding)}
					hot={outstanding > 0}
					sub={`${data.invoices.length} hóa đơn`}
				/>
			</div>
			<div className="gap-10 lg:grid lg:grid-cols-[1.4fr_1fr]">
				<section>
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
								Không có buổi học nào hôm nay.
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
								Không có buổi học nào trong phần còn lại của tuần.
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
				<Card className="mb-10 self-start p-6 lg:mb-0">
					<h2 className="font-semibold leading-none">Cần kiểm tra</h2>
					<p className="mt-1.5 mb-5 text-muted-foreground text-sm">
						Học viên rủi ro: vắng mặt hoặc miss check-in
					</p>
					{risk.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Không có học viên rủi ro.
						</p>
					) : (
						<DataTable
							headers={["Học viên", "Vấn đề", "Còn"]}
							rows={risk.map((row) => ({
								cells: [
									<div className="flex items-center gap-2">
										<Avatar text={row.student.avatar} size="sm" />
										{row.student.name}
									</div>,
									<div className="flex flex-wrap gap-1">
										{row.reasons.map((reason) => (
											<Badge key={reason} variant="warn">
												{RISK_LABEL[reason]}
											</Badge>
										))}
									</div>,
									<span className="tabular-nums">
										{row.student.pkg.remaining}
									</span>,
								],
							}))}
						/>
					)}
				</Card>
			</div>
		</div>
	);
}
