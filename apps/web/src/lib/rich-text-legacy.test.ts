import { describe, expect, it } from "vitest";
import { looksLikeHtml, normalizeLegacyRichText } from "./rich-text-legacy";

describe("looksLikeHtml", () => {
	it("detects real tags", () => {
		expect(looksLikeHtml("<p>x</p>")).toBe(true);
		expect(looksLikeHtml("a<br>b")).toBe(true);
	});

	it("does not flag plain text or literal comparison signs", () => {
		expect(looksLikeHtml("Dòng 1\nDòng 2")).toBe(false);
		expect(looksLikeHtml("a < b")).toBe(false);
		expect(looksLikeHtml("")).toBe(false);
	});
});

describe("normalizeLegacyRichText", () => {
	it("converts legacy newlines to <br> so ProseMirror cannot collapse them", () => {
		expect(normalizeLegacyRichText("Dòng 1\nDòng 2\nDòng 3")).toBe(
			"Dòng 1<br>Dòng 2<br>Dòng 3",
		);
	});

	it("escapes & and < so literal text is never parsed as markup", () => {
		expect(normalizeLegacyRichText("a & b")).toBe("a &amp; b");
		expect(normalizeLegacyRichText("a < b")).toBe("a &lt; b");
	});

	it("returns HTML strings untouched", () => {
		const html = "<p>đã là <strong>HTML</strong></p>";
		expect(normalizeLegacyRichText(html)).toBe(html);
	});

	it("passes empty strings through", () => {
		expect(normalizeLegacyRichText("")).toBe("");
	});
});
