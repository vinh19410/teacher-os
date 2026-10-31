import { describe, expect, it, test } from "vitest";
import {
	PROD_APP_DOMAIN,
	resolveAssumeEmailVerified,
	resolveDomainTopology,
	resolveTeacherEmails,
} from "./topology";

describe("resolveDomainTopology", () => {
	it("derives the exact app/api origins for a bare domain", () => {
		expect(resolveDomainTopology("teacher-os.edu.vn")).toEqual({
			appHost: "app.teacher-os.edu.vn",
			apiHost: "api.teacher-os.edu.vn",
			appOrigin: "https://app.teacher-os.edu.vn",
			studentHost: "student.teacher-os.edu.vn",
			studentOrigin: "https://student.teacher-os.edu.vn",
			adminHost: "admin.teacher-os.edu.vn",
			adminOrigin: "https://admin.teacher-os.edu.vn",
			apiOrigin: "https://api.teacher-os.edu.vn",
			authBaseURL: "https://api.teacher-os.edu.vn/api/auth",
			googleRedirectURI:
				"https://api.teacher-os.edu.vn/api/auth/callback/google",
			cookieDomain: ".teacher-os.edu.vn",
			authCookiePrefix: undefined,
			appAliases: [],
			landingHost: "teacher-os.edu.vn",
			landingAliases: ["www.teacher-os.edu.vn"],
		});
	});

	it("derives landing host and aliases for prod domain, appAliases empty", () => {
		const topology = resolveDomainTopology("teacheros.io.vn");
		expect(topology.landingHost).toBe("teacheros.io.vn");
		expect(topology.landingAliases).toEqual(["www.teacheros.io.vn"]);
		expect(topology.appAliases).toEqual([]);
	});

	it("derives landing host and aliases for staging domain, appAliases empty", () => {
		const topology = resolveDomainTopology("staging.teacheros.io.vn");
		expect(topology.landingHost).toBe("staging.teacheros.io.vn");
		expect(topology.landingAliases).toEqual(["www.staging.teacheros.io.vn"]);
		expect(topology.appAliases).toEqual([]);
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

describe("admin host (plan #413 phase 1)", () => {
	it("derives the admin portal host and origin from the bare domain", () => {
		const t = resolveDomainTopology("teacher-os.edu.vn");
		expect(t.adminHost).toBe("admin.teacher-os.edu.vn");
		expect(t.adminOrigin).toBe("https://admin.teacher-os.edu.vn");
	});
});

describe("resolveAssumeEmailVerified", () => {
	test("throws when enabled on the prod domain", () => {
		expect(() => resolveAssumeEmailVerified("true", PROD_APP_DOMAIN)).toThrow(
			/never be enabled on production/,
		);
	});

	test("enabled on staging, off by default", () => {
		expect(resolveAssumeEmailVerified("true", "staging.teacheros.io.vn")).toBe(
			true,
		);
		expect(resolveAssumeEmailVerified(undefined, PROD_APP_DOMAIN)).toBe(false);
	});
});

describe("resolveTeacherEmails (#513)", () => {
	test("throws when empty or comma-only on the prod domain", () => {
		expect(() => resolveTeacherEmails("", PROD_APP_DOMAIN)).toThrow(
			/TEACHER_EMAILS must be set/,
		);
		expect(() => resolveTeacherEmails(undefined, PROD_APP_DOMAIN)).toThrow(
			/TEACHER_EMAILS must be set/,
		);
		expect(() => resolveTeacherEmails(" , , ", PROD_APP_DOMAIN)).toThrow(
			/TEACHER_EMAILS must be set/,
		);
	});

	test("returns the value when set on the prod domain", () => {
		expect(resolveTeacherEmails("a@x.vn", PROD_APP_DOMAIN)).toBe("a@x.vn");
	});

	test("returns empty string on staging when unset or empty", () => {
		expect(resolveTeacherEmails("", "staging.teacheros.io.vn")).toBe("");
		expect(resolveTeacherEmails(undefined, "staging.teacheros.io.vn")).toBe("");
	});
});
