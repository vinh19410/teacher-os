import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	AVATAR_MAX_IMAGE_CHARS,
	AVATAR_TARGET_PX,
	isSafeAvatarSrc,
	validateUpdateUserImage,
	validateUpdateUserName,
} from "./avatar-policy";

describe("avatar-policy constants", () => {
	it("pins the 192px render target and the 65536-char encoded cap", () => {
		expect(AVATAR_TARGET_PX).toBe(192);
		expect(AVATAR_MAX_IMAGE_CHARS).toBe(64 * 1024);
	});
});

describe("isSafeAvatarSrc", () => {
	it("accepts png and jpeg data URLs", () => {
		expect(isSafeAvatarSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
		expect(isSafeAvatarSrc("data:image/jpeg;base64,/9j/4AAQ")).toBe(true);
	});

	it("accepts https URLs (Google avatars)", () => {
		expect(
			isSafeAvatarSrc("https://lh3.googleusercontent.com/a/photo=s96-c"),
		).toBe(true);
	});

	it("rejects dangerous or unsupported schemes", () => {
		expect(isSafeAvatarSrc("http://example.com/a.png")).toBe(false);
		expect(isSafeAvatarSrc("javascript:alert(1)")).toBe(false);
		expect(isSafeAvatarSrc("blob:https://app.example.com/x")).toBe(false);
		expect(isSafeAvatarSrc("data:text/html;base64,PGI+")).toBe(false);
		expect(isSafeAvatarSrc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBe(
			false,
		);
	});

	it("rejects empty or missing values", () => {
		expect(isSafeAvatarSrc(null)).toBe(false);
		expect(isSafeAvatarSrc(undefined)).toBe(false);
		expect(isSafeAvatarSrc("")).toBe(false);
	});
});

describe("validateUpdateUserName", () => {
	it("passes undefined/null through so partial updates stay allowed", () => {
		expect(validateUpdateUserName(undefined)).toBeNull();
		expect(validateUpdateUserName(null)).toBeNull();
	});

	it("accepts a normal name", () => {
		expect(validateUpdateUserName("Trần Mai Lan")).toBeNull();
	});

	it("rejects blank names (floor of 2 trimmed characters)", () => {
		const msg = validateUpdateUserName("");
		expect(msg).toMatch(/2 ký tự/);
		expect(validateUpdateUserName("   ")).toMatch(/2 ký tự/);
		expect(validateUpdateUserName("A")).toMatch(/2 ký tự/);
	});

	it("rejects non-string values", () => {
		expect(validateUpdateUserName(42)).toMatch(/không hợp lệ/);
		expect(validateUpdateUserName({})).toMatch(/không hợp lệ/);
	});

	it("rejects names above 100 trimmed characters", () => {
		expect(validateUpdateUserName("a".repeat(101))).toMatch(/100 ký tự/);
		// Whitespace outside the budget does not count — trimming brings it back.
		expect(validateUpdateUserName(`  ${"b".repeat(99)}  `)).toBeNull();
	});
});

describe("validateUpdateUserImage", () => {
	it("passes undefined/null through so clearing stays possible upstream", () => {
		expect(validateUpdateUserImage(undefined)).toBeNull();
		expect(validateUpdateUserImage(null)).toBeNull();
	});

	it("rejects non-string values", () => {
		expect(validateUpdateUserImage(12345)).toMatch(/không hợp lệ/);
	});

	it("accepts jpeg/png data URLs inside the character budget", () => {
		const dataUrl = `data:image/jpeg;base64,${"A".repeat(1024)}`;
		expect(validateUpdateUserImage(dataUrl)).toBeNull();
	});

	it("accepts https image URLs inside the character budget", () => {
		expect(
			validateUpdateUserImage(
				`https://lh3.googleusercontent.com/${"x".repeat(512)}`,
			),
		).toBeNull();
	});

	it("rejects images above the character budget (chars, matching the client loop)", () => {
		const oversized = `data:image/png;base64,${"A".repeat(AVATAR_MAX_IMAGE_CHARS)}`;
		expect(validateUpdateUserImage(oversized)).toMatch(/64\s?KB|ký tự/i);
	});

	it("rejects disallowed payloads regardless of size", () => {
		expect(
			validateUpdateUserImage("data:image/svg+xml;base64,PHN2Zz4="),
		).toMatch(/JPEG\/PNG|https/);
		expect(validateUpdateUserImage("http://cdn.example.com/a.png")).toMatch(
			/JPEG\/PNG|https/,
		);
		expect(validateUpdateUserImage("")).toMatch(/JPEG\/PNG|https/);
	});
});

describe("update-user hook delegates to the pure validators (source-parse)", () => {
	// The hook itself is inline in createAuth's closure and untestable directly;
	// this pins the delegate wiring so the policy module stays the only guard.
	const here = dirname(fileURLToPath(import.meta.url));
	const indexSrc = readFileSync(join(here, "index.ts"), "utf8");

	it("runs a hooks.before middleware for /update-user", () => {
		expect(indexSrc).toMatch(/hooks:\s*\{/);
		expect(indexSrc).toMatch(/createAuthMiddleware/);
		expect(indexSrc).toMatch(/"\/update-user"/);
	});

	it("delegates validation to validateUpdateUserName / validateUpdateUserImage", () => {
		expect(indexSrc).toMatch(/validateUpdateUserName\(/);
		expect(indexSrc).toMatch(/validateUpdateUserImage\(/);
	});

	it("rejects with a 400 BAD_REQUEST carrying the Vietnamese message", () => {
		expect(indexSrc).toMatch(/APIError/);
		expect(indexSrc).toMatch(/BAD_REQUEST/);
	});
});
