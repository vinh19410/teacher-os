import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { membership } from "@teacher-os/db/schema/membership";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import {
	type BankHubAccount,
	type BankHubClient,
	type BankHubContext,
	BankHubError,
} from "./lib/bank-hub/bank-hub-client";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

function account(overrides: Partial<BankHubAccount> = {}): BankHubAccount {
	return {
		xid: "ba-1",
		companyXid: "company-1",
		brandName: "MBBank",
		bankBin: "970422",
		bankCode: "MB",
		accountHolderName: "NGUYEN VAN A",
		accountNumber: "0123456789",
		active: true,
		...overrides,
	};
}

interface FakeHub {
	hub: BankHubContext;
	linkCalls: string[];
	companyCreations(): number;
	setAccounts(accounts: BankHubAccount[]): void;
	setHostedUrl(url: string): void;
	setLinkTokenError(err: unknown): void;
	setListAccountsError(err: unknown): void;
}

function createFakeHub(): FakeHub {
	let accounts: BankHubAccount[] = [account()];
	let hostedUrl = "https://bankhub.sepay.vn/link/abc";
	let creations = 0;
	const linkCalls: string[] = [];
	let linkTokenError: unknown;
	let listAccountsError: unknown;
	const client: BankHubClient = {
		createCompany: async (input) => {
			creations += 1;
			return {
				xid: `company-${creations}`,
				fullName: input.fullName,
				status: "Active",
				transactionAmount: 0,
			};
		},
		getCompany: async (xid) => ({
			xid,
			fullName: "",
			status: "Active",
			transactionAmount: "Unlimited",
		}),
		editCompany: async (xid) => ({
			xid,
			fullName: "",
			status: "Active",
			transactionAmount: "Unlimited",
		}),
		createLinkToken: async (input) => {
			if (linkTokenError) throw linkTokenError;
			linkCalls.push(input.purpose);
			return {
				xid: "lt-1",
				hostedLinkUrl: hostedUrl,
				linkToken: "ltok-1",
				expiresAt: "2026-01-01T00:00:00Z",
			};
		},
		getBankAccount: async (xid) => account({ xid }),
		listBankAccounts: async () => {
			if (listAccountsError) throw listAccountsError;
			return accounts;
		},
		listTransactions: async () => ({ data: [] }),
	};
	return {
		hub: {
			client,
			ipnApiKey: "ipn-key",
			webhookSecret: "whsec",
			env: "sandbox",
		},
		linkCalls,
		companyCreations: () => creations,
		setAccounts: (next) => {
			accounts = next;
		},
		setHostedUrl: (next) => {
			hostedUrl = next;
		},
		setLinkTokenError: (err) => {
			linkTokenError = err;
		},
		setListAccountsError: (err) => {
			listAccountsError = err;
		},
	};
}

async function api(
	app: ServerApp,
	method: "GET" | "POST",
	path: string,
	opts: { token?: string; body?: unknown } = {},
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (opts.token) headers.cookie = `better-auth.session_token=${opts.token}`;
	if (method === "POST") {
		// The kernel CSRF guard requires Origin + JSON content-type on writes,
		// even for body-less POSTs like /sync.
		headers.origin = CORS_ORIGIN;
		headers["content-type"] = "application/json";
	}
	return app.request(path, {
		method,
		headers,
		...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
	});
}

describe("bank-link routes", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let fake: FakeHub;
	let userA: { userId: string; token: string };
	let userB: { userId: string; token: string };

	async function insertUser(name: string) {
		const userId = crypto.randomUUID();
		const token = crypto.randomUUID();
		await libsql
			.insert(authUser)
			.values({ id: userId, name, email: `${userId}@test.local` });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
			token,
			userId,
		});
		return { userId, token };
	}

	async function orgIdOf(userId: string): Promise<string> {
		const [row] = await libsql
			.select({ orgId: membership.orgId })
			.from(membership)
			.where(eq(membership.userId, userId));
		if (!row) throw new Error("no membership — bootstrap did not run");
		return row.orgId;
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		fake = createFakeHub();
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!token) return null;
				const [row] = await libsql
					.select({
						userId: authSession.userId,
						expiresAt: authSession.expiresAt,
						userName: authUser.name,
					})
					.from(authSession)
					.innerJoin(authUser, eq(authSession.userId, authUser.id))
					.where(eq(authSession.token, token));
				if (!row || row.expiresAt.getTime() <= Date.now()) return null;
				return {
					userId: row.userId,
					userName: row.userName,
					role: "teacher" as const,
				};
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: () => fake.hub,
		});
		userA = await insertUser("Teacher A");
		userB = await insertUser("Teacher B");
	});

	test("link-token creates the Bank Hub company exactly once", async () => {
		const first = await api(app, "POST", "/api/bank-link/link-token", {
			token: userA.token,
			body: { purpose: "link" },
		});
		expect(first.status).toBe(200);
		const body = (await first.json()) as { hostedLinkUrl: string };
		expect(body.hostedLinkUrl).toBe("https://bankhub.sepay.vn/link/abc");
		expect(fake.companyCreations()).toBe(1);

		const second = await api(app, "POST", "/api/bank-link/link-token", {
			token: userA.token,
			body: { purpose: "link" },
		});
		expect(second.status).toBe(200);
		expect(fake.companyCreations()).toBe(1);
	});

	test("rejects a hosted link outside the allowlist with 502", async () => {
		fake.setHostedUrl("https://evil.example/link/x");
		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userB.token,
			body: { purpose: "link" },
		});
		expect(res.status).toBe(502);
		fake.setHostedUrl("https://bankhub.sepay.vn/link/abc");
	});

	test("accepts the sandbox hosted-link origin", async () => {
		fake.setHostedUrl("https://bankhub-sandbox.sepay.vn/link/x");
		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userB.token,
			body: { purpose: "link" },
		});
		expect(res.status).toBe(200);
		fake.setHostedUrl("https://bankhub.sepay.vn/link/abc");
	});

	test("maps a Bank Hub failure on link-token to 502 without leaking the message", async () => {
		fake.setLinkTokenError(new BankHubError(500, "sandbox exploded"));
		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userB.token,
			body: { purpose: "link" },
		});
		expect(res.status).toBe(502);
		const text = await res.text();
		expect(text).toContain("BANKHUB_UPSTREAM");
		expect(text).not.toContain("sandbox exploded");
		fake.setLinkTokenError(undefined);
	});

	test("maps Bank Hub rate limiting on link-token to 429 with Retry-After", async () => {
		fake.setLinkTokenError(
			new BankHubError(429, "slow down", { retryAfter: 30 }),
		);
		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userB.token,
			body: { purpose: "link" },
		});
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("30");
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("BANKHUB_RATE_LIMITED");
		fake.setLinkTokenError(undefined);
	});

	test("sync maps a Bank Hub failure to 502 instead of a bare 500", async () => {
		fake.setListAccountsError(new BankHubError(500, "accounts unavailable"));
		const res = await api(app, "POST", "/api/bank-link/sync", {
			token: userA.token,
		});
		expect(res.status).toBe(502);
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("BANKHUB_UPSTREAM");
		fake.setListAccountsError(undefined);
	});

	test("server blocks link when the org is already linked (409)", async () => {
		const orgId = await orgIdOf(userA.userId);
		await api(app, "POST", "/api/bank-link/sync", { token: userA.token });
		const [row] = await libsql
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, orgId));
		expect(row?.status).toBe("linked");

		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userA.token,
			body: { purpose: "link" },
		});
		expect(res.status).toBe(409);
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("BANK_LINK_ALREADY_LINKED");
	});

	test("sync reports masked account data and keeps orgs isolated", async () => {
		const res = await api(app, "POST", "/api/bank-link/sync", {
			token: userA.token,
		});
		expect(res.status).toBe(200);
		const status = (await res.json()) as {
			status: string;
			accountNumberMasked: string;
			holderName: string;
		};
		expect(status.status).toBe("linked");
		expect(status.accountNumberMasked).toBe("•••6789");
		expect(status.holderName).toBe("NGUYEN VAN A");

		// Teacher B's org has no link and must never see A's data.
		const resB = await api(app, "GET", "/api/bank-link", {
			token: userB.token,
		});
		const statusB = (await resB.json()) as {
			status: string;
			brandName: string;
		};
		expect(statusB.status).toBe("none");
		expect(statusB.brandName).toBe("");
	});

	test("?refresh=1 picks up bank-side deactivation", async () => {
		fake.setAccounts([account({ active: false })]);
		const res = await api(app, "GET", "/api/bank-link?refresh=1", {
			token: userA.token,
		});
		const status = (await res.json()) as { status: string };
		expect(status.status).toBe("inactive");
		fake.setAccounts([account()]);
	});

	test("unlink without a linked account is a 409", async () => {
		const res = await api(app, "POST", "/api/bank-link/link-token", {
			token: userB.token,
			body: { purpose: "unlink" },
		});
		expect(res.status).toBe(409);
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("BANK_LINK_NO_LINKED_ACCOUNT");
	});

	test("returns 503 BANKHUB_DISABLED when Bank Hub is not configured", async () => {
		const bare = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (token !== userA.token) return null;
				const [row] = await libsql
					.select({
						userId: authSession.userId,
						expiresAt: authSession.expiresAt,
						userName: authUser.name,
					})
					.from(authSession)
					.innerJoin(authUser, eq(authSession.userId, authUser.id))
					.where(eq(authSession.token, token));
				if (!row) return null;
				return {
					userId: row.userId,
					userName: row.userName,
					role: "teacher" as const,
				};
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const res = await api(bare, "GET", "/api/bank-link", {
			token: userA.token,
		});
		expect(res.status).toBe(503);
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("BANKHUB_DISABLED");
	});

	test("sync records a replaced account into past_bank_account_xids", async () => {
		const orgId = await orgIdOf(userA.userId);
		fake.setAccounts([account({ xid: "ba-2" })]);
		await api(app, "POST", "/api/bank-link/sync", { token: userA.token });
		const [row] = await libsql
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, orgId));
		expect(row?.bankAccountXid).toBe("ba-2");
		expect(JSON.parse(row?.pastBankAccountXids ?? "[]")).toContain("ba-1");
		fake.setAccounts([account()]);
	});
});
