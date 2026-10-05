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
import type { BankHubContext } from "../lib/bank-hub/bank-hub-client";
import {
	ensureCompany,
	maskAccount,
	type OrgBankLinkRow,
	syncFromBankHub,
} from "../lib/bank-hub/bank-link-service";

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
			row = (await syncFromBankHub(db, hub, ctx.orgId)) ?? row;
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
		const token = await hub.client.createLinkToken({
			companyXid: company.companyXid,
			purpose: PURPOSE_BY_REQUEST[body.data.purpose],
			...(body.data.purpose !== "link" && row?.bankAccountXid
				? { bankAccountXid: row.bankAccountXid }
				: {}),
		});
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
		const row = await syncFromBankHub(db, hub, ctx.orgId);
		return c.json(toStatus(row));
	});

	return router;
}
