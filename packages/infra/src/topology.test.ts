import { describe, expect, it, test } from "vitest";
import {
	DEFAULT_DEV_LEAD_ORIGINS,
	PROD_APP_DOMAIN,
	PROD_PROFILE_DOMAIN,
	resolveAssumeEmailVerified,
	resolveDomainTopology,
	resolveLeadOrigins,
	resolveTeacherEmails,
} from "./topology";

describe("resolveDomainTopology", () => {
	it("derives the exact lms/app/api origins and portal URLs for a bare domain", () => {
		expect(resolveDomainTopology("teacher-os.edu.vn")).toEqual({
			lmsHost: "lms.teacher-os.edu.vn",
			lmsOrigin: "https://lms.teacher-os.edu.vn",
			lmsAliases: [
				"app.teacher-os.edu.vn",
				"student.teacher-os.edu.vn",
				"admin.teacher-os.edu.vn",
			],
			teacherUrl: "https://lms.teacher-os.edu.vn/teacher",
			studentPortalUrl: "https://lms.teacher-os.edu.vn/student",
			adminUrl: "https://lms.teacher-os.edu.vn/admin",
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
			profileHost: "profile.teacher-os.edu.vn",
			profileAliases: [],
			profileOrigins: ["https://profile.teacher-os.edu.vn"],
		});
	});

	it("derives the prod lms/legacy/api hosts on msmy.io.vn and leaves landing unattached", () => {
		const topology = resolveDomainTopology("msmy.io.vn");
		expect(topology.lmsHost).toBe("lms.msmy.io.vn");
		expect(topology.lmsOrigin).toBe("https://lms.msmy.io.vn");
		expect(topology.lmsAliases).toEqual([
			"app.msmy.io.vn",
			"student.msmy.io.vn",
			"admin.msmy.io.vn",
		]);
		expect(topology.teacherUrl).toBe("https://lms.msmy.io.vn/teacher");
		expect(topology.studentPortalUrl).toBe("https://lms.msmy.io.vn/student");
		expect(topology.adminUrl).toBe("https://lms.msmy.io.vn/admin");
		expect(topology.appOrigin).toBe("https://app.msmy.io.vn");
		expect(topology.studentOrigin).toBe("https://student.msmy.io.vn");
		expect(topology.apiOrigin).toBe("https://api.msmy.io.vn");
		expect(topology.googleRedirectURI).toBe(
			"https://api.msmy.io.vn/api/auth/callback/google",
		);
		expect(topology.cookieDomain).toBe(".msmy.io.vn");
		expect(topology.landingHost).toBeUndefined();
		expect(topology.landingAliases).toEqual([]);
		expect(topology.profileHost).toBe("msmy.io.vn");
		expect(topology.appAliases).toEqual([]);
	});

	it("derives lms, portal URLs, and landing aliases for staging domain", () => {
		const topology = resolveDomainTopology("staging.teacheros.io.vn");
		expect(topology.lmsHost).toBe("lms.staging.teacheros.io.vn");
		expect(topology.lmsOrigin).toBe("https://lms.staging.teacheros.io.vn");
		expect(topology.lmsAliases).toEqual([
			"app.staging.teacheros.io.vn",
			"student.staging.teacheros.io.vn",
			"admin.staging.teacheros.io.vn",
		]);
		expect(topology.teacherUrl).toBe(
			"https://lms.staging.teacheros.io.vn/teacher",
		);
		expect(topology.studentPortalUrl).toBe(
			"https://lms.staging.teacheros.io.vn/student",
		);
		expect(topology.adminUrl).toBe("https://lms.staging.teacheros.io.vn/admin");
		expect(topology.landingHost).toBe("staging.teacheros.io.vn");
		expect(topology.landingAliases).toEqual(["www.staging.teacheros.io.vn"]);
		expect(topology.appAliases).toEqual([]);
	});

	it("derives msmy.io.vn profile host, www alias, and origins only for PROD_APP_DOMAIN (#536)", () => {
		const prod = resolveDomainTopology(PROD_APP_DOMAIN);
		expect(prod.profileHost).toBe(PROD_PROFILE_DOMAIN);
		expect(prod.profileAliases).toEqual([`www.${PROD_PROFILE_DOMAIN}`]);
		expect(prod.profileOrigins).toEqual([
			"https://msmy.io.vn",
			"https://www.msmy.io.vn",
		]);

		for (const nonProd of [
			"staging.teacheros.io.vn",
			"preview.teacheros.io.vn",
			"teacher-os.edu.vn",
		]) {
			const t = resolveDomainTopology(nonProd);
			expect(t.profileHost).toBe(`profile.${nonProd}`);
			expect(t.profileAliases).toEqual([]);
			expect(t.profileOrigins).toEqual([`https://profile.${nonProd}`]);
			expect(t.profileHost).not.toContain("msmy.io.vn");
			expect(t.profileOrigins.join(",")).not.toContain("msmy.io.vn");
		}
	});

	it("scopes staging into its own auth cookie namespace (issue #125: staging nests inside the former prod cookie zone)", () => {
		expect(
			resolveDomainTopology("staging.teacheros.io.vn").authCookiePrefix,
		).toBe("teacheros-staging");
	});

	it("keeps the prod domain on the default better-auth cookie namespace", () => {
		expect(
			resolveDomainTopology(PROD_APP_DOMAIN).authCookiePrefix,
		).toBeUndefined();
	});

	it("prefixes any other member of the prod or former-prod cookie zone, not just the staging label", () => {
		for (const domain of [
			"preview.teacheros.io.vn",
			"teacheros.io.vn",
			"staging.msmy.io.vn",
		]) {
			expect(resolveDomainTopology(domain).authCookiePrefix).toBe(
				"teacheros-staging",
			);
		}
	});

	it("leaves unrelated zones on the default namespace (no shared cookie zone with prod)", () => {
		expect(
			resolveDomainTopology("teacher-os.edu.vn").authCookiePrefix,
		).toBeUndefined();
	});

	it("supports a multi-label domain", () => {
		const topology = resolveDomainTopology("teacher-os.example.co.uk");
		expect(topology.lmsHost).toBe("lms.teacher-os.example.co.uk");
		expect(topology.lmsOrigin).toBe("https://lms.teacher-os.example.co.uk");
		expect(topology.lmsAliases).toEqual([
			"app.teacher-os.example.co.uk",
			"student.teacher-os.example.co.uk",
			"admin.teacher-os.example.co.uk",
		]);
		expect(topology.teacherUrl).toBe(
			"https://lms.teacher-os.example.co.uk/teacher",
		);
		expect(topology.studentPortalUrl).toBe(
			"https://lms.teacher-os.example.co.uk/student",
		);
		expect(topology.adminUrl).toBe(
			"https://lms.teacher-os.example.co.uk/admin",
		);
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

describe("resolveLeadOrigins (#524, #536)", () => {
	test("falls back to topology.profileOrigins when topology is provided and raw is unset, empty, whitespace, or comma-only", () => {
		const prodTopology = resolveDomainTopology(PROD_APP_DOMAIN);
		const stagingTopology = resolveDomainTopology("staging.teacheros.io.vn");
		for (const raw of [undefined, "", "   ", " , , "]) {
			expect(
				resolveLeadOrigins(raw, { topology: prodTopology, isDev: false }),
			).toBe("https://msmy.io.vn,https://www.msmy.io.vn");
			expect(
				resolveLeadOrigins(raw, { topology: stagingTopology, isDev: false }),
			).toBe("https://profile.staging.teacheros.io.vn");
		}
	});

	test("trims and joins explicit origins when provided under topology", () => {
		const stagingTopology = resolveDomainTopology("staging.teacheros.io.vn");
		expect(
			resolveLeadOrigins(
				" https://profile.staging.teacheros.io.vn , https://msmy.io.vn , ",
				{ topology: stagingTopology, isDev: false },
			),
		).toBe("https://profile.staging.teacheros.io.vn,https://msmy.io.vn");
	});

	test("falls back to DEFAULT_DEV_LEAD_ORIGINS when topology is undefined and isDev is true", () => {
		for (const raw of [undefined, "", " , "]) {
			expect(
				resolveLeadOrigins(raw, { topology: undefined, isDev: true }),
			).toBe(DEFAULT_DEV_LEAD_ORIGINS);
		}
	});

	test("throws when deploying without APP_DOMAIN and LEAD_ORIGINS is empty", () => {
		expect(() =>
			resolveLeadOrigins(undefined, { topology: undefined, isDev: false }),
		).toThrow(/LEAD_ORIGINS must be set/);
		expect(() =>
			resolveLeadOrigins(" , ", { topology: undefined, isDev: false }),
		).toThrow(/LEAD_ORIGINS must be set/);
	});
});
