// @vitest-environment jsdom
import type { HistoryDay } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthHeatmap } from "@/components/history/month-heatmap";

const DAYS: HistoryDay[] = [
	{ date: "2026-10-05", count: 3, minutes: 36 },
	{ date: "2026-10-06", count: 1, minutes: 30 },
	{ date: "2026-10-19", count: 2, minutes: 50 },
];

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("MonthHeatmap (phase 11 #378)", () => {
	it("ô ngày là button với aria-label 'Ngày dd/mm: N bài' theo giờ VN", () => {
		render(
			<MonthHeatmap
				ym="2026-10"
				days={DAYS}
				week="2026-10-19"
				onWeek={vi.fn()}
				todayKey="2026-10-21"
			/>,
		);
		expect(
			screen.getByRole("button", { name: "Ngày 05/10: 3 bài" }),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Ngày 06/10: 1 bài" }),
		).toBeTruthy();
		// Ngày không hoạt động → 0 bài (vẫn button để chọn tuần).
		expect(
			screen.getByRole("button", { name: "Ngày 07/10: 0 bài" }),
		).toBeTruthy();
		expect(screen.getByText("Tháng 10/2026")).toBeTruthy();
	});

	it("bấm ô ngày đặt tuần chứa ngày đó (Thứ Hai) cho WeekTable", () => {
		const onWeek = vi.fn();
		render(
			<MonthHeatmap
				ym="2026-10"
				days={DAYS}
				week="2026-10-19"
				onWeek={onWeek}
				todayKey="2026-10-21"
			/>,
		);
		// 05/10/2026 là Thứ Hai → tuần bắt đầu đúng ngày đó.
		fireEvent.click(screen.getByRole("button", { name: "Ngày 05/10: 3 bài" }));
		expect(onWeek).toHaveBeenCalledWith("2026-10-05");
		// 19/10 cũng là Thứ Hai.
		fireEvent.click(screen.getByRole("button", { name: "Ngày 19/10: 2 bài" }));
		expect(onWeek).toHaveBeenLastCalledWith("2026-10-19");
	});

	it("ngày tương lai disabled; ô ngày của tuần đang chọn aria-pressed", () => {
		render(
			<MonthHeatmap
				ym="2026-10"
				days={DAYS}
				week="2026-10-19"
				onWeek={vi.fn()}
				todayKey="2026-10-21"
			/>,
		);
		const future = screen.getByRole("button", {
			name: "Ngày 31/10: 0 bài",
		}) as HTMLButtonElement;
		expect(future.disabled).toBe(true);
		// 19/10 thuộc tuần đang chọn → pressed; 05/10 thuộc tuần khác.
		const selected = screen.getByRole("button", {
			name: "Ngày 19/10: 2 bài",
		}) as HTMLButtonElement;
		expect(selected.getAttribute("aria-pressed")).toBe("true");
		const other = screen.getByRole("button", {
			name: "Ngày 05/10: 3 bài",
		}) as HTMLButtonElement;
		expect(other.getAttribute("aria-pressed")).toBe("false");
	});
});
