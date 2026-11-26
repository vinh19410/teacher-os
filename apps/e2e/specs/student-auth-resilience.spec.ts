import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	expect,
	type Page,
	request as playwrightRequest,
	test,
} from "@playwright/test";
import { seedQuizFixture } from "./helpers-quiz";
import { API_ORIGIN, LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

const DEFAULT_PASSWORD = "password-8chars";
const LOCAL_DB_PATH = fileURLToPath(
	new URL("../local.db", import.meta.url).href,
);
const RUN_TOKEN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const STUDENT_EMAIL = `auth-resilience.${RUN_TOKEN}@e2e.test`;
const STUDENT_NAME = "Học Viên Auth Resilience";

async function createVerifiedStudentAccount(
	email: string,
	name: string,
): Promise<void> {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const res = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
			data: {
				name,
				email,
				password: DEFAULT_PASSWORD,
			},
			headers: {
				"Content-Type": "application/json",
				Origin: LMS_ORIGIN,
			},
		});
		if (res.status() !== 200) {
			throw new Error(`sign-up failed (${res.status()}): ${await res.text()}`);
		}
	} finally {
		await apiCtx.dispose();
	}

	const db = createClient({ url: `file:${LOCAL_DB_PATH}` });
	await db.execute("PRAGMA busy_timeout = 5000;");
	try {
		const updated = await db.execute({
			sql: "UPDATE user SET role = 'student', email_verified = 1 WHERE lower(email) = lower(?)",
			args: [email],
		});
		expect(Number(updated.rowsAffected)).toBe(1);
	} finally {
		db.close();
	}
}

async function signInAsStudent(page: Page): Promise<void> {
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#signin-email").fill(STUDENT_EMAIL);
	await page.locator("#signin-password").fill(DEFAULT_PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
}

test.describe("Student auth resilience on transient session failures", () => {
	test.beforeAll(async () => {
		await seedQuizFixture({
			orgName: `Auth Resilience Org ${RUN_TOKEN}`,
			className: "IELTS Listening Resilience",
			studentName: STUDENT_NAME,
			studentEmail: STUDENT_EMAIL,
			prompts: [],
		});
		await createVerifiedStudentAccount(STUDENT_EMAIL, STUDENT_NAME);
	});

	test("keeps student signed in across SPA navigations when /api/auth/get-session returns transient 503 and 429", async ({
		page,
	}) => {
		test.setTimeout(60_000);
		await signInAsStudent(page);

		await page.goto(`${STUDENT_BASE_URL}/practice/listening`);
		await expect(page).toHaveURL(/\/student\/practice\/listening/, {
			timeout: 20_000,
		});
		const scheduleLink = page.getByRole("link", { name: "Lịch học" }).first();
		const assignmentsLink = page.getByRole("link", { name: "Bài tập" }).first();
		await expect(scheduleLink).toBeVisible({ timeout: 15_000 });

		const visitedUrls: string[] = [];
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) {
				visitedUrls.push(frame.url());
			}
		});

		// Wait past the 15s fresh session cache TTL so the next real SPA navigation
		// must revalidate against /api/auth/get-session.
		await page.waitForTimeout(15_500);

		const interceptedStatuses: number[] = [];
		await page.route("**/api/auth/get-session*", async (route) => {
			const status = interceptedStatuses.length === 0 ? 503 : 429;
			interceptedStatuses.push(status);
			await route.fulfill({
				status,
				contentType: "application/json",
				body: JSON.stringify({
					message: status === 503 ? "Service Unavailable" : "Too Many Requests",
				}),
			});
		});

		await scheduleLink.click();
		await expect(page).toHaveURL(/\/student\/schedule/, { timeout: 15_000 });
		expect(interceptedStatuses).toContain(503);

		// Wait past the 5s fallback cache TTL so the next navigation exercises a
		// second transient failure (429) without falling back to /login.
		await page.waitForTimeout(5_500);

		await assignmentsLink.click();
		await expect(page).toHaveURL(/\/student\/assignments/, { timeout: 15_000 });

		expect(interceptedStatuses).toContain(429);
		expect(interceptedStatuses.length).toBeGreaterThanOrEqual(2);
		expect(visitedUrls.some((url) => url.includes("/login"))).toBe(false);
		await expect(assignmentsLink).toBeVisible();
	});

	test("recovers on cold reload when the first /api/auth/get-session attempt returns 503", async ({
		page,
	}) => {
		await signInAsStudent(page);

		await page.goto(`${STUDENT_BASE_URL}/practice/listening`);
		await expect(page).toHaveURL(/\/student\/practice\/listening/, {
			timeout: 20_000,
		});
		await expect(
			page.getByRole("link", { name: "Lịch học" }).first(),
		).toBeVisible({ timeout: 15_000 });

		const visitedUrls: string[] = [];
		page.on("framenavigated", (frame) => {
			if (frame === page.mainFrame()) {
				visitedUrls.push(frame.url());
			}
		});

		let sessionRequests = 0;
		let injected503Count = 0;
		await page.route("**/api/auth/get-session*", async (route) => {
			sessionRequests += 1;
			if (sessionRequests === 1) {
				injected503Count += 1;
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ message: "Service Unavailable" }),
				});
				return;
			}
			await route.continue();
		});

		await page.reload();
		await expect(page).toHaveURL(/\/student\/practice\/listening/, {
			timeout: 20_000,
		});
		await expect(
			page.getByRole("link", { name: "Lịch học" }).first(),
		).toBeVisible({ timeout: 15_000 });

		expect(injected503Count).toBe(1);
		expect(sessionRequests).toBeGreaterThanOrEqual(2);
		expect(visitedUrls.some((url) => url.includes("/login"))).toBe(false);
	});

	test("redirects to /login with encoded returnUrl when session is genuinely absent", async ({
		page,
	}) => {
		await signInAsStudent(page);

		await page.goto(`${STUDENT_BASE_URL}/practice/listening`);
		await expect(page).toHaveURL(/\/student\/practice\/listening/, {
			timeout: 20_000,
		});

		await page.context().clearCookies();
		await page.reload();

		await expect(page).toHaveURL(
			/\/login\?returnUrl=%2Fstudent%2Fpractice%2Flistening/,
			{ timeout: 20_000 },
		);
		await expect(page.locator("#signin-email")).toBeVisible({
			timeout: 15_000,
		});
	});
});
