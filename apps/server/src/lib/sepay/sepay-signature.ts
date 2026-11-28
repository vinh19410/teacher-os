import { createHmac } from "node:crypto";
import { safeEqual } from "../safe-equal";

export const SEPAY_TIMESTAMP_TOLERANCE_SEC = 300;

const TIMESTAMP_RE = /^\d+$/;
const SIGNATURE_RE = /^sha256=[0-9a-f]{64}$/i;

export type SepaySignatureVerifyResult =
	| { ok: true }
	| {
			ok: false;
			reason:
				| "missing_headers"
				| "invalid_format"
				| "expired"
				| "invalid_signature";
	  };

/**
 * Tạo chữ ký HMAC-SHA256 chuẩn SePay Webhook:
 * `sha256=` + hex(HMAC_SHA256(secret, "{timestamp}.{rawBody}")).
 */
export function signSepayWebhook(
	secret: string,
	timestampSec: number,
	rawBody: string,
): string {
	const digest = createHmac("sha256", secret)
		.update(`${timestampSec}.${rawBody}`)
		.digest("hex");
	return `sha256=${digest}`;
}

/**
 * Xác thực chữ ký `X-SePay-Signature` và `X-SePay-Timestamp` trên raw request bytes.
 */
export function verifySepayWebhookSignature(input: {
	secret: string;
	signatureHeader: string;
	timestampHeader: string;
	rawBody: string;
	nowMs?: number;
	toleranceSec?: number;
}): SepaySignatureVerifyResult {
	const sig = input.signatureHeader.trim();
	const tsRaw = input.timestampHeader.trim();
	if (!sig || !tsRaw) {
		return { ok: false, reason: "missing_headers" };
	}
	if (!TIMESTAMP_RE.test(tsRaw) || !SIGNATURE_RE.test(sig)) {
		return { ok: false, reason: "invalid_format" };
	}
	const ts = Number(tsRaw);
	if (!Number.isSafeInteger(ts)) {
		return { ok: false, reason: "invalid_format" };
	}
	const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
	const tolerance = input.toleranceSec ?? SEPAY_TIMESTAMP_TOLERANCE_SEC;
	if (Math.abs(nowSec - ts) > tolerance) {
		return { ok: false, reason: "expired" };
	}
	const expected = signSepayWebhook(input.secret, ts, input.rawBody);
	if (!safeEqual(sig.toLowerCase(), expected)) {
		return { ok: false, reason: "invalid_signature" };
	}
	return { ok: true };
}
