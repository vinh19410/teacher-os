import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";
import { fmtK } from "@/lib/mock-data";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export const Route = createFileRoute("/_auth/dashboard")({
	component: DashboardRoute,
});

function DashboardRoute() {
	const { data, studentById } = useData();
	const { run, isPending, busy } = useDirectKernelAction();

	const today = data.lessons.filter((l) => l.day === 2);
	const risk = data.students.filter(
		(s) =>
			s.atRisk ||
			s.tags.includes("nợ học phí") ||
			s.tags.includes("sắp hết buổi"),
	);

	return (
		<div>
			<PageHead
				title="Chào buổi sáng, cô Lan"
				lead="Thứ Ba, 19/08 · Hôm nay có 2 buổi học"
			/>
			<div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[2fr_1fr]">
				<div>
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
				</div>
				<div>
					<SectionLabel>Cần xử lý</SectionLabel>
					<Card>
						{[
							{
								dot: "bg-danger",
								text: "Quốc Bảo nợ 1.000k — quá hạn 5 ngày",
								meta: "INV-084 · 05/08",
							},
							{
								dot: "bg-warn",
								text: "Quốc Bảo sắp hết gói — còn 2 buổi",
								meta: "Hết hạn 15/09",
							},
							{
								dot: "bg-warn",
								text: "Minh Anh sắp hết gói — còn 4 buổi",
								meta: "Hết hạn 15/11",
							},
							{
								dot: "bg-accent-blue",
								text: "Minh Anh chưa nộp Task 2 (trễ 1 ngày)",
								meta: "Hạn 20/08",
							},
							{
								dot: "bg-accent-blue",
								text: "Quốc Bảo vắng 2 buổi liên tiếp",
								meta: "Cần liên hệ phụ huynh",
							},
						].map((a) => (
							<div
								key={a.meta}
								className="flex items-start gap-3 border-line-soft border-t border-solid py-3 first:border-t-0 first:pt-0"
							>
								<span
									className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${a.dot}`}
								/>
								<div>
									<div className="text-sm leading-[1.45]">{a.text}</div>
									<div className="mt-0.5 font-mono text-[11px] text-meta">
										{a.meta}
									</div>
								</div>
							</div>
						))}
					</Card>
				</div>
			</div>
			<div className="mt-8">
				<SectionLabel>Tuần này · 19–25/08</SectionLabel>
				<div className="grid app:grid-cols-4 grid-cols-2 gap-4 max-app:grid-cols-1">
					<StatCard num="7.5" label="giờ dạy" />
					<StatCard num="6.2tr" label="đã thu (VND)" />
					<StatCard
						num="2.0tr"
						label="còn nợ (VND)"
						className="[&>div:first-child]:text-danger"
					/>
					<StatCard
						num="2"
						label="sắp hết gói"
						className="[&>div:first-child]:text-warn"
					/>
				</div>
				<div className="mt-8">
					<SectionLabel>Học viên rủi ro</SectionLabel>
					<Card variant="white" className="p-0">
						<DataTable
							headers={["Học viên", "Vấn đề", "Còn", "Nợ"]}
							rows={risk.map((s) => {
								const issues: string[] = [];
								if (s.tags.includes("nợ học phí")) issues.push("Nợ học phí");
								if (s.tags.includes("sắp hết buổi"))
									issues.push("Sắp hết buổi");
								if (s.atRisk) issues.push("Vắng 2 buổi");
								const debt = data.invoices
									.filter(
										(i) =>
											i.sid === s.id &&
											(i.status === "overdue" || i.status === "unpaid"),
									)
									.reduce((a, b) => a + b.amount, 0);
								return {
									onClick: () => undefined,
									cells: [
										<div className="flex items-center gap-2">
											<Avatar text={s.avatar} size="sm" />
											{s.name}
										</div>,
										<div className="flex flex-wrap gap-1">
											{issues.map((i) => (
												<Badge key={i} variant="warn">
													{i}
												</Badge>
											))}
										</div>,
										<span className="font-mono">{s.pkg.remaining}</span>,
										<span className="font-mono">
											{debt > 0 ? fmtK(debt) : "—"}
										</span>,
									],
								};
							})}
						/>
					</Card>
				</div>
			</div>
		</div>
	);
}
