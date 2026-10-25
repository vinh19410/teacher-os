import { expect, type Page, test } from "@playwright/test";
import {
	adminOpenNewTestPage,
	ensureAdminAccount,
	mp3FixtureBytes,
} from "./helpers";

/**
 * Admin library — Listening (plan #413 phase 7): tạo đề Listening 4 section,
 * upload audio fixture (buffer mp3 sinh trong test, không commit binary),
 * xác nhận <audio> có src hợp lệ GET 200 đúng Content-Type, xuất bản bị
 * chặn khi thiếu audio kèm lý do, xóa test và API audio trả 404.
 */

const TITLE = `E2E Listening ${Date.now()}`;

async function createListeningTest(page: Page): Promise<void> {
	await adminOpenNewTestPage(page);
	await page.getByLabel("Tiêu đề", { exact: true }).fill(TITLE);
	await page.getByLabel("Kỹ năng").selectOption({ label: "Listening (Nghe)" });
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

/** Tab của THẺ PART — scope tablist "Các tab {slot}" (name "Câu hỏi" trùng
 * cấp part/nhóm nên bắt buộc scope theo #424 phase 5 Task 5.1). */
function partTab(page: Page, slotLabel: string, tab: "Nội dung" | "Câu hỏi") {
	return page
		.getByRole("tablist", { name: `Các tab ${slotLabel}` })
		.getByRole("tab", { name: tab, exact: true });
}

/** Điền 1 hàng lưới đáp án (part PHẲNG) — text hoặc chip nhãn. Row id ổn
 * định `${slot}-q${index}` (AnswerKeyGrid `partId=slot`, index 0-based) —
 * scope theo section thay vì `.nth()` toàn trang (#426 F4). */
async function fillQuestionRow(
	page: Page,
	slot: string,
	index: number,
	stem: string,
	answer: string,
): Promise<void> {
	if (index > 0) await page.getByRole("button", { name: "Thêm câu" }).click();
	const row = page.locator(`#${slot}-q${index}`);
	await row.getByLabel("Nội dung câu hỏi phía học viên").fill(stem);
	const answerInput = row.getByLabel("Đáp án chấm tự động");
	if ((await answerInput.count()) > 0) {
		await answerInput.fill(answer);
	} else {
		await row.getByRole("button", { name: new RegExp(`: ${answer}$`) }).click();
	}
}

async function savePart(page: Page): Promise<void> {
	// Đồng bộ bản reading (review RF-F7): PUT phải OK và nhãn nháp phải
	// biến mất — chờ "Xóa part" vốn đã đúng sẵn là chưa đủ.
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
	await expect(page.getByRole("button", { name: "Xóa part" })).toBeVisible();
}

/**
 * Về trang danh sách và chờ row của đề: invalidate-query khi đang điều hướng
 * có thể để query rơi vào error state — bấm nút "Thử lại" của chính trang.
 */
async function backToListAndFindRow(page: Page, title: string) {
	await page.getByRole("link", { name: "← Thư viện đề" }).click();
	await expect(page).toHaveURL(/\/library\/tests$/);
	const row = page.getByRole("row", { name: title });
	await expect(row).toBeVisible();
	return row;
}

test("đề Listening 4 section + audio → chặn xuất bản khi thiếu audio → xóa → audio 404", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await createListeningTest(page);

	// 4 section với dạng mặc định đa dạng của từng slot (form/match2/mcq3/…);
	// khóa đáp án text hoặc chip tùy dạng của hàng.
	await openEmptySlot(page, "Section 1");
	await page.getByLabel("Tiêu đề part").fill("Section 1 — Enquiry");
	await partTab(page, "Section 1", "Câu hỏi").click();
	await fillQuestionRow(
		page,
		"s1",
		0,
		"Listening question 1 — booking name",
		"A",
	);
	await fillQuestionRow(
		page,
		"s1",
		1,
		"Listening question 2 — total price",
		"B",
	);
	// Part phẳng: "Câu 2" trên cây điều hướng mở/scroll đúng hàng
	// `s1-q1` (kongming F2 — id hàng flat không có prefix group-).
	await outline(page)
		.getByRole("button", { name: "Câu 2", exact: true })
		.click();
	await expect(page.locator('fieldset[aria-label="Câu 2"]')).toBeInViewport();
	await savePart(page);

	await openEmptySlot(page, "Section 2");
	await page.getByLabel("Tiêu đề part").fill("Section 2 — Talk");
	await partTab(page, "Section 2", "Câu hỏi").click();
	await fillQuestionRow(
		page,
		"s2",
		0,
		"Listening question 3 — speaker place",
		"A",
	);
	await savePart(page);

	await openEmptySlot(page, "Section 3");
	await page.getByLabel("Tiêu đề part").fill("Section 3 — Discussion");
	await partTab(page, "Section 3", "Câu hỏi").click();
	await fillQuestionRow(
		page,
		"s3",
		0,
		"Listening question 5 — topic chosen",
		"A",
	);
	await savePart(page);

	await openEmptySlot(page, "Section 4");
	await page.getByLabel("Tiêu đề part").fill("Section 4 — Lecture");
	await partTab(page, "Section 4", "Câu hỏi").click();
	await fillQuestionRow(page, "s4", 0, "The lecture is about ____", "fossil");
	await savePart(page);

	// Chưa upload audio → chặn xuất bản kèm lý do từng section.
	await page.getByRole("button", { name: "Xuất bản" }).click();
	const audioIssue = page.getByText("Chưa có file audio cho part này.");
	expect(await audioIssue.count()).toBeGreaterThanOrEqual(1);
	await expect(audioIssue.first()).toBeVisible();
	await expect(page.getByText("Nháp", { exact: true })).toBeVisible();

	// Upload audio cho Section 1 → <audio> src hợp lệ, GET 200 đúng MIME.
	await outline(page)
		.getByRole("button", { name: "Section 1", exact: true })
		.click();
	// Khối audio nằm ở tab "Nội dung"; view-state khôi phục tab Câu hỏi
	// từ lần soạn trước nên phải chủ động đổi tab trước & sau upload
	// (upload → refetch → form remount theo initialView).
	await partTab(page, "Section 1", "Nội dung").click();
	await expect(page.getByLabel("Tiêu đề part")).toBeVisible();
	await page
		.locator('input[type="file"][data-testid$="-audio-input"]')
		.setInputFiles({
			name: "section-1.mp3",
			mimeType: "audio/mpeg",
			buffer: mp3FixtureBytes(),
		});
	await partTab(page, "Section 1", "Nội dung").click();
	// Upload xong → parent refetch → khối audio hiển thị tên file.
	await expect(page.getByText("section-1.mp3")).toBeVisible();
	const audio = page.locator("audio");
	await expect(audio).toBeVisible();
	const src = await audio.getAttribute("src");
	expect(src).toContain("/api/admin/library/tests/");
	expect(src).toContain("/parts/s1/audio");
	const audioRes = await page.request.get(src as string);
	expect(audioRes.status()).toBe(200);
	expect(audioRes.headers()["content-type"]).toContain("audio/mpeg");

	// Xóa test → audio trên store bị dọn theo → GET trả 404.
	const row = await backToListAndFindRow(page, TITLE);
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(page.getByText("Xóa bộ đề?")).toBeVisible();
	await page.getByRole("button", { name: "Xóa bộ đề" }).click();
	await expect(page.getByRole("row", { name: TITLE })).toHaveCount(0);
	const afterDelete = await page.request.get(src as string);
	expect(afterDelete.status()).toBe(404);
});

test("Xem trước Listening — số câu Section 2 kế tiếp Section 1, nhãn audio, 0 request ghi", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await createListeningTest(page);

	// Section 1: 2 câu + audio (đã lưu).
	await openEmptySlot(page, "Section 1");
	await page.getByLabel("Tiêu đề part").fill("Section 1 — Enquiry");
	await partTab(page, "Section 1", "Câu hỏi").click();
	await fillQuestionRow(
		page,
		"s1",
		0,
		"Listening question 1 — booking name",
		"A",
	);
	await fillQuestionRow(
		page,
		"s1",
		1,
		"Listening question 2 — total price",
		"B",
	);
	await savePart(page);
	await partTab(page, "Section 1", "Nội dung").click();
	await page
		.locator('input[type="file"][data-testid$="-audio-input"]')
		.setInputFiles({
			name: "section-1.mp3",
			mimeType: "audio/mpeg",
			buffer: mp3FixtureBytes(),
		});
	await partTab(page, "Section 1", "Nội dung").click();
	await expect(page.getByText("section-1.mp3")).toBeVisible();

	// Section 2: 2 câu NHÁP chưa lưu — số câu phải bắt đầu sau Section 1.
	await openEmptySlot(page, "Section 2");
	await page.getByLabel("Tiêu đề part").fill("Section 2 — Talk");
	await partTab(page, "Section 2", "Câu hỏi").click();
	await fillQuestionRow(
		page,
		"s2",
		0,
		"Listening question 3 — speaker place",
		"A",
	);
	await fillQuestionRow(page, "s2", 1, "Listening question 4 — next tour", "B");

	const writeRequests: string[] = [];
	page.on("request", (req) => {
		const method = req.method();
		if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
			writeRequests.push(`${method} ${req.url()}`);
		}
	});

	await page
		.getByRole("toolbar", { name: "Thao tác soạn đề" })
		.getByRole("button", { name: "Xem trước" })
		.click();
	const dialog = page.getByRole("dialog", { name: /Xem trước bộ đề/ });
	await expect(dialog).toBeVisible();
	// Tab Section 2 (đang soạn) mở mặc định với số câu toàn đề 3–4.
	await expect(
		dialog.getByRole("heading", { name: "Questions 3–4" }),
	).toBeVisible();
	await expect(dialog.getByText("Listening question 3")).toBeVisible();
	// 1 cột (không split-pane listening) — không có pane bài đọc.
	await expect(
		dialog.locator('[data-testid="reading-passage-pane"]'),
	).toHaveCount(0);
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	expect(writeRequests).toEqual([]);

	// Tab Section 1 đã lưu: nhãn 🔊 tên file như học viên.
	await page
		.getByRole("toolbar", { name: "Thao tác soạn đề" })
		.getByRole("button", { name: "Xem trước" })
		.click();
	await expect(dialog).toBeVisible();
	const section1Tab = dialog.getByRole("tab", { name: /Section 1/ });
	await section1Tab.click();
	await expect(dialog.getByText("🔊 section-1.mp3")).toBeVisible();
	await expect(
		dialog.getByRole("heading", { name: "Questions 1–2" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	expect(writeRequests).toEqual([]);

	// Dọn đề.
	await savePart(page);
	await assertNoUnsavedChanges(page);
	await backToListAndDelete(page, TITLE);
});

/** Mirror reading spec: trước reload/điều hướng khi còn nháp (useBlocker). */
async function assertNoUnsavedChanges(page: Page): Promise<void> {
	await expect(page.getByText("Có thay đổi chưa lưu")).toHaveCount(0);
}

async function backToListAndDelete(page: Page, title: string) {
	const row = await backToListAndFindRow(page, title);
	await row.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(page.getByText("Xóa bộ đề?")).toBeVisible();
	await page.getByRole("button", { name: "Xóa bộ đề" }).click();
	await expect(page.getByRole("row", { name: title })).toHaveCount(0);
}
