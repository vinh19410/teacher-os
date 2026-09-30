// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sanitizeRichText } from "@/lib/rich-text-sanitize";
import { RichTextBody } from "./rich-text-body";

afterEach(cleanup);

describe("sanitizeRichText", () => {
	it("strips event handlers and script tags but keeps formatting", () => {
		const out = sanitizeRichText(
			'<p onclick="x()">Hi<script>alert(1)</script><strong>ok</strong></p>',
		);
		expect(out).not.toMatch(/<script|onclick/i);
		expect(out).toContain("<strong>ok</strong>");
	});

	it("drops disallowed tags like img/mark entirely", () => {
		const out = sanitizeRichText(
			"<p>a<img src=x onerror=alert(1)>b<mark>m</mark></p>",
		);
		expect(out).not.toContain("<img");
		expect(out).not.toContain("onerror");
		expect(out).not.toContain("<mark");
		expect(out).toContain("a");
		expect(out).toContain("b");
	});

	it("forces links to open safely and blocks payload rel overrides", () => {
		const out = sanitizeRichText(
			'<p><a href="https://example.com" rel="nofollow">link</a></p>',
		);
		expect(out).toContain('target="_blank"');
		expect(out).toContain('rel="noopener noreferrer"');
		expect(out).not.toContain("nofollow");
	});

	it("does not double-encode entities", () => {
		expect(sanitizeRichText("<p>a &amp; b</p>")).toContain("a &amp; b");
	});
});

describe("RichTextBody", () => {
	it("renders rich HTML through sanitization", () => {
		const { container } = render(
			<RichTextBody text="<p><strong>x</strong></p>" />,
		);
		expect(container.querySelector("p strong")).not.toBeNull();
	});

	it("never executes XSS payloads embedded in rich text", () => {
		const { container } = render(
			<RichTextBody
				text={'<p>safe text</p><img src=x onerror="window.__pwned=1">'}
			/>,
		);
		expect(container.textContent).toContain("safe text");
		expect(container.querySelector("img")).toBeNull();
		expect((window as { __pwned?: string }).__pwned).toBeUndefined();
	});

	it("renders legacy plain text as escaped text, never innerHTML", () => {
		const { container } = render(
			<RichTextBody text={"line1\nline2 — a < b và 3 > 2"} />,
		);
		const div = container.querySelector("div");
		expect(div?.className).toContain("whitespace-pre-line");
		expect(div?.textContent).toContain("a < b và 3 > 2");
	});

	it("sends strings containing real tags through sanitization, not the legacy branch", () => {
		const { container } = render(<RichTextBody text="line1<br><b>x</b>" />);
		// Markup is parsed (rich branch) — disallowed <b> is dropped, text kept
		expect(container.querySelector("div")?.className).not.toContain(
			"whitespace-pre-line",
		);
		expect(container.querySelector("b")).toBeNull();
		expect(container.textContent).toContain("line1");
		expect(container.textContent).toContain("x");
	});

	it("keeps legacy newlines visible via whitespace-pre-line", () => {
		const { container } = render(<RichTextBody text={"Dòng 1\nDòng 2"} />);
		expect(container.querySelector("div")?.className).toContain(
			"whitespace-pre-line",
		);
	});

	it("supports pre-wrap legacy whitespace for surfaces that used it", () => {
		const { container } = render(
			<RichTextBody text="Dòng 1" legacyWhitespace="pre-wrap" />,
		);
		expect(container.querySelector("div")?.className).toContain(
			"whitespace-pre-wrap",
		);
	});
});
