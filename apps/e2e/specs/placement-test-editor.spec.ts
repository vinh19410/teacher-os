import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN, WEB_ORIGIN } from "./origins";

const LEAD_ORG_ID = "e2e-lead-org";
const STORAGE_KEY = "msmy_placement_attempt_v2";
const SAMPLE_MP3_PATH = fileURLToPath(
	new URL("../../web/public/placement-seed/clip-la.mp3", import.meta.url),
);

function openDb() {
	const client = createClient({
		url: `file:${fileURLToPath(new URL("../local.db", import.meta.url))}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function resetLeadOrgPlacementTest() {
	const client = openDb();
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
}

async function signUpLeadTeacher(page: Page): Promise<string> {
	const email = await signUpViaApi(page, { name: "Cô Mỹ Editor E2E" });
	const client = openDb();
	try {
		const user = await client.execute({
			sql: "SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1",
			args: [email],
		});
		const userId = user.rows[0]?.id;
		if (typeof userId !== "string") {
			throw new Error("teacher user row chưa xuất hiện sau sign-up");
		}
		let reassigned = 0;
		for (let i = 0; i < 40; i++) {
			const updated = await client.execute({
				sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
				args: [LEAD_ORG_ID, userId],
			});
			reassigned = updated.rowsAffected;
			if (reassigned > 0) break;
			await page.waitForTimeout(250);
		}
		expect(reassigned, "membership reassign sang lead org").toBe(1);
	} finally {
		client.close();
	}
	return email;
}

function makeSeedAttempt(answers: Record<string, number | string>) {
	return {
		version: 1,
		step: "vocab-grammar",
		lead: {
			name: "",
			phone: "",
			email: "",
			birthDate: "",
			course: "",
			studyMode: "",
			note: "",
		},
		answers: {
			listening: {},
			vocabGrammar: answers,
			reading: {},
		},
		writingText: "",
		speakingMode: "none",
		speakingDurationSec: null,
		plays: {},
		timerStartedAt: null,
		submission: null,
	};
}

test.describe("placement test editor 5 kỹ năng (/placement-test -> /kiem-tra-dau-vao/)", () => {
	test.beforeEach(async () => {
		await resetLeadOrgPlacementTest();
	});

	test("nhập đề gốc 5 kỹ năng, nhập lại đề gốc mẫu, sửa + xóa câu kiểm lỗi ngưỡng %, phát hành, thay audio clip-la và giữ localStorage khi bảo trì", async ({
		page,
	}) => {
		// 1. Khi chưa phát hành, trang profile hiện thông báo chưa tải được đề và giữ nguyên localStorage v2
		await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
		await page.evaluate(
			({ key, attempt }) => {
				localStorage.setItem(key, JSON.stringify(attempt));
			},
			{ key: STORAGE_KEY, attempt: makeSeedAttempt({ "gv-01": 1 }) },
		);
		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Hệ thống tạm thời chưa tải được đề" }),
		).toBeVisible();
		const preservedBeforePublish = await page.evaluate(
			(key) => localStorage.getItem(key),
			STORAGE_KEY,
		);
		expect(preservedBeforePublish).toContain('"gv-01":1');
		await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);

		// 2. Đăng nhập giáo viên thuộc e2e-lead-org, mở /placement-test và bấm Nhập đề gốc
		await signUpLeadTeacher(page);
		await page.goto(`${WEB_ORIGIN}/placement-test`);
		await expect(
			page.getByRole("heading", { name: "Bài test đầu vào" }),
		).toBeVisible();

		await page.getByTestId("import-seed-btn").click();
		await expect(
			page.getByLabel("Nội dung câu 1", { exact: true }),
		).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("total-questions-count")).toHaveText("40");

		// Kiểm tra đủ 5 tab kỹ năng hiển thị đúng số lượng câu
		await expect(
			page.getByRole("tab", { name: /1\. Listening \(13\)/ }),
		).toBeVisible();
		await expect(
			page.getByRole("tab", { name: /2\. Grammar & Vocab \(12\)/ }),
		).toBeVisible();
		await expect(
			page.getByRole("tab", { name: /3\. Reading \(15\)/ }),
		).toBeVisible();
		await expect(page.getByRole("tab", { name: /4\. Writing/ })).toBeVisible();
		await expect(
			page.getByRole("tab", { name: /5\. Speaking \(8\)/ }),
		).toBeVisible();

		// 2b. Kiểm tra nút "Nhập lại đề gốc mẫu" khôi phục bản nháp gốc sau xác nhận
		await page
			.getByLabel("Nội dung câu 1", { exact: true })
			.fill("Nội dung tạm sẽ bị ghi đè khi nhập lại đề mẫu");
		await page.getByTestId("reimport-seed-btn").click();
		await expect(page.getByTestId("confirm-reimport-btn")).toBeVisible();
		await page.getByTestId("confirm-reimport-btn").click();
		await expect(
			page.getByLabel("Nội dung câu 1", { exact: true }),
		).toHaveValue("What time does the film start?", { timeout: 30_000 });
		await expect(page.getByTestId("total-questions-count")).toHaveText("40");

		// 3. Nháp đã lưu nhưng chưa bấm Phát hành -> trang profile vẫn chưa có đề công khai
		const profileTab = await page.context().newPage();
		await profileTab.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
		await expect(
			profileTab.getByRole("heading", {
				name: "Hệ thống tạm thời chưa tải được đề",
			}),
		).toBeVisible();

		// 4. Sửa câu 1 (Listening l-a1), sang tab G&V xóa câu 25 (tổng còn 39) và kiểm lỗi ngưỡng % cuối != 100%
		const updatedPrompt =
			"Câu hỏi số 1 Listening đã được cô Mỹ cập nhật trực tiếp trên màn sửa đề.";
		await page
			.getByLabel("Nội dung câu 1", { exact: true })
			.fill(updatedPrompt);
		await page.getByRole("tab", { name: /2\. Grammar & Vocab/ }).click();
		await page.getByRole("button", { name: "Xóa câu 25", exact: true }).click();
		await expect(page.getByTestId("total-questions-count")).toHaveText("39");

		await page.getByLabel("Điểm tối đa ngưỡng 5", { exact: true }).fill("95");
		await page.getByTestId("publish-btn").click();
		const issuesBanner = page.getByTestId("publish-issues-banner");
		await expect(issuesBanner).toBeVisible();
		await expect(issuesBanner).toContainText(
			"Ngưỡng cuối cùng phải kết thúc đúng bằng 100%.",
		);

		// 5. Sửa ngưỡng 5 tối đa thành 100 rồi Phát hành v1
		await page.getByLabel("Điểm tối đa ngưỡng 5", { exact: true }).fill("100");
		await page.getByTestId("publish-btn").click();
		await expect(page.getByTestId("confirm-publish-btn")).toBeVisible();
		await page.getByTestId("confirm-publish-btn").click();
		await expect(page.getByText(/Đã phát hành v1/)).toBeVisible();

		// Kiểm tra 3 viewport + dark mode trên màn sửa đề 5 kỹ năng
		for (const vp of [
			{ width: 1440, height: 900, label: "desktop-1440x900" },
			{ width: 768, height: 1024, label: "tablet-768x1024" },
			{ width: 375, height: 812, label: "mobile-375x812" },
		]) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow, `no horizontal overflow at ${vp.label}`).toBe(false);
			await page.screenshot({
				path: fileURLToPath(
					new URL(
						`../../../plans/reports/727-placement-editor-${vp.label}.png`,
						import.meta.url,
					),
				),
				fullPage: false,
			});
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.getByRole("switch", { name: "Giao diện tối" }).click();
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await page.screenshot({
			path: fileURLToPath(
				new URL(
					"../../../plans/reports/727-placement-editor-desktop-dark.png",
					import.meta.url,
				),
			),
			fullPage: false,
		});
		await page.getByRole("switch", { name: "Giao diện tối" }).click();

		// 6. Tải lại trang profile -> thấy đề 39 câu khách quan, điền cổng thông tin và vào Listening thấy nội dung câu 1 mới
		const dbClean = openDb();
		try {
			await dbClean.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		} finally {
			dbClean.close();
		}
		await profileTab.reload();
		await expect(
			profileTab.getByRole("heading", {
				name: "Bài Kiểm Tra Đầu Vào Tiếng Anh (5 Kỹ Năng)",
			}),
		).toBeVisible();
		await expect(profileTab.locator("body")).toContainText("39 câu khách quan");

		await profileTab.locator("#startTestBtn").click();
		await expect(
			profileTab.getByRole("heading", {
				name: "Nhập thông tin trước khi vào làm bài",
			}),
		).toBeVisible();
		await profileTab.locator("#leadName").fill("Học Viên Kiểm Đề");
		await profileTab
			.locator("#leadPhone")
			.fill(`0909${String(Date.now()).slice(-6)}`);
		await profileTab.locator("#leadEmail").fill("kiemde@example.com");
		await profileTab.locator("#submitLeadGateBtn").click();

		await expect(
			profileTab.locator('fieldset[data-question-id="l-a1"]'),
		).toContainText(updatedPrompt);
		await expect(profileTab.locator(".progress-counter")).toContainText(
			"Đã trả lời 0/39 câu khách quan",
		);

		// 7. Quay lại tab Listening, thay audio đoạn 1 (clip-la), nghe thử (blob:), Phát hành v2 và kiểm Range 206
		await page.getByRole("tab", { name: /1\. Listening/ }).click();
		const mp3Buffer = readFileSync(SAMPLE_MP3_PATH);
		await page
			.getByLabel("Tải audio cho đoạn nghe 1", { exact: true })
			.setInputFiles({
				name: "clip-la-replaced.mp3",
				mimeType: "audio/mpeg",
				buffer: mp3Buffer,
			});
		await expect(page.locator('[data-clip-audio="clip-la"]')).toContainText(
			"clip-la-replaced.mp3",
		);

		await page
			.locator('[data-clip-audio="clip-la"]')
			.getByRole("button", { name: "Nghe thử" })
			.click();
		const previewAudio = page.getByLabel("Trình phát nghe thử đoạn 1", {
			exact: true,
		});
		await expect(previewAudio).toBeVisible();
		await expect(previewAudio).toHaveAttribute("src", /^blob:/);

		// 7b. Sang tab 5. Speaking: tải audio tùy chọn cho câu 1, không chặn xuất bản dù 7 câu còn lại dùng TTS fallback
		await page.getByRole("tab", { name: /5\. Speaking/ }).click();
		await expect(page.locator('[data-section="speaking"]')).toContainText(
			"hệ thống đọc từng câu hỏi và học viên ghi âm trả lời qua micro — audio-only",
		);
		await expect(
			page
				.locator('[data-clip-audio="s-02"]')
				.getByText(
					"Tùy chọn — bỏ trống hệ thống tự đọc câu hỏi bằng giọng tiếng Anh",
				),
		).toBeVisible();
		await page
			.getByLabel("Tải audio câu hỏi nói 1", { exact: true })
			.setInputFiles({
				name: "speaking-task-1.mp3",
				mimeType: "audio/mpeg",
				buffer: mp3Buffer,
			});
		await expect(page.locator('[data-clip-audio="s-01"]')).toContainText(
			"speaking-task-1.mp3",
		);
		await page
			.locator('[data-clip-audio="s-01"]')
			.getByRole("button", { name: "Nghe thử" })
			.click();
		const speakingPreviewAudio = page.getByLabel(
			"Trình phát nghe thử câu hỏi nói 1",
			{ exact: true },
		);
		await expect(speakingPreviewAudio).toBeVisible();
		await expect(speakingPreviewAudio).toHaveAttribute("src", /^blob:/);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.screenshot({
			path: fileURLToPath(
				new URL(
					"../../../plans/reports/727-placement-editor-speaking-desktop-1440x900.png",
					import.meta.url,
				),
			),
			fullPage: false,
		});

		await page.getByTestId("publish-btn").click();
		await page.getByTestId("confirm-publish-btn").click();
		await expect(page.getByText(/Đã phát hành v2/)).toBeVisible();

		const publicRes = await page.request.get(
			`${API_ORIGIN}/public/placement-test`,
			{
				headers: { Origin: PROFILE_ORIGIN },
			},
		);
		expect(publicRes.status()).toBe(200);
		const publicData = (await publicRes.json()) as {
			version: number;
			parts: Array<{
				id?: string;
				clips?: Array<{ id: string; src: string }>;
				tasks?: Array<{ id: string; src?: string }>;
			}>;
		};
		expect(publicData.version).toBe(2);
		const clip1Src = publicData.parts[0]?.clips?.[0]?.src ?? "";
		expect(clip1Src).toMatch(/^\/public\/placement-test\/audio\//);
		const speakingPart = publicData.parts.find((p) => p.id === "speaking");
		expect(speakingPart?.tasks?.[0]?.src).toMatch(
			/^\/public\/placement-test\/audio\//,
		);
		expect(speakingPart?.tasks?.[1]?.src ?? "").toBe("");

		const rangeRes = await page.request.get(`${API_ORIGIN}${clip1Src}`, {
			headers: {
				Origin: PROFILE_ORIGIN,
				Range: "bytes=0-99",
			},
		});
		expect(rangeRes.status()).toBe(206);
		expect(rangeRes.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);

		// 8. Chặn API công khai bằng page.route -> hiện thông báo chưa tải được đề mà không xóa localStorage v2
		await profileTab.evaluate(
			({ key, attempt }) => {
				localStorage.setItem(key, JSON.stringify(attempt));
			},
			{ key: STORAGE_KEY, attempt: makeSeedAttempt({ "gv-01": 1 }) },
		);
		await profileTab.route("**/public/placement-test", (route) =>
			route.abort("failed"),
		);
		await profileTab.reload();
		await expect(
			profileTab.getByRole("heading", {
				name: "Hệ thống tạm thời chưa tải được đề",
			}),
		).toBeVisible();
		const preservedOnApiError = await profileTab.evaluate(
			(key) => localStorage.getItem(key),
			STORAGE_KEY,
		);
		expect(preservedOnApiError).toContain('"gv-01":1');
		await profileTab.close();
	});
});
