import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { seedUserViaE2e, signUpViaApi } from "./helpers";
import {
	API_ORIGIN,
	PROFILE_ORIGIN,
	TEACHER_BASE_URL,
	WEB_ORIGIN,
} from "./origins";

/**
 * E2E regression (#742): khi `LEAD_ORG_ID` trỏ vào org QA cũ còn giáo viên
 * thuộc `TEACHER_EMAILS` bootstrap org riêng (`ctx.orgId != LEAD_ORG_ID`),
 * luồng `/kiem-tra-dau-vao/` vẫn fallback đọc đề/audio từ `LEAD_ORG_ID` nếu
 * org giáo viên chưa phát hành, đồng thời ghi lead + bài nộp sang org giáo viên
 * (không gộp/lộ lead QA cũ) và `/placement-test` không hiện cảnh báo lệch org.
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

async function setTeacherEmails(page: Page, emails: string[]) {
	const res = await page.request.post(`${API_ORIGIN}/__e2e/teacher-emails`, {
		headers: { "Content-Type": "application/json" },
		data: { emails },
	});
	expect(res.status()).toBe(200);
}

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

async function cleanupLegacyLeadOrg() {
	const db = await openDb();
	try {
		for (const table of [
			"placement_test_submission",
			"placement_test",
			"placement_test_audio",
			"lead",
		]) {
			await db.execute({
				sql: `DELETE FROM ${table} WHERE org_id = ?`,
				args: [LEAD_ORG_ID],
			});
		}
	} finally {
		db.close();
	}
}

async function seedLegacyOrgPlacementAndQaLead(
	page: Page,
	qaPhone: string,
): Promise<void> {
	await signUpViaApi(page, { name: "QA Legacy Seed" });
	const db = await openDb();
	try {
		await db.execute({
			sql: `UPDATE membership SET org_id = ?
				WHERE user_id = (SELECT id FROM user ORDER BY created_at DESC LIMIT 1)`,
			args: [LEAD_ORG_ID],
		});
		await db.execute({
			sql: `INSERT INTO lead (
					id, org_id, name, phone, email, birth_date, course, study_mode,
					study_days, time_slot, note, placement, teacher_note, source,
					status, ip_hash, submit_count, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, '', '', '', '', '', '', '', '', 'profile', 'new', '', 1, ?, ?)`,
			args: [
				`qa-drift-lead-${Date.now()}`,
				LEAD_ORG_ID,
				"QA Lead Cũ Không Được Lộ",
				qaPhone,
				"qa-old@example.com",
				Date.now(),
				Date.now(),
			],
		});
	} finally {
		db.close();
	}

	const content = structuredClone(questionsData);
	for (const clip of content.parts[0].clips) {
		const bytes = readFileSync(
			fileURLToPath(new URL(`${clip.id}.mp3`, SEED_DIR)),
		);
		const uploadRes = await page.request.put(
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
		expect(uploadRes.status()).toBe(200);
		clip.audioId = ((await uploadRes.json()) as { audioId: string }).audioId;
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

test.describe
	.serial("TEACHER_EMAILS org drift (#742)", () => {
		test.beforeEach(async ({ page }) => {
			await setTeacherEmails(page, []);
			await cleanupLegacyLeadOrg();
			await clearRateLimits();
		});

		test.afterEach(async ({ page }) => {
			await setTeacherEmails(page, []);
			await cleanupLegacyLeadOrg();
			await clearRateLimits();
		});

		test("fallback đọc đề từ LEAD_ORG_ID, ghi lead + bài nộp vào org mới của TEACHER_EMAILS, không lộ lead QA cũ và chụp ảnh POT", async ({
			browser,
		}) => {
			const sharedPhone = uniquePhone();
			const candidateEmail = `drift.student.${Date.now()}@example.com`;
			const teacherEmail = `comy.drift.${Date.now()}@test.local`;

			// 1. Seed bộ đề đã phát hành + lead QA cũ (cùng SĐT) trên e2e-lead-org.
			const seedCtx = await browser.newContext();
			const seedPage = await seedCtx.newPage();
			try {
				await seedLegacyOrgPlacementAndQaLead(seedPage, sharedPhone);
			} finally {
				await seedCtx.close();
			}

			// 2. Bật TEACHER_EMAILS cho giáo viên mới, seed tài khoản đã xác thực + đăng nhập
			// rồi vào /dashboard để bootstrapMiddleware tạo org mới riêng (ctx.orgId != e2e-lead-org).
			const teacherCtx = await browser.newContext();
			const teacherPage = await teacherCtx.newPage();
			try {
				await setTeacherEmails(teacherPage, [teacherEmail]);
				await seedUserViaE2e(teacherPage.request, {
					name: "Cô Mỹ Drift E2E",
					email: teacherEmail,
					password: "password-8chars",
					role: "teacher",
					emailVerified: true,
				});
				const signInRes = await teacherPage.request.post(
					`${API_ORIGIN}/api/auth/sign-in/email`,
					{
						headers: {
							"Content-Type": "application/json",
							Origin: WEB_ORIGIN,
						},
						data: {
							email: teacherEmail,
							password: "password-8chars",
						},
					},
				);
				expect(signInRes.status()).toBe(200);

				const kernelOk = teacherPage.waitForResponse(
					(r) => r.url().includes("/api/kernel") && r.ok(),
					{ timeout: 30_000 },
				);
				await teacherPage.goto(`${TEACHER_BASE_URL}/dashboard`);
				await kernelOk;

				// Kiểm tra org của giáo viên khác e2e-lead-org và /placement-test không báo lệch org.
				const dbCheck = await openDb();
				let teacherOrgId = "";
				try {
					const orgRes = await dbCheck.execute({
						sql: `SELECT m.org_id AS orgId FROM membership m
							INNER JOIN user u ON u.id = m.user_id
							WHERE lower(u.email) = lower(?) LIMIT 1`,
						args: [teacherEmail],
					});
					teacherOrgId = String(orgRes.rows[0]?.orgId ?? "");
				} finally {
					dbCheck.close();
				}
				expect(teacherOrgId).not.toBe("");
				expect(teacherOrgId).not.toBe(LEAD_ORG_ID);

				await teacherPage.goto(`${TEACHER_BASE_URL}/placement-test`);
				await expect(
					teacherPage.getByRole("heading", {
						name: "Chưa có bản nháp bộ đề kiểm tra đầu vào",
					}),
				).toBeVisible();
				await expect(
					teacherPage.getByText("Lưu ý cấu hình tổ chức:"),
				).toHaveCount(0);

				// 3. Học viên (context ẩn danh) làm & nộp bài tại /kiem-tra-dau-vao/ (fallback đề từ e2e-lead-org).
				const studentCtx = await browser.newContext();
				const studentPage = await studentCtx.newPage();
				await studentPage.addInitScript(() => {
					const createSyntheticAudioStream = async () => {
						const audioCtx = new AudioContext();
						if (audioCtx.state === "suspended") {
							await audioCtx.resume();
						}
						const osc = audioCtx.createOscillator();
						const gain = audioCtx.createGain();
						gain.gain.value = 0.01;
						osc.connect(gain);
						const dest = audioCtx.createMediaStreamDestination();
						gain.connect(dest);
						osc.start();
						const tracks = [...dest.stream.getAudioTracks()];
						const combined = new MediaStream(tracks);
						for (const track of tracks) {
							const origStop = track.stop.bind(track);
							track.stop = () => {
								audioCtx.close().catch(() => {});
								origStop();
							};
						}
						return combined;
					};
					Object.defineProperty(navigator, "mediaDevices", {
						configurable: true,
						value: { getUserMedia: () => createSyntheticAudioStream() },
					});
					class SyntheticUtterance {
						text: string;
						lang = "";
						rate = 1;
						onend: (() => void) | null = null;
						onerror: (() => void) | null = null;
						constructor(text = "") {
							this.text = text;
						}
					}
					Object.defineProperty(window, "SpeechSynthesisUtterance", {
						configurable: true,
						value: SyntheticUtterance,
					});
					Object.defineProperty(window, "speechSynthesis", {
						configurable: true,
						value: {
							cancel: () => {},
							speak: (utter: SyntheticUtterance) => {
								window.setTimeout(() => utter.onend?.(), 60);
							},
						},
					});
				});
				try {
					const publicTestRes = studentPage.waitForResponse(
						(r) =>
							r.url().endsWith("/public/placement-test") && r.status() === 200,
					);
					await studentPage.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
					await publicTestRes;

					await studentPage.locator("#startTestBtn").click();
					await studentPage.locator("#leadName").fill("Thí Sinh Drift E2E");
					await studentPage.locator("#leadPhone").fill(sharedPhone);
					await studentPage.locator("#leadEmail").fill(candidateEmail);
					await studentPage.locator("#leadOptionalDetails summary").click();
					await studentPage
						.locator("#leadNote")
						.fill("Kiểm tra định tuyến org giáo viên");
					await studentPage.locator("#submitLeadGateBtn").click();

					await expect(
						studentPage.locator('[data-skill="listening"]'),
					).toBeVisible();
					// Đi thẳng tới Writing -> điền bài -> Speaking -> ghi âm 1 câu & kết thúc sớm -> nộp bài.
					await studentPage.locator("#nextToVocabBtn").click();
					await studentPage.locator("#nextToReadingBtn").click();
					await studentPage.locator("#nextToWritingBtn").click();
					await studentPage
						.locator("#writingTextarea")
						.fill(
							"Dear friend, I enjoy practicing English every evening after work so I can speak fluently in meetings.",
						);
					await studentPage.locator("#nextToSpeakingBtn").click();
					await expect(studentPage.locator("#skipSpeakingBtn")).toHaveCount(0);
					await studentPage.locator("#startSpeakingBtn").click();
					await studentPage.locator("#speakingStartAnswerNowBtn").click();
					await studentPage.waitForTimeout(350);
					await studentPage.locator("#speakingFinishEarlyBtn").click();
					await studentPage.locator("#confirmFinishEarlyBtn").click();
					await expect(studentPage.locator("#speakingReviewBox")).toBeVisible();

					const submitPromise = studentPage.waitForResponse(
						(r) =>
							r.url().endsWith("/public/placement-test/submissions") &&
							r.request().method() === "POST",
					);
					const uploadPromise = studentPage.waitForResponse(
						(r) =>
							/\/public\/placement-test\/submissions\/[^/]+\/speaking-media$/.test(
								r.url(),
							) && r.request().method() === "PUT",
					);
					await studentPage.locator("#submitTestBtn").click();
					await expect(
						studentPage.locator("#unansweredConfirmBox"),
					).toBeVisible();
					await studentPage.locator("#confirmSubmitBtn").click();
					const submitRes = await submitPromise;
					const uploadRes = await uploadPromise;
					expect(submitRes.status()).toBe(201);
					expect(uploadRes.status()).toBe(200);
					await expect(studentPage.locator("#testResultCard")).toBeVisible();
				} finally {
					await studentCtx.close();
				}

				// 4. Giáo viên mở /leads: thấy Thí Sinh Drift E2E (submitCount=1), KHÔNG thấy QA Lead Cũ.
				await teacherPage.goto(`${TEACHER_BASE_URL}/leads`);
				const table = teacherPage.getByTestId("leads-table");
				await expect(table).toBeVisible();
				await expect(table).toContainText("Thí Sinh Drift E2E");
				await expect(table).toContainText(sharedPhone);
				await expect(table).not.toContainText("QA Lead Cũ Không Được Lộ");

				for (const vp of VIEWPORTS) {
					await teacherPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					const overflow = await teacherPage.evaluate(
						() =>
							document.documentElement.scrollWidth >
							document.documentElement.clientWidth,
					);
					expect(overflow, `không tràn ngang /leads ${vp.label}`).toBe(false);
					await teacherPage.screenshot({
						path: reportPath(`742-leads-list-${vp.label}.png`),
						fullPage: false,
					});
				}

				// Mở modal/panel chi tiết bài nộp và chụp POT light + dark.
				await teacherPage.setViewportSize({ width: 1440, height: 900 });
				await table.locator("tr", { hasText: "Thí Sinh Drift E2E" }).click();
				const panel = teacherPage.getByTestId("placement-submission-panel");
				await expect(panel).toBeVisible();
				await expect(panel).toContainText(
					"I enjoy practicing English every evening",
				);

				await teacherPage.screenshot({
					path: reportPath("742-leads-detail-modal-desktop-light.png"),
					fullPage: false,
				});
				await teacherPage.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await teacherPage.screenshot({
					path: reportPath("742-leads-detail-modal-desktop-dark.png"),
					fullPage: false,
				});
				await teacherPage.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);
			} finally {
				await teacherCtx.close();
			}
		});
	});
