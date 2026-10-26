import { mkdirSync } from "node:fs";
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
 * AC-002 — plan TOS-22 (#463) phase 3: thông báo đang `queued` gửi tới địa chỉ
 * `@bounce.test` bị lỗi liên tiếp đủ 3 lần → chuyển sang `failed` kèm mã lỗi
 * `E-selfomy-alignment-010: mailbox unavailable`, hiển thị nhãn đỏ "Lỗi gửi"
 * + thông điệp `E-010: mailbox unavailable sau 3 lần thử` trên màn [5] (kiểm
 * chứng ở 3 viewport 1440×900, 768×1024, 375×812 + keyboard focus), trong khi
 * thông báo In-app trên cổng học viên vẫn giữ nguyên và mở xem chỉ đặt
 * `read_at`, không đổi `status` khỏi `failed`.
 */
const PASSWORD = "password-8chars";
const CLASS_NAME = "E2E TOS-22 Lớp thông báo lỗi";
const STUDENT_BOUNCE = "TOS-22 Học viên Lỗi Email";
const screenshotsDir = new URL(
	"../../../plans/261027-0127-tos-22-notification-auto-retry-failed/screenshots/",
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

async function enrollAndActivateStudent(page: Page, studentName: string) {
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
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	const option = enrollDialog.getByRole("option", { name: studentName });
	await expect(option).toBeVisible();
	await option.click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
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

test("AC-002 gửi email thất bại đủ 3 lần → Lỗi gửi (failed) kèm E-010, giữ nguyên In-app học viên", async ({
	browser,
}) => {
	const teacherContext = await browser.newContext({
		viewport: { width: 1440, height: 900 },
	});
	const teacher = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacher);
	const bounceEmail = `tos22.bounce.${Date.now()}@bounce.test`;

	await seedStudent({
		teacherEmail,
		name: STUDENT_BOUNCE,
		email: bounceEmail,
		onboarded: true,
	});

	// --- Bước 1: ghi danh + kích hoạt học viên → phát class_enrolled ---
	await enrollAndActivateStudent(teacher, STUDENT_BOUNCE);

	// --- Bước 2: chờ đủ 3 lần thử lỗi trong mail log và bản ghi chuyển failed ---
	const entries = await pollMail(
		(all) =>
			mailsTo(all, bounceEmail).filter((e) => e.failed === true).length >= 3,
	);
	const failedEntries = mailsTo(entries, bounceEmail).filter(
		(e) => e.failed === true,
	);
	expect(failedEntries).toHaveLength(3);

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
		.toBe(1);

	// --- Bước 3: kiểm tra màn [5] (/notifications) ở 3 viewport + keyboard focus ---
	await teacher.goto("/notifications");
	await expect(
		teacher.getByRole("heading", { name: /Nhật ký gửi thông báo/ }),
	).toBeVisible();

	const failedChip = teacher
		.getByRole("group", { name: "Trạng thái" })
		.getByRole("button", { name: /^Lỗi gửi/ });
	await expect(failedChip).toContainText("1");
	await failedChip.click();
	await expect(teacher).toHaveURL(/status=failed/);

	const failedRow = teacher
		.locator("table tbody tr")
		.filter({ hasText: STUDENT_BOUNCE });
	await expect(failedRow).toHaveCount(1);
	await expect(failedRow.getByText("Lỗi gửi")).toBeVisible();
	await expect(
		failedRow.getByText("E-010: mailbox unavailable sau 3 lần thử"),
	).toBeVisible();

	mkdirSync(screenshotsDir, { recursive: true });
	for (const vp of [
		{ width: 1440, height: 900 },
		{ width: 768, height: 1024 },
		{ width: 375, height: 812 },
	]) {
		await teacher.setViewportSize(vp);
		await expect(
			failedRow.getByText("E-010: mailbox unavailable sau 3 lần thử"),
		).toBeVisible();
		const docOverflow = await teacher.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(docOverflow, `không tràn ngang trang ở ${vp.width}px`).toBe(false);
		await teacher.screenshot({
			path: `${screenshotsDir}tos22-failed-row-${vp.width}.png`,
			fullPage: true,
		});
	}
	await teacher.setViewportSize({ width: 1440, height: 900 });

	const detailButton = failedRow.getByRole("button", {
		name: `Xem chi tiết thông báo cho ${STUDENT_BOUNCE}`,
	});
	await detailButton.focus();
	await expect(detailButton).toBeFocused();
	await teacher.keyboard.press("Enter");

	const dialog = teacher.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText("3/3 lần thử")).toBeVisible();
	await expect(
		dialog.getByText("E-selfomy-alignment-010: mailbox unavailable"),
	).toBeVisible();
	await dialog.getByRole("button", { name: /đóng|close/i }).click();
	await expect(dialog).toBeHidden();

	// --- Bước 4: cổng học viên vẫn có thông báo In-app; mở xem không đổi status khỏi failed ---
	const studentContext = await browser.newContext();
	const student = await studentContext.newPage();
	await student.goto(`${STUDENT_ORIGIN}/login`);
	await student.locator("#tab-signup").click();
	await student.locator("#signup-name").fill(STUDENT_BOUNCE);
	await student.locator("#signup-email").fill(bounceEmail);
	await student.locator("#signup-password").fill(PASSWORD);
	await student.locator("#panel-signup button[type='submit']").click();
	await expect(student.getByText("Email chưa được xác thực")).toBeVisible();
	await verifyStudentEmailFromMailLog(student, bounceEmail);
	await expect(student).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));

	await expect(student.getByTestId("notification-badge")).toBeVisible();
	await student
		.getByRole("button", { name: /mục chưa xử lý|^Thông báo$/ })
		.click();
	const inviteItem = student
		.getByTestId("inbox-item")
		.filter({ hasText: CLASS_NAME });
	await expect(inviteItem).toHaveCount(1);
	await inviteItem.click();

	// Phía GV: reload ?status=failed → bản ghi vẫn nằm ở trạng thái Lỗi gửi (failed), nhưng đã có thời điểm Đọc lúc.
	await teacher.reload();
	await expect(teacher).toHaveURL(/status=failed/);
	await expect(
		teacher.locator("table tbody tr").filter({ hasText: STUDENT_BOUNCE }),
	).toHaveCount(1);
	await expect(
		teacher
			.locator("table tbody tr")
			.filter({ hasText: STUDENT_BOUNCE })
			.getByText("Lỗi gửi"),
	).toBeVisible();

	// Tổng số dòng failed trong mail log cho bounceEmail vẫn đúng bằng 3 (không phát sinh gửi lại ngoài ý muốn).
	const finalEntries = await readVerificationEmails();
	expect(
		mailsTo(finalEntries, bounceEmail).filter((e) => e.failed === true),
	).toHaveLength(3);

	await studentContext.close();
	await teacherContext.close();
});
