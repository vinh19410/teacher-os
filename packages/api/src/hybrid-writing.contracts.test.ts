import { describe, expect, test } from "vitest";
import {
	ASSIGNMENT_PART_TYPES,
	type AssignmentPromptCreate,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	historyEntrySchema,
	quizAttemptDetailSchema,
	studentAssignmentSchema,
	studentQuizDetailSchema,
	teacherSubmissionSchema,
} from "./contracts";

const grammarPart = ASSIGNMENT_PART_TYPES.grammar.parts[0] ?? "tenses";
const grammarType =
	ASSIGNMENT_PART_TYPES.grammar.types[grammarPart]?.[0] ?? "mcq";

function baseGrammarPrompt(): AssignmentPromptCreate {
	return {
		skill: "grammar",
		part: grammarPart,
		type: grammarType,
		title: "Grammar + Writing Homework",
		band: "6.5",
		source: "Unit 1",
		prompt: "",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		questions: [
			{
				stem: "She ___ to school every day.",
				opts: ["go", "goes", "going", "went"],
				answer: "B",
				alts: "",
			},
		],
		optionBank: [],
		note: "",
		status: "ready",
	};
}

describe("hybrid writing section contracts (#574)", () => {
	test("legacy prompt payload without writing parses cleanly and keeps writing undefined", () => {
		const parsed = assignmentPromptCreateSchema.parse(baseGrammarPrompt());
		expect(parsed.writing).toBeUndefined();
	});

	test("auto-gradable prompt accepts valid writing section in both draft and ready", () => {
		for (const status of ["draft", "ready"] as const) {
			const parsed = assignmentPromptCreateSchema.parse({
				...baseGrammarPrompt(),
				status,
				writing: {
					part: "task2",
					type: "discuss",
					prompt:
						"<p>Some people prefer online classes. Discuss both views.</p>",
				},
			});
			expect(parsed.writing).toEqual({
				part: "task2",
				type: "discuss",
				prompt: "<p>Some people prefer online classes. Discuss both views.</p>",
			});
		}
	});

	test("rejects writing section on non-auto skills, invalid part/type, empty prompt, or unknown keys", () => {
		expect(
			assignmentPromptCreateSchema.safeParse({
				skill: "writing",
				part: "task2",
				type: "discuss",
				title: "Pure Writing",
				band: "7.0",
				source: "",
				prompt: "<p>Main prompt</p>",
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
				status: "draft",
				writing: {
					part: "task1",
					type: "chart",
					prompt: "<p>Extra</p>",
				},
			}).success,
		).toBe(false);

		expect(
			assignmentPromptCreateSchema.safeParse({
				...baseGrammarPrompt(),
				writing: { part: "p1", type: "discuss", prompt: "<p>Topic</p>" },
			}).success,
		).toBe(false);

		expect(
			assignmentPromptCreateSchema.safeParse({
				...baseGrammarPrompt(),
				writing: { part: "task2", type: "chart", prompt: "<p>Topic</p>" },
			}).success,
		).toBe(false);

		expect(
			assignmentPromptCreateSchema.safeParse({
				...baseGrammarPrompt(),
				status: "draft",
				writing: { part: "task2", type: "discuss", prompt: "<p>   </p>" },
			}).success,
		).toBe(false);

		expect(
			assignmentPromptCreateSchema.safeParse({
				...baseGrammarPrompt(),
				writing: {
					part: "task2",
					type: "discuss",
					prompt: "<p>Topic</p>",
					extraKey: true,
				},
			}).success,
		).toBe(false);
	});

	test("assignmentPromptUpdateSchema preserves undefined vs null vs valid writing section", () => {
		const untouched = assignmentPromptUpdateSchema.parse({
			title: "Updated title",
		});
		expect(untouched.writing).toBeUndefined();

		const cleared = assignmentPromptUpdateSchema.parse({ writing: null });
		expect(cleared.writing).toBeNull();

		const updated = assignmentPromptUpdateSchema.parse({
			writing: {
				part: "task1",
				type: ASSIGNMENT_PART_TYPES.writing.types.task1?.[0] ?? "line",
				prompt: "<p>Summarize the chart.</p>",
			},
		});
		expect(updated.writing?.part).toBe("task1");

		expect(
			assignmentPromptUpdateSchema.safeParse({
				writing: { part: "task2", type: "discuss", prompt: "" },
			}).success,
		).toBe(false);
	});

	test("wire read schemas accept permissive studentWritingSection, objective score, and hasWriting", () => {
		const quizDetail = studentQuizDetailSchema.parse({
			assignmentId: "ca-1",
			title: "Hybrid Quiz",
			due: "2026-11-10",
			skill: "grammar",
			part: grammarPart,
			type: grammarType,
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
			writing: {
				part: "task2",
				type: "",
				prompt: "<p>Write 250 words &#8212; topic.</p>",
			},
			attempt: null,
		});
		expect(quizDetail.writing?.part).toBe("task2");

		const attemptDetail = quizAttemptDetailSchema.parse({
			id: "att-1",
			assignmentId: "ca-1",
			title: "Hybrid Quiz",
			status: "submitted",
			correctCount: 1,
			wrongCount: 1,
			skippedCount: 0,
			totalCount: 2,
			startedAt: "2026-11-04T06:00:00.000Z",
			submittedAt: "2026-11-04T06:10:00.000Z",
			note: "",
			essay: "My essay",
			skill: "grammar",
			media: null,
			writing: { part: "task2", type: "discuss", prompt: "<p>Topic</p>" },
			questions: [],
		});
		expect(attemptDetail.writing?.part).toBe("task2");

		const submission = teacherSubmissionSchema.parse({
			attemptId: "att-1",
			classAssignmentId: "ca-1",
			classId: "cls-1",
			className: "IELTS 6.5",
			title: "Hybrid Quiz",
			due: "2026-11-10",
			student: { id: "st-1", name: "Minh" },
			skill: "writing",
			part: "task2",
			prompt: {
				prompt: "<p>Topic</p>",
				imageUrl: "",
				cueTopic: "",
				cuePoints: "",
				note: "",
			},
			startedAt: "2026-11-04T06:00:00.000Z",
			submittedAt: "2026-11-04T06:10:00.000Z",
			essay: "My essay",
			media: null,
			grade: null,
			annotations: [],
			objective: { correctCount: 8, totalCount: 10 },
		});
		expect(submission.objective).toEqual({ correctCount: 8, totalCount: 10 });

		expect(
			studentAssignmentSchema.parse({
				id: "ca-1",
				title: "Hybrid Quiz",
				source: "class_assignment",
				classId: "cls-1",
				className: "IELTS 6.5",
				due: "2026-11-10",
				submittedAt: null,
				scores: null,
				skill: "grammar",
				hasWriting: true,
			}).hasWriting,
		).toBe(true);

		expect(
			historyEntrySchema.parse({
				id: "att-1",
				kind: "assignment",
				attemptId: "att-1",
				skill: "vocabulary",
				title: "Vocab + Writing",
				date: "2026-11-04",
				submittedAt: "2026-11-04T06:10:00.000Z",
				minutes: 10,
				score: "8/10 · Band 6.5",
				status: "graded",
				hasWriting: true,
			}).hasWriting,
		).toBe(true);
	});
});
