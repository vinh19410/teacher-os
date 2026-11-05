// @vitest-environment jsdom

import {
	focusManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import type { QuizAttemptDetail } from "@teacher-os/api/contracts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AWAITING_GRADE_POLL_INTERVAL_MS,
	attemptDetailQueryOptions,
	useAttemptDetail,
} from "@/lib/repos/quiz";

const UNGRADED_ATTEMPT: QuizAttemptDetail = {
	id: "att-detail-1",
	assignmentId: "ca-1",
	title: "Writing Task 2 Test",
	status: "submitted",
	correctCount: 0,
	wrongCount: 0,
	skippedCount: 0,
	totalCount: 0,
	startedAt: "2026-11-05T00:00:00.000Z",
	submittedAt: "2026-11-05T00:30:00.000Z",
	note: "",
	skill: "writing",
	essay: "This is my submitted essay.",
	questions: [],
	grade: null,
};

const GRADED_ATTEMPT: QuizAttemptDetail = {
	...UNGRADED_ATTEMPT,
	grade: {
		band: 7.0,
		scores: {
			taskResponse: 7.0,
			coherenceCohesion: 7.0,
			lexicalResource: 7.0,
			grammaticalRange: 7.0,
		},
		feedback: "Well-structured essay with strong vocabulary.",
		gradedAt: "2026-11-05T01:00:00.000Z",
	},
};

describe("useAttemptDetail automatic grade refetch (#618)", () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.restoreAllMocks();
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
		});
	});

	afterEach(() => {
		cleanup();
		queryClient.clear();
		focusManager.setFocused(undefined);
		vi.unstubAllGlobals();
	});

	it("refetches on window focus while ungraded, updates cache with grade, and stops focus refetches once graded", async () => {
		const jsonFetcher = vi
			.fn()
			.mockResolvedValueOnce(UNGRADED_ATTEMPT)
			.mockResolvedValueOnce(GRADED_ATTEMPT);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: jsonFetcher,
				}),
			),
		);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		const { result } = renderHook(() => useAttemptDetail("att-detail-1"), {
			wrapper,
		});

		// 1. Initial fetch completes with ungraded attempt
		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
		expect(result.current.data?.grade).toBeNull();
		expect(jsonFetcher).toHaveBeenCalledTimes(1);

		// 2. Student switches window / returns to tab -> window focus triggers refetch
		act(() => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});

		// 3. Query refetches and receives graded attempt
		await waitFor(() => {
			expect(result.current.data?.grade?.band).toBe(7.0);
		});
		expect(jsonFetcher).toHaveBeenCalledTimes(2);

		// 4. Once graded, subsequent window focus does NOT trigger another refetch
		act(() => {
			focusManager.setFocused(false);
			focusManager.setFocused(true);
		});

		// Verify no 3rd call occurs
		expect(jsonFetcher).toHaveBeenCalledTimes(2);
	});

	it("polls periodically while ungraded and stops polling once graded", async () => {
		let callCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() => {
				callCount++;
				const payload = callCount === 1 ? UNGRADED_ATTEMPT : GRADED_ATTEMPT;
				return Promise.resolve({
					ok: true,
					status: 200,
					json: () => Promise.resolve(payload),
				});
			}),
		);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		const { result } = renderHook(() => useAttemptDetail("att-detail-1"), {
			wrapper,
		});

		// Initial fetch completes
		await waitFor(() => {
			expect(result.current.isSuccess).toBe(true);
		});
		expect(result.current.data?.grade).toBeNull();
		expect(callCount).toBe(1);

		// In React Query, refetchInterval can be triggered or checked on the query
		const query = queryClient
			.getQueryCache()
			.find({ queryKey: ["student", "attempt", "att-detail-1", "detail"] });
		expect(query).toBeDefined();

		const options = attemptDetailQueryOptions("att-detail-1");
		const refetchIntervalFn = options.refetchInterval as (
			q: unknown,
		) => number | false;
		expect(refetchIntervalFn(query)).toBe(AWAITING_GRADE_POLL_INTERVAL_MS);

		// Simulate grade arrival via refetch
		const refetchRes = await result.current.refetch();
		expect(refetchRes.data?.grade?.band).toBe(7.0);

		await waitFor(() => {
			expect(result.current.data?.grade?.band).toBe(7.0);
		});
		expect(callCount).toBe(2);

		// Now graded -> refetchInterval option becomes false
		expect(refetchIntervalFn(query)).toBe(false);
	});

	it("does not issue duplicate fetch on mount when data is fresh in cache", async () => {
		const jsonFetcher = vi.fn().mockResolvedValue(UNGRADED_ATTEMPT);

		vi.stubGlobal(
			"fetch",
			vi.fn().mockImplementation(() =>
				Promise.resolve({
					ok: true,
					status: 200,
					json: jsonFetcher,
				}),
			),
		);

		// Seed cache with fresh ungraded data (simulating route loader ensureQueryData)
		queryClient.setQueryData(
			["student", "attempt", "att-detail-1", "detail"],
			UNGRADED_ATTEMPT,
		);

		const wrapper = ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		const { result } = renderHook(() => useAttemptDetail("att-detail-1"), {
			wrapper,
		});

		// Component mounts with fresh data
		expect(result.current.data?.id).toBe("att-detail-1");
		// Ensure no immediate duplicate fetch was triggered on mount
		expect(jsonFetcher).toHaveBeenCalledTimes(0);
	});
});
