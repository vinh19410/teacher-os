import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

const API = API_ORIGIN;
const ORIGIN = WEB_ORIGIN;

/**
 * Issue #394 — luồng chính của refactor Template vs Giáo trình của lớp:
 * tạo lớp kèm template, gán sau, sửa bản copy không đổi template, gỡ,
 * và id bản copy không mở được như template.
 */

async function apiPost(
	page: Page,
	path: string,
	data: unknown,
	expected = 201,
): Promise<{ id?: string; error?: string }> {
	const response = await page.request.post(`${API}${path}`, {
		data,
		headers: {
			Origin: ORIGIN,
			"Content-Type": "application/json",
		},
	});
	expect(response.status(), await response.text()).toBe(expected);
	return (await response.json()) as { id?: string; error?: string };
}

/** Template 2 module / 3 lesson (một buổi thi giữa kỳ) qua API — seed dùng chung. */
async function seedTemplate(page: Page, name: string): Promise<string> {
	const tpl = await apiPost(page, "/api/syllabus-templates", {
		name,
		type: "ielts",
		level: "Band 7.0",
		skills: ["Writing"],
		description: "",
		totalLessons: 0,
	});
	const templateId = tpl.id ?? "";
	expect(templateId).not.toBe("");
	const modA = await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules`,
		{ title: "Module Alpha", description: "" },
	);
	const modB = await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules`,
		{ title: "Module Beta", description: "" },
	);
	const a = modA.id ?? "";
	const b = modB.id ?? "";
	await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${a}/lessons`,
		{ title: "Buổi A1", objectives: "", materials: "", status: "upcoming" },
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${a}/lessons`,
		{
			title: "Thi giữa kỳ A",
			objectives: "",
			materials: "",
			kind: "midterm",
			status: "upcoming",
		},
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${b}/lessons`,
		{ title: "Buổi B1", objectives: "", materials: "", status: "upcoming" },
	);
	return templateId;
}

async function openClassFromList(page: Page, className: string) {
	await page.goto("/classes");
	await page.getByText(className).first().click();
	await expect(page).toHaveURL(/\/classes\/.+/);
}

test("A: tạo lớp kèm template qua TemplatePicker — tab Buổi học thấy giáo trình", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaUi(page);
	await seedTemplate(page, `E2E 394 Template ${stamp}`);

	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByPlaceholder("VD: IELTS 7.0 — Cô Mai")
		.fill(`E2E 394 Lớp ${stamp}`);
	// TemplatePicker: chọn template, preview hiện số buổi + kỹ năng.
	await dialog
		.getByLabel("Template giáo trình")
		.selectOption({ label: `E2E 394 Template ${stamp} · 3 buổi` });
	await expect(dialog.getByText("3 buổi")).toBeVisible();
	await expect(dialog.getByText("Writing", { exact: true })).toBeVisible();
	// Preview cây nội dung: "Xem nội dung" mở ra thấy module + buổi thi.
	await dialog.getByText("Xem nội dung").click();
	await expect(dialog.getByText("Module Alpha")).toBeVisible();
	await expect(dialog.getByText("Thi giữa kỳ A")).toBeVisible();
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();

	await openClassFromList(page, `E2E 394 Lớp ${stamp}`);
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText(`E2E 394 Template ${stamp}`)).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Gỡ giáo trình", exact: true }),
	).toBeVisible();
});

test("B: gán sau — lớp trống nhập từ template; nhập lần hai bằng API là 409", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaUi(page);
	const templateId = await seedTemplate(page, `E2E 394 Assign ${stamp}`);

	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByPlaceholder("VD: IELTS 7.0 — Cô Mai")
		.fill(`E2E 394 Trống ${stamp}`);
	// Không chọn template — "— Lớp trống —" là mặc định.
	await expect(
		dialog.getByLabel("Template giáo trình").locator("option", {
			hasText: "— Lớp trống —",
		}),
	).toHaveCount(1);
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();

	await openClassFromList(page, `E2E 394 Trống ${stamp}`);
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await expect(
		page.getByText("Lớp chưa có giáo trình", { exact: false }),
	).toBeVisible();
	await page.getByRole("button", { name: "Nhập từ template" }).click();
	const importDialog = page.getByRole("dialog");
	await importDialog
		.getByLabel("Template giáo trình")
		.selectOption({ index: 0 });
	await importDialog.getByRole("button", { name: "Nhập giáo trình" }).click();
	await expect(importDialog).toBeHidden();
	await expect(page.getByText(`E2E 394 Assign ${stamp}`)).toBeVisible();

	// Nhập lần hai qua API trực tiếp → 409.
	const classUrl = page.url();
	const classId = /\/classes\/([^/?#]+)/.exec(classUrl)?.[1] ?? "";
	expect(classId).not.toBe("");
	const res = await page.request.post(
		`${API}/api/classes/${classId}/curriculum/import`,
		{
			data: { templateId },
			headers: { Origin: ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(res.status()).toBe(409);
});

test("C: sửa buổi trên bản copy không đổi template gốc", async ({ page }) => {
	const stamp = Date.now();
	await signUpViaUi(page);
	const templateId = await seedTemplate(page, `E2E 394 Copy ${stamp}`);

	// Tạo lớp kèm template bằng API cho nhanh — focus của test là edit copy.
	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByPlaceholder("VD: IELTS 7.0 — Cô Mai")
		.fill(`E2E 394 Copy Lớp ${stamp}`);
	await dialog
		.getByLabel("Template giáo trình")
		.selectOption({ label: `E2E 394 Copy ${stamp} · 3 buổi` });
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
	await openClassFromList(page, `E2E 394 Copy Lớp ${stamp}`);

	// Quản lý buổi → sửa tiêu đề "Buổi A1" của BẢN COPY.
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageDialog = page.getByRole("dialog");
	const a1Row = manageDialog
		.locator("div")
		.filter({ hasText: /^Buổi A1/ })
		.first();
	await a1Row.getByRole("button", { name: "Sửa", exact: true }).click();
	const editDialog = page.getByRole("dialog").last();
	const titleInput = editDialog.getByPlaceholder(
		"VD: Line chart — Mô tả xu hướng",
	);
	await titleInput.fill("Buổi A1 (bản copy)");
	await editDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(editDialog).toBeHidden();
	await expect(manageDialog.getByText("Buổi A1 (bản copy)")).toBeVisible();

	// Template gốc giữ tiêu đề cũ.
	await page.goto(`/syllabus/${templateId}`);
	await expect(page.getByText("Buổi A1", { exact: true })).toBeVisible();
	await expect(page.getByText("Buổi A1 (bản copy)")).toHaveCount(0);
});

test("D: gỡ giáo trình — tab trở về trạng thái trống, template còn", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaUi(page);
	const templateId = await seedTemplate(page, `E2E 394 Remove ${stamp}`);

	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const dialog = page.getByRole("dialog");
	await dialog
		.getByPlaceholder("VD: IELTS 7.0 — Cô Mai")
		.fill(`E2E 394 Remove Lớp ${stamp}`);
	await dialog
		.getByLabel("Template giáo trình")
		.selectOption({ label: `E2E 394 Remove ${stamp} · 3 buổi` });
	await dialog.getByRole("button", { name: "Tạo lớp", exact: true }).click();
	await expect(dialog).toBeHidden();
	await openClassFromList(page, `E2E 394 Remove Lớp ${stamp}`);
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	await expect(page.getByText(`E2E 394 Remove ${stamp}`)).toBeVisible();

	await page
		.getByRole("button", { name: "Gỡ giáo trình", exact: true })
		.click();
	const confirmDialog = page.getByRole("dialog");
	await expect(
		confirmDialog.getByRole("heading", { name: "Gỡ giáo trình khỏi lớp?" }),
	).toBeVisible();
	await confirmDialog
		.getByRole("button", { name: "Gỡ giáo trình", exact: true })
		.click();
	await expect(confirmDialog).toBeHidden();
	await expect(
		page.getByText("Lớp chưa có giáo trình", { exact: false }),
	).toBeVisible();

	// Template vẫn còn nguyên.
	await page.goto(`/syllabus/${templateId}`);
	await expect(page.getByText(`E2E 394 Remove ${stamp}`)).toBeVisible();
});

test("E: id bản copy không mở được như template — 404 branded", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaUi(page);
	const templateId = await seedTemplate(page, `E2E 394 Guard ${stamp}`);

	// Import bằng API vào một lớp tạo nhanh.
	const cls = await apiPost(page, "/api/classes", {
		name: `E2E 394 Guard Lớp ${stamp}`,
		type: "ielts",
		level: "Band 7.0",
		skills: ["Writing"],
		mode: "Online",
		templateId: "",
		schedule: { days: [2], start: "19:00", end: "20:30" },
		sessionsTotal: 8,
		startDate: "01/09",
	});
	const classId = cls.id ?? "";
	expect(classId).not.toBe("");
	const copy = await apiPost(
		page,
		`/api/classes/${classId}/curriculum/import`,
		{ templateId },
	);
	const copyId = copy.id ?? "";
	expect(copyId).not.toBe("");

	await page.goto(`/syllabus/${copyId}`);
	await expect(
		page.getByText("Lỗi 404 · Không tìm thấy trang", { exact: false }),
	).toBeVisible();

	// Còn template id thật thì vẫn mở được.
	await page.goto(`/syllabus/${templateId}`);
	await expect(page.getByText(`E2E 394 Guard ${stamp}`)).toBeVisible();
});
