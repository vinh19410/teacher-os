import { describe, expect, test } from "vitest";
import { studentQuizDetailSchema } from "./contracts";

describe("studentQuizDetailSchema — due and dueAt support (#587)", () => {
	const basePayload = {
		assignmentId: "ca-1",
		title: "Reading Test 1",
		due: "2026-11-10",
		skill: "reading",
		part: "passage1",
		type: "tfng",
		band: "6.5",
		intro: "",
		prompt: "",
		passage: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		questions: [],
		attempt: null,
	};

	test("accepts payload with due and valid ISO dueAt", () => {
		const parsed = studentQuizDetailSchema.parse({
			...basePayload,
			dueAt: "2026-11-10T10:00:00.000Z",
		});
		expect(parsed.due).toBe("2026-11-10");
		expect(parsed.dueAt).toBe("2026-11-10T10:00:00.000Z");
	});

	test("accepts payload with dueAt: null (untimed assignment or practice)", () => {
		const parsed = studentQuizDetailSchema.parse({
			...basePayload,
			dueAt: null,
		});
		expect(parsed.due).toBe("2026-11-10");
		expect(parsed.dueAt).toBeNull();
	});

	test("accepts legacy payload omitting dueAt (backward compatibility)", () => {
		const parsed = studentQuizDetailSchema.parse(basePayload);
		expect(parsed.due).toBe("2026-11-10");
		expect(parsed.dueAt).toBeUndefined();
	});

	test("rejects unrecognized keys via .strict()", () => {
		expect(() =>
			studentQuizDetailSchema.parse({
				...basePayload,
				unrecognizedExtraKey: "leak",
			}),
		).toThrow();
	});
});
