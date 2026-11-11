import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

describe("public pay route (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let payToken: string;
	let paymentCode: string;
	let invoiceId: string;

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async () => null,
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		paymentCode = "TOS7K2M9QXA";
		payToken = "abc123def456ghi789jkl";
		const orgIdValue = crypto.randomUUID();
		const studentId = crypto.randomUUID();
		invoiceId = crypto.randomUUID();
		await client.execute({
			sql: "INSERT INTO organization (id, name, created_at) VALUES (?, 'Academy A', 1000)",
			args: [orgIdValue],
		});
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES (?, ?, 'Nguyễn Văn Bình', '0901', 'b@example.com', '', 1000)",
			args: [studentId, orgIdValue],
		});
		await client.execute({
			sql: "INSERT INTO invoice (id, org_id, student_id, amount, status, due, note, payment_code, pay_token, paid_amount, created_at) VALUES (?, ?, ?, 500000, 'unpaid', '2026-10-10', 'Ghi chú nội bộ', ?, ?, 0, 1000)",
			args: [invoiceId, orgIdValue, studentId, paymentCode, payToken],
		});
		await libsql.insert(orgBankLink).values({
			orgId: orgIdValue,
			companyXid: "company-pay-1",
			bankAccountXid: "ba-pay-1",
			status: "linked",
			brandName: "MBBank",
			bankBin: "970422",
			bankCode: "MB",
			accountNumber: "0123456789",
			accountHolderName: "NGUYEN VAN A",
		});
	});

	test("serves instructions without note/due for an unknown session", async () => {
		const res = await app.request(`/public/pay/${payToken}`);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body.orgName).toBe("Academy A");
		expect(body.studentName).toBe("Nguyễn Văn Bình");
		expect(body.amountDue).toBe(500000);
		expect(body.note).toBeUndefined();
		expect(body.due).toBeUndefined();
		expect(body.payable).toBe(true);
		const bank = body.bank as { brandName: string; accountNumber: string };
		expect(bank.brandName).toBe("MBBank");
		expect(String(body.memo)).toBe(paymentCode);
		expect(String(body.qrUrl)).toContain("vietqr.app/img");
	});

	test("unknown token is a generic 404", async () => {
		const res = await app.request("/public/pay/no-such-token-here");
		expect(res.status).toBe(404);
	});

	test("short tokens are rejected without a lookup", async () => {
		const res = await app.request("/public/pay/short");
		expect(res.status).toBe(404);
	});

	test("paid invoice answers payable=false with reason PAID", async () => {
		await libsql
			.update(invoice)
			.set({ status: "paid" })
			.where(eq(invoice.id, invoiceId));
		const res = await app.request(`/public/pay/${payToken}`);
		const body = (await res.json()) as { payable: boolean; reason?: string };
		expect(body.payable).toBe(false);
		expect(body.reason).toBe("PAID");
	});

	test("no linked account → payable=false with reason NO_BANK_LINK", async () => {
		// The previous test marked the invoice paid — restore an open state.
		await libsql
			.update(invoice)
			.set({ status: "unpaid" })
			.where(eq(invoice.id, invoiceId));
		const [link] = await libsql.select().from(orgBankLink).limit(1);
		await libsql
			.update(orgBankLink)
			.set({ status: "unlinked" })
			.where(eq(orgBankLink.orgId, link?.orgId ?? ""));
		const res = await app.request(`/public/pay/${payToken}`);
		const body = (await res.json()) as { payable: boolean; reason?: string };
		expect(body.payable).toBe(false);
		expect(body.reason).toBe("NO_BANK_LINK");
	});
});
