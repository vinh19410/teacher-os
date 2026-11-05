import { describe, expect, it } from "vitest";
import {
	EMPTY_BAND_TOKEN,
	EMPTY_STUDENT_TARGET_LABEL,
	formatStudentTarget,
	formatTargetBand,
} from "./format-student-target";

describe("formatStudentTarget", () => {
	it("renders target band and skills when both are present", () => {
		expect(
			formatStudentTarget({
				targetBand: "6.5",
				skills: ["Writing", "Speaking"],
			}),
		).toBe("Mục tiêu: Band 6.5 (Writing, Speaking)");
	});
	it("renders single skill with band correctly", () => {
		expect(
			formatStudentTarget({
				targetBand: "7.0",
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Band 7.0 (Writing)");
	});

	it("handles numeric targetBand defensively", () => {
		expect(
			formatStudentTarget({
				targetBand: 6.5,
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Band 6.5 (Writing)");
	});

	it("filters out non-string items in skills defensively", () => {
		expect(
			formatStudentTarget({
				targetBand: "6.5",
				skills: [
					"Writing",
					null,
					undefined,
					123 as unknown as string,
					"Speaking",
				],
			}),
		).toBe("Mục tiêu: Band 6.5 (Writing, Speaking)");
	});

	it("trims band and skills entries", () => {
		expect(
			formatStudentTarget({
				targetBand: " 7.0 ",
				skills: [" Writing ", " Speaking "],
			}),
		).toBe("Mục tiêu: Band 7.0 (Writing, Speaking)");
	});

	it("renders only band when skills is empty", () => {
		expect(
			formatStudentTarget({
				targetBand: "7.0",
				skills: [],
			}),
		).toBe("Mục tiêu: Band 7.0");
	});

	it("renders only band when skills contains only empty or whitespace items", () => {
		expect(
			formatStudentTarget({
				targetBand: "7.0",
				skills: ["", "   "],
			}),
		).toBe("Mục tiêu: Band 7.0");
	});

	it("renders skills without band when targetBand is empty", () => {
		expect(
			formatStudentTarget({
				targetBand: "",
				skills: ["Reading", "Listening"],
			}),
		).toBe("Mục tiêu: Reading, Listening");
	});

	it("renders skills without band when targetBand is em-dash", () => {
		expect(
			formatStudentTarget({
				targetBand: "—",
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Writing");
	});

	it("renders skills without band when targetBand is em-dash with whitespace", () => {
		expect(
			formatStudentTarget({
				targetBand: " — ",
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Writing");
	});

	it("renders skills without band when targetBand is null or undefined", () => {
		expect(
			formatStudentTarget({
				targetBand: null,
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Writing");
		expect(
			formatStudentTarget({
				targetBand: undefined,
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Writing");
	});

	it("returns fallback label when targetBand is em-dash and skills is empty (DB default)", () => {
		expect(
			formatStudentTarget({
				targetBand: "—",
				skills: [],
			}),
		).toBe(EMPTY_STUDENT_TARGET_LABEL);
	});

	it("returns fallback label when targetBand is empty or whitespace", () => {
		expect(
			formatStudentTarget({
				targetBand: "",
				skills: [],
			}),
		).toBe(EMPTY_STUDENT_TARGET_LABEL);
		expect(
			formatStudentTarget({
				targetBand: "   ",
				skills: [],
			}),
		).toBe(EMPTY_STUDENT_TARGET_LABEL);
	});

	it("returns fallback label when student targetBand and skills are undefined or null", () => {
		expect(
			formatStudentTarget({
				targetBand: undefined,
				skills: undefined,
			}),
		).toBe(EMPTY_STUDENT_TARGET_LABEL);
		expect(
			formatStudentTarget({
				targetBand: null,
				skills: null,
			}),
		).toBe(EMPTY_STUDENT_TARGET_LABEL);
		expect(formatStudentTarget({})).toBe(EMPTY_STUDENT_TARGET_LABEL);
		expect(formatStudentTarget(undefined)).toBe(EMPTY_STUDENT_TARGET_LABEL);
		expect(formatStudentTarget(null)).toBe(EMPTY_STUDENT_TARGET_LABEL);
	});

	it("avoids duplicate Band prefix when targetBand already has Band prefix", () => {
		expect(
			formatStudentTarget({
				targetBand: "Band 6.5",
				skills: ["Writing"],
			}),
		).toBe("Mục tiêu: Band 6.5 (Writing)");
	});
});

describe("formatTargetBand (#625)", () => {
	it("renders formatted band for valid string input", () => {
		expect(formatTargetBand("6.5")).toBe("Band 6.5");
		expect(formatTargetBand(" 7.0 ")).toBe("Band 7.0");
	});

	it("renders formatted band for numeric input", () => {
		expect(formatTargetBand(7)).toBe("Band 7");
		expect(formatTargetBand(6.5)).toBe("Band 6.5");
	});

	it("strips case-insensitive Band prefix without duplicating", () => {
		expect(formatTargetBand("Band 6.5")).toBe("Band 6.5");
		expect(formatTargetBand("band 7")).toBe("Band 7");
		expect(formatTargetBand("BAND 8.0")).toBe("Band 8.0");
	});

	it("returns em-dash token when targetBand is em-dash sentinel", () => {
		expect(formatTargetBand(EMPTY_BAND_TOKEN)).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("—")).toBe("—");
		expect(formatTargetBand("  —  ")).toBe("—");
	});

	it("returns em-dash token when targetBand has Band prefix with em-dash", () => {
		expect(formatTargetBand("Band —")).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("Band—")).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("band   —")).toBe(EMPTY_BAND_TOKEN);
	});

	it("returns em-dash token when targetBand is bare Band word", () => {
		expect(formatTargetBand("Band")).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("band")).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("  BAND  ")).toBe(EMPTY_BAND_TOKEN);
	});

	it("returns em-dash token when targetBand is empty or whitespace", () => {
		expect(formatTargetBand("")).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand("   ")).toBe(EMPTY_BAND_TOKEN);
	});

	it("returns em-dash token defensively for non-finite numbers", () => {
		expect(formatTargetBand(Number.NaN)).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand(Number.POSITIVE_INFINITY)).toBe(EMPTY_BAND_TOKEN);
	});

	it("returns em-dash token when targetBand is null or undefined", () => {
		expect(formatTargetBand(null)).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand(undefined)).toBe(EMPTY_BAND_TOKEN);
		expect(formatTargetBand()).toBe(EMPTY_BAND_TOKEN);
	});
});
