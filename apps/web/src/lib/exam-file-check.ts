import {
	EXAM_IMPORT_LIMITS,
	EXAM_IMPORT_MIME,
	type ExamImportFileErrorReason,
} from "@teacher-os/api/contracts";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Worker pdfjs qua Vite `?url` — cùng pattern source-document-viewer; bundle
// giữ file worker riêng, không inline.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type ExamFileCheckError = {
	reason: ExamImportFileErrorReason;
	/** Lý do cụ thể cho người dùng ("tệp 18,0 MB vượt 15 MB"). */
	detail: string;
};

function formatMb(bytes: number): string {
	return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");
}

/**
 * Kiểm tệp NGAY Ở dropzone (plan TOS-27, phase-02) — fail-fast trước khi
 * gọi API: sai kiểu/quá 15 MB/quá 20 trang/PDF có mật khẩu → E-003 kèm lý
 * do cụ thể, KHÔNG POST. Guard UX này không phải nguồn sự thật — server
 * vẫn kiểm lại bằng unpdf (chặn tại 2 lớp trước khi giữ Credit).
 *
 * Trả `null` khi tệp đạt: caller được phép upload.
 */
export async function checkExamFile(
	file: File,
): Promise<ExamFileCheckError | null> {
	const mimeType = (file.type || "").toLowerCase();
	if (!(EXAM_IMPORT_MIME as readonly string[]).includes(mimeType)) {
		return {
			reason: "type",
			detail: "Định dạng không hỗ trợ — chỉ nhận PDF, PNG, JPG, JPEG.",
		};
	}
	if (file.size > EXAM_IMPORT_LIMITS.maxBytes) {
		return {
			reason: "size",
			detail: `Tệp ${formatMb(file.size)} MB vượt giới hạn 15 MB.`,
		};
	}
	if (mimeType !== "application/pdf") {
		return null; // Ảnh: 1 trang, không có khái niệm mật khẩu ở client.
	}
	let task: pdfjsLib.PDFDocumentLoadingTask | null = null;
	try {
		const bytes =
			typeof file.arrayBuffer === "function"
				? await file.arrayBuffer()
				: await new Response(file).arrayBuffer();
		task = pdfjsLib.getDocument({ data: bytes });
		const pdf = await task.promise;
		const numPages = pdf.numPages;
		if (numPages > EXAM_IMPORT_LIMITS.maxPages) {
			return {
				reason: "pages",
				detail: `PDF ${numPages} trang vượt giới hạn ${EXAM_IMPORT_LIMITS.maxPages} trang.`,
			};
		}
		return null;
	} catch (error) {
		// pdf.js ném PasswordException khi PDF mã hoá mà không có mật khẩu.
		if (
			error instanceof Error &&
			(error.name === "PasswordException" ||
				error.constructor?.name === "PasswordException")
		) {
			return {
				reason: "password",
				detail: "Tệp PDF có mật khẩu — hãy bỏ mật khẩu hoặc đổi tệp khác.",
			};
		}
		return {
			reason: "type",
			detail: "Tệp PDF hỏng hoặc không đọc được cấu trúc.",
		};
	} finally {
		void task?.destroy();
	}
}
