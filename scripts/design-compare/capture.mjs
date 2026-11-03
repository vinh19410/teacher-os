#!/usr/bin/env node
/*
 * Harness chụp đối chiếu design v2 ↔ app (plan 261020-1446-378, phase 1).
 *
 * Dùng:
 *   node scripts/design-compare/capture.mjs [--screens all|id1,id2]
 *        [--side design|app|both] [--label old|new] [--keep-design] [--force]
 *
 * - Tự boot stack e2e trên free port mỗi run (#397 — không đụng worktree AI
 *   song song / dev stack; boot:api xoá local.db mỗi lần → luôn chạy seed
 *   mới), chạy apps/e2e/scripts/design-seed.ts để tạo dữ liệu.
 * - Design v2 chạy qua scripts/design-compare/fetch-design.sh
 *   (DESIGN_PORT env; capture chọn free port sát lúc boot + retry khi port
 *   bận — #546). DESIGN_NO_REUSE=1: không bao giờ dùng ké server design của
 *   phiên khác; fetch-design.sh chỉ trả exit 0 khi chính mình spawn.
 * - Ảnh raw ghi vào scripts/design-compare/.state/raw/<label>/ (git-ignored);
 *   ảnh ghép side-by-side ghi vào
 *   plans/261020-1446-378-redesign-design-v2/screenshots/<id>/<viewport>-<theme>.png
 *   với cột Design v2 | App cũ (nếu có raw "old") | App mới.
 *   --force ép chụp lại raw (xoá cache) và ghi đè compose; không force thì
 *   compose ghi đè khi raw mới hơn outFile (mtimeMs) — #546.
 * - Ảnh trắng/rỗng bị pixel sanity check (pngjs) chặn + xoá ngay (#546);
 *   SIGTERM/timeout dọn sạch process group con (SIGTERM → SIGKILL) (#546).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	assertNonBlankPngFile,
	buildChildEnv,
	createLogCollector,
	ensurePrivateDir,
	killProcessGroup,
	killProcessGroupSync,
	loadPngJs,
	parseCliArgs,
	probeFreePort,
	redactLog,
	shouldCompose,
	spawnAsync,
	verifyDesignV2Server,
} from "./harness-lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const requireE2E = createRequire(path.join(ROOT, "apps/e2e/package.json"));
const { chromium } = requireE2E("@playwright/test");
const { PNG } = loadPngJs(ROOT);

const PLAN_DIR = path.join(ROOT, "plans/261020-1446-378-redesign-design-v2");
const SHOTS = path.join(PLAN_DIR, "screenshots");
const STATE = path.join(HERE, ".state");
const RAW = path.join(STATE, "raw");
const SEED_FILE = path.join(STATE, "design-seed.json");
const VERDICT = path.join(PLAN_DIR, "screenshots", "verdict.md");

// ── args ─────────────────────────────────────────────────────────────────
const cli = parseCliArgs(process.argv.slice(2));
const { screens: screensArg, side, label, keepDesign, force } = cli;

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

// ── process tracking + shutdown (#546) ───────────────────────────────────
const children = [];
const childNames = new Map();
const activeChildren = new Map(); // spawnAsync payload đang chạy (seed/fetch-design)
const outputTail = new Map();
const failedShots = new Set(); // `${sc.id}/${vpName}-${theme}` key chính xác
const failures = [];
const done = [];
let browser = null;
let childWatchdogTimer = null;
let designPort = null;
// #546 red-team: port ĐÃ THỬ boot design-v2 (kể cả fail giữa chừng — SIGTERM
// trong window boot, verifyDesignV2Server throw, spawnAsync timeout) để
// shutdown/backstop luôn đọc được `.pid-$PORT` dù `designPort` chưa gán.
const designAttemptPorts = new Set();
let designFetched = false;
let shuttingDown = null;

// #397: log api chứa URL verify-email/reset mang ?token=… (#546: thêm
// reset-password/pay/GitHub token). Redact tại điểm collect + dump.
function dumpLogs() {
	return [...outputTail.entries()]
		.map(([n, b]) => `## ${n}\n${redactLog(b)}`)
		.join("\n");
}

function start(name, cmd, args, opts = {}) {
	const child = spawn(cmd, args, {
		cwd: ROOT,
		// #397/#546: SIGTERM cho wrapper pnpm chỉ giết pnpm — node cháu (vite/
		// boot:api) sống thành orphan. detached + kill cả process group đảm
		// bảo dọn sạch cả cây (shutdown → killProcessGroup).
		detached: process.platform !== "win32",
		env: buildChildEnv(process.env, {
			apiPort: API_PORT,
			webPort: WEB_PORT,
			studentPort: STUDENT_PORT,
			extraEnv: opts.env,
		}),
		stdio: ["ignore", "pipe", "pipe"],
	});
	children.push(child);
	childNames.set(child, name);
	const collect = createLogCollector();
	const onData = (d) => {
		outputTail.set(name, collect(String(d)));
	};
	child.stdout.on("data", onData);
	child.stderr.on("data", onData);
	return child;
}

const childAlive = (c) => c.exitCode === null && c.signalCode === null;

async function waitUrl(url, { timeoutMs = 150_000, name = url, child } = {}) {
	const t0 = Date.now();
	for (;;) {
		// #546: child chết giữa lúc chờ (EADDRINUSE/crash) phải fail NGAY,
		// không nhặt nhầm HTTP 200 của server phiên khác cùng port.
		if (child && !childAlive(child)) {
			throw new Error(
				`${name} đã chết giữa lúc chờ (exit=${child.exitCode} signal=${child.signalCode})\n--- log ---\n${dumpLogs()}`,
			);
		}
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 304) return;
		} catch {
			/* not up yet */
		}
		if (Date.now() - t0 > timeoutMs) {
			throw new Error(
				`timeout chờ ${name} (${url})\n--- log ---\n${dumpLogs()}`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

/** Backstop đồng bộ cho handler 'exit' — CHỈ kill đồng bộ, không async. */
function syncBackstopCleanup() {
	for (const c of [...children, ...activeChildren.values()]) {
		if (!childAlive(c)) continue;
		if (c.pid != null && process.platform !== "win32")
			killProcessGroupSync(c.pid);
		else c.kill("SIGKILL");
	}
	stopDesignSyncBackstop();
}

// #546: chốt đồng bộ chống rò rỉ design-v2 khi thoát qua process.exit đồng bộ
// (uncaughtException khi shutdown async kịp chạy). Chỉ kill khi /proc xác nhận
// cmdline là vite của port mình; /proc không có (macOS) → skip, không đoán.
function stopDesignSyncBackstop() {
	if (keepDesign || designAttemptPorts.size === 0) return;
	// fetch-design.sh honor DESIGN_CACHE_DIR — backstop phải đọc đúng chỗ.
	const cacheDir =
		process.env.DESIGN_CACHE_DIR || path.join(ROOT, ".cache/design-v2");
	for (const port of designAttemptPorts) {
		const pidFile = path.join(cacheDir, `.pid-${port}`);
		let pgidText = "";
		try {
			pgidText = readFileSync(pidFile, "utf8").trim();
		} catch {
			continue;
		}
		const pgid = Number(pgidText);
		const pidAlive = (p) => {
			try {
				process.kill(p, 0);
				return true;
			} catch {
				return false;
			}
		};
		if (!Number.isInteger(pgid) || pgid <= 1 || !pidAlive(pgid)) {
			rmSync(pidFile, { force: true });
			continue;
		}
		if (process.platform === "linux") {
			let cmdline = "";
			try {
				cmdline = readFileSync(`/proc/${pgid}/cmdline`, "utf8").replaceAll(
					"\0",
					" ",
				);
			} catch {
				cmdline = "";
			}
			if (!cmdline.includes("vite") || !cmdline.includes(String(port)))
				continue;
		} else {
			continue;
		}
		killProcessGroupSync(pgid);
		rmSync(pidFile, { force: true });
	}
}

/** Idempotent shutdown: một promise duy nhất cho mọi đường (signal,
 * uncaught/unhandled, main().catch, kết thúc bình thường); deadline cứng 5s;
 * song song từ t=0: browser.close (trần 2s) ∥ SIGTERM→SIGKILL groups ∥ design stop. */
function shutdown(exitCode) {
	if (shuttingDown) return shuttingDown;
	shuttingDown = (async () => {
		stopChildWatchdog();
		// children (api/web/student) + activeChildren (design-seed.ts,
		// fetch-design.sh đang chạy) — cả hai đều kill theo process group.
		const killChildren = Promise.allSettled(
			[...children, ...activeChildren.values()]
				.filter(childAlive)
				.map((c) =>
					c.pid != null && process.platform !== "win32"
						? killProcessGroup(c.pid, { graceMs: 2_000 })
						: Promise.resolve(c.kill("SIGTERM")),
				),
		);
		const closeBrowser = browser
			? Promise.race([
					browser.close().catch(() => {}),
					new Promise((resolve) => setTimeout(resolve, 2_000)),
				])
			: Promise.resolve();
		// #546 red-team: dừng MỌI port đã thử boot (kể cả port fail giữa chừng
		// — SIGTERM trong window boot, verifyDesignV2Server throw, timeout) —
		// stop tự xác minh danh tính + xoá pidfile, idempotent nên an toàn.
		const stopDesign =
			designAttemptPorts.size > 0 && !keepDesign
				? (async () => {
						for (const port of designAttemptPorts) {
							await spawnAsync(
								"bash",
								[path.join(HERE, "fetch-design.sh"), "stop"],
								{
									cwd: ROOT,
									env: { ...process.env, DESIGN_PORT: String(port) },
									timeoutMs: 10_000,
								},
							).catch(() => {});
						}
					})()
				: Promise.resolve();
		await Promise.race([
			Promise.allSettled([killChildren, closeBrowser, stopDesign]),
			new Promise((resolve) => setTimeout(resolve, 5_000)),
		]);
		process.exit(exitCode);
	})();
	return shuttingDown;
}

process.on("exit", syncBackstopCleanup);
process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));
process.on("SIGHUP", () => void shutdown(129));
process.on("uncaughtException", (err) => {
	console.error(redactLog(String(err?.stack ?? err)));
	void shutdown(1);
});
process.on("unhandledRejection", (err) => {
	console.error(redactLog(String(err?.stack ?? err)));
	void shutdown(1);
});

// #402: canh children trong suốt vùng boot/warm/seed/capture — bật ngay sau
// khi từng service qua waitUrl (#546), không đợi tới vùng capture.
function startChildWatchdog() {
	if (childWatchdogTimer) return;
	childWatchdogTimer = setInterval(() => {
		const dead = children.find((c) => !childAlive(c));
		if (!dead) return;
		stopChildWatchdog();
		const name = childNames.get(dead) ?? "unknown";
		console.error(
			`[harness] ${name} CHẾT giữa run (exit=${dead.exitCode} signal=${dead.signalCode}) — hủy phần còn lại, xem log tail dưới đây rồi chạy lại.`,
		);
		console.error(dumpLogs());
		void shutdown(1); // handler 'exit' chạy syncBackstopCleanup
	}, 3000);
}
function stopChildWatchdog() {
	clearInterval(childWatchdogTimer);
	childWatchdogTimer = null;
}

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

// ── boot helpers (#546) ──────────────────────────────────────────────────
/** true khi có listener trên [::1]:port — chặn Happy-Eyeballs hijack khi
 * localhost phân giải IPv6 (probe đơn giản, theo khuyến nghị kongming). */
function ipv6LoopbackListening(port) {
	return new Promise((resolve) => {
		const s = net.connect({ host: "::1", port });
		const done = (v) => {
			s.destroy();
			resolve(v);
		};
		s.setTimeout(500, () => done(false));
		s.on("error", () => done(false));
		s.on("connect", () => done(true));
	});
}

/** Boot design-v2 trên port trống: retry CHỈ khi fetch-design.sh trả exit 3
 * (port bận — kể cả design-v2 của phiên khác nhờ DESIGN_NO_REUSE=1); các lỗi
 * khác (clone/auth) fail ngay. Trả port đã verify chữ ký. */
async function bootDesignServer() {
	const tried = new Set();
	for (let attempt = 1; attempt <= 3; attempt++) {
		const port = await probeFreePort({ excludePorts: tried });
		tried.add(port);
		designAttemptPorts.add(port);
		console.log(`[harness] design v2 port ${port} (lần ${attempt})…`);
		const r = await spawnAsync(
			"bash",
			[path.join(HERE, "fetch-design.sh"), "run"],
			{
				cwd: ROOT,
				env: {
					...process.env,
					DESIGN_PORT: String(port),
					DESIGN_NO_REUSE: "1",
				},
				timeoutMs: 300_000,
				onChild: (c) => activeChildren.set("fetch-design", c),
			},
		);
		activeChildren.delete("fetch-design");
		if (r.code === 0) {
			const sig = await verifyDesignV2Server(`http://127.0.0.1:${port}`);
			if (!sig.ok) {
				throw new Error(
					`design v2 không có chữ ký mong đợi trên :${port}: ${sig.reason}`,
				);
			}
			designFetched = true;
			return port;
		}
		if (r.code === 3) continue; // port bận → thử port khác
		throw new Error(
			`design v2 không chạy được (code=${r.code}):\n${redactLog(r.log)}`,
		);
	}
	throw new Error("hết 3 lần thử không cấp được port trống cho design v2");
}

// ── capture helpers ──────────────────────────────────────────────────────
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
	// #546: pixel sanity check — ảnh trắng/rỗng (kể cả viền/badge góc nhỏ) bị
	// xoá khỏi .state/raw rồi throw, không được tính là success.
	await assertNonBlankPngFile(file, PNG);
}

// Ghép các PNG thành một ảnh ngang với nhãn cột — tái sử dụng browser chính
// (ctx.close() trong finally, KHÔNG browser.close() — #546 red-team).
async function compose(browser, outFile, columns) {
	const cols = columns.filter(Boolean);
	if (cols.length === 0) return;
	let ctx;
	try {
		ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
		const page = await ctx.newPage();
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
		if (ctx) await ctx.close().catch(() => {});
	}
}

// ── main pipeline ────────────────────────────────────────────────────────
let API_PORT;
let WEB_PORT;
let STUDENT_PORT;
let WEB;
let STUDENT;
let API;
let DESIGN;

async function main() {
	// #546: .state chứa storageState cookie phiên — mode 0o700 kể cả khi dir
	// đã tồn tại từ lần chạy cũ.
	ensurePrivateDir(STATE);
	// Chromium KHÔNG tự xử lý tín hiệu: shutdown() là chủ duy nhất (#546).
	browser = await chromium.launch({
		handleSIGINT: false,
		handleSIGTERM: false,
		handleSIGHUP: false,
	});

	const needApp = side === "app" || side === "both";
	if (needApp) {
		API_PORT = await probeFreePort();
		WEB_PORT = await probeFreePort({ excludePorts: new Set([API_PORT]) });
		STUDENT_PORT = await probeFreePort({
			excludePorts: new Set([API_PORT, WEB_PORT]),
		});
		API = `http://localhost:${API_PORT}`;
		WEB = `http://localhost:${WEB_PORT}`;
		STUDENT = `http://localhost:${STUDENT_PORT}`;
		console.log("[harness] boot api…");
		const apiChild = start(
			"api",
			"pnpm",
			["--filter", "e2e", "run", "boot:api"],
			{
				env: { E2E_HOSTNAME: "127.0.0.1" },
			},
		);
		await waitUrl(`${API}/readyz`, { name: "api", child: apiChild });
		startChildWatchdog();
		// localhost phân giải ::1 trước 127.0.0.1 trên một số máy — listener
		// lạ trên [::1]:API_PORT sẽ hijack cả auth flow (Happy-Eyeballs).
		if (await ipv6LoopbackListening(API_PORT)) {
			throw new Error(
				`api :${API_PORT} cũng bị nghe trên [::1] (localhost dual-stack) — dừng để tránh hijack`,
			);
		}
		console.log("[harness] boot web…");
		const webChild = start("web", "pnpm", [
			"--filter",
			"web",
			"exec",
			"vite",
			"--host",
			"127.0.0.1",
			"--port",
			String(WEB_PORT),
			"--strictPort",
		]);
		await waitUrl(`${WEB}/`, { name: "web", child: webChild });
		startChildWatchdog();
		console.log("[harness] boot student…");
		const studentChild = start("student", "pnpm", [
			"--filter",
			"student",
			"exec",
			"vite",
			"--host",
			"127.0.0.1",
			"--port",
			String(STUDENT_PORT),
			"--strictPort",
		]);
		await waitUrl(`${STUDENT}/login`, { name: "student", child: studentChild });
		startChildWatchdog();
		await warm(`${WEB}/login`, "#su-name");
		// #397: chưa có session nên /dashboard redirect về /login?returnUrl —
		// warm được shared graph (router, auth client, auth gate). Chunk riêng của
		// dashboard vẫn lạnh; vòng kernel-wait của design-seed phủ phần đó.
		await warm(`${WEB}/dashboard`, "#su-name");
		await warm(`${STUDENT}/login`, "#tab-signup");

		console.log("[harness] seed dữ liệu so sánh…");
		const seeded = await spawnAsync(
			"pnpm",
			["--filter", "e2e", "exec", "tsx", "scripts/design-seed.ts"],
			{
				cwd: ROOT,
				env: buildChildEnv(process.env, {
					apiPort: API_PORT,
					webPort: WEB_PORT,
					studentPort: STUDENT_PORT,
				}),
				// #397 review: worst-case seed = 60s waitForURL + 120s kernel wait +
				// ~22s DB busy-retry + thân seed (~44s khoẻ) → 300s cũ có thể SIGTERM
				// giữa chừng đúng trên máy đang tải mà issue nhắm tới.
				timeoutMs: 420_000,
				onChild: (c) => activeChildren.set("design-seed", c),
			},
		);
		activeChildren.delete("design-seed");
		if (seeded.code !== 0) {
			console.error(
				`[harness] seed thất bại (code=${seeded.code} signal=${seeded.signal}):\n${redactLog(
					seeded.log,
				)}\n--- log stack (api/web/student) ---\n${dumpLogs()}`,
			);
			return 1;
		}
		seed = JSON.parse(await readFile(SEED_FILE, "utf8"));
		console.log("[harness] seed xong");
	}
	if (side === "design" || side === "both") {
		console.log("[harness] design v2…");
		designPort = await bootDesignServer();
		DESIGN = `http://127.0.0.1:${designPort}`;
	}

	// ── capture ──
	await mkdir(RAW, { recursive: true });
	await mkdir(SHOTS, { recursive: true });

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
			await chmod(teacherAuth, 0o600); // #546: cookie phiên sống — mode 0600
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
			await chmod(studentAuth, 0o600);
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
					// #546: --force bỏ qua cache raw — xoá TRƯỚC khi navigate để
					// lỗi giữa chừng không để lại raw stale cho lần ghép sau.
					if (force) await rm(rawFile, { force: true });
					if (!force && existsSync(rawFile)) continue;
					console.log(`[harness] app ${label} ${sc.id}/${vpName}-${theme}…`);
					try {
						if (sc.auth === "teacher") {
							await tPage.goto(`${WEB}${fill(sc.app)}`, { waitUntil: "load" });
						} else if (sc.auth === "student") {
							await sPage.goto(`${STUDENT}${fill(sc.app)}`, {
								waitUntil: "load",
							});
						} else {
							await aPage.goto(`${WEB}${fill(sc.app)}`, { waitUntil: "load" });
						}
						await settle(
							sc.auth === "student"
								? sPage
								: sc.auth === "teacher"
									? tPage
									: aPage,
						);
						const stepPage =
							sc.auth === "student"
								? sPage
								: sc.auth === "teacher"
									? tPage
									: aPage;
						// #403: màn khai báo nonMutating phải zero POST check-in —
						// đo bằng máy thay vì tin rằng không có click lạc (ràng buộc
						// cốt lõi của issue: 6 viewport phải cùng trạng thái seed).
						let checkInPosts = 0;
						const onCheckIn = (req) => {
							if (req.method() === "POST" && /\/check-in(\?|$)/.test(req.url()))
								checkInPosts++;
						};
						if (sc.nonMutating) stepPage.on("request", onCheckIn);
						try {
							await runSteps(stepPage, sc.appSteps);
							if (sc.nonMutating && checkInPosts > 0)
								throw new Error(
									`non-mutating screen bị POST /check-in ×${checkInPosts}`,
								);
						} finally {
							if (sc.nonMutating) stepPage.off("request", onCheckIn);
						}
						await shoot(stepPage, rawFile);
						done.push(`${sc.id}/${vpName}-${theme} (app)`);
					} catch (err) {
						failedShots.add(`${sc.id}/${vpName}-${theme}`);
						failures.push(
							`app ${sc.id}/${vpName}-${theme}: ${redactLog(String(err).split("\n")[0])}`,
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
								`[harness] debug ${sc.id}: url=${redactLog(dbg.url())} buttons=`,
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
					if (force) await rm(rawFile, { force: true });
					if (!force && existsSync(rawFile)) continue;
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
						failedShots.add(`${sc.id}/${vpName}-${theme}`);
						failures.push(
							`design ${sc.id}/${vpName}-${theme}: ${redactLog(String(err).split("\n")[0])}`,
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
					const cellKey = `${sc.id}/${vpName}-${theme}`;
					const outDir = path.join(SHOTS, sc.id);
					const outFile = path.join(outDir, `${vpName}-${theme}.png`);
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
					// Cột "App mới" luôn đọc RAW/new (nguyên tắc gốc): run `--label
					// old` chỉ đổ cột "App cũ" — newFile = label dir sẽ tạo 2 cột
					// giống hệt nhau khi label=old (post-PR review #546).
					const labelFile = path.join(
						RAW,
						label,
						sc.id,
						`${vpName}-${theme}.png`,
					);
					const newFile =
						label === "new"
							? labelFile
							: path.join(RAW, "new", sc.id, `${vpName}-${theme}.png`);
					// #546 red-team: cell thiếu raw bắt buộc (app hoặc design) hoặc
					// thuộc failedShots → ghi lỗi, KHÔNG ghép cột thiếu. Key so khớp
					// chính xác (tránh trùng prefix t-syllabus / t-syllabus-detail);
					// check failedShots TRƯỚC để cell chụp lỗi không bị đếm lỗi 2 lần.
					if (failedShots.has(cellKey)) continue;
					const missing = [];
					// Output app của run này (RAW/<label>) là bắt buộc; RAW/new với
					// `--label old` là cột tùy chọn (worktree mới chưa có run "new").
					if (!existsSync(labelFile)) missing.push(labelFile);
					if (
						sc.design &&
						!sc.design.skipViewports?.includes(vpName) &&
						!existsSync(designFile)
					)
						missing.push(designFile);
					if (missing.length > 0) {
						failures.push(
							`ghép ${cellKey}: thiếu raw bắt buộc ${missing.join(", ")}`,
						);
						continue;
					}
					const candidateFiles = [designFile, oldFile, newFile].filter((f) =>
						existsSync(f),
					);
					if (candidateFiles.length === 0) continue;
					if (!shouldCompose(outFile, candidateFiles, { force })) continue;
					console.log(`[harness] ghép ${cellKey}…`);
					const cols = [];
					if (sc.design !== null && existsSync(designFile))
						cols.push({ title: "Design v2", file: designFile });
					if (existsSync(oldFile))
						cols.push({ title: "App cũ", file: oldFile });
					if (existsSync(newFile))
						cols.push({ title: "App mới", file: newFile });
					if (cols.length === 0) continue;
					await mkdir(outDir, { recursive: true });
					await compose(browser, outFile, cols);
					done.push(`${cellKey} (ghép)`);
				}
			}
		}
	}

	// ── verdict scaffold ──
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
		await writeFile(
			path.join(STATE, "errors.log"),
			`${failures.map((f) => redactLog(f)).join("\n")}\n`,
		);
		console.log(`[harness] lỗi ghi ở ${path.join(STATE, "errors.log")}:`);
		for (const f of failures.slice(0, 20)) console.log(`  - ${f}`);
	} else {
		// #403: errors.log stale của run fail trước không được FAIL run sạch sau.
		await rm(path.join(STATE, "errors.log"), { force: true });
	}
	return failures.length ? 1 : 0;
}

main().then(
	(code) => {
		// child spawn (api/web/student/design) giữ event loop sống mãi — thoát
		// tường minh qua shutdown (SIGTERM → SIGKILL groups + design stop).
		void shutdown(code ?? 0);
	},
	(err) => {
		console.error(redactLog(String(err?.stack ?? err)));
		void shutdown(1);
	},
);
