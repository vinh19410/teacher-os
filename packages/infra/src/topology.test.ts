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
		});
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
