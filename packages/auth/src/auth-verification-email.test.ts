import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, test, vi } from "vitest";
import { createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url),
);

const TEST_ORIGIN = "http://localhost:3000";

async function setupTestAuth(mailer: Mailer) {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

	return createAuth({
		db: libsql,
		corsOrigin: TEST_ORIGIN,
		studentOrigins: [],
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: TEST_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer,
	});
}

describe("auth email verification wiring", () => {
	test("sign-up triggers mailer.send exactly once with user email and verification subject", async () => {
		const sendSpy = vi.fn().mockResolvedValue(undefined);
		const mailer: Mailer = { send: sendSpy };
		const auth = await setupTestAuth(mailer);

		const email = "student-test-1@example.com";
		const res = await auth.handler(
			new Request(`${TEST_ORIGIN}/api/auth/sign-up/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: TEST_ORIGIN,
				},
				body: JSON.stringify({
					name: "Student One",
					email,
					password: "password123",
				}),
			}),
		);

		expect(res.status).toBe(200);
		expect(sendSpy).toHaveBeenCalledTimes(1);
		const callArg = sendSpy.mock.calls[0][0];
		expect(callArg.to).toBe(email);
		expect(callArg.subject).toContain("Xác thực");
		expect(callArg.html).toContain("Xác thực email");
	});

	test("sign-up fails open when mailer.send rejects", async () => {
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const sendSpy = vi
			.fn()
			.mockRejectedValue(new Error("Mailer network timeout"));
		const mailer: Mailer = { send: sendSpy };
		const auth = await setupTestAuth(mailer);

		const email = "student-failopen@example.com";
		const res = await auth.handler(
			new Request(`${TEST_ORIGIN}/api/auth/sign-up/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: TEST_ORIGIN,
				},
				body: JSON.stringify({
					name: "Student Failopen",
					email,
					password: "password123",
				}),
			}),
		);

		// D3: Fail-open on sign-up — sign-up still succeeds
		expect(res.status).toBe(200);
		expect(sendSpy).toHaveBeenCalledTimes(1);
		expect(consoleErrorSpy).toHaveBeenCalled();

		consoleErrorSpy.mockRestore();
	});

	test("resend verification email endpoint propagates error when mailer.send rejects", async () => {
		const sendSpy = vi
			.fn()
			.mockResolvedValueOnce(undefined) // sign-up succeeds
			.mockRejectedValueOnce(new Error("Resend rate limit exceeded")); // resend fails
		const mailer: Mailer = { send: sendSpy };
		const auth = await setupTestAuth(mailer);

		const email = "student-resend-fail@example.com";
		// 1. Sign up user
		const signUpRes = await auth.handler(
			new Request(`${TEST_ORIGIN}/api/auth/sign-up/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: TEST_ORIGIN,
				},
				body: JSON.stringify({
					name: "Student Resend",
					email,
					password: "password123",
				}),
			}),
		);
		expect(signUpRes.status).toBe(200);
		expect(sendSpy).toHaveBeenCalledTimes(1);

		// 2. Call send-verification-email on the same auth instance
		const res = await auth.handler(
			new Request(`${TEST_ORIGIN}/api/auth/send-verification-email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: TEST_ORIGIN,
				},
				body: JSON.stringify({
					email,
					callbackURL: `${TEST_ORIGIN}/login`,
				}),
			}),
		);

		// Must propagate error — not swallow (so client UI can display error)
		expect(res.status).not.toBe(200);
		expect(sendSpy).toHaveBeenCalledTimes(2);
	});
});
