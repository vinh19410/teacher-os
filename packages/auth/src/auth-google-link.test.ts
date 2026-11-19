import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const API_ORIGIN = "http://api.test";
const WEB_ORIGIN = "http://web.test";
const STUDENT_ORIGIN = "http://student.test";

const MEET_SCOPES = [
	"https://www.googleapis.com/auth/calendar.events",
	"https://www.googleapis.com/auth/meetings.space.created",
	"https://www.googleapis.com/auth/meetings.space.readonly",
	"https://www.googleapis.com/auth/drive",
];

function extractCookies(headers: Headers, jar: Map<string, string>) {
	for (const raw of headers.getSetCookie()) {
		const [kv] = raw.split(";");
		if (!kv) continue;
		const eqIdx = kv.indexOf("=");
		if (eqIdx <= 0) continue;
		const name = kv.slice(0, eqIdx).trim();
		const value = kv.slice(eqIdx + 1).trim();
		jar.set(name, value);
	}
}

function cookieHeader(jar: Map<string, string>): string {
	return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function signIdTokenPayload(sub: string, email: string): string {
	const header = Buffer.from(
		JSON.stringify({ alg: "none", typ: "JWT" }),
	).toString("base64url");
	const payload = Buffer.from(
		JSON.stringify({
			sub,
			email,
			email_verified: true,
			name: "Cô Lan",
			iss: "https://accounts.google.com",
			aud: "google-client-id",
			exp: Math.floor(Date.now() / 1000) + 3600,
		}),
	).toString("base64url");
	return `${header}.${payload}.`;
}

describe("Google linkSocial & re-consent scope/refresh_token upgrade", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	test("updates existing linked google account with new scopes and refreshToken via linkSocial", async () => {
		const raw = createClient({ url: "file::memory:" });
		const libsql = drizzle(raw, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		const send = vi.fn().mockResolvedValue(undefined);
		const auth = createAuth({
			db: libsql,
			corsOrigin: [WEB_ORIGIN, STUDENT_ORIGIN],
			studentOrigins: [STUDENT_ORIGIN],
			secret: "test-secret-0123456789abcdef0123456789abcdef",
			baseURL: API_ORIGIN,
			googleClientId: "google-client-id",
			googleClientSecret: "google-client-secret",
			mailer: { send } satisfies Mailer,
		});

		const jar = new Map<string, string>();
		const signUpRes = await auth.handler(
			new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: WEB_ORIGIN },
				body: JSON.stringify({
					name: "Cô Lan",
					email: "teacher@example.com",
					password: "password-8chars",
				}),
			}),
		);
		expect(signUpRes.status).toBe(200);
		extractCookies(signUpRes.headers, jar);

		const signInRes = await auth.handler(
			new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
				method: "POST",
				headers: { "content-type": "application/json", origin: WEB_ORIGIN },
				body: JSON.stringify({
					email: "teacher@example.com",
					password: "password-8chars",
				}),
			}),
		);
		expect(signInRes.status).toBe(200);
		extractCookies(signInRes.headers, jar);

		const [teacherUser] = await libsql
			.select({ id: schema.user.id })
			.from(schema.user)
			.where(eq(schema.user.email, "teacher@example.com"));
		expect(teacherUser).toBeTruthy();
		if (!teacherUser) throw new Error("missing teacherUser");

		// Pre-existing basic Google account without Meet scopes or refresh token
		await libsql.insert(schema.account).values({
			id: "acc-google-1",
			accountId: "google-sub-123",
			providerId: "google",
			userId: teacherUser.id,
			scope: "openid email profile",
			accessToken: "ya29.old",
			refreshToken: null,
		});

		const linkRes = await auth.handler(
			new Request(`${API_ORIGIN}/api/auth/link-social`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: WEB_ORIGIN,
					cookie: cookieHeader(jar),
				},
				body: JSON.stringify({
					provider: "google",
					callbackURL: `${WEB_ORIGIN}/profile`,
					errorCallbackURL: `${WEB_ORIGIN}/profile`,
					scopes: MEET_SCOPES,
				}),
			}),
		);
		expect(linkRes.status).toBe(200);
		extractCookies(linkRes.headers, jar);
		const linkBody = (await linkRes.json()) as { url: string };
		const authUrl = new URL(linkBody.url);
		expect(authUrl.searchParams.get("access_type")).toBe("offline");
		expect(authUrl.searchParams.get("prompt")).toBe("select_account consent");
		for (const scope of MEET_SCOPES) {
			expect(authUrl.searchParams.get("scope")).toContain(scope);
		}
		const state = authUrl.searchParams.get("state");
		expect(state).toBeTruthy();
		if (!state) throw new Error("missing state");

		// Simulate Google token & userinfo responses during OAuth callback
		globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("oauth2.googleapis.com/token")) {
				return new Response(
					JSON.stringify({
						access_token: "ya29.new-meet",
						refresh_token: "1//new-refresh-token",
						expires_in: 3600,
						token_type: "Bearer",
						scope: ["openid", "email", "profile", ...MEET_SCOPES].join(" "),
						id_token: signIdTokenPayload(
							"google-sub-123",
							"teacher@example.com",
						),
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			if (url.includes("googleapis.com")) {
				return new Response(
					JSON.stringify({
						sub: "google-sub-123",
						id: "google-sub-123",
						email: "teacher@example.com",
						verified_email: true,
						email_verified: true,
						name: "Cô Lan",
					}),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}
			return originalFetch(input);
		}) as typeof fetch;

		const cbRes = await auth.handler(
			new Request(
				`${API_ORIGIN}/api/auth/callback/google?code=auth-code-1&state=${encodeURIComponent(state)}`,
				{
					method: "GET",
					headers: {
						cookie: cookieHeader(jar),
					},
				},
			),
		);
		expect(cbRes.status).toBe(302);
		const location = cbRes.headers.get("location") ?? "";
		expect(location).toBe(`${WEB_ORIGIN}/profile`);

		const [updatedAcc] = await libsql
			.select()
			.from(schema.account)
			.where(
				and(
					eq(schema.account.userId, teacherUser.id),
					eq(schema.account.providerId, "google"),
				),
			);
		expect(updatedAcc?.refreshToken).toBe("1//new-refresh-token");
		expect(updatedAcc?.accessToken).toBe("ya29.new-meet");
		for (const scope of MEET_SCOPES) {
			expect(updatedAcc?.scope).toContain(scope);
		}
	});
});
