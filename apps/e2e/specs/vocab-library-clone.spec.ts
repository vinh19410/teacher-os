import { type Client, createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { EXPECTED_COUNTS } from "@teacher-os/db/seed/vocab-library";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * Built-in Vocabulary Courses — Clone-on-Assign E2E (#361).
 *
 * Verifies:
 * 1. `boot.ts` seeds the built-in vocabulary library with `EXPECTED_COUNTS` (20/968/10160).
 * 2. Teacher opens "Thêm từ thư viện", selects a course, picks 2 decks, and clones them into the class.
 * 3. Cloned decks appear with the "Thư viện" badge, `source_library_deck_id` and `audio_url` in DB,
 *    and re-opening the dialog displays the "Đã có trong lớp" chip on both decks.
 * 4. Enrolled student sees the cloned deck on the portal, `session-data` reports `hasAudio: true`,
 *    and the first Learn step renders cleanly without hitting the external CDN.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocablib.teacher.${runToken}@test.local`;
const studentEmail = `vocablib.student.${runToken}@test.local`;
const freeStudentEmail = `vocabfree.student.${runToken}@test.local`;
const className = `Vocab Lib Class ${runToken}`;

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	void client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

test.describe
	.serial("vocab library clone flow (#361)", () => {
		let orgId = "";
		let classId = "";
		let studentId = "";
		let targetCourseId = "";
		let libDeck1Id = "";
		let libDeck2Id = "";
		let clonedDeck1Id = "";
		let clonedDeck2Id = "";

		test("boot seeds EXPECTED_COUNTS, teacher clones 2 library decks with badge, and re-open shows existing chip", async ({
			page,
		}) => {
			// 1) Direct-DB seed verification against EXPECTED_COUNTS
			const dbSeed = openDb();
			try {
				const [courseCountRes, deckCountRes, wordCountRes] = await Promise.all([
					dbSeed.execute("SELECT COUNT(*) AS cnt FROM vocab_library_course"),
					dbSeed.execute("SELECT COUNT(*) AS cnt FROM vocab_library_deck"),
					dbSeed.execute("SELECT COUNT(*) AS cnt FROM vocab_library_word"),
				]);
				expect(Number(courseCountRes.rows[0]?.cnt)).toBe(
					EXPECTED_COUNTS.course,
				);
				expect(Number(deckCountRes.rows[0]?.cnt)).toBe(EXPECTED_COUNTS.deck);
				expect(Number(wordCountRes.rows[0]?.cnt)).toBe(EXPECTED_COUNTS.word);

				const courseRes = await dbSeed.execute(
					"SELECT id FROM vocab_library_course ORDER BY sort_order ASC, id ASC LIMIT 1",
				);
				targetCourseId = String(courseRes.rows[0]?.id ?? "");
				expect(targetCourseId).toMatch(/^libcourse-/);

				const decksRes = await dbSeed.execute({
					sql: "SELECT id FROM vocab_library_deck WHERE course_id = ? ORDER BY sort_order ASC, id ASC LIMIT 2",
					args: [targetCourseId],
				});
				expect(decksRes.rows).toHaveLength(2);
				libDeck1Id = String(decksRes.rows[0]?.id ?? "");
				libDeck2Id = String(decksRes.rows[1]?.id ?? "");
				expect(libDeck1Id).toMatch(/^libdeck-/);
				expect(libDeck2Id).toMatch(/^libdeck-/);
			} finally {
				dbSeed.close();
			}

			// 2) Teacher signs up through real UI (bootstraps org + membership)
			await page.goto(`${WEB_ORIGIN}/login`);
			await page.locator("#su-name").fill("Library Teacher");
			await page.locator("#su-email").fill(teacherEmail);
			await page.locator("#su-password").fill(PASSWORD);
			await page.getByRole("button", { name: "Create account" }).click();
			await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

			// 3) Resolve orgId and seed class + student + active enrollment in DB
			const dbSetup = openDb();
			try {
				let orgIdRow: string | undefined;
				for (let attempt = 0; attempt < 30; attempt++) {
					const orgRow = await dbSetup.execute({
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

				await dbSetup.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [classId, orgId, className, now],
				});
				await dbSetup.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
						VALUES (?,?,?,?,?,?)`,
					args: [studentId, orgId, "Library Student", studentEmail, now, now],
				});
				await dbSetup.execute({
					sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
						VALUES (?,?,?,?, 'active', ?)`,
					args: [crypto.randomUUID(), orgId, classId, studentId, now],
				});
				await dbSetup.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
						VALUES (?,?,?,?,?,?)`,
					args: [
						crypto.randomUUID(),
						orgId,
						"Free Course Student",
						freeStudentEmail,
						now,
						now,
					],
				});
			} finally {
				dbSetup.close();
			}

			// 4) Teacher opens class -> tab "Từ vựng" -> "Thêm từ thư viện" -> selects course -> ticks 2 decks -> clones
			await page.goto(`${WEB_ORIGIN}/classes`);
			const classCard = page.locator("h3", { hasText: className });
			await expect(classCard).toBeVisible();
			await classCard.click();
			await page.getByRole("tab", { name: "Từ vựng" }).click();

			await page.getByTestId("vocab-add-from-library").click();
			const selectCourseBtn = page.getByTestId(
				`vocab-library-select-course-${targetCourseId}`,
			);
			await expect(selectCourseBtn).toBeVisible();
			await selectCourseBtn.click();

			const checkbox1 = page.getByTestId(
				`vocab-library-deck-checkbox-${libDeck1Id}`,
			);
			const checkbox2 = page.getByTestId(
				`vocab-library-deck-checkbox-${libDeck2Id}`,
			);
			await expect(checkbox1).toBeVisible();
			await expect(checkbox2).toBeVisible();
			await checkbox1.click();
			await checkbox2.click();

			await expect(
				page.getByTestId("vocab-library-selection-summary"),
			).toContainText("Đã chọn 2 bộ · ");

			await page.getByTestId("vocab-library-confirm-btn").click();

			// Verify DB rows created with source_library_deck_id and audio_url
			const dbCheck = openDb();
			try {
				for (let attempt = 0; attempt < 20; attempt++) {
					const clonedRows = await dbCheck.execute({
						sql: "SELECT id, source_library_deck_id FROM vocab_deck WHERE class_id = ? ORDER BY created_at ASC, id ASC",
						args: [classId],
					});
					if (clonedRows.rows.length === 2) {
						const row1 = clonedRows.rows.find(
							(r) => String(r.source_library_deck_id) === libDeck1Id,
						);
						const row2 = clonedRows.rows.find(
							(r) => String(r.source_library_deck_id) === libDeck2Id,
						);
						clonedDeck1Id = String(row1?.id ?? "");
						clonedDeck2Id = String(row2?.id ?? "");
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(clonedDeck1Id.length).toBeGreaterThan(0);
				expect(clonedDeck2Id.length).toBeGreaterThan(0);

				const audioWords = await dbCheck.execute({
					sql: "SELECT COUNT(*) AS cnt FROM vocab_word WHERE deck_id IN (?, ?) AND audio_url IS NOT NULL AND length(audio_url) > 0",
					args: [clonedDeck1Id, clonedDeck2Id],
				});
				expect(Number(audioWords.rows[0]?.cnt)).toBeGreaterThan(0);
			} finally {
				dbCheck.close();
			}

			// Verify both cloned deck rows and their "Thư viện" badges are visible
			await expect(
				page.getByTestId(`vocab-deck-row-${clonedDeck1Id}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-row-${clonedDeck2Id}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-library-badge-${clonedDeck1Id}`),
			).toHaveText("Thư viện");
			await expect(
				page.getByTestId(`vocab-deck-library-badge-${clonedDeck2Id}`),
			).toHaveText("Thư viện");

			// 5) Re-open dialog -> verify "Đã có trong lớp" chips appear for the 2 cloned decks
			await page.getByTestId("vocab-add-from-library").click();
			await page
				.getByTestId(`vocab-library-select-course-${targetCourseId}`)
				.click();
			await expect(
				page.getByTestId(`vocab-library-existing-chip-${libDeck1Id}`),
			).toHaveText("Đã có trong lớp");
			await expect(
				page.getByTestId(`vocab-library-existing-chip-${libDeck2Id}`),
			).toHaveText("Đã có trong lớp");

			// Verify 3 viewports (1440x900, 768x1024, 375x812) have no horizontal overflow
			for (const vp of [
				{ width: 1440, height: 900, name: "1440x900" },
				{ width: 768, height: 1024, name: "768x1024" },
				{ width: 375, height: 812, name: "375x812" },
			]) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no horizontal overflow at ${vp.name}`).toBe(false);
			}

			// Keyboard Escape closes the modal
			await page.keyboard.press("Escape");
			await expect(page.getByTestId("vocab-library-decks-step")).toHaveCount(0);
		});

		test("enrolled student sees cloned deck, session-data reports hasAudio=true, and Learn intro renders", async ({
			page,
		}) => {
			await page.goto(`${STUDENT_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill("Library Student");
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
				page.getByTestId(`vocab-deck-card-${clonedDeck1Id}`),
			).toBeVisible();

			// Intercept session-data response when entering the cloned deck
			const sessionDataPromise = page.waitForResponse(
				(res) =>
					res
						.url()
						.includes(
							`/api/student/vocab/decks/${clonedDeck1Id}/session-data`,
						) && res.status() === 200,
			);

			await page.getByTestId(`vocab-deck-card-${clonedDeck1Id}`).click();
			const sessionDataRes = await sessionDataPromise;
			const sessionDataJson = (await sessionDataRes.json()) as {
				cards: Array<{ hasAudio?: boolean }>;
			};
			expect(sessionDataJson.cards.length).toBeGreaterThan(0);
			expect(sessionDataJson.cards.some((c) => c.hasAudio === true)).toBe(true);

			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			await page.getByTestId("vocab-start-session-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible();
		});

		test("unassigned student browses all 20 vocabulary courses (including 140-deck course), opens libdeck-* directly without cloning to vocab_deck, enters Learn session, and sees deck in 'Bộ từ đang học' across 3 viewports (#366)", async ({
			page,
		}) => {
			await page.goto(`${STUDENT_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill("Free Course Student");
			await page.locator("#signup-email").fill(freeStudentEmail);
			await page.locator("#signup-password").fill(PASSWORD);
			await page.locator("#panel-signup button[type='submit']").click();
			await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
				timeout: 15_000,
			});

			await verifyStudentEmailFromMailLog(page, freeStudentEmail);
			await expect(page.getByTestId("vocab-home-entry")).toBeVisible();

			// Record org vocab_deck count before student studies library deck
			const dbBefore = openDb();
			let orgDeckCountBefore = 0;
			try {
				const countRes = await dbBefore.execute(
					"SELECT COUNT(*) AS cnt FROM vocab_deck",
				);
				orgDeckCountBefore = Number(countRes.rows[0]?.cnt ?? 0);
			} finally {
				dbBefore.close();
			}

			await page.getByTestId("vocab-home-entry").click();
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(page.getByTestId("vocab-decks-empty")).toBeVisible();
			await expect(page.getByTestId("vocab-courses-section")).toBeVisible();

			// Verify all 20 courses are rendered
			await expect(
				page.locator('[data-testid^="vocab-course-card-"]'),
			).toHaveCount(EXPECTED_COUNTS.course);

			// Verify 3 viewports (1440x900, 768x1024, 375x812) on course list view
			for (const vp of [
				{ width: 1440, height: 900, name: "1440x900" },
				{ width: 768, height: 1024, name: "768x1024" },
				{ width: 375, height: 812, name: "375x812" },
			]) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					overflow,
					`no horizontal overflow on course catalog at ${vp.name}`,
				).toBe(false);
			}
			await page.setViewportSize({ width: 1440, height: 900 });

			// Open 140-deck course (libcourse-15) to verify D1 100-variable safety & URL search param
			await page.getByTestId("vocab-course-card-libcourse-15").click();
			await expect(page).toHaveURL(/courseId=libcourse-15/);
			await expect(
				page.getByTestId("vocab-selected-course-title"),
			).toBeVisible();
			await expect(
				page.locator('[data-testid^="vocab-course-deck-"]').first(),
			).toBeVisible();

			// Return to all courses, then open targetCourseId
			await page.getByTestId("vocab-course-back-btn").click();
			await expect(
				page.getByTestId(`vocab-course-card-${targetCourseId}`),
			).toBeVisible();
			await page.getByTestId(`vocab-course-card-${targetCourseId}`).click();
			await expect(
				page.getByTestId(`vocab-course-deck-${libDeck1Id}`),
			).toBeVisible();

			// Verify 3 viewports on course decks view
			for (const vp of [
				{ width: 1440, height: 900, name: "1440x900" },
				{ width: 768, height: 1024, name: "768x1024" },
				{ width: 375, height: 812, name: "375x812" },
			]) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					overflow,
					`no horizontal overflow on course decks at ${vp.name}`,
				).toBe(false);
			}
			await page.setViewportSize({ width: 1440, height: 900 });

			// Open libDeck1Id directly -> lazy provisions vocab_card without creating vocab_deck
			const sessionDataPromise = page.waitForResponse(
				(res) =>
					res
						.url()
						.includes(`/api/student/vocab/decks/${libDeck1Id}/session-data`) &&
					res.status() === 200,
			);
			await page.getByTestId(`vocab-course-deck-${libDeck1Id}`).click();
			const sessionRes = await sessionDataPromise;
			const sessionJson = (await sessionRes.json()) as {
				cards: Array<{ hasAudio?: boolean }>;
			};
			expect(sessionJson.cards.length).toBeGreaterThan(0);
			expect(sessionJson.cards.some((c) => c.hasAudio === true)).toBe(true);

			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();

			// Verify vocab_deck count did NOT increase
			const dbAfter = openDb();
			try {
				const countRes = await dbAfter.execute(
					"SELECT COUNT(*) AS cnt FROM vocab_deck",
				);
				expect(Number(countRes.rows[0]?.cnt ?? 0)).toBe(orgDeckCountBefore);
			} finally {
				dbAfter.close();
			}

			// Click SPA link "← Danh sách bộ từ" -> tests React Query cache invalidation (staleTime 60s)
			await page.getByRole("link", { name: /Danh sách bộ từ/i }).click();
			await expect(
				page.getByTestId(`vocab-deck-card-${libDeck1Id}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-source-${libDeck1Id}`),
			).toContainText("Khóa ");
			const screenshots = new URL(
				"../../../plans/261019-0648-student-full-vocab-courses/screenshots/",
				import.meta.url,
			).pathname;
			for (const [w, h, name] of [
				[1440, 900, "student-vocab-courses-1440"],
				[768, 1024, "student-vocab-courses-768"],
				[375, 812, "student-vocab-courses-375"],
			] as const) {
				await page.setViewportSize({ width: w, height: h });
				await page.screenshot({
					path: `${screenshots}${name}.png`,
					fullPage: false,
				});
			}
			await page.setViewportSize({ width: 1440, height: 900 });

			// Re-open deck from "Bộ từ đang học" and start Learn session -> intro step renders
			await page.getByTestId(`vocab-deck-card-${libDeck1Id}`).click();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			await page.getByTestId("vocab-start-session-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible();
		});
	});
