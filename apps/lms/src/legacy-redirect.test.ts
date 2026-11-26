import { describe, expect, it } from "vitest";
import { resolveLegacyHostRedirect } from "./legacy-redirect.ts";

describe("resolveLegacyHostRedirect", () => {
	it("returns null for localhost, loopback, canonical lms, workers.dev, and unknown hosts", () => {
		const ignoredUrls = [
			"http://localhost:8001/login",
			"http://127.0.0.1:8001/dashboard",
			"http://[::1]:8001/student",
			"http://app.localhost:8001/dashboard",
			"http://student.local/classes",
			"https://lms.msmy.io.vn/",
			"https://lms.msmy.io.vn/teacher/dashboard",
			"https://lms.staging.teacheros.io.vn/login",
			"https://lms-preview.teacheros.workers.dev/",
			"https://app.preview.workers.dev/dashboard",
			"https://msmy.io.vn/",
			"https://profile.msmy.io.vn/",
			"https://staging.teacheros.io.vn/",
		];

		for (const url of ignoredUrls) {
			expect(
				resolveLegacyHostRedirect(new Request(url)),
				`Expected null for ${url}`,
			).toBeNull();
		}
	});

	it("returns null for /sw.js and /registerSW.js on legacy app hosts (SW self-heal exception)", () => {
		const swUrls = [
			"https://app.msmy.io.vn/sw.js",
			"https://app.msmy.io.vn/registerSW.js",
			"https://www.app.msmy.io.vn/sw.js",
			"https://www.app.msmy.io.vn/registerSW.js",
			"https://app.staging.teacheros.io.vn/sw.js",
			"https://app.staging.teacheros.io.vn/registerSW.js",
			"https://teacheros.io.vn/sw.js",
			"https://www.teacheros.io.vn/registerSW.js",
		];

		for (const url of swUrls) {
			expect(
				resolveLegacyHostRedirect(new Request(url)),
				`Expected null for SW stub ${url}`,
			).toBeNull();
		}
	});

	it("redirects legacy app and former teacheros.io.vn hosts to canonical lms host with proper path mapping", () => {
		const cases = [
			// Root -> /teacher
			{
				from: "https://app.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "http://app.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://www.app.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://app.staging.teacheros.io.vn/",
				to: "https://lms.staging.teacheros.io.vn/teacher",
			},
			{
				from: "https://www.app.staging.teacheros.io.vn/",
				to: "https://lms.staging.teacheros.io.vn/teacher",
			},
			{
				from: "https://teacheros.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://www.teacheros.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://app.teacheros.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://www.app.teacheros.io.vn/",
				to: "https://lms.msmy.io.vn/teacher",
			},
			// Regular teacher paths get /teacher prefix + preserve query
			{
				from: "https://app.msmy.io.vn/dashboard?tab=today",
				to: "https://lms.msmy.io.vn/teacher/dashboard?tab=today",
			},
			{
				from: "https://app.msmy.io.vn/classes/c-123?tab=students",
				to: "https://lms.msmy.io.vn/teacher/classes/c-123?tab=students",
			},
			{
				from: "https://www.teacheros.io.vn/students/s-1",
				to: "https://lms.msmy.io.vn/teacher/students/s-1",
			},
			// No double prefix when already under /teacher
			{
				from: "https://app.msmy.io.vn/teacher",
				to: "https://lms.msmy.io.vn/teacher",
			},
			{
				from: "https://app.msmy.io.vn/teacher/classes/c-1?x=1",
				to: "https://lms.msmy.io.vn/teacher/classes/c-1?x=1",
			},
			// /pay/... stays at root
			{
				from: "https://app.msmy.io.vn/pay/tok-abc123?ref=zalo",
				to: "https://lms.msmy.io.vn/pay/tok-abc123?ref=zalo",
			},
			{
				from: "https://teacheros.io.vn/pay/tok-xyz",
				to: "https://lms.msmy.io.vn/pay/tok-xyz",
			},
			// Unified auth paths stay at root
			{
				from: "https://app.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses",
			},
			{
				from: "https://app.msmy.io.vn/login/",
				to: "https://lms.msmy.io.vn/login/",
			},
			{
				from: "https://app.msmy.io.vn/forgot-password",
				to: "https://lms.msmy.io.vn/forgot-password",
			},
			{
				from: "https://app.msmy.io.vn/reset-password?token=abc",
				to: "https://lms.msmy.io.vn/reset-password?token=abc",
			},
			{
				from: "https://app.msmy.io.vn/verify-email?verified=ok",
				to: "https://lms.msmy.io.vn/verify-email?verified=ok",
			},
		];

		for (const { from, to } of cases) {
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(to);
		}
	});

	it("redirects student.<domain> and www.student.<domain> to canonical lms host", () => {
		const cases = [
			{
				from: "https://student.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/student",
			},
			{
				from: "https://www.student.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/student",
			},
			{
				from: "https://student.staging.teacheros.io.vn/classes/c-1?tab=lessons",
				to: "https://lms.staging.teacheros.io.vn/student/classes/c-1?tab=lessons",
			},
			// No double prefix
			{
				from: "https://student.msmy.io.vn/student",
				to: "https://lms.msmy.io.vn/student",
			},
			{
				from: "https://student.msmy.io.vn/student/assignments/a-1",
				to: "https://lms.msmy.io.vn/student/assignments/a-1",
			},
			// Unified auth paths stay at root
			{
				from: "https://student.msmy.io.vn/login?returnUrl=%2Fstudent",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fstudent",
			},
			{
				from: "https://www.student.msmy.io.vn/forgot-password",
				to: "https://lms.msmy.io.vn/forgot-password",
			},
			{
				from: "https://student.msmy.io.vn/reset-password?token=t1",
				to: "https://lms.msmy.io.vn/reset-password?token=t1",
			},
			{
				from: "https://student.msmy.io.vn/verify-email/?verified=ok",
				to: "https://lms.msmy.io.vn/verify-email/?verified=ok",
			},
		];

		for (const { from, to } of cases) {
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(to);
		}
	});

	it("redirects admin.<domain> and www.admin.<domain> to canonical lms host", () => {
		const cases = [
			{
				from: "https://admin.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/admin",
			},
			{
				from: "https://www.admin.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/admin",
			},
			{
				from: "https://admin.staging.teacheros.io.vn/library/tests?page=2",
				to: "https://lms.staging.teacheros.io.vn/admin/library/tests?page=2",
			},
			// No double prefix
			{
				from: "https://admin.msmy.io.vn/admin",
				to: "https://lms.msmy.io.vn/admin",
			},
			{
				from: "https://admin.msmy.io.vn/admin/library/tests",
				to: "https://lms.msmy.io.vn/admin/library/tests",
			},
			// Unified auth paths stay at root
			{
				from: "https://admin.msmy.io.vn/login?error=NOT_ADMIN",
				to: "https://lms.msmy.io.vn/login?error=NOT_ADMIN",
			},
			{
				from: "https://www.admin.msmy.io.vn/reset-password?token=xyz",
				to: "https://lms.msmy.io.vn/reset-password?token=xyz",
			},
		];

		for (const { from, to } of cases) {
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(to);
		}
	});

	it("redirects www.lms.<domain> to lms.<domain> preserving exact path and query", () => {
		const cases = [
			{
				from: "https://www.lms.msmy.io.vn/",
				to: "https://lms.msmy.io.vn/",
			},
			{
				from: "http://www.lms.msmy.io.vn/teacher/classes?q=ielts",
				to: "https://lms.msmy.io.vn/teacher/classes?q=ielts",
			},
			{
				from: "https://www.lms.staging.teacheros.io.vn/pay/tok-1",
				to: "https://lms.staging.teacheros.io.vn/pay/tok-1",
			},
			{
				from: "https://www.lms.msmy.io.vn/login?returnUrl=/classes",
				to: "https://lms.msmy.io.vn/login?returnUrl=/classes",
			},
		];

		for (const { from, to } of cases) {
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(to);
		}
	});

	it("rewrites relative returnUrl on legacy /login hosts with portal prefix and preserves percent-encoded query/hash", () => {
		const cases = [
			{
				from: "https://app.msmy.io.vn/login?returnUrl=/classes",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses",
			},
			{
				from: "https://app.msmy.io.vn/login?returnUrl=%2Fclasses%2Fc-1%3Ftab%3Dstudents%23roster&tab=signin",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses%2Fc-1%3Ftab%3Dstudents%23roster&tab=signin",
			},
			{
				from: "https://app.msmy.io.vn/login?returnUrl=/",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher",
			},
			{
				from: "https://app.msmy.io.vn/login?returnUrl=/students",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fstudents",
			},
			{
				from: "https://app.msmy.io.vn/login/?returnUrl=/classes",
				to: "https://lms.msmy.io.vn/login/?returnUrl=%2Fteacher%2Fclasses",
			},
			{
				from: "https://teacheros.io.vn/login?returnUrl=/grading",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fteacher%2Fgrading",
			},
			{
				from: "https://student.msmy.io.vn/login?returnUrl=/schedule?week=2",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fstudent%2Fschedule%3Fweek%3D2",
			},
			{
				from: "https://admin.msmy.io.vn/login?returnUrl=/library/tests?page=2",
				to: "https://lms.msmy.io.vn/login?returnUrl=%2Fadmin%2Flibrary%2Ftests%3Fpage%3D2",
			},
		];

		for (const { from, to } of cases) {
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(to);
		}

		// Preserve percent-encoded &, #, % inside query/hash without double-decoding.
		const encodedRedirect = resolveLegacyHostRedirect(
			new Request(
				"https://app.msmy.io.vn/login?returnUrl=%2Fstudents%3Fq%3Da%2526b%2523c%26p%3D100%2525",
			),
		);
		expect(encodedRedirect).not.toBeNull();
		const parsed = new URL(encodedRedirect as string);
		expect(parsed.origin).toBe("https://lms.msmy.io.vn");
		expect(parsed.pathname).toBe("/login");
		expect(parsed.searchParams.get("returnUrl")).toBe(
			"/teacher/students?q=a%26b%23c&p=100%25",
		);
	});

	it("keeps already-prefixed portal, pay, and unified-auth returnUrl unchanged on legacy /login", () => {
		const unchangedCases = [
			"https://app.msmy.io.vn/login?returnUrl=%2Fteacher%2Fclasses",
			"https://app.msmy.io.vn/login?returnUrl=%2Fstudent%2Fclasses",
			"https://app.msmy.io.vn/login?returnUrl=%2Fadmin%2Flibrary",
			"https://app.msmy.io.vn/login?returnUrl=%2Fpay%2Ftok-1",
			"https://app.msmy.io.vn/login?returnUrl=%2Flogin",
		];

		for (const from of unchangedCases) {
			const expected = from.replace("app.msmy.io.vn", "lms.msmy.io.vn");
			expect(resolveLegacyHostRedirect(new Request(from)), from).toBe(expected);
		}
	});

	it("strips malicious or malformed returnUrl from legacy /login 301 redirect while preserving other query params", () => {
		const badReturnUrls = [
			"https://evil.com",
			"//evil.com",
			"/\\evil.com",
			"%2F%2Fevil.com",
			"\r\n/classes",
			"%0d%0a/classes",
			"javascript:alert(1)",
			"%2Fclasses%25E0%25A4%25A",
			"/teacher/%2e%2e%2f%2fevil.com",
			"/%2e%2e%2f%2fevil.com",
			"",
		];

		for (const bad of badReturnUrls) {
			const url = `https://app.msmy.io.vn/login?returnUrl=${encodeURIComponent(bad)}&tab=signin`;
			const redirected = resolveLegacyHostRedirect(new Request(url));
			expect(redirected, `bad returnUrl=${bad}`).toBe(
				"https://lms.msmy.io.vn/login?tab=signin",
			);

			const soloUrl = `https://app.msmy.io.vn/login?returnUrl=${encodeURIComponent(bad)}`;
			const soloRedirected = resolveLegacyHostRedirect(new Request(soloUrl));
			expect(soloRedirected, `solo bad returnUrl=${bad}`).toBe(
				"https://lms.msmy.io.vn/login",
			);
		}

		// Duplicate returnUrl parameters (HPP) are stripped cleanly.
		expect(
			resolveLegacyHostRedirect(
				new Request(
					"https://app.msmy.io.vn/login?returnUrl=%2Fclasses&returnUrl=https%3A%2F%2Fevil.com&tab=signin",
				),
			),
		).toBe("https://lms.msmy.io.vn/login?tab=signin");
	});
});
