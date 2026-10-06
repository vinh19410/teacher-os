import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AddInvoiceModal } from "@/components/modals/add-invoice-modal";
import {
	InvoicePaymentModal,
	UnmatchedTransactions,
} from "@/components/modals/invoice-payment-modal";
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
import {
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_VARIANT,
	invoiceCode,
	invoiceType,
} from "@/lib/format-invoice";
import { fmtVND } from "@/lib/mock-data";
import {
	effectiveInvoiceStatus,
	formatDue,
	packagesEndingSoon,
	tuitionTotals,
} from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { todayISOVietnam } from "@/lib/week-grid";

export const Route = createFileRoute("/_auth/tuition")({
	component: TuitionRoute,
});

export function TuitionRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();
	const [modalOpen, setModalOpen] = useState(false);
	// #320: invoice currently open in the "Thu học phí" QR modal.
	const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);

	// Issues #62/#135 — every number on this page derives from the kernel
	// store; nothing is hardcoded. The command bus refetches after mark-paid,
	// so totals track the server without local arithmetic.
	const { collected, outstanding } = tuitionTotals(data.invoices);
	const endingSoon = packagesEndingSoon(data.students);
	// "Hôm nay" một lần cho cả bảng (#322) — badge "Quá hạn" suy ra từ `due`.
	const today = todayISOVietnam();

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
										{s.hasPackage ? `${s.pkg.done}/${s.pkg.total}` : "—"}
									</span>,
									<span
										key="r"
										className={
											s.hasPackage && s.pkg.remaining <= 3
												? "font-mono font-semibold text-danger"
												: "font-mono font-semibold"
										}
									>
										{s.hasPackage ? s.pkg.remaining : "—"}
									</span>,
									<Progress
										key="p"
										value={s.hasPackage ? (s.pkg.done / s.pkg.total) * 100 : 0}
										variant={
											!s.hasPackage
												? "default"
												: s.pkg.remaining <= 2
													? "low"
													: s.pkg.remaining <= 4
														? "warn"
														: "default"
										}
									/>,
									<span key="e" className="font-mono text-meta text-xs">
										{s.pkg.expiry}
									</span>,
									!s.hasPackage ? (
										<Badge key="b" variant="muted">
											Chưa có gói
										</Badge>
									) : s.pkg.remaining <= 2 ? (
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
							Bấm "+ Tạo hóa đơn" ở góc trên để theo dõi các khoản thu và công
							nợ của học viên.
						</p>
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
								const status = effectiveInvoiceStatus(i, today);
								return {
									cells: [
										<span key="id" className="font-mono text-meta text-xs">
											{invoiceCode(i.id)}
										</span>,
										s?.name ?? "",
										<span key="t" title={i.note || undefined}>
											<Tag>{invoiceType(i.type)}</Tag>
										</span>,
										<span key="a" className="font-mono">
											{i.status !== "paid" &&
											i.paidAmount > 0 &&
											i.paidAmount < i.amount
												? `${fmtVND(i.paidAmount)} / ${fmtVND(i.amount)}`
												: fmtVND(i.amount)}
										</span>,
										<span key="d" className="font-mono text-meta text-xs">
											{i.date}
										</span>,
										<span key="due" className="font-mono text-meta text-xs">
											{i.status === "paid" ? "—" : formatDue(i.due)}
										</span>,
										status === "paid" ? (
											<Badge
												key="b"
												variant={INVOICE_STATUS_VARIANT[status]}
												dot
											>
												{INVOICE_STATUS_LABEL[status]}
											</Badge>
										) : i.paidAmount > 0 ? (
											<Badge key="b" variant="warn" dot>
												Thu một phần
											</Badge>
										) : (
											<Badge
												key="b"
												variant={INVOICE_STATUS_VARIANT[status]}
												dot
											>
												{INVOICE_STATUS_LABEL[status]}
											</Badge>
										),
										i.status !== "paid" ? (
											<div key="act" className="flex justify-end gap-1">
												<Button
													variant="ghost"
													size="sm"
													onClick={() => setPayingInvoiceId(i.id)}
												>
													Thu học phí
												</Button>
												<Button
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
											</div>
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
			<UnmatchedTransactions
				openInvoices={data.invoices
					.filter((i) => i.status !== "paid" || i.paidAmount < i.amount)
					.map((i) => ({
						id: i.id,
						label:
							invoiceCode(i.id) +
							" · " +
							(data.students.find((st) => st.id === i.sid)?.name ?? "") +
							" · còn " +
							fmtVND(i.amount - i.paidAmount),
					}))}
			/>
			<InvoicePaymentModal
				invoiceId={payingInvoiceId}
				open={payingInvoiceId !== null}
				onClose={() => setPayingInvoiceId(null)}
			/>
			<AddInvoiceModal open={modalOpen} onClose={() => setModalOpen(false)} />
		</div>
	);
}
