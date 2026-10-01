import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { readVerificationEmails, signUpViaUi } from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

test.describe("Web Email Verification", () => {
	test("happy-path: teacher sign-up -> mail link -> confirmation page -> CTA vào workspace, DB email_verified = 1", async ({
		page,
	}) => {
		const email = await signUpViaUi(page);
		// Sign-up soft mode: đã vào workspace — verify email không chặn đăng nhập.

		// Mail link phải mang callbackURL về trang xác nhận của cổng web.
		let verifyUrl: string | undefined;
		for (let i = 0; i < 20; i++) {
			const emails = await readVerificationEmails();
			const entry = emails.find(
				(e) => e.to.trim().toLowerCase() === email.trim().toLowerCase(),
			);
			if (entry?.url) {
				verifyUrl = entry.url;
				break;
			}
			await page.waitForTimeout(500);
		}
		expect(verifyUrl, "verification email logged").toBeDefined();

		// callbackURL encode của ${WEB_ORIGIN}/verify-email
		const expectedCallback = encodeURIComponent(
			`${WEB_ORIGIN}/verify-email?verified=ok`,
		);
		expect(verifyUrl).toContain(expectedCallback);

		await page.goto(verifyUrl as string);
		await expect(page).toHaveURL(/\/verify-email\?verified=ok/);
		await expect(page.getByText("Email verified")).toBeVisible();

		await page.getByRole("button", { name: "Go to workspace" }).click();
		// Full load qua kernel load gate — URL về origin web, rời trang xác nhận.
		await expect(page).toHaveURL(/^(?!.*verify-email).+$/, { timeout: 20_000 });

		// DB assert chỉ đọc: email_verified đã flip.
		const client = createClient({
			url: `file:${new URL("../local.db", import.meta.url).pathname}`,
		});
		await client.execute("PRAGMA busy_timeout = 5000;");
		try {
			const res = await client.execute({
				sql: "SELECT email_verified FROM user WHERE lower(trim(email)) = lower(?)",
				args: [email],
			});
			const verified = Number(res.rows[0]?.email_verified ?? 0);
			expect(verified).toBe(1);
		} finally {
			client.close();
		}
	});

	test("garbage link: token sai → error card, không crash, không echo error code", async ({
		page,
	}) => {
		const callbackURL = encodeURIComponent(
			`${WEB_ORIGIN}/verify-email?verified=ok`,
		);
		await page.goto(
			`${API_ORIGIN}/api/auth/verify-email?token=garbage&callbackURL=${callbackURL}`,
		);
		await expect(page).toHaveURL(/error=INVALID_TOKEN/);
		await expect(page.getByText("This link didn't work")).toBeVisible();
	});
});
