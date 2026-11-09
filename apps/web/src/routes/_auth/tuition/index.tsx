import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { AddInvoiceModal } from "@/components/modals/add-invoice-modal";
import {
	InvoicePaymentModal,
	UnmatchedTransactions,
} from "@/components/modals/invoice-payment-modal";
import { InvoiceStatusCell } from "@/components/tuition/invoice-status-cell";
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
import { invoiceCode, invoiceType } from "@/lib/format-invoice";
import { fmtVND } from "@/lib/mock-data";
import {
	effectiveInvoiceStatus,
	formatDue,
	type RevenuePeriod,
	revenueByPeriod,
	tuitionTotals,
} from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { useFinanceRouteGuard } from "@/lib/use-finance-route-guard";
import { todayISOVietnam } from "@/lib/week-grid";

// #343 — lazy-load chart: recharts (~100 kB gzip) phải thành chunk riêng chỉ
// /tuition tải, không được nằm trong entry bundle của mọi route.
const RevenueChart = lazy(() =>
	import("@/components/tuition/revenue-chart").then((m) => ({
		default: m.RevenueChart,
	})),
);

export const Route = createFileRoute("/_auth/tuition/")({
	// #343 — kỳ doanh thu sống trong URL (?ky=month|quarter|year). Parse
	// non-throw như schedule: giá trị lạ rơi về undefined → component dùng
	// mặc định "month", validateSearch không throw/redirect.
	validateSearch: (
		search: Record<string, unknown>,
	): { ky?: RevenuePeriod } => ({
		ky:
			search.ky === "month" || search.ky === "quarter" || search.ky === "year"
				? search.ky
				: undefined,
	}),
	component: TuitionRoute,
});

export function TuitionRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const canAccessFinance = useFinanceRouteGuard();
	const { run, isPending, busy } = useDirectKernelAction();
	const [modalOpen, setModalOpen] = useState(false);
	// #320: invoice currently open in the "Thu học phí" QR modal.
	const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
	const search = Route.useSearch();
	const period: RevenuePeriod = search.ky ?? "month";

	// Issues #62/#135 — every number on this page derives from the kernel
	// store; nothing is hardcoded. The command bus refetches after mark-paid,
	// so totals track the server without local arithmetic.
	const { collected, outstanding } = tuitionTotals(data.invoices);
	// Stat "Chưa khớp" = số hóa đơn chưa thu đủ (cùng nguồn với queue
	// "Giao dịch chưa khớp" bên dưới).
	const unmatchedCount = data.invoices.filter(
		(i) => i.status !== "paid" || i.paidAmount < i.amount,
	).length;
	// "Hôm nay" một lần cho cả bảng (#322) — badge "Quá hạn" suy ra từ `due`.
	const today = todayISOVietnam();
	// #343 — bucket doanh thu theo múi giờ đã xử lý trong helper
	// (Asia/Ho_Chi_Minh); kỳ hiện tại tự cập nhật khi polling snapshot.
	const revenue = useMemo(
		() => revenueByPeriod(data.invoices, period, new Date()),
		[data.invoices, period],
	);

	// `ky` là search param duy nhất của route — object form giữ URL sạch,
	// replace để toggle filter không dồn history (tiền lệ /assignments).
	const setPeriod = (next: RevenuePeriod) => {
		void navigate({ to: "/tuition", search: { ky: next }, replace: true });
	};

	if (!canAccessFinance) return null;

	return (
		<div>
			<PageHead
				kicker="Doanh thu · VietQR qua SePay"
				title="Doanh thu"
				lead={`Đã thu ${fmtVND(collected)}`}
				// Design Tuition: CTA chính nằm ở PageHead action.
				action={
					<Button
						data-testid="create-invoice"
						onClick={() => setModalOpen(true)}
					>
						+ Tạo hóa đơn
					</Button>
				}
			/>
			{/* Design Tuition: stat 2x2 bên trái, card biểu đồ cạnh phải. */}
			<div className="grid gap-4 max-app:grid-cols-1 lg:grid-cols-[1fr_1.2fr]">
				<div
					className="grid grid-cols-2 content-start gap-4 max-app:grid-cols-1"
					data-testid="tuition-kpis"
				>
					<StatCard num={fmtVND(collected)} label="Đã thu (VND)" />
					{/* Số còn phải thu cần chú ý → tile hot (số đỏ). */}
					<StatCard
						num={fmtVND(outstanding)}
						label="Còn phải thu (VND)"
						hot={outstanding > 0}
					/>
					<StatCard
						num={String(data.invoices.length)}
						label="Số hóa đơn"
						sub={`${data.invoices.filter((i) => i.status === "paid").length} đã thu đủ`}
					/>
					<StatCard
						num={String(unmatchedCount)}
						label="Chưa khớp"
						sub="hóa đơn còn thiếu tiền"
					/>
				</div>
				<Card
					className="p-6 max-app:order-first"
					data-testid="tuition-revenue-chart"
				>
					<Suspense fallback={null}>
						<RevenueChart
							buckets={revenue.buckets}
							period={period}
							dropped={revenue.dropped}
							onPeriodChange={setPeriod}
						/>
					</Suspense>
				</Card>
			</div>

			<div className="mt-8">
				<SectionLabel>Gói học đang hoạt động</SectionLabel>
				{data.students.length === 0 ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="tuition-packages-empty"
					>
						<p className="text-muted-foreground text-sm">
							Chưa có gói học nào đang hoạt động.
						</p>
					</Card>
				) : (
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
										s.hasPackage && s.pkg.total > 0 && s.pkg.remaining <= 3
											? "font-mono font-semibold text-destructive"
											: "font-mono font-semibold"
									}
								>
									{s.hasPackage ? s.pkg.remaining : "—"}
								</span>,
								<Progress
									key="p"
									value={
										s.hasPackage && s.pkg.total > 0
											? (s.pkg.done / s.pkg.total) * 100
											: 0
									}
									variant={
										!s.hasPackage || s.pkg.total === 0
											? "default"
											: s.pkg.remaining <= 2
												? "low"
												: s.pkg.remaining <= 4
													? "warn"
													: "default"
									}
								/>,
								<span key="e" className="text-muted-foreground text-xs">
									{s.pkg.expiry}
								</span>,
								!s.hasPackage ? (
									<Badge key="b" variant="muted">
										Chưa có gói
									</Badge>
								) : s.pkg.total === 0 ? (
									<Badge key="b" variant="muted">
										Chưa xếp buổi
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
				)}
			</div>

			<div className="mt-8" data-testid="tuition-invoices-section">
				<SectionLabel>Hóa đơn</SectionLabel>
				{data.invoices.length === 0 ? (
					<Card
						variant="white"
						className="p-8 text-center"
						data-testid="tuition-invoices-empty"
					>
						<h3 className="font-semibold text-base">Chưa có hóa đơn nào</h3>
						<p className="mx-auto mt-2 max-w-md text-muted-foreground text-sm">
							Bấm "+ Tạo hóa đơn" ở góc trên để theo dõi các khoản thu và công
							nợ của học viên.
						</p>
					</Card>
				) : (
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
								// #345 — click/Enter trên dòng mở trang chi tiết;
								// nút trong dòng chặn propagation ở cell hành động.
								onClick: () =>
									navigate({
										to: "/tuition/$invoiceId",
										params: { invoiceId: i.id },
										search: { ky: search.ky },
									}),
								cells: [
									// Mã hóa đơn như mã chuyển khoản: mono + underline,
									// hover đậm kế thừa từ hover row.
									<span
										key="id"
										className="font-mono text-xs underline decoration-border underline-offset-2"
									>
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
									<span key="d" className="text-muted-foreground text-xs">
										{i.date}
									</span>,
									<span key="due" className="text-muted-foreground text-xs">
										{i.status === "paid" ? "—" : formatDue(i.due)}
									</span>,
									<InvoiceStatusCell invoice={i} status={status} />,
									i.status !== "paid" ? (
										// biome-ignore lint/a11y/noStaticElementInteractions: wrapper chỉ stopPropagation (click + Enter/Space) để nút trong dòng không kích hoạt điều hướng của row (#345)
										<div
											key="act"
											className="flex justify-end gap-1"
											onClick={(e) => e.stopPropagation()}
											onKeyDown={(e) => {
												if (e.key === " " || e.key === "Enter")
													e.stopPropagation();
											}}
										>
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
										<span key="m" className="text-muted-foreground text-xs">
											{i.method}
										</span>
									),
								],
							};
						})}
					/>
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
