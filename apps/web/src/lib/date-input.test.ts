import { describe, expect, test } from "vitest";
import {
	formatDateInputValue,
	getTomorrowDateInputValue,
	isFutureDateInputValue,
} from "./date-input";

describe("date input helpers", () => {
	const currentDate = new Date(2026, 7, 21, 15, 30);

	test("formats dates using the local calendar", () => {
		expect(formatDateInputValue(currentDate)).toBe("2026-08-21");
	});

	test("returns tomorrow across month and year boundaries", () => {
		expect(getTomorrowDateInputValue(new Date(2026, 7, 21))).toBe("2026-08-22");
		expect(getTomorrowDateInputValue(new Date(2026, 11, 31))).toBe(
			"2027-01-01",
		);
	});

	test("accepts only valid dates after today", () => {
		expect(isFutureDateInputValue("2026-08-22", currentDate)).toBe(true);
		expect(isFutureDateInputValue("2026-08-21", currentDate)).toBe(false);
		expect(isFutureDateInputValue("2026-08-20", currentDate)).toBe(false);
		expect(isFutureDateInputValue("2026-02-30", currentDate)).toBe(false);
		expect(isFutureDateInputValue("", currentDate)).toBe(false);
	});
});
