import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Client, createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { WEB_ORIGIN } from "./origins";

const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocabgroups.${runToken}@test.local`;
const sourceClassName = `IELTS Source ${runToken}`;
const targetClassName = `IELTS Target ${runToken}`;

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	void client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

test.describe
	.serial("vocab deck groups & bulk group picker flow", () => {
		test("teacher manages groups, assigns/filters decks, bulk-clones >500 words across batches with group preserved, and safely deletes group", async ({
			page,
		}) => {
			const potDir = process.env.CAPTURE_POT_DIR?.trim() ?? "";
			if (potDir) {
				mkdirSync(potDir, { recursive: true });
			}

			await signUpViaApi(page, {
				name: "Vocab Group Teacher",
				email: teacherEmail,
				password: PASSWORD,
			});

			let orgId = "";
			const sourceClassId = crypto.randomUUID();
			const targetClassId = crypto.randomUUID();
			const starterDeckId = crypto.randomUUID();
			const ungroupedDeckId = crypto.randomUUID();
			const now = Date.now();

			const db = openDb();
			try {
				for (let attempt = 0; attempt < 30; attempt++) {
					const orgRow = await db.execute({
						sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
					WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
						args: [teacherEmail],
					});
					const first = orgRow.rows[0];
					if (first && typeof first.id === "string") {
						orgId = first.id;
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(orgId.length, "teacher org bootstrapped").toBeGreaterThan(0);

				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [sourceClassId, orgId, sourceClassName, now],
				});
				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [targetClassId, orgId, targetClassName, now + 1],
				});

				// Seed 2 starter independent decks on /vocab
				await db.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at)
				VALUES (?,?,NULL,?,?,?,?,?,?)`,
					args: [
						starterDeckId,
						orgId,
						"Lesson 01 – Friends & Introductions",
						1,
						"Friends & Introductions",
						"en",
						now,
						now,
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, title, lesson_number, topic, lang, created_at, updated_at)
				VALUES (?,?,NULL,?,?,?,?,?,?)`,
					args: [
						ungroupedDeckId,
						orgId,
						"Standalone Unassigned Deck",
						null,
						null,
						"en",
						now + 5,
						now + 5,
					],
				});
			} finally {
				db.close();
			}

			// 1) Visit /vocab -> open Quản lý nhóm -> create, duplicate check, rename
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.goto(`${WEB_ORIGIN}/vocab`);
			await expect(
				page.getByTestId(`vocab-deck-row-${starterDeckId}`),
			).toBeVisible();

			await page.getByTestId("vocab-manage-groups-btn").click();
			await expect(page.getByTestId("vocab-group-list")).toBeVisible();

			await page
				.getByTestId("vocab-group-create-input")
				.fill("IELTS Foundation");
			await page.getByTestId("vocab-group-create-submit").click();
			await expect(page.getByTestId("vocab-group-list")).toContainText(
				"IELTS Foundation",
			);

			// Duplicate case-insensitive check -> inline error
			await page
				.getByTestId("vocab-group-create-input")
				.fill("ielts foundation");
			await page.getByTestId("vocab-group-create-submit").click();
			await expect(page.getByTestId("vocab-group-create-error")).toContainText(
				"đã tồn tại",
			);

			// Create second group and rename it
			await page.getByTestId("vocab-group-create-input").fill("Giao tiếp A1");
			await page.getByTestId("vocab-group-create-submit").click();
			await expect(page.getByTestId("vocab-group-list")).toContainText(
				"Giao tiếp A1",
			);

			let ieltsGroupId = "";
			let commGroupId = "";
			const dbGroups = openDb();
			try {
				const rows = await dbGroups.execute({
					sql: "SELECT id, name FROM vocab_group WHERE org_id = ?",
					args: [orgId],
				});
				ieltsGroupId = String(
					rows.rows.find((r) => String(r.name) === "IELTS Foundation")?.id ??
						"",
				);
				commGroupId = String(
					rows.rows.find((r) => String(r.name) === "Giao tiếp A1")?.id ?? "",
				);
			} finally {
				dbGroups.close();
			}
			expect(ieltsGroupId.length).toBeGreaterThan(0);
			expect(commGroupId.length).toBeGreaterThan(0);

			await page.getByTestId(`vocab-group-rename-btn-${commGroupId}`).click();
			await page
				.getByTestId(`vocab-group-rename-input-${commGroupId}`)
				.fill("Giao tiếp Cơ bản");
			await page
				.getByTestId(`vocab-group-rename-submit-${commGroupId}`)
				.click();
			await expect(
				page.getByTestId(`vocab-group-row-${commGroupId}`),
			).toContainText("Giao tiếp Cơ bản");

			if (potDir) {
				await page.screenshot({
					path: join(potDir, "832-group-manager-desktop-1440x900-light.png"),
				});
			}

			await page.keyboard.press("Escape");
			await expect(page.getByTestId("vocab-group-list")).toHaveCount(0);

			// 2) Edit deck modal -> assign group + screenshot matching user reference
			await page.getByTestId(`vocab-rename-deck-${starterDeckId}`).click();
			await page
				.getByTestId("vocab-edit-deck-group")
				.selectOption(ieltsGroupId);
			if (potDir) {
				await page.screenshot({
					path: join(potDir, "832-edit-deck-group-desktop-1440x900-light.png"),
				});
			}
			await page.getByTestId("vocab-rename-deck-submit").click();
			await expect(
				page.getByTestId(`vocab-deck-group-badge-${starterDeckId}`),
			).toHaveText("IELTS Foundation");

			// Test group filter on /vocab list
			await page
				.getByTestId("vocab-deck-group-filter")
				.selectOption(ieltsGroupId);
			await expect(
				page.getByTestId(`vocab-deck-row-${starterDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-row-${ungroupedDeckId}`),
			).toHaveCount(0);

			await page
				.getByTestId("vocab-deck-group-filter")
				.selectOption("ungrouped");
			await expect(
				page.getByTestId(`vocab-deck-row-${ungroupedDeckId}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-deck-row-${starterDeckId}`),
			).toHaveCount(0);

			await page.getByTestId("vocab-deck-group-filter-clear").click();
			await expect(
				page.getByTestId(`vocab-deck-row-${starterDeckId}`),
			).toBeVisible();

			// 3) Seed 20 decks x 28 words (= 560 words -> 20 + 560 = 580 statements > 500 -> 2 batches!)
			// in IELTS Source under IELTS Foundation + 1 deck under Giao tiếp Cơ bản
			const bulkDeckIds: string[] = [];
			const commDeckId = crypto.randomUUID();
			const dbSeedBulk = openDb();
			try {
				for (let d = 1; d <= 20; d++) {
					const dId = crypto.randomUUID();
					bulkDeckIds.push(dId);
					await dbSeedBulk.execute({
						sql: `INSERT INTO vocab_deck (id, org_id, class_id, group_id, title, lesson_number, topic, lang, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?,?,?,?)`,
						args: [
							dId,
							orgId,
							sourceClassId,
							ieltsGroupId,
							`Foundation Lesson ${String(d).padStart(2, "0")}`,
							d,
							`Topic ${d}`,
							"en",
							now + 100 + d,
							now + 100 + d,
						],
					});
					for (let w = 1; w <= 28; w++) {
						await dbSeedBulk.execute({
							sql: `INSERT INTO vocab_word (id, deck_id, word, entry_type, translation, sort_order, created_at, updated_at)
						VALUES (?,?,?,?,?,?,?,?)`,
							args: [
								crypto.randomUUID(),
								dId,
								`word_${d}_${w}`,
								"word",
								`nghia_${d}_${w}`,
								w - 1,
								now + 100 + d,
								now + 100 + d,
							],
						});
					}
				}

				await dbSeedBulk.execute({
					sql: `INSERT INTO vocab_deck (id, org_id, class_id, group_id, title, lang, created_at, updated_at)
				VALUES (?,?,?,?,?,?,?,?)`,
					args: [
						commDeckId,
						orgId,
						sourceClassId,
						commGroupId,
						"Everyday Greetings",
						"en",
						now + 500,
						now + 500,
					],
				});
			} finally {
				dbSeedBulk.close();
			}

			// 4) Go to IELTS Target class -> Từ vựng tab -> Thêm từ thư viện -> Bộ từ đã tạo
			await page.goto(`${WEB_ORIGIN}/classes/${targetClassId}`);
			await page.getByRole("tab", { name: "Từ vựng" }).click();
			await page.getByTestId("vocab-add-from-library").click();
			await page.getByRole("tab", { name: "Bộ từ đã tạo" }).click();
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toBeVisible();

			// Filter by IELTS Foundation + source class -> exact 20 decks (560 words)
			await page
				.getByTestId("vocab-teacher-group-filter")
				.selectOption(`group:${ieltsGroupId}`);
			await page
				.getByTestId("vocab-teacher-source-filter")
				.selectOption(`class:${sourceClassId}`);

			await expect(
				page.getByTestId(`vocab-teacher-deck-${bulkDeckIds[0]}`),
			).toBeVisible();
			await expect(
				page.getByTestId(`vocab-teacher-group-badge-${bulkDeckIds[0]}`),
			).toHaveText("IELTS Foundation");
			await expect(
				page.getByTestId(`vocab-teacher-deck-${commDeckId}`),
			).toHaveCount(0);

			// Select all 20 decks (>500 words -> 2 batches)
			await page.getByTestId("vocab-teacher-select-all").click();
			await expect(
				page.getByTestId("vocab-library-selection-summary"),
			).toContainText("Đã chọn 20 bộ · 560 từ (2 lượt gửi)");
			await expect(page.getByTestId("vocab-library-confirm-btn")).toBeEnabled();

			// Verify 3 viewports (1440x900, 768x1024, 375x812) + 320px reflow + dark mode
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
						path: join(potDir, `832-group-picker-bulk-${vp.name}-light.png`),
					});
				}
			}

			await page.setViewportSize({ width: 320, height: 640 });
			const modalReflow = await page.evaluate(() => {
				const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
				return {
					dialogOverflow: dialog
						? dialog.scrollWidth > dialog.clientWidth
						: true,
				};
			});
			expect(modalReflow.dialogOverflow, "modal fits at 320px").toBe(false);

			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate(() => {
				document.documentElement.classList.add("dark");
			});
			await page.waitForTimeout(300);
			if (potDir) {
				await page.screenshot({
					path: join(potDir, "832-group-picker-bulk-desktop-1440x900-dark.png"),
				});
			}
			await page.evaluate(() => {
				document.documentElement.classList.remove("dark");
			});
			await page.waitForTimeout(200);

			// Confirm bulk clone -> 2 sequential requests, modal closes, all 20 decks + 560 words + group_id preserved!
			await page.getByTestId("vocab-library-confirm-btn").click();
			await expect(page.getByTestId("vocab-teacher-decks-tab")).toHaveCount(0, {
				timeout: 30_000,
			});

			const dbVerifyClone = openDb();
			try {
				const clonedDecks = await dbVerifyClone.execute({
					sql: "SELECT id, group_id, source_deck_id FROM vocab_deck WHERE class_id = ?",
					args: [targetClassId],
				});
				expect(clonedDecks.rows).toHaveLength(20);
				for (const row of clonedDecks.rows) {
					expect(String(row.group_id)).toBe(ieltsGroupId);
				}
				const clonedWordCount = await dbVerifyClone.execute({
					sql: `SELECT COUNT(*) AS cnt FROM vocab_word w
				INNER JOIN vocab_deck d ON d.id = w.deck_id
				WHERE d.class_id = ?`,
					args: [targetClassId],
				});
				expect(Number(clonedWordCount.rows[0]?.cnt)).toBe(560);
			} finally {
				dbVerifyClone.close();
			}

			// 5) Delete IELTS Foundation group via UI -> decks preserved with group_id = NULL
			await page.getByTestId("vocab-manage-groups-btn").click();
			await page.getByTestId(`vocab-group-delete-btn-${ieltsGroupId}`).click();
			await expect(
				page.getByTestId(`vocab-group-delete-panel-${ieltsGroupId}`),
			).toContainText("41 bộ từ");
			await page
				.getByTestId(`vocab-group-delete-confirm-${ieltsGroupId}`)
				.click();
			await expect(
				page.getByTestId(`vocab-group-row-${ieltsGroupId}`),
			).toHaveCount(0);

			const dbVerifyDelete = openDb();
			try {
				const remainingTargetDecks = await dbVerifyDelete.execute({
					sql: "SELECT COUNT(*) AS cnt, SUM(CASE WHEN group_id IS NULL THEN 1 ELSE 0 END) AS null_cnt FROM vocab_deck WHERE class_id = ?",
					args: [targetClassId],
				});
				expect(Number(remainingTargetDecks.rows[0]?.cnt)).toBe(20);
				expect(Number(remainingTargetDecks.rows[0]?.null_cnt)).toBe(20);
			} finally {
				dbVerifyDelete.close();
			}
		});
	});
