import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN, WEB_ORIGIN } from "./origins";

const LEAD_ORG_ID = "e2e-lead-org";
const SEED_DIR = new URL("../../web/public/placement-seed/", import.meta.url);
const questionsPath = new URL("questions.json", SEED_DIR);
const questionsData = JSON.parse(readFileSync(questionsPath.pathname, "utf8"));
function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

const uniquePhone = () =>
	`0909${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;

async function ensurePlacementPublished(page: Page) {
	const client = openDb();
	try {
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

	const email = await signUpViaUi(page, { name: "Cô Mỹ Seed E2E" });
	const db = openDb();
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
		expect(reassigned).toBe(1);
	} finally {
		db.close();
	}

	const content = structuredClone(questionsData);
	for (const clip of content.parts[1].clips) {
		const mp3Bytes = readFileSync(new URL(`${clip.id}.mp3`, SEED_DIR).pathname);
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
async function playClipOnceToEnd(page: Page, clipId: string) {
	const playBtn = page.locator(`button[data-play-clip="${clipId}"]`);
	await expect(playBtn).toBeEnabled();
	await playBtn.click();

	// Wait until the browser fires `playing` and increments the play counter in localStorage,
	// then seek to the end of the real MP3 stream so `ended` fires naturally within <1s.
	await page.waitForFunction((id) => {
		const raw = localStorage.getItem("msmy_placement_attempt_v1");
		if (!raw) return false;
		const parsed = JSON.parse(raw);
		const audio = document.querySelector<HTMLAudioElement>(
			`audio[data-audio-clip="${id}"]`,
		);
		return (
			audio !== null &&
			!audio.paused &&
			typeof parsed?.plays?.[id] === "number" &&
			parsed.plays[id] >= 1
		);
	}, clipId);

	await page.evaluate((id) => {
		const audio = document.querySelector<HTMLAudioElement>(
			`audio[data-audio-clip="${id}"]`,
		);
		if (!audio) return;
		if (Number.isFinite(audio.duration) && audio.duration > 0.2) {
			audio.currentTime = audio.duration - 0.05;
		} else {
			audio.dispatchEvent(new Event("ended"));
		}
	}, clipId);

	await expect(playBtn).not.toContainText("Đang phát");
}

test.describe("profile placement test (/kiem-tra-dau-vao/)", () => {
	test.beforeAll(async ({ browser }) => {
		const context = await browser.newContext();
		const page = await context.newPage();
		try {
			await ensurePlacementPublished(page);
		} finally {
			await context.close();
		}
	});

	test("bấm CTA từ trang chủ sang /kiem-tra-dau-vao/, giữ đáp án khi reload, khóa nút nghe sau 2 lần kể cả khi reload, xem kết quả không tạo lead, bấm đăng ký điền sẵn form và lưu đúng lead.placement", async ({
		page,
	}) => {
		const client = openDb();
		try {
			await client.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		} finally {
			client.close();
		}

		const countLeads = async () => {
			const db = openDb();
			try {
				const res = await db.execute("SELECT COUNT(*) AS cnt FROM lead");
				return Number(res.rows[0]?.cnt ?? 0);
			} finally {
				db.close();
			}
		};

		const leadsBefore = await countLeads();

		// 1. Từ trang chủ bấm CTA hero sang /kiem-tra-dau-vao/
		await page.goto(PROFILE_ORIGIN);
		await page
			.getByRole("link", {
				name: /Làm Bài Kiểm Tra Đầu Vào Miễn Phí/,
			})
			.click();
		await expect(page).toHaveURL(/\/kiem-tra-dau-vao\/$/);
		await expect(
			page.getByRole("heading", {
				name: /Đánh Giá Năng Lực Tiếng Anh Đầu Vào/,
			}),
		).toBeVisible();

		// 2. Bắt đầu làm Phần 1 (15 câu Vocab + Grammar) — chọn 12 câu đúng, 3 câu sai
		await page.locator("#startTestBtn").click();
		await expect(
			page.getByRole("heading", {
				name: /Phần 1: Ngữ Pháp & Từ Vựng/,
			}),
		).toBeVisible();

		const vgQuestions = questionsData.parts[0].questions as Array<{
			id: string;
			answer: number;
		}>;
		for (const [i, q] of vgQuestions.entries()) {
			const pick = i < 12 ? q.answer : (q.answer + 1) % 4;
			await page
				.locator(`fieldset[data-question-id="${q.id}"] input[value="${pick}"]`)
				.check();
		}
		await expect(page.locator(".progress-counter")).toContainText(
			"Đã trả lời: 15/30 câu",
		);

		// Reload giữa bài giữ nguyên bước và toàn bộ câu trả lời đã chọn
		await page.reload();
		await expect(
			page.getByRole("heading", {
				name: /Phần 1: Ngữ Pháp & Từ Vựng/,
			}),
		).toBeVisible();
		await expect(page.locator(".progress-counter")).toContainText(
			"Đã trả lời: 15/30 câu",
		);
		const firstVg = vgQuestions[0];
		if (!firstVg) throw new Error("missing vg-01");
		await expect(
			page.locator(
				`fieldset[data-question-id="${firstVg.id}"] input[value="${firstVg.answer}"]`,
			),
		).toBeChecked();

		// 3. Chuyển sang Phần 2 (Listening) — kiểm tra giới hạn phát audio 2 lần & bền vững qua reload
		await page.locator("#toPart2Btn").click();
		await expect(
			page.getByRole("heading", {
				name: /Phần 2: Nghe Hiểu/,
			}),
		).toBeVisible();

		const clip1Btn = page.locator('button[data-play-clip="clip-1"]');
		const clip1Status = page.locator('[data-clip-status="clip-1"]');
		await expect(clip1Status).toContainText("Còn 2/2 lượt nghe");

		// Lần nghe 1
		await playClipOnceToEnd(page, "clip-1");
		await expect(clip1Status).toContainText("Còn 1/2 lượt nghe");
		await expect(clip1Btn).toBeEnabled();

		// Lần nghe 2 -> khóa nút nghe
		await playClipOnceToEnd(page, "clip-1");
		await expect(clip1Status).toContainText(
			"Đã hết lượt nghe (0/2 lượt còn lại)",
		);
		await expect(clip1Btn).toBeDisabled();

		// Reload trang -> nút nghe của clip-1 vẫn bị khóa
		await page.reload();
		await expect(clip1Status).toContainText(
			"Đã hết lượt nghe (0/2 lượt còn lại)",
		);
		await expect(clip1Btn).toBeDisabled();

		// 4. Chọn đáp án cho 15 câu Listening (7 câu đúng, 8 câu sai -> tổng 12 + 7 = 19/30 -> B1 / ielts-pre)
		const listeningQuestions = (
			questionsData.parts[1].clips as Array<{
				questions: Array<{ id: string; answer: number }>;
			}>
		).flatMap((c) => c.questions);

		for (const [i, q] of listeningQuestions.entries()) {
			const pick = i < 7 ? q.answer : (q.answer + 1) % 4;
			await page
				.locator(`fieldset[data-question-id="${q.id}"] input[value="${pick}"]`)
				.check();
		}
		await expect(page.locator(".progress-counter")).toContainText(
			"Đã trả lời: 30/30 câu",
		);

		// Nộp bài -> xem màn kết quả
		await page.locator("#submitTestBtn").click();
		const resultCard = page.locator("#testResultCard");
		await expect(resultCard).toBeVisible();
		await expect(page.locator("#totalScoreValue")).toHaveText("19/30");
		await expect(page.locator("#vgScoreValue")).toHaveText("12/15");
		await expect(page.locator("#listeningScoreValue")).toHaveText("7/15");
		await expect(page.locator("#cefrBandValue")).toHaveText("B1");
		await expect(resultCard).toContainText(
			"Khóa học gợi ý tham khảo: Pre IELTS (4.0–4.5)",
		);

		// Làm xong chưa bấm đăng ký -> không phát sinh dòng lead nào trong DB
		const leadsAfterTestOnly = await countLeads();
		expect(leadsAfterTestOnly).toBe(leadsBefore);

		// 5. Bấm "Đăng Ký Theo Kết Quả Này" -> chuyển về form đăng ký, điền sẵn kết quả & khóa, URL sạch query
		await page.locator("#registerWithResultBtn").click();
		await expect(page).toHaveURL(`${PROFILE_ORIGIN}/#dang-ky-tu-van`);
		expect(new URL(page.url()).search).toBe("");

		const expectedSummary =
			"Kiểm tra đầu vào: 19/30 (Vocab + Grammar 12/15, Listening 7/15) – CEFR B1";
		const banner = page.locator("#quizPlacementBanner");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveText(`Đã đính kèm: ${expectedSummary}`);
		await expect(page.locator("#courseTrack")).toHaveValue("ielts-pre");

		// Gửi form ngay lập tức (kiểm chứng formRenderedAt đã được lùi khi chuyển từ trang test về)
		const phone = uniquePhone();
		const form = page.locator("#consultForm");
		await form.locator("#studentName").fill("Trần Minh Quân");
		await form.locator("#studentPhone").fill(phone);
		await form.getByRole("button", { name: "Đăng Ký Khóa Học" }).click();

		await expect(page.locator("#leadSuccessBox")).toBeVisible();

		// Kiểm tra DB lưu đúng placement và course
		const dbVerify = openDb();
		try {
			const rowRes = await dbVerify.execute({
				sql: "SELECT course, placement FROM lead WHERE phone = ? LIMIT 1",
				args: [phone],
			});
			expect(rowRes.rows.length).toBe(1);
			expect(rowRes.rows[0]?.course).toBe("ielts-pre");
			expect(rowRes.rows[0]?.placement).toBe(expectedSummary);
		} finally {
			dbVerify.close();
		}
	});

	test("đạt chuẩn 3 viewport (1440×900, 768×1024, 375×812) không tràn ngang, điều hướng bàn phím, xác nhận câu trống và hoàn lượt khi audio lỗi", async ({
		page,
	}) => {
		const viewports = [
			{ width: 1440, height: 900, label: "desktop-1440x900" },
			{ width: 768, height: 1024, label: "tablet-768x1024" },
			{ width: 375, height: 812, label: "mobile-375x812" },
		];

		await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
		for (const vp of viewports) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow, `no horizontal overflow at ${vp.label}`).toBe(false);
			await page.screenshot({
				path: new URL(
					`../../../plans/reports/placement-test-${vp.label}.png`,
					import.meta.url,
				).pathname,
				fullPage: false,
			});
		}

		// Điều hướng bằng bàn phím: focus nút Bắt đầu -> Enter -> chọn câu 1 bằng bàn phím
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.locator("#startTestBtn").focus();
		await page.keyboard.press("Enter");
		await expect(
			page.getByRole("heading", { name: /Phần 1: Ngữ Pháp & Từ Vựng/ }),
		).toBeVisible();

		const firstRadio = page
			.locator('fieldset[data-question-id="vg-01"] input[type="radio"]')
			.first();
		await firstRadio.focus();
		await page.keyboard.press("Space");
		await expect(firstRadio).toBeChecked();

		// Sang Phần 2 bằng bàn phím
		await page.locator("#toPart2Btn").focus();
		await page.keyboard.press("Enter");
		await expect(
			page.getByRole("heading", { name: /Phần 2: Nghe Hiểu/ }),
		).toBeVisible();

		// Kiểm tra hoàn lượt khi audio lỗi trước khi ended
		const pubDataRes = await page.request.get(
			`${API_ORIGIN}/public/placement-test`,
			{
				headers: { Origin: PROFILE_ORIGIN },
			},
		);
		const pubData = (await pubDataRes.json()) as {
			parts: [unknown, { clips: Array<{ id: string; src: string }> }];
		};
		const clip2Src =
			pubData.parts[1].clips.find((c) => c.id === "clip-2")?.src ??
			"/public/placement-test/audio/clip-2";
		await page.route(`**${clip2Src}`, (route) => route.abort("failed"));
		const clip2Btn = page.locator('button[data-play-clip="clip-2"]');
		const clip2Status = page.locator('[data-clip-status="clip-2"]');
		await clip2Btn.click();
		await expect(clip2Status).toContainText("không bị trừ lượt nghe");
		await expect(clip2Btn).toBeEnabled();
		const savedPlaysClip2 = await page.evaluate(() => {
			const raw = localStorage.getItem("msmy_placement_attempt_v1");
			return raw ? (JSON.parse(raw)?.plays?.["clip-2"] ?? 0) : 0;
		});
		expect(savedPlaysClip2).toBe(0);
		await page.unroute(`**${clip2Src}`);
		// Nộp bài khi còn câu trống -> hiện hộp xác nhận số câu trống
		await page.locator("#submitTestBtn").click();
		const confirmBox = page.locator("#unansweredConfirmBox");
		await expect(confirmBox).toBeVisible();
		await expect(confirmBox).toContainText("29/30 câu chưa chọn đáp án");

		await page.locator("#cancelSubmitBtn").click();
		await expect(confirmBox).toBeHidden();

		await page.locator("#submitTestBtn").click();
		await page.locator("#confirmSubmitBtn").click();
		await expect(page.locator("#testResultCard")).toBeVisible();
	});
});
