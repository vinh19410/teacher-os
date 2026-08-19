/**
 * Assignments read repo (Wave 6) — owns the kernel→display mapping for the
 * assignments module. Pure by design like the sibling wave repos.
 */
import type {
	KernelAssignmentRow,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import type { Assignment } from "@/lib/mock-data";
import { mapAssignments } from "./assignments";

const rows: KernelAssignmentRow[] = [
	{
		id: "as-1",
		studentId: "st-1",
		title: "Essay 1 — Education",
		type: "Writing Task 2",
		due: "20/08",
		status: "graded",
		scores: { task: 6.5, coherence: 7, lexical: 6.5, grammar: 6 },
	},
	{
		id: "as-2",
		studentId: "st-2",
		title: "Describe a map",
		type: "Writing Task 1",
		due: "25/08",
		status: "late",
		scores: null,
	},
];

describe("mapAssignments", () => {
	const assignments = mapAssignments({ assignments: rows } as KernelSnapshot);

	test("fills Assignment.sid from the row's studentId", () => {
		expect(assignments[0]?.sid).toBe("st-1");
		expect(assignments[1]?.sid).toBe("st-2");
	});

	test("keeps scores and the graded status together", () => {
		expect(assignments[0]?.scores).toEqual({
			task: 6.5,
			coherence: 7,
			lexical: 6.5,
			grammar: 6,
		});
		expect(assignments[0]?.status).toBe("graded");
	});

	test("ungraded rows map to null scores, not undefined", () => {
		expect(assignments[1]?.scores).toBeNull();
		expect(assignments[1]?.status).toBe("late");
	});

	test("passes due through as display text", () => {
		expect(assignments[0]?.due).toBe("20/08");
	});

	test("output satisfies the Assignment display shape", () => {
		for (const a of assignments) {
			expect(["not-submitted", "late", "graded"]).toContain(a.status);
		}
		expect(assignments satisfies Assignment[]).toHaveLength(2);
	});
});
