import { fileURLToPath } from "node:url";
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
import { buildApp, type Db, type ServerApp } from "./app";

const CORS_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../packages/db/src/migrations", import.meta.url).href,
);

describe("payment-transactions teacher routes (#320)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let orgId: string;
	let token: string;

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

		// Bootstrap org via any kernel route.
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

		await client.execute({
			sql: "INSERT INTO student (id, org_id, name, phone, email, zalo, created_at) VALUES ('stu-1', ?, 'Học viên', '0901', 's@test.local', '', 1000)",
			args: [orgId],
		});
		await libsql.insert(invoice).values({
			id: "inv-open",
			orgId,
			studentId: "stu-1",
			amount: 500000,
			status: "unpaid",
			paymentCode: "TOSOPEN0001",
			payToken: "tok-open-abc123def456ghi",
		});
		await libsql.insert(invoice).values({
			id: "inv-full",
			orgId,
			studentId: "stu-1",
			amount: 500000,
			status: "paid",
			paidAmount: 500000,
			paymentCode: "TOSFULL0001",
			payToken: "tok-full-abc123def456ghi",
		});
		await libsql.insert(paymentTransaction).values([
			{
				id: "tx-unknown",
				orgId,
				providerTxnId: "pt-1",
				amount: 100000,
				content: "TOSUNKNOWN9 hoc phi",
				paymentCode: "TOSUNKNOWN9",
				matchStatus: "unmatched",
				unmatchedReason: "unknown_code",
			},
			{
				id: "tx-foreign",
				orgId,
				providerTxnId: "pt-2",
				amount: 200000,
				content: "TOSOTHERORG1 noi dung org khac",
				paymentCode: "TOSOTHERORG1",
				matchStatus: "unmatched",
				unmatchedReason: "foreign_code",
			},
			{
				id: "tx-nocode",
				orgId,
				providerTxnId: "pt-3",
				amount: 300000,
				content: "chan ga goi an",
				matchStatus: "unmatched",
				unmatchedReason: "no_code",
			},
		]);
	});

	test("list returns unmatched with foreign_code redacted", async () => {
		const res = await api("GET", "/api/payment-transactions?status=unmatched");
		expect(res.status).toBe(200);
		const rows = (await res.json()) as Array<{
			id: string;
			content: string | null;
			paymentCode: string | null;
			unmatchedReason: string;
		}>;
		expect(rows.map((r) => r.id).sort()).toEqual([
			"tx-foreign",
			"tx-nocode",
			"tx-unknown",
		]);
		const foreign = rows.find((r) => r.id === "tx-foreign");
		expect(foreign?.content).toBeNull();
		expect(foreign?.paymentCode).toBeNull();
		const unknown = rows.find((r) => r.id === "tx-unknown");
		expect(unknown?.content).toContain("hoc phi");
	});

	test("assign moves money onto the invoice and recomputes the ledger", async () => {
		const res = await api(
			"POST",
			"/api/payment-transactions/tx-unknown/assign",
			{
				invoiceId: "inv-open",
			},
		);
		expect(res.status).toBe(200);
		const [row] = await libsql
			.select()
			.from(invoice)
			.where(eq(invoice.id, "inv-open"));
		expect(row?.paidAmount).toBe(100000);
		expect(row?.status).toBe("unpaid");
		const [tx] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.id, "tx-unknown"));
		expect(tx?.matchStatus).toBe("matched");
		expect(tx?.invoiceId).toBe("inv-open");
	});

	test("assign onto a fully paid invoice is a 409", async () => {
		const res = await api(
			"POST",
			"/api/payment-transactions/tx-nocode/assign",
			{
				invoiceId: "inv-full",
			},
		);
		expect(res.status).toBe(409);
	});

	test("assign twice is a 404 (transaction no longer unmatched)", async () => {
		const res = await api(
			"POST",
			"/api/payment-transactions/tx-unknown/assign",
			{
				invoiceId: "inv-open",
			},
		);
		expect(res.status).toBe(404);
	});

	test("ignore flips only unmatched rows of this org", async () => {
		const res = await api(
			"POST",
			"/api/payment-transactions/tx-foreign/ignore",
		);
		expect(res.status).toBe(200);
		const [row] = await libsql
			.select()
			.from(paymentTransaction)
			.where(eq(paymentTransaction.id, "tx-foreign"));
		expect(row?.matchStatus).toBe("ignored");

		const missing = await api(
			"POST",
			"/api/payment-transactions/tx-ghost/ignore",
		);
		expect(missing.status).toBe(404);
	});
});
