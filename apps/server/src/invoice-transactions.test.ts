import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("invoice transaction history (#345)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let teacherToken: string;
	let otherToken: string;
	let studentToken: string;

	function api(path: string, token?: string): Promise<Response> {
		return Promise.resolve(
			app.request(path, {
				headers: token ? { cookie: `better-auth.session_token=${token}` } : {},
			}),
		);
	}

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
		app = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const t = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (!t) return null;
				if (t === teacherToken)
					return {
						userId: "u-1",
						userName: "Teacher",
						role: "teacher" as const,
					};
				if (t === otherToken)
					return { userId: "u-2", userName: "Other", role: "teacher" as const };
				if (t === studentToken)
					return {
						userId: "u-3",
						userName: "Student",
						role: "student" as const,
					};
				return null;
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});

		teacherToken = crypto.randomUUID();
		otherToken = crypto.randomUUID();
		studentToken = crypto.randomUUID();
		await libsql.insert(authUser).values([
			{ id: "u-1", name: "Teacher", email: "u-1@test.local" },
			{ id: "u-2", name: "Other", email: "u-2@test.local" },
		]);
		await libsql.insert(authSession).values([
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: teacherToken,
				userId: "u-1",
			},
			{
				id: crypto.randomUUID(),
				expiresAt: new Date(Date.now() + 3600_000),
				token: otherToken,
				userId: "u-2",
			},
		]);

		// Bootstrap both orgs through the API (auto-creates org+membership).
		const boot = await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${teacherToken}` },
		});
		expect(boot.status).toBe(200);
		const otherBoot = await app.request("/api/kernel", {
			headers: { cookie: `better-auth.session_token=${otherToken}` },
		});
		expect(otherBoot.status).toBe(200);
		const m = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-1'",
		});
		orgId = (m.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', ?, 'Học viên', '0901', 's@test.local', '', 1000)",
			args: [orgId],
		});
		await libsql.insert(invoice).values([
			{
				id: "inv-tx",
				orgId,
				studentId: "stu-1",
				amount: 500000,
				status: "unpaid",
				paidAmount: 250000,
				paymentCode: "TOSTXINV01",
				payToken: "tok-tx-abc123def456ghijkl",
			},
			{
				// Same org, but never receives a transaction — empty-history case.
				id: "inv-empty",
				orgId,
				studentId: "stu-1",
				amount: 300000,
				status: "unpaid",
				paymentCode: "TOSTXINV02",
				payToken: "tok-tx-xyz789def012ghijkl",
			},
			{
				// Second invoice that owns the "other invoice" transaction.
				id: "inv-tx-2",
				orgId,
				studentId: "stu-1",
				amount: 400000,
				status: "unpaid",
				paymentCode: "TOSTXINV03",
				payToken: "tok-tx-def456ghi789jklmno",
			},
		]);

		await libsql.insert(paymentTransaction).values([
			{
				id: "tx-m-old",
				orgId,
				providerTxnId: "pt-m-old",
				amount: 50000,
				content: "TOSTXINV01 tra truoc",
				referenceCode: "FT50000",
				transactionDate: "2026-10-01 08:00:00",
				invoiceId: "inv-tx",
				matchStatus: "matched",
				createdAt: new Date("2026-10-01T08:00:00Z"),
			},
			{
				id: "tx-m-new",
				orgId,
				providerTxnId: "pt-m-new",
				amount: 200000,
				content: "TOSTXINV01 hoc phi thang 10",
				referenceCode: "FT200000",
				transactionDate: "2026-10-05 10:00:00",
				invoiceId: "inv-tx",
				matchStatus: "matched",
				createdAt: new Date("2026-10-05T10:00:00Z"),
			},
			{
				id: "tx-unmatched",
				orgId,
				providerTxnId: "pt-unmatched",
				amount: 999000,
				content: "TOSTXINV01 chua khop",
				matchStatus: "unmatched",
				unmatchedReason: "unknown_code",
			},
			{
				id: "tx-ignored",
				orgId,
				providerTxnId: "pt-ignored",
				amount: 111000,
				content: "khong lien quan",
				matchStatus: "ignored",
				unmatchedReason: "no_code",
			},
			{
				id: "tx-other-invoice",
				orgId,
				providerTxnId: "pt-other-inv",
				amount: 123000,
				content: "TOSTXINV03 cua hoa don khac",
				referenceCode: "FT123000",
				invoiceId: "inv-tx-2",
				matchStatus: "matched",
			},
		]);
	});

	test("unauthenticated requests are 401", async () => {
		const res = await api("/api/invoices/inv-tx/transactions");
		expect(res.status).toBe(401);
	});

	test("student role session is rejected with 403", async () => {
		const res = await api("/api/invoices/inv-tx/transactions", studentToken);
		expect(res.status).toBe(403);
		const body = (await res.json()) as { code?: string };
		// ACCOUNT_ERROR_CODES.STUDENT_ON_TEACHER_APP (value "ACCOUNT_STUDENT_ROLE").
		expect(body.code).toBe("ACCOUNT_STUDENT_ROLE");
	});

	test("unknown invoice id is a 404", async () => {
		const res = await api("/api/invoices/inv-ghost/transactions", teacherToken);
		expect(res.status).toBe(404);
	});

	test("another org gets an indistinguishable 404", async () => {
		const res = await api("/api/invoices/inv-tx/transactions", otherToken);
		expect(res.status).toBe(404);
	});

	test("returns only matched transactions of this invoice, newest first", async () => {
		const res = await api("/api/invoices/inv-tx/transactions", teacherToken);
		expect(res.status).toBe(200);
		const rows = (await res.json()) as Array<{
			id: string;
			amount: number;
			content: string;
			referenceCode: string;
			transactionDate: string;
			createdAt: string;
		}>;
		expect(rows.map((r) => r.id)).toEqual(["tx-m-new", "tx-m-old"]);
		expect(rows[0]).toMatchObject({
			id: "tx-m-new",
			amount: 200000,
			content: "TOSTXINV01 hoc phi thang 10",
			referenceCode: "FT200000",
			transactionDate: "2026-10-05 10:00:00",
		});
	});

	test("items expose display fields only — no raw, provider or internal ids", async () => {
		const res = await api("/api/invoices/inv-tx/transactions", teacherToken);
		const rows = (await res.json()) as Array<Record<string, unknown>>;
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(Object.keys(row).sort()).toEqual([
				"amount",
				"content",
				"createdAt",
				"id",
				"referenceCode",
				"transactionDate",
			]);
		}
	});

	test("createdAt is a parseable ISO string", async () => {
		const res = await api("/api/invoices/inv-tx/transactions", teacherToken);
		const rows = (await res.json()) as Array<{ createdAt: string }>;
		for (const row of rows) {
			expect(new Date(row.createdAt).toISOString()).toBe(row.createdAt);
		}
	});

	test("invoice without transactions returns an empty list", async () => {
		const res = await api("/api/invoices/inv-empty/transactions", teacherToken);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual([]);
	});
});
