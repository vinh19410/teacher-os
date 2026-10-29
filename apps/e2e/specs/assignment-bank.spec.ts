import { expect, test } from "@playwright/test";
import { fillRichEditor, signUpViaUi } from "./helpers";

/**
 * Issue #208 / #267 — Trang Bài tập (gộp bank): filters (skill + part),
 * in-page search, count line, status tags (draft / used / ready), preview,
 * empty state.
 */
test("bank lists prompts with filters, search, and preview", async ({
	page,
}) => {
	await signUpViaUi(page);

	// Seed: 1 ready Task 2 prompt + 1 draft Task 1 prompt via /assignments/new.
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Discuss");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people think QC-208 bank discuss prompt body.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByRole("button", { name: "Task 1 · 150 từ" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Chart Draft");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"The chart below shows QC-208 draft chart body.",
	);
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();

	// /assignments hiển thị trực tiếp danh sách bài tập đã tạo (#267).
	await page.goto("/assignments");
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();

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
	// exact:true — card meta chứa cùng nhãn "Task 1 · 150 từ" nên substring
	// match trúng cả row button (strict violation trên CI promote 0.0.5).
	await page
		.getByRole("button", { name: "Task 1 · 150 từ", exact: true })
		.click();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toHaveCount(0);
	// #218 v5: hàng "Phần thi" là danh sách chip tĩnh (không còn genre chips
	// phụ thuộc task) — vẫn render đầy đủ khi đang lọc Task 1.
	await expect(
		page.getByRole("button", { name: "Task 2 · 250 từ", exact: true }),
	).toBeVisible();

	// Search with no match → filter-empty card.
	await page.getByLabel("Tìm đề theo tiêu đề hoặc nguồn").fill("zzz-no-match");
	await expect(
		page.getByRole("heading", { name: "Không có đề khớp bộ lọc" }),
	).toBeVisible();
	await expect(
		page.getByText(
			"Thử kỹ năng hoặc phần thi khác, hoặc xóa bộ lọc để xem toàn bộ danh sách.",
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

	// Xem trước (#282) → trang riêng góc nhìn học viên (?id=).
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview\?id=/);
	// Title trong StudentPreviewPaper là <p>, không phải heading.
	await expect(page.getByText("QC-208 Bank Chart Draft").first()).toBeVisible();
	await expect(page.getByText("Xem trước phía học viên").first()).toBeVisible();
	await page.getByRole("button", { name: "Quay lại danh sách" }).click();
	await expect(page).toHaveURL(/\/assignments$/);
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();

	// Persistence: reload keeps the list.
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
});
