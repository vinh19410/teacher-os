import { EXAM_IMPORT_LIMITS } from "@teacher-os/api/contracts";
import { getDocumentProxy } from "unpdf";

/**
 * Kiểm tra sâu tệp đề (plan TOS-27 D1) — chạy TRƯỚC khi lưu R2 / tạo job /
 * giữ Credit: vi phạm → chặn ngay E-003, ví không bị đụng tới.
 *
 * - PDF: parse bằng `unpdf` (bản pdf.js chạy được trên Workers) để lấy số
 *   trang và nhận diện PDF có mật khẩu qua `PasswordException`. File hỏng
 *   không parse được cũng là "sai định dạng" (E-003) — AI sẽ không đọc nổi.
 * - Ảnh (PNG/JPEG): tính 1 trang — MIME đã kiểm ở route, không parse ảnh.
 */
export type ExamFileInspection =
	| { ok: true; pageCount: number }
	| { ok: false; reason: "type" | "pages" | "password" };

/** pdf.js ném lỗi có `name === "PasswordException"` khi PDF bị mã hoá mà
 * không có/không đúng mật khẩu — nhận theo name thay vì instanceof để
 * không phụ thuộc identity class giữa các bản bundle của unpdf. */
function isPasswordError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === "PasswordException" ||
			error.constructor?.name === "PasswordException")
	);
}

export async function inspectExamFile(
	data: ArrayBuffer,
	mimeType: string,
): Promise<ExamFileInspection> {
	if (mimeType !== "application/pdf") {
		// PNG/JPEG: 1 trang mỗi tệp — đúng quy ước của extractor (pageCount
		// null với ảnh) và của AC-004 (giới hạn trang chỉ nghĩa với PDF).
		return { ok: true, pageCount: 1 };
	}
	try {
		// unpdf/pdf.js LoopbackPort chuyển quyền sở hữu (transfer) ArrayBuffer
		// sang worker → detach buffer gốc thành 0 byte; phải copy bằng
		// `data.slice(0)` để route vẫn lưu được nguyên byte gốc lên R2
		// (kongming verify-fail #473).
		const pdf = await getDocumentProxy(new Uint8Array(data.slice(0)));
		const pageCount = pdf.numPages;
		if (pageCount > EXAM_IMPORT_LIMITS.maxPages) {
			return { ok: false, reason: "pages" };
		}
		return { ok: true, pageCount };
	} catch (error) {
		if (isPasswordError(error)) return { ok: false, reason: "password" };
		return { ok: false, reason: "type" };
	}
}
