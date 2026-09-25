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
					audioName: "section1.mp3",
					imageUrl: "https://example.com/diagram.png",
					note: "",
					status: "ready",
					createdAt: "2026-09-18T10:00:00.000Z",
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
				audioName: "section1.mp3",
				imageUrl: "https://example.com/diagram.png",
				optionBank: [],
				note: "",
				status: "ready",
				createdAt: "2026-09-18T10:00:00.000Z",
			},
		]);
	});

	test("missing imageUrl collapses to empty string (legacy rows) (#269)", () => {
		const snapshot = {
			assignmentPrompts: [
				{
					id: "ap2",
					task: "p1",
					genre: "tfng",
					title: "T",
					band: "6.5",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-09-18T10:00:00.000Z",
				},
			],
		} as unknown as KernelSnapshot;
		expect(mapAssignmentPrompts(snapshot)[0]?.imageUrl).toBe("");
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
					createdAt: "2026-09-18T10:00:00.000Z",
				},
			],
		} as unknown as KernelSnapshot;
		expect(mapAssignmentPrompts(snapshot)[0]?.status).toBe("draft");
	});

	test("optionBank projects through; legacy rows collapse to [] (phase-02 FR7)", () => {
		const snapshot = {
			assignmentPrompts: [
				{
					id: "ap-bank",
					task: "p3",
					genre: "features",
					title: "Features with bank",
					band: "7.0",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					optionBank: ["Brunel", "Darwin"],
					createdAt: "2026-09-25T00:00:00.000Z",
				},
				{
					id: "ap-legacy",
					task: "p3",
					genre: "features",
					title: "Legacy features",
					band: "7.0",
					source: "",
					prompt: "",
					note: "",
					status: "ready",
					createdAt: "2026-09-25T00:00:00.000Z",
				},
			],
		} as unknown as KernelSnapshot;
		const [withBank, legacy] = mapAssignmentPrompts(snapshot);
		expect(withBank?.optionBank).toEqual(["Brunel", "Darwin"]);
		expect(legacy?.optionBank).toEqual([]);
	});
});
