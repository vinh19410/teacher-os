import type { Invoice } from "./mock-data";
import { fmtVND, type InvoiceStatus } from "./mock-data";

/** Short human-readable invoice code (#176): the table cells showed the raw
 * UUID, which was unreadable. INV + the last 8 id chars stays scannable while
 * the full UUID remains greppable from the prefix. */
export function invoiceCode(id: string): string {
	return `INV-${id.slice(-8).toUpperCase()}`;
}

/** Issue #176: invoices created through the quick form (#61) carry no type —
 * "Khác" is the honest default instead of an empty cell rendered as "—". */
export function invoiceType(type: string): string {
	return type.trim() || "Khác";
}

/** Nhãn/variant badge trạng thái hóa đơn dùng chung (#322) — roster tab Học
 * viên, /tuition và hồ sơ học viên cùng nguồn để không lệch nhãn. Trạng thái
 * truyền vào nên là `effectiveInvoiceStatus` (từ tuition-from-kernel) để
 * "Quá hạn" suy ra từ `due` hiển thị nhất quán. */
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
	paid: "Đã thu",
	unpaid: "Chưa thu",
	overdue: "Quá hạn",
};

export const INVOICE_STATUS_VARIANT: Record<
	InvoiceStatus,
	"success" | "warn" | "danger"
> = { paid: "success", unpaid: "warn", overdue: "danger" };

/** Copy đơn nguồn của nhãn "còn Xđ" (#340) — roster (aggregate per học viên)
 * và `invoiceRemainingLabel` (per hóa đơn) cùng gọi để ba surface không lệch
 * prefix hay format tiền. */
export function formatRemainingVND(amount: number): string {
	return `còn ${fmtVND(amount)}`;
}

/** Nhãn "còn Xđ" cho MỘT hóa đơn chưa đóng đủ (#340), null khi không có gì
 * để nói thêm: đã paid; chưa thu gì (`paidAmount <= 0` — cell Số tiền đã
 * hiện đủ amount, thêm nhãn là thừa); hoặc remaining ≤ 0 sau clamp (overpay,
 * ledger chưa reconcile → tránh "còn 0đ"). Clamp cùng convention
 * `tuitionTotals` (#320). */
export function invoiceRemainingLabel(
	invoice: Pick<Invoice, "amount" | "paidAmount" | "status">,
): string | null {
	if (invoice.status === "paid") return null;
	const remaining =
		invoice.amount - Math.min(invoice.paidAmount, invoice.amount);
	return invoice.paidAmount > 0 && remaining > 0
		? formatRemainingVND(remaining)
		: null;
}
