/**
 * Transfer-memo payment codes (#320): `MSMY` + 8 chars (also accepts legacy `TOS`
 * + 8 chars). Banks may drop `-` and change letter case (SePay fact sheet), so
 * the alphabet excludes ambiguous glyphs (no I/L/O/U) and matching is
 * case-insensitive with boundaries — "TOSHIBA123" must not extract a code.
 */
export const PAYMENT_CODE_PREFIX = "MSMY";
export const PAYMENT_CODE_RE = /\b(?:MSMY|TOS)[0-9A-HJKMNP-TV-Z]{8}\b/i;

/** Fallback when bank/parent strips the space after `TKP<VA>`, e.g. `TKPMMYMSMY7K2M9QXA`. */
const GLUED_TKP_MSMY_RE =
	/(?:^|[^A-Z0-9])TKP[A-Z0-9]{2,17}(MSMY[0-9A-HJKMNP-TV-Z]{8})(?=$|[^A-Z0-9])/i;

/** Loose scan of arbitrary transfer content ("TKPMMY msmy7k2m9qxa hoc phi"). */
export function extractPaymentCode(text: string): string | null {
	const match = PAYMENT_CODE_RE.exec(text);
	if (match) return match[0].toUpperCase();
	const glued = GLUED_TKP_MSMY_RE.exec(text);
	if (glued?.[1]) return glued[1].toUpperCase();
	return null;
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
	return `${PAYMENT_CODE_PREFIX}${randomSuffix()}`;
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
