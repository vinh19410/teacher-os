import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	addDaysISO,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

/**
 * Tab "Bạn cùng lớp" trên trang chi tiết lớp học viên đang được ẩn khỏi UI:
 * thanh tab chỉ còn 3 mục ("Hành trình học", "Bài tập", "Giáo trình"), không
 * hiển thị danh sách/tên học viên cùng lớp và không gọi API /classmates.
 * Kernel rows seeded direct-DB (precedent seedStudent); auth học viên là thật
 * (portal signup + mail-log verification) làm một lần trong beforeAll.
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
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
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

	// Seed thêm học viên cùng lớp (1 active + 1 invited) để xác minh cả hai
	// đều KHÔNG bị lộ trên DOM khi tab "Bạn cùng lớp" bị ẩn.
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
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill(studentName);
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
	await context.close();
});

test.describe("Student classmates tab", () => {
	test("ẩn tab Bạn cùng lớp, giữ 3 tab còn lại hoạt động và không gọi API classmates", async ({
		page,
	}) => {
		const classmatesRequests: string[] = [];
		page.on("request", (req) => {
			if (
				/\/api\/student\/classes\/[^/]+\/classmates(?:\?|$)/.test(req.url())
			) {
				classmatesRequests.push(req.url());
			}
		});

		await signIn(page);

		const card = page.getByTestId("class-card").filter({ hasText: className });
		await card.getByRole("link", { name: className }).click();
		await expect(
			page.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		const tabs = page.getByRole("tab");
		await expect(tabs).toHaveCount(3);
		await expect(tabs).toHaveText(["Hành trình học", "Bài tập", "Giáo trình"]);
		await expect(page.getByRole("tab", { name: "Bạn cùng lớp" })).toHaveCount(
			0,
		);
		await expect(page.getByTestId("class-tab-classmates")).toHaveCount(0);
		await expect(page.getByTestId("classmates-grid")).toHaveCount(0);
		await expect(page.getByTestId("classmate-card")).toHaveCount(0);

		const body = page.locator("body");
		await expect(body).not.toContainText(mateName);
		await expect(body).not.toContainText(invitedOnlyName);

		// Chuyển qua lại 3 tab còn lại (gồm cả Tab + Enter bằng bàn phím).
		const assignmentsTab = page.getByRole("tab", { name: "Bài tập" });
		await assignmentsTab.click();
		await expect(assignmentsTab).toHaveAttribute("aria-selected", "true");
		await expect(page.getByText("Chưa có bài tập nào")).toBeVisible();

		const syllabusTab = page.getByRole("tab", { name: "Giáo trình" });
		await page.keyboard.press("Tab");
		await expect(syllabusTab).toBeFocused();
		await page.keyboard.press("Enter");
		await expect(syllabusTab).toHaveAttribute("aria-selected", "true");
		const syllabusItem = page
			.getByRole("listitem")
			.filter({ hasText: "Buổi hôm qua" });
		await expect(syllabusItem).toBeVisible();
		await expect(syllabusItem).toContainText("1/1 buổi");

		const journeyTab = page.getByRole("tab", { name: "Hành trình học" });
		await journeyTab.click();
		await expect(journeyTab).toHaveAttribute("aria-selected", "true");
		await expect(page.getByText("Đã học", { exact: true })).toBeVisible();

		expect(classmatesRequests).toEqual([]);
	});
});
