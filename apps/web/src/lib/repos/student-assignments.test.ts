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
});
