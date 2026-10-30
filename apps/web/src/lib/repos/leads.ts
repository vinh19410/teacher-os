/**
 * Leads repo (#506 phase 4) — fetch GET/PATCH /api/leads với bộ lọc sống
 * URL (q/status/page), ném HttpError khi response không ok (chuẩn
 * repos/notifications). Response parse bằng contract type (interface —
 * server là nguồn shape, không có zod schema trên wire).
 */
import { queryOptions } from "@tanstack/react-query";
import type {
	LeadListResponse,
	LeadPatch,
	LeadQuery,
	LeadRow,
} from "@teacher-os/api/lead-contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export const LEADS_PAGE_SIZE = 20;

/** Prefix key chung để invalidate toàn bộ các tab/bộ lọc của màn /leads. */
export const leadsAllQueryKey = ["kernel", "leads"] as const;

/** Query key đổi theo bộ lọc — mỗi tổ hợp q/status/page 1 cache slot. */
export const leadsQueryKey = (params: LeadQuery) =>
	[...leadsAllQueryKey, params] as const;

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
