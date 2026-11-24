import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_URL, validateReturnUrl } from "./validate-return-url";

describe("admin validateReturnUrl", () => {
	it("defaults to /admin for empty or root inputs", () => {
		expect(DEFAULT_RETURN_URL).toBe("/admin");
		expect(validateReturnUrl(undefined)).toBe("/admin");
		expect(validateReturnUrl(null)).toBe("/admin");
		expect(validateReturnUrl("")).toBe("/admin");
		expect(validateReturnUrl("/")).toBe("/admin");
	});

	it("accepts valid /admin paths with query and hash", () => {
		expect(validateReturnUrl("/admin")).toBe("/admin");
		expect(validateReturnUrl("/admin/")).toBe("/admin/");
		expect(validateReturnUrl("/admin/library/tests")).toBe(
			"/admin/library/tests",
		);
		expect(validateReturnUrl("/admin/library/tests?page=2#top")).toBe(
			"/admin/library/tests?page=2#top",
		);
	});

	it("rejects cross-role paths, open redirects, traversal, and control chars", () => {
		expect(validateReturnUrl("/teacher/classes")).toBe("/admin");
		expect(validateReturnUrl("/student")).toBe("/admin");
		expect(validateReturnUrl("/library/tests")).toBe("/admin");
		expect(validateReturnUrl("//evil.com/admin")).toBe("/admin");
		expect(validateReturnUrl("/\\evil.com")).toBe("/admin");
		expect(validateReturnUrl("https://evil.com/admin")).toBe("/admin");
		expect(validateReturnUrl("javascript:alert(1)")).toBe("/admin");
		expect(validateReturnUrl("/admin/../teacher")).toBe("/admin");
		expect(validateReturnUrl("/admin/library%0d%0a")).toBe("/admin");
	});
});
