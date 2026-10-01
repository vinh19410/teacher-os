import { describe, expect, it } from "vitest";
import { redactResetToken } from "./log-redaction";

describe("redactResetToken", () => {
	it("masks the token segment of the reset-password callback path", () => {
		const line =
			"<-- GET /api/auth/reset-password/abc123?callbackURL=http%3A%2F%2Fx";
		const out = redactResetToken(line);
		expect(out).toBe(
			"<-- GET /api/auth/reset-password/[redacted]?callbackURL=http%3A%2F%2Fx",
		);
		expect(out).not.toContain("abc123");
	});

	it("masks the token when the path ends the line or is followed by a space", () => {
		expect(
			redactResetToken("--> GET /api/auth/reset-password/tok9 302 4ms"),
		).toBe("--> GET /api/auth/reset-password/[redacted] 302 4ms");
		expect(redactResetToken("<-- GET /api/auth/reset-password/tok9")).toBe(
			"<-- GET /api/auth/reset-password/[redacted]",
		);
	});

	it("leaves unrelated lines and the token-less POST endpoint untouched", () => {
		const post = "<-- POST /api/auth/reset-password";
		expect(redactResetToken(post)).toBe(post);
		const other = "<-- GET /api/auth/verify-email?token=keep";
		expect(redactResetToken(other)).toBe(other);
	});
});
