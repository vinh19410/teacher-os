import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PaymentQrPanel } from "@teacher-os/ui/components/payments/payment-qr-panel";
import {
	InvoicePaymentActions,
	useInvoicePayment,
	usePaidAmountWatch,
} from "@/components/modals/invoice-payment-modal";
import { InvoiceStatusCell } from "@/components/tuition/invoice-status-cell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";
import { invoiceCode, invoiceType } from "@/lib/format-invoice";
import { fmtVND } from "@/lib/mock-data";
import {
	invoiceTransactionsQueryOptions,
	POLL_CAP_MS,
	POLL_INTERVAL_MS,
} from "@/lib/repos/payments";
import {
	effectiveInvoiceStatus,
	formatDue,
	invoiceReceived,
	type RevenuePeriod,
} from "@/lib/tuition-from-kernel";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";
import { todayISOVietnam } from "@/lib/week-grid";

// #345 — kỳ doanh thu được giữ qua URL kể cả trên trang chi tiết để nút
// "← Doanh thu" trả teacher về đúng kỳ đang xem (filter sống trong URL).
export const Route = createFileRoute("/_auth/tuition/$invoiceId")({
	validateSearch: (
		search: Record<string, unknown>,
	): { ky?: RevenuePeriod } => ({
		ky:
			search.ky === "month" || search.ky === "quarter" || search.ky === "year"
				? search.ky
				: undefined,
	}),
	component: InvoiceDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-semibold text-xl">Không tìm thấy hóa đơn</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Hóa đơn này không tồn tại hoặc dữ liệu đã được reset.
			</p>
			<Link
				to="/tuition"
				className="mt-4 inline-block text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				← Về Doanh thu
			</Link>
		</Card>
	),
});

// Giờ VN bất kể múi giờ thiết bị (#343) — dùng chung cho "Tạo lúc" và
// "Ghi nhận lúc" (timestamp server ingest giao dịch, ISO 8601 từ endpoint).
const vnDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
	timeZone: "Asia/Ho_Chi_Minh",
	dateStyle: "short",
	timeStyle: "short",
});

function formatCreatedAt(ts: number): string {
	return ts > 0 ? vnDateTimeFormatter.format(new Date(ts)) : "—";
}

function formatReceivedAt(iso: string): string {
	const ts = Date.parse(iso);
	return Number.isNaN(ts) ? iso : vnDateTimeFormatter.format(new Date(ts));
}

function MetaRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="min-w-0 text-right text-sm">{children}</dd>
		</div>
	);
}

export function InvoiceDetailRoute() {
	const { invoiceId } = Route.useParams();
	const { ky } = Route.useSearch();
	const { data } = useData();
	const { run, isPending, busy } = useDirectKernelAction();

	const inv = data.invoices.find((i) => i.id === invoiceId);
	if (!inv) {
		throw notFound();
	}

	const student = data.students.find((s) => s.id === inv.sid);
	const enrollment = data.enrollments.find((e) => e.id === inv.eid);
	const cls = data.classes.find((c) => c.id === enrollment?.classId);

	const today = todayISOVietnam();
	const status = effectiveInvoiceStatus(inv, today);
	// Rule `tuitionTotals` (#320): mark-paid thủ công giữ paidAmount 0 nhưng
	// tính ĐÃ THU đủ — status, không phải ledger, drive con số cho paid.
	const received = invoiceReceived(inv);
	const remaining = inv.amount - received;
	const manuallyPaid = inv.status === "paid" && inv.paidAmount === 0;

	const { payment, payLink, openedAt } = useInvoicePayment(inv.id, true);
	usePaidAmountWatch(inv.id, payment.data?.paidAmount, inv.paidAmount);

	// Poll lịch sử giao dịch độc lập với payment timer (tránh race lệch pha):
	// dừng khi payment lỗi, đã kết luận payable=false, hoặc hết cap 15 phút
	// (cùng mốc với payment — vốn tự reset khi tab visible lại). Lần fetch
	// cuối khi tiền về đảm bảo bởi paidAmount-watch invalidate.
	const transactions = useQuery({
		...invoiceTransactionsQueryOptions(inv.id),
		refetchInterval: () => {
			if (payment.isError) return false;
			if (payment.data && !payment.data.payable) return false;
			if (Date.now() - openedAt >= POLL_CAP_MS) return false;
			return POLL_INTERVAL_MS;
		},
	});
	const txRows = transactions.data ?? [];

	const backSearch = { ky: ky ?? "month" };

	return (
		<div>
			{/* Design InvoiceDetail: BackLink muted phía trên PageHead. */}
			<Link
				to="/tuition"
				search={backSearch}
				className="mb-1 -ml-1 inline-flex items-center text-muted-foreground text-sm transition-colors hover:text-foreground"
			>
				← Doanh thu
			</Link>
			<PageHead
				kicker={
					student
						? `${invoiceType(inv.type)} · ${student.name}`
						: invoiceType(inv.type)
				}
				title={
					<span className="flex flex-wrap items-center gap-3">
						{invoiceCode(inv.id)}
						<InvoiceStatusCell invoice={inv} status={status} />
					</span>
				}
				action={
					inv.status !== "paid" ? (
						<Button
							disabled={busy || isPending(inv.id)}
							onClick={() =>
								void run(
									inv.id,
									{
										type: "mark-invoice-paid",
										invoiceId: inv.id,
										method: inv.method === "—" ? "CK" : inv.method,
									},
									"Đã ghi nhận thanh toán.",
								)
							}
						>
							{isPending(inv.id) ? "Đang lưu…" : "Đã nhận"}
						</Button>
					) : undefined
				}
			/>

			<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] gap-6 max-app:grid-cols-1">
				<div className="flex flex-col gap-6">
					<Card className="flex flex-col gap-4">
						<h2 className="font-semibold leading-none">Thông tin hóa đơn</h2>
						<dl>
							<MetaRow label="Mã hóa đơn">
								<span className="font-mono">{invoiceCode(inv.id)}</span>
							</MetaRow>
							<MetaRow label="Mã đầy đủ">
								<span className="break-all text-muted-foreground text-xs">
									{inv.id}
								</span>
							</MetaRow>
							<MetaRow label="Loại">{invoiceType(inv.type)}</MetaRow>
							<MetaRow label="Ngày lập">{inv.date || "—"}</MetaRow>
							<MetaRow label="Tạo lúc">
								{formatCreatedAt(inv.createdAt)}
							</MetaRow>
							<MetaRow label="Hạn đóng">
								{inv.status === "paid" ? (
									"—"
								) : (
									<span
										className={
											status === "overdue"
												? "font-semibold text-destructive"
												: undefined
										}
									>
										{formatDue(inv.due)}
									</span>
								)}
							</MetaRow>
							<MetaRow label="Phương thức">{inv.method || "—"}</MetaRow>
							<MetaRow label="Ghi chú">
								<span className="whitespace-pre-wrap">{inv.note || "—"}</span>
							</MetaRow>
						</dl>
					</Card>

					{/* 3 stat tiles: Số tiền / Đã thu / Còn lại (hot khi còn phải thu) */}
					<div className="grid grid-cols-3 gap-4">
						<StatCard num={fmtVND(inv.amount)} label="Số tiền" />
						<StatCard num={fmtVND(received)} label="Đã thu" />
						<StatCard
							num={fmtVND(remaining)}
							label="Còn lại"
							hot={remaining > 0}
						/>
					</div>
					{manuallyPaid && (
						<p className="text-muted-foreground text-xs">
							Ghi nhận thủ công — tiền thu qua kênh khác (tiền mặt, chuyển khoản
							ngoài hệ thống).
						</p>
					)}

					<Card className="flex flex-col gap-4">
						<h2 className="font-semibold leading-none">Học viên &amp; lớp</h2>
						<div className="flex flex-wrap items-center gap-x-8 gap-y-3">
							{student ? (
								<Link
									to="/students/$studentId"
									params={{ studentId: student.id }}
									className="flex items-center gap-2 font-medium text-sm underline-offset-4 transition-colors hover:underline"
								>
									<Avatar text={student.avatar} size="sm" />
									<span>{student.name}</span>
								</Link>
							) : (
								<span className="text-muted-foreground text-sm">—</span>
							)}
							{cls ? (
								<Link
									to="/classes/$classId"
									params={{ classId: cls.id }}
									className="font-medium text-sm underline-offset-4 transition-colors hover:underline"
								>
									{cls.name}
								</Link>
							) : (
								<span className="text-muted-foreground text-sm">Lớp: —</span>
							)}
						</div>
					</Card>
				</div>

				<Card className="flex flex-col gap-4 self-start">
					<h2 className="font-semibold leading-none">
						Thanh toán chuyển khoản
					</h2>
					{payment.data ? (
						<PaymentQrPanel data={payment.data} />
					) : payment.isError ? (
						<p className="text-muted-foreground text-sm">
							Không tải được thông tin chuyển khoản.
						</p>
					) : (
						<p className="text-center text-muted-foreground text-sm">
							Đang tải…
						</p>
					)}
					{payment.data && (
						<div>
							<InvoicePaymentActions
								invoiceId={inv.id}
								payable={payment.data.payable}
								payLink={payLink}
								active={true}
							/>
						</div>
					)}
					{payLink !== "" && (
						<p className="break-all text-muted-foreground text-xs">{payLink}</p>
					)}
				</Card>
			</div>

			<Card className="mt-6 p-0">
				<h2 className="px-6 pt-6 font-semibold leading-none">
					Lịch sử giao dịch
				</h2>
				<div className="p-4">
					<DataTable
						headers={[
							"Ngày giao dịch",
							"Số tiền",
							"Nội dung chuyển khoản",
							"Phương thức",
							"Mã tham chiếu",
							"Ghi nhận lúc",
						]}
						emptyMessage={
							transactions.isError
								? "Không tải được lịch sử giao dịch."
								: manuallyPaid
									? "Hóa đơn được đánh dấu đã thu thủ công — không có giao dịch chuyển khoản nào khớp."
									: "Chưa có giao dịch chuyển khoản nào khớp với hóa đơn này."
						}
						rows={txRows.map((tx) => ({
							cells: [
								<span key="d" className="text-muted-foreground text-xs">
									{tx.transactionDate || "—"}
								</span>,
								<span key="a" className="font-mono">
									{fmtVND(tx.amount)}
								</span>,
								<span key="c" className="font-mono text-xs">
									{tx.content || "—"}
								</span>,
								// #450: manual receipts carry a display label; bank rows
								// are QR transfers by definition.
								<span key="m" className="text-xs">
									{tx.method || "Chuyển khoản"}
								</span>,
								<span key="r" className="text-muted-foreground text-xs">
									{tx.referenceCode || "—"}
								</span>,
								<span key="t" className="text-muted-foreground text-xs">
									{formatReceivedAt(tx.createdAt)}
								</span>,
							],
						}))}
					/>
					{transactions.isError && (
						<p className="mt-2 text-muted-foreground text-xs">
							Không tải được lịch sử giao dịch.
						</p>
					)}
				</div>
			</Card>
		</div>
	);
}
