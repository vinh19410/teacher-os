import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Regression guard for issue #111 (QC P1): a student row on /students must
 * open the detail page /students/:id, and an unknown id must render the
 * friendly not-found card instead of a raw 404. On production the row click
 * silently did nothing — the broken vite-plugin-pwa service worker (issue
 * #125) failed the lazy $studentId route-chunk fetch, aborting navigation.
 * These tests pin the navigation + 404 behavior so the row→detail contract
 * cannot regress unnoticed again.
 */
test("student row click opens the detail page", async ({ page }) => {
	const STUDENT_NAME = "QC-111 Học viên hồi quy";
	await signUpViaUi(page);

	await page.goto("/students");
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	// The modal only closes after the kernel refresh applies.
	await expect(dialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// Click the row → SPA navigation to /students/:id. The detail route is
	// lazy-loaded, so this also proves the route chunk resolves.
	await page.getByText(STUDENT_NAME).first().click();
	await expect(page).toHaveURL(/\/students\/[^/]+$/);
	await expect(page.getByRole("heading", { name: STUDENT_NAME })).toBeVisible();
	for (const tab of ["Hồ sơ", "Lịch sử buổi", "Học phí", "Bài tập"]) {
		await expect(
			page.getByRole("button", { name: tab, exact: true }),
		).toBeVisible();
	}
});

test("unknown student id renders the friendly not-found card", async ({
	page,
}) => {
	await signUpViaUi(page);

	await page.goto("/students/e2e-fake-id");
	await expect(page.getByText("Không tìm thấy học viên")).toBeVisible();
	const back = page.getByRole("link", {
		name: "← Về danh sách học viên",
	});
	await expect(back).toBeVisible();
	await back.click();
	await expect(page).toHaveURL(/\/students$/);
});
