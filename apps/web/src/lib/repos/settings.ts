import { queryOptions } from "@tanstack/react-query";
import type {
	WorkspaceSettings,
	WorkspaceSettingsUpdate,
} from "@teacher-os/api/contracts";
import { workspaceSettingsSchema } from "@teacher-os/api/contracts";

export const workspaceSettingsQueryKey = ["kernel", "settings"] as const;

function readEnvString(key: string): string | undefined {
	const envObj =
		typeof process !== "undefined" && process?.env ? process.env : undefined;
	if (envObj && key in envObj) {
		const val = envObj[key];
		if (typeof val === "string") return val;
	}
	return undefined;
}

export function getApiBaseUrl(): string {
	if (typeof window !== "undefined") {
		return window.location.origin;
	}
	const serverUrl = readEnvString("SERVER_URL");
	if (serverUrl) {
		return serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
	}
	return "http://localhost:8000";
}

export async function fetchWorkspaceSettings(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<WorkspaceSettings> {
	const res = await fetch(`${baseUrl}/api/kernel/settings`, {
		method: "GET",
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch settings: ${res.status}`);
	}
	const json = await res.json();
	return workspaceSettingsSchema.parse(json);
}

export async function saveWorkspaceSettings(
	baseUrl: string = getApiBaseUrl(),
	payload: WorkspaceSettingsUpdate = {},
): Promise<WorkspaceSettings> {
	const res = await fetch(`${baseUrl}/api/kernel/settings`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		throw new Error(`Failed to save settings: ${res.status}`);
	}
	const json = await res.json();
	return workspaceSettingsSchema.parse(json);
}

export function workspaceSettingsQueryOptions(
	baseUrl: string = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: workspaceSettingsQueryKey,
		queryFn: ({ signal }) => fetchWorkspaceSettings(baseUrl, signal),
		staleTime: 30_000,
	});
}
