import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import { signSepayWebhook } from "../lib/sepay/sepay-signature";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);
const WEBHOOK_PATH = "/webhooks/sepay";
const WEBHOOK_SECRET = "sepay-webhook-secret-test";

describe("SePay standard webhook (/webhooks/sepay)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgA: string;
	let orgB: string;
	let orgC: string;
	const nowMs = 1_760_000_000_000;
	const nowSec = Math.floor(nowMs / 1000);

	async function postSigned(
		body: unknown,
		opts: { secret?: string; timestamp?: number; rawOverride?: string } = {},
	): Promise<Response> {
		const rawBody = opts.rawOverride ?? JSON.stringify(body);
		const ts = opts.timestamp ?? nowSec;
		const sig = signSepayWebhook(opts.secret ?? WEBHOOK_SECRET, ts, rawBody);
		return app.request(WEBHOOK_PATH, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-SePay-Signature": sig,
				"X-SePay-Timestamp": String(ts),
			},
			body: rawBody,
		});
	}

	function payload(overrides: Record<string, unknown> = {}) {
		return {
			id: 92704,
			gateway: "MBBank",
			transactionDate: "2026-10-05 10:00:00",
			accountNumber: "0123456789",
			subAccount: "",
			code: null,
			content: "TOS7K2M9QXA hoc phi",
			transferType: "in",
			description: "PHU HUYNH CHUYEN TIEN",
			transferAmount: 200000,
			accumulated: 1200000,
			referenceCode: "FT261005001",
			...overrides,
		};
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
		orgC = crypto.randomUUID();
		for (const [orgId, acc, vaCode, studentId] of [
			[orgA, "0123456789", "", "stu-A"],
			[orgB, "9876543210", "", "stu-B"],
			[orgC, "5555666677", "MMY", "stu-C"],
		] as const) {
			await client.execute({
				sql: "INSERT INTO organization (id, name, created_at) VALUES (?, ?, 1000)",
				args: [orgId, `Academy ${studentId}`],
			});
			await client.execute({
				sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES (?, ?, 'Học viên', '0901', ?, '', 1000)",
				args: [studentId, orgId, `${studentId}@example.com`],
			});
			await libsql.insert(orgBankLink).values({
				orgId,
				status: "linked",
				brandName: "MBBank",
				bankBin: "970422",
				bankCode: "MB",
				accountNumber: acc,
				vaCode,
				accountHolderName: "TEACHER",
				pastBankAccountXids:
					orgId === orgA ? JSON.stringify(["0111222333"]) : "[]",
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
			{
				id: "inv-C1",
				orgId: orgC,
				studentId: "stu-C",
				amount: 600000,
				status: "unpaid",
				paymentCode: "MSMY7K2M9QXA",
				payToken: "tok-C1-abc123def456ghi",
			},
		]);

		await libsql.insert(paymentTransaction).values({
			id: "seed-A3",
			orgId: orgA,
			provider: "sepay",
			providerTxnId: "seed-t-A3",
			bankAccountXid: "0123456789",
			amount: 500000,
			content: "TOSBBBB2222 hoc phi",
			paymentCode: "TOSBBBB2222",
			invoiceId: "inv-A3",
			matchStatus: "matched",
		});

		app = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
			getSepay: () => ({ webhookSecret: WEBHOOK_SECRET }),
			now: () => new Date(nowMs),
		});
	});

	test("Test send payload (id=0) returns 200 without writing ledger", async () => {
		const before = (await libsql.select().from(paymentTransaction)).length;
		const res = await postSigned(payload({ id: 0 }));
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		expect((await libsql.select().from(paymentTransaction)).length).toBe(
			before,
		);
	});

	test("partial then full payment accumulates and flips invoice to paid", async () => {
		let res = await postSigned(
			payload({ id: 1001, transferAmount: 200000, referenceCode: "FT-1001" }),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ success: true });
		let row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(200000);
		expect(row?.status).toBe("unpaid");

		res = await postSigned(
			payload({
				id: 1002,
				transferAmount: 300000,
				content: "SEVQR tos7k2m9qxa hoc phi",
				referenceCode: "FT-1002",
			}),
		);
		expect(res.status).toBe(200);
		row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(500000);
		expect(row?.status).toBe("paid");
		expect(row?.method).toBe("Chuyển khoản");
	});

	test("replaying the same webhook id never double-counts", async () => {
		for (let i = 0; i < 3; i += 1) {
			const res = await postSigned(
				payload({ id: 1001, transferAmount: 200000, referenceCode: "FT-1001" }),
			);
			expect(res.status).toBe(200);
		}
		const row = await invoiceRow("inv-A1");
		expect(row?.paidAmount).toBe(500000);
	});

	test("matches via subAccount (VA) when VA matches configured accountNumber", async () => {
		const res = await postSigned(
			payload({
				id: 1003,
				accountNumber: "9999999999",
				subAccount: "0123456789",
				transferAmount: 100000,
				content: "TOSAAAA1111 hoc phi",
				referenceCode: "FT-1003",
			}),
		);
		expect(res.status).toBe(200);
		const row = await invoiceRow("inv-A2");
		expect(row?.paidAmount).toBe(100000);
	});

	test("TKP VA-scoped org accepts MMY / TKPMMY / content-prefix MSMY transfers and skips non-VA transfers", async () => {
		// 1. subAccount="MMY" + code="MSMY7K2M9QXA" -> matched 200k
		let res = await postSigned(
			payload({
				id: 2001,
				accountNumber: "5555666677",
				subAccount: "MMY",
				code: "MSMY7K2M9QXA",
				content: "TKPMMY MSMY7K2M9QXA",
				transferAmount: 200000,
				referenceCode: "FT-C1",
			}),
		);
		expect(res.status).toBe(200);
		expect((await invoiceRow("inv-C1"))?.paidAmount).toBe(200000);

		// 2. subAccount="TKPMMY" -> matched 200k (total 400k)
		res = await postSigned(
			payload({
				id: 2002,
				accountNumber: "5555666677",
				subAccount: "TKPMMY",
				code: null,
				content: "TKPMMY msmy7k2m9qxa",
				transferAmount: 200000,
				referenceCode: "FT-C2",
			}),
		);
		expect(res.status).toBe(200);
		expect((await invoiceRow("inv-C1"))?.paidAmount).toBe(400000);

		// 3. subAccount="" fallback via TKPMMY prefix in content -> matched 200k (paid 600k)
		res = await postSigned(
			payload({
				id: 2003,
				accountNumber: "5555666677",
				subAccount: "",
				code: null,
				content: "TKPMMYMSMY7K2M9QXA",
				transferAmount: 200000,
				referenceCode: "FT-C3",
			}),
		);
		expect(res.status).toBe(200);
		let rowC = await invoiceRow("inv-C1");
		expect(rowC?.paidAmount).toBe(600000);
		expect(rowC?.status).toBe("paid");

		// 4. Non-VA or other-VA transfer on same source account must NOT touch orgC
		const before = (await libsql.select().from(paymentTransaction)).length;
		await postSigned(
			payload({
				id: 2004,
				accountNumber: "5555666677",
				subAccount: "",
				content: "MSMY7K2M9QXA missing TKP prefix",
				transferAmount: 100000,
				referenceCode: "FT-C4",
			}),
		);
		await postSigned(
			payload({
				id: 2005,
				accountNumber: "5555666677",
				subAccount: "OTHER",
				content: "TKPMMY MSMY7K2M9QXA",
				transferAmount: 100000,
				referenceCode: "FT-C5",
			}),
		);
		expect((await libsql.select().from(paymentTransaction)).length).toBe(
			before,
		);
		rowC = await invoiceRow("inv-C1");
		expect(rowC?.paidAmount).toBe(600000);
	});

	test("resolves old account from pastBankAccountXids after relink", async () => {
		const res = await postSigned(
			payload({
				id: 1004,
				accountNumber: "0111222333",
				transferAmount: 50000,
				content: "TOSBBBB2222 nop them",
				referenceCode: "FT-1004",
			}),
		);
		expect(res.status).toBe(200);
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "1004"));
		expect(tx?.orgId).toBe(orgA);
		expect(tx?.unmatchedReason).toBe("invoice_paid");
	});

	test("org A code landing in org B account is classified as foreign_code", async () => {
		const res = await postSigned(
			payload({
				id: 1005,
				accountNumber: "9876543210",
				transferAmount: 150000,
				content: "TOS7K2M9QXA nham tai khoan",
				referenceCode: "FT-1005",
			}),
		);
		expect(res.status).toBe(200);
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "1005"));
		expect(tx?.orgId).toBe(orgB);
		expect(tx?.matchStatus).toBe("unmatched");
		expect(tx?.unmatchedReason).toBe("foreign_code");
	});

	test("transferType=out and no-code transfers are acked without writing", async () => {
		const before = (await libsql.select().from(paymentTransaction)).length;
		await postSigned(
			payload({ id: 1006, transferType: "out", referenceCode: "FT-1006" }),
		);
		await postSigned(
			payload({
				id: 1007,
				content: "tra tien an trua",
				referenceCode: "FT-1007",
			}),
		);
		expect((await libsql.select().from(paymentTransaction)).length).toBe(
			before,
		);
	});

	test("rejects wrong signature, expired timestamp, and tampered raw bytes with 401", async () => {
		const wrongSecret = await postSigned(payload(), { secret: "wrong" });
		expect(wrongSecret.status).toBe(401);

		const expired = await postSigned(payload(), { timestamp: nowSec - 301 });
		expect(expired.status).toBe(401);

		const raw = JSON.stringify(payload());
		const sig = signSepayWebhook(WEBHOOK_SECRET, nowSec, raw);
		const tampered = await app.request(WEBHOOK_PATH, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-SePay-Signature": sig,
				"X-SePay-Timestamp": String(nowSec),
			},
			body: raw.replace("200000", "999999"),
		});
		expect(tampered.status).toBe(401);
	});

	test("schema drift returns 400 with validation log", async () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const res = await postSigned({ transferAmount: "bad" });
			expect(res.status).toBe(400);
			expect(errSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain(
				"required-field",
			);
		} finally {
			errSpy.mockRestore();
		}
	});

	test("rejects payloads over 64 KB with 413", async () => {
		const res = await postSigned(payload({ content: "x".repeat(70 * 1024) }));
		expect(res.status).toBe(413);
	});

	test("returns 503 SEPAY_DISABLED when getSepay is unconfigured", async () => {
		const bare = buildApp({
			getDb: () => db,
			corsOrigin: "http://localhost:8001",
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const res = await bare.request(WEBHOOK_PATH, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload()),
		});
		expect(res.status).toBe(503);
	});
});
