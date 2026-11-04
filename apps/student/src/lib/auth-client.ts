import { env } from "@teacher-os/env/web";
import { emailOTPClient } from "better-auth/client/plugins";
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

export const authClient = createAuthClient({
	baseURL: new URL("/api/auth", getServerUrl(env.VITE_SERVER_URL)).toString(),
	plugins: [emailOTPClient()],
});
