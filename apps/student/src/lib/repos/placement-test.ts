import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type StudentPlacementStatusResponse,
	type StudentPlacementSubmit,
	type StudentPlacementSubmitResponse,
	type StudentPlacementViewResponse,
	studentPlacementStatusSchema,
	studentPlacementSubmitSchema,
} from "@teacher-os/api/placement-test-contracts";
import { useSyncExternalStore } from "react";
import { resolveSpeakingUploadMeta } from "@/lib/placement-test-helpers";
import { HttpError } from "@/lib/query-client";
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
	throw new HttpError(res.status, message, { code, sentOrgId });
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

export async function fetchStudentPlacementView(): Promise<StudentPlacementViewResponse> {
	const headers = getStudentHeaders();
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
	};
}

export function useStudentPlacementView() {
	return useQuery({
		queryKey: studentPlacementViewQueryKey,
		queryFn: fetchStudentPlacementView,
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
): Promise<StudentPlacementSubmitResponse> {
	const validated = studentPlacementSubmitSchema.parse(payload);
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
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

export function useSubmitStudentPlacement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: submitStudentPlacement,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: studentPlacementStatusQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: studentPlacementViewQueryKey,
			});
		},
	});
}

export async function uploadStudentPlacementSpeaking(
	submissionId: string,
	uploadToken: string,
	blob: Blob,
	mimeType: string,
	durationSec: number,
): Promise<{ ok: boolean; speakingStatus?: string }> {
	const meta = resolveSpeakingUploadMeta(mimeType || blob.type);
	const headers = getStudentHeaders({
		"X-Upload-Token": uploadToken,
		"X-Media-Filename": meta.filename,
		"X-Speaking-Duration": String(Math.max(0, Math.round(durationSec))),
		"Content-Type": meta.contentType,
	});
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/placement-test/submissions/${encodeURIComponent(submissionId)}/speaking`,
		{
			method: "PUT",
			headers,
			credentials: "include",
			body: blob,
		},
	);
	if (!res.ok) {
		await throwPlacementHttpError(res, sentOrgId);
	}
	return (await res.json()) as { ok: boolean; speakingStatus?: string };
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
