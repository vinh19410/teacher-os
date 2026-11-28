import { describe, expect, test } from "vitest";
import {
	SEPAY_TIMESTAMP_TOLERANCE_SEC,
	signSepayWebhook,
	verifySepayWebhookSignature,
} from "./sepay-signature";

describe("sepay-signature", () => {
	const secret = "test-webhook-secret-123";
	const rawBody = '{"id":92704,"transferType":"in","transferAmount":500000}';
	const nowMs = 1_700_000_000_000;
	const nowSec = Math.floor(nowMs / 1000);

	test("accepts a valid HMAC-SHA256 signature within tolerance", () => {
		const sig = signSepayWebhook(secret, nowSec, rawBody);
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: sig,
				timestampHeader: String(nowSec),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: true });
	});

	test("accepts uppercase sha256 hex signature", () => {
		const sig = signSepayWebhook(secret, nowSec, rawBody).toUpperCase();
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: sig,
				timestampHeader: String(nowSec),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: true });
	});

	test("rejects missing headers", () => {
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: "",
				timestampHeader: String(nowSec),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "missing_headers" });

		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: signSepayWebhook(secret, nowSec, rawBody),
				timestampHeader: "",
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "missing_headers" });
	});

	test("rejects malformed timestamp or signature format", () => {
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: "bad-sig",
				timestampHeader: String(nowSec),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "invalid_format" });

		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: signSepayWebhook(secret, nowSec, rawBody),
				timestampHeader: "not-a-number",
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "invalid_format" });
	});

	test("rejects expired timestamps beyond 5 minutes", () => {
		const expiredTs = nowSec - (SEPAY_TIMESTAMP_TOLERANCE_SEC + 1);
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: signSepayWebhook(secret, expiredTs, rawBody),
				timestampHeader: String(expiredTs),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "expired" });
	});

	test("rejects tampered body or wrong secret", () => {
		const sig = signSepayWebhook(secret, nowSec, rawBody);
		expect(
			verifySepayWebhookSignature({
				secret,
				signatureHeader: sig,
				timestampHeader: String(nowSec),
				rawBody: rawBody.replace("500000", "900000"),
				nowMs,
			}),
		).toEqual({ ok: false, reason: "invalid_signature" });

		expect(
			verifySepayWebhookSignature({
				secret: "wrong-secret",
				signatureHeader: sig,
				timestampHeader: String(nowSec),
				rawBody,
				nowMs,
			}),
		).toEqual({ ok: false, reason: "invalid_signature" });
	});
});
