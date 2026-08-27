import { describe, expect, it } from "vitest";
import {
	AVATAR_MAX_IMAGE_CHARS,
	AVATAR_TARGET_PX,
	isSafeAvatarSrc,
	pickQuality,
	validateAvatarFile,
} from "./avatar-image";

function makeFile(type: string, size?: number): File {
	const f = new File(["x"], "a.jpg", { type });
	if (size !== undefined) Object.defineProperty(f, "size", { value: size });
	return f;
}

describe("re-exported shared policy", () => {
	it("exposes the auth package constants and guard unchanged", () => {
		expect(AVATAR_TARGET_PX).toBe(192);
		expect(AVATAR_MAX_IMAGE_CHARS).toBe(64 * 1024);
		expect(isSafeAvatarSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
		expect(isSafeAvatarSrc("javascript:alert(1)")).toBe(false);
	});
});

describe("validateAvatarFile", () => {
	it("accepts jpeg, png and webp inputs", () => {
		expect(validateAvatarFile(makeFile("image/jpeg"))).toBeNull();
		expect(validateAvatarFile(makeFile("image/png"))).toBeNull();
		expect(validateAvatarFile(makeFile("image/webp"))).toBeNull();
	});

	it("rejects other mime types", () => {
		expect(validateAvatarFile(makeFile("image/gif"))).toMatch(/JPEG/);
		expect(validateAvatarFile(makeFile("application/pdf"))).toMatch(/JPEG/);
	});

	it("rejects inputs above 10MB", () => {
		expect(
			validateAvatarFile(makeFile("image/jpeg", 10 * 1024 * 1024 + 1)),
		).toMatch(/10MB/);
	});
});

describe("pickQuality", () => {
	it("walks the fixed ladder then nulls out", () => {
		expect(pickQuality(0)).toBe(0.78);
		expect(pickQuality(1)).toBe(0.6);
		expect(pickQuality(2)).toBe(0.45);
		expect(pickQuality(3)).toBeNull();
		expect(pickQuality(9)).toBeNull();
	});
});
