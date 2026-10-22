import { isHttpError } from "@/lib/query-client";
import { isLibraryHttpError } from "@/lib/repos/library";

/**
 * Map lỗi API thư viện → thông báo tiếng Việt cho toast/inline (phase 6).
 * Ngoài `LIBRARY_ERROR_CODES` của contract, server còn trả 2 mã riêng:
 * `LIBRARY_AUDIO_DISABLED` (503 — chưa gắn audio store) và
 * `AUDIO_CHANGED` (409 — thua CAS khi upload thay thế).
 */

const CODE_MESSAGES: Record<string, string> = {
	TEST_NOT_FOUND: "Bộ đề không tồn tại hoặc đã bị xóa.",
	PART_NOT_FOUND: "Part không tồn tại hoặc đã bị xóa.",
	NOT_READY: "Bộ đề chưa đủ điều kiện — xem danh sách lý do.",
	INVALID_AUDIO: "File audio không hợp lệ.",
	AUDIO_TOO_LARGE: "File audio vượt quá dung lượng cho phép (tối đa 50 MB).",
	UNSUPPORTED_AUDIO_TYPE:
		"Định dạng audio không hỗ trợ — dùng MP3, M4A, WAV, AAC, OGG hoặc WEBM.",
	SKILL_IMMUTABLE: "Kỹ năng của đề không đổi được sau khi tạo.",
	LIBRARY_AUDIO_DISABLED:
		"Kho audio chưa được kích hoạt — liên hệ quản trị hệ thống.",
	AUDIO_CHANGED:
		"Audio vừa được người khác cập nhật — tải lại trang rồi thử lại.",
};

export function libraryErrorMessage(error: unknown): string {
	if (isLibraryHttpError(error) && error.code) {
		return CODE_MESSAGES[error.code] ?? fallbackByStatus(error.status);
	}
	if (isHttpError(error)) {
		return fallbackByStatus(error.status);
	}
	return "Đã xảy ra lỗi. Vui lòng thử lại.";
}

function fallbackByStatus(status: number): string {
	if (status === 0) return "Lỗi mạng — kiểm tra kết nối rồi thử lại.";
	if (status === 401) return "Phiên đăng nhập đã hết hạn.";
	if (status === 403) return "Bạn không có quyền thực hiện thao tác này.";
	if (status === 404) return "Không tìm thấy dữ liệu.";
	if (status >= 500) return "Lỗi hệ thống — vui lòng thử lại sau.";
	return "Không thực hiện được thao tác. Vui lòng thử lại.";
}
