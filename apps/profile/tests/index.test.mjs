import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
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
