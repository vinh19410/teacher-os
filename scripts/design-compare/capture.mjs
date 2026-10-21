#!/usr/bin/env node
/*
 * Harness chụp đối chiếu design v2 ↔ app (plan 261020-1446-378, phase 1).
 *
 * Dùng:
 *   node scripts/design-compare/capture.mjs [--screens all|id1,id2]
 *        [--side design|app|both] [--label old|new] [--keep-design]
 *
 * - Tự boot stack e2e trên free port mỗi run (#397 — không đụng worktree AI
 *   song song / dev stack; boot:api xoá local.db mỗi lần → luôn chạy seed
 *   mới), chạy apps/e2e/scripts/design-seed.ts để tạo dữ liệu.
 * - Design v2 chạy qua scripts/design-compare/fetch-design.sh
 *   (DESIGN_PORT env, mặc định :8200 khi chạy riêng; capture chọn free port).
 * - Ảnh raw ghi vào scripts/design-compare/.state/raw/<label>/ (git-ignored);
 *   ảnh ghép side-by-side ghi vào
 *   plans/261020-1446-378-redesign-design-v2/screenshots/<id>/<viewport>-<theme>.png
 *   với cột Design v2 | App cũ (nếu có raw "old") | App mới.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const requireE2E = createRequire(path.join(ROOT, "apps/e2e/package.json"));
const { chromium } = requireE2E("@playwright/test");

// #397: port cố định 8100/8101/8103 bị các worktree AI song song (mỗi issue
// một worktree, cùng override E2E_*_PORT) và dev stack chiếm — signup khi đó
// đi vào API của worktree KHÁC, seed đọc local.db của worktree mình →
// "no org yet" vĩnh viễn dù kernel 200 (diagnostics của fix đã bắt live:
// request sent +649ms -> response 200 +656ms rồi poll rỗng 21.75s). Chọn
// free port mỗi run để harness miễn nhiễm xung đột.
const freePort = () =>
	new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address();
			srv.close(() => resolve(port));
		});
		srv.on("error", reject);
	});
const [API_PORT, WEB_PORT, STUDENT_PORT, DESIGN_PORT] = await Promise.all([
	freePort(),
	freePort(),
	freePort(),
	freePort(),
]);
const WEB = `http://localhost:${WEB_PORT}`;
const STUDENT = `http://localhost:${STUDENT_PORT}`;
const DESIGN = `http://localhost:${DESIGN_PORT}`;
const API = `http://localhost:${API_PORT}`;

const PLAN_DIR = path.join(ROOT, "plans/261020-1446-378-redesign-design-v2");
const SHOTS = path.join(PLAN_DIR, "screenshots");
const STATE = path.join(HERE, ".state");
const RAW = path.join(STATE, "raw");
const SEED_FILE = path.join(STATE, "design-seed.json");
const VERDICT = path.join(PLAN_DIR, "screenshots", "verdict.md");

// ── args ─────────────────────────────────────────────────────────────────
const arg = (name, dflt) => {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : dflt;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);
const screensArg = arg("screens", "all");
const side = arg("side", "both");
const label = arg("label", "new");
const keepDesign = hasFlag("keep-design");

const cfg = JSON.parse(await readFile(path.join(HERE, "screens.json"), "utf8"));
let seed = null;
try {
	seed = JSON.parse(await readFile(SEED_FILE, "utf8"));
} catch {
	/* seeded below */
}
const fill = (tpl) =>
	tpl.replace(/\{seed\.(\w+)\}/g, (_, k) => {
		if (!seed || !(k in seed))
			throw new Error(`seed.${k} thiếu trong ${SEED_FILE}`);
		return String(seed[k]);
	});

const wantAll = screensArg === "all";
const wanted = wantAll
	? cfg.screens.map((s) => s.id)
	: new Set(screensArg.split(","));
const screens = cfg.screens.filter((s) => wantAll || wanted.has(s.id));
if (screens.length === 0) {
	console.error(`không có màn khớp --screens ${screensArg}`);
	process.exit(2);
}

// ── process helpers ──────────────────────────────────────────────────────
const children = [];
const outputTail = new Map();
// #397: log api chứa URL verify-email/reset mang ?token=… (redactResetToken
// phía server chỉ cover reset-password + pay). Redact tại điểm collect, trên
// buffer ĐÃ NỐI (token có thể cắt ngang biên chunk) — phủ cả dump của waitUrl
// lẫn dump seed-fail.
const TOKEN_RE = /([?&]token=)[^\s&"']+/gi;
const redactLog = (s) => s.replace(TOKEN_RE, "$1[redacted]");
function start(name, cmd, opts = {}) {
	const child = spawn(cmd, {
		cwd: ROOT,
		// #397 (smoke run): SIGTERM cho wrapper pnpm chỉ giết pnpm — node cháu
		// (vite/boot:api) sống thành orphan, chiếm 8100/8101/8103 khiến lần chạy
		// sau EADDRINUSE chết im lặng và waitUrl chạm vào stack CŨ (DB không
		// wipe). detached + kill cả process group đảm bảo dọn sạch cả cây.
		detached: process.platform !== "win32",
		env: {
			...process.env,
			E2E_API_PORT: String(API_PORT),
			E2E_WEB_PORT: String(WEB_PORT),
			E2E_STUDENT_PORT: String(STUDENT_PORT),
			VITE_SERVER_URL: API,
			...opts.env,
		},
		shell: true,
		stdio: ["ignore", "pipe", "pipe"],
		...opts.spawn,
	});
	children.push(child);
	// Redact trên RAW buffer có carry-over đuôi (review #397 F4): nếu redact
	// trên buf ĐÃ redact rồi slice, token cắt ngang biên slice mất tiền tố
	// `token=` → đuôi token lọt log. rawTail giữ ~100 ký tự raw cuối để nối
	// với chunk kế trước khi redact.
	let rawTail = "";
	let buf = "";
	const collect = (d) => {
		const raw = rawTail + d;
		rawTail = raw.slice(-100);
		// Pass 2 sau slice: slice(-4000) có thể cắt token giữa chừng — pass 2
		// redact nút prefix còn lại trong buf.
		buf = redactLog(redactLog(raw).slice(-4000));
		outputTail.set(name, buf);
	};
	child.stdout.on("data", collect);
	child.stderr.on("data", collect);
	return child;
}
async function waitUrl(url, { timeoutMs = 150_000, name = url } = {}) {
	const t0 = Date.now();
	for (;;) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 304) return;
		} catch {
			/* not up yet */
		}
		if (Date.now() - t0 > timeoutMs) {
			throw new Error(
				`timeout chờ ${name} (${url})\n--- log ---\n${[...outputTail.entries()]
					.map(([n, b]) => `## ${n}\n${b}`)
					.join("\n")}`,
			);
		}
		const { promise, resolve } = Promise.withResolvers();
		setTimeout(resolve, 500);
		await promise;
	}
}
function cleanup() {
	for (const c of children) {
		try {
			// Âm pid = cả process group (xem detached ở start()); fallback pid dương
			// cho trường hợp group đã tan hoặc Windows.
			if (c.pid != null && process.platform !== "win32")
				process.kill(-c.pid, "SIGTERM");
			else c.kill("SIGTERM");
		} catch {
			/* gone */
		}
	}
	if (!keepDesign) {
		spawnSync("bash", [path.join(HERE, "fetch-design.sh"), "stop"], {
			cwd: ROOT,
			env: { ...process.env, DESIGN_PORT: String(DESIGN_PORT) },
		});
	}
}
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
// Runner AI/timeout thường kill bằng SIGTERM hoặc đóng terminal (SIGHUP) —
// 'exit' handler không chạy khi đó, các process group con thành orphan (#397:
// chính kiểu orphan này dồn RAM/CPU gây máy quá tải). exit() để 'exit' chạy.
process.on("SIGTERM", () => process.exit(143));
process.on("SIGHUP", () => process.exit(129));

// ── servers ──────────────────────────────────────────────────────────────
const browser = await chromium.launch();
// HTTP 200 của vite dev ≠ sẵn sàng cho browser: lần load đầu kích hoạt
// dep-optimization và React có thể không mount trong ~30s. Warm bằng cách
// chờ selector thật của trang auth trước khi seed/chụp.
async function warm(url, selector) {
	const page = await browser.newPage();
	try {
		await page.goto(url, { waitUntil: "load" });
		await page.waitForSelector(selector, { timeout: 120_000 });
	} finally {
		await page.context().close();
	}
}

const needApp = side === "app" || side === "both";
if (needApp) {
	console.log("[harness] boot api…");
	start("api", "pnpm --filter e2e run boot:api", {
		env: { E2E_HOSTNAME: "127.0.0.1" },
	});
	await waitUrl(`${API}/readyz`, { name: "api" });
	console.log("[harness] boot web…");
	start("web", `pnpm --filter web exec vite --port ${WEB_PORT} --strictPort`);
	await waitUrl(`${WEB}/`, { name: "web" });
	console.log("[harness] boot student…");
	start(
		"student",
		`pnpm --filter student exec vite --port ${STUDENT_PORT} --strictPort`,
	);
	await waitUrl(`${STUDENT}/login`, { name: "student" });
	await warm(`${WEB}/login`, "#su-name");
	// #397: chưa có session nên /dashboard redirect về /login?returnUrl —
	// warm được shared graph (router, auth client, auth gate). Chunk riêng của
	// dashboard vẫn lạnh; vòng kernel-wait của design-seed phủ phần đó.
	await warm(`${WEB}/dashboard`, "#su-name");
	await warm(`${STUDENT}/login`, "#tab-signup");

	console.log("[harness] seed dữ liệu so sánh…");
	const seeded = spawnSync(
		"pnpm",
		["--filter", "e2e", "exec", "tsx", "scripts/design-seed.ts"],
		{
			cwd: ROOT,
			env: {
				...process.env,
				E2E_API_PORT: String(API_PORT),
				E2E_WEB_PORT: String(WEB_PORT),
				E2E_STUDENT_PORT: String(STUDENT_PORT),
			},
			encoding: "utf8",
			// #397 review: worst-case seed = 60s waitForURL + 120s kernel wait +
			// ~22s DB busy-retry + thân seed (~44s khoẻ) → 300s cũ có thể SIGTERM
			// giữa chừng đúng trên máy đang tải mà issue nhắm tới.
			timeout: 420_000,
		},
	);
	if (seeded.status !== 0) {
		console.error(
			`[harness] seed thất bại:\n${redactLog(String(seeded.stdout))}\n${redactLog(String(seeded.stderr))}\n--- log stack (api/web/student) ---\n${[
				...outputTail.entries(),
			]
				.map(([n, b]) => `## ${n}\n${b}`)
				.join("\n")}`,
		);
		process.exit(1);
	}
	seed = JSON.parse(await readFile(SEED_FILE, "utf8"));
	console.log("[harness] seed xong");
}
if (side === "design" || side === "both") {
	console.log("[harness] design v2…");
	const r = spawnSync("bash", [path.join(HERE, "fetch-design.sh"), "run"], {
		cwd: ROOT,
		env: { ...process.env, DESIGN_PORT: String(DESIGN_PORT) },
		encoding: "utf8",
		timeout: 300_000,
	});
	if (r.status !== 0) {
		console.error(
			`[harness] design v2 không chạy được:\n${r.stdout}\n${r.stderr}`,
		);
		process.exit(1);
	}
	await waitUrl(`${DESIGN}/`, { name: "design v2" });
}

// ── capture ──────────────────────────────────────────────────────────────
await mkdir(RAW, { recursive: true });
await mkdir(SHOTS, { recursive: true });
const failures = [];
const done = [];

async function newPage(browser, { url, theme, viewport, storageState }) {
	const ctx = await browser.newContext({
		viewport: { width: viewport[0], height: viewport[1] },
		reducedMotion: "reduce",
		serviceWorkers: "block",
		...(storageState ? { storageState } : {}),
	});
	await ctx.addInitScript(
		(t) => window.localStorage.setItem("theme", t),
		theme,
	);
	const page = await ctx.newPage();
	await page.goto(url, { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	return { ctx, page };
}

async function settle(page) {
	await page.evaluate(() => document.fonts.ready);
	try {
		await page.waitForLoadState("networkidle", { timeout: 8_000 });
	} catch {
		/* long-polling pages never settle — Best effort */
	}
}

async function runSteps(page, steps) {
	for (const st of steps ?? []) {
		if (st.openNav) {
			// <lg: nav nằm trong drawer — mở hamburger (lg: nút ẩn, bỏ qua).
			const burger = page.locator("button[aria-label='Open navigation']");
			if (await burger.isVisible().catch(() => false)) {
				await burger.click({ timeout: 10_000 });
				await page.waitForTimeout(400);
			}
		} else if (st.click)
			await page
				.locator(`${st.click} >> visible=true`)
				.first()
				// 20s: route lạnh lần đầu (lazy chunk + dep-optimize) hay quá 10s.
				.click({ timeout: 20_000 });
		else if (st.clickFirst)
			await page
				.locator(`${st.clickFirst} >> visible=true`)
				.first()
				// force: card design có hover:-translate-y — stability check của
				// Playwright bị oscillate ở 1 số viewport (s-vocab/tablet).
				.click({ timeout: 20_000, force: true });
		else if (st.press) await page.keyboard.press(st.press);
		else if (st.wait) await page.waitForTimeout(st.wait);
	}
}

async function shoot(page, file) {
	await page.screenshot({ path: file, fullPage: true });
}

// Ghép các PNG thành một ảnh ngang với nhãn cột.
async function compose(outFile, columns) {
	const cols = columns.filter(Boolean);
	if (cols.length === 0) return;
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({
			viewport: { width: 1400, height: 900 },
		});
		const imgs = await Promise.all(
			cols.map(async (c) => ({
				...c,
				b64: (await readFile(c.file)).toString("base64"),
			})),
		);
		const html = `<!doctype html><html><body style="margin:0;background:#fff">
<div style="display:flex;align-items:flex-start;gap:8px;padding:8px">
${imgs
	.map(
		(c) => `<figure style="margin:0;flex:1 1 0;min-width:0">
<figcaption style="font:600 14px system-ui;padding:4px 2px">${c.title}</figcaption>
<img src="data:image/png;base64,${c.b64}" style="width:100%;height:auto;display:block;border:1px solid #ddd"/>
</figure>`,
	)
	.join("\n")}
</div></body></html>`;
		await page.setContent(html);
		await page.evaluate(() => document.fonts.ready);
		await page.waitForTimeout(300);
		await page.screenshot({ path: outFile, fullPage: true });
	} finally {
		await browser.close();
	}
}

try {
	// ── app side ──
	if (needApp) {
		// Teacher: đăng nhập một lần (desktop/light) rồi dùng lại storageState.
		const teacherAuth = path.join(STATE, "teacher.json");
		{
			const { ctx, page } = await newPage(browser, {
				url: `${WEB}/login`,
				theme: "light",
				viewport: cfg.viewports.desktop,
			});
			await page.click("#tab-signin");
			await page.fill("#si-email", seed.teacherEmail);
			await page.fill("#si-password", seed.teacherPassword);
			await page.getByRole("button", { name: "Sign in" }).click();
			await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
			await ctx.storageState({ path: teacherAuth });
			await ctx.close();
		}
		const studentAuth = path.join(STATE, "student.json");
		{
			const { ctx, page } = await newPage(browser, {
				url: `${STUDENT}/login`,
				theme: "light",
				viewport: cfg.viewports.desktop,
			});
			await page.click("#tab-signin");
			await page.fill("#signin-email", seed.studentEmail);
			await page.fill("#signin-password", seed.studentPassword);
			await page.getByRole("button", { name: "Đăng nhập" }).click();
			await page.waitForURL(new RegExp(`^${STUDENT}/(\\?.*)?$`), {
				timeout: 30_000,
			});
			await ctx.storageState({ path: studentAuth });
			await ctx.close();
		}

		for (const [vpName, vp] of Object.entries(cfg.viewports)) {
			for (const theme of cfg.themes) {
				const tCtx = await browser.newContext({
					viewport: { width: vp[0], height: vp[1] },
					reducedMotion: "reduce",
					serviceWorkers: "block",
					storageState: teacherAuth,
				});
				await tCtx.addInitScript(
					(t) => window.localStorage.setItem("theme", t),
					theme,
				);
				const sCtx = await browser.newContext({
					viewport: { width: vp[0], height: vp[1] },
					reducedMotion: "reduce",
					serviceWorkers: "block",
					storageState: studentAuth,
				});
				await sCtx.addInitScript(
					(t) => window.localStorage.setItem("theme", t),
					theme,
				);
				const aCtx = await browser.newContext({
					viewport: { width: vp[0], height: vp[1] },
					reducedMotion: "reduce",
					serviceWorkers: "block",
				});
				await aCtx.addInitScript(
					(t) => window.localStorage.setItem("theme", t),
					theme,
				);
				const tPage = await tCtx.newPage();
				const sPage = await sCtx.newPage();
				const aPage = await aCtx.newPage();

				for (const sc of screens) {
					const rawFile = path.join(
						RAW,
						label,
						sc.id,
						`${vpName}-${theme}.png`,
					);
					if (!existsSync(rawFile)) {
						console.log(`[harness] app ${label} ${sc.id}/${vpName}-${theme}…`);
						try {
							if (sc.auth === "teacher") {
								await tPage.goto(`${WEB}${fill(sc.app)}`, {
									waitUntil: "load",
								});
							} else if (sc.auth === "student") {
								await sPage.goto(`${STUDENT}${fill(sc.app)}`, {
									waitUntil: "load",
								});
							} else {
								await aPage.goto(`${WEB}${fill(sc.app)}`, {
									waitUntil: "load",
								});
							}
							await settle(
								sc.auth === "student"
									? sPage
									: sc.auth === "teacher"
										? tPage
										: aPage,
							);
							await runSteps(
								sc.auth === "student"
									? sPage
									: sc.auth === "teacher"
										? tPage
										: aPage,
								sc.appSteps,
							);
							await shoot(
								sc.auth === "student"
									? sPage
									: sc.auth === "teacher"
										? tPage
										: aPage,
								rawFile,
							);
							done.push(`${sc.id}/${vpName}-${theme} (app)`);
						} catch (err) {
							failures.push(
								`app ${sc.id}/${vpName}-${theme}: ${String(err).split("\n")[0]}`,
							);
							try {
								const dbg =
									sc.auth === "student"
										? sPage
										: sc.auth === "teacher"
											? tPage
											: aPage;
								await mkdir(path.join(STATE, "debug"), { recursive: true });
								await dbg.screenshot({
									path: path.join(
										STATE,
										"debug",
										`${sc.id}-${vpName}-${theme}.png`,
									),
									fullPage: true,
								});
								console.log(
									`[harness] debug ${sc.id}: url=${dbg.url()} buttons=`,
									(
										await dbg
											.locator("button >> visible=true")
											.allTextContents()
											.catch(() => [])
									).slice(0, 20),
								);
							} catch {
								/* debug dump thất bại — bỏ qua */
							}
						}
					}
				}
				await tCtx.close();
				await sCtx.close();
				await aCtx.close();
			}
		}
	}

	// ── design side ──
	if (side === "design" || side === "both") {
		for (const [vpName, vp] of Object.entries(cfg.viewports)) {
			for (const theme of cfg.themes) {
				const { ctx, page } = await newPage(browser, {
					url: `${DESIGN}/`,
					theme,
					viewport: vp,
				});
				for (const sc of screens) {
					if (!sc.design) continue;
					if (sc.design.skipViewports?.includes(vpName)) continue;
					const rawFile = path.join(
						RAW,
						"design",
						sc.id,
						`${vpName}-${theme}.png`,
					);
					if (existsSync(rawFile)) continue;
					console.log(`[harness] design ${sc.id}/${vpName}-${theme}…`);
					try {
						// Làm mới SPA về trạng thái đăng nhập + portal đúng cho màn.
						await page.goto(`${DESIGN}/`, { waitUntil: "load" });
						const isStudent = sc.auth === "student";
						// Teacher: bấm Login nếu chưa authed; Student: login → switch portal.
						if (isStudent) {
							await page.click("button[type=submit]");
							await page.click("button:text-is('student')");
						} else if (
							sc.design.hash !== null &&
							sc.id !== "login-teacher" &&
							sc.id !== "login-reset"
						) {
							await page.click("button[type=submit]");
						}
						// Hash TRƯỚC steps: SPA render theo hash, steps bấm nút trên trang đích.
						if (sc.design.hash) {
							await page.evaluate((h) => {
								window.location.hash = h;
							}, sc.design.hash);
						}
						if (sc.id === "login-reset") {
							await runSteps(page, sc.design.steps);
						} else if (sc.design.steps?.length && sc.id !== "login-teacher") {
							await runSteps(page, sc.design.steps);
						}
						await settle(page);
						await shoot(page, rawFile);
						done.push(`${sc.id}/${vpName}-${theme} (design)`);
					} catch (err) {
						failures.push(
							`design ${sc.id}/${vpName}-${theme}: ${String(err).split("\n")[0]}`,
						);
					}
				}
				await ctx.close();
			}
		}
	}

	// ── compose side-by-side ──
	if (side === "both") {
		for (const sc of screens) {
			for (const [vpName] of Object.entries(cfg.viewports)) {
				for (const theme of cfg.themes) {
					const outDir = path.join(SHOTS, sc.id);
					const outFile = path.join(outDir, `${vpName}-${theme}.png`);
					if (existsSync(outFile)) continue;
					console.log(`[harness] ghép ${sc.id}/${vpName}-${theme}…`);
					const designFile = path.join(
						RAW,
						"design",
						sc.id,
						`${vpName}-${theme}.png`,
					);
					const oldFile = path.join(
						RAW,
						"old",
						sc.id,
						`${vpName}-${theme}.png`,
					);
					const newFile = path.join(
						RAW,
						"new",
						sc.id,
						`${vpName}-${theme}.png`,
					);
					const cols = [];
					if (sc.design !== null && existsSync(designFile))
						cols.push({ title: "Design v2", file: designFile });
					if (existsSync(oldFile))
						cols.push({ title: "App cũ", file: oldFile });
					if (existsSync(newFile))
						cols.push({ title: "App mới", file: newFile });
					if (cols.length === 0) continue;
					await mkdir(outDir, { recursive: true });
					await compose(outFile, cols);
					done.push(`${sc.id}/${vpName}-${theme} (ghép)`);
				}
			}
		}
	}
} finally {
	await browser.close();
}

// ── verdict scaffold ─────────────────────────────────────────────────────
if (!existsSync(VERDICT)) {
	const rows = cfg.screens
		.flatMap((s) =>
			Object.keys(cfg.viewports).flatMap((vp) =>
				cfg.themes.map((th) => `| ${s.id} | ${vp}×${th} | TODO | |`),
			),
		)
		.join("\n");
	await mkdir(path.dirname(VERDICT), { recursive: true });
	await writeFile(
		VERDICT,
		`# Verdict đối chiếu design v2 ↔ app\n\nMỗi dòng: PASS khi ảnh ghép thỏa checklist cấu trúc (phase 1) ở tổ hợp đó. FAIL phải có ghi chú nguyên nhân.\n\n| Màn | viewport×theme | Trạng thái | Ghi chú |\n|---|---|---|---|\n${rows}\n`,
	);
}

console.log(`[harness] xong: ${done.length} ảnh, ${failures.length} lỗi`);
if (failures.length) {
	await writeFile(path.join(STATE, "errors.log"), `${failures.join("\n")}\n`);
	console.log(`[harness] lỗi ghi ở ${path.join(STATE, "errors.log")}:`);
	for (const f of failures.slice(0, 20)) console.log("  - " + f);
}
// child spawn (api/web/student/design) giữ event loop sống mãi — thoát tường minh;
// listener 'exit' ở trên chạy cleanup (SIGTERM + stop design).
process.exit(failures.length ? 1 : 0);
