import { queryOptions } from "@tanstack/react-query";
import {
	QUIZ_MEDIA_TYPES,
	type QuizAttemptGrade,
	type QuizGradeInput,
	quizAttemptGradeSchema,
	type TeacherSubmission,
	teacherSubmissionSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./settings";

export const gradingQueryKey = (attemptId: string) =>
	["kernel", "grading", attemptId] as const;

export async function fetchSubmission(
	attemptId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<TeacherSubmission> {
	const res = await fetch(
		`${baseUrl}/api/grading/${encodeURIComponent(attemptId)}`,
		{ credentials: "include", signal },
	);
	if (!res.ok) {
		throw new HttpError(res.status, `Failed to load submission: ${res.status}`);
	}
	return teacherSubmissionSchema.parse(await res.json());
}

export async function saveGrade(
	attemptId: string,
	input: QuizGradeInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<QuizAttemptGrade> {
	const res = await fetch(
		`${baseUrl}/api/grading/${encodeURIComponent(attemptId)}/grade`,
		{
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(input),
		},
	);
	if (!res.ok) {
		throw new HttpError(res.status, `Failed to save grade: ${res.status}`);
	}
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
