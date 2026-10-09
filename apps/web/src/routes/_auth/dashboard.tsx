import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
import { MorningSpot } from "@teacher-os/ui/components/illustrations";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import {
	atRiskRows,
	type DashboardRiskReason,
	formatDashboardGreeting,
	groupLessonsByClassSession,
	lessonsToday,
	upcomingLessonsThisWeek,
} from "@/lib/dashboard-from-kernel";
import { useData } from "@/lib/data-store";
import { lessonDayLabel } from "@/lib/format-schedule";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardRoute,
});

const RISK_LABEL: Record<DashboardRiskReason, string> = {
	absent: "Vắng",
	"missed-check-in": "Miss check-in",
};

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

	return (
		<div>
			<PageHead
				kicker={kicker}
				title={formatDashboardGreeting(displayName, now)}
				action={
					<MorningSpot decorative className="-mb-4 hidden w-44 md:block" />
				}
			/>
			<div className="gap-10 lg:grid lg:grid-cols-[1.4fr_1fr]">
				<section>
					<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
						<h2 className="font-display font-extrabold text-2xl tracking-[-0.02em]">
							Lịch hôm nay
						</h2>
						<Link
							to="/schedule"
							className="font-mono text-hot text-xs hover:underline"
						>
							Xem tuần →
						</Link>
					</div>
					<div className="flex flex-col">
						{todayGroups.length === 0 && (
							<p className="font-mono text-meta text-xs">
								Không có buổi học nào hôm nay.
							</p>
						)}
						{todayGroups.map((g) => {
							const className = classById(g.classId)?.name ?? "Lớp";

							return (
								<div
									key={`${g.classId}-${g.time}`}
									className="grid grid-cols-[80px_1fr] items-center gap-4 border-line border-t py-4"
								>
									<span className="font-mono text-2xl leading-none">
										{g.time}
									</span>
									<span>
										<span className="block font-medium">{className}</span>
										<span className="text-meta text-sm">
											{g.dur}&apos; · {g.type} · {g.topic}
										</span>
									</span>
								</div>
							);
						})}
					</div>
					<div className="mt-8">
						<SectionLabel>Lịch sắp tới</SectionLabel>
						{upcoming.length === 0 ? (
							<p className="font-mono text-meta text-xs">
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
													<div
														key={`${group.day}-${g.classId}-${g.time}`}
														className="grid grid-cols-[80px_1fr] items-center gap-4 border-line border-t py-4"
													>
														<span className="font-mono text-2xl leading-none">
															{g.time}
														</span>
														<span>
															<span className="block font-medium">
																{className}
															</span>
															<span className="text-meta text-sm">
																{g.dur}&apos; · {g.type} · {g.topic}
															</span>
														</span>
													</div>
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
					<div className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
						Học viên rủi ro
					</div>
					<h2 className="mt-1 mb-5 font-display font-extrabold text-2xl tracking-[-0.02em]">
						Cần kiểm tra
					</h2>
					{risk.length === 0 ? (
						<p className="font-mono text-meta text-xs">
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
									<span className="font-mono">
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
