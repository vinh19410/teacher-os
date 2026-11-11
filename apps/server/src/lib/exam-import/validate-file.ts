import { EXAM_IMPORT_LIMITS } from "@teacher-os/api/contracts";
import {
	MATERIAL_MAGIC_PEEK_BYTES,
	matchesMaterialMagic,
} from "@teacher-os/api/material-contracts";
import { getDocumentProxy } from "unpdf";

/**
 * Kiểm tra sâu tệp đề (plan TOS-27 D1 + #681) — chạy TRƯỚC khi lưu R2 / tạo
 * job / giữ Credit: vi phạm → chặn ngay E-003, ví không bị đụng tới.
 *
 * - Chữ ký nhị phân 64 byte đầu (không phải `peekStream` vì route đã đọc
 *   `ArrayBuffer` cho SHA-256 + `unpdf`): PDF `%PDF-1.x/2.x`, PNG
 *   `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF` + marker `0xC0..0xFE` tại
 *   `head[3]` — chặn polyglot `\xff\xd8\xff<html>`; MIME lạ → fail-closed.
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
	// #681: xác thực chữ ký nhị phân 64 byte đầu fail-closed cho cả PDF,
	// PNG, JPEG (lát cắt của ArrayBuffer luôn có byteOffset 0 nên DataView
	// an toàn); MIME lạ ngoài 3 kiểu trên cũng bị từ chối.
	const head = new Uint8Array(
		data,
		0,
		Math.min(MATERIAL_MAGIC_PEEK_BYTES, data.byteLength),
	);
	if (!matchesMaterialMagic(mimeType, head)) {
		return { ok: false, reason: "type" };
	}
	// JPEG: marker segment thật tại head[3] phải thuộc 0xC0..0xFE (APP0 JFIF
	// = 0xE0, EXIF = 0xE1, DQT = 0xDB, ...; loại trừ padding 0xFF và 0x00) —
	// chặn polyglot `\xff\xd8\xff<html>` với head[3] = 0x3C ('<'); body chỉ
	// đúng 3 byte `ff d8 ff` không đủ marker cũng bị từ chối.
	if (mimeType === "image/jpeg") {
		if (data.byteLength < 4) {
			return { ok: false, reason: "type" };
		}
		const marker = head[3] ?? 0;
		if (marker < 0xc0 || marker > 0xfe) {
			return { ok: false, reason: "type" };
		}
	}
	if (mimeType === "image/png" || mimeType === "image/jpeg") {
		// PNG/JPEG: 1 trang mỗi tệp — đúng quy ước của extractor (pageCount
		// null với ảnh) và của AC-004 (giới hạn trang chỉ nghĩa với PDF).
		return { ok: true, pageCount: 1 };
	}
	if (mimeType !== "application/pdf") {
		return { ok: false, reason: "type" };
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
