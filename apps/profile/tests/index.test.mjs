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

function extractPlacementTestLinks(fragment) {
	const links = [];
	const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
	for (const match of fragment.matchAll(anchorRegex)) {
		const attrs = match[1] ?? "";
		const body = match[2] ?? "";
		const hrefMatch = attrs.match(
			/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i,
		);
		const rawHref = (
			hrefMatch?.[1] ??
			hrefMatch?.[2] ??
			hrefMatch?.[3] ??
			""
		).trim();
		if (!rawHref) continue;
		try {
			const parsed = new URL(rawHref, "https://msmy.io.vn/");
			if (
				parsed.origin === "https://msmy.io.vn" &&
				parsed.pathname.replace(/\/+$/, "") === "/kiem-tra-dau-vao"
			) {
				links.push({ attrs, body, index: match.index ?? 0, rawHref });
			}
		} catch {
			// Ignore non-URL schemes if any appear
		}
	}
	return links;
}

test("site-header has a single kiem-tra-dau-vao entry point in .nav-actions (#562)", () => {
	const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, "");
	const headerMatch = cleanHtml.match(
		/<header\b[^>]*\bclass\s*=\s*["'][^"']*\bsite-header\b[^"']*["'][^>]*>([\s\S]*?)<\/header>/i,
	);
	assert.ok(headerMatch, 'expected <header class="site-header">');
	const headerOuter = headerMatch[0];
	const headerInner = headerMatch[1] ?? "";

	for (const tag of ["header", "nav", "ul", "li", "div", "a", "span"]) {
		const openCount = (headerOuter.match(new RegExp(`<${tag}\\b`, "gi")) ?? [])
			.length;
		const closeCount = (
			headerOuter.match(new RegExp(`</${tag}\\s*>`, "gi")) ?? []
		).length;
		assert.equal(
			openCount,
			closeCount,
			`unbalanced <${tag}> tags inside .site-header`,
		);
	}

	const navLinksMatch = headerInner.match(
		/<ul\b[^>]*\bclass\s*=\s*["'][^"']*\bnav-links\b[^"']*["'][^>]*>([\s\S]*?)<\/ul>/i,
	);
	assert.ok(navLinksMatch, 'expected <ul class="nav-links"> in .site-header');
	for (const anchor of [
		"#bo-ho-so-pdf",
		"#ho-so-giang-vien",
		"#lo-trinh-khoa-hoc",
	]) {
		assert.match(navLinksMatch[1] ?? "", new RegExp(`href="${anchor}"`));
	}

	const headerTestLinks = extractPlacementTestLinks(headerInner);
	assert.equal(
		headerTestLinks.length,
		1,
		`expected exactly 1 /kiem-tra-dau-vao link in .site-header, found ${headerTestLinks.length}`,
	);
	assert.equal(
		extractPlacementTestLinks(navLinksMatch[1] ?? "").length,
		0,
		"expected 0 /kiem-tra-dau-vao links in .nav-links",
	);

	const navActionsOpen = headerInner.match(
		/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bnav-actions\b[^"']*["'][^>]*>/i,
	);
	assert.ok(
		navActionsOpen,
		'expected <div class="nav-actions"> in .site-header',
	);
	const navActionsStart = navActionsOpen.index ?? 0;
	let divDepth = 0;
	let navActionsEnd = -1;
	for (const divTag of headerInner
		.slice(navActionsStart)
		.matchAll(/<\/?div\b[^>]*>/gi)) {
		divDepth += divTag[0].startsWith("</") ? -1 : 1;
		if (divDepth === 0) {
			navActionsEnd = navActionsStart + (divTag.index ?? 0) + divTag[0].length;
			break;
		}
	}
	assert.ok(
		navActionsEnd > navActionsStart,
		"expected balanced closing </div> for .nav-actions",
	);
	assert.ok(
		headerTestLinks[0].index > navActionsStart &&
			headerTestLinks[0].index < navActionsEnd,
		"expected header placement test CTA to reside within .nav-actions bounds",
	);
	assert.match(headerTestLinks[0].attrs, /\bbtn-gold\b/);
	assert.match(headerTestLinks[0].body, /Làm Test Miễn Phí/);

	const headerStart = headerMatch.index ?? 0;
	const nonHeaderHtml =
		cleanHtml.slice(0, headerStart) +
		cleanHtml.slice(headerStart + headerOuter.length);
	assert.equal(
		extractPlacementTestLinks(nonHeaderHtml).length,
		8,
		"expected all 8 non-header /kiem-tra-dau-vao CTAs to remain intact",
	);
	const floatingMatch = nonHeaderHtml.match(
		/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bfloating-cta-btns\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
	);
	assert.ok(floatingMatch, "expected .floating-cta-btns outside header");
	assert.equal(extractPlacementTestLinks(floatingMatch[1] ?? "").length, 1);
});
