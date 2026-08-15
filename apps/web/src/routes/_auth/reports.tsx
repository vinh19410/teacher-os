import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreateReportModal } from "@/components/modals/create-report-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/reports")({
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

const sendLog = [
	{
		date: "18/08 19:00",
		title: "Nhắc lịch → Minh Anh",
		desc: "Zalo · Đã gửi T−24h",
		channel: "Zalo",
	},
	{
		date: "18/08 19:00",
		title: "Báo cáo tuần → Minh Anh",
		desc: "Zalo OA · Phụ huynh đã mở 21:30",
		channel: "Zalo",
	},
	{
		date: "18/08 09:00",
		title: "Nhắc nợ → Quốc Bảo",
		desc: "Zalo · Quá hạn 5 ngày",
		channel: "Zalo",
	},
	{
		date: "17/08 20:00",
		title: "Nhắc nộp bài → Minh Anh",
		desc: "Email · Task 2 University",
		channel: "Email",
	},
	{
		date: "17/08 18:00",
		title: "Nhắc sắp hết gói → Quốc Bảo",
		desc: "Zalo · Còn 2 buổi",
		channel: "Zalo",
	},
];

function ReportsRoute() {
	const { data } = useData();
	const [modalOpen, setModalOpen] = useState(false);

	return (
		<div>
			<PageHead
				title="Báo cáo phụ huynh"
				lead="Gửi qua Zalo OA · 4 báo cáo tuần này"
			/>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
				<h2 className="font-semibold text-xl">Báo cáo đã gửi</h2>
				<Button size="sm" onClick={() => setModalOpen(true)}>
					+ Tạo báo cáo tuần
				</Button>
			</div>
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
								<span key="p" className="font-mono text-meta text-xs">
									{r.period}
								</span>,
								<span key="n" className="font-mono">
									{r.sessions}
								</span>,
								<Badge key="b" variant={STATUS_VARIANT[r.status]}>
									{STATUS_LABEL[r.status]}
								</Badge>,
								<span key="t" className="font-mono text-meta text-xs">
									{r.sent}
								</span>,
								r.read ? (
									<span key="r" className="font-mono text-meta text-xs">
										{r.read}
									</span>
								) : (
									<span key="r" className="text-muted-fg text-xs">
										Chưa mở
									</span>
								),
							],
						};
					})}
				/>
			</Card>
			<div className="mt-8">
				<SectionLabel>Nhật ký gửi tin nhắn</SectionLabel>
				<Card>
					{sendLog.map((l) => (
						<div
							key={`${l.date}-${l.title}`}
							className="grid grid-cols-[100px_1fr_auto] items-baseline gap-4 border-line-soft border-t border-solid py-3 first:border-t-0 first:pt-0 max-app:grid-cols-1 max-app:gap-1"
						>
							<span className="font-mono text-muted-fg text-xs">{l.date}</span>
							<div>
								<div className="font-medium text-sm">{l.title}</div>
								<div className="mt-0.5 text-muted-fg text-xs">{l.desc}</div>
							</div>
							<span className="font-mono text-meta text-xs">{l.channel}</span>
						</div>
					))}
				</Card>
			</div>
			<CreateReportModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
