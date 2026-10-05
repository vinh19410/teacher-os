import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import type { BankHubContext } from "../lib/bank-hub/bank-hub-client";
import { bankHubWebhookEventSchema } from "../lib/bank-hub/bank-hub-types";
import { applyAccountEvent } from "../lib/bank-hub/bank-link-service";
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

	return router;
}
