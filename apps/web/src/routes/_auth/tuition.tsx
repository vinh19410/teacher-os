import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddInvoiceModal } from "@/components/modals/add-invoice-modal";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { useData } from "@/lib/data-store";
import { fmtVND } from "@/lib/mock-data";
import {
	formatDue,
	packagesEndingSoon,
	tuitionTotals,
} from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export const Route = createFileRoute("/_auth/tuition")({
	component: TuitionRoute,
});

const INV_LABEL: Record<string, string> = {
	paid: "Đã thu",
	overdue: "Quá hạn",
	unpaid: "Chưa thu",
};

export function TuitionRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const [modalOpen, setModalOpen] = useState(false);

	// Issues #62/#135 — every number on this page derives from the kernel
	// store; nothing is hardcoded. The command bus refetches after mark-paid,
	// so totals track the server without local arithmetic.
	const { collected, outstanding } = tuitionTotals(data.invoices);
	const endingSoon = packagesEndingSoon(data.students);

	return (
		<div>
			<PageHead title="Học phí" lead={`Đã thu ${fmtVND(collected)}`} />
			<div className="grid grid-cols-3 gap-4 max-app:grid-cols-1">
				<StatCard num={fmtVND(collected)} label="Đã thu (VND)" />
				<StatCard
					num={fmtVND(outstanding)}
					label="Còn nợ (VND)"
					className={
						outstanding > 0 ? "[&>div:first-child]:text-danger" : undefined
					}
				/>
				<StatCard
					num={String(endingSoon)}
					label="Gói sắp hết"
					className="[&>div:first-child]:text-warn"
				/>
			</div>

			<div className="mt-8">
				<SectionLabel>Gói học đang hoạt động</SectionLabel>
				{data.students.length === 0 ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="tuition-packages-empty"
					>
						<p className="font-mono text-meta text-xs">
							Chưa có gói học nào đang hoạt động.
						</p>
					</Card>
				) : (
					<Card variant="white" className="p-0">
						<DataTable
							headers={[
								"Học viên",
								"Đã học",
								"Còn",
								"Tiến độ",
								"Hết hạn",
								"Trạng thái",
							]}
							emptyMessage="Chưa có gói học."
							rows={data.students.map((s) => ({
								onClick: () =>
									navigate({
										to: "/students/$studentId",
										params: { studentId: s.id },
									}),
								cells: [
									<div key="s" className="flex items-center gap-2">
										<Avatar text={s.avatar} size="sm" />
										{s.name}
									</div>,
									<span key="d" className="font-mono">
										{s.pkg.done}/{s.pkg.total}
									</span>,
									<span
										key="r"
										className={
											s.pkg.remaining <= 3
												? "font-mono font-semibold text-danger"
												: "font-mono font-semibold"
										}
									>
										{s.pkg.remaining}
									</span>,
									<Progress
										key="p"
										value={(s.pkg.done / s.pkg.total) * 100}
										variant={
											s.pkg.remaining <= 2
												? "low"
												: s.pkg.remaining <= 4
													? "warn"
													: "default"
										}
									/>,
									<span key="e" className="font-mono text-meta text-xs">
										{s.pkg.expiry}
									</span>,
									s.pkg.remaining <= 2 ? (
										<Badge key="b" variant="danger">
											Sắp hết
										</Badge>
									) : s.pkg.remaining <= 4 ? (
										<Badge key="b" variant="warn">
											Sắp hết
										</Badge>
									) : (
										<Badge key="b" variant="success" dot>
											Đang học
										</Badge>
									),
								],
							}))}
						/>
					</Card>
				)}
			</div>

			<div className="mt-8">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-4">
					<h2 className="font-semibold text-xl">Hóa đơn</h2>
					<Button size="sm" onClick={() => setModalOpen(true)}>
						+ Tạo hóa đơn
					</Button>
				</div>
				{data.invoices.length === 0 ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="tuition-invoices-empty"
					>
						<h3 className="font-display font-semibold text-base">
							Chưa có hóa đơn nào
						</h3>
						<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
							Tạo hóa đơn học phí để theo dõi các khoản thu và công nợ của học
							viên.
						</p>
						<div className="mt-4 flex justify-center">
							<Button size="sm" onClick={() => setModalOpen(true)}>
								+ Tạo hóa đơn
							</Button>
						</div>
					</Card>
				) : (
					<Card variant="white" className="p-0">
						<DataTable
							headers={[
								"Mã",
								"Học viên",
								"Loại",
								"Số tiền",
								"Ngày",
								"Đến hạn",
								"Trạng thái",
								"",
							]}
							emptyMessage="Chưa có hóa đơn."
							rows={data.invoices.map((i) => {
								const s = data.students.find((st) => st.id === i.sid);
								return {
									cells: [
										<span key="id" className="font-mono text-meta text-xs">
											{i.id}
										</span>,
										s?.name ?? "",
										<span key="t" title={i.note || undefined}>
											<Tag>{i.type}</Tag>
										</span>,
										<span key="a" className="font-mono">
											{fmtVND(i.amount)}
										</span>,
										<span key="d" className="font-mono text-meta text-xs">
											{i.date}
										</span>,
										<span key="due" className="font-mono text-meta text-xs">
											{i.status === "paid" ? "—" : formatDue(i.due)}
										</span>,
										i.status === "paid" ? (
											<Badge key="b" variant="success" dot>
												{INV_LABEL.paid}
											</Badge>
										) : i.status === "overdue" ? (
											<Badge key="b" variant="danger" dot>
												{INV_LABEL.overdue}
											</Badge>
										) : (
											<Badge key="b" variant="warn" dot>
												{INV_LABEL.unpaid}
											</Badge>
										),
										i.status !== "paid" ? (
											<Button
												key="act"
												variant="ghost"
												size="sm"
												disabled={busy || isPending(i.id)}
												onClick={() =>
													void run(
														i.id,
														{
															type: "mark-invoice-paid",
															invoiceId: i.id,
															method: i.method === "—" ? "CK" : i.method,
														},
														"Đã ghi nhận thanh toán.",
													)
												}
											>
												{isPending(i.id) ? "Đang lưu…" : "Đã nhận"}
											</Button>
										) : (
											<span key="m" className="font-mono text-meta text-xs">
												{i.method}
											</span>
										),
									],
								};
							})}
						/>
					</Card>
				)}
			</div>
			<AddInvoiceModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
