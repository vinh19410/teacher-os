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
import { useQueryClient } from "@tanstack/react-query";
import {
	type ClassMaterialLinkCreateInput,
	type ClassMaterialListResponse,
	type ClassMaterialView,
	checkMaterialUpload,
	type LessonMaterialCategory,
	type LessonMaterialLinkCreateInput,
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
import { canWriteMaterials } from "@teacher-os/auth/role";
import { isPreviewableContentType } from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { useCallback, useSyncExternalStore } from "react";
import { HttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import { getApiBaseUrl } from "./api-base-url";
import { kernelQueryKey } from "./kernel";

export class MaterialRequestError extends HttpError {
	readonly materialCode: MaterialErrorCode | null;
	/** `MATERIAL_IN_USE`: số buổi đang gắn tài liệu. */
	readonly sessionCount?: number;
	/** `MATERIAL_IN_USE`: số bài giáo trình đang gắn tài liệu (#655). */
	readonly syllabusCount?: number;
	/** `MATERIAL_IN_USE`: số lớp đang gắn tài liệu ở mục tài liệu chung. */
	readonly classCount?: number;
	/** `FILE_TOO_LARGE`: trần dung lượng server áp. */
	readonly maxBytes?: number;

	constructor(
		status: number,
		materialCode: MaterialErrorCode | null,
		extra: {
			sessionCount?: number;
			syllabusCount?: number;
			classCount?: number;
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
		this.classCount = extra.classCount;
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
	const classCount =
		typeof record.classCount === "number" ? record.classCount : undefined;
	const maxBytes =
		typeof record.maxBytes === "number" ? record.maxBytes : undefined;
	return new MaterialRequestError(res.status, code, {
		sessionCount,
		syllabusCount,
		classCount,
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
			// Tài liệu có thể bị chặn vì đang gắn ở buổi học, bài trong giáo trình
			// hoặc mục tài liệu chung của lớp — nêu đúng các nguồn để giáo viên biết
			// chỗ gỡ; khi không gắn ở lớp nào thì giữ nguyên thông điệp cũ.
			const sessions = isMaterialRequestError(error)
				? (error.sessionCount ?? 0)
				: 0;
			const syllabus = isMaterialRequestError(error)
				? (error.syllabusCount ?? 0)
				: 0;
			const classes = isMaterialRequestError(error)
				? (error.classCount ?? 0)
				: 0;
			if (classes > 0) {
				const parts: string[] = [];
				if (sessions > 0) parts.push(`${sessions} buổi học`);
				if (syllabus > 0) parts.push(`${syllabus} bài trong giáo trình`);
				parts.push(`${classes} lớp học`);
				if (parts.length === 1) {
					return `Tài liệu đang được dùng ở ${classes} lớp học. Hãy gỡ khỏi các lớp đó trước khi xóa.`;
				}
				const joined = `${parts.slice(0, -1).join(", ")} và ${parts[parts.length - 1]}`;
				return `Tài liệu đang được dùng ở ${joined}. Hãy gỡ khỏi các nơi đang dùng trước khi xóa.`;
			}
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
			return "Tài liệu này đã được gắn trước đó.";
		case "NOT_ATTACHED":
			return "Tài liệu này không còn được gắn.";
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
		case "INVALID_PAGE_RANGE":
			return "Khoảng trang sách không hợp lệ — trang bắt đầu phải nhỏ hơn hoặc bằng trang kết thúc.";
		default:
			break;
	}
	// Phủ phản hồi 413 có CORS nhưng không kèm JSON FILE_TOO_LARGE (trần 95 MiB
	// ở prepareMaterialUpload đã chặn trước nhánh 413 thiếu CORS của Cloudflare edge).
	if (error.status === 413) return "File quá lớn so với giới hạn cho phép.";
	if (error.status === 415) return "Định dạng tài liệu không hỗ trợ xem trước.";
	if (error.status === 401)
		return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
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

export const classMaterialsQueryKey = (classId: string) =>
	[...materialsAllQueryKey, "class", classId] as const;

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

/**
 * Tải file tài liệu về blob URL để xem trước trong app: server luôn trả
 * tài liệu dạng `attachment` + CSP khoá cứng nên không nhúng trực tiếp URL
 * API được. Caller sở hữu URL trả về và phải `URL.revokeObjectURL` khi xong.
 */
export async function fetchMaterialFileBlobUrl(
	id: string,
	signal?: AbortSignal,
	baseUrl: string = getApiBaseUrl(),
): Promise<string> {
	const res = await fetch(
		`${baseUrl}/api/materials/${encodeURIComponent(id)}/file`,
		{ credentials: "include", signal },
	);
	if (!res.ok) throw await toMaterialError(res);
	if (!isPreviewableContentType(res.headers.get("content-type"))) {
		void res.body?.cancel().catch(() => {});
		throw new MaterialRequestError(415, null);
	}
	return URL.createObjectURL(await res.blob());
}

/**
 * Tải byte PDF của một tài liệu trong ngân hàng/tài liệu chung để cắt trang
 * phía trình duyệt (pdf-lib). Kiểm Content-Type là `application/pdf` và xử lý
 * 401 qua `reauth()` trước khi ném lỗi.
 */
export async function fetchMaterialFileBytes(
	id: string,
	signal?: AbortSignal,
	baseUrl: string = getApiBaseUrl(),
): Promise<Uint8Array> {
	const res = await fetch(
		`${baseUrl}/api/materials/${encodeURIComponent(id)}/file`,
		{ credentials: "include", signal },
	);
	if (!res.ok) {
		if (res.status === 401) reauth();
		throw await toMaterialError(res);
	}
	const ct = (res.headers.get("content-type") ?? "")
		.split(";")[0]
		?.trim()
		.toLowerCase();
	if (ct !== "application/pdf") {
		void res.body?.cancel().catch(() => {});
		throw new MaterialRequestError(415, "UNSUPPORTED_FILE_TYPE");
	}
	return new Uint8Array(await res.arrayBuffer());
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

export interface AttachSessionMaterialOptions {
	category?: LessonMaterialCategory;
	sourceTitle?: string | null;
	sourcePageStart?: number | null;
	sourcePageEnd?: number | null;
}

export async function attachSessionMaterial(
	classId: string,
	date: string,
	materialId: string,
	options?: AttachSessionMaterialOptions,
): Promise<LessonMaterialView> {
	const payload: Record<string, unknown> = { materialId };
	// Chỉ gửi thêm trường khi khác mặc định để giữ tương thích rolling deploy (.strict()).
	if (options?.category && options.category !== "lecture") {
		payload.category = options.category;
	}
	if (options?.sourceTitle) {
		payload.sourceTitle = options.sourceTitle;
	}
	if (options?.sourcePageStart != null && options?.sourcePageEnd != null) {
		payload.sourcePageStart = options.sourcePageStart;
		payload.sourcePageEnd = options.sourcePageEnd;
	}
	const body = await request<{ item: LessonMaterialView }>(
		sessionPath(classId, date),
		jsonInit("POST", payload),
	);
	return body.item;
}

export async function uploadSessionMaterial(input: {
	classId: string;
	date: string;
	file: File;
	mimeType: string;
	category?: LessonMaterialCategory;
	title?: string;
	sourceTitle?: string;
	pageStart?: number;
	pageEnd?: number;
}): Promise<LessonMaterialView> {
	const search = new URLSearchParams();
	if (input.category && input.category !== "lecture") {
		search.set("category", input.category);
	}
	const title = input.title?.trim();
	if (title) search.set("title", title);
	const sourceTitle = input.sourceTitle?.trim();
	if (sourceTitle) search.set("sourceTitle", sourceTitle);
	if (input.pageStart != null && input.pageEnd != null) {
		search.set("pageStart", String(input.pageStart));
		search.set("pageEnd", String(input.pageEnd));
	}
	const query = search.toString();
	const body = await request<{ item: LessonMaterialView }>(
		`${sessionPath(input.classId, input.date)}/files${query ? `?${query}` : ""}`,
		uploadInit(input.file, input.mimeType),
	);
	return body.item;
}

export async function createSessionMaterialLink(
	classId: string,
	date: string,
	input: LessonMaterialLinkCreateInput,
): Promise<LessonMaterialView> {
	const body = await request<{ item: LessonMaterialView }>(
		`${sessionPath(classId, date)}/links`,
		jsonInit("POST", input),
	);
	return body.item;
}

export async function updateSessionMaterialCategory(
	classId: string,
	date: string,
	materialId: string,
	category: LessonMaterialCategory,
): Promise<LessonMaterialView> {
	const body = await request<{ item: LessonMaterialView }>(
		`${sessionPath(classId, date)}/${encodeURIComponent(materialId)}`,
		jsonInit("PATCH", { category }),
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

// ---- Tài liệu chung cấp lớp học ----

function classMaterialsPath(classId: string): string {
	return `/api/classes/${encodeURIComponent(classId)}/materials`;
}

export async function fetchClassMaterials(
	classId: string,
	signal?: AbortSignal,
): Promise<ClassMaterialView[]> {
	const body = await request<ClassMaterialListResponse>(
		classMaterialsPath(classId),
		{ signal },
	);
	return body.items;
}

export async function attachClassMaterial(
	classId: string,
	materialId: string,
): Promise<ClassMaterialView> {
	const body = await request<{ item: ClassMaterialView }>(
		classMaterialsPath(classId),
		jsonInit("POST", { materialId }),
	);
	return body.item;
}

export async function uploadClassMaterial(input: {
	classId: string;
	file: File;
	mimeType: string;
}): Promise<ClassMaterialView> {
	const body = await request<{ item: ClassMaterialView }>(
		`${classMaterialsPath(input.classId)}/files`,
		uploadInit(input.file, input.mimeType),
	);
	return body.item;
}

export async function createClassMaterialLink(
	classId: string,
	input: ClassMaterialLinkCreateInput,
): Promise<ClassMaterialView> {
	const body = await request<{ item: ClassMaterialView }>(
		`${classMaterialsPath(classId)}/links`,
		jsonInit("POST", input),
	);
	return body.item;
}

export async function detachClassMaterial(
	classId: string,
	materialId: string,
): Promise<void> {
	await request<{ ok: true }>(
		`${classMaterialsPath(classId)}/${encodeURIComponent(materialId)}`,
		{ method: "DELETE" },
	);
}

/**
 * #646: Quyền ghi Ngân hàng tài liệu của người dùng hiện tại, đọc từ cache
 * `kernelQueryKey` (tự cập nhật khi snapshot refetch; fallback `"teacher"` để
 * tương thích test mount `QueryClientProvider` thuần không bọc `DataProvider`).
 */
export function useCanWriteMaterials(): boolean {
	const queryClient = useQueryClient();
	const subscribe = useCallback(
		(onStoreChange: () => void) =>
			queryClient.getQueryCache().subscribe(onStoreChange),
		[queryClient],
	);
	const role = useSyncExternalStore(
		subscribe,
		() =>
			queryClient.getQueryData<{ viewer?: { role?: string } }>(kernelQueryKey)
				?.viewer?.role ?? "teacher",
		() => "teacher",
	);
	return canWriteMaterials(role);
}
