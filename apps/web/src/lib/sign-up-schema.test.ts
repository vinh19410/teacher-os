import { describe, expect, test } from "vitest";

import { EMAIL_INVALID } from "./sign-in-schema";
import { NAME_MIN, PASSWORD_MIN, signUpSchema } from "./sign-up-schema";

/**
 * Messages are frozen sign-up copy (see #165's schema extraction); #142's
 * required-first follow-up builds on these, so changing them here is a
 * user-visible copy change.
 */
describe("signUpSchema", () => {
	test("short name reports the min-length message", () => {
		const result = signUpSchema.safeParse({
			name: "A",
			email: "teacher@school.edu",
			password: "at-least-8",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(NAME_MIN);
		}
	});

	test("malformed email reports the invalid-email message", () => {
		const result = signUpSchema.safeParse({
			name: "Teacher",
			email: "not-an-email",
			password: "at-least-8",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(EMAIL_INVALID);
		}
	});

	test("short password reports the min-length message", () => {
		const result = signUpSchema.safeParse({
			name: "Teacher",
			email: "teacher@school.edu",
			password: "short",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(PASSWORD_MIN);
		}
	});

	test("valid values pass", () => {
		const result = signUpSchema.safeParse({
			name: "Teacher",
			email: "teacher@school.edu",
			password: "at-least-8",
		});
		expect(result.success).toBe(true);
	});
});
