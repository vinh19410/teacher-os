// @vitest-environment jsdom

import { STUDENT_ERROR_CODES } from "@teacher-os/api/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		signOut: vi.fn(async () => ({})),
	},
}));

import {
	createStudentQueryClient,
	HttpError,
	reauth,
	resetStudentSessionUserForTests,
	studentQueryClient,
	syncStudentSessionUser,
} from "@/lib/query-client";
import {
	createQuizAttemptStore,
	QUIZ_DRAIN_MAX_WAVES,
	quizAttemptMirrorKey,
} from "@/lib/quiz-attempt-store";
import {
	deleteQuizMedia,
	fetchQuizMediaObjectUrl,
	fetchStudentQuizDetail,
	patchQuizAnswer,
	uploadQuizMedia,
} from "@/lib/repos/quiz";
import {
	fetchStudentMe,
	fetchStudentOverview,
	submitOnboarding,
} from "@/lib/repos/student";
import {
	fetchVocabAudioObjectUrl,
	fetchVocabOverview,
	postVocabAnswer,
} from "@/lib/repos/vocab";
import {
	ACTIVE_STUDENT_ORG_KEY,
	ACTIVE_STUDENT_USER_KEY,
	getActiveStudentOrgId,
	setActiveStudentOrgId,
	syncActiveStudentUser,
} from "@/lib/student-org-storage";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function headerValue(
	headers: HeadersInit | undefined,
	name: string,
): string | undefined {
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	if (Array.isArray(headers)) {
		const hit = headers.find(([k]) => k.toLowerCase() === name.toLowerCase());
		return hit?.[1];
	}
	const entry = Object.entries(headers).find(
		([k]) => k.toLowerCase() === name.toLowerCase(),
	);
	return entry?.[1];
}

const VALID_ME_PAYLOAD = {
	user: { id: "u-1", name: "Minh", email: "minh@test.local" },
	student: {
		id: "s-1",
		orgId: "org-valid",
		name: "Minh",
		email: "minh@test.local",
		phone: null,
		examInterest: "ielts",
		currentLevel: "intermediate",
		targetScore: "6.5",
		entryScore: null,
		learningGoals: ["study-abroad"],
		learningGoalsNote: null,
		dailyStudyHours: "1-2",
		onboardingCompletedAt: "2026-11-11T00:00:00.000Z",
	},
};

const VALID_OVERVIEW_PAYLOAD = {
	student: { id: "s-1", name: "Minh" },
	classes: [],
	assignments: [],
};

const VALID_VOCAB_OVERVIEW_PAYLOAD = {
	dueCount: 0,
	nextDueAt: null,
	upcomingCount: 0,
	learnedCount: 0,
	matureCount: 0,
	levelDistribution: [0, 0, 0, 0, 0],
	streak: 0,
	retention: null,
	forecast: [0, 0, 0, 0, 0, 0, 0],
	decks: [],
	suggestions: [],
};

describe("Student Portal stale org self-healing & isolation (#675)", () => {
	const originalFetch = globalThis.fetch;
	const originalCreateObjectURL = URL.createObjectURL;

	beforeEach(() => {
		localStorage.clear();
		URL.createObjectURL = vi.fn(() => "blob:http://localhost:8003/mock-media");
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		URL.createObjectURL = originalCreateObjectURL;
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("Q1: parallel in-flight GET queries (me + overview + vocab) all self-heal and retry once without racing on localStorage", async () => {
		setActiveStudentOrgId("org-stale");
		const callsByPath = new Map<string, number>();

		globalThis.fetch = vi.fn(async (input, init) => {
			const url = new URL(String(input));
			const count = (callsByPath.get(url.pathname) ?? 0) + 1;
			callsByPath.set(url.pathname, count);
			const orgHeader = headerValue(init?.headers, "x-student-org-id");

			// Stagger settlement across microtasks to exercise the parallel race.
			if (url.pathname.endsWith("/overview")) {
				await Promise.resolve();
				await Promise.resolve();
			} else if (url.pathname.endsWith("/vocab/overview")) {
				await Promise.resolve();
			}

			if (orgHeader === "org-stale") {
				return jsonResponse(403, {
					error: STUDENT_ERROR_CODES.ORG_MISMATCH,
					code: STUDENT_ERROR_CODES.ORG_MISMATCH,
				});
			}

			if (url.pathname === "/api/student/me") {
				return jsonResponse(200, VALID_ME_PAYLOAD);
			}
			if (url.pathname === "/api/student/overview") {
				return jsonResponse(200, VALID_OVERVIEW_PAYLOAD);
			}
			if (url.pathname === "/api/student/vocab/overview") {
				return jsonResponse(200, VALID_VOCAB_OVERVIEW_PAYLOAD);
			}
			return jsonResponse(200, []);
		});

		const client = createStudentQueryClient();
		const [me, overview, vocab] = await Promise.all([
			client.fetchQuery({
				queryKey: ["student", "me"],
				queryFn: fetchStudentMe,
			}),
			client.fetchQuery({
				queryKey: ["student", "overview"],
				queryFn: fetchStudentOverview,
			}),
			client.fetchQuery({
				queryKey: ["student", "vocab-overview"],
				queryFn: fetchVocabOverview,
			}),
		]);

		expect(me.student.orgId).toBe("org-valid");
		expect(overview.classes).toEqual([]);
		expect(vocab.dueCount).toBe(0);
		expect(getActiveStudentOrgId()).toBeNull();
		expect(callsByPath.get("/api/student/me")).toBe(2);
		expect(callsByPath.get("/api/student/overview")).toBe(2);
		expect(callsByPath.get("/api/student/vocab/overview")).toBe(2);
	});

	it("Q2: does not retry when no sentOrgId was transmitted or when error is NOT_LINKED / 404", async () => {
		const client = createStudentQueryClient();
		let calls = 0;

		globalThis.fetch = vi.fn(async () => {
			calls += 1;
			return jsonResponse(403, {
				error: STUDENT_ERROR_CODES.ORG_MISMATCH,
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
			});
		});

		await expect(
			client.fetchQuery({
				queryKey: ["student", "me", "no-org"],
				queryFn: fetchStudentMe,
			}),
		).rejects.toMatchObject({
			status: 403,
			code: STUDENT_ERROR_CODES.ORG_MISMATCH,
		});
		expect(calls).toBe(1);

		setActiveStudentOrgId("org-1");
		calls = 0;
		globalThis.fetch = vi.fn(async () => {
			calls += 1;
			return jsonResponse(403, {
				error: STUDENT_ERROR_CODES.NOT_LINKED,
				code: STUDENT_ERROR_CODES.NOT_LINKED,
			});
		});
		await expect(
			client.fetchQuery({
				queryKey: ["student", "me", "not-linked"],
				queryFn: fetchStudentMe,
			}),
		).rejects.toMatchObject({
			status: 403,
			code: STUDENT_ERROR_CODES.NOT_LINKED,
		});
		expect(calls).toBe(1);
	});

	it("U1: syncActiveStudentUser isolates active_student_org_id across user changes and session expiry", () => {
		syncActiveStudentUser("user-a");
		setActiveStudentOrgId("org-a");
		expect(getActiveStudentOrgId()).toBe("org-a");

		// Same user keeps chosen org
		syncActiveStudentUser("user-a");
		expect(getActiveStudentOrgId()).toBe("org-a");

		// Switching to user-b clears user-a's org immediately
		syncActiveStudentUser("user-b");
		expect(getActiveStudentOrgId()).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBe("user-b");

		setActiveStudentOrgId("org-b");
		// Session expiry (null) clears both keys
		syncActiveStudentUser(null);
		expect(getActiveStudentOrgId()).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_ORG_KEY)).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBeNull();
	});

	it("M1: MutationCache clears stale org and invalidates ['student'] WITHOUT auto-retrying writes, and submitOnboarding honors pinned orgId", async () => {
		setActiveStudentOrgId("org-stale");
		const seenOrgHeaders: Array<string | undefined> = [];

		globalThis.fetch = vi.fn(async (_input, init) => {
			seenOrgHeaders.push(headerValue(init?.headers, "x-student-org-id"));
			return jsonResponse(403, {
				error: STUDENT_ERROR_CODES.ORG_MISMATCH,
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
			});
		});

		const client = createStudentQueryClient();
		const invalidateSpy = vi.spyOn(client, "invalidateQueries");
		const onboardingPayload = {
			examInterest: "ielts" as const,
			currentLevel: "intermediate" as const,
			targetScore: "6.5",
			learningGoals: ["study-abroad" as const],
			dailyStudyHours: "1-2" as const,
		};

		const mutation = client.getMutationCache().build(client, {
			mutationFn: (vars: typeof onboardingPayload) =>
				submitOnboarding(vars, "org-stale"),
		});

		await expect(mutation.execute(onboardingPayload)).rejects.toMatchObject({
			status: 403,
			code: STUDENT_ERROR_CODES.ORG_MISMATCH,
		});
		expect(seenOrgHeaders).toEqual(["org-stale"]);
		expect(getActiveStudentOrgId()).toBeNull();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["student"] });

		// Immediate second click with pinned orgId still sends "org-stale", never silently mutating rows[0]
		await expect(
			submitOnboarding(onboardingPayload, "org-stale"),
		).rejects.toMatchObject({
			status: 403,
			code: STUDENT_ERROR_CODES.ORG_MISMATCH,
		});
		expect(seenOrgHeaders).toEqual(["org-stale", "org-stale"]);
	});

	it("R1: reauth() clears active_student_org_id and user key before redirecting to /login", () => {
		const assignSpy = vi.fn();
		vi.stubGlobal("location", {
			pathname: "/classes",
			search: "",
			hash: "",
			assign: assignSpy,
		});
		syncActiveStudentUser("user-a");
		setActiveStudentOrgId("org-stale");

		reauth();
		expect(getActiveStudentOrgId()).toBeNull();
		expect(localStorage.getItem(ACTIVE_STUDENT_USER_KEY)).toBeNull();
		expect(assignSpy).toHaveBeenCalledTimes(1);
	});

	it("B1: blob GET helpers (fetchQuizMediaObjectUrl & fetchVocabAudioObjectUrl) retry once on stale org and reject HTML/SVG MIME", async () => {
		setActiveStudentOrgId("org-stale");
		let quizCalls = 0;
		globalThis.fetch = vi.fn(async (_input, init) => {
			quizCalls += 1;
			if (headerValue(init?.headers, "x-student-org-id") === "org-stale") {
				return jsonResponse(403, { code: STUDENT_ERROR_CODES.ORG_MISMATCH });
			}
			return new Response(new Uint8Array([1, 2, 3]), {
				status: 200,
				headers: { "Content-Type": "audio/mpeg" },
			});
		});

		const quizBlobUrl = await fetchQuizMediaObjectUrl("att-1");
		expect(quizBlobUrl).toContain("blob:");
		expect(quizCalls).toBe(2);
		expect(getActiveStudentOrgId()).toBeNull();

		setActiveStudentOrgId("org-stale");
		let vocabCalls = 0;
		globalThis.fetch = vi.fn(async (_input, init) => {
			vocabCalls += 1;
			if (headerValue(init?.headers, "x-student-org-id") === "org-stale") {
				return jsonResponse(403, { code: STUDENT_ERROR_CODES.ORG_MISMATCH });
			}
			return new Response(new Uint8Array([4, 5, 6]), {
				status: 200,
				headers: { "Content-Type": "Audio/MPEG; codecs=mp3" },
			});
		});

		const vocabBlobUrl = await fetchVocabAudioObjectUrl("word-1");
		expect(vocabBlobUrl).toContain("blob:");
		expect(vocabCalls).toBe(2);
		expect(getActiveStudentOrgId()).toBeNull();

		// Dangerous text/html MIME must be rejected before URL.createObjectURL
		const createUrlSpy = vi.fn(() => "blob:evil");
		URL.createObjectURL = createUrlSpy;
		globalThis.fetch = vi.fn(
			async () =>
				new Response("<script>alert(1)</script>", {
					status: 200,
					headers: { "Content-Type": "text/html" },
				}),
		);
		await expect(fetchVocabAudioObjectUrl("word-html")).rejects.toBeInstanceOf(
			HttpError,
		);
		expect(createUrlSpy).not.toHaveBeenCalled();
	});

	it("W1: imperative writes (postVocabAnswer, patchQuizAnswer, deleteQuizMedia, uploadQuizMedia) clear stale org once and never auto-retry", async () => {
		const invalidateSpy = vi.spyOn(studentQueryClient, "invalidateQueries");

		for (const runWrite of [
			() =>
				postVocabAnswer({
					cardId: "c-1",
					correct: true,
					durationMs: 1200,
					clientLogId: "00000000-0000-4000-8000-000000000001",
				}),
			() => patchQuizAnswer("att-1", 0, "A"),
			() => deleteQuizMedia("att-1"),
		]) {
			setActiveStudentOrgId("org-stale");
			let calls = 0;
			globalThis.fetch = vi.fn(async () => {
				calls += 1;
				return jsonResponse(403, {
					error: STUDENT_ERROR_CODES.ORG_MISMATCH,
					code: STUDENT_ERROR_CODES.ORG_MISMATCH,
				});
			});

			await expect(runWrite()).rejects.toMatchObject({
				status: 403,
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
			});
			expect(calls).toBe(1);
			expect(getActiveStudentOrgId()).toBeNull();
		}

		// XMLHttpRequest uploadQuizMedia path
		setActiveStudentOrgId("org-stale");
		let xhrSendCalls = 0;
		class MockXHR {
			status = 403;
			responseText = JSON.stringify({
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
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
				xhrSendCalls += 1;
				this.onload?.();
			}
		}
		vi.stubGlobal("XMLHttpRequest", MockXHR);

		await expect(
			uploadQuizMedia(
				"att-1",
				new File(["abc"], "ans.mp3", { type: "audio/mpeg" }),
				"audio/mpeg",
			),
		).rejects.toMatchObject({
			status: 403,
			code: STUDENT_ERROR_CODES.ORG_MISMATCH,
		});
		expect(xhrSendCalls).toBe(1);
		expect(getActiveStudentOrgId()).toBeNull();
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["student"] });
	});

	it("U2: syncStudentSessionUser clears in-memory QueryClient cache when switching users or expiring session (#675 review F2)", () => {
		resetStudentSessionUserForTests();
		const client = createStudentQueryClient();
		syncStudentSessionUser("user-a", client);
		client.setQueryData(["student", "me"], VALID_ME_PAYLOAD);
		expect(client.getQueryData(["student", "me"])).toEqual(VALID_ME_PAYLOAD);

		// Same user navigation keeps warm cache
		syncStudentSessionUser("user-a", client);
		expect(client.getQueryData(["student", "me"])).toEqual(VALID_ME_PAYLOAD);

		// Switching to user-b clears user-a's cached data
		syncStudentSessionUser("user-b", client);
		expect(client.getQueryData(["student", "me"])).toBeUndefined();

		client.setQueryData(["student", "me"], VALID_ME_PAYLOAD);
		// Session expiry clears cache too
		syncStudentSessionUser(null, client);
		expect(client.getQueryData(["student", "me"])).toBeUndefined();
		resetStudentSessionUserForTests();
	});

	it("Q3: fetchStudentQuizDetail self-heals on GET 403 STUDENT_ORG_MISMATCH in 2 calls without 3rd QueryClient retry (#675 review F4)", async () => {
		setActiveStudentOrgId("org-stale");
		const seenHeaders: Array<string | undefined> = [];
		globalThis.fetch = vi.fn(async (_input, init) => {
			const h = headerValue(init?.headers, "x-student-org-id");
			seenHeaders.push(h);
			if (h === "org-stale") {
				return jsonResponse(403, { code: STUDENT_ERROR_CODES.ORG_MISMATCH });
			}
			return jsonResponse(404, { code: "NOT_FOUND" });
		});

		const client = createStudentQueryClient();
		await expect(
			client.fetchQuery({
				queryKey: ["student", "quiz", "assignment", "a-1"],
				queryFn: () =>
					fetchStudentQuizDetail({ kind: "assignment", id: "a-1" }),
			}),
		).rejects.toMatchObject({ status: 404 });
		expect(seenHeaders).toEqual(["org-stale", undefined]);
		expect(getActiveStudentOrgId()).toBeNull();
	});

	it("D1: QuizAttemptStore halts on STUDENT_ORG_MISMATCH (no follow-up PATCH on typing/dispose/drain, mirror preserved) while keeping QUIZ_DRAIN_MAX_WAVES for ordinary 400 (#675 review F3)", async () => {
		vi.useFakeTimers();
		try {
			let mismatchCalls = 0;
			const onOrgMismatch = vi.fn();
			const mismatchStore = createQuizAttemptStore({
				attemptId: "att-mismatch",
				serverAnswers: {},
				onOrgMismatch,
				send: async () => {
					mismatchCalls += 1;
					throw new HttpError(403, "Forbidden", {
						code: STUDENT_ERROR_CODES.ORG_MISMATCH,
						sentOrgId: "org-stale",
					});
				},
			});
			mismatchStore.setAnswer(0, "Paris");
			await expect(mismatchStore.drain()).rejects.toMatchObject({
				status: 403,
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
			});
			expect(mismatchCalls).toBe(1);
			expect(mismatchStore.getHalted()).toBe("org_mismatch");
			expect(onOrgMismatch).toHaveBeenCalledTimes(1);

			// Typing further answers, advancing debounce timers, calling drain() again, and dispose()
			// must NEVER send an unheadered PATCH to rows[0], while preserving the localStorage mirror!
			mismatchStore.setAnswer(1, "London");
			await vi.advanceTimersByTimeAsync(2000);
			await expect(mismatchStore.drain()).rejects.toMatchObject({
				status: 403,
				code: STUDENT_ERROR_CODES.ORG_MISMATCH,
			});
			mismatchStore.dispose();
			expect(mismatchCalls).toBe(1);
			const mirror = localStorage.getItem(quizAttemptMirrorKey("att-mismatch"));
			expect(mirror).not.toBeNull();
			expect(JSON.parse(mirror as string).answers).toEqual({
				"0": "Paris",
				"1": "London",
			});

			let badRequestCalls = 0;
			const badRequestStore = createQuizAttemptStore({
				attemptId: "att-400",
				serverAnswers: {},
				send: async () => {
					badRequestCalls += 1;
					throw new HttpError(400, "Bad request");
				},
			});
			badRequestStore.setAnswer(0, "Poison");
			await expect(badRequestStore.drain()).rejects.toThrow("Bad request");
			expect(badRequestCalls).toBe(QUIZ_DRAIN_MAX_WAVES);
		} finally {
			vi.useRealTimers();
		}
	});
});
