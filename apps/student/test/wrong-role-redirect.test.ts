// @vitest-environment jsdom

import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
	signOut: vi.fn(async () => ({})),
	clearSessionCache: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: authMocks.signOut,
		clearSessionCache: authMocks.clearSessionCache,
	},
}));

import {
	createStudentQueryClient,
	HttpError,
	isTeacherOnStudentPortalError,
	reauth,
	redirectToLoginForWrongRole,
	resetRedirectGuardsForTests,
	resetStudentSessionUserForTests,
	studentQueryClient,
	syncStudentSessionUser,
} from "@/lib/query-client";
import {
	createQuizAttemptStore,
	quizAttemptMirrorKey,
} from "@/lib/quiz-attempt-store";
import { uploadStudentPlacementSpeaking } from "@/lib/repos/placement-test";
import { patchQuizAnswer, uploadQuizMedia } from "@/lib/repos/quiz";
import { fetchLessonMaterialBlobUrl } from "@/lib/repos/student";
import { fetchVocabAudioObjectUrl, postVocabAnswer } from "@/lib/repos/vocab";
import {
	ACTIVE_STUDENT_USER_KEY,
	getActiveStudentOrgId,
	setActiveStudentOrgId,
	syncActiveStudentUser,
} from "@/lib/student-org-storage";

describe("wrong-role 403 ACCOUNT_TEACHER_ROLE redirect handling", () => {
	const assignSpy = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		resetStudentSessionUserForTests();
		resetRedirectGuardsForTests();
		studentQueryClient.clear();
		vi.stubGlobal("location", {
			pathname: "/student/classes/cls-1",
			search: "?tab=lessons",
			hash: "#top",
			assign: assignSpy,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		localStorage.clear();
		resetStudentSessionUserForTests();
		resetRedirectGuardsForTests();
	});

	it("identifies only 403 ACCOUNT_TEACHER_ROLE errors", () => {
		expect(
			isTeacherOnStudentPortalError(
				new HttpError(403, "Forbidden", {
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				}),
			),
		).toBe(true);
		expect(
			isTeacherOnStudentPortalError(
				new HttpError(401, "Unauthorized", {
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				}),
			),
		).toBe(false);
		expect(
			isTeacherOnStudentPortalError(
				new HttpError(403, "Forbidden", {
					code: STUDENT_ERROR_CODES.NOT_LINKED,
				}),
			),
		).toBe(false);
		expect(isTeacherOnStudentPortalError(new Error("boom"))).toBe(false);
	});

	it("redirects to root dispatcher / on QueryCache 403 ACCOUNT_TEACHER_ROLE, clears local state, and does not signOut", async () => {
		const client = createStudentQueryClient();
		syncStudentSessionUser("u-prev", client);
		setActiveStudentOrgId("org-1");
		client.setQueryData(["student", "overview"], { cached: true });

		await expect(
			client.fetchQuery({
				queryKey: ["student", "me"],
				queryFn: async () => {
					throw new HttpError(403, "Forbidden", {
						code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
					});
				},
			}),
		).rejects.toBeInstanceOf(HttpError);

		expect(assignSpy).toHaveBeenCalledTimes(1);
		expect(assignSpy).toHaveBeenCalledWith("/");
		expect(getActiveStudentOrgId()).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBeNull();
		expect(client.getQueryData(["student", "overview"])).toBeUndefined();
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("redirects to root dispatcher / on MutationCache 403 ACCOUNT_TEACHER_ROLE without calling signOut", async () => {
		syncActiveStudentUser("u-prev");
		setActiveStudentOrgId("org-1");

		const client = createStudentQueryClient();
		const mutation = client.getMutationCache().build(client, {
			mutationFn: async () => {
				throw new HttpError(403, "Forbidden", {
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				});
			},
		});

		await expect(mutation.execute(undefined)).rejects.toBeInstanceOf(HttpError);

		expect(assignSpy).toHaveBeenCalledTimes(1);
		expect(assignSpy).toHaveBeenCalledWith("/");
		expect(getActiveStudentOrgId()).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBeNull();
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("enforces single-flight redirect guard and resets only on persisted pageshow", () => {
		redirectToLoginForWrongRole();
		redirectToLoginForWrongRole();
		expect(assignSpy).toHaveBeenCalledTimes(1);

		// Non-persisted pageshow should not reset the guard.
		const normalEvent = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(normalEvent, "persisted", { value: false });
		window.dispatchEvent(normalEvent);
		redirectToLoginForWrongRole();
		expect(assignSpy).toHaveBeenCalledTimes(1);

		// Persisted bfcache restore resets the guard.
		const persistedEvent = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(persistedEvent, "persisted", { value: true });
		window.dispatchEvent(persistedEvent);
		redirectToLoginForWrongRole();
		expect(assignSpy).toHaveBeenCalledTimes(2);
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("does not redirect on other 403 student error codes", async () => {
		const client = createStudentQueryClient();

		for (const code of [
			STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
			STUDENT_ERROR_CODES.NOT_LINKED,
			STUDENT_ERROR_CODES.AMBIGUOUS,
		]) {
			await expect(
				client.fetchQuery({
					queryKey: ["student", "me", code],
					queryFn: async () => {
						throw new HttpError(403, "Forbidden", { code });
					},
				}),
			).rejects.toMatchObject({ status: 403, code });
		}

		expect(assignSpy).not.toHaveBeenCalled();
		expect(authMocks.clearSessionCache).not.toHaveBeenCalled();
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("preserves STUDENT_ORG_MISMATCH retry and heal behavior without redirecting", async () => {
		setActiveStudentOrgId("org-stale");
		const client = createStudentQueryClient();
		let calls = 0;

		const result = await client.fetchQuery({
			queryKey: ["student", "me", "org-heal"],
			queryFn: async () => {
				calls += 1;
				if (calls === 1) {
					throw new HttpError(403, "Org mismatch", {
						code: STUDENT_ERROR_CODES.ORG_MISMATCH,
						sentOrgId: "org-stale",
					});
				}
				return { ok: true };
			},
		});

		expect(result).toEqual({ ok: true });
		expect(calls).toBe(2);
		expect(getActiveStudentOrgId()).toBeNull();
		expect(assignSpy).not.toHaveBeenCalled();
		expect(authMocks.signOut).not.toHaveBeenCalled();
	});

	it("clears caches without reloading when already on / or /login", () => {
		for (const pathname of ["/", "/login"]) {
			resetRedirectGuardsForTests();
			assignSpy.mockClear();
			authMocks.clearSessionCache.mockClear();

			const client = createStudentQueryClient();
			client.setQueryData(["student", "me"], { stale: true });
			setActiveStudentOrgId("org-1");
			vi.stubGlobal("location", {
				pathname,
				search: "",
				hash: "",
				assign: assignSpy,
			});

			redirectToLoginForWrongRole(client);

			expect(assignSpy).not.toHaveBeenCalled();
			expect(getActiveStudentOrgId()).toBeNull();
			expect(client.getQueryData(["student", "me"])).toBeUndefined();
			expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
			expect(authMocks.signOut).not.toHaveBeenCalled();
		}
	});

	it("reauth() preserves /student/... returnUrl and defaults non-student paths to /student", async () => {
		reauth();
		expect(authMocks.signOut).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => {
			expect(assignSpy).toHaveBeenCalledWith(
				`/login?returnUrl=${encodeURIComponent("/student/classes/cls-1?tab=lessons#top")}`,
			);
		});

		resetRedirectGuardsForTests();
		assignSpy.mockClear();
		vi.stubGlobal("location", {
			pathname: "/",
			search: "",
			hash: "",
			assign: assignSpy,
		});

		reauth();
		await vi.waitFor(() => {
			expect(assignSpy).toHaveBeenCalledWith(
				`/login?returnUrl=${encodeURIComponent("/student")}`,
			);
		});
	});

	it("reauth() calls signOut synchronously, waits for settle/timeout/reject, and cancels on persisted pageshow", async () => {
		let resolveSignOut!: () => void;
		authMocks.signOut.mockImplementationOnce(
			() =>
				new Promise<Record<string, never>>((resolve) => {
					resolveSignOut = () => resolve({});
				}),
		);

		reauth();
		reauth();
		expect(authMocks.signOut).toHaveBeenCalledTimes(1);
		expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
		expect(assignSpy).not.toHaveBeenCalled();

		resolveSignOut();
		await vi.waitFor(() => {
			expect(assignSpy).toHaveBeenCalledTimes(1);
		});

		// Timeout fallback at 2000ms when signOut hangs
		resetRedirectGuardsForTests();
		assignSpy.mockClear();
		authMocks.signOut.mockClear();
		vi.useFakeTimers();
		try {
			authMocks.signOut.mockImplementationOnce(() => new Promise(() => {}));
			reauth();
			expect(authMocks.signOut).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1_999);
			expect(assignSpy).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(assignSpy).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}

		// Reject fallback
		resetRedirectGuardsForTests();
		assignSpy.mockClear();
		authMocks.signOut.mockRejectedValueOnce(new Error("offline"));
		reauth();
		await vi.waitFor(() => {
			expect(assignSpy).toHaveBeenCalledTimes(1);
		});

		// bfcache persisted pageshow cancels pending continuation
		resetRedirectGuardsForTests();
		assignSpy.mockClear();
		let resolveStale!: () => void;
		authMocks.signOut.mockImplementationOnce(
			() =>
				new Promise<Record<string, never>>((resolve) => {
					resolveStale = () => resolve({});
				}),
		);
		reauth();
		const persistedEvent = new Event("pageshow") as PageTransitionEvent;
		Object.defineProperty(persistedEvent, "persisted", { value: true });
		window.dispatchEvent(persistedEvent);

		resolveStale();
		await Promise.resolve();
		await Promise.resolve();
		expect(assignSpy).not.toHaveBeenCalled();
	});

	it("redirects to /login from imperative repo fetch and XHR calls on 403 ACCOUNT_TEACHER_ROLE without signOut", async () => {
		const originalFetch = globalThis.fetch;
		const wrongRoleResponse = () =>
			new Response(
				JSON.stringify({
					error: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				}),
				{ status: 403, headers: { "Content-Type": "application/json" } },
			);

		try {
			globalThis.fetch = vi.fn(async () => wrongRoleResponse());

			const cases: Array<() => Promise<unknown>> = [
				() => fetchLessonMaterialBlobUrl("cls-1", "2026-11-19", "mat-1"),
				() =>
					postVocabAnswer({
						cardId: "card-1",
						correct: true,
						durationMs: 1000,
						clientLogId: "00000000-0000-4000-8000-000000000001",
					}),
				() => fetchVocabAudioObjectUrl("word-1"),
				() => patchQuizAnswer("att-1", 0, "A"),
				() =>
					uploadStudentPlacementSpeaking(
						"sub-1",
						"tok-1",
						new Blob(["audio"], { type: "audio/webm" }),
						"audio/webm",
						5,
					),
			];

			for (const runCase of cases) {
				resetRedirectGuardsForTests();
				assignSpy.mockClear();
				authMocks.clearSessionCache.mockClear();

				await expect(runCase()).rejects.toMatchObject({
					status: 403,
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				});
				expect(assignSpy).toHaveBeenCalledTimes(1);
				expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
				expect(authMocks.signOut).not.toHaveBeenCalled();
			}

			// XHR upload path in quiz repo
			resetRedirectGuardsForTests();
			assignSpy.mockClear();
			authMocks.clearSessionCache.mockClear();

			class MockWrongRoleXHR {
				status = 403;
				responseText = JSON.stringify({
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				});
				withCredentials = false;
				upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
				onload: (() => void) | null = null;
				onerror: (() => void) | null = null;
				onabort: (() => void) | null = null;
				open() {}
				setRequestHeader() {}
				abort() {}
				send() {
					this.onload?.();
				}
			}
			vi.stubGlobal("XMLHttpRequest", MockWrongRoleXHR);

			await expect(
				uploadQuizMedia(
					"att-1",
					new File(["abc"], "ans.mp3", { type: "audio/mpeg" }),
					"audio/mpeg",
				),
			).rejects.toMatchObject({
				status: 403,
				code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
			});
			expect(assignSpy).toHaveBeenCalledTimes(1);
			expect(authMocks.clearSessionCache).toHaveBeenCalledTimes(1);
			expect(authMocks.signOut).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("halts QuizAttemptStore preserving mirror and redirects without signOut on 403 ACCOUNT_TEACHER_ROLE", async () => {
		const onAuthError = vi.fn();
		const store = createQuizAttemptStore({
			attemptId: "att-wrong-role",
			serverAnswers: {},
			onAuthError,
			send: async () => {
				throw new HttpError(403, "Forbidden", {
					code: ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
				});
			},
		});

		store.setAnswer(0, "Saved answer");
		await store.drain();

		expect(store.getHalted()).toBe("auth");
		expect(onAuthError).not.toHaveBeenCalled();
		expect(assignSpy).toHaveBeenCalledTimes(1);
		expect(authMocks.signOut).not.toHaveBeenCalled();
		const mirror = localStorage.getItem(quizAttemptMirrorKey("att-wrong-role"));
		expect(mirror).not.toBeNull();
		expect(JSON.parse(mirror as string).answers).toEqual({
			"0": "Saved answer",
		});
		store.dispose();
	});
});
