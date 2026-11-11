import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { organization } from "@teacher-os/db/schema/organization";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import {
	type BankHubClient,
	type BankHubContext,
	BankHubError,
	type BankHubMockTransaction,
} from "../lib/bank-hub/bank-hub-client";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const IPN_KEY = "ipn-key";

interface StubClientState {
	calls: Array<{
		bankAccountXid: string;
		transferType: string;
		amount: number;
		content: string;
	}>;
	result?: BankHubMockTransaction;
	error?: unknown;
}

function stubClient(state: StubClientState): BankHubClient {
	return {
		createCompany: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		getCompany: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		editCompany: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		createLinkToken: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		getBankAccount: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		listBankAccounts: async () => {
			throw new Error("not used in mock-transaction tests");
		},
		listTransactions: async () => ({ data: [] }),
		createMockTransaction: async (input) => {
			state.calls.push(input);
			if (state.error) throw state.error;
			return (
				state.result ?? {
					transactionId: "txn-1",
					referenceNumber: "FT261007",
					transactionDate: "2026-10-07 15:30:00",
					amount: input.amount,
					transferType: input.transferType,
					accumulated: input.amount,
				}
			);
		},
	};
}

async function makeApp(opts: {
	linkedXids?: string[];
	/** null disables Bank Hub entirely (getBankHub returns undefined). */
	hub?: BankHubContext | null;
	state: StubClientState;
}): Promise<{ app: ServerApp; db: Db }> {
	const client = createClient({ url: "file::memory:" });
	const libsql = drizzle(client, { schema });
	await migrate(libsql, { migrationsFolder: MIGRATIONS_DIR });

	// org-1..org-N with one linked account each — the unique index on
	// bank_account_xid makes the xids distinct by construction.
	for (const [index, xid] of (opts.linkedXids ?? []).entries()) {
		const orgId = `org-${index + 1}`;
		await libsql
			.insert(organization)
			.values({ id: orgId, name: `Academy ${index + 1}` });
		await libsql.insert(orgBankLink).values({
			orgId,
			companyXid: `company-${index + 1}`,
			bankAccountXid: xid,
			status: "linked",
		});
	}

	const hub =
		opts.hub ??
		({
			client: stubClient(opts.state),
			ipnApiKey: IPN_KEY,
			webhookSecret: "whsec",
			env: "sandbox",
		} satisfies BankHubContext);

	const app = buildApp({
		getDb: () => libsql as unknown as Db,
		corsOrigin: "http://localhost:8001",
		getSessionUser: async () => null,
		authHandler: () => new Response("auth stub", { status: 404 }),
		getBankHub: () => (opts.hub === null ? undefined : hub),
	});
	return { app, db: libsql as unknown as Db };
}

async function post(
	app: ServerApp,
	body: unknown,
	headers: Record<string, string> = { Authorization: `Apikey ${IPN_KEY}` },
): Promise<Response> {
	return app.request("/dev/bank-hub/mock-transaction", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

function baseBody(): Record<string, unknown> {
	return { amount: 500_000, content: "TOS1 hoc phi" };
}

describe("POST /dev/bank-hub/mock-transaction", () => {
	let state: StubClientState;

	beforeAll(() => {
		state = { calls: [] };
	});

	test("authenticates with the IPN Apikey header and resolves the single linked account", async () => {
		const { app } = await makeApp({
			linkedXids: ["ba-1"],
			state,
		});
		state.calls.length = 0;
		const res = await post(app, baseBody());
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			bankAccountXid: "ba-1",
			transactionId: "txn-1",
			referenceNumber: "FT261007",
			transactionDate: "2026-10-07 15:30:00",
			amount: 500_000,
			transferType: "credit",
			accumulated: 500_000,
		});
		expect(state.calls).toEqual([
			{
				bankAccountXid: "ba-1",
				transferType: "credit",
				amount: 500_000,
				content: "TOS1 hoc phi",
			},
		]);
	});

	test("passes an explicit bankAccountXid through without org lookup", async () => {
		const { app } = await makeApp({ state });
		state.calls.length = 0;
		const res = await post(app, {
			...baseBody(),
			transferType: "debit",
			amount: "75000",
			bankAccountXid: "ba-explicit",
		});
		expect(res.status).toBe(200);
		expect(state.calls[0]).toMatchObject({
			bankAccountXid: "ba-explicit",
			transferType: "debit",
			amount: 75_000,
		});
	});

	test("a missing, malformed or wrong key is a 401", async () => {
		const { app } = await makeApp({ state });
		expect((await post(app, baseBody(), {})).status).toBe(401);
		expect(
			(await post(app, baseBody(), { Authorization: "Bearer x" })).status,
		).toBe(401);
		expect(
			(await post(app, baseBody(), { Authorization: "Apikey wrong" })).status,
		).toBe(401);
		expect(
			(await post(app, baseBody(), { "X-Secret-Key": "whsec" })).status,
		).toBe(401);
	});

	test("answers 503 when Bank Hub is disabled and 403 outside sandbox", async () => {
		const disabled = await makeApp({ hub: null, state });
		expect((await post(disabled.app, baseBody())).status).toBe(503);

		const production = await makeApp({
			state,
			hub: {
				client: stubClient(state),
				ipnApiKey: IPN_KEY,
				webhookSecret: "whsec",
				env: "production",
			},
		});
		const res = await post(production.app, baseBody());
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			error: "SANDBOX_ONLY",
			code: "SANDBOX_ONLY",
		});
	});

	test("invalid json and schema violations are 400 with field paths", async () => {
		const { app } = await makeApp({ state });
		const badJson = await post(app, "{not json");
		expect(badJson.status).toBe(400);

		const res = await post(app, { amount: -1, content: "" });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { code: string; issues: unknown[] };
		expect(body.code).toBe("INVALID_BODY");
		expect(body.issues).toEqual([
			{ path: "amount", code: "too_small" },
			{ path: "content", code: "too_small" },
		]);
	});

	test("409 when no account is linked", async () => {
		const { app } = await makeApp({ state });
		const res = await post(app, baseBody());
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ code: "NO_LINKED_ACCOUNT" });
	});

	test("409 when several accounts are linked and no xid is given", async () => {
		const { app } = await makeApp({ linkedXids: ["ba-1", "ba-2"], state });
		const res = await post(app, baseBody());
		expect(res.status).toBe(409);
		expect(await res.json()).toMatchObject({ code: "AMBIGUOUS_ACCOUNT" });
	});

	test("429 keeps the Retry-After header and carries the upstream context", async () => {
		state.error = new BankHubError(429, "too many requests", {
			retryAfter: 30,
		});
		const { app } = await makeApp({ linkedXids: ["ba-1"], state });
		const res = await post(app, baseBody());
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("30");
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toMatchObject({
			code: "BANKHUB_RATE_LIMITED",
			upstreamStatus: 429,
			upstreamMessage: "too many requests",
		});
		state.error = undefined;
	});

	test("502 surfaces the upstream status and message for debugging", async () => {
		state.error = new BankHubError(400, "bank_account_xid not found");
		const { app } = await makeApp({ linkedXids: ["ba-1"], state });
		const res = await post(app, baseBody());
		expect(res.status).toBe(502);
		const body = (await res.json()) as Record<string, unknown>;
		expect(body).toMatchObject({
			code: "BANKHUB_UPSTREAM",
			upstreamStatus: 400,
			upstreamMessage: "bank_account_xid not found",
		});
		state.error = undefined;
	});
});
