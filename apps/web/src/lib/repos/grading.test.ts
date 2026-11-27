import type {
	TeacherAutoSubmission,
	TeacherSubmission,
} from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HttpError } from "@/lib/kernel-load-state";
import {
	fetchGradingQueue,
	fetchSubmission,
	fetchSubmissionMediaObjectUrl,
	gradingAudioUrl,
	gradingQueryKey,
	gradingQueueQueryKey,
	gradingQueueQueryOptions,
	saveGrade,
	submissionQueryOptions,
} from "./grading";

const BASE = "http://api";

function stubFetchOnce(handler: (url: string, init?: RequestInit) => Response) {
	const realFetch = globalThis.fetch;
	let seenUrl = "";
	let seenInit: RequestInit | undefined;
	vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) => {
		seenUrl = String(url);
		seenInit = init;
		return Promise.resolve(handler(seenUrl, init));
	});
	return {
		url: () => seenUrl,
		init: () => seenInit,
		restore: () => {
			vi.unstubAllGlobals();
			globalThis.fetch = realFetch;
		},
	};
}

const validSubmission: TeacherSubmission = {
	attemptId: "att-1",
	classAssignmentId: "ca-1",
	classId: "class-1",
	className: "IELTS Foundation",
	title: "Writing Task 2",
	due: "2026-10-10",
	student: { id: "s-1", name: "Minh Tran" },
	skill: "writing",
	part: "task2",
	prompt: {
		prompt: "<p>Some people think…</p>",
		imageUrl: "",
		cueTopic: "",
		cuePoints: "",
		note: "",
	},
	startedAt: "2026-10-01T01:00:00.000Z",
	submittedAt: "2026-10-02T01:00:00.000Z",
	essay: "My essay",
	media: null,
	grade: null,
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("grading repo (#319)", () => {
	test("fetchSubmission GET với ?v=2, credentials include và parse cả TeacherSubmission lẫn TeacherAutoSubmission", async () => {
		const stub = stubFetchOnce(() =>
			Response.json(validSubmission, { status: 200 }),
		);
		const data = await fetchSubmission("att 1", BASE);
		stub.restore();
		expect(stub.url()).toBe(`${BASE}/api/grading/att%201?v=2`);
		expect(stub.init()?.credentials).toBe("include");
		expect(data.title).toBe("Writing Task 2");
		expect(data.student.name).toBe("Minh Tran");

		const autoSubmission: TeacherAutoSubmission = {
			kind: "auto",
			attemptId: "att-mc-1",
			classAssignmentId: "ca-1",
			classId: "class-1",
			className: "IELTS Foundation",
			title: "Grammar quick check",
			due: "2026-11-30",
			student: { id: "s-1", name: "Grok Test Student" },
			skill: "grammar",
			part: "",
			startedAt: "2026-11-26T08:25:00.000Z",
			submittedAt: "2026-11-26T08:29:00.000Z",
			correctCount: 3,
			wrongCount: 0,
			skippedCount: 0,
			totalCount: 3,
			items: [{ verdict: "correct", key: "A", answer: "A" }],
			detail: {
				skill: "grammar",
				type: "mcq",
				band: "5.5",
				intro: "",
				prompt: "<p>Choose</p>",
				passage: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				optionBank: [],
				note: "",
			},
			questions: [
				{
					stem: "Q1",
					opts: ["A", "B", "C", "D"],
					type: "mcq",
					pin: null,
					key: "A",
					alts: "",
					verdict: "correct",
					answer: "A",
				},
			],
		};
		const stubAuto = stubFetchOnce(() =>
			Response.json(autoSubmission, { status: 200 }),
		);
		const parsedAuto = await fetchSubmission("att-mc-1", BASE);
		stubAuto.restore();
		expect("kind" in parsedAuto && parsedAuto.kind).toBe("auto");
		expect(gradingAudioUrl("att/1", BASE)).toBe(
			`${BASE}/api/grading/att%2F1/audio`,
		);
	});

	test("fetchSubmission ném HttpError(status) khi response lỗi", async () => {
		const stub = stubFetchOnce(() =>
			Response.json({ error: "attempt not yet submitted" }, { status: 409 }),
		);
		await expect(fetchSubmission("att-1", BASE)).rejects.toMatchObject({
			name: "HttpError",
			status: 409,
		});
		stub.restore();
	});

	test("saveGrade POST JSON body đúng và parse grade", async () => {
		const stub = stubFetchOnce(() =>
			Response.json(
				{
					scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
					band: 6,
					feedback: "",
					gradedAt: "2026-10-05T00:00:00.000Z",
				},
				{ status: 200 },
			),
		);
		const grade = await saveGrade(
			"att-1",
			{
				scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				feedback: "",
			},
			BASE,
		);
		stub.restore();
		expect(stub.url()).toBe(`${BASE}/api/grading/att-1/grade`);
		expect(stub.init()?.method).toBe("POST");
		expect(stub.init()?.credentials).toBe("include");
		const headers = stub.init()?.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
		expect(stub.init()?.body).toBe(
			JSON.stringify({
				scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				feedback: "",
			}),
		);
		expect(grade).toEqual({
			scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			band: 6,
			feedback: "",
			gradedAt: "2026-10-05T00:00:00.000Z",
		});
	});

	test("fetchSubmissionMediaObjectUrl ném lỗi khi Content-Type không phải media", async () => {
		const stub = stubFetchOnce(
			() =>
				new Response("<html></html>", {
					status: 200,
					headers: { "content-type": "text/html" },
				}),
		);
		await expect(
			fetchSubmissionMediaObjectUrl("att-1", undefined, BASE),
		).rejects.toBeInstanceOf(HttpError);
		stub.restore();
	});

	test("query options: key đúng và retry false", () => {
		const options = submissionQueryOptions("att-1", BASE);
		expect(options.queryKey).toEqual(gradingQueryKey("att-1"));
		expect(options.queryKey).toEqual(["kernel", "grading", "att-1"]);
		expect(options.retry).toBe(false);
	});

	test("fetchGradingQueue GET /api/grading với credentials include và parse items (#383)", async () => {
		const stub = stubFetchOnce(() =>
			Response.json(
				{
					items: [
						{
							attemptId: "att-prac-1",
							mode: "practice",
							classId: "",
							className: "Luyện tập",
							title: "Writing Mock 1",
							due: "",
							student: { id: "s-1", name: "Minh Tran" },
							skill: "writing",
							part: "task2",
							submittedAt: "2026-10-20T10:00:00.000Z",
							grade: null,
						},
					],
				},
				{ status: 200 },
			),
		);
		const queue = await fetchGradingQueue(BASE);
		stub.restore();
		expect(stub.url()).toBe(`${BASE}/api/grading?includeAuto=1`);
		expect(stub.init()?.credentials).toBe("include");
		expect(queue.items).toHaveLength(1);
		expect(queue.items[0]?.className).toBe("Luyện tập");
		expect(gradingQueueQueryOptions(BASE).queryKey).toEqual(
			gradingQueueQueryKey,
		);
	});

	test("fetchGradingQueue parses auto-graded items with autoScore (#978)", async () => {
		const stub = stubFetchOnce(() =>
			Response.json(
				{
					items: [
						{
							attemptId: "att-mc-1",
							mode: "assignment",
							classId: "cl-1",
							className: "IELTS 5.5",
							title: "Grammar quick check",
							due: "2026-11-30",
							student: { id: "s-1", name: "Grok Test Student" },
							skill: "grammar",
							part: "",
							submittedAt: "2026-11-26T08:29:00.000Z",
							grade: null,
							aiStatus: null,
							aiGradingMode: null,
							autoScore: { correctCount: 3, totalCount: 3 },
						},
					],
				},
				{ status: 200 },
			),
		);
		const queue = await fetchGradingQueue(BASE);
		stub.restore();
		expect(queue.items[0]?.skill).toBe("grammar");
		expect(queue.items[0]?.autoScore).toEqual({
			correctCount: 3,
			totalCount: 3,
		});
	});
});
