import type {
	ClassMeetBulkCreateResponse,
	GoogleIntegrationStatus,
	SessionMeetCreateResponse,
	SessionRecordingSyncResponse,
} from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { getServerUrl } from "@/lib/auth-client";
import { HttpError } from "@/lib/kernel-load-state";

function apiBase(): string {
	try {
		return typeof getServerUrl === "function"
			? getServerUrl(env.VITE_SERVER_URL)
			: env.VITE_SERVER_URL;
	} catch {
		return "http://localhost:8000";
	}
}

async function googleMeetFetch<T>(
	path: string,
	init?: RequestInit,
): Promise<T> {
	const res = await fetch(`${apiBase()}${path}`, {
		credentials: "include",
		...init,
		headers: {
			...(init?.body ? { "content-type": "application/json" } : {}),
			...(init?.headers ?? {}),
		},
	});
	const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
	if (!res.ok) {
		throw new HttpError(
			res.status,
			typeof json.error === "string"
				? json.error
				: `Yêu cầu thất bại (${res.status})`,
			{
				reason: typeof json.error === "string" ? json.error : undefined,
				code: typeof json.code === "string" ? json.code : undefined,
			},
		);
	}
	return json as T;
}

export function fetchGoogleIntegrationStatus(): Promise<GoogleIntegrationStatus> {
	return googleMeetFetch<GoogleIntegrationStatus>(
		"/api/integrations/google/status",
		{ method: "GET" },
	);
}

export function createSessionMeet(
	classId: string,
	dateISO: string,
): Promise<SessionMeetCreateResponse> {
	return googleMeetFetch<SessionMeetCreateResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/meet`,
		{ method: "POST", body: "{}" },
	);
}

export function createClassMeetBulk(
	classId: string,
): Promise<ClassMeetBulkCreateResponse> {
	return googleMeetFetch<ClassMeetBulkCreateResponse>(
		`/api/classes/${encodeURIComponent(classId)}/meet/bulk`,
		{ method: "POST", body: "{}" },
	);
}

export function syncSessionRecording(
	classId: string,
	dateISO: string,
): Promise<SessionRecordingSyncResponse> {
	return googleMeetFetch<SessionRecordingSyncResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/recording/sync`,
		{ method: "POST", body: "{}" },
	);
}

export function updateSessionRecording(
	classId: string,
	dateISO: string,
	recordingUrl: string,
): Promise<SessionRecordingSyncResponse> {
	return googleMeetFetch<SessionRecordingSyncResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/recording`,
		{
			method: "PUT",
			body: JSON.stringify({ recordingUrl }),
		},
	);
}
