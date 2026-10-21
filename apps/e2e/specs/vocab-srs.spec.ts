import { readFileSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * Student Vocab SRS Game (#359) — end to end trên portal thật.
 *
 * Seeding là direct-DB (pattern helpers-quiz.ts RT#12): giáo viên đăng ký
 * QUA UI (org bootstrap thật), lớp + học sinh + enrollment + deck/word/card
 * seed thẳng vào local.db. Chỉ auth học sinh là auth thật (signup portal +
 * verify email qua mail-log).
 *
 * Không time-travel được: card `review` do seed gán `due_at` QUÁ KHỨ từ spec
 * process (libsql connection riêng, workers=1 — precedent account-seed.ts).
 * Toán applyAnswer/learned đã có unit test conformance vectors phủ.
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `vocab.teacher.${runToken}@test.local`;
const studentEmail = `vocab.student.${runToken}@test.local`;
const studentPassword = "password-8chars";
const className = `SRS Class ${runToken}`;
const deckTitle = `Topic 1: Environment ${runToken}`;

const AUDIO_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);

function openDb(): Client {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function signInStudent(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(studentPassword);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
}

test.describe
	.serial("student vocab SRS game", () => {
		let orgId = "";
		let classId = "";
		let studentId = "";
		let deckId = "";
		let firstWordId = "";
		const wordIds: string[] = [];

		/**
		 * Chạy isolated (`--grep "seeded overdue review card"`, #377): test 1–2 của
		 * describe.serial không chạy → closure `studentId`/`deckId`/`wordIds` rỗng →
		 * tự seed môi trường tối thiểu cho test "seeded overdue review card...".
		 * Direct-DB theo pattern helpers-quiz.ts RT#12; auth học sinh vẫn là auth
		 * THẬT (signup portal + verify mail-log).
		 *
		 * Thứ tự BẮT BUỘC: seed DB TRƯỚC khi signup — portal bridge chạy
		 * provisionStudentForUser (match lower(trim(email)),
		 * apps/server/src/student-provisioning.ts:22-31, return sớm khi đã có row)
		 * nên student đã seed được tái sử dụng thay vì sinh row id khác.
		 *
		 * Đồng bộ shape dữ liệu với test 1: đổi shape seed ở test 1 phải sửa cả đây.
		 */
		async function seedIsolatedEnvironment(page: Page): Promise<void> {
			// 1) Direct-DB: org + class + student + enrollment + deck + 3 words + cards.
			const db = openDb();
			try {
				const now = Date.now();
				orgId = crypto.randomUUID();
				classId = crypto.randomUUID();
				studentId = crypto.randomUUID();
				deckId = crypto.randomUUID();
				await db.execute({
					sql: "INSERT INTO organization (id, name, created_at) VALUES (?,?,?)",
					args: [orgId, `SRS Org ${runToken}`, now],
				});
				await db.execute({
					sql: "INSERT INTO class (id, org_id, name, created_at) VALUES (?,?,?,?)",
					args: [classId, orgId, className, now],
				});
				await db.execute({
					sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
				VALUES (?,?,?,?,?,?)`,
					args: [studentId, orgId, "Vocab Student", studentEmail, now, now],
				});
				await db.execute({
					sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
				VALUES (?,?,?,?, 'active', ?)`,
					args: [crypto.randomUUID(), orgId, classId, studentId, now],
				});
				await db.execute({
					sql: "INSERT INTO vocab_deck (id, org_id, class_id, title) VALUES (?,?,?,?)",
					args: [deckId, orgId, classId, deckTitle],
				});
				const WORDS: Array<[string, string]> = [
					["resilient", "kiên cường"],
					["sustainable", "bền vững"],
					["biodiversity", "đa dạng sinh học"],
				];
				for (const [sortOrder, [word, translation]] of WORDS.entries()) {
					const wordId = crypto.randomUUID();
					wordIds.push(wordId);
					await db.execute({
						sql: `INSERT INTO vocab_word (id, deck_id, word, translation, sort_order, created_at, updated_at)
					VALUES (?,?,?,?,?,?,?)`,
						args: [wordId, deckId, word, translation, sortOrder, now, now],
					});
					// Card đã provision state 'review' (y hệt trạng thái sau Learn
					// session của test 2): new-count = 0 → "Bắt đầu học" disabled.
					// Word "sustainable" seed THẲNG due quá khứ — toàn bộ state test
					// phải có TRƯỚC lần đọc đầu tiên của app: portal home prefetch
					// query ["student","vocab-overview"] khi mount (staleTime 60s +
					// networkMode offlineFirst, query-client.ts) nên mutation DB sau
					// đó không bao giờ được /practice/vocabulary nhìn thấy nữa (#377).
					const isSustainable = word === "sustainable";
					await db.execute({
						sql: `INSERT INTO vocab_card (id, student_id, word_id, level, state, interval_days, due_at, updated_at)
					VALUES (?,?,?, 2, 'review', 1, ?, ?)`,
						args: [
							crypto.randomUUID(),
							studentId,
							wordId,
							isSustainable ? now - 86_400_000 : now + 86_400_000,
							now,
						],
					});
				}
				firstWordId = wordIds[0] ?? "";
				// Review_log hôm nay cho streak "1 ngày" — cùng lý do seed-sớm ở
				// trên: portal home prefetch phải thấy đủ due=1 + streak=1 ngay từ
				// đầu. Serial path không chạy helper (test tự seed như cũ); nhánh
				// isolated vẫn chạy seed block của test sau đó nhưng idempotent:
				// UPDATE cùng giá trị + INSERT thêm log cùng ngày → streak vẫn "1 ngày".
				await db.execute({
					sql: `INSERT INTO vocab_review_log (id, student_id, card_id, deck_id, session_kind, grade, duration_ms, reviewed_at, word, translation)
				VALUES (?,?,?,?,'review','good',1200,?,?,?)`,
					args: [
						crypto.randomUUID(),
						studentId,
						crypto.randomUUID(),
						deckId,
						now,
						"seeded",
						"seeded",
					],
				});
			} finally {
				db.close();
			}

			// 2) Auth học sinh THẬT (các bước của test 2): signup portal + verify
			// mail-log. Verify auto-login hạ cánh portal home → test ở nhánh isolated
			// KHÔNG gọi signInStudent nữa (form login sẽ detach vì đã có session).
			await page.goto(`${STUDENT_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill("Vocab Student");
			await page.locator("#signup-email").fill(studentEmail);
			await page.locator("#signup-password").fill(studentPassword);
			await page.locator("#panel-signup button[type='submit']").click();
			await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
				timeout: 15_000,
			});
			await verifyStudentEmailFromMailLog(page, studentEmail);
			await expect(page.getByTestId("vocab-home-entry")).toBeVisible();
		}

		test("teacher creates deck with 3 words via kernel (1 word uploads audio)", async ({
			page,
		}) => {
			// 1) Teacher signs up through the real UI (bootstraps org + membership).
			await page.goto(`${WEB_ORIGIN}/login`);
			await page.locator("#su-name").fill("Vocab Teacher");
			await page.locator("#su-email").fill(teacherEmail);
			await page.locator("#su-password").fill(PASSWORD);
			await page.getByRole("button", { name: "Create account" }).click();
			await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

			// 2) Resolve org + create class + seed student/enrollment directly in DB.
			const db = openDb();
			try {
				let orgIdRow: string | undefined;
				// Bootstrap membership có thể chạm DB sau khi URL đã sang /dashboard —
				// retry ngắn thay vì throw ngay (flaky một lần query, precedent
				// orgIdForTeacherEmail trong helpers.ts).
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
					args: [studentId, orgId, "Vocab Student", studentEmail, now, now],
				});
				await db.execute({
					sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
					VALUES (?,?,?,?, 'active', ?)`,
					args: [crypto.randomUUID(), orgId, classId, studentId, now],
				});
			} finally {
				db.close();
			}

			// 3) Teacher creates the deck through the UI (kernel tab Từ vựng).
			await page.goto(`${WEB_ORIGIN}/classes`);
			const classCard = page.locator("h3", { hasText: className });
			await expect(classCard).toBeVisible();
			await classCard.click();
			await page.getByRole("tab", { name: "Từ vựng" }).click();

			await page.getByRole("button", { name: "Tạo bộ từ" }).click();
			await page.getByLabel("Tiêu đề bộ từ").fill(deckTitle);
			await page.getByTestId("vocab-create-deck-submit").click();
			await expect(page.getByText(`${deckTitle}`).first()).toBeVisible();

			const db2 = openDb();
			try {
				let deckIdRow: string | undefined;
				for (let attempt = 0; attempt < 20; attempt++) {
					const deckRow = await db2.execute({
						sql: "SELECT id FROM vocab_deck WHERE title = ?",
						args: [deckTitle],
					});
					const first = deckRow.rows[0];
					if (
						first &&
						typeof first === "object" &&
						"id" in first &&
						typeof first.id === "string"
					) {
						deckIdRow = first.id;
						break;
					}
					await page.waitForTimeout(300);
				}
				expect(deckIdRow, "deck created via UI").toBeDefined();
				deckId = deckIdRow as string;
			} finally {
				db2.close();
			}

			// 4) Soạn 3 từ (1 từ có audio upload). Draft ids tăng dần theo thứ tự
			// bấm "Thêm từ" — chọn theo testid TƯỜNG MINH để không đụng strict
			// mode khi draft trước chưa kịp biến thành row thật sau khi lưu.
			await page.getByTestId(`vocab-edit-deck-${deckId}`).click();
			await page.getByTestId("vocab-add-word-btn").click();

			const fillDraft = async (
				draftId: string,
				word: string,
				translation: string,
			) => {
				const row = page.getByTestId(`vocab-word-row-${draftId}`);
				await row.getByLabel("Từ vựng", { exact: false }).fill(word);
				await row
					.getByLabel("Nghĩa tiếng Việt", { exact: false })
					.fill(translation);
				await row.locator("button", { hasText: "Thêm" }).click();
				// Sau khi lưu, row thật thay thế draft (loadWords refetch).
				await expect(page.getByTestId(`vocab-word-row-${draftId}`)).toHaveCount(
					0,
					{ timeout: 20_000 },
				);
			};

			await fillDraft("draft-1", "resilient", "kiên cường");
			await page.getByTestId("vocab-add-word-btn").click();
			await fillDraft("draft-2", "sustainable", "bền vững");
			await page.getByTestId("vocab-add-word-btn").click();
			await fillDraft("draft-3", "biodiversity", "đa dạng sinh học");

			const dbWords = openDb();
			try {
				const words = await dbWords.execute({
					sql: "SELECT id FROM vocab_word WHERE deck_id = ? ORDER BY sort_order",
					args: [deckId],
				});
				expect(words.rows).toHaveLength(3);
				for (const row of words.rows) {
					if (row && typeof row === "object" && "id" in row) {
						wordIds.push(String(row.id));
					}
				}
				expect(wordIds).toHaveLength(3);
				firstWordId = wordIds[0] ?? "";
				expect(firstWordId.length).toBeGreaterThan(0);
			} finally {
				dbWords.close();
			}

			// 5) Upload audio cho word đầu (first resilient row).
			const firstSavedRow = page.getByTestId(`vocab-word-row-${firstWordId}`);
			await firstSavedRow.getByTestId("media-dropzone-input").setInputFiles({
				name: "resilient.mp3",
				mimeType: "audio/mpeg",
				buffer: AUDIO_SAMPLE,
			});
			await expect(
				page
					.getByTestId(`vocab-word-row-${firstWordId}`)
					.getByText("Đã có audio"),
			).toBeVisible({ timeout: 20_000 });

			const dbAudio = openDb();
			try {
				const audioRow = await dbAudio.execute({
					sql: "SELECT audio_key FROM vocab_word WHERE id = ?",
					args: [firstWordId],
				});
				const first = audioRow.rows[0];
				let audioKey = "";
				if (
					first &&
					typeof first === "object" &&
					"audio_key" in first &&
					typeof first.audio_key === "string"
				) {
					audioKey = first.audio_key;
				}
				expect(audioKey).toMatch(new RegExp(`^vocab/${orgId}/${firstWordId}/`));
			} finally {
				dbAudio.close();
			}

			await page.getByRole("button", { name: "Hoàn tất" }).click();
		});

		test("student completes Learn session; overview shows countdown 1d 0h; deck detail shows next-review hint", async ({
			page,
		}) => {
			page.on("console", (msg) => {
				if (msg.text().includes("[vocab-debug]")) {
					console.log(`[browser] ${msg.text()}`);
				}
			});
			page.on("pageerror", (err) => {
				console.log(`[pageerror] ${err.message}`);
			});
			// Seed student portal auth (real signup + email verification).
			await page.goto(`${STUDENT_ORIGIN}/login`);
			await page.locator("#tab-signup").click();
			await page.locator("#signup-name").fill("Vocab Student");
			await page.locator("#signup-email").fill(studentEmail);
			await page.locator("#signup-password").fill(studentPassword);
			await page.locator("#panel-signup button[type='submit']").click();
			await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
				timeout: 15_000,
			});
			// verifyStudentEmailFromMailLog tự auto-login và hạ cánh trên portal —
			// không cần signInStudent nữa (form login sẽ detach vì đã có session).
			await verifyStudentEmailFromMailLog(page, studentEmail);
			await expect(page.getByTestId("vocab-home-entry")).toBeVisible();

			// Overview page shows deck card.
			await page.getByTestId("vocab-home-entry").click();
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(page.getByTestId(`vocab-deck-card-${deckId}`)).toBeVisible();
			await expect(page.getByTestId(`vocab-deck-new-${deckId}`)).toHaveText(
				"3 từ mới",
			);
			// Stats row tổng: thẻ Từ mới tổng = cộng newCount mọi bộ đang học (#372)
			await expect(page.getByTestId("vocab-overview-new-count")).toHaveText(
				"3",
			);

			// Deck detail page.
			await page.getByTestId(`vocab-deck-card-${deckId}`).click();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();
			await expect(page.getByTestId("vocab-deck-title")).toHaveText(deckTitle);
			// 3 thẻ thống kê theo bài đã bỏ (#372); thay bằng nút Bắt đầu học kèm số
			await expect(page.getByTestId("vocab-deck-new-count")).toHaveCount(0);
			await expect(page.getByTestId("vocab-start-learn-btn")).toContainText(
				"Bắt đầu học (3)",
			);

			// Learn session: vòng tự-chữa (giống cách người dùng thao tác) —
			// intro lật+continue; typing trả lời ĐÚNG theo chữ cái đầu của hint
			// (L1 giữ chữ đầu token); choice bấm option đầu (sai → engine requeue).
			await page.getByTestId("vocab-start-learn-btn").click();
			await expect(page.getByTestId("vocab-learn-intro")).toBeVisible();

			const WORD_BY_FIRST_LETTER: Record<string, string> = {
				r: "resilient",
				s: "sustainable",
				b: "biodiversity",
			};
			let safety = 0;
			while (
				!(await page.getByTestId("vocab-summary-learn").isVisible()) &&
				safety < 60
			) {
				safety += 1;
				const introFlip = page.getByTestId("vocab-intro-flip-btn");
				if (await introFlip.isVisible()) {
					await expect(
						page.getByTestId("vocab-intro-continue-btn"),
					).toBeDisabled();
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
						WORD_BY_FIRST_LETTER[hint.trim().charAt(0)] ?? "resilient";
					await typingInput.fill(word);
					await page.getByTestId("vocab-typing-submit").click();
					const feedbackContinue = page.getByTestId("vocab-continue-btn");
					await expect(feedbackContinue).toBeVisible();
					await expect(feedbackContinue).toBeEnabled();
					await feedbackContinue.click();
					continue;
				}
				const firstOption = page.getByTestId("vocab-option").first();
				if (await firstOption.isVisible()) {
					await firstOption.click();
					const feedbackContinue = page.getByTestId("vocab-continue-btn");
					await expect(feedbackContinue).toBeVisible();
					await expect(feedbackContinue).toBeEnabled();
					await feedbackContinue.click();
				}
			}

			await expect(page.getByTestId("vocab-summary-learn")).toBeVisible();
			await page.getByTestId("vocab-summary-back").click();
			await expect(page.getByTestId("vocab-deck-detail")).toBeVisible();

			// Về overview để thấy countdown (chỉ render ở /practice/vocabulary).
			await page.getByRole("link", { name: "← Danh sách bộ từ" }).click();
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();

			// Card đã review + dueAt = commit + 1d → overview hiện countdown.
			// Khoảng trôi giữa commit và render làm remaining < 24h — nhãn đúng
			// có thể là "1d 0h" hoặc "23:59:xx" tuỳ độ trễ (không phụ thuộc
			// thời gian thực: cả hai đều hàm ý dueAt ≈ +1 ngày).
			await page.getByTestId("vocab-countdown-label").waitFor({
				state: "visible",
				timeout: 20_000,
			});
			const countdown = await page
				.getByTestId("vocab-countdown-label")
				.textContent();
			expect(countdown).toMatch(/^(1d 0h|23:59)/);

			// Deck detail giờ hiển thị hint next-review "1d" (formatInterval,
			// làm tròn phút → ngày: 23h59m → round(1439/1440) = 1d).
			await page.getByTestId(`vocab-deck-card-${deckId}`).click();
			await expect(page.getByTestId("vocab-next-review-hint")).toHaveText(
				/Đợt ôn tiếp theo sau 1d/,
			);
		});

		test("seeded overdue review card requeues on wrong, evicts after 2 forgot; deleting deck keeps streak history", async ({
			page,
		}) => {
			// Chạy isolated (--grep, #377): test 1–2 không chạy → closure state
			// rỗng → tự seed môi trường (direct-DB + auth thật) ngay đầu test.
			// Bắt cờ TRƯỚC khi helper gán studentId.
			const isolated = studentId === "";
			if (isolated) {
				await seedIsolatedEnvironment(page);
			}

			// Seed 1 card review đã due quá khứ + 1 review_log để giữ streak.
			// Card của word đã TỒN TẠI sau Learn session (provision khi mở deck)
			// — UPDATE thay vì INSERT (unique (student_id, word_id)).
			const db = openDb();
			try {
				const now = Date.now();
				await db.execute({
					sql: `UPDATE vocab_card SET state = 'review', interval_days = 1,
						due_at = ?, updated_at = ?
						WHERE student_id = ? AND word_id = ?`,
					args: [
						now - 86_400_000,
						now,
						studentId,
						wordIds[1] ?? firstWordId, // "sustainable"
					],
				});
				await db.execute({
					sql: `INSERT INTO vocab_review_log (id, student_id, card_id, deck_id, session_kind, grade, duration_ms, reviewed_at, word, translation)
					VALUES (?,?,?,?, 'review', 'good', 1200, ?, 'seeded', 'seeded')`,
					args: [
						crypto.randomUUID(),
						studentId,
						crypto.randomUUID(),
						deckId,
						now,
					],
				});
			} finally {
				db.close();
			}

			// Đường serial: auth user đã có từ test 2 → login như cũ. Nhánh
			// isolated: helper đã signup + verify (auto-login) → form login sẽ
			// detach nếu đăng nhập lại (precedent comment test 2).
			if (!isolated) {
				await signInStudent(page);
			}
			await page.getByTestId("vocab-home-entry").click();
			await expect(page.getByTestId("vocab-overview-due-count")).toHaveText(
				"1",
			);
			// Streak seeded từ review_log hôm nay.
			await expect(page.getByTestId("vocab-overview-streak")).toHaveText(
				"1 ngày",
			);

			// Review session: bấm lựa chọn ĐẦU TIÊN của mọi prompt (gần như luôn
			// sai vì đáp án hiếm khi đứng đầu sau shuffle) → drove wrong streak;
			// overlay wrong-streak phải xuất hiện khi streak chạm 5 (spec §3 rule 4).
			await page.getByTestId(`vocab-deck-card-${deckId}`).click();
			// Đã học hết từ mới: Bắt đầu học disabled kèm title giải thích (#372, review I1)
			await expect(page.getByTestId("vocab-start-learn-btn")).toBeDisabled();
			await expect(page.getByTestId("vocab-start-learn-btn")).toHaveAttribute(
				"title",
				"Đã học hết từ mới",
			);
			await page.getByTestId("vocab-start-review-btn").click();

			let safety = 0;
			let overlaySeen = false;
			let wrongStreak = 0; // mirror của engine: wrong/forgot liên tiếp (§3 rule 4)
			let overlayRequired = false; // engine buộc overlay khi mirror chạm 5
			while (
				!(await page.getByTestId("vocab-summary-review").isVisible()) &&
				safety < 60
			) {
				safety += 1;
				if (await page.getByTestId("vocab-wrong-streak-overlay").isVisible()) {
					overlaySeen = true;
					// Engine reset streak về 0 khi hiển thị overlay
					// (review-session.ts:242-244).
					wrongStreak = 0;
					await page.getByTestId("vocab-dismiss-overlay").click();
					// Dismiss chỉ tự-advance với selfCheck; typing/option vẫn mở
					// feedback — bấm continue để qua prompt kế (selfCheck: panel
					// đã đóng nên bỏ qua).
					const overlayContinue = page.getByTestId("vocab-continue-btn");
					if (await overlayContinue.isVisible()) {
						await expect(overlayContinue).toBeEnabled();
						await overlayContinue.click();
					}
					continue;
				}
				const typing = page.getByTestId("vocab-typing-input");
				if (await typing.isVisible()) {
					await typing.fill("sustainable");
					await page.getByTestId("vocab-typing-submit").click();
				} else if (await page.getByTestId("vocab-option").first().isVisible()) {
					await page.getByTestId("vocab-option").first().click();
				} else if (await page.getByTestId("vocab-self-forgot").isVisible()) {
					await page.getByTestId("vocab-self-forgot").click();
				} else {
					continue; // chờ UI render prompt sau khi persist chốt
				}
				const feedbackContinue = page.getByTestId("vocab-continue-btn");
				await expect(feedbackContinue).toBeVisible();
				// Mirror wrong-streak từ verdict thực tế (spec §3 rule 4) thay vì
				// proxy `safety` — gate assertion ở #379. Panel và nút continue
				// render cùng một commit React nên nút visible thì verdict đã
				// có mặt. Whitelist chặn mirror-inflation nếu UI copy drift.
				const verdict =
					(await page.getByTestId("vocab-feedback-verdict").textContent()) ??
					"";
				expect(
					["Chính xác", "Chưa đúng", "Chưa nhớ"],
					"feedback verdict text drift",
				).toContain(verdict);
				if (verdict === "Chính xác") {
					wrongStreak = 0;
				} else {
					wrongStreak += 1;
				}
				if (wrongStreak >= 5) {
					overlayRequired = true;
				}
				await expect(feedbackContinue).toBeEnabled();
				await feedbackContinue.click();
			}
			// Assertion bám điều kiện trigger thật của overlay (≥ 5 wrong/forgot
			// liên tiếp, đếm từ feedback verdict) thay vì proxy `safety` (tăng cả
			// vòng chờ render) — #379.
			if (overlayRequired) {
				expect(overlaySeen, "wrong-streak overlay appeared").toBe(true);
			}
			// Assert nghịch: overlay xuất hiện ⇒ mirror phải đạt 5 (phát hiện
			// mirror drift, ví dụ verdict text trên UI đổi mà spec không cập nhật).
			if (overlaySeen) {
				expect(overlayRequired, "overlay implies 5 wrong/forgot counted").toBe(
					true,
				);
			}
			await expect(page.getByTestId("vocab-summary-review")).toBeVisible();
			await page.getByTestId("vocab-summary-back").click();

			// Teacher xoá deck (C2: seed trực tiếp libsql — request kernel bằng
			// session học sinh sẽ 403 role gate; không backdoor route).
			const deleteDb = openDb();
			try {
				await deleteDb.execute({
					sql: "DELETE FROM vocab_card WHERE word_id IN (SELECT id FROM vocab_word WHERE deck_id = ?)",
					args: [deckId],
				});
				await deleteDb.execute({
					sql: "DELETE FROM vocab_word WHERE deck_id = ?",
					args: [deckId],
				});
				await deleteDb.execute({
					sql: "DELETE FROM vocab_deck WHERE id = ?",
					args: [deckId],
				});
			} finally {
				deleteDb.close();
			}

			// Sau khi xoá deck, đang ở /practice/vocabulary/$deckId (404) — sang /practice/vocabulary để assert
			// overview: mất deck nhưng streak giữ nguyên (review_log sống sót).
			await page.goto(`${STUDENT_ORIGIN}/practice/vocabulary`);
			await expect(page.getByTestId("vocab-overview-page")).toBeVisible();
			await expect(page.getByTestId("vocab-overview-streak")).toHaveText(
				"1 ngày",
			);
			await expect(page.getByTestId(`vocab-deck-card-${deckId}`)).toHaveCount(
				0,
			);
		});
	});
