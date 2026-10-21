import { queryOptions } from "@tanstack/react-query";
import {
	type EssayAnnotation,
	type EssayAnnotationCreate,
	type EssayAnnotationPatch,
	essayAnnotationSchema,
	type GradingQueueResponse,
	gradingQueueResponseSchema,
	QUIZ_MEDIA_TYPES,
	type QuizAttemptGrade,
	type QuizGradeInput,
	quizAttemptGradeSchema,
	type TeacherSubmission,
	teacherSubmissionSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const gradingQueryKey = (attemptId: string) =>
	["kernel", "grading", attemptId] as const;

export const gradingQueueQueryKey = ["kernel", "grading", "queue"] as const;

/** Fetch chung cho các route /api/grading — luôn gửi cookie và ném
 * HttpError kèm status khi response không ok. */
async function gradingFetch(
	path: string,
	init: RequestInit,
	action: string,
	baseUrl: string,
): Promise<Response> {
	const res = await fetch(`${baseUrl}/api/grading${path}`, {
		credentials: "include",
		...init,
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Failed to ${action}: ${res.status}`);
	}
	return res;
}

export async function fetchGradingQueue(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<GradingQueueResponse> {
	const res = await gradingFetch("", { signal }, "load grading queue", baseUrl);
	return gradingQueueResponseSchema.parse(await res.json());
}

export function gradingQueueQueryOptions(baseUrl = getApiBaseUrl()) {
	return queryOptions({
		queryKey: gradingQueueQueryKey,
		queryFn: ({ signal }) => fetchGradingQueue(baseUrl, signal),
	});
}

export async function fetchSubmission(
	attemptId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<TeacherSubmission> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}`,
		{ signal },
		"load submission",
		baseUrl,
	);
	return teacherSubmissionSchema.parse(await res.json());
}

export async function saveGrade(
	attemptId: string,
	input: QuizGradeInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<QuizAttemptGrade> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}/grade`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
		"save grade",
		baseUrl,
	);
	return quizAttemptGradeSchema.parse(await res.json());
}

/**
 * Tải file bài nói của học viên thành blob URL cho player (#319). Same
 * nguồn với route học viên: Content-Type phải nằm trong allowlist và dựng
 * Blob với đúng type đã kiểm — blob URL thuộc origin web nên không được
 * phép mang nội dung kiểu khác (HTML, SVG…).
 */
export async function fetchSubmissionMediaObjectUrl(
	attemptId: string,
	signal?: AbortSignal,
	baseUrl: string = getApiBaseUrl(),
): Promise<string> {
	const res = await fetch(
		`${baseUrl}/api/grading/${encodeURIComponent(attemptId)}/media`,
		{
			method: "GET",
			credentials: "include",
			headers: { Accept: "*/*" },
			signal,
		},
	);
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed with status ${res.status}`);
	}
	const type = normalizeMediaType(res.headers.get("Content-Type") ?? "");
	if (!Object.hasOwn(QUIZ_MEDIA_TYPES, type)) {
		throw new HttpError(res.status, "Unexpected media content type");
	}
	// Blob bọc blob gốc (không copy byte) chỉ để ép type đã kiểm.
	const blob = new Blob([await res.blob()], { type });
	return URL.createObjectURL(blob);
}

/** 404/409/400 là trạng thái cuối — retry chỉ làm chậm thông báo lỗi. */
export function submissionQueryOptions(
	attemptId: string,
	baseUrl = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: gradingQueryKey(attemptId),
		queryFn: ({ signal }) => fetchSubmission(attemptId, baseUrl, signal),
		retry: false,
	});
}

/** POST /api/grading/:attemptId/annotations — tạo highlight (#332). */
export async function createAnnotation(
	attemptId: string,
	input: EssayAnnotationCreate,
	baseUrl: string = getApiBaseUrl(),
): Promise<EssayAnnotation> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}/annotations`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
		"create annotation",
		baseUrl,
	);
	return essayAnnotationSchema.parse(await res.json());
}

/** PATCH …/annotations/:annotationId — sửa ghi chú. */
export async function updateAnnotation(
	attemptId: string,
	annotationId: string,
	input: EssayAnnotationPatch,
	baseUrl: string = getApiBaseUrl(),
): Promise<EssayAnnotation> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}/annotations/${encodeURIComponent(annotationId)}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
		"update annotation",
		baseUrl,
	);
	return essayAnnotationSchema.parse(await res.json());
}

/** DELETE …/annotations/:annotationId — gỡ highlight (204, không body). */
export async function deleteAnnotation(
	attemptId: string,
	annotationId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<void> {
	await gradingFetch(
		`/${encodeURIComponent(attemptId)}/annotations/${encodeURIComponent(annotationId)}`,
		{ method: "DELETE" },
		"delete annotation",
		baseUrl,
	);
}
