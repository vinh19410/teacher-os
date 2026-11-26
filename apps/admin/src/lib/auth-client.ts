import {
	createSessionCache,
	SESSION_CACHE_TTL_MS,
} from "@teacher-os/auth/session-cache";
import { env } from "@teacher-os/env/web";
import { createAuthClient } from "better-auth/react";

export { SESSION_CACHE_TTL_MS };

function getProcessEnv(): Record<string, string | undefined> | undefined {
	const globalScope = globalThis as typeof globalThis & {
		process?: { env?: Record<string, string | undefined> };
	};
	return globalScope.process?.env;
}

export function getServerUrl(url: string) {
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

	const vercelUrl =
		processEnv?.VERCEL_ENV === "production"
			? (processEnv.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv.VERCEL_URL)
			: (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
	if (vercelUrl) {
		const origin = vercelUrl.startsWith("http")
			? vercelUrl
			: `https://${vercelUrl}`;
		return `${origin}${normalized}`;
	}

	return `http://localhost:8000${normalized}`;
}

export const rawAuthClient = createAuthClient({
	baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)).toString(),
});

export type AuthSessionResult = Awaited<
	ReturnType<typeof rawAuthClient.getSession>
>;

const sessionCache = createSessionCache<AuthSessionResult>((signal) =>
	rawAuthClient.getSession({
		fetchOptions: { signal },
	}),
);

const clearListeners = new Set<() => void>();

export function onSessionCacheClear(listener: () => void): () => void {
	clearListeners.add(listener);
	return () => {
		clearListeners.delete(listener);
	};
}

export const getCachedSession = sessionCache.getCachedSession;

export function clearSessionCache(): void {
	sessionCache.clearSessionCache();
	for (const listener of clearListeners) {
		listener();
	}
}

const overrides = {
	getCachedSession,
	clearSessionCache,
	signOut: async (...args: Parameters<typeof rawAuthClient.signOut>) => {
		clearSessionCache();
		try {
			return await rawAuthClient.signOut(...args);
		} finally {
			clearSessionCache();
		}
	},
	resetPassword: async (
		...args: Parameters<typeof rawAuthClient.resetPassword>
	) => {
		clearSessionCache();
		try {
			return await rawAuthClient.resetPassword(...args);
		} finally {
			clearSessionCache();
		}
	},
};

export const authClient = new Proxy(rawAuthClient, {
	get(target, prop, receiver) {
		if (Object.hasOwn(overrides, prop)) {
			return overrides[prop as keyof typeof overrides];
		}
		return Reflect.get(target, prop, receiver);
	},
}) as typeof rawAuthClient & typeof overrides;
