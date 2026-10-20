import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * #378 — Tab "Bạn cùng lớp" trên trang chi tiết lớp: roster CHỈ gồm tên +
 * avatar chữ tắt (không email/band/học phí). Kernel rows seeded direct-DB
 * (precedent seedStudent); auth học viên là thật (portal signup + mail-log
 * verification) làm một lần trong beforeAll.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `classmates.${runToken}@test.local`;
const studentName = "Bảo Ngọc Classmates";
const mateName = "Trần Văn Mate";
const invitedOnlyName = "Lê Chưa Nhận Lời Mời";
const className = "IELTS Classmates E2E";

let fixture: QuizFixture;

async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
}

test.beforeAll(async ({ browser }) => {
	const today = vietnamTodayISO();
	fixture = await seedQuizFixture({
		orgName: `Classmates E2E ${runToken}`,
		className,
		studentName,
		studentEmail,
		lessons: [
			{
				date: addDaysISO(today, -1),
				time: "18:30",
				dur: 90,
				status: "completed",
				topic: "Buổi hôm qua",
			},
		],
		prompts: [],
	});

	// Bạn cùng lớp: một học viên active (hiện) + một học viên chỉ `invited`
	// (KHÔNG hiện trong roster).
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	const now = Date.now();
	for (const [id, name, email] of [
		[crypto.randomUUID(), mateName, `mate.${runToken}@test.local`],
		[crypto.randomUUID(), invitedOnlyName, `invited.${runToken}@test.local`],
	] as const) {
		await db.execute({
			sql: `INSERT INTO student (id, org_id, name, email, created_at)
				VALUES (?,?,?,?,?)`,
			args: [id, fixture.orgId, name, email, now],
		});
		await db.execute({
			sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
				VALUES (?,?,?,?,?,?)`,
			args: [
				crypto.randomUUID(),
				fixture.orgId,
				fixture.classId,
				id,
				name === mateName ? "active" : "invited",
				now,
			],
		});
	}
	db.close();

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(studentName);
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await context.close();
});

test.describe("Student classmates tab", () => {
	test("hiện bạn cùng lớp chỉ với tên + chữ tắt, không lộ email", async ({
		page,
	}) => {
		await signIn(page);

		const card = page.getByTestId("class-card").filter({ hasText: className });
		await card.getByRole("link", { name: className }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		await page.getByRole("tab", { name: "Bạn cùng lớp" }).click();

		const grid = page.getByTestId("classmates-grid");
		await expect(grid.getByTestId("classmate-card")).toHaveCount(2);

		// Chính mình có dấu "(bạn)"; bạn cùng lớp active có tên.
		const mine = grid.getByTestId("classmate-card").filter({
			hasText: studentName,
		});
		await expect(mine).toContainText("(bạn)");
		await expect(
			grid.getByTestId("classmate-card").filter({ hasText: mateName }),
		).toBeVisible();

		// Học viên chỉ `invited` không nằm trong roster.
		await expect(grid).not.toContainText(invitedOnlyName);
		// Quy ước quyền riêng #378: roster không bao giờ hiển thị email.
		await expect(grid).not.toContainText("@");
	});
});
