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
				note: "Làm cẩn thận",
				createdAt: "2026-09-18T10:00:00.000Z",
				targets: [
					{ studentId: "s-1", submittedAt: "2026-09-20T14:30" },
					{ studentId: "s-2", submittedAt: null },
				],
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
});
