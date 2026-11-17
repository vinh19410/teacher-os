import { describe, expect, test } from "vitest";
import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_OPTION_BANK_MAX,
	answerKindByType,
	assignmentQuestionSchema,
	extendedAnswerChoices,
	LIBRARY_ANSWER_CHOICES,
	LIBRARY_OPTION_BANK_MAX,
	QUIZ_TYPE_DISPLAY,
} from "./contracts";

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

	test("opts hỗ trợ tối đa 8 lựa chọn (A–H cho mcq_many), từ chối 9 lựa chọn", () => {
		const eightOpts = ["A", "B", "C", "D", "E", "F", "G", "H"];
		expect(
			assignmentQuestionSchema.safeParse({
				stem: "Choose TWO",
				opts: eightOpts,
				answer: "H",
			}).success,
		).toBe(true);

		expect(
			assignmentQuestionSchema.safeParse({
				stem: "Too many",
				opts: [...eightOpts, "I"],
				answer: "A",
			}).success,
		).toBe(false);
	});
});

describe("library extended choices & new IELTS reading types metadata", () => {
	test("giữ nguyên hằng số assignment bank (8 mục)", () => {
		expect(ASSIGNMENT_OPTION_BANK_MAX).toBe(8);
		expect(ASSIGNMENT_ANSWER_CHOICES.letter).toHaveLength(8);
		expect(ASSIGNMENT_ANSWER_CHOICES.roman).toHaveLength(8);
	});

	test("LIBRARY_OPTION_BANK_MAX = 20 và LIBRARY_ANSWER_CHOICES đủ A..T và i..xx", () => {
		expect(LIBRARY_OPTION_BANK_MAX).toBe(20);
		expect(LIBRARY_ANSWER_CHOICES.letter).toHaveLength(20);
		expect(LIBRARY_ANSWER_CHOICES.letter[0]).toBe("A");
		expect(LIBRARY_ANSWER_CHOICES.letter[19]).toBe("T");
		expect(LIBRARY_ANSWER_CHOICES.roman).toHaveLength(20);
		expect(LIBRARY_ANSWER_CHOICES.roman[0]).toBe("i");
		expect(LIBRARY_ANSWER_CHOICES.roman[19]).toBe("xx");
	});

	test("extendedAnswerChoices trả về 20 nhãn cho letter/roman và fallback assignment cho kind khác", () => {
		expect(extendedAnswerChoices("letter")).toEqual(
			LIBRARY_ANSWER_CHOICES.letter,
		);
		expect(extendedAnswerChoices("roman")).toEqual(
			LIBRARY_ANSWER_CHOICES.roman,
		);
		expect(extendedAnswerChoices("tfng")).toEqual(
			ASSIGNMENT_ANSWER_CHOICES.tfng,
		);
		expect(extendedAnswerChoices("ynng")).toEqual(
			ASSIGNMENT_ANSWER_CHOICES.ynng,
		);
		expect(extendedAnswerChoices("mcq4")).toEqual(
			ASSIGNMENT_ANSWER_CHOICES.mcq4,
		);
		expect(extendedAnswerChoices("mcq3")).toEqual(
			ASSIGNMENT_ANSWER_CHOICES.mcq3,
		);
	});

	test("answerKindByType và QUIZ_TYPE_DISPLAY phủ 4 dạng mới + giữ legacy", () => {
		expect(answerKindByType.mcq_many).toBe("letter");
		expect(answerKindByType.match_names).toBe("letter");
		expect(answerKindByType.matching).toBe("letter");
		expect(answerKindByType.fill_blank).toBeUndefined();

		expect(QUIZ_TYPE_DISPLAY.mcq?.label).toBe("Multiple choice (One answer)");
		expect(QUIZ_TYPE_DISPLAY.mcq_many?.label).toBe(
			"Multiple choice (Multiple answers)",
		);
		expect(QUIZ_TYPE_DISPLAY.diagram?.label).toBe("Map / Diagram labelling");
		for (const id of [
			"mcq_many",
			"match_names",
			"matching",
			"fill_blank",
			"note",
			"tablecomp",
			"flowchart",
		]) {
			expect(QUIZ_TYPE_DISPLAY[id]?.label).toBeTruthy();
			expect(QUIZ_TYPE_DISPLAY[id]?.instruction).toBeTruthy();
		}
	});
});
