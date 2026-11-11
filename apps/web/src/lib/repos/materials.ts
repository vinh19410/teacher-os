/**
 * Repo ngân hàng tài liệu (giáo viên): thư mục, tài liệu và tài liệu gắn
 * theo buổi học (classId + date). Response parse bằng interface contract
 * (server là nguồn shape). Lỗi ném `MaterialRequestError` mang mã nghiệp vụ
 * (`MATERIAL_ERROR_CODES`) để UI hiện đúng thông điệp tiếng Việt.
 *
 * File tải lên là byte thô (PUT, không multipart) kèm Content-Type chuẩn
 * hoá và X-File-Name đã encodeURIComponent; client chặn trước loại/dung
 * lượng bằng đúng hàm server dùng (`checkMaterialUpload`).
 */
import {
	checkMaterialUpload,
	type LessonMaterialView,
	MATERIAL_ERROR_CODES,
	type MaterialErrorCode,
	type MaterialFolderCreateInput,
	type MaterialFolderListResponse,
	type MaterialFolderUpdateInput,
	type MaterialFolderView,
	type MaterialKind,
	type MaterialLinkCreateInput,
	type MaterialListResponse,
	type MaterialUpdateInput,
	type MaterialView,
	resolveMaterialMimeType,
	type SyllabusBankMaterialRef,
} from "@teacher-os/api/material-contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export class MaterialRequestError extends HttpError {
	readonly materialCode: MaterialErrorCode | null;
	/** `MATERIAL_IN_USE`: số buổi đang gắn tài liệu. */
	readonly sessionCount?: number;
	/** `MATERIAL_IN_USE`: số bài giáo trình đang gắn tài liệu (#655). */
	readonly syllabusCount?: number;
	/** `FILE_TOO_LARGE`: trần dung lượng server áp. */
	readonly maxBytes?: number;

	constructor(
		status: number,
		materialCode: MaterialErrorCode | null,
		extra: {
			sessionCount?: number;
			syllabusCount?: number;
			maxBytes?: number;
		} = {},
	) {
		super(status, `Material request failed: ${status} ${materialCode ?? ""}`, {
			code: materialCode ?? undefined,
		});
		this.name = "MaterialRequestError";
		this.materialCode = materialCode;
		this.sessionCount = extra.sessionCount;
		this.syllabusCount = extra.syllabusCount;
		this.maxBytes = extra.maxBytes;
	}
}

export function isMaterialRequestError(
	error: unknown,
): error is MaterialRequestError {
	return error instanceof MaterialRequestError;
}

function isMaterialErrorCode(value: unknown): value is MaterialErrorCode {
	return (
		typeof value === "string" &&
		(MATERIAL_ERROR_CODES as readonly string[]).includes(value)
	);
}

async function toMaterialError(res: Response): Promise<MaterialRequestError> {
	let body: unknown = null;
	try {
		body = await res.json();
	} catch {
		// Body rỗng/không phải JSON — status vẫn là nguồn chân lý.
	}
	const record =
		body !== null && typeof body === "object"
			? (body as Record<string, unknown>)
			: {};
	const code = isMaterialErrorCode(record.code) ? record.code : null;
	const sessionCount =
		typeof record.sessionCount === "number" ? record.sessionCount : undefined;
	const syllabusCount =
		typeof record.syllabusCount === "number" ? record.syllabusCount : undefined;
	const maxBytes =
		typeof record.maxBytes === "number" ? record.maxBytes : undefined;
	return new MaterialRequestError(res.status, code, {
		sessionCount,
		syllabusCount,
		maxBytes,
	});
}

async function request<T>(
	path: string,
	init: RequestInit = {},
	baseUrl: string = getApiBaseUrl(),
): Promise<T> {
	const res = await fetch(`${baseUrl}${path}`, {
		credentials: "include",
		...init,
	});
	if (!res.ok) throw await toMaterialError(res);
	return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
	return {
		method,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	};
}

/** Dung lượng dạng người đọc: 1,5 MB / 820 KB. */
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
	return `${rounded.toLocaleString("vi-VN")} ${units[unit]}`;
}

/**
 * Thông điệp tiếng Việt cho mọi mã lỗi của module tài liệu. `MATERIAL_IN_USE`
 * kèm số buổi; `FILE_TOO_LARGE` kèm trần dung lượng.
 */
export function materialErrorMessage(error: unknown): string {
	if (!(error instanceof HttpError)) {
		return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
	}
	const code = isMaterialRequestError(error) ? error.materialCode : null;
	switch (code) {
		case "MATERIAL_NOT_FOUND":
			return "Tài liệu không còn tồn tại — có thể đã bị xóa.";
		case "FOLDER_NOT_FOUND":
			return "Thư mục không còn tồn tại — có thể đã bị xóa.";
		case "FOLDER_NOT_EMPTY":
			return "Thư mục còn thư mục con hoặc tài liệu. Hãy chuyển hoặc xóa chúng trước.";
		case "FOLDER_NAME_TAKEN":
			return "Đã có thư mục cùng tên ở vị trí này. Hãy chọn tên khác.";
		case "FOLDER_TOO_DEEP":
			return "Cây thư mục tối đa 5 cấp — không thể đặt thư mục sâu hơn.";
		case "FOLDER_CYCLE":
			return "Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.";
		case "MATERIAL_IN_USE": {
			// #655: tài liệu có thể bị chặn vì đang gắn trên bài giáo trình
			// (syllabus_lesson_material) chứ không chỉ buổi học — nêu đúng
			// nguồn để teacher biết chỗ gỡ.
			const sessions = isMaterialRequestError(error)
				? (error.sessionCount ?? 0)
				: 0;
			const syllabus = isMaterialRequestError(error)
				? (error.syllabusCount ?? 0)
				: 0;
			if (sessions > 0 && syllabus > 0) {
				return `Tài liệu đang được dùng ở ${sessions} buổi học và ${syllabus} bài trong giáo trình. Hãy gỡ khỏi các buổi và bài đó trước khi xóa.`;
			}
			if (syllabus > 0) {
				return `Tài liệu đang được gắn trên ${syllabus} bài trong giáo trình. Hãy gỡ ở giáo trình (template hoặc lớp) trước khi xóa.`;
			}
			return sessions > 0
				? `Tài liệu đang được dùng ở ${sessions} buổi học. Hãy gỡ khỏi các buổi đó trước khi xóa.`
				: "Tài liệu đang được dùng ở buổi học. Hãy gỡ khỏi các buổi đó trước khi xóa.";
		}
		case "CLASS_NOT_FOUND":
			return "Không tìm thấy lớp học.";
		case "SESSION_NOT_FOUND":
			return "Buổi học không còn tồn tại — có thể đã được dời hoặc xóa.";
		case "ALREADY_ATTACHED":
			return "Tài liệu này đã được gắn vào buổi học.";
		case "NOT_ATTACHED":
			return "Tài liệu không còn gắn với buổi học này.";
		case "INVALID_FILE":
			return "File không hợp lệ hoặc rỗng. Hãy chọn file khác.";
		case "FILE_TOO_LARGE": {
			const max = isMaterialRequestError(error) ? error.maxBytes : undefined;
			return max
				? `File quá lớn — tối đa ${formatBytes(max)}.`
				: "File quá lớn so với giới hạn cho phép.";
		}
		case "UNSUPPORTED_FILE_TYPE":
			return "Định dạng chưa hỗ trợ. Chỉ nhận PDF, ảnh PNG/JPG/WEBP, DOCX/PPTX/XLSX, MP3/M4A/MP4.";
		case "MATERIALS_DISABLED":
			return "Kho file tài liệu đang tạm ngưng. Liên kết vẫn dùng được; thử tải file lại sau.";
		case "SESSION_HOLIDAY":
			// #662: code dùng cho cả bucket holiday thuần (#645) lẫn bucket
			// đã-shift còn buổi manual — case sau detach chủ ý còn 200 nên
			// copy không được khẳng định "không gỡ được".
			return "Buổi này là buổi nghỉ lễ đã dời lịch — không gắn tài liệu được.";
		default:
			break;
	}
	// Phủ phản hồi 413 có CORS nhưng không kèm JSON FILE_TOO_LARGE (trần 95 MiB
	// ở prepareMaterialUpload đã chặn trước nhánh 413 thiếu CORS của Cloudflare edge).
	if (error.status === 413) return "File quá lớn so với giới hạn cho phép.";
	if (error.status === 403) return "Bạn không có quyền thực hiện thao tác này.";
	if (error.status === 400)
		return "Dữ liệu không hợp lệ. Kiểm tra lại rồi thử lại.";
	return "Không lưu được — vui lòng thử lại.";
}

export type MaterialUploadPrep =
	| { ok: true; mimeType: string }
	| { ok: false; message: string };

/**
 * Kiểm file đã chọn TRƯỚC khi gửi: MIME (theo trình duyệt hoặc đuôi file)
 * phải thuộc allowlist, dung lượng > 0 và dưới trần theo loại.
 */
export function prepareMaterialUpload(file: File): MaterialUploadPrep {
	const mimeType = resolveMaterialMimeType(file.name, file.type);
	if (mimeType === null) {
		return {
			ok: false,
			message: materialErrorMessage(
				new MaterialRequestError(415, "UNSUPPORTED_FILE_TYPE"),
			),
		};
	}
	const check = checkMaterialUpload({ mimeType, size: file.size });
	if (check.ok) return { ok: true, mimeType: check.mimeType };
	if (check.reason === "size") {
		return {
			ok: false,
			message: materialErrorMessage(
				new MaterialRequestError(413, "FILE_TOO_LARGE", {
					maxBytes: check.maxBytes,
				}),
			),
		};
	}
	if (check.reason === "empty") {
		return {
			ok: false,
			message: materialErrorMessage(
				new MaterialRequestError(400, "INVALID_FILE"),
			),
		};
	}
	return {
		ok: false,
		message: materialErrorMessage(
			new MaterialRequestError(415, "UNSUPPORTED_FILE_TYPE"),
		),
	};
}

function uploadInit(file: File, mimeType: string): RequestInit {
	return {
		method: "PUT",
		headers: {
			"Content-Type": mimeType,
			"X-File-Name": encodeURIComponent(file.name),
		},
		body: file,
	};
}

// ---- Query keys ----

/** Prefix chung: mọi thay đổi ngân hàng invalidate cả cụm. */
export const materialsAllQueryKey = ["materials"] as const;
export const materialFoldersQueryKey = [
	...materialsAllQueryKey,
	"folders",
] as const;

export interface MaterialListParams {
	q?: string;
	kind?: MaterialKind;
	/** Vắng = mọi thư mục; `"root"` = chỉ tài liệu chưa xếp thư mục. */
	folderId?: string;
}

export const materialListQueryKey = (params: MaterialListParams) =>
	[...materialsAllQueryKey, "list", params] as const;

export const sessionMaterialsQueryKey = (classId: string, date: string) =>
	[...materialsAllQueryKey, "session", classId, date] as const;

// ---- Thư mục ----

export async function fetchMaterialFolders(
	signal?: AbortSignal,
): Promise<MaterialFolderView[]> {
	const body = await request<MaterialFolderListResponse>(
		"/api/materials/folders",
		{ signal },
	);
	return body.folders;
}

export async function createMaterialFolder(
	input: MaterialFolderCreateInput,
): Promise<MaterialFolderView> {
	const body = await request<{ folder: MaterialFolderView }>(
		"/api/materials/folders",
		jsonInit("POST", input),
	);
	return body.folder;
}

export async function updateMaterialFolder(
	id: string,
	input: MaterialFolderUpdateInput,
): Promise<MaterialFolderView> {
	const body = await request<{ folder: MaterialFolderView }>(
		`/api/materials/folders/${encodeURIComponent(id)}`,
		jsonInit("PATCH", input),
	);
	return body.folder;
}

export async function deleteMaterialFolder(id: string): Promise<void> {
	await request<{ ok: true }>(
		`/api/materials/folders/${encodeURIComponent(id)}`,
		{ method: "DELETE" },
	);
}

// ---- Tài liệu ----

export async function fetchMaterials(
	params: MaterialListParams,
	signal?: AbortSignal,
): Promise<MaterialView[]> {
	const search = new URLSearchParams();
	const q = params.q?.trim();
	if (q) search.set("q", q);
	if (params.kind) search.set("kind", params.kind);
	if (params.folderId) search.set("folderId", params.folderId);
	const query = search.toString();
	const body = await request<MaterialListResponse>(
		`/api/materials${query ? `?${query}` : ""}`,
		{ signal },
	);
	return body.items;
}

export async function createMaterialLink(
	input: MaterialLinkCreateInput,
): Promise<MaterialView> {
	const body = await request<{ material: MaterialView }>(
		"/api/materials/links",
		jsonInit("POST", input),
	);
	return body.material;
}

/** `mimeType` phải lấy từ `prepareMaterialUpload` (đã kiểm). */
export async function uploadMaterialFile(input: {
	file: File;
	mimeType: string;
	folderId: string | null;
}): Promise<MaterialView> {
	const query = input.folderId
		? `?folderId=${encodeURIComponent(input.folderId)}`
		: "";
	const body = await request<{ material: MaterialView }>(
		`/api/materials/files${query}`,
		uploadInit(input.file, input.mimeType),
	);
	return body.material;
}

export async function updateMaterial(
	id: string,
	input: MaterialUpdateInput,
): Promise<MaterialView> {
	const body = await request<{ material: MaterialView }>(
		`/api/materials/${encodeURIComponent(id)}`,
		jsonInit("PATCH", input),
	);
	return body.material;
}

export async function deleteMaterial(id: string): Promise<void> {
	await request<{ ok: true }>(`/api/materials/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
}

/**
 * URL file trên API — cookie phiên đi kèm vì web và API cùng site. Audio/
 * video mở inline (server hỗ trợ Range); `download` ép tải về.
 */
export function materialFileUrl(id: string, download = false): string {
	const base = `${getApiBaseUrl()}/api/materials/${encodeURIComponent(id)}/file`;
	return download ? `${base}?download=1` : base;
}

// ---- Tài liệu của buổi học ----

function sessionPath(classId: string, date: string): string {
	return `/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(date)}/materials`;
}

/**
 * Response materials của một buổi: `items` là tài liệu đính kèm trực tiếp;
 * `curriculumMaterials` là tài liệu giáo trình copy xuống theo buổi N ↔ bài N
 * (#655) — chỉ đọc, thêm/gỡ ở giáo trình của lớp. Vắng mặt với API cũ.
 */
export interface SessionMaterialsResponse {
	items: LessonMaterialView[];
	curriculumMaterials?: SyllabusBankMaterialRef[];
}

export async function fetchSessionMaterials(
	classId: string,
	date: string,
	signal?: AbortSignal,
): Promise<SessionMaterialsResponse> {
	const body = await request<SessionMaterialsResponse>(
		sessionPath(classId, date),
		{ signal },
	);
	return body;
}

export async function attachSessionMaterial(
	classId: string,
	date: string,
	materialId: string,
): Promise<LessonMaterialView> {
	const body = await request<{ item: LessonMaterialView }>(
		sessionPath(classId, date),
		jsonInit("POST", { materialId }),
	);
	return body.item;
}

export async function uploadSessionMaterial(input: {
	classId: string;
	date: string;
	file: File;
	mimeType: string;
}): Promise<LessonMaterialView> {
	const body = await request<{ item: LessonMaterialView }>(
		`${sessionPath(input.classId, input.date)}/files`,
		uploadInit(input.file, input.mimeType),
	);
	return body.item;
}

export async function detachSessionMaterial(
	classId: string,
	date: string,
	materialId: string,
): Promise<void> {
	await request<{ ok: true }>(
		`${sessionPath(classId, date)}/${encodeURIComponent(materialId)}`,
		{ method: "DELETE" },
	);
}
