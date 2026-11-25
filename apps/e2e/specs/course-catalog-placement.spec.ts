import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import {
	API_ORIGIN,
	PROFILE_ORIGIN,
	TEACHER_BASE_URL,
	WEB_ORIGIN,
} from "./origins";

/**
 * #851: Master data khóa học 2 cấp (/courses) và dropdown bắt buộc chọn 1 khóa
 * học đề xuất khi chấm bài kiểm tra đầu vào (PlacementSubmissionPanel).
 */

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

const uniquePhone = () =>
	`0907${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;

async function clearRateLimitsAndCatalog() {
	const db = await openDb();
	try {
		await db.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		await db.execute(
			"UPDATE placement_test_submission SET ip_hash = '' WHERE ip_hash != ''",
		);
		await db.execute({
			sql: "UPDATE placement_test_submission SET final_course_id = NULL WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await db.execute({
			sql: "DELETE FROM course WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await db.execute({
			sql: "DELETE FROM course_category WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await db.execute({
			sql: "DELETE FROM course_catalog_seed WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
	} finally {
		db.close();
	}
}

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

async function expectNoHorizontalOverflow(page: Page, label: string) {
	const overflow = await page.evaluate(
		() =>
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	);
	expect(overflow, `không tràn ngang ở ${label}`).toBe(false);
}

test.describe
	.serial("Master data khóa học & chọn khóa đề xuất khi chấm bài đầu vào (#851)", () => {
		test("quản trị /courses 2 cấp, chấm bài bắt buộc chọn khóa, đồng bộ kết quả và giữ lịch sử khi xóa khóa", async ({
			page,
			browser,
		}) => {
			await signUpLeadOrgTeacher(page, "Cô Mỹ Courses E2E");
			await clearRateLimitsAndCatalog();
			await publishSeedPlacementTest(page);

			// 1. Mở /courses → thấy 2 nhóm mặc định (Giao Tiếp 3 khóa, IELTS 4 khóa).
			await page.goto(`${TEACHER_BASE_URL}/courses`);
			const categoryCards = page.getByTestId("course-category-card");
			await expect(categoryCards).toHaveCount(2);
			await expect(categoryCards.nth(0)).toContainText("Giao Tiếp");
			await expect(categoryCards.nth(0)).toContainText(
				"Communication English Level 1",
			);
			await expect(categoryCards.nth(0)).toContainText(
				"Communication English Level 2",
			);
			await expect(categoryCards.nth(0)).toContainText(
				"Communication English Level 3",
			);
			await expect(categoryCards.nth(1)).toContainText("IELTS");
			await expect(categoryCards.nth(1)).toContainText("Foundation");
			await expect(categoryCards.nth(1)).toContainText("First Step");
			await expect(categoryCards.nth(1)).toContainText("Pre IELTS");
			await expect(categoryCards.nth(1)).toContainText("Advanced");

			// Chụp POT /courses ở 3 viewport + dark desktop + kiểm tra 320px không tràn ngang.
			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await expectNoHorizontalOverflow(page, `/courses ${vp.label}`);
				await page.screenshot({
					path: reportPath(`851-courses-${vp.label}.png`),
					fullPage: true,
				});
			}
			await page.setViewportSize({ width: 320, height: 640 });
			await expectNoHorizontalOverflow(page, "/courses 320px");

			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate(() => document.documentElement.classList.add("dark"));
			await page.screenshot({
				path: reportPath("851-courses-desktop-dark.png"),
				fullPage: true,
			});
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);

			// 2. Tạo thêm 1 nhóm & 1 khóa thử nghiệm để verify CRUD 2 cấp hoạt động.
			await page.getByTestId("add-category-btn").click();
			await page.getByTestId("course-category-name-input").fill("TOEIC");
			await page.getByTestId("course-category-submit-btn").click();
			await expect(categoryCards).toHaveCount(3);
			await expect(categoryCards.nth(2)).toContainText("TOEIC");

			await page.getByTestId("add-course-btn").click();
			await page
				.getByTestId("course-item-category-select")
				.selectOption({ label: "TOEIC" });
			await page.getByTestId("course-item-name-input").fill("TOEIC 650+");
			await page.getByTestId("course-item-submit-btn").click();
			await expect(categoryCards.nth(2)).toContainText("TOEIC 650+");

			// 3. Học viên nộp bài kiểm tra đầu vào.
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
							name: "Học Viên Khóa Đề Xuất",
							phone,
							email: `hocvien.course.${Date.now()}@example.com`,
						},
						answers: correctAnswers(),
						writingText:
							"I want to improve my English speaking and writing skills for international work.",
						speakingMode: "upload",
						speakingDurationSec: 10,
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

			// 4. Mở /leads → chấm bài: nhập đủ Writing & Speaking nhưng chưa chọn khóa → nút Chốt disabled.
			await page.goto(`${TEACHER_BASE_URL}/leads`);
			const table = page.getByTestId("leads-table");
			await expect(table).toBeVisible();
			await table.locator("tr", { hasText: phone }).click();

			const panel = page.getByTestId("placement-submission-panel");
			await expect(panel).toBeVisible();
			await page.getByTestId("writing-task-input").fill("6");
			await page.getByTestId("writing-coherence-input").fill("6");
			await page.getByTestId("writing-lexical-input").fill("6");
			await page.getByTestId("writing-grammar-input").fill("6");
			await page.getByTestId("speaking-fluency-input").fill("6");
			await page.getByTestId("speaking-lexical-input").fill("6");
			await page.getByTestId("speaking-grammar-input").fill("6");
			await page.getByTestId("speaking-pronunciation-input").fill("6");

			const saveBtn = page.getByTestId("save-placement-grade-btn");
			await expect(saveBtn).toBeDisabled();
			await expect(page.getByTestId("save-placement-grade-hint")).toContainText(
				"Chọn khóa học đề xuất để chốt kết quả.",
			);

			// Chọn khóa TOEIC 650+ vừa tạo từ dropdown gom nhóm.
			const courseSelect = page.getByTestId("placement-course-select");
			await expect(courseSelect).toBeVisible();
			await courseSelect.selectOption({ label: "TOEIC 650+" });
			await expect(saveBtn).toBeEnabled();

			// Chụp POT dropdown chọn khóa ở 3 viewport + dark desktop.
			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await expectNoHorizontalOverflow(page, `/leads modal ${vp.label}`);
				await courseSelect.scrollIntoViewIfNeeded();
				await page.screenshot({
					path: reportPath(`851-placement-dropdown-${vp.label}.png`),
					fullPage: false,
				});
			}
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.evaluate(() => document.documentElement.classList.add("dark"));
			await courseSelect.scrollIntoViewIfNeeded();
			await page.screenshot({
				path: reportPath("851-placement-dropdown-desktop-dark.png"),
				fullPage: false,
			});
			await page.evaluate(() =>
				document.documentElement.classList.remove("dark"),
			);

			// 5. Chốt kết quả → kiểm tra phiếu PDF + link kết quả công khai từ PATCH response + đồng bộ tên khóa trên /leads.
			const patchPromise = page.waitForResponse(
				(res) =>
					/\/api\/leads\/[^/]+\/placement-submission$/.test(res.url()) &&
					res.request().method() === "PATCH",
			);
			await saveBtn.click();
			const patchRes = await patchPromise;
			expect(patchRes.status()).toBe(200);
			const graded = (await patchRes.json()) as { resultUrl?: string | null };
			const resultUrl = graded.resultUrl ?? null;
			expect(resultUrl).toBeTruthy();

			await expect(page.getByTestId("placement-result-link")).toHaveCount(0);
			await expect(page.getByTestId("placement-result-pdf")).toBeVisible();

			await page.keyboard.press("Escape");
			await expect(panel).toBeHidden();
			await expect(table.locator("tr", { hasText: phone })).toContainText(
				"TOEIC - TOEIC 650+",
			);

			// 6. Xóa khóa "TOEIC 650+" trong /courses → xác nhận lịch sử bài đã chấm cũ vẫn giữ snapshot "TOEIC - TOEIC 650+".
			await page.goto(`${TEACHER_BASE_URL}/courses`);
			const toeicCard = page
				.getByTestId("course-category-card")
				.filter({ hasText: "TOEIC" });
			await toeicCard
				.getByRole("button", { name: "Xóa khóa học TOEIC 650+" })
				.click();
			await page.getByTestId("course-delete-confirm-btn").click();
			await expect(toeicCard).not.toContainText("TOEIC 650+");

			const studentCtx = await browser.newContext();
			const studentPage = await studentCtx.newPage();
			try {
				await studentPage.goto(resultUrl ?? "");
				await expect(studentPage.locator("body")).toContainText(
					"TOEIC - TOEIC 650+",
				);
			} finally {
				await studentCtx.close();
			}
		});
	});
