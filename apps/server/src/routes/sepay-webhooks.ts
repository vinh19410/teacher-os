import { normalizeBankAccountNumber } from "@teacher-os/api/lib/vietnam-banks";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import { ingestTransaction } from "../lib/payments/ingest-transaction";
import type { SepayContext } from "../lib/sepay/sepay-client";
import { verifySepayWebhookSignature } from "../lib/sepay/sepay-signature";
import { sepayWebhookPayloadSchema } from "../lib/sepay/sepay-types";

/**
 * SePay inbound webhook (my.sepay.vn → Webhooks), mounted OUTSIDE /api/*
 * (no bootstrap middleware, no Better Auth).
 *
 * Auth: HMAC-SHA256 via `X-SePay-Signature` (`sha256=<hex>`) and
 * `X-SePay-Timestamp` (unix seconds) computed over `${timestamp}.${rawBody}`.
 * SePay expects HTTP 200/201 with JSON `{"success": true}` within 30s.
 */
export function sepayWebhookRoutes(deps: {
	getDb(): Db;
	getSepay?(): SepayContext | undefined;
	now?: () => Date;
}) {
	const router = new Hono();

	router.use("*", bodyLimit({ maxSize: 64 * 1024 }));

	router.post("/", async (c: Context) => {
		const sepay = deps.getSepay?.();
		if (!sepay) {
			return c.json({ error: "SEPAY_DISABLED" }, 503);
		}

		const rawBody = Buffer.from(await c.req.arrayBuffer()).toString("utf8");
		const check = verifySepayWebhookSignature({
			secret: sepay.webhookSecret,
			signatureHeader: c.req.header("X-SePay-Signature") ?? "",
			timestampHeader: c.req.header("X-SePay-Timestamp") ?? "",
			rawBody,
			nowMs: deps.now?.().getTime(),
		});
		if (!check.ok) {
			console.warn(`[sepay-webhook] rejected: ${check.reason}`);
			return c.json({ success: false, error: "unauthorized" }, 401);
		}

		let raw: unknown;
		try {
			raw = JSON.parse(rawBody);
		} catch {
			return c.json({ success: false, error: "invalid json" }, 400);
		}

		const parsed = sepayWebhookPayloadSchema.safeParse(raw);
		if (!parsed.success) {
			const candidate =
				typeof raw === "object" && raw !== null
					? (raw as { id?: unknown })
					: {};
			console.error(
				`[sepay-webhook] payload failed required-field validation (id=${typeof candidate.id === "number" || typeof candidate.id === "string" ? String(candidate.id) : "unknown"})`,
			);
			return c.json({ success: false, error: "invalid body" }, 400);
		}

		const tx = parsed.data;
		// Nút "Test send" trên my.sepay.vn gửi id=0 mẫu — ack 200 không ghi sổ cái.
		if (tx.id === "0") {
			return c.json({ success: true });
		}
		if (tx.transferType.trim().toLowerCase() !== "in") {
			return c.json({ success: true });
		}

		const content = (tx.content ?? "").trim() || (tx.description ?? "").trim();

		await ingestTransaction(
			deps.getDb(),
			{
				provider: "sepay",
				transactionId: tx.id,
				transferType: "in",
				amount: tx.transferAmount,
				accountNumber: normalizeBankAccountNumber(tx.accountNumber),
				subAccount: normalizeBankAccountNumber(tx.subAccount ?? ""),
				content,
				paymentCode: tx.code ?? null,
				referenceCode: (tx.referenceCode ?? "").trim(),
				transactionDate: (tx.transactionDate ?? "").trim(),
				rawJson: rawBody,
			},
			{ saveNoCode: false },
		);

		return c.json({ success: true });
	});

	return router;
}
