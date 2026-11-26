import {
	MATERIAL_DOC_MAX_BYTES,
	MATERIAL_PAGE_MAX,
} from "@teacher-os/api/material-contracts";
import type { PDFDocument } from "pdf-lib";
import { formatBytes } from "@/lib/repos/materials";

/** Trần dung lượng sách PDF gốc xử lý trên trình duyệt để tránh hết RAM tab. */
export const PDF_SOURCE_MAX_BYTES = 100 * 1024 * 1024;
/** Trần độ dài tên file đầu ra (giữ đuôi `.pdf` an toàn cho header X-File-Name). */
export const PDF_SLICE_MAX_FILENAME_CHARS = 200;

export type PdfSliceErrorCode =
	| "SOURCE_TOO_LARGE"
	| "ENCRYPTED_PDF"
	| "INVALID_PDF"
	| "INVALID_RANGE"
	| "SLICE_TOO_LARGE";

export class PdfSliceError extends Error {
	readonly code: PdfSliceErrorCode;
	readonly maxBytes?: number;

	constructor(code: PdfSliceErrorCode, maxBytes?: number, message?: string) {
		super(message ?? defaultSliceErrorMessage(code, maxBytes));
		this.name = "PdfSliceError";
		this.code = code;
		this.maxBytes = maxBytes;
	}
}

function defaultSliceErrorMessage(
	code: PdfSliceErrorCode,
	maxBytes?: number,
): string {
	switch (code) {
		case "SOURCE_TOO_LARGE":
			return `File sách PDF gốc quá lớn — tối đa ${formatBytes(maxBytes ?? PDF_SOURCE_MAX_BYTES)}.`;
		case "ENCRYPTED_PDF":
			return "File PDF đang được đặt mật khẩu bảo vệ nên không cắt tự động được. Hãy bỏ mật khẩu trước rồi thử lại.";
		case "INVALID_PDF":
			return "File không phải định dạng PDF hợp lệ hoặc đã bị hỏng.";
		case "INVALID_RANGE":
			return "Khoảng trang không hợp lệ.";
		case "SLICE_TOO_LARGE":
			return `Đoạn PDF sau khi cắt vượt giới hạn ${formatBytes(maxBytes ?? MATERIAL_DOC_MAX_BYTES)}. Hãy chia nhỏ khoảng trang hơn.`;
	}
}

export interface LoadedPdfSource {
	readonly doc: PDFDocument;
	readonly pageCount: number;
}

/** Đọc byte từ File/Blob (fallback FileReader cho môi trường thiếu Blob.arrayBuffer). */
export async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
	if (typeof blob.arrayBuffer === "function") {
		return new Uint8Array(await blob.arrayBuffer());
	}
	return await new Promise<Uint8Array>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (reader.result instanceof ArrayBuffer) {
				resolve(new Uint8Array(reader.result));
			} else {
				reject(new Error("Failed to read file bytes"));
			}
		};
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read file bytes"));
		reader.readAsArrayBuffer(blob);
	});
}

/** Kiểm 5 byte chữ ký `%PDF-` đầu file. */
export function hasPdfMagicHeader(bytes: Uint8Array): boolean {
	return (
		bytes.byteLength >= 5 &&
		bytes[0] === 0x25 && // %
		bytes[1] === 0x50 && // P
		bytes[2] === 0x44 && // D
		bytes[3] === 0x46 && // F
		bytes[4] === 0x2d // -
	);
}

export type PageRangeValidation = { ok: true } | { ok: false; message: string };

/**
 * Kiểm tra khoảng trang 1-based (`1 <= pageStart <= pageEnd <= totalPages`).
 */
export function validatePageRange(
	pageStart: number,
	pageEnd: number,
	totalPages: number,
): PageRangeValidation {
	if (!Number.isInteger(totalPages) || totalPages < 1) {
		return { ok: false, message: "Sách gốc không có trang nào." };
	}
	if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd)) {
		return { ok: false, message: "Số trang phải là số nguyên dương." };
	}
	if (pageStart < 1 || pageEnd < 1) {
		return { ok: false, message: "Số trang phải từ 1 trở lên." };
	}
	if (pageStart > pageEnd) {
		return {
			ok: false,
			message: "Trang bắt đầu phải nhỏ hơn hoặc bằng trang kết thúc.",
		};
	}
	const upperBound = Math.min(totalPages, MATERIAL_PAGE_MAX);
	if (pageEnd > upperBound) {
		return {
			ok: false,
			message: `Trang kết thúc không được vượt quá ${upperBound} trang.`,
		};
	}
	return { ok: true };
}

/**
 * Lazy-load `pdf-lib` và đọc sách PDF gốc 1 lần để kiểm tra tính hợp lệ,
 * trạng thái mã hóa và lấy tổng số trang.
 */
export async function inspectPdfDocument(
	bytes: Uint8Array,
): Promise<LoadedPdfSource> {
	if (bytes.byteLength === 0) {
		throw new PdfSliceError("INVALID_PDF");
	}
	if (bytes.byteLength > PDF_SOURCE_MAX_BYTES) {
		throw new PdfSliceError("SOURCE_TOO_LARGE", PDF_SOURCE_MAX_BYTES);
	}
	if (!hasPdfMagicHeader(bytes)) {
		throw new PdfSliceError("INVALID_PDF");
	}
	const { PDFDocument } = await import("pdf-lib");
	let doc: PDFDocument;
	let pageCount: number;
	try {
		doc = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
		if (doc.isEncrypted) {
			throw new PdfSliceError("ENCRYPTED_PDF");
		}
		pageCount = doc.getPageCount();
	} catch (err) {
		if (err instanceof PdfSliceError) throw err;
		if (
			err instanceof Error &&
			(err.name === "EncryptedPDFError" || /encrypt/i.test(err.message))
		) {
			throw new PdfSliceError("ENCRYPTED_PDF");
		}
		throw new PdfSliceError("INVALID_PDF");
	}
	if (pageCount < 1) {
		throw new PdfSliceError("INVALID_PDF");
	}
	return { doc, pageCount };
}

/**
 * Cắt trang từ `pageStart` đến `pageEnd` (1-based, bao gồm hai đầu) thành file
 * PDF độc lập mới bằng `pdf-lib`. Ném `SLICE_TOO_LARGE` nếu vượt trần upload.
 */
export async function slicePdfPages(
	source: LoadedPdfSource,
	pageStart: number,
	pageEnd: number,
	maxOutputBytes: number = MATERIAL_DOC_MAX_BYTES,
): Promise<Uint8Array> {
	const check = validatePageRange(pageStart, pageEnd, source.pageCount);
	if (!check.ok) {
		throw new PdfSliceError("INVALID_RANGE", undefined, check.message);
	}
	const { PDFDocument } = await import("pdf-lib");
	const output = await PDFDocument.create();
	const indices: number[] = [];
	for (let p = pageStart; p <= pageEnd; p += 1) {
		indices.push(p - 1);
	}
	const copiedPages = await output.copyPages(source.doc, indices);
	for (const page of copiedPages) {
		output.addPage(page);
	}
	const saved = await output.save();
	if (saved.byteLength > maxOutputBytes) {
		throw new PdfSliceError("SLICE_TOO_LARGE", maxOutputBytes);
	}
	return saved;
}

/**
 * Làm sạch tên sách nguồn gửi kèm metadata `sourceTitle`: gỡ mọi ký tự điều
 * khiển / bidi (`\p{Cc}\p{Cf}`) mà hệ điều hành hay chèn vào tên file và cắt
 * gọn trong giới hạn 200 ký tự để khớp validation phía server.
 */
export function sanitizeSourceTitle(raw: string, maxChars = 200): string {
	return raw
		.replace(/[\p{Cc}\p{Cf}]/gu, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, maxChars)
		.trimEnd();
}

/**
 * Đóng gói byte PDF đã cắt thành `File` chuẩn `application/pdf`, tự làm sạch
 * ký tự điều khiển/đường dẫn và cắt ngắn tên file <= 200 ký tự nhưng luôn giữ
 * nguyên hậu tố trang + `.pdf`.
 */
export function buildSlicedPdfFile(
	bytes: Uint8Array,
	title: string,
	pageStart: number,
	pageEnd: number,
): File {
	const suffix =
		pageStart === pageEnd
			? `-tr-${pageStart}.pdf`
			: `-tr-${pageStart}-${pageEnd}.pdf`;
	const cleaned = title
		// Loại bỏ mọi ký tự điều khiển, bidi/format và ký tự cấm trong tên file.
		.replace(/[\p{Cc}\p{Cf}]/gu, "")
		.replace(/[/\\:*?"<>|]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\.pdf$/i, "")
		.replace(/^\.+/, "")
		.trim();
	const base = cleaned || "bai-giang";
	const maxBaseLen = Math.max(1, PDF_SLICE_MAX_FILENAME_CHARS - suffix.length);
	const truncatedBase =
		base.length > maxBaseLen ? base.slice(0, maxBaseLen).trimEnd() : base;
	const fileName = `${truncatedBase || "bai-giang"}${suffix}`;
	return new File([new Uint8Array(bytes)], fileName, {
		type: "application/pdf",
	});
}
