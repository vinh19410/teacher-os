import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, verifyStudentEmailFromMailLog } from "./helpers";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

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

async function signUpLeadOrgTeacher(page: Page, name: string): Promise<string> {
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
		for (let i = 0; i < 40; i++) {
			const updated = await db.execute({
				sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
				args: [LEAD_ORG_ID, userId],
			});
			reassigned = updated.rowsAffected;
			if (reassigned > 0) break;
			await page.waitForTimeout(250);
		}
		expect(reassigned, "membership reassign sang lead org").toBe(1);
	} finally {
		db.close();
	}
	return email;
}

async function ensurePlacementPublished(page: Page): Promise<void> {
	const client = await openDb();
	try {
		await client.execute({
			sql: "DELETE FROM placement_test_submission WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test_audio WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
	} finally {
		client.close();
	}

	await signUpLeadOrgTeacher(page, "Cô Mỹ Student Placement E2E");

	const content = structuredClone(questionsData);
	for (const clip of content.parts[0].clips) {
		const mp3Bytes = readFileSync(
			fileURLToPath(new URL(`${clip.id}.mp3`, SEED_DIR)),
		);
		const uploadRes = await page.request.put(
			`${API_ORIGIN}/api/placement-test/audio`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(mp3Bytes.byteLength),
					"X-File-Name": encodeURIComponent(`${clip.id}.mp3`),
				},
				data: mp3Bytes,
			},
		);
		expect(uploadRes.status()).toBe(200);
		const uploaded = (await uploadRes.json()) as { audioId: string };
		clip.audioId = uploaded.audioId;
	}

	const draftRes = await page.request.put(
		`${API_ORIGIN}/api/placement-test/draft`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 0, content },
		},
	);
	expect(draftRes.status()).toBe(200);

	const pubRes = await page.request.post(
		`${API_ORIGIN}/api/placement-test/publish`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 1 },
		},
	);
	expect(pubRes.status()).toBe(200);
}

async function completeStudentOnboarding(page: Page): Promise<void> {
	await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
	await page.getByRole("button", { name: /IELTS/ }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: /4.5 – 5.5/ }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Band 6.5" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Du học" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "1–2 giờ" }).click();
	await page.getByRole("button", { name: "Tiếp tục" }).click();

	await page.getByRole("button", { name: "Hoàn thành" }).click();
}

async function installSyntheticSpeakingDevice(page: Page) {
	await page.addInitScript(() => {
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
}

test.describe
	.serial("Student Portal Placement Test (#748)", () => {
		test("onboarding -> modal đề xuất -> Để sau -> highlight Dashboard (không có trên Sidebar) -> làm bài 5 kỹ năng -> thông báo chuông -> giáo viên chấm tại /students/$studentId -> đồng bộ entryScore", async ({
			browser,
		}) => {
			test.setTimeout(180_000);

			// 1. Giáo viên ở e2e-lead-org xuất bản bộ đề chuẩn
			const teacherContext = await browser.newContext();
			const teacherPage = await teacherContext.newPage();
			await ensurePlacementPublished(teacherPage);

			// 2. Học viên đăng ký mới trong Student Portal
			const studentContext = await browser.newContext();
			const studentPage = await studentContext.newPage();
			await installSyntheticSpeakingDevice(studentPage);
			const email = `e2e-placement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;
			const studentName = "Học Viên Test Đầu Vào";

			try {
				await studentPage.goto(`${STUDENT_ORIGIN}/login`);
				await studentPage.locator("#tab-signup").click();
				await studentPage.locator("#signup-name").fill(studentName);
				await studentPage.locator("#signup-email").fill(email);
				await studentPage.locator("#signup-password").fill("password-8chars");
				await studentPage
					.locator("#panel-signup button[type='submit']")
					.click();

				await expect(
					studentPage.getByText("Email chưa được xác thực"),
				).toBeVisible({ timeout: 15_000 });
				await verifyStudentEmailFromMailLog(studentPage, email);

				// Hoàn tất onboarding 5 bước
				await completeStudentOnboarding(studentPage);
				await expect(studentPage).toHaveURL(/\/$/, { timeout: 20_000 });

				// 3. Modal đề xuất lần đầu xuất hiện
				const promptModal = studentPage.getByTestId("placement-prompt-modal");
				await expect(promptModal).toBeVisible({ timeout: 15_000 });
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.screenshot({
					path: reportPath("748-student-placement-modal-desktop-1440x900.png"),
				});

				// Bấm "Để sau" -> modal ẩn, lưu DB, nhưng Dashboard banner vẫn hiện và sidemenu không có "Kiểm tra đầu vào"
				await Promise.all([
					studentPage.waitForResponse(
						(res) =>
							res.url().endsWith("/api/student/placement-test/dismiss") &&
							res.request().method() === "POST" &&
							res.status() === 200,
					),
					promptModal.getByRole("button", { name: "Để sau" }).click(),
				]);
				await expect(promptModal).not.toBeVisible();

				// Reload trang để chắc chắn modal không hiện lại nữa nhưng highlight vẫn còn
				await studentPage.reload();
				await expect(promptModal).not.toBeVisible();
				await expect(
					studentPage.getByTestId("placement-highlight-banner"),
				).toBeVisible({ timeout: 15_000 });
				const studentNav = studentPage.getByRole("navigation", {
					name: "Điều hướng học viên",
				});
				await expect(
					studentNav.getByRole("link", { name: "Kiểm tra đầu vào" }),
				).toHaveCount(0);
				await expect(
					studentPage.getByTestId("nav-placement-badge"),
				).toHaveCount(0);

				// Chụp POT 3 viewport + dark desktop cho Dashboard highlight
				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await studentPage.waitForTimeout(300);
					const noOverflow = await studentPage.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							document.documentElement.clientWidth,
					);
					expect(noOverflow, `Không tràn ngang ở ${vp.label}`).toBe(true);
					await studentPage.screenshot({
						path: reportPath(`748-student-placement-highlight-${vp.label}.png`),
					});
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await studentPage.screenshot({
					path: reportPath("748-student-placement-highlight-desktop-dark.png"),
				});
				await studentPage.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);

				// 4. Bấm CTA "Làm bài test đầu vào" -> vào /placement-test
				await studentPage.getByTestId("placement-banner-cta").click();
				await expect(studentPage).toHaveURL(/\/placement-test/, {
					timeout: 15_000,
				});
				await expect(
					studentPage.getByTestId("placement-intro-card"),
				).toBeVisible();

				await studentPage.getByTestId("start-placement-test-btn").click();
				await expect(
					studentPage.getByTestId("placement-step-listening"),
				).toBeVisible();

				// Điền Listening -> chuyển sang Grammar & Vocab
				await studentPage.screenshot({
					path: reportPath("748-student-placement-runner-desktop-1440x900.png"),
				});
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Grammar & Vocabulary/ })
					.click();
				await expect(
					studentPage.getByTestId("placement-step-vg"),
				).toBeVisible();

				// Chọn nhanh một số câu G&V -> chuyển Reading
				const vgLabels = studentPage
					.getByTestId("placement-step-vg")
					.locator("label");
				if ((await vgLabels.count()) > 0) {
					await vgLabels.first().click();
				}
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Reading/ })
					.click();
				const readingStep = studentPage.getByTestId("placement-step-reading");
				await expect(readingStep).toBeVisible();
				for (const redundantLabel of [
					"Biển báo / Thông báo",
					"Tin nhắn / Email",
					"Bài đọc hiểu",
					"Đoạn văn điền từ",
				]) {
					await expect(readingStep).not.toContainText(redundantLabel);
				}
				const firstSignCard = readingStep
					.locator('[data-passage-id]:has([data-passage-kind="sign"])')
					.first();
				await expect(firstSignCard).toBeVisible();
				await expect(
					firstSignCard.locator('[data-slot="card-header"]'),
				).toHaveCount(0);
				const firstPassageCard = readingStep
					.locator('[data-passage-id]:has([data-passage-kind="passage"])')
					.first();
				await expect(
					firstPassageCard.locator('[data-slot="card-header"]'),
				).toHaveCount(1);

				const readingPotIssue = process.env.CAPTURE_POT_ISSUE?.trim();
				for (const vp of VIEWPORTS) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await studentPage.waitForTimeout(300);
					const noOverflow = await studentPage.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							document.documentElement.clientWidth,
					);
					expect(noOverflow, `Reading không tràn ngang ở ${vp.label}`).toBe(
						true,
					);
					if (readingPotIssue) {
						await firstSignCard.scrollIntoViewIfNeeded();
						await studentPage.screenshot({
							path: reportPath(
								`${readingPotIssue}-student-reading-${vp.label}.png`,
							),
						});
					}
				}
				if (readingPotIssue) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await firstSignCard.scrollIntoViewIfNeeded();
					await studentPage.evaluate(() =>
						document.documentElement.classList.add("dark"),
					);
					await studentPage.screenshot({
						path: reportPath(
							`${readingPotIssue}-student-reading-desktop-dark.png`,
						),
					});
					await studentPage.evaluate(() =>
						document.documentElement.classList.remove("dark"),
					);
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });

				// Chuyển Writing và viết bài ngắn
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Writing/ })
					.click();
				await expect(
					studentPage.getByTestId("placement-step-writing"),
				).toBeVisible();
				await studentPage
					.locator("textarea")
					.fill(
						"I want to improve my English communication skills for university study and future career.",
					);

				// Chuyển Speaking, kiểm tra đã bỏ hướng dẫn thừa & không có nút bỏ qua; chặn nộp khi chưa ghi âm rồi ghi âm 1 câu để nộp 5 kỹ năng
				await studentPage
					.getByRole("button", { name: /Tiếp tục: Speaking/ })
					.click();
				const speakingStep = studentPage.getByTestId("placement-step-speaking");
				await expect(speakingStep).toBeVisible();
				await expect(speakingStep.locator("ol")).toHaveCount(0);
				await expect(speakingStep).not.toContainText(
					"Hệ thống sẽ tự động đọc lần lượt từng câu hỏi",
				);
				await expect(
					speakingStep.getByRole("button", { name: /Bỏ qua phần Speaking/ }),
				).toHaveCount(0);

				await studentPage.getByTestId("submit-placement-test-btn").click();
				await expect(
					studentPage.getByText("Phần Speaking là bắt buộc", { exact: false }),
				).toBeVisible();
				await expect(
					studentPage.getByTestId("placement-unanswered-confirm"),
				).toHaveCount(0);

				await studentPage
					.getByRole("button", { name: /Bắt đầu làm bài Speaking/ })
					.click();
				await expect(
					studentPage.getByTestId("speaking-prep-stage"),
				).toBeVisible({ timeout: 5000 });
				await studentPage.getByRole("button", { name: /Trả lời ngay/ }).click();
				await studentPage.waitForTimeout(350);
				await studentPage
					.getByRole("button", { name: "Kết thúc phần Speaking" })
					.click();
				await studentPage
					.getByRole("button", { name: "Xác nhận kết thúc sớm" })
					.click();
				await expect(
					studentPage.getByTestId("speaking-review-box"),
				).toBeVisible({ timeout: 10_000 });

				await studentPage.getByTestId("submit-placement-test-btn").click();
				// Nếu còn câu trắc nghiệm bỏ trống, xác nhận "Vẫn nộp bài ngay"
				const confirmBox = studentPage.getByTestId(
					"placement-unanswered-confirm",
				);
				if (await confirmBox.isVisible()) {
					await confirmBox
						.getByRole("button", { name: "Vẫn nộp bài ngay" })
						.click();
				}

				await expect(
					studentPage.getByTestId("placement-pending-view"),
				).toBeVisible({ timeout: 20_000 });

				// Chuông thông báo có unread >= 1, bấm thông báo nộp bài -> đánh dấu đã đọc và mở /placement-test
				const notificationBadge = studentPage.getByTestId("notification-badge");
				await expect(notificationBadge).toBeVisible({ timeout: 15_000 });
				const unreadCount = Number(
					(await notificationBadge.textContent())?.trim() ?? "0",
				);
				expect(unreadCount).toBeGreaterThanOrEqual(1);

				await studentPage.goto(`${STUDENT_ORIGIN}/`);
				await expect(notificationBadge).toBeVisible({ timeout: 15_000 });
				await studentPage.getByRole("button", { name: /Thông báo/ }).click();
				const notificationDialog = studentPage.getByRole("dialog", {
					name: "Danh sách thông báo",
				});
				await expect(notificationDialog).toBeVisible();
				const placementNotificationItem = notificationDialog
					.getByTestId("inbox-item")
					.filter({ hasText: "Nộp bài kiểm tra đầu vào thành công" })
					.first();
				await expect(placementNotificationItem).toBeVisible({
					timeout: 15_000,
				});
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.screenshot({
					path: reportPath("781-bell-placement-submitted-desktop-1440x900.png"),
				});
				await Promise.all([
					studentPage.waitForResponse(
						(res) =>
							/\/api\/student\/inbox\/[^/]+\/read$/.test(res.url()) &&
							res.request().method() === "POST" &&
							res.status() === 200,
					),
					placementNotificationItem.click(),
				]);
				await expect(studentPage).toHaveURL(/\/placement-test/, {
					timeout: 15_000,
				});
				await expect(
					studentPage.getByTestId("placement-pending-view"),
				).toBeVisible({ timeout: 15_000 });
				if (unreadCount === 1) {
					await expect(notificationBadge).toHaveCount(0);
				} else {
					await expect(notificationBadge).toHaveText(String(unreadCount - 1));
				}

				// 5. Lấy studentId từ DB để mở trang giáo viên /students/$studentId
				const db = await openDb();
				let studentId = "";
				try {
					const sRow = await db.execute({
						sql: "SELECT id FROM student WHERE lower(trim(email)) = lower(?) LIMIT 1",
						args: [email],
					});
					studentId = String(sRow.rows[0]?.id ?? "");
					expect(studentId).not.toBe("");
				} finally {
					db.close();
				}

				await teacherPage.goto(`${WEB_ORIGIN}/students/${studentId}`);
				await expect(
					teacherPage.getByTestId("placement-submission-panel"),
				).toBeVisible({ timeout: 20_000 });
				await teacherPage.setViewportSize({ width: 1440, height: 900 });
				await teacherPage.screenshot({
					path: reportPath("748-web-student-grade-desktop-1440x900.png"),
				});

				// Nhập điểm IELTS Writing & Speaking rồi chốt trên trang chi tiết học viên
				await teacherPage.getByTestId("writing-task-input").fill("6.5");
				await teacherPage.getByTestId("writing-coherence-input").fill("6.5");
				await teacherPage.getByTestId("writing-lexical-input").fill("6");
				await teacherPage.getByTestId("writing-grammar-input").fill("6");
				if (
					await teacherPage.getByTestId("toggle-speaking-grading").isChecked()
				) {
					await teacherPage.getByTestId("speaking-fluency-input").fill("6");
					await teacherPage.getByTestId("speaking-lexical-input").fill("6");
					await teacherPage.getByTestId("speaking-grammar-input").fill("6.5");
					await teacherPage
						.getByTestId("speaking-pronunciation-input")
						.fill("6.5");
				}
				await teacherPage
					.getByTestId("placement-course-select")
					.selectOption({ label: "Foundation" });
				await expect(
					teacherPage.getByTestId("save-placement-grade-btn"),
				).toBeEnabled();
				await Promise.all([
					teacherPage.waitForResponse(
						(res) =>
							new RegExp(
								`/api/students/${studentId}/placement-submission$`,
							).test(res.url()) &&
							res.request().method() === "PATCH" &&
							res.status() === 200,
					),
					teacherPage.getByTestId("save-placement-grade-btn").click(),
				]);

				// entryScore trên hồ sơ học viên tự cập nhật
				await expect(
					teacherPage.getByTestId("student-entry-score"),
				).not.toHaveText("Chưa có", { timeout: 15_000 });

				// 6. Học viên tải lại /placement-test thấy kết quả chính thức
				await studentPage.reload();
				await expect(
					studentPage.getByTestId("placement-graded-view"),
				).toBeVisible({ timeout: 20_000 });
				await studentPage.setViewportSize({ width: 1440, height: 900 });
				await studentPage.screenshot({
					path: reportPath("748-student-placement-graded-desktop-1440x900.png"),
				});
			} finally {
				await studentContext.close();
				await teacherContext.close();
			}
		});

		test("Speaking UI tinh gọn, đếm giây giữa màn hình, nút tròn đỏ Pause, retry tối đa 2 lần/câu và xác nhận kết thúc sớm (#780)", async ({
			browser,
		}) => {
			test.setTimeout(180_000);
			const studentContext = await browser.newContext();
			const studentPage = await studentContext.newPage();
			const email = `e2e-speaking-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`;

			await installSyntheticSpeakingDevice(studentPage);

			try {
				await studentPage.goto(`${STUDENT_ORIGIN}/login`);
				await studentPage.locator("#tab-signup").click();
				await studentPage.locator("#signup-name").fill("Học Viên Speaking 780");
				await studentPage.locator("#signup-email").fill(email);
				await studentPage.locator("#signup-password").fill("password-8chars");
				await studentPage
					.locator("#panel-signup button[type='submit']")
					.click();
				await expect(
					studentPage.getByText("Email chưa được xác thực"),
				).toBeVisible({ timeout: 15_000 });
				await verifyStudentEmailFromMailLog(studentPage, email);
				await completeStudentOnboarding(studentPage);
				await expect(studentPage).toHaveURL(/\/$/, { timeout: 20_000 });

				await studentPage.goto(`${STUDENT_ORIGIN}/placement-test`);
				await expect(
					studentPage.getByTestId("placement-intro-card"),
				).toBeVisible({ timeout: 15_000 });
				await studentPage.getByTestId("start-placement-test-btn").click();
				await studentPage.getByTestId("placement-tab-speaking").click();

				const speakingStep = studentPage.getByTestId("placement-step-speaking");
				await expect(speakingStep).toBeVisible();
				await expect(speakingStep.locator("ol")).toHaveCount(0);

				const potIssue = process.env.CAPTURE_POT_ISSUE?.trim();
				await studentPage
					.getByRole("button", { name: /Bắt đầu làm bài Speaking/ })
					.click();

				await expect(
					studentPage.getByTestId("speaking-prep-stage"),
				).toBeVisible({ timeout: 5000 });
				await expect(
					studentPage.getByTestId("speaking-prep-timer"),
				).toBeVisible();
				if (potIssue) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await studentPage.screenshot({
						path: reportPath(
							`${potIssue}-student-speaking-prep-desktop-1440x900.png`,
						),
					});
				}

				await studentPage.getByRole("button", { name: /Trả lời ngay/ }).click();
				await expect(
					studentPage.getByTestId("speaking-answer-stage"),
				).toBeVisible();
				const pauseBtn = studentPage.getByRole("button", {
					name: "Dừng ghi âm câu hiện tại",
				});
				await expect(pauseBtn).toBeVisible();

				// Kiểm tra xác nhận kết thúc sớm
				await studentPage
					.getByRole("button", { name: "Kết thúc phần Speaking" })
					.click();
				await expect(
					studentPage.getByTestId("speaking-early-finish-confirm"),
				).toBeVisible();
				await studentPage
					.getByRole("button", { name: "Tiếp tục làm bài" })
					.click();

				// Chụp 3 viewport + dark mode + reflow 320px ở trạng thái ghi âm
				for (const vp of [
					...VIEWPORTS,
					{ width: 320, height: 568, label: "reflow-320x568" },
				] as const) {
					await studentPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					await studentPage.waitForTimeout(300);
					const noOverflow = await studentPage.evaluate(
						() =>
							document.documentElement.scrollWidth <=
							document.documentElement.clientWidth,
					);
					expect(
						noOverflow,
						`Student Speaking không tràn ngang ở ${vp.label}`,
					).toBe(true);
					if (potIssue && vp.label !== "reflow-320x568") {
						await studentPage.screenshot({
							path: reportPath(
								`${potIssue}-student-speaking-answer-${vp.label}.png`,
							),
						});
					}
				}
				if (potIssue) {
					await studentPage.setViewportSize({ width: 1440, height: 900 });
					await studentPage.evaluate(() =>
						document.documentElement.classList.add("dark"),
					);
					await studentPage.screenshot({
						path: reportPath(
							`${potIssue}-student-speaking-answer-desktop-dark.png`,
						),
					});
					await studentPage.evaluate(() =>
						document.documentElement.classList.remove("dark"),
					);
				}
				await studentPage.setViewportSize({ width: 1440, height: 900 });

				// Dừng lượt ghi đầu & thử retry tối đa 2 lần
				await studentPage.waitForTimeout(400);
				await pauseBtn.click();
				await expect(
					studentPage.getByTestId("speaking-paused-stage"),
				).toBeVisible();

				const retryBtn = studentPage.getByRole("button", {
					name: /Ghi lại câu này|Đã hết lượt ghi lại/,
				});
				await expect(retryBtn).toContainText("còn 2/2");
				await retryBtn.click();
				await studentPage.waitForTimeout(300);
				await pauseBtn.click();
				await expect(retryBtn).toContainText("còn 1/2");
				await retryBtn.click();
				await studentPage.waitForTimeout(300);
				await pauseBtn.click();
				await expect(retryBtn).toBeDisabled();
				await expect(retryBtn).toContainText("0/2");

				// Kết thúc sớm (có lưu bản ghi câu 1) -> review box không có "Ghi lại từ đầu"
				await studentPage
					.getByRole("button", { name: "Kết thúc phần Speaking" })
					.click();
				await studentPage
					.getByRole("button", { name: "Xác nhận kết thúc sớm" })
					.click();
				const reviewBox = studentPage.getByTestId("speaking-review-box");
				await expect(reviewBox).toBeVisible({ timeout: 10_000 });
				await expect(
					reviewBox.getByRole("button", { name: /Ghi lại từ đầu/ }),
				).toHaveCount(0);
			} finally {
				await studentContext.close();
			}
		});
	});
