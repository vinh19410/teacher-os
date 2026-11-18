import { describe, expect, it } from "vitest";
import {
	locatePlacementErrors,
	type PlacementError,
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

describe("placementTeacherGradeSchema errors", () => {
	it("defaults error lists to empty and validates IELTS bands", () => {
		const parsed = placementTeacherGradeSchema.parse({
			writingRubric: { task: 6.5, coherence: 6, lexical: 6.5, grammar: 6 },
			writingScore: 6.5,
		});
		expect(parsed.writingErrors).toEqual([]);
		expect(parsed.speakingErrors).toEqual([]);
		expect(parsed.speakingRubric).toBeNull();
		expect(parsed.speakingScore).toBeNull();
	});

	it("rejects mismatched speakingRubric and speakingScore", () => {
		const parsed = placementTeacherGradeSchema.safeParse({
			writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			writingScore: 6,
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

	it("rejects invalid IELTS band step or unknown categories", () => {
		const badBand = placementTeacherGradeSchema.safeParse({
			writingRubric: { task: 6.3, coherence: 6, lexical: 6, grammar: 6 },
			writingScore: 6,
		});
		expect(badBand.success).toBe(false);

		const parsed = placementTeacherGradeSchema.safeParse({
			writingRubric: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
			writingScore: 6,
			writingErrors: [{ id: "1", category: "style", quote: "x" }],
		});
		expect(parsed.success).toBe(false);
	});
});
