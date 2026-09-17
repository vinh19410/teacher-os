import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/e2e/node_modules/@playwright/test");

import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "full", "syllabus");
mkdirSync(OUT, { recursive: true });
const BASE = "https://app.staging.teacheros.io.vn";

async function main() {
	const browser = await chromium.launch({ headless: true });
	const page = await (
		await browser.newContext({
			viewport: { width: 1440, height: 900 },
			locale: "vi-VN",
			timezoneId: "Asia/Ho_Chi_Minh",
		})
	).newPage();
	page.setDefaultTimeout(15000);
	const email = `dogfood.sy.${Date.now()}@mailinator.com`;
	const password = `Qa!${randomBytes(12).toString("base64url")}`;
	const log = [];
	const shot = async (n) => {
		await page.screenshot({ path: join(OUT, n + ".png"), fullPage: true });
	};

	await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(800);
	await page.locator("#tab-signup").click();
	await page.locator("#su-name").fill("QA Syllabus");
	await page.locator("#su-email").fill(email);
	await page.locator("#su-password").fill(password);
	const en = await page
		.locator("#panel-signup button[type=submit]")
		.isEnabled();
	if (en) await page.locator("#panel-signup button[type=submit]").click();
	else
		await page.evaluate(() =>
			document.getElementById("panel-signup")?.requestSubmit(),
		);
	await page.waitForURL(/dashboard/, { timeout: 25000 });
	await page.waitForTimeout(1500);
	log.push("signed in " + page.url());

	await page.goto(BASE + "/syllabus", { waitUntil: "domcontentloaded" });
	await page.waitForTimeout(800);
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	await page.waitForTimeout(400);
	await page.getByPlaceholder(/IELTS Writing/).fill("Syllabus Retry");
	await page
		.getByRole("button", { name: /^Writing$/ })
		.first()
		.click();
	await page.getByRole("button", { name: /^Tạo$/ }).click();
	await page.waitForTimeout(2500);
	await shot("after-create");
	const t1 = await page.evaluate(() => document.body.innerText);
	log.push(
		"after create: " + (t1.includes("Syllabus Retry") ? "LISTED" : "MISSING"),
	);
	log.push(t1.slice(0, 400));

	if (t1.includes("Syllabus Retry")) {
		await page.getByText("Syllabus Retry").first().click();
		await page.waitForTimeout(1200);
		await shot("detail");
		await page.getByRole("button", { name: "+ Thêm module" }).click();
		await page.waitForTimeout(400);
		await page.getByPlaceholder(/Module 4/).fill("Module Retry");
		await page.getByRole("button", { name: /^Thêm module$/ }).click();
		await page.waitForTimeout(2000);
		await shot("after-module");
		const t2 = await page.evaluate(() => document.body.innerText);
		log.push("module: " + (t2.includes("Module Retry") ? "OK" : "MISSING"));

		const addLesson = page.getByRole("button", { name: "+ Thêm buổi học" });
		if (await addLesson.count()) {
			await addLesson.first().click();
			await page.waitForTimeout(400);
			const input = page.locator("form input").first();
			await input.fill("Lesson Retry");
			await page.getByRole("button", { name: /^Thêm buổi$/ }).click();
			await page.waitForTimeout(2000);
			await shot("after-lesson");
			const t3 = await page.evaluate(() => document.body.innerText);
			log.push("lesson: " + (t3.includes("Lesson Retry") ? "OK" : "MISSING"));
			log.push(t3.slice(0, 600));
		} else log.push("no add lesson button");
	}

	console.log(log.join("\n"));
	await browser.close();
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
