/**
 * Image-pin math (phase-04 FR3). Pins are PERCENTS of the rendered image box
 * so they survive any scale — the conversion must never depend on pixel
 * constants (non-functional requirement). Pure functions so the click→pin
 * mapping is unit-testable without a DOM.
 */

export interface PinPoint {
	x: number;
	y: number;
}

/** Only these values may reach the wire (mirrors the contract's 0–100). */
export function isValidPin(pin: unknown): pin is PinPoint {
	if (!pin || typeof pin !== "object") return false;
	const { x, y } = pin as Record<string, unknown>;
	return (
		typeof x === "number" &&
		Number.isFinite(x) &&
		x >= 0 &&
		x <= 100 &&
		typeof y === "number" &&
		Number.isFinite(y) &&
		y >= 0 &&
		y <= 100
	);
}

/**
 * Map a pointer event position onto the image box as percents, rounded to
 * one decimal (0.1% ≈ 1px on a 1000px render — stable enough to re-save
 * without drift). `null` for a zero-sized box (image not yet laid out).
 */
export function pointerToPercent(
	box: { left: number; top: number; width: number; height: number },
	clientX: number,
	clientY: number,
): PinPoint | null {
	if (box.width <= 0 || box.height <= 0) return null;
	const clamp01 = (value: number) => Math.min(100, Math.max(0, value));
	const round = (value: number) => Math.round(value * 10) / 10;
	return {
		x: round(clamp01(((clientX - box.left) / box.width) * 100)),
		y: round(clamp01(((clientY - box.top) / box.height) * 100)),
	};
}
