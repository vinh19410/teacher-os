/**
 * #655 — Ảnh POT: pick tài liệu ngay khi tạo buổi học.
 * 1. Modal "+ Thêm buổi học" (lớp manual) với chip tài liệu đã chọn.
 * 2. Modal "Thêm buổi học" trong syllabus với chip tài liệu + badge đếm trên
 *    dòng bài.
 * 3. Dialog "Tài liệu buổi" hiển thị mục "Từ giáo trình" ở lớp tạo từ
 *    template.
 * Light 3 viewport cho cả 3 màn; dark desktop cho màn 1 và 3.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

const VIEWPORTS = [
	{ name: "desktop-1440x900", width: 1440, height: 900 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "mobile-375x812", width: 375, height: 812 },
];

/** Thêm một liên kết vào ngân hàng (thư mục gốc). */
async function seedBankLink(page: Page, title: string) {
	await page.goto("/materials");
	await page.getByRole("button", { name: "Thêm liên kết" }).first().click();
	const dialog = page.getByRole("dialog", { name: "Thêm liên kết" });
	await dialog.getByLabel("Tiêu đề").fill(title);
	await dialog
		.getByLabel("Đường dẫn")
		.fill("https://learnenglish.britishcouncil.org/");
	await dialog.getByRole("button", { name: "Thêm liên kết" }).click();
	await expect(dialog).toBeHidden();
}

/** Chọn một tài liệu trong picker rồi đóng modal picker. */
async function pickFromBank(page: Page, title: string) {
	const picker = page.getByRole("dialog", {
		name: "Chọn từ ngân hàng tài liệu",
	});
	await picker.getByRole("button", { name: `Gắn ${title}` }).click();
	await picker.getByLabel("Đóng").click();
	await expect(picker).toBeHidden();
}

async function shoot(page: Page, base: string) {
	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(200);
		await page.screenshot({
			path: resolve(REPORT_DIR, `${base}-${vp.name}-light.png`),
			fullPage: true,
		});
	}
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(200);
	await page.screenshot({
		path: resolve(REPORT_DIR, `${base}-desktop-1440x900-dark.png`),
		fullPage: true,
	});
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
}

test("Issue #655: screenshots 3 viewports cho pick tài liệu khi tạo buổi học", async ({
	page,
}) => {
	const stamp = Date.now();
	const TITLE = `Đề mẫu POT ${stamp}`;
	const TEMPLATE = `E2E Giáo trình POT ${stamp}`;

	const teacherEmail = await signUpViaApi(page);
	await seedBankLink(page, TITLE);

	// ---- Màn 1: modal thêm buổi manual với chip tài liệu ----
	const classId = await seedDatedClass(page, {
		name: `E2E POT Manual ${stamp}`,
		startDate: vietnamTodayISO(),
		schedulingMode: "manual",
		students: { teacherEmail, names: ["Học viên POT"] },
	});
	await page.goto(`/classes/${classId}`);
	await page.getByRole("button", { name: "+ Thêm buổi học" }).first().click();
	const dialog = page.getByRole("dialog", { name: "Thêm buổi học" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel(/Chủ đề buổi học/).fill(`Buổi POT ${stamp}`);
	await dialog.getByRole("button", { name: "Chọn từ ngân hàng" }).click();
	await pickFromBank(page, TITLE);
	await expect(dialog.getByText(TITLE)).toBeVisible();
	await shoot(page, "655-add-session-materials");

	// Lưu buổi để có buổi thật cho màn 3.
	await dialog.getByRole("button", { name: "Thêm buổi học" }).click();
	await expect(dialog).toBeHidden();

	// ---- Màn 2: syllabus — badge + modal thêm bài với chip ----
	const tplRes = await page.request.post(
		`${API_ORIGIN}/api/syllabus-templates`,
		{
			data: {
				name: TEMPLATE,
				type: "ielts",
				level: "",
				skills: ["Writing"],
				modules: [{ title: "POT Module", description: "", lessons: [] }],
			},
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(tplRes.status()).toBe(201);
	const { id: templateId } = (await tplRes.json()) as { id: string };

	await page.goto("/syllabus");
	await page.getByText(TEMPLATE).first().click();
	await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
	const lessonDialog = page.getByRole("dialog", { name: "Thêm buổi học" });
	await expect(lessonDialog).toBeVisible();
	await lessonDialog.getByLabel(/Tên buổi học/).fill("Passive voice");
	await lessonDialog.getByRole("button", { name: "Chọn từ ngân hàng" }).click();
	await pickFromBank(page, TITLE);
	await expect(lessonDialog.getByText(TITLE)).toBeVisible();
	await shoot(page, "655-add-lesson-materials");
	await lessonDialog.getByRole("button", { name: "Thêm buổi" }).click();
	await expect(lessonDialog).toBeHidden();
	await expect(page.getByText("Passive voice").first()).toBeVisible();
	await shoot(page, "655-syllabus-badge");

	// ---- Màn 3: lớp từ template — tài liệu "Từ giáo trình" ----
	const classRes = await seedDatedClass(page, {
		name: `E2E POT Kế thừa ${stamp}`,
		startDate: vietnamTodayISO(),
		templateId,
		students: { teacherEmail, names: ["Học viên POT Kế thừa"] },
	});
	await page.goto(`/classes/${classRes}`);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const row = page.getByTestId("session-row").first();
	await row.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const materials = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(
		materials.getByTestId("material-item").filter({ hasText: TITLE }),
	).toBeVisible();
	await expect(materials.getByText("Từ giáo trình")).toBeVisible();
	await shoot(page, "655-session-curriculum-materials");
});
