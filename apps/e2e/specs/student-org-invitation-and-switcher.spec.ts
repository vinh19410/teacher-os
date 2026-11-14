import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, verifyStudentEmailFromMailLog } from "./helpers";
import { STUDENT_ORIGIN } from "./origins";

const LOCAL_DB_PATH = fileURLToPath(
	new URL("../local.db", import.meta.url).href,
);

async function openDb() {
	const client = createClient({ url: `file:${LOCAL_DB_PATH}` });
	await client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

/**
 * Align the test teacher with the active managed organization that
 * Tier 2 provisioning resolves to (`organization` joined with manager
 * `membership` ordered by `created_at ASC, id ASC`), keeping tests
 * deterministic even when parallel E2E shards created an earlier teacher org.
 */
async function alignTeacherWithActiveManagedOrg(
	teacherPage: Page,
	teacherEmail: string,
): Promise<{ orgId: string; orgName: string; userId: string }> {
	const client = await openDb();
	try {
		const userRes = await client.execute({
			sql: "SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1",
			args: [teacherEmail],
		});
		const userId = String(userRes.rows[0]?.id ?? "");
		expect(userId, "teacher user exists after signUpViaApi").toBeTruthy();

		let activeOrgId = "";
		let activeOrgName = "";
		let teacherOrgId = "";

		for (let i = 0; i < 30; i++) {
			const teacherMem = await client.execute({
				sql: "SELECT org_id FROM membership WHERE user_id = ? LIMIT 1",
				args: [userId],
			});
			teacherOrgId = String(teacherMem.rows[0]?.org_id ?? "");

			const activeRes = await client.execute(
				`SELECT o.id AS org_id, o.name AS org_name
				 FROM organization o
				 INNER JOIN membership m ON m.org_id = o.id
				 WHERE m.role IN ('owner', 'teacher', 'admin')
				 ORDER BY o.created_at ASC, o.id ASC
				 LIMIT 1`,
			);
			activeOrgId = String(activeRes.rows[0]?.org_id ?? "");
			activeOrgName = String(activeRes.rows[0]?.org_name ?? "");
			if (teacherOrgId && activeOrgId) break;
			await teacherPage.waitForTimeout(200);
		}

		expect(teacherOrgId, "teacher membership bootstrapped").toBeTruthy();
		expect(activeOrgId, "active managed org exists").toBeTruthy();

		// Ensure the resolved active org actually has a manager membership
		// (skipping unowned seed orgs like e2e-lead-org when standalone).
		const memCountRes = await client.execute({
			sql: "SELECT count(*) AS cnt FROM membership WHERE org_id = ? AND role IN ('owner', 'teacher', 'admin')",
			args: [activeOrgId],
		});
		expect(Number(memCountRes.rows[0]?.cnt ?? 0)).toBeGreaterThanOrEqual(1);

		if (teacherOrgId !== activeOrgId) {
			const alreadyInActive = await client.execute({
				sql: "SELECT id FROM membership WHERE org_id = ? AND user_id = ? LIMIT 1",
				args: [activeOrgId, userId],
			});
			if (alreadyInActive.rows.length > 0) {
				await client.execute({
					sql: "DELETE FROM membership WHERE user_id = ? AND org_id != ?",
					args: [userId, activeOrgId],
				});
			} else {
				await client.execute({
					sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
					args: [activeOrgId, userId],
				});
			}
			await teacherPage.reload();
		}

		return { orgId: activeOrgId, orgName: activeOrgName, userId };
	} finally {
		client.close();
	}
}

test.describe("Single-Org Student Auto-Join & UI Cleanup (#716)", () => {
	test("email+password signup stays hidden while unverified, auto-joins active org on verification before onboarding, and /students + NotificationBell have no org-invite UI", async ({
		browser,
	}) => {
		const studentEmail = `student.autojoin.${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
		const studentName = "Nguyễn Auto Join";

		const teacherContext = await browser.newContext();
		const teacherPage = await teacherContext.newPage();
		const studentContext = await browser.newContext();
		const studentPage = await studentContext.newPage();

		try {
			const teacherEmail = await signUpViaApi(teacherPage, {
				name: "Cô Giáo Active",
			});
			await teacherPage.goto("/students");
			await expect(
				teacherPage.getByRole("heading", { name: "Học viên", exact: true }),
			).toBeVisible();

			const { orgId, orgName } = await alignTeacherWithActiveManagedOrg(
				teacherPage,
				teacherEmail,
			);

			// Clean single-org teacher UI on /students
			await expect(
				teacherPage.getByRole("button", { name: "Thêm học viên" }).first(),
			).toBeVisible();
			await expect(
				teacherPage.getByRole("button", { name: /Mời học viên/ }),
			).toHaveCount(0);
			await expect(
				teacherPage.getByRole("tab", { name: /Lời mời đang chờ/ }),
			).toHaveCount(0);

			// 1. Student registers via Email + Password on portal (unverified)
			await studentPage.goto(`${STUDENT_ORIGIN}/login`);
			await studentPage.locator("#tab-signup").click();
			await studentPage.locator("#signup-name").fill(studentName);
			await studentPage.locator("#signup-email").fill(studentEmail);
			await studentPage.locator("#signup-password").fill("password-8chars");
			await studentPage.locator("#panel-signup button[type='submit']").click();

			await expect(
				studentPage.getByText("Email chưa được xác thực"),
			).toBeVisible({ timeout: 15_000 });

			// Done-means #2: while emailVerified=false, teacher MUST NOT see student on /students
			await teacherPage.reload();
			await expect(
				teacherPage.getByText(studentName, { exact: false }),
			).toHaveCount(0);

			// 2. Verify email link -> auto-provisions student IMMEDIATELY before onboarding
			await verifyStudentEmailFromMailLog(studentPage, studentEmail);
			await expect(studentPage).toHaveURL(/\/onboarding/, { timeout: 20_000 });

			// Immediately visible in teacher's /students BEFORE student completes onboarding
			await teacherPage.reload();
			const studentRow = teacherPage
				.locator("tr", { hasText: studentName })
				.first();
			await expect(studentRow).toBeVisible({ timeout: 15_000 });
			await expect(
				studentRow.getByRole("button", { name: /Gửi lại lời mời/ }),
			).toHaveCount(0);
			await expect(studentRow.getByText("Chờ xác nhận")).toHaveCount(0);

			// Confirm DB record lives in the teacher's active org
			const client = await openDb();
			try {
				const dbRes = await client.execute({
					sql: "SELECT id, org_id FROM student WHERE lower(trim(email)) = lower(?)",
					args: [studentEmail],
				});
				expect(dbRes.rows).toHaveLength(1);
				expect(dbRes.rows[0]?.org_id).toBe(orgId);
			} finally {
				client.close();
			}

			// 3. Student finishes onboarding -> lands on portal with clean inbox-only NotificationBell
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

			await expect(studentPage).toHaveURL(/\/$/, { timeout: 20_000 });
			await expect(
				studentPage
					.locator(
						"[data-testid='org-switcher-single'], [data-testid='org-switcher-trigger']",
					)
					.filter({ visible: true }),
			).toContainText(orgName, { timeout: 10_000 });

			const bellButton = studentPage.getByRole("button", {
				name: /^Thông báo/,
			});
			await expect(bellButton).toBeVisible({ timeout: 10_000 });
			await bellButton.click();
			const bellDialog = studentPage.getByRole("dialog", {
				name: "Danh sách thông báo",
			});
			await expect(bellDialog).toBeVisible();
			await expect(bellDialog.getByText("Chưa có thông báo")).toBeVisible();
			await expect(
				bellDialog.getByRole("button", { name: /Chấp nhận|Từ chối/ }),
			).toHaveCount(0);
			await expect(bellDialog.getByText("Lời mời")).toHaveCount(0);
		} finally {
			await teacherContext.close();
			await studentContext.close();
		}
	});

	test("pre-created student + pending student_invitation auto-accepts and enters portal without duplicate or 403", async ({
		browser,
	}) => {
		const studentEmail = `student.precreated.${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.local`;
		const preCreatedName = "Lê Hồ Sơ Sẵn";

		const teacherContext = await browser.newContext();
		const teacherPage = await teacherContext.newPage();
		const studentContext = await browser.newContext();
		const studentPage = await studentContext.newPage();

		try {
			const teacherEmail = await signUpViaApi(teacherPage, {
				name: "Cô Giáo Precreate",
			});
			await teacherPage.goto("/students");
			const { orgId, userId } = await alignTeacherWithActiveManagedOrg(
				teacherPage,
				teacherEmail,
			);

			// 1. Teacher pre-creates student profile via "Thêm học viên" modal
			await teacherPage
				.getByRole("button", { name: "Thêm học viên" })
				.first()
				.click();
			const addDialog = teacherPage.getByRole("dialog", {
				name: "Thêm học viên mới",
			});
			await expect(addDialog).toBeVisible();
			await addDialog.getByLabel(/Họ tên học viên/).fill(preCreatedName);
			await addDialog.getByLabel(/^Email$/).fill(studentEmail);
			await addDialog.getByRole("button", { name: "Lưu", exact: true }).click();
			await expect(addDialog).toBeHidden({ timeout: 15_000 });

			const createdRow = teacherPage
				.locator("tr", { hasText: preCreatedName })
				.first();
			await expect(createdRow).toBeVisible({ timeout: 10_000 });
			await expect(createdRow.getByText("Chờ xác nhận")).toHaveCount(0);
			await expect(
				createdRow.getByRole("button", { name: /Gửi lại lời mời/ }),
			).toHaveCount(0);

			// Ensure a pending legacy invitation exists alongside the pre-created profile
			const client = await openDb();
			const inviteId = `e2e-pending-${Date.now()}`;
			try {
				const now = Date.now();
				await client.execute({
					sql: `INSERT INTO student_invitation (id, org_id, inviter_user_id, email, status, created_at, updated_at)
						SELECT ?, ?, ?, ?, 'pending', ?, ?
						WHERE NOT EXISTS (
							SELECT 1 FROM student_invitation WHERE lower(trim(email)) = lower(?) AND status = 'pending'
						)`,
					args: [inviteId, orgId, userId, studentEmail, now, now, studentEmail],
				});
			} finally {
				client.close();
			}

			// 2. Student registers & verifies email -> enters portal straightaway (no 403 STUDENT_NOT_LINKED)
			await studentPage.goto(`${STUDENT_ORIGIN}/login`);
			await studentPage.locator("#tab-signup").click();
			await studentPage.locator("#signup-name").fill("Tên Tự Đăng Ký Khác");
			await studentPage.locator("#signup-email").fill(studentEmail);
			await studentPage.locator("#signup-password").fill("password-8chars");
			await studentPage.locator("#panel-signup button[type='submit']").click();

			await expect(
				studentPage.getByText("Email chưa được xác thực"),
			).toBeVisible({ timeout: 15_000 });
			await verifyStudentEmailFromMailLog(studentPage, studentEmail);
			await expect(studentPage).toHaveURL(/\/onboarding/, { timeout: 20_000 });

			// Verify pre-created student profile preserved (count=1) and invitation marked accepted
			const verifyClient = await openDb();
			try {
				const studentRows = await verifyClient.execute({
					sql: "SELECT id, org_id, name FROM student WHERE lower(trim(email)) = lower(?)",
					args: [studentEmail],
				});
				expect(studentRows.rows).toHaveLength(1);
				expect(studentRows.rows[0]?.org_id).toBe(orgId);
				expect(studentRows.rows[0]?.name).toBe(preCreatedName);

				const pendingRows = await verifyClient.execute({
					sql: "SELECT status FROM student_invitation WHERE lower(trim(email)) = lower(?)",
					args: [studentEmail],
				});
				expect(pendingRows.rows.length).toBeGreaterThanOrEqual(1);
				for (const r of pendingRows.rows) {
					expect(r.status).toBe("accepted");
				}
			} finally {
				verifyClient.close();
			}
		} finally {
			await teacherContext.close();
			await studentContext.close();
		}
	});
});
