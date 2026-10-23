import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/** Cây điều hướng trái (#424): mọi chọn part đi qua nav "Mục lục đề". */
function outline(page: Page) {
	return page.getByRole("navigation", { name: "Mục lục đề" });
}

async function openEmptySlot(page: Page, slotLabel: string): Promise<void> {
	// Dưới 1024px cây thu gọn mặc định — chỉ mở khi đang aria-expanded="false".
	const expand = outline(page).getByRole("button", { name: "Mở mục lục" });
	if (
		(await expand.count()) > 0 &&
		(await expand.getAttribute("aria-expanded")) === "false"
	) {
		await expand.click();
	}
	await outline(page)
		.getByRole("button", { name: slotLabel, exact: true })
		.click();
	await page.getByRole("button", { name: "Thêm nội dung" }).click();
	await expect(page.getByLabel("Tiêu đề part")).toBeVisible();
}

/**
 * Tab của THẺ PART — bắt buộc scope theo tablist "Các tab {slot}" vì
 * accessible name "Câu hỏi" trùng ở 3 cấp (part / nhóm / panel).
 */
function partTab(page: Page, slotLabel: string, tab: "Nội dung" | "Câu hỏi") {
	return page
		.getByRole("tablist", { name: `Các tab ${slotLabel}` })
		.getByRole("tab", { name: tab, exact: true });
}

/** Tab của thẻ NHÓM — scope trong wrapper id `group-{slot}-{gi}`. */
function groupTab(page: Page, slot: string, gi: number, tab: string) {
	return page
		.locator(`#group-${slot}-${gi}`)
		.getByRole("tab", { name: tab, exact: true });
}

/**
 * Điền 1 hàng trong "Lưới đáp án" (fieldset aria-label "Câu N" — số N là
 * đánh số liên tục theo catalog, không đoán được): nội dung câu hỏi + đáp
 * án — dạng text điền vào ô "Đáp án chấm tự động", dạng 3 trạng thái /
 * bankable khóa đáp án bằng chip nhãn. Part PHẲNG: hàng luôn mở như cũ.
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

/**
 * Điền 1 hàng của THẺ NHÓM (#424): hàng thu gọn mặc định — mở qua nút
 * CardControls "Mở câu {n}" (aria-label) nếu chưa mở, rồi fill như thường.
 */
async function fillGroupRow(
	page: Page,
	slot: string,
	gi: number,
	number: number,
	stem: string,
	answer: string,
	explanation?: string,
): Promise<void> {
	const group = page.locator(`#group-${slot}-${gi}`);
	const openRow = group.getByRole("button", { name: `Mở câu ${number}` });
	if ((await openRow.count()) > 0) await openRow.click();
	const row = group.locator(`fieldset[aria-label="Câu ${number}"]`);
	await row.getByLabel("Nội dung câu hỏi phía học viên").fill(stem);
	const answerInput = row.getByLabel("Đáp án chấm tự động");
	if ((await answerInput.count()) > 0) {
		await answerInput.fill(answer);
	} else {
		await row
			.getByRole("button", { name: `Câu ${number}: ${answer}`, exact: true })
			.click();
	}
	if (explanation !== undefined) {
		const editor = row.getByLabel(`Giải thích câu ${number}`, {
			exact: true,
		});
		await editor.click();
		await editor.fill(explanation);
	}
}

async function savePart(page: Page): Promise<void> {
	// Khóa stale-closure save (red-team F2): PUT phải OK, và nhãn nháp
	// "Có thay đổi chưa lưu" phải biến mất (useBlocker hủy reload khi còn
	// nháp) — chờ điều kiện vốn đã đúng sẵn là chưa đủ.
	const putOk = page.waitForResponse(
		(response) =>
			response.request().method() === "PUT" &&
			/\/parts\/.+/.test(new URL(response.url()).pathname) &&
			response.ok(),
	);
	await page
		.getByRole("toolbar", { name: "Thao tác soạn đề" })
		.getByRole("button", { name: "Lưu part" })
		.click();
	await putOk;
	await expect(page.getByText("Có thay đổi chưa lưu")).toHaveCount(0);
	// Sau save, parent refetch remount form (key đổi) — caller phải lấy lại
	// locator mới; "Xóa part" là dấu vĩnh viễn của part đã lưu.
	await expect(page.getByRole("button", { name: "Xóa part" })).toBeVisible();
}

/** Trước MỌI page.reload() — useBlocker hủy navigation khi còn nháp. */
async function assertNoUnsavedChanges(page: Page): Promise<void> {
	await expect(page.getByText("Có thay đổi chưa lưu")).toHaveCount(0);
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

async function backToListAndDelete(page: Page, title: string) {
	const row = await backToListAndFindRow(page, title);
	await row.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(page.getByText("Xóa bộ đề?")).toBeVisible();
	await page.getByRole("button", { name: "Xóa bộ đề" }).click();
	await expect(page.getByRole("row", { name: title })).toHaveCount(0);
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
	await partTab(page, "Passage 1", "Câu hỏi").click();
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
	await partTab(page, "Passage 2", "Câu hỏi").click();
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
	await partTab(page, "Passage 3", "Câu hỏi").click();
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

const GROUPS_TITLE = `E2E Reading Groups ${Date.now()}`;

/**
 * #420 Task 5.1 + #424 phase 5 Task 5.2 — soạn passage 2 nhóm câu trên
 * layout Quiz Builder: nhóm ngầm tfng 3 câu → chia nhóm → nhóm 2 note
 * completion (answersInline + giải thích) → ClozeEditor apply giữ giải
 * thích → lưu/tải lại → điều hướng cây, giữ nháp khi đổi part, panel
 * "Kiểm tra đáp án", fold "Câu 6" cho p2, verify 3 viewport + bàn phím.
 */
test("soạn passage có 2 nhóm câu, lưu và tải lại", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await adminOpenNewTestPage(page);
	await page.getByLabel("Tiêu đề", { exact: true }).fill(GROUPS_TITLE);
	await page.getByLabel("Kỹ năng").selectOption({ label: "Reading (Đọc)" });
	await page.getByRole("button", { name: "Tạo bộ đề" }).click();
	await expect(page).toHaveURL(/\/library\/tests\/(?!new)[^/]+$/);

	// --- 1. Part 1: tfng phẳng 3 câu, rồi chia thành nhóm ---
	await openEmptySlot(page, "Passage 1");
	await page.getByLabel("Tiêu đề part").fill("Passage 1 — Cranberry Farming");
	await fillRichEditor(
		page,
		"Đoạn văn (Passage)",
		"<p>Cranberry growers flood the bogs each October.</p>",
	);
	await partTab(page, "Passage 1", "Câu hỏi").click();
	await page.getByLabel("Dạng bài", { exact: true }).selectOption("tfng");
	await fillQuestionRow(page, 0, "Growers dry-harvest the bogs.", "TRUE");
	await fillQuestionRow(page, 1, "Cranberries grow underground.", "FALSE");
	await fillQuestionRow(page, 2, "Flooding happens in spring.", "NOT GIVEN");
	await page.getByRole("button", { name: "Chia thành nhiều nhóm câu" }).click();
	await expect(
		outline(page).getByRole("button", { name: "Nhóm câu 1", exact: true }),
	).toBeVisible();

	// --- 2. Nhóm 2: note completion, đáp án inline + giải thích ---
	// Nút "Chia thành nhiều nhóm câu" gọi addGroup: nhóm 1 phủ 3 câu cũ,
	// nhóm 2 (rỗng 1 câu) xuất hiện ngay nhưng ĐÓNG — mở qua cây điều hướng
	// (cũng set tab Câu hỏi của nhóm).
	const g2 = page.locator("#group-p1-1");
	await expect(g2).toBeVisible();
	await outline(page)
		.getByRole("button", { name: "Nhóm câu 2", exact: true })
		.click();
	await expect(groupTab(page, "p1", 1, "Câu hỏi")).toBeVisible();
	await groupTab(page, "p1", 1, "Thiết lập").click();
	await g2.getByLabel("Dạng bài", { exact: true }).selectOption("note");
	await g2.getByLabel("Ô trả lời nằm trong hướng dẫn").check();
	await groupTab(page, "p1", 1, "Hướng dẫn").click();
	const intro = g2.getByLabel("Hướng dẫn đề", { exact: true });
	await intro.click();
	await intro.fill("Complete the notes below.");
	await groupTab(page, "p1", 1, "Câu hỏi").click();
	await fillGroupRow(
		page,
		"p1",
		1,
		4,
		"Growers ____ the bogs.",
		"flood",
		"Câu 4: growers flood the bogs each October.",
	);
	await g2.getByRole("button", { name: "Thêm câu" }).click();
	await fillGroupRow(
		page,
		"p1",
		1,
		5,
		"Farmers ____ the fields.",
		"drain",
		"Câu 5: farmers drain the fields after rain.",
	);
	await groupTab(page, "p1", 1, "Thiết lập").click();
	await expect(g2.getByText("Câu có ô trống: 2/2")).toBeVisible();

	// --- 4b. ClozeEditor: sửa từ giữ 2 marker → giải thích còn nguyên ---
	await groupTab(page, "p1", 1, "Câu hỏi").click();
	await g2.getByRole("button", { name: "Cú pháp thô" }).click();
	await g2
		.getByLabel("Văn bản cú pháp thô")
		.fill("Growers *flood* the bogs and farmers *drain* the fields.");
	page.once("dialog", (dialog) => dialog.accept());
	await g2.getByRole("button", { name: "Áp vào câu hỏi" }).click();
	const row5 = g2.locator('fieldset[aria-label="Câu 5"]');
	await expect(row5.getByLabel("Nội dung câu hỏi phía học viên")).toHaveValue(
		/____/,
	);
	await expect(row5.getByLabel("Giải thích câu 5", { exact: true })).toHaveText(
		"Câu 5: farmers drain the fields after rain.",
	);
	const open4 = g2.getByRole("button", { name: "Mở câu 4" });
	if ((await open4.count()) > 0) await open4.click();
	await expect(
		g2
			.locator('fieldset[aria-label="Câu 4"]')
			.getByLabel("Giải thích câu 4", { exact: true }),
	).toHaveText("Câu 4: growers flood the bogs each October.");

	// --- 3. Lưu, tải lại: cây đủ nhóm + câu, dữ liệu nhóm 2 còn nguyên ---
	await savePart(page);
	await assertNoUnsavedChanges(page);
	await page.reload();
	await expect(page.getByRole("heading", { name: GROUPS_TITLE })).toBeVisible();
	await outline(page)
		.getByRole("button", { name: "Passage 1", exact: true })
		.click();
	const nav = outline(page);
	for (const label of ["Nhóm câu 1", "Nhóm câu 2"]) {
		await expect(
			nav.getByRole("button", { name: label, exact: true }),
		).toBeVisible();
	}
	for (let n = 1; n <= 5; n++) {
		await expect(
			nav.getByRole("button", { name: `Câu ${n}`, exact: true }),
		).toBeVisible();
	}
	// Bấm "Câu 4" trên cây → hàng câu 4 mở + ô giải thích có giá trị, trong viewport.
	await nav.getByRole("button", { name: "Câu 4", exact: true }).click();
	const row4 = page.locator('fieldset[aria-label="Câu 4"]');
	await expect(row4).toBeInViewport();
	await expect(row4.getByLabel("Nội dung câu hỏi phía học viên")).toHaveValue(
		/____/,
	);
	await expect(
		row4.getByLabel("Giải thích câu 4", { exact: true }),
	).toBeVisible();
	await groupTab(page, "p1", 1, "Thiết lập").click();
	await expect(g2.getByLabel("Ô trả lời nằm trong hướng dẫn")).toBeChecked();

	// --- 4. Giữ nháp khi đổi part + chấm "chưa lưu" trên cây ---
	await partTab(page, "Passage 1", "Nội dung").click();
	await page.getByLabel("Tiêu đề part").fill("Passage 1 — Cranberry (draft)");
	await outline(page)
		.getByRole("button", { name: "Passage 2", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Thêm nội dung" }),
	).toBeVisible();
	await outline(page)
		.getByRole("button", { name: "Passage 1", exact: true })
		.click();
	await expect(page.getByLabel("Tiêu đề part")).toHaveValue(
		"Passage 1 — Cranberry (draft)",
	);
	await expect(nav.getByText("chưa lưu").first()).toBeVisible();

	// --- 5. Stale-closure save: sửa đáp án câu SẴN CÓ, lưu, reload ---
	await nav.getByRole("button", { name: "Câu 2", exact: true }).click();
	await page
		.locator('fieldset[aria-label="Câu 2"]')
		.getByRole("button", { name: "Câu 2: NOT GIVEN", exact: true })
		.click();
	await savePart(page);
	await assertNoUnsavedChanges(page);
	await page.reload();
	await expect(page.getByRole("heading", { name: GROUPS_TITLE })).toBeVisible();
	await outline(page)
		.getByRole("button", { name: "Câu 2", exact: true })
		.click();
	await expect(
		page
			.locator('fieldset[aria-label="Câu 2"]')
			.getByRole("button", { name: "Câu 2: NOT GIVEN", exact: true }),
	).toHaveAttribute("aria-pressed", "true");

	// --- 6. Panel: thiếu đáp án → nhảy đúng hàng → đủ lại ---
	await outline(page)
		.getByRole("button", { name: "Câu 4", exact: true })
		.click();
	await page
		.locator('fieldset[aria-label="Câu 4"]')
		.getByLabel("Đáp án chấm tự động")
		.fill("");
	await page
		.getByRole("toolbar", { name: "Thao tác soạn đề" })
		.getByRole("button", { name: "Kiểm tra đáp án" })
		.click();
	const panel = page.locator('[aria-label="Kiểm tra đáp án"]');
	await expect(panel.getByText("5 câu · 1 câu thiếu đáp án")).toBeVisible();
	await expect(panel.getByText("Thiếu đáp án", { exact: true })).toBeVisible();
	await panel.getByRole("button", { name: "4", exact: true }).click();
	await expect(page.locator('fieldset[aria-label="Câu 4"]')).toBeInViewport();
	await page
		.locator('fieldset[aria-label="Câu 4"]')
		.getByLabel("Đáp án chấm tự động")
		.fill("flood");
	await savePart(page);
	await expect(panel.getByText("5 câu · 0 câu thiếu đáp án")).toBeVisible();

	// --- 7. Fold xuyên suốt: p2 có 1 câu → "Câu 6" ở 3 chỗ khớp nhau ---
	await outline(page)
		.getByRole("button", { name: "Passage 2", exact: true })
		.click();
	await page.getByRole("button", { name: "Thêm nội dung" }).click();
	await page.getByLabel("Tiêu đề part").fill("Passage 2 — Seed");
	await partTab(page, "Passage 2", "Câu hỏi").click();
	await page.getByLabel("Dạng bài", { exact: true }).selectOption("info");
	await fillQuestionRow(page, 0, "Paragraph A mentions the flooding.", "B");
	await savePart(page);
	await expect(
		outline(page).getByRole("button", { name: "Câu 6", exact: true }),
	).toBeVisible();
	await expect(page.locator('fieldset[aria-label="Câu 6"]')).toBeVisible();
	await expect(
		panel.getByRole("button", { name: "6", exact: true }),
	).toBeVisible();

	// --- 8. Lưu tại nhóm/câu đang mở không làm nhảy vị trí soạn ---
	await outline(page)
		.getByRole("button", { name: "Passage 1", exact: true })
		.click();
	await outline(page)
		.getByRole("button", { name: "Câu 4", exact: true })
		.click();
	await expect(page.locator('fieldset[aria-label="Câu 4"]')).toBeVisible();
	await savePart(page);
	await expect(page.locator("#group-p1-1")).toBeVisible();
	await expect(groupTab(page, "p1", 1, "Câu hỏi")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	await expect(page.locator('fieldset[aria-label="Câu 4"]')).toBeVisible();

	// --- 9. Lưu bị chặn → tự chuyển tab tới field lỗi ở tab Nội dung ---
	await partTab(page, "Passage 1", "Nội dung").click();
	await page.getByLabel("Tiêu đề part").fill("");
	await partTab(page, "Passage 1", "Câu hỏi").click();
	await page
		.getByRole("toolbar", { name: "Thao tác soạn đề" })
		.getByRole("button", { name: "Lưu part" })
		.click();
	await expect(partTab(page, "Passage 1", "Nội dung")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	// Khôi phục tiêu đề và lưu sạch trước khi rời trang.
	await page.getByLabel("Tiêu đề part").fill("Passage 1 — Cranberry Farming");
	await savePart(page);

	// --- 10. 3 viewport: không tràn ngang (đo SAU KHI mở panel) + ảnh ---
	const screensDir = resolve(
		fileURLToPath(new URL(".", import.meta.url)),
		"../../../plans/261023-0713-quiz-builder-page-refactor/screens",
	);
	mkdirSync(screensDir, { recursive: true });
	for (const [width, height] of [
		[1440, 900],
		[768, 1024],
		[375, 812],
	] as const) {
		// 375/768: thật tế cây thu gọn theo matchMedia lúc mount — thu gọn
		// thủ công trước khi đo (đổi viewport giữa phiên không chạy lại init).
		const collapse = outline(page).getByRole("button", {
			name: "Thu gọn mục lục",
		});
		if (
			width < 1024 &&
			(await collapse.count()) > 0 &&
			(await collapse.getAttribute("aria-expanded")) === "true"
		) {
			await collapse.click();
		}
		await page.setViewportSize({ width, height });
		// Panel có thể đã mở từ bước 6 — chỉ bấm khi đang đóng (toggle).
		const answersButton = page
			.getByRole("toolbar", { name: "Thao tác soạn đề" })
			.getByRole("button", { name: "Kiểm tra đáp án" });
		if ((await answersButton.getAttribute("aria-expanded")) !== "true") {
			await answersButton.click();
		}
		await expect(page.locator('[aria-label="Kiểm tra đáp án"]')).toBeVisible();
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		await page.screenshot({
			path: resolve(screensDir, `${width}.png`),
			fullPage: true,
		});
		await answersButton.click(); // đóng lại cho viewport kế tiếp
	}

	// --- 11. Bàn phím: Tab qua cây, Enter mở đúng hàng, mũi tên đổi tab ---
	await page.setViewportSize({ width: 1440, height: 900 });
	const collapseToggle = outline(page).getByRole("button", {
		name: "Mở mục lục",
	});
	if ((await collapseToggle.count()) > 0) await collapseToggle.click();
	await outline(page).getByRole("button", { name: "Thu gọn mục lục" }).focus();
	await page.keyboard.press("Tab");
	// Tab từ nút thu gọn → nút part "Passage 1": focus ring thấy được
	// (global :focus-visible → box-shadow khác none).
	expect(
		await page.evaluate(() => {
			const el = document.activeElement;
			return (
				el !== null &&
				el.textContent === "Passage 1" &&
				getComputedStyle(el).boxShadow !== "none"
			);
		}),
	).toBe(true);
	// Tab tiếp tới "Câu 5" (p1 đang mở: Nhóm 1 3 câu → Nhóm 2 2 câu).
	for (let i = 0; i < 7; i++) await page.keyboard.press("Tab");
	expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
		"Câu 5",
	);
	await page.keyboard.press("Enter");
	await expect(page.locator('fieldset[aria-label="Câu 5"]')).toBeInViewport();
	// Mũi tên trong CardTabs của thẻ part: chọn "Nội dung" trước (arrow đi
	// từ tab ĐANG CHỌN, không theo focus) rồi ArrowRight → "Câu hỏi".
	await partTab(page, "Passage 1", "Nội dung").click();
	await page.keyboard.press("ArrowRight");
	await expect(partTab(page, "Passage 1", "Câu hỏi")).toHaveAttribute(
		"aria-selected",
		"true",
	);
	expect(
		await page.evaluate(
			() =>
				document.activeElement !== null &&
				getComputedStyle(document.activeElement).boxShadow !== "none",
		),
	).toBe(true);

	// --- Dọn đề ---
	await backToListAndDelete(page, GROUPS_TITLE);
});
