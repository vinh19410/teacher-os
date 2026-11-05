import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
	AI_GRADING_ERROR_CODES,
	AI_GRADING_ERROR_MESSAGES,
	QUICK_GRADE_MONTHLY_LIMIT,
} from "../../../packages/api/src/contracts";
import { monthWindowVietnamMs } from "../../../packages/api/src/vietnam-date";
import {
	orgIdForTeacherEmail,
	signUpViaUi,
	verifyStudentEmailFromMailLog,
} from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-32 #480 — E2E AC-003 (US-006): khi tổ chức ở gói thuê bao tháng còn
 * hiệu lực (`active` / `grace_period`) hết Credit chính:
 *  - Scenario 1 (lượt 30/30): ví = 0, đã dùng 29 lượt Chấm nhanh Writing
 *    trong tháng → bài Writing mới được chấm nháp chế độ "Chấm nhanh",
 *    0 Credit, gắn nhãn "Bản nháp chấm nhanh" trên [7] và hàng chờ /grading;
 *    số dư ví vẫn = 0.
 *  - Scenario 2 (lượt 31/30): ví = 0 và đã dùng đủ 30/30 lượt → bài Writing
 *    mới lưu ở `manual_pending`, không gọi AI, hiển thị thông điệp nguyên văn
 *    `E-selfomy-alignment-002` kèm nút "Nạp thêm Credit" trên [7].
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `ai.quick.${runToken}@test.local`;
const writingTitle1 = "Writing Chấm nhanh lượt 30: urban transport";
const writingTitle2 = "Writing Chấm nhanh lượt 31: remote work";

test.describe.configure({ mode: "serial" });

let teacherContext: BrowserContext;
let teacherPage: Page;
let attemptId1 = "";
let attemptId2 = "";

function openLocalDb() {
	return createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
}

async function signInStudent(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

async function submitWritingPaper(page: Page, title: string): Promise<string> {
	await page.getByRole("link", { name: `Làm bài: ${title}` }).click();
	const paper = page.getByTestId("navigator-progress");
	const startDialog = page.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(paper.or(startDialog)).toBeVisible();
	if (await startDialog.isVisible()) {
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
	}
	await expect(paper).toBeVisible();

	const textarea = page.getByLabel("Bài viết của bạn");
	await expect(textarea).toBeVisible();
	await textarea.fill(
		"Public transport investment reduces traffic congestion and lowers carbon emissions in metropolitan areas.",
	);
	await page.getByRole("button", { name: "Nộp bài" }).click();
	const guard = page.getByRole("alertdialog", {
		name: "Bài viết chưa đủ số từ",
	});
	await expect(guard).toBeVisible();
	await guard.getByRole("button", { name: "Nộp bài" }).click();

	await expect(page.getByTestId("awaiting-grade")).toHaveText(
		"Đã nộp — Đang chờ giáo viên chấm",
	);
	const detailUrl = new URL(page.url());
	const id = detailUrl.pathname.split("/").pop() ?? "";
	expect(id).not.toBe("");
	return id;
}

test.beforeAll(async ({ browser }) => {
	test.setTimeout(120_000);
	teacherContext = await browser.newContext({ baseURL: WEB_ORIGIN });
	teacherPage = await teacherContext.newPage();
	const teacherEmail = await signUpViaUi(teacherPage, {
		name: "Cô Chấm Nhanh",
	});
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	await seedQuizFixture({
		orgId,
		orgName: "unused",
		className: `Lớp Quick ${runToken}`,
		studentName: "Học Viên Quick",
		studentEmail,
		prompts: [
			{
				title: writingTitle1,
				skill: "writing",
				part: "task2",
				type: "opinion",
				note: "",
				passage: "",
				prompt:
					"<p>Governments should invest more in public transport than roads.</p>",
				questions: [],
			},
			{
				title: writingTitle2,
				skill: "writing",
				part: "task2",
				type: "discussion",
				note: "",
				passage: "",
				prompt:
					"<p>Remote work has changed how companies operate worldwide.</p>",
				questions: [],
			},
		],
	});

	// Seed ví org ở gói tháng active, balance = 0, và đã dùng 29/30 lượt Chấm nhanh trong tháng hiện tại (giờ VN).
	const client = openLocalDb();
	try {
		const nowMs = Date.now();
		await client.execute({
			sql: `INSERT INTO credit_wallet (org_id, balance, held, plan_kind, plan_status, created_at, updated_at)
				VALUES (?, 0, 0, 'monthly', 'active', ?, ?)
				ON CONFLICT(org_id) DO UPDATE SET balance = 0, held = 0, plan_kind = 'monthly', plan_status = 'active', updated_at = excluded.updated_at`,
			args: [orgId, nowMs, nowMs],
		});

		const { startMs } = monthWindowVietnamMs(new Date(nowMs));
		for (let i = 1; i <= QUICK_GRADE_MONTHLY_LIMIT - 1; i++) {
			await client.execute({
				sql: `INSERT INTO credit_usage_log (id, org_id, actor_user_id, action_type, credit_delta, tx_status, ref_id, idempotency_key, created_at)
					VALUES (?, ?, 'system', 'quick_grade_writing', 0, 'settled', ?, ?, ?)`,
				args: [
					crypto.randomUUID(),
					orgId,
					`seed-quick-${runToken}-${i}`,
					`quick_grade_writing:seed-quick-${runToken}-${i}:claim`,
					startMs + i * 1000,
				],
			});
		}
	} finally {
		client.close();
	}

	const signupContext = await browser.newContext();
	const page = await signupContext.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Học Viên Quick");
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await signupContext.close();
});

test.afterAll(async () => {
	await teacherContext.close();
});

test("Scenario 1 (lượt 30/30): học viên nộp Writing → chấm nhanh 0 Credit, màn [7] hiện nhãn 'Bản nháp chấm nhanh', ví vẫn 0", async ({
	browser,
}) => {
	test.setTimeout(90_000);
	const context = await browser.newContext();
	const page = await context.newPage();
	await signInStudent(page);
	attemptId1 = await submitWritingPaper(page, writingTitle1);
	await context.close();

	await teacherPage.goto(`${WEB_ORIGIN}/grading/${attemptId1}`);
	const panel = teacherPage.getByTestId("ai-draft-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByText("AI đã chấm nháp")).toBeVisible();
	await expect(panel.getByTestId("ai-quick-grade-badge")).toHaveText(
		"Bản nháp chấm nhanh",
	);
	await expect(panel.getByText("6.5")).toHaveCount(2);
	await expect(panel.getByText("7.0")).toBeVisible();
	await expect(panel.getByText("6.0")).toBeVisible();

	// Hàng chờ /grading cũng hiển thị badge "Bản nháp chấm nhanh".
	await teacherPage.goto(`${WEB_ORIGIN}/grading`);
	await expect(
		teacherPage.getByTestId("ai-quick-grade-badge").first(),
	).toHaveText("Bản nháp chấm nhanh");

	// Ví org vẫn = 0 (chấm nhanh 0 Credit).
	const walletRes = await teacherPage.request.get(
		`${API_ORIGIN}/api/credits/wallet`,
	);
	expect(walletRes.status()).toBe(200);
	const wallet = (await walletRes.json()) as { balance: number; held: number };
	expect(wallet.balance).toBe(0);
	expect(wallet.held).toBe(0);
});

test("Scenario 2 (lượt 31/30): đã dùng hết 30/30 lượt → manual_pending, không gọi AI, màn [7] hiện E-002 + nút 'Nạp thêm Credit'", async ({
	browser,
}) => {
	test.setTimeout(90_000);
	const context = await browser.newContext();
	const page = await context.newPage();
	await signInStudent(page);
	attemptId2 = await submitWritingPaper(page, writingTitle2);
	await context.close();

	await teacherPage.goto(`${WEB_ORIGIN}/grading/${attemptId2}`);
	const panel = teacherPage.getByTestId("ai-draft-panel");
	await expect(panel).toBeVisible();
	await expect(panel.getByText("Chờ chấm tay")).toBeVisible();
	await expect(panel.getByTestId("ai-quick-grade-badge")).toHaveCount(0);
	await expect(
		panel.getByText("AI chưa có điểm gợi ý cho bài này."),
	).toBeVisible();

	const banner = panel.getByTestId("ai-credit-exhausted-banner");
	await expect(banner).toBeVisible();
	await expect(banner).toContainText(
		AI_GRADING_ERROR_MESSAGES[AI_GRADING_ERROR_CODES.QUOTA_EXHAUSTED],
	);
	const topUpBtn = banner.getByRole("button", { name: "Nạp thêm Credit" });
	await expect(topUpBtn).toBeVisible();

	// Keyboard focus + Enter mở hộp thoại, đóng hộp thoại theo REVIEW.md / AGENTS.md.
	await topUpBtn.focus();
	await expect(topUpBtn).toBeFocused();
	await teacherPage.keyboard.press("Enter");
	const dialog = teacherPage.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText("Nạp thêm Credit AI");
	await dialog.getByTestId("ai-topup-modal-close").click();
	await expect(dialog).toHaveCount(0);

	// Verify UI + chụp screenshot ở 3 viewport (1440×900, 768×1024, 375×812) theo AGENTS.md.
	const reportsDir = fileURLToPath(
		new URL("../../../plans/reports", import.meta.url),
	);
	for (const vp of [
		{ name: "desktop-1440x900", width: 1440, height: 900 },
		{ name: "tablet-768x1024", width: 768, height: 1024 },
		{ name: "mobile-375x812", width: 375, height: 812 },
	]) {
		await teacherPage.setViewportSize({ width: vp.width, height: vp.height });
		await expect(banner).toBeVisible();
		await expect(topUpBtn).toBeVisible();
		await teacherPage.screenshot({
			path: `${reportsDir}/tos-32-ac-003-${vp.name}.png`,
			fullPage: true,
		});
	}
	await teacherPage.setViewportSize({ width: 1280, height: 720 });
});
