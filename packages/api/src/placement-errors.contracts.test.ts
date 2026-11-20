import { describe, expect, it } from "vitest";
import {
	emptySpeakingCriterionComments,
	emptyWritingCriterionComments,
	locatePlacementErrors,
	normalizePlacementErrorCategory,
	PLACEMENT_CRITERION_COMMENT_MAX,
	PLACEMENT_ERROR_CATEGORIES,
	PLACEMENT_SPEAKING_ERROR_CATEGORIES,
	PLACEMENT_WRITING_ERROR_CATEGORIES,
	type PlacementError,
	parseStoredSpeakingCriterionComments,
	parseStoredWritingCriterionComments,
	placementErrorCategoriesForSkill,
	placementTeacherGradeSchema,
} from "./placement-test-contracts";

function err(partial: Partial<PlacementError> & { quote: string }) {
	return {
		id: partial.id ?? partial.quote,
		category: partial.category ?? "grammar",
		start: partial.start ?? null,
		end: partial.end ?? null,
		correction: partial.correction ?? "",
		explanation: partial.explanation ?? "",
		quote: partial.quote,
	} satisfies PlacementError;
}

describe("locatePlacementErrors", () => {
	const text = "Last weekend I go to the beach. It were very funny. I go home.";

	it("locates quotes and sorts by position", () => {
		const out = locatePlacementErrors(text, [
			err({ id: "b", quote: "were" }),
			err({ id: "a", quote: "go" }),
		]);
		expect(out.map((e) => e.id)).toEqual(["a", "b"]);
		expect(text.slice(out[0]?.start ?? 0, out[0]?.end ?? 0)).toBe("go");
		expect(text.slice(out[1]?.start ?? 0, out[1]?.end ?? 0)).toBe("were");
	});

	it("keeps valid offsets and skips occurrences already taken", () => {
		const second = text.lastIndexOf("go");
		const out = locatePlacementErrors(text, [
			err({ id: "x", quote: "go", start: second, end: second + 2 }),
			err({ id: "y", quote: "go" }),
		]);
		const x = out.find((e) => e.id === "x");
		const y = out.find((e) => e.id === "y");
		expect(x?.start).toBe(second);
		expect(y?.start).toBe(text.indexOf("go"));
	});

	it("repairs wrong offsets and falls back to case-insensitive match", () => {
		const out = locatePlacementErrors(text, [
			err({ quote: "LAST weekend", start: 3, end: 9 }),
		]);
		expect(out[0]?.start).toBe(0);
		expect(out[0]?.end).toBe(12);
	});

	it("skips the case-insensitive match when lowercasing changes the text length", () => {
		// "İ".toLowerCase() is two UTF-16 units, so lowercase offsets would drift.
		const turkish = "İstanbul is big. I like big city.";
		const out = locatePlacementErrors(turkish, [
			err({ id: "case", quote: "BIG CITY" }),
			err({ id: "exact", quote: "big city" }),
		]);
		const exact = out.find((e) => e.id === "exact");
		const caseOnly = out.find((e) => e.id === "case");
		expect(exact?.start).toBe(turkish.indexOf("big city"));
		expect(turkish.slice(exact?.start ?? 0, exact?.end ?? 0)).toBe("big city");
		expect(caseOnly?.start).toBeNull();
		expect(caseOnly?.end).toBeNull();
	});

	it("skips the case-insensitive match when lowercasing changes the quote length", () => {
		const out = locatePlacementErrors("i̇stanbul is big.", [
			err({ quote: "İstanbul" }),
		]);
		expect(out[0]?.start).toBeNull();
	});

	it("returns null offsets when the quote is absent, ordered last", () => {
		const out = locatePlacementErrors(text, [
			err({ id: "missing", quote: "banana" }),
			err({ id: "found", quote: "funny" }),
		]);
		expect(out.map((e) => e.id)).toEqual(["found", "missing"]);
		expect(out[1]?.start).toBeNull();
		expect(out[1]?.end).toBeNull();
	});
});

describe("placement error categories and normalization", () => {
	it("exposes 4 skill-specific IELTS categories with English labels and 6 unique canonical categories", () => {
		expect(PLACEMENT_WRITING_ERROR_CATEGORIES).toEqual([
			{ key: "task", label: "Task Response" },
			{ key: "coherence", label: "Coherence & Cohesion" },
			{ key: "lexical", label: "Lexical Resource" },
			{ key: "grammar", label: "Grammatical Range & Accuracy" },
		]);
		expect(PLACEMENT_SPEAKING_ERROR_CATEGORIES).toEqual([
			{ key: "fluency", label: "Fluency & Coherence" },
			{ key: "lexical", label: "Lexical Resource" },
			{ key: "grammar", label: "Grammatical Range & Accuracy" },
			{ key: "pronunciation", label: "Pronunciation" },
		]);
		expect(PLACEMENT_ERROR_CATEGORIES).toEqual([
			{ key: "task", label: "Task Response" },
			{ key: "coherence", label: "Coherence & Cohesion" },
			{ key: "fluency", label: "Fluency & Coherence" },
			{ key: "lexical", label: "Lexical Resource" },
			{ key: "grammar", label: "Grammatical Range & Accuracy" },
			{ key: "pronunciation", label: "Pronunciation" },
		]);
		expect(placementErrorCategoriesForSkill("writing")).toBe(
			PLACEMENT_WRITING_ERROR_CATEGORIES,
		);
		expect(placementErrorCategoriesForSkill("speaking")).toBe(
			PLACEMENT_SPEAKING_ERROR_CATEGORIES,
		);
	});

	it("normalizes canonical and legacy categories per skill and returns null for unknown values", () => {
		expect(normalizePlacementErrorCategory("task", "writing")).toBe("task");
		expect(normalizePlacementErrorCategory("coherence", "writing")).toBe(
			"coherence",
		);
		expect(normalizePlacementErrorCategory("fluency", "writing")).toBe(
			"coherence",
		);
		expect(normalizePlacementErrorCategory("lexical", "writing")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("vocabulary", "writing")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("spelling", "writing")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("pronunciation", "writing")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("grammar", "writing")).toBe(
			"grammar",
		);
		expect(normalizePlacementErrorCategory("style", "writing")).toBeNull();
		expect(normalizePlacementErrorCategory("", "writing")).toBeNull();

		expect(normalizePlacementErrorCategory("fluency", "speaking")).toBe(
			"fluency",
		);
		expect(normalizePlacementErrorCategory("coherence", "speaking")).toBe(
			"fluency",
		);
		expect(normalizePlacementErrorCategory("task", "speaking")).toBe("fluency");
		expect(normalizePlacementErrorCategory("lexical", "speaking")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("vocabulary", "speaking")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("spelling", "speaking")).toBe(
			"lexical",
		);
		expect(normalizePlacementErrorCategory("grammar", "speaking")).toBe(
			"grammar",
		);
		expect(normalizePlacementErrorCategory("pronunciation", "speaking")).toBe(
			"pronunciation",
		);
		expect(normalizePlacementErrorCategory("style", "speaking")).toBeNull();
		expect(normalizePlacementErrorCategory("  ", "speaking")).toBeNull();
	});
});

describe("placementTeacherGradeSchema errors and criterion comments", () => {
	const baseGrade = {
		writingRubric: { task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
		writingScore: 6.5,
		courseId: "course-ielts-foundation",
	};

	it("defaults error lists and criterion comments cleanly and validates IELTS bands", () => {
		const parsed = placementTeacherGradeSchema.parse(baseGrade);
		expect(parsed.writingErrors).toEqual([]);
		expect(parsed.speakingErrors).toEqual([]);
		expect(parsed.speakingRubric).toBeNull();
		expect(parsed.speakingScore).toBeNull();
		expect(parsed.writingCriterionComments).toEqual(
			emptyWritingCriterionComments(),
		);
		expect(parsed.speakingCriterionComments).toBeNull();
		expect(parsed.courseId).toBe("course-ielts-foundation");
	});

	it("accepts all 4 valid categories per skill and rejects unknown, legacy, or cross-skill categories", () => {
		const valid = placementTeacherGradeSchema.safeParse({
			...baseGrade,
			speakingRubric: {
				fluency: 6,
				lexical: 6,
				grammar: 6,
				pronunciation: 6,
			},
			speakingScore: 6,
			writingErrors: [
				{ id: "w1", category: "task", quote: "a" },
				{ id: "w2", category: "coherence", quote: "b" },
				{ id: "w3", category: "lexical", quote: "c" },
				{ id: "w4", category: "grammar", quote: "d" },
			],
			speakingErrors: [
				{ id: "s1", category: "fluency", quote: "e" },
				{ id: "s2", category: "lexical", quote: "f" },
				{ id: "s3", category: "grammar", quote: "g" },
				{ id: "s4", category: "pronunciation", quote: "h" },
			],
		});
		expect(valid.success).toBe(true);

		for (const badWritingCategory of [
			"style",
			"vocabulary",
			"spelling",
			"pronunciation",
			"fluency",
		]) {
			const res = placementTeacherGradeSchema.safeParse({
				...baseGrade,
				writingErrors: [{ id: "1", category: badWritingCategory, quote: "x" }],
			});
			expect(res.success).toBe(false);
		}

		for (const badSpeakingCategory of [
			"style",
			"vocabulary",
			"spelling",
			"task",
			"coherence",
		]) {
			const res = placementTeacherGradeSchema.safeParse({
				...baseGrade,
				speakingErrors: [
					{ id: "1", category: badSpeakingCategory, quote: "x" },
				],
			});
			expect(res.success).toBe(false);
		}
	});

	it("trims per-criterion comments, fills omitted criterion keys, and enforces max length", () => {
		const maxText = "a".repeat(PLACEMENT_CRITERION_COMMENT_MAX);
		const parsed = placementTeacherGradeSchema.parse({
			...baseGrade,
			speakingRubric: {
				fluency: 6,
				lexical: 6,
				grammar: 6,
				pronunciation: 6,
			},
			speakingScore: 6,
			writingCriterionComments: {
				task: `  ${maxText}  `,
				lexical: "  Good word choice  ",
			},
			speakingCriterionComments: {
				fluency: "  Natural pace  ",
				pronunciation: "  Clear ending sounds  ",
			},
		});
		expect(parsed.writingCriterionComments).toEqual({
			task: maxText,
			coherence: "",
			lexical: "Good word choice",
			grammar: "",
		});
		expect(parsed.speakingCriterionComments).toEqual({
			fluency: "Natural pace",
			lexical: "",
			grammar: "",
			pronunciation: "Clear ending sounds",
		});

		const tooLongWriting = placementTeacherGradeSchema.safeParse({
			...baseGrade,
			writingCriterionComments: {
				task: "x".repeat(PLACEMENT_CRITERION_COMMENT_MAX + 1),
			},
		});
		expect(tooLongWriting.success).toBe(false);

		const tooLongSpeaking = placementTeacherGradeSchema.safeParse({
			...baseGrade,
			speakingCriterionComments: {
				pronunciation: "x".repeat(PLACEMENT_CRITERION_COMMENT_MAX + 1),
			},
		});
		expect(tooLongSpeaking.success).toBe(false);

		const extraKey = placementTeacherGradeSchema.safeParse({
			...baseGrade,
			writingCriterionComments: {
				task: "ok",
				pronunciation: "wrong skill",
			},
		});
		expect(extraKey.success).toBe(false);
	});

	it("parses stored criterion comments safely for null, empty, partial, and malformed JSON", () => {
		expect(parseStoredWritingCriterionComments(null)).toBeNull();
		expect(parseStoredWritingCriterionComments("")).toBeNull();
		expect(parseStoredWritingCriterionComments("not-json")).toBeNull();
		expect(parseStoredWritingCriterionComments("[]")).toBeNull();
		expect(parseStoredWritingCriterionComments('{"unknown":"x"}')).toBeNull();
		expect(
			parseStoredWritingCriterionComments('{"task":"  Needs focus  "}'),
		).toEqual({
			task: "Needs focus",
			coherence: "",
			lexical: "",
			grammar: "",
		});

		expect(parseStoredSpeakingCriterionComments(null)).toBeNull();
		expect(parseStoredSpeakingCriterionComments("")).toBeNull();
		expect(parseStoredSpeakingCriterionComments("{bad")).toBeNull();
		expect(
			parseStoredSpeakingCriterionComments(
				'{"fluency":"  Smooth  ","pronunciation":"  Watch /θ/  "}',
			),
		).toEqual({
			fluency: "Smooth",
			lexical: "",
			grammar: "",
			pronunciation: "Watch /θ/",
		});
		expect(emptySpeakingCriterionComments()).toEqual({
			fluency: "",
			lexical: "",
			grammar: "",
			pronunciation: "",
		});
	});

	it("rejects missing or blank courseId", () => {
		expect(
			placementTeacherGradeSchema.safeParse({
				writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				writingScore: 6,
			}).success,
		).toBe(false);
		expect(
			placementTeacherGradeSchema.safeParse({
				writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				writingScore: 6,
				courseId: "   ",
			}).success,
		).toBe(false);
	});

	it("rejects mismatched speakingRubric and speakingScore", () => {
		const parsed = placementTeacherGradeSchema.safeParse({
			writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			writingScore: 6,
			courseId: "course-ielts-foundation",
			speakingRubric: {
				fluency: 6,
				lexical: 6,
				grammar: 6,
				pronunciation: 6,
			},
			speakingScore: null,
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects invalid IELTS band step", () => {
		const badBand = placementTeacherGradeSchema.safeParse({
			writingRubric: { task: 6.3, coherence: 6, lexical: 6, grammar: 6 },
			writingScore: 6,
			courseId: "course-ielts-foundation",
		});
		expect(badBand.success).toBe(false);
	});
});
