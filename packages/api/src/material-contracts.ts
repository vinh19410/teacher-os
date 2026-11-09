import { z } from "zod";
import { normalizeMediaType } from "./lib/quiz-media";

/**
 * Ngân hàng tài liệu của org và tài liệu theo buổi học. Mọi rule ở đây là
 * hàm thuần để server, app giáo viên và cổng học viên cùng một nguồn sự
 * thật — client chặn trước đúng những gì server sẽ trả 4xx.
 */

export const MATERIAL_KINDS = ["file", "link", "media"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export function isMaterialKind(value: string): value is MaterialKind {
	return (MATERIAL_KINDS as readonly string[]).includes(value);
}

/** Trần dung lượng tài liệu (PDF, ảnh, Office). */
export const MATERIAL_DOC_MAX_BYTES = 25 * 1024 * 1024;
/** Trần dung lượng audio/video. */
export const MATERIAL_MEDIA_MAX_BYTES = 100 * 1024 * 1024;

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
	"audio/mp3": "audio/mpeg",
	"image/jpg": "image/jpeg",
};

/**
 * MIME client gửi lên cho file đã chọn: MIME trình duyệt nếu thuộc
 * allowlist (sau khi gộp bí danh), ngược lại tra theo đuôi file. Không khớp
 * → null. Server chỉ nhận MIME chuẩn trong `MATERIAL_MIME`.
 */
export function resolveMaterialMimeType(
	fileName: string,
	browserType: string,
): string | null {
	const normalized = normalizeMediaType(browserType);
	const canonical = MATERIAL_MIME_ALIASES[normalized] ?? normalized;
	if (Object.hasOwn(MATERIAL_MIME, canonical)) return canonical;
	const dot = fileName.lastIndexOf(".");
	if (dot < 0) return null;
	return (
		MATERIAL_EXTENSION_TYPES[fileName.slice(dot + 1).toLowerCase()] ?? null
	);
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
