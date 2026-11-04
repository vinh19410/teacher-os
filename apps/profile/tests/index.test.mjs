import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { replaceLeadApiMeta } from "../serve.mjs";

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

test("has meta[name=lead-api] and replaceLeadApiMeta replaces content", () => {
	assert.match(
		html,
		/<meta\s+name="lead-api"\s+content="https:\/\/api\.teacheros\.io\.vn"\s*\/?>/,
	);
	const replaced = replaceLeadApiMeta(html, "http://localhost:8100");
	assert.match(
		replaced,
		/<meta\s+name="lead-api"\s+content="http:\/\/localhost:8100"\s*\/?>/,
	);
	assert.equal(replaceLeadApiMeta(html, ""), html);
});

test("has canonical link pointing to https://msmy.io.vn/ (#536)", () => {
	assert.match(
		html,
		/<link\s+rel="canonical"\s+href="https:\/\/msmy\.io\.vn\/"\s*\/?>/,
	);
});

test("consultForm has exactly 2 required inputs (name and phone)", () => {
	const formMatch = html.match(/<form id="consultForm"[\s\S]*?<\/form>/);
	assert.ok(formMatch, "consultForm must exist");
	const formHtml = formMatch[0];
	const requiredTags = [
		...formHtml.matchAll(
			/<(?:input|select|textarea)\b[^>]*\brequired\b[^>]*>/g,
		),
	].map((m) => m[0]);
	assert.equal(requiredTags.length, 2);
	assert.ok(requiredTags.some((tag) => /\bname="name"/.test(tag)));
	assert.ok(requiredTags.some((tag) => /\bname="phone"/.test(tag)));
});

test("consultForm includes website honeypot with tabindex=-1 and autocomplete=off", () => {
	const formMatch = html.match(/<form id="consultForm"[\s\S]*?<\/form>/);
	assert.ok(formMatch);
	assert.match(
		formMatch[0],
		/<input[^>]*\bname="website"[^>]*\btabindex="-1"[^>]*\bautocomplete="off"[^>]*>/,
	);
});

test("every course option is inside an optgroup or is empty/undecided", () => {
	const selectMatch = html.match(
		/<select[^>]*\bname="course"[^>]*>([\s\S]*?)<\/select>/,
	);
	assert.ok(selectMatch, "select[name=course] must exist");
	const withoutOptgroups = selectMatch[1].replace(
		/<optgroup\b[^>]*>[\s\S]*?<\/optgroup>/g,
		"",
	);
	const topLevelValues = [
		...withoutOptgroups.matchAll(/<option\s+value="([^"]*)"/g),
	].map((m) => m[1]);
	assert.deepEqual(topLevelValues, ["", "undecided"]);
	assert.ok(!/Tạo Phiếu Đăng Ký &amp; Copy Gửi Zalo/.test(html));
});

test("placement test CTAs point to kiem-tra-dau-vao/ and legacy 5-question quiz is removed", () => {
	assert.ok(!/id="placementQuizForm"/.test(html));
	assert.ok(!/id="quizResultPanel"/.test(html));
	assert.equal(
		(html.match(/href="#lam-test-mien-phi"/g) ?? []).length,
		0,
		"no CTA should point to #lam-test-mien-phi",
	);
	const newCtaLinks = html.match(/href="kiem-tra-dau-vao\/"/g) ?? [];
	assert.ok(
		newCtaLinks.length >= 7,
		`expected at least 7 links to kiem-tra-dau-vao/, found ${newCtaLinks.length}`,
	);
	assert.match(html, /<section\s+id="lam-test-mien-phi"/);
	assert.ok(!/2 Phút/.test(html));
	assert.ok(!/5 câu hỏi/.test(html));
});

test("inline classic JS <script> blocks compile without SyntaxError (#559)", () => {
	const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	let compiledCount = 0;
	for (const match of html.matchAll(scriptRegex)) {
		const attrs = match[1] ?? "";
		if (/\bsrc\s*=/i.test(attrs)) continue;
		const typeMatch = attrs.match(
			/\btype\s*=\s*(?:["']([^"']*)["']|([^\s>"']+))/i,
		);
		const mime = (typeMatch?.[1] ?? typeMatch?.[2] ?? "").trim().toLowerCase();
		if (
			mime &&
			mime !== "text/javascript" &&
			mime !== "application/javascript"
		) {
			continue;
		}
		assert.doesNotThrow(() => new vm.Script(match[2] ?? ""));
		compiledCount += 1;
	}
	assert.ok(compiledCount >= 1, "expected at least 1 inline JS <script>");
});
