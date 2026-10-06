import { Link } from "@tanstack/react-router";
import type { StudentInvoiceItem } from "@teacher-os/api/contracts";
import { OverviewEmptyState } from "@/components/overview/empty-state";

function fmtVnd(n: number): string {
	return `${n.toLocaleString("vi-VN")}đ`;
}

/**
 * Overview "Học phí" section (#320): unsettled invoices of this student.
 * Hidden entirely when there is nothing to pay.
 */
export function TuitionList({ invoices }: { invoices: StudentInvoiceItem[] }) {
	if (invoices.length === 0) return null;
	return (
		<section>
			<h2 className="mb-4 font-[620] font-display text-[20px] text-fg tracking-tight">
				Học phí
			</h2>
			{invoices.length === 0 ? (
				<OverviewEmptyState
					icon="book"
					title="Không có học phí còn nợ"
					description="Các khoản học phí của bạn sẽ hiển thị tại đây."
				/>
			) : (
				<ul className="flex flex-col gap-3">
					{invoices.map((inv) => (
						<li key={inv.id}>
							<Link
								to="/tuition/$invoiceId"
								params={{ invoiceId: inv.id }}
								className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 ring-1 ring-fg/10 transition-colors hover:bg-surface-warm"
							>
								<div className="flex flex-col gap-0.5">
									<span className="font-medium text-fg text-sm">
										{inv.type || "Học phí"}
									</span>
									<span className="text-muted-fg text-xs">
										{inv.due ? `Hạn ${inv.due}` : "Chưa có hạn đóng"}
									</span>
								</div>
								<div className="flex flex-col items-end gap-0.5">
									<span className="font-medium font-mono text-sm">
										{fmtVnd(inv.amountDue)}
									</span>
									<span className="text-muted-fg text-xs">
										{inv.paidAmount > 0
											? `Đã nhận ${fmtVnd(inv.paidAmount)} / ${fmtVnd(inv.amount)}`
											: `Tổng ${fmtVnd(inv.amount)}`}
									</span>
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
