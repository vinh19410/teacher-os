/**
 * Transfer-memo payment codes (#320): `TOS` + 8 chars. Banks may drop `-`
 * and change letter case (SePay fact sheet), so the alphabet excludes
 * ambiguous glyphs (no I/L/O/U) and matching is case-insensitive with a
 * word boundary — "TOSHIBA123" must not extract a code.
 */
export const PAYMENT_CODE_RE = /\bTOS[0-9A-HJKMNP-TV-Z]{8}\b/i;

/** Loose scan of arbitrary transfer content ("sevqr tos7k2m9qxa hoc phi"). */
export function extractPaymentCode(text: string): string | null {
	const match = PAYMENT_CODE_RE.exec(text);
	if (!match) return null;
	return match[0].toUpperCase();
}

/** 32^8 ≈ 1.1e12 combinations; the invoice table also holds a unique index. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomSuffix(): string {
	let suffix = "";
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	for (let i = 0; i < 8; i += 1) {
		const byte = bytes[i] ?? 0;
		suffix += CODE_ALPHABET[byte % CODE_ALPHABET.length];
	}
	return suffix;
}

/** Secure-random code — WebCrypto works on Workers, browsers and Node 19+. */
export function generatePaymentCode(): string {
	return `TOS${randomSuffix()}`;
}

/** 128-bit URL-safe token for the public /pay/<token> link. */
export function generatePayToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}
