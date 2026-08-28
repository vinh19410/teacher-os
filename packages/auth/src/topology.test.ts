import { describe, expect, it } from "vitest";
import {
	authBaseURL,
	authCookiePrefix,
	crossSubDomainCookieDomain,
} from "./topology";

describe("authBaseURL", () => {
	it("appends the /api/auth mount path to a bare origin", () => {
		expect(authBaseURL("https://api.teacher-os.edu.vn")).toBe(
			"https://api.teacher-os.edu.vn/api/auth",
		);
	});

	it("does not double the mount path when the origin already ends with /api/auth", () => {
		expect(authBaseURL("https://api.teacher-os.edu.vn/api/auth")).toBe(
			"https://api.teacher-os.edu.vn/api/auth",
		);
	});

	it("strips a trailing slash before appending the mount path", () => {
		expect(authBaseURL("https://api.teacher-os.edu.vn/")).toBe(
			"https://api.teacher-os.edu.vn/api/auth",
		);
	});

	it("accepts a workers.dev origin", () => {
		expect(authBaseURL("https://teacher-os-server.example.workers.dev")).toBe(
			"https://teacher-os-server.example.workers.dev/api/auth",
		);
	});

	it("rejects an origin without a scheme", () => {
		expect(() => authBaseURL("api.teacher-os.edu.vn")).toThrow(/scheme/i);
	});

	it("rejects a relative URL", () => {
		expect(() => authBaseURL("/api/auth")).toThrow(/scheme/i);
	});

	it("rejects an empty value", () => {
		expect(() => authBaseURL("")).toThrow(/scheme/i);
	});
});

describe("crossSubDomainCookieDomain", () => {
	it("returns the domain unchanged when it is already a dot-prefixed parent domain", () => {
		expect(crossSubDomainCookieDomain(".teacher-os.edu.vn")).toBe(
			".teacher-os.edu.vn",
		);
	});

	it("returns undefined for an empty value (cross-subdomain cookies disabled)", () => {
		expect(crossSubDomainCookieDomain("")).toBeUndefined();
	});

	it("returns undefined when the binding is absent", () => {
		expect(crossSubDomainCookieDomain(undefined)).toBeUndefined();
	});

	it("returns undefined for a whitespace-only value", () => {
		expect(crossSubDomainCookieDomain("   ")).toBeUndefined();
	});

	it("rejects a bare domain without the leading dot", () => {
		expect(() => crossSubDomainCookieDomain("teacher-os.edu.vn")).toThrow(
			/leading dot/,
		);
	});

	it("rejects a full origin", () => {
		expect(() =>
			crossSubDomainCookieDomain("https://teacher-os.edu.vn"),
		).toThrow(/host only/i);
	});

	it("rejects a value containing a path", () => {
		expect(() => crossSubDomainCookieDomain(".teacher-os.edu.vn/app")).toThrow(
			/host only/i,
		);
	});

	it("rejects a value containing a port", () => {
		expect(() => crossSubDomainCookieDomain(".teacher-os.edu.vn:8443")).toThrow(
			/host only/i,
		);
	});

	it("rejects uppercase domains", () => {
		expect(() => crossSubDomainCookieDomain(".Teacher-OS.edu.vn")).toThrow(
			/lowercase/i,
		);
	});
});

describe("authCookiePrefix", () => {
	it("returns the prefix unchanged when it is cookie-name safe", () => {
		expect(authCookiePrefix("teacheros-staging")).toBe("teacheros-staging");
	});

	it("returns undefined for an empty value (default better-auth namespace)", () => {
		expect(authCookiePrefix("")).toBeUndefined();
	});

	it("returns undefined when the binding is absent", () => {
		expect(authCookiePrefix(undefined)).toBeUndefined();
	});

	it("returns undefined for a whitespace-only value", () => {
		expect(authCookiePrefix("   ")).toBeUndefined();
	});

	it("rejects a prefix containing a dot (better-auth joins prefix.cookieName)", () => {
		expect(() => authCookiePrefix("teacheros.staging")).toThrow(
			/cookie name safe/i,
		);
	});

	it("rejects a prefix containing a slash", () => {
		expect(() => authCookiePrefix("teacheros/staging")).toThrow(
			/cookie name safe/i,
		);
	});

	it("rejects uppercase prefixes", () => {
		expect(() => authCookiePrefix("TeacherOS-Staging")).toThrow(
			/cookie name safe/i,
		);
	});
});
