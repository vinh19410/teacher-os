import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Issue #269 — the new reading question types compose end to end: summary
 * (text answers) and diagram (https image URL) save to the bank, and the
 * student preview shows the intro option bank + diagram image without ever
 * leaking the answer key.
 */

const DIAGRAM_IMG_ALT = "Ảnh biểu đồ đề Reading";

test("create a ready summary prompt and leak-check the preview", async ({
	page,
}) => {
	const TITLE = "QC-269 Summary";
	const ANSWER_ONE = "zephyr-9";
	const ANSWER_TWO = "quartz-7";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	// Passage 2 → Summary completion (one of the 8 new types)
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page
		.getByRole("button", { name: "Summary completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill(
			"Monsoon rains refill the stepwells each year. Engineers cut tunnels into the rock to channel the flow.",
		);
	await page
		.getByLabel("Hướng dẫn đề")
		.fill("Complete the summary. NO MORE THAN THREE WORDS from the passage.");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Rains refill the ……… each year.");
	await page.getByLabel("Đáp án chấm tự động").first().fill(ANSWER_ONE);
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("Tunnels ……… the water through the rock.");
	await page.getByLabel("Đáp án chấm tự động").nth(1).fill(ANSWER_TWO);

	// Student preview: intro + stems visible, answer key never.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(
		page.getByText("NO MORE THAN THREE WORDS").first(),
	).toBeVisible();
	await expect(page.getByText("Rains refill the").first()).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	expect(previewBody).not.toContain(ANSWER_ONE);
	expect(previewBody).not.toContain(ANSWER_TWO);

	// Back to composing: the draft survives the round trip, then saves ready.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 2/2 đáp án đã khóa")).toBeVisible();

	// Bank lists it; the detail aside shows the intro option bank.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-269 Summary/ }).click();
	await expect(
		page.getByText("NO MORE THAN THREE WORDS").first(),
	).toBeVisible();
});

test("create a ready diagram prompt with an https image URL", async ({
	page,
}) => {
	const TITLE = "QC-269 Diagram";
	const IMAGE_URL = "https://example.com/qc-269-diagram.png";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page
		.getByRole("button", { name: "Diagram label completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill("The boiler heated the water until it drove the crankshaft below.");
	await page
		.getByLabel("Hướng dẫn đề")
		.fill("Label the diagram. ONE WORD ONLY from the passage.");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Part 4 of the machine.");
	// "piston" is the key but never appears in the passage → leak-check-able.
	await page.getByLabel("Đáp án chấm tự động").first().fill("piston");

	// Ready is blocked until the diagram carries its image URL.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu ảnh biểu đồ")).toBeVisible();

	await page.getByLabel("Ảnh biểu đồ (URL)").fill(IMAGE_URL);
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();

	// Student preview renders the image + intro, never the key.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();
	await expect(page.getByText("ONE WORD ONLY").first()).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	expect(previewBody).not.toContain("piston");

	// Round trip keeps the URL; then the prompt saves ready.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveValue(IMAGE_URL);

	// Switching type away wipes the URL (red-team #5): a diagram URL must
	// never ride along into another type's prompt. Composed content resets
	// with it (long-standing type-change semantics). Phase-01 FR5 adds a
	// confirm for type changes with authored content — the teacher accepts.
	page.on("dialog", (dialog) => void dialog.accept());
	await page.getByRole("button", { name: "Note completion" }).first().click();
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveCount(0);
	await page.getByRole("button", { name: "Diagram label completion" }).click();
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveValue("");

	// Re-compose and save ready.
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Part 4 of the machine.");
	await page.getByLabel("Đáp án chấm tự động").first().fill("piston");
	await page.getByLabel("Ảnh biểu đồ (URL)").fill(IMAGE_URL);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 1/1 đáp án đã khóa")).toBeVisible();

	// Bank detail: the diagram image is visible in the preview aside too.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-269 Diagram/ }).click();
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();
});
