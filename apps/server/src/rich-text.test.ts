import {
	htmlToPlainText,
	isEmptyRichText,
	richTextField,
} from "@teacher-os/api/rich-text";
import { describe, expect, it } from "vitest";

describe("htmlToPlainText (regex fallback — no DOM in node env)", () => {
	it("strips tags and keeps text content", () => {
		expect(htmlToPlainText("<p>Hello <strong>world</strong></p>")).toBe(
			"Hello world",
		);
	});

	it("inserts newline at block boundaries so word counting stays correct", () => {
		expect(htmlToPlainText("<p>one</p><p>two</p>")).toBe("one\ntwo");
	});

	it("treats <br> as a line break", () => {
		expect(htmlToPlainText("a<br>b<br/>c")).toBe("a\nb\nc");
	});

	it("decodes common entities without double-decoding", () => {
		expect(htmlToPlainText("<p>a &amp; b &lt; c &gt; d</p>")).toBe(
			"a & b < c > d",
		);
		expect(htmlToPlainText("<p>a&nbsp;b</p>")).toBe("a b");
	});

	it("drops script and style content entirely", () => {
		expect(
			htmlToPlainText(
				"<p>keep</p><script>alert(1)</script><style>.a{}</style>",
			),
		).toBe("keep");
	});

	it("treats a < character without a following tag as literal text", () => {
		expect(htmlToPlainText("a < b")).toBe("a < b");
	});
});

describe("richTextField", () => {
	it("caps content length on plain text, not raw HTML", () => {
		const field = richTextField(10);
		expect(field.safeParse(`<p>${"a".repeat(10)}</p>`).success).toBe(true);
		expect(field.safeParse(`<p>${"a".repeat(11)}</p>`).success).toBe(false);
	});

	it("enforces a separate raw cap for HTML overhead", () => {
		const field = richTextField(25, 30);
		// 25 chars of content pass the plain cap, but the raw string (3+25+4=32) exceeds 30
		expect(field.safeParse(`<p>${"a".repeat(25)}</p>`).success).toBe(false);
	});

	it("defaults raw cap to ~2.5x plain cap", () => {
		const field = richTextField(100);
		expect(field.safeParse(`<p>${"a".repeat(100)}</p>`).success).toBe(true);
	});

	it("measures the plain cap identically before and after an editor round-trip", () => {
		const field = richTextField(11);
		// legacy plain (2 paragraphs joined by \n) and its HTML round-trip
		// collapse to the same length: the block boundary never shifts the cap
		expect(field.safeParse("12345\n12345").success).toBe(true);
		expect(field.safeParse("<p>12345</p><p>12345</p>").success).toBe(true);
		expect(field.safeParse("<p>123456</p><p>12345</p>").success).toBe(false);
	});

	it("allows empty strings — emptiness gating lives elsewhere (drafts must save)", () => {
		expect(richTextField(10).safeParse("").success).toBe(true);
	});

	it("keeps accepting legacy plain text unchanged", () => {
		const field = richTextField(20);
		expect(field.safeParse("Dòng 1\nDòng 2").success).toBe(true);
	});
});

describe("isEmptyRichText", () => {
	it("treats tag-only strings as empty", () => {
		expect(isEmptyRichText("<p></p>")).toBe(true);
		expect(isEmptyRichText("<p><br></p>")).toBe(true);
	});

	it("treats whitespace-only content inside tags as empty", () => {
		expect(isEmptyRichText("<p>   </p>")).toBe(true);
	});

	it("treats real content as non-empty", () => {
		expect(isEmptyRichText("<p>x</p>")).toBe(false);
		expect(isEmptyRichText("Dòng 1")).toBe(false);
	});

	it("treats empty string as empty", () => {
		expect(isEmptyRichText("")).toBe(true);
	});
});
