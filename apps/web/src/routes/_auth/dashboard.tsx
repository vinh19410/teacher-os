import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
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
	formatDashboardLead,
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

	return (
		<div>
			<PageHead
				title={formatDashboardGreeting(displayName, now)}
				lead={formatDashboardLead(now, todayGroups.length)}
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h2 className="font-semibold text-xl">Lịch hôm nay</h2>
				<Link
					to="/schedule"
					className="px-2 font-medium text-hot text-xs hover:text-accent-active"
				>
					Xem tuần →
				</Link>
			</div>
			<div className="flex flex-col gap-4">
				{todayGroups.length === 0 && (
					<p className="font-mono text-meta text-xs">
						Không có buổi học nào hôm nay.
					</p>
				)}
				{todayGroups.map((g) => {
					const className = classById(g.classId)?.name ?? "Lớp";

					return (
						<Card key={`${g.classId}-${g.time}`} variant="white">
							<div className="font-semibold text-sm">{className}</div>
							<div className="font-mono text-meta text-xs">
								{g.time} · {g.dur}' · {g.type} · {g.topic}
							</div>
						</Card>
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
								<div className="mt-4 mb-2 font-semibold text-sm">
									{lessonDayLabel(group.day)}
								</div>
								<div className="flex flex-col gap-2">
									{classSessions.map((g) => {
										const className = classById(g.classId)?.name ?? "Lớp";

										return (
											<Card
												key={`${group.day}-${g.classId}-${g.time}`}
												variant="white"
											>
												<div className="font-semibold text-sm">{className}</div>
												<div className="font-mono text-meta text-xs">
													{g.time} · {g.dur}&apos; · {g.type} · {g.topic}
												</div>
											</Card>
										);
									})}
								</div>
							</div>
						);
					})
				)}
			</div>
			<div className="mt-8">
				<SectionLabel>Học viên rủi ro</SectionLabel>
				{risk.length === 0 ? (
					<p className="font-mono text-meta text-xs">
						Không có học viên rủi ro.
					</p>
				) : (
					<Card variant="white" className="p-0">
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
					</Card>
				)}
			</div>
		</div>
	);
}
