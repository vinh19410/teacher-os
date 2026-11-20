import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { signUpViaApi, verifyStudentEmailFromMailLog } from "./helpers";
import { LMS_ORIGIN, TEACHER_BASE_URL } from "./origins";

const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocabteacher.clone.${runToken}@test.local`;
const studentEmail = `vocabteacher.student.${runToken}@test.local`;
const classAlphaName = `IELTS Alpha ${runToken}`;
const classBetaName = `IELTS Beta ${runToken}`;

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	void client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

test.describe
	.serial("teacher-created vocab deck picker & clone flow", () => {
		let orgId = "";
		let classAlphaId = "";
		let classBetaId = "";
		let studentId = "";
		let hubDeckId = "";
		let alphaDeckId = "";
		let betaOwnDeckId = "";
		let clonedHubDeckIdInBeta = "";
		let clonedAlphaDeckIdInBeta = "";

		test("teacher filters, selects, and clones teacher-created decks into class and hub with responsive + light/dark verification", async ({
			page,
		}) => {
			const potDir = process.env.CAPTURE_POT_DIR?.trim() ?? "";
			if (potDir) {
				mkdirSync(potDir, { recursive: true });
			}

			await signUpViaApi(page, {
				name: "Vocab Bank Teacher",
				email: teacherEmail,
				password: PASSWORD,
			});

			const db = openDb();
			try {
				let resolvedOrgId: string | undefined;
				for (let attempt = 0; attempt < 30; attempt++) {
					const orgRow = await db.execute({
						sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
						WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
						args: [teacherEmail],
					});
					const first = orgRow.rows[0];
					if (first && typeof first.id === "string") {
						resolvedOrgId = first.id;
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(resolvedOrgId, "teacher org bootstrapped").toBeDefined();
				orgId = resolvedOrgId as string;

				classAlphaId = crypto.randomUUID();
				classBetaId = crypto.randomUUID();
				studentId = crypto.randomUUID();
				hubDeckId = crypto.randomUUID();
				alphaDeckId = crypto.randomUUID();
				betaOwnDeckId = crypto.randomUUID();
				const now = Date.now();

				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [classAlphaId, orgId, classAlphaName, now],
				});
				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [classBetaId, orgId, classBetaName, now + 1],
				});
				await db.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
					VALUES (?,?,?,?,?,?)`,
					args: [studentId, orgId, "Beta Student", studentEmail, now, now],
				});
				await db.execute({
					sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
					VALUES (?,?,?,?, 'active', ?)`,
					args: [crypto.randomUUID(), orgId, classBetaId, studentId, now],
				});

				// Independent Hub deck (Riêng)
				await db.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at)
					VALUES (?,?,NULL,?,?,?,?,?,?)`,
					args: [
						hubDeckId,
						orgId,
						"Unit 1: Environment Core",
						1,
						"Environment",
						"en",
						now,
						now,
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_word (id, deck_id, word, entry_type, ipa, pos, translation, example, sort_order, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
					args: [
						crypto.randomUUID(),
						hubDeckId,
						"mitigate",
						"word",
						"/ˈmɪt.ɪ.ɡeɪt/",
						"v",
						"giảm nhẹ",
						"Policies help mitigate climate risks.",
						0,
						now,
						now,
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_word (id, deck_id, word, entry_type, ipa, pos, translation, example, sort_order, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
					args: [
						crypto.randomUUID(),
						hubDeckId,
						"take action against",
						"chunk",
						null,
						null,
						"hành động chống lại",
						"Governments must take action against pollution.",
						1,
						now,
						now,
					],
				});

				// Deck from Class Alpha
				await db.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?)`,
					args: [
						alphaDeckId,
						orgId,
						classAlphaId,
						"Speaking Part 1 Collocations",
						2,
						"Speaking",
						"en",
						now + 10,
						now + 10,
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_word (id, deck_id, word, entry_type, ipa, pos, translation, example, sort_order, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
					args: [
						crypto.randomUUID(),
						alphaDeckId,
						"unwind",
						"word",
						"/ʌnˈwaɪnd/",
						"v",
						"thư giãn",
						"I listen to music to unwind after class.",
						0,
						now + 10,
						now + 10,
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_word (id, deck_id, word, entry_type, ipa, pos, translation, example, sort_order, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
					args: [
						crypto.randomUUID(),
						alphaDeckId,
						"hit the books",
						"chunk",
						null,
						null,
						"học bài chăm chỉ",
						"I need to hit the books before the mock test.",
						1,
						now + 10,
						now + 10,
					],
				});

				// Own deck already in Class Beta (must be excluded from picker)
				await db.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, title, lang, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?)`,
					args: [
						betaOwnDeckId,
						orgId,
						classBetaId,
						"Beta Own Deck",
						"en",
						now,
						now,
					],
				});
			} finally {
				db.close();
			}

			// Navigate to Class Beta -> Từ vựng tab
			await page.goto(`${TEACHER_BASE_URL}/classes`);
			const classCard = page.locator("h3", { hasText: classBetaName });
			await expect(classCard).toBeVisible();
			await classCard.click();
			await page.getByRole("tab", { name: "Từ vựng" }).click();

			// Open "Thêm từ thư viện"
			await page.getByTestId("vocab-add-from-library").click();

			// Default tab is "Thư viện hệ thống"
			const libraryTab = page.getByRole("tab", { name: "Thư viện hệ thống" });
			const teacherTab = page.getByRole("tab", { name: "Bộ từ đã tạo" });
			await expect(libraryTab).toHaveAttribute("aria-selected", "true");
			await expect(teacherTab).toHaveAttribute("aria-selected", "false");

			// Switch to "Bộ từ đã tạo" via keyboard Enter after focus
			await teacherTab.focus();
			await page.keyboard.press("Enter");
			await expect(teacherTab).toHaveAttribute("aria-selected", "true");
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toBeVisible();

			// Own class deck excluded; Hub & Alpha decks visible with badges
			await expect(
				page.getByTestId(`vocab-teacher-deck-${betaOwnDeckId}`),
			).toHaveCount(0);
			await expect(
				page.getByTestId(`vocab-teacher-deck-${hubDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${alphaDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-teacher-source-badge-${hubDeckId}`),
			).toHaveText("Riêng");
			await expect(
				page.getByTestId(`vocab-teacher-source-badge-${alphaDeckId}`),
			).toHaveText(`Lớp ${classAlphaName}`);
			await expect(
				page.getByTestId(`vocab-teacher-lesson-meta-${hubDeckId}`),
			).toContainText("Buổi 01 · Environment");

			// Select 1 deck for realistic visual screenshot state, check 3 viewports + 320px + dark mode
			await page
				.getByTestId(`vocab-teacher-deck-checkbox-${hubDeckId}`)
				.click();
			await expect(
				page.getByTestId("vocab-library-selection-summary"),
			).toContainText("Đã chọn 1 bộ · 2 từ");

			for (const vp of [
				{ width: 1440, height: 900, name: "desktop-1440x900" },
				{ width: 768, height: 1024, name: "tablet-768x1024" },
				{ width: 375, height: 812, name: "mobile-375x812" },
			]) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no horizontal overflow at ${vp.name}`).toBe(false);
				if (potDir) {
					await page.screenshot({
						path: join(potDir, `825-teacher-vocab-tab-${vp.name}-light.png`),
					});
				}
			}

			// 320px reflow check for modal panel and its tablist (zero horizontal clipping inside dialog)
			await page.setViewportSize({ width: 320, height: 640 });
			const modalReflow = await page.evaluate(() => {
				const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
				const tablist = dialog?.querySelector<HTMLElement>('[role="tablist"]');
				return {
					dialogOverflow: dialog
						? dialog.scrollWidth > dialog.clientWidth
						: true,
					tablistOverflow: tablist
						? tablist.scrollWidth > tablist.clientWidth
						: true,
				};
			});
			expect(modalReflow.dialogOverflow, "modal fits at 320px").toBe(false);
			expect(modalReflow.tablistOverflow, "modal tabs fit at 320px").toBe(
				false,
			);

			// Dark mode screenshot at desktop 1440x900 (wait for 150ms color transitions to settle)
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate(() => {
				document.documentElement.classList.add("dark");
			});
			await page.waitForTimeout(300);
			if (potDir) {
				await page.screenshot({
					path: join(potDir, "825-teacher-vocab-tab-desktop-1440x900-dark.png"),
				});
			}
			await page.evaluate(() => {
				document.documentElement.classList.remove("dark");
			});
			await page.waitForTimeout(200);

			// Test source filter & search & clear filters
			await page
				.getByTestId("vocab-teacher-source-filter")
				.selectOption("independent");
			await expect(
				page.getByTestId(`vocab-teacher-deck-${hubDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${alphaDeckId}`),
			).toHaveCount(0);

			await page.getByTestId("vocab-teacher-clear-filters").click();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${alphaDeckId}`),
			).toBeVisible();

			await page.getByTestId("vocab-teacher-deck-search").fill("Collocations");
			await expect(
				page.getByTestId(`vocab-teacher-deck-${alphaDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${hubDeckId}`),
			).toHaveCount(0);

			await page.getByTestId("vocab-teacher-clear-filters").click();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${hubDeckId}`),
			).toBeVisible();

			// Select second deck too and confirm clone into Class Beta
			await page
				.getByTestId(`vocab-teacher-deck-checkbox-${alphaDeckId}`)
				.click();
			await expect(
				page.getByTestId("vocab-library-selection-summary"),
			).toContainText("Đã chọn 2 bộ · 4 từ");

			await page.getByTestId("vocab-library-confirm-btn").click();
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toHaveCount(0);

			// Verify DB rows created with source_deck_id and words copied
			const dbVerify = openDb();
			try {
				for (let attempt = 0; attempt < 20; attempt++) {
					const rows = await dbVerify.execute({
						sql: "SELECT id, title, lesson_number, topic, source_deck_id FROM vocab_deck WHERE class_id = ? AND source_deck_id IS NOT NULL",
						args: [classBetaId],
					});
					if (rows.rows.length === 2) {
						const hubClone = rows.rows.find(
							(r) => String(r.source_deck_id) === hubDeckId,
						);
						const alphaClone = rows.rows.find(
							(r) => String(r.source_deck_id) === alphaDeckId,
						);
						clonedHubDeckIdInBeta = String(hubClone?.id ?? "");
						clonedAlphaDeckIdInBeta = String(alphaClone?.id ?? "");
						expect(Number(hubClone?.lesson_number)).toBe(1);
						expect(String(hubClone?.topic)).toBe("Environment");
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(clonedHubDeckIdInBeta.length).toBeGreaterThan(0);
				expect(clonedAlphaDeckIdInBeta.length).toBeGreaterThan(0);

				const clonedWords = await dbVerify.execute({
					sql: "SELECT word, entry_type, pos, example FROM vocab_word WHERE deck_id = ? ORDER BY sort_order ASC",
					args: [clonedHubDeckIdInBeta],
				});
				expect(clonedWords.rows).toHaveLength(2);
				expect(String(clonedWords.rows[0]?.word)).toBe("mitigate");
				expect(String(clonedWords.rows[0]?.pos)).toBe("v");
				expect(String(clonedWords.rows[1]?.entry_type)).toBe("chunk");
			} finally {
				dbVerify.close();
			}

			// Verify cloned decks appear in Class Beta list
			await expect(
				page.getByTestId(`vocab-deck-row-${clonedHubDeckIdInBeta}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-row-${clonedAlphaDeckIdInBeta}`),
			).toBeVisible();

			// Re-open dialog -> verify "Đã có trong lớp" chips appear for both source decks
			await page.getByTestId("vocab-add-from-library").click();
			await page.getByRole("tab", { name: "Bộ từ đã tạo" }).click();
			await expect(
				page.getByTestId(`vocab-teacher-existing-chip-${hubDeckId}`),
			).toHaveText("Đã có trong lớp");
			await expect(
				page.getByTestId(`vocab-teacher-existing-chip-${alphaDeckId}`),
			).toHaveText("Đã có trong lớp");

			if (potDir) {
				await page.screenshot({
					path: join(
						potDir,
						"825-teacher-vocab-existing-chip-desktop-1440x900-light.png",
					),
				});
			}

			await page.keyboard.press("Escape");
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toHaveCount(0);

			// Hub /teacher/vocab flow: clone Class Alpha deck into Hub (classId = null)
			await page.goto(`${TEACHER_BASE_URL}/vocab`);
			await page.getByTestId("vocab-add-from-library").click();
			await page.getByRole("tab", { name: "Bộ từ đã tạo" }).click();
			await expect(
				page.getByTestId(`vocab-teacher-deck-${hubDeckId}`),
			).toHaveCount(0);
			await expect(
				page.getByTestId(`vocab-teacher-deck-${alphaDeckId}`),
			).toBeVisible();
			await page
				.getByTestId(`vocab-teacher-deck-checkbox-${alphaDeckId}`)
				.click();
			await expect(page.getByTestId("vocab-library-confirm-btn")).toHaveText(
				"Thêm bộ từ",
			);
			await page.getByTestId("vocab-library-confirm-btn").click();
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toHaveCount(0);

			const dbHubCheck = openDb();
			try {
				const hubClones = await dbHubCheck.execute({
					sql: "SELECT id FROM vocab_deck WHERE org_id = ? AND class_id IS NULL AND source_deck_id = ?",
					args: [orgId, alphaDeckId],
				});
				expect(hubClones.rows).toHaveLength(1);
			} finally {
				dbHubCheck.close();
			}
		});

		test("enrolled student in target class can see and start learning the cloned teacher deck", async ({
			page,
		}) => {
			await page.goto(`${LMS_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill("Beta Student");
			await page.locator("#signup-email").fill(studentEmail);
			await page.locator("#signup-password").fill(PASSWORD);
			await page.locator("#panel-signup button[type='submit']").click();
			await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
				timeout: 15_000,
			});

			await verifyStudentEmailFromMailLog(page, studentEmail);
			await expect(page.getByTestId("vocab-home-entry")).toBeVisible();

			await page.getByTestId("vocab-home-entry").click();
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-card-${clonedHubDeckIdInBeta}`),
			).toBeVisible();

			await page
				.getByTestId(`vocab-deck-card-${clonedHubDeckIdInBeta}`)
				.click();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			await page.getByTestId("vocab-start-learn-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible();
		});
	});
