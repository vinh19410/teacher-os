import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	QUIZ_MEDIA_TYPES,
	type QuizAttemptDetail,
	type QuizAttemptMedia,
	type QuizAttemptSummary,
	type QuizSubmitResult,
	quizAttemptDetailSchema,
	quizAttemptMediaSchema,
	quizAttemptSummarySchema,
	quizSubmitResultSchema,
	type StudentQuizDetail,
	studentQuizDetailSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { z } from "zod";
import { HttpError } from "@/lib/query-client";
import { getApiBaseUrl, getStudentHeaders } from "@/lib/repos/student";

/** POST start trả về đúng `{ attemptId }` (201 mới / 200 resume). */
const quizStartResultSchema = z.object({ attemptId: z.string().min(1) });

/**
 * Nguồn đề của take/review screen (phase 10 #378): luồng giao bài gắn
 * `assignmentId`, lượt tự luyện gắn `testId` — quyết định endpoint quiz
 * detail/start. Submit/autosave/essay/media vẫn dùng route attempt chung
 * `/api/student/attempts/*` cho cả hai nguồn.
 */
export type QuizTakeSource =
	| { kind: "assignment"; id: string }
	| { kind: "practice"; testId: string };

/** Id định danh nguồn trong query key — assignmentId hoặc testId. */
export function quizTakeSourceId(source: QuizTakeSource): string {
	return source.kind === "assignment" ? source.id : source.testId;
}

function quizDetailPath(source: QuizTakeSource): string {
	return source.kind === "assignment"
		? `/api/student/assignments/${encodeURIComponent(source.id)}/quiz`
		: `/api/student/practice/${encodeURIComponent(source.testId)}/quiz`;
}

function quizStartPath(source: QuizTakeSource): string {
	return source.kind === "assignment"
		? `/api/student/assignments/${encodeURIComponent(source.id)}/quiz/start`
		: `/api/student/practice/${encodeURIComponent(source.testId)}/attempts`;
}

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

/** GET đề sạch + attempt state — luồng assignment hoặc practice (#378). */
export async function fetchStudentQuizDetail(
	source: QuizTakeSource,
): Promise<StudentQuizDetail> {
	return request(quizDetailPath(source), { method: "GET" }, (raw) =>
		studentQuizDetailSchema.parse(raw),
	);
}

export function quizDetailQueryKey(source: QuizTakeSource) {
	return ["student", "quiz", source.kind, quizTakeSourceId(source)] as const;
}

export function quizDetailQueryOptions(source: QuizTakeSource) {
	return {
		queryKey: quizDetailQueryKey(source),
		queryFn: () => fetchStudentQuizDetail(source),
		staleTime: 60_000,
	};
}

export function useStudentQuizDetail(source: QuizTakeSource) {
	return useQuery(quizDetailQueryOptions(source));
}

/** POST start — snapshot đề vào attempt; 201 mới / 200 resume cùng attemptId. */
export async function startQuizAttempt(
	source: QuizTakeSource,
): Promise<{ attemptId: string }> {
	return request(
		quizStartPath(source),
		{ method: "POST", body: JSON.stringify({}) },
		(raw) => quizStartResultSchema.parse(raw),
	);
}

export function useStartQuizAttempt(source: QuizTakeSource) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => startQuizAttempt(source),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: quizDetailQueryKey(source),
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

const quizMediaUploadResultSchema = z.object({ media: quizAttemptMediaSchema });

/**
 * PUT file bài nói Speaking (#305) — raw body, tên file qua `X-File-Name`.
 * Dùng XMLHttpRequest thay vì `request()`/fetch vì fetch không báo tiến
 * trình upload; `signal` abort → xhr.abort() và reject AbortError.
 */
export function uploadQuizMedia(
	attemptId: string,
	file: File,
	type: string,
	opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<QuizAttemptMedia> {
	return new Promise((resolve, reject) => {
		if (opts.signal?.aborted) {
			reject(new DOMException("Upload aborted", "AbortError"));
			return;
		}
		const xhr = new XMLHttpRequest();
		xhr.open(
			"PUT",
			`${getApiBaseUrl()}/api/student/attempts/${encodeURIComponent(attemptId)}/media`,
		);
		xhr.withCredentials = true;
		const headers = getStudentHeaders({
			"Content-Type": type,
			"X-File-Name": encodeURIComponent(file.name),
		});
		for (const [name, value] of Object.entries(headers)) {
			xhr.setRequestHeader(name, value);
		}
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && event.total > 0) {
				opts.onProgress?.(event.loaded / event.total);
			}
		};
		const onAbort = () => xhr.abort();
		opts.signal?.addEventListener("abort", onAbort, { once: true });
		const cleanup = () => opts.signal?.removeEventListener("abort", onAbort);
		xhr.onload = () => {
			cleanup();
			let body: unknown = null;
			try {
				body = JSON.parse(xhr.responseText);
			} catch {
				body = null;
			}
			if (xhr.status >= 200 && xhr.status < 300) {
				const parsed = quizMediaUploadResultSchema.safeParse(body);
				if (parsed.success) {
					resolve(parsed.data.media);
				} else {
					reject(new HttpError(xhr.status, "Invalid upload response"));
				}
				return;
			}
			const record = (body ?? {}) as { code?: string; error?: string };
			reject(
				new HttpError(xhr.status, `Upload failed with status ${xhr.status}`, {
					code: record.code ?? record.error,
				}),
			);
		};
		xhr.onerror = () => {
			cleanup();
			reject(new HttpError(0, "Network error during upload"));
		};
		xhr.onabort = () => {
			cleanup();
			reject(new DOMException("Upload aborted", "AbortError"));
		};
		xhr.send(file);
	});
}

/** DELETE file bài nói trước khi nộp — idempotent phía server. */
export async function deleteQuizMedia(attemptId: string): Promise<void> {
	await request(
		`/api/student/attempts/${encodeURIComponent(attemptId)}/media`,
		{ method: "DELETE" },
		(raw) => raw as Record<string, unknown>,
	);
}

/**
 * Tải file bài nói về blob URL để phát lại. Không dùng `<audio src>` trỏ
 * thẳng API: thẻ media không gửi được header `x-student-org-id`, thiếu nó
 * học viên đa org rơi về org đầu tiên → 404 sai. Chỉ nhận Content-Type
 * trong allowlist và dựng Blob với đúng type đó — blob URL thuộc origin
 * student nên không được phép mang nội dung kiểu khác (HTML, SVG…).
 */
export async function fetchQuizMediaObjectUrl(
	attemptId: string,
	signal?: AbortSignal,
): Promise<string> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/attempts/${encodeURIComponent(attemptId)}/media`,
		{
			method: "GET",
			credentials: "include",
			headers: getStudentHeaders({ Accept: "*/*" }),
			signal,
		},
	);
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
	const type = normalizeMediaType(res.headers.get("Content-Type") ?? "");
	if (!Object.hasOwn(QUIZ_MEDIA_TYPES, type)) {
		throw new HttpError(res.status, "Unexpected media content type");
	}
	// Blob bọc blob gốc (không copy byte) chỉ để ép type đã kiểm.
	const blob = new Blob([await res.blob()], { type });
	return URL.createObjectURL(blob);
}

/**
 * Ghi media mới vào cache take payload — cache là nguồn sự thật duy nhất
 * của take screen (không giữ bản sao state riêng dễ lệch server).
 */
export async function setQuizDetailMedia(
	queryClient: QueryClient,
	source: QuizTakeSource,
	media: QuizAttemptMedia | null,
): Promise<void> {
	const { queryKey } = quizDetailQueryOptions(source);
	// Refetch đang bay (sau hủy/conflict) có thể trả về sau và đè media mới
	// bằng dữ liệu cũ — hủy nó trước khi ghi.
	await queryClient.cancelQueries({ queryKey });
	queryClient.setQueryData<StudentQuizDetail>(queryKey, (detail) =>
		detail?.attempt
			? { ...detail, attempt: { ...detail.attempt, media } }
			: detail,
	);
}
