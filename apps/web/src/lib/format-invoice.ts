import type { InvoiceStatus } from "./mock-data";

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
