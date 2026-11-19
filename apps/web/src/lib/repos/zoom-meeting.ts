import type {
	ClassZoomBulkCreateResponse,
	SessionRecordingSyncResponse,
	SessionZoomCreateResponse,
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

async function zoomFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export function createSessionZoom(
	classId: string,
	dateISO: string,
): Promise<SessionZoomCreateResponse> {
	return zoomFetch<SessionZoomCreateResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/zoom`,
		{ method: "POST", body: "{}" },
	);
}

export function createClassZoomBulk(
	classId: string,
): Promise<ClassZoomBulkCreateResponse> {
	return zoomFetch<ClassZoomBulkCreateResponse>(
		`/api/classes/${encodeURIComponent(classId)}/zoom/bulk`,
		{ method: "POST", body: "{}" },
	);
}

export function syncSessionRecording(
	classId: string,
	dateISO: string,
): Promise<SessionRecordingSyncResponse> {
	return zoomFetch<SessionRecordingSyncResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/recording/sync`,
		{ method: "POST", body: "{}" },
	);
}

export function updateSessionRecording(
	classId: string,
	dateISO: string,
	recordingUrl: string,
): Promise<SessionRecordingSyncResponse> {
	return zoomFetch<SessionRecordingSyncResponse>(
		`/api/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(dateISO)}/recording`,
		{
			method: "PUT",
			body: JSON.stringify({ recordingUrl }),
		},
	);
}
