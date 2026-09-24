/**
 * Cookie namespace isolation (issue #125 round 2).
 *
 * Staging's cookie zone (Domain=.staging.teacheros.io.vn) nests inside prod's
 * (Domain=.teacheros.io.vn). Browsers send BOTH same-name cookies to the API
 * and better-auth parses first-wins per name, so a foreign prod-era token
 * shadowed staging sessions (get-session → 200 null in seasoned browsers,
 * while curl smokes with empty jars passed). The fix gives staging its own
 * cookie namespace via `advanced.cookiePrefix`; server-side reads look up
 * exact names only, so foreign cookies become structurally unread.
 *
 * These tests boot REAL better-auth over in-memory libsql (same harness as
 * auth-roundtrip.test.ts). NOTE on the https baseURL: better-auth derives the
 * `__Secure-` name prefix from the baseURL scheme (vendored dist:
 * cookies/index.mjs, `secureCookiePrefix` = baseURL starts with "https://"),
 * so the staging-shaped cookie names asserted here only exist on an https
 * boot — plain node does not validate the scheme, so we boot https on
 * localhost to exercise the exact production shape.
 */
import { createClient } from "@libsql/client";
import { createAuth } from "@teacher-os/auth";
import { createLogMailer } from "@teacher-os/auth/mail/mailer";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const STAGING_ORIGIN = "https://app.staging.teacheros.io.vn";

interface BootOptions {
	cookiePrefix?: string;
}

async function bootAuth({ cookiePrefix }: BootOptions = {}) {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
	return createAuth({
		db: libsql,
		corsOrigin: STAGING_ORIGIN,
		studentOrigins: [],
		secret: "test-secret-0123456789abcdef0123456789abcdef",
		baseURL: "https://localhost:8000",
		...(cookiePrefix ? { cookiePrefix } : {}),
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: createLogMailer(),
	});
}

async function signUp(auth: ReturnType<typeof createAuth>, email: string) {
	return auth.handler(
		new Request("https://localhost:8000/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: STAGING_ORIGIN,
			},
			body: JSON.stringify({
				name: "Cookie Namespace Test",
				email,
				password: "password-8chars",
			}),
		}),
	);
}

describe("stage-scoped auth cookie namespace", () => {
	let prefixedAuth: ReturnType<typeof createAuth>;

	beforeAll(async () => {
		prefixedAuth = await bootAuth({ cookiePrefix: "teacheros-staging" });
	});

	test("sign-up emits cookies under the prefixed namespace", async () => {
		const res = await signUp(
			prefixedAuth,
			`ns-${crypto.randomUUID()}@test.local`,
		);
		expect(res.status).toBe(200);

		const setCookies = res.headers.getSetCookie().join("\n");
		expect(setCookies).toContain("__Secure-teacheros-staging.session_token=");
		expect(setCookies).not.toContain("better-auth.session_token=");
	});

	test("a foreign prod-name cookie cannot shadow the prefixed session", async () => {
		const email = `ns-${crypto.randomUUID()}@test.local`;
		const res = await signUp(prefixedAuth, email);
		expect(res.status).toBe(200);

		const token = /__Secure-teacheros-staging\.session_token=([^;]+)/.exec(
			res.headers.getSetCookie().join("\n"),
		)?.[1];
		expect(token).toBeTruthy();

		// Exactly Experiment C's browser jar: foreign prod-zone cookie first
		// (older, sorts first), staging cookie second. Server reads exact names
		// only, so the foreign token must be ignored.
		const session = await prefixedAuth.handler(
			new Request("https://localhost:8000/api/auth/get-session", {
				headers: {
					origin: STAGING_ORIGIN,
					cookie: `__Secure-better-auth.session_token=bogus; __Secure-teacheros-staging.session_token=${token}`,
				},
			}),
		);
		expect(session.status).toBe(200);
		const body = (await session.json()) as { user?: { email: string } };
		expect(body.user?.email).toBe(email);
	});

	test("without a prefix, cookie names stay byte-identical to today (prod guard)", async () => {
		const defaultAuth = await bootAuth();
		const res = await signUp(
			defaultAuth,
			`ns-${crypto.randomUUID()}@test.local`,
		);
		expect(res.status).toBe(200);

		const setCookies = res.headers.getSetCookie().join("\n");
		expect(setCookies).toContain("__Secure-better-auth.session_token=");
		expect(setCookies).not.toContain("teacheros-staging");
	});
});
