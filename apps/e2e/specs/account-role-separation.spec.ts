import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { type APIRequestContext, expect, test } from "@playwright/test";
import {
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
	TEACHER_BASE_URL,
} from "./origins";

/**
 * Account-role separation E2E under unified LMS origin:
 *
 * Test 1 — a student signing in at unified `/login` auto-redirects to `/student`
 * (never `/teacher`), and calling teacher `GET /api/kernel` with that cookie
 * returns 403 `ACCOUNT_STUDENT_ROLE` without bootstrapping an org/membership.
 *
 * Test 2 — a student cookie navigating directly to `/teacher/dashboard`
 * auto-redirects to `/student` without calling `signOut` or creating an org.
 *
 * Test 3 — a stale teacher session whose DB role flips to `student` after
 * bypassing `beforeLoad` receives 403 `ACCOUNT_STUDENT_ROLE` from `/api/kernel`,
 * mounts the blocked view, and creates no org/membership in the DB.
 */

const LOCAL_DB_PATH = fileURLToPath(
	new URL("../local.db", import.meta.url).href,
);

function openDb() {
	const client = createClient({
		url: `file:${LOCAL_DB_PATH}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

/** Sign up through the real API on the unified LMS origin (non-allowlisted email
 * classifies as `student`, least privilege). Returns the session cookie token. */
async function signUpStudentViaApi(
	request: APIRequestContext,
	email: string,
): Promise<string> {
	const res = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: {
			name: "E2E Role Separation",
			email,
			password: "password-8chars",
		},
		headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN },
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
	if (!token) throw new Error("no session cookie on sign-up response");
	return token;
}

async function forceRole(email: string, role: string): Promise<void> {
	const client = openDb();
	try {
		await client.execute({
			sql: "UPDATE user SET role = ? WHERE lower(email) = lower(?)",
			args: [role, email],
		});
	} finally {
		client.close();
	}
}

test("student đăng nhập tại /login tự chuyển sang /student và /api/kernel trả 403 ACCOUNT_STUDENT_ROLE", async ({
	page,
	request,
}) => {
	const email = `role-sep-login.${Date.now()}@e2e.test`;
	await signUpStudentViaApi(request, email);
	await forceRole(email, "student");

	const client = openDb();
	try {
		const orgsBefore = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsBefore = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);

		await page.goto(`${LMS_ORIGIN}/login`);
		await page.locator("#signin-email").fill(email);
		await page.locator("#signin-password").fill("password-8chars");
		await page.locator("#panel-signin button[type='submit']").click();

		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
			timeout: 30_000,
		});

		// Teacher API guard must still reject the student session with 403.
		const kernelRes = await page.request.get(`${API_ORIGIN}/api/kernel`, {
			headers: { Origin: LMS_ORIGIN },
		});
		expect(kernelRes.status()).toBe(403);
		const body = (await kernelRes.json()) as { code?: string };
		expect(body.code).toBe("ACCOUNT_STUDENT_ROLE");

		const orgsAfter = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsAfter = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);
		expect(Number(orgsAfter.rows[0]?.n)).toBe(Number(orgsBefore.rows[0]?.n));
		expect(Number(membershipsAfter.rows[0]?.n)).toBe(
			Number(membershipsBefore.rows[0]?.n),
		);
	} finally {
		client.close();
	}
});

test("student cookie vào /teacher/dashboard tự chuyển sang /student không gọi signOut và không sinh org/membership", async ({
	page,
	request,
}) => {
	const email = `role-sep-prefix.${Date.now()}@e2e.test`;
	const token = await signUpStudentViaApi(request, email);
	await forceRole(email, "student");

	const signOutRequests: string[] = [];
	page.on("request", (req) => {
		if (req.url().includes("/api/auth/sign-out")) {
			signOutRequests.push(`${req.method()} ${req.url()}`);
		}
	});

	const client = openDb();
	try {
		const orgsBefore = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsBefore = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);

		await page.context().addCookies([
			{
				name: "better-auth.session_token",
				value: token,
				domain: "localhost",
				path: "/",
			},
		]);
		await page.goto(`${TEACHER_BASE_URL}/dashboard`);

		await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}`), {
			timeout: 30_000,
		});
		expect(signOutRequests).toEqual([]);

		const orgsAfter = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsAfter = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);
		expect(Number(orgsAfter.rows[0]?.n)).toBe(Number(orgsBefore.rows[0]?.n));
		expect(Number(membershipsAfter.rows[0]?.n)).toBe(
			Number(membershipsBefore.rows[0]?.n),
		);
	} finally {
		client.close();
	}
});

test("stale teacher cookie sau khi role flip thành student → fallback 403 blocked view, không sinh org/membership", async ({
	page,
	request,
}) => {
	const email = `stale-cookie.${Date.now()}@e2e.test`;
	const token = await signUpStudentViaApi(request, email);
	// DB role is now student, simulating a post-login role change that /api/kernel must reject.
	await forceRole(email, "student");

	const client = openDb();
	try {
		const orgsBefore = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsBefore = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);

		await page.context().addCookies([
			{
				name: "better-auth.session_token",
				value: token,
				domain: "localhost",
				path: "/",
			},
		]);

		// Giả lập session cache cũ báo role="teacher" ở lần GET get-session đầu tiên
		// để vượt qua beforeLoad và kiểm chứng tầng phòng thủ API 403 + AccountBlockedView.
		let intercepted = false;
		await page.route("**/api/auth/get-session", async (route) => {
			if (intercepted || route.request().method() !== "GET") {
				await route.continue();
				return;
			}
			intercepted = true;
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
					user: { ...payload.user, role: "teacher" },
				},
			});
			await page.unroute("**/api/auth/get-session");
		});

		await page.goto(`${TEACHER_BASE_URL}/dashboard`);

		// The blocked view replaces the workspace.
		await expect(page.getByText("Đây là tài khoản học viên")).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Đăng xuất" }).first(),
		).toBeVisible();
		expect(intercepted).toBe(true);

		// The DB must show no org/membership growth for this user.
		const orgsAfter = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsAfter = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);
		expect(Number(orgsAfter.rows[0]?.n)).toBe(Number(orgsBefore.rows[0]?.n));
		expect(Number(membershipsAfter.rows[0]?.n)).toBe(
			Number(membershipsBefore.rows[0]?.n),
		);
	} finally {
		client.close();
	}
});
