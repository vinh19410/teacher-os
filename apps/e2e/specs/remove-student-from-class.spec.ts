import { expect, test } from "@playwright/test";
import { isoInDaysFromTodayVN, seedStudent, signUpViaApi } from "./helpers";

const STUDENT_NAME = "HV Rời Lớp E2E";
const CLASS_NAME = "E2E Lớp Xóa Học Viên";

test("giáo viên xóa học viên active còn nợ học phí khỏi lớp, giữ công nợ, xem 'Đã rời lớp' và thêm lại được", async ({
	page,
}) => {
	const teacherEmail = await signUpViaApi(page);
	const student = await seedStudent({ teacherEmail, name: STUDENT_NAME });

	// 1. Tạo lớp theo lịch (T2+T4)
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 2. Mở chi tiết lớp → tab Học viên → thêm & kích hoạt học viên
	await page.getByText(CLASS_NAME, { exact: true }).click();
	await expect(page).toHaveURL(/\/teacher\/classes\/[^/]+$/);
	const classUrl = page.url();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();

	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const activateModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(activateModal).toBeVisible();
	await activateModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(activateModal).toBeHidden();
	await expect(page.getByText("Đang học")).toBeVisible();

	// 3. Tạo hóa đơn chưa thu 1.500.000đ trên /teacher/tuition
	await page.goto("/teacher/tuition");
	await page.getByRole("button", { name: "+ Tạo hóa đơn" }).click();
	const invoiceDialog = page.getByRole("dialog");
	await expect(
		invoiceDialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	await expect(invoiceDialog.getByLabel("Học viên *")).toContainText(
		STUDENT_NAME,
	);
	await invoiceDialog.getByLabel("Số tiền (VND) *").fill("1500000");
	await invoiceDialog
		.getByLabel("Ngày đến hạn *")
		.fill(isoInDaysFromTodayVN(30));
	await invoiceDialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(invoiceDialog).toBeHidden();

	// 4. Quay lại tab Học viên → bấm "Xóa khỏi lớp" (không điều hướng nhầm sang trang HV)
	await page.goto(classUrl);
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	const rosterRow = page.locator("tbody tr").filter({ hasText: STUDENT_NAME });
	await expect(rosterRow).toBeVisible();
	await expect(rosterRow.getByText("còn 1.500.000đ")).toBeVisible();
	const removeBtn = rosterRow.getByRole("button", { name: "Xóa khỏi lớp" });
	await expect(removeBtn).toBeVisible();
	await removeBtn.click();
	expect(page.url()).toContain("/teacher/classes/");

	// Modal xác nhận hiển thị cảnh báo học phí chưa thu
	const removeModal = page.getByRole("dialog", {
		name: "Xóa học viên khỏi lớp?",
	});
	await expect(removeModal).toBeVisible();
	await expect(removeModal).toContainText("1.500.000đ");
	await expect(removeModal).toContainText("Sổ công nợ");

	// 5. Xác nhận xóa → toast + dòng biến mất khỏi roster + giữ nguyên sau reload
	await removeModal.getByRole("button", { name: "Xóa khỏi lớp" }).click();
	await expect(removeModal).toBeHidden();
	await expect(
		page
			.locator("[data-sonner-toast]")
			.filter({ hasText: "Đã xóa học viên khỏi lớp." }),
	).toBeVisible();
	await expect(rosterRow).toHaveCount(0);

	await page.reload();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await expect(page.getByText("Chưa có học viên nào trong lớp.")).toBeVisible();

	// 6. Trang chi tiết học viên: không có nút "Xóa khỏi lớp", tab Học phí hiện "Đã rời lớp" & 1.500.000đ
	await page.goto(`/teacher/students/${student.id}`);
	await expect(page.getByRole("button", { name: "Xóa khỏi lớp" })).toHaveCount(
		0,
	);
	await page.getByRole("tab", { name: "Học phí", exact: true }).click();
	const tuitionRow = page.locator("tbody tr", { hasText: CLASS_NAME }).first();
	await expect(tuitionRow).toBeVisible();
	await expect(tuitionRow.getByText("Đã rời lớp")).toBeVisible();
	await expect(tuitionRow.getByText("1.500.000đ")).toBeVisible();

	// 7. Sổ công nợ (/teacher/debts) vẫn giữ nguyên khoản nợ 1.500.000đ
	await page.goto("/teacher/debts");
	const debtRow = page.locator("tbody tr").filter({ hasText: STUDENT_NAME });
	await expect(debtRow).toBeVisible();
	await expect(debtRow).toContainText("1.500.000đ");

	// 8. Quay lại lớp học → thêm lại & kích hoạt lại chính học viên đó
	await page.goto(classUrl);
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const reEnrollDialog = page.getByRole("dialog");
	const reOption = reEnrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(reOption).toBeVisible();
	await reOption.click();
	await reEnrollDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(reEnrollDialog).toBeHidden();

	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const reActivateModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(reActivateModal).toBeVisible();
	await reActivateModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(reActivateModal).toBeHidden();
	await expect(
		page.locator("tbody tr", { hasText: STUDENT_NAME }).getByText("Đang học"),
	).toBeVisible();
});
