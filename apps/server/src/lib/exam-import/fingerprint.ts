/**
 * Dấu vân tay nội dung (SHA-256 hex) cho `exam_import_job.content_fingerprint`
 * — chuẩn bị chống trùng TOS-25; crypto.subtle có ở Workers lẫn Node 18+.
 */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", buffer);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

/**
 * Heuristic đếm trang PDF: đếm `/Type /Page` (không khớp `/Pages` — node
 * cây Pages) trên byte latin1. Dùng khi extractor không cung cấp pageCount
 * (Workers AI); trả null khi không tìm thấy (file hỏng/không phải PDF).
 */
export function countPdfPages(data: ArrayBuffer): number | null {
	const bytes = new Uint8Array(data);
	// Giải latin1 thủ công theo khúc — TextDecoder("latin1") không đảm bảo có
	// ở mọi runtime, còn String.fromCharCode từng khúc 32KB là an toàn đủ nơi.
	let text = "";
	const CHUNK = 0x8000;
	for (let offset = 0; offset < bytes.length; offset += CHUNK) {
		text += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
	}
	const matches = text.match(/\/Type\s*\/Page[^s]/g);
	return matches && matches.length > 0 ? matches.length : null;
}
