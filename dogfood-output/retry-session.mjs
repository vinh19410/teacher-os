import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/e2e/node_modules/@playwright/test");

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "full", "retry");
mkdirSync(OUT, { recursive: true });
const log = [];

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
	const shot = (n) =>
		page.screenshot({ path: join(OUT, `${n}.png`), fullPage: true });
	const jsClickExact = (lab) =>
		page.evaluate((t) => {
			const b = [...document.querySelectorAll("button")].find(
				(x) => x.innerText.replace(/\s+/g, " ").trim() === t,
			);
			if (!b) return `missing ${t}`;
			b.click();
			return `clicked ${t}`;
		}, lab);

	await page.goto("https://app.staging.teacheros.io.vn/login", {
		waitUntil: "domcontentloaded",
	});
	await wait(800);
	await page.locator("#tab-signup").click();
	await page.locator("#su-name").fill("QA Last");
	await page
		.locator("#su-email")
		.fill(`dogfood.l.${Date.now()}@mailinator.com`);
	await page
		.locator("#su-password")
		.fill(`Qa!${randomBytes(10).toString("base64url")}`);
	await page.evaluate(() =>
		document.getElementById("panel-signup")?.requestSubmit(),
	);
	await page.waitForURL(/dashboard/, { timeout: 25000 });
	await page
		.getByRole("button", { name: "+ Tạo syllabus" })
		.waitFor({ timeout: 1 })
		.catch(() => {});
	await page.goto("https://app.staging.teacheros.io.vn/syllabus", {
		waitUntil: "domcontentloaded",
	});
	await page
		.getByRole("button", { name: "+ Tạo syllabus" })
		.waitFor({ timeout: 20000 });
	await jsClickExact("+ Tạo syllabus");
	await page.getByPlaceholder(/IELTS Writing/).waitFor({ timeout: 10000 });
	await page.getByPlaceholder(/IELTS Writing/).fill("Syllabus Last");
	// skill chip inside modal, not page filter
	await page.locator("[role=dialog] button", { hasText: /^Writing$/ }).click();
	await jsClickExact("Tạo");
	await wait(2500);
	await shot("sy");
	const listed = await page.evaluate(() =>
		document.body.innerText.includes("Syllabus Last"),
	);
	log.push(`syllabus listed=${listed}`);

	if (listed) {
		await page.getByText("Syllabus Last").first().click();
		await page
			.getByRole("button", { name: "+ Thêm module" })
			.waitFor({ timeout: 10000 });
		await jsClickExact("+ Thêm module");
		await page.getByPlaceholder(/Module 4/).waitFor();
		await page.getByPlaceholder(/Module 4/).fill("Module Last");
		await jsClickExact("Thêm module");
		await wait(2000);
		await shot("mod");
		log.push(
			"module=" +
				(await page.evaluate(() =>
					document.body.innerText.includes("Module Last"),
				)),
		);
		await jsClickExact("+ Thêm buổi học");
		await wait(400);
		await page.locator("[role=dialog] input").first().fill("Lesson Last");
		await jsClickExact("Thêm buổi");
		await wait(2000);
		await shot("les");
		log.push(
			"lesson=" +
				(await page.evaluate(() =>
					document.body.innerText.includes("Lesson Last"),
				)),
		);
	}

	await page.goto("https://app.staging.teacheros.io.vn/classes", {
		waitUntil: "domcontentloaded",
	});
	await page
		.getByRole("button", { name: "+ Tạo lớp" })
		.waitFor({ timeout: 15000 });
	await jsClickExact("+ Tạo lớp");
	await page.getByPlaceholder(/IELTS Writing/).waitFor();
	await page.getByPlaceholder(/IELTS Writing/).fill("Lớp Last");
	await page.locator("[role=dialog] button", { hasText: /^Writing$/ }).click();
	await jsClickExact("T6");
	await jsClickExact("Tạo lớp");
	await wait(2500);
	await shot("cl");
	log.push(
		"class=" +
			(await page.evaluate(() => document.body.innerText.includes("Lớp Last"))),
	);
	await page.getByText("Lớp Last").first().click();
	await wait(1000);
	await page.getByText("Buổi học", { exact: true }).click();
	await wait(500);
	await shot("sess");
	log.push(await jsClickExact("Điều chỉnh"));
	await wait(500);
	await shot("sess-modal");
	const mt = await page.evaluate(() => document.body.innerText);
	log.push(
		mt.includes("Hoàn thành buổi") ? "modal has Hoàn thành" : "no Hoàn thành",
	);
	log.push(mt.includes("Hủy buổi") ? "modal has Hủy" : "no Hủy");
	const disabled = await page.evaluate(() => {
		const b = [...document.querySelectorAll("button")].find((x) =>
			/Hoàn thành buổi/.test(x.innerText),
		);
		return b ? { text: b.innerText, disabled: b.disabled } : null;
	});
	log.push(`completeBtn ${JSON.stringify(disabled)}`);
	if (disabled && !disabled.disabled) {
		await jsClickExact("Hoàn thành buổi");
		await wait(2000);
		await shot("completed");
	}

	writeFileSync(join(OUT, "log.txt"), log.join("\n"));
	console.log(log.join("\n"));
	await browser.close();
}
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
