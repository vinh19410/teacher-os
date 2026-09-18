import {
	createFileRoute,
	Link,
	redirect,
	useRouteContext,
} from "@tanstack/react-router";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import {
	atRiskRows,
	type DashboardRiskReason,
	formatDashboardGreeting,
	formatDashboardLead,
	lessonsToday,
} from "@/lib/dashboard-from-kernel";
import { useData } from "@/lib/data-store";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardRoute,
});

const RISK_LABEL: Record<DashboardRiskReason, string> = {
	absent: "Vắng",
	"missed-check-in": "Miss check-in",
};

function DashboardRoute() {
	const { session } = useRouteContext({ from: "/_auth" });
	const { data, studentById } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	if (!session?.data?.user) {
		throw redirect({ to: "/login" });
	}

	const displayName = session.data.user.name || "Giáo viên";
	const now = new Date();
	const today = lessonsToday(data.lessons, now);
	const risk = atRiskRows(data.students, data.lessons, now);

	return (
		<div>
			<PageHead
				title={formatDashboardGreeting(displayName, now)}
				lead={formatDashboardLead(now, today.length)}
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h2 className="font-semibold text-xl">Lịch hôm nay</h2>
				<Link
					to="/schedule"
					className="px-2 font-medium text-accent-blue text-xs hover:text-accent-active"
				>
					Xem tuần →
				</Link>
			</div>
			<div className="flex flex-col gap-4">
				{today.length === 0 && (
					<p className="font-mono text-meta text-xs">
						Không có buổi học nào hôm nay.
					</p>
				)}
				{today.map((l) => {
					const s = studentById(l.sid);
					if (!s) return null;
					return (
						<Card
							key={l.id}
							variant="white"
							className="flex items-center gap-4"
						>
							<Avatar text={s.avatar} size="md" />
							<div className="min-w-0 flex-1">
								<div className="font-semibold text-sm">{s.name}</div>
								<div className="font-mono text-meta text-xs">
									{l.time} · {l.dur}' · {l.type} · {l.topic}
								</div>
							</div>
							{l.status === "completed" ? (
								<Badge variant="success" dot>
									Đã học
								</Badge>
							) : (
								<Button
									size="sm"
									disabled={busy || isPending(l.id)}
									onClick={() =>
										void run(
											l.id,
											{ type: "check-in", lessonId: l.id },
											"Đã điểm danh.",
										)
									}
								>
									{isPending(l.id) ? "Đang lưu…" : "Điểm danh"}
								</Button>
							)}
						</Card>
					);
				})}
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
