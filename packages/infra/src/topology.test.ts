import { describe, expect, it } from "vitest";
import { resolveDomainTopology } from "./topology";

describe("resolveDomainTopology", () => {
	it("derives the exact app/api origins for a bare domain", () => {
		expect(resolveDomainTopology("teacher-os.edu.vn")).toEqual({
			appHost: "app.teacher-os.edu.vn",
			apiHost: "api.teacher-os.edu.vn",
			appOrigin: "https://app.teacher-os.edu.vn",
			apiOrigin: "https://api.teacher-os.edu.vn",
			authBaseURL: "https://api.teacher-os.edu.vn/api/auth",
			googleRedirectURI:
				"https://api.teacher-os.edu.vn/api/auth/callback/google",
			cookieDomain: ".teacher-os.edu.vn",
			authCookiePrefix: undefined,
			appAliases: ["teacher-os.edu.vn", "www.teacher-os.edu.vn"],
		});
	});

	it("derives apex and www aliases for prod domain (issue #117)", () => {
		const topology = resolveDomainTopology("teacheros.io.vn");
		expect(topology.appAliases).toEqual([
			"teacheros.io.vn",
			"www.teacheros.io.vn",
		]);
	});

	it("derives app alias for staging domain", () => {
		const topology = resolveDomainTopology("staging.teacheros.io.vn");
		expect(topology.appAliases).toEqual(["staging.teacheros.io.vn"]);
	});

	it("scopes staging into its own auth cookie namespace (issue #125: staging nests inside the prod cookie zone)", () => {
		expect(
			resolveDomainTopology("staging.teacheros.io.vn").authCookiePrefix,
		).toBe("teacheros-staging");
	});

	it("keeps the prod domain on the default better-auth cookie namespace", () => {
		expect(
			resolveDomainTopology("teacheros.io.vn").authCookiePrefix,
		).toBeUndefined();
	});

	it("prefixes any other member of the prod cookie zone, not just the staging label", () => {
		expect(
			resolveDomainTopology("preview.teacheros.io.vn").authCookiePrefix,
		).toBe("teacheros-staging");
	});

	it("leaves unrelated zones on the default namespace (no shared cookie zone with prod)", () => {
		expect(
			resolveDomainTopology("teacher-os.edu.vn").authCookiePrefix,
		).toBeUndefined();
	});

	it("supports a multi-label domain", () => {
		const topology = resolveDomainTopology("teacher-os.example.co.uk");
		expect(topology.appOrigin).toBe("https://app.teacher-os.example.co.uk");
		expect(topology.cookieDomain).toBe(".teacher-os.example.co.uk");
	});

	it("rejects a domain with a scheme", () => {
		expect(() => resolveDomainTopology("https://teacher-os.edu.vn")).toThrow(
			/bare domain/,
		);
	});

	it("rejects a domain with a path", () => {
		expect(() => resolveDomainTopology("teacher-os.edu.vn/app")).toThrow(
			/bare domain/,
		);
	});

	it("rejects a leading dot", () => {
		expect(() => resolveDomainTopology(".teacher-os.edu.vn")).toThrow(
			/bare domain/,
		);
	});

	it("rejects a trailing dot", () => {
		expect(() => resolveDomainTopology("teacher-os.edu.vn.")).toThrow(
			/bare domain/,
		);
	});

	it("rejects a domain with a port", () => {
		expect(() => resolveDomainTopology("teacher-os.edu.vn:8443")).toThrow(
			/bare domain/,
		);
	});

	it("rejects uppercase domains", () => {
		expect(() => resolveDomainTopology("Teacher-OS.edu.vn")).toThrow(
			/lowercase/,
		);
	});

	it("rejects an empty domain", () => {
		expect(() => resolveDomainTopology("")).toThrow(/bare domain/);
	});

	it("rejects a whitespace-only domain", () => {
		expect(() => resolveDomainTopology("   ")).toThrow(/bare domain/);
	});

	it("rejects a domain with internal whitespace", () => {
		expect(() => resolveDomainTopology("teacher os.edu.vn")).toThrow(
			/bare domain/,
		);
	});
});
