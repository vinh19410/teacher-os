import { createClient } from "@libsql/client";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { API_ORIGIN } from "./origins";

/**
 * Account-role separation E2E (plan #260, phase 4). Two core scenarios:
 *
 * Test A — a student-role account rejected AT THE SIGN-IN FORM (phase-2
 * session-create hook): no session row is ever created.
 *
 * Test B — a stale cookie minted as teacher, then the role flips to student
 * in the DB (the shared-cookie-zone case): the teacher API answers
 * 403 ACCOUNT_STUDENT_ROLE and the blocked view mounts; no org/membership
 * appears in the DB.
 */

function openDb() {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

/** Sign up through the real API without any Origin header (curl posture —
 * classify defaults to student, least privilege). Returns { email, token }. */
async function signUpViaApi(
	request: APIRequestContext,
	email: string,
): Promise<string> {
	const res = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: {
			name: "E2E Role Separation",
			email,
			password: "password-8chars",
		},
		headers: { "Content-Type": "application/json" },
	});
	if (res.status() !== 200) {
		throw new Error(`sign-up failed (${res.status()}): ${await res.text()}`);
	}
	const setCookie = res.headersArray().find((h) => h.name === "set-cookie");
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

test("student role bị chặn ngay tại form đăng nhập, không tạo session row", async ({
	page,
	request,
}) => {
	const email = `role-reject.${Date.now()}@e2e.test`;
	await signUpViaApi(request, email);
	// Belt-and-suspenders: whatever the API classified, this account is a
	// student for the scenario below.
	await forceRole(email, "student");

	// Sign in through the real UI.
	await page.goto("/login");
	// The fresh page defaults to "Create account" — switch to sign-in.
	await page.getByRole("button", { name: "Sign in" }).click();
	await page.locator("#si-email").fill(email);
	await page.locator("#si-password").fill("password-8chars");
	await page
		.locator("form")
		.filter({ has: page.locator("#si-email") })
		.getByRole("button", { name: "Sign in" })
		.click();

	// The rejection toast carries the Vietnamese message verbatim; the user
	// never leaves /login.
	await expect(
		page.getByText(
			"Tài khoản học viên không thể đăng nhập vào trang giáo viên",
		),
	).toBeVisible();
	await expect(page).toHaveURL(/\/login/);

	// The rejected sign-in must not mint a session row: the only session for
	// this user is the one the API sign-up auto-created.
	const client = openDb();
	try {
		const res = await client.execute({
			sql: "SELECT count(*) AS n FROM session WHERE user_id IN (SELECT id FROM user WHERE lower(email) = lower(?))",
			args: [email],
		});
		expect(Number(res.rows[0]?.n ?? 0)).toBe(1);
	} finally {
		client.close();
	}
});

test("stale teacher cookie sau khi role flip thành student → blocked view, không sinh org/membership", async ({
	page,
	request,
}) => {
	const email = `stale-cookie.${Date.now()}@e2e.test`;
	const token = await signUpViaApi(request, email);
	// The session cookie is already minted and valid; flipping the role
	// simulates the post-signup role change the gates must still honor.
	await forceRole(email, "student");

	const client = openDb();
	try {
		const orgsBefore = await client.execute(
			"SELECT count(*) AS n FROM organization",
		);
		const membershipsBefore = await client.execute(
			"SELECT count(*) AS n FROM membership",
		);

		// Reuse the stale cookie in a fresh browser context.
		const context = page.context();
		await context.addCookies([
			{
				name: "better-auth.session_token",
				value: token,
				domain: "localhost",
				path: "/",
			},
		]);
		await page.goto("/dashboard");

		// The blocked view replaces the workspace.
		await expect(page.getByText("Đây là tài khoản học viên")).toBeVisible();
		await expect(page.getByRole("button", { name: "Đăng xuất" })).toBeVisible();

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
