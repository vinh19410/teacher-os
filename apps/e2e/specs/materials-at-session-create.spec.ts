/**
 * #655 — pick tài liệu ngay khi tạo buổi học:
 * A) Lớp manual: "+ Thêm buổi học" → chọn tài liệu từ ngân hàng → buổi hiện
 *    tài liệu gắn trực tiếp.
 * B) Syllabus: thêm buổi học trong template → chọn tài liệu → tạo lớp từ
 *    template → buổi tương ứng bài N hiện tài liệu từ giáo trình.
 *
 * Authorization học sinh (đúng lớp mở được, lớp khác bị chặn) thuộc server
 * tests — endpoint student của #644 không đổi quyền, #655 chỉ thêm nguồn
 * tài liệu. Spec này kiểm phần delta trên app giáo viên.
 */
import { expect, type Page, test } from "@playwright/test";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";
import { signUpViaApi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

/** Tạo liên kết trong ngân hàng (thư mục gốc) và trả lại tiêu đề. */
async function seedBankLink(page: Page, title: string) {
	await page.goto("/materials");
	await page.getByRole("button", { name: "Thêm liên kết" }).first().click();
	const dialog = page.getByRole("dialog", { name: "Thêm liên kết" });
	await dialog.getByLabel("Tiêu đề").fill(title);
	await dialog.getByLabel("Đường dẫn").fill("https://learnenglish.britishcouncil.org/");
	await dialog.getByRole("button", { name: "Thêm liên kết" }).click();
	await expect(dialog).toBeHidden();
}

/** Mở picker "Chọn từ ngân hàng tài liệu" từ dialog đang mở và gắn một tài
 * liệu theo tiêu đề, rồi bấm Quay lại. */
async function pickFromBank(page: Page, title: string) {
	const picker = page.getByRole("dialog", {
		name: "Chọn từ ngân hàng tài liệu",
	});
	await picker.getByRole("button", { name: `Gắn ${title}` }).click();
	await picker.getByRole("button", { name: "Quay lại" }).click();
}

test("lớp manual: tạo buổi học kèm tài liệu từ ngân hàng", async ({
	page,
}) => {
	const stamp = Date.now();
	const TITLE = `Đề mẫu buổi mới ${stamp}`;
	const TOPIC = `Buổi ${stamp}`;

	const teacherEmail = await signUpViaApi(page);
	await seedBankLink(page, TITLE);
	const classId = await seedDatedClass(page, {
		name: `E2E Manual ${stamp}`,
		startDate: vietnamTodayISO(),
		schedulingMode: "manual",
		students: { teacherEmail, names: ["Học viên Buổi Mới"] },
	});

	await page.goto(`/classes/${classId}`);
	await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
	const dialog = page.getByRole("dialog", { name: "Thêm buổi học" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel(/Chủ đề buổi học/).fill(TOPIC);

	// Pick tài liệu ngay trong form tạo buổi.
	await dialog.getByRole("button", { name: "Chọn từ ngân hàng" }).click();
	await pickFromBank(page, TITLE);
	await expect(dialog.getByText(TITLE)).toBeVisible();

	await dialog.getByRole("button", { name: "Thêm buổi học" }).click();
	await expect(dialog).toBeHidden();

	// Buổi vừa tạo hiện đúng tài liệu đã pick (gắn trực tiếp).
	const row = page.getByTestId("session-row").filter({ hasText: TOPIC });
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const materials = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(
		materials.getByTestId("material-item").filter({ hasText: TITLE }),
	).toBeVisible();
	await expect(materials.getByText("Từ giáo trình")).toHaveCount(0);
});

test("syllabus: thêm buổi học trong template có tài liệu, lớp tạo từ template kế thừa", async ({
	page,
}) => {
	const stamp = Date.now();
	const TITLE = `Slide giáo trình ${stamp}`;
	const TEMPLATE = `E2E Giáo trình ${stamp}`;
	const MODULE = "E2E Module";
	const CLASS_NAME = `E2E Kế thừa ${stamp}`;

	const teacherEmail = await signUpViaApi(page);
	await seedBankLink(page, TITLE);

	// Template với 1 module rỗng — bài học thêm bằng UI để test picker.
	const tplRes = await page.request.post(
		`${API_ORIGIN}/api/syllabus-templates`,
		{
			data: {
				name: TEMPLATE,
				type: "ielts",
				level: "",
				skills: ["Writing"],
				modules: [{ title: MODULE, description: "", lessons: [] }],
			},
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(tplRes.status()).toBe(201);
	const { id: templateId } = (await tplRes.json()) as { id: string };

	// Thêm buổi học trong template, pick tài liệu ngay tại form.
	await page.goto("/syllabus");
	await page.getByText(TEMPLATE).first().click();
	await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
	const dialog = page.getByRole("dialog", { name: "Thêm buổi học" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel(/Tên buổi học/).fill("Passive voice");
	await dialog.getByRole("button", { name: "Chọn từ ngân hàng" }).click();
	await pickFromBank(page, TITLE);
	await expect(dialog.getByText(TITLE)).toBeVisible();
	await dialog.getByRole("button", { name: "Thêm buổi" }).click();
	await expect(dialog).toBeHidden();

	// Cây giáo trình hiển thị link vừa gắn.
	await expect(page.getByText(TITLE).first()).toBeVisible();

	// Tạo lớp từ template → buổi 1 ứng bài 1 kế thừa tài liệu.
	const classId = await seedDatedClass(page, {
		name: CLASS_NAME,
		startDate: vietnamTodayISO(),
		templateId,
		students: { teacherEmail, names: ["Học viên Kế thừa"] },
	});

	await page.goto(`/classes/${classId}`);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const row = page.getByTestId("session-row").first();
	await row.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const materials = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	const item = materials.getByTestId("material-item").filter({ hasText: TITLE });
	await expect(item).toBeVisible();
	await expect(item.getByText("Từ giáo trình")).toBeVisible();
});
