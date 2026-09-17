import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/e2e/node_modules/@playwright/test");

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "full", "retry");
mkdirSync(OUT, { recursive: true });

async function main() {
	const browser = await chromium.launch({ headless: true });
	const page = await (
		await browser.newContext({
			viewport: { width: 1440, height: 900 },
			locale: "vi-VN",
			timezoneId: "Asia/Ho_Chi_Minh",
		})
	).newPage();
	const wait = (ms) => page.waitForTimeout(ms);
	const dump = async (tag) => {
		const info = await page.evaluate(() => ({
			url: location.href,
			text: document.body.innerText.slice(0, 800),
			buttons: [...document.querySelectorAll("button")].map((b) => ({
				text: b.innerText.replace(/\s+/g, " ").trim().slice(0, 60),
				disabled: b.disabled,
				hidden: b.hidden || !!b.closest("[hidden]"),
			})),
			placeholders: [...document.querySelectorAll("input,textarea")].map(
				(i) => i.placeholder,
			),
		}));
		console.log(
			"\n=== " + tag + " ===\n" + JSON.stringify(info, null, 2).slice(0, 2500),
		);
		return info;
	};

	await page.goto("https://app.staging.teacheros.io.vn/login", {
		waitUntil: "domcontentloaded",
	});
	await wait(800);
	await page.locator("#tab-signup").click();
	await page.locator("#su-name").fill("QA Dump");
	await page
		.locator("#su-email")
		.fill(`dogfood.d.${Date.now()}@mailinator.com`);
	await page
		.locator("#su-password")
		.fill(`Qa!${randomBytes(10).toString("base64url")}`);
	await page.evaluate(() =>
		document.getElementById("panel-signup")?.requestSubmit(),
	);
	await page.waitForURL(/dashboard/, { timeout: 25000 });
	await wait(1200);

	await page.goto("https://app.staging.teacheros.io.vn/syllabus", {
		waitUntil: "domcontentloaded",
	});
	await wait(800);
	await dump("syllabus-page");
	await page.evaluate(() => {
		const b = [...document.querySelectorAll("button")].find((x) =>
			/Tạo syllabus/i.test(x.innerText),
		);
		b?.click();
	});
	await wait(500);
	const after = await dump("syllabus-modal");
	await page.screenshot({ path: join(OUT, "dump-modal.png"), fullPage: true });
	writeFileSync(join(OUT, "dump.json"), JSON.stringify(after, null, 2));
	await browser.close();
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
