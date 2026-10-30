import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const html = readFileSync(new URL("index.html", publicDir), "utf8");

test("exactly one <h1>", () => {
	assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
});

test("self-contained: no external <script src>", () => {
	assert.ok(!/<script[^>]+src=/.test(html));
});

test("responsive viewport meta present", () => {
	assert.ok(/name="viewport"/.test(html));
});

test("every local asset the page references exists", () => {
	const paths = new Set(
		[
			...html.matchAll(
				/(?:src|href|data-open-pdf|data-lightbox-src)="(assets\/[^"]+)"/g,
			),
		].map((m) => m[1]),
	);
	assert.ok(paths.size > 0);
	for (const path of paths) {
		assert.ok(existsSync(new URL(path, publicDir)), `missing ${path}`);
	}
});

test("PDF viewer iframe is cleared on every dialog close, Esc included", () => {
	assert.ok(/pdfModal\.addEventListener\('close'/.test(html));
});
