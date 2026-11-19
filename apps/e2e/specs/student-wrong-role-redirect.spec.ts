import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	expect,
	type Page,
	request as playwrightRequest,
	test,
} from "@playwright/test";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

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
	return client;
}

/**
 * Tạo tài khoản qua API trên context cô lập để không làm lẫn cookie jar
 * giữa các vai trò trong cùng một test.
 */
async function signUpViaApi(
	email: string,
	origin: string,
	name: string,
): Promise<string> {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const res = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
			data: {
				name,
				email,
				password: DEFAULT_PASSWORD,
			},
			headers: {
				"Content-Type": "application/json",
				Origin: origin,
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
		const match = /better-auth\.session_token=([^;]+)/.exec(
			setCookie?.value ?? "",
		);
		const token = match?.[1];
		if (!token) {
			throw new Error("no session cookie on sign-up response");
		}
		return token;
	} finally {
		await apiCtx.dispose();
	}
}

async function updateUserInDb(
	email: string,
	fields: { role: "teacher" | "admin" | "student"; emailVerified?: boolean },
): Promise<void> {
	const client = await openDb();
	try {
		const res =
			fields.emailVerified !== undefined
				? await client.execute({
						sql: "UPDATE user SET role = ?, email_verified = ? WHERE lower(email) = lower(?)",
						args: [fields.role, fields.emailVerified ? 1 : 0, email],
					})
				: await client.execute({
						sql: "UPDATE user SET role = ? WHERE lower(email) = lower(?)",
						args: [fields.role, email],
					});
		expect(Number(res.rowsAffected)).toBe(1);
	} finally {
		client.close();
	}
}

async function ensureOrganizationSeeded(): Promise<void> {
	const client = await openDb();
	try {
		const res = await client.execute(
			"SELECT id FROM organization ORDER BY created_at ASC, id ASC LIMIT 1",
		);
		if (!res.rows[0]) {
			await client.execute({
				sql: "INSERT OR IGNORE INTO organization (id, name, created_at) VALUES (?, ?, ?)",
				args: ["org-e2e-seed", "E2E School", Date.now()],
			});
		}
	} finally {
		client.close();
	}
}

async function attachSessionCookie(page: Page, token: string): Promise<void> {
	await page.context().addCookies([
		{
			name: "better-auth.session_token",
			value: token,
			domain: "localhost",
			path: "/",
		},
	]);
}

async function seedWrongRoleSession(
	page: Page,
	role: "teacher" | "admin",
	prefix: string,
): Promise<{ email: string; token: string }> {
	const email = uniqueEmail(prefix);
	const token = await signUpViaApi(email, WEB_ORIGIN, `E2E ${role}`);
	await updateUserInDb(email, { role });
	await attachSessionCookie(page, token);
	return { email, token };
}

function trackSignOutRequests(page: Page): string[] {
	const signOutRequests: string[] = [];
	page.on("request", (req) => {
		if (req.url().includes("/api/auth/sign-out")) {
			signOutRequests.push(`${req.method()} ${req.url()}`);
		}
	});
	return signOutRequests;
}

async function getSessionWithCookie(token: string) {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const res = await apiCtx.get(`${API_ORIGIN}/api/auth/get-session`, {
			headers: {
				Origin: WEB_ORIGIN,
				Cookie: `better-auth.session_token=${token}`,
			},
		});
		return {
			status: res.status(),
			body: (await res.json()) as {
				session?: { id?: string; userId?: string };
				user?: { id?: string; email?: string; role?: string };
			} | null,
		};
	} finally {
		await apiCtx.dispose();
	}
}

/**
 * Khi session sai vai trò vào cổng học viên, app phải chuyển hướng về /login
 * sạch sẽ mà không gọi sign-out, không hiện màn hình chặn và không lặp redirect.
 */
async function expectCleanLoginRedirect(
	page: Page,
	expectedReturnUrl: string,
	signOutRequests: string[],
): Promise<void> {
	const expectedUrl = `${STUDENT_ORIGIN}/login?returnUrl=${encodeURIComponent(expectedReturnUrl)}`;
	await expect(page).toHaveURL(expectedUrl);
	await expect(
		page.getByRole("heading", { name: "Chào mừng trở lại" }),
	).toBeVisible();
	await expect(page.getByText("Đây là tài khoản giáo viên")).not.toBeVisible();
	expect(signOutRequests).toEqual([]);

	// Chờ ngắn để xác nhận URL giữ nguyên tại /login và không bật vòng lặp redirect.
	await page.waitForTimeout(500);
	await expect(page).toHaveURL(expectedUrl);
	await expect(
		page.getByRole("heading", { name: "Chào mừng trở lại" }),
	).toBeVisible();
	await expect(page.getByText("Đây là tài khoản giáo viên")).not.toBeVisible();
	expect(signOutRequests).toEqual([]);
}

test.describe("Student Portal Wrong-Role Redirect", () => {
	test("teacher session cookie vào / và /classes chuyển về /login không thu hồi phiên giáo viên", async ({
		page,
	}) => {
		const { email, token } = await seedWrongRoleSession(
			page,
			"teacher",
			"wrong-role-teacher",
		);
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_ORIGIN}/`);
		await expectCleanLoginRedirect(page, "/", signOutRequests);

		await page.goto(`${STUDENT_ORIGIN}/classes`);
		await expectCleanLoginRedirect(page, "/classes", signOutRequests);

		const sessionRes = await getSessionWithCookie(token);
		expect(sessionRes.status).toBe(200);
		expect(sessionRes.body?.user?.role).toBe("teacher");
		expect(sessionRes.body?.user?.email?.toLowerCase()).toBe(
			email.toLowerCase(),
		);
	});

	test("admin session cookie vào / chuyển về /login sạch sẽ không gọi sign-out", async ({
		page,
	}) => {
		await seedWrongRoleSession(page, "admin", "wrong-role-admin");
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_ORIGIN}/`);
		await expectCleanLoginRedirect(page, "/", signOutRequests);
	});

	test("fallback 403 ACCOUNT_TEACHER_ROLE khi vượt qua beforeLoad chuyển về /login không lặp redirect", async ({
		page,
	}) => {
		await seedWrongRoleSession(page, "teacher", "wrong-role-fallback");
		const signOutRequests = trackSignOutRequests(page);

		const studentMeStatuses: number[] = [];
		page.on("response", (res) => {
			if (res.url().includes("/api/student/me")) {
				studentMeStatuses.push(res.status());
			}
		});

		// Giả lập session cache hoặc role vừa đổi sau khi sign-up: chỉ thay role
		// thành student ở lần GET get-session đầu tiên để đi qua beforeLoad, rồi
		// gỡ route ngay để /login nhận đúng session teacher thật từ server.
		let interceptedFirstGetSession = false;
		await page.route("**/api/auth/get-session", async (route) => {
			if (interceptedFirstGetSession || route.request().method() !== "GET") {
				await route.continue();
				return;
			}
			interceptedFirstGetSession = true;
			const response = await route.fetch();
			const payload = (await response.json()) as {
				session: Record<string, unknown>;
				user: Record<string, unknown>;
			} | null;
			if (!payload?.user) {
				throw new Error("Expected active session payload from get-session");
			}
			await route.fulfill({
				response,
				json: {
					...payload,
					user: {
						...payload.user,
						role: "student",
					},
				},
			});
			await page.unroute("**/api/auth/get-session");
		});

		await page.goto(`${STUDENT_ORIGIN}/`);
		await expectCleanLoginRedirect(page, "/", signOutRequests);

		expect(interceptedFirstGetSession).toBe(true);
		expect(studentMeStatuses).toContain(403);
	});

	test("đăng nhập tài khoản học viên hợp lệ từ /login khi đang giữ cookie giáo viên vào được cổng học viên", async ({
		page,
	}) => {
		await ensureOrganizationSeeded();

		const studentEmail = uniqueEmail("valid-student");
		await signUpViaApi(studentEmail, STUDENT_ORIGIN, "E2E Valid Student");
		await updateUserInDb(studentEmail, {
			role: "student",
			emailVerified: true,
		});

		await seedWrongRoleSession(page, "teacher", "teacher-cookie-holder");
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_ORIGIN}/`);
		await expectCleanLoginRedirect(page, "/", signOutRequests);

		const signInForm = page.locator("#panel-signin");
		await signInForm.locator("#signin-email").fill(studentEmail);
		await signInForm.locator("#signin-password").fill(DEFAULT_PASSWORD);
		await signInForm.locator("button[type='submit']").click();

		await expect(page).toHaveURL(
			new RegExp(`^${STUDENT_ORIGIN}/(onboarding)?$`),
			{ timeout: 20_000 },
		);
		await expect(page).not.toHaveURL(/\/login/);
		await expect(
			page.getByText("Bạn muốn học tiếng Anh theo hướng nào?"),
		).toBeVisible({ timeout: 20_000 });
		await expect(
			page.getByText("Đây là tài khoản giáo viên"),
		).not.toBeVisible();
	});
});
