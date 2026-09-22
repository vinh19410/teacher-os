import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(
	new URL("../public/index.html", import.meta.url),
	"utf8",
);

test("index.html exists and is non-empty", () => {
	assert.ok(html.trim().length > 0);
});

test("exactly one <h1>", () => {
	assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
});

test("beta form present", () => {
	assert.ok(html.includes('id="beta-form"'));
});

test("self-contained: no external <script src>", () => {
	assert.ok(!/<script[^>]+src=/.test(html));
});

test("responsive viewport meta present", () => {
	assert.ok(/name="viewport"/.test(html));
});
