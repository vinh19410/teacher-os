import { describe, expect, test } from "vitest";
import {
	addMinutes,
	formatSchedule,
	lessonDayLabel,
	parseSchedule,
} from "./format-schedule";

describe("parseSchedule", () => {
	test("parses a valid structured schedule", () => {
		expect(
			parseSchedule('{"days":[1,3],"start":"19:00","end":"20:30"}'),
		).toEqual({ days: [1, 3], start: "19:00", end: "20:30" });
	});

	test("rejects wrong shape, bad day, bad time, and non-JSON legacy strings", () => {
		expect(parseSchedule('{"start":"19:00","end":"20:30"}')).toBeNull();
		expect(
			parseSchedule('{"days":[7],"start":"19:00","end":"20:30"}'),
		).toBeNull();
		expect(
			parseSchedule('{"days":["1"],"start":"19:00","end":"20:30"}'),
		).toBeNull();
		expect(
			parseSchedule('{"days":[1],"start":"99:99","end":"20:30"}'),
		).toBeNull();
		expect(parseSchedule('"T3 & T5 · 19:00–20:30"')).toBeNull();
		expect(parseSchedule("")).toBeNull();
	});
});

describe("formatSchedule", () => {
	test("formats structured JSON as day names joined with & and an en-dash range", () => {
		expect(formatSchedule('{"days":[1,3],"start":"19:00","end":"20:30"}')).toBe(
			"T3 & T5 · 19:00–20:30",
		);
		expect(formatSchedule('{"days":[6],"start":"09:00","end":"10:30"}')).toBe(
			"CN · 09:00–10:30",
		);
	});

	test("returns the raw string verbatim for legacy free text", () => {
		expect(formatSchedule("T3 & T5 · 19:00–20:30")).toBe(
			"T3 & T5 · 19:00–20:30",
		);
		expect(formatSchedule("")).toBe("");
	});
});

describe("lessonDayLabel", () => {
	test("maps 1-based lesson day onto day names (1 = Monday → T2, 7 = Sunday → CN)", () => {
		expect(lessonDayLabel(1)).toBe("T2");
		expect(lessonDayLabel(2)).toBe("T3");
		expect(lessonDayLabel(6)).toBe("T7");
		expect(lessonDayLabel(7)).toBe("CN");
	});

	test("falls back to a plain label for out-of-range days instead of guessing", () => {
		expect(lessonDayLabel(0)).toBe("day 0");
		expect(lessonDayLabel(8)).toBe("day 8");
	});
});

describe("addMinutes", () => {
	test("adds minutes within the same day", () => {
		expect(addMinutes("19:00", 90)).toBe("20:30");
		expect(addMinutes("09:15", 45)).toBe("10:00");
	});

	test("wraps past midnight", () => {
		expect(addMinutes("23:00", 90)).toBe("00:30");
		expect(addMinutes("23:30", 30)).toBe("00:00");
	});
});
