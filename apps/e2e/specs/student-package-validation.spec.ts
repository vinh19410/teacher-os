import { expect, type Page, type Request, test } from "@playwright/test";
import { createStudentViaUi, signUpViaUi } from "./helpers";

/**
 * E2E scenarios for student creation form:
 * - Phone digits-only + Email required + No package fields on create form (D2/D3)
 * - Enroll existing student preserves package fields and blocks total 0 (D4)
 * - Create student in class derives package from class (D1)
 */

/** Observe-only request counter (no mocking): POSTs hitting `needle` while
 * `action` runs. Registered BEFORE the action so nothing slips past. */
async function countPosts(
	page: Page,
	needle: string,
	action: () => Promise<void>,
): Promise<number> {
	let posts = 0;
	const onRequest = (request: Request) => {
		if (request.method() === "POST" && request.url().includes(needle)) {
			posts += 1;
		}
	};
	page.on("request", onRequest);
	try {
		await action();
	} finally {
		page.off("request", onRequest);
	}
	return posts;
}

/** The <span> holding a per-field error: a sibling of the labeled input. */
function fieldError(page: Page, label: string) {
	return page.getByRole("dialog").getByLabel(label).locator("xpath=..");
}

test("students → form tạo không có input gói, SĐT chỉ số + email bắt buộc (D2/D3)", async ({
	page,
}) => {
	const STUDENT_NAME = "QC-240 Form Tao";

	await signUpViaUi(page);

	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Thêm học viên mới")).toBeVisible();

	// 1. Form create KHÔNG còn 3 input gói
	await expect(dialog.getByLabel("Số buổi gói")).toHaveCount(0);
	await expect(dialog.getByLabel("Đơn giá (VND)")).toHaveCount(0);
	await expect(dialog.getByLabel("Hình thức")).toHaveCount(0);

	await dialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	const phoneInput = dialog.getByLabel("SĐT *");
	const emailInput = dialog.getByLabel("Email *");
	const save = dialog.getByRole("button", { name: "Lưu", exact: true });

	// 2. SĐT strip ký tự không phải số ngay khi gõ
	await phoneInput.fill("09ab 12+");
	expect(await phoneInput.inputValue()).toBe("0912");

	// 3. SĐT rỗng bị chặn
	await phoneInput.fill("");
	const blockedEmptyPhone = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "SĐT *").getByText("SĐT chỉ gồm chữ số"),
	).toBeVisible();
	expect(blockedEmptyPhone).toBe(0);

	// 4. SĐT hợp lệ nhưng email sai format bị chặn
	await phoneInput.fill("0901234567");
	await emailInput.fill("not-an-email");
	const blockedBadEmail = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "Email *").getByText("Email không hợp lệ."),
	).toBeVisible();
	expect(blockedBadEmail).toBe(0);

	// 5. Email rỗng bị chặn
	await emailInput.fill("");
	const blockedEmptyEmail = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "Email *").getByText("Vui lòng nhập email."),
	).toBeVisible();
	expect(blockedEmptyEmail).toBe(0);

	// 6. Nhập đủ hợp lệ -> Lưu thành công, dialog đóng, row hiện "Chưa có lớp"
	await emailInput.fill("hocvien@example.com");
	const saved = await countPosts(page, "/api/students", () => save.click());
	await expect(dialog).toBeHidden();
	expect(saved).toBe(1);

	const row = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(row).toBeVisible();
	await expect(row.getByText("Chưa có lớp")).toBeVisible();
});

test("class detail → enroll học viên có sẵn KHÔNG còn 3 input gói, chọn học viên là enroll được (D4)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 240 Lớp enroll";
	const STUDENT_NAME = "QC-240 Enrollable";

	await signUpViaUi(page);

	// Tạo học viên trước bằng helper (D2: tạo ngoài lớp)
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await createStudentViaUi(page, STUDENT_NAME);

	// Tạo lớp học
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByText("Thêm học viên", { exact: true }),
	).toBeVisible();

	// Mode "Học viên có sẵn" KHÔNG còn 3 input gói (D4)
	await expect(dialog.getByLabel("Số buổi gói")).not.toBeVisible();
	await expect(dialog.getByLabel("Đơn giá (VND)")).not.toBeVisible();
	await expect(dialog.getByLabel("Hình thức")).not.toBeVisible();

	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();

	// Chọn học viên → click Lưu → enroll thành công, dialog đóng
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
});

test("tạo học viên trong lớp → derive gói từ lớp, detail hiển thị lớp học (D1)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 240 Lớp Derive";
	const STUDENT_NAME = "QC-240 Student Derive";

	await signUpViaUi(page);

	// Tạo lớp có Học phí = 500.000đ và 12 buổi
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByLabel("Học phí / học viên (VND)").fill("500000");
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// Vào lớp -> "+ Thêm học viên" -> tab "Tạo học viên mới"
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");

	// Khi chưa có học viên nào trong org, modal mở thẳng create form; nếu có tab thì click "Tạo học viên mới"
	const createTab = dialog.getByRole("button", { name: "Tạo học viên mới" });
	if (await createTab.isVisible()) {
		await createTab.click();
	}

	await dialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await dialog.getByLabel("SĐT *").fill("0908888999");
	await dialog.getByLabel("Email *").fill("derive@e2e.test");
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// Roster hiện học viên và kích hoạt
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();
	// List học viên: hàng hiển thị lớp đã enroll
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	const row = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(row.getByText(CLASS_NAME)).toBeVisible();

	// Vào detail học viên -> card "Lớp học" hiện lớp vừa tạo
	await row.getByText(STUDENT_NAME).click();
	await expect(page.getByText(CLASS_NAME)).toBeVisible();
	await expect(page.getByText("Email: derive@e2e.test")).toBeVisible();

	// Trang Học phí: derive gói từ lớp (12 buổi, trạng thái Đang học)
	await page.getByText("Học phí", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	const tuitionRow = page.getByRole("row").filter({ hasText: STUDENT_NAME });
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("0/12")).toBeVisible();
	await expect(tuitionRow.getByText("Đang học")).toBeVisible();
});
