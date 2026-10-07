/**
 * Allowed origins for the SePay Bank Hub hosted-link iframe (#320). Single
 * source of truth: the server validates `hosted_link_url` against this list
 * and the web CSP `frame-src` is generated from it, so the two can never
 * drift. No runtime env — origin changes are a code change (SePay product
 * domain, rare).
 */
export const BANK_HUB_LINK_ORIGINS: readonly string[] = [
	"https://bankhub.sepay.vn",
	// The sandbox hosted-link lives on its own subdomain — drop either entry
	// and local linking 502s on origin validation.
	"https://bankhub-sandbox.sepay.vn",
];

/**
 * In sandbox mode (local dev, E2E fake page) a localhost origin is accepted
 * in addition to the production list — the E2E fake hosted-link page is
 * served from the API server itself.
 */
export function isAllowedBankHubLinkOrigin(
	origin: string,
	bankHubEnv: "sandbox" | "production",
): boolean {
	if (
		bankHubEnv === "sandbox" &&
		(origin.startsWith("http://localhost:") ||
			origin.startsWith("http://127.0.0.1:"))
	) {
		return true;
	}
	return BANK_HUB_LINK_ORIGINS.includes(origin);
}
