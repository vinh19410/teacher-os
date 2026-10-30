import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { readVerificationEmails, signUpViaUi } from "./helpers";
import { API_ORIGIN } from "./origins";

/**
 * E2E lead intake (#506): POST /public/leads từ origin profile → lead vào
 * đúng org → giáo viên thấy trên /leads, đổi trạng thái, chip đếm cập nhật;
 * email báo lead mới; dedupe theo SĐT; chống spam (honeypot + tần suất IP).
 *
 * apps/profile chưa commit (phase 5 blocked) nên phần intake driver là
 * request API với Origin profile e2e (port 8105) — cùng hợp đồng CORS/
 * payload mà form trên msmy.io.vn dùng. Fallback copy-Zalo là behavior
 * client-side của form profile — kiểm khi profile vào repo.
 */

// Phải khớp boot.ts (LEAD_ORG_ID + LEAD_ORIGIN).
const LEAD_ORG_ID = "e2e-lead-org";
const LEAD_ORIGIN = `http://localhost:${process.env.E2E_PROFILE_PORT ?? 8105}`;

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
	test("AC-001: lead mới vào org, giáo viên thấy trên /leads, đổi trạng thái, có email báo", async ({
		page,
	}) => {
		const teacherEmail = await signUpLeadTeacher(page);
		const phone = uniquePhone();

		// Intake từ form profile (origin cho phép) — chỉ Tên + SĐT bắt buộc.
		const res = await submitLead(page, {
			...validLead(phone),
			email: "hanguyen@example.com",
			note: "Muốn học IELTS để du học",
		});
		expect(res.status()).toBe(201);
		const body = (await res.json()) as { id: string; submitCount: number };
		expect(body.id).toBeTruthy();
		expect(body.submitCount).toBe(1);

		// Web: /leads hiện dòng lead mới.
		await page.goto("/leads");
		await expect(
			page.getByRole("heading", { name: "Đăng ký mới" }),
		).toBeVisible();
		const table = page.getByTestId("leads-table");
		await expect(table.getByText(phone)).toBeVisible();
		// Chip "Mới" có badge đếm (số tuyệt đối không khẳng định — run có
		// retry của test khác cùng org).
		const newChip = page.getByRole("button", { name: /Mới/ });
		const contactedChip = page.getByRole("button", { name: /Đã liên hệ/ });
		const newBefore = (await newChip.textContent()) ?? "";
		const contactedBefore = (await contactedChip.textContent()) ?? "";
		expect(newBefore).toMatch(/\d/);

		// Đổi trạng thái → Đã liên hệ, chip đếm giảm về sau khi PATCH.
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

		// Email báo lead mới cho thành viên org — đúng 1 thư.
		const leadEmails = await leadEmailsFor(teacherEmail);
		expect(leadEmails).toHaveLength(1);
		expect(leadEmails[0]!.subject).toBe(
			`Đăng ký học mới: ${HANOI_STUDENT.name}`,
		);
	});

	test("AC-002: gửi lại cùng SĐT trong 24 giờ ⇒ 1 dòng, submitCount tăng, không email thêm", async ({
		page,
	}) => {
		const teacherEmail = await signUpLeadTeacher(page);
		const phone = uniquePhone();

		const first = await submitLead(page, validLead(phone));
		expect(first.status()).toBe(201);
		const firstBody = (await first.json()) as {
			id: string;
			submitCount: number;
		};
		expect(firstBody.id).toBeTruthy();

		const second = await submitLead(page, {
			...validLead(phone),
			course: "comm-2",
		});
		expect(second.status()).toBe(201);
		const secondBody = (await second.json()) as {
			id: string;
			submitCount: number;
		};
		// Cùng lead cũ — không tạo dòng mới; submitCount tăng đúng 1.
		expect(secondBody.id).toBe(firstBody.id);
		expect(secondBody.submitCount).toBe(firstBody.submitCount + 1);

		await page.goto("/leads");
		const table = page.getByTestId("leads-table");
		// Đúng 1 dòng cho SĐT này (retry của Playwright re-run mutation —
		// submitCount có thể > 2, nhưng KHÔNG BAO GIỜ tạo dòng thứ hai).
		const leadRow = table.locator("tr", { hasText: phone });
		await expect(leadRow).toHaveCount(1);
		await expect(leadRow).toContainText(/lần gửi/);

		// Chỉ 1 email — dedupe không báo lại.
		expect(await leadEmailsFor(teacherEmail)).toHaveLength(1);
	});

	test("AC-003: honeypot không ghi; IP gửi dồn vượt 3/10 phút ⇒ 429", async ({
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
	});
});
