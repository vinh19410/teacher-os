import { expect, test } from "@playwright/test";
import {
	fillRichEditor,
	isoInDaysFromTodayVN,
	selectWritingTask2,
	signUpViaApi,
} from "./helpers";

/**
 * Issue #508 — Hành trình giáo viên mới (0 tài khoản Student Portal):
 * Tạo lớp → Thêm học viên thủ công & kích hoạt Đang học ngay trong 1 bước →
 * Lập hóa đơn học phí → Giao bài tập lớp → Tạo, chấm và xóa bài nộp mẫu dùng thử trên /grading
 * kèm kiểm tra không tràn ngang ở 3 viewport (1440×900, 768×1024, 375×812).
 */
test("manual student creation + instant activation unlocks invoice & assignment, and /grading demo sample works end-to-end", async ({
	page,
}) => {
	test.setTimeout(90_000);

	const CLASS_NAME = "E2E 508 IELTS Writing";
	const STUDENT_NAME = "Trần Minh Khôi";
	const PROMPT_TITLE = "E2E 508 Writing Task 2 Ready";

	// 1. Đăng ký giáo viên mới (org hoàn toàn rỗng, 0 học viên)
	await signUpViaApi(page);

	// 2. Tạo 1 đề Writing trạng thái ready trong ngân hàng đề
	await page.goto("/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people think that university education should be free for everyone.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// 3. Tạo 1 lớp học mới tại /classes
	await page.goto("/classes");
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

	// 4. Mở chi tiết lớp → tab Học viên → + Thêm học viên vào lớp
	// Vì org chưa có học viên, modal tự mở ở chế độ "Tạo học viên mới" với "Kích hoạt trạng thái Đang học ngay" bật sẵn
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await expect(enrollDialog.getByLabel(/Họ tên học viên/)).toBeVisible();
	await expect(
		enrollDialog.getByLabel("Kích hoạt trạng thái Đang học ngay"),
	).toBeChecked();
	await enrollDialog.getByLabel(/Họ tên học viên/).fill(STUDENT_NAME);
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await expect(
		page
			.locator("[data-sonner-toast]")
			.filter({ hasText: `Đã thêm ${STUDENT_NAME} vào lớp` }),
	).toBeVisible();

	// 5. Xác nhận học viên xuất hiện ngay trong roster lớp với trạng thái "Đang học"
	await expect(
		page.locator("tbody tr", { hasText: STUDENT_NAME }),
	).toBeVisible();
	await expect(page.getByText("Đang học")).toBeVisible();

	// 6. Điều hướng tới /tuition → + Tạo hóa đơn (học viên đã được tự chọn nhờ enrollment active)
	await page.goto("/tuition");
	await page.getByTestId("create-invoice").click();
	const invoiceDialog = page.getByRole("dialog");
	await expect(invoiceDialog.getByLabel("Học viên *")).toContainText(
		STUDENT_NAME,
	);
	await invoiceDialog.getByLabel("Số tiền (VND) *").fill("3000000");
	await invoiceDialog
		.getByLabel("Ngày đến hạn *")
		.fill(isoInDaysFromTodayVN(30));
	await invoiceDialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(invoiceDialog).toBeHidden();
	await expect(page.getByTestId("tuition-invoices-section")).toContainText(
		STUDENT_NAME,
	);

	// 7. Quay lại lớp → tab Buổi học & luyện tập → Giao bài tập cho học viên vừa kích hoạt
	await page.goto("/classes");
	await page.getByText(CLASS_NAME).click();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao bài tập" }).first().click();
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await expect(page.getByText("Giao cho 1 học viên")).toBeVisible();
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
	await page.getByRole("button", { name: "Xem bài đã giao" }).click();
	await expect(page.getByText(PROMPT_TITLE)).toBeVisible();

	// 8. Điều hướng tới /grading → kiểm tra 3 viewport không tràn ngang → Tạo, chấm & xóa bài nộp mẫu
	await page.goto("/grading");
	await expect(page.getByTestId("grading-empty-state")).toBeVisible();

	for (const vp of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await page.setViewportSize(vp);
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflow, `Overflow at ${vp.width}x${vp.height}`).toBe(false);
	}
	await page.setViewportSize({ width: 1440, height: 900 });

	await page.getByTestId("create-demo-grading-sample").click();
	await expect(page.getByTestId("grading-queue-table")).toContainText(
		"Nguyễn Minh Anh (Học viên mẫu)",
	);

	await page
		.getByRole("link", { name: /Chấm bài của Nguyễn Minh Anh/ })
		.click();
	await page.getByRole("button", { name: "Chốt trả bài" }).click();
	await expect(page.getByTestId("grade-saved")).toBeVisible();

	await page.getByRole("link", { name: "← Về hàng chờ chấm" }).click();
	await page.getByTestId("delete-demo-grading-sample").click();
	await expect(page.getByTestId("grading-empty-state")).toBeVisible();
});
