import { describe, expect, test } from "vitest";
import { emptyKernelData } from "./kernel-state";

describe("emptyKernelData", () => {
	test("opens every kernel collection as an empty array", () => {
		// Rendering before/without data must never crash on a missing
		// collection — including the full-test bank (assignmentTests).
		expect(Object.keys(emptyKernelData).sort()).toEqual([
			"assignmentPrompts",
			"assignmentTests",
			"assignments",
			"classAssignments",
			"classes",
			"commentBank",
			"enrollments",
			"events",
			"holidayCancels",
			"holidayShifts",
			"holidays",
			"invoices",
			"lessons",
			"notifs",
			"reports",
			"students",
			"syllabi",
			"vocabDecks",
			"vocabSuggestions",
		]);
		for (const collection of Object.values(emptyKernelData)) {
			expect(collection).toEqual([]);
		}
	});
});
