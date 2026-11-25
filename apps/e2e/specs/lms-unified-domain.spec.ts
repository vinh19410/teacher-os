import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	type APIRequestContext,
	expect,
	type Page,
	request as playwrightRequest,
	test,
} from "@playwright/test";
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	ensureAdminAccount,
	seedStudent,
} from "./helpers";
import {
	ADMIN_BASE_URL,
	API_ORIGIN,
	LMS_ORIGIN,
	PROFILE_ORIGIN,
	STUDENT_BASE_URL,
	TEACHER_BASE_URL,
} from "./origins";

const DEFAULT_PASSWORD = "password-8chars";
const LOCAL_DB_PATH = fileURLToPath(
	new URL("../local.db", import.meta.url).href,
);

function uniqueEmail(prefix: string): string {
	return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}

async function openDb() {
	const client = createClient({
		url: `file:${LOCAL_DB_PATH}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	await client.execute("PRAGMA foreign_keys = ON;");
	return client;
}

async function readUserRole(email: string): Promise<string | null> {
	const db = await openDb();
	try {
		const rs = await db.execute({
			sql: "SELECT role FROM user WHERE lower(email) = lower(?) LIMIT 1",
			args: [email],
		});
		const role = rs.rows[0]?.role;
		return typeof role === "string" ? role : null;
	} finally {
		db.close();
	}
}

async function updateUserInDb(
	email: string,
	fields: { role?: "teacher" | "student" | "admin"; emailVerified?: boolean },
): Promise<void> {
	const db = await openDb();
	try {
		const sets: string[] = [];
		const args: Array<string | number> = [];
		if (fields.role !== undefined) {
			sets.push("role = ?");
			args.push(fields.role);
		}
		if (fields.emailVerified !== undefined) {
			sets.push("email_verified = ?");
			args.push(fields.emailVerified ? 1 : 0);
		}
		args.push(email);
		const res = await db.execute({
			sql: `UPDATE user SET ${sets.join(", ")} WHERE lower(email) = lower(?)`,
			args,
		});
		expect(Number(res.rowsAffected)).toBe(1);
	} finally {
		db.close();
	}
}

async function deleteUserByEmail(email: string): Promise<void> {
	const db = await openDb();
	try {
		await db.execute({
			sql: "DELETE FROM user WHERE lower(email) = lower(?)",
			args: [email],
		});
	} finally {
		db.close();
	}
}

async function setRuntimeTeacherEmails(
	request: APIRequestContext,
	emails: string[],
): Promise<void> {
	const res = await request.post(`${API_ORIGIN}/__e2e/teacher-emails`, {
		headers: { "Content-Type": "application/json" },
		data: { emails },
	});
	expect(res.status()).toBe(200);
}

/** Tạo user qua API trên context cô lập để không làm nhiễm cookie jar của page. */
async function createAccountViaApi(opts: {
	name: string;
	email: string;
	password?: string;
	role: "teacher" | "student" | "admin";
	emailVerified?: boolean;
}): Promise<string> {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const res = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
			data: {
				name: opts.name,
				email: opts.email,
				password: opts.password ?? DEFAULT_PASSWORD,
			},
			headers: {
				"Content-Type": "application/json",
				Origin: LMS_ORIGIN,
			},
		});
		if (res.status() !== 200) {
			throw new Error(`sign-up failed (${res.status()}): ${await res.text()}`);
		}
		const setCookie = res
			.headersArray()
			.find(
				(h) =>
					h.name.toLowerCase() === "set-cookie" &&
					h.value.includes("better-auth.session_token="),
			);
		const token = /better-auth\.session_token=([^;]+)/.exec(
			setCookie?.value ?? "",
		)?.[1];
		if (!token) {
			throw new Error("no session cookie on sign-up response");
		}
		await updateUserInDb(opts.email, {
			role: opts.role,
			emailVerified: opts.emailVerified ?? true,
		});
		return token;
	} finally {
		await apiCtx.dispose();
	}
}

async function signInViaUnifiedLogin(
	page: Page,
	email: string,
	password: string,
	path = "/login",
): Promise<void> {
	await page.goto(`${LMS_ORIGIN}${path}`);
	await page.locator("#signin-email").fill(email);
	await page.locator("#signin-password").fill(password);
	await page.locator("#panel-signin button[type='submit']").click();
}

function trackSignOutRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (req) => {
		if (req.url().includes("/api/auth/sign-out")) {
			requests.push(`${req.method()} ${req.url()}`);
		}
	});
	return requests;
}

async function getCurrentSession(page: Page) {
	const res = await page.request.get(`${API_ORIGIN}/api/auth/get-session`, {
		headers: { Origin: LMS_ORIGIN },
	});
	expect(res.status()).toBe(200);
	return (await res.json()) as {
		session?: { id?: string };
		user?: { email?: string; role?: string };
	} | null;
}

test.describe("Unified LMS Domain E2E", () => {
	test.describe("Unified /login sign-in auto-redirects", () => {
		test("teacher đăng nhập ở /login tự chuyển sang /teacher/dashboard và tôn trọng safe returnUrl", async ({
			page,
		}) => {
			const teacherEmail = uniqueEmail("unified-teacher-signin");
			await createAccountViaApi({
				name: "GV Hợp Nhất",
				email: teacherEmail,
				role: "teacher",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, teacherEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });
			await expect(page.getByText("Lớp học").first()).toBeVisible();

			// Đăng xuất và kiểm tra safe ?returnUrl=/teacher/classes
			await page.context().clearCookies();
			await signInViaUnifiedLogin(
				page,
				teacherEmail,
				DEFAULT_PASSWORD,
				`/login?returnUrl=${encodeURIComponent("/teacher/classes")}`,
			);
			await expect(page).toHaveURL(/\/teacher\/classes$/, { timeout: 30_000 });
		});

		test("student đăng nhập ở /login tự chuyển sang /student và tôn trọng safe ?returnUrl=/student/schedule", async ({
			page,
		}) => {
			const studentEmail = uniqueEmail("unified-student-signin");
			await seedStudent({
				name: "Học Viên Hợp Nhất",
				email: studentEmail,
				onboarded: true,
			});
			await createAccountViaApi({
				name: "Học Viên Hợp Nhất",
				email: studentEmail,
				role: "student",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, studentEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
				timeout: 30_000,
			});
			await expect(page.getByText("Lớp học của tôi")).toBeVisible();

			// Kiểm tra safe ?returnUrl=/student/schedule
			await page.context().clearCookies();
			await signInViaUnifiedLogin(
				page,
				studentEmail,
				DEFAULT_PASSWORD,
				`/login?returnUrl=${encodeURIComponent("/student/schedule")}`,
			);
			await expect(page).toHaveURL(/\/student\/schedule$/, { timeout: 30_000 });
		});

		test("admin đăng nhập ở /login tự chuyển sang /admin/library/tests", async ({
			page,
			request,
		}) => {
			await ensureAdminAccount(request);

			await signInViaUnifiedLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
			await expect(page).toHaveURL(/\/admin\/library\/tests/, {
				timeout: 30_000,
			});
			await expect(
				page.getByRole("heading", { name: "Thư viện đề" }),
			).toBeVisible();
		});
	});

	test.describe("Public sign-up role classification at /login", () => {
		test("email thường đăng ký tại /login được gán role student và vào /student", async ({
			page,
		}) => {
			const studentEmail = uniqueEmail("unified-public-student");
			await page.goto(`${LMS_ORIGIN}/login?tab=signup`);
			await page.locator("#signup-name").fill("Học Viên Mới");
			await page.locator("#signup-email").fill(studentEmail);
			await page.locator("#signup-password").fill(DEFAULT_PASSWORD);
			await page.locator("#panel-signup button[type='submit']").click();

			await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
				timeout: 30_000,
			});
			expect(await readUserRole(studentEmail)).toBe("student");
		});

		test("email trong TEACHER_EMAILS đăng ký tại /login bị chặn 403 và không tạo tài khoản", async ({
			page,
			request,
		}) => {
			const teacherEmail = uniqueEmail("unified-allowlisted-teacher");
			await setRuntimeTeacherEmails(request, [teacherEmail]);
			try {
				await page.goto(`${LMS_ORIGIN}/login?tab=signup`);
				await page.locator("#signup-name").fill("GV Allowlist");
				await page.locator("#signup-email").fill(teacherEmail);
				await page.locator("#signup-password").fill(DEFAULT_PASSWORD);

				const [signUpRes] = await Promise.all([
					page.waitForResponse((r) =>
						r.url().includes("/api/auth/sign-up/email"),
					),
					page.locator("#panel-signup button[type='submit']").click(),
				]);
				expect(signUpRes.status()).toBe(403);
				const body = (await signUpRes.json()) as { code?: string };
				expect(body.code).toBe("ROLE_SIGNUP_FORBIDDEN");

				await expect(page).toHaveURL(/\/login/);
				await expect(
					page
						.getByText("Email này không thể tự đăng ký bằng mật khẩu")
						.first(),
				).toBeVisible();
				expect(await readUserRole(teacherEmail)).toBeNull();
			} finally {
				await setRuntimeTeacherEmails(request, []);
			}
		});

		test("email trong ADMIN_EMAILS đăng ký tại /login bị chặn 403 và không tạo tài khoản", async ({
			page,
			request,
		}) => {
			await deleteUserByEmail(ADMIN_EMAIL);
			try {
				await page.goto(`${LMS_ORIGIN}/login?tab=signup`);
				await page.locator("#signup-name").fill("E2E Admin");
				await page.locator("#signup-email").fill(ADMIN_EMAIL);
				await page.locator("#signup-password").fill(ADMIN_PASSWORD);

				const [signUpRes] = await Promise.all([
					page.waitForResponse((r) =>
						r.url().includes("/api/auth/sign-up/email"),
					),
					page.locator("#panel-signup button[type='submit']").click(),
				]);
				expect(signUpRes.status()).toBe(403);
				const body = (await signUpRes.json()) as { code?: string };
				expect(body.code).toBe("ROLE_SIGNUP_FORBIDDEN");

				await expect(page).toHaveURL(/\/login/);
				await expect(
					page
						.getByText("Email này không thể tự đăng ký bằng mật khẩu")
						.first(),
				).toBeVisible();
				expect(await readUserRole(ADMIN_EMAIL)).toBeNull();
			} finally {
				await ensureAdminAccount(request);
			}
		});
	});

	test.describe("Cross-role prefix auto-redirect (preserve session, no signOut)", () => {
		test("student vào /teacher/classes, /admin/library/tests, / và /login đều tự chuyển về /student mà không gọi signOut", async ({
			page,
		}) => {
			const studentEmail = uniqueEmail("cross-role-student");
			await seedStudent({
				name: "Học Viên Cross Role",
				email: studentEmail,
				onboarded: true,
			});
			await createAccountViaApi({
				name: "Học Viên Cross Role",
				email: studentEmail,
				role: "student",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, studentEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
				timeout: 30_000,
			});

			const signOutRequests = trackSignOutRequests(page);

			for (const target of [
				`${TEACHER_BASE_URL}/classes`,
				`${ADMIN_BASE_URL}/library/tests`,
				`${LMS_ORIGIN}/`,
				`${LMS_ORIGIN}/login`,
			]) {
				await page.goto(target);
				await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
					timeout: 30_000,
				});
			}

			expect(signOutRequests).toEqual([]);
			const session = await getCurrentSession(page);
			expect(session?.user?.role).toBe("student");
			expect(session?.user?.email?.toLowerCase()).toBe(
				studentEmail.toLowerCase(),
			);
		});

		test("teacher vào /student/schedule, /admin/library/tests, / và /login đều tự chuyển về /teacher/dashboard mà không gọi signOut", async ({
			page,
		}) => {
			const teacherEmail = uniqueEmail("cross-role-teacher");
			await createAccountViaApi({
				name: "GV Cross Role",
				email: teacherEmail,
				role: "teacher",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, teacherEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });

			const signOutRequests = trackSignOutRequests(page);

			for (const target of [
				`${STUDENT_BASE_URL}/schedule`,
				`${ADMIN_BASE_URL}/library/tests`,
				`${LMS_ORIGIN}/`,
				`${LMS_ORIGIN}/login`,
			]) {
				await page.goto(target);
				await expect(page).toHaveURL(/\/teacher\/dashboard/, {
					timeout: 30_000,
				});
			}

			expect(signOutRequests).toEqual([]);
			const session = await getCurrentSession(page);
			expect(session?.user?.role).toBe("teacher");
			expect(session?.user?.email?.toLowerCase()).toBe(
				teacherEmail.toLowerCase(),
			);
		});

		test("admin vào /teacher/classes, /student/schedule, / và /login đều tự chuyển về /admin/library/tests mà không gọi signOut", async ({
			page,
			request,
		}) => {
			await ensureAdminAccount(request);
			await signInViaUnifiedLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
			await expect(page).toHaveURL(/\/admin\/library\/tests/, {
				timeout: 30_000,
			});

			const signOutRequests = trackSignOutRequests(page);

			for (const target of [
				`${TEACHER_BASE_URL}/classes`,
				`${STUDENT_BASE_URL}/schedule`,
				`${LMS_ORIGIN}/`,
				`${LMS_ORIGIN}/login`,
			]) {
				await page.goto(target);
				await expect(page).toHaveURL(/\/admin\/library\/tests/, {
					timeout: 30_000,
				});
			}

			expect(signOutRequests).toEqual([]);
			const session = await getCurrentSession(page);
			expect(session?.user?.role).toBe("admin");
			expect(session?.user?.email?.toLowerCase()).toBe(
				ADMIN_EMAIL.toLowerCase(),
			);
		});
	});

	test("anti-loop allowlist gate: user role=admin ngoài ADMIN_EMAILS vào /admin dừng sạch ở /login?blocked=1 và cho phép đăng xuất", async ({
		page,
	}) => {
		const rogueAdminEmail = uniqueEmail("rogue-admin");
		const token = await createAccountViaApi({
			name: "Rogue Admin",
			email: rogueAdminEmail,
			role: "admin",
			emailVerified: true,
		});
		await page.context().addCookies([
			{
				name: "better-auth.session_token",
				value: token,
				domain: "localhost",
				path: "/",
			},
		]);

		const signOutRequests = trackSignOutRequests(page);
		await page.goto(`${ADMIN_BASE_URL}/library/tests`);

		await expect(page).toHaveURL(
			/\/login\?blocked=(?:1|%221%22)&error=NOT_ADMIN/,
			{
				timeout: 30_000,
			},
		);
		await expect(page.getByRole("alert")).toBeVisible();
		await expect(
			page.getByText("Tài khoản của bạn không có quyền quản trị."),
		).toBeVisible();
		const signOutBtn = page.getByRole("button", {
			name: "Đăng xuất để đổi tài khoản",
		});
		await expect(signOutBtn).toBeVisible();
		expect(signOutRequests).toEqual([]);

		// Chờ ngắn để đảm bảo đứng yên tại /login?blocked=1, không bật vòng lặp redirect.
		await page.waitForTimeout(500);
		await expect(page).toHaveURL(
			/\/login\?blocked=(?:1|%221%22)&error=NOT_ADMIN/,
		);

		// Bấm đăng xuất để đổi tài khoản → thu hồi session và quay lại form /login.
		await signOutBtn.click();
		await expect(page).toHaveURL(new RegExp(`^${LMS_ORIGIN}/login$`));
		await expect(page.locator("#signin-email")).toBeVisible();
		expect(await getCurrentSession(page)).toBeNull();
	});

	test.describe("Sign-out from all 3 portals clears session and lands on /login", () => {
		test("sign-out từ /teacher/dashboard xóa session và về /login", async ({
			page,
		}) => {
			const teacherEmail = uniqueEmail("signout-teacher");
			await createAccountViaApi({
				name: "GV Signout",
				email: teacherEmail,
				role: "teacher",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, teacherEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });
			await expect(page.getByText("Lớp học").first()).toBeVisible();

			await page.getByRole("button", { name: "Đăng xuất" }).click();
			await expect(page).toHaveURL(new RegExp(`^${LMS_ORIGIN}/login$`));
			await expect(page.locator("#signin-email")).toBeVisible();
			expect(await getCurrentSession(page)).toBeNull();
		});

		test("sign-out từ /student xóa session và về /login", async ({ page }) => {
			const studentEmail = uniqueEmail("signout-student");
			await seedStudent({
				name: "HV Signout",
				email: studentEmail,
				onboarded: true,
			});
			await createAccountViaApi({
				name: "HV Signout",
				email: studentEmail,
				role: "student",
				emailVerified: true,
			});

			await signInViaUnifiedLogin(page, studentEmail, DEFAULT_PASSWORD);
			await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
				timeout: 30_000,
			});
			await expect(page.getByText("Lớp học của tôi")).toBeVisible();

			await page.getByRole("button", { name: "Tài khoản học viên" }).click();
			await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
			await expect(page).toHaveURL(new RegExp(`^${LMS_ORIGIN}/login$`));
			await expect(page.locator("#signin-email")).toBeVisible();
			expect(await getCurrentSession(page)).toBeNull();
		});

		test("sign-out từ /admin/library/tests xóa session và về /login", async ({
			page,
			request,
		}) => {
			await ensureAdminAccount(request);
			await signInViaUnifiedLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
			await expect(page).toHaveURL(/\/admin\/library\/tests/, {
				timeout: 30_000,
			});
			await expect(
				page.getByRole("heading", { name: "Thư viện đề" }),
			).toBeVisible();

			await page.getByRole("button", { name: "Đăng xuất" }).click();
			await expect(page).toHaveURL(new RegExp(`^${LMS_ORIGIN}/login$`));
			await expect(page.locator("#signin-email")).toBeVisible();
			expect(await getCurrentSession(page)).toBeNull();
		});
	});

	test("public /pay/:token hoạt động khi chưa đăng nhập và trả HTTP 200 HTML shell", async ({
		page,
	}) => {
		const response = await page.goto(
			`${LMS_ORIGIN}/pay/nonexistent-e2e-token-123`,
		);
		expect(response?.status()).toBe(200);
		expect(response?.headers()["content-type"]).toContain("text/html");
		await expect(page).toHaveURL(/\/pay\/nonexistent-e2e-token-123$/);
		await expect(
			page.getByText("Link thanh toán không tồn tại hoặc đã bị thu hồi."),
		).toBeVisible();
	});

	test("legacy subdomain 301 redirects và SW passthrough hoạt động đúng trên worker LMS", async ({
		request,
	}) => {
		const redirectCases: Array<{
			host: string;
			path: string;
			expectedLocation: string;
		}> = [
			{
				host: "app.msmy.io.vn",
				path: "/classes?tab=active",
				expectedLocation: "https://lms.msmy.io.vn/teacher/classes?tab=active",
			},
			{
				host: "app.msmy.io.vn",
				path: "/pay/tok-123",
				expectedLocation: "https://lms.msmy.io.vn/pay/tok-123",
			},
			{
				host: "app.msmy.io.vn",
				path: "/login",
				expectedLocation: "https://lms.msmy.io.vn/login",
			},
			{
				host: "student.msmy.io.vn",
				path: "/schedule",
				expectedLocation: "https://lms.msmy.io.vn/student/schedule",
			},
			{
				host: "admin.msmy.io.vn",
				path: "/library/tests",
				expectedLocation: "https://lms.msmy.io.vn/admin/library/tests",
			},
		];

		for (const tc of redirectCases) {
			const res = await request.get(`${LMS_ORIGIN}${tc.path}`, {
				headers: {
					"X-Forwarded-Host": tc.host,
					"X-Forwarded-Proto": "https",
				},
				maxRedirects: 0,
			});
			expect(res.status(), `${tc.host}${tc.path} status`).toBe(301);
			expect(res.headers().location, `${tc.host}${tc.path} Location`).toBe(
				tc.expectedLocation,
			);
		}

		// SW self-unregister stubs trên legacy app host phải trả 200 text/javascript (KHÔNG redirect).
		for (const swPath of ["/sw.js", "/registerSW.js"]) {
			const res = await request.get(`${LMS_ORIGIN}${swPath}`, {
				headers: {
					"X-Forwarded-Host": "app.msmy.io.vn",
					"X-Forwarded-Proto": "https",
				},
				maxRedirects: 0,
			});
			expect(res.status(), `app.msmy.io.vn${swPath} status`).toBe(200);
			expect(res.headers()["content-type"]).toContain("text/javascript");
		}
	});

	test("trang profile trỏ #studentPortalLink sang cổng học viên hợp nhất /student", async ({
		page,
	}) => {
		await page.goto(PROFILE_ORIGIN);
		const portalLink = page.locator("#studentPortalLink");
		await expect(portalLink).toBeVisible();
		await expect(portalLink).toHaveAttribute("href", `${LMS_ORIGIN}/student`);
	});
});
