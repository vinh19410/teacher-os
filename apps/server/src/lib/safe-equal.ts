import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison for webhook secrets (#320). Different
 * lengths return false immediately (length is not secret material; SePay
 * keys are fixed per merchant) — timingSafeEqual itself throws on a length
 * mismatch, so guard before calling.
 */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "utf8");
	const bufB = Buffer.from(b, "utf8");
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}
