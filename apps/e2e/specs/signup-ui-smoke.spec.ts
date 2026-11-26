import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";
import { STUDENT_BASE_URL } from "./origins";

// Các spec khác đăng ký bằng API cho nhanh (signUpViaApi); spec này giữ lại
// đường đăng ký công khai thật qua form (/login?tab=signup -> học viên).
test("student signs up through the real form and lands on the student portal", async ({
	page,
}) => {
	const email = `e2e-signup-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
	await signUpViaUi(page, {
		email,
		expectedUrl: new RegExp(`^${STUDENT_BASE_URL}`),
	});
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`));
});
