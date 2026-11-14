import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { inflateSync } from "node:zlib";
import { buildProfile } from "../build.mjs";
import * as serveModule from "../serve.mjs";

const { createProfileServer, replaceLeadApiMeta } = serveModule;

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

test("select[name=course] contains exactly the 4 landing courses and empty default (#600)", () => {
	const selectMatch = html.match(
		/<select[^>]*\bname="course"[^>]*>([\s\S]*?)<\/select>/,
	);
	assert.ok(selectMatch, "select[name=course] must exist");
	const values = [...selectMatch[1].matchAll(/<option\s+value="([^"]*)"/g)].map(
		(m) => m[1],
	);
	assert.deepEqual(values, [
		"",
		"foundation-core",
		"ielts-practical",
		"workplace-interview",
		"undecided",
	]);
});

test("placement test CTAs point to kiem-tra-dau-vao/ and legacy 5-question quiz is removed (#600)", () => {
	assert.ok(!/id="placementQuizForm"/.test(html));
	assert.ok(!/id="quizResultPanel"/.test(html));
	assert.equal(
		(html.match(/href="#lam-test-mien-phi"/g) ?? []).length,
		0,
		"no CTA should point to #lam-test-mien-phi",
	);
	const newCtaLinks = html.match(/href="kiem-tra-dau-vao\/"/g) ?? [];
	assert.ok(
		newCtaLinks.length >= 3,
		`expected at least 3 links to kiem-tra-dau-vao/, found ${newCtaLinks.length}`,
	);
	assert.match(html, /id="lam-test-mien-phi"/);
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
		"#ban-dang-o-dau",
		"#lo-trinh-khoa-hoc",
		"#hoc-vien-noi-gi",
		"#co-my-la-ai",
		"#dang-ky-tu-van",
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
	const nonHeaderTestLinks = extractPlacementTestLinks(nonHeaderHtml);
	assert.ok(
		nonHeaderTestLinks.length >= 3,
		`expected at least 3 non-header /kiem-tra-dau-vao CTAs, found ${nonHeaderTestLinks.length}`,
	);
	const floatingMatch = nonHeaderHtml.match(
		/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bfloating-cta-btns\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
	);
	assert.ok(floatingMatch, "expected .floating-cta-btns outside header");
	assert.equal(extractPlacementTestLinks(floatingMatch[1] ?? "").length, 1);
});

test("header has exactly one #studentPortalLink in .nav-actions with default prod href and rel=noopener (#560)", () => {
	const allPortalIds = html.match(/\bid="studentPortalLink"/g) ?? [];
	assert.equal(allPortalIds.length, 1);

	const navActionsMatch = html.match(
		/<div\s+class="nav-actions"[^>]*>([\s\S]*?)<\/div>/,
	);
	assert.ok(navActionsMatch, ".nav-actions must exist in header");
	const linkMatch = navActionsMatch[1].match(
		/<a\b([^>]*\bid="studentPortalLink"[^>]*)>([\s\S]*?)<\/a>/,
	);
	assert.ok(linkMatch, "#studentPortalLink must live inside .nav-actions");
	const attrs = linkMatch[1];
	const label = linkMatch[2].trim();
	assert.match(attrs, /\bhref="https:\/\/student\.teacheros\.io\.vn"/);
	assert.match(attrs, /\brel="noopener"/);
	assert.match(
		attrs,
		/\bclass="[^"]*\bbtn\b[^"]*\bbtn-outline\b[^"]*\bbtn-sm\b[^"]*"/,
	);
	assert.equal(label, "Góc học viên");

	const testPageHtml = readFileSync(
		new URL("kiem-tra-dau-vao/index.html", publicDir),
		"utf8",
	);
	assert.equal(/studentPortalLink/.test(testPageHtml), false);
});

test("replaceStudentPortalHref replaces href safely, preserves attributes, escapes quotes/$ patterns, and fails closed on bad schemes (#560)", () => {
	const { replaceStudentPortalHref } = serveModule;
	assert.equal(
		typeof replaceStudentPortalHref,
		"function",
		"replaceStudentPortalHref must be exported from serve.mjs",
	);

	assert.equal(replaceStudentPortalHref(html, ""), html);
	assert.equal(replaceStudentPortalHref(html, "   "), html);

	const stagingHtml = replaceStudentPortalHref(
		html,
		"  https://student.staging.teacheros.io.vn  ",
	);
	assert.match(
		stagingHtml,
		/<a\b[^>]*\bhref="https:\/\/student\.staging\.teacheros\.io\.vn"[^>]*\bid="studentPortalLink"[^>]*\bclass="btn btn-outline btn-sm"[^>]*\brel="noopener"[^>]*>Góc học viên<\/a>/,
	);

	// Attribute-order tolerance: id before href + extra target attribute
	const reorderedSample =
		'<div class="nav-actions"><a id="studentPortalLink" class="btn btn-outline btn-sm" target="_self" href="https://student.teacheros.io.vn" rel="noopener">Góc học viên</a></div>';
	const reorderedReplaced = replaceStudentPortalHref(
		reorderedSample,
		"http://localhost:8003",
	);
	assert.equal(
		reorderedReplaced,
		'<div class="nav-actions"><a id="studentPortalLink" class="btn btn-outline btn-sm" target="_self" href="http://localhost:8003" rel="noopener">Góc học viên</a></div>',
	);

	// Quote escaping + String.prototype.replace $-pattern immunity
	const specialUrl = `https://student.example.com/path?a="1"&b=$$&c=$&&d=$\`&e=$'`;
	const specialReplaced = replaceStudentPortalHref(reorderedSample, specialUrl);
	assert.equal(
		specialReplaced,
		'<div class="nav-actions"><a id="studentPortalLink" class="btn btn-outline btn-sm" target="_self" href="https://student.example.com/path?a=&quot;1&quot;&amp;b=$$&amp;c=$&amp;&amp;d=$`&amp;e=$\'" rel="noopener">Góc học viên</a></div>',
	);
	assert.ok(
		!specialReplaced.includes('a="1"'),
		"raw double quote must be escaped",
	);

	// Fail-closed on dangerous/invalid schemes or missing/duplicate anchor
	for (const badUrl of [
		"javascript:alert(1)",
		"JAVASCRIPT:alert(1)",
		"data:text/html,<script>alert(1)</script>",
		"//evil.example/login",
		"student.teacheros.io.vn",
		"ftp://student.teacheros.io.vn",
		"https://user:pass@student.teacheros.io.vn",
	]) {
		assert.throws(
			() => replaceStudentPortalHref(reorderedSample, badUrl),
			/STUDENT_PORTAL_URL/i,
			`expected fail-closed throw for ${badUrl}`,
		);
	}

	assert.throws(
		() =>
			replaceStudentPortalHref(
				'<div><a href="https://x.example">No id</a></div>',
				"http://localhost:8003",
			),
		/studentPortalLink/i,
	);
	assert.throws(
		() =>
			replaceStudentPortalHref(
				`${reorderedSample}${reorderedSample}`,
				"http://localhost:8003",
			),
		/studentPortalLink/i,
	);
});

test("createProfileServer and buildProfile wire studentPortalUrl only on root index.html with exact byte Content-Length (#560)", async () => {
	assert.throws(
		() => createProfileServer("http://localhost:8100", "localhost:8003"),
		/STUDENT_PORTAL_URL/i,
	);
	const server = createProfileServer(
		"http://localhost:8100",
		"http://localhost:8103",
	);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	const base = `http://127.0.0.1:${port}`;
	try {
		const getHome = await fetch(`${base}/`);
		assert.equal(getHome.status, 200);
		const homeText = await getHome.text();
		assert.equal(
			Number(getHome.headers.get("content-length")),
			Buffer.byteLength(homeText, "utf8"),
		);
		assert.match(
			homeText,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
		assert.match(
			homeText,
			/\bhref="http:\/\/localhost:8103"[^>]*\bid="studentPortalLink"|\bid="studentPortalLink"[^>]*\bhref="http:\/\/localhost:8103"/,
		);

		const headHome = await fetch(`${base}/`, { method: "HEAD" });
		assert.equal(headHome.status, 200);
		assert.equal(
			Number(headHome.headers.get("content-length")),
			Buffer.byteLength(homeText, "utf8"),
		);

		const getPlacement = await fetch(`${base}/kiem-tra-dau-vao/`);
		assert.equal(getPlacement.status, 200);
		const placementText = await getPlacement.text();
		assert.match(
			placementText,
			/<meta name="lead-api" content="http:\/\/localhost:8100">/,
		);
		assert.equal(/studentPortalLink/.test(placementText), false);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}

	// Empty string keeps HTML prod default even in serve.mjs
	const emptyUrlServer = createProfileServer("http://localhost:8100", "");
	await new Promise((resolve) =>
		emptyUrlServer.listen(0, "127.0.0.1", resolve),
	);
	const emptyPort = emptyUrlServer.address().port;
	try {
		const res = await fetch(`http://127.0.0.1:${emptyPort}/`);
		const body = await res.text();
		assert.match(
			body,
			/\bhref="https:\/\/student\.teacheros\.io\.vn"[^>]*\bid="studentPortalLink"|\bid="studentPortalLink"[^>]*\bhref="https:\/\/student\.teacheros\.io\.vn"/,
		);
	} finally {
		await new Promise((resolve) => emptyUrlServer.close(resolve));
	}

	// buildProfile works when ONLY studentPortalUrl is provided (leadApiUrl empty)
	const tmpRoot = mkdtempSync(join(tmpdir(), "profile-student-portal-build-"));
	try {
		const distDir = join(tmpRoot, "dist");
		await buildProfile({
			distUrl: pathToFileURL(distDir),
			leadApiUrl: "",
			studentPortalUrl: "https://student.staging.teacheros.io.vn",
		});
		const builtHome = readFileSync(join(distDir, "index.html"), "utf8");
		assert.match(
			builtHome,
			/\bhref="https:\/\/student\.staging\.teacheros\.io\.vn"[^>]*\bid="studentPortalLink"|\bid="studentPortalLink"[^>]*\bhref="https:\/\/student\.staging\.teacheros\.io\.vn"/,
		);
		assert.match(
			builtHome,
			/<meta name="lead-api" content="https:\/\/api\.teacheros\.io\.vn">/,
		);
		const builtPlacement = readFileSync(
			join(distDir, "kiem-tra-dau-vao", "index.html"),
			"utf8",
		);
		assert.equal(/studentPortalLink/.test(builtPlacement), false);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});

test("inline <style> blocks have balanced curly braces (#560)", () => {
	const styleBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
	assert.ok(styleBlocks.length >= 1, "expected at least 1 inline <style>");
	for (const [, cssRaw] of styleBlocks) {
		const withoutComments = cssRaw
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
		let depth = 0;
		for (const ch of withoutComments) {
			if (ch === "{") depth += 1;
			else if (ch === "}") {
				depth -= 1;
				assert.ok(depth >= 0, "unexpected closing '}' in <style>");
			}
		}
		assert.equal(depth, 0, "unclosed '{' in <style>");
	}
});

test("landing page has 8 blocks in order and preserves critical anchors (#600)", () => {
	const blockIds = [
		"thanh-tin-cay",
		"ban-dang-o-dau",
		"ba-khoa-hoc",
		"hoc-vien-noi-gi",
		"vi-sao-khac",
		"quy-trinh-4-buoc",
		"co-my-la-ai",
		"dang-ky-tu-van",
	];
	let lastIndex = -1;
	for (const id of blockIds) {
		const pos = html.indexOf(`id="${id}"`);
		assert.ok(pos > -1, `missing block #${id}`);
		assert.ok(pos > lastIndex, `block #${id} is out of order`);
		lastIndex = pos;
	}
	const compatAnchors = [
		"khoa-hoc",
		"bang-chung",
		"quy-trinh",
		"chung-chi",
		"dang-ky",
		"hoc-vien",
		"co-my",
		"hoi-dap",
	];
	for (const anchor of compatAnchors) {
		assert.match(
			html,
			new RegExp(`id="${anchor}"`),
			`missing backwards-compatible anchor #${anchor}`,
		);
	}
	assert.match(
		html,
		/id="lam-test-mien-phi"/,
		"missing anchor #lam-test-mien-phi",
	);
	assert.match(html, /id="dang-ky-tu-van"/, "missing anchor #dang-ky-tu-van");
});

test("legacy elements removed: no copyAllLinksBtn or cefrDetailPanel on root index.html (#600)", () => {
	assert.ok(!html.includes('id="copyAllLinksBtn"'));
	assert.ok(!html.includes('id="cefrDetailPanel"'));
});

test("anti-placeholder: no '[ ... ]' or 'TODO' visible in root index.html (#600)", () => {
	assert.ok(!html.includes("[ ... ]"));
	assert.ok(!html.includes("[...]"));
	assert.ok(!/\bTODO\b/.test(html));
});

test("internal page apps/profile/public/noi-bo/index.html is protected with noindex (#600)", () => {
	const noiBoPath = new URL("noi-bo/index.html", publicDir);
	assert.ok(existsSync(noiBoPath), "noi-bo/index.html must exist");
	const noiBoHtml = readFileSync(noiBoPath, "utf8");
	assert.match(
		noiBoHtml,
		/<meta\s+name="robots"\s+content="noindex,nofollow"\s*\/?>/,
	);
	assert.ok(
		!html.includes("noi-bo"),
		"root index.html must not link to noi-bo",
	);
});

test("kiem-tra-dau-vao/test.js embeds CEFR Level Explorer in test results (#600)", () => {
	const testJs = readFileSync(
		new URL("kiem-tra-dau-vao/test.js", publicDir),
		"utf8",
	);
	assert.ok(testJs.includes("createCefrExplorer"));
	assert.ok(testJs.includes("CEFR_EXPLORER_DATA"));
	assert.ok(testJs.includes("cefrDetailPanel"));
});

test("image lightbox dialog exists with proper controls and is balanced (#600)", () => {
	assert.match(
		html,
		/<dialog\s+id="imgModal"[^>]*>[\s\S]*?id="closeImgModal"[\s\S]*?id="modalImg"[\s\S]*?<\/dialog>/,
	);
});

test("new editorial design blocks, carousel, and no broken/draft placeholders (#699)", () => {
	assert.match(html, /class="hero-quote-card"/);
	assert.equal((html.match(/class="trust-stat"/g) ?? []).length, 4);
	assert.equal((html.match(/class="track-card\b/g) ?? []).length, 3);
	assert.equal((html.match(/class="proof-card"/g) ?? []).length, 3);

	const reasonListMatch = html.match(
		/<ol\s+class="reason-list"[^>]*>([\s\S]*?)<\/ol>/,
	);
	assert.ok(reasonListMatch, 'expected <ol class="reason-list">');
	const reasonItems = [
		...reasonListMatch[1].matchAll(/<li>([\s\S]*?)<\/li>/g),
	].map((m) => m[1]);
	assert.equal(reasonItems.length, 3);
	for (const item of reasonItems) {
		const pMatch = item.match(/<p>([\s\S]*?)<\/p>/);
		assert.ok(
			pMatch && pMatch[1].trim().length > 10,
			"each reason must have non-empty <p>",
		);
	}

	assert.match(html, /class="workflow-grid four-steps"/);
	assert.equal((html.match(/class="step-card\b/g) ?? []).length, 4);
	assert.match(html, /<details\s+class="pdf-links"\s+id="ho-so-pdf">/);
	assert.match(html, /id="certCarousel"/);
	assert.match(html, /id="certPrevBtn"/);
	assert.match(html, /id="certNextBtn"/);
	assert.match(html, /id="mobileStickyCta"/);
	assert.match(html, /id="leadSuccessBox"/);
	assert.match(html, /id="generatedMsgBox"/);
	assert.match(html, /id="pdfModal"/);
	assert.match(html, /8\+\s*năm/);
	assert.match(html, /Nhắn Zalo để nhận báo giá/);

	assert.ok(!html.includes("/src/imports/"), "no broken /src/imports/ paths");
	assert.ok(
		!/đang cập nhật/i.test(html),
		"no draft 'đang cập nhật' placeholder",
	);
});

test("internal page noi-bo uses warm paper design, ../ home link, and 3 copy buttons (#699)", () => {
	const noiBoHtml = readFileSync(
		new URL("noi-bo/index.html", publicDir),
		"utf8",
	);
	assert.match(noiBoHtml, /#F7F4EC/i);
	assert.match(noiBoHtml, /<a\s+href="\.\.\/"/);
	assert.equal((noiBoHtml.match(/data-copy-target=/g) ?? []).length, 3);
});

test("modal-dialog CSS avoids flex height collapse and JS resets image dimensions on close (#706)", () => {
	const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
	assert.ok(styleMatch, "index.html must contain <style> block");
	const css = styleMatch[1].replace(/\/\*[\s\S]*?\*\//g, "");

	const extractRule = (selectorPattern) => {
		const m = css.match(
			new RegExp(`(?:^|\\n)\\s*${selectorPattern}\\s*\\{([^}]*)\\}`),
		);
		assert.ok(m, `Missing CSS rule for ${selectorPattern}`);
		return m[1];
	};

	const dialogRule = extractRule("dialog\\.modal-dialog");
	assert.match(dialogRule, /width:\s*min\(94vw,\s*1080px\)/);
	assert.match(dialogRule, /max-width:\s*min\(94vw,\s*1080px\)/);
	assert.match(dialogRule, /max-height:\s*90vh/);
	assert.match(dialogRule, /max-height:\s*90dvh/);
	assert.match(dialogRule, /overflow-y:\s*auto/);

	const dialogOpenRule = extractRule("dialog\\.modal-dialog\\[open\\]");
	assert.match(dialogOpenRule, /display:\s*block/);
	assert.doesNotMatch(dialogOpenRule, /flex-direction:\s*column/);

	const backdropRule = extractRule("dialog\\.modal-dialog::backdrop");
	assert.match(backdropRule, /-webkit-backdrop-filter:\s*blur\(4px\)/);

	const headerRule = extractRule("\\.modal-header");
	assert.match(headerRule, /position:\s*sticky/);
	assert.match(headerRule, /border-top-left-radius:/);
	assert.match(headerRule, /border-top-right-radius:/);

	const headerTitleRule = extractRule("\\.modal-header h3");
	assert.match(headerTitleRule, /min-width:\s*0/);
	assert.match(headerTitleRule, /overflow-wrap:\s*break-word/);

	const headerBtnRule = extractRule("\\.modal-header \\.btn");
	assert.match(headerBtnRule, /flex-shrink:\s*0/);

	const bodyRule = extractRule("\\.modal-body");
	assert.doesNotMatch(bodyRule, /\bflex:\s*1\b/);
	assert.doesNotMatch(bodyRule, /overflow-y:\s*auto/);
	assert.match(bodyRule, /border-bottom-left-radius:/);
	assert.match(bodyRule, /border-bottom-right-radius:/);

	const pdfRule = extractRule("\\.pdf-iframe");
	assert.match(pdfRule, /calc\(90vh\s*-\s*150px\)/);
	assert.match(pdfRule, /calc\(90dvh\s*-\s*150px\)/);

	const lightboxRule = extractRule("\\.lightbox-img");
	assert.match(lightboxRule, /width:\s*auto/);
	assert.match(lightboxRule, /height:\s*auto/);
	assert.match(lightboxRule, /max-width:\s*100%/);
	assert.match(lightboxRule, /object-fit:\s*contain/);
	assert.match(lightboxRule, /calc\(90vh\s*-\s*150px\)/);
	assert.match(lightboxRule, /calc\(90dvh\s*-\s*150px\)/);

	assert.match(html, /el\.querySelector\(\s*['"]img['"]\s*\)/);
	assert.match(html, /modalImg\.width\s*=\s*thumb\.naturalWidth/);
	assert.match(html, /modalImg\.height\s*=\s*thumb\.naturalHeight/);
	assert.match(html, /imgModal\.scrollTop\s*=\s*0/);
	assert.match(html, /modal\.getBoundingClientRect\(\)/);
	assert.match(html, /modalImg\.removeAttribute\(\s*['"]width['"]\s*\)/);
	assert.match(html, /modalImg\.removeAttribute\(\s*['"]height['"]\s*\)/);
	assert.match(html, /pdfModal\.addEventListener\(\s*['"]close['"]/);
});

const utf16BeDecoder = new TextDecoder("utf-16be");

function decodeUtf16BeHex(hex) {
	const clean = hex.replace(/\s+/g, "");
	const normalized = clean.length % 2 === 0 ? clean : `${clean}0`;
	const bytes = Buffer.from(normalized, "hex");
	if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
		return utf16BeDecoder.decode(bytes.subarray(2));
	}
	return utf16BeDecoder.decode(bytes);
}

function unescapePdfLiteral(raw) {
	const withoutLineCont = raw.replace(/\\\r?\n/g, "");
	const unescaped = withoutLineCont.replace(
		/\\([nrtbf()\\]|[0-7]{1,3})/g,
		(_, seq) => {
			switch (seq) {
				case "n":
					return "\n";
				case "r":
					return "\r";
				case "t":
					return "\t";
				case "b":
					return "\b";
				case "f":
					return "\f";
				case "(":
				case ")":
				case "\\":
					return seq;
				default:
					return String.fromCharCode(Number.parseInt(seq, 8));
			}
		},
	);
	if (unescaped.startsWith("\u00fe\u00ff")) {
		return utf16BeDecoder.decode(Buffer.from(unescaped.slice(2), "latin1"));
	}
	return unescaped;
}

function extractBalancedDict(text, startIdx) {
	const openIdx = text.indexOf("<<", startIdx);
	if (openIdx === -1) return null;
	let depth = 0;
	let parenDepth = 0;
	for (let i = openIdx; i < text.length - 1; i++) {
		const ch = text[i];
		if (ch === "\\" && parenDepth > 0) {
			i++;
			continue;
		}
		if (ch === "(") {
			parenDepth++;
			continue;
		}
		if (ch === ")" && parenDepth > 0) {
			parenDepth--;
			continue;
		}
		if (parenDepth === 0 && ch === "<" && text[i + 1] === "<") {
			depth++;
			i++;
			continue;
		}
		if (parenDepth === 0 && ch === ">" && text[i + 1] === ">") {
			depth--;
			i++;
			if (depth === 0) {
				return text.slice(openIdx, i + 1);
			}
		}
	}
	return null;
}

function parsePdfXrefAndObjects(buf, { strictXref = false } = {}) {
	const tail = buf.subarray(Math.max(0, buf.length - 1024)).toString("latin1");
	const sxMatch = /startxref\s+(\d+)/.exec(tail);
	assert.ok(sxMatch, "PDF missing startxref");
	const startxref = Number(sxMatch[1]);
	const xrefRegion = buf.subarray(startxref).toString("latin1");
	assert.ok(xrefRegion.startsWith("xref"), "startxref does not point to xref");

	const trailerIdx = xrefRegion.indexOf("trailer");
	assert.ok(trailerIdx > 0, "PDF missing trailer");
	const trailerText = xrefRegion.slice(trailerIdx);
	const xrefLines = xrefRegion
		.slice(0, trailerIdx)
		.split(/\r?\n/)
		.filter((line) => line.length > 0);
	assert.equal(xrefLines[0].trim(), "xref");

	const entries = new Map();
	let cursor = 1;
	while (cursor < xrefLines.length) {
		const headerMatch = /^(\d+)\s+(\d+)\s*$/.exec(xrefLines[cursor]);
		assert.ok(headerMatch, `Invalid xref subsection: ${xrefLines[cursor]}`);
		const startId = Number(headerMatch[1]);
		const count = Number(headerMatch[2]);
		cursor++;
		for (let j = 0; j < count; j++) {
			const row = xrefLines[cursor + j];
			const rowMatch = /^(\d{10}) (\d{5}) ([nf])\s*$/.exec(row);
			assert.ok(rowMatch, `Invalid xref row: ${JSON.stringify(row)}`);
			entries.set(startId + j, {
				offset: Number(rowMatch[1]),
				gen: Number(rowMatch[2]),
				type: rowMatch[3],
			});
		}
		cursor += count;
	}

	if (strictXref) {
		const sizeMatch = /\/Size\s+(\d+)/.exec(trailerText);
		assert.ok(sizeMatch, "Trailer missing /Size");
		assert.equal(
			entries.size,
			Number(sizeMatch[1]),
			`xref entry count (${entries.size}) does not match trailer /Size (${sizeMatch[1]})`,
		);
		const rawXrefBytes = buf.subarray(startxref, startxref + trailerIdx);
		const rawLines = rawXrefBytes.toString("latin1").match(/[^\n]*\n/g) ?? [];
		for (const line of rawLines) {
			if (/^\d{10} \d{5} [nf]/.test(line)) {
				assert.equal(
					Buffer.byteLength(line, "latin1"),
					20,
					`Expected 20-byte xref entry, got ${Buffer.byteLength(line, "latin1")}: ${JSON.stringify(line)}`,
				);
			}
		}
	}

	const liveObjects = [];
	for (const [id, entry] of entries.entries()) {
		if (entry.type === "n") {
			liveObjects.push({ id, gen: entry.gen, offset: entry.offset });
		}
	}
	liveObjects.sort((a, b) => a.offset - b.offset);

	const objects = new Map();
	for (let i = 0; i < liveObjects.length; i++) {
		const current = liveObjects[i];
		const end =
			i + 1 < liveObjects.length ? liveObjects[i + 1].offset : startxref;
		const chunk = buf.subarray(current.offset, end);
		if (strictXref) {
			const head = chunk.subarray(0, 48).toString("latin1");
			assert.ok(
				head.startsWith(`${current.id} ${current.gen} obj`),
				`xref offset mismatch for obj ${current.id}: got ${JSON.stringify(head)}`,
			);
		}
		objects.set(current.id, chunk);
	}

	return { entries, objects, trailerText };
}

function getObjectHeaderText(chunk) {
	const scanLen = Math.min(chunk.length, 65536);
	const preview = chunk.subarray(0, scanLen).toString("latin1");
	const streamIdx = preview.search(/>>\s*stream\r?\n/);
	return streamIdx === -1 ? preview : preview.slice(0, streamIdx + 2);
}

function resolveIndirectInt(objects, refId) {
	if (!objects) return null;
	const target = objects.get(refId);
	if (!target) return null;
	const match = /^\d+\s+\d+\s+obj\s+(\d+)\s+endobj\b/.exec(
		target.subarray(0, 128).toString("latin1"),
	);
	return match ? Number(match[1]) : null;
}

function extractObjectStream(
	chunk,
	{ objects = null, strictXref = false } = {},
) {
	const headerPreview = chunk
		.subarray(0, Math.min(chunk.length, 65536))
		.toString("latin1");
	const streamMatch = />>\s*stream\r?\n/.exec(headerPreview);
	if (!streamMatch) return null;
	const streamStart = streamMatch.index + streamMatch[0].length;
	const dictHeader = headerPreview.slice(0, streamMatch.index);
	const inlineLenMatch = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dictHeader);
	const indirectLenMatch = /\/Length\s+(\d+)\s+\d+\s+R/.exec(dictHeader);
	let explicitLen = inlineLenMatch ? Number(inlineLenMatch[1]) : null;
	if (explicitLen === null && indirectLenMatch) {
		explicitLen = resolveIndirectInt(objects, Number(indirectLenMatch[1]));
	}
	let rawStream;
	if (explicitLen !== null) {
		rawStream = chunk.subarray(streamStart, streamStart + explicitLen);
		if (strictXref) {
			const endPreview = chunk
				.subarray(streamStart + explicitLen, streamStart + explicitLen + 16)
				.toString("latin1");
			assert.match(
				endPreview,
				/^\r?\nendstream\b/,
				`Stream /Length (${explicitLen}) does not end cleanly before endstream`,
			);
		}
	} else {
		const endIdx = chunk.lastIndexOf(Buffer.from("endstream"));
		assert.ok(endIdx > streamStart, "Missing endstream");
		rawStream = chunk.subarray(streamStart, endIdx);
		while (
			rawStream.length > 0 &&
			(rawStream[rawStream.length - 1] === 0x0a ||
				rawStream[rawStream.length - 1] === 0x0d)
		) {
			rawStream = rawStream.subarray(0, rawStream.length - 1);
		}
	}
	if (/\/FlateDecode\b/.test(dictHeader)) {
		return inflateSync(rawStream);
	}
	return rawStream;
}

function parseToUnicodeCMap(cmapText) {
	const map = new Map();
	let keyHexLen = 4;
	const csMatch = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(
		cmapText,
	);
	if (csMatch) {
		const firstRange = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/.exec(csMatch[1]);
		if (firstRange) {
			keyHexLen = firstRange[1].length;
		}
	}

	for (const blockMatch of cmapText.matchAll(
		/beginbfchar([\s\S]*?)endbfchar/g,
	)) {
		for (const pair of blockMatch[1].matchAll(
			/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
		)) {
			keyHexLen = pair[1].length;
			map.set(pair[1].toUpperCase(), decodeUtf16BeHex(pair[2]));
		}
	}

	for (const blockMatch of cmapText.matchAll(
		/beginbfrange([\s\S]*?)endbfrange/g,
	)) {
		const body = blockMatch[1];
		const entryRe =
			/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:\[([^\]]+)\]|<([0-9A-Fa-f]+)>)/g;
		for (const entry of body.matchAll(entryRe)) {
			const lo = Number.parseInt(entry[1], 16);
			const hi = Number.parseInt(entry[2], 16);
			const width = entry[1].length;
			keyHexLen = width;
			if (entry[3]) {
				const dests = [...entry[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map(
					(m) => m[1],
				);
				for (let code = lo; code <= hi; code++) {
					const dest = dests[code - lo];
					if (dest) {
						map.set(
							code.toString(16).toUpperCase().padStart(width, "0"),
							decodeUtf16BeHex(dest),
						);
					}
				}
			} else if (entry[4]) {
				const baseHex = entry[4];
				const prefix = baseHex.slice(0, -4);
				const baseTail = Number.parseInt(baseHex.slice(-4), 16);
				for (let code = lo; code <= hi; code++) {
					const dstHex =
						prefix +
						(baseTail + (code - lo))
							.toString(16)
							.toUpperCase()
							.padStart(4, "0");
					map.set(
						code.toString(16).toUpperCase().padStart(width, "0"),
						decodeUtf16BeHex(dstHex),
					);
				}
			}
		}
	}

	return { map, keyHexLen };
}

function decodeHexWithCMap(hexStr, cmap) {
	const hex = hexStr.replace(/\s+/g, "").toUpperCase();
	const step = cmap?.keyHexLen ?? 2;
	let out = "";
	for (let i = 0; i + step <= hex.length; i += step) {
		const code = hex.slice(i, i + step);
		out += cmap?.map.get(code) ?? "";
	}
	return out;
}

function resolveSubDictText(resourcesText, keyName, objects) {
	const keyMatch = new RegExp(`/${keyName}\\b`).exec(resourcesText);
	if (!keyMatch) return "";
	const afterKey = resourcesText
		.slice(keyMatch.index + keyMatch[0].length)
		.trimStart();
	if (afterKey.startsWith("<<")) {
		return extractBalancedDict(afterKey, 0) ?? "";
	}
	const refMatch = /^(\d+)\s+\d+\s+R/.exec(afterKey);
	if (refMatch) {
		const target = objects.get(Number(refMatch[1]));
		if (target) return getObjectHeaderText(target);
	}
	return "";
}

function buildFontCMapTable(resourcesText, objects, strictXref = false) {
	const table = new Map();
	const fontDictText = resolveSubDictText(resourcesText, "Font", objects);
	if (!fontDictText) return table;
	for (const fm of fontDictText.matchAll(
		/\/([^\s/()<>[\]{}%]+)\s+(\d+)\s+\d+\s+R/g,
	)) {
		const fontName = fm[1];
		const fontObj = objects.get(Number(fm[2]));
		if (!fontObj) continue;
		const tuMatch = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(
			getObjectHeaderText(fontObj),
		);
		if (!tuMatch) continue;
		const tuObj = objects.get(Number(tuMatch[1]));
		if (!tuObj) continue;
		const tuStream = extractObjectStream(tuObj, { objects, strictXref });
		if (!tuStream) continue;
		table.set(fontName, parseToUnicodeCMap(tuStream.toString("latin1")));
	}
	return table;
}

function decodeContentStreamText(streamText, fontCMaps) {
	let currentFont = null;
	let raw = "";
	const joinedParts = [];
	const tokenRe =
		/\/([^\s/()<>[\]{}%]+)\s+[-+]?\d*\.?\d+\s+Tf|\[((?:\\.|[^\]])*?)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*(?:Tj|'|")|\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
	for (const match of streamText.matchAll(tokenRe)) {
		if (match[1]) {
			currentFont = match[1];
		} else if (match[2] !== undefined) {
			const cmap = currentFont ? fontCMaps.get(currentFont) : null;
			let arrayText = "";
			for (const item of match[2].matchAll(
				/<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\)])*)\)/g,
			)) {
				if (item[1] !== undefined) {
					arrayText += decodeHexWithCMap(item[1], cmap);
				} else if (item[2] !== undefined) {
					arrayText += unescapePdfLiteral(item[2]);
				}
			}
			raw += arrayText;
			if (arrayText.trim().length > 0) joinedParts.push(arrayText);
		} else if (match[3] !== undefined) {
			const cmap = currentFont ? fontCMaps.get(currentFont) : null;
			const piece = decodeHexWithCMap(match[3], cmap);
			raw += piece;
			if (piece.trim().length > 0) joinedParts.push(piece);
		} else if (match[4] !== undefined) {
			const piece = unescapePdfLiteral(match[4]);
			raw += piece;
			if (piece.trim().length > 0) joinedParts.push(piece);
		}
	}
	return {
		raw: raw.normalize("NFC"),
		joined: joinedParts.join(" ").normalize("NFC"),
	};
}

function collectPageNodes(objects, trailerText) {
	const pages = [];
	const rootMatch = /\/Root\s+(\d+)\s+\d+\s+R/.exec(trailerText);
	if (rootMatch) {
		const rootObj = objects.get(Number(rootMatch[1]));
		const pagesMatch = rootObj
			? /\/Pages\s+(\d+)\s+\d+\s+R/.exec(getObjectHeaderText(rootObj))
			: null;
		if (pagesMatch) {
			const visited = new Set();
			const walk = (nodeId, inheritedResText) => {
				if (visited.has(nodeId)) return;
				visited.add(nodeId);
				const chunk = objects.get(nodeId);
				if (!chunk) return;
				const header = getObjectHeaderText(chunk);
				const ownRes = resolveSubDictText(header, "Resources", objects);
				const effectiveRes = ownRes || inheritedResText;
				const kidsMatch = /\/Kids\s*\[([^\]]+)\]/.exec(header);
				if (kidsMatch && /\/Type\s*\/Pages\b/.test(header)) {
					for (const ref of kidsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) {
						walk(Number(ref[1]), effectiveRes);
					}
				} else if (/\/Type\s*\/Page\b(?!s)/.test(header)) {
					pages.push({ pageText: header, inheritedResText: effectiveRes });
				}
			};
			walk(Number(pagesMatch[1]), "");
		}
	}
	if (pages.length === 0) {
		for (const [, chunk] of objects.entries()) {
			const header = getObjectHeaderText(chunk);
			if (/\/Type\s*\/Page\b(?!s)/.test(header)) {
				pages.push({
					pageText: header,
					inheritedResText: resolveSubDictText(header, "Resources", objects),
				});
			}
		}
	}
	return pages;
}

function decodeFormXObjects(
	resourcesText,
	objects,
	parentCMaps,
	strictXref,
	visited = new Set(),
) {
	const xobjDictText = resolveSubDictText(resourcesText, "XObject", objects);
	if (!xobjDictText) return { raw: "", joined: "" };
	let raw = "";
	const joinedParts = [];
	for (const xobjMatch of xobjDictText.matchAll(
		/\/([^\s/()<>[\]{}%]+)\s+(\d+)\s+\d+\s+R/g,
	)) {
		const xid = Number(xobjMatch[2]);
		if (visited.has(xid)) continue;
		const xObj = objects.get(xid);
		if (!xObj) continue;
		const xHeader = getObjectHeaderText(xObj);
		if (!/\/Subtype\s*\/Form\b/.test(xHeader)) continue;
		visited.add(xid);
		const xResText = resolveSubDictText(xHeader, "Resources", objects);
		const mergedCMaps = new Map([
			...parentCMaps,
			...buildFontCMapTable(xResText, objects, strictXref),
		]);
		const xStream = extractObjectStream(xObj, { objects, strictXref });
		if (xStream) {
			const decoded = decodeContentStreamText(
				xStream.toString("latin1"),
				mergedCMaps,
			);
			raw += decoded.raw;
			if (decoded.joined) joinedParts.push(decoded.joined);
		}
		const nested = decodeFormXObjects(
			xResText,
			objects,
			mergedCMaps,
			strictXref,
			visited,
		);
		raw += nested.raw;
		if (nested.joined) joinedParts.push(nested.joined);
	}
	return {
		raw: raw.normalize("NFC"),
		joined: joinedParts.join(" ").normalize("NFC"),
	};
}

function decodePdfDocument(buf, { strictXref = false } = {}) {
	const { objects, trailerText } = parsePdfXrefAndObjects(buf, { strictXref });
	const metadataStrings = [];

	for (const [, chunk] of objects.entries()) {
		const headerText = getObjectHeaderText(chunk);
		for (const hexMatch of headerText.matchAll(/<FEFF([0-9A-Fa-f]+)>/gi)) {
			metadataStrings.push(decodeUtf16BeHex(hexMatch[1]).normalize("NFC"));
		}
		for (const litMatch of headerText.matchAll(
			/\/(?:Title|Alt|ActualText)\s*\(((?:\\.|[^\\)])*)\)/g,
		)) {
			metadataStrings.push(unescapePdfLiteral(litMatch[1]).normalize("NFC"));
		}
		if (
			/\/Subtype\s*\/XML\b/.test(headerText) ||
			/\/Metadata\b/.test(headerText)
		) {
			const metaStream = extractObjectStream(chunk, { objects, strictXref });
			if (metaStream) {
				metadataStrings.push(metaStream.toString("utf8").normalize("NFC"));
			}
		}
	}

	const pageNodes = collectPageNodes(objects, trailerText);
	const pages = [];
	for (const { pageText, inheritedResText } of pageNodes) {
		const resourcesText =
			resolveSubDictText(pageText, "Resources", objects) || inheritedResText;
		const fontCMaps = buildFontCMapTable(resourcesText, objects, strictXref);

		const contentIds = [];
		const singleContent = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(pageText);
		const arrayContent = /\/Contents\s*\[([^\]]+)\]/.exec(pageText);
		if (singleContent) {
			contentIds.push(Number(singleContent[1]));
		} else if (arrayContent) {
			for (const ref of arrayContent[1].matchAll(/(\d+)\s+\d+\s+R/g)) {
				contentIds.push(Number(ref[1]));
			}
		}

		let raw = "";
		const joinedParts = [];
		for (const cid of contentIds) {
			const cObj = objects.get(cid);
			if (!cObj) continue;
			const decoded = extractObjectStream(cObj, { objects, strictXref });
			if (decoded) {
				const parsed = decodeContentStreamText(
					decoded.toString("latin1"),
					fontCMaps,
				);
				raw += parsed.raw;
				if (parsed.joined) joinedParts.push(parsed.joined);
			}
		}

		const formXObjText = decodeFormXObjects(
			resourcesText,
			objects,
			fontCMaps,
			strictXref,
		);
		raw += formXObjText.raw;
		if (formXObjText.joined) joinedParts.push(formXObjText.joined);

		pages.push({
			raw: raw.normalize("NFC"),
			joined: joinedParts.join(" ").normalize("NFC"),
		});
	}

	return { metadataStrings, pages };
}

function readJpegDimensions(buf) {
	assert.ok(buf.length > 4, "JPEG buffer too short");
	assert.equal(buf[0], 0xff, "Missing JPEG SOI marker");
	assert.equal(buf[1], 0xd8, "Missing JPEG SOI marker");
	let pos = 2;
	while (pos < buf.length) {
		while (pos < buf.length && buf[pos] !== 0xff) pos++;
		while (pos < buf.length && buf[pos] === 0xff) pos++;
		if (pos >= buf.length) break;
		const marker = buf[pos++];
		if (
			marker === 0x00 ||
			marker === 0x01 ||
			(marker >= 0xd0 && marker <= 0xd9)
		) {
			if (marker === 0xd9) break;
			continue;
		}
		if (marker === 0xda) break;
		assert.ok(pos + 2 <= buf.length, "Truncated JPEG segment");
		const segLen = buf.readUInt16BE(pos);
		assert.ok(
			segLen >= 2 && pos + segLen <= buf.length,
			"Invalid JPEG segment length",
		);
		if (marker === 0xc0 || marker === 0xc2) {
			assert.ok(
				segLen >= 7 && pos + 7 <= buf.length,
				"Truncated JPEG SOF frame header",
			);
			return {
				height: buf.readUInt16BE(pos + 3),
				width: buf.readUInt16BE(pos + 5),
			};
		}
		pos += segLen;
	}
	assert.fail("JPEG missing SOF0/SOF2 frame header");
}

test("teacher-profile PDFs and thumbnails use Đỗ Thục Mỹ without Đỗ Thị Thục Mỹ", () => {
	const baseAssetDir = new URL(
		"../public/assets/teacher-profile/",
		import.meta.url,
	);
	const pdfNames = [
		"01-Ms-Thuc-My-Teacher-Profile-EN.pdf",
		"02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf",
		"03-Quy-Trinh-Dao-Tao-IELTS-365-Ngay-VN.pdf",
		"04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf",
		"05-Ms-Thuc-My-CV-1Page-Pure-EN.pdf",
	];
	const strictFiles = new Set([
		"02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf",
		"04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf",
	]);

	const expectedThumbDims = {
		"01-Ms-Thuc-My-Teacher-Profile-EN.jpg": { width: 700, height: 470 },
		"02-Ho-So-Giang-Vien-Co-Thuc-My-VN.jpg": { width: 700, height: 470 },
		"03-Quy-Trinh-Dao-Tao-IELTS-365-Ngay-VN.jpg": { width: 700, height: 470 },
		"04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.jpg": {
			width: 700,
			height: 470,
		},
		"05-Ms-Thuc-My-CV-1Page-Pure-EN.jpg": { width: 495, height: 700 },
	};

	for (const name of pdfNames) {
		const buf = readFileSync(new URL(`pdf/${name}`, baseAssetDir));
		const doc = decodePdfDocument(buf, { strictXref: strictFiles.has(name) });
		assert.ok(doc.pages.length >= 1, `${name} should have at least 1 page`);
		const allRawText = doc.pages.map((p) => p.raw).join("\n");
		const allJoinedText = doc.pages.map((p) => p.joined).join("\n");
		assert.ok(
			allRawText.length > 50,
			`${name} decoded page text unexpectedly short`,
		);
		for (const meta of doc.metadataStrings) {
			assert.doesNotMatch(
				meta,
				/Đỗ\s*Thị|Thị\s*Thục/i,
				`${name} metadata still contains Đỗ Thị / Thị Thục: ${meta}`,
			);
			assert.doesNotMatch(
				meta,
				/Đỗ {2,}Thục/,
				`${name} metadata contains double space between Đỗ and Thục: ${meta}`,
			);
		}
		assert.doesNotMatch(
			allRawText,
			/Đỗ\s*Thị|Thị\s*Thục/i,
			`${name} raw page content still contains Đỗ Thị / Thị Thục`,
		);
		assert.doesNotMatch(
			allJoinedText,
			/Đỗ\s*Thị|Thị\s*Thục/i,
			`${name} joined page content still contains Đỗ Thị / Thị Thục`,
		);
		assert.doesNotMatch(
			allRawText,
			/Đỗ {2,}Thục/,
			`${name} contains double space between Đỗ and Thục`,
		);

		if (name === "02-Ho-So-Giang-Vien-Co-Thuc-My-VN.pdf") {
			assert.equal(doc.pages.length, 6);
			assert.ok(
				doc.metadataStrings.includes(
					"Hồ Sơ Giảng Viên — Cô Đỗ Thục Mỹ (Bản Minh Họa Đầy Đủ)",
				),
			);
			assert.ok(doc.metadataStrings.includes("Cô Đỗ Thục Mỹ"));
			assert.ok(doc.pages[0].raw.includes("Cô Đỗ Thục Mỹ"));
			assert.match(doc.pages[0].raw, /[^ô]\s*Đỗ Thục Mỹ\s*\(“Ms\. Thục Mỹ”\)/);
			assert.ok(doc.pages[0].raw.includes("Trang 01 / 06"));
			assert.ok(doc.pages[5].raw.includes("Cô Đỗ Thục Mỹ"));
			assert.ok(doc.pages[5].raw.includes("Cảm ơn bạn đã theo dõi hồ sơ!"));
		}

		if (name === "04-Bang-Gioi-Thieu-Fanpage-The-English-Corner.pdf") {
			assert.equal(doc.pages.length, 4);
			assert.ok(
				doc.pages[0].raw.includes(
					"Bảng 1: 6 Bảo Chứng Chuyên Môn Của Cô Đỗ Thục Mỹ",
				),
			);
		}

		const thumbName = name.replace(/\.pdf$/, ".jpg");
		const thumbUrl = new URL(`thumbs/${thumbName}`, baseAssetDir);
		assert.equal(existsSync(thumbUrl), true, `Missing thumbnail ${thumbName}`);
		const dims = readJpegDimensions(readFileSync(thumbUrl));
		assert.deepEqual(
			dims,
			expectedThumbDims[thumbName],
			`${thumbName} must match expected dimensions`,
		);
	}
});
