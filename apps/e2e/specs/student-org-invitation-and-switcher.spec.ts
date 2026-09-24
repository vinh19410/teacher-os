import { expect, test } from "@playwright/test";
import { readVerificationEmails, signUpViaUi } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

test.describe("Student Org Invitation & Multi-Org Switcher", () => {
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
				teacherPage.getByRole("heading", { name: "Học viên" }),
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
			await teacherPage
				.getByRole("button", { name: /Lời mời đang chờ/ })
				.click();

			// Assert studentEmail appears in pending list
			await expect(teacherPage.getByText(studentEmail)).toBeVisible({
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

			// Read verification email from log
			let verifyUrl: string | undefined;
			for (let i = 0; i < 20; i++) {
				const emails = await readVerificationEmails();
				const entry = emails.find(
					(e) => e.to.toLowerCase() === studentEmail.toLowerCase(),
				);
				if (entry?.url) {
					verifyUrl = entry.url;
					break;
				}
				await studentPage.waitForTimeout(500);
			}

			expect(verifyUrl).toBeDefined();
			if (!verifyUrl) throw new Error("No verifyUrl found");

			// Click verification link
			await studentPage.goto(verifyUrl);

			// Should redirect to portal
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

			// After accepting, popover closes or invitation disappears, and org switcher shows the org
			await expect(
				studentPage.getByRole("button", { name: "Chấp nhận" }),
			).not.toBeVisible({ timeout: 10_000 });

			// Org switcher should show the organization
			await expect(
				studentPage.locator(
					"[data-testid='org-switcher-single'], [data-testid='org-switcher-trigger']",
				),
			).toBeVisible({ timeout: 10_000 });
		} finally {
			await studentContext.close();
		}
	});
});
