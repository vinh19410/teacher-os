import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./file-fingerprint";

describe("sha256Hex (TOS-25)", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("hash đúng SHA-256 hex 64 ký tự của nội dung file", async () => {
		// SHA-256("hi") — giá trị chuẩn.
		const file = new File([new Uint8Array([104, 105])], "a.pdf", {
			type: "application/pdf",
		});
		expect(await sha256Hex(file)).toBe(
			"8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
		);
	});

	it("nội dung khác → hash khác (không đụng cache/chung kết quả)", async () => {
		const a = await sha256Hex(new File(["a"], "a.pdf"));
		const b = await sha256Hex(new File(["b"], "b.pdf"));
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[a-f0-9]{64}$/);
		expect(b).toMatch(/^[a-f0-9]{64}$/);
	});

	it("crypto.subtle vắng (non-secure context) → throw để caller fail-open", async () => {
		vi.stubGlobal("crypto", {});
		await expect(sha256Hex(new File(["x"], "x.pdf"))).rejects.toThrow(
			/WebCrypto unavailable/,
		);
	});
});
