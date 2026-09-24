import { queryOptions } from "@tanstack/react-query";
import type {
	WorkspaceSettings,
	WorkspaceSettingsUpdate,
} from "@teacher-os/api/contracts";
import { workspaceSettingsSchema } from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { getServerUrl } from "@/lib/auth-client";

export const workspaceSettingsQueryKey = ["kernel", "settings"] as const;

export function getApiBaseUrl(): string {
	return getServerUrl(env.VITE_SERVER_URL);
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
