import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, verifyStudentEmailFromMailLog } from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const LEAD_ORG_ID = "e2e-lead-org";
const SEED_DIR = new URL("../../web/public/placement-seed/", import.meta.url);
const questionsData = JSON.parse(
	readFileSync(fileURLToPath(new URL("questions.json", SEED_DIR)), "utf8"),
);

const VIEWPORTS = [
	{ width: 1440, height: 900, label: "desktop-1440x900" },
	{ width: 768, height: 1024, label: "tablet-768x1024" },
	{ width: 375, height: 812, label: "mobile-375x812" },
] as const;

function reportPath(filename: string): string {
	return fileURLToPath(
		new URL(`../../../plans/reports/${filename}`, import.meta.url),
	);
}

async function openDb() {
	const client = createClient({
		url: `file:${fileURLToPath(new URL("../local.db", import.meta.url))}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function signUpLeadOrgTeacher(page: Page, name: string): Promise<string> {
	const email = await signUpViaApi(page, { name });
	const db = await openDb();
	try {
		const user = await db.execute({
			sql: "SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1",
			args: [email],
		});
		const userId = user.rows[0]?.id;
		if (typeof userId !== "string") {
			throw new Error("teacher user row chưa xuất hiện sau sign-up");
		}
		let reassigned = 0;
		for (let i = 0; i < 40; i++) {
			const updated = await db.execute({
				sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
				args: [LEAD_ORG_ID, userId],
			});
			reassigned = updated.rowsAffected;
			if (reassigned > 0) break;
			await page.waitForTimeout(250);
		}
		expect(reassigned, "membership reassign sang lead org").toBe(1);
	} finally {
		db.close();
	}
	return email;
}

async function ensurePlacementPublished(page: Page): Promise<void> {
	const client = await openDb();
	try {
		await client.execute({
			sql: "DELETE FROM placement_test_submission WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test_audio WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
	} finally {
		client.close();
	}

	await signUpLeadOrgTeacher(page, "Cô Mỹ Student Placement E2E");

	const content = structuredClone(questionsData);
	for (const clip of content.parts[0].clips) {
		const mp3Bytes = readFileSync(
			fileURLToPath(new URL(`${clip.id}.mp3`, SEED_DIR)),
		);
		const uploadRes = await page.request.put(
			`${API_ORIGIN}/api/placement-test/audio`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(mp3Bytes.byteLength),
					"X-File-Name": encodeURIComponent(`${clip.id}.mp3`),
				},
				data: mp3Bytes,
			},
		);
		expect(uploadRes.status()).toBe(200);
		const uploaded = (await uploadRes.json()) as { audioId: string };
		clip.audioId = uploaded.audioId;
	}

	const draftRes = await page.request.put(
		`${API_ORIGIN}/api/placement-test/draft`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 0, content },
		},
	);
	expect(draftRes.status()).toBe(200);

	const pubRes = await page.request.post(
		`${API_ORIGIN}/api/placement-test/publish`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 1 },
		},
	);
	expect(pubRes.status()).toBe(200);
}

async function completeStudentOnboarding(page: Page): Promise<void> {
	await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
	await page.getByRole("button", { name: /IELTS/ }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: /4.5 – 5.5/ }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Band 6.5" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Du học" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "1–2 giờ" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Hoàn thành" }).click();
}

test.describe
	.serial("Student Portal Placement Test (#748)", () => {
		test("onboarding -> modal đề xuất -> Để sau -> highlight Dashboard & Sidebar -> làm bài 5 kỹ năng -> giáo viên chấm tại /students/$studentId -> đồng bộ entryScore", async ({
			browser,
		}) => {
			test.setTimeout(180_000);

			// 1. Giáo viên ở e2e-lead-org xuất bản bộ đề chuẩn
			const teacherContext = await browser.newContext();
			const teacherPage = await teacherContext.newPage();
			await ensurePlacementPublished(teacherPage);

			// 2. Học viên đăng ký mới trong Student Portal
			const studentContext = await browser.newContext();
			const studentPage = await studentContext.newPage();
			const email = `e2e-placement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
			const studentName = "Học Viên Test Đầu Vào";

			try {
				await studentPage.goto(`${STUDENT_ORIGIN}/login`);
				await studentPage.locator("#tab-signup").click();
				await studentPage.locator("#signup-name").fill(studentName);
				await studentPage.locator("#signup-email").fill(email);
				await studentPage.locator("#signup-password").fill("password-8chars");
				await studentPage
					.locator("#panel-signup button[type='submit']")
					.click();

				await expect(
					studentPage.getByText("Email chưa được xác thực"),
				).toBeVisible({ timeout: 15_000 });
				await verifyStudentEmailFromMailLog(studentPage, email);

				// Hoàn tất onboarding 5 bước
				await completeStudentOnboarding(studentPage);
				await expect(studentPage).toHaveURL(/\/$/, { timeout: 20_000 });

				// 3. Modal đề xuất lần đầu xuất hiện
				const promptModal = studentPage.getByTestId("placement-prompt-modal");
				await expect(promptModal).toBeVisible({ timeout: 15_000 });
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.screenshot({
					path: reportPath("748-student-placement-modal-desktop-1440x900.png"),
				});

				// Bấm "Để sau" -> modal ẩn, lưu DB, nhưng Dashboard banner + Sidebar badge "Chưa làm" vẫn hiện
				await Promise.all([
					studentPage.waitForResponse(
						(res) =>
							res.url().endsWith("/api/student/placement-test/dismiss") &&
							res.request().method() === "POST" &&
							res.status() === 200,
					),
					promptModal.getByRole("button", { name: "Để sau" }).click(),
				]);
				await expect(promptModal).not.toBeVisible();

				// Reload trang để chắc chắn modal không hiện lại nữa nhưng highlight vẫn còn
				await studentPage.reload();
				await expect(promptModal).not.toBeVisible();
				await expect(
					studentPage.getByTestId("placement-highlight-banner"),
				).toBeVisible({ timeout: 15_000 });
				const navBadge = studentPage.getByTestId("nav-placement-badge");
				await expect(navBadge).toBeVisible();
				await expect(navBadge).toHaveText("Chưa làm");

				// Chụp POT 3 viewport + dark desktop cho Dashboard highlight
				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					const noOverflow = await studentPage.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							document.documentElement.clientWidth,
					);
					expect(noOverflow, `Không tràn ngang ở ${vp.label}`).toBe(true);
					await studentPage.screenshot({
						path: reportPath(`748-student-placement-highlight-${vp.label}.png`),
					});
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await studentPage.screenshot({
					path: reportPath("748-student-placement-highlight-desktop-dark.png"),
				});
				await studentPage.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);

				// 4. Bấm CTA "Làm bài test đầu vào" -> vào /placement-test
				await studentPage.getByTestId("placement-banner-cta").click();
				await expect(studentPage).toHaveURL(/\/placement-test/, {
					timeout: 15_000,
				});
				await expect(
					studentPage.getByTestId("placement-intro-card"),
				).toBeVisible();

				await studentPage.getByTestId("start-placement-test-btn").click();
				await expect(
					studentPage.getByTestId("placement-step-listening"),
				).toBeVisible();

				// Điền Listening -> chuyển sang Grammar & Vocab
				await studentPage.screenshot({
					path: reportPath("748-student-placement-runner-desktop-1440x900.png"),
				});
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Grammar & Vocabulary/ })
					.click();
				await expect(
					studentPage.getByTestId("placement-step-vg"),
				).toBeVisible();

				// Chọn nhanh một số câu G&V -> chuyển Reading
				const vgLabels = studentPage
					.getByTestId("placement-step-vg")
					.locator("label");
				if ((await vgLabels.count()) > 0) {
					await vgLabels.first().click();
				}
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Reading/ })
					.click();
				const readingStep = studentPage.getByTestId("placement-step-reading");
				await expect(readingStep).toBeVisible();
				for (const redundantLabel of [
					"Biển báo / Thông báo",
					"Tin nhắn / Email",
					"Bài đọc hiểu",
					"Đoạn văn điền từ",
				]) {
					await expect(readingStep).not.toContainText(redundantLabel);
				}
				const firstSignCard = readingStep
					.locator('[data-passage-id]:has([data-passage-kind="sign"])')
					.first();
				await expect(firstSignCard).toBeVisible();
				await expect(
					firstSignCard.locator('[data-slot="card-header"]'),
				).toHaveCount(0);
				const firstPassageCard = readingStep
					.locator('[data-passage-id]:has([data-passage-kind="passage"])')
					.first();
				await expect(
					firstPassageCard.locator('[data-slot="card-header"]'),
				).toHaveCount(1);

				const readingPotIssue = process.env.CAPTURE_POT_ISSUE?.trim();
				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					const noOverflow = await studentPage.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							document.documentElement.clientWidth,
					);
					expect(noOverflow, `Reading không tràn ngang ở ${vp.label}`).toBe(
						true,
					);
					if (readingPotIssue) {
						await firstSignCard.scrollIntoViewIfNeeded();
						await studentPage.screenshot({
							path: reportPath(
								`${readingPotIssue}-student-reading-${vp.label}.png`,
							),
						});
					}
				}
				if (readingPotIssue) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await firstSignCard.scrollIntoViewIfNeeded();
					await studentPage.evaluate(() =>
						document.documentElement.classList.add("dark"),
					);
					await studentPage.screenshot({
						path: reportPath(
							`${readingPotIssue}-student-reading-desktop-dark.png`,
						),
					});
					await studentPage.evaluate(() =>
						document.documentElement.classList.remove("dark"),
					);
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });

				// Chuyển Writing và viết bài ngắn
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Writing/ })
					.click();
				await expect(
					studentPage.getByTestId("placement-step-writing"),
				).toBeVisible();
				await studentPage
					.locator("textarea")
					.fill(
						"I want to improve my English communication skills for university study and future career.",
					);

				// Chuyển Speaking, chọn Bỏ qua phần Speaking để nộp bài 4 phần
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Speaking/ })
					.click();
				await studentPage
					.getByRole("button", { name: /Bỏ qua phần Speaking/ })
					.click();

				await studentPage.getByTestId("submit-placement-test-btn").click();
				// Nếu còn câu trắc nghiệm bỏ trống, xác nhận "Vẫn nộp bài ngay"
				const confirmBox = studentPage.getByTestId(
					"placement-unanswered-confirm",
				);
				if (await confirmBox.isVisible()) {
					await confirmBox
						.getByRole("button", { name: "Vẫn nộp bài ngay" })
						.click();
				}

				await expect(
					studentPage.getByTestId("placement-pending-view"),
				).toBeVisible({ timeout: 20_000 });
				await expect(studentPage.getByTestId("nav-placement-badge")).toHaveText(
					"Chờ chấm",
				);

				// 5. Lấy studentId từ DB để mở trang giáo viên /students/$studentId
				const db = await openDb();
				let studentId = "";
				try {
					const sRow = await db.execute({
						sql: "SELECT id FROM student WHERE lower(trim(email)) = lower(?) LIMIT 1",
						args: [email],
					});
					studentId = String(sRow.rows[0]?.id ?? "");
					expect(studentId).not.toBe("");
				} finally {
					db.close();
				}

				await teacherPage.goto(`${WEB_ORIGIN}/students/${studentId}`);
				await expect(
					teacherPage.getByTestId("placement-submission-panel"),
				).toBeVisible({ timeout: 20_000 });
				await teacherPage.setViewportSize({ width: 1440, height: 900 });
				await teacherPage.screenshot({
					path: reportPath("748-web-student-grade-desktop-1440x900.png"),
				});

				// Chốt điểm bài làm trên trang chi tiết học viên
				await Promise.all([
					teacherPage.waitForResponse(
						(res) =>
							new RegExp(
								`/api/students/${studentId}/placement-submission$`,
							).test(res.url()) &&
							res.request().method() === "PATCH" &&
							res.status() === 200,
					),
					teacherPage.getByTestId("save-placement-grade-btn").click(),
				]);

				// entryScore trên hồ sơ học viên tự cập nhật
				await expect(
					teacherPage.getByTestId("student-entry-score"),
				).not.toHaveText("Chưa có", { timeout: 15_000 });

				// 6. Học viên tải lại /placement-test thấy kết quả chính thức
				await studentPage.reload();
				await expect(
					studentPage.getByTestId("placement-graded-view"),
				).toBeVisible({ timeout: 20_000 });
				await expect(
					studentPage.getByTestId("nav-placement-badge"),
				).not.toBeVisible();
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.screenshot({
					path: reportPath("748-student-placement-graded-desktop-1440x900.png"),
				});
			} finally {
				await studentContext.close();
				await teacherContext.close();
			}
		});
	});
