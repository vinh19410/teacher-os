/**
 * Student placement submission repo (#748) — fetch/chấm/AI-retry/media
 * cho bài kiểm tra đầu vào của học viên trong /students/$studentId.
 */
import { queryOptions } from "@tanstack/react-query";
import type {
	PlacementSubmissionDetail,
	PlacementTeacherGrade,
} from "@teacher-os/api/placement-test-contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";
import { toApiHttpError } from "./courses";

export const studentPlacementAllQueryKey = [
	"kernel",
	"students",
	"placement-submission",
] as const;

export const studentPlacementSubmissionQueryKey = (studentId: string) =>
	[...studentPlacementAllQueryKey, studentId] as const;

function isPlacementSubmissionDetail(
	value: unknown,
): value is PlacementSubmissionDetail {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const record = value as Record<string, unknown>;
	return (
		typeof record.id === "string" &&
		typeof record.objective === "object" &&
		record.objective !== null &&
		typeof record.snapshot === "object" &&
		record.snapshot !== null
	);
}

export async function fetchStudentPlacementSubmission(
	studentId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/students/${encodeURIComponent(studentId)}/placement-submission`;
	const res = await fetch(url, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to load student placement submission: ${res.status}`,
		);
	}
	const data: unknown = await res.json();
	if (!isPlacementSubmissionDetail(data)) {
		throw new Error("Invalid student placement submission payload");
	}
	return data;
}

export function studentPlacementSubmissionQueryOptions(studentId: string) {
	return queryOptions({
		queryKey: studentPlacementSubmissionQueryKey(studentId),
		queryFn: ({ signal }) =>
			fetchStudentPlacementSubmission(studentId, undefined, signal),
		staleTime: 0,
	});
}

export async function gradeStudentPlacementSubmission(
	studentId: string,
	input: PlacementTeacherGrade,
	baseUrl: string = getApiBaseUrl(),
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/students/${encodeURIComponent(studentId)}/placement-submission`;
	const res = await fetch(url, {
		method: "PATCH",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});
	if (!res.ok) {
		throw await toApiHttpError(
			res,
			`Failed to grade student placement submission: ${res.status}`,
		);
	}
	return (await res.json()) as PlacementSubmissionDetail;
}

/** Yêu cầu server chấm nháp lại bằng AI cho bài kiểm tra đầu vào của học viên. */
export async function retryStudentPlacementAi(
	studentId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/students/${encodeURIComponent(studentId)}/placement-submission/ai-retry`;
	// Kernel chỉ nhận POST JSON (thiếu Content-Type → 415) — gửi body rỗng `{}`.
	const res = await fetch(url, {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: "{}",
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to retry student placement AI grading: ${res.status}`,
		);
	}
	return (await res.json()) as PlacementSubmissionDetail;
}

export function resolveStudentPlacementMediaUrl(
	studentId: string,
	baseUrl: string = getApiBaseUrl(),
): string {
	return `${baseUrl}/api/students/${encodeURIComponent(studentId)}/placement-submission/media`;
}
