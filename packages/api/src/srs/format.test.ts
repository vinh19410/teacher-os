import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatCountdown, formatInterval } from "./format";

const vectors = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL("./vectors/level-vectors.json", import.meta.url).href,
		),
		"utf8",
	),
) as {
	intervals: Array<{ minutes: number; label: string }>;
};

describe("format (conformance vectors)", () => {
	it.each(vectors.intervals)(
		"formatInterval($minutes) === $label",
		({ minutes, label }) => {
			expect(formatInterval(minutes)).toBe(label);
		},
	);

	it.each([
		[0, "0:00"],
		[-500, "0:00"],
		[1, "0:01"],
		[59_000, "0:59"],
		[60_000, "1:00"],
		[3_599_000, "59:59"],
		[3_599_001, "1:00:00"],
		[3_600_000, "1:00:00"],
		[8_073_000, "2:14:33"],
		[86_399_000, "23:59:59"],
		[86_400_000, "1d 0h"],
		[280_800_000, "3d 6h"],
	] as const)("formatCountdown(%i) === %s", (ms, expected) => {
		expect(formatCountdown(ms)).toBe(expected);
	});
});
