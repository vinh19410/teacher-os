import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * AC-001 nhập đề bằng AI (TOS-24 #470): teacher mở builder → CTA "Nhập đề
 * bằng AI (5 Credit)" → trang import hiện ví 30 Credit → upload PDF 2 trang
 * (fixture tự sinh) → fake extractor trả đề "Cambridge IELTS Sample" →
 * workspace 2 cột: viewer trái "Trang 1 / 2" + zoom, panel phải đúng 1 câu
 * gắn nhãn cần rà soát. Reload giữ ?job= và ví còn 25 Cr (đã trừ 5 Credit);
 * thu hẹp viewport → workspace chuyển 2 tab "Tài liệu gốc" | "Câu hỏi bóc
 * tách". boot.ts inject fake extractor nên spec không phụ thuộc Workers AI.
 */
test("nhập đề bằng AI: trừ 5 Credit, bóc tách 2 trang, cần rà soát đúng 1 câu", async ({
	page,
}) => {
	await signUpViaApi(page);

	// Vào trang import qua CTA trên builder đề test. PageHead action slot là
	// Link (pattern điều hướng của repo) nên role đúng là `link`, không phải
	// `button` (kongming e2e-consult #470: snapshot chỉ link với
	// buttonVariants).
	await page.goto("/assignments/tests/new");
	await page.getByRole("link", { name: "Nhập đề bằng AI (5 Credit)" }).click();
	await expect(page).toHaveURL(/\/assignments\/tests\/import/);

	// Ví 30 Credit của org mới + đơn giá 5 Credit hiển thị sẵn.
	const badge = page.getByTestId("credit-cost-badge");
	await expect(badge).toContainText("5 Credit");
	await expect(badge).toContainText("Ví: 30 Cr");

	// Upload PDF 2 trang → chờ đề bóc tách hiện ra.
	await page
		.getByTestId("exam-import-file-input")
		.setInputFiles("fixtures/exam-import/cambridge-sample.pdf");
	await expect(page.getByText("Cambridge IELTS Sample").first()).toBeVisible();

	// Cột trái: indicator 2 trang + zoom-out/in đổi zoom-level quanh 100%.
	await expect(page.getByTestId("pdf-page-indicator")).toHaveText(
		"Trang 1 / 2",
	);
	await expect(page.getByTestId("zoom-level")).toHaveText("100%");
	await page.getByTestId("zoom-out").click();
	await expect(page.getByTestId("zoom-level")).not.toHaveText("100%");
	await page.getByTestId("zoom-in").click();
	await expect(page.getByTestId("zoom-level")).toHaveText("100%");

	// Cột phải: đúng 1 câu (tin cậy 0.6 của fake extractor) bị gắn nhãn.
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await expect(page.getByTestId("question-needs-review")).toHaveCount(1);

	// Reload giữ ?job= — ví đã trừ 5 Credit (30 → 25).
	await page.reload();
	await expect(page).toHaveURL(/\/assignments\/tests\/import\?job=/);
	await expect(page.getByTestId("credit-cost-badge")).toContainText(
		"Ví: 25 Cr",
	);

	// Mobile (<lg): workspace 2 cột thu thành 2 tab.
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(page.getByRole("tab", { name: "Tài liệu gốc" })).toBeVisible();
	await expect(
		page.getByRole("tab", { name: "Câu hỏi bóc tách" }),
	).toBeVisible();
});
