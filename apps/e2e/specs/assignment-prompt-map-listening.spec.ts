import { expect, test } from "@playwright/test";

import { signUpViaUi } from "./helpers";

/**
 * Phase-04 (image pins): the listening `map` pair is image-gated AND
 * bankable — the teacher keys letters from the option bank and labels the
 * campus image with pins. Writing task1 shares the `map` type id but is a
 * prompt-only type: it must never be image/pin-gated (red-team #1).
 */

test("create a ready listening map with bank, pins and audio; round-trip through the bank page", async ({
	page,
}) => {
	const TITLE = "QC-271 Listening Map";

	// Serve a deterministic 200×100 image so pin percent math has a real box.
	await page.route("**/campus-map.png", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#3b82f6"/></svg>',
		}),
	);

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByRole("button", { name: "Section 2" }).click();
	await page.getByRole("button", { name: "Map labelling" }).click();

	await page.getByLabel("Tiêu đề").fill(TITLE);

	// One row exists by default; add the second, then key both from the
	// option-bank letters (A/B — the grid falls back to the full alphabet
	// while the bank is still empty).
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("11 Reception desk");
	await page.getByRole("button", { name: "Câu 11: A" }).click();
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("12 Coffee area");
	await page.getByRole("button", { name: "Câu 12: B" }).click();

	// The bank panel starts with zero rows — add exactly two, both filled
	// (every row must carry content before a ready save, phase-02 FR2).
	await page.getByRole("button", { name: "Thêm mục" }).click();
	await page.getByRole("button", { name: "Thêm mục" }).click();
	await page.getByLabel("Mục A", { exact: true }).fill("Reception");
	await page.getByLabel("Mục B", { exact: true }).fill("Coffee area");

	// Ready is blocked until the audio and the image + pins exist.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu file nghe")).toBeVisible();

	await page
		.getByLabel("Ảnh bản đồ (URL)")
		.fill("https://example.com/campus-map.png");
	const pinSurface = page.getByRole("application", {
		name: "Ảnh đề — bấm để đặt ghim nhãn",
	});
	await expect(pinSurface).toBeVisible();
	// Missing pins keep the gate closed even with image + audio.
	await page.getByLabel("Đính file nghe / MP3 hoặc WAV").setInputFiles({
		name: "section2.mp3",
		mimeType: "audio/mpeg",
		buffer: Buffer.from("fake-audio"),
	});
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();

	// Pin both questions, then the save opens.
	await pinSurface.click({ position: { x: 40, y: 30 } });
	await pinSurface.click({ position: { x: 70, y: 60 } });
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Snapshot round-trip: the bank page aside draws the map pins + bank.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Listening", exact: true }).click();
	await page.getByRole("button", { name: /QC-271 Listening Map/ }).click();
	await expect(page.getByLabel("Điền đáp án câu 11")).toBeVisible();
	await expect(page.getByLabel("Điền đáp án câu 12")).toBeVisible();
	await expect(page.getByText("Reception").first()).toBeVisible();
});

test("writing task1 map is never image/pin-gated (skill-qualified)", async ({
	page,
}) => {
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Writing", exact: true }).click();
	await page.getByRole("button", { name: "Task 1 · 150 từ" }).click();
	await page.getByRole("button", { name: "Bản đồ" }).click();

	await page.getByLabel("Tiêu đề").fill("QC-271 Writing Map");
	await page
		.getByLabel("Nội dung đề")
		.fill("The maps show the town centre in 1990 and today.");
	// No image URL, no questions, no pins — a writing map saves ready.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
});
