import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";

/**
 * Factory for the app's QueryClient — created once at module scope in
 * main.tsx so the cache survives re-renders. Defaults mirror the kernel's
 * fail-safe contract: no auto-retry (a failed load shows the blocking error
 * screen immediately; the bus manages its own 2-attempt refresh), and no
 * background refetching — the `['kernel']` entry is refreshed only through
 * the command bus or an explicit retry.
 */
export function createKernelQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: Number.POSITIVE_INFINITY,
				gcTime: 5 * 60_000,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: false,
			},
		},
		queryCache: new QueryCache({
			onError: (error) => {
				// A dead session on the read path re-authenticates through the
				// same single-flight guard the write path (bus onAuthLost) uses.
				if (isHttpError(error) && error.status === 401) {
					reauth();
				}
			},
		}),
	});
}
