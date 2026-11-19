import { env } from "@teacher-os/env/web";
import { createAuthClient } from "better-auth/react";

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

/**
 * `_auth.beforeLoad` chạy lại mỗi lần chuyển trang; gọi thẳng `getSession()`
 * khiến mỗi cú bấm sidebar chờ một round-trip get-session (truy vấn D1). Cache
 * ngắn hạn + gộp request đồng thời giống cổng giáo viên.
 */
export const SESSION_CACHE_TTL_MS = 10_000;

export const rawAuthClient = createAuthClient({
	baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)).toString(),
});

export type AuthSessionResult = Awaited<
	ReturnType<typeof rawAuthClient.getSession>
>;

let cacheEpoch = 0;
let cachedSession: { data: AuthSessionResult; expiresAt: number } | null = null;
let lastKnownSession: AuthSessionResult | null = null;
let inFlightSessionPromise: Promise<AuthSessionResult> | null = null;

export function clearSessionCache(): void {
	cacheEpoch++;
	cachedSession = null;
	lastKnownSession = null;
	inFlightSessionPromise = null;
}

export async function getCachedSession({
	force = false,
}: {
	force?: boolean;
} = {}): Promise<AuthSessionResult> {
	const now = Date.now();
	if (!force && cachedSession && now < cachedSession.expiresAt) {
		return cachedSession.data;
	}

	if (inFlightSessionPromise) {
		return inFlightSessionPromise;
	}

	const requestEpoch = cacheEpoch;
	inFlightSessionPromise = (async () => {
		try {
			const res = await rawAuthClient.getSession({
				fetchOptions: {
					signal: AbortSignal.timeout(5_000),
				},
			});
			if (requestEpoch !== cacheEpoch) {
				return res;
			}
			if (res?.data) {
				cachedSession = {
					data: res,
					expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
				};
				lastKnownSession = res;
			} else {
				clearSessionCache();
			}
			return res;
		} catch (err) {
			if (requestEpoch === cacheEpoch && lastKnownSession?.data) {
				console.warn(
					"getSession failed; falling back to last known session",
					err,
				);
				cachedSession = {
					data: lastKnownSession,
					expiresAt: Date.now() + 5_000,
				};
				return lastKnownSession;
			}
			if (requestEpoch === cacheEpoch) {
				clearSessionCache();
			}
			throw err;
		} finally {
			if (requestEpoch === cacheEpoch) {
				inFlightSessionPromise = null;
			}
		}
	})();

	return inFlightSessionPromise;
}

const overrides = {
	getCachedSession,
	clearSessionCache,
	signOut: async (...args: Parameters<typeof rawAuthClient.signOut>) => {
		clearSessionCache();
		return rawAuthClient.signOut(...args);
	},
};

export const authClient = new Proxy(rawAuthClient, {
	get(target, prop, receiver) {
		if (prop in overrides) {
			return overrides[prop as keyof typeof overrides];
		}
		return Reflect.get(target, prop, receiver);
	},
}) as typeof rawAuthClient & typeof overrides;
