import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import type {
	BankHubAccount,
	BankHubClient,
	BankHubContext,
} from "./lib/bank-hub/bank-hub-client";

const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const WEBHOOK_PATH = "/webhooks/sepay/bankhub/events";

function account(xid: string, active = true): BankHubAccount {
	return {
		xid,
		companyXid: "company-1",
		brandName: "MBBank",
		bankBin: "970422",
		bankCode: "MB",
		accountHolderName: "NGUYEN VAN A",
		accountNumber: "0123456789",
		active,
	};
}

function fakeHub(): BankHubContext {
	const client: BankHubClient = {
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
		getBankAccount: async (xid) => account(xid),
		listBankAccounts: async () => [account("ba-1")],
		listTransactions: async () => ({ data: [] }),
	};
	return {
		client,
		ipnApiKey: "ipn-key",
		webhookSecret: "whsec",
		env: "sandbox",
	};
}

describe("bank hub webhook events", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;

	async function post(body: unknown, secret = "whsec"): Promise<Response> {
		return app.request(WEBHOOK_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"X-Secret-Key": secret,
			},
			body: JSON.stringify(body),
		});
	}

	async function readRow() {
		const [row] = await libsql
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, orgId));
		return row;
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: fakeHub,
		});
		orgId = crypto.randomUUID();
		await client.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, 'Academy', 1000)",
			args: [orgId],
		});
		await libsql.insert(orgBankLink).values({
			orgId,
			companyXid: "company-1",
			bankAccountXid: "ba-1",
			status: "linked",
			lastEventAt: 100,
		});
	});

	test("rejects a wrong X-Secret-Key with 401", async () => {
		const res = await post(
			{
				timestamp: 200,
				event: "BANK_ACCOUNT_INACTIVED",
				metadata: { bank_account_xid: "ba-1" },
			},
			"wrong-secret",
		);
		expect(res.status).toBe(401);
	});

	test("applies INACTIVED for the recorded account", async () => {
		const res = await post({
			timestamp: 200,
			event: "BANK_ACCOUNT_INACTIVED",
			metadata: { bank_account_xid: "ba-1" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { applied: boolean };
		expect(body.applied).toBe(true);
		const row = await readRow();
		expect(row?.status).toBe("inactive");
		expect(row?.lastEventAt).toBe(200);
	});

	test("skips stale events (timestamp older than last_event_at)", async () => {
		const res = await post({
			timestamp: 50,
			event: "BANK_ACCOUNT_LINKED",
			metadata: { bank_account_xid: "ba-1" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { applied: boolean };
		expect(body.applied).toBe(false);
		const row = await readRow();
		expect(row?.status).toBe("inactive"); // unchanged
	});

	test("skips events for a different account in the same company", async () => {
		const res = await post({
			timestamp: 300,
			event: "BANK_ACCOUNT_LINKED",
			metadata: { bank_account_xid: "ba-OTHER" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { applied: boolean };
		expect(body.applied).toBe(false);
		const row = await readRow();
		expect(row?.bankAccountXid).toBe("ba-1");
	});

	test("ignores events from an unknown company", async () => {
		const stray = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: () => {
				const hub = fakeHub();
				return {
					...hub,
					client: {
						...hub.client,
						getBankAccount: async (xid) => ({
							...account(xid),
							companyXid: "company-UNKNOWN",
						}),
					},
				};
			},
		});
		const res = await stray.request(WEBHOOK_PATH, {
			method: "POST",
			headers: { "content-type": "application/json", "X-Secret-Key": "whsec" },
			body: JSON.stringify({
				timestamp: 400,
				event: "BANK_ACCOUNT_LINKED",
				metadata: { bank_account_xid: "ba-9" },
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { applied: boolean };
		expect(body.applied).toBe(false);
	});

	test("non-BANK_ACCOUNT events are acked without any write", async () => {
		const res = await post({
			timestamp: 500,
			event: "SOMETHING_ELSE",
			metadata: {},
		});
		expect(res.status).toBe(200);
		const row = await readRow();
		expect(row?.lastEventAt).toBe(200);
	});

	test("malformed envelope is a 400", async () => {
		const res = await post({ event: 42 });
		expect(res.status).toBe(400);
	});

	test("bodies above 64 KB are rejected with 413", async () => {
		const res = await post({
			timestamp: 1,
			event: "BANK_ACCOUNT_LINKED",
			metadata: { pad: "x".repeat(70 * 1024) },
		});
		expect(res.status).toBe(413);
	});

	test("503 when Bank Hub is not configured", async () => {
		const bare = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const res = await bare.request(WEBHOOK_PATH, {
			method: "POST",
			headers: { "content-type": "application/json", "X-Secret-Key": "whsec" },
			body: JSON.stringify({ timestamp: 1, event: "BANK_ACCOUNT_LINKED" }),
		});
		expect(res.status).toBe(503);
	});
});
