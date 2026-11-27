import { describe, expect, test } from "vitest";
import * as contracts from "./contracts";

describe("grading review v2 contracts (#978)", () => {
	test("v1 teacherSubmissionSchema and gradingQueueItemSchema reject auto-graded fields", () => {
		const v1Queue = contracts.gradingQueueItemSchema.safeParse({
			attemptId: "att-1",
			mode: "assignment",
			classId: "cl-1",
			className: "IELTS 5.5",
			title: "Grammar check",
			due: "2026-11-30",
			student: { id: "st-1", name: "Grok Test Student" },
			skill: "grammar",
			part: "",
			submittedAt: "2026-11-26T08:29:00.000Z",
			grade: null,
			autoScore: { correctCount: 3, totalCount: 3 },
		});
		expect(v1Queue.success).toBe(false);

		const v1Sub = contracts.teacherSubmissionSchema.safeParse({
			kind: "auto",
			attemptId: "att-1",
			classAssignmentId: "ca-1",
			classId: "cl-1",
			className: "IELTS 5.5",
			title: "Grammar check",
			due: "2026-11-30",
			student: { id: "st-1", name: "Grok Test Student" },
			skill: "grammar",
			part: "",
			startedAt: "2026-11-26T08:25:00.000Z",
			submittedAt: "2026-11-26T08:29:00.000Z",
		});
		expect(v1Sub.success).toBe(false);
	});

	test("v2 gradingQueueV2ResponseSchema accepts all 6 skills and strict autoScore", () => {
		const schema = (
			contracts as unknown as {
				gradingQueueV2ResponseSchema?: {
					parse: (input: unknown) => unknown;
					safeParse: (input: unknown) => { success: boolean };
				};
			}
		).gradingQueueV2ResponseSchema;
		expect(schema).toBeDefined();
		const valid = schema?.safeParse({
			items: [
				{
					attemptId: "att-w",
					mode: "assignment",
					classId: "cl-1",
					className: "IELTS 5.5",
					title: "Writing Task 2",
					due: "2026-11-30",
					student: { id: "st-1", name: "Leah" },
					skill: "writing",
					part: "task2",
					submittedAt: "2026-11-26T08:00:00.000Z",
					grade: null,
				},
				{
					attemptId: "att-g",
					mode: "assignment",
					classId: "cl-1",
					className: "IELTS 5.5",
					title: "Grammar quick check",
					due: "2026-11-30",
					student: { id: "st-2", name: "Grok" },
					skill: "grammar",
					part: "",
					submittedAt: "2026-11-26T08:29:00.000Z",
					grade: null,
					aiStatus: null,
					aiGradingMode: null,
					autoScore: { correctCount: 3, totalCount: 3 },
				},
			],
		});
		expect(valid?.success).toBe(true);

		const extraKey = schema?.safeParse({
			items: [
				{
					attemptId: "att-g",
					mode: "assignment",
					classId: "cl-1",
					className: "IELTS 5.5",
					title: "Grammar quick check",
					due: "2026-11-30",
					student: { id: "st-2", name: "Grok" },
					skill: "grammar",
					part: "",
					submittedAt: "2026-11-26T08:29:00.000Z",
					grade: null,
					unexpected: true,
				},
			],
		});
		expect(extraKey?.success).toBe(false);
	});

	test("teacherAutoSubmissionSchema and teacherAttemptReviewSchema parse auto-graded attempt strictly", () => {
		const autoSchema = (
			contracts as unknown as {
				teacherAutoSubmissionSchema?: {
					safeParse: (input: unknown) => { success: boolean };
				};
				teacherAttemptReviewSchema?: {
					safeParse: (input: unknown) => { success: boolean };
				};
			}
		).teacherAutoSubmissionSchema;
		const unionSchema = (
			contracts as unknown as {
				teacherAttemptReviewSchema?: {
					safeParse: (input: unknown) => { success: boolean };
				};
			}
		).teacherAttemptReviewSchema;
		expect(autoSchema).toBeDefined();
		expect(unionSchema).toBeDefined();

		const sampleAuto = {
			kind: "auto",
			attemptId: "att-mc-1",
			classAssignmentId: "ca-1",
			classId: "cl-1",
			className: "IELTS Foundation 5.5 (Test)",
			title: "[Integration test] Grammar quick check 26/11",
			due: "2026-11-30",
			student: { id: "st-1", name: "Grok Test Student" },
			skill: "grammar",
			part: "tenses",
			startedAt: "2026-11-26T08:25:00.000Z",
			submittedAt: "2026-11-26T08:29:00.000Z",
			correctCount: 2,
			wrongCount: 1,
			skippedCount: 0,
			totalCount: 3,
			items: [
				{ verdict: "correct", key: "A", answer: "A" },
				{ verdict: "wrong", key: "C", answer: "B" },
				{ verdict: "correct", key: "D", answer: "D" },
			],
			detail: {
				skill: "grammar",
				type: "mcq",
				band: "5.5",
				intro: "Choose the correct answer.",
				prompt: "<p>Complete the sentences.</p>",
				passage: "",
				cueTopic: "",
				cuePoints: "",
				audioName: "",
				imageUrl: "",
				optionBank: [],
				note: "Review present perfect.",
			},
			questions: [
				{
					stem: "She ___ here since 2020.",
					opts: ["has lived", "lived", "lives", "is living"],
					type: "mcq",
					pin: null,
					key: "A",
					alts: "",
					verdict: "correct",
					answer: "A",
					explanation: "Use present perfect with since.",
				},
			],
		};

		expect(autoSchema?.safeParse(sampleAuto).success).toBe(true);
		expect(unionSchema?.safeParse(sampleAuto).success).toBe(true);
		expect(autoSchema?.safeParse({ ...sampleAuto, extra: "bad" }).success).toBe(
			false,
		);
	});
});
