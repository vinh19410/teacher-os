import { describe, expect, test } from "vitest";
import { assignmentQuestionSchema } from "./contracts";

describe("assignmentQuestionSchema — explanation/answerSet", () => {
	test("câu cũ parse ok và KHÔNG sinh key explanation/answerSet", () => {
		const parsed = assignmentQuestionSchema.safeParse({
			stem: "a",
			answer: "b",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(Object.keys(parsed.data)).not.toContain("explanation");
		expect(Object.keys(parsed.data)).not.toContain("answerSet");
	});

	test("explanation + answerSet parse ok, giữ nguyên giá trị", () => {
		const parsed = assignmentQuestionSchema.safeParse({
			stem: "a",
			answer: "b",
			explanation: "<p>vì…</p>",
			answerSet: "q21-22",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.explanation).toBe("<p>vì…</p>");
		expect(parsed.data.answerSet).toBe("q21-22");
	});

	test("answerSet rỗng bị từ chối", () => {
		const parsed = assignmentQuestionSchema.safeParse({
			stem: "a",
			answer: "b",
			answerSet: "",
		});
		expect(parsed.success).toBe(false);
	});

	test("field lạ vẫn bị từ chối (.strict())", () => {
		const parsed = assignmentQuestionSchema.safeParse({
			stem: "a",
			answer: "b",
			feedback: "x",
		});
		expect(parsed.success).toBe(false);
	});
});
