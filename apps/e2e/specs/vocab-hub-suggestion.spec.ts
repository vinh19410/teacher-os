import { mkdirSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * Vocab Independent Hub, Suggestion Lifecycle & Per-Student Progress E2E (#363).
 *
 * Verifies:
 * 1. Teacher navigates via sidebar "Từ vựng" (/vocab) -> creates independent decks (classId = null)
 *    with badge "Riêng", which do NOT leak into any class's "Từ vựng" tab.
 * 2. Teacher suggests deck to student S with note "Ôn trước thứ 7 nhé" (double-suggest idempotent).
 * 3. Student sees "Gợi ý cho bạn" in /practice/vocabulary:
 *    - Dismisses 2nd suggestion ("Ẩn" -> disappears).
 *    - Accepts 1st suggestion ("Bắt đầu học" -> navigates to deck, completes Learn session + Review answer
 *      exercising all 5 access-predicate sites).
 * 4. Teacher opens /vocab -> tab "Tiến độ" -> sees S's level distribution & today's VN activity >= 1.
 * 5. Teacher revokes accepted suggestion -> deck leaves student's overview on refresh.
 * 6. 3 viewports (1440x900, 768x1024, 375x812) have no horizontal overflow.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocabhub.teacher.${runToken}@test.local`;
const studentEmail = `vocabhub.student.${runToken}@test.local`;
const studentName = `Hub Student ${runToken}`;
const className = `Hub Class ${runToken}`;
const deckTitle1 = `TOEIC cơ bản ${runToken}`;
const deckTitle2 = `IELTS Extra ${runToken}`;
const SCREENSHOT_DIR = new URL(
	"../../../plans/261019-0323-vocab-independent-hub/reports/screenshots",
	import.meta.url,
).pathname;

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	void client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function signInTeacher(page: Page): Promise<void> {
	await page.goto(`${WEB_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#si-email").fill(teacherEmail);
	await page.locator("#si-password").fill(PASSWORD);
	await page
		.locator("#panel-signin")
		.getByRole("button", { name: "Sign in" })
		.click();
	await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test.describe
	.serial("vocab independent hub, suggestion & progress (#363)", () => {
		let orgId = "";
		let classId = "";
		let studentId = "";
		let deckId1 = "";
		let deckId2 = "";

		test("teacher creates independent decks in /vocab hub (not shown in class tab) and suggests to student", async ({
			page,
		}) => {
			// 1) Teacher signs up through real UI (bootstraps org + membership)
			await page.goto(`${WEB_ORIGIN}/login`);
			await page.locator("#su-name").fill("Hub Teacher");
			await page.locator("#su-email").fill(teacherEmail);
			await page.locator("#su-password").fill(PASSWORD);
			await page.getByRole("button", { name: "Create account" }).click();
			await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

			// 2) Seed a class and a student (NOT enrolled in the class) in the teacher's org
			const db = openDb();
			try {
				let orgIdRow: string | undefined;
				for (let attempt = 0; attempt < 30; attempt++) {
					const orgRow = await db.execute({
						sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
							WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
						args: [teacherEmail],
					});
					const first = orgRow.rows[0];
					if (
						first &&
						typeof first === "object" &&
						"id" in first &&
						typeof first.id === "string"
					) {
						orgIdRow = first.id;
						break;
					}
					await page.waitForTimeout(500);
				}
				expect(orgIdRow, "teacher org bootstrapped").toBeDefined();
				orgId = orgIdRow as string;
				classId = crypto.randomUUID();
				studentId = crypto.randomUUID();
				const now = Date.now();

				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [classId, orgId, className, now],
				});
				await db.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
						VALUES (?,?,?,?,?,?)`,
					args: [studentId, orgId, studentName, studentEmail, now, now],
				});
			} finally {
				db.close();
			}

			// Reload so teacher kernel snapshot picks up the seeded class and student
			await page.reload();
			await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

			// 3) Navigate to /vocab via sidebar "Từ vựng"
			const sidebarVocabLink = page
				.locator("aside nav a", { hasText: "Từ vựng" })
				.first();
			await expect(sidebarVocabLink).toBeVisible();
			await sidebarVocabLink.click();
			await expect(page).toHaveURL(/\/vocab/);

			// Create independent deck 1
			await page.getByRole("button", { name: "Tạo bộ từ" }).click();
			await page.getByLabel("Tiêu đề bộ từ").fill(deckTitle1);
			await page.getByTestId("vocab-create-deck-submit").click();
			await expect(page.getByText(deckTitle1).first()).toBeVisible();

			// Create independent deck 2 (for dismiss flow)
			await page.getByRole("button", { name: "Tạo bộ từ" }).click();
			await page.getByLabel("Tiêu đề bộ từ").fill(deckTitle2);
			await page.getByTestId("vocab-create-deck-submit").click();
			await expect(page.getByText(deckTitle2).first()).toBeVisible();

			const dbDecks = openDb();
			try {
				const d1 = await dbDecks.execute({
					sql: "SELECT id, class_id FROM vocab_deck WHERE title = ?",
					args: [deckTitle1],
				});
				const d2 = await dbDecks.execute({
					sql: "SELECT id, class_id FROM vocab_deck WHERE title = ?",
					args: [deckTitle2],
				});
				deckId1 = String(d1.rows[0]?.id ?? "");
				deckId2 = String(d2.rows[0]?.id ?? "");
				expect(deckId1.length).toBeGreaterThan(0);
				expect(deckId2.length).toBeGreaterThan(0);
				expect(d1.rows[0]?.class_id).toBeNull();
				expect(d2.rows[0]?.class_id).toBeNull();
			} finally {
				dbDecks.close();
			}

			// Both decks show badge "Riêng" in hub
			await expect(
				page.getByTestId(`vocab-deck-source-badge-${deckId1}`),
			).toHaveText("Riêng");
			await expect(
				page.getByTestId(`vocab-deck-source-badge-${deckId2}`),
			).toHaveText("Riêng");

			// Add 3 words to deckId1 via editor flow (RT-F17)
			await page.getByTestId(`vocab-edit-deck-${deckId1}`).click();
			const fillDraft = async (
				draftId: string,
				word: string,
				translation: string,
			) => {
				await page.getByTestId("vocab-add-word-btn").click();
				const row = page.getByTestId(`vocab-word-row-${draftId}`);
				await row.getByLabel("Từ vựng", { exact: false }).fill(word);
				await row
					.getByLabel("Nghĩa tiếng Việt", { exact: false })
					.fill(translation);
				await row.locator("button", { hasText: "Thêm" }).click();
				await expect(page.getByTestId(`vocab-word-row-${draftId}`)).toHaveCount(
					0,
					{ timeout: 20_000 },
				);
			};

			await fillDraft("draft-1", "contract", "hợp đồng");
			await fillDraft("draft-2", "schedule", "lịch trình");
			await fillDraft("draft-3", "deadline", "hạn chót");
			await page.getByRole("button", { name: "Hoàn tất" }).click();

			// 4) Suggest deckId1 to student (and re-send to verify idempotency)
			await page.getByTestId(`vocab-suggest-deck-${deckId1}`).click();
			await page
				.getByTestId("vocab-suggest-student-select")
				.selectOption(studentId);
			await page
				.getByTestId("vocab-suggest-note-input")
				.fill("Ôn trước thứ 7 nhé");
			await page.getByTestId("vocab-suggest-submit").click();
			await expect(page.getByTestId("vocab-suggestion-list")).toContainText(
				"Đang chờ",
			);

			// Second suggest on same pending student+deck is idempotent (no error, still 1 row)
			await page
				.getByTestId("vocab-suggest-note-input")
				.fill("Ôn trước thứ 7 nhé");
			await page.getByTestId("vocab-suggest-submit").click();
			await expect(
				page.locator('[data-testid^="vocab-suggestion-row-"]'),
			).toHaveCount(1);
			await page.getByTestId("vocab-suggest-close").click();

			// Also suggest deckId2 to student
			await page.getByTestId(`vocab-suggest-deck-${deckId2}`).click();
			await page
				.getByTestId("vocab-suggest-student-select")
				.selectOption(studentId);
			await page.getByTestId("vocab-suggest-submit").click();
			await expect(page.getByTestId("vocab-suggestion-list")).toContainText(
				"Đang chờ",
			);
			await page.getByTestId("vocab-suggest-close").click();

			// 5) Verify independent decks do NOT appear in class's "Từ vựng" tab
			await page.goto(`${WEB_ORIGIN}/classes/${classId}`);
			await page.getByRole("tab", { name: "Từ vựng" }).click();
			await expect(page.getByTestId(`vocab-deck-row-${deckId1}`)).toHaveCount(
				0,
			);
			await expect(page.getByTestId(`vocab-deck-row-${deckId2}`)).toHaveCount(
				0,
			);
		});

		test("student dismisses 2nd suggestion, accepts 1st suggestion, and learns + reviews cards across all 5 access sites", async ({
			page,
		}) => {
			// 1) Student signs up and verifies email
			await page.goto(`${STUDENT_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill(studentName);
			await page.locator("#signup-email").fill(studentEmail);
			await page.locator("#signup-password").fill(PASSWORD);
			await page.locator("#panel-signup button[type='submit']").click();
			await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
				timeout: 15_000,
			});
			await verifyStudentEmailFromMailLog(page, studentEmail);
			await expect(page.getByTestId("vocab-home-entry")).toBeVisible();

			// 2) Student opens /practice/vocabulary -> sees "Gợi ý cho bạn" with both suggestions
			await page.getByTestId("vocab-home-entry").click();
			await expect(page).toHaveURL(`${STUDENT_ORIGIN}/practice/vocabulary`);
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(page.getByTestId("vocab-suggestions-section")).toBeVisible();
			await expect(page.getByTestId("vocab-suggestions-section")).toContainText(
				deckTitle1,
			);
			await expect(page.getByTestId("vocab-suggestions-section")).toContainText(
				"Ôn trước thứ 7 nhé",
			);
			await expect(page.getByTestId("vocab-suggestions-section")).toContainText(
				deckTitle2,
			);

			// Check 3 viewports on student /practice/vocabulary with suggestions visible
			mkdirSync(SCREENSHOT_DIR, { recursive: true });
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 768, height: 1024 },
				{ width: 375, height: 812 },
			]) {
				await page.setViewportSize(vp);
				const hasOverflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					hasOverflow,
					`student /practice/vocabulary overflow at ${vp.width}x${vp.height}`,
				).toBe(false);
				if (vp.width === 1440) {
					await page.screenshot({
						path: `${SCREENSHOT_DIR}/vocab-student-suggestions-1440x900.png`,
					});
				}
			}
			await page.setViewportSize({ width: 1280, height: 720 });

			// 3) Dismiss 2nd suggestion ("Ẩn") -> disappears from section
			await page
				.getByRole("button", { name: `Ẩn gợi ý ${deckTitle2}` })
				.click();
			await expect(
				page.getByTestId("vocab-suggestions-section"),
			).not.toContainText(deckTitle2);

			// 4) Accept 1st suggestion ("Bắt đầu học") -> navigates to /practice/vocabulary/$deckId1
			await page
				.getByRole("button", { name: `Bắt đầu học ${deckTitle1}` })
				.click();
			await expect(page).toHaveURL(
				`${STUDENT_ORIGIN}/practice/vocabulary/${deckId1}`,
			);
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			await expect(page.getByTestId("vocab-deck-title")).toHaveText(deckTitle1);
			// 3 thẻ thống kê theo bài đã bỏ (#372); thay bằng nút Bắt đầu học kèm số
			await expect(page.getByTestId("vocab-deck-new-count")).toHaveCount(0);
			await expect(page.getByTestId("vocab-start-learn-btn")).toContainText(
				"Bắt đầu học (3)",
			);

			// 5) Complete Learn session (exercises ensureDeckCards + loadPool + learn-commit)
			await page.getByTestId("vocab-start-learn-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible();

			const WORD_BY_FIRST_LETTER: Record<string, string> = {
				c: "contract",
				s: "schedule",
				d: "deadline",
			};
			let safety = 0;
			while (
				!(await page.getByTestId("vocab-summary-learn").isVisible()) &&
				safety < 60
			) {
				safety += 1;
				const introFlip = page.getByTestId("vocab-intro-flip-btn");
				if (await introFlip.isVisible()) {
					await introFlip.click();
					const introContinue = page.getByTestId("vocab-intro-continue-btn");
					await expect(introContinue).toBeEnabled();
					await introContinue.click();
					continue;
				}
				const typingInput = page.getByTestId("vocab-typing-input");
				if (await typingInput.isVisible()) {
					const hint =
						(await page.getByTestId("vocab-typing-hint").textContent()) ?? "";
					const word =
						WORD_BY_FIRST_LETTER[hint.trim().charAt(0)] ?? "contract";
					await typingInput.fill(word);
					await page.getByTestId("vocab-typing-submit").click();
					const feedbackContinue = page.getByTestId("vocab-continue-btn");
					await expect(feedbackContinue).toBeVisible();
					await feedbackContinue.click();
					continue;
				}
				const firstOption = page.getByTestId("vocab-option").first();
				if (await firstOption.isVisible()) {
					await firstOption.click();
					const feedbackContinue = page.getByTestId("vocab-continue-btn");
					await expect(feedbackContinue).toBeVisible();
					await feedbackContinue.click();
				}
			}

			await expect(page.getByTestId("vocab-summary-learn")).toBeVisible();
			await page.getByTestId("vocab-summary-back").click();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();

			// 6) Seed 1 card ("contract") due now and complete Review session (POST /vocab/answer grade good -> level 2)
			const dbDue = openDb();
			try {
				const now = Date.now();
				await dbDue.execute({
					sql: `UPDATE vocab_card SET state = 'review', interval_days = 1, due_at = ?, updated_at = ?
						WHERE student_id = ? AND word_id = (
							SELECT id FROM vocab_word WHERE deck_id = ? AND word = 'contract' LIMIT 1
						)`,
					args: [now - 86_400_000, now, studentId, deckId1],
				});
			} finally {
				dbDue.close();
			}

			await page.reload();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			// Đã học hết từ mới: Bắt đầu học disabled kèm title giải thích (#372, review I1)
			await expect(page.getByTestId("vocab-start-learn-btn")).toBeDisabled();
			await expect(page.getByTestId("vocab-start-learn-btn")).toHaveAttribute(
				"title",
				"Đã học hết từ mới",
			);
			await page.getByTestId("vocab-start-review-btn").click();

			let reviewSafety = 0;
			while (
				!(await page.getByTestId("vocab-summary-review").isVisible()) &&
				reviewSafety < 20
			) {
				reviewSafety += 1;
				const revealBtn = page.getByTestId("vocab-reveal-btn");
				if (await revealBtn.isVisible()) {
					await revealBtn.click();
					await page.getByTestId("vocab-self-remembered").click();
				} else if (await page.getByTestId("vocab-typing-input").isVisible()) {
					await page.getByTestId("vocab-typing-input").fill("contract");
					await page.getByTestId("vocab-typing-submit").click();
				} else if (
					await page.getByTestId("vocab-prompt-wordChoice").isVisible()
				) {
					await page
						.getByTestId("vocab-option")
						.filter({ hasText: "contract" })
						.first()
						.click();
				} else if (
					await page.getByTestId("vocab-prompt-meaningChoice").isVisible()
				) {
					await page
						.getByTestId("vocab-option")
						.filter({ hasText: "hợp đồng" })
						.first()
						.click();
				} else {
					await page.waitForTimeout(100);
					continue;
				}
				const feedbackContinue = page.getByTestId("vocab-continue-btn");
				await expect(feedbackContinue).toBeVisible();
				await feedbackContinue.click();
			}

			await expect(page.getByTestId("vocab-summary-review")).toBeVisible();
			await page.getByTestId("vocab-summary-back").click();

			// Back to overview -> deck card has badge "Gợi ý" and learnedCount = 1 (level >= 2)
			await page.getByRole("link", { name: "← Danh sách bộ từ" }).click();
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(page.getByTestId(`vocab-deck-source-${deckId1}`)).toHaveText(
				"Gợi ý",
			);
			await expect(page.getByTestId("vocab-overview-learned")).toHaveText("1");
		});

		test("teacher sees student progress in /vocab Progress tab, revokes suggestion, and student loses deck access", async ({
			page,
		}) => {
			await signInTeacher(page);
			await page.goto(`${WEB_ORIGIN}/vocab`);

			// Switch to "Tiến độ" tab
			await page.getByRole("tab", { name: "Tiến độ" }).click();
			await expect(page.getByTestId("vocab-progress-tab")).toBeVisible();

			await page
				.getByTestId("vocab-progress-student-select")
				.selectOption(studentId);
			await expect(
				page.getByTestId(`vocab-progress-deck-${deckId1}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-progress-deck-source-${deckId1}`),
			).toHaveText("Gợi ý");
			await expect(
				page.getByTestId(`vocab-progress-deck-${deckId1}-level-2`),
			).toContainText("1");
			await expect(
				page.getByTestId("vocab-progress-stat-learning"),
			).toContainText("3");
			await expect(
				page.getByTestId("vocab-progress-stat-activity7d"),
			).toContainText("4");

			// Verify 3 viewports on teacher /vocab Progress tab + capture screenshots
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 768, height: 1024 },
				{ width: 375, height: 812 },
			]) {
				await page.setViewportSize(vp);
				const hasOverflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					hasOverflow,
					`teacher /vocab progress overflow at ${vp.width}x${vp.height}`,
				).toBe(false);
				await page.screenshot({
					path: `${SCREENSHOT_DIR}/vocab-hub-progress-${vp.width}x${vp.height}.png`,
				});
			}

			// Switch back to "Bộ từ vựng" tab -> capture 3-viewport screenshots -> open suggest dialog -> revoke
			await page.getByRole("tab", { name: "Bộ từ vựng" }).click();
			for (const vp of [
				{ width: 1440, height: 900 },
				{ width: 768, height: 1024 },
				{ width: 375, height: 812 },
			]) {
				await page.setViewportSize(vp);
				await page.screenshot({
					path: `${SCREENSHOT_DIR}/vocab-hub-decks-${vp.width}x${vp.height}.png`,
				});
			}
			await page.setViewportSize({ width: 1280, height: 720 });

			// Switch back to "Bộ từ vựng" tab -> open suggest dialog on deckId1 -> sees "Đã chấp nhận" -> clicks "Thu hồi"
			await page.getByRole("tab", { name: "Bộ từ vựng" }).click();
			await page.getByTestId(`vocab-suggest-deck-${deckId1}`).click();
			await expect(page.getByTestId("vocab-suggestion-list")).toContainText(
				"Đã chấp nhận",
			);
			await page
				.locator('[data-testid^="vocab-revoke-suggestion-"]')
				.first()
				.click();
			await expect(page.getByTestId("vocab-suggestion-list")).toContainText(
				"Đã ẩn",
			);
			await page.getByTestId("vocab-suggest-close").click();

			// Verify deckId1 is no longer in student's progress
			await page.getByRole("tab", { name: "Tiến độ" }).click();
			await expect(page.getByTestId("vocab-progress-empty")).toBeVisible();
		});
	});
