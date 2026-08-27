/**
 * Avatar source contract — locks the src guard and the per-src error reset
 * without rendering React (source-parse, same style as kernel-runtime).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
	return readFileSync(join(here, rel), "utf8");
}

describe("avatar.tsx src contract", () => {
	const src = readSrc("avatar.tsx");

	test("every candidate src passes the shared safety guard", () => {
		expect(src).toMatch(/isSafeAvatarSrc/);
		expect(src).toMatch(/from "@teacher-os\/auth\/avatar-policy"/);
	});

	test("an <img> load failure falls back to initials", () => {
		expect(src).toMatch(/onError=\{\(\) => setErrorSrc\(src\)\}/);
	});

	test("the error state is keyed to the current src so a new src renders again", () => {
		expect(src).toMatch(/key=\{src\}/);
		expect(src).toMatch(/errorSrc !== src/);
	});

	test("imgProps pass-through exists for e2e hooks (testid lands on <img>)", () => {
		expect(src).toMatch(/\.\.\.imgProps/);
	});
});

describe("avatar-image.ts cap contract", () => {
	const src = readSrc("../../lib/avatar-image.ts");

	test("resize pipeline pins the shared 192px target and 65536-char budget", () => {
		expect(src).toMatch(/AVATAR_TARGET_PX/);
		expect(src).toMatch(/AVATAR_MAX_IMAGE_CHARS/);
		expect(src).toMatch(/dataUrl\.length <= AVATAR_MAX_IMAGE_CHARS/);
	});

	test("bitmap loading honors EXIF orientation via createImageBitmap option", () => {
		expect(src).toMatch(/imageOrientation: "from-image"/);
	});

	test("quality ladder is a pure named export (unit-tested, no canvas needed)", () => {
		expect(src).toMatch(/export function pickQuality/);
	});
});
