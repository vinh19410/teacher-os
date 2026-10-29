#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
/**
 * Minimal Playwright driver for verify-teacher-os.
 * Uses the repo's apps/e2e Playwright install and real user-path selectors.
 *
 * Usage (from repo root, after launch.sh + doctor.sh):
 *   node .cursor/skills/verify-teacher-os/scripts/drive.mjs signup
 *   node .cursor/skills/verify-teacher-os/scripts/drive.mjs create-class --name "E2E Verify Class"
 *   node .cursor/skills/verify-teacher-os/scripts/drive.mjs screenshot --path <file>
 *   node .cursor/skills/verify-teacher-os/scripts/drive.mjs aria --path <file>
 *   node .cursor/skills/verify-teacher-os/scripts/drive.mjs goto --path /classes
 */
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../../..");
const VERIFY_ROOT = process.env.VERIFY_ROOT || "/tmp/verify-teacher-os";

function currentRunId() {
	if (process.env.VERIFY_RUN_ID) return process.env.VERIFY_RUN_ID;
	try {
		return readFileSync(join(VERIFY_ROOT, "current-run"), "utf8").trim();
	} catch {
		throw new Error(
			"No VERIFY_RUN_ID / current-run — run scripts/launch.sh first",
		);
	}
}

function loadMeta(runId) {
	const metaPath = join(VERIFY_ROOT, runId, "instance", "meta.json");
	return JSON.parse(readFileSync(metaPath, "utf8"));
}

function evidenceDir(runId) {
	return (
		process.env.VERIFY_EVIDENCE_DIR || join(VERIFY_ROOT, runId, "evidence")
	);
}

function parseArgs(argv) {
	const [cmd, ...rest] = argv;
	const flags = {};
	const positionals = [];
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i];
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = rest[i + 1];
			if (!next || next.startsWith("--")) {
				flags[key] = true;
			} else {
				flags[key] = next;
				i++;
			}
		} else {
			positionals.push(a);
		}
	}
	return { cmd, flags, positionals };
}

async function withPage(meta, fn) {
	const require = createRequire(join(REPO_ROOT, "apps/e2e/package.json"));
	const { chromium } = require("@playwright/test");
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		baseURL: meta.webUrl,
		timezoneId: "Asia/Ho_Chi_Minh",
		viewport: { width: 1440, height: 900 },
		serviceWorkers: "block",
	});
	const page = await context.newPage();
	try {
		return await fn(page, context);
	} finally {
		await browser.close();
	}
}

async function cmdSignup(page, meta, flags) {
	const email =
		flags.email ||
		`verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
	const name = flags.name || "Verify Teacher";
	const password = flags.password || "password-8chars";

	await page.goto("/login");
	await page.locator("#su-name").fill(name);
	await page.locator("#su-email").fill(email);
	await page.locator("#su-password").fill(password);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
	await page.getByRole("link", { name: "Lớp học" }).first().waitFor({
		state: "visible",
		timeout: 15_000,
	});

	const out = {
		email,
		name,
		url: page.url(),
		webUrl: meta.webUrl,
	};
	const runId = currentRunId();
	const dir = evidenceDir(runId);
	mkdirSync(join(dir, "signup"), { recursive: true });
	writeFileSync(
		join(dir, "signup", "result.json"),
		JSON.stringify(out, null, 2),
	);
	await page.screenshot({
		path: join(dir, "signup", "dashboard.png"),
		fullPage: true,
	});
	const aria = await page.locator("body").ariaSnapshot();
	writeFileSync(join(dir, "signup", "dashboard.aria.txt"), aria);
	console.log(JSON.stringify({ ok: true, feature: "signup", ...out }, null, 2));
	return out;
}

async function cmdCreateClass(page, meta, flags) {
	const className = flags.name || `Verify Class ${Date.now()}`;
	// Sign up fresh unless --reuse-session (not implemented: always signup).
	await cmdSignup(page, meta, flags);

	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.waitForURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByText("Tạo lớp mới").waitFor();
	await dialog.getByLabel("Tên lớp *").fill(className);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "T2", exact: true }).click();
	await dialog.getByRole("button", { name: "T4", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await dialog.waitFor({ state: "hidden", timeout: 30_000 });
	await page.getByText(className).waitFor({ state: "visible" });

	const runId = currentRunId();
	const dir = evidenceDir(runId);
	mkdirSync(join(dir, "create-class"), { recursive: true });
	await page.screenshot({
		path: join(dir, "create-class", "list.png"),
		fullPage: true,
	});
	const aria = await page.locator("body").ariaSnapshot();
	writeFileSync(join(dir, "create-class", "list.aria.txt"), aria);
	writeFileSync(
		join(dir, "create-class", "result.json"),
		JSON.stringify({ className, url: page.url() }, null, 2),
	);
	console.log(
		JSON.stringify(
			{ ok: true, feature: "create-class", className, url: page.url() },
			null,
			2,
		),
	);
}

async function cmdScreenshot(page, _meta, flags) {
	const path = flags.path;
	if (!path) throw new Error("--path required");
	mkdirSync(dirname(resolve(path)), { recursive: true });
	if (flags.url || flags["path-route"]) {
		await page.goto(flags.url || flags["path-route"]);
	} else {
		await page.goto("/");
	}
	await page.screenshot({ path: resolve(path), fullPage: true });
	console.log(JSON.stringify({ ok: true, path: resolve(path) }));
}

async function cmdAria(page, _meta, flags) {
	const path = flags.path;
	if (!path) throw new Error("--path required");
	if (flags.url) await page.goto(flags.url);
	else await page.goto("/");
	const aria = await page.locator("body").ariaSnapshot();
	mkdirSync(dirname(resolve(path)), { recursive: true });
	writeFileSync(resolve(path), aria);
	console.log(JSON.stringify({ ok: true, path: resolve(path) }));
}

async function cmdGoto(page, _meta, flags) {
	const path = flags.path || "/";
	await page.goto(path);
	console.log(JSON.stringify({ ok: true, url: page.url() }));
}

async function main() {
	const { cmd, flags } = parseArgs(process.argv.slice(2));
	if (!cmd || cmd === "help" || cmd === "--help") {
		console.log(`drive.mjs commands:
  signup [--email e] [--name n] [--password p]
  create-class [--name className]
  screenshot --path file [--url /route]
  aria --path file [--url /route]
  goto --path /route`);
		process.exit(cmd ? 0 : 1);
	}

	const runId = currentRunId();
	const meta = loadMeta(runId);
	mkdirSync(evidenceDir(runId), { recursive: true });

	const handlers = {
		signup: cmdSignup,
		"create-class": cmdCreateClass,
		screenshot: cmdScreenshot,
		aria: cmdAria,
		goto: cmdGoto,
	};
	const handler = handlers[cmd];
	if (!handler) {
		throw new Error(`Unknown command: ${cmd}`);
	}
	await withPage(meta, (page) => handler(page, meta, flags));
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
