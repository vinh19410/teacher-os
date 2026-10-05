import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { membership } from "@teacher-os/db/schema/membership";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("invoice payment instructions (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let teacherToken: string;
	let otherToken: string;
	let legacyInvoiceId: string;
	let orgIdValue: string;

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

	beforeAll(async () => {
		await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });
		db = libsql as unknown as Db;
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
		});

		const teacher = await insertUser("Teacher Pay");
		const other = await insertUser("Teacher Other");
		teacherToken = teacher.token;
		otherToken = other.token;

		// Bootstrap the teacher org through the API (auto-creates org+membership),
		// then read its id.
		const boot = await app.request("/api/kernel/settings", {
			headers: { cookie: `better-auth.session_token=${teacherToken}` },
		});
		expect(boot.status).toBe(200);
		const [membershipRow] = await libsql
			.select({ orgId: membership.orgId })
			.from(membership)
			.where(eq(membership.userId, teacher.userId));
		orgIdValue = membershipRow?.orgId ?? "";

		const studentId = crypto.randomUUID();
		legacyInvoiceId = crypto.randomUUID();
		// Legacy row: no payment_code/pay_token (pre-#320 invoice).
		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES (?, ?, 'Học viên C', '0902', 'c@example.com', '', 1000)",
			args: [studentId, orgIdValue],
		});
		// Legacy row: no payment_code/pay_token (pre-#320 invoice).
		await libsql.insert(invoice).values({
			id: legacyInvoiceId,
			orgId: orgIdValue,
			studentId,
			amount: 500000,
			status: "unpaid",
		});
		await libsql.insert(orgBankLink).values({
			orgId: orgIdValue,
			companyXid: "company-pay-2",
			bankAccountXid: "ba-pay-2",
			status: "linked",
			brandName: "MBBank",
			bankBin: "970422",
			bankCode: "MB",
			accountNumber: "0987654321",
			accountHolderName: "NGUYEN VAN B",
		});
	});

	function get(path: string, token?: string): Promise<Response> {
		return Promise.resolve(
			app.request(path, {
				headers: token ? { cookie: `better-auth.session_token=${token}` } : {},
			}),
		);
	}

	test("legacy invoice gets stable codes on first read", async () => {
		const res = await get(
			`/api/invoices/${legacyInvoiceId}/payment`,
			teacherToken,
		);
		expect(res.status).toBe(200);
		const first = (await res.json()) as {
			payToken: string;
			memo: string;
			qrUrl: string;
			paidAmount: number;
			amountDue: number;
		};
		expect(first.payToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
		expect(first.memo).toMatch(/^TOS[0-9A-HJKMNP-TV-Z]{8}$/);
		expect(first.qrUrl).toContain("amount=500000");
		expect(first.paidAmount).toBe(0);
		expect(first.amountDue).toBe(500000);

		const second = await get(
			`/api/invoices/${legacyInvoiceId}/payment`,
			teacherToken,
		);
		const again = (await second.json()) as { payToken: string; memo: string };
		expect(again.payToken).toBe(first.payToken);
		expect(again.memo).toBe(first.memo);
	});

	test("another org gets an indistinguishable 404", async () => {
		const boot = await app.request("/api/kernel/settings", {
			headers: { cookie: `better-auth.session_token=${otherToken}` },
		});
		expect(boot.status).toBe(200);
		const res = await get(
			`/api/invoices/${legacyInvoiceId}/payment`,
			otherToken,
		);
		expect(res.status).toBe(404);
	});

	test("unauthenticated requests are 401", async () => {
		const res = await get(`/api/invoices/${legacyInvoiceId}/payment`);
		expect(res.status).toBe(401);
	});

	test("student invoice endpoints reject anonymous callers with 401", async () => {
		const list = await app.request("/api/student/invoices");
		expect(list.status).toBe(401);
		const detail = await app.request(
			`/api/student/invoices/${legacyInvoiceId}/payment`,
		);
		expect(detail.status).toBe(401);
	});

	test("org id stays scoped when the linked row is missing", async () => {
		await libsql
			.update(orgBankLink)
			.set({ status: "none" })
			.where(eq(orgBankLink.orgId, orgIdValue));
		const res = await get(
			`/api/invoices/${legacyInvoiceId}/payment`,
			teacherToken,
		);
		const body = (await res.json()) as { payable: boolean; reason?: string };
		expect(body.payable).toBe(false);
		expect(body.reason).toBe("NO_BANK_LINK");
	});
});
