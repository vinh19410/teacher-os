import { describe, expect, it } from "vitest";
import {
	EMPTY_STUDENT_TARGET_LABEL,
	formatStudentTarget,
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
});
