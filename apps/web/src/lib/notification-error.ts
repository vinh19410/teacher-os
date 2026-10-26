import { NOTIFICATION_ERROR_CODES } from "@teacher-os/api/contracts";

const CAUSE_MAX_LENGTH = 80;
const FALLBACK_CAUSE = "Không gửi được email";

/**
 * Định dạng thông điệp lỗi gửi thông báo (E-selfomy-alignment-010) cho màn
 * Nhật ký thông báo [5] (TOS-22 #463 phase 2):
 * - Bỏ tiền tố `E-selfomy-alignment-010:` nếu có để lấy phần nguyên nhân gốc.
 * - Fallback `"Không gửi được email"` khi nguyên nhân rỗng hoặc null.
 * - `shortText`: `"E-010: <nguyên nhân cắt ≤ 80 ký tự> sau <retryCount> lần thử"`.
 * - `fullText`: bản đầy đủ để gắn vào thuộc tính `title` tooltip.
 */
export function formatDeliveryError(
	lastError: string | null | undefined,
	retryCount: number,
): { shortText: string; fullText: string } {
	const prefix = `${NOTIFICATION_ERROR_CODES.DELIVERY_FAILED}:`;
	const raw = (lastError ?? "").trim();
	const stripped = raw.startsWith(prefix)
		? raw.slice(prefix.length).trim()
		: raw;
	const cause = stripped.length > 0 ? stripped : FALLBACK_CAUSE;
	const truncatedCause =
		cause.length > CAUSE_MAX_LENGTH
			? `${cause.slice(0, CAUSE_MAX_LENGTH)}…`
			: cause;
	const shortText = `E-010: ${truncatedCause} sau ${retryCount} lần thử`;
	const fullText = raw.length > 0 && stripped.length > 0 ? raw : shortText;
	return { shortText, fullText };
}
