// Screenshot độc lập cho cổng quản trị (plan #413 phase 7) — KHÔNG sửa
// playwright.config: script tự spawn đúng bộ hạ tầng e2e (boot:api + 3 vite
// qua devserver-services.mjs, nguồn sự thật chung), seed admin, tạo 1 đề
// Reading + 1 đề Listening qua API thật rồi chụp 4 trang chính ở 3 viewport
// vào plans/reports/. Chạy: node scripts/admin-screenshots.mjs (sau khi
// đã xuất 4 port env như bộ e2e).

import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium } from "@playwright/test";
import { buildServices } from "../devserver-services.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 8101);
const STUDENT_PORT = Number(process.env.E2E_STUDENT_PORT ?? 8103);
const ADMIN_PORT = Number(process.env.E2E_ADMIN_PORT ?? 8104);
const PROFILE_PORT = Number(process.env.E2E_PROFILE_PORT ?? 8105);
const API_ORIGIN = `http://localhost:${API_PORT}`;
const ADMIN_ORIGIN = `http://localhost:${ADMIN_PORT}`;
const ADMIN_EMAIL =
	(process.env.E2E_ADMIN_EMAILS ?? "admin@e2e.local").split(",")[0]?.trim() ??
	"admin@e2e.local";
const ADMIN_PASSWORD = "password-8chars";
const OUT_DIR = join(ROOT, "plans/reports");
const VIEWPORTS = [
	[1440, 900],
	[768, 1024],
	[375, 812],
];

const children = [];
function spawnSvc(command, args, cwd, env) {
	const child = spawn(command, args, {
		cwd,
		env: { ...process.env, ...env },
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stderr.on("data", (chunk) =>
		process.stderr.write(`[${args.join(" ") || command}] ${chunk}`),
	);
	children.push(child);
	return child;
}

async function waitReady(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			const res = await fetch(url);
			if (res.status < 404) return;
		} catch {
			// chưa lên — poll tiếp
		}
		if (Date.now() > deadline)
			throw new Error(`service không sẵn sàng: ${url}`);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
}

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	const ports = {
		api: API_PORT,
		web: WEB_PORT,
		student: STUDENT_PORT,
		admin: ADMIN_PORT,
		profile: PROFILE_PORT,
	};
	const services = Object.fromEntries(
		buildServices(ports).map((svc) => [svc.name, svc]),
	);

	spawnSvc("pnpm", ["run", "boot:api"], join(ROOT, "apps/e2e"), {
		E2E_API_PORT: String(API_PORT),
		E2E_WEB_PORT: String(WEB_PORT),
		E2E_STUDENT_PORT: String(STUDENT_PORT),
		E2E_ADMIN_PORT: String(ADMIN_PORT),
	});
	for (const name of ["web", "student", "admin"]) {
		spawnSvc("pnpm", services[name].restartArgs, ROOT, {
			VITE_SERVER_URL: API_ORIGIN,
			E2E_API_PORT: String(API_PORT),
			E2E_ADMIN_PORT: String(ADMIN_PORT),
		});
	}
	await waitReady(`${API_ORIGIN}/readyz`, 120_000);
	for (const name of ["web", "student", "admin"]) {
		await waitReady(services[name].pollUrl, 120_000);
	}

	// Seed admin: sign-up qua API với Origin admin rồi khóa DB như helper e2e.
	const signup = await fetch(`${API_ORIGIN}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "content-type": "application/json", origin: ADMIN_ORIGIN },
		body: JSON.stringify({
			name: "E2E Admin",
			email: ADMIN_EMAIL,
			password: ADMIN_PASSWORD,
		}),
	});
	if (signup.status !== 200) {
		const body = await signup.text();
		if (!/already|exists|tồn tại|registered/i.test(body))
			throw new Error(`admin sign-up failed (${signup.status}): ${body}`);
	}
	const db = createClient({
		url: `file:${join(ROOT, "apps/e2e/local.db")}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	await db.execute({
		sql: "UPDATE user SET role = 'admin', email_verified = 1 WHERE lower(email) = lower(?)",
		args: [ADMIN_EMAIL],
	});
	db.close();

	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const page = await context.newPage();

	// Đăng nhập admin qua form thật để có session cookie.
	await page.goto(`${ADMIN_ORIGIN}/login`);
	await page.locator("#signin-email").fill(ADMIN_EMAIL);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await page.waitForURL(/\/library\/tests/, { timeout: 60_000 });

	// Tạo 1 đề Reading + 1 đề Listening qua API thật cho trang editor.
	async function createTest(title, skill) {
		const res = await context.request.post(
			`${API_ORIGIN}/api/admin/library/tests`,
			{
				data: { title, description: "", skill, timeLimitSeconds: 3600 },
				// CSRF write của router admin đòi Origin thuộc ADMIN_ORIGINS.
				headers: { Origin: ADMIN_ORIGIN },
			},
		);
		if (res.status() !== 201 && res.status() !== 200)
			throw new Error(`create ${skill} test failed: ${res.status()}`);
		return (await res.json()).id;
	}
	const readingId = await createTest("E2E Reading — Screenshot", "reading");
	const listeningId = await createTest(
		"E2E Listening — Screenshot",
		"listening",
	);

	const targets = [
		["admin-library-list", `${ADMIN_ORIGIN}/library/tests`],
		["admin-library-create", `${ADMIN_ORIGIN}/library/tests/new`],
		[
			"admin-library-editor-reading",
			`${ADMIN_ORIGIN}/library/tests/${readingId}`,
		],
		[
			"admin-library-editor-listening",
			`${ADMIN_ORIGIN}/library/tests/${listeningId}`,
		],
	];
	for (const [width, height] of VIEWPORTS) {
		await page.setViewportSize({ width, height });
		for (const [name, url] of targets) {
			await page.goto(url);
			await page.getByRole("heading").first().waitFor({ timeout: 60_000 });
			// Chờ network yên tĩnh (react-query refetch sau mount).
			await page.waitForLoadState("networkidle").catch(() => {});
			await page.screenshot({
				path: join(OUT_DIR, `${name}-${width}x${height}.png`),
				fullPage: true,
			});
			console.log(`[screenshots] ${name} @${width}x${height}`);
		}
	}

	await browser.close();
}

main()
	.then(() => {
		for (const child of children) child.kill("SIGTERM");
		process.exit(0);
	})
	.catch((error) => {
		console.error("[screenshots] FAILED", error);
		for (const child of children) child.kill("SIGTERM");
		process.exit(1);
	});
