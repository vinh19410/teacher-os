import {
	createSessionCache,
	SESSION_CACHE_TTL_MS,
} from "@teacher-os/auth/session-cache";
import { env } from "@teacher-os/env/web";
import { createAuthClient } from "better-auth/react";
import { ACTIVE_STUDENT_USER_KEY } from "@/lib/student-org-storage";

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

export function isStudentSession(sessionData: SessionDataLike): boolean {
	return getSessionUserRole(sessionData) === "student";
}

/**
 * `_auth.beforeLoad` chạy lại mỗi lần chuyển trang; cache ngắn hạn + gộp
 * request đồng thời + chịu lỗi tạm thời (429/5xx/timeout) dùng chung qua
 * `@teacher-os/auth/session-cache`.
 */
const sessionCache = createSessionCache<AuthSessionResult>((signal) =>
	rawAuthClient.getSession({
		fetchOptions: { signal },
	}),
);

export const getCachedSession = sessionCache.getCachedSession;
export const clearSessionCache = sessionCache.clearSessionCache;

// Vô hiệu hoá cache phiên ngay khi tab khác đăng xuất hoặc đổi tài khoản học viên.
if (typeof window !== "undefined") {
	window.addEventListener("storage", (event) => {
		if (event.key === null || event.key === ACTIVE_STUDENT_USER_KEY) {
			clearSessionCache();
		}
	});
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
