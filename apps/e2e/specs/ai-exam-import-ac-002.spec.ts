import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * AC-002 nhập đề bằng AI (TOS-25 #471): tải lại cùng tệp đã bóc tách thành
 * công trong cùng tổ chức (cùng `content_fingerprint` SHA-256) → không gọi
 * lại AI, không giữ/trừ 5 Credit (0 Credit, ví giữ nguyên 25 Cr), hiện thanh
 * thông báo phát hiện đề trùng (`role="status"`) kèm nút "Mở lại bản nháp cũ
 * (0 Cr)". Bấm nút (chuột hoặc bàn phím Tab → Enter) mở đúng `?job=<id cũ>`
 * và hiển thị bản nháp cũ. Kiểm luôn lớp bảo vệ thứ 2 (D3): chặn `/lookup`
 * để ép đi qua `POST /api/exam-imports` → server trả `200 { duplicateOf }`,
 * hiện cùng banner, ví vẫn 25 Cr và mở lại đúng `jobId` cũ.
 */
test("AC-002: tải lại cùng tệp → banner trùng (0 Credit), mở lại bản nháp cũ qua lookup lẫn nhánh POST", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signUpViaApi(page);

	// Lần 1: vào màn Nhập đề AI và bóc tách tệp mẫu (30 Cr → 25 Cr).
	await page.goto("/assignments/tests/new");
	await page.getByRole("link", { name: "Nhập đề bằng AI (5 Credit)" }).click();
	await expect(page).toHaveURL(/\/assignments\/tests\/import/);

	const badge = page.getByTestId("credit-cost-badge");
	await expect(badge).toContainText("Ví: 30 Cr");

	await page
		.getByTestId("exam-import-file-input")
		.setInputFiles("fixtures/exam-import/cambridge-sample.pdf");
	await expect(page.getByText("Cambridge IELTS Sample").first()).toBeVisible();
	await expect(page).toHaveURL(/\/assignments\/tests\/import\?job=/);
	await expect(badge).toContainText("Ví: 25 Cr");

	const firstJobId = new URL(page.url()).searchParams.get("job");
	expect(firstJobId).toBeTruthy();

	// Lần 2 (qua GET /lookup): quay lại màn [6] trống, chọn lại cùng tệp.
	await page.goto("/assignments/tests/import");
	await page
		.getByTestId("exam-import-file-input")
		.setInputFiles("fixtures/exam-import/cambridge-sample.pdf");

	const banner = page.getByTestId("duplicate-exam-banner");
	const reopenButton = page.getByTestId("duplicate-reopen-button");
	await expect(banner).toBeVisible();
	await expect(page.getByRole("status")).toContainText(
		"Phát hiện tệp trùng mã băm",
	);
	await expect(banner).toContainText('với đề "Cambridge IELTS Sample"');
	await expect(reopenButton).toHaveText("Mở lại bản nháp cũ (0 Cr)");
	// 0 Credit: ví giữ nguyên 25 Cr.
	await expect(badge).toContainText("Ví: 25 Cr");

	// Verify banner hiển thị đúng trên 3 viewport (1440×900, 768×1024, 375×812).
	for (const size of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await page.setViewportSize(size);
		await expect(banner).toBeVisible();
		await expect(reopenButton).toBeVisible();
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	// Bấm nút "Mở lại bản nháp cũ (0 Cr)" → mở đúng job cũ, banner biến mất.
	await reopenButton.click();
	await expect(page).toHaveURL(
		new RegExp(`/assignments/tests/import\\?job=${firstJobId}$`),
	);
	await expect(banner).toBeHidden();
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await expect(page.getByText("Cambridge IELTS Sample").first()).toBeVisible();
	await expect(badge).toContainText("Ví: 25 Cr");

	// Lần 3 (chứng minh lớp 2 D3 + keyboard focus): chặn GET /lookup để client
	// fail-open gửi POST → server chặn trước reserveCredits, trả { duplicateOf }.
	await page.route("**/api/exam-imports/lookup*", (route) => route.abort());
	await page.goto("/assignments/tests/import");
	await page
		.getByTestId("exam-import-file-input")
		.setInputFiles("fixtures/exam-import/cambridge-sample.pdf");

	await expect(banner).toBeVisible();
	await expect(banner).toContainText('với đề "Cambridge IELTS Sample"');
	await expect(badge).toContainText("Ví: 25 Cr");

	// Điều hướng bàn phím: Tab từ breadcrumb "Bài tập" sang nút mở lại rồi Enter.
	await page
		.getByLabel("Breadcrumb")
		.getByRole("link", { name: "Bài tập" })
		.focus();
	await page.keyboard.press("Tab");
	await expect(reopenButton).toBeFocused();
	await page.keyboard.press("Enter");

	await expect(page).toHaveURL(
		new RegExp(`/assignments/tests/import\\?job=${firstJobId}$`),
	);
	await expect(banner).toBeHidden();
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await expect(badge).toContainText("Ví: 25 Cr");
});
