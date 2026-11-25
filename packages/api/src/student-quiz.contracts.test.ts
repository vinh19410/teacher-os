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

	test("accepts positive timeLimitSeconds (including 4h library cap) and attempt.startedAt", () => {
		for (const limit of [600, 1200, 14400]) {
			const parsed = studentQuizDetailSchema.parse({
				...basePayload,
				timeLimitSeconds: limit,
				attempt: {
					id: "att-1",
					status: "in_progress",
					answers: {},
					startedAt: "2026-11-24T10:00:00.000Z",
				},
			});
			expect(parsed.timeLimitSeconds).toBe(limit);
			expect(parsed.attempt?.startedAt).toBe("2026-11-24T10:00:00.000Z");
		}
	});

	test("accepts null or omitted timeLimitSeconds and omitted attempt.startedAt", () => {
		const withNull = studentQuizDetailSchema.parse({
			...basePayload,
			timeLimitSeconds: null,
			attempt: {
				id: "att-1",
				status: "in_progress",
				answers: {},
			},
		});
		expect(withNull.timeLimitSeconds).toBeNull();
		expect(withNull.attempt?.startedAt).toBeUndefined();

		const omitted = studentQuizDetailSchema.parse(basePayload);
		expect(omitted.timeLimitSeconds).toBeUndefined();
	});

	test("rejects non-positive timeLimitSeconds (0 or negative)", () => {
		expect(() =>
			studentQuizDetailSchema.parse({
				...basePayload,
				timeLimitSeconds: 0,
			}),
		).toThrow();
		expect(() =>
			studentQuizDetailSchema.parse({
				...basePayload,
				timeLimitSeconds: -60,
			}),
		).toThrow();
	});
});

describe("studentQuizDetailSchema — practice intro metadata (#883)", () => {
	const basePayload = {
		assignmentId: "",
		title: "The Falkirk Wheel",
		due: "",
		dueAt: null,
		skill: "reading",
		part: "p1",
		type: "tfng",
		band: "7.0",
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

	test("accepts valid practice metadata fields", () => {
		const parsed = studentQuizDetailSchema.parse({
			...basePayload,
			timeLimitSeconds: 1200,
			partsCount: 3,
			collection: "IELTS Trainer 2",
			testGroup: "TEST 1",
			description: "<p>Mô tả đề</p>",
		});
		expect(parsed.timeLimitSeconds).toBe(1200);
		expect(parsed.partsCount).toBe(3);
		expect(parsed.collection).toBe("IELTS Trainer 2");
		expect(parsed.testGroup).toBe("TEST 1");
		expect(parsed.description).toBe("<p>Mô tả đề</p>");
	});

	test("accepts nullable metadata fields and 4h listening time limit", () => {
		const nullableParsed = studentQuizDetailSchema.parse({
			...basePayload,
			timeLimitSeconds: null,
			partsCount: 1,
			collection: null,
			testGroup: null,
			description: null,
		});
		expect(nullableParsed.timeLimitSeconds).toBeNull();
		expect(nullableParsed.collection).toBeNull();
		expect(nullableParsed.testGroup).toBeNull();
		expect(nullableParsed.description).toBeNull();

		const listeningMaxParsed = studentQuizDetailSchema.parse({
			...basePayload,
			timeLimitSeconds: 4 * 3600,
		});
		expect(listeningMaxParsed.timeLimitSeconds).toBe(4 * 3600);
	});

	test("accepts legacy and assignment payloads omitting all 5 metadata fields", () => {
		const parsed = studentQuizDetailSchema.parse(basePayload);
		expect(parsed.timeLimitSeconds).toBeUndefined();
		expect(parsed.partsCount).toBeUndefined();
		expect(parsed.collection).toBeUndefined();
		expect(parsed.testGroup).toBeUndefined();
		expect(parsed.description).toBeUndefined();
	});

	test("rejects invalid timeLimitSeconds, invalid partsCount, and unrecognized keys", () => {
		expect(() =>
			studentQuizDetailSchema.parse({ ...basePayload, timeLimitSeconds: 0 }),
		).toThrow();
		expect(() =>
			studentQuizDetailSchema.parse({ ...basePayload, timeLimitSeconds: -60 }),
		).toThrow();
		expect(() =>
			studentQuizDetailSchema.parse({ ...basePayload, timeLimitSeconds: 12.5 }),
		).toThrow();
		expect(() =>
			studentQuizDetailSchema.parse({ ...basePayload, partsCount: 0 }),
		).toThrow();
		expect(() =>
			studentQuizDetailSchema.parse({ ...basePayload, extraLeak: true }),
		).toThrow();
	});
});
