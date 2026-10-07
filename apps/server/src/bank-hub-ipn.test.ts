import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import type {
	BankHubAccount,
	BankHubContext,
} from "./lib/bank-hub/bank-hub-client";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;
const IPN_PATH = "/webhooks/sepay/bankhub/ipn";

function account(xid: string, companyXid: string): BankHubAccount {
	return {
		xid,
		companyXid,
		brandName: "MBBank",
		bankBin: "970422",
		bankCode: "MB",
		accountHolderName: "NGUYEN VAN A",
		accountNumber: "0123456789",
		active: true,
	};
}

describe("bank hub IPN ingest (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgA: string;
	let orgB: string;
	let getBankAccountCalls = 0;
	let getBankAccountError: Error | null = null;

	async function post(body: unknown): Promise<Response> {
		return app.request(IPN_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				Authorization: "Apikey ipn-key",
			},
			body: JSON.stringify(body),
		});
	}

	async function ipn(input: {
		transactionId: string;
		amount: number;
		accountXid?: string;
		content?: string;
		paymentCode?: string | null;
		transferType?: string;
	}): Promise<Response> {
		return post({
			gateway: "MBBank",
			transaction_date: "2026-10-05 10:00:00",
			account_number: "0123456789",
			bank_account_xid: input.accountXid ?? "ba-A",
			content: input.content ?? `Hoc phi ${input.paymentCode ?? ""}`,
			transfer_type: input.transferType ?? "credit",
			amount: input.amount,
			reference_code: "FT123",
			payment_code: input.paymentCode ?? null,
			transaction_id: input.transactionId,
		});
	}

	async function ledger() {
		return libsql.select().from(paymentTransaction);
	}

	async function invoiceRow(id: string) {
		const [row] = await libsql.select().from(invoice).where(eq(invoice.id, id));
		return row;
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;

		orgA = crypto.randomUUID();
		orgB = crypto.randomUUID();
		for (const [orgId, company, studentId] of [
			[orgA, "company-A", "stu-A"],
			[orgB, "company-B", "stu-B"],
		] as const) {
			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1000)",
				args: [orgId, company === "company-A" ? "Academy A" : "Academy B"],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES (?, ?, 'Học viên', '0901', ?, '', 1000)",
				args: [studentId, orgId, `${studentId}@example.com`],
			});
			await libsql.insert(orgBankLink).values({
				orgId,
				companyXid: company,
				bankAccountXid: company === "company-A" ? "ba-A" : "ba-B",
				status: "linked",
			});
		}
		await libsql.insert(invoice).values([
			{
				id: "inv-A1",
				orgId: orgA,
				studentId: "stu-A",
				amount: 500000,
				status: "unpaid",
				paymentCode: "TOS7K2M9QXA",
				payToken: "tok-A1-abc123def456ghi",
			},
			{
				// Manually mark-paid (cash): paidAmount stays 0 — the ledger only
				// knows transfers.
				id: "inv-A2",
				orgId: orgA,
				studentId: "stu-A",
				amount: 500000,
				status: "paid",
				paidAmount: 0,
				paymentCode: "TOSAAAA1111",
				payToken: "tok-A2-abc123def456ghi",
			},
			{
				// Paid through the ledger: the 500k lives in payment_transaction.
				id: "inv-A3",
				orgId: orgA,
				studentId: "stu-A",
				amount: 500000,
				status: "paid",
				paidAmount: 500000,
				paymentCode: "TOSBBBB2222",
				payToken: "tok-A3-abc123def456ghi",
			},
			{
				id: "inv-B1",
				orgId: orgB,
				studentId: "stu-B",
				amount: 300000,
				status: "unpaid",
				paymentCode: "TOSCCCC3333",
				payToken: "tok-B1-abc123def456ghi",
			},
		]);

		await libsql.insert(paymentTransaction).values({
			id: "seed-A3",
			orgId: orgA,
			providerTxnId: "seed-t-A3",
			bankAccountXid: "ba-A",
			amount: 500000,
			content: "TOSBBBB2222 hoc phi",
			paymentCode: "TOSBBBB2222",
			invoiceId: "inv-A3",
			matchStatus: "matched",
		});

		const hub: BankHubContext = {
			ipnApiKey: "ipn-key",
			webhookSecret: "whsec",
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
				getBankAccount: async (xid) => {
					getBankAccountCalls += 1;
					if (getBankAccountError) throw getBankAccountError;
					if (xid === "ba-OLD") return account(xid, "company-A");
					if (xid === "ba-STRAY") return account(xid, "company-NONE");
					return account(xid, xid === "ba-B" ? "company-B" : "company-A");
				},
				listBankAccounts: async () => [],
				listTransactions: async () => ({ data: [] }),
				createMockTransaction: async () => {
					throw new Error("not used");
				},
			},
		};
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getBankHub: () => hub,
		});
	});

	test("partial then full payment accumulates and flips to paid", async () => {
		let res = await ipn({
			transactionId: "t-1",
			amount: 200000,
			paymentCode: "TOS7K2M9QXA",
		});
		expect(res.status).toBe(200);
		let row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(200000);
		expect(row?.status).toBe("unpaid");

		res = await ipn({
			transactionId: "t-2",
			amount: 300000,
			paymentCode: "TOS7K2M9QXA",
		});
		expect(res.status).toBe(200);
		row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(500000);
		expect(row?.status).toBe("paid");
		expect(row?.method).toBe("Chuyển khoản");
	});

	test("replaying the same transaction_id never double-counts", async () => {
		for (let i = 0; i < 3; i += 1) {
			const res = await ipn({
				transactionId: "t-1",
				amount: 200000,
				paymentCode: "TOS7K2M9QXA",
			});
			expect(res.status).toBe(200);
		}
		const rows = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "t-1"));
		expect(rows).toHaveLength(1);
		const row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(500000);
	});

	test("mark-paid invoice accepts a late transfer as matched ledger money", async () => {
		const res = await ipn({
			transactionId: "t-3",
			amount: 100000,
			paymentCode: "TOSAAAA1111",
		});
		expect(res.status).toBe(200);
		const row = await invoiceRow("inv-A2");
		// paid_amount mirrors the LEDGER (100k), status stays paid — the
		// manual mark-paid is preserved; tuition totals read `status`.
		expect(row?.status).toBe("paid");
		expect(row?.paidAmount).toBe(100000);
	});

	test("fully paid invoice → unmatched/invoice_paid, invoice untouched", async () => {
		const res = await ipn({
			transactionId: "t-4",
			amount: 50000,
			paymentCode: "TOSBBBB2222",
		});
		expect(res.status).toBe(200);
		const row = await invoiceRow("inv-A3");
		expect(row?.paidAmount).toBe(500000);
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "t-4"));
		expect(tx?.matchStatus).toBe("unmatched");
		expect(tx?.unmatchedReason).toBe("invoice_paid");
	});

	test("org A's code landing in org B's account is foreign_code", async () => {
		const res = await ipn({
			transactionId: "t-5",
			amount: 300000,
			accountXid: "ba-B",
			paymentCode: "TOS7K2M9QXA",
			content: "TOS7K2M9QXA hoc phi A",
		});
		expect(res.status).toBe(200);
		const aInvoice = await invoiceRow("inv-A1");
		// The money physically landed in org B's account — org A never moves.
		expect(aInvoice?.paidAmount).toBe(500000);
		const bInvoice = await invoiceRow("inv-B1");
		expect(bInvoice?.paidAmount).toBe(0);
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "t-5"));
		expect(tx?.orgId).toBe(orgB);
		expect(tx?.matchStatus).toBe("unmatched");
		expect(tx?.unmatchedReason).toBe("foreign_code");
		// DTO redaction is enforced by the list route (see
		// payment-transactions.test.ts); the ledger row keeps the content for
		// the receiving org's reconciliation.
	});

	test("debit, no-code and stray-account IPNs are acked without rows", async () => {
		const before = (await ledger()).length;
		await ipn({
			transactionId: "t-6",
			amount: 100,
			transferType: "debit",
			paymentCode: "TOS7K2M9QXA",
		});
		await ipn({
			transactionId: "t-7",
			amount: 100,
			content: "chan ga goi an ngon",
		});
		await ipn({
			transactionId: "t-8",
			amount: 100,
			accountXid: "ba-STRAY",
			content: "tiem",
		});
		expect((await ledger()).length).toBe(before);
	});

	test("old account after a relink still resolves via the company fallback", async () => {
		const callsBefore = getBankAccountCalls;
		const res = await ipn({
			transactionId: "t-9",
			amount: 120000,
			accountXid: "ba-OLD",
			paymentCode: "TOS7K2M9QXA",
		});
		expect(res.status).toBe(200);
		expect(getBankAccountCalls).toBe(callsBefore + 1);
		// inv-A1 is already paid at 500k → invoice_paid, but org resolution
		// through the OLD account proves the fallback.
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "t-9"));
		expect(tx?.orgId).toBe(orgA);
		expect(tx?.unmatchedReason).toBe("invoice_paid");
	});

	test("Bank Hub API failure during org resolution acks 200 (reconcile recovers)", async () => {
		getBankAccountError = new Error("429 upstream");
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			// Use an account that is NOT in org_bank_link so the fallback runs.
			const res = await app.request(IPN_PATH, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					Authorization: "Apikey ipn-key",
				},
				body: JSON.stringify({
					transaction_id: "t-10",
					transfer_type: "credit",
					amount: 100000,
					bank_account_xid: "ba-GONE",
					content: "TOS7K2M9QXA hoc phi",
					payment_code: null,
				}),
			});
			expect(res.status).toBe(200);
			const logs = errSpy.mock.calls.map((a) => a.join(" ")).join("\n");
			expect(logs).toContain("t-10");
		} finally {
			getBankAccountError = null;
			errSpy.mockRestore();
		}
	});

	test("lowercase transfer content still matches", async () => {
		const res = await ipn({
			transactionId: "t-11",
			amount: 10000,
			content: "SEVQR tos7k2m9qxa hoc phi",
			paymentCode: null,
		});
		expect(res.status).toBe(200);
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "t-11"));
		expect(tx?.matchStatus).toBe("unmatched"); // inv-A1 already paid
		expect(tx?.paymentCode?.toUpperCase()).toBe("TOS7K2M9QXA");
	});

	test("wrong Apikey is a 401 without reading the body", async () => {
		const res = await app.request(IPN_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				Authorization: "Apikey nope",
			},
			body: JSON.stringify({ transaction_id: "x" }),
		});
		expect(res.status).toBe(401);
	});

	test("schema drift (missing required field) is a 400 with a log, not a 500", async () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await post({ amount: "free-form", unexpected: true });
			expect(res.status).toBe(400);
			expect(errSpy.mock.calls.map((a) => a.join(" ")).join("\n")).toContain(
				"required-field",
			);
		} finally {
			errSpy.mockRestore();
		}
	});

	test("503 when Bank Hub is not configured", async () => {
		const bare = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const res = await bare.request(IPN_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				Authorization: "Apikey ipn-key",
			},
			body: JSON.stringify({ transaction_id: "x" }),
		});
		expect(res.status).toBe(503);
	});
});
