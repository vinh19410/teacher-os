/**
 * End-to-end verification cho tab "Tài liệu chung" cấp lớp học (teacher & student):
 * - Giáo viên chọn tài liệu từ kho, tải file PDF trực tiếp, và thêm liên kết mới.
 * - Trang Ngân hàng tài liệu hiển thị badge "Dùng ở 1 lớp" và chặn xóa 409 khi đang gắn ở lớp.
 * - Học viên mở tab "Tài liệu chung" ở chế độ chỉ đọc: xem trước PDF, tải PDF đủ byte,
 *   nạp audio MP3, mở liên kết ngoài, không có nút ghi/xóa.
 * - Giáo viên gỡ khỏi lớp → tài liệu vẫn còn trong kho và xóa được sau khi gỡ.
 * - Kiểm chứng không tràn ngang ở 1440×900, 768×1024, 375×812 và 320×812 (light + dark).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type BrowserContext,
	type Download,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	acceptEnrollment,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import {
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
	WEB_ORIGIN,
} from "./origins";

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

async function readDownloadBytes(download: Download): Promise<Buffer> {
	const path = await download.path();
	return path ? readFileSync(path) : Buffer.alloc(0);
}

async function newIsolatedContext(context: BrowserContext) {
	const browser = context.browser();
	if (!browser) throw new Error("Playwright browser is unavailable");
	return browser.newContext();
}

async function verifyResponsiveAndCapture(page: Page, slug: string) {
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(250);
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - window.innerWidth,
		);
		expect(
			overflow,
			`${slug} ${vp.name} light must not overflow horizontally`,
		).toBeLessThanOrEqual(1);
		if (CAPTURE_POT) {
			await page.screenshot({
				path: resolve(REPORT_DIR, `${slug}-${vp.name}-light.png`),
				fullPage: true,
			});
		}
	}

	// 320px reflow check (REVIEW.md)
	await page.setViewportSize({ width: 320, height: 812 });
	await page.waitForTimeout(200);
	const reflow320 = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(
		reflow320,
		`${slug} 320px reflow must not overflow horizontally`,
	).toBeLessThanOrEqual(1);

	// Dark theme check at desktop 1440x900
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(250);
	const darkOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - window.innerWidth,
	);
	expect(darkOverflow).toBeLessThanOrEqual(1);
	if (CAPTURE_POT) {
		await page.screenshot({
			path: resolve(REPORT_DIR, `${slug}-1440x900-dark.png`),
			fullPage: true,
		});
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

test("class shared materials: teacher pick/upload/link, bank protection, student read-only preview & download", async ({
	page,
	context,
}) => {
	const stamp = Date.now();
	const MP3_NAME = `Audio phát âm chung (${stamp}).mp3`;
	const PDF_NAME = `Đề cương khóa học (${stamp}).pdf`;
	const LINK_TITLE = `Thư mục tham khảo IELTS (${stamp})`;
	const LINK_URL = "https://learnenglish.britishcouncil.org/";

	const teacherEmail = await signUpViaApi(page, {
		name: `Trung tâm Tài Liệu ${stamp}`,
	});

	// 1. Seed 1 file MP3 sẵn trong Ngân hàng tài liệu để test thao tác "Chọn từ kho tài liệu".
	const seedBankUpload = await page.request.put(
		`${API_ORIGIN}/api/materials/files`,
		{
			data: MP3_SAMPLE,
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "audio/mpeg",
				"X-File-Name": encodeURIComponent(MP3_NAME),
			},
		},
	);
	expect(seedBankUpload.status()).toBe(201);

	// 2. Seed học viên và lớp học (kèm active enrollment).
	const studentEmail = `shared.materials.${stamp}@e2e.test`;
	const student = await seedStudent({
		teacherEmail,
		name: "Học viên Tài Liệu Chung",
		email: studentEmail,
		onboarded: true,
	});
	const classId = await seedDatedClass(page, {
		name: `IELTS Foundation ${stamp}`,
		startDate: vietnamTodayISO(),
		sessionsTotal: 2,
	});
	const enrollRes = await page.request.post(
		`${API_ORIGIN}/api/classes/${classId}/enroll`,
		{
			data: { studentId: student.id },
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(enrollRes.status()).toBe(201);
	const { id: enrollmentId } = (await enrollRes.json()) as { id: string };
	await acceptEnrollment(page, enrollmentId);

	// 3. Giáo viên mở trang Chi tiết lớp thẳng vào ?tab=materials.
	await page.goto(`/teacher/classes/${classId}?tab=materials`);
	const materialsTab = page.getByRole("tab", {
		name: "Tài liệu chung",
		exact: true,
	});
	await expect(materialsTab).toHaveAttribute("aria-selected", "true");
	await expect(page.getByTestId("class-shared-materials-empty")).toBeVisible();

	// 3a. Chọn từ kho tài liệu (gắn MP3).
	await page.getByRole("button", { name: "Chọn từ kho tài liệu" }).click();
	const pickerDialog = page.getByRole("dialog", {
		name: "Chọn từ kho tài liệu",
	});
	await expect(pickerDialog).toBeVisible();
	await pickerDialog.getByRole("button", { name: `Gắn ${MP3_NAME}` }).click();
	await expect(
		pickerDialog.getByRole("button", { name: `Đã gắn ${MP3_NAME}` }),
	).toBeDisabled();
	await pickerDialog.getByRole("button", { name: "Đóng" }).first().click();
	await expect(pickerDialog).toBeHidden();
	await expect(
		page.getByTestId("material-item").filter({ hasText: MP3_NAME }),
	).toBeVisible();

	// 3b. Tải file PDF trực tiếp lên lớp (tự lưu vào kho + gắn vào lớp).
	const uploadPromise = page.waitForResponse(
		(r) =>
			r.request().method() === "PUT" &&
			r.url().includes(`/api/classes/${classId}/materials/files`),
	);
	await page.getByLabel("Chọn file tải lên cho lớp học").setInputFiles({
		name: PDF_NAME,
		mimeType: "application/pdf",
		buffer: PDF_SAMPLE,
	});
	expect((await uploadPromise).status()).toBe(201);
	await expect(
		page.getByTestId("material-item").filter({ hasText: PDF_NAME }),
	).toBeVisible();

	// 3c. Thêm liên kết trực tiếp.
	await page.getByRole("button", { name: "Thêm liên kết" }).click();
	const linkDialog = page.getByRole("dialog", { name: "Thêm liên kết" });
	await expect(linkDialog).toBeVisible();
	await linkDialog.getByLabel("Tiêu đề").fill(LINK_TITLE);
	await linkDialog.getByLabel("Đường dẫn").fill(LINK_URL);
	await linkDialog
		.getByLabel("Mô tả (không bắt buộc)")
		.fill("Tài liệu đọc thêm dùng suốt khóa");
	await linkDialog.getByRole("button", { name: "Thêm liên kết" }).click();
	await expect(linkDialog).toBeHidden();
	await expect(
		page.getByTestId("material-item").filter({ hasText: LINK_TITLE }),
	).toBeVisible();

	// Đợi thumbnail PDF render ổn định rồi kiểm chứng 3 viewport + dark mode (Teacher).
	await page.waitForTimeout(600);
	await verifyResponsiveAndCapture(page, "914-teacher-shared-materials");

	// 4. Kiểm tra Ngân hàng tài liệu hiển thị badge "Dùng ở 1 lớp" và chặn xóa 409.
	await page.goto("/teacher/materials");
	const pdfRowInBank = page
		.getByTestId("material-item")
		.filter({ hasText: PDF_NAME });
	await expect(pdfRowInBank).toBeVisible();
	await expect(pdfRowInBank.getByText("Dùng ở 1 lớp")).toBeVisible();
	await pdfRowInBank.getByRole("button", { name: `Xóa ${PDF_NAME}` }).click();
	const deleteDialog = page.getByRole("dialog", { name: "Xóa tài liệu" });
	await deleteDialog.getByRole("button", { name: "Xóa" }).click();
	await expect(deleteDialog.getByRole("alert")).toContainText("1 lớp học");
	await deleteDialog.getByRole("button", { name: "Hủy" }).click();
	await expect(deleteDialog).toBeHidden();

	// 5. Học viên đăng nhập ở context riêng, mở tab "Tài liệu chung" chỉ đọc.
	const studentContext = await newIsolatedContext(context);
	const studentPage = await studentContext.newPage();
	try {
		await studentPage.goto(`${LMS_ORIGIN}/login`);
		await studentPage.locator("#tab-signup").click();
		await studentPage.locator("#signup-name").fill("Học viên Tài Liệu Chung");
		await studentPage.locator("#signup-email").fill(studentEmail);
		await studentPage.locator("#signup-password").fill("password-8chars");
		await studentPage.locator("#panel-signup button[type='submit']").click();
		await expect(studentPage.getByText("Email chưa được xác thực")).toBeVisible(
			{ timeout: 15_000 },
		);
		await verifyStudentEmailFromMailLog(studentPage, studentEmail);
		await expect(studentPage).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
			timeout: 30_000,
		});

		await studentPage
			.getByTestId("class-card")
			.filter({ hasText: `IELTS Foundation ${stamp}` })
			.getByRole("link", { name: `IELTS Foundation ${stamp}` })
			.click();
		await expect(
			studentPage.getByRole("heading", {
				level: 1,
				name: `IELTS Foundation ${stamp}`,
			}),
		).toBeVisible();

		await studentPage.getByTestId("class-tab-materials").click();
		const studentRows = studentPage.getByTestId("class-material");
		await expect(studentRows).toHaveCount(3);
		await expect(studentRows.filter({ hasText: MP3_NAME })).toBeVisible();
		await expect(studentRows.filter({ hasText: PDF_NAME })).toBeVisible();
		await expect(studentRows.filter({ hasText: LINK_TITLE })).toBeVisible();

		// Học viên tuyệt đối không có control ghi/xóa.
		await expect(
			studentPage.getByRole("button", {
				name: /Chọn từ kho|Tải file lên|Thêm liên kết|Gỡ/i,
			}),
		).toHaveCount(0);

		// Tải PDF về khớp nguyên vẹn byte gốc.
		const downloadPromise = studentPage.waitForEvent("download");
		await studentPage.getByRole("link", { name: `Tải ${PDF_NAME}` }).click();
		const download = await downloadPromise;
		const downloadedBytes = await readDownloadBytes(download);
		expect(downloadedBytes.equals(PDF_SAMPLE)).toBe(true);

		// Audio nạp được metadata trên trình duyệt.
		const audio = studentPage.locator("audio").first();
		await audio.evaluate((el) => {
			const media = el as HTMLAudioElement;
			media.preload = "metadata";
			media.load();
		});
		await expect
			.poll(async () =>
				audio.evaluate((el) => {
					const media = el as HTMLAudioElement;
					return (
						media.readyState >= 1 && media.error === null && media.duration > 0
					);
				}),
			)
			.toBe(true);

		// Xem trước PDF on-demand: bấm "Xem trước <PDF_NAME>" mở dialog, bấm Escape đóng lại.
		const previewBtn = studentPage.getByRole("button", {
			name: `Xem trước ${PDF_NAME}`,
		});
		await expect(previewBtn).toBeVisible();
		await previewBtn.click();
		const previewDialog = studentPage.getByRole("dialog", { name: PDF_NAME });
		await expect(previewDialog).toBeVisible({ timeout: 15_000 });
		await studentPage.keyboard.press("Escape");
		await expect(previewDialog).toBeHidden();
		await expect(previewBtn).toBeFocused();

		// Kiểm chứng 3 viewport + dark mode + 320px reflow (Student).
		await verifyResponsiveAndCapture(
			studentPage,
			"914-student-shared-materials",
		);
	} finally {
		await studentContext.close();
	}

	// 6. Giáo viên gỡ PDF khỏi lớp → file vẫn còn ở kho và nay xóa được.
	await page.goto(`/teacher/classes/${classId}?tab=materials`);
	await page.getByRole("button", { name: `Gỡ ${PDF_NAME}` }).click();
	await expect(
		page.getByTestId("material-item").filter({ hasText: PDF_NAME }),
	).toHaveCount(0);

	await page.goto("/teacher/materials");
	const detachedPdfRow = page
		.getByTestId("material-item")
		.filter({ hasText: PDF_NAME });
	await expect(detachedPdfRow).toBeVisible();
	await detachedPdfRow.getByRole("button", { name: `Xóa ${PDF_NAME}` }).click();
	const confirmDel = page.getByRole("dialog", { name: "Xóa tài liệu" });
	await confirmDel.getByRole("button", { name: "Xóa" }).click();
	await expect(confirmDel).toBeHidden();
	await expect(
		page.getByTestId("material-item").filter({ hasText: PDF_NAME }),
	).toHaveCount(0);
});
