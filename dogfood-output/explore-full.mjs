/**
 * Full-feature exploratory QA on staging Teacher OS.
 * Run: node dogfood-output/explore-full.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/e2e/node_modules/@playwright/test");

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "full");
const SHOTS = join(OUT, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = "https://app.staging.teacheros.io.vn";
const findings = [];
const coverage = [];
const pagesVisited = [];
const consoleLog = [];
const pageErrors = [];
let shotIndex = 0;

function note(severity, category, title, extra = {}) {
	findings.push({ severity, category, title, ...extra });
	console.log(`[${severity}/${category}] ${title}`);
}

function covered(feature, status, detail = "") {
	coverage.push({ feature, status, detail });
	console.log(
		`  cover ${status.padEnd(8)} ${feature}${detail ? ` — ${detail.slice(0, 80)}` : ""}`,
	);
}

async function shot(page, name) {
	shotIndex += 1;
	const path = join(SHOTS, `${String(shotIndex).padStart(2, "0")}-${name}.png`);
	await page.screenshot({ path, fullPage: true }).catch(() => {});
	return path;
}

async function bodyText(page) {
	return page.evaluate(() => document.body?.innerText || "");
}

async function waitSettled(page, ms = 700) {
	await page.waitForLoadState("domcontentloaded").catch(() => {});
	await page.waitForTimeout(ms);
}

async function goto(page, path) {
	const url = path.startsWith("http") ? path : `${BASE}${path}`;
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
	await waitSettled(page, 1000);
	pagesVisited.push(page.url());
}

async function clickName(page, name, timeout = 8000) {
	const loc = page.getByRole("button", { name });
	if (await loc.count()) {
		await loc.first().click({ timeout });
		return true;
	}
	const text = page.getByText(name, { exact: false });
	if (await text.count()) {
		await text
			.first()
			.click({ timeout })
			.catch(() => {});
		return true;
	}
	return false;
}

async function step(name, fn) {
	try {
		await fn();
	} catch (err) {
		note("High", "Functional", `Step failed: ${name}`, {
			actual: String(err).slice(0, 400),
		});
		covered(name, "FAIL", String(err).slice(0, 120));
	}
}

async function main() {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		locale: "vi-VN",
		timezoneId: "Asia/Ho_Chi_Minh",
		acceptDownloads: true,
	});
	const page = await context.newPage();
	page.setDefaultTimeout(12000);
	page.on("console", (msg) => {
		if (msg.type() === "error")
			consoleLog.push({ type: "error", text: msg.text(), url: page.url() });
	});
	page.on("pageerror", (err) =>
		pageErrors.push({ message: err.message, url: page.url() }),
	);

	const stamp = Date.now();
	const email = `dogfood.full.${stamp}@mailinator.com`;
	const password = `Qa!${randomBytes(12).toString("base64url")}`;

	// ---------- signup ----------
	await step("signup", async () => {
		await goto(page, "/login");
		await page.locator("#tab-signup").click();
		await waitSettled(page, 300);
		await page.locator("#su-name").fill("QA Full");
		await page.locator("#su-email").fill(email);
		await page.locator("#su-password").fill(password);
		const enabled = await page
			.locator("#panel-signup button[type=submit]")
			.isEnabled();
		if (!enabled) {
			await page.evaluate(() =>
				document.getElementById("panel-signup")?.requestSubmit(),
			);
		} else {
			await page.locator("#panel-signup button[type=submit]").click();
		}
		await page.waitForURL(/dashboard/, { timeout: 25000 });
		await waitSettled(page, 2000);
		await shot(page, "dashboard-fresh");
		if (!page.url().includes("/dashboard"))
			throw new Error("signup did not land dashboard");
		covered("signup email", "PASS");
	});

	// ---------- student ----------
	await step("add-student", async () => {
		await goto(page, "/students");
		await clickName(page, /Thêm học viên/);
		await waitSettled(page, 400);
		await page.getByPlaceholder("Nguyễn Văn A").fill("Học viên Full");
		await page.getByPlaceholder("09xx xxx xxx").fill("0988 111 222");
		await page.getByPlaceholder("Tên phụ huynh").fill("Phụ huynh Full");
		const nums = page.locator('input[type="number"]');
		if (await nums.count()) {
			await nums.nth(0).fill("12");
			if ((await nums.count()) > 1) await nums.nth(1).fill("450000");
		}
		await page.getByRole("button", { name: /^Lưu$/ }).click();
		await waitSettled(page, 2000);
		const t = await bodyText(page);
		await shot(page, "after-student");
		if (!/Học viên Full/.test(t)) throw new Error("student not on list");
		covered("add-student", "PASS");
	});

	// ---------- syllabus create ----------
	await step("add-syllabus", async () => {
		await goto(page, "/syllabus");
		await clickName(page, /Tạo syllabus/);
		await waitSettled(page, 400);
		await shot(page, "syllabus-modal");
		await page.getByPlaceholder(/IELTS Writing/).fill("Syllabus QA Full");
		await page.getByRole("button", { name: /^Writing$/ }).click();
		await page
			.getByPlaceholder(/Mô tả lộ trình/)
			.fill("Lộ trình writing band 7");
		await page.getByRole("button", { name: /^Tạo$/ }).click();
		await waitSettled(page, 2500);
		const t = await bodyText(page);
		await shot(page, "after-syllabus");
		if (!/Syllabus QA Full/.test(t))
			throw new Error(`syllabus not listed: ${t.slice(0, 300)}`);
		covered("add-syllabus", "PASS");
	});

	// ---------- syllabus detail: module + lesson ----------
	await step("syllabus-module-lesson", async () => {
		await page.getByText("Syllabus QA Full").first().click();
		await waitSettled(page, 1200);
		await shot(page, "syllabus-detail-empty");
		const addMod = page.getByRole("button", { name: /Thêm module/ });
		if (!(await addMod.count())) throw new Error("no add module button");
		await addMod.first().click();
		await waitSettled(page, 400);
		await page.getByPlaceholder(/Module 4/).fill("Module 1 — Task 2");
		await page.getByPlaceholder(/Mục tiêu chính/).fill("Opinion essays");
		await page
			.getByRole("button", { name: /Thêm module/ })
			.last()
			.click();
		await waitSettled(page, 2000);
		await shot(page, "after-module");
		const addLesson = page.getByRole("button", { name: /Thêm buổi học/ });
		if (await addLesson.count()) {
			await addLesson.first().click();
			await waitSettled(page, 400);
			await page
				.getByPlaceholder(/tên|VD|Agree/i)
				.first()
				.fill("Buổi 1 — Agree/Disagree")
				.catch(async () => {
					const inputs = page
						.locator("form input")
						.filter({ hasNot: page.locator("[type=hidden]") });
					if (await inputs.count())
						await inputs.first().fill("Buổi 1 — Agree/Disagree");
				});
			const lessonTitle = page.locator("form input").first();
			if (await lessonTitle.count()) {
				const v = await lessonTitle.inputValue();
				if (!v) await lessonTitle.fill("Buổi 1 — Agree/Disagree");
			}
			await page
				.getByRole("button", { name: /Thêm buổi/ })
				.last()
				.click();
			await waitSettled(page, 2000);
		}
		const t = await bodyText(page);
		await shot(page, "syllabus-with-content");
		if (!/Module 1/.test(t))
			note(
				"High",
				"Functional",
				"Thêm module không hiện trên syllabus detail",
				{ url: page.url(), actual: t.slice(0, 600) },
			);
		else covered("add-module", "PASS");
		if (/Buổi 1/.test(t)) covered("add-lesson", "PASS");
		else covered("add-lesson", "PARTIAL", "module ok, lesson text missing");
	});

	// ---------- class ----------
	await step("add-class", async () => {
		await goto(page, "/classes");
		await clickName(page, /Tạo lớp/);
		await waitSettled(page, 500);
		await shot(page, "class-modal");
		await page.getByPlaceholder(/IELTS Writing/).fill("Lớp QA Full");
		await page.getByRole("button", { name: /^Writing$/ }).click();
		const _tpl = page
			.locator("select")
			.filter({ hasText: /Syllabus QA Full|Lớp trống/ });
		if (await page.locator("select").count()) {
			const selects = page.locator("select");
			for (let i = 0; i < (await selects.count()); i++) {
				const html = await selects.nth(i).innerHTML();
				if (html.includes("Syllabus QA Full")) {
					const val = await selects
						.nth(i)
						.locator("option", { hasText: "Syllabus QA Full" })
						.getAttribute("value");
					if (val) await selects.nth(i).selectOption(val);
				}
			}
		}
		await page.getByRole("button", { name: /^T6$/ }).click();
		await page.getByRole("button", { name: /^Tạo lớp$/ }).click();
		await waitSettled(page, 3000);
		const t = await bodyText(page);
		await shot(page, "after-class");
		if (!/Lớp QA Full/.test(t)) {
			note("High", "Functional", "Tạo lớp không thấy trên list", {
				url: page.url(),
				actual: t.slice(0, 800),
			});
			covered("add-class", "FAIL", t.slice(0, 200));
		} else covered("add-class", "PASS");
	});

	// ---------- class detail: enroll + sessions + notes ----------
	await step("class-detail", async () => {
		if (!/Lớp QA Full/.test(await bodyText(page))) {
			await goto(page, "/classes");
		}
		await page.getByText("Lớp QA Full").first().click();
		await waitSettled(page, 1500);
		await shot(page, "class-detail-roster");
		covered("class-detail", "PASS", page.url());

		await clickName(page, /Thêm học viên/);
		await waitSettled(page, 500);
		await shot(page, "enroll-modal");
		const existing = page.getByRole("button", { name: /Học viên có sẵn/ });
		if (await existing.count()) await existing.click();
		await waitSettled(page, 300);
		const pick = page.getByRole("option").filter({ hasText: /Học viên Full/ });
		if (await pick.count()) await pick.first().click();
		else {
			const row = page.getByText("Học viên Full");
			if (await row.count()) await row.first().click();
		}
		await page.getByRole("button", { name: /^Lưu$/ }).click();
		await waitSettled(page, 2500);
		const roster = await bodyText(page);
		await shot(page, "after-enroll");
		if (!/Học viên Full/.test(roster)) {
			note("High", "Functional", "Enroll học viên vào lớp không hiện roster", {
				url: page.url(),
				actual: roster.slice(0, 700),
			});
			covered("enroll-student", "FAIL");
		} else covered("enroll-student", "PASS");

		const sessionsTab = page
			.getByRole("tab", { name: /Buổi học/ })
			.or(page.getByText("Buổi học", { exact: true }));
		if (await sessionsTab.count()) {
			await sessionsTab.first().click();
			await waitSettled(page, 800);
			await shot(page, "class-sessions");
			const checkin = page.getByRole("button", { name: /Điểm danh/ });
			if (await checkin.count()) {
				await checkin.first().click();
				await waitSettled(page, 2000);
				await shot(page, "after-session-checkin");
				covered("session-check-in", "PASS");
			} else {
				const more = page.getByRole("button", {
					name: /Hoàn thành|Hành động|Sửa/,
				});
				if (await more.count()) {
					await more.first().click();
					await waitSettled(page, 400);
					await shot(page, "session-actions-modal");
					const done = page.getByRole("button", { name: /Hoàn thành buổi/ });
					if (await done.count()) {
						await done.click();
						await waitSettled(page, 2000);
						covered("session-check-in", "PASS", "via actions modal");
					} else
						covered("session-check-in", "PARTIAL", "modal opened, no complete");
				} else {
					covered(
						"session-check-in",
						"SKIP",
						"no session CTA (startDate > today?)",
					);
					note(
						"Medium",
						"UX",
						"Tab Buổi học không có CTA điểm danh ngay sau khi tạo lớp (startDate = ngày mai)",
						{
							url: page.url(),
						},
					);
				}
			}
		}

		const notesTab = page.getByText("Ghi chú", { exact: true });
		if (await notesTab.count()) {
			await notesTab.last().click();
			await waitSettled(page, 400);
			const ta = page.locator("textarea");
			if (await ta.count()) {
				await ta.first().fill("Ghi chú QA: học viên cần luyện intro.");
				const save = page.getByRole("button", { name: /Lưu/ });
				if (await save.count()) {
					await save.first().click();
					await waitSettled(page, 1500);
					covered("update-class-notes", "PASS");
				} else
					covered(
						"update-class-notes",
						"PARTIAL",
						"typed notes, no save button",
					);
			}
			await shot(page, "class-notes");
		}
	});

	// ---------- schedule ----------
	await step("schedule", async () => {
		await goto(page, "/schedule");
		await shot(page, "schedule-week");
		const t = await bodyText(page);
		const next = page.getByRole("button", { name: /Tuần sau|→|Next/ });
		if (await next.count()) {
			await next.last().click();
			await waitSettled(page, 800);
			await shot(page, "schedule-next-week");
		}
		const block = page
			.locator("[class*='border-l']")
			.filter({ hasText: /Lớp QA|Full|19:00/ });
		if (await block.count()) {
			await block.first().click();
			await waitSettled(page, 600);
			await shot(page, "lesson-modal");
			covered("schedule-open-lesson", "PASS");
			await page.keyboard.press("Escape");
		} else {
			covered(
				"schedule-open-lesson",
				"PARTIAL",
				t.includes("Lớp QA Full") ? "name visible, not clickable" : "no block",
			);
		}
		const garbage = `${BASE}/schedule?week=not-a-week`;
		await goto(page, garbage);
		await waitSettled(page, 800);
		await shot(page, "schedule-bad-week");
		covered(
			"schedule-bad-week-param",
			page.url().includes("not-a-week") ? "FAIL" : "PASS",
			page.url(),
		);
	});

	// ---------- dashboard check-in ----------
	await step("dashboard-checkin", async () => {
		await goto(page, "/dashboard");
		await shot(page, "dashboard-after-data");
		const btn = page.getByRole("button", { name: /Điểm danh/ });
		if (await btn.count()) {
			await btn.first().click();
			await waitSettled(page, 2000);
			await shot(page, "dashboard-checked-in");
			covered("dashboard-check-in", "PASS");
		} else {
			covered(
				"dashboard-check-in",
				"SKIP",
				"no lesson today (class starts tomorrow)",
			);
		}
	});

	// ---------- tuition invoice + mark paid ----------
	await step("invoice", async () => {
		await goto(page, "/tuition");
		await clickName(page, /Tạo hóa đơn/);
		await waitSettled(page, 500);
		await shot(page, "invoice-modal");
		const t0 = await bodyText(page);
		if (/Chưa có học viên nào đang theo lớp/.test(t0)) {
			note(
				"High",
				"Functional",
				"Tạo hóa đơn: không có enrollment dù đã enroll",
				{ url: page.url() },
			);
			covered("add-invoice", "FAIL", "no enrollment options");
			await page.keyboard.press("Escape");
			return;
		}
		await page.getByPlaceholder("400000").fill("450000");
		await page
			.getByRole("button", { name: /Tạo|Lưu/ })
			.last()
			.click();
		await waitSettled(page, 2500);
		const t = await bodyText(page);
		await shot(page, "after-invoice");
		if (!/450/.test(t) && !/Chưa thu|Đã thu/.test(t)) {
			note("High", "Functional", "Tạo hóa đơn không thấy trên list", {
				url: page.url(),
				actual: t.slice(0, 700),
			});
			covered("add-invoice", "FAIL");
		} else covered("add-invoice", "PASS");

		const mark = page.getByRole("button", { name: /^Đã nhận$/ });
		if (await mark.count()) {
			await mark.first().click();
			await waitSettled(page, 2000);
			await shot(page, "after-mark-paid");
			const t2 = await bodyText(page);
			if (/Đã thu/.test(t2) || /Đã ghi nhận/.test(t2) || !/Đã nhận/.test(t2))
				covered("mark-invoice-paid", "PASS");
			else covered("mark-invoice-paid", "PARTIAL", t2.slice(0, 200));
		} else covered("mark-invoice-paid", "SKIP", "no Đã nhận button");
	});

	// ---------- assignments / grade ----------
	await step("assignments", async () => {
		await goto(page, "/assignments");
		await shot(page, "assignments-after-data");
		const t = await bodyText(page);
		if (/0 bài tập/.test(t) || !page.locator("table tbody tr").count) {
			covered("assignments-list", "PASS", "still empty — no create CTA");
			note(
				"High",
				"Functional",
				"Sau khi có lớp + học viên + syllabus, trang Bài tập vẫn trống và không có nút tạo",
				{
					url: page.url(),
				},
			);
		}
		const _row = page.locator("table tbody tr, [role=row]").nth(1);
		if ((await page.getByText(/Task|Writing|Bài/).count()) > 2) {
			await page
				.locator("table tbody tr")
				.first()
				.click()
				.catch(() => {});
			await waitSettled(page, 1000);
			await shot(page, "assignment-detail");
			if (await clickName(page, /Chấm/)) {
				await waitSettled(page, 400);
				await page
					.getByRole("button", { name: /Lưu|Chấm/ })
					.last()
					.click();
				await waitSettled(page, 1500);
				covered("grade-assignment", "PASS");
			}
		} else covered("grade-assignment", "SKIP", "no assignment rows");
	});

	// ---------- reports ----------
	await step("reports", async () => {
		await goto(page, "/reports");
		await clickName(page, /Tạo báo cáo/);
		await waitSettled(page, 400);
		await shot(page, "report-modal");
		await page.getByPlaceholder(/01–07/).fill("15–21/09");
		await page
			.getByPlaceholder(/Nhập nội dung/)
			.fill("Tuần này em tiến bộ Task 2.");
		const before = page.url();
		await page.getByRole("button", { name: /Gửi báo cáo/ }).click();
		await waitSettled(page, 800);
		await shot(page, "after-send-report");
		const t = await bodyText(page);
		if (/Tuần này em tiến bộ/.test(t) || /15–21/.test(t))
			covered("create-report", "PASS");
		else {
			note(
				"High",
				"Functional",
				"Gửi báo cáo tuần chỉ đóng modal, không lưu/gửi (submit = onClose)",
				{
					url: before,
					actual: t.slice(0, 500),
				},
			);
			covered("create-report", "FAIL", "modal-only, no persist");
		}
		if (await clickName(page, /Zalo OA/)) {
			await waitSettled(page, 400);
			await shot(page, "zalo-cta");
			covered("zalo-oa-cta", "PARTIAL", "clicked");
		}
	});

	// ---------- search + bell ----------
	await step("search-bell", async () => {
		await goto(page, "/dashboard");
		const search = page.getByPlaceholder(/Tìm học viên/);
		if (await search.count()) {
			await search.fill("Học viên Full");
			await waitSettled(page, 500);
			await shot(page, "search-results");
			const hit = page.getByText("Học viên Full");
			if ((await hit.count()) > 0) {
				await hit.last().click();
				await waitSettled(page, 1000);
				covered(
					"global-search",
					page.url().includes("/students/") ? "PASS" : "PARTIAL",
					page.url(),
				);
			} else covered("global-search", "FAIL", "no results");
		} else covered("global-search", "FAIL", "no search input");

		await goto(page, "/dashboard");
		const _bell = page
			.getByRole("button", { name: /thông báo|notification/i })
			.or(page.locator("header button").last());
		await page.locator("header").locator("button").last().click();
		await waitSettled(page, 400);
		await shot(page, "notif-panel");
		covered("notif-panel", "PASS", (await bodyText(page)).slice(0, 120));
	});

	// ---------- profile rename ----------
	await step("profile", async () => {
		await goto(page, "/profile");
		await shot(page, "profile");
		const name = page.getByTestId("profile-name-input");
		if (await name.count()) {
			await name.fill("QA Full Renamed");
			await page.getByTestId("profile-name-submit").click();
			await waitSettled(page, 1500);
			await shot(page, "profile-renamed");
			const t = await bodyText(page);
			if (/QA Full Renamed/.test(t)) covered("profile-rename", "PASS");
			else covered("profile-rename", "PARTIAL", t.slice(0, 200));
		}
		const google = page.getByRole("button", { name: /Google|Kết nối/ });
		if (await google.count()) covered("google-link-card", "PASS", "visible");
		else covered("google-link-card", "FAIL", "missing");
	});

	// ---------- settings tabs ----------
	await step("settings-tabs", async () => {
		await goto(page, "/settings");
		for (const tab of ["Mẫu tin Zalo", "Quy tắc", "Dữ liệu"]) {
			await page.getByText(tab, { exact: true }).click();
			await waitSettled(page, 400);
			await shot(page, `settings-${tab.replace(/\s+/g, "-")}`);
		}
		const t = await bodyText(page);
		if (/bản demo/.test(t)) {
			note(
				"High",
				"Functional",
				"Tab Dữ liệu thừa nhận demo; xuất CSV/JSON không phải file thật",
				{ url: page.url() },
			);
		}
		covered("settings-tabs", "PASS");
		const del = page.getByRole("button", { name: /Xóa tài khoản/ });
		if (await del.count()) {
			await del.click();
			await waitSettled(page, 400);
			await shot(page, "delete-account-click");
			const still = await bodyText(page);
			if (
				/dashboard|Cài đặt|Xóa tài khoản/.test(still) &&
				page.url().includes("/settings")
			) {
				note(
					"High",
					"UX",
					"Nút Xóa tài khoản không confirm và không xóa (click không có dialog)",
					{ url: page.url() },
				);
				covered("delete-account", "FAIL", "no confirm dialog");
			} else covered("delete-account", "PARTIAL");
		}
	});

	// ---------- logout + signin ----------
	await step("logout-signin", async () => {
		const logout = page
			.locator("button[aria-label*='Đăng xuất'], button[title*='Đăng xuất']")
			.or(page.getByRole("button", { name: /Đăng xuất|Log out/ }));
		if (await logout.count()) {
			await logout.first().click();
		} else {
			// sidebar logout icon next to avatar
			const sideBtns = page.locator("aside button, nav button");
			if (await sideBtns.count()) await sideBtns.last().click();
		}
		await waitSettled(page, 2000);
		await shot(page, "after-logout");
		if (!page.url().includes("/login")) {
			await goto(page, "/login");
		}
		covered(
			"logout",
			page.url().includes("/login") ? "PASS" : "PARTIAL",
			page.url(),
		);
		await page.locator("#tab-signin").click();
		await waitSettled(page, 300);
		await page.locator("#si-email").fill(email);
		await page.locator("#si-password").fill(password);
		const en = await page
			.locator("#panel-signin button[type=submit]")
			.isEnabled();
		if (en) await page.locator("#panel-signin button[type=submit]").click();
		else
			await page.evaluate(() =>
				document.getElementById("panel-signin")?.requestSubmit(),
			);
		await page.waitForURL(/dashboard/, { timeout: 20000 }).catch(() => {});
		await waitSettled(page, 1500);
		await shot(page, "after-signin");
		covered(
			"signin-existing",
			page.url().includes("/dashboard") ? "PASS" : "FAIL",
			page.url(),
		);
	});

	// console rollup
	for (const e of pageErrors) {
		if (/cloudflareinsights|favicon/.test(e.message || "")) continue;
		note("High", "Console", `pageerror: ${(e.message || "").slice(0, 160)}`, {
			url: e.url,
		});
	}
	const uniqueConsole = [
		...new Map(consoleLog.map((c) => [c.text, c])).values(),
	];
	for (const c of uniqueConsole) {
		if (/cloudflareinsights|favicon|Download the React DevTools/.test(c.text))
			continue;
		note("Medium", "Console", `console.error: ${c.text.slice(0, 160)}`, {
			url: c.url,
		});
	}

	const summary = {
		generatedAt: new Date().toISOString(),
		base: BASE,
		emailUsed: email,
		coverage,
		findings,
		pagesVisited,
		shots: shotIndex,
	};
	writeFileSync(join(OUT, "findings.json"), JSON.stringify(summary, null, 2));
	console.log(
		`\nDone. findings=${findings.length} coverage=${coverage.length} shots=${shotIndex}`,
	);
	await browser.close();
}

main().catch((err) => {
	console.error(err);
	writeFileSync(join(OUT, "explore-error.txt"), String(err?.stack || err));
	writeFileSync(
		join(OUT, "findings.json"),
		JSON.stringify({ crash: String(err), findings, coverage }, null, 2),
	);
	process.exit(1);
});
