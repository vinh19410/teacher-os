import { Hono } from "hono";
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
 * Currently: BANK_ACCOUNT_* lifecycle events (phase 2). The IPN
 * balance-change route (phase 4) joins this file.
 */
export function bankHubWebhookRoutes(deps: {
	getDb(): Db;
	getBankHub?(): BankHubContext | undefined;
}) {
	const router = new Hono();

	router.use("*", bodyLimit({ maxSize: 64 * 1024 }));

	router.post("/events", async (c) => {
		const hub = deps.getBankHub?.();
		if (!hub) return c.json({ error: "BANKHUB_DISABLED" }, 503);
		const provided = c.req.header("X-Secret-Key") ?? "";
		if (!safeEqual(provided, hub.webhookSecret)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
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
	});

	// Balance-change IPN (#320). SePay retries ONLY on network errors — a 4xx
	// or 5xx here means the transaction is never delivered again, so the
	// schema is deliberately loose (5 required fields) and org-resolution API
	// failures ack 200 instead of 500 (the reconciliation sweep recovers).
	router.post("/ipn", async (c) => {
		const hub = deps.getBankHub?.();
		if (!hub) return c.json({ error: "BANKHUB_DISABLED" }, 503);
		const auth = c.req.header("Authorization") ?? "";
		const providedKey = auth.startsWith("Apikey ")
			? auth.slice("Apikey ".length)
			: "";
		if (!safeEqual(providedKey, hub.ipnApiKey)) {
			return c.json({ error: "unauthorized" }, 401);
		}
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
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
	});

	return router;
}
