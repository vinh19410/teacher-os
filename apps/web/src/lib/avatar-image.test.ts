import { afterEach, describe, expect, it, vi } from "vitest";
import {
	AVATAR_MAX_IMAGE_CHARS,
	AVATAR_TARGET_PX,
	fileToAvatarDataUrl,
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

describe("fileToAvatarDataUrl", () => {
	function stubCanvas(dataUrlLengths: number[]) {
		const qualities: number[] = [];
		const draws: number[][] = [];
		const canvas = {
			width: 0,
			height: 0,
			getContext: () => ({
				fillRect: () => {},
				drawImage: (_src: unknown, ...args: number[]) => draws.push(args),
			}),
			toDataURL: (_type: string, quality: number) => {
				qualities.push(quality);
				const length = dataUrlLengths[qualities.length - 1];
				return `data:image/jpeg;base64,${"A".repeat(length - 23)}`;
			},
		};
		const createImageBitmap = vi.fn(async () => ({ width: 400, height: 300 }));
		vi.stubGlobal("document", { createElement: () => canvas });
		vi.stubGlobal("createImageBitmap", createImageBitmap);
		return { canvas, qualities, draws, createImageBitmap };
	}

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("renders a 192px center-cropped square honoring EXIF orientation", async () => {
		const stub = stubCanvas([1000]);
		const file = makeFile("image/jpeg");
		await fileToAvatarDataUrl(file);
		expect(stub.createImageBitmap).toHaveBeenCalledWith(file, {
			imageOrientation: "from-image",
		});
		expect([stub.canvas.width, stub.canvas.height]).toEqual([192, 192]);
		// 400×300 source → 300px square starting 50px from the left.
		expect(stub.draws).toEqual([[50, 0, 300, 300, 0, 0, 192, 192]]);
	});

	it("steps down the quality ladder until the result fits the char budget", async () => {
		const stub = stubCanvas([
			AVATAR_MAX_IMAGE_CHARS + 1,
			AVATAR_MAX_IMAGE_CHARS,
			10,
		]);
		const dataUrl = await fileToAvatarDataUrl(makeFile("image/png"));
		expect(stub.qualities).toEqual([0.78, 0.6]);
		expect(dataUrl.length).toBe(AVATAR_MAX_IMAGE_CHARS);
	});

	it("gives up with a user-facing error when every quality is over budget", async () => {
		const stub = stubCanvas([
			AVATAR_MAX_IMAGE_CHARS + 1,
			AVATAR_MAX_IMAGE_CHARS + 1,
			AVATAR_MAX_IMAGE_CHARS + 1,
		]);
		await expect(fileToAvatarDataUrl(makeFile("image/png"))).rejects.toThrow(
			"Ảnh quá lớn",
		);
		expect(stub.qualities).toEqual([0.78, 0.6, 0.45]);
	});
});
