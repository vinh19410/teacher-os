import { describe, expect, it } from "vitest";

import { classColorIndex } from "./class-color";

describe("classColorIndex", () => {
	it("is stable across repeated calls for the same id", () => {
		const ids = [
			"cls-1",
			"abc-def-123",
			"",
			"🌍-lớp-học",
			"cls-very-long-id".repeat(8),
		];
		for (const id of ids) {
			expect(classColorIndex(id)).toBe(classColorIndex(id));
		}
	});

	it("pins FNV-1a regression anchors", () => {
		// FNV-1a 32-bit: basis 0x811C9DC5 → "" hashes to itself; "a" → 0xE40C292C.
		expect(classColorIndex("")).toBe(6);
		expect(classColorIndex("a")).toBe(5);
	});

	it("always returns an integer in 1..8", () => {
		for (let i = 0; i < 500; i++) {
			const value = classColorIndex(`id-${i}-${i * 7}`);
			expect(Number.isInteger(value)).toBe(true);
			expect(value).toBeGreaterThanOrEqual(1);
			expect(value).toBeLessThanOrEqual(8);
		}
	});

	it("spreads 100 seeded ids relatively evenly across 1..8", () => {
		const counts = new Array(8).fill(0) as number[];
		for (let i = 0; i < 100; i++) {
			counts[classColorIndex(`cls-${i}`) - 1] += 1;
		}
		for (const count of counts) {
			expect(count).toBeGreaterThanOrEqual(5);
			expect(count).toBeLessThanOrEqual(25);
		}
	});
});
