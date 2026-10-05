import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
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
	type BankHubTransaction,
} from "./lib/bank-hub/bank-hub-client";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

interface Page {
	data: BankHubTransaction[];
	meta?: { page: number; perPage: number; total: number; totalPages: number };
}

describe("bank-link reconcile (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let token: string;
	/** Recorded per account xid: pages returned by the fake Bank Hub. */
	const pagesByAccount = new Map<string, Page[]>();
	const queriedAccounts: string[] = [];
	let rateLimited = false;

	function credit(
		id: string,
		amount: number,
		content: string,
	): BankHubTransaction {
		return {
			transactionId: id,
			transactionDate: "2026-10-05 10:00:00",
			bankAccountXid: "ba-now",
			companyXid: "company-1",
			accountNumber: "0123456789",
			referenceCode: "FT",
			transferType: "credit",
			amount,
			content,
			paymentCode: null,
			webhookSuccess: false,
		};
	}

	async function api(path: string, body?: unknown): Promise<Response> {
		return app.request(path, {
			method: body === undefined ? "GET" : "POST",
			headers: {
				cookie: `better-auth.session_token=${token}`,
				...(body !== undefined
					? { origin: CORS_ORIGIN, "content-type": "application/json" }
					: {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		token = crypto.randomUUID();
		await libsql
			.insert(authUser)
			.values({ id: "u-1", name: "T", email: "u1@t.local" });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 3600_000),
			token,
			userId: "u-1",
		});

		const hub: BankHubContext = {
			ipnApiKey: "ipn",
			webhookSecret: "wh",
			env: "sandbox",
			client: {
				createCompany: async () => {
					throw new Error("not used");
				},
				getCompany: async () => {
					throw new Error("not used");
				},
				editCompany: async () => {
					throw new Error("not used");
				},
				createLinkToken: async () => {
					throw new Error("not used");
				},
				getBankAccount: async (xid) =>
					({
						xid,
						companyXid: "company-1",
						brandName: "MBBank",
						bankBin: "970422",
						bankCode: "MB",
						accountHolderName: "A",
						accountNumber: "0123456789",
						active: true,
					}) satisfies BankHubAccount,
				listBankAccounts: async () => [],
				listTransactions: async (input) => {
					if (rateLimited) {
						throw new BankHubError(429, "rate limited", { retryAfter: 30 });
					}
					queriedAccounts.push(input.bankAccountXid);
					return (
						pagesByAccount.get(input.bankAccountXid)?.[(input.page ?? 1) - 1] ?? {
							data: [],
							meta: { page: 1, perPage: 100, total: 0, totalPages: 1 },
						}
					);
				},
			} satisfies BankHubClient,
		};
		void rateLimited;

		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				return t === token
					? { userId: "u-1", userName: "T", role: "teacher" as const }
					: null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: () => hub,
		});

		const boot = await api("/api/kernel/settings");
		expect(boot.status).toBe(200);
		const m = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-1'",
		});
		orgId = (m.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		await libsql.insert(orgBankLink).values({
			orgId,
			companyXid: "company-1",
			bankAccountXid: "ba-now",
			pastBankAccountXids: JSON.stringify(["ba-old"]),
			status: "linked",
		});
	});

	test("sweeps the current account AND past accounts, storing no_code rows", async () => {
		pagesByAccount.set("ba-now", [
			{
				data: [credit("r-1", 200000, "TOS7K2M9QXA hoc phi")],
				meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
			},
		]);
		pagesByAccount.set("ba-old", [
			{
				data: [credit("r-2", 150000, "chan ga goi an ngon")],
				meta: { page: 1, perPage: 100, total: 1, totalPages: 1 },
			},
		]);
		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			scanned: number;
			matched: number;
			unmatched: number;
		};
		expect(body.scanned).toBe(2);
		// No invoices exist in this DB: r-1 → unknown_code, r-2 → no_code.
		expect(body.unmatched).toBe(2);
		expect(queriedAccounts.sort()).toEqual(["ba-now", "ba-old"]);

		const [nocode] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "r-2"));
		expect(nocode?.matchStatus).toBe("unmatched");
		expect(nocode?.unmatchedReason).toBe("no_code");
		// raw only persists while unmatched — reconcile DTO carries JSON of the
		// client row; both rows store something here since neither matched.
	});

	test("replaying reconcile re-ingests idempotently (no duplicate rows)", async () => {
		// Cooldown is 60s — simulate it having elapsed.
		await libsql
			.update(orgBankLink)
			.set({ lastReconciledAt: Math.floor(Date.now() / 1000) - 120 })
			.where(eq(orgBankLink.orgId, orgId));
		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(200);
		const rows = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "r-1"));
		expect(rows).toHaveLength(1);
	});

	test("cooldown inside 60s answers 429", async () => {
		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(429);
		const err = (await res.json()) as { code: string };
		expect(err.code).toBe("RECONCILE_COOLDOWN");
	});

	test("Bank Hub 429 surfaces as route 429 with Retry-After", async () => {
		await libsql
			.update(orgBankLink)
			.set({ lastReconciledAt: Math.floor(Date.now() / 1000) - 120 })
			.where(eq(orgBankLink.orgId, orgId));
		rateLimited = true;
		try {
			const res = await api("/api/bank-link/reconcile", {});
			expect(res.status).toBe(429);
			expect(res.headers.get("retry-after")).toBe("30");
			const err = (await res.json()) as { code: string };
			expect(err.code).toBe("BANKHUB_RATE_LIMITED");
		} finally {
			rateLimited = false;
		}
	});
});
