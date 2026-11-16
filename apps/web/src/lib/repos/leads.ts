/**
 * Leads repo (#506 phase 4, #721, #730) — fetch GET/PATCH /api/leads, chi tiết/chấm bài test đầu vào và chấm lại AI.
 */
import { queryOptions } from "@tanstack/react-query";
import type {
	LeadListResponse,
	LeadPatch,
	LeadQuery,
	LeadRow,
} from "@teacher-os/api/lead-contracts";
import type {
	PlacementSubmissionDetail,
	PlacementTeacherGrade,
} from "@teacher-os/api/placement-test-contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const LEADS_PAGE_SIZE = 20;

/** Prefix key chung để invalidate toàn bộ các tab/bộ lọc của màn /leads. */
export const leadsAllQueryKey = ["kernel", "leads"] as const;

/** Query key đổi theo bộ lọc — mỗi tổ hợp q/status/page 1 cache slot. */
export const leadsQueryKey = (params: LeadQuery) =>
	[...leadsAllQueryKey, params] as const;

export const leadPlacementSubmissionQueryKey = (leadId: string) =>
	[...leadsAllQueryKey, "placement-submission", leadId] as const;

export async function fetchLeads(
	params: LeadQuery,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<LeadListResponse> {
	const url = new URL(`${baseUrl}/api/leads`);
	if (params.q?.trim()) url.searchParams.set("q", params.q.trim());
	if (params.status) url.searchParams.set("status", params.status);
	if (params.page && params.page > 1) {
		url.searchParams.set("page", String(params.page));
	}
	const res = await fetch(url, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Failed to load leads: ${res.status}`);
	}
	return (await res.json()) as LeadListResponse;
}

export function leadsQueryOptions(params: LeadQuery) {
	return queryOptions({
		queryKey: leadsQueryKey(params),
		queryFn: ({ signal }) => fetchLeads(params, undefined, signal),
	});
}

export async function patchLead(
	id: string,
	body: LeadPatch,
	baseUrl: string = getApiBaseUrl(),
): Promise<LeadRow> {
	const url = `${baseUrl}/api/leads/${encodeURIComponent(id)}`;
	const res = await fetch(url, {
		method: "PATCH",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Failed to update lead: ${res.status}`);
	}
	return (await res.json()) as LeadRow;
}

export async function fetchLeadPlacementSubmission(
	leadId: string,
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/leads/${encodeURIComponent(leadId)}/placement-submission`;
	const res = await fetch(url, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to load placement submission: ${res.status}`,
		);
	}
	return (await res.json()) as PlacementSubmissionDetail;
}

export function leadPlacementSubmissionQueryOptions(leadId: string) {
	return queryOptions({
		queryKey: leadPlacementSubmissionQueryKey(leadId),
		queryFn: ({ signal }) =>
			fetchLeadPlacementSubmission(leadId, undefined, signal),
	});
}

export async function gradeLeadPlacementSubmission(
	leadId: string,
	body: PlacementTeacherGrade,
	baseUrl: string = getApiBaseUrl(),
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/leads/${encodeURIComponent(leadId)}/placement-submission`;
	const res = await fetch(url, {
		method: "PATCH",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		throw new HttpError(
			res.status,
			`Failed to grade placement submission: ${res.status}`,
		);
	}
	return (await res.json()) as PlacementSubmissionDetail;
}

/** Yêu cầu server chấm nháp lại bằng AI (#730) — trả detail với aiStatus "processing". */
export async function retryLeadPlacementAi(
	leadId: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<PlacementSubmissionDetail> {
	const url = `${baseUrl}/api/leads/${encodeURIComponent(leadId)}/placement-submission/ai-retry`;
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
			`Failed to retry placement AI grading: ${res.status}`,
		);
	}
	return (await res.json()) as PlacementSubmissionDetail;
}

export function resolvePlacementSubmissionMediaUrl(
	mediaPath: string | null,
	baseUrl: string = getApiBaseUrl(),
): string | null {
	if (!mediaPath) return null;
	if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) {
		return mediaPath;
	}
	return `${baseUrl}${mediaPath}`;
}
