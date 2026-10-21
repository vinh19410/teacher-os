import { Link } from "@tanstack/react-router";
import type { StudentInvoiceItem } from "@teacher-os/api/contracts";
import { Tag } from "@/components/overview/class-card";

function fmtVnd(n: number): string {
	return `${n.toLocaleString("vi-VN")}đ`;
}

/** Rule "đã thanh toán" trùng server (payment-instructions.ts): status paid
 * hoặc amountDue đã về 0 (API clamp Math.max(amount - paidAmount, 0)). Bắt
 * cả hóa đơn thu tay status=paid nhưng paidAmount để 0. */
function isSettled(inv: StudentInvoiceItem): boolean {
	return inv.status === "paid" || inv.amountDue <= 0;
}

function paidOf(inv: StudentInvoiceItem): number {
	return isSettled(inv) ? inv.amount : inv.paidAmount;
}

function dueOf(inv: StudentInvoiceItem): number {
	return isSettled(inv) ? 0 : inv.amountDue;
}

/** Ô số liệu nhỏ kiểu design `Stat`: nhãn mono uppercase, số display extrabold
 * (tiền → font-mono). `hot` = nền ink đảo, số cam. */
function MiniStat({
	label,
	value,
	hot = false,
}: {
	label: string;
	value: string;
	hot?: boolean;
}) {
	return (
		<div
			className={
				hot
					? "rounded-md bg-primary p-4"
					: "rounded-md rounded-xl border bg-card bg-muted p-4 shadow-sm"
			}
		>
			<div className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
				{label}
			</div>
			<div
				className={`mt-2 break-words font-medium font-mono text-lg leading-none ${
					hot ? "text-primary" : "text-foreground"
				}`}
			>
				{value}
			</div>
		</div>
	);
}

/**
 * Cột phải "Học phí" của overview (#320): kicker cam + 2 stat Đã đóng /
 * Còn lại (hot) + danh sách mọi hóa đơn dẫn sang trang chi tiết có QR.
 * Khoản đã thanh toán hiện gọn: tên + số tiền + badge "Đã thanh toán".
 * Ẩn toàn section khi không có hóa đơn nào.
 */
export function TuitionList({ invoices }: { invoices: StudentInvoiceItem[] }) {
	if (invoices.length === 0) return null;
	const totalPaid = invoices.reduce((sum, inv) => sum + paidOf(inv), 0);
	const totalDue = invoices.reduce((sum, inv) => sum + dueOf(inv), 0);
	return (
		<section className="self-start rounded-lg rounded-xl border bg-card p-6 shadow-sm">
			{/* Heading role pinned by e2e (tuition-bank-transfer) — styled as the
			design's mono kicker, still a real h2 for the outline. */}
			<h2 className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
				Học phí
			</h2>

			<div className="mt-4 grid grid-cols-2 gap-4">
				<MiniStat label="Đã đóng" value={fmtVnd(totalPaid)} />
				<MiniStat label="Còn lại" value={fmtVnd(totalDue)} hot />
			</div>

			<ul className="mt-4">
				{invoices.map((inv) => (
					<li key={inv.id} className="border-border border-t">
						<Link
							to="/tuition/$invoiceId"
							params={{ invoiceId: inv.id }}
							className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-primary focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							{isSettled(inv) ? (
								<>
									<div className="flex min-w-0 flex-col">
										<span className="font-medium text-foreground text-sm">
											{inv.type || "Học phí"}
										</span>
									</div>
									<div className="flex flex-none items-center gap-2">
										<span className="font-medium font-mono text-sm">
											{fmtVnd(inv.amount)}
										</span>
										<Tag success>Đã thanh toán</Tag>
									</div>
								</>
							) : (
								<>
									<div className="flex min-w-0 flex-col gap-0.5">
										<span className="font-medium text-foreground text-sm">
											{inv.type || "Học phí"}
										</span>
										<span className="font-mono text-[11px] text-muted-foreground">
											{inv.due ? `Hạn ${inv.due}` : "Chưa có hạn đóng"}
										</span>
									</div>
									<div className="flex flex-none flex-col items-end gap-0.5">
										<span className="font-medium font-mono text-sm">
											{fmtVnd(inv.amountDue)}
										</span>
										<span className="font-mono text-[11px] text-muted-foreground">
											{inv.paidAmount > 0
												? `Đã nhận ${fmtVnd(inv.paidAmount)} / ${fmtVnd(inv.amount)}`
												: `Tổng ${fmtVnd(inv.amount)}`}
										</span>
									</div>
								</>
							)}
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
