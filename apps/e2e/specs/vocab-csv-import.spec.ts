import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, verifyStudentEmailFromMailLog } from "./helpers";
import { LMS_ORIGIN, STUDENT_BASE_URL, TEACHER_BASE_URL } from "./origins";

/**
 * Vocab CSV Import & Lesson/Chunk Alignment E2E (#815):
 * 1. Teacher signs up, navigates to /vocab, imports `docs/vocab-sample/Lesson 01 – Friends & Introductions.csv`,
 *    verifies preview (1 deck, 28 items: 16 Word + 12 Chunk), submits, verifies metadata & 28 từ.
 * 2. Teacher opens VocabDeckEditorDialog, checks Word/Chunk + POS + Example fields, appends 1 chunk via editor Import CSV -> 29 từ.
 * 3. Teacher suggests deck to student -> Student accepts, views deck detail (Lesson/Topic meta, Chunk badge, POS, Example),
 *    starts Learn session, verifies LearnIntroCard reveals Example only on flip.
 * 4. Checks 3 viewports (1440x900, 768x1024, 375x812) in light & dark mode with zero horizontal overflow.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocabcsv.teacher.${runToken}@test.local`;
const studentEmail = `vocabcsv.student.${runToken}@test.local`;
const studentName = `CSV Student ${runToken}`;
const SAMPLE_CSV_PATH = fileURLToPath(
	new URL(
		"../../../docs/vocab-sample/Lesson 01 – Friends & Introductions.csv",
		import.meta.url,
	).href,
);
const POT_SCREENSHOT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url).href,
);

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	void client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
	const overflow = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}));
	expect(
		overflow.scrollWidth,
		`${label}: scrollWidth (${overflow.scrollWidth}) > innerWidth (${overflow.innerWidth})`,
	).toBeLessThanOrEqual(overflow.innerWidth);
}

async function captureViewportShots(
	page: Page,
	prefix: string,
	theme: "light" | "dark",
) {
	const viewports: Array<[number, number, string]> = [
		[1440, 900, "desktop"],
		[768, 1024, "tablet"],
		[375, 812, "mobile"],
	];
	for (const [width, height, vp] of viewports) {
		await page.setViewportSize({ width, height });
		await page.waitForTimeout(150);
		await assertNoHorizontalOverflow(page, `${prefix}-${theme}-${vp}`);
		if (process.env.SAVE_POT_SCREENSHOTS === "1") {
			mkdirSync(POT_SCREENSHOT_DIR, { recursive: true });
			await page.screenshot({
				path: `${POT_SCREENSHOT_DIR}/815-${prefix}-${theme}-${vp}.png`,
				fullPage: false,
			});
		}
	}
	await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe
	.serial("vocab CSV import & Word/Chunk/POS/Example alignment (#815)", () => {
		let orgId = "";
		let studentId = "";
		let deckId = "";

		test("teacher imports lesson CSV, appends via editor, and suggests deck to student", async ({
			page,
		}) => {
			await signUpViaApi(page, {
				name: "CSV Teacher",
				email: teacherEmail,
				password: PASSWORD,
			});

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
				expect(orgIdRow).toBeDefined();
				orgId = orgIdRow as string;
				studentId = crypto.randomUUID();
				const now = Date.now();
				await db.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
						VALUES (?,?,?,?,?,?)`,
					args: [studentId, orgId, studentName, studentEmail, now, now],
				});
			} finally {
				db.close();
			}

			await page.goto(`${TEACHER_BASE_URL}/vocab`);
			await expect(page.getByTestId("vocab-import-csv-btn")).toBeVisible();
			await page.getByTestId("vocab-import-csv-btn").click();
			await page
				.getByTestId("vocab-csv-file-input")
				.setInputFiles(SAMPLE_CSV_PATH);

			const preview = page.getByTestId("vocab-csv-preview");
			await expect(preview).toBeVisible();
			await expect(preview).toContainText(
				"Lesson 01 – Friends & Introductions",
			);
			await expect(preview).toContainText("16 từ đơn · 12 cụm từ");
			await expect(preview).toContainText("+8 từ/cụm nữa");

			await page.getByTestId("vocab-csv-submit-btn").click();
			await expect(preview).toHaveCount(0, { timeout: 20_000 });

			const db2 = openDb();
			try {
				let foundDeckId: string | undefined;
				for (let attempt = 0; attempt < 20; attempt++) {
					const rows = await db2.execute({
						sql: "SELECT id FROM vocab_deck WHERE org_id = ? AND lesson_number = 1 ORDER BY created_at DESC LIMIT 1",
						args: [orgId],
					});
					const first = rows.rows[0];
					if (
						first &&
						typeof first === "object" &&
						"id" in first &&
						typeof first.id === "string"
					) {
						foundDeckId = first.id;
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(foundDeckId).toBeDefined();
				deckId = foundDeckId as string;
			} finally {
				db2.close();
			}

			await expect(page.getByTestId(`vocab-deck-row-${deckId}`)).toContainText(
				"28 từ",
			);
			await expect(
				page.getByTestId(`vocab-deck-lesson-meta-${deckId}`),
			).toContainText("Buổi 01 · Friends & Introductions");

			// Open editor, verify Chunk + POS + Example, and append 1 row via editor Import CSV
			await page.getByTestId(`vocab-edit-deck-${deckId}`).click();
			const editorRows = page.locator('[data-testid^="vocab-word-row-"]');
			await expect(editorRows).toHaveCount(28, { timeout: 15_000 });
			const hangOutRow = editorRows.nth(15);
			await expect(hangOutRow.getByLabel("Từ vựng")).toHaveValue("hang out");
			await expect(hangOutRow.getByLabel("Từ loại")).toHaveValue("phr. v.");
			const chunkRow = editorRows.nth(6);
			await expect(chunkRow.getByLabel("Loại", { exact: true })).toHaveValue(
				"chunk",
			);
			await expect(chunkRow.getByLabel("Từ vựng")).toHaveValue(
				"be from + (city / country)",
			);

			await page.getByTestId("vocab-editor-import-csv-btn").click();
			const appendCsv = [
				"Type,Word / Chunk,IPA,Part of speech,Vietnamese,Example",
				"Chunk,keep in touch,,,giữ liên lạc,Let's keep in touch after class.",
			].join("\n");
			await page.getByTestId("vocab-csv-file-input").setInputFiles({
				name: "append-extra.csv",
				mimeType: "text/csv",
				buffer: Buffer.from(appendCsv, "utf8"),
			});
			await expect(page.getByTestId("vocab-csv-preview")).toContainText(
				"keep in touch",
			);
			await page.getByTestId("vocab-csv-submit-btn").click();
			await expect(editorRows).toHaveCount(29, { timeout: 15_000 });
			await expect(editorRows.nth(28).getByLabel("Từ vựng")).toHaveValue(
				"keep in touch",
			);

			await captureViewportShots(page, "teacher-editor", "light");
			await page.getByRole("button", { name: "Hoàn tất" }).click();

			await expect(page.getByTestId(`vocab-deck-row-${deckId}`)).toContainText(
				"29 từ",
			);

			await captureViewportShots(page, "teacher-vocab", "light");
			const themeToggle = page.getByRole("switch", { name: "Giao diện tối" });
			if (await themeToggle.isVisible()) {
				await themeToggle.click();
				await captureViewportShots(page, "teacher-vocab", "dark");
				await themeToggle.click();
			}

			// Suggest deck to student
			await page.getByTestId(`vocab-suggest-deck-${deckId}`).click();
			await page
				.getByTestId("vocab-suggest-student-select")
				.selectOption(studentId);
			await page.getByTestId("vocab-suggest-submit").click();
			await expect(page.getByTestId("vocab-suggestion-list")).toContainText(
				studentName,
				{ timeout: 15_000 },
			);
			await page.getByTestId("vocab-suggest-close").click();
			await expect(
				page.getByTestId(`vocab-deck-pending-badge-${deckId}`),
			).toBeVisible({ timeout: 15_000 });
		});

		test("student accepts suggested CSV deck and sees Word/Chunk, POS, and reveal-gated Example", async ({
			page,
		}) => {
			await page.goto(`${LMS_ORIGIN}/login`);
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

			await page.goto(`${STUDENT_BASE_URL}/practice/vocabulary`);
			const acceptSuggestionBtn = page.getByRole("button", {
				name: "Bắt đầu học Lesson 01 – Friends & Introductions",
			});
			await expect(acceptSuggestionBtn).toBeVisible({ timeout: 15_000 });
			await acceptSuggestionBtn.click();

			await expect(page).toHaveURL(
				new RegExp(`/practice/vocabulary/${deckId}$`),
				{ timeout: 15_000 },
			);
			await expect(page.getByTestId("vocab-deck-meta")).toContainText(
				"Buổi 01 · Friends & Introductions",
			);
			const rows = page.getByTestId("vocab-deck-word-row");
			await expect(rows).toHaveCount(29);
			await expect(
				page.locator('[data-testid="vocab-deck-word-row"]', {
					hasText: "hang out",
				}),
			).toContainText("phr. v.");
			await expect(
				page.locator('[data-testid="vocab-deck-word-row"]', {
					hasText: "be from + (city / country)",
				}),
			).toContainText("Chunk");

			await captureViewportShots(page, "student-deck", "light");
			const themeToggle = page.getByRole("switch", { name: "Giao diện tối" });
			if (await themeToggle.isVisible()) {
				await themeToggle.click();
				await captureViewportShots(page, "student-deck", "dark");
				await themeToggle.click();
			}

			// Start learn session -> first word is "introduce" (file order index 0!)
			await page.getByTestId("vocab-start-learn-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible({
				timeout: 15_000,
			});
			await expect(page.getByTestId("vocab-intro-word")).toHaveText(
				"introduce",
			);
			await expect(page.getByTestId("vocab-intro-entry-type")).toHaveText(
				"Word",
			);
			await expect(page.getByTestId("vocab-intro-pos")).toContainText("v.");
			await expect(page.getByTestId("vocab-intro-example")).toHaveCount(0);

			await page.getByTestId("vocab-intro-flip-btn").click();
			await expect(page.getByTestId("vocab-intro-example")).toContainText(
				"Can I introduce my friend Nam?",
			);
			await captureViewportShots(page, "student-intro", "light");
		});
	});
