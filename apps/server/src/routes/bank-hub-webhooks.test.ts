import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type {
	BankHubClient,
	BankHubContext,
} from "../lib/bank-hub/bank-hub-client";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const IPN_KEY = "ipn-key";
const WEBHOOK_SECRET = "whsec";

function stubClient(): BankHubClient {
	return {
		createCompany: async () => {
			throw new Error("not used in webhook tests");
		},
		getCompany: async () => {
			throw new Error("not used in webhook tests");
		},
		editCompany: async () => {
			throw new Error("not used in webhook tests");
		},
		createLinkToken: async () => {
			throw new Error("not used in webhook tests");
		},
		getBankAccount: async () => {
			throw new Error("not used in webhook tests");
		},
		listBankAccounts: async () => {
			throw new Error("not used in webhook tests");
		},
		listTransactions: async () => ({ data: [] }),
		createMockTransaction: async () => {
			throw new Error("not used in webhook tests");
		},
	};
}

function ipnPayload(overrides: Record<string, unknown> = {}) {
	return {
		gateway: "BIDV",
		transaction_date: "2026-10-07 13:00:00",
		account_number: "7890123456",
		bank_account_xid: "ba-1",
		va: "SBSEPAYXESTJR8NRVVM",
		payment_code: null,
		content: "TOSQZ48YXTT hoc phi",
		transfer_type: "credit",
		amount: 5000000,
		reference_code: "MOCK261007",
		accumulated: 5000000,
		transaction_id: "tx-e2e-1",
		...overrides,
	};
}

async function post(
	app: ServerApp,
	path: string,
	headers: Record<string, string>,
	body: unknown,
): Promise<Response> {
	return app.request(path, {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
}

describe("SePay Bank Hub webhooks (auth-style dispatch)", () => {
	let db: Db;
	let app: ServerApp;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const libsql = drizzle(client, { schema });
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy 1" });
		await libsql.insert(schema.student).values({
			id: "student-1",
			orgId: "org-1",
			name: "Minh Tran",
			email: "minh@test.local",
			phone: "0901234567",
		});
		await libsql.insert(invoice).values({
			id: "inv-1",
			orgId: "org-1",
			studentId: "student-1",
			amount: 5000000,
			status: "unpaid",
			paymentCode: "TOSQZ48YXTT",
		});
		await libsql.insert(orgBankLink).values({
			orgId: "org-1",
			companyXid: "company-1",
			bankAccountXid: "ba-1",
			status: "linked",
		});

		const hub: BankHubContext = {
			client: stubClient(),
			ipnApiKey: IPN_KEY,
			webhookSecret: WEBHOOK_SECRET,
			env: "sandbox",
		};
		app = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: () => hub,
		});
	});

	test("balance-change IPN authenticates with Apikey on the lifecycle path (sandbox pins the IPN target to the first registered URL)", async () => {
		const res = await post(
			app,
			"/webhooks/sepay/bankhub/events",
			{ Authorization: `Apikey ${IPN_KEY}` },
			ipnPayload(),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });

		const [row] = await db
			.select({
				status: invoice.status,
				paidAmount: invoice.paidAmount,
				method: invoice.method,
			})
			.from(invoice)
			.where(eq(invoice.id, "inv-1"));
		expect(row).toEqual({
			status: "paid",
			paidAmount: 5000000,
			method: "Chuyển khoản",
		});
	});

	test("replaying the same transaction_id through the IPN path stays idempotent", async () => {
		const res = await post(
			app,
			"/webhooks/sepay/bankhub/ipn",
			{ Authorization: `Apikey ${IPN_KEY}` },
			ipnPayload(),
		);
		expect(res.status).toBe(200);

		const [row] = await db
			.select({ paidAmount: invoice.paidAmount })
			.from(invoice)
			.where(eq(invoice.id, "inv-1"));
		expect(row?.paidAmount).toBe(5000000);
	});

	test("lifecycle events still authenticate with X-Secret-Key on the IPN path", async () => {
		const res = await post(
			app,
			"/webhooks/sepay/bankhub/ipn",
			{ "X-Secret-Key": WEBHOOK_SECRET },
			{ timestamp: 1, event: "LINK_TOKEN_CREATED" },
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
	});

	test("a wrong key on either path is a 401", async () => {
		const byApikey = await post(
			app,
			"/webhooks/sepay/bankhub/events",
			{ Authorization: "Apikey wrong" },
			ipnPayload({ transaction_id: "tx-e2e-2" }),
		);
		expect(byApikey.status).toBe(401);
		const bySecret = await post(
			app,
			"/webhooks/sepay/bankhub/ipn",
			{ "X-Secret-Key": "wrong" },
			{ timestamp: 1, event: "LINK_TOKEN_CREATED" },
		);
		expect(bySecret.status).toBe(401);
	});
});
