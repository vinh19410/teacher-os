import { describe, expect, it } from "vitest";
import {
	looksLikeHtml,
	normalizeDraftItems,
	normalizeLegacyRichText,
} from "./rich-text-legacy";

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

describe("normalizeLegacyRichText & normalizeDraftItems (#571)", () => {
	it("escapes plain-text angle-bracket inequalities (both multiline and single-line) and stays idempotent on second pass", () => {
		const first = normalizeLegacyRichText("Ta có a<b và c>d\nSuy ra B");
		expect(first).toBe("Ta có a&lt;b và c&gt;d<br>Suy ra B");
		expect(normalizeLegacyRichText(first)).toBe(first);

		const singleLine = normalizeLegacyRichText("Ta có a<b và c>d & e");
		expect(singleLine).toBe("Ta có a&lt;b và c&gt;d &amp; e");
		expect(normalizeLegacyRichText(singleLine)).toBe(singleLine);
		expect(normalizeLegacyRichText("<p></p>")).toBe("<p></p>");
	});

	it("normalizeDraftItems normalizes non-empty explanation and omits empty or <p></p> explanation keys", () => {
		const items = normalizeDraftItems([
			{
				stem: "Q1",
				opts: null,
				answer: "TRUE",
				alts: "",
				explanation: "Dòng 1\nDòng 2",
			},
			{
				stem: "Q2",
				opts: null,
				answer: "FALSE",
				alts: "",
				explanation: "<p>   </p>",
			},
			{
				stem: "Q3",
				opts: null,
				answer: "NOT GIVEN",
				alts: "",
			},
		]);
		expect(items[0]?.explanation).toBe("Dòng 1<br>Dòng 2");
		expect("explanation" in (items[1] ?? {})).toBe(false);
		expect("explanation" in (items[2] ?? {})).toBe(false);
	});
});
