import { BANK_HUB_LINK_ORIGINS } from "@teacher-os/api/lib/bank-hub-origins";
import { describe, expect, it } from "vitest";
import { applySecurityHeaders, shouldRedirectHost } from "./security-headers";

describe("shouldRedirectHost (issue #117)", () => {
	it("returns null for localhost, 127.0.0.1, and loopback domains", () => {
		expect(
			shouldRedirectHost(new Request("http://localhost:8001/")),
		).toBeNull();
		expect(
			shouldRedirectHost(new Request("http://127.0.0.1:8001/dashboard")),
		).toBeNull();
		expect(
			shouldRedirectHost(new Request("http://0.0.0.0:8001/dashboard")),
		).toBeNull();
		expect(
			shouldRedirectHost(new Request("http://myhost.localhost:8001/")),
		).toBeNull();
	});

	it("returns null when already on canonical appHost", () => {
		expect(
			shouldRedirectHost(new Request("https://app.teacheros.io.vn/dashboard")),
		).toBeNull();
		expect(
			shouldRedirectHost(
				new Request("https://app.staging.teacheros.io.vn/login"),
			),
		).toBeNull();
	});

	it("redirects apex domain to canonical app host with https", () => {
		expect(shouldRedirectHost(new Request("http://teacheros.io.vn/"))).toBe(
			"https://app.teacheros.io.vn/",
		);
		expect(
			shouldRedirectHost(new Request("https://teacheros.io.vn/students")),
		).toBe("https://app.teacheros.io.vn/students");
		expect(
			shouldRedirectHost(
				new Request("https://TEACHEROS.IO.VN/classes?tab=active"),
			),
		).toBe("https://app.teacheros.io.vn/classes?tab=active");
	});

	it("redirects www domain to canonical app host with https", () => {
		expect(shouldRedirectHost(new Request("http://www.teacheros.io.vn/"))).toBe(
			"https://app.teacheros.io.vn/",
		);
		expect(
			shouldRedirectHost(new Request("https://www.teacheros.io.vn/tuition")),
		).toBe("https://app.teacheros.io.vn/tuition");
	});

	it("redirects staging domain to app.staging host", () => {
		expect(
			shouldRedirectHost(new Request("http://staging.teacheros.io.vn/")),
		).toBe("https://app.staging.teacheros.io.vn/");
		expect(
			shouldRedirectHost(
				new Request("https://staging.teacheros.io.vn/schedule"),
			),
		).toBe("https://app.staging.teacheros.io.vn/schedule");
		expect(
			shouldRedirectHost(
				new Request("https://www.staging.teacheros.io.vn/reports"),
			),
		).toBe("https://app.staging.teacheros.io.vn/reports");
	});

	it("strips redundant www.app prefix", () => {
		expect(
			shouldRedirectHost(new Request("https://www.app.teacheros.io.vn/")),
		).toBe("https://app.teacheros.io.vn/");
		expect(
			shouldRedirectHost(
				new Request("https://www.app.staging.teacheros.io.vn/dashboard"),
			),
		).toBe("https://app.staging.teacheros.io.vn/dashboard");
	});
});

describe("applySecurityHeaders (issue #203)", () => {
	it("drops CSP for local dev but keeps the other headers", () => {
		const headers = applySecurityHeaders(
			new Request("http://localhost:8001/dashboard"),
			new Headers({ "Content-Type": "text/html" }),
		);
		expect(headers.get("content-security-policy")).toBeNull();
		expect(headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(headers.get("x-frame-options")).toBe("DENY");
	});

	it("keeps the full CSP for real hosts", () => {
		const headers = applySecurityHeaders(
			new Request("https://app.teacheros.io.vn/dashboard"),
			new Headers({ "Content-Type": "text/html" }),
		);
		expect(headers.get("content-security-policy")).toContain(
			"script-src 'self'",
		);
		expect(headers.get("content-security-policy")).toContain(
			"media-src 'self' blob:",
		);
	});
});

describe("CSP frame-src for the Bank Hub hosted link (#320)", () => {
	it("allows exactly the shared BANK_HUB_LINK_ORIGINS", () => {
		const headers = applySecurityHeaders(
			// CSP là global (không route-scoped) — URL mẫu là /profile sau khi
			// route /payments gỡ (#338).
			new Request("https://app.teacheros.io.vn/profile"),
			new Headers({ "Content-Type": "text/html" }),
		);
		const csp = headers.get("content-security-policy") ?? "";
		expect(csp).toContain("frame-src https://bankhub.sepay.vn");
		expect(csp).toContain("https://bankhub-sandbox.sepay.vn;");
		// Sourced from the same const the server validates against.
		expect(csp).toContain(BANK_HUB_LINK_ORIGINS.join(" "));
	});
});
