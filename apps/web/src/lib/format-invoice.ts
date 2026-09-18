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
