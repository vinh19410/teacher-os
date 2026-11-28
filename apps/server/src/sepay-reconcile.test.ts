import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { invoice } from "@teacher-os/db/schema/invoice";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { paymentTransaction } from "@teacher-os/db/schema/payment-transaction";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "./app";
import {
	type SepayClient,
	type SepayContext,
	SepayError,
	type SepayTransaction,
	type SepayTransactionPage,
} from "./lib/sepay/sepay-client";
import { signSepayWebhook } from "./lib/sepay/sepay-signature";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);
const WEBHOOK_SECRET = "reconcile-webhook-secret";

describe("SePay API v2 reconcile & cross-channel dedup (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let token: string;
	let pages: SepayTransactionPage[] = [];
	let rateLimited = false;

	function txV2(overrides: Partial<SepayTransaction> = {}): SepayTransaction {
		return {
			id: "uuid-v2-1",
			transactionDate: "2026-10-05 10:00:00",
			accountNumber: "0123456789",
			va: "",
			transferType: "in",
			amountIn: 200000,
			amountOut: 0,
			accumulated: 200000,
			transactionContent: "TOS7K2M9QXA hoc phi",
			referenceNumber: "FT-RECON-1",
			code: null,
			bankBrandName: "MBBank",
			bankAccountId: "ba-1",
			vaId: "",
			webhookSuccess: false,
			...overrides,
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

		const sepayClient: SepayClient = {
			listTransactions: async (input) => {
				if (rateLimited) {
					throw new SepayError(429, "rate limited", { retryAfter: 30 });
				}
				return (
					pages[(input.page ?? 1) - 1] ?? {
						data: [],
						hasMore: false,
						currentPage: 1,
						lastPage: 1,
					}
				);
			},
		};

		const sepay: SepayContext = {
			webhookSecret: WEBHOOK_SECRET,
			client: sepayClient,
		};

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
			getSepay: () => sepay,
		});

		const boot = await api("/api/kernel");
		expect(boot.status).toBe(200);
		const m = await client.execute({
			sql: "SELECT org_id FROM membership WHERE user_id = 'u-1'",
		});
		orgId = (m.rows[0] as { org_id: string } | undefined)?.org_id ?? "";

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', ?, 'HV', '0901', 's@t.local', '', 1)",
			args: [orgId],
		});
		await libsql.insert(invoice).values({
			id: "inv-1",
			orgId,
			studentId: "stu-1",
			amount: 500000,
			status: "unpaid",
			paymentCode: "TOS7K2M9QXA",
			payToken: "tok-recon-1234567890",
		});

		await libsql.insert(orgBankLink).values({
			orgId,
			status: "linked",
			brandName: "MBBank",
			bankBin: "970422",
			bankCode: "MB",
			accountNumber: "0123456789",
			accountHolderName: "TEACHER",
			pastBankAccountXids: JSON.stringify(["0999888777"]),
		});
	});

	test("sweeps current + past accounts, saves no_code rows, and ignores foreign accounts", async () => {
		pages = [
			{
				data: [
					txV2({
						id: "uuid-1",
						accountNumber: "0123456789",
						amountIn: 200000,
						transactionContent: "TOS7K2M9QXA hoc phi",
						referenceNumber: "FT-1",
					}),
					txV2({
						id: "uuid-2",
						accountNumber: "0999888777",
						amountIn: 150000,
						transactionContent: "chan ga goi an ngon",
						referenceNumber: "FT-2",
					}),
					txV2({
						id: "uuid-stray",
						accountNumber: "5555555555",
						amountIn: 999000,
						transactionContent: "TOS7K2M9QXA",
						referenceNumber: "FT-STRAY",
					}),
				],
				hasMore: false,
				currentPage: 1,
				lastPage: 1,
			},
		];

		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			scanned: 2,
			matched: 1,
			unmatched: 1,
		});

		const [nocode] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.providerTxnId, "uuid-2"));
		expect(nocode?.matchStatus).toBe("unmatched");
		expect(nocode?.unmatchedReason).toBe("no_code");
	});

	test("webhook arriving after reconcile (different id, same reference+amount+date) does not double-count", async () => {
		const rawBody = JSON.stringify({
			id: 92704,
			gateway: "MBBank",
			transactionDate: "2026-10-05 10:00:00",
			accountNumber: "0123456789",
			subAccount: "",
			code: null,
			content: "TOS7K2M9QXA hoc phi",
			transferType: "in",
			transferAmount: 200000,
			referenceCode: "FT-1",
		});
		const ts = Math.floor(Date.now() / 1000);
		const sig = signSepayWebhook(WEBHOOK_SECRET, ts, rawBody);
		const res = await app.request("/webhooks/sepay", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-SePay-Signature": sig,
				"X-SePay-Timestamp": String(ts),
			},
			body: rawBody,
		});
		expect(res.status).toBe(200);

		const [inv] = await libsql
			.select()
			.from(invoice)
			.where(eq(invoice.id, "inv-1"));
		expect(inv?.paidAmount).toBe(200000);
	});

	test("cooldown inside 60s returns 429 RECONCILE_COOLDOWN", async () => {
		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(429);
		expect(await res.json()).toEqual({
			error: "reconcile cooldown",
			code: "RECONCILE_COOLDOWN",
		});
	});

	test("SePay API 429 surfaces as 429 SEPAY_RATE_LIMITED with Retry-After", async () => {
		await libsql
			.update(orgBankLink)
			.set({ lastReconciledAt: Math.floor(Date.now() / 1000) - 120 })
			.where(eq(orgBankLink.orgId, orgId));
		rateLimited = true;
		try {
			const res = await api("/api/bank-link/reconcile", {});
			expect(res.status).toBe(429);
			expect(res.headers.get("retry-after")).toBe("30");
			expect(await res.json()).toEqual({
				error: "SEPAY_RATE_LIMITED",
				code: "SEPAY_RATE_LIMITED",
			});
		} finally {
			rateLimited = false;
		}
	});

	test("returns 503 SEPAY_RECONCILE_DISABLED when apiToken/client is missing", async () => {
		const noClientApp = buildApp({
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
			getSepay: () => ({ webhookSecret: WEBHOOK_SECRET }),
		});
		const res = await noClientApp.request("/api/bank-link/reconcile", {
			method: "POST",
			headers: {
				cookie: `better-auth.session_token=${token}`,
				origin: CORS_ORIGIN,
				"content-type": "application/json",
			},
			body: "{}",
		});
		expect(res.status).toBe(503);
		expect(await res.json()).toEqual({
			error: "SEPAY_RECONCILE_DISABLED",
			code: "SEPAY_RECONCILE_DISABLED",
		});
	});

	test("filters out non-VA personal credits when org configures vaCode=MMY", async () => {
		await libsql
			.update(orgBankLink)
			.set({
				vaCode: "MMY",
				pastBankAccountXids: "[]",
				lastReconciledAt: 0,
			})
			.where(eq(orgBankLink.orgId, orgId));
		await libsql.insert(invoice).values({
			id: "inv-va-2",
			orgId,
			studentId: "stu-1",
			amount: 400000,
			status: "unpaid",
			paymentCode: "MSMY8888AAAA",
			payToken: "tok-va-2-1234567890",
		});

		pages = [
			{
				data: [
					txV2({
						id: "uuid-va-personal",
						accountNumber: "0123456789",
						va: "",
						amountIn: 300000,
						transactionContent: "chuyen khoan ca nhan",
						referenceNumber: "FT-PERSONAL",
					}),
					txV2({
						id: "uuid-va-other",
						accountNumber: "0123456789",
						va: "OTHER",
						amountIn: 300000,
						transactionContent: "TKPOTHER MSMY8888AAAA",
						referenceNumber: "FT-OTHER-VA",
					}),
					txV2({
						id: "uuid-va-match",
						accountNumber: "0123456789",
						va: "MMY",
						amountIn: 400000,
						transactionContent: "TKPMMY MSMY8888AAAA",
						referenceNumber: "FT-VA-MATCH",
					}),
				],
				hasMore: false,
				currentPage: 1,
				lastPage: 1,
			},
		];

		const res = await api("/api/bank-link/reconcile", {});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			scanned: 1,
			matched: 1,
			unmatched: 0,
		});

		const [inv] = await libsql
			.select()
			.from(invoice)
			.where(eq(invoice.id, "inv-va-2"));
		expect(inv?.paidAmount).toBe(400000);
		expect(inv?.status).toBe("paid");
	});
});
