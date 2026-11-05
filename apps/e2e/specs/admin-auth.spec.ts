import {
	type APIRequestContext,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	ADMIN_PASSWORD,
	adminSignInViaUi,
	ensureAdminAccount,
} from "./helpers";
import {
	ADMIN_ORIGIN,
	API_ORIGIN,
	STUDENT_ORIGIN,
	WEB_ORIGIN,
} from "./origins";

/**
 * Admin auth E2E (plan #413 phase 7): ba lớp gate của console quản trị.
 * Cơ chế thật (khớp unit test phase 1):
 * - Admin (role + verified + ∈ ADMIN_EMAILS) đăng nhập ở admin origin và
 *   qua guard `GET /api/admin/me` vào được shell.
 * - Teacher/student sign-in tại admin origin bị kernel từ chối 403
 *   ROLE_MISMATCH ngay tại form (không tạo session); teacher giữ cookie
 *   web cũ đi thẳng admin app thì guard `requireAdmin` trả 403
 *   ACCOUNT_NOT_ADMIN → toast "Tài khoản của bạn không có quyền quản trị."
 * - Admin bị chặn ở kernel tree và portal học viên (session bị từ chối
 *   ngay tại form, không bao giờ bootstrap org).
 * - Sign-up admin origin với email ngoài ADMIN_EMAILS → 403
 *   ADMIN_SIGNUP_FORBIDDEN (toast "không được cấp quyền quản trị").
 */

/** Toast sonner sống ~4s — assert NGAY sau hành động, không chờ URL trước. */
async function expectToast(page: Page, pattern: RegExp): Promise<void> {
	await expect(page.getByText(pattern).first()).toBeVisible();
}

const NOT_ADMIN_TOAST =
	/không được phép đăng nhập vào cổng quản trị|không phải tài khoản quản trị/;

async function signUpStudentViaApi(
	request: APIRequestContext,
	email: string,
): Promise<void> {
	// Không mang Origin admin → classify student (least privilege).
	const res = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: { name: "E2E Student", email, password: ADMIN_PASSWORD },
		headers: { "Content-Type": "application/json" },
	});
	if (res.status() !== 200) {
		throw new Error(
			`student sign-up failed (${res.status()}): ${await res.text()}`,
		);
	}
}

test("admin đăng nhập vào được shell quản trị với nav Thư viện đề", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await adminSignInViaUi(page);
	await expect(page.getByText("Cô Mỹ Dạy Tiếng Anh · Quản trị")).toBeVisible();
	const sidebar = page.getByRole("complementary", {
		name: "Điều hướng quản trị",
	});
	await expect(sidebar).toBeVisible();
	await expect(
		sidebar.getByRole("link", { name: "Thư viện đề" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Thư viện đề" }),
	).toBeVisible();
});

test("cookie teacher bị guard admin chặn → 403 ACCOUNT_NOT_ADMIN", async ({
	request,
}) => {
	await ensureAdminAccount(request);
	// Session teacher thật: sign-up qua API với Origin web (classify teacher),
	// giữ cookie rồi gọi /api/admin/me với Origin admin như guard của console.
	const teacherEmail = `e2e-teacher-gate-${Date.now()}@test.local`;
	const signUp = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: {
			name: "E2E Teacher",
			email: teacherEmail,
			password: ADMIN_PASSWORD,
		},
		headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
	});
	expect(signUp.status()).toBe(200);
	const cookie = signUp
		.headersArray()
		.find((h) => h.name === "set-cookie")
		?.value.split(";")[0];
	expect(cookie).toContain("better-auth.session_token=");
	// Cookie teacher không bao giờ qua admin gate → 403 ACCOUNT_NOT_ADMIN.
	const me = await request.get(`${API_ORIGIN}/api/admin/me`, {
		headers: { Origin: ADMIN_ORIGIN, Cookie: cookie as string },
	});
	expect(me.status()).toBe(403);
	const body: unknown = await me.json();
	if (
		!(typeof body === "object" && body !== null && "code" in body) ||
		body.code !== "ACCOUNT_NOT_ADMIN"
	) {
		throw new Error(`admin/me 403 body sai shape: ${JSON.stringify(body)}`);
	}
});

test("teacher sign-in trực tiếp ở admin origin bị từ chối 403 ROLE_MISMATCH", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	const teacherEmail = `e2e-teacher-gate-${Date.now()}@test.local`;
	// Tạo account teacher thật qua API (origin web → classify teacher).
	const res = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: {
			name: "E2E Teacher",
			email: teacherEmail,
			password: ADMIN_PASSWORD,
		},
		headers: { "Content-Type": "application/json", Origin: WEB_ORIGIN },
	});
	expect(res.status()).toBe(200);
	await page.goto(`${ADMIN_ORIGIN}/login`);
	await page.locator("#signin-email").fill(teacherEmail);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	const [signIn] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	expect(signIn.status()).toBe(403);
	await expectToast(page, NOT_ADMIN_TOAST);
	await expect(page).toHaveURL(/\/login/);
});

test("student sign-in ở admin origin bị từ chối — không tạo session", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	const studentEmail = `e2e-admin-gate-${Date.now()}@test.local`;
	await signUpStudentViaApi(request, studentEmail);
	await page.goto(`${ADMIN_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	const [signIn] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	expect(signIn.status()).toBe(403);
	// Không bao giờ vào được console; toast từ chối (role khác admin).
	await expectToast(page, NOT_ADMIN_TOAST);
	await expect(page).toHaveURL(/\/login/);
});

test("admin sign-in ở web origin bị từ chối — kernel không bao giờ bootstrap org", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	await page.goto("/login");
	await page.locator("#tab-signin").click();
	await page.locator("#si-email").fill("admin@e2e.local");
	await page.locator("#si-password").fill(ADMIN_PASSWORD);
	const [signIn] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	expect(signIn.status()).toBe(403);
	// Không vào dashboard, không mount workspace.
	await expect(page).toHaveURL(/\/login/);
	const snapshot = await request.get(`${API_ORIGIN}/api/kernel`);
	expect(snapshot.status()).toBe(401); // không cookie → 401, không bootstrap
});

test("admin sign-in ở cổng học viên bị từ chối", async ({ page }) => {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill("admin@e2e.local");
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	const [signIn] = await Promise.all([
		page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/email")),
		page.locator("#panel-signin button[type='submit']").click(),
	]);
	expect(signIn.status()).toBe(403);
	await expect(page).toHaveURL(/\/login/);
});

test("sign-up trên admin origin với email ngoài ADMIN_EMAILS bị từ chối", async ({
	page,
}) => {
	await page.goto(`${ADMIN_ORIGIN}/register`);
	await page.locator("#register-name").fill("Stranger");
	await page
		.locator("#register-email")
		.fill(`stranger-${Date.now()}@test.local`);
	await page.locator("#register-password").fill(ADMIN_PASSWORD);
	await page.getByRole("button", { name: "Tạo tài khoản" }).click();
	await expectToast(page, /không được cấp quyền quản trị|danh sách quản trị/);
	// Không điều hướng vào console sau sign-up bị chặn.
	await expect(page).toHaveURL(/\/register/);
});
