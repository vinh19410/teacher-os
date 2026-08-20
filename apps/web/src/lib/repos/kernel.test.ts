/**
 * Kernel adapter + command mapping units (Wave 0).
 * Pure functions only — transport lives in the provider.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import {
	classifyWriteFailure,
	createKernelCommandBus,
	KernelHttpError,
	kernelCommand,
	mapKernelSnapshot,
} from "./kernel";

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
			skill: "Writing",
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
				level: "Band 7.0",
				skill: "Writing",
				mode: "Online",
				syllabusId: "",
				schedule: "",
				sessionsTotal: 12,
				startDate: "",
			},
		});
		expect(req.path).toBe("/api/classes");
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
				classifyWriteFailure(new KernelHttpError(status, "/api/x")),
			).toEqual({
				kind: "definite-failure",
				status,
			});
		}
	});

	test("5xx, 408 and 429 are outcome-unknown — a committed write can lose its response", () => {
		for (const status of [500, 502, 503, 504, 408, 429]) {
			expect(
				classifyWriteFailure(new KernelHttpError(status, "/api/x")),
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
	type Fn = () => void;

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

	function makeHarness() {
		const postCalls: string[] = [];
		const fetchCalls: Fn[] = [];
		const applied: number[] = [];
		const pendingPosts: Array<ReturnType<typeof deferred<string | undefined>>> =
			[];
		const pendingFetches: Array<ReturnType<typeof deferred<KernelSnapshot>>> =
			[];
		const bus = createKernelCommandBus({
			postCommand: (action) => {
				postCalls.push(action.type);
				const d = deferred<string | undefined>();
				pendingPosts.push(d);
				return d.promise;
			},
			fetchSnapshot: () => {
				fetchCalls.push(() => undefined);
				const d = deferred<KernelSnapshot>();
				pendingFetches.push(d);
				return d.promise;
			},
			applySnapshot: (snapshot) =>
				applied.push((snapshot as unknown as { seq: number }).seq),
		});
		return {
			bus,
			postCalls,
			fetchCalls,
			applied,
			pendingPosts,
			pendingFetches,
		};
	}

	const action = (i: number) =>
		({ type: "update-class-notes", classId: `c${i}`, notes: "n" }) as const;

	test("writes serialize: a second POST waits for the first write's apply", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		const p2 = t.bus.run(action(2));
		expect(t.postCalls).toEqual(["update-class-notes"]); // second not started

		t.pendingPosts[0].resolve("id-1");
		await flush(); // let the bus advance to fetchSnapshot
		t.pendingFetches[0].resolve({ seq: 1 } as never);
		expect(await p1).toEqual({ kind: "refreshed", id: "id-1" });
		expect(t.applied).toEqual([1]);
		await flush(); // second queued write now starts its POST

		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingFetches[1].resolve({ seq: 2 } as never);
		expect(await p2).toEqual({ kind: "refreshed", id: "id-2" });
		expect(t.applied).toEqual([1, 2]);
		expect(t.postCalls).toEqual(["update-class-notes", "update-class-notes"]);
	});

	test("4xx write failure resolves definite-failure and does not block the queue", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		const p2 = t.bus.run(action(2));

		const httpError = new KernelHttpError(409, "/api/classes/c1/notes");
		t.pendingPosts[0].reject(httpError);
		expect(await p1).toEqual({
			kind: "definite-failure",
			status: 409,
			error: httpError,
		});
		expect(t.applied).toEqual([]);
		await flush(); // queued second write now starts its POST

		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingFetches[0].resolve({ seq: 2 } as never);
		expect(await p2).toEqual({ kind: "refreshed", id: "id-2" });
		expect(t.applied).toEqual([2]);
	});

	test("transport loss resolves outcome-unknown — replay could duplicate a create", async () => {
		const t = makeHarness();
		const p = t.bus.run(action(1));
		t.pendingPosts[0].reject(new TypeError("fetch failed"));
		const result = await p;
		expect(result.kind).toBe("outcome-unknown");
		expect(t.applied).toEqual([]);
	});

	test("5xx response resolves outcome-unknown — edge 502/504 can follow a committed write", async () => {
		const t = makeHarness();
		const p = t.bus.run(action(1));
		t.pendingPosts[0].reject(new KernelHttpError(504, "/api/classes"));
		const result = await p;
		expect(result.kind).toBe("outcome-unknown");
	});

	test("refresh failure resolves committed (id is metadata, not the success signal)", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();

		t.pendingFetches[0].reject(new Error("flaky"));
		await flush(); // bus advances to the retry fetch
		t.pendingFetches[1].reject(new Error("flaky again"));
		expect(await p1).toEqual({ kind: "committed", id: "id-1" });
		expect(t.applied).toEqual([]);
	});

	test("refresh succeeds on the retry and resolves refreshed with the id", async () => {
		const t = makeHarness();
		const p1 = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();

		t.pendingFetches[0].reject(new Error("flaky"));
		await flush();
		t.pendingFetches[1].resolve({ seq: 7 } as never);
		expect(await p1).toEqual({ kind: "refreshed", id: "id-1" });
		expect(t.applied).toEqual([7]);
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
		t.pendingFetches[0].reject(new Error("offline"));
		await flush();
		t.pendingFetches[1].reject(new Error("still offline"));
		// The 2xx acknowledgement is the durable commit boundary for every
		// action now — the caller sees `committed` and keeps the operationId
		// stable instead of replaying the write.
		expect(await p).toEqual({ kind: "committed", id: "comment-1" });
		expect(t.postCalls).toEqual(["add-comment-bank"]);
		expect(t.applied).toEqual([]);
	});

	test("an identical action dispatched while pending shares the in-flight result (no duplicate POST)", async () => {
		const t = makeHarness();
		const first = t.bus.run(action(1));
		const second = t.bus.run(action(1)); // same payload — double click
		expect(t.postCalls).toEqual(["update-class-notes"]);

		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingFetches[0].resolve({ seq: 3 } as never);
		expect(await first).toEqual({ kind: "refreshed", id: "id-1" });
		expect(await second).toEqual({ kind: "refreshed", id: "id-1" });
		expect(t.postCalls).toEqual(["update-class-notes"]); // still one POST
	});

	test("a new identical action after the previous one settled POSTs again", async () => {
		const t = makeHarness();
		const first = t.bus.run(action(1));
		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingFetches[0].resolve({ seq: 3 } as never);
		await first;

		const second = t.bus.run(action(1));
		await flush();
		expect(t.postCalls).toEqual(["update-class-notes", "update-class-notes"]);
		t.pendingPosts[1].resolve("id-2");
		await flush();
		t.pendingFetches[1].resolve({ seq: 4 } as never);
		expect(await second).toEqual({ kind: "refreshed", id: "id-2" });
	});

	test("bus.refresh() applies the latest snapshot and resolves true", async () => {
		const t = makeHarness();
		const applied = t.bus.refresh();
		t.pendingFetches[0].resolve({ seq: 9 } as never);
		expect(await applied).toBe(true);
		expect(t.applied).toEqual([9]);
	});

	test("bus.refresh() resolves false when the snapshot is unreachable", async () => {
		const t = makeHarness();
		const applied = t.bus.refresh();
		t.pendingFetches[0].reject(new Error("offline"));
		expect(await applied).toBe(false);
	});

	test("bus.refresh() serializes behind an in-flight write so a stale snapshot never overwrites a newer apply", async () => {
		const t = makeHarness();
		const write = t.bus.run(action(1));
		const reconcile = t.bus.refresh();
		expect(t.pendingFetches).toHaveLength(0); // refresh waits for the write

		t.pendingPosts[0].resolve("id-1");
		await flush();
		t.pendingFetches[0].resolve({ seq: 1 } as never); // write's own refresh
		expect(await write).toEqual({ kind: "refreshed", id: "id-1" });

		await flush(); // reconcile fetch starts only now
		t.pendingFetches[1].resolve({ seq: 2 } as never);
		expect(await reconcile).toBe(true);
		expect(t.applied).toEqual([1, 2]); // newest apply wins, never stale
	});
});
