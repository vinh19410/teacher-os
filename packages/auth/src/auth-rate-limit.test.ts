import { fileURLToPath } from "node:url";
import { type Client, createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { type Auth, createAuth } from "./index";
import type { Mailer } from "./mail/mailer";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

const API_ORIGIN = "https://api.staging.teacheros.io.vn";
const LMS_ORIGIN = "https://lms.staging.teacheros.io.vn";

let rawClient: Client;
let sharedDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
	rawClient = createClient({ url: "file::memory:" });
	sharedDb = drizzle(rawClient, { schema });
	await migrate(sharedDb, { migrationsFolder: MIGRATIONS_DIR });
}, 30_000);

afterAll(() => {
	rawClient?.close();
});

function createIsolatedAuth(options?: {
	rateLimit?: { enabled?: boolean };
	trustedIpHeaders?: string[];
}): Auth {
	return createAuth({
		db: sharedDb,
		corsOrigin: [LMS_ORIGIN],
		unifiedOrigins: [LMS_ORIGIN],
		secret: "rate-limit-test-secret-0123456789abcdef0123456789",
		baseURL: API_ORIGIN,
		googleClientId: "test-dummy",
		googleClientSecret: "test-dummy",
		mailer: { send: vi.fn().mockResolvedValue(undefined) } satisfies Mailer,
		...(options?.rateLimit ? { rateLimit: options.rateLimit } : {}),
		...(options?.trustedIpHeaders
			? { trustedIpHeaders: options.trustedIpHeaders }
			: {}),
	});
}

describe("createAuth rate limiting & Cloudflare IP isolation", () => {
	test("allows up to 120 /get-session requests per 10s per cf-connecting-ip and isolates buckets across IPs", async () => {
		const auth = createIsolatedAuth({
			rateLimit: { enabled: true },
			trustedIpHeaders: ["cf-connecting-ip"],
		});

		for (let i = 0; i < 120; i++) {
			const res = await auth.handler(
				new Request(`${API_ORIGIN}/api/auth/get-session`, {
					headers: { "cf-connecting-ip": "203.0.113.10" },
				}),
			);
			expect(res.status).toBe(200);
		}

		// 121st request from same IP hits 429
		const blocked = await auth.handler(
			new Request(`${API_ORIGIN}/api/auth/get-session`, {
				headers: { "cf-connecting-ip": "203.0.113.10" },
			}),
		);
		expect(blocked.status).toBe(429);

		// Different cf-connecting-ip keeps its own isolated bucket and gets 200
		const otherIp = await auth.handler(
			new Request(`${API_ORIGIN}/api/auth/get-session`, {
				headers: { "cf-connecting-ip": "203.0.113.11" },
			}),
		);
		expect(otherIp.status).toBe(200);
	}, 15_000);

	test("preserves Better-Auth strict 3/10s rate limit on /sign-in/email", async () => {
		const auth = createIsolatedAuth({
			rateLimit: { enabled: true },
			trustedIpHeaders: ["cf-connecting-ip"],
		});

		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await auth.handler(
				new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: LMS_ORIGIN,
						"cf-connecting-ip": "203.0.113.12",
					},
					body: JSON.stringify({
						email: "student@example.com",
						password: "wrong-password",
					}),
				}),
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
		expect(statuses[3]).toBe(429);
		expect(statuses[4]).toBe(429);
	}, 15_000);

	test("ignores spoofed cf-connecting-ip when trustedIpHeaders is omitted (non-Cloudflare runtime)", async () => {
		const auth = createIsolatedAuth({
			rateLimit: { enabled: true },
		});

		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await auth.handler(
				new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: LMS_ORIGIN,
						// No x-forwarded-for: rotating spoofed cf-connecting-ip must NOT split buckets!
						"cf-connecting-ip": `198.51.100.${10 + i}`,
					},
					body: JSON.stringify({
						email: "student@example.com",
						password: "wrong-password",
					}),
				}),
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
		expect(statuses[3]).toBe(429);
	}, 15_000);

	test("ignores spoofed x-forwarded-for when trustedIpHeaders pins cf-connecting-ip", async () => {
		const auth = createIsolatedAuth({
			rateLimit: { enabled: true },
			trustedIpHeaders: ["cf-connecting-ip"],
		});

		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await auth.handler(
				new Request(`${API_ORIGIN}/api/auth/sign-in/email`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: LMS_ORIGIN,
						"cf-connecting-ip": "203.0.113.13",
						// Rotating spoofed x-forwarded-for must NOT bypass the cf-connecting-ip bucket
						"x-forwarded-for": `198.51.100.${20 + i}`,
					},
					body: JSON.stringify({
						email: "student@example.com",
						password: "wrong-password",
					}),
				}),
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
		expect(statuses[3]).toBe(429);
		expect(statuses[4]).toBe(429);
	}, 15_000);

	test("preserves Better-Auth strict 3/10s rate limit on /sign-up/email", async () => {
		const auth = createIsolatedAuth({
			rateLimit: { enabled: true },
			trustedIpHeaders: ["cf-connecting-ip"],
		});

		const statuses: number[] = [];
		for (let i = 0; i < 5; i++) {
			const res = await auth.handler(
				new Request(`${API_ORIGIN}/api/auth/sign-up/email`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: LMS_ORIGIN,
						"cf-connecting-ip": "203.0.113.14",
					},
					body: JSON.stringify({
						name: `Student ${i}`,
						email: `rate-limit-signup-${i}@example.com`,
						password: "password-8chars",
					}),
				}),
			);
			statuses.push(res.status);
		}

		expect(statuses.slice(0, 3).every((s) => s !== 429)).toBe(true);
		expect(statuses[3]).toBe(429);
		expect(statuses[4]).toBe(429);
	}, 15_000);
});
