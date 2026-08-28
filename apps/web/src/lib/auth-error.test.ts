import { describe, expect, test } from "vitest";

import { authErrorMessage } from "./auth-error";

const FALLBACK = "Couldn't sign you in.";

describe("authErrorMessage (issue #125 loud-failure guard)", () => {
	test("prefers message, then statusText, then the fallback", () => {
		expect(authErrorMessage({ message: "Invalid email" }, FALLBACK)).toBe(
			"Invalid email",
		);
		expect(authErrorMessage({ statusText: "Unauthorized" }, FALLBACK)).toBe(
			"Unauthorized",
		);
		expect(
			authErrorMessage({ message: "", statusText: "Bad Request" }, FALLBACK),
		).toBe("Bad Request");
	});

	test("malformed shapes fall back instead of throwing", () => {
		expect(authErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
		expect(authErrorMessage(null, FALLBACK)).toBe(FALLBACK);
		expect(authErrorMessage({}, FALLBACK)).toBe(FALLBACK);
		expect(authErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK);
		expect(authErrorMessage({ message: null }, FALLBACK)).toBe(FALLBACK);
	});

	test("a plain string error passes through when non-empty", () => {
		expect(authErrorMessage("Network gone", FALLBACK)).toBe("Network gone");
		expect(authErrorMessage("   ", FALLBACK)).toBe(FALLBACK);
	});
});
