import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
			const speakingHighlighter = page.getByTestId(
				"speaking-error-highlighter",
			);

			// Kiểm tra chú giải 4 tiêu chí tiếng Anh riêng cho Writing & Speaking.
			const writingLegend = writingHighlighter.getByLabel("Chú giải loại lỗi");
			await expect(writingLegend).toContainText("Task Response");
			await expect(writingLegend).toContainText("Coherence & Cohesion");
			await expect(writingLegend).toContainText("Lexical Resource");
			await expect(writingLegend).toContainText("Grammatical Range & Accuracy");
			await expect(writingLegend).not.toContainText("Pronunciation");
			await expect(writingLegend).not.toContainText("Chính tả");

			const speakingLegend =
				speakingHighlighter.getByLabel("Chú giải loại lỗi");
			await expect(speakingLegend).toContainText("Fluency & Coherence");
			await expect(speakingLegend).toContainText("Lexical Resource");
			await expect(speakingLegend).toContainText(
				"Grammatical Range & Accuracy",
			);
			await expect(speakingLegend).toContainText("Pronunciation");
			await expect(speakingLegend).not.toContainText("Task Response");
			await expect(speakingLegend).not.toContainText("Chính tả");

			// Kiểm tra màu slider 4 tiêu chí đồng bộ với chú giải & khác slider tổng (cả light & dark).
			for (const dark of [false, true]) {
				await page.evaluate((enableDark) => {
					document.documentElement.classList.toggle("dark", enableDark);
				}, dark);
				const sliderColors = await page.evaluate(() => {
					const accentOf = (id: string) => {
						const el = document.getElementById(id);
						return el ? getComputedStyle(el).accentColor : "";
					};
					return {
						wTask: accentOf("writing-task-slider"),
						wCoherence: accentOf("writing-coherence-slider"),
						wLexical: accentOf("writing-lexical-slider"),
						wGrammar: accentOf("writing-grammar-slider"),
						wOverall: accentOf("writing-overall-slider"),
						sFluency: accentOf("speaking-fluency-slider"),
						sLexical: accentOf("speaking-lexical-slider"),
						sGrammar: accentOf("speaking-grammar-slider"),
						sPronunciation: accentOf("speaking-pronunciation-slider"),
						sOverall: accentOf("speaking-overall-slider"),
					};
				});
				expect(
					new Set([
						sliderColors.wTask,
						sliderColors.wCoherence,
						sliderColors.wLexical,
						sliderColors.wGrammar,
					]).size,
					`4 màu slider Writing phân biệt (${dark ? "dark" : "light"})`,
				).toBe(4);
				expect(sliderColors.wTask).not.toBe(sliderColors.wOverall);
				expect(sliderColors.wCoherence).toBe(sliderColors.sFluency);
				expect(sliderColors.wLexical).toBe(sliderColors.sLexical);
				expect(sliderColors.wGrammar).toBe(sliderColors.sGrammar);
				expect(
					new Set([
						sliderColors.sFluency,
						sliderColors.sLexical,
						sliderColors.sGrammar,
						sliderColors.sPronunciation,
					]).size,
					`4 màu slider Speaking phân biệt (${dark ? "dark" : "light"})`,
				).toBe(4);
				expect(sliderColors.sPronunciation).not.toBe(sliderColors.sOverall);
			}
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);

			// Nhập nhận xét từng tiêu chí (bỏ trống Lexical để kiểm tra ẩn khi rỗng).
			const WRITING_TASK_COMMENT =
				"Trả lời đủ ý chính của đề bài, nên phát triển thêm ví dụ cụ thể.";
			const WRITING_COHERENCE_COMMENT =
				"Bố cục rõ ràng, có thể đa dạng hơn các từ nối giữa các đoạn.";
			const WRITING_GRAMMAR_COMMENT =
				"Chú ý chia động từ hiện tại đơn với chủ ngữ ngôi thứ nhất.";
			const SPEAKING_FLUENCY_COMMENT =
				"Tốc độ nói tự nhiên, ít ngập ngừng ở các câu quen thuộc.";
			const SPEAKING_PRONUNCIATION_COMMENT =
				"Cần nhấn rõ âm cuối của danh từ số nhiều.";

			await page.getByTestId("writing-task-comment").fill(WRITING_TASK_COMMENT);
			await page
				.getByTestId("writing-coherence-comment")
				.fill(WRITING_COHERENCE_COMMENT);
			await page
				.getByTestId("writing-grammar-comment")
				.fill(WRITING_GRAMMAR_COMMENT);
			await page
				.getByTestId("speaking-fluency-comment")
				.fill(SPEAKING_FLUENCY_COMMENT);
			await page
				.getByTestId("speaking-pronunciation-comment")
				.fill(SPEAKING_PRONUNCIATION_COMMENT);

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

			// Chụp POT panel giáo viên (đủ 2 highlight + IELTS grading + màu slider + comment tiêu chí).
			const potIssue = process.env.CAPTURE_POT_ISSUE?.trim();
			await writingHighlighter.scrollIntoViewIfNeeded();
			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await page.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);
				await expectNoHorizontalOverflow(page, `/leads light ${vp.label}`);
				await writingHighlighter.scrollIntoViewIfNeeded();
				if (potIssue === "863") {
					await page.screenshot({
						path: reportPath(`863-teacher-grading-light-${vp.label}.png`),
					});
					await page.evaluate(() =>
						document.documentElement.classList.add("dark"),
					);
					await expectNoHorizontalOverflow(page, `/leads dark ${vp.label}`);
					await writingHighlighter.scrollIntoViewIfNeeded();
					await page.screenshot({
						path: reportPath(`863-teacher-grading-dark-${vp.label}.png`),
					});
				} else {
					await page.screenshot({
						path: reportPath(`800-leads-grading-${vp.label}.png`),
					});
				}
			}
			// Kiểm tra reflow 320px không tràn ngang.
			await page.setViewportSize({ width: 320, height: 812 });
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);
			await expectNoHorizontalOverflow(page, "/leads reflow 320px");

			await page.setViewportSize({ width: 1440, height: 900 });
			if (potIssue !== "863") {
				await page.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await writingHighlighter.scrollIntoViewIfNeeded();
				await page.screenshot({
					path: reportPath("800-leads-grading-desktop-dark.png"),
				});
				await page.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);
			}

			await writingHighlighter
				.getByRole("button", { name: "Xoá lỗi 1" })
				.click();
			await expect(marks).toHaveCount(1);
			await expect(marks.first()).toHaveText(ADDED_ERROR_QUOTE);
			const cards = writingHighlighter.getByTestId("writing-error-card");
			await expect(cards).toHaveCount(1);
			await expect(cards.first()).toContainText("live");
			await expect(cards.first()).toContainText("I live.");

			// 5. Chốt → phiếu kết quả PDF + trạng thái email.
			await expect(saveBtn).toHaveText("Chốt kết quả & gửi học viên");
			const patch = page.waitForResponse(
				(res) =>
					/\/api\/leads\/[^/]+\/placement-submission$/.test(res.url()) &&
					res.request().method() === "PATCH",
			);
			await saveBtn.click();
			const patchRes = await patch;
			expect(patchRes.status()).toBe(200);
			const graded = (await patchRes.json()) as { resultUrl?: string | null };
			const resultUrl = graded.resultUrl ?? null;
			expect(resultUrl).toMatch(
				new RegExp(
					`^${PROFILE_ORIGIN}/kiem-tra-dau-vao/ket-qua/\\?t=[0-9a-f]{64}$`,
				),
			);

			await expect(page.getByTestId("placement-result-link")).toHaveCount(0);
			const pdfCard = page.getByTestId("placement-result-pdf");
			await expect(pdfCard).toBeVisible();
			await expect(
				page.getByTestId("placement-result-email-status"),
			).toHaveText("Đã gửi email kết quả cho học viên.");
			await expect(saveBtn).toHaveText("Cập nhật kết quả đã chốt");
			await expect(page.getByTestId("placement-pdf-dirty-warning")).toHaveCount(
				0,
			);

			// Tải phiếu kết quả PDF 1-click và kiểm tra tên file + nội dung PDF thật.
			const exportPdfBtn = page.getByTestId("export-result-pdf-btn");
			const downloadPromise = page.waitForEvent("download");
			await exportPdfBtn.click();
			const download = await downloadPromise;
			expect(download.suggestedFilename()).toMatch(/^phieu-ket-qua-.*\.pdf$/);
			const downloadPath = await download.path();
			expect(downloadPath).toBeTruthy();
			if (!downloadPath) {
				throw new Error("Playwright download.path() trả về null");
			}
			const pdfBytes = await readFile(downloadPath);
			expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
			expect(pdfBytes.byteLength).toBeGreaterThan(5_000);
			await expect(exportPdfBtn).toBeEnabled();

			// Kiểm tra responsive 3 viewport + light/dark.
			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await page.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);
				await expectNoHorizontalOverflow(
					page,
					`/leads pdf-card light ${vp.label}`,
				);
				if (potIssue !== "863") {
					await pdfCard.scrollIntoViewIfNeeded();
					await page.screenshot({
						path: reportPath(`853-placement-pdf-panel-light-${vp.label}.png`),
					});
				}
				await page.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await expectNoHorizontalOverflow(
					page,
					`/leads pdf-card dark ${vp.label}`,
				);
				if (potIssue !== "863") {
					await pdfCard.scrollIntoViewIfNeeded();
					await page.screenshot({
						path: reportPath(`853-placement-pdf-panel-dark-${vp.label}.png`),
					});
				}
			}
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);
			await page.setViewportSize({ width: 1440, height: 900 });

			// Chỉnh sửa form sau khi chốt mà chưa lưu → hiện cảnh báo dirty trên khối PDF.
			const feedbackInput = page.getByLabel("Nhận xét bài kiểm tra đầu vào");
			const existingFeedback = await feedbackInput.inputValue();
			await feedbackInput.fill(
				`${existingFeedback}${existingFeedback ? " " : ""}Ghi chú thêm chưa lưu.`,
			);
			await expect(
				page.getByTestId("placement-pdf-dirty-warning"),
			).toBeVisible();

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
				await expect(
					writingSection.locator(".error-legend-list"),
				).toContainText("Task Response");
				await expect(
					writingSection.locator(".error-legend-list"),
				).not.toContainText("Pronunciation");
				await expect(
					writingSection.locator('[data-criterion-comment="task"]'),
				).toHaveText(WRITING_TASK_COMMENT);
				await expect(
					writingSection.locator('[data-criterion-comment="coherence"]'),
				).toHaveText(WRITING_COHERENCE_COMMENT);
				await expect(
					writingSection.locator('[data-criterion-comment="grammar"]'),
				).toHaveText(WRITING_GRAMMAR_COMMENT);
				await expect(
					writingSection.locator('[data-criterion-comment="lexical"]'),
				).toHaveCount(0);

				const speakingSection = student.locator("section", {
					has: student.locator("#secSpeaking"),
				});
				await expect(speakingSection).toContainText("Speaking: Band 6.5/9");
				await expect(
					speakingSection.locator('[data-criterion-comment="fluency"]'),
				).toHaveText(SPEAKING_FLUENCY_COMMENT);
				await expect(
					speakingSection.locator('[data-criterion-comment="pronunciation"]'),
				).toHaveText(SPEAKING_PRONUNCIATION_COMMENT);
				await expect(
					speakingSection.locator('[data-criterion-comment="lexical"]'),
				).toHaveCount(0);
				await expect(
					speakingSection.locator(".error-legend-list"),
				).toContainText("Pronunciation");
				await expect(
					speakingSection.locator(".error-legend-list"),
				).not.toContainText("Task Response");

				const resultMarks = writingSection.locator(".annotated-text mark");
				await expect(resultMarks).toHaveCount(1);
				await expect(resultMarks.first()).toHaveAttribute("id", "w-mark-1");
				await expect(resultMarks.first()).toContainText(ADDED_ERROR_QUOTE);
				await expect(resultMarks.first()).toHaveClass(/err-grammar/);
				await expect(writingSection.locator(".error-cards li")).toHaveCount(1);
				await expect(writingSection.locator(".error-cards")).toContainText(
					"Grammatical Range & Accuracy",
				);
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
					if (potIssue === "863") {
						await student.screenshot({
							path: reportPath(`863-profile-result-${vp.label}.png`),
						});
					} else {
						await student.screenshot({
							path: reportPath(`800-profile-result-${vp.label}.png`),
						});
					}
				}
				await student.setViewportSize({ width: 320, height: 812 });
				await expectNoHorizontalOverflow(student, "kết quả reflow 320px");
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
