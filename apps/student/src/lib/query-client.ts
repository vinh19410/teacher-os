import { QueryCache, QueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { validateReturnUrl } from "@/lib/validate-return-url";

export class HttpError extends Error {
	readonly status: number;
	readonly code?: string;

	constructor(status: number, message: string, options?: { code?: string }) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.code = options?.code;
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}

let reauthing = false;

if (typeof window !== "undefined") {
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) reauthing = false;
	});
}

export function reauth(): void {
	if (reauthing) return;
	reauthing = true;
	void authClient.signOut().catch(() => undefined);
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = validateReturnUrl(current);
	window.location.assign(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}

export function createStudentQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60_000,
				gcTime: 5 * 60_000,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: false,
				networkMode: "offlineFirst",
			},
		},
		queryCache: new QueryCache({
			onError: (error) => {
				if (isHttpError(error) && error.status === 401) {
					reauth();
				}
			},
		}),
	});
}
