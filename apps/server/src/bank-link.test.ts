import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	session as authSession,
	user as authUser,
} from "@teacher-os/db/schema/auth";
import * as schema from "@teacher-os/db/schema/index";
import { membership } from "@teacher-os/db/schema/membership";
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

async function api(
	app: ServerApp,
	method: "GET" | "PUT" | "POST" | "DELETE",
	path: string,
	opts: { token?: string; body?: unknown } = {},
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (opts.token) headers.cookie = `better-auth.session_token=${opts.token}`;
	if (method !== "GET") {
		headers.origin = CORS_ORIGIN;
		if (opts.body !== undefined) {
			headers["content-type"] = "application/json";
		}
	}
	return app.request(path, {
		method,
		headers,
		...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
	});
}

describe("bank-link routes (SePay standard)", () => {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	let db: Db;
	let app: ServerApp;
	let userA: { userId: string; token: string };
	let userB: { userId: string; token: string };

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

	async function orgIdOf(userId: string): Promise<string> {
		const [row] = await libsql
			.select({ orgId: membership.orgId })
			.from(membership)
			.where(eq(membership.userId, userId));
		if (!row) throw new Error("no membership — bootstrap did not run");
		return row.orgId;
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
			getSepay: () => ({
				webhookSecret: "whsec",
				client: {
					listTransactions: async () => ({
						data: [],
						hasMore: false,
						currentPage: 1,
						lastPage: 1,
					}),
				},
			}),
		});
		userA = await insertUser("Teacher A");
		userB = await insertUser("Teacher B");
	});

	test("GET returns status=none initially and isolates orgs", async () => {
		const resA = await api(app, "GET", "/api/bank-link", {
			token: userA.token,
		});
		expect(resA.status).toBe(200);
		expect(await resA.json()).toEqual({
			enabled: true,
			reconcileEnabled: true,
			status: "none",
			brandName: "",
			bankBin: "",
			bankCode: "",
			accountNumber: "",
			accountNumberMasked: "",
			vaCode: "",
			holderName: "",
			linkedAt: null,
		});
	});

	test("PUT saves bank account, normalizes number, and populates bank metadata", async () => {
		const res = await api(app, "PUT", "/api/bank-link", {
			token: userA.token,
			body: {
				bankBin: "970422",
				accountNumber: "0123-456 789",
				vaCode: " mmy ",
				holderName: "  NGUYEN THI MY  ",
			},
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toMatchObject({
			enabled: true,
			reconcileEnabled: true,
			status: "linked",
			brandName: "MBBank",
			bankBin: "970422",
			bankCode: "MB",
			accountNumber: "0123456789",
			accountNumberMasked: "•••6789",
			vaCode: "MMY",
			holderName: "NGUYEN THI MY",
		});
		expect(typeof body.linkedAt).toBe("string");

		// Org B still sees none
		const resB = await api(app, "GET", "/api/bank-link", {
			token: userB.token,
		});
		expect((await resB.json()) as { status: string }).toMatchObject({
			status: "none",
		});
	});

	test("PUT rejects invalid bank BIN with 400", async () => {
		const res = await api(app, "PUT", "/api/bank-link", {
			token: userB.token,
			body: {
				bankBin: "999999",
				accountNumber: "1122334455",
				holderName: "Teacher B",
			},
		});
		expect(res.status).toBe(400);
		expect((await res.json()) as { code: string }).toMatchObject({
			code: "BANK_LINK_INVALID_BANK",
		});
	});

	test("PUT rejects account number + same VA already linked by another org with 409, allows distinct VA", async () => {
		const sameVaRes = await api(app, "PUT", "/api/bank-link", {
			token: userB.token,
			body: {
				bankBin: "970422",
				accountNumber: "0123456789",
				vaCode: "TKPMMY",
				holderName: "Teacher B",
			},
		});
		expect(sameVaRes.status).toBe(409);
		expect((await sameVaRes.json()) as { code: string }).toMatchObject({
			code: "BANK_LINK_ACCOUNT_ALREADY_IN_USE",
		});

		const emptyVaRes = await api(app, "PUT", "/api/bank-link", {
			token: userB.token,
			body: {
				bankBin: "970422",
				accountNumber: "0123456789",
				holderName: "Teacher B",
			},
		});
		expect(emptyVaRes.status).toBe(409);

		const distinctVaRes = await api(app, "PUT", "/api/bank-link", {
			token: userB.token,
			body: {
				bankBin: "970422",
				accountNumber: "0123456789",
				vaCode: "OTHER",
				holderName: "Teacher B",
			},
		});
		expect(distinctVaRes.status).toBe(200);
		expect((await distinctVaRes.json()) as { vaCode: string }).toMatchObject({
			vaCode: "OTHER",
		});
		await api(app, "DELETE", "/api/bank-link", { token: userB.token });
	});

	test("PUT updates account number and archives previous account in pastBankAccountXids", async () => {
		const orgIdA = await orgIdOf(userA.userId);
		const res = await api(app, "PUT", "/api/bank-link", {
			token: userA.token,
			body: {
				bankBin: "970415",
				accountNumber: "1098765432",
				holderName: "NGUYEN THI MY",
			},
		});
		expect(res.status).toBe(200);
		expect((await res.json()) as { brandName: string }).toMatchObject({
			brandName: "VietinBank",
			bankBin: "970415",
			accountNumber: "1098765432",
			accountNumberMasked: "•••5432",
		});

		const [row] = await libsql
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, orgIdA));
		expect(JSON.parse(row?.pastBankAccountXids ?? "[]")).toContain(
			"0123456789",
		);
	});

	test("DELETE unlinks current account and archives it; second DELETE returns 409", async () => {
		const orgIdA = await orgIdOf(userA.userId);
		const del = await api(app, "DELETE", "/api/bank-link", {
			token: userA.token,
		});
		expect(del.status).toBe(200);
		expect((await del.json()) as { status: string }).toMatchObject({
			status: "none",
			accountNumber: "",
			accountNumberMasked: "",
			vaCode: "",
		});

		const [row] = await libsql
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, orgIdA));
		expect(JSON.parse(row?.pastBankAccountXids ?? "[]")).toEqual(
			expect.arrayContaining(["0123456789", "1098765432"]),
		);

		const secondDel = await api(app, "DELETE", "/api/bank-link", {
			token: userA.token,
		});
		expect(secondDel.status).toBe(409);
		expect((await secondDel.json()) as { code: string }).toMatchObject({
			code: "BANK_LINK_NO_LINKED_ACCOUNT",
		});
	});

	test("returns 503 SEPAY_DISABLED when SePay is not configured", async () => {
		const bare = buildApp({
			getDb: () => db,
			corsOrigin: CORS_ORIGIN,
			getSessionUser: async (headers) => {
				const cookie = headers.get("cookie") ?? "";
				const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1];
				if (token !== userA.token) return null;
				const [row] = await libsql
					.select({
						userId: authSession.userId,
						expiresAt: authSession.expiresAt,
						userName: authUser.name,
					})
					.from(authSession)
					.innerJoin(authUser, eq(authSession.userId, authUser.id))
					.where(eq(authSession.token, token));
				if (!row) return null;
				return {
					userId: row.userId,
					userName: row.userName,
					role: "teacher" as const,
				};
			},
			authHandler: () => new Response("auth stub", { status: 404 }),
		});
		const res = await api(bare, "GET", "/api/bank-link", {
			token: userA.token,
		});
		expect(res.status).toBe(503);
		expect((await res.json()) as { code: string }).toMatchObject({
			code: "SEPAY_DISABLED",
		});
	});
});
