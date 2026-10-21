import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { CreateReportModal } from "@/components/modals/create-report-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionTitle } from "@/components/ui/section-label";
import { Stat } from "@/components/ui/stat";
import { useData } from "@/lib/data-store";
import { PARENT_REPORTS_ENABLED } from "@/lib/features";

export const Route = createFileRoute("/_auth/reports")({
	beforeLoad: () => {
		if (!PARENT_REPORTS_ENABLED) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: ReportsRoute,
});

const STATUS_VARIANT: Record<string, "success" | "accent" | "muted"> = {
	read: "success",
	sent: "accent",
	draft: "muted",
};
const STATUS_LABEL: Record<string, string> = {
	read: "Đã đọc",
	sent: "Đã gửi",
	draft: "Nháp",
};

export function ReportsRoute() {
	const { data } = useData();
	const [modalOpen, setModalOpen] = useState(false);
	// Issue #172: Teacher OS currently does not have a connected Zalo OA channel.
	// When unconnected, the CTA / claim "Gửi qua Zalo OA" is hidden to prevent
	// fake integration promises; the UI honestly reports the report count and
	// connection status badge.
	const isZaloConnected = false;

	const sendLog = data.reports
		.filter((r) => r.status === "sent" || r.status === "read")
		.map((r) => {
			const s = data.students.find((st) => st.id === r.sid);
			return {
				id: r.id,
				date: r.sent,
				title: `Báo cáo tuần → ${s?.name ?? "Học viên"}`,
				desc: r.read
					? `Zalo OA · Phụ huynh đã mở ${r.read}`
					: "Zalo OA · Đã gửi",
				channel: "Zalo OA",
			};
		})
		.reverse();

	const reportCount = data.reports.length;

	return (
		<div>
			<PageHead
				title="Báo cáo phụ huynh"
				kicker={
					isZaloConnected ? (
						reportCount > 0 ? (
							`Gửi qua Zalo OA · ${reportCount} báo cáo`
						) : (
							"Gửi qua Zalo OA"
						)
					) : (
						<span className="flex flex-wrap items-center gap-2">
							<span>
								{reportCount > 0
									? `${reportCount} báo cáo`
									: "Chưa có báo cáo nào"}
							</span>
							<span className="text-muted-foreground">·</span>
							<Badge variant="muted">Zalo OA: Chưa kết nối</Badge>
						</span>
					)
				}
				action={
					<Button size="sm" onClick={() => setModalOpen(true)}>
						+ Tạo báo cáo tuần
					</Button>
				}
			/>
			{/* Hàng KPI theo khung Dashboard (design không có màn Reports riêng). */}
			<div className="mb-8 grid grid-cols-3 gap-4">
				<Stat label="Tổng báo cáo" value={String(reportCount)} />
				<Stat
					label="Đã gửi"
					value={String(
						data.reports.filter((r) => r.status !== "draft").length,
					)}
				/>
				<Stat
					label="Phụ huynh đã đọc"
					value={String(data.reports.filter((r) => r.read).length)}
				/>
			</div>
			<div className="mb-4">
				<SectionTitle description="Báo cáo tuần gửi phụ huynh qua Zalo OA">
					Báo cáo đã gửi
				</SectionTitle>
			</div>
			{data.reports.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Chưa có báo cáo nào được gửi.
				</p>
			) : (
				<Card variant="white" className="p-0">
					<DataTable
						headers={[
							"Học viên",
							"Chu kỳ",
							"Số buổi",
							"Trạng thái",
							"Gửi lúc",
							"Phụ huynh xem",
						]}
						rows={data.reports.map((r) => {
							const s = data.students.find((st) => st.id === r.sid);
							return {
								cells: [
									<div key="s" className="flex items-center gap-2">
										<Avatar text={s?.avatar ?? "?"} size="sm" />
										{s?.name}
									</div>,
									<span key="p" className="text-muted-foreground text-xs">
										{r.period}
									</span>,
									<span key="n" className="text-muted-foreground tabular-nums">
										{r.sessions}
									</span>,
									<Badge key="b" variant={STATUS_VARIANT[r.status]}>
										{STATUS_LABEL[r.status]}
									</Badge>,
									<span key="t" className="text-muted-foreground text-xs">
										{r.sent}
									</span>,
									r.read ? (
										<span key="r" className="text-muted-foreground text-xs">
											{r.read}
										</span>
									) : (
										<span key="r" className="text-muted-foreground text-xs">
											Chưa mở
										</span>
									),
								],
							};
						})}
					/>
				</Card>
			)}
			<div className="mt-8">
				<SectionTitle>Nhật ký gửi tin nhắn</SectionTitle>
				{sendLog.length === 0 ? (
					<p className="text-muted-foreground text-xs">
						Chưa có nhật ký gửi tin nhắn.
					</p>
				) : (
					<Card>
						{sendLog.map((l) => (
							<div
								key={l.id}
								className="grid grid-cols-[100px_1fr_auto] items-baseline gap-4 border-border border-t border-solid py-3 first:border-t-0 first:pt-0 max-app:grid-cols-1 max-app:gap-1"
							>
								<span className="text-muted-foreground text-xs">{l.date}</span>
								<div>
									<div className="font-medium text-sm">{l.title}</div>
									<div className="mt-0.5 text-muted-foreground text-xs">
										{l.desc}
									</div>
								</div>
								<span className="text-muted-foreground text-xs">
									{l.channel}
								</span>
							</div>
						))}
					</Card>
				)}
			</div>
			<CreateReportModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
