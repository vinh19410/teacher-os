import { expect, type Page, test } from "@playwright/test";
import {
	adminOpenNewTestPage,
	ensureAdminAccount,
	fillRichEditor,
} from "./helpers";

/**
 * Admin library — Reading CRUD (plan #413 phase 7): tạo đề Reading qua UI
 * thật của console, soạn 3 passage với 3 dạng câu khác nhau (tfng chip,
 * headings có option bank, mcq), xuất bản, sửa header, hạ nháp, xóa.
 */

const TITLE = `E2E Reading ${Date.now()}`;

async function createReadingTest(page: Page): Promise<void> {
	await adminOpenNewTestPage(page);
	await page.getByLabel("Tiêu đề", { exact: true }).fill(TITLE);
	await page.getByLabel("Kỹ năng").selectOption({ label: "Reading (Đọc)" });
	await page.getByRole("button", { name: "Tạo bộ đề" }).click();
	await expect(page).toHaveURL(/\/library\/tests\/(?!new)[^/]+$/);
	await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
}

async function openEmptySlot(page: Page, tabName: string): Promise<void> {
	await page.getByRole("tab", { name: tabName }).click();
	await page.getByRole("button", { name: "Thêm nội dung" }).click();
	await expect(page.getByLabel("Tiêu đề part")).toBeVisible();
}

/**
 * Điền 1 hàng trong "Lưới đáp án" (fieldset aria-label "Câu N" — số N là
 * đánh số liên tục theo catalog, không đoán được): nội dung câu hỏi + đáp
 * án — dạng text điền vào ô "Đáp án chấm tự động", dạng 3 trạng thái /
 * bankable khóa đáp án bằng chip nhãn.
 */
async function fillQuestionRow(
	page: Page,
	index: number,
	stem: string,
	answer: string,
): Promise<void> {
	if (index > 0) await page.getByRole("button", { name: "Thêm câu" }).click();
	const row = page.locator('fieldset[aria-label^="Câu"]').nth(index);
	await row.getByLabel("Nội dung câu hỏi phía học viên").fill(stem);
	const answerInput = row.getByLabel("Đáp án chấm tự động");
	if ((await answerInput.count()) > 0) {
		await answerInput.fill(answer);
	} else {
		await row.getByRole("button", { name: new RegExp(`: ${answer}$`) }).click();
	}
}

async function savePart(page: Page): Promise<void> {
	await page.getByRole("button", { name: "Lưu part" }).click();
	// Sau save, parent refetch remount form (key đổi) nên thông báo live
	// "Đã lưu part." sống rất ngắn — nhìn dấu vĩnh viễn của part đã lưu.
	await expect(page.getByRole("button", { name: "Xóa part" })).toBeVisible();
}

/**
 * Về trang danh sách và chờ row của đề: invalidate-query khi đang điều hướng
 * có thể để query rơi vào error state ("Không tải được danh sách bộ đề") —
 * bấm nút "Thử lại" của chính trang thay vì reload cứng.
 */
async function backToListAndFindRow(page: Page, title: string) {
	await page.getByRole("link", { name: "← Thư viện đề" }).click();
	await expect(page).toHaveURL(/\/library\/tests$/);
	const row = page.getByRole("row", { name: title });
	await expect(row).toBeVisible();
	return row;
}

test("tạo đề Reading 3 passage đa dạng → xuất bản → sửa → hạ nháp → xóa", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await createReadingTest(page);

	// --- Passage 1: tfng (đáp án 3 trạng thái qua chip) ---
	await openEmptySlot(page, "Passage 1");
	await page.getByLabel("Tiêu đề part").fill("Passage 1 — The Coral Reef");
	await fillRichEditor(
		page,
		"Đoạn văn (Passage)",
		"<p>Coral reefs host a quarter of marine species.</p>",
	);
	await page.getByLabel("Dạng bài", { exact: true }).selectOption("tfng");
	await fillQuestionRow(
		page,
		0,
		"Coral reefs support many marine species.",
		"TRUE",
	);
	await fillQuestionRow(
		page,
		1,
		"Coral reefs cover most of the ocean floor.",
		"FALSE",
	);
	await savePart(page);

	// --- Passage 2: headings (bankable — điền option bank kiểu roman) ---
	await openEmptySlot(page, "Passage 2");
	await page.getByLabel("Tiêu đề part").fill("Passage 2 — Urban Farming");
	await fillRichEditor(
		page,
		"Đoạn văn (Passage)",
		"<p>City farms reduce food miles and rebuild soil.</p>",
	);
	await page.getByLabel("Dạng bài", { exact: true }).selectOption("headings");
	await fillQuestionRow(page, 0, "Paragraph A: transport of food", "i");
	await fillQuestionRow(page, 1, "Paragraph B: soil restoration", "ii");
	await page.getByRole("button", { name: /Điền đủ \d+ mục/ }).click();
	// Mọi row bank phải non-empty (contract: empty row không parse được).
	await page.getByLabel("Mục i", { exact: true }).fill("Food transport");
	await page.getByLabel("Mục ii", { exact: true }).fill("Soil health");
	await page.getByLabel("Mục iii", { exact: true }).fill("City wildlife");
	await page.getByLabel("Mục iv", { exact: true }).fill("Water use");
	await savePart(page);

	// --- Passage 3: mcq (mcq4) ---
	await openEmptySlot(page, "Passage 3");
	await page.getByLabel("Tiêu đề part").fill("Passage 3 — Sleep Science");
	await fillRichEditor(
		page,
		"Đoạn văn (Passage)",
		"<p>Adults need seven to nine hours of sleep.</p>",
	);
	await page.getByLabel("Dạng bài", { exact: true }).selectOption("mcq");
	await fillQuestionRow(
		page,
		0,
		"How many hours of sleep do adults need?",
		"A",
	);
	await fillQuestionRow(page, 1, "What happens during deep sleep?", "B");
	await savePart(page);

	// --- Xuất bản ---
	await page.getByRole("button", { name: "Xuất bản" }).click();
	await expect(page.getByText("Đã xuất bản", { exact: true })).toBeVisible();

	// --- Sửa header (PATCH + h1 cập nhật) ---
	const newTitle = `${TITLE} (v2)`;
	await page.getByLabel("Tiêu đề", { exact: true }).fill(newTitle);
	await page.getByRole("button", { name: "Lưu thông tin" }).click();
	await expect(page.getByRole("heading", { name: newTitle })).toBeVisible();

	// --- Hạ về nháp ---
	await page.getByRole("button", { name: "Hạ về nháp" }).click();
	await expect(page.getByText("Nháp", { exact: true })).toBeVisible();

	// --- Xóa qua dialog xác nhận trên trang danh sách ---
	const row = await backToListAndFindRow(page, newTitle);
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(page.getByText("Xóa bộ đề?")).toBeVisible();
	await page.getByRole("button", { name: "Xóa bộ đề" }).click();
	await expect(page.getByRole("row", { name: newTitle })).toHaveCount(0);
});
