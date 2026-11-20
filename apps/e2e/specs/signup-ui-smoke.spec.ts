import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";
import { API_ORIGIN } from "./origins";

// Các spec khác đăng ký bằng API cho nhanh (signUpViaApi); spec này giữ lại
// đường đăng ký thật qua form để lỗi UI đăng ký không bị che khuất.
test("teacher signs up through the real form and lands on the dashboard", async ({
	page,
	request,
}) => {
	const email = `e2e-signup-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
	const allowRes = await request.post(`${API_ORIGIN}/__e2e/teacher-emails`, {
		headers: { "Content-Type": "application/json" },
		data: { emails: [email] },
	});
	expect(allowRes.status()).toBe(200);
	try {
		await signUpViaUi(page, { email, expectedUrl: /\/teacher\/dashboard/ });
		await expect(page).toHaveURL(/\/teacher\/dashboard/);
	} finally {
		await request.post(`${API_ORIGIN}/__e2e/teacher-emails`, {
			headers: { "Content-Type": "application/json" },
			data: { emails: [] },
		});
	}
});
