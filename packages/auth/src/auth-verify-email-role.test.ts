import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, type Mock, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url),
);

const API_ORIGIN = "http://api.test";
const WEB_ORIGIN = "http://web.test";
const STUDENT_ORIGIN = "http://student.test";

interface Ctx {
	auth: Auth;
	send: Mock;
}

async function setup(): Promise<Ctx> {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	const send = vi.fn().mockResolvedValue(undefined);
	const auth = createAuth({
		db: libsql,
		corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN],
		studentOrigins: [STUDENT_ORIGIN],
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send } satisfies Mailer,
	});
	return { auth, send };
}

/** Đăng ký từ `appOrigin`, trả về verify link (token) trong mail. */
async function signUpAndGetToken(
	appOrigin: string,
	email: string,
): Promise<string> {
	const { auth, send } = ctx;
	const res = await auth.handler(
		new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: appOrigin },
			body: JSON.stringify({
				name: "User",
				email,
				password: "password123",
				callbackURL: `${appOrigin}/verify-email?verified=ok`,
			}),
		}),
	);
	expect(res.status).toBe(200);
	const text: string = send.mock.calls.at(-1)?.[0].text;
	const token = text.match(/[?&]token=([^&\s]+)/)?.[1];
	expect(token).toBeTruthy();
	return token as string;
}

/** Bấm link trong mail: GET navigation, không Origin, không cookie. */
function clickLink(token: string, callbackURL: string) {
	return ctx.auth.handler(
		new Request(
			`${API_ORIGIN}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
		),
	);
}

let ctx: Ctx;

describe("verify-email link in a session-less browser (#299)", () => {
	test("teacher: auto sign-in on the web app instead of 403 JSON", async () => {
		ctx = await setup();
		const token = await signUpAndGetToken(WEB_ORIGIN, "t299@example.com");
		const callback = `${WEB_ORIGIN}/verify-email?verified=ok`;

		const res = await clickLink(token, callback);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(callback);
		expect(res.headers.get("set-cookie")).toContain("session_token=");
	});

	test("student: auto sign-in on the portal", async () => {
		ctx = await setup();
		const token = await signUpAndGetToken(STUDENT_ORIGIN, "s299@example.com");
		const callback = `${STUDENT_ORIGIN}/verify-email?verified=ok`;

		const res = await clickLink(token, callback);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(callback);
		expect(res.headers.get("set-cookie")).toContain("session_token=");
	});

	test("teacher link pointed at the portal: verified, no session, friendly redirect", async () => {
		ctx = await setup();
		const token = await signUpAndGetToken(WEB_ORIGIN, "x299@example.com");
		const callback = `${STUDENT_ORIGIN}/verify-email?verified=ok`;

		const res = await clickLink(token, callback);

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe(`${callback}&error=ROLE_MISMATCH`);
		expect(res.headers.get("set-cookie") ?? "").not.toContain("session_token=");
	});
});
