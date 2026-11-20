import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	expect,
	type Page,
	request as playwrightRequest,
	test,
} from "@playwright/test";
import { ADMIN_EMAIL, ADMIN_PASSWORD, ensureAdminAccount } from "./helpers";
import { API_ORIGIN, LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

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
async function signUpViaApi(email: string, name: string): Promise<string> {
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

async function signInViaApi(email: string, password: string): Promise<string> {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const res = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-in/email`, {
			data: { email, password },
			headers: {
				"Content-Type": "application/json",
				Origin: LMS_ORIGIN,
			},
		});
		if (res.status() !== 200) {
			throw new Error(`sign-in failed (${res.status()}): ${await res.text()}`);
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
			throw new Error("no session cookie on sign-in response");
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

async function seedTeacherSession(
	page: Page,
	prefix: string,
): Promise<{ email: string; token: string }> {
	const email = uniqueEmail(prefix);
	const token = await signUpViaApi(email, "E2E teacher");
	await updateUserInDb(email, { role: "teacher", emailVerified: true });
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
				Origin: LMS_ORIGIN,
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
 * Khi session sai vai trò vào `/student/*`, app phải tự động chuyển hướng sang
 * đúng cổng của role đó (`/teacher/dashboard` hoặc `/admin/library/tests`)
 * mà không gọi sign-out, không hiện màn hình chặn và không lặp redirect.
 */
async function expectCleanPortalRedirect(
	page: Page,
	expectedUrlPattern: RegExp,
	signOutRequests: string[],
): Promise<void> {
	await expect(page).toHaveURL(expectedUrlPattern, { timeout: 30_000 });
	await expect(page.getByText("Đây là tài khoản giáo viên")).not.toBeVisible();
	expect(signOutRequests).toEqual([]);

	// Chờ ngắn để xác nhận URL đứng yên và không bật vòng lặp redirect.
	await page.waitForTimeout(500);
	await expect(page).toHaveURL(expectedUrlPattern);
	await expect(page.getByText("Đây là tài khoản giáo viên")).not.toBeVisible();
	expect(signOutRequests).toEqual([]);
}

test.describe("Student Portal Wrong-Role Auto-Redirect", () => {
	test("teacher session cookie vào /student và /student/classes tự chuyển về /teacher/dashboard không thu hồi phiên giáo viên", async ({
		page,
	}) => {
		const { email, token } = await seedTeacherSession(
			page,
			"wrong-role-teacher",
		);
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_BASE_URL}/`);
		await expectCleanPortalRedirect(
			page,
			/\/teacher\/dashboard/,
			signOutRequests,
		);

		await page.goto(`${STUDENT_BASE_URL}/classes`);
		await expectCleanPortalRedirect(
			page,
			/\/teacher\/dashboard/,
			signOutRequests,
		);

		const sessionRes = await getSessionWithCookie(token);
		expect(sessionRes.status).toBe(200);
		expect(sessionRes.body?.user?.role).toBe("teacher");
		expect(sessionRes.body?.user?.email?.toLowerCase()).toBe(
			email.toLowerCase(),
		);
	});

	test("admin session cookie vào /student tự chuyển về /admin/library/tests không gọi sign-out", async ({
		page,
		request,
	}) => {
		await ensureAdminAccount(request);
		const token = await signInViaApi(ADMIN_EMAIL, ADMIN_PASSWORD);
		await attachSessionCookie(page, token);
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_BASE_URL}/`);
		await expectCleanPortalRedirect(
			page,
			/\/admin\/library\/tests/,
			signOutRequests,
		);
	});

	test("fallback 403 ACCOUNT_TEACHER_ROLE khi vượt qua beforeLoad tự chuyển về /teacher/dashboard không lặp redirect", async ({
		page,
	}) => {
		await seedTeacherSession(page, "wrong-role-fallback");
		const signOutRequests = trackSignOutRequests(page);

		const studentMeStatuses: number[] = [];
		page.on("response", (res) => {
			if (res.url().includes("/api/student/me")) {
				studentMeStatuses.push(res.status());
			}
		});

		// Giả lập session cache cũ: chỉ thay role thành student ở lần GET
		// get-session đầu tiên để đi qua beforeLoad, rồi gỡ route ngay để
		// root dispatcher `/` nhận đúng session teacher thật từ server.
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

		await page.goto(`${STUDENT_BASE_URL}/`);
		await expectCleanPortalRedirect(
			page,
			/\/teacher\/dashboard/,
			signOutRequests,
		);

		expect(interceptedFirstGetSession).toBe(true);
		expect(studentMeStatuses).toContain(403);
	});

	test("giáo viên đăng xuất rồi đăng nhập tài khoản học viên hợp lệ ở /login vào được cổng học viên", async ({
		page,
	}) => {
		await ensureOrganizationSeeded();

		const studentEmail = uniqueEmail("valid-student");
		await signUpViaApi(studentEmail, "E2E Valid Student");
		await updateUserInDb(studentEmail, {
			role: "student",
			emailVerified: true,
		});

		await seedTeacherSession(page, "teacher-cookie-holder");
		const signOutRequests = trackSignOutRequests(page);

		await page.goto(`${STUDENT_BASE_URL}/`);
		await expectCleanPortalRedirect(
			page,
			/\/teacher\/dashboard/,
			signOutRequests,
		);

		// Giáo viên chủ động đăng xuất → về unified /login → đăng nhập tài khoản học viên.
		await page.getByRole("button", { name: "Đăng xuất" }).click();
		await expect(page).toHaveURL(new RegExp(`^${LMS_ORIGIN}/login$`));

		const signInForm = page.locator("#panel-signin");
		await signInForm.locator("#signin-email").fill(studentEmail);
		await signInForm.locator("#signin-password").fill(DEFAULT_PASSWORD);
		await signInForm.locator("button[type='submit']").click();

		await expect(page).toHaveURL(
			new RegExp(`^${STUDENT_BASE_URL}/(onboarding)?$`),
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
