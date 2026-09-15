import { describe, expect, test } from "vitest";

import {
	EMAIL_INVALID,
	EMAIL_REQUIRED,
	PASSWORD_REQUIRED,
	signInSchema,
} from "./sign-in-schema";

/**
 * Issue #114: the sign-in form must not enforce sign-up semantics.
 * Empty fields say "required"; a short password is the server's call
 * (better-auth verifies credentials on sign-in), so "abc" passes.
 */
describe("signInSchema (issue #114 sign-in validation semantics)", () => {
	test("empty email and password report required, not format/length rules", () => {
		const result = signInSchema.safeParse({ email: "", password: "" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues.map((issue) => issue.message)).toEqual([
				EMAIL_REQUIRED,
				PASSWORD_REQUIRED,
			]);
		}
	});

	test("whitespace-only email counts as empty", () => {
		const result = signInSchema.safeParse({ email: "   ", password: "abc" });
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(EMAIL_REQUIRED);
		}
	});

	test("non-empty malformed email is still blocked client-side", () => {
		const result = signInSchema.safeParse({
			email: "not-an-email",
			password: "abc",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(EMAIL_INVALID);
		}
	});

	test("valid email passes", () => {
		const result = signInSchema.safeParse({
			email: "teacher@school.edu",
			password: "abc",
		});
		expect(result.success).toBe(true);
	});

	test("empty password reports required", () => {
		const result = signInSchema.safeParse({
			email: "teacher@school.edu",
			password: "",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(PASSWORD_REQUIRED);
		}
	});

	test("short password passes — length is a sign-up policy, not sign-in (regression #114)", () => {
		const result = signInSchema.safeParse({
			email: "teacher@school.edu",
			password: "abc",
		});
		expect(result.success).toBe(true);
	});

	test("password is never trimmed — a space is a real character the server judges", () => {
		const result = signInSchema.safeParse({
			email: "teacher@school.edu",
			password: " ",
		});
		expect(result.success).toBe(true);
	});
});
