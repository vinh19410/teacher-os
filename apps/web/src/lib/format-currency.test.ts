import { describe, expect, it } from "vitest";
import { formatVndInput, parseVndAmount } from "./format-currency";

describe("formatVndInput", () => {
	it("formats digits incrementally with thousands commas", () => {
		expect(formatVndInput("4")).toBe("4");
		expect(formatVndInput("40")).toBe("40");
		expect(formatVndInput("400")).toBe("400");
		expect(formatVndInput("4000")).toBe("4,000");
		expect(formatVndInput("400000")).toBe("400,000");
		expect(formatVndInput("1000000")).toBe("1,000,000");
	});

	it("handles pasted currency string with dots and symbol", () => {
		expect(formatVndInput("1.000.000đ")).toBe("1,000,000");
	});

	it("strips negative numbers to empty string at UI layer", () => {
		expect(formatVndInput("-500")).toBe("");
		expect(formatVndInput("-5000")).toBe("");
	});

	it("strips decimal dots into concatenated digits", () => {
		expect(formatVndInput("10.5")).toBe("105");
	});

	it("handles empty string, zero, and leading zeros", () => {
		expect(formatVndInput("")).toBe("");
		expect(formatVndInput("0")).toBe("0");
		expect(formatVndInput("007")).toBe("7");
		expect(formatVndInput("000")).toBe("0");
	});

	it("is idempotent when formatting already-formatted strings", () => {
		expect(formatVndInput("1,000,000")).toBe("1,000,000");
		expect(formatVndInput("400,000")).toBe("400,000");
	});
});

describe("parseVndAmount", () => {
	it("returns null for empty or non-numeric strings", () => {
		expect(parseVndAmount("")).toBeNull();
		expect(parseVndAmount("abc")).toBeNull();
		expect(parseVndAmount("-500")).toBeNull();
	});

	it("parses zero and valid formatted numbers", () => {
		expect(parseVndAmount("0")).toBe(0);
		expect(parseVndAmount("400,000")).toBe(400000);
		expect(parseVndAmount("400.000đ")).toBe(400000);
		expect(parseVndAmount("1,000,000")).toBe(1000000);
	});

	it("handles boundary length up to 12 digits", () => {
		expect(parseVndAmount("999999999999")).toBe(999999999999);
		// 13 digits exceeds MAX_DIGITS
		expect(parseVndAmount("1234567890123")).toBeNull();
		expect(parseVndAmount("1,234,567,890,123")).toBeNull();
	});
});
