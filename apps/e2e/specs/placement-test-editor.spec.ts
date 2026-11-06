import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN, WEB_ORIGIN } from "./origins";

const LEAD_ORG_ID = "e2e-lead-org";
const SAMPLE_MP3_PATH = new URL(
	"../../web/public/placement-seed/clip-1.mp3",
	import.meta.url,
).pathname;

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function resetLeadOrgPlacementTest() {
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

test.describe("placement test editor (/placement-test -> /kiem-tra-dau-vao/)", () => {
	test.beforeEach(async () => {
		await resetLeadOrgPlacementTest();
	});

	test("nhập đề gốc, nháp chưa phát hành hiện bảo trì, sửa câu + xóa câu kiểm lỗi ngưỡng rồi phát hành, thay audio nghe thử và phát ở trang profile", async ({
		page,
	}) => {
		// 1. Khi chưa phát hành, trang profile hiện bảo trì và không xóa bài làm dở trong localStorage
		await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
		await page.evaluate(() => {
			localStorage.setItem(
				"msmy_placement_attempt_v1",
				JSON.stringify({
					version: 1,
					step: "part1",
					answers: { "vg-01": 1 },
					plays: {},
				}),
			);
		});
		await page.reload();
		await expect(
			page.getByRole("heading", { name: "Bài kiểm tra đang bảo trì" }),
		).toBeVisible();
		const preservedBeforePublish = await page.evaluate(() =>
			localStorage.getItem("msmy_placement_attempt_v1"),
		);
		expect(preservedBeforePublish).toContain('"vg-01":1');
		await page.evaluate(() =>
			localStorage.removeItem("msmy_placement_attempt_v1"),
		);

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
		await expect(page.getByTestId("total-questions-count")).toHaveText("30");

		// 3. Nháp đã lưu nhưng chưa bấm Phát hành -> trang profile vẫn hiện bảo trì
		const profileTab = await page.context().newPage();
		await profileTab.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
		await expect(
			profileTab.getByRole("heading", { name: "Bài kiểm tra đang bảo trì" }),
		).toBeVisible();

		// 4. Sửa câu 1, xóa câu 15 của Phần 1 -> tổng câu còn 29 -> bấm Phát hành bị chặn vì ngưỡng cuối = 30
		const updatedPrompt =
			"Câu hỏi số 1 đã được cô Mỹ cập nhật trực tiếp trên màn sửa đề.";
		await page
			.getByLabel("Nội dung câu 1", { exact: true })
			.fill(updatedPrompt);
		await page.getByRole("button", { name: "Xóa câu 15", exact: true }).click();
		await expect(page.getByTestId("total-questions-count")).toHaveText("29");

		await page.getByTestId("publish-btn").click();
		const issuesBanner = page.getByTestId("publish-issues-banner");
		await expect(issuesBanner).toBeVisible();
		await expect(issuesBanner).toContainText(
			"Ngưỡng cuối cùng phải kết thúc đúng bằng tổng số câu (29).",
		);

		// 5. Sửa ngưỡng cuối thành 29 rồi Phát hành v1
		await page.getByLabel("Điểm tối đa ngưỡng 4", { exact: true }).fill("29");
		await page.getByTestId("publish-btn").click();
		await expect(page.getByTestId("confirm-publish-btn")).toBeVisible();
		await page.getByTestId("confirm-publish-btn").click();
		await expect(page.getByText(/Đã phát hành v1/)).toBeVisible();

		// Kiểm tra 3 viewport + screenshot trên màn sửa đề theo REVIEW.md
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
				path: new URL(
					`../../../plans/reports/placement-editor-${vp.label}.png`,
					import.meta.url,
				).pathname,
				fullPage: false,
			});
		}
		await page.setViewportSize({ width: 1440, height: 900 });
		// Kiểm tra dark mode theo REVIEW.md
		await page.getByRole("switch", { name: "Giao diện tối" }).click();
		await expect(page.locator("html")).toHaveClass(/\bdark\b/);
		await page.screenshot({
			path: new URL(
				"../../../plans/reports/placement-editor-desktop-dark.png",
				import.meta.url,
			).pathname,
			fullPage: false,
		});
		await page.getByRole("switch", { name: "Giao diện tối" }).click();

		// 6. Tải lại trang profile -> thấy ngay đề 29 câu, điền bước thông tin và thấy nội dung câu 1 mới
		const dbClean = openDb();
		try {
			await dbClean.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		} finally {
			dbClean.close();
		}
		await profileTab.reload();
		await expect(
			profileTab.getByRole("heading", {
				name: /Đánh Giá Năng Lực Tiếng Anh Đầu Vào \(29 Câu/,
			}),
		).toBeVisible();
		await profileTab.locator("#startTestBtn").click();
		await expect(
			profileTab.getByRole("heading", {
				name: "Thông Tin Của Bạn Trước Khi Làm Bài",
			}),
		).toBeVisible();
		await profileTab.locator("#leadName").fill("Học Viên Kiểm Đề");
		await profileTab.locator("#leadEmail").fill("kiemde@example.com");
		await profileTab
			.locator("#leadPhone")
			.fill(`0909${String(Date.now()).slice(-6)}`);
		await profileTab.locator("#submitLeadGateBtn").click();
		await expect(
			profileTab.locator('fieldset[data-question-id="vg-01"]'),
		).toContainText(updatedPrompt);
		await expect(profileTab.locator(".progress-counter")).toContainText(
			"Đã trả lời: 0/29 câu",
		);
		// 7. Thay audio đoạn 1, bấm Nghe thử ở màn sửa (blob:), rồi Phát hành v2 và phát ở trang profile
		const mp3Buffer = readFileSync(SAMPLE_MP3_PATH);
		await page
			.getByLabel("Tải audio cho đoạn nghe 1", { exact: true })
			.setInputFiles({
				name: "clip-1-replaced.mp3",
				mimeType: "audio/mpeg",
				buffer: mp3Buffer,
			});
		await expect(page.locator('[data-clip-audio="clip-1"]')).toContainText(
			"clip-1-replaced.mp3",
		);

		await page
			.locator('[data-clip-audio="clip-1"]')
			.getByRole("button", { name: "Nghe thử" })
			.click();
		const previewAudio = page.getByLabel("Trình phát nghe thử đoạn 1", {
			exact: true,
		});
		await expect(previewAudio).toBeVisible();
		await expect(previewAudio).toHaveAttribute("src", /^blob:/);

		await page.getByTestId("publish-btn").click();
		await page.getByTestId("confirm-publish-btn").click();
		await expect(page.getByText(/Đã phát hành v2/)).toBeVisible();

		// Kiểm tra HTTP 206 Range trên URL audio mới của đoạn 1 và phát trên trang profile
		const publicRes = await page.request.get(
			`${API_ORIGIN}/public/placement-test`,
			{
				headers: { Origin: PROFILE_ORIGIN },
			},
		);
		expect(publicRes.status()).toBe(200);
		const publicData = (await publicRes.json()) as {
			version: number;
			parts: [unknown, { clips: Array<{ id: string; src: string }> }];
		};
		expect(publicData.version).toBe(2);
		const clip1Src = publicData.parts[1].clips[0]?.src ?? "";
		expect(clip1Src).toMatch(/^\/public\/placement-test\/audio\//);

		const rangeRes = await page.request.get(`${API_ORIGIN}${clip1Src}`, {
			headers: {
				Origin: PROFILE_ORIGIN,
				Range: "bytes=0-99",
			},
		});
		expect(rangeRes.status()).toBe(206);
		expect(rangeRes.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);

		// 8. Chặn API công khai bằng page.route -> hiện trang bảo trì mà không xóa localStorage
		await profileTab.evaluate(() => {
			localStorage.setItem(
				"msmy_placement_attempt_v1",
				JSON.stringify({
					version: 2,
					step: "part1",
					answers: { "vg-01": 1 },
					plays: {},
				}),
			);
		});
		await profileTab.route("**/public/placement-test", (route) =>
			route.abort("failed"),
		);
		await profileTab.reload();
		await expect(
			profileTab.getByRole("heading", { name: "Bài kiểm tra đang bảo trì" }),
		).toBeVisible();
		const preservedOnApiError = await profileTab.evaluate(() =>
			localStorage.getItem("msmy_placement_attempt_v1"),
		);
		expect(preservedOnApiError).toContain('"vg-01":1');
		await profileTab.close();
	});
});
