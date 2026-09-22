const MAX_DIGITS = 12; // khớp contract .int() và regex /^\d{1,12}$/ hiện có

/**
 * Chuỗi đang gõ/dán → chỉ chữ số, bỏ số 0 đầu thừa ("007" → "7"),
 * nhóm hàng nghìn bằng dấu phẩy. KHÔNG giới hạn độ dài — case >12 chữ số
 * để parse chặn ở submit nhằm giữ nguyên thông báo lỗi hiện có.
 * Dấu âm ("-500") bị loại bỏ thành chuỗi rỗng ở tầng UI.
 */
export function formatVndInput(raw: string): string {
	if (raw.includes("-")) return "";
	const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
	return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Chuỗi hiển thị ("1,000,000" | "400.000đ" | "5000") → số nguyên VND.
 * null khi rỗng, có dấu âm, không có chữ số, hoặc quá 12 chữ số.
 */
export function parseVndAmount(raw: string): number | null {
	if (raw.includes("-")) return null;
	const digits = raw.replace(/\D/g, "");
	if (digits === "" || digits.length > MAX_DIGITS) return null;
	return Number(digits);
}
