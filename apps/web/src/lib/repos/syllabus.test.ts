/**
 * Syllabus read repo (Wave 2) — pure mapping units.
 * The kernel snapshot is the only input; the provider wires transport.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import { mapSyllabi } from "./syllabus";

const snapshot: KernelSnapshot = {
	students: [],
	classes: [],
	syllabi: [
		{
			id: "sy-1",
			name: "IELTS Writing",
			level: "Band 7.0",
			skill: "Writing",
			description: "Giáo trình viết",
			totalLessons: 99, // stored form value — must be ignored
			modules: [
				{
					id: "mod-1",
					title: "Task 1",
					description: "",
					lessons: [
						{
							id: "les-1",
							title: "Line chart",
							objectives: "",
							materials: "Cam 15",
							status: "done",
						},
						{
							id: "les-2",
							title: "Map",
							objectives: "so sánh vị trí",
							materials: "",
							status: "current",
						},
					],
				},
				{
					id: "mod-2",
					title: "Task 2",
					description: "Essay",
					lessons: [],
				},
			],
		},
	],
	enrollments: [],
	packages: [],
	lessons: [],
};

describe("mapSyllabi", () => {
	const syllabi = mapSyllabi(snapshot);

	test("totalLessons recomputes from the tree, ignoring the stored value", () => {
		expect(syllabi[0]?.totalLessons).toBe(2);
	});

	test("empty module description maps to undefined like the seed shape", () => {
		expect(syllabi[0]?.modules[0]?.description).toBeUndefined();
		expect(syllabi[0]?.modules[1]?.description).toBe("Essay");
	});

	test("empty objectives/materials map to the em-dash placeholder", () => {
		const first = syllabi[0]?.modules[0]?.lessons[0];
		expect(first?.objectives).toBe("—");
		expect(first?.materials).toBe("Cam 15");
		const second = syllabi[0]?.modules[0]?.lessons[1];
		expect(second?.objectives).toBe("so sánh vị trí");
		expect(second?.materials).toBe("—");
	});

	test("status keeps the lesson trio", () => {
		const statuses = syllabi[0]?.modules[0]?.lessons.map((l) => l.status);
		expect(statuses).toEqual(["done", "current"]);
	});

	test("syllabus with modules but zero lessons derives totalLessons 0", () => {
		const sparse: KernelSnapshot = {
			...snapshot,
			syllabi: [
				{
					id: "sy-empty",
					name: "Cây trống",
					level: "Band 6.0",
					skill: "Speaking",
					description: "",
					totalLessons: 12, // stored lie — the derive wins
					modules: [
						{ id: "mod-e1", title: "Trống 1", description: "", lessons: [] },
						{ id: "mod-e2", title: "Trống 2", description: "", lessons: [] },
					],
				},
			],
		};
		expect(mapSyllabi(sparse)[0]?.totalLessons).toBe(0);
	});

	test("empty org maps to an empty list, never seed", () => {
		const empty: KernelSnapshot = {
			students: [],
			classes: [],
			syllabi: [],
			enrollments: [],
			packages: [],
			lessons: [],
		};
		expect(mapSyllabi(empty)).toEqual([]);
	});
});
