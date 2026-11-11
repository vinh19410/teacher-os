import { z } from "zod";
import { normalizeMediaType, sanitizeMediaFileName } from "./lib/quiz-media";

/**
 * Ngân hàng tài liệu của org và tài liệu theo buổi học. Quy tắc tên file,
 * đuôi file, loại MIME và trần dung lượng là hàm thuần dùng chung 1:1 giữa
 * client và server; chữ ký nhị phân đầu file (`matchesMaterialMagic`) được
 * server xác thực trực tiếp trên stream upload trước khi lưu kho (#676).
 */

export const MATERIAL_KINDS = ["file", "link", "media"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export function isMaterialKind(value: string): value is MaterialKind {
	return (MATERIAL_KINDS as readonly string[]).includes(value);
}

/** Trần dung lượng tài liệu (PDF, ảnh, Office). */
export const MATERIAL_DOC_MAX_BYTES = 25 * 1024 * 1024;
/**
 * Trần dung lượng audio/video: 95 MiB (99.614.720 B) — nằm dưới giới hạn
 * request body 100 MB (~100.000.000 B SI) của Cloudflare Free/Pro edge để
 * client chặn ngay trước khi đụng trang HTML 413 không có CORS của proxy
 * (#647; chỉ tăng khi cả staging và prod đều ở gói Business >= 200 MB).
 */
export const MATERIAL_MEDIA_MAX_BYTES = 95 * 1024 * 1024;

export const MATERIAL_TITLE_MAX = 200;
export const MATERIAL_DESCRIPTION_MAX = 1000;
export const MATERIAL_URL_MAX = 2000;
export const MATERIAL_FOLDER_NAME_MAX = 100;
/** Độ sâu tối đa của cây thư mục (thư mục gốc là cấp 1). */
export const MATERIAL_FOLDER_MAX_DEPTH = 5;

/**
 * Allowlist MIME (dạng chuẩn hoá) → loại tài liệu + nhãn hiển thị. Chỉ các
 * MIME này được lưu và phục vụ lại; server phục vụ đúng MIME đã lưu kèm
 * `nosniff`, nên không có định dạng chạy được trong trình duyệt (HTML, SVG).
 */
export const MATERIAL_MIME: Readonly<
	Record<string, { kind: "file" | "media"; label: string }>
> = {
	"application/pdf": { kind: "file", label: "PDF" },
	"image/png": { kind: "file", label: "PNG" },
	"image/jpeg": { kind: "file", label: "JPG" },
	"image/webp": { kind: "file", label: "WEBP" },
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
		kind: "file",
		label: "DOCX",
	},
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": {
		kind: "file",
		label: "PPTX",
	},
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
		kind: "file",
		label: "XLSX",
	},
	"audio/mpeg": { kind: "media", label: "MP3" },
	"audio/mp4": { kind: "media", label: "M4A" },
	"video/mp4": { kind: "media", label: "MP4" },
};

/** Đuôi file / MIME bí danh → MIME chuẩn, cho trình duyệt báo `File.type`
 * rỗng hoặc lệch (Windows hay báo rỗng cho Office, Safari báo m4a là
 * `audio/x-m4a`). */
const MATERIAL_EXTENSION_TYPES: Readonly<Record<string, string>> = {
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	mp3: "audio/mpeg",
	m4a: "audio/mp4",
	mp4: "video/mp4",
};

const MATERIAL_MIME_ALIASES: Readonly<Record<string, string>> = {
	"audio/x-m4a": "audio/mp4",
	"audio/m4a": "audio/mp4",
	"audio/mp4a-latm": "audio/mp4",
	"audio/mp3": "audio/mpeg",
	"audio/x-mp3": "audio/mpeg",
	"audio/mpeg3": "audio/mpeg",
	"audio/x-mpeg-3": "audio/mpeg",
	"image/jpg": "image/jpeg",
	"image/pjpeg": "image/jpeg",
	"image/x-png": "image/png",
	"application/x-pdf": "application/pdf",
};

const OOXML_MIMES: Readonly<Record<string, true>> = {
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
};

/** Các `major_brand` ISO-BMFF không phải container MP4/M4A phát được trên web. */
const BANNED_FTYP_BRANDS: Readonly<Record<string, true>> = {
	"qt  ": true,
	heic: true,
	heix: true,
	hevc: true,
	hevx: true,
	mif1: true,
	msf1: true,
	avif: true,
	avis: true,
	"jp2 ": true,
};

/** Số byte đầu luồng tối đa server đọc sớm để kiểm chữ ký magic-byte (#676). */
export const MATERIAL_MAGIC_PEEK_BYTES = 64;

function extensionMime(fileName: string): string | null {
	const clean = sanitizeMediaFileName(fileName);
	if (!clean || clean.startsWith(".")) return null;
	const dot = clean.lastIndexOf(".");
	if (dot <= 0 || dot === clean.length - 1) return null;
	const ext = clean.slice(dot + 1).toLowerCase();
	return Object.hasOwn(MATERIAL_EXTENSION_TYPES, ext)
		? (MATERIAL_EXTENSION_TYPES[ext] ?? null)
		: null;
}

/** Kiểm tra tên file (sau sanitize) có phần thân và đuôi khớp đúng MIME chuẩn. */
export function materialExtensionMatches(
	fileName: string,
	mimeType: string,
): boolean {
	const normalized = normalizeMediaType(mimeType);
	return (
		Object.hasOwn(MATERIAL_MIME, normalized) &&
		extensionMime(fileName) === normalized
	);
}

/**
 * MIME client gửi lên cho file đã chọn: tên file phải có thân + đuôi thuộc
 * `MATERIAL_EXTENSION_TYPES`; chỉ fallback tự do theo đuôi khi `browserType`
 * rỗng hoặc `application/octet-stream`, còn lại bắt buộc MIME trình duyệt
 * (sau khi gộp bí danh / container tương thích) khớp đúng MIME của đuôi file.
 */
export function resolveMaterialMimeType(
	fileName: string,
	browserType: string,
): string | null {
	const extMime = extensionMime(fileName);
	if (!extMime) return null;
	const normalized = normalizeMediaType(browserType);
	if (normalized === "" || normalized === "application/octet-stream") {
		return extMime;
	}
	if (extMime === "audio/mp4" && normalized === "video/mp4") {
		return "audio/mp4";
	}
	if (
		Object.hasOwn(OOXML_MIMES, extMime) &&
		(normalized === "application/zip" ||
			normalized === "application/x-zip-compressed")
	) {
		return extMime;
	}
	const canonical = Object.hasOwn(MATERIAL_MIME_ALIASES, normalized)
		? (MATERIAL_MIME_ALIASES[normalized] ?? normalized)
		: normalized;
	return Object.hasOwn(MATERIAL_MIME, canonical) && canonical === extMime
		? canonical
		: null;
}

function hasBytesAt(
	buf: Uint8Array,
	offset: number,
	expected: readonly number[],
): boolean {
	if (buf.byteLength < offset + expected.length) return false;
	for (let i = 0; i < expected.length; i++) {
		if (buf[offset + i] !== expected[i]) return false;
	}
	return true;
}

/**
 * Xác thực chữ ký nhị phân đầu luồng (`head`, tối đa 64 byte) khớp với MIME
 * chuẩn đã khai báo, chặn các payload giả mạo và polyglot HTML/UTF-16LE BOM.
 */
export function matchesMaterialMagic(
	mimeType: string,
	head: Uint8Array,
): boolean {
	const normalized = normalizeMediaType(mimeType);
	if (!Object.hasOwn(MATERIAL_MIME, normalized)) return false;

	if (normalized === "application/pdf") {
		const major = head[5] ?? 0;
		const minor = head[7] ?? 0;
		return (
			head.byteLength >= 8 &&
			hasBytesAt(head, 0, [0x25, 0x50, 0x44, 0x46, 0x2d]) &&
			(major === 0x31 || major === 0x32) &&
			head[6] === 0x2e &&
			minor >= 0x30 &&
			minor <= 0x39
		);
	}
	if (normalized === "image/png") {
		return hasBytesAt(
			head,
			0,
			[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
		);
	}
	if (normalized === "image/jpeg") {
		return hasBytesAt(head, 0, [0xff, 0xd8, 0xff]);
	}
	if (normalized === "image/webp") {
		return (
			head.byteLength >= 16 &&
			hasBytesAt(head, 0, [0x52, 0x49, 0x46, 0x46]) &&
			hasBytesAt(head, 8, [0x57, 0x45, 0x42, 0x50]) &&
			(hasBytesAt(head, 12, [0x56, 0x50, 0x38, 0x20]) ||
				hasBytesAt(head, 12, [0x56, 0x50, 0x38, 0x4c]) ||
				hasBytesAt(head, 12, [0x56, 0x50, 0x38, 0x58]))
		);
	}
	if (Object.hasOwn(OOXML_MIMES, normalized)) {
		if (
			head.byteLength < 30 ||
			!hasBytesAt(head, 0, [0x50, 0x4b, 0x03, 0x04])
		) {
			return false;
		}
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		const method = view.getUint16(8, true);
		const nameLen = view.getUint16(26, true);
		return (method === 0 || method === 8) && nameLen > 0;
	}
	if (normalized === "audio/mpeg") {
		if (head.byteLength >= 10 && hasBytesAt(head, 0, [0x49, 0x44, 0x33])) {
			const major = head[3] ?? 0;
			const rev = head[4] ?? 0xff;
			const syncBits =
				(head[6] ?? 0x80) |
				(head[7] ?? 0x80) |
				(head[8] ?? 0x80) |
				(head[9] ?? 0x80);
			if (major >= 2 && major <= 4 && rev < 0xff && (syncBits & 0x80) === 0) {
				return true;
			}
		}
		if (head.byteLength < 4) return false;
		const b0 = head[0] ?? 0;
		const b1 = head[1] ?? 0;
		const b2 = head[2] ?? 0;
		return (
			b0 === 0xff &&
			(b1 & 0xe0) === 0xe0 &&
			(b1 & 0x18) !== 0x08 &&
			(b1 & 0x06) === 0x02 &&
			(b2 & 0xf0) !== 0x00 &&
			(b2 & 0xf0) !== 0xf0 &&
			(b2 & 0x0c) !== 0x0c
		);
	}
	if (normalized === "audio/mp4" || normalized === "video/mp4") {
		if (
			head.byteLength < 12 ||
			!hasBytesAt(head, 4, [0x66, 0x74, 0x79, 0x70])
		) {
			return false;
		}
		const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
		const boxSize = view.getUint32(0, false);
		if (boxSize < 16 || boxSize > 4096) return false;
		const c0 = head[8] ?? 0;
		const c1 = head[9] ?? 0;
		const c2 = head[10] ?? 0;
		const c3 = head[11] ?? 0;
		if (
			c0 < 0x20 ||
			c0 > 0x7e ||
			c1 < 0x20 ||
			c1 > 0x7e ||
			c2 < 0x20 ||
			c2 > 0x7e ||
			c3 < 0x20 ||
			c3 > 0x7e
		) {
			return false;
		}
		return !Object.hasOwn(
			BANNED_FTYP_BRANDS,
			String.fromCharCode(c0, c1, c2, c3),
		);
	}
	return false;
}

export type MaterialUploadCheck =
	| { ok: true; kind: "file" | "media"; mimeType: string; maxBytes: number }
	| { ok: false; reason: "type" }
	| { ok: false; reason: "empty" }
	| { ok: false; reason: "size"; maxBytes: number };

/**
 * Hàm duy nhất xác thực loại + dung lượng file tải lên (server kiểm header
 * Content-Type/Content-Length, client kiểm `File` trước khi gửi). MIME phải
 * là dạng chuẩn trong `MATERIAL_MIME`; trần dung lượng theo loại.
 */
export function checkMaterialUpload(input: {
	mimeType: string;
	size: number;
}): MaterialUploadCheck {
	const mimeType = normalizeMediaType(input.mimeType);
	const entry = Object.hasOwn(MATERIAL_MIME, mimeType)
		? MATERIAL_MIME[mimeType]
		: undefined;
	if (!entry) return { ok: false, reason: "type" };
	const maxBytes =
		entry.kind === "media" ? MATERIAL_MEDIA_MAX_BYTES : MATERIAL_DOC_MAX_BYTES;
	if (!Number.isInteger(input.size) || input.size <= 0) {
		return { ok: false, reason: "empty" };
	}
	if (input.size > maxBytes) return { ok: false, reason: "size", maxBytes };
	return { ok: true, kind: entry.kind, mimeType, maxBytes };
}

/** Chỉ link http/https tuyệt đối — chặn `javascript:`, `data:`, `file:`… */
export function isSafeMaterialUrl(raw: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return false;
	}
	return parsed.protocol === "http:" || parsed.protocol === "https:";
}

const materialTitleSchema = z.string().trim().min(1).max(MATERIAL_TITLE_MAX);
const materialDescriptionSchema = z
	.string()
	.trim()
	.max(MATERIAL_DESCRIPTION_MAX);
const materialUrlSchema = z
	.string()
	.trim()
	.min(1)
	.max(MATERIAL_URL_MAX)
	.refine(isSafeMaterialUrl, { message: "url must be http or https" });
const idSchema = z.string().trim().min(1).max(100);
const folderNameSchema = z
	.string()
	.trim()
	.min(1)
	.max(MATERIAL_FOLDER_NAME_MAX)
	.refine((name) => !/[\p{Cc}\p{Cf}]/u.test(name), {
		message: "folder name contains control characters",
	});

export const materialFolderCreateSchema = z
	.object({
		name: folderNameSchema,
		parentId: idSchema.nullable().default(null),
	})
	.strict();
export type MaterialFolderCreateInput = z.infer<
	typeof materialFolderCreateSchema
>;

/** Đổi tên và/hoặc di chuyển thư mục (`parentId: null` = về gốc). */
export const materialFolderUpdateSchema = z
	.object({
		name: folderNameSchema.optional(),
		parentId: idSchema.nullable().optional(),
	})
	.strict()
	.refine((v) => v.name !== undefined || v.parentId !== undefined, {
		message: "nothing to update",
	});
export type MaterialFolderUpdateInput = z.infer<
	typeof materialFolderUpdateSchema
>;

export const materialLinkCreateSchema = z
	.object({
		title: materialTitleSchema,
		description: materialDescriptionSchema.default(""),
		url: materialUrlSchema,
		folderId: idSchema.nullable().default(null),
	})
	.strict();
export type MaterialLinkCreateInput = z.infer<typeof materialLinkCreateSchema>;

/** Sửa tiêu đề, mô tả, thư mục (`folderId: null` = về gốc). */
export const materialUpdateSchema = z
	.object({
		title: materialTitleSchema.optional(),
		description: materialDescriptionSchema.optional(),
		folderId: idSchema.nullable().optional(),
	})
	.strict()
	.refine(
		(v) =>
			v.title !== undefined ||
			v.description !== undefined ||
			v.folderId !== undefined,
		{ message: "nothing to update" },
	);
export type MaterialUpdateInput = z.infer<typeof materialUpdateSchema>;

export const lessonMaterialAttachSchema = z
	.object({ materialId: idSchema })
	.strict();
export type LessonMaterialAttachInput = z.infer<
	typeof lessonMaterialAttachSchema
>;

/** Bộ lọc danh sách: `folderId` vắng = mọi thư mục, `"root"` = chỉ gốc. */
export const MATERIAL_ROOT_FOLDER = "root";
export const MATERIAL_SEARCH_MAX = 100;

export const MATERIAL_ERROR_CODES = [
	"MATERIAL_NOT_FOUND",
	"FOLDER_NOT_FOUND",
	"FOLDER_NOT_EMPTY",
	"FOLDER_NAME_TAKEN",
	"FOLDER_TOO_DEEP",
	"FOLDER_CYCLE",
	"MATERIAL_IN_USE",
	"CLASS_NOT_FOUND",
	"SESSION_NOT_FOUND",
	"ALREADY_ATTACHED",
	"NOT_ATTACHED",
	"INVALID_FILE",
	"FILE_TOO_LARGE",
	"UNSUPPORTED_FILE_TYPE",
	"MATERIALS_DISABLED",
	"SESSION_HOLIDAY",
] as const;
export type MaterialErrorCode = (typeof MATERIAL_ERROR_CODES)[number];

/** Thư mục trả cho app giáo viên (danh sách phẳng, client tự dựng cây). */
export interface MaterialFolderView {
	id: string;
	parentId: string | null;
	name: string;
	createdAt: string;
}

/** Tài liệu trả cho app giáo viên. `usageCount` = số buổi đang gắn. */
export interface MaterialView {
	id: string;
	folderId: string | null;
	title: string;
	description: string;
	kind: MaterialKind;
	url: string | null;
	mimeType: string | null;
	sizeBytes: number | null;
	originalName: string | null;
	usageCount: number;
	createdAt: string;
	updatedAt: string;
}

/** Tài liệu gắn vào buổi học (app giáo viên). */
export interface LessonMaterialView extends MaterialView {
	position: number;
	attachedAt: string;
}

/**
 * Tài liệu buổi học cho học viên — chỉ đọc, không có cột teacher-only
 * (object key, người tạo, thư mục, số buổi dùng).
 */
export interface StudentLessonMaterialView {
	id: string;
	title: string;
	description: string;
	kind: MaterialKind;
	url: string | null;
	mimeType: string | null;
	sizeBytes: number | null;
	originalName: string | null;
	position: number;
}

/**
 * Tham chiếu tài liệu ngân hàng gắn trên một bài học giáo trình (issue #655,
 * template hoặc bản copy của lớp) — cùng projection an toàn như view học
 * viên: không objectKey, không createdBy, không usageCount.
 */
export type SyllabusBankMaterialRef = StudentLessonMaterialView;

export interface MaterialFolderListResponse {
	folders: MaterialFolderView[];
}
export interface MaterialListResponse {
	items: MaterialView[];
}
export interface LessonMaterialListResponse {
	items: LessonMaterialView[];
}
export interface StudentLessonMaterialListResponse {
	items: StudentLessonMaterialView[];
}
