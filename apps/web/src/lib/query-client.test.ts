/**
 * QueryClient defaults + the global 401 re-auth wiring. `reauth` runs REAL
 * here — only the auth-client transport is mocked, so the single-flight
 * guard itself is the thing under test (F3).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/kernel-load-state";

const signOutMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: signOutMock },
}));

import { createKernelQueryClient } from "@/lib/query-client";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createKernelQueryClient", () => {
	test("defaults pin the fail-safe policy: no retry, no background refetch", () => {
		const defaults = createKernelQueryClient().getDefaultOptions().queries;
		expect(defaults?.retry).toBe(false);
		expect(defaults?.staleTime).toBe(Number.POSITIVE_INFINITY);
		expect(defaults?.refetchOnWindowFocus).toBe(false);
		expect(defaults?.refetchOnReconnect).toBe(false);
	});

	test("QueryCache.onError re-authenticates exactly once for concurrent 401 reads", async () => {
		const assign = vi.fn();
		vi.stubGlobal("window", {
			location: { assign, pathname: "/dash", search: "", hash: "" },
		});
		const client = createKernelQueryClient();
		// Two distinct query keys → QueryCache.onError fires twice; the
		// single-flight guard must collapse them into one redirect.
		const first = client
			.fetchQuery({
				queryKey: ["a"],
				queryFn: () => Promise.reject(new HttpError(401, "GET /a failed: 401")),
			})
			.catch(() => undefined);
		const second = client
			.fetchQuery({
				queryKey: ["b"],
				queryFn: () => Promise.reject(new HttpError(401, "GET /b failed: 401")),
			})
			.catch(() => undefined);
		await Promise.all([first, second]);

		expect(signOutMock).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledTimes(1);
		expect(assign).toHaveBeenCalledWith("/login?returnUrl=%2Fdash");
	});
});
