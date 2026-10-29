import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import type { BankHubContext } from "../lib/bank-hub/bank-hub-client";
import {
	bankHubIpnSchema,
	bankHubWebhookEventSchema,
} from "../lib/bank-hub/bank-hub-types";
import { applyAccountEvent } from "../lib/bank-hub/bank-link-service";
import { ingestTransaction } from "../lib/payments/ingest-transaction";
import { safeEqual } from "../lib/safe-equal";

/**
 * SePay Bank Hub inbound webhooks, mounted OUTSIDE /api/* (no bootstrap
 * middleware, no Better Auth). SePay retries only on network errors, so the
 * handler answers {"success": true} for anything it chose to ignore — a 5xx
 * here means the event is gone forever.
 *
 * SePay delivers BOTH payload families to the ONE URL it knows for the
 * merchant, and the auth header decides the kind: `X-Secret-Key` for
 * lifecycle events (LINK_TOKEN_*, LINK_SESSION_*, BANK_ACCOUNT_*),
 * `Authorization: Apikey` for balance-change IPN. Sandbox pins the IPN target to the FIRST URL ever
 * registered and later /v1/webhook URL changes do not move it (observed
 * 2026-10-07: transactions kept arriving at the original path minutes after
 * a re-point), so both paths dispatch on the auth header — never on the
 * request path.
 */
export function bankHubWebhookRoutes(deps: {
	getDb(): Db;
	getBankHub?(): BankHubContext | undefined;
}) {
	const router = new Hono();

	router.use("*", bodyLimit({ maxSize: 64 * 1024 }));

	const handle = async (c: Context) => {
		const hub = deps.getBankHub?.();
		if (!hub) return c.json({ error: "BANKHUB_DISABLED" }, 503);
		const secret = c.req.header("X-Secret-Key") ?? "";
		const auth = c.req.header("Authorization") ?? "";
		const ipnKey = auth.startsWith("Apikey ")
			? auth.slice("Apikey ".length)
			: "";
		const lifecycle = safeEqual(secret, hub.webhookSecret);
		const ipn = !lifecycle && safeEqual(ipnKey, hub.ipnApiKey);
		if (!lifecycle && !ipn) return c.json({ error: "unauthorized" }, 401);
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		if (lifecycle) {
			const parsed = bankHubWebhookEventSchema.safeParse(raw);
			if (!parsed.success) {
				return c.json({ error: "invalid body" }, 400);
			}
			const event = parsed.data;
			if (!event.event.startsWith("BANK_ACCOUNT_")) {
				return c.json({ success: true });
			}
			const result = await applyAccountEvent(deps.getDb(), hub, event);
			return c.json({ success: true, applied: result === "applied" });
		}
		// Balance-change IPN (#320). SePay retries ONLY on network errors — a
		// 4xx or 5xx here means the transaction is never delivered again, so
		// the schema is deliberately loose (5 required fields) and org-
		// resolution API failures ack 200 instead of 500 (the reconciliation
		// sweep recovers).
		const parsed = bankHubIpnSchema.safeParse(raw);
		if (!parsed.success) {
			const candidate = raw as { transaction_id?: unknown };
			console.error(
				`[ipn] payload failed required-field validation (transaction_id=${typeof candidate.transaction_id === "string" ? candidate.transaction_id : "unknown"})`,
			);
			return c.json({ error: "invalid body" }, 400);
		}
		const tx = parsed.data;
		const result = await ingestTransaction(
			deps.getDb(),
			hub,
			{
				transactionId: tx.transaction_id,
				transferType: tx.transfer_type,
				amount: tx.amount,
				bankAccountXid: tx.bank_account_xid,
				content: tx.content,
				paymentCode: tx.payment_code ?? null,
				referenceCode: tx.reference_code ?? "",
				transactionDate: tx.transaction_date ?? "",
				rawJson: JSON.stringify(raw),
			},
			{ saveNoCode: false },
		);
		if (result === "api-error") {
			console.error(
				`[ipn] Bank Hub API failed during org resolution (transaction_id=${tx.transaction_id}) — recoverable via reconcile`,
			);
		}
		return c.json({ success: true });
	};

	// Both paths share the dispatcher — see the docblock for why the URL
	// SePay actually delivers to cannot be assumed from the config.
	router.post("/events", handle);
	router.post("/ipn", handle);

	return router;
}
