import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

/**
 * Regression guard for D1 / D7 (Red-team #8):
 * Signing up as a teacher/user on the web app creates an account with emailVerified=false
 * and does not hit the student portal API (/api/student/*).
 * Assert directly at the DB level that NO student row is created for this email.
 */
test("teacher signup trên web app không bao giờ tự sinh student row trong DB", async ({
	page,
}) => {
	const email = `teacher.guard.${Date.now()}@e2e.test`;

	// 1. Sign up through web UI
	await signUpViaApi(page, { email });

	// 2. Query local.db directly
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");

	try {
		const res = await client.execute({
			sql: "SELECT count(*) AS count FROM student WHERE lower(trim(email)) = lower(?)",
			args: [email],
		});

		const rowCount = Number(res.rows[0]?.count ?? 0);
		expect(rowCount).toBe(0);
	} finally {
		client.close();
	}
});
