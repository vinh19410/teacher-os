import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * #730: nộp bài test đầu vào có Writing → server chấm nháp AI nền (fake grader
 * của e2e boot: rubric 3, lỗi = từ đầu tiên của bài) → giáo viên duyệt/sửa lỗi
 * tại /leads rồi chốt → học viên mở link kết quả công khai trên profile.
 */

const LEAD_ORG_ID = "e2e-lead-org";
const SEED_DIR = new URL("../../web/public/placement-seed/", import.meta.url);
const questionsData = JSON.parse(
	readFileSync(fileURLToPath(new URL("questions.json", SEED_DIR)), "utf8"),
);

// Từ đầu tiên "Dear" là lỗi fake grader đánh dấu; "lives" là lỗi giáo viên thêm.
const WRITING_TEXT =
	"Dear Ben, I lives in District 9 with my sister. We often go to the park on Sunday and play badminton together. See you soon, An.";
const AI_ERROR_QUOTE = "Dear";
const ADDED_ERROR_QUOTE = "lives";

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

const uniquePhone = () =>
	`0908${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;

async function clearRateLimits() {
	const db = await openDb();
	try {
		await db.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		await db.execute(
			"UPDATE placement_test_submission SET ip_hash = '' WHERE ip_hash != ''",
		);
	} finally {
		db.close();
	}
}

/** Đăng ký giáo viên rồi chuyển membership sang org nhận lead của e2e boot. */
async function signUpLeadOrgTeacher(page: Page, name: string) {
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
		for (let i = 0; i < 40 && reassigned === 0; i++) {
			const updated = await db.execute({
				sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
				args: [LEAD_ORG_ID, userId],
			});
			reassigned = updated.rowsAffected;
			if (reassigned === 0) await page.waitForTimeout(250);
		}
		expect(reassigned, "membership reassign sang lead org").toBe(1);
	} finally {
		db.close();
	}
}

/** Xuất bản bộ đề seed cho org lead (giáo viên đã đăng nhập trên `page`). */
async function publishSeedPlacementTest(page: Page) {
	const db = await openDb();
	try {
		for (const table of [
			"placement_test_submission",
			"placement_test",
			"placement_test_audio",
		]) {
			await db.execute({
				sql: `DELETE FROM ${table} WHERE org_id = ?`,
				args: [LEAD_ORG_ID],
			});
		}
	} finally {
		db.close();
	}

	const content = structuredClone(questionsData);
	for (const clip of content.parts[0].clips) {
		const bytes = readFileSync(
			fileURLToPath(new URL(`${clip.id}.mp3`, SEED_DIR)),
		);
		const res = await page.request.put(
			`${API_ORIGIN}/api/placement-test/audio`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(bytes.byteLength),
					"X-File-Name": encodeURIComponent(`${clip.id}.mp3`),
				},
				data: bytes,
			},
		);
		expect(res.status()).toBe(200);
		clip.audioId = ((await res.json()) as { audioId: string }).audioId;
	}
	const draft = await page.request.put(
		`${API_ORIGIN}/api/placement-test/draft`,
		{
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			data: { revision: 0, content },
		},
	);
	expect(draft.status()).toBe(200);
	const pub = await page.request.post(
		`${API_ORIGIN}/api/placement-test/publish`,
		{
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			data: { revision: 1 },
		},
	);
	expect(pub.status()).toBe(200);
}

/** Đáp án đúng toàn bộ 3 phần tự động (dựng từ bộ đề seed). */
function correctAnswers() {
	const listening: Record<string, string | number> = {};
	for (const clip of questionsData.parts[0].clips) {
		for (const q of clip.questions) {
			listening[q.id] = q.type === "gap" ? (q.accept?.[0] ?? "") : q.answer;
		}
	}
	const vocabGrammar: Record<string, number> = {};
	for (const q of questionsData.parts[1].questions)
		vocabGrammar[q.id] = q.answer;
	const reading: Record<string, number> = {};
	for (const p of questionsData.parts[2].passages) {
		for (const q of p.questions) reading[q.id] = q.answer;
	}
	return { listening, vocabGrammar, reading };
}

/** Bôi đen `quote` trong khối văn bản highlighter như khi kéo chuột. */
async function selectTextInHighlighter(page: Page, quote: string) {
	const container = page.getByTestId("writing-highlight-text");
	await container.evaluate((root, needle) => {
		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			const idx = n.textContent?.indexOf(needle) ?? -1;
			if (idx < 0) continue;
			const range = document.createRange();
			range.setStart(n, idx);
			range.setEnd(n, idx + needle.length);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
			root.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			return;
		}
		throw new Error(`không thấy "${needle}" trong bài viết`);
	}, quote);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(overflow, `không tràn ngang ở ${label}`).toBe(false);
}

test.describe
	.serial("chấm nháp AI bài test đầu vào → chốt → link kết quả (#730)", () => {
		test("giáo viên duyệt nháp AI, sửa lỗi, chốt; học viên xem điểm + highlight", async ({
			page,
			browser,
		}) => {
			await signUpLeadOrgTeacher(page, "Cô Mỹ AI E2E");
			await publishSeedPlacementTest(page);
			await clearRateLimits();

			// 1. Học viên nộp bài (Writing + upload Speaking WebM) qua API công khai.
			const phone = uniquePhone();
			const submitRes = await page.request.post(
				`${API_ORIGIN}/public/placement-test/submissions`,
				{
					headers: {
						Origin: PROFILE_ORIGIN,
						"Content-Type": "application/json",
					},
					data: {
						lead: {
							name: "Học Viên AI E2E",
							phone,
							email: `hocvien.ai.${Date.now()}@example.com`,
						},
						answers: correctAnswers(),
						writingText: WRITING_TEXT,
						speakingMode: "upload",
						speakingDurationSec: 12,
					},
				},
			);
			expect(submitRes.status()).toBe(201);
			const created = (await submitRes.json()) as {
				submissionId: string;
				uploadToken: string;
			};
			const webmBytes = Buffer.from([
				0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84,
				0x77, 0x65, 0x62, 0x6d, 0x00, 0x00,
			]);
			const uploadRes = await page.request.put(
				`${API_ORIGIN}/public/placement-test/submissions/${created.submissionId}/speaking-media`,
				{
					headers: {
						Origin: PROFILE_ORIGIN,
						"X-Upload-Token": created.uploadToken,
						"X-Media-Filename": "speaking.webm",
						"Content-Type": "audio/webm",
					},
					data: webmBytes,
				},
			);
			expect(uploadRes.status()).toBe(200);

			// 2. Giáo viên mở lead → banner AI đã liệt kê lỗi, ô điểm IELTS trống (không đề xuất điểm/nhận xét), highlight lỗi AI.
			await page.goto(`${WEB_ORIGIN}/leads`);
			const table = page.getByTestId("leads-table");
			await expect(table).toBeVisible();
			await table.locator("tr", { hasText: phone }).click();

			const panel = page.getByTestId("placement-submission-panel");
			await expect(panel).toBeVisible();
			const aiStatus = page.getByTestId("placement-ai-status");
			await expect(aiStatus).toHaveAttribute("data-ai-status", "drafted", {
				timeout: 30_000,
			});
			await expect(aiStatus).toContainText(
				"Danh sách lỗi AI — chưa gửi học viên",
			);
			await expect(page.getByTestId("writing-ai-feedback")).toHaveCount(0);
			await expect(page.getByTestId("speaking-ai-feedback")).toHaveCount(0);
			for (const testId of [
				"writing-task-input",
				"writing-coherence-input",
				"writing-lexical-input",
				"writing-grammar-input",
				"writing-overall-input",
				"speaking-fluency-input",
				"speaking-lexical-input",
				"speaking-grammar-input",
				"speaking-pronunciation-input",
				"speaking-overall-input",
			]) {
				await expect(page.getByTestId(testId)).toHaveValue("");
			}
			const saveBtn = page.getByTestId("save-placement-grade-btn");
			await expect(saveBtn).toBeDisabled();
			await expect(page.getByTestId("save-placement-grade-hint")).toBeVisible();

			// Nhập 4 tiêu chí IELTS Writing (auto-fill overall 6.5), thử sửa tay rồi trả về 6.5; nhập Speaking 6.5.
			await page.getByTestId("writing-task-input").fill("6.5");
			await page.getByTestId("writing-coherence-input").fill("6");
			await page.getByTestId("writing-lexical-input").fill("6.5");
			await page.getByTestId("writing-grammar-input").fill("6");
			await expect(page.getByTestId("writing-overall-input")).toHaveValue(
				"6.5",
			);
			await page.getByTestId("writing-overall-input").fill("7");
			await expect(page.getByTestId("placement-score-summary")).toContainText(
				"Writing Band 7.0/9",
			);
			await page.getByTestId("writing-overall-input").fill("6.5");

			await page.getByTestId("speaking-fluency-input").fill("6");
			await page.getByTestId("speaking-lexical-input").fill("6");
			await page.getByTestId("speaking-grammar-input").fill("6.5");
			await page.getByTestId("speaking-pronunciation-input").fill("6.5");
			await expect(page.getByTestId("speaking-overall-input")).toHaveValue(
				"6.5",
			);
			// Chưa chọn khóa học đề xuất → nút chốt vẫn bị khóa.
			await expect(saveBtn).toBeDisabled();
			const courseSelect = page.getByTestId("placement-course-select");
			await expect(courseSelect).toBeVisible();
			await courseSelect.selectOption({ label: "Pre IELTS" });
			await expect(saveBtn).toBeEnabled();

			const writingHighlighter = page.getByTestId("writing-error-highlighter");
			const marks = writingHighlighter.getByTestId("writing-error-mark");
			await expect(marks).toHaveCount(1);
			await expect(marks.first()).toHaveText(AI_ERROR_QUOTE);
			await expect(marks.first()).toHaveAttribute("data-category", "grammar");

			// 3. Thêm lỗi bằng bôi đen "lives".
			const addBtn = page.getByTestId("writing-add-error-btn");
			await expect(addBtn).toBeDisabled();
			await selectTextInHighlighter(page, ADDED_ERROR_QUOTE);
			await expect(addBtn).toBeEnabled();
			await addBtn.click();
			const form = page.getByTestId("writing-error-form");
			await expect(form).toContainText(ADDED_ERROR_QUOTE);
			await form.getByLabel("Cách sửa").fill("live");
			await form
				.getByLabel("Giải thích")
				.fill("Chủ ngữ I đi với động từ nguyên mẫu.");
			await page.getByTestId("writing-error-save-btn").click();
			await expect(form).toBeHidden();
			await expect(marks).toHaveCount(2);
			await expect(marks.nth(1)).toHaveText(ADDED_ERROR_QUOTE);

			// 4. Sửa lỗi vừa thêm (đổi giải thích), xoá lỗi AI "Dear".
			await writingHighlighter
				.getByRole("button", { name: "Sửa lỗi 2" })
				.click();
			await expect(form).toContainText("Sửa lỗi");
			await form
				.getByLabel("Giải thích")
				.fill("Chủ ngữ I dùng động từ nguyên mẫu: I live.");
			await page.getByTestId("writing-error-save-btn").click();
			await expect(form).toBeHidden();

			// Chụp POT panel giáo viên (đủ 2 highlight + IELTS grading) trước khi xoá lỗi AI.
			await writingHighlighter.scrollIntoViewIfNeeded();
			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await expectNoHorizontalOverflow(page, `/leads ${vp.label}`);
				await writingHighlighter.scrollIntoViewIfNeeded();
				await page.screenshot({
					path: reportPath(`800-leads-grading-${vp.label}.png`),
				});
			}
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate(() => document.documentElement.classList.add("dark"));
			await writingHighlighter.scrollIntoViewIfNeeded();
			await page.screenshot({
				path: reportPath("800-leads-grading-desktop-dark.png"),
			});
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);

			await writingHighlighter
				.getByRole("button", { name: "Xoá lỗi 1" })
				.click();
			await expect(marks).toHaveCount(1);
			await expect(marks.first()).toHaveText(ADDED_ERROR_QUOTE);
			const cards = writingHighlighter.getByTestId("writing-error-card");
			await expect(cards).toHaveCount(1);
			await expect(cards.first()).toContainText("live");
			await expect(cards.first()).toContainText("I live.");

			// 5. Chốt → link kết quả + trạng thái email.
			await expect(saveBtn).toHaveText("Chốt kết quả & gửi học viên");
			const patch = page.waitForResponse(
				(res) =>
					/\/api\/leads\/[^/]+\/placement-submission$/.test(res.url()) &&
					res.request().method() === "PATCH",
			);
			await saveBtn.click();
			expect((await patch).status()).toBe(200);
			const resultLink = page.getByTestId("placement-result-link");
			await expect(resultLink).toBeVisible();
			await expect(
				page.getByTestId("placement-result-email-status"),
			).toHaveText("Đã gửi email kết quả cho học viên.");
			await expect(saveBtn).toHaveText("Cập nhật kết quả đã chốt");
			const resultUrl = await resultLink.locator("a").getAttribute("href");
			expect(resultUrl).toMatch(
				new RegExp(
					`^${PROFILE_ORIGIN}/kiem-tra-dau-vao/ket-qua/\\?t=[0-9a-f]{64}$`,
				),
			);

			// 6. Học viên (context riêng, không đăng nhập) mở link kết quả.
			const studentContext = await browser.newContext();
			const student = await studentContext.newPage();
			try {
				await student.goto(resultUrl ?? "");
				await expect(
					student.getByRole("heading", { name: "Kết quả của Học Viên AI E2E" }),
				).toBeVisible();
				const writingSection = student.locator("section", {
					has: student.locator("#secWriting"),
				});
				await expect(writingSection).toContainText("Writing: Band 6.5/9");
				await expect(writingSection).toContainText("Task Response");
				const resultMarks = writingSection.locator(".annotated-text mark");
				await expect(resultMarks).toHaveCount(1);
				await expect(resultMarks.first()).toHaveAttribute("id", "w-mark-1");
				await expect(resultMarks.first()).toContainText(ADDED_ERROR_QUOTE);
				await expect(resultMarks.first()).toHaveClass(/err-grammar/);
				await expect(writingSection.locator(".error-cards li")).toHaveCount(1);
				await expect(writingSection.locator(".error-cards")).toContainText(
					"lives → live",
				);
				await expect(writingSection.locator(".error-cards")).not.toContainText(
					AI_ERROR_QUOTE,
				);
				await expect(writingSection.locator(".annotated-text")).toContainText(
					"Dear Ben, I lives",
				);

				for (const vp of VIEWPORTS) {
					await student.setViewportSize({ width: vp.width, height: vp.height });
					await expectNoHorizontalOverflow(student, `kết quả ${vp.label}`);
					await writingSection.scrollIntoViewIfNeeded();
					await student.screenshot({
						path: reportPath(`800-profile-result-${vp.label}.png`),
					});
				}
			} finally {
				await studentContext.close();
			}
		});

		test("link kết quả token sai → thông báo chưa sẵn sàng", async ({
			page,
		}) => {
			await page.goto(
				`${PROFILE_ORIGIN}/kiem-tra-dau-vao/ket-qua/?t=${"0".repeat(64)}`,
			);
			await expect(
				page.getByRole("heading", {
					name: "Kết quả chưa sẵn sàng hoặc link không đúng",
				}),
			).toBeVisible();
			await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/ket-qua/`);
			await expect(
				page.getByRole("heading", {
					name: "Kết quả chưa sẵn sàng hoặc link không đúng",
				}),
			).toBeVisible();
		});
	});
