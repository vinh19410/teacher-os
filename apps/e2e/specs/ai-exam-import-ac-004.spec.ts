import { expect, test } from "@playwright/test";
import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
} from "../../../packages/api/src/contracts";
import { buildExamPdf } from "../../server/src/lib/exam-import/make-pdf";
import { signUpViaApi } from "./helpers";

/**
 * AC-004 nhập đề bằng AI (TOS-27 #473):
 * - Scenario 1: lần lượt chọn 3 tệp sai (PDF 21 trang, PDF có mật khẩu, tệp > 15 MB)
 *   → chặn ngay ở dropzone với thông điệp E-003 kèm lý do cụ thể, số dư ví giữ
 *   nguyên 30 Cr, không gửi bất kỳ request `POST /api/exam-imports` nào.
 * - Scenario 2: upload `ai-fail.pdf` (PDF hợp lệ, `fakeExamExtractor` ném lỗi khi
 *   tên chứa `ai-fail`) → server hoàn trả đủ 5 Credit, UI hiện E-004 + nút
 *   "Thử bóc tách lại AI", số dư ví giữ nguyên 30 Cr cả trước và sau reload.
 */
test("AC-004 scenario 1: chặn tệp 21 trang, có mật khẩu và > 15 MB ngay tại dropzone (E-003), không gọi POST", async ({
	page,
}) => {
	await signUpViaApi(page);

	let postImportCalls = 0;
	page.on("request", (req) => {
		if (
			req.method() === "POST" &&
			new URL(req.url()).pathname === "/api/exam-imports"
		) {
			postImportCalls += 1;
		}
	});

	await page.goto("/assignments/tests/import");
	const badge = page.getByTestId("credit-cost-badge");
	await expect(badge).toContainText("Ví: 30 Cr");

	const input = page.getByTestId("exam-import-file-input");
	const errorAlert = page.getByTestId("exam-import-file-error");

	// 1) PDF 21 trang (> 20 trang).
	await input.setInputFiles({
		name: "de-21-trang.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(buildExamPdf(21)),
	});
	await expect(errorAlert).toBeVisible();
	await expect(errorAlert).toContainText(
		EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE],
	);
	await expect(errorAlert).toContainText(
		"PDF 21 trang vượt giới hạn 20 trang.",
	);
	await expect(badge).toContainText("Ví: 30 Cr");

	// 2) PDF có mật khẩu (fixture nhỏ).
	await input.setInputFiles("fixtures/exam-import/protected.pdf");
	await expect(errorAlert).toBeVisible();
	await expect(errorAlert).toContainText(
		EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE],
	);
	await expect(errorAlert).toContainText("Tệp PDF có mật khẩu");
	await expect(badge).toContainText("Ví: 30 Cr");

	// 3) Tệp > 15 MB (16 MB sinh trong bộ nhớ lúc chạy test).
	await input.setInputFiles({
		name: "oversize-16mb.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.alloc(16 * 1024 * 1024, 0x25),
	});
	await expect(errorAlert).toBeVisible();
	await expect(errorAlert).toContainText(
		EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE],
	);
	await expect(errorAlert).toContainText("Tệp 16,0 MB vượt giới hạn 15 MB.");
	await expect(badge).toContainText("Ví: 30 Cr");

	expect(postImportCalls).toBe(0);
});

test("AC-004 scenario 2: AI lỗi khi bóc tách → hoàn đủ 5 Credit, hiện E-004 + nút Thử bóc tách lại AI, ví không đổi sau reload", async ({
	page,
}) => {
	await signUpViaApi(page);

	await page.goto("/assignments/tests/import");
	const badge = page.getByTestId("credit-cost-badge");
	await expect(badge).toContainText("Ví: 30 Cr");

	// Upload PDF 2 trang hợp lệ có tên chứa `ai-fail` → server giữ 5 Cr rồi
	// tự động hoàn trả 5 Cr khi extractor ném lỗi.
	await page.getByTestId("exam-import-file-input").setInputFiles({
		name: "ai-fail.pdf",
		mimeType: "application/pdf",
		buffer: Buffer.from(buildExamPdf(2)),
	});

	const panel = page.getByTestId("exam-import-failed-panel");
	await expect(panel).toBeVisible();
	await expect(panel).toContainText(
		EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.EXAM_FAILED],
	);
	const retryBtn = page.getByTestId("exam-import-retry");
	await expect(retryBtn).toHaveText("Thử bóc tách lại AI");
	await expect(badge).toContainText("Ví: 30 Cr");

	// Kiểm 3 viewport (1440×900, 768×1024, 375×812) + keyboard focus trên nút thử lại.
	for (const vp of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await page.setViewportSize(vp);
		await expect(panel).toBeVisible();
		await expect(retryBtn).toBeVisible();
	}
	await retryBtn.focus();
	await expect(retryBtn).toBeFocused();

	// Reload trang — số dư ví vẫn giữ nguyên 30 Cr.
	await page.reload();
	await expect(page.getByTestId("credit-cost-badge")).toContainText(
		"Ví: 30 Cr",
	);
});
