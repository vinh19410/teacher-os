/**
 * Issue #162: /schedule groups a physical class session into one block.
 * ClassSessionModal lists each student; dated edits are whole-session;
 * attendance/cancel stay per-row; a blocked refresh cannot leak onto
 * the next student target.
 */
import { expect, type Page, test } from "@playwright/test";
import {
	createStudentViaUi,
	gotoWeek,
	mondayWeekStartISO,
	signUpViaUi,
	vietnamTodayISO,
	vnWeekdayMon0,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

const TOPIC = "Writing Task 2 — class session";

async function addStudent(page: Page, name: string) {
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await createStudentViaUi(page, name);
	await expect(page.getByText(name)).toBeVisible();
}

async function seedTwoStudentClass(page: Page, className: string) {
	const startDate = vietnamTodayISO();
	await signUpViaUi(page);
	await seedDatedClass(page, {
		name: className,
		schedule: {
			days: [vnWeekdayMon0(startDate)],
			start: "19:00",
			end: "20:30",
		},
		startDate,
		sessionsTotal: 2,
	});
	await page.reload();
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className).click();
	await addStudent(page, "An Session E2E");
	await addStudent(page, "Bình Session E2E");
	await gotoWeek(page, mondayWeekStartISO(startDate));
}

test("1:2 session is one class block; dated edit applies to both students", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Session Group ${Date.now()}`;
	await seedTwoStudentClass(page, CLASS_NAME);

	const block = page.locator("button.lesson-block", { hasText: CLASS_NAME });
	await expect(block).toHaveCount(1);
	await expect(block).toContainText("19:00");
	await expect(block).not.toContainText("An Session E2E");
	await block.click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("group", { name: "An Session E2E" }),
	).toBeVisible();
	await expect(
		dialog.getByRole("group", { name: "Bình Session E2E" }),
	).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: "Sửa buổi học" }),
	).toHaveCount(2);

	await dialog
		.getByRole("group", { name: "An Session E2E" })
		.getByRole("button", { name: "Sửa buổi học" })
		.click();
	await expect(dialog.getByText(/cả lớp/)).toBeVisible();
	await dialog.getByLabel("Chủ đề").fill(TOPIC);
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(page.getByText("Đã sửa buổi học.")).toBeVisible();
	await expect(dialog.getByText(TOPIC)).toBeVisible();

	await dialog.getByLabel("Đóng").click();
	await page.reload();
	await gotoWeek(page, mondayWeekStartISO(vietnamTodayISO()));
	await page.locator("button.lesson-block", { hasText: CLASS_NAME }).click();
	await expect(page.getByRole("dialog").getByText(TOPIC)).toBeVisible();
});

test("blocked refresh stays on the editor; check-in focus stays in the dialog", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Session Focus ${Date.now()}`;
	await seedTwoStudentClass(page, CLASS_NAME);
	await page.locator("button.lesson-block", { hasText: CLASS_NAME }).click();

	const dialog = page.getByRole("dialog");
	let blockKernelGet = false;
	await page.route("**/api/kernel", async (route) => {
		if (blockKernelGet && route.request().method() === "GET") {
			await route.abort("failed");
			return;
		}
		await route.continue();
	});

	await dialog
		.getByRole("group", { name: "An Session E2E" })
		.getByRole("button", { name: "Sửa buổi học" })
		.click();
	await dialog.getByLabel("Chủ đề").fill("Topic A — pending refresh");
	blockKernelGet = true;
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(
		dialog.getByText("Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu."),
	).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: "Lưu", exact: true }),
	).toBeDisabled();
	await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
	await expect(dialog.getByText(/cả lớp/)).toBeVisible();

	blockKernelGet = false;
	await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
	await expect(
		dialog.getByRole("group", { name: "Bình Session E2E" }),
	).toBeVisible();
	await dialog
		.getByRole("group", { name: "Bình Session E2E" })
		.getByRole("button", { name: "Sửa buổi học" })
		.click();
	await expect(
		dialog.getByText("Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu."),
	).toHaveCount(0);
	await expect(
		dialog.getByRole("button", { name: "Lưu", exact: true }),
	).toBeEnabled();
	await dialog.getByRole("button", { name: "Hủy", exact: true }).click();

	const anRow = dialog.getByRole("group", { name: "An Session E2E" });
	await anRow.getByRole("button", { name: "Điểm danh" }).focus();
	await page.keyboard.press("Enter");
	await expect(anRow.getByText("Hoàn thành")).toBeVisible();
	await page.keyboard.press("Tab");
	const focusInsideDialog = await page.evaluate(
		() => document.activeElement?.closest('[role="dialog"]') != null,
	);
	expect(focusInsideDialog).toBe(true);

	await dialog
		.getByRole("group", { name: "Bình Session E2E" })
		.getByRole("button", { name: "Hủy" })
		.click();
	await expect(
		dialog.getByRole("group", { name: "Bình Session E2E" }).getByText("Đã hủy"),
	).toBeVisible();
	await expect(anRow.getByText("Hoàn thành")).toBeVisible();
});
