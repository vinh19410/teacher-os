import { describe, expect, test } from "vitest";
import { bandFromClassLevel } from "./assignment-presets";

describe("bandFromClassLevel", () => {
	test("parses standard Band labels", () => {
		expect(bandFromClassLevel("Band 5.5")).toBe("5.5");
		expect(bandFromClassLevel("Band 6.0")).toBe("6.0");
		expect(bandFromClassLevel("Band 6.5")).toBe("6.5");
		expect(bandFromClassLevel("Band 7.0")).toBe("7.0");
		expect(bandFromClassLevel("Band 7.5")).toBe("7.5");
		expect(bandFromClassLevel("Band 8.0")).toBe("8.0");
	});

	test("parses Band with plus sign", () => {
		expect(bandFromClassLevel("Band 7.5+")).toBe("7.5");
		expect(bandFromClassLevel("Band 8.0+")).toBe("8.0");
	});

	test("parses IELTS prefixes and standalone numbers", () => {
		expect(bandFromClassLevel("IELTS 5.5")).toBe("5.5");
		expect(bandFromClassLevel("IELTS 6.5")).toBe("6.5");
		expect(bandFromClassLevel("5.5")).toBe("5.5");
		expect(bandFromClassLevel("6.0")).toBe("6.0");
		expect(bandFromClassLevel("Band 5")).toBe("5.0");
		expect(bandFromClassLevel("Band 6")).toBe("6.0");
	});

	test("parses score ranges and returns target (upper) band", () => {
		expect(bandFromClassLevel("IELTS 5.0–6.0")).toBe("6.0");
		expect(bandFromClassLevel("5.5 - 6.5")).toBe("6.5");
		expect(bandFromClassLevel("Band 6.5-7.5")).toBe("7.5");
	});

	test("ignores cohort, grade, year, or room prefixes", () => {
		expect(bandFromClassLevel("Lớp 12 - Band 7.0")).toBe("7.0");
		expect(bandFromClassLevel("Khóa 2026 - Band 6.5")).toBe("6.5");
		expect(bandFromClassLevel("K15 - Band 5.5")).toBe("5.5");
	});

	test("rejects non-IELTS classes or classes with TOEIC scores, grade numbers, or room numbers", () => {
		expect(bandFromClassLevel("TOEIC 550")).toBeNull();
		expect(bandFromClassLevel("TOEIC 600–700")).toBeNull();
		expect(bandFromClassLevel("Luyện thi TOEIC 650")).toBeNull();
		expect(bandFromClassLevel("Band 6.5", "communication")).toBeNull();
		expect(bandFromClassLevel("Phòng 602")).toBeNull();
		expect(bandFromClassLevel("Lớp 6")).toBeNull();
		expect(bandFromClassLevel("Grade 7")).toBeNull();
		expect(bandFromClassLevel("Khối 8")).toBeNull();
	});

	test("returns null for out-of-range, non-band, or empty levels", () => {
		expect(bandFromClassLevel("")).toBeNull();
		expect(bandFromClassLevel(null as unknown as string)).toBeNull();
		expect(bandFromClassLevel(undefined as unknown as string)).toBeNull();
		expect(bandFromClassLevel("B2")).toBeNull();
		expect(bandFromClassLevel("Foundation")).toBeNull();
		expect(bandFromClassLevel("Band 4.0")).toBeNull();
		expect(bandFromClassLevel("Band 8.5")).toBeNull();
	});
});
