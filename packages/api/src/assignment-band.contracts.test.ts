import { describe, expect, test } from "vitest";
import {
	ASSIGNMENT_BANDS,
	assignmentPromptCreateSchema,
	DEFAULT_ASSIGNMENT_BAND,
} from "./contracts";

describe("ASSIGNMENT_BANDS and assignmentPromptCreateSchema", () => {
	const validBase = {
		skill: "writing",
		part: "task2",
		type: "discuss",
		title: "Band Test Prompt",
		source: "Cambridge 18",
		prompt: "<p>Prompt text here</p>",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		questions: [],
		optionBank: [],
		note: "",
		status: "ready" as const,
	};

	test("ASSIGNMENT_BANDS contains 5.0 to 8.0 in 0.5 steps", () => {
		expect(ASSIGNMENT_BANDS).toEqual([
			"5.0",
			"5.5",
			"6.0",
			"6.5",
			"7.0",
			"7.5",
			"8.0",
		]);
		expect(DEFAULT_ASSIGNMENT_BAND).toBe("7.0");
	});

	test("accepts all valid assignment bands", () => {
		for (const band of ASSIGNMENT_BANDS) {
			const parsed = assignmentPromptCreateSchema.safeParse({
				...validBase,
				band,
			});
			expect(parsed.success, `Expected band ${band} to be accepted`).toBe(true);
		}
	});

	test("rejects out-of-range bands", () => {
		for (const band of ["4.0", "4.5", "8.5", "9.0", "unknown", ""]) {
			const parsed = assignmentPromptCreateSchema.safeParse({
				...validBase,
				band,
			});
			expect(parsed.success, `Expected band ${band} to be rejected`).toBe(
				false,
			);
		}
	});
});
