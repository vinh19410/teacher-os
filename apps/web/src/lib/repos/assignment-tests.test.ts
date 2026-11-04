import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test, vi } from "vitest";

import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	compareAnswerKey,
	parseTestAnswerKey,
	testAnswerCells,
} from "@/lib/test-answer-key";
import {
	type AnswerKeyApplySlot,
	type AnswerKeyPartChange,
	answerKeyPartChanges,
	collectionOptions,
	composerFromPrompt,
	groupOptions,
	mapAssignmentTests,
	partsSetPayload,
	runAnswerKeyApply,
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
				// #286 — per-question type phải sống sót qua bridge, nếu không
				// edit/Apply qua test-builder xoá âm thầm type của đề trộn dạng.
				{
					stem: "Q15",
					opts: null,
					answer: "TRUE",
					alts: "",
					pin: null,
					type: "tfng",
				},
			],
		};
		const value = composerFromPrompt(prompt);
		expect(value.skill).toBe("reading");
		expect(value.part).toBe("p2");
		expect(value.passage).toBe("Text…");
		expect(value.items).toEqual([
			{
				stem: "Q14",
				opts: null,
				answer: "iv",
				alts: "",
				type: null,
				pin: null,
			},
			{
				stem: "Q15",
				opts: null,
				answer: "TRUE",
				alts: "",
				type: "tfng",
				pin: null,
			},
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

	test("composerFromPrompt giữ explanation HTML, chuẩn hóa plain text từ AI import và bỏ qua explanation rỗng (#571)", () => {
		const prompt: AssignmentPrompt = {
			id: "p-exp",
			skill: "reading",
			part: "p1",
			type: "tfng",
			task: "p1",
			genre: "tfng",
			title: "Passage 1",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "Body",
			note: "",
			status: "ready",
			createdAt: "2026-11-04T00:00:00Z",
			questions: [
				{
					stem: "Q1",
					opts: null,
					answer: "TRUE",
					alts: "",
					pin: null,
					explanation: "<p>Đoạn 1 nêu rõ</p>",
				},
				{
					stem: "Q2",
					opts: null,
					answer: "FALSE",
					alts: "",
					pin: null,
					explanation: "Dòng 1\nDòng 2",
				},
				{
					stem: "Q3",
					opts: null,
					answer: "NOT GIVEN",
					alts: "",
					pin: null,
					explanation: "<p>   </p>",
				},
				{
					stem: "Q4",
					opts: null,
					answer: "TRUE",
					alts: "",
					pin: null,
				},
			],
		};
		const value = composerFromPrompt(prompt);
		expect(value.items[0]?.explanation).toBe("<p>Đoạn 1 nêu rõ</p>");
		expect(value.items[1]?.explanation).toBe("Dòng 1<br>Dòng 2");
		expect("explanation" in (value.items[2] ?? {})).toBe(false);
		expect("explanation" in (value.items[3] ?? {})).toBe(false);
	});
});

describe("answer-key apply helpers (full-test builder phase-5)", () => {
	const tfngQuestions = (answers: string[]) =>
		answers.map((answer, index) => ({
			stem: `Q${index + 1}`,
			opts: null,
			answer,
			alts: "",
			pin: null,
		}));

	/** Reading 13/13/14 với p2 mcq — số tuyệt đối là mốc duy nhất. */
	const readingSlots = (): AnswerKeyApplySlot[] => [
		{
			part: "p1",
			promptId: "prompt-p1",
			qStart: 1,
			questions: tfngQuestions(Array.from({ length: 13 }, () => "TRUE")),
		},
		{
			part: "p2",
			promptId: "prompt-p2",
			qStart: 14,
			questions: Array.from({ length: 13 }, (_, index) => ({
				stem: `Q${14 + index}`,
				opts: ["A", "B", "C", "D"],
				answer: "A",
				alts: "",
			})),
		},
	];

	const diffFor = (text: string, slots: AnswerKeyApplySlot[]) => {
		const { entries } = parseTestAnswerKey(
			text,
			slots.map((slot) => ({
				part: slot.part,
				qStart: slot.qStart,
				count: slot.questions.length,
				kind: slot.part === "p2" ? ("mcq4" as const) : ("tfng" as const),
			})),
		);
		return compareAnswerKey(entries, testAnswerCells(slots));
	};

	test("answerKeyPartChanges: chỉ mismatch được ghi, giữ stem/opts, số câu tuyệt đối", () => {
		// Q2 lệch (TRUE≠FALSE), Q15 lệch (A≠C) — p2 qStart 14: Q15 = index 1.
		const changes = answerKeyPartChanges(
			diffFor("1. TRUE\n2. FALSE\n15. C", readingSlots()),
			readingSlots(),
		);
		expect(changes.map((change) => change.part)).toEqual(["p1", "p2"]);
		expect(changes[0]).toMatchObject({
			part: "p1",
			promptId: "prompt-p1",
			numbers: [2],
		});
		expect(changes[0]?.questions[1]).toMatchObject({
			stem: "Q2",
			answer: "FALSE",
		});
		expect(changes[1]).toMatchObject({ part: "p2", numbers: [15] });
		// opts giữ nguyên — chỉ answer/alts thay.
		expect(changes[1]?.questions[1]?.opts).toEqual(["A", "B", "C", "D"]);
		expect(changes[1]?.questions[1]?.answer).toBe("C");
		// Câu match không bị clone lại (same reference).
		const slots = readingSlots();
		const next = answerKeyPartChanges(diffFor("2. FALSE", slots), slots);
		expect(next).toHaveLength(1);
		expect(next[0]?.questions[0]).toBe(slots[0]?.questions[0]);
	});

	test("answerKeyPartChanges: all-match → không part nào đổi", () => {
		const slots = readingSlots();
		expect(
			answerKeyPartChanges(diffFor("1. TRUE\n14. A", slots), slots),
		).toEqual([]);
	});

	test("runAnswerKeyApply: PATCH tuần tự từng part, lỗi part sau thì dừng — không rollback", async () => {
		const patch = vi.fn(
			async (change: AnswerKeyPartChange) => change.part !== "p2",
		);
		const changes: AnswerKeyPartChange[] = [
			{ part: "p1", promptId: "a", numbers: [1], questions: [] },
			{ part: "p2", promptId: "b", numbers: [2], questions: [] },
			{ part: "p3", promptId: "c", numbers: [3], questions: [] },
		];
		const outcome = await runAnswerKeyApply(changes, patch);
		// p2 lỗi → p3 không bị gọi.
		expect(patch.mock.calls.map(([change]) => change.part)).toEqual([
			"p1",
			"p2",
		]);
		expect(outcome).toEqual({
			appliedParts: 1,
			appliedQuestions: 1,
			failedPart: "p2",
		});
	});

	test("runAnswerKeyApply: 0 changes → 0 PATCH (idempotent precondition)", async () => {
		const patch = vi.fn(async () => true);
		expect(await runAnswerKeyApply([], patch)).toEqual({
			appliedParts: 0,
			appliedQuestions: 0,
			failedPart: null,
		});
		expect(patch).not.toHaveBeenCalled();
	});

	test("idempotency chấp nhận: apply key 40 dòng 2 lần — lần 2 ra 0 thay đổi", () => {
		// Đề 13+13+14 với đáp án đang lệch key ở mọi câu (trống hoặc sai).
		const keyText = [
			...Array.from(
				{ length: 13 },
				(_, i) => `${i + 1}. ${i % 2 ? "FALSE" : "TRUE"}`,
			),
			...Array.from({ length: 13 }, (_, i) => `${i + 14}. ${"ABCD"[i % 4]}`),
			...Array.from(
				{ length: 13 },
				(_, i) => `${i + 27}. word${i + 27} / alt${i + 27}`,
			),
			"40. final / last",
		].join("\n");
		const slots: AnswerKeyApplySlot[] = [
			{
				part: "p1",
				promptId: "prompt-p1",
				qStart: 1,
				questions: tfngQuestions(Array.from({ length: 13 }, () => "")),
			},
			{
				part: "p2",
				promptId: "prompt-p2",
				qStart: 14,
				questions: Array.from({ length: 13 }, (_, index) => ({
					stem: `Q${14 + index}`,
					opts: null,
					// Đề trống đáp án — mọi dòng key là mismatch (kịch bản chấp nhận).
					answer: "",
					alts: "",
				})),
			},
			{
				part: "p3",
				promptId: "prompt-p3",
				qStart: 27,
				questions: Array.from({ length: 14 }, (_, index) => ({
					stem: `Q${27 + index}`,
					opts: null,
					answer: "",
					alts: "",
				})),
			},
		];
		const ranges = slots.map((slot) => ({
			part: slot.part,
			qStart: slot.qStart,
			count: slot.questions.length,
			kind:
				slot.part === "p1"
					? ("tfng" as const)
					: slot.part === "p2"
						? ("mcq4" as const)
						: ("text" as const),
		}));

		// Lần 1: mọi câu lệch → 3 part đều có PATCH.
		const first = answerKeyPartChanges(
			compareAnswerKey(
				parseTestAnswerKey(keyText, ranges).entries,
				testAnswerCells(slots),
			),
			slots,
		);
		expect(first.map((change) => change.numbers.length)).toEqual([13, 13, 14]);

		// Giả lập server ghi xong: thay questions bằng bản PATCH gửi đi.
		const applied: AnswerKeyApplySlot[] = slots.map((slot) => ({
			part: slot.part,
			promptId: slot.promptId,
			qStart: slot.qStart,
			questions:
				first.find((change) => change.promptId === slot.promptId)?.questions ??
				slot.questions,
		}));
		// Lần 2: compare lại với CÙNG key → 0 mismatch → 0 PATCH.
		const second = answerKeyPartChanges(
			compareAnswerKey(
				parseTestAnswerKey(keyText, ranges).entries,
				testAnswerCells(applied),
			),
			applied,
		);
		expect(second).toEqual([]);
	});
});
