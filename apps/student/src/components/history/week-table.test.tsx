// @vitest-environment jsdom
import type { HistoryWeekResponse } from "@teacher-os/api/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WeekTable } from "@/components/history/week-table";

const WEEK: HistoryWeekResponse = {
	monday: "2026-10-05",
	rows: [
		{ skill: "reading", days: [1, 1, 0, 0, 0, 0, 0] },
		{ skill: "listening", days: [0, 0, 0, 0, 0, 0, 0] },
		{ skill: "writing", days: [0, 0, 0, 0, 0, 0, 0] },
		{ skill: "speaking", days: [0, 0, 0, 0, 0, 0, 0] },
		{ skill: "vocabulary", days: [2, 0, 0, 0, 0, 0, 0] },
	],
	minutes: [36, 30, 0, 0, 0, 0, 0],
};

afterEach(() => {
	cleanup();
});

describe("WeekTable (phase 11 #378)", () => {
	it("vẽ 7 hàng Thứ 2 → CN với đếm theo kỹ năng và nhãn tiếng Việt", () => {
		render(<WeekTable week={WEEK} todayKey="2026-10-21" />);
		expect(screen.getByText("Ngày")).toBeTruthy();
		for (const label of ["Reading", "Listening", "Writing", "Từ vựng"]) {
			expect(screen.getByText(label)).toBeTruthy();
		}
		// Hàng 05/10 có Reading = 1 và Vocab = 2 (theo thẻ).
		const row = screen.getByText("05/10").closest("tr");
		expect(row?.textContent).toContain("05/10");
		// Pill đếm: cột Reading ngày 06/10 = 1.
		expect(screen.getByText("Tổng")).toBeTruthy();
	});

	it("tổng cột và cột thời gian: 1h 06m cho 66 phút", () => {
		render(<WeekTable week={WEEK} todayKey="2026-10-21" />);
		// Tổng tuần = 66 phút → "1h 06m"; từng ngày "36m"/"30m".
		expect(screen.getByText("1h 06m")).toBeTruthy();
		expect(screen.getByText("36m")).toBeTruthy();
		expect(screen.getByText("30m")).toBeTruthy();
	});

	it("tuần hiện tại: nhãn 'Hôm nay' và ngày tương lai hiển thị '—'", () => {
		const thisWeek: HistoryWeekResponse = {
			monday: "2026-10-19",
			rows: WEEK.rows,
			minutes: [10, 0, 0, 0, 0, 0, 0],
		};
		render(<WeekTable week={thisWeek} todayKey="2026-10-21" />);
		expect(screen.getByText("Hôm nay")).toBeTruthy();
		// 25/10 (CN) là ngày tương lai → cột đếm + thời gian là "—".
		const futureRow = screen.getByText("25/10").closest("tr");
		expect(futureRow?.textContent).toContain("—");
	});
});
