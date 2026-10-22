import { describe, expect, it } from "vitest";

import { isValidPin, pointerToPercent } from "./image-pin";

describe("pointerToPercent (phase-04 FR3 — scale-independent pin math)", () => {
	const box = { left: 100, top: 50, width: 800, height: 400 };

	it("maps the center of the box to 50/50", () => {
		expect(pointerToPercent(box, 500, 250)).toEqual({ x: 50, y: 50 });
	});

	it("maps corners to the 0–100 bounds", () => {
		expect(pointerToPercent(box, 100, 50)).toEqual({ x: 0, y: 0 });
		expect(pointerToPercent(box, 900, 450)).toEqual({ x: 100, y: 100 });
	});

	it("clamps pointer positions outside the box", () => {
		expect(pointerToPercent(box, 0, 0)).toEqual({ x: 0, y: 0 });
		expect(pointerToPercent(box, 2000, 2000)).toEqual({ x: 100, y: 100 });
	});

	it("rounds to one decimal so re-saves never drift", () => {
		expect(pointerToPercent(box, 123, 77)).toEqual({ x: 2.9, y: 6.8 });
	});

	it("returns null for a zero-sized box (image not laid out)", () => {
		expect(pointerToPercent({ ...box, width: 0 }, 10, 10)).toBeNull();
		expect(pointerToPercent({ ...box, height: 0 }, 10, 10)).toBeNull();
	});
});

describe("isValidPin (phase-04 — wire-shape guard)", () => {
	it("accepts a 0–100 point", () => {
		expect(isValidPin({ x: 0, y: 100 })).toBe(true);
		expect(isValidPin({ x: 12.5, y: 33.3 })).toBe(true);
	});

	it("rejects out-of-range, non-numeric and missing shapes", () => {
		expect(isValidPin({ x: 101, y: 50 })).toBe(false);
		expect(isValidPin({ x: -1, y: 50 })).toBe(false);
		expect(isValidPin({ x: "50", y: 50 })).toBe(false);
		expect(isValidPin({ x: 50 })).toBe(false);
		expect(isValidPin(null)).toBe(false);
		expect(isValidPin("50/50")).toBe(false);
	});
});
