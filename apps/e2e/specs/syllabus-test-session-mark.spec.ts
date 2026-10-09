import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/** Tạo syllabus template rỗng (không import file) qua popup và chờ tới
 * trang detail. Trả về id template trên URL /syllabus/:id — không phải id
 * bản copy gắn class. */
async function createSyllabusTemplate(page: Page, name: string) {
	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("VD: IELTS Writing 7.0").fill(name);
	// Scope vào dialog: list page phía sau cũng có chip "Writing" (ChipFilter).
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);
	const templateId = new URL(page.url()).pathname.split("/").pop();
	if (!templateId) throw new Error(`Thiếu id template trên ${page.url()}`);
	return templateId;
}

test("đánh dấu buổi thi qua modal ở màn hình syllabus: badge + nền tint xám, đổi loại cập nhật nhãn", async ({
	page,
}) => {
	await signUpViaUi(page);
	await createSyllabusTemplate(page, "E2E Buổi Thi Mark");

	// Thêm 1 buổi thường (không chọn loại) → không badge, không tint.
	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog = page.getByRole("dialog");
	await moduleDialog
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module thi");
	await moduleDialog.getByRole("button", { name: "Thêm module" }).click();
	await expect(page.getByText("Module thi")).toBeVisible();

	await page.getByRole("button", { name: "+ Thêm buổi học" }).click();
	const addDialog = page.getByRole("dialog");
	// Màn hình syllabus PHẢI có select Loại buổi học (#154).
	await expect(addDialog.getByLabel("Loại buổi học")).toBeVisible();
	await addDialog
		.getByPlaceholder("VD: Line chart — Mô tả xu hướng")
		.fill("Buổi thường");
	await addDialog.getByRole("button", { name: "Thêm buổi" }).click();
	await expect(addDialog).toBeHidden();
	await expect(page.getByText("Buổi thường", { exact: true })).toBeVisible();
	await expect(page.getByText("Thi giữa kỳ")).toHaveCount(0);
	await expect(page.locator('[data-testid="test-session-row"]')).toHaveCount(0);

	// Sửa buổi thành "Thi giữa kỳ" → badge + tint hiện. Locator scope vào
	// lesson row (grid 1fr_auto) để không trúng nút Sửa của module header.
	const lessonRow = page
		.locator("div[class*='grid-cols-[1fr_auto']")
		.filter({ hasText: "Buổi thường" });
	await lessonRow.getByRole("button", { name: "Sửa", exact: true }).click();
	const editDialog = page.getByRole("dialog");
	await editDialog
		.getByLabel("Loại buổi học")
		.selectOption({ label: "Thi giữa kỳ" });
	await editDialog.getByRole("button", { name: "Lưu thay đổi" }).click();
	await expect(editDialog).toBeHidden();
	await expect(page.getByText("Thi giữa kỳ", { exact: true })).toBeVisible();
	await expect(page.locator('[data-testid="test-session-row"]')).toHaveCount(1);
	// Chống false-positive: class attribute khớp substring chưa đủ — computed
	// style phải là màu thật (biome từng gộp mất space giữa 2 class trong
	// className template, token dính nhưng CSS không áp dụng).
	const tinted = page.locator('[data-testid="test-session-row"]').first();
	const tintBg = await tinted.evaluate(
		(el) => getComputedStyle(el).backgroundColor,
	);
	expect(tintBg).not.toBe("rgba(0, 0, 0, 0)");
	expect(tintBg).not.toBe("transparent");

	// Đổi thành "Thi cuối kỳ" → nhãn cập nhật.
	await lessonRow.getByRole("button", { name: "Sửa", exact: true }).click();
	const editDialog2 = page.getByRole("dialog");
	await editDialog2
		.getByLabel("Loại buổi học")
		.selectOption({ label: "Thi cuối kỳ" });
	await editDialog2.getByRole("button", { name: "Lưu thay đổi" }).click();
	await expect(editDialog2).toBeHidden();
	await expect(page.getByText("Thi cuối kỳ", { exact: true })).toBeVisible();
	await expect(page.getByText("Thi giữa kỳ")).toHaveCount(0);
	await expect(page.locator('[data-testid="test-session-row"]')).toHaveCount(1);
});

test("import v4 qua ghi đè ở detail: preview badge, sau ghi đè highlight hiện", async ({
	page,
}) => {
	await signUpViaUi(page);
	await createSyllabusTemplate(page, "E2E Buổi Thi Overwrite");

	// Thêm cây thủ công rồi ghi đè bằng file v4.
	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog = page.getByRole("dialog");
	await moduleDialog
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module thủ công");
	await moduleDialog.getByRole("button", { name: "Thêm module" }).click();
	await expect(page.getByText("Module thủ công")).toBeVisible();

	await page.getByRole("button", { name: "Nhập từ Excel/CSV" }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.v4.csv",
	);
	await expect(page.getByText("2 module · 5 buổi học")).toBeVisible();
	await expect(page.getByRole("cell", { name: "Thi giữa kỳ" })).toBeVisible();
	await page.getByRole("button", { name: "Ghi đè nội dung" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Ghi đè", exact: true })
		.click();
	await expect(page.getByText("Đã ghi đè nội dung giáo trình.")).toBeVisible();
	await expect(page.getByText("Module thủ công")).toBeHidden();
	await expect(page.getByText("Thi giữa kỳ", { exact: true })).toBeVisible();
	await expect(page.getByText("Thi cuối kỳ", { exact: true })).toBeVisible();
	await expect(page.locator('[data-testid="test-session-row"]')).toHaveCount(2);
});

test("màn hình lớp không có select Loại; sửa buổi thi từ lớp giữ nguyên kind (guard #154)", async ({
	page,
}) => {
	await signUpViaUi(page);
	const templateId = await createSyllabusTemplate(page, "E2E Buổi Thi Guard");
	// Template có 1 buổi thi: import v4 (Buổi 3 = Thi giữa kỳ).
	await page.getByRole("button", { name: "Nhập từ Excel/CSV" }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.v4.csv",
	);
	await expect(page.getByText("2 module · 5 buổi học")).toBeVisible();
	await page.getByRole("button", { name: "Ghi đè nội dung" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Ghi đè", exact: true })
		.click();
	await expect(page.getByText("Đã ghi đè nội dung giáo trình.")).toBeVisible();

	// Tạo lớp chọn template này → server deep-copy thành bản copy của lớp.
	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog
		.getByPlaceholder("VD: IELTS Writing 7.0 — Nhóm tối")
		.fill("Lớp Buổi Thi Guard");
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog
		.getByLabel("Template giáo trình")
		.selectOption({ value: templateId });
	await expect(classDialog.getByText("Kỹ năng giáo trình")).toBeVisible();
	// Auto-fill số buổi (#235): template v4 có 5 buổi (2 buổi thi Buổi 3
	// giữa kỳ + Buổi 5 cuối kỳ) → "Tổng số buổi" tự điền "5", tính cả buổi thi.
	await expect(classDialog.getByLabel("Tổng số buổi")).toHaveValue("5");
	// View-only (#236): cả hai mục đã base theo syllabus → khóa.
	await expect(
		classDialog.getByRole("button", { name: "Writing", exact: true }),
	).toBeDisabled();
	await expect(classDialog.getByLabel("Tổng số buổi")).toBeDisabled();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	const kernelPromise = page.waitForResponse((response) =>
		response.url().includes("/api/kernel"),
	);
	await classDialog.getByRole("button", { name: "Tạo lớp" }).click();
	await expect(classDialog).toBeHidden();
	const kernelResponse = await kernelPromise;
	const snapshot = (await kernelResponse.json()) as {
		syllabi: Array<{ id: string; classId: string | null; name: string }>;
	};
	const copy = snapshot.syllabi.find(
		(row) => row.classId !== null && row.name === "E2E Buổi Thi Guard",
	);
	if (!copy) throw new Error("Kernel snapshot thiếu bản copy của template");

	// Màn hình Chi tiết lớp: tab "Buổi học" chứa curriculum section. Mở Sửa
	// buổi thi (Buổi 3) → KHÔNG có select "Loại buổi học"; đổi title rồi lưu.
	// Locator scope lesson row (grid 20px_1fr_auto) của curriculum section.
	await page.goto(`/classes/${copy.classId}`);
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
	// #221: the curriculum tree moved into the "Quản lý buổi" modal.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const examRow = page
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi 3" });
	await examRow.getByRole("button", { name: "Sửa", exact: true }).click();
	// Scope theo aria-label: modal "Quản lý buổi của lớp" (#221) vẫn mở bên
	// dưới dialog "Sửa buổi học" → getByRole("dialog") trúng 2 elements.
	const editDialog = page.getByRole("dialog", { name: "Sửa buổi học" });
	await expect(editDialog.getByLabel("Loại buổi học")).toHaveCount(0);
	await editDialog.getByRole("textbox").first().fill("Buổi 3 — giữa kỳ đã đổi");
	await editDialog.getByRole("button", { name: "Lưu thay đổi" }).click();
	await expect(editDialog).toBeHidden();

	// Bản copy ở màn hình syllabus: badge vẫn còn — kind KHÔNG bị reset.
	// (Không exact:true — title div chứa thêm text badge.) Copy v4 có 2 buổi
	// thi (Buổi 3 giữa kỳ + Buổi 5 cuối kỳ) → 2 dòng tint.
	await page.goto(`/syllabus/${copy.id}`);
	await expect(page.getByText("Buổi 3 — giữa kỳ đã đổi")).toBeVisible();
	await expect(page.getByText("Thi giữa kỳ", { exact: true })).toBeVisible();
	await expect(page.locator('[data-testid="test-session-row"]')).toHaveCount(2);
});
