import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const publicDir = new URL("../public/", import.meta.url);
const html = readFileSync(new URL("index.html", publicDir), "utf8");

/** Danh mục khóa trong form — phải khớp LEAD_COURSES (contract). Drift test
 * server (lead-catalog-drift.test.ts) là nguồn sự thật; danh sách ở đây để
 * fail nhanh cục bộ khi sửa HTML quên contract. */
const LEAD_COURSES = [
	"ielts-foundation",
	"ielts-first-step",
	"ielts-pre",
	"ielts-advanced",
	"ielts-sw-intensive",
	"ielts-single-skill",
	"comm-1",
	"comm-2",
	"comm-3",
	"comm-4",
	"comm-5",
	"undecided",
];

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

test("lead-api meta present with non-empty content", () => {
	const match = html.match(/<meta\s+name="lead-api"\s+content="([^"]*)">/);
	assert.ok(match, "meta[name=lead-api] phải tồn tại trong <head>");
	assert.ok(match[1].length > 0, "content của lead-api không được rỗng");
});

test("consult form has exactly 2 required inputs (name + phone)", () => {
	const form = html.match(/<form id="consultForm"[\s\S]*?<\/form>/);
	assert.ok(form, "form #consultForm phải tồn tại");
	const required = [...form[0].matchAll(/<input[^>]*\brequired\b[^>]*>/g)];
	assert.equal(required.length, 2);
	assert.ok(required[0][0].includes('id="studentName"'));
	assert.ok(required[1][0].includes('id="studentPhone"'));
});

test("honeypot website field is hidden off-screen and not tabbable", () => {
	const match = html.match(
		/<div aria-hidden="true"[^>]*>[\s\S]*?<input[^>]*name="website"[^>]*>[\s\S]*?<\/div>/,
	);
	assert.ok(match, "honeypot div aria-hidden chứa input website");
	assert.ok(match[0].includes('tabindex="-1"'));
	assert.ok(match[0].includes('autocomplete="off"'));
	assert.ok(match[0].includes("position: absolute"));
});

test("course select: mọi option là code contract, nằm trong optgroup hoặc undecided/rỗng", () => {
	const select = html.match(/<select[^>]*name="course"[\s\S]*?<\/select>/);
	assert.ok(select, "select[name=course] phải tồn tại");
	const values = [...select[0].matchAll(/<option value="([^"]*)">/g)]
		.map((m) => m[1])
		.filter((value) => value !== "");
	for (const value of values) {
		assert.ok(
			LEAD_COURSES.includes(value),
			`value "${value}" không nằm trong contract LEAD_COURSES`,
		);
	}
	assert.equal(values.length, LEAD_COURSES.length);
	// Option ngoài optgroup chỉ được là undecided (option rỗng đã filter).
	const outside = select[0]
		.replace(/<optgroup[\s\S]*?<\/optgroup>/g, "")
		.match(/<option value="([^"]*)">/g);
	const outsideValues = (outside ?? [])
		.map((tag) => tag.match(/value="([^"]*)"/)?.[1])
		.filter((value) => value !== undefined && value !== "");
	assert.deepEqual(outsideValues, ["undecided"]);
});

test("studyDays + timeSlot radio values là code contract", () => {
	const days = [...html.matchAll(/name="studyDays" value="([^"]*)"/g)].map(
		(m) => m[1],
	);
	const slots = [...html.matchAll(/name="timeSlot" value="([^"]*)"/g)].map(
		(m) => m[1],
	);
	assert.deepEqual(
		[...days].sort(),
		["flexible", "mt", "ss", "tf", "ws"].sort(),
	);
	assert.deepEqual(
		[...slots].sort(),
		["0900", "1330", "1545", "1815", "2000", "flexible"].sort(),
	);
});
