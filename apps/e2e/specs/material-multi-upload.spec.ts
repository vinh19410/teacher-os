/**
 * E2E kiểm chứng luồng giáo viên tải nhiều file tài liệu cùng lúc:
 * - Ngân hàng tài liệu (`/materials` — `UploadDialog`): lô hỗn hợp hợp lệ +
 *   không hợp lệ (chỉ tải các file hợp lệ, giữ modal báo file sai), persist
 *   sau reload, và lô toàn file hợp lệ tự đóng modal.
 * - Tab "Tài liệu chung" cấp lớp (`ClassSharedMaterialsTab`): chọn nhiều file
 *   cùng lúc tải thẳng, hiển thị khung tóm tắt gọn và nút "Ẩn".
 * - Modal "Tài liệu buổi học" (`SessionMaterialsModal`): chọn nhiều file cùng
 *   lúc tải thẳng và gắn vào buổi học.
 * - Kiểm chứng không tràn ngang trên 1440×900, 768×1024, 375×812, 320×812
 *   (cả light & dark) và chụp ảnh POT khi đặt `CAPTURE_POT=1`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

const PDF_SAMPLE = readFileSync(
	new URL("../fixtures/exam-import/cambridge-sample.pdf", import.meta.url),
);
const MP3_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);
const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);
const CAPTURE_POT = process.env.CAPTURE_POT === "1";

const VIEWPORTS = [
	{ name: "1440x900", width: 1440, height: 900 },
	{ name: "768x1024", width: 768, height: 1024 },
	{ name: "375x812", width: 375, height: 812 },
] as const;

async function verifyResponsiveAndCapture(
	page: Page,
	slug: string,
	options?: { captureTablet?: boolean; fullPage?: boolean },
) {
	const captureTablet = options?.captureTablet ?? true;
	const fullPage = options?.fullPage ?? false;
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(200);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		);
		expect(
			overflow,
			`${slug} ${vp.name} light must not overflow horizontally`,
		).toBeLessThanOrEqual(1);
		if (CAPTURE_POT && (vp.name !== "768x1024" || captureTablet)) {
			await page.screenshot({
				path: resolve(REPORT_DIR, `${slug}-${vp.name}-light.png`),
				fullPage,
			});
		}
	}

	await page.setViewportSize({ width: 320, height: 812 });
	await page.waitForTimeout(150);
	const reflow320 = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(
		reflow320,
		`${slug} 320px reflow must not overflow horizontally`,
	).toBeLessThanOrEqual(1);

	await page.setViewportSize({ width: 1440, height: 900 });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(200);
	const darkOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(darkOverflow).toBeLessThanOrEqual(1);
	if (CAPTURE_POT) {
		await page.screenshot({
			path: resolve(REPORT_DIR, `${slug}-1440x900-dark.png`),
			fullPage,
		});
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

test("tải nhiều file cùng lúc tại Ngân hàng tài liệu, Tài liệu chung và Tài liệu buổi học", async ({
	page,
}) => {
	const stamp = Date.now();
	const teacherEmail = await signUpViaApi(page, {
		name: `Trung tâm Multi Upload ${stamp}`,
	});
	const classId = await seedDatedClass(page, {
		name: `Lớp Multi Upload ${stamp}`,
		startDate: vietnamTodayISO(),
		sessionsTotal: 1,
		students: { teacherEmail, names: ["Học viên Multi Upload"] },
	});

	// ---- 1. Ngân hàng tài liệu (/materials): lô hỗn hợp 2 hợp lệ + 1 sai ----
	const bankPdf1 = `Unit 1 Slides (${stamp}).pdf`;
	const bankPdf2 = `Unit 1 Handout (${stamp}).pdf`;
	const bankMp3 = `Unit 1 Audio (${stamp}).mp3`;
	const bankPdf3 = `Unit 2 Grammar (${stamp}).pdf`;

	await page.goto("/teacher/materials");
	await expect(page.getByTestId("materials-empty")).toBeVisible();
	await page.getByRole("button", { name: "Tải file lên" }).first().click();

	const uploadDialog = page.getByRole("dialog", { name: "Tải file lên" });
	await expect(uploadDialog).toBeVisible();

	await uploadDialog.getByLabel("File").setInputFiles([
		{
			name: bankPdf1,
			mimeType: "application/pdf",
			buffer: PDF_SAMPLE,
		},
		{
			name: bankPdf2,
			mimeType: "application/pdf",
			buffer: PDF_SAMPLE,
		},
		{
			name: "khong-ho-tro.html",
			mimeType: "text/html",
			buffer: Buffer.from("<html><body>bad</body></html>"),
		},
	]);

	await expect(
		uploadDialog.getByText("3 file đã chọn (2 hợp lệ, 1 không hợp lệ)"),
	).toBeVisible();
	await expect(uploadDialog.getByRole("alert")).toContainText(
		/Định dạng chưa hỗ trợ/,
	);
	await expect(
		uploadDialog.getByRole("button", { name: "Tải lên 2 file", exact: true }),
	).toBeVisible();

	// Kiểm chứng responsive + light/dark ngay khi UploadDialog có hàng đợi nhiều file.
	await verifyResponsiveAndCapture(page, "938-upload-dialog");

	let bankPutCount = 0;
	const waitTwoBankPuts = new Promise<void>((resolveAll) => {
		const onResponse = (res: {
			url(): string;
			status(): number;
			request(): { method(): string };
		}) => {
			if (
				res.request().method() === "PUT" &&
				res.url().includes("/api/materials/files") &&
				res.status() === 201
			) {
				bankPutCount += 1;
				if (bankPutCount === 2) {
					page.off("response", onResponse);
					resolveAll();
				}
			}
		};
		page.on("response", onResponse);
	});

	await uploadDialog
		.getByRole("button", { name: "Tải lên 2 file", exact: true })
		.click();
	await waitTwoBankPuts;

	// Có file không hợp lệ → modal giữ mở để giáo viên thấy kết quả; sau đó đóng.
	await expect(uploadDialog.getByText(/Đã tải 2\/2 file/)).toBeVisible();
	await uploadDialog
		.getByRole("button", { name: "Đóng", exact: true })
		.last()
		.click();
	await expect(uploadDialog).toBeHidden();

	await expect(
		page.getByTestId("material-item").filter({ hasText: bankPdf1 }),
	).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: bankPdf2 }),
	).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: "khong-ho-tro.html" }),
	).toHaveCount(0);

	// Reload để xác minh cả 2 file lưu thật trên server/DB.
	await page.reload();
	await expect(
		page.getByTestId("material-item").filter({ hasText: bankPdf1 }),
	).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: bankPdf2 }),
	).toBeVisible();

	// Lô toàn file hợp lệ (PDF + MP3) → tải xong tự đóng modal.
	await page.getByRole("button", { name: "Tải file lên" }).first().click();
	const cleanDialog = page.getByRole("dialog", { name: "Tải file lên" });
	await cleanDialog.getByLabel("File").setInputFiles([
		{
			name: bankPdf3,
			mimeType: "application/pdf",
			buffer: PDF_SAMPLE,
		},
		{
			name: bankMp3,
			mimeType: "audio/mpeg",
			buffer: MP3_SAMPLE,
		},
	]);
	await cleanDialog
		.getByRole("button", { name: "Tải lên 2 file", exact: true })
		.click();
	await expect(cleanDialog).toBeHidden();
	await expect(
		page.getByTestId("material-item").filter({ hasText: bankPdf3 }),
	).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: bankMp3 }),
	).toBeVisible();

	// ---- 2. Tab "Tài liệu chung" cấp lớp ----
	const sharedPdf = `Đề cương chung (${stamp}).pdf`;
	const sharedMp3 = `Audio chung (${stamp}).mp3`;

	await page.goto(`/teacher/classes/${classId}?tab=materials`);
	await expect(page.getByTestId("class-shared-materials-empty")).toBeVisible();

	let sharedPutCount = 0;
	const waitTwoSharedPuts = new Promise<void>((resolveAll) => {
		const onResponse = (res: {
			url(): string;
			status(): number;
			request(): { method(): string };
		}) => {
			if (
				res.request().method() === "PUT" &&
				res.url().includes(`/api/classes/${classId}/materials/files`) &&
				res.status() === 201
			) {
				sharedPutCount += 1;
				if (sharedPutCount === 2) {
					page.off("response", onResponse);
					resolveAll();
				}
			}
		};
		page.on("response", onResponse);
	});

	await page.getByLabel("Chọn file tải lên cho lớp học").setInputFiles([
		{
			name: sharedPdf,
			mimeType: "application/pdf",
			buffer: PDF_SAMPLE,
		},
		{
			name: sharedMp3,
			mimeType: "audio/mpeg",
			buffer: MP3_SAMPLE,
		},
	]);
	await waitTwoSharedPuts;

	await expect(page.getByText("Đã tải xong 2/2 file.")).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: sharedPdf }),
	).toBeVisible();
	await expect(
		page.getByTestId("material-item").filter({ hasText: sharedMp3 }),
	).toBeVisible();

	await page.waitForTimeout(500);
	await verifyResponsiveAndCapture(page, "938-class-shared-multi-upload", {
		captureTablet: false,
		fullPage: true,
	});

	await page.getByRole("button", { name: "Ẩn tiến độ tải lên" }).click();
	await expect(page.getByText("Đã tải xong 2/2 file.")).toHaveCount(0);

	// ---- 3. Modal "Tài liệu buổi học" ----
	const sessionPdf = `Bài tập buổi 1 (${stamp}).pdf`;
	const sessionMp3 = `Audio buổi 1 (${stamp}).mp3`;

	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page
		.locator("[data-testid='session-row']")
		.first()
		.getByRole("button", { name: /^Tài liệu buổi/ })
		.click();
	const sessionDialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(sessionDialog).toBeVisible();

	let sessionPutCount = 0;
	const waitTwoSessionPuts = new Promise<void>((resolveAll) => {
		const onResponse = (res: {
			url(): string;
			status(): number;
			request(): { method(): string };
		}) => {
			if (
				res.request().method() === "PUT" &&
				res.url().includes(`/api/classes/${classId}/sessions/`) &&
				res.url().includes("/materials/files") &&
				res.status() === 201
			) {
				sessionPutCount += 1;
				if (sessionPutCount === 2) {
					page.off("response", onResponse);
					resolveAll();
				}
			}
		};
		page.on("response", onResponse);
	});

	await sessionDialog
		.getByLabel("Chọn file tải lên cho buổi học")
		.setInputFiles([
			{
				name: sessionPdf,
				mimeType: "application/pdf",
				buffer: PDF_SAMPLE,
			},
			{
				name: sessionMp3,
				mimeType: "audio/mpeg",
				buffer: MP3_SAMPLE,
			},
		]);
	await waitTwoSessionPuts;

	await expect(sessionDialog.getByText("Đã tải xong 2/2 file.")).toBeVisible();
	await expect(
		sessionDialog.getByTestId("material-item").filter({ hasText: sessionPdf }),
	).toBeVisible();
	await expect(
		sessionDialog.getByTestId("material-item").filter({ hasText: sessionMp3 }),
	).toBeVisible();
});
