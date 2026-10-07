import {
	BANK_LINK_ERROR_CODES,
	type BankLinkStatus,
	bankLinkTokenRequestSchema,
	bankLinkTokenResponseSchema,
} from "@teacher-os/api/contracts";
import { isAllowedBankHubLinkOrigin } from "@teacher-os/api/lib/bank-hub-origins";
import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import {
	type BankHubContext,
	BankHubError,
	type BankHubLinkToken,
} from "../lib/bank-hub/bank-hub-client";
import {
	ensureCompany,
	maskAccount,
	type OrgBankLinkRow,
	syncFromBankHub,
} from "../lib/bank-hub/bank-link-service";
import {
	clientTransactionToIngest,
	ingestTransaction,
} from "../lib/payments/ingest-transaction";

type Env = { Variables: { kernelCtx: KernelCtx } };
type BankLinkContext = Context<Env>;

function statusOf(row: OrgBankLinkRow | undefined): BankLinkStatus["status"] {
	const status = row?.status;
	return status === "linked" || status === "inactive" || status === "unlinked"
		? status
		: "none";
}

function toStatus(row: OrgBankLinkRow | undefined): BankLinkStatus {
	return {
		enabled: true,
		status: statusOf(row),
		brandName: row?.brandName ?? "",
		accountNumberMasked: maskAccount(row?.accountNumber ?? ""),
		holderName: row?.accountHolderName ?? "",
		linkedAt: row?.linkedAt ? row.linkedAt.toISOString() : null,
	};
}

const PURPOSE_BY_REQUEST = {
	link: "LINK_BANK_ACCOUNT",
	unlink: "UNLINK_BANK_ACCOUNT",
	reactivate: "REACTIVATE_BANK_ACCOUNT",
} as const;

/**
 * Teacher-side bank-account linking, mounted under the kernel tree so every
 * write passes the kernel Origin/JSON CSRF guard and kernelCtx org scoping.
 */
export function bankLinkRoutes(deps: {
	getDb(): Db;
	getBankHub?(): BankHubContext | undefined;
}) {
	const router = new Hono<Env>();

	function unauthorized(c: BankLinkContext) {
		return c.json({ error: "unauthorized" }, 401);
	}

	async function readBody<S extends z.ZodType>(
		c: BankLinkContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	/**
	 * Client-safe mapping for a failed Bank Hub call: 429 keeps SePay's
	 * Retry-After, everything else is a 502. The upstream message stays in the
	 * server log — the response body only carries our stable error code.
	 */
	function bankHubFailure(c: BankLinkContext, err: BankHubError): Response {
		console.error(
			`[bank-hub] ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`,
		);
		if (err.status === 429) {
			c.header("Retry-After", String(err.retryAfter ?? 60));
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BANKHUB_RATE_LIMITED,
					code: BANK_LINK_ERROR_CODES.BANKHUB_RATE_LIMITED,
				},
				429,
			);
		}
		return c.json(
			{
				error: BANK_LINK_ERROR_CODES.BANKHUB_UPSTREAM,
				code: BANK_LINK_ERROR_CODES.BANKHUB_UPSTREAM,
			},
			502,
		);
	}

	router.get("/", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const hub = deps.getBankHub?.();
		if (!hub) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
					code: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
				},
				503,
			);
		}
		const db = deps.getDb();
		let [row] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);
		// ?refresh=1 re-checks account state against Bank Hub — the fallback
		// when the bank-side INACTIVED webhook was lost (SePay never retries
		// 5xx).
		if (c.req.query("refresh") === "1" && row?.companyXid) {
			try {
				row = (await syncFromBankHub(db, hub, ctx.orgId)) ?? row;
			} catch (err) {
				if (err instanceof BankHubError) return bankHubFailure(c, err);
				throw err;
			}
		}
		return c.json(toStatus(row));
	});

	router.post("/link-token", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const hub = deps.getBankHub?.();
		if (!hub) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
					code: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
				},
				503,
			);
		}
		const body = await readBody(c, bankLinkTokenRequestSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);
		// Server-side enforcement of "one active account per org" — the UI
		// hides the button, but this is the actual gate.
		if (
			body.data.purpose === "link" &&
			row?.status === "linked" &&
			row.bankAccountXid
		) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.ALREADY_LINKED,
					code: BANK_LINK_ERROR_CODES.ALREADY_LINKED,
				},
				409,
			);
		}
		if (body.data.purpose !== "link" && !row?.bankAccountXid) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.NO_LINKED_ACCOUNT,
					code: BANK_LINK_ERROR_CODES.NO_LINKED_ACCOUNT,
				},
				409,
			);
		}
		let token: BankHubLinkToken;
		try {
			const company = await ensureCompany(db, hub, ctx.orgId);
			if (!company.companyXid) {
				return c.json(
					{
						error: BANK_LINK_ERROR_CODES.COMPANY_SETTLING,
						code: BANK_LINK_ERROR_CODES.COMPANY_SETTLING,
					},
					409,
				);
			}
			token = await hub.client.createLinkToken({
				companyXid: company.companyXid,
				purpose: PURPOSE_BY_REQUEST[body.data.purpose],
				...(body.data.purpose !== "link" && row?.bankAccountXid
					? { bankAccountXid: row.bankAccountXid }
					: {}),
			});
		} catch (err) {
			if (err instanceof BankHubError) return bankHubFailure(c, err);
			throw err;
		}
		let origin: string;
		try {
			origin = new URL(token.hostedLinkUrl).origin;
		} catch {
			console.error("[bank-hub] hosted_link_url is not a valid URL");
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BAD_HOSTED_LINK_ORIGIN,
					code: BANK_LINK_ERROR_CODES.BAD_HOSTED_LINK_ORIGIN,
				},
				502,
			);
		}
		if (!isAllowedBankHubLinkOrigin(origin, hub.env)) {
			console.error(`[bank-hub] hosted_link_url origin not allowed: ${origin}`);
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BAD_HOSTED_LINK_ORIGIN,
					code: BANK_LINK_ERROR_CODES.BAD_HOSTED_LINK_ORIGIN,
				},
				502,
			);
		}
		return c.json(
			bankLinkTokenResponseSchema.parse({
				hostedLinkUrl: token.hostedLinkUrl,
				expiresAt: token.expiresAt,
			}),
		);
	});

	// Manual reconciliation sweep (#320): pulls recent credits for EVERY
	// account xid the org has ever linked (current + past_bank_account_xids)
	// and ingests them through the same path as the IPN — the safety net for
	// deliveries lost to 4xx/5xx (SePay never retries those).
	router.post("/reconcile", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const hub = deps.getBankHub?.();
		if (!hub) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
					code: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
				},
				503,
			);
		}
		const db = deps.getDb();
		const [row] = await db
			.select()
			.from(orgBankLink)
			.where(eq(orgBankLink.orgId, ctx.orgId))
			.limit(1);
		if (!row?.companyXid) {
			return c.json({ scanned: 0, matched: 0, unmatched: 0 });
		}
		const nowSec = Math.floor(Date.now() / 1000);
		if (nowSec - row.lastReconciledAt < 60) {
			return c.json(
				{ error: "reconcile cooldown", code: "RECONCILE_COOLDOWN" },
				429,
			);
		}

		let pastXids: string[] = [];
		try {
			const parsed: unknown = JSON.parse(row.pastBankAccountXids || "[]");
			if (Array.isArray(parsed)) {
				pastXids = parsed.filter((x): x is string => typeof x === "string");
			}
		} catch {
			pastXids = [];
		}
		const xids = Array.from(
			new Set(
				[row.bankAccountXid, ...pastXids].filter((x): x is string =>
					Boolean(x),
				),
			),
		);

		const startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000)
			.toISOString()
			.slice(0, 10);
		let scanned = 0;
		let matched = 0;
		let unmatched = 0;
		try {
			for (const xid of xids) {
				// per_page=100, max 5 pages per account (500 tx / 7 days ceiling).
				for (let page = 1; page <= 5; page += 1) {
					const result = await hub.client.listTransactions({
						bankAccountXid: xid,
						transferType: "credit",
						startDate,
						page,
						perPage: 100,
					});
					for (const transaction of result.data) {
						scanned += 1;
						const outcome = await ingestTransaction(
							db,
							hub,
							clientTransactionToIngest(transaction),
							{ saveNoCode: true },
						);
						if (outcome === "matched") matched += 1;
						else if (outcome === "unmatched") unmatched += 1;
					}
					const totalPages = result.meta?.totalPages ?? page;
					if (page >= totalPages) break;
				}
			}
		} catch (err) {
			if (err instanceof BankHubError) return bankHubFailure(c, err);
			throw err;
		}

		await db
			.update(orgBankLink)
			.set({ lastReconciledAt: nowSec, updatedAt: new Date() })
			.where(eq(orgBankLink.orgId, ctx.orgId));
		return c.json({ scanned, matched, unmatched });
	});

	router.post("/sync", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return unauthorized(c);
		const hub = deps.getBankHub?.();
		if (!hub) {
			return c.json(
				{
					error: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
					code: BANK_LINK_ERROR_CODES.BANKHUB_DISABLED,
				},
				503,
			);
		}
		const db = deps.getDb();
		let row: OrgBankLinkRow | undefined;
		try {
			row = await syncFromBankHub(db, hub, ctx.orgId);
		} catch (err) {
			if (err instanceof BankHubError) return bankHubFailure(c, err);
			throw err;
		}
		return c.json(toStatus(row));
	});

	return router;
}
