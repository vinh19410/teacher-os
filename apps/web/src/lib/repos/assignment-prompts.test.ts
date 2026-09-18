import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";

import { mapAssignmentPrompts } from "./assignment-prompts";

describe("mapAssignmentPrompts (#202)", () => {
	test("projects snapshot rows field-for-field", () => {
		const snapshot = {
			assignmentPrompts: [
				{
					id: "ap1",
					task: "task2",
					genre: "discuss",
					title: "Discuss both views",
					band: "7.0",
					source: "Cambridge 10",
					prompt: "Some people think…",
					note: "",
					status: "ready",
				},
			],
		} as unknown as KernelSnapshot;

		expect(mapAssignmentPrompts(snapshot)).toEqual([
			{
				id: "ap1",
				task: "task2",
				genre: "discuss",
				title: "Discuss both views",
				band: "7.0",
				source: "Cambridge 10",
				prompt: "Some people think…",
				note: "",
				status: "ready",
			},
		]);
	});

	test("unknown status values collapse to draft (honest UI default)", () => {
		const snapshot = {
			assignmentPrompts: [
				{
					id: "ap2",
					task: "task1",
					genre: "chart",
					title: "T",
					band: "6.5",
					source: "",
					prompt: "P",
					note: "n",
					status: "weird",
				},
			],
		} as unknown as KernelSnapshot;
		expect(mapAssignmentPrompts(snapshot)[0]?.status).toBe("draft");
	});
});
