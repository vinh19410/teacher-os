/**
 * End-user exploratory QA against staging Teacher OS.
 * Run: node dogfood-output/explore.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("../apps/e2e/node_modules/@playwright/test");

import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const SHOTS = join(OUT, "screenshots");
mkdirSync(SHOTS, { recursive: true });

const BASE = "https://app.staging.teacheros.io.vn";
const findings = [];
const pagesVisited = [];
const consoleLog = [];
const pageErrors = [];
const failedRequests = [];
let shotIndex = 0;

function note(severity, category, title, extra = {}) {
	findings.push({ severity, category, title, ...extra });
	console.log(`[${severity}/${category}] ${title}`);
}

async function shot(page, name) {
	shotIndex += 1;
	const file = `${String(shotIndex).padStart(2, "0")}-${name}.png`;
	const path = join(SHOTS, file);
	await page.screenshot({ path, fullPage: true });
	return path;
}

async function bodyText(page) {
	return page.evaluate(() => document.body?.innerText || "");
}

function attachListeners(page) {
	page.on("console", (msg) => {
		const entry = {
			type: msg.type(),
			text: msg.text(),
			url: page.url(),
		};
		consoleLog.push(entry);
	});
	page.on("pageerror", (err) => {
		pageErrors.push({
			message: err.message,
			stack: String(err.stack || ""),
			url: page.url(),
		});
	});
	page.on("requestfailed", (req) => {
		failedRequests.push({
			url: req.url(),
			method: req.method(),
			error: req.failure()?.errorText,
			page: page.url(),
		});
	});
	page.on("response", (res) => {
		if (res.status() >= 400) {
			failedRequests.push({
				url: res.url(),
				method: res.request().method(),
				status: res.status(),
				page: page.url(),
			});
		}
	});
}

async function waitSettled(page, ms = 800) {
	await page.waitForLoadState("domcontentloaded").catch(() => {});
	await page.waitForTimeout(ms);
}

async function dumpButtons(page) {
	return page.evaluate(() =>
		[...document.querySelectorAll("button,input[type=submit]")].map((e) => ({
			id: e.id,
			type: e.getAttribute("type"),
			text: (e.innerText || e.value || "").replace(/\s+/g, " ").slice(0, 80),
			disabled: e.disabled,
			hidden: e.hidden || !!e.closest("[hidden]"),
			form: e.closest("form")?.id || null,
		})),
	);
}

const notedDisabledForms = new Set();

async function submitForm(page, formId) {
	const state = await dumpButtons(page);
	const submit = state.find((b) => b.form === formId && b.type === "submit");
	if (submit?.disabled && !notedDisabledForms.has(formId)) {
		notedDisabledForms.add(formId);
		note(
			"High",
			"UX",
			`Nút submit #${formId} bị disabled khi form còn trống/invalid — user không bấm được để xem lỗi`,
			{
				url: page.url(),
				actual: submit,
			},
		);
	}
	await page.evaluate((id) => {
		const form = document.getElementById(id);
		if (form) form.requestSubmit();
	}, formId);
	await waitSettled(page, 500);
}

async function goto(page, path) {
	const url = path.startsWith("http") ? path : `${BASE}${path}`;
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
	await waitSettled(page, 1200);
	pagesVisited.push({ url: page.url(), title: await page.title() });
}

async function main() {
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		locale: "vi-VN",
		timezoneId: "Asia/Ho_Chi_Minh",
	});
	const page = await context.newPage();
	page.setDefaultTimeout(12000);
	attachListeners(page);

	// ---------- 1. Landing / login ----------
	await goto(page, "/");
	const htmlLang = await page.locator("html").getAttribute("lang");
	const loginText = await bodyText(page);
	const loginShot = await shot(page, "login-default");

	if (
		htmlLang === "vi" &&
		/Create your account|Welcome back|Continue with Google/.test(loginText)
	) {
		note(
			"Medium",
			"Content",
			"html lang=vi nhưng toàn bộ trang login bằng tiếng Anh",
			{
				url: page.url(),
				screenshot: loginShot,
				expected: "UI tiếng Việt khớp lang=vi, hoặc lang=en",
				actual: `lang=${htmlLang}; copy English: Create your account / Continue with Google`,
			},
		);
	}

	if (/Thu, Aug 20/.test(loginText)) {
		note(
			"Low",
			"Content",
			"Brand panel login hiện lịch demo cố định 'Thu, Aug 20' (không phải hôm nay)",
			{
				url: page.url(),
				screenshot: loginShot,
				expected:
					"Panel marketing có thể dùng mock, nhưng ngày cứng dễ hiểu nhầm app đang lệch lịch",
				actual: "Today · Thu, Aug 20 · 3 classes",
			},
		);
	}

	// Empty signup validation (button may be disabled via canSubmit)
	await submitForm(page, "panel-signup");
	const emptySignup = await bodyText(page);
	const emptySignupShot = await shot(page, "signup-empty-validation");
	if (!/Name must be at least 2 characters/.test(emptySignup)) {
		note("High", "Functional", "Submit signup trống không hiện lỗi Name", {
			url: page.url(),
			screenshot: emptySignupShot,
			actual: emptySignup.slice(0, 500),
		});
	}

	// Invalid email on signup (no password typed — leave password empty)
	await page.locator("#su-name").fill("A");
	await page.locator("#su-email").fill("not-an-email");
	await submitForm(page, "panel-signup");
	const badSignup = await bodyText(page);
	const badSignupShot = await shot(page, "signup-invalid-email");
	if (!/Invalid email address/.test(badSignup)) {
		note(
			"Medium",
			"Functional",
			"Signup: email không hợp lệ không hiện 'Invalid email address'",
			{
				url: page.url(),
				screenshot: badSignupShot,
				actual: badSignup.slice(-800),
			},
		);
	}
	if (!/Name must be at least 2 characters/.test(badSignup)) {
		note("Medium", "Functional", "Signup: tên 1 ký tự không bị chặn", {
			url: page.url(),
			screenshot: badSignupShot,
		});
	}

	// Sign-in tab
	await page.locator("#tab-signin").click();
	await waitSettled(page, 400);
	await shot(page, "signin-tab");
	await submitForm(page, "panel-signin");
	const emptySignin = await bodyText(page);
	const emptySigninShot = await shot(page, "signin-empty-validation");
	if (
		!/Email is required/.test(emptySignin) ||
		!/Password is required/.test(emptySignin)
	) {
		note("High", "Functional", "Sign-in trống thiếu message required", {
			url: page.url(),
			screenshot: emptySigninShot,
			actual: emptySignin.slice(-600),
		});
	}

	await page.locator("#si-email").fill("not-an-email");
	await submitForm(page, "panel-signin");
	const badEmailSignin = await bodyText(page);
	const badEmailShot = await shot(page, "signin-invalid-email");
	if (!/Invalid email address/.test(badEmailSignin)) {
		note(
			"High",
			"Functional",
			"Sign-in: email 'not-an-email' không hiện Invalid email address",
			{
				url: page.url(),
				screenshot: badEmailShot,
				expected: "Invalid email address",
				actual: badEmailSignin.slice(-700),
				steps: [
					"Mở /login",
					"Tab Sign in",
					"Nhập email not-an-email, để trống password",
					"Bấm Sign in",
				],
			},
		);
	}

	// Forgot password
	await page.getByRole("button", { name: /Forgot password/i }).click();
	await waitSettled(page, 300);
	const forgot = await bodyText(page);
	const forgotShot = await shot(page, "forgot-password");
	if (!/Password reset isn't enabled/.test(forgot)) {
		note("Medium", "UX", "Forgot password không hiện thông báo pilot", {
			url: page.url(),
			screenshot: forgotShot,
		});
	}

	// Open redirect probe (unauth)
	await goto(page, "/login?returnUrl=https://evil.example");
	await shot(page, "login-returnurl-external");
	const returnUrlValue = new URL(page.url()).searchParams.get("returnUrl");
	if (returnUrlValue === "https://evil.example") {
		// URL is accepted in the query string; actual redirect happens after login.
		// Record as informational — validateReturnUrl should drop it on assign.
	}

	// Protected route redirect
	await goto(page, "/dashboard");
	await shot(page, "unauth-dashboard-redirect");
	if (!page.url().includes("/login")) {
		note(
			"Critical",
			"Functional",
			"Vào /dashboard khi chưa login không bị đẩy về /login",
			{
				url: page.url(),
			},
		);
	}

	// 404
	await goto(page, "/this-page-does-not-exist-qa");
	const notFoundText = await bodyText(page);
	const notFoundShot = await shot(page, "404");
	if (
		!/not found|không tìm thấy|404|doesn't exist|does not exist/i.test(
			notFoundText,
		)
	) {
		note("Medium", "UX", "Trang không tồn tại không có empty/404 rõ ràng", {
			url: page.url(),
			screenshot: notFoundShot,
			actual: notFoundText.slice(0, 600),
		});
	}

	// Google OAuth starts
	await goto(page, "/login");
	await page.locator("#tab-signin").click();
	await waitSettled(page, 300);
	let popup = null;
	try {
		[popup] = await Promise.all([
			page.waitForEvent("popup", { timeout: 8000 }).catch(() => null),
			page
				.getByRole("button", { name: /Continue with Google/i })
				.click({ timeout: 8000 }),
		]);
	} catch (err) {
		note("Medium", "Functional", "Không click được Continue with Google", {
			url: page.url(),
			actual: String(err).slice(0, 300),
		});
	}
	await waitSettled(page, 2000);
	const oauthUrl = popup ? popup.url() : page.url();
	await shot(page, "google-oauth-after-click");
	if (popup) {
		await popup
			.screenshot({
				path: join(
					SHOTS,
					`${String(++shotIndex).padStart(2, "0")}-google-popup.png`,
				),
			})
			.catch(() => {});
		await popup.close().catch(() => {});
	}
	const oauthOk =
		/accounts\.google\.com|google/.test(oauthUrl) ||
		page.url().includes("google");
	if (!oauthOk && !/accounts\.google/.test(oauthUrl)) {
		const afterGoogle = await bodyText(page);
		if (/couldn't|error|fail/i.test(afterGoogle)) {
			note("High", "Functional", "Continue with Google hiện lỗi trên staging", {
				url: page.url(),
				actual: afterGoogle.slice(-500),
			});
		}
	}

	// ---------- 2. Sign up as new teacher ----------
	await goto(page, "/login");
	await page.locator("#tab-signup").click();
	await waitSettled(page, 400);
	const stamp = Date.now();
	const email = `dogfood.qa.${stamp}@mailinator.com`;
	const password = `Qa!${randomBytes(12).toString("base64url")}`;
	await page.locator("#su-name").fill("QA Dogfood");
	await page.locator("#su-email").fill(email);
	await page.locator("#su-password").fill(password);
	await shot(page, "signup-filled");
	const signupEnabled = await page
		.locator("#panel-signup button[type=submit]")
		.isEnabled();
	if (!signupEnabled) {
		note(
			"Critical",
			"Functional",
			"Sau khi điền đủ Name/Email/Password (>=8) nút Create account vẫn disabled",
			{
				url: page.url(),
			},
		);
		await submitForm(page, "panel-signup");
	} else {
		await page.locator("#panel-signup button[type=submit]").click();
	}
	await page.waitForURL(/dashboard|login/, { timeout: 25000 }).catch(() => {});
	await waitSettled(page, 2500);
	const afterSignupShot = await shot(page, "after-signup");
	const afterSignupUrl = page.url();
	const afterSignupText = await bodyText(page);

	let signedIn =
		/\/dashboard/.test(afterSignupUrl) && !/\/login/.test(afterSignupUrl);
	if (
		!signedIn &&
		/Couldn't create|already exists|error/i.test(afterSignupText)
	) {
		note("High", "Functional", "Không tạo được tài khoản mới trên staging", {
			url: afterSignupUrl,
			screenshot: afterSignupShot,
			actual: afterSignupText.slice(-800),
			emailUsed: email,
		});
	} else if (!signedIn) {
		note("High", "Functional", "Signup không đưa vào dashboard", {
			url: afterSignupUrl,
			screenshot: afterSignupShot,
			actual: afterSignupText.slice(0, 800),
		});
	}

	// ---------- 3. Walk authenticated pages ----------
	const navPaths = [
		["/dashboard", "dashboard"],
		["/students", "students"],
		["/schedule", "schedule"],
		["/tuition", "tuition"],
		["/assignments", "assignments"],
		["/classes", "classes"],
		["/syllabus", "syllabus"],
		["/reports", "reports"],
		["/settings", "settings"],
		["/profile", "profile"],
	];

	const pageSnaps = {};
	if (signedIn) {
		for (const [path, name] of navPaths) {
			await goto(page, path);
			await waitSettled(page, 1000);
			const text = await bodyText(page);
			const s = await shot(page, `auth-${name}`);
			pageSnaps[name] = { url: page.url(), text, screenshot: s };

			if (page.url().includes("/login")) {
				note("Critical", "Functional", `Mất session khi vào ${path}`, {
					url: page.url(),
					screenshot: s,
				});
				signedIn = false;
				break;
			}
			if (
				/Máy chủ gặp sự cố|Phiên đăng nhập đã hết hạn|Couldn't load|failed to load/i.test(
					text,
				)
			) {
				note("High", "Functional", `Trang ${name} hiện lỗi load kernel`, {
					url: page.url(),
					screenshot: s,
					actual: text.slice(0, 700),
				});
			}
			if (/undefined|\[object Object\]|lorem ipsum/i.test(text)) {
				note("Medium", "Content", `Trang ${name} lộ placeholder/undefined`, {
					url: page.url(),
					screenshot: s,
					actual: text.match(/undefined|\[object Object\]|lorem ipsum/i)?.[0],
				});
			}
		}
	}

	// ---------- 4. CRUD: add student ----------
	if (signedIn) {
		await goto(page, "/students");
		await waitSettled(page, 800);
		const addBtn = page.getByRole("button", { name: /Thêm học viên/ });
		if (await addBtn.count()) {
			await addBtn.click();
			await waitSettled(page, 500);
			await shot(page, "add-student-modal-empty");
			// empty submit
			const saveBtn = page.getByRole("button", { name: /^Lưu$/ });
			if (await saveBtn.count()) {
				await saveBtn.click();
				await waitSettled(page, 400);
				const modalText = await bodyText(page);
				const emptyStudentShot = await shot(page, "add-student-empty-submit");
				if (!/họ tên|tên|bắt buộc|required|không được/i.test(modalText)) {
					note(
						"High",
						"Functional",
						"Thêm học viên: submit trống không có lỗi tên",
						{
							url: page.url(),
							screenshot: emptyStudentShot,
							actual: modalText.slice(-700),
						},
					);
				}

				// invalid package 0
				const nameInput = page.getByPlaceholder("Nguyễn Văn A");
				if (await nameInput.count()) {
					await nameInput.fill("Học viên QA");
				}
				const numberInputs = page.locator('input[type="number"]');
				if (await numberInputs.count()) {
					await numberInputs.nth(0).fill("0");
				}
				await saveBtn.click();
				await waitSettled(page, 400);
				const zeroPkg = await bodyText(page);
				const zeroShot = await shot(page, "add-student-zero-package");
				if (!/Số buổi gói phải là số nguyên từ 1/.test(zeroPkg)) {
					note(
						"High",
						"Functional",
						"Thêm học viên: gói 0 buổi không bị chặn (issue #115 regression?)",
						{
							url: page.url(),
							screenshot: zeroShot,
							actual: zeroPkg.slice(-700),
						},
					);
				}

				// valid create
				if (await numberInputs.count()) {
					await numberInputs.nth(0).fill("10");
				}
				const phone = page.getByPlaceholder("09xx xxx xxx");
				if (await phone.count()) await phone.fill("0912 345 678");
				await saveBtn.click();
				await waitSettled(page, 2000);
				const afterStudent = await bodyText(page);
				const afterStudentShot = await shot(page, "after-add-student");
				if (!/Học viên QA/.test(afterStudent)) {
					note(
						"High",
						"Functional",
						"Tạo học viên thành công không thấy trên list",
						{
							url: page.url(),
							screenshot: afterStudentShot,
							actual: afterStudent.slice(0, 900),
						},
					);
				} else {
					// open detail
					await page.getByText("Học viên QA", { exact: false }).first().click();
					await waitSettled(page, 1200);
					await shot(page, "student-detail");
				}
			}
		} else {
			note(
				"High",
				"Functional",
				"Trang Học viên không có nút + Thêm học viên",
				{
					url: page.url(),
					screenshot: pageSnaps.students?.screenshot,
				},
			);
		}
	}

	// ---------- 5. CRUD: add class ----------
	if (signedIn) {
		await goto(page, "/classes");
		await waitSettled(page, 800);
		const addClass = page.getByRole("button", { name: /Tạo lớp|Thêm lớp|\+ / });
		const addClassAlt = page.locator("button").filter({ hasText: /lớp/i });
		const clicked = (await addClass.count())
			? await addClass
					.first()
					.click()
					.then(() => true)
					.catch(() => false)
			: (await addClassAlt.count())
				? await addClassAlt
						.first()
						.click()
						.then(() => true)
						.catch(() => false)
				: false;
		if (clicked) {
			await waitSettled(page, 500);
			await shot(page, "add-class-modal");
			const saveClass = page.getByRole("button", { name: /^Lưu$/ });
			if (await saveClass.count()) {
				await saveClass.click();
				await waitSettled(page, 400);
				const emptyClass = await bodyText(page);
				const emptyClassShot = await shot(page, "add-class-empty-submit");
				if (!/Vui lòng nhập tên lớp/.test(emptyClass)) {
					note(
						"Medium",
						"Functional",
						"Tạo lớp: submit trống không hiện 'Vui lòng nhập tên lớp'",
						{
							url: page.url(),
							screenshot: emptyClassShot,
							actual: emptyClass.slice(-600),
						},
					);
				}

				const className = page.getByPlaceholder(/IELTS Writing/);
				if (await className.count()) await className.fill("Lớp QA Dogfood");
				// pick a skill chip if present
				const writing = page.getByRole("button", { name: /^Writing$/ });
				if (await writing.count()) await writing.click();
				const thu = page.getByRole("button", {
					name: /^Thu$|^T[5]$|^Thứ năm$|^Thursday$/i,
				});
				const dayBtns = page
					.locator("button")
					.filter({ hasText: /T2|T3|T4|T5|Mon|Tue|Wed|Thu|Thứ/ });
				if (await thu.count()) await thu.click();
				else if (await dayBtns.count()) await dayBtns.first().click();
				await saveClass.click();
				await waitSettled(page, 2500);
				const afterClass = await bodyText(page);
				const afterClassShot = await shot(page, "after-add-class");
				if (
					!/Lớp QA Dogfood/.test(afterClass) &&
					/Chọn ít nhất/.test(afterClass)
				) {
					note(
						"Medium",
						"UX",
						"Tạo lớp còn thiếu field (kỹ năng/ngày) — validation OK nhưng copy cần rõ field nào",
						{
							url: page.url(),
							screenshot: afterClassShot,
							actual: afterClass.slice(-500),
						},
					);
				} else if (!/Lớp QA Dogfood/.test(afterClass)) {
					note("High", "Functional", "Tạo lớp không thấy lớp mới trên list", {
						url: page.url(),
						screenshot: afterClassShot,
						actual: afterClass.slice(0, 900),
					});
				}
			}
		} else {
			await shot(page, "classes-no-add-button");
		}
	}

	// ---------- 6. Mobile viewport smoke ----------
	if (signedIn) {
		await page.setViewportSize({ width: 390, height: 844 });
		await goto(page, "/dashboard");
		await waitSettled(page, 800);
		await shot(page, "mobile-dashboard");
		await goto(page, "/students");
		await waitSettled(page, 800);
		await shot(page, "mobile-students");
		await goto(page, "/login");
		// if still signed in, login may redirect
		await page.setViewportSize({ width: 390, height: 844 });
		await context.clearCookies();
		await page.evaluate(() => localStorage.clear()).catch(() => {});
		await goto(page, "/login");
		await waitSettled(page, 800);
		const mobileLogin = await shot(page, "mobile-login");
		const mobileLoginText = await bodyText(page);
		// overflow check via scroll width
		const overflow = await page.evaluate(() => ({
			scrollW: document.documentElement.scrollWidth,
			clientW: document.documentElement.clientWidth,
		}));
		if (overflow.scrollW > overflow.clientW + 8) {
			note("Medium", "Visual", "Trang login overflow ngang trên mobile 390px", {
				url: page.url(),
				screenshot: mobileLogin,
				actual: overflow,
			});
		}
		if (
			!mobileLoginText.includes("Create") &&
			!mobileLoginText.includes("Sign in")
		) {
			note("Medium", "Visual", "Login mobile không hiện form", {
				url: page.url(),
				screenshot: mobileLogin,
				actual: mobileLoginText.slice(0, 400),
			});
		}
	}

	// Console / network rollup
	const jsErrors = [
		...pageErrors,
		...consoleLog.filter((c) => c.type === "error"),
	];
	const uniqueJs = [
		...new Map(jsErrors.map((e) => [e.message || e.text, e])).values(),
	];
	for (const e of uniqueJs) {
		const text = e.message || e.text || "";
		if (/favicon|Download the React DevTools|Warning:/i.test(text)) continue;
		note("High", "Console", `JS error: ${text.slice(0, 180)}`, {
			url: e.url,
			actual: text,
		});
	}
	const uniqueFailed = [
		...new Map(failedRequests.map((r) => [`${r.status}|${r.url}`, r])).values(),
	];
	for (const r of uniqueFailed) {
		if (r.status === 404 && /favicon|sourcemap/.test(r.url || "")) continue;
		if ((r.url || "").includes("accounts.google.com")) continue;
		note(
			r.status >= 500 ? "High" : "Medium",
			"Console",
			`HTTP ${r.status || r.error} ${r.method || ""} ${String(r.url).slice(0, 120)}`,
			{ url: r.page, actual: r },
		);
	}

	const summary = {
		generatedAt: new Date().toISOString(),
		base: BASE,
		signedIn,
		emailUsed: email,
		pagesVisited,
		findings,
		consoleErrorCount: uniqueJs.length,
		failedRequestCount: uniqueFailed.length,
	};
	writeFileSync(join(OUT, "findings.json"), JSON.stringify(summary, null, 2));
	writeFileSync(
		join(OUT, "console-raw.json"),
		JSON.stringify({ consoleLog, pageErrors, failedRequests }, null, 2),
	);
	console.log(
		`\nDone. findings=${findings.length} signedIn=${signedIn} shots=${shotIndex}`,
	);
	await browser.close();
}

main().catch((err) => {
	console.error(err);
	writeFileSync(join(OUT, "explore-error.txt"), String(err?.stack || err));
	writeFileSync(
		join(OUT, "findings.json"),
		JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				crash: String(err),
				findings,
				pagesVisited,
			},
			null,
			2,
		),
	);
	process.exit(1);
});
