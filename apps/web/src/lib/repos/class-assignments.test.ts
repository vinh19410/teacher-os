import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";

import { mapClassAssignments } from "./class-assignments";

describe("mapClassAssignments (#208)", () => {
	test("projects snapshot rows field-for-field with targets embedded", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-1",
					classId: "c-1",
					promptId: "p-1",
					title: "Writing Task 2 — Opinion",
					due: "2026-09-25",
					note: "Làm cẩn thận",
					createdAt: "2026-09-18T10:00:00.000Z",
					targets: [
						{ studentId: "s-1", submittedAt: "2026-09-20T14:30" },
						{ studentId: "s-2", submittedAt: null },
					],
				},
			],
		} as unknown as KernelSnapshot;

		expect(mapClassAssignments(snapshot)).toEqual([
			{
				id: "ca-1",
				classId: "c-1",
				promptId: "p-1",
				title: "Writing Task 2 — Opinion",
				due: "2026-09-25",
				dueAt: null,
				sessionDate: null,
				note: "Làm cẩn thận",
				createdAt: "2026-09-18T10:00:00.000Z",
				targets: [
					{
						studentId: "s-1",
						submittedAt: "2026-09-20T14:30",
						attemptId: null,
						gradedAt: null,
						band: null,
						correctCount: null,
						totalQuestions: null,
					},
					{
						studentId: "s-2",
						submittedAt: null,
						attemptId: null,
						gradedAt: null,
						band: null,
						correctCount: null,
						totalQuestions: null,
					},
				],
			},
		]);
	});

	test("maps grading state (attemptId/gradedAt/band) per target (#319)", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-2",
					classId: "c-1",
					promptId: "p-1",
					title: "Speaking Part 2",
					due: "2026-09-28",
					note: "",
					createdAt: "2026-09-19T09:00:00.000Z",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-09-20T14:30",
							attemptId: "att-1",
							gradedAt: "2026-09-21T10:00:00.000Z",
							band: 6.5,
						},
					],
				},
			],
		} as unknown as KernelSnapshot;

		expect(mapClassAssignments(snapshot)[0]?.targets).toEqual([
			{
				studentId: "s-1",
				submittedAt: "2026-09-20T14:30",
				attemptId: "att-1",
				gradedAt: "2026-09-21T10:00:00.000Z",
				band: 6.5,
				correctCount: null,
				totalQuestions: null,
			},
		]);
	});

	test("maps objective auto-graded score (including 0/N) and optional hasGradableTask (#977)", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-mcq",
					classId: "c-1",
					promptId: "p-grammar",
					title: "Grammar quick check",
					due: "2026-11-28",
					dueAt: null,
					hasGradableTask: false,
					note: "",
					createdAt: "2026-11-26T08:00:00.000Z",
					targets: [
						{
							studentId: "s-1",
							submittedAt: "2026-11-26T08:29:00.000Z",
							attemptId: "att-1",
							gradedAt: null,
							band: null,
							correctCount: 3,
							totalQuestions: 3,
						},
						{
							studentId: "s-2",
							submittedAt: "2026-11-26T08:30:00.000Z",
							attemptId: "att-2",
							gradedAt: null,
							band: null,
							correctCount: 0,
							totalQuestions: 5,
						},
						{
							studentId: "s-3",
							submittedAt: null,
							attemptId: null,
							gradedAt: null,
							band: null,
						},
					],
				},
				{
					id: "ca-gradable",
					classId: "c-1",
					promptId: "p-writing",
					title: "Writing Task 2",
					due: "2026-11-28",
					dueAt: null,
					hasGradableTask: true,
					note: "",
					createdAt: "2026-11-26T09:00:00.000Z",
					targets: [],
				},
			],
		} as unknown as KernelSnapshot;

		const mapped = mapClassAssignments(snapshot);
		expect(mapped[0]?.hasGradableTask).toBe(false);
		expect(mapped[1]?.hasGradableTask).toBe(true);
		expect(mapped[0]?.targets).toEqual([
			{
				studentId: "s-1",
				submittedAt: "2026-11-26T08:29:00.000Z",
				attemptId: "att-1",
				gradedAt: null,
				band: null,
				correctCount: 3,
				totalQuestions: 3,
			},
			{
				studentId: "s-2",
				submittedAt: "2026-11-26T08:30:00.000Z",
				attemptId: "att-2",
				gradedAt: null,
				band: null,
				correctCount: 0,
				totalQuestions: 5,
			},
			{
				studentId: "s-3",
				submittedAt: null,
				attemptId: null,
				gradedAt: null,
				band: null,
				correctCount: null,
				totalQuestions: null,
			},
		]);
	});

	test("preserves targets order and handles empty targets list", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-empty",
					classId: "c-2",
					promptId: "p-2",
					title: "Task 1",
					due: "2026-09-30",
					note: "",
					createdAt: "2026-09-18T11:00:00.000Z",
					targets: [],
				},
			],
		} as unknown as KernelSnapshot;

		const mapped = mapClassAssignments(snapshot);
		expect(mapped).toHaveLength(1);
		expect(mapped[0]?.targets).toEqual([]);
	});

	test("projects non-null dueAt ISO timestamp onto ClassAssignment (#572)", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-timed",
					classId: "c-1",
					promptId: "p-1",
					title: "Listening Part 1",
					due: "2026-11-06",
					dueAt: "2026-11-06T10:30:00.000Z",
					note: "",
					createdAt: "2026-11-01T10:00:00.000Z",
					targets: [],
				},
			],
		} as unknown as KernelSnapshot;

		expect(mapClassAssignments(snapshot)[0]?.dueAt).toBe(
			"2026-11-06T10:30:00.000Z",
		);
	});

	test("projects non-null sessionDate onto ClassAssignment", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-session",
					classId: "c-1",
					promptId: "p-1",
					title: "Writing Task 2",
					due: "2026-11-30",
					dueAt: null,
					sessionDate: "2026-11-27",
					note: "",
					createdAt: "2026-11-26T10:00:00.000Z",
					targets: [],
				},
			],
		} as unknown as KernelSnapshot;

		expect(mapClassAssignments(snapshot)[0]?.sessionDate).toBe("2026-11-27");
	});

	test("preserves targetScope when present in snapshot and omits when absent", () => {
		const snapshot = {
			classAssignments: [
				{
					id: "ca-class",
					classId: "c-1",
					promptId: "p-1",
					title: "Class Scope",
					due: "2026-11-06",
					dueAt: null,
					targetScope: "class",
					note: "",
					createdAt: "2026-11-01T10:00:00.000Z",
					targets: [],
				},
				{
					id: "ca-selected",
					classId: "c-1",
					promptId: "p-1",
					title: "Selected Scope",
					due: "2026-11-06",
					dueAt: null,
					targetScope: "selected",
					note: "",
					createdAt: "2026-11-01T10:00:00.000Z",
					targets: [],
				},
			],
		} as unknown as KernelSnapshot;

		const mapped = mapClassAssignments(snapshot);
		expect(mapped[0]?.targetScope).toBe("class");
		expect(mapped[1]?.targetScope).toBe("selected");
	});
});
