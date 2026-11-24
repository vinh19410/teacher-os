// @vitest-environment jsdom
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reauthMock = vi.fn();
const redirectWrongRoleMock = vi.fn();
const invalidateQueriesMock = vi.fn<(...args: unknown[]) => Promise<void>>(() =>
	Promise.resolve(),
);

vi.mock("@/lib/query-client", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/query-client")>(
			"@/lib/query-client",
		);
	return {
		...actual,
		reauth: (...args: unknown[]) => reauthMock(...args),
		redirectToLoginForWrongRole: (...args: unknown[]) =>
			redirectWrongRoleMock(...args),
		studentQueryClient: {
			invalidateQueries: (...args: unknown[]) => invalidateQueriesMock(...args),
		},
	};
});

vi.mock("@teacher-os/env/web", () => ({
	env: { VITE_SERVER_URL: "https://api.staging.test" },
}));

import {
	fetchPracticeAudioObjectUrl,
	type QuizTakeSource,
	resolveQuizAudioUrl,
	useQuizAudioObjectUrl,
	useQuizAudioStream,
} from "@/lib/repos/quiz";
import {
	clearActiveStudentOrgId,
	getActiveStudentOrgId,
	setActiveStudentOrgId,
} from "@/lib/student-org-storage";

describe("listening audio streaming hook & recovery", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		localStorage.clear();
		clearActiveStudentOrgId();
		reauthMock.mockReset();
		redirectWrongRoleMock.mockReset();
		invalidateQueriesMock.mockClear();
	});

	afterEach(() => {
		cleanup();
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	it("resolveQuizAudioUrl builds direct streaming URLs with optional org and retry nonce", () => {
		expect(resolveQuizAudioUrl({ kind: "practice", testId: "t/1" })).toBe(
			"https://api.staging.test/api/student/practice/t%2F1/audio",
		);
		expect(
			resolveQuizAudioUrl(
				{ kind: "assignment", id: "ca-1" },
				{ orgId: "org-1", retryNonce: 2 },
			),
		).toBe(
			"https://api.staging.test/api/student/assignments/ca-1/audio?org=org-1&_r=2",
		);
	});

	it("returns streaming audioSrc immediately with active org and ignores MEDIA_ERR_ABORTED", () => {
		setActiveStudentOrgId("org-1");
		const fetchSpy = vi.fn();
		globalThis.fetch = fetchSpy as unknown as typeof fetch;

		const { result } = renderHook(() =>
			useQuizAudioStream({ kind: "practice", testId: "test-1" }),
		);

		expect(result.current.audioLoading).toBe(false);
		expect(result.current.audioError).toBe(false);
		expect(result.current.audioSrc).toBe(
			"https://api.staging.test/api/student/practice/test-1/audio?org=org-1",
		);

		act(() => {
			result.current.onAudioError({
				currentTarget: { error: { code: 1 } },
			});
		});
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(result.current.audioError).toBe(false);
	});

	it("probes with cache:no-store and Range:bytes=0-0, calling onAuthError on 401 and redirectToLoginForWrongRole on teacher role", async () => {
		setActiveStudentOrgId("org-1");
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		globalThis.fetch = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				calls.push({ url: String(input), init });
				return new Response(JSON.stringify({ error: "unauthorized" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				});
			},
		) as unknown as typeof fetch;

		const onAuthError = vi.fn();
		const { result } = renderHook(() =>
			useQuizAudioStream(
				{ kind: "practice", testId: "test-1" },
				{ onAuthError },
			),
		);

		act(() => {
			result.current.onAudioError();
		});

		await waitFor(() => {
			expect(onAuthError).toHaveBeenCalledTimes(1);
		});
		expect(result.current.audioError).toBe(false);
		expect(calls[0]?.url).toBe(
			"https://api.staging.test/api/student/practice/test-1/audio",
		);
		expect(calls[0]?.init?.cache).toBe("no-store");
		expect(calls[0]?.init?.credentials).toBe("include");
		expect(new Headers(calls[0]?.init?.headers).get("range")).toBe("bytes=0-0");
		expect(new Headers(calls[0]?.init?.headers).get("x-student-org-id")).toBe(
			"org-1",
		);

		// Teacher on student portal -> redirectToLoginForWrongRole
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
					}),
					{ status: 403, headers: { "content-type": "application/json" } },
				),
		) as unknown as typeof fetch;

		const { result: roleResult } = renderHook(() =>
			useQuizAudioStream({ kind: "assignment", id: "ca-1" }),
		);
		act(() => {
			roleResult.current.onAudioError();
		});
		await waitFor(() => {
			expect(redirectWrongRoleMock).toHaveBeenCalledTimes(1);
		});
		expect(roleResult.current.audioError).toBe(false);
	});

	it("auto-heals stale active_student_org_id once on 403 ORG_MISMATCH without resetting retryNonce, and restores ?org= when switching to another org", async () => {
		setActiveStudentOrgId("org-stale");
		globalThis.fetch = vi.fn(
			async () =>
				new Response(
					JSON.stringify({ code: STUDENT_ERROR_CODES.ORG_MISMATCH }),
					{ status: 403, headers: { "content-type": "application/json" } },
				),
		) as unknown as typeof fetch;

		const { result } = renderHook(() =>
			useQuizAudioStream({ kind: "practice", testId: "test-1" }),
		);
		expect(result.current.audioSrc).toBe(
			"https://api.staging.test/api/student/practice/test-1/audio?org=org-stale",
		);

		act(() => {
			result.current.onAudioError();
		});

		await waitFor(() => {
			expect(getActiveStudentOrgId()).toBeNull();
			expect(result.current.audioSrc).toBe(
				"https://api.staging.test/api/student/practice/test-1/audio?_r=1",
			);
		});
		expect(result.current.audioError).toBe(false);
		expect(invalidateQueriesMock).toHaveBeenCalledWith({
			queryKey: ["student", "orgs"],
			exact: true,
		});

		// Second failure on healed URL must NOT loop — surfaces error instead
		act(() => {
			result.current.onAudioError();
		});
		await waitFor(() => {
			expect(result.current.audioError).toBe(true);
		});

		// Switching to a new org resets audioError and includes the new ?org=
		act(() => {
			setActiveStudentOrgId("org-2");
		});
		await waitFor(() => {
			expect(result.current.audioError).toBe(false);
			expect(result.current.audioSrc).toContain("org=org-2");
		});
	});

	it("sets audioError on 404 or probe timeout (separate from cleanup abort) and supports manual retry", async () => {
		// 1) Probe timeout must set audioError=true instead of silently hanging
		globalThis.fetch = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("Aborted", "AbortError"));
					});
				}),
		) as unknown as typeof fetch;

		const { result } = renderHook(() =>
			useQuizAudioStream(
				{ kind: "practice", testId: "test-timeout" },
				{ probeTimeoutMs: 25 },
			),
		);

		act(() => {
			result.current.onAudioError();
		});

		await waitFor(() => {
			expect(result.current.audioError).toBe(true);
		});

		// Manual retry clears error and bumps _r=
		act(() => {
			result.current.retry();
		});
		expect(result.current.audioError).toBe(false);
		expect(result.current.audioSrc).toBe(
			"https://api.staging.test/api/student/practice/test-timeout/audio?_r=1",
		);
	});

	it("hardens legacy blob helpers: fetchPracticeAudioObjectUrl times out and useQuizAudioObjectUrl sets audioError on external AbortError", async () => {
		globalThis.fetch = vi.fn(
			(_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("Timed out", "AbortError"));
					});
				}),
		) as unknown as typeof fetch;

		await expect(
			fetchPracticeAudioObjectUrl("test-hang", undefined, 25),
		).rejects.toThrow();

		// External AbortError (not caused by effect cleanup) must surface audioError instead of hanging loading=true
		globalThis.fetch = vi.fn(async () => {
			throw new DOMException("Network aborted externally", "AbortError");
		}) as unknown as typeof fetch;

		const source: QuizTakeSource = { kind: "practice", testId: "test-abort" };
		const { result } = renderHook(() => useQuizAudioObjectUrl(source));
		await waitFor(() => {
			expect(result.current.audioLoading).toBe(false);
			expect(result.current.audioError).toBe(true);
		});
	});
});
