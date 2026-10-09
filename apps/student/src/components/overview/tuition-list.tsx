import { Link } from "@tanstack/react-router";
import type { StudentInvoiceItem } from "@teacher-os/api/contracts";

function fmtVnd(n: number): string {
	return `${n.toLocaleString("vi-VN")}đ`;
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
			className={hot ? "rounded-md bg-fg p-4" : "neu rounded-md bg-surface p-4"}
		>
			<div className="font-mono text-[10px] text-meta uppercase tracking-[0.18em]">
				{label}
			</div>
			<div
				className={`mt-2 break-words font-medium font-mono text-lg leading-none ${
					hot ? "text-hot" : "text-fg"
				}`}
			>
				{value}
			</div>
		</div>
	);
}

/**
 * Cột phải "Học phí" của overview (#320): kicker cam + 2 stat Đã đóng /
 * Còn lại (hot) + danh sách khoản chưa đóng dẫn sang trang chi tiết có QR.
 * Ẩn toàn section khi không còn khoản nào.
 */
export function TuitionList({ invoices }: { invoices: StudentInvoiceItem[] }) {
	if (invoices.length === 0) return null;
	const totalPaid = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
	const totalDue = invoices.reduce((sum, inv) => sum + inv.amountDue, 0);
	return (
		<section className="neu self-start rounded-lg p-6">
			{/* Heading role pinned by e2e (tuition-bank-transfer) — styled as the
			design's mono kicker, still a real h2 for the outline. */}
			<h2 className="font-mono text-[11px] text-hot uppercase tracking-[0.2em]">
				Học phí
			</h2>

			<div className="mt-4 grid grid-cols-2 gap-4">
				<MiniStat label="Đã đóng" value={fmtVnd(totalPaid)} />
				<MiniStat label="Còn lại" value={fmtVnd(totalDue)} hot />
			</div>

			<ul className="mt-4">
				{invoices.map((inv) => (
					<li key={inv.id} className="border-line border-t">
						<Link
							to="/tuition/$invoiceId"
							params={{ invoiceId: inv.id }}
							className="flex items-center justify-between gap-3 py-3 transition-colors hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						>
							<div className="flex min-w-0 flex-col gap-0.5">
								<span className="font-medium text-fg text-sm">
									{inv.type || "Học phí"}
								</span>
								<span className="font-mono text-[11px] text-meta">
									{inv.due ? `Hạn ${inv.due}` : "Chưa có hạn đóng"}
								</span>
							</div>
							<div className="flex flex-none flex-col items-end gap-0.5">
								<span className="font-medium font-mono text-sm">
									{fmtVnd(inv.amountDue)}
								</span>
								<span className="font-mono text-[11px] text-meta">
									{inv.paidAmount > 0
										? `Đã nhận ${fmtVnd(inv.paidAmount)} / ${fmtVnd(inv.amount)}`
										: `Tổng ${fmtVnd(inv.amount)}`}
								</span>
							</div>
						</Link>
					</li>
				))}
			</ul>
		</section>
	);
}
