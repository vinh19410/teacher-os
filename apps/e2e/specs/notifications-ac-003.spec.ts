import { mkdirSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	readVerificationEmails,
	seedStudent,
	signUpViaUi,
	type VerificationEmailEntry,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * AC-003 — plan TOS-23 (#464) phase 3:
 * Bản ghi đang Lỗi gửi (`failed`) trên màn [5] (/notifications):
 * 1. Nút "Gửi lại" chỉ hiện trên dòng `failed` (không hiện trên dòng `sent`/`read`);
 *    nút header "Gửi lại tất cả mục lỗi (N)" hiện khi `counts.failed > 0`.
 * 2. Bấm "Gửi lại" trên dòng `@bounce.test` → thử lại thêm đúng 3 lượt trong
 *    mail log, tổng số bản ghi của học viên vẫn là 1, và chuông thông báo In-app
 *    trên cổng học viên vẫn chỉ có đúng 1 mục (không nhân bản).
 * 3. Sau khi cập nhật `student.email` sang địa chỉ hợp lệ, bấm "Gửi lại tất cả
 *    mục lỗi (2)" và xác nhận trong Modal → cả 2 bản ghi lấy địa chỉ Email mới,
 *    gửi thành công (chuyển sang "Đã xem" nếu học viên đã đọc In-app trước đó,
 *    hoặc "Đã gửi"), chip "Lỗi gửi" về 0, nút header tự ẩn, và cổng học viên
 *    vẫn chỉ có đúng 1 thông báo In-app.
 * 4. Kiểm chứng UI ở 3 viewport (1440×900, 768×1024, 375×812) + điều hướng bàn phím.
 */
const PASSWORD = "password-8chars";
const CLASS_NAME = "E2E TOS-23 Lớp gửi lại thông báo";
const STUDENT_OK = "TOS-23 Học viên Hợp lệ";
const STUDENT_1 = "TOS-23 Học viên Lỗi Một";
const STUDENT_2 = "TOS-23 Học viên Lỗi Hai";
const screenshotsDir = new URL(
	"../../../plans/261027-0127-tos-23-notification-manual-resend/screenshots/",
	import.meta.url,
).pathname;

async function pollMail(
	predicate: (entries: VerificationEmailEntry[]) => boolean,
	retries = 40,
): Promise<VerificationEmailEntry[]> {
	for (let i = 0; i < retries; i++) {
		const entries = await readVerificationEmails();
		if (predicate(entries)) return entries;
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 250);
		await promise;
	}
	const entries = await readVerificationEmails();
	throw new Error(
		`mail log không đạt điều kiện sau ${retries} lần poll; hiện có: ${JSON.stringify(entries)}`,
	);
}

function mailsTo(entries: VerificationEmailEntry[], email: string) {
	return entries.filter(
		(e) => e.to.trim().toLowerCase() === email.trim().toLowerCase(),
	);
}

async function updateStudentEmailInDb(
	studentId: string,
	oldEmail: string,
	newEmail: string,
): Promise<void> {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	try {
		await client.execute("PRAGMA busy_timeout = 5000;");
		await client.execute({
			sql: "UPDATE student SET email = ? WHERE id = ?",
			args: [newEmail, studentId],
		});
		await client.execute({
			sql: "UPDATE user SET email = ? WHERE lower(email) = lower(?)",
			args: [newEmail, oldEmail],
		});
	} finally {
		client.close();
	}
}

async function setupClassAndEnrollStudents(
	page: Page,
	studentNames: string[],
): Promise<void> {
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

	await page.getByText(CLASS_NAME).click();
	await expect(page).toHaveURL(/\/classes\/[a-zA-Z0-9_-]+$/);

	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	for (const studentName of studentNames) {
		await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
		const enrollDialog = page.getByRole("dialog");
		const option = enrollDialog.getByRole("option", { name: studentName });
		await expect(option).toBeVisible();
		await option.click();
		await enrollDialog
			.getByRole("button", { name: "Lưu", exact: true })
			.click();
		await expect(enrollDialog).toBeHidden();

		const row = page.locator("tbody tr").filter({ hasText: studentName });
		await row.getByRole("button", { name: "Kích hoạt" }).click();
		const confirmModal = page
			.getByRole("dialog")
			.filter({ hasText: "Kích hoạt học viên?" });
		await expect(confirmModal).toBeVisible();
		await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
		await expect(confirmModal).toBeHidden();
		await expect(row.getByText("Đang học")).toBeVisible();
	}
}

test("AC-003 nút Gửi lại và Gửi lại tất cả mục lỗi đặt lại bản ghi về queued, lấy lại Email mới và không nhân bản thông báo In-app", async ({
	browser,
}) => {
	const teacherContext = await browser.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const teacher = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacher);
	const ts = Date.now();
	const okEmail = `tos23.ok.${ts}@test.local`;
	const bounceEmail1 = `tos23.one.${ts}@bounce.test`;
	const bounceEmail2 = `tos23.two.${ts}@bounce.test`;
	const fixedEmail1 = `tos23.one.fixed.${ts}@test.local`;
	const fixedEmail2 = `tos23.two.fixed.${ts}@test.local`;

	await seedStudent({
		teacherEmail,
		name: STUDENT_OK,
		email: okEmail,
		onboarded: true,
	});
	const st1 = await seedStudent({
		teacherEmail,
		name: STUDENT_1,
		email: bounceEmail1,
		onboarded: true,
	});
	const st2 = await seedStudent({
		teacherEmail,
		name: STUDENT_2,
		email: bounceEmail2,
		onboarded: true,
	});

	// --- Bước 1: tạo lớp và ghi danh + kích hoạt 3 học viên (1 thành công, 2 lỗi @bounce.test) ---
	await setupClassAndEnrollStudents(teacher, [
		STUDENT_OK,
		STUDENT_1,
		STUDENT_2,
	]);

	await pollMail(
		(all) =>
			mailsTo(all, okEmail).length >= 1 &&
			mailsTo(all, bounceEmail1).filter((e) => e.failed === true).length >= 3 &&
			mailsTo(all, bounceEmail2).filter((e) => e.failed === true).length >= 3,
	);

	await expect
		.poll(
			async () => {
				const res = await teacher.request.get(
					`${API_ORIGIN}/api/notification-logs?status=failed`,
					{ headers: { Origin: WEB_ORIGIN } },
				);
				if (res.status() !== 200) return 0;
				const body = (await res.json()) as { total?: number };
				return body.total ?? 0;
			},
			{ timeout: 10_000 },
		)
		.toBe(2);

	// --- Bước 2: kiểm tra màn [5] (/notifications), ẩn/hiện nút Gửi lại, 3 viewport ---
	await teacher.goto("/notifications");
	await expect(
		teacher.getByRole("heading", { name: /Nhật ký gửi thông báo/ }),
	).toBeVisible();

	const bulkHeaderBtn = teacher.getByRole("button", {
		name: "Gửi lại tất cả mục lỗi (2)",
	});
	await expect(bulkHeaderBtn).toBeVisible();

	// Dòng sent của STUDENT_OK không có nút Gửi lại
	const okRow = teacher
		.locator("table tbody tr")
		.filter({ hasText: STUDENT_OK });
	await expect(okRow).toHaveCount(1);
	await expect(okRow.getByText("Đã gửi")).toBeVisible();
	await expect(
		okRow.getByRole("button", { name: /Gửi lại thông báo/ }),
	).toHaveCount(0);

	// Lọc sang ?status=failed
	const failedChip = teacher
		.getByRole("group", { name: "Trạng thái" })
		.getByRole("button", { name: /^Lỗi gửi/ });
	await expect(failedChip).toContainText("2");
	await failedChip.click();
	await expect(teacher).toHaveURL(/status=failed/);

	const row1 = teacher.locator("table tbody tr").filter({ hasText: STUDENT_1 });
	const row2 = teacher.locator("table tbody tr").filter({ hasText: STUDENT_2 });
	await expect(row1).toHaveCount(1);
	await expect(row2).toHaveCount(1);

	const resendBtn1 = row1.getByRole("button", {
		name: `Gửi lại thông báo cho ${STUDENT_1}`,
	});
	const resendBtn2 = row2.getByRole("button", {
		name: `Gửi lại thông báo cho ${STUDENT_2}`,
	});
	await expect(resendBtn1).toBeVisible();
	await expect(resendBtn2).toBeVisible();

	mkdirSync(screenshotsDir, { recursive: true });
	for (const vp of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await teacher.setViewportSize(vp);
		await expect(resendBtn1).toBeVisible();
		await expect(bulkHeaderBtn).toBeVisible();
		const docOverflow = await teacher.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(docOverflow, `không tràn ngang trang ở ${vp.width}px`).toBe(false);
		await teacher.screenshot({
			path: `${screenshotsDir}tos23-failed-resend-${vp.width}.png`,
			fullPage: true,
		});
	}
	await teacher.setViewportSize({ width: 1440, height: 900 });

	// --- Bước 3: bấm "Gửi lại" bằng bàn phím trên STUDENT_1 khi email vẫn lỗi → thử lại 3 lượt, không nhân bản In-app ---
	await resendBtn1.focus();
	await expect(resendBtn1).toBeFocused();
	await teacher.keyboard.press("Enter");

	await expect(
		teacher.getByText("Đã đưa 1 thông báo về hàng đợi để gửi lại."),
	).toBeVisible();

	const afterSingleResendMails = await pollMail(
		(all) =>
			mailsTo(all, bounceEmail1).filter((e) => e.failed === true).length >= 6,
	);
	expect(
		mailsTo(afterSingleResendMails, bounceEmail1).filter(
			(e) => e.failed === true,
		),
	).toHaveLength(6);
	expect(
		mailsTo(afterSingleResendMails, bounceEmail2).filter(
			(e) => e.failed === true,
		),
	).toHaveLength(3);

	// Kiểm tra cổng học viên của STUDENT_1: vẫn chỉ có đúng 1 mục In-app, mở đọc đặt read_at
	const studentContext = await browser.newContext();
	const student = await studentContext.newPage();
	await student.goto(`${STUDENT_ORIGIN}/login`);
	await student.locator("#tab-signup").click();
	await student.locator("#signup-name").fill(STUDENT_1);
	await student.locator("#signup-email").fill(bounceEmail1);
	await student.locator("#signup-password").fill(PASSWORD);
	await student.locator("#panel-signup button[type='submit']").click();
	await expect(student.getByText("Email chưa được xác thực")).toBeVisible();
	await verifyStudentEmailFromMailLog(student, bounceEmail1);
	await expect(student).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));

	await expect(student.getByTestId("notification-badge")).toBeVisible();
	await student
		.getByRole("button", { name: /mục chưa xử lý|^Thông báo$/ })
		.click();
	const inviteItemsBeforeBulk = student
		.getByTestId("inbox-item")
		.filter({ hasText: CLASS_NAME });
	await expect(inviteItemsBeforeBulk).toHaveCount(1);
	await inviteItemsBeforeBulk.click();

	// --- Bước 4: cập nhật Email học viên 1 & 2 sang địa chỉ hợp lệ rồi bấm "Gửi lại tất cả mục lỗi (2)" ---
	await updateStudentEmailInDb(st1.id, bounceEmail1, fixedEmail1);
	await updateStudentEmailInDb(st2.id, bounceEmail2, fixedEmail2);

	await bulkHeaderBtn.focus();
	await expect(bulkHeaderBtn).toBeFocused();
	await teacher.keyboard.press("Enter");

	const confirmDialog = teacher
		.getByRole("dialog")
		.filter({ hasText: "Gửi lại tất cả thông báo lỗi?" });
	await expect(confirmDialog).toBeVisible();
	await expect(
		confirmDialog.getByText(
			"Đưa 2 thông báo lỗi trong bộ lọc hiện tại về hàng đợi để gửi lại Email. Thông báo In-app trên cổng học viên không bị gửi trùng.",
		),
	).toBeVisible();

	// Kiểm tra đóng bằng phím Escape rồi mở lại xác nhận bằng bàn phím
	await teacher.keyboard.press("Escape");
	await expect(confirmDialog).toBeHidden();

	await bulkHeaderBtn.focus();
	await teacher.keyboard.press("Enter");
	await expect(confirmDialog).toBeVisible();

	const confirmBtn = confirmDialog.getByRole("button", {
		name: "Xác nhận gửi lại",
	});
	await confirmBtn.focus();
	await expect(confirmBtn).toBeFocused();
	await teacher.keyboard.press("Enter");

	await expect(confirmDialog).toBeHidden();
	await expect(
		teacher.getByText("Đã đưa 2 thông báo về hàng đợi để gửi lại."),
	).toBeVisible();

	// Chờ thư gửi thành công tới cả 2 địa chỉ email mới
	await pollMail(
		(all) =>
			mailsTo(all, fixedEmail1).length >= 1 &&
			mailsTo(all, fixedEmail2).length >= 1,
	);

	// Trên ?status=failed: thanh ChipFilter vẫn giữ nguyên, chip "Lỗi gửi" = 0, nút header tự ẩn
	await expect(
		teacher.getByRole("button", { name: /Gửi lại tất cả mục lỗi/ }),
	).toBeHidden();
	await expect(failedChip).toContainText("0");
	await expect(
		teacher.getByText("Không có thông báo nào phù hợp với bộ lọc."),
	).toBeVisible();

	// Chuyển về chip "Tất cả": tổng đúng 3 dòng, địa chỉ email mới đã cập nhật,
	// STUDENT_1 là "Đã xem" (bảo toàn read_at), STUDENT_2 là "Đã gửi", không dòng nào còn nút "Gửi lại"
	await teacher
		.getByRole("group", { name: "Trạng thái" })
		.getByRole("button", { name: /^Tất cả/ })
		.click();
	await expect(teacher).not.toHaveURL(/status=failed/);

	await expect(teacher.locator("table tbody tr")).toHaveCount(3);
	await expect(row1.getByText(fixedEmail1)).toBeVisible();
	await expect(row1.getByText("Đã xem")).toBeVisible();
	await expect(row2.getByText(fixedEmail2)).toBeVisible();
	await expect(row2.getByText("Đã gửi")).toBeVisible();
	await expect(
		teacher.getByRole("button", { name: /Gửi lại thông báo/ }),
	).toHaveCount(0);

	// Cổng học viên của STUDENT_1 vẫn chỉ có đúng 1 thông báo In-app (không bị nhân bản)
	const inboxRes = await student.request.get(`${API_ORIGIN}/api/student/inbox`);
	expect(inboxRes.status()).toBe(200);
	const inboxBody = (await inboxRes.json()) as {
		items: Array<{ id: string; eventType: string }>;
	};
	expect(inboxBody.items).toHaveLength(1);

	await studentContext.close();
	await teacherContext.close();
});
