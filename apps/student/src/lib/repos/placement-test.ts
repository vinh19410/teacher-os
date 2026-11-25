import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type StudentPlacementSpeakingTokenResponse,
	type StudentPlacementStatusResponse,
	type StudentPlacementSubmit,
	type StudentPlacementSubmitResponse,
	type StudentPlacementViewResponse,
	studentPlacementStatusSchema,
	studentPlacementSubmitSchema,
} from "@teacher-os/api/placement-test-contracts";
import { useSyncExternalStore } from "react";
import { readBlobHeadBytes } from "@/lib/placement-speaking-backup";
import {
	isRetryableSpeakingUploadStatus,
	resolveSpeakingUploadMeta,
} from "@/lib/placement-test-helpers";
import {
	HttpError,
	isHttpError,
	isTeacherOnStudentPortalError,
	redirectToLoginForWrongRole,
} from "@/lib/query-client";
import { getApiBaseUrl, getStudentHeaders } from "@/lib/repos/student";
import {
	getActiveStudentOrgId,
	subscribeActiveStudentOrg,
} from "@/lib/student-org-storage";

export const studentPlacementStatusQueryKey = [
	"student",
	"placement-test",
	"status",
] as const;

export const studentPlacementViewQueryKey = [
	"student",
	"placement-test",
	"view",
] as const;

export function getStudentPlacementViewQueryKey(
	scopeKey?: string | null,
): readonly ["student", "placement-test", "view", string] {
	return [...studentPlacementViewQueryKey, scopeKey || "default"] as const;
}

/**
 * Kiểm tra ngữ cảnh org hiện tại có còn khớp org lúc khởi chạy thao tác hay
 * không: chấp nhận bước hydrate ban đầu từ `null -> expectedOrgId` (khi vừa
 * đăng nhập và `GET /api/student/orgs` mới hoàn tất), chỉ trả `false` khi
 * người dùng thực sự chuyển sang một org khác.
 */
export function isSameStudentOrgContext(
	expectedOrgId?: string | null,
): boolean {
	if (!expectedOrgId) return true;
	const currentOrgId = getActiveStudentOrgId();
	return currentOrgId === null || currentOrgId === expectedOrgId;
}

const PUBLIC_AUDIO_SRC_PREFIX = "/public/placement-test/audio/";

async function throwPlacementHttpError(
	res: Response,
	sentOrgId: string | undefined,
): Promise<never> {
	let code: string | undefined;
	let message = `Request failed with status ${res.status}`;
	try {
		const body = (await res.json()) as {
			code?: string;
			error?: string;
			message?: string;
		};
		code = body.code ?? body.error;
		if (body.message) {
			message = body.message;
		} else if (body.error && typeof body.error === "string") {
			message = body.error;
		}
	} catch {
		// Non-JSON body
	}
	const error = new HttpError(res.status, message, { code, sentOrgId });
	if (isTeacherOnStudentPortalError(error)) {
		redirectToLoginForWrongRole();
	}
	throw error;
}

export async function fetchStudentPlacementStatus(): Promise<StudentPlacementStatusResponse> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/placement-test/status`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return studentPlacementStatusSchema.parse(data);
}

export function useStudentPlacementStatus(enabled = true) {
	return useQuery({
		queryKey: studentPlacementStatusQueryKey,
		queryFn: fetchStudentPlacementStatus,
		enabled,
		staleTime: 30_000,
	});
}

export async function fetchStudentPlacementView(
	explicitOrgId?: string | null,
): Promise<StudentPlacementViewResponse> {
	const headers = getStudentHeaders({}, explicitOrgId);
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/placement-test`, {
		method: "GET",
		headers,
		credentials: "include",
	});
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	const raw = (await res.json()) as unknown;
	if (!raw || typeof raw !== "object") {
		throw new Error("Dữ liệu bài kiểm tra đầu vào không hợp lệ.");
	}
	const status = studentPlacementStatusSchema.parse(raw);
	const record = raw as Record<string, unknown>;
	return {
		...status,
		snapshot:
			record.snapshot && typeof record.snapshot === "object"
				? (record.snapshot as StudentPlacementViewResponse["snapshot"])
				: null,
		submission:
			record.submission && typeof record.submission === "object"
				? (record.submission as StudentPlacementViewResponse["submission"])
				: null,
		speakingTasks: Array.isArray(record.speakingTasks)
			? (record.speakingTasks as StudentPlacementViewResponse["speakingTasks"])
			: null,
	};
}

export function useStudentPlacementView(
	orgId?: string | null,
	cacheScope?: string | null,
) {
	const scopeKey = orgId ?? cacheScope ?? null;
	return useQuery({
		queryKey: getStudentPlacementViewQueryKey(scopeKey),
		queryFn: () => fetchStudentPlacementView(orgId),
		staleTime: 30_000,
	});
}

export async function dismissStudentPlacementPrompt(): Promise<{
	ok: boolean;
	promptDismissedAt: string;
}> {
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/placement-test/dismiss`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	const body = (await res.json()) as {
		ok?: boolean;
		promptDismissedAt?: string;
	};
	return {
		ok: Boolean(body?.ok ?? true),
		promptDismissedAt:
			typeof body?.promptDismissedAt === "string"
				? body.promptDismissedAt
				: new Date().toISOString(),
	};
}

export function useDismissPlacementPrompt() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: dismissStudentPlacementPrompt,
		onSuccess: (data) => {
			queryClient.setQueryData<StudentPlacementStatusResponse>(
				studentPlacementStatusQueryKey,
				(prev) =>
					prev ? { ...prev, promptDismissedAt: data.promptDismissedAt } : prev,
			);
			void queryClient.invalidateQueries({
				queryKey: studentPlacementStatusQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: studentPlacementViewQueryKey,
			});
		},
	});
}

export async function submitStudentPlacement(
	payload: StudentPlacementSubmit,
	explicitOrgId?: string | null,
): Promise<StudentPlacementSubmitResponse> {
	const validated = studentPlacementSubmitSchema.parse(payload);
	const headers = getStudentHeaders(
		{ "Content-Type": "application/json" },
		explicitOrgId,
	);
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/placement-test/submissions`,
		{
			method: "POST",
			headers,
			credentials: "include",
			body: JSON.stringify(validated),
		},
	);
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	return (await res.json()) as StudentPlacementSubmitResponse;
}

/**
 * Nộp bài kiểm tra đầu vào. Cố ý không invalidate cache trong `onSuccess` để
 * giữ nguyên `PlacementTestRunner` đang tải file Speaking; runner sẽ tự cập
 * nhật và invalidate cache sau khi quá trình tải Speaking hoàn tất hoặc thất bại.
 */
export function useSubmitStudentPlacement(orgId?: string | null) {
	return useMutation({
		mutationFn: (payload: StudentPlacementSubmit) =>
			submitStudentPlacement(payload, orgId),
	});
}

export async function requestStudentPlacementSpeakingUploadToken(
	submissionId: string,
	explicitOrgId?: string | null,
): Promise<StudentPlacementSpeakingTokenResponse> {
	const headers = getStudentHeaders({}, explicitOrgId);
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/placement-test/submissions/${encodeURIComponent(submissionId)}/speaking-upload-token`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	const body =
		(await res.json()) as Partial<StudentPlacementSpeakingTokenResponse>;
	if (
		!body ||
		typeof body.uploadToken !== "string" ||
		body.uploadToken.trim().length === 0
	) {
		throw new Error("Máy chủ không trả về mã tải lên bản ghi Speaking hợp lệ.");
	}
	return {
		uploadToken: body.uploadToken,
		uploadTokenExpiresAt:
			typeof body.uploadTokenExpiresAt === "string"
				? body.uploadTokenExpiresAt
				: "",
	};
}

export interface UploadStudentPlacementSpeakingOptions {
	retryDelaysMs?: readonly number[];
	sleepImpl?: (ms: number) => Promise<void>;
	orgId?: string | null;
}

const DEFAULT_SPEAKING_UPLOAD_RETRY_DELAYS_MS: readonly number[] = [800, 2000];

const SPEAKING_UPLOAD_NETWORK_ERROR_MESSAGE =
	"Không thể kết nối máy chủ để tải file Speaking. Bài làm 4 kỹ năng còn lại đã được lưu an toàn — bạn có thể bấm thử tải lại.";

function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" &&
			error instanceof DOMException &&
			error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function uploadStudentPlacementSpeaking(
	submissionId: string,
	uploadToken: string,
	blob: Blob,
	mimeType: string,
	durationSec: number,
	opts?: UploadStudentPlacementSpeakingOptions,
): Promise<{ ok: boolean; speakingStatus?: string }> {
	const headBytes = await readBlobHeadBytes(blob);
	const meta = resolveSpeakingUploadMeta(mimeType || blob.type, headBytes);
	const headers = getStudentHeaders(
		{
			"X-Upload-Token": uploadToken,
			"X-Media-Filename": meta.filename,
			"X-Speaking-Duration": String(Math.max(0, Math.round(durationSec))),
			"Content-Type": meta.contentType,
		},
		opts?.orgId,
	);
	const sentOrgId = headers["x-student-org-id"];
	const url = `${getApiBaseUrl()}/api/student/placement-test/submissions/${encodeURIComponent(submissionId)}/speaking`;
	const retryDelaysMs =
		opts?.retryDelaysMs ?? DEFAULT_SPEAKING_UPLOAD_RETRY_DELAYS_MS;
	const sleep = opts?.sleepImpl ?? defaultSleep;

	for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
		let res: Response;
		try {
			res = await fetch(url, {
				method: "PUT",
				headers,
				credentials: "include",
				body: blob,
			});
		} catch (fetchErr) {
			if (isAbortError(fetchErr)) {
				throw fetchErr;
			}
			if (attempt < retryDelaysMs.length) {
				await sleep(retryDelaysMs[attempt] ?? 0);
				continue;
			}
			throw new HttpError(0, SPEAKING_UPLOAD_NETWORK_ERROR_MESSAGE);
		}

		if (res.ok) {
			return (await res.json()) as { ok: boolean; speakingStatus?: string };
		}

		try {
			await throwPlacementHttpError(res, sentOrgId);
		} catch (httpErr) {
			if (
				isHttpError(httpErr) &&
				isRetryableSpeakingUploadStatus(httpErr.status) &&
				attempt < retryDelaysMs.length
			) {
				await sleep(retryDelaysMs[attempt] ?? 0);
				continue;
			}
			throw httpErr;
		}
	}

	throw new HttpError(0, SPEAKING_UPLOAD_NETWORK_ERROR_MESSAGE);
}

export function useActiveStudentOrgId(): string | null {
	return useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		() => null,
	);
}

function appendStudentOrgQuery(
	urlString: string,
	orgId: string | null,
): string {
	if (!orgId) return urlString;
	const [basePart, hashPart] = urlString.split("#");
	const [pathPart, queryPart] = (basePart ?? "").split("?");
	const params = new URLSearchParams(queryPart ?? "");
	if (!params.has("org")) {
		params.set("org", orgId);
	}
	const qs = params.toString();
	const rebuilt = qs ? `${pathPart}?${qs}` : pathPart;
	return hashPart !== undefined ? `${rebuilt}#${hashPart}` : rebuilt;
}

export function resolveStudentPlacementAudioUrl(
	audioId: string,
	explicitOrgId?: string | null,
): string {
	const orgId =
		explicitOrgId !== undefined ? explicitOrgId : getActiveStudentOrgId();
	return appendStudentOrgQuery(
		`${getApiBaseUrl()}/api/student/placement-test/audio/${encodeURIComponent(audioId)}`,
		orgId,
	);
}

/** Chuẩn hóa `src` audio từ snapshot sang URL `/api/student/placement-test/audio/:audioId` (kèm `?org=` cho multi-org). */
export function resolveStudentPlacementMediaSrc(
	src: string,
	explicitOrgId?: string | null,
): string {
	const trimmed = String(src ?? "").trim();
	if (!trimmed) return "";
	const orgId =
		explicitOrgId !== undefined ? explicitOrgId : getActiveStudentOrgId();
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	if (trimmed.startsWith(PUBLIC_AUDIO_SRC_PREFIX)) {
		const audioId = trimmed.slice(PUBLIC_AUDIO_SRC_PREFIX.length).trim();
		return audioId ? resolveStudentPlacementAudioUrl(audioId, orgId) : "";
	}
	if (trimmed.startsWith("/")) {
		const url = `${getApiBaseUrl()}${trimmed}`;
		return trimmed.startsWith("/api/student/placement-test/audio/")
			? appendStudentOrgQuery(url, orgId)
			: url;
	}
	return resolveStudentPlacementAudioUrl(trimmed, orgId);
}
