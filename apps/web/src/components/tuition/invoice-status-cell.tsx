import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
	INVOICE_STATUS_LABEL,
	INVOICE_STATUS_VARIANT,
	invoiceRemainingLabel,
} from "@/lib/format-invoice";
import type { Invoice, InvoiceStatus } from "@/lib/mock-data";

/**
 * Badge trạng thái hóa đơn dùng chung MỘT nguồn (#345): bảng `/tuition`,
 * trang chi tiết và tab "Học phí" hồ sơ học viên trước đây giữ ba nhánh riêng
 * nên cùng một hóa đơn partial hiện khác nhãn. Cell giữ đúng nhánh của bảng
 * `/tuition` (nguồn chuẩn #340): paid → badge; partial → "Thu một phần" +
 * nhãn "còn X" (đỏ khi quá hạn); còn lại → badge effective status.
 */
export function InvoiceStatusCell({
	invoice,
	status,
}: {
	invoice: Invoice;
	/** `effectiveInvoiceStatus(invoice, today)` — caller tính một lần/ngày. */
	status: InvoiceStatus;
}) {
	// paid luôn thắng nhãn "còn X": guard giữ precedence tường minh thay vì
	// dựa vào invoiceRemainingLabel tự trả null với hóa đơn paid.
	const remaining = status === "paid" ? null : invoiceRemainingLabel(invoice);
	if (remaining) {
		return (
			<span className="flex items-center gap-2 whitespace-nowrap">
				{/* Một phần = viền ink (design TuitionBadge); quá hạn mới cam đặc. */}
				<Badge variant="accent" dot>
					Thu một phần
				</Badge>
				<span
					className={cn(
						"font-mono",
						status === "overdue" && "font-semibold text-danger",
					)}
				>
					{remaining}
				</span>
			</span>
		);
	}
	return (
		<Badge variant={INVOICE_STATUS_VARIANT[status]} dot>
			{INVOICE_STATUS_LABEL[status]}
		</Badge>
	);
}
