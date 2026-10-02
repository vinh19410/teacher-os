import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type QuizAttemptDetail,
	type QuizAttemptSummary,
	type QuizSubmitResult,
	quizAttemptDetailSchema,
	quizAttemptSummarySchema,
	quizSubmitResultSchema,
	type StudentQuizDetail,
	studentQuizDetailSchema,
} from "@teacher-os/api/contracts";
import { z } from "zod";
import { HttpError } from "@/lib/query-client";
import { getApiBaseUrl, getStudentHeaders } from "@/lib/repos/student";

/** POST start trả về đúng `{ attemptId }` (201 mới / 200 resume). */
const quizStartResultSchema = z.object({ attemptId: z.string().min(1) });

async function parseErrorBody(res: Response): Promise<{ code?: string }> {
	try {
		const body = (await res.json()) as { code?: string; error?: string };
		return { code: body.code ?? body.error };
	} catch {
		return {};
	}
}

async function request<T>(
	path: string,
	init: RequestInit & { keepalive?: boolean },
	parse: (raw: unknown) => T,
): Promise<T> {
	const res = await fetch(`${getApiBaseUrl()}${path}`, {
		credentials: "include",
		...init,
		headers: getStudentHeaders(
			init.body === undefined ? {} : { "Content-Type": "application/json" },
		),
	});
	if (!res.ok) {
		const { code } = await parseErrorBody(res);
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}
	if (res.status === 204) return undefined as T;
	return parse(await res.json());
}

/** GET /api/student/assignments/:assignmentId/quiz — đề sạch + attempt state. */
export async function fetchStudentQuizDetail(
	assignmentId: string,
): Promise<StudentQuizDetail> {
	return request(
		`/api/student/assignments/${encodeURIComponent(assignmentId)}/quiz`,
		{ method: "GET" },
		(raw) => studentQuizDetailSchema.parse(raw),
	);
}

export function quizDetailQueryOptions(assignmentId: string) {
	return {
		queryKey: ["student", "quiz", assignmentId] as const,
		queryFn: () => fetchStudentQuizDetail(assignmentId),
		staleTime: 60_000,
	};
}

export function useStudentQuizDetail(assignmentId: string) {
	return useQuery(quizDetailQueryOptions(assignmentId));
}

/** POST start — snapshot đề vào attempt; 201 mới / 200 resume cùng attemptId. */
export async function startQuizAttempt(
	assignmentId: string,
): Promise<{ attemptId: string }> {
	return request(
		`/api/student/assignments/${encodeURIComponent(assignmentId)}/quiz/start`,
		{ method: "POST", body: JSON.stringify({}) },
		(raw) => quizStartResultSchema.parse(raw),
	);
}

export function useStartQuizAttempt(assignmentId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => startQuizAttempt(assignmentId),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["student", "quiz", assignmentId],
			});
		},
	});
}

/**
 * Autosave 1 câu (PATCH). Store gọi trực tiếp — KHÔNG qua useMutation — vì
 * cần kiểm soát keepalive (flush khi pagehide) và hàng đợi riêng (RT#7/#11).
 */
export async function patchQuizAnswer(
	attemptId: string,
	q: number,
	value: string,
	opts?: { keepalive?: boolean },
): Promise<void> {
	await request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}/answer`,
		{
			method: "PATCH",
			body: JSON.stringify({ q, value }),
			keepalive: opts?.keepalive,
		},
		// `{ ok: true }` — không có gì cần giữ lại.
		(raw) => raw as Record<string, unknown>,
	);
}

/**
 * Autosave bài viết Writing (#304) — cùng pattern keepalive với
 * `patchQuizAnswer`, nhưng body `{ text }` và cap riêng 48KB phía server.
 */
export async function patchQuizEssay(
	attemptId: string,
	text: string,
	opts?: { keepalive?: boolean },
): Promise<void> {
	await request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}/essay`,
		{
			method: "PATCH",
			body: JSON.stringify({ text }),
			keepalive: opts?.keepalive,
		},
		(raw) => raw as Record<string, unknown>,
	);
}

/** POST submit — idempotent, trả counters chấm từ snapshot. */
export async function submitQuizAttempt(
	attemptId: string,
): Promise<QuizSubmitResult> {
	return request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}/submit`,
		{ method: "POST", body: JSON.stringify({}) },
		(raw) => quizSubmitResultSchema.parse(raw),
	);
}

/**
 * GET /api/student/attempts/:attemptId — summary sau nộp. 409 khi attempt
 * còn `in_progress` (RT#6) — route loader bắt HttpError status 409 để
 * redirect, không bao giờ render partial.
 */
export async function fetchAttemptSummary(
	attemptId: string,
): Promise<QuizAttemptSummary> {
	return request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}`,
		{ method: "GET" },
		(raw) => quizAttemptSummarySchema.parse(raw),
	);
}

export function attemptSummaryQueryOptions(attemptId: string) {
	return {
		queryKey: ["student", "attempt", attemptId] as const,
		queryFn: () => fetchAttemptSummary(attemptId),
		staleTime: 60_000,
	};
}

export function useAttemptSummary(attemptId: string) {
	return useQuery(attemptSummaryQueryOptions(attemptId));
}

/**
 * GET /api/student/attempts/:attemptId/detail — review đầy đủ: questions từ
 * snapshot (RT#3) + key/alts/verdict/đáp án học viên + `note` (withhold ở
 * take, chỉ reveal sau submit). Cùng gate 409 in_progress như summary.
 */
export async function fetchAttemptDetail(
	attemptId: string,
): Promise<QuizAttemptDetail> {
	return request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}/detail`,
		{ method: "GET" },
		(raw) => quizAttemptDetailSchema.parse(raw),
	);
}

export function attemptDetailQueryOptions(attemptId: string) {
	return {
		queryKey: ["student", "attempt", attemptId, "detail"] as const,
		queryFn: () => fetchAttemptDetail(attemptId),
		staleTime: 60_000,
	};
}

export function useAttemptDetail(attemptId: string) {
	return useQuery(attemptDetailQueryOptions(attemptId));
}
