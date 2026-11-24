import { env } from "@teacher-os/env/web";
import { createAuthClient } from "better-auth/react";

function getProcessEnv(): Record<string, string | undefined> | undefined {
	const globalScope = globalThis as typeof globalThis & {
		process?: { env?: Record<string, string | undefined> };
	};
	return globalScope.process?.env;
}

export function getServerUrl(url: string): string {
	const processEnv = getProcessEnv();
	if (typeof window === "undefined" && processEnv?.SERVER_URL) {
		const serverUrl = processEnv.SERVER_URL;
		return serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;
	}

	const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

	if (!normalized.startsWith("/")) {
		return normalized;
	}

	if (typeof window !== "undefined") {
		return `${window.location.origin}${normalized}`;
	}

	return `http://localhost:8000${normalized}`;
}

export const authClient = createAuthClient({
	baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)).toString(),
});

export type SessionDataLike = { user?: unknown } | null | undefined;

export function getSessionUserRole(
	sessionData: SessionDataLike,
): string | null {
	const user = sessionData?.user;
	if (!user || typeof user !== "object") {
		return null;
	}
	const role = (user as { role?: unknown }).role;
	return typeof role === "string" && role.length > 0 ? role : null;
}

export function getSessionUserEmail(
	sessionData: SessionDataLike,
): string | null {
	const user = sessionData?.user;
	if (!user || typeof user !== "object") {
		return null;
	}
	const email = (user as { email?: unknown }).email;
	return typeof email === "string" && email.length > 0 ? email : null;
}
