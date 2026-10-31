import type {
	SelfStudyPlanCreateInput,
	SelfStudyPlanDayPatchInput,
	SelfStudyPlanDetailResponse,
	SelfStudyPlanReleaseMissedInput,
	SelfStudyPlanUpdateHoursInput,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "./api-base-url";

async function requestJson<T>(
	method: "GET" | "POST" | "PUT" | "PATCH",
	path: string,
	body?: unknown,
	baseUrl: string = getApiBaseUrl(),
): Promise<T> {
	const init: RequestInit = {
		method,
		credentials: "include",
	};
	if (method !== "GET") {
		init.headers = { "content-type": "application/json" };
		init.body = JSON.stringify(body ?? {});
	}
	const res = await fetch(`${baseUrl}${path}`, init);
	const raw: unknown = await res.json().catch(() => null);
	if (!res.ok) {
		const error =
			raw != null &&
			typeof raw === "object" &&
			"error" in raw &&
			typeof raw.error === "string"
				? raw.error
				: "request-failed";
		throw Object.assign(new Error(error), {
			selfStudyErrorCode: error,
			status: res.status,
		});
	}
	return raw as T;
}

export async function fetchSelfStudyPlan(
	classId: string,
	params?: { planId?: string; from?: string; to?: string },
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	const search = new URLSearchParams();
	if (params?.planId) search.set("planId", params.planId);
	if (params?.from) search.set("from", params.from);
	if (params?.to) search.set("to", params.to);
	const qs = search.toString();
	return requestJson<SelfStudyPlanDetailResponse>(
		"GET",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan${qs ? `?${qs}` : ""}`,
		undefined,
		baseUrl,
	);
}

export async function saveSelfStudyPlanDraft(
	classId: string,
	input: SelfStudyPlanCreateInput,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"POST",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan`,
		input,
		baseUrl,
	);
}

export async function publishSelfStudyPlan(
	classId: string,
	planId: string,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"POST",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan/${encodeURIComponent(planId)}/publish`,
		{},
		baseUrl,
	);
}

export async function updateSelfStudyPlanHours(
	classId: string,
	planId: string,
	input: SelfStudyPlanUpdateHoursInput,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"PATCH",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan/${encodeURIComponent(planId)}/hours`,
		input,
		baseUrl,
	);
}

export async function updateSelfStudyPlanDay(
	classId: string,
	planId: string,
	date: string,
	input: SelfStudyPlanDayPatchInput,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"PUT",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan/${encodeURIComponent(planId)}/days/${encodeURIComponent(date)}`,
		input,
		baseUrl,
	);
}

export async function releaseMissedSelfStudyDay(
	classId: string,
	planId: string,
	date: string,
	input?: SelfStudyPlanReleaseMissedInput,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"POST",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan/${encodeURIComponent(planId)}/days/${encodeURIComponent(date)}/release-missed`,
		input ?? {},
		baseUrl,
	);
}

export async function cancelSelfStudyPlan(
	classId: string,
	planId: string,
	baseUrl?: string,
): Promise<SelfStudyPlanDetailResponse> {
	return requestJson<SelfStudyPlanDetailResponse>(
		"POST",
		`/api/classes/${encodeURIComponent(classId)}/self-study-plan/${encodeURIComponent(planId)}/cancel`,
		{},
		baseUrl,
	);
}
