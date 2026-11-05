import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { readVerificationEmails, signUpViaUi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN } from "./origins";

/**
 * E2E lead intake (#506): form đăng ký trên apps/profile (port 8105) gửi
 * POST /public/leads → màn thành công (tóm tắt + nút Zalo, không thông tin
 * thanh toán) → giáo viên thấy lead trên /leads, đổi trạng thái, chip đếm
 * cập nhật; email báo lead mới không lộ SĐT; dedupe SĐT 24h; chống spam
 * (honeypot + tần suất IP) và fallback copy-Zalo khi API lỗi 500.
 */

// Phải khớp boot.ts (LEAD_ORG_ID + LEAD_ORIGIN).
const LEAD_ORG_ID = "e2e-lead-org";
const LEAD_ORIGIN = PROFILE_ORIGIN;
const HANOI_STUDENT = {
	name: "Nguyễn Thu Hà",
	phone: "0909123456",
};

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

/** Đăng ký teacher rồi reassign membership sang org lead (boot seed) —
 * cùng trick seedOrgMember, để /leads thấy lead của LEAD_ORG_ID. Email
 * duy nhất mỗi test vì sign-up trùng email bị better-auth từ chối. */
async function signUpLeadTeacher(page: Page): Promise<string> {
	const email = await signUpViaUi(page, { name: "Cô Mỹ E2E" });
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
		// Membership do bootstrapMiddleware tạo ở request /api đầu tiên sau
		// khi dashboard render — retry tới khi row xuất hiện (như seedOrgMember).
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
		// Xoá ip_hash của các lượt chạy trước để browser fetch (ip="unknown")
		// không chạm ngưỡng 3/10 phút khi chạy liên tiếp hoặc retry.
		await client.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
	} finally {
		client.close();
	}
	return email;
}

/** POST /public/leads với Origin profile e2e (đúng hợp đồng form msmy). */
async function submitLead(
	page: Page,
	body: Record<string, unknown>,
	headers: Record<string, string> = {},
) {
	return page.request.post(`${API_ORIGIN}/public/leads`, {
		headers: {
			"content-type": "application/json",
			Origin: LEAD_ORIGIN,
			...headers,
		},
		data: body,
	});
}

const validLead = (phone: string) => ({
	name: HANOI_STUDENT.name,
	phone,
	elapsedMs: 9000,
	course: "ielts-foundation",
	studyDays: "mt",
	timeSlot: "0900",
});

/** SĐT 10 số duy nhất mỗi lần chạy test — Playwright retry re-run mutation:
 * SĐT cố định sẽ dedupe vào lead của attempt trước và mất email báo lead. */
const uniquePhone = () =>
	`0909${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;

/** Email báo lead mới gửi cho đúng giáo viên của test này. */
async function leadEmailsFor(teacherEmail: string) {
	const emails = await readVerificationEmails();
	return emails.filter(
		(e) =>
			e.to.trim().toLowerCase() === teacherEmail.toLowerCase() &&
			(e.subject ?? "").startsWith("Đăng ký học mới:"),
	);
}

test.describe("profile lead intake", () => {
	test("AC-001: gửi form profile chỉ Tên + SĐT ⇒ màn thành công không thanh toán, /leads hiện dòng mới, đổi trạng thái, có email báo", async ({
		page,
	}) => {
		const teacherEmail = await signUpLeadTeacher(page);
		const phone = uniquePhone();

		await page.goto(PROFILE_ORIGIN);
		const form = page.locator("#consultForm");
		await form.locator("#studentName").fill(HANOI_STUDENT.name);
		await form.locator("#studentPhone").fill(phone);
		// Chờ qua ngưỡng chống bot 3 giây (LEAD_MIN_ELAPSED_MS = 3000).
		await page.waitForTimeout(3100);
		await form.getByRole("button", { name: "Đăng Ký Khóa Học" }).click();

		const successBox = page.locator("#leadSuccessBox");
		await expect(successBox).toBeVisible();
		await expect(successBox).toHaveAttribute("role", "status");
		await expect(successBox).toContainText(HANOI_STUDENT.name);
		await expect(successBox).toContainText(phone);
		await expect(
			successBox.getByRole("link", { name: "Nhắn Zalo cô Mỹ" }),
		).toBeVisible();
		// D10: không hiện thông tin thanh toán / VietQR trên màn thành công.
		await expect(successBox).not.toContainText(
			/VietQR|chuyển khoản|TPBank|số tài khoản/i,
		);

		// Web: /leads hiện dòng lead mới.
		await page.goto("/leads");
		await expect(
			page
				.getByRole("heading", { name: "Đăng Ký Mới" })
				.or(page.getByRole("heading", { name: "Đăng ký mới" })),
		).toBeVisible();
		const table = page.getByTestId("leads-table");
		await expect(table.getByText(phone)).toBeVisible();
		// Chip "Mới" có badge đếm.
		const newChip = page.getByRole("button", { name: /Mới/ });
		const contactedChip = page.getByRole("button", { name: /Đã liên hệ/ });
		const newBefore = (await newChip.textContent()) ?? "";
		const contactedBefore = (await contactedChip.textContent()) ?? "";
		expect(newBefore).toMatch(/\d/);

		// Đổi trạng thái → Đã liên hệ, chip đếm cập nhật sau khi PATCH.
		await table.locator("tr", { hasText: phone }).click();
		const statusSelect = page
			.getByRole("dialog", { name: HANOI_STUDENT.name })
			.getByLabel("Trạng thái");
		await expect(statusSelect).toBeVisible();
		await statusSelect.selectOption("contacted");
		await page.getByRole("button", { name: "Lưu thay đổi" }).click();
		await expect(page.getByText("Đã cập nhật đăng ký.")).toBeVisible();
		await expect(newChip).not.toHaveText(newBefore);
		await expect(contactedChip).not.toHaveText(contactedBefore);

		// Email báo lead mới cho thành viên org — đúng 1 thư, không chứa SĐT.
		const leadEmails = await leadEmailsFor(teacherEmail);
		expect(leadEmails).toHaveLength(1);
		expect(leadEmails[0]?.subject).toBe(
			`Đăng ký học mới: ${HANOI_STUDENT.name}`,
		);
		expect(JSON.stringify(leadEmails[0])).not.toContain(phone);
	});

	test("AC-002: gửi lại cùng SĐT trong 24 giờ từ form profile ⇒ 1 dòng, submitCount tăng, lưu Khóa học mới, không email thêm (#600)", async ({
		page,
	}) => {
		const teacherEmail = await signUpLeadTeacher(page);
		const phone = uniquePhone();

		await page.goto(PROFILE_ORIGIN);
		const form = page.locator("#consultForm");
		await form.locator("#studentName").fill(HANOI_STUDENT.name);
		await form.locator("#studentPhone").fill(phone);
		await form.locator("#courseTrack").selectOption("foundation-core");
		await page.waitForTimeout(3100);
		await form.getByRole("button", { name: "Đăng Ký Khóa Học" }).click();
		await expect(page.locator("#leadSuccessBox")).toBeVisible();

		// Gửi lại lần 2 cùng SĐT, đổi khóa sang ielts-practical.
		await page.getByRole("button", { name: "Gửi đăng ký khác" }).click();
		await form.locator("#studentName").fill(HANOI_STUDENT.name);
		await form.locator("#studentPhone").fill(phone);
		await form.locator("#courseTrack").selectOption("ielts-practical");
		await page.waitForTimeout(3100);
		await form.getByRole("button", { name: "Đăng Ký Khóa Học" }).click();
		await expect(page.locator("#leadSuccessBox")).toBeVisible();

		await page.goto("/leads");
		const table = page.getByTestId("leads-table");
		const leadRow = table.locator("tr", { hasText: phone });
		await expect(leadRow).toHaveCount(1);
		await expect(leadRow).toContainText(/2 lần gửi/);
		await expect(leadRow).toContainText("IELTS Thực Chiến (5.5–7.5+)");

		// Chỉ 1 email — dedupe không báo lại.
		expect(await leadEmailsFor(teacherEmail)).toHaveLength(1);
	});

	test("AC-003: honeypot không ghi; IP gửi dồn vượt 3/10 phút ⇒ 429; API 500 ⇒ form giữ dữ liệu và hiện fallback copy-Zalo", async ({
		page,
	}) => {
		await signUpLeadTeacher(page);

		// Bot điền honeypot — 201 giả nhưng không có dòng lead.
		const honeypot = await submitLead(page, {
			...validLead("0933000111"),
			website: "http://spam.example",
		});
		expect(honeypot.status()).toBe(201);
		const honeypotBody = (await honeypot.json()) as { id: string };
		expect(honeypotBody.id).toBeTruthy();

		await page.goto("/leads");
		const table = page.getByTestId("leads-table");
		await expect(
			page.getByRole("heading", { name: "Đăng ký mới" }),
		).toBeVisible();
		expect(await table.getByText("0933000111").count()).toBe(0);

		// 3 lead từ cùng IP OK, lần thứ 4 ⇒ 429 LEAD_RATE_LIMITED.
		for (let i = 1; i <= 3; i++) {
			const res = await submitLead(page, validLead(`093400000${i}`), {
				"CF-Connecting-IP": "203.0.113.77",
			});
			expect(res.status()).toBe(201);
		}
		const limited = await submitLead(page, validLead("0934000099"), {
			"CF-Connecting-IP": "203.0.113.77",
		});
		expect(limited.status()).toBe(429);
		const limitedBody = (await limited.json()) as { code?: string };
		expect(limitedBody.code).toBe("LEAD_RATE_LIMITED");

		// IP khác không bị vạ lây.
		const otherIp = await submitLead(page, validLead("0935000001"), {
			"CF-Connecting-IP": "203.0.113.78",
		});
		expect(otherIp.status()).toBe(201);

		// Chặn POST /public/leads trả 500 (giữ CORS header) ⇒ form không mất
		// dữ liệu và hiện khối fallback copy-Zalo (D11).
		await page.route("**/public/leads", async (route) => {
			if (route.request().method() === "POST") {
				await route.fulfill({
					status: 500,
					headers: {
						"Access-Control-Allow-Origin": PROFILE_ORIGIN,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ error: "internal" }),
				});
				return;
			}
			await route.continue();
		});

		await page.goto(PROFILE_ORIGIN);
		const form = page.locator("#consultForm");
		await form.locator("#studentName").fill(HANOI_STUDENT.name);
		await form.locator("#studentPhone").fill("0909888777");
		await form.locator("#courseTrack").selectOption("ielts-practical");
		await form.getByRole("button", { name: "Đăng Ký Khóa Học" }).click();

		const fallbackBox = page.locator("#generatedMsgBox");
		await expect(fallbackBox).toBeVisible();
		await expect(page.locator("#generatedMsgPre")).toContainText(
			HANOI_STUDENT.name,
		);
		await expect(page.locator("#generatedMsgPre")).toContainText("0909888777");
		await expect(page.locator("#generatedMsgPre")).toContainText(
			"IELTS Thực Chiến",
		);
		// Dữ liệu trên form vẫn giữ nguyên.
		await expect(form.locator("#studentName")).toHaveValue(HANOI_STUDENT.name);
		await expect(form.locator("#studentPhone")).toHaveValue("0909888777");
		await expect(form.locator("#courseTrack")).toHaveValue("ielts-practical");
	});
});
