import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #208 — Ngân hàng bài tập: filters (task + genre), in-page search,
 * count line, status tags (draft / used / ready), preview, empty state.
 */
test("bank lists prompts with filters, search, and preview", async ({
	page,
}) => {
	await signUpViaUi(page);

	// Seed: 1 ready Task 2 prompt + 1 draft Task 1 prompt via /assignments/new.
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Discuss");
	await page
		.getByLabel("Nội dung đề")
		.fill("Some people think QC-208 bank discuss prompt body.");
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByRole("button", { name: "Task 1 · 150 từ" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Chart Draft");
	await page
		.getByLabel("Nội dung đề")
		.fill("The chart below shows QC-208 draft chart body.");
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();

	// /assignments → "Ngân hàng đề" CTA → /assignments/bank.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Ngân hàng đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/bank$/);
	await expect(
		page.getByRole("heading", { name: "Ngân hàng bài tập" }),
	).toBeVisible();

	// Both rows visible + count 2/2 (drafts count toward M).
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();
	await expect(page.getByText("Đang hiện").first()).toBeVisible();
	await expect(page.getByText("2", { exact: true }).first()).toBeVisible();
	await expect(page.getByText("Sẵn sàng").first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();

	// Filter Task 1 → only the draft row + task1 genre chips.
	await page.getByRole("button", { name: "Task 1 · 150 từ" }).click();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Biểu đồ", exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Discuss both views" }),
	).toHaveCount(0);

	// Search with no match → filter-empty card.
	await page.getByLabel("Tìm đề theo tiêu đề hoặc nguồn").fill("zzz-no-match");
	await expect(
		page.getByRole("heading", { name: "Không có đề khớp bộ lọc" }),
	).toBeVisible();
	await expect(
		page.getByText(
			"Thử dạng bài khác, hoặc xóa bộ lọc để xem toàn bộ ngân hàng.",
		),
	).toBeVisible();

	// "Xóa bộ lọc" resets everything (task, genre, query).
	await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();

	// Click the draft row → preview shows its title + static note.
	await page.getByRole("button", { name: /QC-208 Bank Chart Draft/ }).click();
	await expect(page.getByText("Xem trước phía học viên")).toBeVisible();
	await expect(
		page.getByText("Đề này chưa giao lớp. Giao cho học viên ở trang"),
	).toBeVisible();

	// Persistence: reload keeps the bank.
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
});
