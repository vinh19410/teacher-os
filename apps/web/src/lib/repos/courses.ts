/**
 * Course master data repo — quản trị danh mục khóa học 2 cấp
 * (Nhóm khóa học → Khóa học) cho màn /courses và dropdown chấm bài đầu vào.
 */
import { queryOptions } from "@tanstack/react-query";
import type {
	CourseCatalogResponse,
	CourseCategoryCreateInput,
	CourseCategoryDto,
	CourseCategoryReorderInput,
	CourseCategoryUpdateInput,
	CourseCreateInput,
	CourseErrorCode,
	CourseItemDto,
	CourseReorderInput,
	CourseUpdateInput,
} from "@teacher-os/api/course-contracts";
import { HttpError, isHttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

/** Prefix key chung để invalidate cả danh mục đầy đủ và danh mục đang hoạt động. */
export const coursesAllQueryKey = ["kernel", "courses"] as const;
export const courseCatalogQueryKey = [
	...coursesAllQueryKey,
	"catalog",
] as const;
export const activeCourseCatalogQueryKey = [
	...coursesAllQueryKey,
	"active",
] as const;

const COURSE_ERROR_FALLBACKS: Record<CourseErrorCode, string> = {
	COURSE_FORBIDDEN: "Bạn không có quyền quản trị danh mục khóa học.",
	COURSE_CATEGORY_NOT_FOUND: "Nhóm khóa học không tồn tại.",
	COURSE_CATEGORY_DUPLICATE: "Tên nhóm khóa học đã tồn tại.",
	COURSE_CATEGORY_NOT_EMPTY:
		"Không thể xóa nhóm khi vẫn còn khóa học bên trong.",
	COURSE_NOT_FOUND: "Khóa học không tồn tại.",
	COURSE_DUPLICATE: "Tên khóa học đã tồn tại trong nhóm này.",
	COURSE_INACTIVE: "Khóa học đang ẩn, vui lòng chọn khóa học khác.",
};

interface ApiErrorPayload {
	error?: unknown;
	code?: unknown;
	message?: unknown;
}

/** Đọc JSON lỗi `{ error, code, message }` từ server và chuyển thành `HttpError`. */
export async function toApiHttpError(
	res: Response,
	fallbackMessage: string,
): Promise<HttpError> {
	let code: string | undefined;
	let message: string | undefined;
	try {
		const body = (await res.json()) as ApiErrorPayload;
		if (typeof body?.code === "string" && body.code.trim()) {
			code = body.code.trim();
		} else if (typeof body?.error === "string" && body.error.trim()) {
			code = body.error.trim();
		}
		if (typeof body?.message === "string" && body.message.trim()) {
			message = body.message.trim();
		}
	} catch {
		// Response body không phải JSON — giữ nguyên fallbackMessage.
	}
	const mappedByCode =
		code && code in COURSE_ERROR_FALLBACKS
			? COURSE_ERROR_FALLBACKS[code as CourseErrorCode]
			: undefined;
	return new HttpError(res.status, message ?? mappedByCode ?? fallbackMessage, {
		code,
		reason: message ?? mappedByCode,
	});
}

/** Trả thông báo tiếng Việt thân thiện cho toast/form lỗi khóa học. */
export function courseErrorMessage(error: unknown, fallback: string): string {
	if (isHttpError(error)) {
		if (error.reason && error.reason.trim().length > 0) {
			return error.reason;
		}
		if (error.code && error.code in COURSE_ERROR_FALLBACKS) {
			return COURSE_ERROR_FALLBACKS[error.code as CourseErrorCode];
		}
	}
	return fallback;
}

export async function fetchCourseCatalog(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<CourseCatalogResponse> {
	const res = await fetch(`${baseUrl}/api/courses`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to load course catalog: ${res.status}`,
		);
	}
	return (await res.json()) as CourseCatalogResponse;
}

export function courseCatalogQueryOptions() {
	return queryOptions({
		queryKey: courseCatalogQueryKey,
		queryFn: ({ signal }) => fetchCourseCatalog(undefined, signal),
	});
}

export async function fetchActiveCourseCatalog(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<CourseCatalogResponse> {
	const res = await fetch(`${baseUrl}/api/courses?activeOnly=true`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to load active courses: ${res.status}`,
		);
	}
	return (await res.json()) as CourseCatalogResponse;
}

export function activeCourseCatalogQueryOptions() {
	return queryOptions({
		queryKey: activeCourseCatalogQueryKey,
		queryFn: ({ signal }) => fetchActiveCourseCatalog(undefined, signal),
	});
}

export async function createCourseCategory(
	input: CourseCategoryCreateInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ category: CourseCategoryDto }> {
	const res = await fetch(`${baseUrl}/api/courses/categories`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to create course category: ${res.status}`,
		);
	}
	return (await res.json()) as { category: CourseCategoryDto };
}

export async function updateCourseCategory(
	id: string,
	input: CourseCategoryUpdateInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ category: CourseCategoryDto }> {
	const res = await fetch(
		`${baseUrl}/api/courses/categories/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		},
	);
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to update course category: ${res.status}`,
		);
	}
	return (await res.json()) as { category: CourseCategoryDto };
}

export async function reorderCourseCategories(
	input: CourseCategoryReorderInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<CourseCatalogResponse> {
	const res = await fetch(`${baseUrl}/api/courses/categories/reorder`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to reorder course categories: ${res.status}`,
		);
	}
	return (await res.json()) as CourseCatalogResponse;
}

export async function deleteCourseCategory(
	id: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ deleted: true }> {
	const res = await fetch(
		`${baseUrl}/api/courses/categories/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			credentials: "include",
		},
	);
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to delete course category: ${res.status}`,
		);
	}
	return (await res.json()) as { deleted: true };
}

export async function createCourseItem(
	input: CourseCreateInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ course: CourseItemDto }> {
	const res = await fetch(`${baseUrl}/api/courses/items`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to create course item: ${res.status}`,
		);
	}
	return (await res.json()) as { course: CourseItemDto };
}

export async function updateCourseItem(
	id: string,
	input: CourseUpdateInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ course: CourseItemDto }> {
	const res = await fetch(
		`${baseUrl}/api/courses/items/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			credentials: "include",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		},
	);
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to update course item: ${res.status}`,
		);
	}
	return (await res.json()) as { course: CourseItemDto };
}

export async function reorderCourseItems(
	input: CourseReorderInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<CourseCatalogResponse> {
	const res = await fetch(`${baseUrl}/api/courses/items/reorder`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to reorder course items: ${res.status}`,
		);
	}
	return (await res.json()) as CourseCatalogResponse;
}

export async function deleteCourseItem(
	id: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ deleted: true }> {
	const res = await fetch(
		`${baseUrl}/api/courses/items/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			credentials: "include",
		},
	);
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to delete course item: ${res.status}`,
		);
	}
	return (await res.json()) as { deleted: true };
}
