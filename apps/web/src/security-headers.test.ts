import { describe, expect, it } from "vitest";
import { shouldRedirectHost } from "./security-headers";

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
