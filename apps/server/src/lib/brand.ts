export const BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh";

/**
 * Format tên người gửi hiển thị cho email thông báo:
 * - Rỗng -> rỗng
 * - Đã chứa hoặc bằng BRAND_NAME -> trả về senderName sạch (tránh lặp "... qua Cô Mỹ Dạy Tiếng Anh qua Cô Mỹ Dạy Tiếng Anh")
 * - Bình thường: `${senderName} qua ${BRAND_NAME}`
 */
export function formatSenderName(senderName?: string | null): string {
	const trimmed = senderName?.trim();
	if (!trimmed) return "";
	if (trimmed === BRAND_NAME || trimmed.endsWith(`qua ${BRAND_NAME}`)) {
		return trimmed;
	}
	return `${trimmed} qua ${BRAND_NAME}`;
}
