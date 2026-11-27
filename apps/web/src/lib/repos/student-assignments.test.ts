import { describe, expect, test } from "vitest";

import type { KernelHydratedData } from "@/lib/mock-data";

import { studentAssignmentRows } from "./student-assignments";

type SelectorData = Pick<
	KernelHydratedData,
	"assignments" | "classAssignments" | "classes" | "assignmentPrompts"
>;

function makeData(overrides?: Partial<SelectorData>): SelectorData {
	return {
		assignments: [],
		classAssignments: [],
		classes: [],
		assignmentPrompts: [],
		...overrides,
	} as SelectorData;
}

function classAssignment(
	overrides: Partial<SelectorData["classAssignments"][number]>,
) {
	return {
		id: "ca-1",
		classId: "c-1",
		promptId: "p-1",
		title: "Writing Task 2 — Opinion",
		due: "2026-09-25",
		note: "",
		createdAt: "2026-09-18T10:00:00.000Z",
		targets: [{ studentId: "s-1", submittedAt: null }],
		...overrides,
	};
}

/** Selector chỉ đọc `id`/`name` của ClassGroup — fixture rút gọn đủ dùng. */
function classGroup(overrides: { id: string; name: string }) {
	return overrides as unknown as SelectorData["classes"][number];
}

describe("studentAssignmentRows (#317)", () => {
	test("returns [] on empty data", () => {
		expect(studentAssignmentRows(makeData(), "s-1")).toEqual([]);
	});

	test("merges class and grading sources with the right kind per row", () => {
		const data = makeData({
			classAssignments: [classAssignment({})],
			assignments: [
				{
					id: "a-1",
					sid: "s-1",
					title: "Writing Task 1",
					type: "Task 1",
					due: "2026-08-20",
					status: "graded",
					scores: { task: 6.5, coherence: 6, lexical: 6, grammar: 6 },
				},
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows.map((r) => r.kind)).toEqual(["grading", "class"]);
		expect(rows.map((r) => r.key)).toEqual(["grading:a-1", "ca:ca-1"]);
	});

	test("filters rows strictly to the requested studentId", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({
					targets: [
						{ studentId: "s-other", submittedAt: null },
						{ studentId: "s-1", submittedAt: null },
					],
				}),
			],
			assignments: [
				{
					id: "a-1",
					sid: "s-other",
					title: "Not mine",
					type: "Task 1",
					due: "2026-08-20",
					status: "graded",
					scores: null,
				},
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.kind).toBe("class");
	});

	test("reassigned prompt produces one row per class assignment", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({ id: "ca-1" }),
				classAssignment({ id: "ca-2", due: "2026-10-01" }),
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows.map((r) => r.key)).toEqual(["ca:ca-1", "ca:ca-2"]);
	});

	test("sorts ISO due ascending and pushes non-ISO/empty legacy due to the bottom", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({ id: "ca-late", due: "2026-03-01" }),
				classAssignment({ id: "ca-early", due: "2026-02-01" }),
			],
			assignments: [
				{
					id: "a-legacy",
					sid: "s-1",
					title: "Legacy dd/mm",
					type: "Task 1",
					due: "20/08",
					status: "not-submitted",
					scores: null,
				},
				{
					id: "a-empty",
					sid: "s-1",
					title: "Legacy empty due",
					type: "Task 2",
					due: "",
					status: "not-submitted",
					scores: null,
				},
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows.map((r) => r.key)).toEqual([
			"ca:ca-early",
			"ca:ca-late",
			"grading:a-empty",
			"grading:a-legacy",
		]);
	});

	test("maps grading row fields verbatim (gradingStatus, scores, typeLabel)", () => {
		const scores = { task: 7, coherence: 6.5, lexical: 7, grammar: 6 };
		const data = makeData({
			assignments: [
				{
					id: "a-1",
					sid: "s-1",
					title: "Writing Task 1",
					type: "Task 1",
					due: "2026-08-20",
					status: "late",
					scores,
				},
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows[0]).toMatchObject({
			kind: "grading",
			typeLabel: "Task 1",
			className: "",
			due: "2026-08-20",
			submittedAt: null,
			gradingStatus: "late",
			scores,
		});
	});

	test("grading row with legacy empty type maps typeLabel to null", () => {
		const data = makeData({
			assignments: [
				{
					id: "a-1",
					sid: "s-1",
					title: "Legacy row",
					type: "",
					due: "",
					status: "not-submitted",
					scores: null,
				},
			],
		});
		expect(studentAssignmentRows(data, "s-1")[0]?.typeLabel).toBeNull();
	});

	test("unknown skill id yields typeLabel null instead of a fallback label", () => {
		const data = makeData({
			classAssignments: [classAssignment({})],
			assignmentPrompts: [
				{
					id: "p-1",
					skill: "alien-skill",
					task: "",
					genre: "",
					title: "Prompt",
					band: "",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-09-18T10:00:00.000Z",
				},
			],
		});
		expect(studentAssignmentRows(data, "s-1")[0]?.typeLabel).toBeNull();
	});

	test("class row propagates target submittedAt verbatim", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({
					targets: [{ studentId: "s-1", submittedAt: "2026-09-20T14:30" }],
				}),
			],
		});
		expect(studentAssignmentRows(data, "s-1")[0]?.submittedAt).toBe(
			"2026-09-20T14:30",
		);
	});

	test("missing prompt or class lookups degrade to null / empty className", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({ classId: "c-missing", promptId: "p-missing" }),
			],
		});
		const row = studentAssignmentRows(data, "s-1")[0];
		expect(row?.typeLabel).toBeNull();
		expect(row?.className).toBe("");
		expect(row?.title).toBe("Writing Task 2 — Opinion");
	});

	test("target without enrollment still renders with className (parity with student portal)", () => {
		const data = makeData({
			classAssignments: [classAssignment({})],
			classes: [classGroup({ id: "c-1", name: "IELTS 6.5" })],
		});
		const row = studentAssignmentRows(data, "s-1")[0];
		expect(row?.className).toBe("IELTS 6.5");
	});

	test("class row resolves skill name from the prompt as typeLabel", () => {
		const data = makeData({
			classAssignments: [classAssignment({})],
			assignmentPrompts: [
				{
					id: "p-1",
					skill: "writing",
					task: "",
					genre: "",
					title: "Prompt",
					band: "",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-09-18T10:00:00.000Z",
				},
			],
			classes: [classGroup({ id: "c-1", name: "IELTS 6.5" })],
		});
		const row = studentAssignmentRows(data, "s-1")[0];
		expect(row?.typeLabel).toBe("Writing");
		expect(row?.className).toBe("IELTS 6.5");
		expect(row?.submittedAt).toBeNull();
		expect(row?.gradingStatus).toBeNull();
		expect(row?.scores).toBeNull();
	});

	test("propagates dueAt and sorts same-day assignments by parsed dueAt ms before null legacy rows (#572)", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({
					id: "ca-legacy",
					due: "2026-11-06",
					dueAt: null,
				}),
				classAssignment({
					id: "ca-evening",
					due: "2026-11-06",
					dueAt: "2026-11-06T17:00:00+07:00", // 10:00Z
				}),
				classAssignment({
					id: "ca-morning",
					due: "2026-11-06",
					dueAt: "2026-11-06T02:00:00.000Z", // 09:00 VN
				}),
			],
		});
		const rows = studentAssignmentRows(data, "s-1");
		expect(rows.map((r) => r.id)).toEqual([
			"ca-morning",
			"ca-evening",
			"ca-legacy",
		]);
		expect(rows[0]?.dueAt).toBe("2026-11-06T02:00:00.000Z");
		expect(rows[2]?.dueAt).toBeNull();
	});

	test("propagates validated band and gradedAt for graded class targets including band 0", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({
					id: "ca-hw2",
					title: "Homework 2",
					due: "2026-11-20",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-20T10:00:00.000Z",
							attemptId: "att-2",
							gradedAt: "2026-11-21T08:00:00.000Z",
							band: 5.5,
						},
					],
				}),
				classAssignment({
					id: "ca-hw3",
					title: "Homework 3",
					due: "2026-11-22",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-22T10:00:00.000Z",
							attemptId: "att-3",
							gradedAt: "2026-11-23T09:30:00.000Z",
							band: 6.5,
						},
					],
				}),
				classAssignment({
					id: "ca-zero",
					title: "Zero Band Essay",
					due: "2026-11-24",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-24T09:00:00.000Z",
							attemptId: "att-0",
							gradedAt: "2026-11-24T12:00:00.000Z",
							band: 0,
						},
					],
				}),
			],
		});

		const rows = studentAssignmentRows(data, "s-1");
		expect(
			rows.map((r) => ({ id: r.id, band: r.band, gradedAt: r.gradedAt })),
		).toEqual([
			{ id: "ca-hw2", band: 5.5, gradedAt: "2026-11-21T08:00:00.000Z" },
			{ id: "ca-hw3", band: 6.5, gradedAt: "2026-11-23T09:30:00.000Z" },
			{ id: "ca-zero", band: 0, gradedAt: "2026-11-24T12:00:00.000Z" },
		]);
	});

	test("coalesces omitted optional target grading fields and legacy grading rows to null", () => {
		const scores = { task: 6.5, coherence: 6, lexical: 6, grammar: 6 };
		const data = makeData({
			classAssignments: [
				classAssignment({
					id: "ca-legacy-target",
					due: "2026-11-25",
					targets: [{ studentId: "s-1", submittedAt: null }],
				}),
			],
			assignments: [
				{
					id: "a-1",
					sid: "s-1",
					title: "Legacy Writing",
					type: "Task 2",
					due: "2026-11-20",
					status: "graded",
					scores,
				},
			],
		});

		const rows = studentAssignmentRows(data, "s-1");
		expect(rows[0]).toMatchObject({
			kind: "grading",
			scores,
			band: null,
			gradedAt: null,
		});
		expect(rows[1]?.band).toBeNull();
		expect(rows[1]?.gradedAt).toBeNull();
	});

	test("normalizes malformed, incomplete, or out-of-range grades to null", () => {
		const validGradedAt = "2026-11-21T08:00:00.000Z";
		const invalidCases: Array<{
			id: string;
			band: number | null;
			gradedAt: string | null;
		}> = [
			{ id: "ca-no-date", band: 6.5, gradedAt: null },
			{ id: "ca-blank-date", band: 6.5, gradedAt: "   " },
			{ id: "ca-invalid-date", band: 6.5, gradedAt: "not-a-date" },
			{ id: "ca-no-band", band: null, gradedAt: validGradedAt },
			{ id: "ca-nan", band: Number.NaN, gradedAt: validGradedAt },
			{ id: "ca-inf", band: Number.POSITIVE_INFINITY, gradedAt: validGradedAt },
			{ id: "ca-negative", band: -0.5, gradedAt: validGradedAt },
			{ id: "ca-above-9", band: 9.5, gradedAt: validGradedAt },
			{ id: "ca-bad-step", band: 6.3, gradedAt: validGradedAt },
		];

		const data = makeData({
			classAssignments: invalidCases.map((c, idx) =>
				classAssignment({
					id: c.id,
					due: `2026-11-${String(10 + idx).padStart(2, "0")}`,
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-10T10:00:00.000Z",
							attemptId: `att-${idx}`,
							band: c.band,
							gradedAt: c.gradedAt,
						},
					],
				}),
			),
		});

		const rows = studentAssignmentRows(data, "s-1");
		expect(rows).toHaveLength(invalidCases.length);
		for (const row of rows) {
			expect(row.band).toBeNull();
			expect(row.gradedAt).toBeNull();
		}
	});

	test("isolates graded band per student when targets share one class assignment", () => {
		const data = makeData({
			classAssignments: [
				classAssignment({
					id: "ca-shared",
					due: "2026-11-28",
					targets: [
						{
							studentId: "s-other",
							submittedAt: "2026-11-25T10:00:00.000Z",
							attemptId: "att-other",
							gradedAt: "2026-11-26T04:00:00.000Z",
							band: 8.0,
						},
						{
							studentId: "s-1",
							submittedAt: "2026-11-25T11:00:00.000Z",
							attemptId: "att-1",
							gradedAt: null,
							band: null,
						},
					],
				}),
			],
		});

		const rows = studentAssignmentRows(data, "s-1");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.band).toBeNull();
		expect(rows[0]?.gradedAt).toBeNull();
	});

	test("propagates validated objective scores (incl. 0/N, hybrid, flip-first, libraryRef) and isolates per student (#977)", () => {
		const data = makeData({
			assignmentPrompts: [
				{
					id: "p-grammar",
					skill: "grammar",
					task: "g1",
					genre: "",
					title: "Grammar MCQ",
					band: "",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-11-20T00:00:00.000Z",
				},
				{
					id: "p-hybrid",
					skill: "grammar",
					task: "g1",
					genre: "",
					title: "Grammar + Writing",
					band: "",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					writing: {
						part: "task2",
						type: "opinion",
						prompt: "<p>Write essay.</p>",
					},
					createdAt: "2026-11-20T00:00:00.000Z",
				},
				{
					id: "p-writing",
					skill: "writing",
					task: "task2",
					genre: "essay",
					title: "Writing Task 2",
					band: "",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-11-20T00:00:00.000Z",
				},
			],
			classAssignments: [
				classAssignment({
					id: "ca-mcq-3",
					promptId: "p-grammar",
					due: "2026-11-20",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-19T10:00:00.000Z",
							attemptId: "att-1",
							correctCount: 3,
							totalQuestions: 3,
						},
						{
							studentId: "s-other",
							submittedAt: "2026-11-19T09:00:00.000Z",
							attemptId: "att-other",
							correctCount: 1,
							totalQuestions: 3,
						},
					],
				}),
				classAssignment({
					id: "ca-mcq-0",
					promptId: "p-grammar",
					due: "2026-11-21",
					targets: [
						{
							studentId: "s-1",
							submittedAt: null,
							attemptId: "att-flip",
							correctCount: 0,
							totalQuestions: 3,
						},
					],
				}),
				classAssignment({
					id: "ca-hybrid",
					promptId: "p-hybrid",
					due: "2026-11-22",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-21T10:00:00.000Z",
							attemptId: "att-hyb",
							gradedAt: "2026-11-22T08:00:00.000Z",
							band: 6.5,
							correctCount: 2,
							totalQuestions: 3,
						},
					],
				}),
				classAssignment({
					id: "ca-lib-gradable",
					promptId: "p-missing-lib",
					hasGradableTask: true,
					due: "2026-11-23",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-22T10:00:00.000Z",
							attemptId: "att-lib",
						},
					],
				}),
				classAssignment({
					id: "ca-malformed",
					promptId: "p-grammar",
					due: "2026-11-24",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-23T10:00:00.000Z",
							attemptId: "att-bad",
							correctCount: 4,
							totalQuestions: 3,
						},
					],
				}),
				classAssignment({
					id: "ca-unsubmitted-garbage",
					promptId: "p-grammar",
					due: "2026-11-25",
					targets: [
						{
							studentId: "s-1",
							submittedAt: null,
							attemptId: null,
							correctCount: 2,
							totalQuestions: 3,
						},
					],
				}),
			],
			assignments: [
				{
					id: "leg-1",
					sid: "s-1",
					title: "Legacy",
					type: "Task 2",
					due: "",
					status: "graded",
					scores: null,
				},
			],
		});

		const rows = studentAssignmentRows(data, "s-1");
		const byId = (id: string) => rows.find((r) => r.id === id);

		expect(byId("ca-mcq-3")).toMatchObject({
			submitted: true,
			correctCount: 3,
			totalQuestions: 3,
			hasGradableTask: false,
		});
		expect(byId("ca-mcq-0")).toMatchObject({
			submitted: true,
			correctCount: 0,
			totalQuestions: 3,
			hasGradableTask: false,
		});
		expect(byId("ca-hybrid")).toMatchObject({
			submitted: true,
			band: 6.5,
			correctCount: 2,
			totalQuestions: 3,
			hasGradableTask: true,
		});
		expect(byId("ca-lib-gradable")).toMatchObject({
			submitted: true,
			correctCount: null,
			totalQuestions: null,
			hasGradableTask: true,
		});
		expect(byId("ca-malformed")).toMatchObject({
			submitted: true,
			correctCount: null,
			totalQuestions: null,
		});
		expect(byId("ca-unsubmitted-garbage")).toMatchObject({
			submitted: false,
			correctCount: null,
			totalQuestions: null,
		});
		expect(byId("leg-1")).toMatchObject({
			submitted: false,
			correctCount: null,
			totalQuestions: null,
			hasGradableTask: false,
		});
	});
});
