import { describe, expect, it } from "vitest";
import { legacyVocabHref } from "./legacy-vocab-redirect";

describe("legacyVocabHref", () => {
	it("redirects bare /vocab and /vocab/ to /practice/vocabulary", () => {
		expect(legacyVocabHref("/vocab")).toBe("/practice/vocabulary");
		expect(legacyVocabHref("/vocab/")).toBe("/practice/vocabulary");
		expect(legacyVocabHref("/vocab", "")).toBe("/practice/vocabulary");
	});

	it("preserves subpaths and query strings across deck, session, and courses routes", () => {
		expect(legacyVocabHref("/vocab/d1", "?course=c1")).toBe(
			"/practice/vocabulary/d1?course=c1",
		);
		expect(legacyVocabHref("/vocab/d1?course=c1")).toBe(
			"/practice/vocabulary/d1?course=c1",
		);
		expect(legacyVocabHref("/vocab/d1/session", "?mode=review")).toBe(
			"/practice/vocabulary/d1/session?mode=review",
		);
		expect(legacyVocabHref("/vocab/d1/session", "?course=c1&mode=learn")).toBe(
			"/practice/vocabulary/d1/session?course=c1&mode=learn",
		);
		expect(legacyVocabHref("/vocab/courses", "?q=IELTS")).toBe(
			"/practice/vocabulary/courses?q=IELTS",
		);
		expect(legacyVocabHref("/vocab/courses/", "?q=IELTS")).toBe(
			"/practice/vocabulary/courses?q=IELTS",
		);
		expect(legacyVocabHref("/vocab/courses/c1")).toBe(
			"/practice/vocabulary/courses/c1",
		);
	});

	it("normalizes slashes and prevents open-redirect or prefix confusion payloads", () => {
		for (const [pathname, searchStr, expected] of [
			["/vocab//evil.com", "", "/practice/vocabulary/evil.com"],
			["/vocab/\\evil.com", "", "/practice/vocabulary/evil.com"],
			["//evil.com", "", "/practice/vocabulary"],
			["https://evil.com/vocab", "", "/practice/vocabulary"],
			["/vocabX", "", "/practice/vocabulary"],
			["/vocab/d1", "course=c1", "/practice/vocabulary/d1"],
			["/vocab/d1", "?", "/practice/vocabulary/d1"],
		] as const) {
			const res = legacyVocabHref(pathname, searchStr);
			expect(res).toBe(expected);
			expect(res.startsWith("/practice/vocabulary")).toBe(true);
			expect(res.startsWith("//")).toBe(false);
		}
	});
});
