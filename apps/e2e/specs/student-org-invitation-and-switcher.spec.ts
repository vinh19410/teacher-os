import { expect, test } from "@playwright/test";
import {
	readVerificationEmails,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

test.describe("Student Org Invitation & Multi-Org Switcher", () => {
	test("#570: invite to a bouncing mailbox shows 502 error and NO ghost pending row", async ({
		browser,
	}) => {
		const bounceEmail = `student.invite.bounce.${Date.now()}@bounce.test`;
		const teacherContext = await browser.newContext();
		const teacherPage = await teacherContext.newPage();

		try {
			await signUpViaUi(teacherPage, { name: "Teacher Bounce" });
			await teacherPage.goto("/students");
			await teacherPage.getByRole("button", { name: "Mời học viên" }).click();
			await teacherPage.locator("input[type='email']").fill(bounceEmail);
			await teacherPage.getByRole("button", { name: "Gửi lời mời" }).click();

			// Modal stays open and shows the 502 error (recordingMailer throws for @bounce.test)
			await expect(
				teacherPage.getByRole("heading", {
					name: "Mời học viên vào tổ chức",
				}),
			).toBeVisible();
			await expect(
				teacherPage.getByText(
					/Không gửi được email lời mời|Không thể gửi lời mời/,
					{ exact: false },
				),
			).toBeVisible({ timeout: 15_000 });
			// No phantom pending row in the tab (case-insensitive e-mail match)
			await teacherPage.getByRole("button", { name: "Hủy" }).click();
			await expect(
				teacherPage.getByRole("heading", {
					name: "Mời học viên vào tổ chức",
				}),
			).not.toBeVisible({ timeout: 10_000 });
			await teacherPage.getByRole("tab", { name: /Lời mời đang chờ/ }).click();
			await expect(
				teacherPage.getByText(bounceEmail, { exact: false }),
			).toHaveCount(0, { timeout: 10_000 });
		} finally {
			await teacherContext.close();
		}
	});

	test("#570: resend from modal and pending tab uses fresh idempotencyKey each time", async ({
		browser,
	}) => {
		const studentEmail = `student.invite.resend.${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
		const teacherContext = await browser.newContext();
		const teacherPage = await teacherContext.newPage();

		try {
			await signUpViaUi(teacherPage, { name: "Teacher Resend" });
			await teacherPage.goto("/students");
			await teacherPage.getByRole("button", { name: "Mời học viên" }).click();
			await teacherPage.locator("input[type='email']").fill(studentEmail);
			await teacherPage.getByRole("button", { name: "Gửi lời mời" }).click();
			await expect(
				teacherPage.getByRole("heading", { name: "Mời học viên vào tổ chức" }),
			).not.toBeVisible({ timeout: 10_000 });

			const readKeys = async () =>
				(await readVerificationEmails())
					.map((e) => (e.idempotencyKey ? String(e.idempotencyKey) : ""))
					.filter((k) => k.startsWith("student_invite:"));

			const keysBefore = await readKeys();
			expect(keysBefore.length).toBeGreaterThanOrEqual(1);

			// Re-invite the same email -> modal shows Chờ xác nhận with Gửi lại lời mời
			await teacherPage.getByRole("button", { name: "Mời học viên" }).click();
			await teacherPage.locator("input[type='email']").fill(studentEmail);
			await teacherPage.getByRole("button", { name: "Gửi lời mời" }).click();
			await expect(
				teacherPage.getByText("Chờ xác nhận", { exact: false }).first(),
			).toBeVisible({ timeout: 15_000 });

			const resendButton = teacherPage
				.getByRole("button", { name: /Gửi lại lời mời/ })
				.first();
			await expect(resendButton).toBeVisible();
			await resendButton.click();
			await expect(teacherPage.getByText(/Đã gửi lại lời mời tới/)).toBeVisible(
				{ timeout: 15_000 },
			);

			const keysAfter = await readKeys();
			expect(keysAfter.length).toBe(keysBefore.length + 1);
			expect(new Set(keysAfter).size).toBe(keysAfter.length);
		} finally {
			await teacherContext.close();
		}
	});

	test("Teacher invites student -> Student receives notification in bell -> Student accepts invite -> Org is active", async ({
		browser,
	}) => {
		const studentEmail = `student.invite.${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
		const studentName = "Alice Invitee";

		// 1. Teacher Context: Sign up and invite student
		const teacherContext = await browser.newContext();
		const teacherPage = await teacherContext.newPage();

		try {
			await signUpViaUi(teacherPage, { name: "Teacher Alpha" });

			// Go to students page
			await teacherPage.goto("/students");
			await expect(
				teacherPage.getByRole("heading", { name: "Học viên", exact: true }),
			).toBeVisible();

			// Click "+ Mời học viên"
			await teacherPage.getByRole("button", { name: "Mời học viên" }).click();

			// Modal appears
			await expect(
				teacherPage.getByRole("heading", { name: "Mời học viên vào tổ chức" }),
			).toBeVisible();

			// Fill email and submit
			await teacherPage.locator("input[type='email']").fill(studentEmail);
			await teacherPage.getByRole("button", { name: "Gửi lời mời" }).click();

			// Toast or modal closes
			await expect(
				teacherPage.getByRole("heading", { name: "Mời học viên vào tổ chức" }),
			).not.toBeVisible({ timeout: 10_000 });

			// Switch to "Lời mời đang chờ" tab
			// Phase 6: dải tab dùng role=tab (không còn role=button).
			await teacherPage.getByRole("tab", { name: /Lời mời đang chờ/ }).click();

			// Assert studentEmail appears in pending list
			await expect(
				teacherPage.getByText(studentEmail, { exact: true }),
			).toBeVisible({
				timeout: 10_000,
			});
			await expect(teacherPage.getByText("Đang chờ chấp nhận")).toBeVisible();
		} finally {
			await teacherContext.close();
		}

		// 2. Student Context: Sign up on portal and accept invitation
		const studentContext = await browser.newContext();
		const studentPage = await studentContext.newPage();

		try {
			// Register on student portal
			await studentPage.goto(`${STUDENT_ORIGIN}/login`);
			await studentPage.locator("#tab-signup").click();
			await studentPage.locator("#signup-name").fill(studentName);
			await studentPage.locator("#signup-email").fill(studentEmail);
			await studentPage.locator("#signup-password").fill("password-8chars");
			await studentPage.locator("#panel-signup button[type='submit']").click();

			// Expect verification screen
			await expect(
				studentPage.getByText("Email chưa được xác thực"),
			).toBeVisible({
				timeout: 15_000,
			});

			// Read verification email from log, open it, click the CTA on the
			// confirmation page — landing must be the /verify-email page, then
			// the gate routes the student into the portal
			await verifyStudentEmailFromMailLog(studentPage, studentEmail);

			// Should be in the portal now
			await expect(studentPage).toHaveURL(new RegExp(STUDENT_ORIGIN), {
				timeout: 30_000,
			});

			// Bell icon should be visible
			const bellButton = studentPage.getByRole("button", { name: "Thông báo" });
			await expect(bellButton).toBeVisible({ timeout: 15_000 });

			// Click bell icon to open notifications popover
			await bellButton.click();

			// Expect invitation text and "Chấp nhận" button
			await expect(
				studentPage.getByText("mời bạn tham gia tổ chức"),
			).toBeVisible({
				timeout: 10_000,
			});
			const acceptBtn = studentPage.getByRole("button", { name: "Chấp nhận" });
			await expect(acceptBtn).toBeVisible();
			// Click "Chấp nhận"
			await acceptBtn.click();
			await expect(
				studentPage
					.locator("[data-sonner-toast]")
					.filter({ hasText: "Đã tham gia Teacher Alpha" }),
			).toBeVisible();

			// After accepting, gate redirects new un-onboarded student to /onboarding
			await expect(studentPage).toHaveURL(/\/onboarding/, { timeout: 10_000 });

			// Complete onboarding wizard
			await studentPage.getByRole("button", { name: /IELTS/ }).click();
			await studentPage.getByRole("button", { name: "Tiếp tục" }).click();
			await studentPage.getByRole("button", { name: /4.5 – 5.5/ }).click();
			await studentPage.getByRole("button", { name: "Tiếp tục" }).click();
			await studentPage.getByRole("button", { name: "Band 6.5" }).click();
			await studentPage.getByRole("button", { name: "Tiếp tục" }).click();
			await studentPage.getByRole("button", { name: "Du học" }).click();
			await studentPage.getByRole("button", { name: "Tiếp tục" }).click();
			await studentPage.getByRole("button", { name: "1–2 giờ" }).click();
			await studentPage.getByRole("button", { name: "Tiếp tục" }).click();
			await studentPage.getByRole("button", { name: "Hoàn thành" }).click();

			// Back on overview, Org switcher should show the organization
			await expect(studentPage).toHaveURL(/\/$/, { timeout: 20_000 });
			await expect(
				studentPage
					.locator(
						"[data-testid='org-switcher-single'], [data-testid='org-switcher-trigger']",
					)
					.filter({ visible: true }),
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await studentContext.close();
		}
	});
});
