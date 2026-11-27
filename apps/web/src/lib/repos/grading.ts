import { queryOptions } from "@tanstack/react-query";
import {
	type AiDraftPatch,
	type AiGradingDraftView,
	aiGradingDraftViewSchema,
	type EssayAnnotation,
	type EssayAnnotationCreate,
	type EssayAnnotationPatch,
	essayAnnotationSchema,
	type GradingQueueV2Response,
	gradingQueueV2ResponseSchema,
	QUIZ_MEDIA_TYPES,
	type QuizAttemptGrade,
	type QuizGradeInput,
	quizAttemptGradeSchema,
	type TeacherAttemptReview,
	teacherAttemptReviewSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const gradingQueryKey = (attemptId: string) =>
	["kernel", "grading", attemptId] as const;

export const gradingQueueQueryKey = ["kernel", "grading", "queue"] as const;
export const DEMO_ATTEMPT_PREFIX = "demo-attempt:";

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
		let reason: string | undefined;
		try {
			const payload = (await res.clone().json()) as { code?: unknown };
			if (typeof payload?.code === "string") {
				reason = payload.code;
			}
		} catch {
			// Body không phải JSON (proxy/HTML) — giữ reason undefined.
		}
		throw new HttpError(
			res.status,
			`Failed to ${action}: ${res.status}`,
			reason ? { reason } : undefined,
		);
	}
	return res;
}

export async function fetchGradingQueue(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<GradingQueueV2Response> {
	const res = await gradingFetch(
		"?includeAuto=1",
		{ signal },
		"load grading queue",
		baseUrl,
	);
	return gradingQueueV2ResponseSchema.parse(await res.json());
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
): Promise<TeacherAttemptReview> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}?v=2`,
		{ signal },
		"load submission",
		baseUrl,
	);
	return teacherAttemptReviewSchema.parse(await res.json());
}

/** URL phát trực tiếp file nghe của bài Listening cho giáo viên xem lại (#978). */
export function gradingAudioUrl(
	attemptId: string,
	baseUrl: string = getApiBaseUrl(),
): string {
	return `${baseUrl}/api/grading/${encodeURIComponent(attemptId)}/audio`;
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

/** PATCH /api/grading/:attemptId/draft — "Lưu bản nháp" (TOS-30). */
export async function saveDraft(
	attemptId: string,
	input: AiDraftPatch,
	baseUrl: string = getApiBaseUrl(),
): Promise<AiGradingDraftView> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}/draft`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
		"save draft",
		baseUrl,
	);
	return aiGradingDraftViewSchema.parse(await res.json());
}

/** POST /api/grading/:attemptId/ai-retry — "Thử chấm lại AI" (TOS-33 D3). */
export async function retryAiGrading(
	attemptId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<AiGradingDraftView> {
	const res = await gradingFetch(
		`/${encodeURIComponent(attemptId)}/ai-retry`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		},
		"retry ai grading",
		baseUrl,
	);
	return aiGradingDraftViewSchema.parse(await res.json());
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

export async function createDemoGradingSample(
	baseUrl: string = getApiBaseUrl(),
): Promise<{ attemptId: string }> {
	const res = await gradingFetch(
		"/demo-sample",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: "{}",
		},
		"create demo grading sample",
		baseUrl,
	);
	return (await res.json()) as { attemptId: string };
}

export async function deleteDemoGradingSample(
	baseUrl: string = getApiBaseUrl(),
): Promise<void> {
	await gradingFetch(
		"/demo-sample",
		{
			method: "DELETE",
		},
		"delete demo grading sample",
		baseUrl,
	);
}
