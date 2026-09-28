import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";

import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	collectionOptions,
	composerFromPrompt,
	groupOptions,
	mapAssignmentTests,
	partsSetPayload,
} from "./assignment-tests";
import { kernelCommand, mapKernelSnapshot } from "./kernel";

/** Row mẫu đầy đủ field — mọi test khác derive từ đây. */
const fullRow = {
	id: "at1",
	title: "IELTS Reading Full Test 5",
	description: "Bộ đề đọc full 3 passage",
	skill: "reading",
	timeLimitSeconds: 3600,
	collection: "Cambridge IELTS 12",
	testGroup: "TEST 5",
	status: "ready",
	parts: [
		{
			testId: "at1",
			promptId: "ap1",
			part: "p1",
			position: 0,
			qStartOverride: 14,
		},
		{
			testId: "at1",
			promptId: "ap2",
			part: "p2",
			position: 1,
			qStartOverride: null,
		},
	],
};

describe("mapAssignmentTests (full-test builder phase-2)", () => {
	test("projects snapshot rows field-for-field with parts in position order", () => {
		const snapshot = {
			assignmentTests: [fullRow],
		} as unknown as KernelSnapshot;

		expect(mapAssignmentTests(snapshot)).toEqual([
			{
				id: "at1",
				title: "IELTS Reading Full Test 5",
				description: "Bộ đề đọc full 3 passage",
				skill: "reading",
				timeLimitSeconds: 3600,
				collection: "Cambridge IELTS 12",
				testGroup: "TEST 5",
				status: "ready",
				parts: [
					{
						testId: "at1",
						promptId: "ap1",
						part: "p1",
						position: 0,
						qStartOverride: 14,
					},
					{
						testId: "at1",
						promptId: "ap2",
						part: "p2",
						position: 1,
						qStartOverride: null,
					},
				],
			},
		]);
	});

	test("missing snapshot key collapses to [] (older server)", () => {
		const snapshot = {} as unknown as KernelSnapshot;
		expect(mapAssignmentTests(snapshot)).toEqual([]);
	});

	test("missing parts collapse to []; unknown status collapses to draft", () => {
		const snapshot = {
			assignmentTests: [
				{ ...fullRow, id: "at2", parts: undefined, status: "archived" },
			],
		} as unknown as KernelSnapshot;
		const [row] = mapAssignmentTests(snapshot);
		expect(row?.parts).toEqual([]);
		expect(row?.status).toBe("draft");
	});

	test("mapKernelSnapshot wires assignmentTests through the mapper", () => {
		const emptySnapshot = {
			students: [],
			classes: [],
			syllabi: [],
			enrollments: [],
			packages: [],
			lessons: [],
			assignments: [],
			invoices: [],
			reports: [],
			notifs: [],
			commentBank: [],
			assignmentPrompts: [],
			classAssignments: [],
		};
		const snapshot = {
			...emptySnapshot,
			assignmentTests: [
				{ ...fullRow, id: "at3", status: "weird", parts: undefined },
			],
		} as unknown as KernelSnapshot;
		const slice = mapKernelSnapshot(snapshot);
		// Mapper (không phải raw pass-through): status collapse + parts [].
		expect(slice.assignmentTests).toEqual([
			expect.objectContaining({ id: "at3", status: "draft", parts: [] }),
		]);
	});
});

describe("kernelCommand assignment-test actions (full-test builder phase-2)", () => {
	test("create-assignment-test maps to POST /api/assignments/tests", () => {
		const request = kernelCommand({
			type: "create-assignment-test",
			payload: {
				title: "Reading Test 5",
				skill: "reading",
				timeLimitSeconds: 3600,
			},
		});
		expect(request.method).toBeUndefined();
		expect(request.path).toBe("/api/assignments/tests");
		expect(request.body).toEqual({
			title: "Reading Test 5",
			skill: "reading",
			timeLimitSeconds: 3600,
		});
	});

	test("update-assignment-test maps to PATCH /api/assignments/tests/:id", () => {
		const request = kernelCommand({
			type: "update-assignment-test",
			testId: "at-1",
			payload: { title: "Bản sửa", status: "ready" },
		});
		expect(request.method).toBe("PATCH");
		expect(request.path).toBe("/api/assignments/tests/at-1");
		expect(request.body).toEqual({ title: "Bản sửa", status: "ready" });
	});

	test("delete-assignment-test maps to DELETE with no body", () => {
		const request = kernelCommand({
			type: "delete-assignment-test",
			testId: "at-1",
		});
		expect(request.method).toBe("DELETE");
		expect(request.path).toBe("/api/assignments/tests/at-1");
		expect(request.body).toBeUndefined();
	});

	test("set-assignment-test-parts maps to PUT with the parts array verbatim", () => {
		const parts = [
			{ part: "p1", promptId: "ap1" },
			{ part: "p2", promptId: "ap2", qStartOverride: 14 },
		];
		const request = kernelCommand({
			type: "set-assignment-test-parts",
			testId: "at-1",
			parts,
		});
		expect(request.method).toBe("PUT");
		expect(request.path).toBe("/api/assignments/tests/at-1/parts");
		expect(request.body).toEqual(parts);
	});

	test("update-assignment-prompt maps to PATCH /api/assignments/prompts/:id", () => {
		const request = kernelCommand({
			type: "update-assignment-prompt",
			promptId: "ap-1",
			payload: {
				questions: [{ stem: "Q1", answer: "FALSE", alts: "" }],
				note: "đã sửa",
			},
		});
		expect(request.method).toBe("PATCH");
		expect(request.path).toBe("/api/assignments/prompts/ap-1");
		expect(request.body).toEqual({
			questions: [{ stem: "Q1", answer: "FALSE", alts: "" }],
			note: "đã sửa",
		});
	});
});

describe("builder view-model helpers (full-test builder phase-3)", () => {
	test("partsSetPayload orders slots by preset position and drops empty slots", () => {
		// Gán thiếu slot giữa (p2 trống) — replace-all chỉ mang slot đã gán,
		// thứ tự mảng theo preset reading p1,p2,p3.
		const payload = partsSetPayload("reading", {
			p1: "prompt-1",
			p2: null,
			p3: "prompt-3",
		});
		expect(payload).toEqual([
			{ part: "p1", promptId: "prompt-1" },
			{ part: "p3", promptId: "prompt-3" },
		]);
	});

	test("partsSetPayload full 3-slot reading → position order p1,p2,p3 với override giữ nguyên", () => {
		const payload = partsSetPayload(
			"reading",
			{ p1: "a", p2: "b", p3: "c" },
			{ p2: 20 },
		);
		expect(payload.map((item) => item.part)).toEqual(["p1", "p2", "p3"]);
		expect(payload.map((item) => item.promptId)).toEqual(["a", "b", "c"]);
		expect(payload[1].qStartOverride).toBe(20);
	});

	test("partsSetPayload listening preset → 4 slot theo thứ tự s1..s4", () => {
		const payload = partsSetPayload("listening", {
			s1: "l1",
			s2: "l2",
			s3: "l3",
			s4: "l4",
		});
		expect(payload.map((item) => item.part)).toEqual(["s1", "s2", "s3", "s4"]);
	});

	test("collectionOptions/groupOptions distinct bỏ trống", () => {
		const tests = mapAssignmentTests({
			assignmentTests: [fullRow],
		} as unknown as KernelSnapshot);
		const more = [
			...tests,
			{
				...tests[0],
				id: "at2",
				collection: "Cambridge IELTS 12",
				testGroup: null,
			},
			{ ...tests[0], id: "at3", collection: null, testGroup: "TEST 6" },
		];
		expect(collectionOptions(more)).toEqual(["Cambridge IELTS 12"]);
		expect(groupOptions(more)).toEqual(["TEST 5", "TEST 6"]);
	});

	test("composerFromPrompt bridge mọi field với fallback legacy", () => {
		const prompt: AssignmentPrompt = {
			id: "p1-row",
			skill: "reading",
			part: "p2",
			type: "headings",
			task: "p2",
			genre: "headings",
			title: "Passage 2",
			band: "7.0",
			source: "Cambridge 18",
			prompt: "",
			passage: "Text…",
			note: "ghi chú",
			status: "ready",
			createdAt: "2026-09-28T00:00:00Z",
			questions: [
				{ stem: "Q14", opts: null, answer: "iv", alts: "", pin: null },
			],
		};
		const value = composerFromPrompt(prompt);
		expect(value.skill).toBe("reading");
		expect(value.part).toBe("p2");
		expect(value.passage).toBe("Text…");
		expect(value.items).toEqual([
			{ stem: "Q14", opts: null, answer: "iv", alts: "", pin: null },
		]);

		// Legacy row: skill/part/type vắng mặt → fallback task/genre/writing.
		const legacy = composerFromPrompt({
			...prompt,
			skill: undefined,
			part: undefined,
			type: undefined,
			task: "task2",
			genre: "discuss",
		});
		expect(legacy.skill).toBe("writing");
		expect(legacy.part).toBe("task2");
		expect(legacy.type).toBe("discuss");
	});
});
