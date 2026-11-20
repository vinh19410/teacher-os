import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, request as playwrightRequest, test } from "@playwright/test";
import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	adminSignInViaUi,
	ensureAdminAccount,
} from "./helpers";
import {
	ADMIN_BASE_URL,
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
} from "./origins";

/**
 * Admin auth E2E under unified LMS origin:
 * - Admin (role + verified + ∈ ADMIN_EMAILS) đăng nhập ở `/login`, tự chuyển
 *   sang `/admin/library/tests` và qua guard `GET /api/admin/me` vào được shell.
 * - Cookie teacher/student gọi `GET /api/admin/me` vẫn bị từ chối 403
 *   `ACCOUNT_NOT_ADMIN`.
 * - Teacher/student mở `/admin/library/tests` tự động chuyển về cổng của mình
 *   (`/teacher/dashboard`, `/student`) mà không gọi `signOut`.
 * - Cookie admin gọi `GET /api/kernel` bị chặn 403 `ACCOUNT_ADMIN_ROLE` (không
 *   bao giờ bootstrap org) và gọi `GET /api/student/me` bị chặn 403
 *   `ACCOUNT_TEACHER_ROLE`.
 * - Đăng ký công khai ở `/login?tab=signup` với email ngoài `ADMIN_EMAILS` chỉ
 *   được gán role `student` (least privilege) và bị chặn 403 trên `/api/admin/me`.
 */

const LOCAL_DB_PATH = fileURLToPath(
	new URL("../local.db", import.meta.url).href,
);

async function openDb() {
	const client = createClient({
		url: `file:${LOCAL_DB_PATH}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

async function createRoleCookie(opts: {
	name: string;
	email: string;
	role: "teacher" | "student";
}): Promise<string> {
	const apiCtx = await playwrightRequest.newContext();
	try {
		const signUp = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
			data: {
				name: opts.name,
				email: opts.email,
				password: ADMIN_PASSWORD,
			},
			headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN },
		});
		expect(signUp.status()).toBe(200);
		const cookie = signUp
			.headersArray()
			.find(
				(h) =>
					h.name.toLowerCase() === "set-cookie" &&
					h.value.includes("better-auth.session_token="),
			)
			?.value.split(";")[0];
		expect(cookie).toContain("better-auth.session_token=");
		const db = await openDb();
		try {
			await db.execute({
				sql: "UPDATE user SET role = ?, email_verified = 1 WHERE lower(email) = lower(?)",
				args: [opts.role, opts.email],
			});
		} finally {
			db.close();
		}
		return cookie as string;
	} finally {
		await apiCtx.dispose();
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

test("cookie teacher và student bị guard admin chặn → 403 ACCOUNT_NOT_ADMIN", async ({
	request,
}) => {
	await ensureAdminAccount(request);
	const teacherCookie = await createRoleCookie({
		name: "E2E Teacher",
		email: `e2e-teacher-gate-${Date.now()}@test.local`,
		role: "teacher",
	});
	const studentCookie = await createRoleCookie({
		name: "E2E Student",
		email: `e2e-student-gate-${Date.now()}@test.local`,
		role: "student",
	});

	for (const cookie of [teacherCookie, studentCookie]) {
		const me = await request.get(`${API_ORIGIN}/api/admin/me`, {
			headers: { Origin: LMS_ORIGIN, Cookie: cookie },
		});
		expect(me.status()).toBe(403);
		const body: unknown = await me.json();
		if (
			!(typeof body === "object" && body !== null && "code" in body) ||
			body.code !== "ACCOUNT_NOT_ADMIN"
		) {
			throw new Error(`admin/me 403 body sai shape: ${JSON.stringify(body)}`);
		}
	}
});

test("teacher vào /admin/library/tests tự động chuyển sang /teacher/dashboard không gọi sign-out", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	const teacherEmail = `e2e-teacher-admin-redirect-${Date.now()}@test.local`;
	await createRoleCookie({
		name: "E2E Teacher",
		email: teacherEmail,
		role: "teacher",
	});

	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#signin-email").fill(teacherEmail);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });

	const signOutRequests: string[] = [];
	page.on("request", (req) => {
		if (req.url().includes("/api/auth/sign-out")) {
			signOutRequests.push(`${req.method()} ${req.url()}`);
		}
	});

	await page.goto(`${ADMIN_BASE_URL}/library/tests`);
	await expect(page).toHaveURL(/\/teacher\/dashboard/, { timeout: 30_000 });
	expect(signOutRequests).toEqual([]);
});

test("student vào /admin/library/tests tự động chuyển sang /student không gọi sign-out", async ({
	page,
	request,
}) => {
	await ensureAdminAccount(request);
	const studentEmail = `e2e-student-admin-redirect-${Date.now()}@test.local`;
	await createRoleCookie({
		name: "E2E Student",
		email: studentEmail,
		role: "student",
	});

	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
		timeout: 30_000,
	});

	const signOutRequests: string[] = [];
	page.on("request", (req) => {
		if (req.url().includes("/api/auth/sign-out")) {
			signOutRequests.push(`${req.method()} ${req.url()}`);
		}
	});

	await page.goto(`${ADMIN_BASE_URL}/library/tests`);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
		timeout: 30_000,
	});
	expect(signOutRequests).toEqual([]);
});

test("cookie admin bị /api/kernel và /api/student/me chặn 403, không bao giờ bootstrap org", async ({
	request,
}) => {
	await ensureAdminAccount(request);

	const apiCtx = await playwrightRequest.newContext();
	const db = await openDb();
	try {
		const orgsBefore = await db.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsBefore = await db.execute(
			"SELECT count(*) AS n FROM membership",
		);

		const signIn = await apiCtx.post(`${API_ORIGIN}/api/auth/sign-in/email`, {
			data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
			headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN },
		});
		expect(signIn.status()).toBe(200);
		const cookie = signIn
			.headersArray()
			.find(
				(h) =>
					h.name.toLowerCase() === "set-cookie" &&
					h.value.includes("better-auth.session_token="),
			)
			?.value.split(";")[0];
		expect(cookie).toContain("better-auth.session_token=");

		const kernelRes = await apiCtx.get(`${API_ORIGIN}/api/kernel`, {
			headers: { Origin: LMS_ORIGIN, Cookie: cookie as string },
		});
		expect(kernelRes.status()).toBe(403);
		expect(((await kernelRes.json()) as { code?: string }).code).toBe(
			"ACCOUNT_ADMIN_ROLE",
		);

		const studentRes = await apiCtx.get(`${API_ORIGIN}/api/student/me`, {
			headers: { Origin: LMS_ORIGIN, Cookie: cookie as string },
		});
		expect(studentRes.status()).toBe(403);
		expect(((await studentRes.json()) as { code?: string }).code).toBe(
			"ACCOUNT_TEACHER_ROLE",
		);

		const orgsAfter = await db.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsAfter = await db.execute(
			"SELECT count(*) AS n FROM membership",
		);
		expect(Number(orgsAfter.rows[0]?.n)).toBe(Number(orgsBefore.rows[0]?.n));
		expect(Number(membershipsAfter.rows[0]?.n)).toBe(
			Number(membershipsBefore.rows[0]?.n),
		);
	} finally {
		db.close();
		await apiCtx.dispose();
	}
});

test("đăng ký công khai tại /login với email ngoài ADMIN_EMAILS chỉ nhận role student và bị chặn ở /api/admin/me", async ({
	page,
}) => {
	const strangerEmail = `stranger-${Date.now()}@test.local`;
	await page.goto(`${LMS_ORIGIN}/login?tab=signup`);
	await page.locator("#signup-name").fill("Stranger");
	await page.locator("#signup-email").fill(strangerEmail);
	await page.locator("#signup-password").fill(ADMIN_PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();

	// Email lạ chỉ được gán student và chuyển sang /student (không bao giờ thành admin).
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
		timeout: 30_000,
	});
	const meRes = await page.request.get(`${API_ORIGIN}/api/admin/me`, {
		headers: { Origin: LMS_ORIGIN },
	});
	expect(meRes.status()).toBe(403);
	expect(((await meRes.json()) as { code?: string }).code).toBe(
		"ACCOUNT_NOT_ADMIN",
	);
});
