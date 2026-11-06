import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

// Các spec khác đăng ký bằng API cho nhanh (signUpViaApi); spec này giữ lại
// đường đăng ký thật qua form để lỗi UI đăng ký không bị che khuất.
test("teacher signs up through the real form and lands on the dashboard", async ({
	page,
}) => {
	await signUpViaUi(page);
	await expect(page).toHaveURL(/\/dashboard/);
});
