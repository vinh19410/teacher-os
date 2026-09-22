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

test("ghi đè sau xác nhận thay cây, hủy giữ nguyên dữ liệu hiện tại", async ({
	page,
}) => {
	await signUpViaUi(page);
	await createSyllabusTemplate(page, "E2E Overwrite Detail");

	// Cây thủ công ban đầu: 1 module không buổi học.
	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog = page.getByRole("dialog");
	await moduleDialog
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module thủ công");
	await moduleDialog.getByRole("button", { name: "Thêm module" }).click();
	await expect(page.getByText("Module thủ công")).toBeVisible();

	// Import file mẫu 4 cột → preview.
	await page.getByRole("button", { name: "Nhập từ Excel/CSV" }).click();
	await page.setInputFiles(
		"input[type=file]",
		"fixtures/syllabus-import.sample.csv",
	);
	await expect(page.getByText("2 module · 3 buổi học")).toBeVisible();

	// Mở modal cảnh báo ghi đè (refresh snapshot trước khi mở — flow thật).
	await page.getByRole("button", { name: "Ghi đè nội dung" }).click();
	const confirmDialog = page.getByRole("dialog");
	await expect(
		confirmDialog.getByText("Ghi đè nội dung giáo trình?"),
	).toBeVisible();
	// Scope trong dialog; pin số liệu CÂY HIỆN TẠI (1 module · 0 buổi) để
	// phân biệt với "1 module · 3 buổi học từ file" cùng câu.
	await expect(confirmDialog.getByText(/sẽ bị XÓA/)).toBeVisible();
	await expect(
		confirmDialog.getByText(/1 module · 0 buổi học — sẽ bị XÓA/),
	).toBeVisible();

	// Hủy → không đổi gì.
	await confirmDialog.getByRole("button", { name: "Hủy" }).click();
	await expect(confirmDialog).toBeHidden();
	await expect(page.getByText("Module thủ công")).toBeVisible();

	// Xác nhận ghi đè → thay cây.
	await page.getByRole("button", { name: "Ghi đè nội dung" }).click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: "Ghi đè", exact: true })
		.click();
	await expect(page.getByText("Đã ghi đè nội dung giáo trình.")).toBeVisible();
	await expect(page.getByText("Module thủ công")).toBeHidden();
	await expect(page.getByText("Module 1 — Nền tảng")).toBeVisible();
	await expect(page.getByText("Buổi 1", { exact: true })).toBeVisible();
	// Khóa statement UPDATE totalLessons qua UI — locator scope vào StatCard
	// (cha của label) để không đụng "3" ở nơi khác trên trang.
	const totalCard = page
		.getByText("tổng buổi", { exact: true })
		.locator("xpath=..");
	await expect(totalCard.getByText("3", { exact: true })).toBeVisible();
});

test("bản copy của lớp không có nút import ghi đè (chỉ template)", async ({
	page,
}) => {
	await signUpViaUi(page);
	const templateId = await createSyllabusTemplate(
		page,
		"E2E Template Copy Guard",
	);
	// Template: nút import PHẢI hiện.
	await expect(
		page.getByRole("button", { name: "Nhập từ Excel/CSV" }),
	).toBeVisible();

	// Tạo lớp chọn template này → server deep-copy thành bản copy của lớp.
	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog
		.getByPlaceholder("VD: IELTS Writing 7.0 — Nhóm tối")
		.fill("Lớp Copy Guard");
	// Scope vào dialog: kỹ năng là bắt buộc với lớp IELTS.
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog
		.getByLabel("Template giáo trình")
		.selectOption({ value: templateId });
	await expect(classDialog.getByText("Kỹ năng giáo trình")).toBeVisible();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	// Kernel GET sau write là snapshot đầu tiên chứa bản copy — đăng ký chờ
	// TRƯỚC khi submit để không lỡ response.
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
		(row) => row.classId !== null && row.name === "E2E Template Copy Guard",
	);
	if (!copy) {
		throw new Error(
			"Kernel snapshot thiếu bản copy 'E2E Template Copy Guard' — tạo lớp với template thất bại?",
		);
	}

	// Bản copy: KHÔNG có nút import, header đánh dấu "Bản sao của một lớp".
	await page.goto(`/syllabus/${copy.id}`);
	await expect(
		page.getByRole("button", { name: "Nhập từ Excel/CSV" }),
	).toBeHidden();
	await expect(page.getByText("Bản sao của một lớp")).toBeVisible();
});
