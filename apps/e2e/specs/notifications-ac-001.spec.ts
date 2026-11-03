import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import {
	isoInDaysFromTodayVN,
	orgIdForTeacherEmail,
	readVerificationEmails,
	seedStudent,
	signUpViaUi,
	type VerificationEmailEntry,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * AC-001 — plan TOS-21 (#454) phase 6: thông báo Email + In-app cho sự kiện
 * chính, chạy trên 1 org duy nhất theo thứ tự scenario:
 *   1. Tạo hóa đơn → dòng "Học phí" ở /notifications + mail có fromName org,
 *      replyTo = email GV, dòng "Đã gửi".
 *   2. Giao bài cho lớp → mỗi học viên 1 dòng "Giao bài tập".
 *   3. Học viên đăng nhập cổng → chuông badge → mở thông báo hóa đơn → trang
 *      học phí; dòng GV chuyển "Đã xem".
 *   4. Lọc ?status=read và ?event=tuition đúng; reload giữ filter.
 *   5. Tạo lại cùng sự kiện qua API (cùng khóa) → không thêm dòng / thư.
 *
 * Mail log: recordingMailer (apps/e2e/src/boot.ts) ghi TOÀN BỘ thư dạng
 * JSONL; thư thông báo (không phải verify/reset) được log với
 * `error: "no-verify-url"` — không phải lỗi gửi thật, chỉ là nhánh phân loại
 * URL trong mailer ghi. Header cần kiểm (to/subject/replyTo/fromName) đầy đủ.
 */
const PASSWORD = "password-8chars";
const CLASS_NAME = "E2E TOS-21 Lớp thông báo";
const STUDENT_1 = "TOS-21 Học viên Một";
const STUDENT_2 = "TOS-21 Học viên Hai";
const PROMPT_TITLE = "TOS-21 Prompt Thông báo";
const INVOICE_AMOUNT = "500000";

/** Dòng bảng ở /notifications. */
function logRows(page: Page) {
	return page.locator("table tbody tr");
}

async function openNotifications(page: Page) {
	await page.goto("/notifications");
	await expect(
		page.getByRole("heading", { name: /Nhật ký gửi thông báo/ }),
	).toBeVisible();
}

/** Chip trong nhóm chip có aria-label tương ứng (ChipFilter). */
function chip(page: Page, group: string, label: string) {
	return page
		.getByRole("group", { name: group })
		.getByRole("button", { name: label, exact: true });
}

/** Poll mail log tới khi `predicate` khớp (background delivery là async). */
async function pollMail(
	predicate: (entries: VerificationEmailEntry[]) => boolean,
	retries = 40,
): Promise<VerificationEmailEntry[]> {
	for (let i = 0; i < retries; i++) {
		const entries = await readVerificationEmails();
		if (predicate(entries)) return entries;
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 500);
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

/** Org bootstrap từ giáo viên đăng ký UI. */
async function orgNameFor(teacherEmail: string): Promise<string> {
	const orgId = await orgIdForTeacherEmail(teacherEmail);
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	try {
		await client.execute("PRAGMA busy_timeout = 5000;");
		const rs = await client.execute({
			sql: "SELECT name FROM organization WHERE id = ?",
			args: [orgId],
		});
		return String(rs.rows[0]?.name ?? "");
	} finally {
		client.close();
	}
}

/** Tạo lớp + ghi danh & kích hoạt 2 học viên (UI thật, theo pattern
 * create-invoice.spec). Trả về classId từ URL chi tiết lớp. */
async function setupClassWithTwoStudents(page: Page): Promise<string> {
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
	const classId = new URL(page.url()).pathname.split("/").pop() as string;

	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	for (const name of [STUDENT_1, STUDENT_2]) {
		await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
		const enrollDialog = page.getByRole("dialog");
		const option = enrollDialog.getByRole("option", { name });
		await expect(option).toBeVisible();
		await option.click();
		await enrollDialog
			.getByRole("button", { name: "Lưu", exact: true })
			.click();
		await expect(enrollDialog).toBeHidden();
		// Kích hoạt ngay để enrollment sang 'active' (đủ điều kiện nhận hóa đơn
		// và là roster "active" khi giao bài).
		const row = page.locator("tbody tr").filter({ hasText: name });
		await row.getByRole("button", { name: "Kích hoạt" }).click();
		const confirmModal = page
			.getByRole("dialog")
			.filter({ hasText: "Kích hoạt học viên?" });
		await expect(confirmModal).toBeVisible();
		await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
		await expect(confirmModal).toBeHidden();
		await expect(row.getByText("Đang học")).toBeVisible();
	}
	return classId;
}

/** Tạo 1 đề ready trong ngân hàng đề rồi giao cho cả lớp qua UI
 * (pattern class-assign.spec). */
async function assignPromptToClass(page: Page) {
	await page.goto("/assignments/new");
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	const editor = page.getByLabel("Nội dung đề", { exact: true });
	await editor.click();
	await editor.fill("TOS-21 prompt body for notification e2e.");
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Giao bài tập" }).first().click();
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await expect(page.getByText("Giao cho 2 học viên")).toBeVisible();
	await page.getByRole("button", { name: "Giao bài tập" }).last().click();
	await expect(
		page.getByRole("heading", { name: "Đã giao bài tập" }),
	).toBeVisible();
}

/** Tạo hóa đơn cho STUDENT_1 qua modal /tuition (pattern create-invoice.spec). */
async function createInvoiceForStudent1(page: Page) {
	await page.getByText("Doanh thu", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/tuition$/);
	await page.getByTestId("create-invoice").click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByRole("heading", { name: "Tạo hóa đơn" }),
	).toBeVisible();
	await dialog
		.getByLabel("Học viên *")
		.selectOption({ label: `${STUDENT_1} · ${CLASS_NAME}` });
	await dialog.getByLabel("Số tiền (VND) *").fill(INVOICE_AMOUNT);
	await dialog.getByLabel("Ngày đến hạn *").fill(isoInDaysFromTodayVN(30));
	await dialog
		.getByRole("button", { name: "Tạo hóa đơn", exact: true })
		.click();
	await expect(dialog).toBeHidden();
}

test("AC-001 thông báo email + in-app: hóa đơn, giao bài, đã xem, filter, idempotent", async ({
	browser,
}) => {
	// --- Org: GV thật (UI signup) + 2 học viên seed DB có email ---
	const teacherContext = await browser.newContext();
	const teacher = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacher);
	const student1Email = `tos21.s1.${Date.now()}@e2e.test`;
	const student2Email = `tos21.s2.${Date.now()}@e2e.test`;
	await seedStudent({
		teacherEmail,
		name: STUDENT_1,
		email: student1Email,
		// Portal bỏ wizard onboarding → hạ cánh overview có chuông thông báo.
		onboarded: true,
	});
	await seedStudent({
		teacherEmail,
		name: STUDENT_2,
		email: student2Email,
	});
	const orgName = await orgNameFor(teacherEmail);
	expect(orgName.length).toBeGreaterThan(0);
	const classId = await setupClassWithTwoStudents(teacher);

	// --- Bước 1: hóa đơn → dòng /notifications + mail header ---
	await createInvoiceForStudent1(teacher);
	await openNotifications(teacher);
	// Học viên cũng có dòng "Mời vào lớp" từ bước ghi danh → scoping dòng hóa
	// đơn theo cả tên HV và tiêu đề sự kiện.
	const invoiceRow = logRows(teacher)
		.filter({ hasText: STUDENT_1 })
		.filter({ hasText: "Hóa đơn học phí" });
	await expect(invoiceRow).toHaveCount(1);
	await expect(invoiceRow.getByText("Hóa đơn học phí")).toBeVisible();
	// Thư được deliver nền → trạng thái queued có thể lấm tắt; assert retry.
	await expect(invoiceRow.getByText("Đã gửi")).toBeVisible();

	const invoiceMails = await pollMail((entries) =>
		mailsTo(entries, student1Email).some(
			(e) => e.subject === "Hóa đơn học phí",
		),
	);
	const invoiceMail = mailsTo(invoiceMails, student1Email).find(
		(e) => e.subject === "Hóa đơn học phí",
	);
	expect(invoiceMail?.fromName).toBe(`${orgName} qua Teacher OS`);
	expect(invoiceMail?.replyTo).toBe(teacherEmail);

	// --- Bước 2: giao bài → mỗi học viên 1 dòng "Giao bài" ---
	await assignPromptToClass(teacher);
	await openNotifications(teacher);
	await chip(teacher, "Nhóm sự kiện", "Giao bài / Trả điểm").click();
	await expect(teacher).toHaveURL(/event=assignment/);
	const assignRows = logRows(teacher);
	await expect(assignRows).toHaveCount(2);
	await expect(assignRows.filter({ hasText: STUDENT_1 })).toHaveCount(1);
	await expect(assignRows.filter({ hasText: STUDENT_2 })).toHaveCount(1);
	await expect(
		logRows(teacher).filter({ hasText: "Hóa đơn học phí" }),
	).toHaveCount(0);

	// Chờ mail giao bài deliver xong để bước 5 chụp baseline ổn định.
	await pollMail((entries) => {
		const s1 = mailsTo(entries, student1Email).filter(
			(e) => e.subject === "Bài tập mới",
		).length;
		const s2 = mailsTo(entries, student2Email).filter(
			(e) => e.subject === "Bài tập mới",
		).length;
		return s1 >= 1 && s2 >= 1;
	});

	// --- Bước 3: học viên đọc thông báo hóa đơn trong cổng ---
	const studentContext = await browser.newContext();
	const student = await studentContext.newPage();
	await student.goto(`${STUDENT_ORIGIN}/login`);
	await student.locator("#tab-signup").click();
	await student.locator("#signup-name").fill(STUDENT_1);
	await student.locator("#signup-email").fill(student1Email);
	await student.locator("#signup-password").fill(PASSWORD);
	await student.locator("#panel-signup button[type='submit']").click();
	await expect(student.getByText("Email chưa được xác thực")).toBeVisible();
	await verifyStudentEmailFromMailLog(student, student1Email);
	await expect(student).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));

	// Chuông có badge (lời mời/inbox chưa đọc; >=1 là đủ — không ghim số).
	const badge = student.getByTestId("notification-badge");
	await expect(badge).toBeVisible();
	await student
		.getByRole("button", { name: /mục chưa xử lý|^Thông báo$/ })
		.click();
	const invoiceItem = student
		.getByTestId("inbox-item")
		.filter({ hasText: "Hóa đơn học phí" });
	await expect(invoiceItem).toHaveCount(1);
	await invoiceItem.click();
	// linkPath hóa đơn → trang học phí của cổng.
	await expect(student).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/tuition$`));
	await expect(student.getByText("500.000đ").first()).toBeVisible();

	// Quay lại /notifications phía GV → dòng hóa đơn "Đã xem".
	await openNotifications(teacher);
	const readInvoiceRow = logRows(teacher)
		.filter({ hasText: STUDENT_1 })
		.filter({ hasText: "Hóa đơn học phí" });
	await expect(readInvoiceRow).toHaveCount(1);
	await expect(readInvoiceRow.getByText("Đã xem")).toBeVisible();

	// --- Bước 4: filter ?status=read / ?event=tuition, reload giữ filter ---
	await chip(teacher, "Trạng thái", "Đã xem").click();
	await expect(teacher).toHaveURL(/status=read/);
	await expect(logRows(teacher)).toHaveCount(1);
	await expect(
		logRows(teacher)
			.filter({ hasText: STUDENT_1 })
			.filter({ hasText: "Hóa đơn học phí" }),
	).toHaveCount(1);

	await chip(teacher, "Nhóm sự kiện", "Học phí").click();
	await expect(teacher).toHaveURL(/event=tuition/);
	await expect(teacher).toHaveURL(/status=read/);
	await expect(logRows(teacher)).toHaveCount(1);

	await teacher.reload();
	await expect(teacher).toHaveURL(/event=tuition/);
	await expect(teacher).toHaveURL(/status=read/);
	await expect(logRows(teacher)).toHaveCount(1);
	await expect(
		logRows(teacher)
			.filter({ hasText: STUDENT_1 })
			.filter({ hasText: "Hóa đơn học phí" }),
	).toHaveCount(1);

	// --- Bước 5: tạo lại cùng sự kiện qua API (cùng khóa) → không thêm ---
	// Baseline sau khi mọi thư đã deliver ổn định.
	const beforeLogs = await teacher.request.get(
		`${API_ORIGIN}/api/notification-logs`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(beforeLogs.status()).toBe(200);
	const before = (await beforeLogs.json()) as { total?: number };
	const beforeMails = await readVerificationEmails();

	// Enroll lại cùng học viên vào cùng lớp → route chặn 409, không phát sự
	// kiện mới; kích hoạt lại enrollment active (CAS idempotent, cùng
	// enrollment) → 2xx nhưng không dòng/thư mới.
	const reEnroll = await teacher.request.post(
		`${API_ORIGIN}/api/classes/${classId}/enroll`,
		{
			data: { studentId: await seedStudentLookup(teacherEmail, STUDENT_1) },
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(reEnroll.status()).toBe(409);
	const enrollmentId = await lookupEnrollmentId(classId);
	const reAccept = await teacher.request.post(
		`${API_ORIGIN}/api/enrollments/${enrollmentId}/accept`,
		{ data: {}, headers: { Origin: WEB_ORIGIN } },
	);
	expect(reAccept.status()).toBe(200);

	await teacher.waitForTimeout(1000);
	const afterLogs = await teacher.request.get(
		`${API_ORIGIN}/api/notification-logs`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	const after = (await afterLogs.json()) as { total?: number };
	expect(after.total ?? 0).toBe(before.total ?? 0);
	const afterMails = await readVerificationEmails();
	expect(afterMails.length).toBe(beforeMails.length);

	await studentContext.close();
	await teacherContext.close();
});

/** studentId của học viên seed theo tên (điểm gọi API enroll). */
async function seedStudentLookup(
	teacherEmail: string,
	name: string,
): Promise<string> {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	try {
		await client.execute("PRAGMA busy_timeout = 5000;");
		const rs = await client.execute({
			sql: `SELECT s.id FROM student s
				JOIN organization o ON o.id = s.org_id
				WHERE s.name = ? AND o.id = (SELECT m.org_id FROM membership m JOIN user u ON u.id = m.user_id
					WHERE lower(u.email) = lower(?) ORDER BY m.created_at LIMIT 1)`,
			args: [name, teacherEmail],
		});
		return String(rs.rows[0]?.id);
	} finally {
		client.close();
	}
}

async function lookupEnrollmentId(classId: string): Promise<string> {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	try {
		await client.execute("PRAGMA busy_timeout = 5000;");
		const rs = await client.execute({
			sql: "SELECT id FROM enrollment WHERE class_id = ? ORDER BY created_at LIMIT 1",
			args: [classId],
		});
		return String(rs.rows[0]?.id);
	} finally {
		client.close();
	}
}
