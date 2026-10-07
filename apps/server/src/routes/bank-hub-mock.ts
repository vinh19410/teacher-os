import { orgBankLink } from "@teacher-os/db/schema/org-bank-link";
import { and, eq, isNotNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Db } from "../app";
import {
	type BankHubContext,
	BankHubError,
	type BankHubMockTransaction,
} from "../lib/bank-hub/bank-hub-client";
import { safeEqual } from "../lib/safe-equal";

type Env = { Variables: Record<string, never> };
type MockContext = Context<Env>;

/**
 * Postman-facing wrapper for SePay's sandbox mock-transaction API
 * (POST /v1/transaction/create, docs: "Giả lập giao dịch"). Mounted OUTSIDE
 * /api/* like the webhooks — no session cookie, auth is the same
 * `Authorization: Apikey <SEPAY_BANKHUB_IPN_API_KEY>` the IPN uses, so the
 * call works from curl/Postman against local or the deployed worker.
 *
 * Sandbox-only by design: production SePay answers 403 for this endpoint, and
 * creating fake money movements must never be one config slip away. When
 * `bankAccountXid` is omitted the server fills in the org's single linked
 * account — the xid is otherwise only readable in the dashboard or D1.
 */
export function bankHubMockRoutes(deps: {
	getDb(): Db;
	getBankHub?(): BankHubContext | undefined;
}) {
	const router = new Hono<Env>();

	router.use("*", bodyLimit({ maxSize: 64 * 1024 }));

	const requestSchema = z.object({
		amount: z.coerce.number().positive(),
		content: z.string().min(1),
		transferType: z.enum(["credit", "debit"]).default("credit"),
		bankAccountXid: z.string().min(1).optional(),
	});

	router.post("/mock-transaction", async (c: MockContext) => {
		const hub = deps.getBankHub?.();
		if (!hub) return c.json({ error: "BANKHUB_DISABLED" }, 503);
		const auth = c.req.header("Authorization") ?? "";
		const ipnKey = auth.startsWith("Apikey ")
			? auth.slice("Apikey ".length)
			: "";
		if (!ipnKey || !safeEqual(ipnKey, hub.ipnApiKey)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		if (hub.env !== "sandbox") {
			return c.json({ error: "SANDBOX_ONLY", code: "SANDBOX_ONLY" }, 403);
		}
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = requestSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json(
				{
					error: "invalid body",
					code: "INVALID_BODY",
					issues: parsed.error.issues.map((i) => ({
						path: i.path.join("."),
						code: i.code,
					})),
				},
				400,
			);
		}
		const input = parsed.data;

		let bankAccountXid = input.bankAccountXid;
		if (!bankAccountXid) {
			const linked = await deps
				.getDb()
				.select({ xid: orgBankLink.bankAccountXid })
				.from(orgBankLink)
				.where(
					and(
						eq(orgBankLink.status, "linked"),
						isNotNull(orgBankLink.bankAccountXid),
					),
				);
			if (linked.length === 0) {
				return c.json(
					{
						error: "no linked account — pass bankAccountXid explicitly",
						code: "NO_LINKED_ACCOUNT",
					},
					409,
				);
			}
			if (linked.length > 1) {
				return c.json(
					{
						error: "multiple linked accounts — pass bankAccountXid explicitly",
						code: "AMBIGUOUS_ACCOUNT",
					},
					409,
				);
			}
			bankAccountXid = linked[0]?.xid ?? undefined;
		}
		if (!bankAccountXid) {
			return c.json({ error: "invalid body", code: "INVALID_BODY" }, 400);
		}

		let transaction: BankHubMockTransaction;
		try {
			transaction = await hub.client.createMockTransaction({
				bankAccountXid,
				transferType: input.transferType,
				amount: input.amount,
				content: input.content,
			});
		} catch (err) {
			// Dev-tool error mapping: unlike the teacher-facing bank-link routes,
			// the upstream message travels to the caller — the audience is the
			// developer debugging SePay from Postman, not an end user.
			if (err instanceof BankHubError) {
				console.error(
					`[bank-hub-mock] ${err.status}${err.code ? ` ${err.code}` : ""}: ${err.message}`,
				);
				if (err.status === 429) {
					c.header("Retry-After", String(err.retryAfter ?? 60));
					return c.json(
						{
							error: "BANKHUB_RATE_LIMITED",
							code: "BANKHUB_RATE_LIMITED",
							upstreamStatus: err.status,
							upstreamMessage: err.message,
						},
						429,
					);
				}
				return c.json(
					{
						error: "BANKHUB_UPSTREAM",
						code: "BANKHUB_UPSTREAM",
						upstreamStatus: err.status,
						upstreamMessage: err.message,
					},
					502,
				);
			}
			throw err;
		}
		return c.json({ bankAccountXid, ...transaction });
	});

	return router;
}
