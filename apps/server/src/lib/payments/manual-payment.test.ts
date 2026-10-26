import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../../app";

/**
 * Issue #450 — manual tuition receipts on the debts ledger:
 * POST /api/invoices/:id/payments (partial/full, idempotent, overpay-guarded)
 * and the manual rows surfacing on /invoices/:id/transactions.
 */
const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

const CLIENT_REQUEST_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("manual tuition receipts (#450)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;

	async function api(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	): Promise<Response> {
		return app.request(path, {
			method,
			headers: {
				cookie: `better-auth.session_token=${token}`,
				...(method === "POST"
					? { origin: CORS_ORIGIN, "content-type": "application/json" }
					: {}),
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
	}

	async function manualPayment(
		invoiceId: string,
		overrides?: Partial<{
			clientRequestId: string;
			amount: number;
			method: "transfer" | "cash" | "other";
			note: string;
		}>,
	): Promise<Response> {
		return api("POST", `/api/invoices/${invoiceId}/payments`, {
			clientRequestId: CLIENT_REQUEST_ID,
			amount: 2_000_000,
			method: "cash",
			note: "Đợt 1",
			...overrides,
		});
	}

	async function ledgerRows(invoiceId: string) {
		return libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.invoiceId, invoiceId));
	}

	async function invoiceById(id: string) {
		const [inv] = await libsql.select().from(invoice).where(eq(invoice.id, id));
		if (!inv) throw new Error(`fixture missing invoice ${id}`);
		return inv;
	}

	let token: string;

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!t || t !== token) return null;
				return { userId: "u-1", userName: "Teacher", role: "teacher" as const };
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		token = crypto.randomUUID();
		await libsql
			.insert(authUser)
			.values({ id: "u-1", name: "Teacher", email: "u-1@test.local" });
		await libsql.insert(authSession).values({
			id: crypto.randomUUID(),
			expiresAt: new Date(Date.now() + 3600_000),
			token,
			userId: "u-1",
		});
		const boot = await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${token}` },
		});
		expect(boot.status).toBe(200);
		const m = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-1'",
		});
		orgId = (m.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		// AC-002 invoice: 4.500.000 unpaid.
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-ac002', ?, 'Nguyễn Minh Anh', '0901', '', '', 1000)",
			args: [orgId],
		});
		await libsql.insert(invoice).values({
			id: "inv-ac002",
			orgId,
			studentId: "stu-ac002",
			amount: 4_500_000,
			status: "unpaid",
		});
		// Fully paid invoice (manual mark-paid path).
		await libsql.insert(invoice).values({
			id: "inv-paid",
			orgId,
			studentId: "stu-ac002",
			amount: 4_500_000,
			status: "paid",
			paidAmount: 0,
		});
		// Foreign-org invoice: same id space, different org.
		await client.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES ('org-other', 'Org khác', 1000)",
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-other', 'org-other', 'HV khác', '0902', '', '', 1000)",
		});
		await client.execute({
			sql: "INSERT INTO invoice (id, org_id, student_id, amount, status) VALUES ('inv-foreign', 'org-other', 'stu-other', 4500000, 'unpaid')",
		});
		// invoice_paid fixture: an UNMATCHED bank row that still carries the
		// invoiceId — the guard must not count it as received money.
		await libsql.insert(invoice).values({
			id: "inv-fixture",
			orgId,
			studentId: "stu-ac002",
			amount: 1_000_000,
			status: "unpaid",
		});
		await libsql.insert(paymentTransaction).values({
			id: "tx-invoice-paid-fixture",
			orgId,
			providerTxnId: "bank-tx-1",
			amount: 900_000,
			invoiceId: "inv-fixture",
			matchStatus: "unmatched",
			unmatchedReason: "invoice_paid",
		});
	});

	test("partial receipt: 2tr of 4.5tr stays unpaid with remaining 2.5tr", async () => {
		const res = await manualPayment("inv-ac002");
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			id: string;
			paidAmount: number;
			remaining: number;
			status: string;
		};
		expect(body.paidAmount).toBe(2_000_000);
		expect(body.remaining).toBe(2_500_000);
		expect(body.status).toBe("unpaid");

		const inv = await invoiceById("inv-ac002");
		expect(inv.paidAmount).toBe(2_000_000);
		expect(inv.status).toBe("unpaid");
		// No settlement → method untouched (default "—").
		expect(inv.method).toBe("—");

		const rows = await ledgerRows("inv-ac002");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			provider: "manual",
			providerTxnId: CLIENT_REQUEST_ID,
			matchStatus: "matched",
			amount: 2_000_000,
			content: "Đợt 1",
			method: "cash",
			recordedBy: "u-1",
			raw: "",
		});
		// Bank-compatible timestamp format yyyy-mm-dd HH:mm:ss.
		const [firstRow] = rows;
		if (!firstRow) throw new Error("expected one ledger row");
		expect(firstRow.transactionDate).toMatch(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
		);
	});

	test("settle in cash: status paid, invoice.method = Tiền mặt (D8)", async () => {
		const res = await manualPayment("inv-ac002", {
			clientRequestId: crypto.randomUUID(),
			amount: 2_500_000,
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { status: string; paidAmount: number };
		expect(body.status).toBe("paid");
		expect(body.paidAmount).toBe(4_500_000);

		const inv = await invoiceById("inv-ac002");
		expect(inv.status).toBe("paid");
		expect(inv.method).toBe("Tiền mặt");
	});

	test("idempotent replay: same clientRequestId returns the old receipt", async () => {
		// The first receipt used CLIENT_REQUEST_ID with 2.000.000 — resend it.
		const res = await manualPayment("inv-ac002", { amount: 2_000_000 });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { id: string };
		const rows = await ledgerRows("inv-ac002");
		expect(rows).toHaveLength(2); // no third row
		// The replayed id is one of the two existing receipts.
		expect(rows.map((r) => r.id)).toContain(body.id);
	});

	test("same key with a different amount is a 409 without payload", async () => {
		// CLIENT_REQUEST_ID already owns a 2.000.000 receipt on inv-ac002;
		// resending it with a different amount must NOT return that receipt.
		const res = await manualPayment("inv-ac002", { amount: 123 });
		expect(res.status).toBe(409);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.id).toBeUndefined();
		expect(body.remaining).toBeUndefined();

		const rows = await ledgerRows("inv-ac002");
		expect(rows).toHaveLength(2);
	});

	test("overpay is 422 amount-exceeds-debt with remaining, DB untouched", async () => {
		// inv-fixture: 1M unpaid, matched sum 0 (the 900k row is unmatched).
		const res = await manualPayment("inv-fixture", {
			clientRequestId: crypto.randomUUID(),
			amount: 2_000_000,
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as {
			error: string;
			remaining: number;
		};
		expect(body.error).toBe("amount-exceeds-debt");
		expect(body.remaining).toBe(1_000_000);

		const rows = await ledgerRows("inv-fixture");
		expect(rows).toHaveLength(1); // only the fixture row
		const inv = await invoiceById("inv-fixture");
		expect(inv.paidAmount).toBe(0);
		expect(inv.status).toBe("unpaid");
	});

	test("unmatched invoice_paid row does not count as received money", async () => {
		// 1M receipt on inv-fixture must succeed: matched sum is 0, not 900k.
		const res = await manualPayment("inv-fixture", {
			clientRequestId: crypto.randomUUID(),
			amount: 1_000_000,
			note: "",
		});
		expect(res.status).toBe(201);
		const inv = await invoiceById("inv-fixture");
		expect(inv.paidAmount).toBe(1_000_000);
		expect(inv.status).toBe("paid");
	});

	test("already-paid invoice is 422 invoice-settled", async () => {
		const res = await manualPayment("inv-paid", {
			clientRequestId: crypto.randomUUID(),
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice-settled");
		expect((await ledgerRows("inv-paid")).length).toBe(0);
	});

	test("mark-paid before receipt: guard inside the batch, 422 invoice-settled", async () => {
		await libsql.insert(invoice).values({
			id: "inv-race",
			orgId,
			studentId: "stu-ac002",
			amount: 4_500_000,
			status: "unpaid",
		});
		const marked = await api("POST", "/api/invoices/inv-race/mark-paid", {
			method: "Tiền mặt",
		});
		expect(marked.status).toBe(200);
		// Deterministic sequential race: the INSERT's `status <> 'paid'` guard
		// must reject the receipt on an invoice mark-paid already settled.
		const res = await manualPayment("inv-race", {
			clientRequestId: crypto.randomUUID(),
		});
		expect(res.status).toBe(422);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("invoice-settled");
		expect((await ledgerRows("inv-race")).length).toBe(0);
	});

	test("two concurrent receipts cannot overpay: exactly one lands", async () => {
		await libsql.insert(invoice).values({
			id: "inv-conc",
			orgId,
			studentId: "stu-ac002",
			amount: 4_500_000,
			status: "unpaid",
		});
		const [a, b] = await Promise.all([
			manualPayment("inv-conc", {
				clientRequestId: crypto.randomUUID(),
				amount: 3_000_000,
			}),
			manualPayment("inv-conc", {
				clientRequestId: crypto.randomUUID(),
				amount: 3_000_000,
			}),
		]);
		const statuses = [a.status, b.status].sort();
		expect(statuses).toEqual([201, 422]);
		const rows = await ledgerRows("inv-conc");
		expect(rows).toHaveLength(1);
		const [row] = rows;
		if (!row) throw new Error("expected one ledger row");
		expect(row.amount).toBe(3_000_000);
		const inv = await invoiceById("inv-conc");
		expect(inv.paidAmount).toBe(3_000_000);
		expect(inv.status).toBe("unpaid");
	});

	test("foreign-org invoice is 404", async () => {
		const res = await manualPayment("inv-foreign", {
			clientRequestId: crypto.randomUUID(),
		});
		expect(res.status).toBe(404);
	});

	test("invalid bodies are 400", async () => {
		for (const body of [
			{ amount: 2_000_000, method: "cash" }, // missing clientRequestId
			{ clientRequestId: "not-a-uuid", amount: 100, method: "cash" },
			{ clientRequestId: crypto.randomUUID(), amount: 0, method: "cash" },
			{ clientRequestId: crypto.randomUUID(), amount: -5, method: "cash" },
			{ clientRequestId: crypto.randomUUID(), amount: 1.5, method: "cash" },
			{ clientRequestId: crypto.randomUUID(), amount: 100, method: "barter" },
			{
				clientRequestId: crypto.randomUUID(),
				amount: 100,
				method: "cash",
				extra: 1,
			}, // strict: unknown key rejected
		]) {
			const res = await api(
				"POST",
				"/api/invoices/inv-ac002/payments",
				body as never,
			);
			expect(res.status).toBe(400);
		}
	});
	test("transactions endpoint lists manual rows with method label + note", async () => {
		const res = await api("GET", "/api/invoices/inv-ac002/transactions");
		expect(res.status).toBe(200);
		const rows = (await res.json()) as Array<{
			method: string;
			content: string;
		}>;
		expect(rows).toHaveLength(2);
		// Manual receipt rows expose the display label, not the enum.
		expect(rows[0]).toMatchObject({
			method: "Tiền mặt",
			content: "Đợt 1",
		});
	});

	test("transfer settlement keeps the historical Chuyển khoản method", async () => {
		await libsql.insert(invoice).values({
			id: "inv-transfer",
			orgId,
			studentId: "stu-ac002",
			amount: 500_000,
			status: "unpaid",
		});
		const res = await manualPayment("inv-transfer", {
			clientRequestId: crypto.randomUUID(),
			amount: 500_000,
			method: "transfer",
		});
		expect(res.status).toBe(201);
		const inv = await invoiceById("inv-transfer");
		expect(inv.status).toBe("paid");
		expect(inv.method).toBe("Chuyển khoản");
	});
});
