import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * AC-003 nhập đề bằng AI (TOS-26 #472):
 * - Đề bóc tách có 1 câu gắn nhãn vàng "(!) Cần rà soát lại" (từ fakeExamExtractor).
 * - Giáo viên sửa đáp án câu gắn nhãn bằng tay (0 Credit), chưa tích hộp kiểm
 *   "Tôi đã kiểm tra và xác nhận các câu gắn nhãn Cần rà soát lại":
 *   + Nút "Lưu bản nháp" được phép bấm; reload giữ nguyên nội dung đã sửa và
 *     số dư ví giữ nguyên 25 Cr (0 Credit).
 *   + Nút "Lưu vào Ngân hàng đề" bị khóa (disabled).
 * - Tích hộp kiểm xác nhận → nút "Lưu vào Ngân hàng đề" mở khóa → bấm xuất bản
 *   → điều hướng tới `/assignments/tests/<id>` hiển thị bộ đề đã tạo và xuất
 *   hiện trong danh sách Ngân hàng đề `/assignments`.
 */
test("AC-003: chỉnh sửa tay 0 Credit, khóa xuất bản tới khi xác nhận câu Cần rà soát lại", async ({
	page,
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await signUpViaApi(page);

	await page.goto("/assignments/tests/import");
	const badge = page.getByTestId("credit-cost-badge");
	await expect(badge).toContainText("Ví: 30 Cr");

	// Upload PDF mẫu → fakeExtractor trả đề 3 câu (câu 3 có confidence 0.6 → needsReview=true).
	await page
		.getByTestId("exam-import-file-input")
		.setInputFiles("fixtures/exam-import/cambridge-sample.pdf");
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await expect(page.getByTestId("question-needs-review")).toHaveCount(1);
	await expect(badge).toContainText("Ví: 25 Cr");

	// Khi chưa tích hộp kiểm xác nhận: Lưu bản nháp bật, Lưu vào Ngân hàng đề bị khóa.
	const saveDraftBtn = page.getByTestId("save-draft-button");
	const publishBtn = page.getByTestId("publish-exam-button");
	await expect(saveDraftBtn).toBeEnabled();
	await expect(publishBtn).toBeDisabled();

	// Sửa tay đáp án và giải thích của câu 3 (câu gắn nhãn Cần rà soát lại).
	const answerInput = page.getByTestId("question-answer-2");
	const explanationInput = page.getByTestId("question-explanation-2");
	await answerInput.fill("infrastructure");
	await explanationInput.fill(
		"Đoạn 2 chứng minh hạ tầng thúc đẩy người đi xe đạp.",
	);

	// Sửa câu không tự xóa nhãn cảnh báo và chưa tích thì nút xuất bản vẫn khóa.
	await expect(page.getByTestId("question-needs-review")).toHaveCount(1);
	await expect(publishBtn).toBeDisabled();

	// Bấm Lưu bản nháp (0 Credit) → reload giữ nguyên nội dung đã sửa & ví nguyên 25 Cr.
	await saveDraftBtn.click();
	await expect(page.getByTestId("exam-import-status-notice")).toContainText(
		"Đã lưu bản nháp (0 Credit).",
	);

	await page.reload();
	await expect(page).toHaveURL(/\/assignments\/tests\/import\?job=/);
	await expect(page.getByTestId("credit-cost-badge")).toContainText(
		"Ví: 25 Cr",
	);
	await expect(page.getByTestId("question-answer-2")).toHaveValue(
		"infrastructure",
	);
	await expect(page.getByTestId("question-explanation-2")).toHaveValue(
		"Đoạn 2 chứng minh hạ tầng thúc đẩy người đi xe đạp.",
	);
	await expect(page.getByTestId("publish-exam-button")).toBeDisabled();

	// Chụp screenshot 3 viewport (1440×900, 768×1024, 375×812) theo quy ước UI.
	await page.screenshot({
		path: "../../plans/reports/tos-26-ac-003-desktop-1440x900.png",
		fullPage: true,
	});
	await page.setViewportSize({ width: 768, height: 1024 });
	await page.getByRole("tab", { name: "Câu hỏi bóc tách" }).click();
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await page.screenshot({
		path: "../../plans/reports/tos-26-ac-003-tablet-768x1024.png",
		fullPage: true,
	});
	await page.setViewportSize({ width: 375, height: 812 });
	await expect(page.getByTestId("extracted-exam-panel")).toBeVisible();
	await page.screenshot({
		path: "../../plans/reports/tos-26-ac-003-mobile-375x812.png",
		fullPage: true,
	});

	// Quay lại desktop 1440×900, focus bàn phím và tích xác nhận bằng phím Space.
	await page.setViewportSize({ width: 1440, height: 900 });
	const checkbox = page.getByTestId("review-confirmation-checkbox");
	await checkbox.focus();
	await expect(checkbox).toBeFocused();
	await page.keyboard.press("Space");
	await expect(checkbox).toBeChecked();

	// Sau khi tích xác nhận: nút "Lưu vào Ngân hàng đề" được mở khóa.
	await expect(page.getByTestId("publish-exam-button")).toBeEnabled();

	// Bấm xuất bản → điều hướng tới /assignments/tests/<id> hiển thị bộ đề.
	await page.getByTestId("publish-exam-button").click();
	await expect(page).toHaveURL(/\/assignments\/tests\/test-import-/);
	await expect(
		page.getByRole("heading", { name: "Cambridge IELTS Sample" }),
	).toBeVisible();
	await expect(page.getByText("Passage 1").first()).toBeVisible();

	// Mở Ngân hàng đề (/assignments) → thấy đề vừa xuất bản trong danh sách.
	await page.goto("/assignments");
	await expect(page.getByText("Cambridge IELTS Sample").first()).toBeVisible();
});
