/**
 * Xem trước tài liệu trong ngân hàng: PDF render qua pdfjs (canvas có nội
 * dung), ảnh hiển thị qua blob URL; file Office (XLSX) không có nút «Xem trước» và vẫn
 * chỉ hiện tên file + «Tải xuống». Server vẫn trả file dạng attachment —
 * xem trước chạy hoàn toàn phía client.
 */
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

const SAMPLE_PDF = readFileSync(
	new URL("../fixtures/exam-import/cambridge-sample.pdf", import.meta.url),
);

/** Office thật (XLSX) — định dạng không xem trước được trong app. */
const SAMPLE_XLSX = readFileSync(
	new URL("../fixtures/syllabus-import.sample.xlsx", import.meta.url),
);

async function uploadToBank(
	page: Page,
	file: { name: string; mimeType: string; buffer: Buffer },
) {
	await page.getByRole("button", { name: "Tải file lên" }).first().click();
	const dialog = page.getByRole("dialog", { name: "Tải file lên" });
	await dialog.getByLabel("File").setInputFiles(file);
	const uploaded = page.waitForResponse(
		(r) =>
			r.url().includes("/api/materials/files") &&
			r.request().method() === "PUT",
	);
	await dialog.getByRole("button", { name: "Tải lên", exact: true }).click();
	expect((await uploaded).status()).toBe(201);
	await expect(dialog).toBeHidden();
}

test("xem trước PDF và ảnh trong ngân hàng; file Office chỉ hiện tên file", async ({
	page,
}, testInfo) => {
	const stamp = Date.now();
	const PDF_NAME = `Đề đọc ${stamp}.pdf`;
	const PNG_NAME = `Sơ đồ ${stamp}.png`;
	const XLSX_NAME = `Bảng điểm ${stamp}.xlsx`;

	await signUpViaApi(page);
	// Ảnh thật để xem trước: chụp chính dashboard vừa tải.
	const pngBuffer = await page.screenshot({
		clip: { x: 0, y: 0, width: 480, height: 270 },
	});

	await page.goto("/materials");
	await expect(page.getByTestId("materials-empty")).toBeVisible();
	await uploadToBank(page, {
		name: PDF_NAME,
		mimeType: "application/pdf",
		buffer: SAMPLE_PDF,
	});
	await uploadToBank(page, {
		name: PNG_NAME,
		mimeType: "image/png",
		buffer: pngBuffer,
	});
	await uploadToBank(page, {
		name: XLSX_NAME,
		mimeType:
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		buffer: SAMPLE_XLSX,
	});

	const rows = page.getByTestId("material-item");
	await expect(rows).toHaveCount(3);
	await page.screenshot({
		path: testInfo.outputPath("material-preview-list.png"),
		fullPage: true,
	});

	// XLSX (Office): không xem trước, giữ tên file + tải xuống.
	const officeRow = rows.filter({ hasText: XLSX_NAME });
	await expect(
		officeRow.getByRole("button", { name: /^Xem trước/ }),
	).toHaveCount(0);
	await expect(
		officeRow.getByRole("link", { name: `Tải xuống ${XLSX_NAME}` }),
	).toBeVisible();

	// PDF: pdfjs vẽ trang lên canvas.
	await rows
		.filter({ hasText: PDF_NAME })
		.getByRole("button", { name: `Xem trước ${PDF_NAME}` })
		.click();
	const pdfDialog = page.getByRole("dialog", { name: PDF_NAME });
	const canvas = pdfDialog.getByLabel(`Nội dung ${PDF_NAME}`);
	await expect(canvas).toBeVisible();
	// Fixture 2 trang: tổng trang chỉ đổi khi pdfjs nạp xong tài liệu.
	await expect(pdfDialog.getByTestId("pdf-page-indicator")).toHaveText(
		"Trang 1 / 2",
	);
	// Canvas phải có chữ (pixel tối), không chỉ là khung trắng.
	await expect
		.poll(() =>
			canvas.evaluate((el) => {
				const c = el as HTMLCanvasElement;
				const ctx = c.getContext("2d");
				if (!ctx || c.width === 0 || c.height === 0) return 0;
				const { data } = ctx.getImageData(0, 0, c.width, c.height);
				let dark = 0;
				for (let k = 0; k < data.length; k += 4) {
					if ((data[k] ?? 255) < 128 && (data[k + 3] ?? 0) > 0) dark += 1;
				}
				return dark;
			}),
		)
		.toBeGreaterThan(0);
	await expect(
		pdfDialog.getByRole("link", { name: `Tải xuống ${PDF_NAME}` }),
	).toBeVisible();
	await page.screenshot({
		path: testInfo.outputPath("material-preview-pdf.png"),
	});
	await page.keyboard.press("Escape");
	await expect(pdfDialog).toBeHidden();

	// Ảnh: <img> từ blob URL đã nạp xong.
	await rows
		.filter({ hasText: PNG_NAME })
		.getByRole("button", { name: `Xem trước ${PNG_NAME}` })
		.click();
	const imgDialog = page.getByRole("dialog", { name: PNG_NAME });
	const img = imgDialog.getByRole("img", { name: `Nội dung ${PNG_NAME}` });
	await expect(img).toBeVisible();
	await expect(img).toHaveAttribute("src", /^blob:/);
	await expect
		.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
	await page.screenshot({
		path: testInfo.outputPath("material-preview-image.png"),
	});

	// Ảnh bằng chứng 3 viewport (REVIEW.md) với PDF đang mở.
	await page.keyboard.press("Escape");
	await expect(imgDialog).toBeHidden();
	for (const [w, h] of [
		[1440, 900],
		[768, 1024],
		[375, 812],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await rows
			.filter({ hasText: PDF_NAME })
			.getByRole("button", { name: `Xem trước ${PDF_NAME}` })
			.click();
		await expect(pdfDialog.getByTestId("pdf-page-indicator")).toHaveText(
			"Trang 1 / 2",
		);
		await page.screenshot({
			path: testInfo.outputPath(`material-preview-pdf-${w}.png`),
		});
		await page.keyboard.press("Escape");
		await expect(pdfDialog).toBeHidden();
	}
});
