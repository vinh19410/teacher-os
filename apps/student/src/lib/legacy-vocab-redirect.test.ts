import { describe, expect, it } from "vitest";
import { legacyVocabHref } from "./legacy-vocab-redirect";

describe("legacyVocabHref", () => {
	it("redirects bare /vocab and /student/vocab to /student/practice/vocabulary", () => {
		expect(legacyVocabHref("/vocab")).toBe("/student/practice/vocabulary");
		expect(legacyVocabHref("/vocab/")).toBe("/student/practice/vocabulary");
		expect(legacyVocabHref("/vocab", "")).toBe("/student/practice/vocabulary");
		expect(legacyVocabHref("/student/vocab")).toBe(
			"/student/practice/vocabulary",
		);
		expect(legacyVocabHref("/student/vocab/")).toBe(
			"/student/practice/vocabulary",
		);
	});

	it("preserves subpaths and query strings across deck, session, and courses routes", () => {
		expect(legacyVocabHref("/vocab/d1", "?course=c1")).toBe(
			"/student/practice/vocabulary/d1?course=c1",
		);
		expect(legacyVocabHref("/student/vocab/d1", "?course=c1")).toBe(
			"/student/practice/vocabulary/d1?course=c1",
		);
		expect(legacyVocabHref("/vocab/d1?course=c1")).toBe(
			"/student/practice/vocabulary/d1?course=c1",
		);
		expect(legacyVocabHref("/vocab/d1/session", "?mode=review")).toBe(
			"/student/practice/vocabulary/d1/session?mode=review",
		);
		expect(legacyVocabHref("/vocab/d1/session", "?course=c1&mode=learn")).toBe(
			"/student/practice/vocabulary/d1/session?course=c1&mode=learn",
		);
		expect(legacyVocabHref("/vocab/courses", "?q=IELTS")).toBe(
			"/student/practice/vocabulary/courses?q=IELTS",
		);
		expect(legacyVocabHref("/vocab/courses/", "?q=IELTS")).toBe(
			"/student/practice/vocabulary/courses?q=IELTS",
		);
		expect(legacyVocabHref("/vocab/courses/c1")).toBe(
			"/student/practice/vocabulary/courses/c1",
		);
	});

	it("normalizes slashes and prevents open-redirect or prefix confusion payloads", () => {
		for (const [pathname, searchStr, expected] of [
			["/vocab//evil.com", "", "/student/practice/vocabulary/evil.com"],
			["/vocab/\\evil.com", "", "/student/practice/vocabulary/evil.com"],
			["//evil.com", "", "/student/practice/vocabulary"],
			["https://evil.com/vocab", "", "/student/practice/vocabulary"],
			["/vocabX", "", "/student/practice/vocabulary"],
			["/vocab/d1", "course=c1", "/student/practice/vocabulary/d1"],
			["/vocab/d1", "?", "/student/practice/vocabulary/d1"],
		] as const) {
			const res = legacyVocabHref(pathname, searchStr);
			expect(res).toBe(expected);
			expect(res.startsWith("/student/practice/vocabulary")).toBe(true);
			expect(res.startsWith("//")).toBe(false);
		}
	});
});
