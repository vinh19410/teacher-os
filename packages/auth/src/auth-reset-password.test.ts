import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const TEACHER_ORIGIN = "http://localhost:3000";
const STUDENT_ORIGIN = "http://localhost:3001";
const RESET_SUBJECT = "Đặt lại mật khẩu";

interface SetupOptions {
	corsOrigin?: string | string[];
	studentOrigins?: string[];
	runInBackground?: (promise: Promise<unknown>) => void;
}

async function setupTestAuth(mailer: Mailer, options: SetupOptions = {}) {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

	const auth = createAuth({
		db: libsql,
		corsOrigin: options.corsOrigin ?? TEACHER_ORIGIN,
		studentOrigins: options.studentOrigins ?? [],
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: TEACHER_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer,
		...(options.runInBackground
			? { runInBackground: options.runInBackground }
			: {}),
	});
	return { auth, libsql };
}

function jsonPost(
	path: string,
	origin: string,
	body: unknown,
	cookie?: string,
) {
	return new Request(`${TEACHER_ORIGIN}/api/auth${path}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin,
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}

async function signUp(
	auth: Awaited<ReturnType<typeof setupTestAuth>>["auth"],
	email: string,
	origin = TEACHER_ORIGIN,
) {
	const res = await auth.handler(
		jsonPost("/sign-up/email", origin, {
			name: "Reset User",
			email,
			password: "password123",
		}),
	);
	expect(res.status).toBe(200);
}

async function signIn(
	auth: Awaited<ReturnType<typeof setupTestAuth>>["auth"],
	email: string,
	password: string,
	origin = TEACHER_ORIGIN,
) {
	return auth.handler(jsonPost("/sign-in/email", origin, { email, password }));
}

function sessionCookie(res: Response): string {
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

function requestReset(
	auth: Awaited<ReturnType<typeof setupTestAuth>>["auth"],
	email: string,
	origin = TEACHER_ORIGIN,
) {
	return auth.handler(
		jsonPost("/request-password-reset", origin, {
			email,
			redirectTo: `${origin}/reset-password`,
		}),
	);
}

function resetCalls(send: ReturnType<typeof vi.fn>) {
	return send.mock.calls
		.map((c) => c[0] as { to: string; subject: string; text: string })
		.filter((m) => m.subject.includes(RESET_SUBJECT));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("auth password reset wiring", () => {
	test("request-password-reset emails a link and the token sets a new password", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { auth } = await setupTestAuth({ send });
		const email = "reset-happy@example.com";
		await signUp(auth, email);

		const oldSession = await signIn(auth, email, "password123");
		expect(oldSession.status).toBe(200);
		const oldCookie = sessionCookie(oldSession);

		const res = await requestReset(auth, email);
		expect(res.status).toBe(200);

		const mails = resetCalls(send);
		expect(mails).toHaveLength(1);
		expect(mails[0].to).toBe(email);
		const mailedUrl = mails[0].text.match(/^https?:\/\/\S+$/m)?.[0];
		expect(mailedUrl).toBeTruthy();

		const callback = await auth.handler(new Request(mailedUrl as string));
		expect(callback.status).toBe(302);
		const location = new URL(callback.headers.get("location") as string);
		expect(location.origin + location.pathname).toBe(
			`${TEACHER_ORIGIN}/reset-password`,
		);
		const token = location.searchParams.get("token");
		expect(token).toBeTruthy();

		const reset = await auth.handler(
			jsonPost("/reset-password", TEACHER_ORIGIN, {
				newPassword: "newpassword123",
				token,
			}),
		);
		expect(reset.status).toBe(200);

		expect((await signIn(auth, email, "newpassword123")).status).toBe(200);
		expect((await signIn(auth, email, "password123")).status).not.toBe(200);

		const stale = await auth.handler(
			new Request(`${TEACHER_ORIGIN}/api/auth/get-session`, {
				headers: { cookie: oldCookie, origin: TEACHER_ORIGIN },
			}),
		);
		expect(await stale.json()).toBeNull();
	});

	test("unknown email does not send mail and matches the known-email response", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { auth } = await setupTestAuth({ send });
		const email = "reset-known@example.com";
		await signUp(auth, email);

		const known = await requestReset(auth, email);
		const unknown = await requestReset(auth, "missing-user@example.com");

		expect(unknown.status).toBe(known.status);
		expect(unknown.status).toBe(200);
		expect(await unknown.json()).toEqual(await known.json());
		expect(
			resetCalls(send).filter((m) => m.to === "missing-user@example.com"),
		).toHaveLength(0);
	});

	test("mailer rejection is logged and does not change the response", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const send = vi
			.fn()
			.mockResolvedValueOnce(undefined)
			.mockRejectedValueOnce(new Error("resend send failed: 500 boom"));
		const { auth } = await setupTestAuth({ send });
		const email = "reset-mailfail@example.com";
		await signUp(auth, email);

		const failed = await requestReset(auth, email);
		const unknown = await requestReset(auth, "nobody-here@example.com");

		expect(failed.status).toBe(200);
		expect(await failed.json()).toEqual(await unknown.json());
		expect(send).toHaveBeenCalledTimes(2);

		const logged = errorSpy.mock.calls.find((call) =>
			String(call[0]).includes("reset-password email failed"),
		);
		expect(logged).toBeTruthy();
		const serialized = JSON.stringify(errorSpy.mock.calls);
		expect(serialized).not.toContain("reset-password/");
		expect(serialized).not.toContain("token");
		expect(serialized).not.toContain(email);
	});

	test("request returns before the mailer finishes when runInBackground is set", async () => {
		const pending: Promise<unknown>[] = [];
		const send = vi.fn(async (input: { subject: string }) => {
			if (input.subject.includes(RESET_SUBJECT)) {
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		});
		const { auth } = await setupTestAuth(
			{ send },
			{ runInBackground: (promise) => void pending.push(promise) },
		);
		const email = "reset-background@example.com";
		await signUp(auth, email);

		const start = performance.now();
		const res = await requestReset(auth, email);
		const elapsed = performance.now() - start;

		expect(res.status).toBe(200);
		expect(elapsed).toBeLessThan(150);
		await Promise.all(pending);
		expect(
			resetCalls(send as unknown as ReturnType<typeof vi.fn>),
		).toHaveLength(1);
	});

	test("reset link requested for another app's origin sends no mail", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { auth } = await setupTestAuth(
			{ send },
			{
				corsOrigin: [TEACHER_ORIGIN, STUDENT_ORIGIN],
				studentOrigins: [STUDENT_ORIGIN],
			},
		);
		const email = "reset-teacher-role@example.com";
		await signUp(auth, email, TEACHER_ORIGIN);

		const res = await requestReset(auth, email, STUDENT_ORIGIN);

		expect(res.status).toBe(200);
		expect(resetCalls(send)).toHaveLength(0);

		const sameApp = await requestReset(auth, email, TEACHER_ORIGIN);
		expect(sameApp.status).toBe(200);
		expect(resetCalls(send)).toHaveLength(1);
	});

	test("reset creates a password credential for an account that had none", async () => {
		const send = vi.fn().mockResolvedValue(undefined);
		const { auth, libsql } = await setupTestAuth({ send });
		const email = "reset-google-only@example.com";
		await signUp(auth, email);

		const [user] = await libsql
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.email, email));
		await libsql
			.delete(schema.account)
			.where(
				and(
					eq(schema.account.userId, user.id),
					eq(schema.account.providerId, "credential"),
				),
			);

		await requestReset(auth, email);
		const mails = resetCalls(send);
		expect(mails).toHaveLength(1);
		const mailedUrl = mails[0].text.match(/^https?:\/\/\S+$/m)?.[0] as string;
		const callback = await auth.handler(new Request(mailedUrl));
		const token = new URL(
			callback.headers.get("location") as string,
		).searchParams.get("token");

		const reset = await auth.handler(
			jsonPost("/reset-password", TEACHER_ORIGIN, {
				newPassword: "newpassword123",
				token,
			}),
		);
		expect(reset.status).toBe(200);
		expect((await signIn(auth, email, "newpassword123")).status).toBe(200);
	});
});
