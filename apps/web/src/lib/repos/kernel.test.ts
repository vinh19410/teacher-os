/**
 * Kernel adapter + command mapping units (Wave 0).
 * Pure functions only — transport lives in the provider.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HttpError, MalformedSnapshotError } from "@/lib/kernel-load-state";
import { createKernelQueryClient } from "@/lib/query-client";
import {
	classifyWriteFailure,
	createKernelCommandBus,
	fetchKernelSnapshot,
	kernelCommand,
	kernelQueryKey,
	kernelQueryOptions,
	mapKernelSnapshot,
	postKernelCommand,
} from "./kernel";

// The real QueryClient brings the real reauth path with it; only the
// auth-client transport (and its env dependency) is mocked away.
vi.mock("@/lib/auth-client", () => ({
	authClient: { signOut: vi.fn().mockResolvedValue(undefined) },
}));

const snapshot: KernelSnapshot = {
	students: [
		{
			id: "st-1",
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			zalo: "0912345678",
			parentName: "Nguyễn Văn Hùng",
			parentPhone: "",
		},
		{
			id: "st-2",
			name: "Vũ Thảo Vy",
			phone: "",
			zalo: "",
			parentName: "",
			parentPhone: "",
		},
	],
	classes: [
		{
			id: "cl-1",
			name: "IELTS Writing",
			level: "Band 7.0",
			type: "ielts",
			skills: ["Writing"],
			mode: "Online",
			syllabusId: "sy-1",
			schedule: "T3 19:00",
			sessionsTotal: 12,
			sessionsDone: 3,
			status: "active",
			startDate: "01/08",
			notes: "ghi chú",
		},
	],
	syllabi: [
		{
			id: "sy-1",
			name: "IELTS Writing 7.0",
			level: "Band 7.0",
			skill: "Writing",
			description: "mô tả",
			totalLessons: 99,
			modules: [
				{
					id: "m-1",
					title: "Module 1",
					description: "",
					lessons: [
						{
							id: "l-1",
							title: "Line chart",
							objectives: "",
							materials: "Cam 15",
							status: "done",
						},
						{
							id: "l-2",
							title: "Bar chart",
							objectives: "so sánh",
							materials: "",
							status: "current",
						},
					],
				},
			],
		},
	],
	enrollments: [
		{
			id: "en-1",
			classId: "cl-1",
			studentId: "st-1",
			createdAt: "2026-08-18T01:00:00.000Z",
		},
	],
	assignments: [
		{
			id: "as-1",
			studentId: "st-1",
			title: "Essay 1 — Education",
			type: "Writing Task 2",
			due: "20/08",
			status: "graded",
			scores: { task: 6.5, coherence: 7, lexical: 6.5, grammar: 6 },
		},
		{
			id: "as-2",
			studentId: "st-2",
			title: "Describe a map",
			type: "Writing Task 1",
			due: "25/08",
			status: "late",
			scores: null,
		},
	],
	packages: [
		{
			id: "pk-old",
			enrollmentId: "en-0",
			classId: "cl-0",
			studentId: "st-1",
			total: 6,
			price: 300000,
			mode: "Offline",
			start: "01/07",
			expiry: "",
			status: "inactive",
			createdAt: "2026-07-01T00:00:00.000Z",
		},
		{
			id: "pk-new",
			enrollmentId: "en-1",
			classId: "cl-1",
			studentId: "st-1",
			total: 12,
			price: 450000,
			mode: "Online",
			start: "01/08",
			expiry: "15/11",
			status: "active",
			createdAt: "2026-08-01T00:00:00.000Z",
		},
	],
	lessons: [],
	invoices: [
		{
			id: "inv-1",
			studentId: "st-1",
			amount: 400000,
			status: "overdue",
			date: "19/08",
			type: "Gói buổi",
			method: "—",
		},
	],
	reports: [
		{
			id: "report-1",
			studentId: "st-1",
			period: "19–25/08",
			sessions: 2,
			status: "sent",
			sent: "25/08 20:00",
			read: "",
		},
	],
	notifs: [
		{
			id: "notif-1",
			text: "Bài đã được chấm",
			time: "25/08 20:01",
			channel: "App",
			dot: "accent",
		},
	],
	commentBank: [
		{ id: "comment-1", tag: "chung", text: "Cần cải thiện coherence" },
	],
};

describe("mapKernelSnapshot", () => {
	const slice = mapKernelSnapshot(snapshot);

	test("student pkg comes from the newest ACTIVE package only", () => {
		const s1 = slice.students.find((s) => s.id === "st-1");
		expect(s1?.pkg).toMatchObject({
			total: 12,
			done: 0,
			remaining: 12,
			price: 450000,
			mode: "Online",
			start: "01/08",
			expiry: "15/11",
		});
	});

	test("classless student maps to the zero package, not undefined", () => {
		const s2 = slice.students.find((s) => s.id === "st-2");
		expect(s2?.pkg).toEqual({
			total: 0,
			done: 0,
			remaining: 0,
			price: 0,
			mode: "Online",
			start: "",
			expiry: "",
		});
	});

	test("class studentIds derive from enrollments, never stored", () => {
		expect(slice.classes[0].studentIds).toEqual(["st-1"]);
	});

	test("class keeps its display fields; sessionsDone derives (stored 3, 0 completed lessons → 0)", () => {
		expect(slice.classes[0]).toMatchObject({
			id: "cl-1",
			syllabusId: "sy-1",
			sessionsDone: 0,
			notes: "ghi chú",
		});
	});

	test("syllabus totalLessons recomputes from the tree, ignoring the stored value", () => {
		expect(slice.syllabi[0].totalLessons).toBe(2);
	});

	test("module description '' maps to undefined like the seed shape", () => {
		expect(slice.syllabi[0].modules[0].description).toBeUndefined();
	});

	test("empty objectives/materials map to '—' like the reducer did", () => {
		const lessons = slice.syllabi[0].modules[0].lessons;
		expect(lessons[0].objectives).toBe("—");
		expect(lessons[1].materials).toBe("—");
	});

	test("avatar derives from initials", () => {
		expect(slice.students[0].avatar).toBe("MA");
	});

	test("invoice DTO maps studentId to the shared display sid", () => {
		expect(slice.invoices).toEqual([
			{
				id: "inv-1",
				sid: "st-1",
				amount: 400000,
				status: "overdue",
				date: "19/08",
				type: "Gói buổi",
				method: "—",
			},
		]);
	});

	test("assignments ride the snapshot into the slice with sid filled", () => {
		expect(slice.assignments).toHaveLength(2);
		expect(slice.assignments[0]).toMatchObject({
			id: "as-1",
			sid: "st-1",
			status: "graded",
			scores: { task: 6.5, coherence: 7, lexical: 6.5, grammar: 6 },
		});
		expect(slice.assignments[1]).toMatchObject({
			id: "as-2",
			sid: "st-2",
			status: "late",
			scores: null,
		});
	});

	test("reporting collections ride the snapshot with display mappings", () => {
		expect(slice.reports).toEqual([
			{
				id: "report-1",
				sid: "st-1",
				period: "19–25/08",
				sessions: 2,
				status: "sent",
				sent: "25/08 20:00",
				read: "",
			},
		]);
		expect(slice.notifs).toEqual(snapshot.notifs);
		expect(slice.commentBank).toEqual(snapshot.commentBank);
	});
});

describe("kernelCommand", () => {
	test("add-student with classId carries it in the body", () => {
		const req = kernelCommand({
			type: "add-student",
			payload: {
				name: "A",
				phone: "090",
				parentName: "",
				total: 10,
				price: 400000,
				mode: "Online",
				classId: "cl-1",
			},
		});
		expect(req.path).toBe("/api/students");
		expect(req.body).toMatchObject({ classId: "cl-1" });
	});

	test("add-student without classId omits the key entirely", () => {
		const req = kernelCommand({
			type: "add-student",
			payload: {
				name: "A",
				phone: "",
				parentName: "",
				total: 10,
				price: 400000,
				mode: "Offline",
			},
		});
		expect(req.body).not.toHaveProperty("classId");
	});

	test("add-class posts the payload as-is", () => {
		const req = kernelCommand({
			type: "add-class",
			payload: {
				name: "L",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing"],
				mode: "Online",
				syllabusId: "",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
				startDate: "",
			},
		});
		expect(req.path).toBe("/api/classes");
		// Wire shape lock: enum id (not the display label) and numeric days.
		expect(req.body).toMatchObject({ type: "ielts" });
		const body = req.body as { schedule: { days: number[] } };
		expect(typeof body.schedule.days[0]).toBe("number");
	});

	test("add-syllabus drops the client id", () => {
		const req = kernelCommand({
			type: "add-syllabus",
			payload: {
				id: "sy-client",
				name: "S",
				level: "",
				skill: "",
				description: "",
				totalLessons: 10,
			},
		});
		expect(req.path).toBe("/api/syllabi");
		expect(req.body).not.toHaveProperty("id");
	});

	test("nested module and lesson routes embed parent ids in the path", () => {
		expect(
			kernelCommand({
				type: "edit-module",
				syllabusId: "sy",
				moduleId: "m",
				payload: { title: "T", description: "" },
			}).path,
		).toBe("/api/syllabi/sy/modules/m");
		expect(
			kernelCommand({
				type: "add-lesson",
				syllabusId: "sy",
				moduleId: "m",
				payload: {
					title: "T",
					objectives: "",
					materials: "",
					status: "upcoming",
				},
			}).path,
		).toBe("/api/syllabi/sy/modules/m/lessons");
		expect(
			kernelCommand({
				type: "edit-lesson",
				syllabusId: "sy",
				moduleId: "m",
				lessonId: "l",
				payload: { title: "T", objectives: "", materials: "", status: "done" },
			}).path,
		).toBe("/api/syllabi/sy/modules/m/lessons/l");
	});

	test("assign-syllabus and update-class-notes target the class subpath", () => {
		expect(
			kernelCommand({
				type: "assign-syllabus",
				classId: "c1",
				syllabusId: "sy1",
			}).path,
		).toBe("/api/classes/c1/assign-syllabus");
		expect(
			kernelCommand({ type: "update-class-notes", classId: "c1", notes: "n" })
				.path,
		).toBe("/api/classes/c1/notes");
	});

	test("check-in and cancel-lesson ride the bus with an exactly-empty body", () => {
		const checkIn = kernelCommand({ type: "check-in", lessonId: "l1" });
		expect(checkIn.path).toBe("/api/lessons/l1/check-in");
		expect(checkIn.body).toEqual({});
		expect(JSON.stringify(checkIn.body)).toBe("{}");

		const cancel = kernelCommand({ type: "cancel-lesson", lessonId: "l1" });
		expect(cancel.path).toBe("/api/lessons/l1/cancel");
		expect(cancel.body).toEqual({});
	});

	test("persistent store actions, including mark-paid, map to kernel requests", () => {
		const markPaid = {
			type: "mark-invoice-paid",
			invoiceId: "i",
			method: "CK",
		} as const satisfies Parameters<typeof kernelCommand>[0];
		expect(kernelCommand(markPaid)).toEqual({
			path: "/api/invoices/i/mark-paid",
			body: { method: "CK" },
		});
	});

	test("grade-assignment posts scores to the assignment grade endpoint", () => {
		const scores = { task: 6.5, coherence: 7, lexical: 6.5, grammar: 6 };
		const req = kernelCommand({
			type: "grade-assignment",
			assignmentId: "as-1",
			scores,
		});
		expect(req.path).toBe("/api/assignments/as-1/grade");
		expect(req.body).toEqual({ scores });
	});

	test("add-comment-bank carries a stable operation id through the kernel write", () => {
		const action = {
			type: "add-comment-bank",
			text: "Nhận xét",
			operationId: "11111111-1111-4111-8111-111111111111",
		} as const;
		expect(kernelCommand(action)).toEqual({
			path: "/api/comment-bank",
			body: {
				text: "Nhận xét",
				operationId: "11111111-1111-4111-8111-111111111111",
			},
		});
	});
});

describe("classifyWriteFailure", () => {
	test("4xx responses are definite failures — the server did not commit", () => {
		for (const status of [400, 401, 403, 404, 409, 422]) {
			expect(
				classifyWriteFailure(new HttpError(status, "POST /api/x failed: ")),
			).toEqual({
				kind: "definite-failure",
				status,
			});
		}
	});

	test("5xx, 408 and 429 are outcome-unknown — a committed write can lose its response", () => {
		for (const status of [500, 502, 503, 504, 408, 429]) {
			expect(
				classifyWriteFailure(new HttpError(status, "POST /api/x failed: ")),
			).toEqual({
				kind: "outcome-unknown",
			});
		}
	});

	test("non-HTTP errors (fetch rejection, AbortSignal timeout) are outcome-unknown", () => {
		expect(classifyWriteFailure(new Error("offline"))).toEqual({
			kind: "outcome-unknown",
		});
		expect(classifyWriteFailure(new TypeError("fetch failed"))).toEqual({
			kind: "outcome-unknown",
		});
	});
});

describe("createKernelCommandBus", () => {
	function deferred<T>() {
		let resolve!: (value: T) => void;
		let reject!: (reason?: unknown) => void;
		const promise = new Promise<T>((res, rej) => {
			resolve = res;
			reject = rej;
		});
		return { promise, resolve, reject };
	}

	async function flush() {
		for (let i = 0; i < 10; i++) {
			await Promise.resolve();
		}
	}

	/**
	 * Observation mechanism: every `deps.refetch()` call pushes one deferred
	 * onto `pendingRefetches`; the array index is the call order. Resolving/
	 * rejecting a deferred drives the bus step by step. Which snapshot the
	 * cache ends up with is asserted by the real-QueryClient integration
	 * tests (see "bus 4-state through a real QueryClient").
	 */
	function makeHarness() {
		const postCalls: string[] = [];
		const refetchCalls: number[] = [];
		const authLostCalls: number[] = [];
		const pendingPosts: Array<ReturnType<typeof deferred<string | undefined>>> =
			[];
		const pendingRefetches: Array<ReturnType<typeof deferred<void>>> = [];
		const bus = createKernelCommandBus({
			postCommand: (action) => {
				postCalls.push(action.type);
				const d = deferred<string | undefined>();
				pendingPosts.push(d);
				return d.promise;
			},
			refetch: () => {
				refetchCalls.push(refetchCalls.length);
				const d = deferred<void>();
				pendingRefetches.push(d);
				return d.promise;
			},
			onAuthLost: () => authLostCalls.push(authLostCalls.length),
		});
		return {
			bus,
			postCalls,
			refetchCalls,
			authLostCalls,
			pendingPosts,
			pendingRefetches,
		};
	}

	const action = (i: number) =>
		({ type: "update-class-notes", classId: `c${i}`, notes: "n" }) as const;

	test("writes serialize: a second POST waits for the first write's refetch to settle", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		const p2 = t.bus.run(action(2));
		expect(t.postCalls).toEqual(["update-class-notes"]); // second not started

		t.pendingPosts[0].resolve("id-1");
		await flush(); // let the bus advance to the refetch
		expect(t.pendingRefetches).toHaveLength(1);
		t.pendingRefetches[0].resolve();
		expect(await p1).toEqual({ kind: "refreshed", id: "id-1" });
		await flush(); // second queued write now starts its POST

		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingRefetches[1].resolve();
		expect(await p2).toEqual({ kind: "refreshed", id: "id-2" });
		expect(t.postCalls).toEqual(["update-class-notes", "update-class-notes"]);
		// Refetch order proves serialization: write 1's refresh, then write 2's.
		expect(t.refetchCalls).toHaveLength(2);
	});

	test("4xx write failure resolves definite-failure and does not block the queue", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		const p2 = t.bus.run(action(2));

		const httpError = new HttpError(409, "POST failed: 409");
		t.pendingPosts[0].reject(httpError);
		expect(await p1).toEqual({
			kind: "definite-failure",
			status: 409,
			error: httpError,
		});
		expect(t.refetchCalls).toHaveLength(0); // nothing to refresh on 4xx
		await flush(); // queued second write now starts its POST

		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingRefetches[0].resolve();
		expect(await p2).toEqual({ kind: "refreshed", id: "id-2" });
	});

	test("transport loss resolves outcome-unknown — replay could duplicate a create", async () => {
		const t = makeHarness();
		const p = t.bus.run(action(1));
		t.pendingPosts[0].reject(new TypeError("fetch failed"));
		const result = await p;
		expect(result.kind).toBe("outcome-unknown");
		expect(t.refetchCalls).toHaveLength(0);
	});

	test("5xx response resolves outcome-unknown — edge 502/504 can follow a committed write", async () => {
		const t = makeHarness();
		const p = t.bus.run(action(1));
		t.pendingPosts[0].reject(new HttpError(504, "POST failed: 504"));
		const result = await p;
		expect(result.kind).toBe("outcome-unknown");
	});

	test("refresh failure resolves committed (id is metadata, not the success signal)", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();

		t.pendingRefetches[0].reject(new Error("flaky"));
		await flush(); // bus advances to the retry refetch
		t.pendingRefetches[1].reject(new Error("flaky again"));
		expect(await p1).toEqual({ kind: "committed", id: "id-1" });
		expect(t.refetchCalls).toHaveLength(2);
	});

	test("refresh succeeds on the retry and resolves refreshed with the id", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();

		t.pendingRefetches[0].reject(new Error("flaky"));
		await flush();
		t.pendingRefetches[1].resolve();
		expect(await p1).toEqual({ kind: "refreshed", id: "id-1" });
	});

	test("comment POST acknowledgement survives refresh failure as committed without replaying", async () => {
		const t = makeHarness();
		const p = t.bus.run({
			type: "add-comment-bank",
			text: "Nhận xét",
			operationId: "11111111-1111-4111-8111-111111111111",
		});
		t.pendingPosts[0].resolve("comment-1");
		await flush();
		t.pendingRefetches[0].reject(new Error("offline"));
		await flush();
		t.pendingRefetches[1].reject(new Error("still offline"));
		// The 2xx acknowledgement is the durable commit boundary for every
		// action now — the caller sees `committed` and keeps the operationId
		// stable instead of replaying the write.
		expect(await p).toEqual({ kind: "committed", id: "comment-1" });
		expect(t.postCalls).toEqual(["add-comment-bank"]);
	});

	test("an identical action dispatched while pending shares the in-flight result (no duplicate POST)", async () => {
		const t = makeHarness();
		const first = t.bus.run(action(1));
		const second = t.bus.run(action(1)); // same payload — double click
		expect(t.postCalls).toEqual(["update-class-notes"]);

		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingRefetches[0].resolve();
		expect(await first).toEqual({ kind: "refreshed", id: "id-1" });
		expect(await second).toEqual({ kind: "refreshed", id: "id-1" });
		expect(t.postCalls).toEqual(["update-class-notes"]); // still one POST
	});

	test("a new identical action after the previous one settled POSTs again", async () => {
		const t = makeHarness();
		const first = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingRefetches[0].resolve();
		await first;

		const second = t.bus.run(action(1));
		await flush();
		expect(t.postCalls).toEqual(["update-class-notes", "update-class-notes"]);
		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingRefetches[1].resolve();
		expect(await second).toEqual({ kind: "refreshed", id: "id-2" });
	});

	test("bus.refresh() refetches and resolves true", async () => {
		const t = makeHarness();
		const applied = t.bus.refresh();
		t.pendingRefetches[0].resolve();
		expect(await applied).toBe(true);
	});

	test("bus.refresh() resolves false when the snapshot is unreachable", async () => {
		const t = makeHarness();
		const applied = t.bus.refresh();
		t.pendingRefetches[0].reject(new Error("offline"));
		expect(await applied).toBe(false);
	});

	test("bus.refresh() fires onAuthLost when the session died mid-reconcile", async () => {
		const t = makeHarness();
		const applied = t.bus.refresh();
		t.pendingRefetches[0].reject(
			new HttpError(401, "GET /api/kernel failed: 401"),
		);
		expect(await applied).toBe(false);
		expect(t.authLostCalls).toHaveLength(1);
	});

	test("bus.refresh() serializes behind an in-flight write so the write's refetch always lands first", async () => {
		const t = makeHarness();
		const write = t.bus.run(action(1));
		const reconcile = t.bus.refresh();
		expect(t.pendingRefetches).toHaveLength(0); // refresh waits for the write

		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingRefetches[0].resolve(); // write's own refetch
		expect(await write).toEqual({ kind: "refreshed", id: "id-1" });

		await flush(); // reconcile refetch starts only now
		t.pendingRefetches[1].resolve();
		expect(await reconcile).toBe(true);
		// Refetch order proves the queue: the write's refresh before the
		// reconcile — the newest snapshot can never be overwritten stale.
		expect(t.refetchCalls).toHaveLength(2);
	});

	test("refresh 401 does not retry: resolves committed once and fires onAuthLost", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();

		t.pendingRefetches[0].reject(
			new HttpError(401, "GET /api/kernel failed: 401"),
		);
		// The write committed before the session died — committed, not failed.
		expect(await p1).toEqual({ kind: "committed", id: "id-1" });
		expect(t.refetchCalls).toHaveLength(1); // no second (pointless) attempt
		expect(t.authLostCalls).toHaveLength(1);
	});

	test("refresh 401 resolves committed with the acknowledged comment id", async () => {
		const t = makeHarness();
		const p = t.bus.run({
			type: "add-comment-bank",
			text: "Nhận xét",
			operationId: "11111111-1111-4111-8111-111111111111",
		});
		t.pendingPosts[0].resolve("comment-1");
		await flush();
		t.pendingRefetches[0].reject(
			new HttpError(401, "GET /api/kernel failed: 401"),
		);
		expect(await p).toEqual({ kind: "committed", id: "comment-1" });
		expect(t.authLostCalls).toHaveLength(1);
	});

	test("write 401 is a definite failure that also fires onAuthLost", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		const unauthorized = new HttpError(401, "POST /api/classes failed: 401");
		t.pendingPosts[0].reject(unauthorized);
		expect(await p1).toEqual({
			kind: "definite-failure",
			status: 401,
			error: unauthorized,
		});
		expect(t.authLostCalls).toHaveLength(1);
	});

	test("non-401 refresh failures never fire onAuthLost", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingRefetches[0].reject(
			new HttpError(503, "GET /api/kernel failed: 503"),
		);
		await flush();
		t.pendingRefetches[1].reject(new Error("offline"));
		expect(await p1).toEqual({ kind: "committed", id: "id-1" });
		expect(t.authLostCalls).toHaveLength(0);
	});
});

/** JSON Response stub shared by the transport and real-QueryClient tests. */
function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("fetchKernelSnapshot transport", () => {
	const realFetch = globalThis.fetch;

	function mockFetch(impl: (url: string) => Promise<Response>) {
		globalThis.fetch = ((input: RequestInfo | URL) =>
			impl(String(input))) as typeof fetch;
	}

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("200 with a valid snapshot resolves it unchanged", async () => {
		mockFetch(async () => jsonResponse(200, snapshot));
		await expect(fetchKernelSnapshot("http://api.local")).resolves.toEqual(
			snapshot,
		);
	});

	test("401/403/5xx throw HttpError carrying the status", async () => {
		for (const status of [401, 403, 500, 503]) {
			mockFetch(async () => jsonResponse(status, { error: "boom" }));
			const error = await fetchKernelSnapshot("http://api.local").catch(
				(e) => e,
			);
			expect(error, `status ${status}`).toBeInstanceOf(HttpError);
			expect((error as HttpError).status).toBe(status);
		}
	});

	test("200 with non-JSON body throws MalformedSnapshotError", async () => {
		mockFetch(
			async () =>
				new Response("<html>proxy error page</html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		);
		await expect(
			fetchKernelSnapshot("http://api.local"),
		).rejects.toBeInstanceOf(MalformedSnapshotError);
	});

	test("200 with a wrong-shape body never becomes a workspace", async () => {
		const wrongShapes: unknown[] = [
			"just a string",
			{ students: [] }, // missing the other collections
			{ ...snapshot, students: "not-an-array" },
			[], // array body, not an object of collections
		];
		for (const body of wrongShapes) {
			mockFetch(async () => jsonResponse(200, body));
			await expect(
				fetchKernelSnapshot("http://api.local"),
				JSON.stringify(body).slice(0, 40),
			).rejects.toBeInstanceOf(MalformedSnapshotError);
		}
	});

	test("timeout rejection propagates so the classifier can map it", async () => {
		mockFetch(async () => {
			throw new DOMException("The operation timed out.", "TimeoutError");
		});
		await expect(fetchKernelSnapshot("http://api.local")).rejects.toMatchObject(
			{
				name: "TimeoutError",
			},
		);
	});

	test("network rejection propagates so the classifier can map it", async () => {
		mockFetch(async () => {
			throw new TypeError("fetch failed");
		});
		await expect(
			fetchKernelSnapshot("http://api.local"),
		).rejects.toBeInstanceOf(TypeError);
	});
});

describe("fetchKernelSnapshot abort composition (queryFn signal)", () => {
	const realFetch = globalThis.fetch;
	const realAny = AbortSignal.any;
	const realTimeout = AbortSignal.timeout;

	afterEach(() => {
		globalThis.fetch = realFetch;
		(AbortSignal as { any?: unknown }).any = realAny;
		(AbortSignal as { timeout?: unknown }).timeout = realTimeout;
	});

	/** A fetch that never settles on its own — only the abort signal speaks. */
	function abortOnlyFetch() {
		globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					// Propagate the REAL abort reason — never a hardcoded error.
					reject(init.signal?.reason);
				});
			})) as typeof fetch;
	}

	test("timeout fires through the composed signal and rejects with TimeoutError", async () => {
		abortOnlyFetch();
		const error = await fetchKernelSnapshot(
			"http://api.local",
			AbortSignal.timeout(50),
		).catch((e: unknown) => e);
		expect((error as Error).name).toBe("TimeoutError");
	});

	test("an external abort wins over the timeout and rejects with AbortError", async () => {
		abortOnlyFetch();
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 10);
		const error = await fetchKernelSnapshot(
			"http://api.local",
			controller.signal,
		).catch((e: unknown) => e);
		expect((error as Error).name).toBe("AbortError");
	});

	test("without AbortSignal.any the timeout-only fallback still aborts (Safari <17.4)", async () => {
		(AbortSignal as { any?: unknown }).any = undefined;
		// The internal 15s guard is stubbed to 50ms so the fallback branch is
		// observable without waiting the real timeout out.
		(AbortSignal as { timeout?: unknown }).timeout = () =>
			realTimeout.call(AbortSignal, 50);
		abortOnlyFetch();
		const controller = new AbortController(); // passed but never composed
		const error = await fetchKernelSnapshot(
			"http://api.local",
			controller.signal,
		).catch((e: unknown) => e);
		expect((error as Error).name).toBe("TimeoutError");
	});
});

describe("bus 4-state through a real QueryClient", () => {
	const realFetch = globalThis.fetch;
	const baseUrl = "http://api.local";
	const action = {
		type: "update-class-notes",
		classId: "c1",
		notes: "n",
	} as const;

	/** POST → created id; GET /api/kernel → swappable response. */
	function mockApi(post: () => Response, get: () => Response) {
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === "POST") return Promise.resolve(post());
			if (String(input).endsWith("/api/kernel")) return Promise.resolve(get());
			return Promise.resolve(new Response(null, { status: 404 }));
		}) as typeof fetch;
	}

	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	function makeBus() {
		const queryClient = createKernelQueryClient();
		const bus = createKernelCommandBus({
			postCommand: (a) => postKernelCommand(baseUrl, a),
			refetch: () =>
				queryClient.refetchQueries(
					{ queryKey: kernelQueryKey, exact: true },
					{ throwOnError: true },
				),
			onAuthLost: () => {},
		});
		return { bus, queryClient };
	}

	test("POST ok + refetch ok → refreshed and the cache holds the fresh snapshot", async () => {
		mockApi(
			() => jsonResponse(200, { id: "id-1" }),
			() => jsonResponse(200, snapshot),
		);
		const { bus, queryClient } = makeBus();
		// Prime ['kernel'] the way the mounted DataProvider does.
		await queryClient.prefetchQuery(kernelQueryOptions(baseUrl));
		expect(await bus.run(action)).toEqual({ kind: "refreshed", id: "id-1" });
		expect(queryClient.getQueryData(kernelQueryKey)).toEqual(snapshot);
	});

	test("POST ok + GET 5xx → committed; 2 GETs total (retry:false, no stacking)", async () => {
		let getCalls = 0;
		let getFails = false;
		mockApi(
			() => jsonResponse(200, { id: "id-1" }),
			() => {
				getCalls += 1;
				return getFails
					? jsonResponse(500, { error: "boom" })
					: jsonResponse(200, snapshot);
			},
		);
		const { bus, queryClient } = makeBus();
		await queryClient.prefetchQuery(kernelQueryOptions(baseUrl));
		const primedSnapshot = queryClient.getQueryData(kernelQueryKey);
		getCalls = 0; // count only the post-write refresh attempts
		getFails = true; // the session's server breaks after the write ack

		expect(await bus.run(action)).toEqual({ kind: "committed", id: "id-1" });
		expect(getCalls).toBe(2); // exactly the bus's 2 refresh attempts
		// A failed refresh must not wipe the snapshot the workspace runs on.
		expect(queryClient.getQueryData(kernelQueryKey)).toEqual(primedSnapshot);
	});

	test("POST 4xx → definite-failure (the server did not commit)", async () => {
		mockApi(
			() => jsonResponse(404, { error: "nope" }),
			() => jsonResponse(200, snapshot),
		);
		const { bus, queryClient } = makeBus();
		await queryClient.prefetchQuery(kernelQueryOptions(baseUrl));
		const result = await bus.run(action);
		expect(result.kind).toBe("definite-failure");
	});

	test("POST 5xx → outcome-unknown (a committed write may have lost its ack)", async () => {
		mockApi(
			() => jsonResponse(504, { error: "edge" }),
			() => jsonResponse(200, snapshot),
		);
		const { bus, queryClient } = makeBus();
		await queryClient.prefetchQuery(kernelQueryOptions(baseUrl));
		const result = await bus.run(action);
		expect(result.kind).toBe("outcome-unknown");
	});

	test("offline: the post-write refetch RUNS and fails — never a paused fake refreshed", async () => {
		const { onlineManager } = await import("@tanstack/react-query");
		let getCalls = 0;
		let getFails = false;
		mockApi(
			() => jsonResponse(200, { id: "id-1" }),
			() => {
				getCalls += 1;
				return getFails
					? jsonResponse(500, { error: "offline" })
					: jsonResponse(200, snapshot);
			},
		);
		const { bus, queryClient } = makeBus();
		await queryClient.prefetchQuery(kernelQueryOptions(baseUrl));
		getCalls = 0;
		getFails = true;
		// networkMode "offlineFirst": the refetch must execute (and fail)
		// instead of pausing — a paused refetchQueries would resolve without
		// fetching and the bus would report a fake "refreshed".
		onlineManager.setOnline(false);
		try {
			expect(await bus.run(action)).toEqual({ kind: "committed", id: "id-1" });
			expect(getCalls).toBe(2);
		} finally {
			onlineManager.setOnline(true);
		}
	});
});
