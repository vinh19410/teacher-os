import { describe, expect, test } from "vitest";
import { generateScheduleLessons } from "./routes/kernel";

const MON_THU = JSON.stringify({ days: [0, 3], start: "19:00", end: "20:30" });

function sessionDates(startDate: string, sessionsTotal: number): string[] {
	return generateScheduleLessons({
		schedule: MON_THU,
		startDate,
		sessionsTotal,
		orgId: "org",
		classId: "cls",
		enrollmentId: "enr",
	})
		.map((row) => row.date)
		.sort() as string[];
}

describe("generateScheduleLessons: Mon+Thu class takes the first N scheduled days from startDate", () => {
	test.each([
		{
			start: "2026-11-05",
			label: "Thursday",
			expected: [
				"2026-11-05",
				"2026-11-09",
				"2026-11-12",
				"2026-11-16",
				"2026-11-19",
			],
		},
		{
			start: "2026-10-29",
			label: "Thursday",
			expected: [
				"2026-10-29",
				"2026-11-02",
				"2026-11-05",
				"2026-11-09",
				"2026-11-12",
			],
		},
		{
			start: "2026-11-02",
			label: "Monday",
			expected: [
				"2026-11-02",
				"2026-11-05",
				"2026-11-09",
				"2026-11-12",
				"2026-11-16",
			],
		},
		{
			start: "2026-10-30",
			label: "Friday",
			expected: [
				"2026-11-02",
				"2026-11-05",
				"2026-11-09",
				"2026-11-12",
				"2026-11-16",
			],
		},
	])("5 sessions starting $label $start", ({ start, expected }) => {
		expect(sessionDates(start, 5)).toEqual(expected);
	});

	test("each row's weekday matches its date", () => {
		const rows = generateScheduleLessons({
			schedule: MON_THU,
			startDate: "2026-11-05",
			sessionsTotal: 5,
			orgId: "org",
			classId: "cls",
			enrollmentId: "enr",
		});
		for (const row of rows) {
			const weekday = new Date(`${row.date}T00:00:00Z`).getUTCDay();
			expect(row.day).toBe(weekday === 0 ? 7 : weekday);
		}
	});
});
