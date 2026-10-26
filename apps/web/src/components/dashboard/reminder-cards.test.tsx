// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetRouterState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import type { DashboardReminders } from "@teacher-os/api/contracts";
import { ReminderCards, remindersSectionTitle } from "./reminder-cards";

const FULL_DATA: DashboardReminders = {
	date: "2026-10-26",
	attendance: {
		pending: 2,
		items: [{ classId: "cl-1", className: "Lớp A", time: "18:00", dur: 90 }],
	},
	overdueGrading: { count: 3, writing: 2, speaking: 1 },
	tuition: { students: 4, outstanding: 2_500_000 },
};

afterEach(() => {
	cleanup();
	resetRouterState();
});

describe("ReminderCards", () => {
	it("render đủ 3 thẻ với số đếm", () => {
		render(<ReminderCards data={FULL_DATA} />);
		expect(
			screen.getByRole("heading", { name: "Ca học hôm nay chưa điểm danh" }),
		).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Bài tập quá hạn chấm > 24h" }),
		).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Học phí đến hạn / quá hạn thu" }),
		).toBeTruthy();
		expect(screen.getByText("2 ca")).toBeTruthy();
		expect(screen.getByText("3 bài")).toBeTruthy();
		expect(screen.getByText("4 học viên")).toBeTruthy();
		expect(screen.getByText("2 Writing · 1 Speaking")).toBeTruthy();
	});

	it("href thẻ điểm danh mang date và status=pending; thẻ chấm bài status=awaiting", () => {
		render(<ReminderCards data={FULL_DATA} />);
		const attendanceLink = screen.getByRole("link", {
			name: /Ca học hôm nay chưa điểm danh/,
		});
		const href = attendanceLink.getAttribute("href") ?? "";
		expect(href).toContain("/attendance");
		expect(href).toContain("date=2026-10-26");
		expect(href).toContain("status=pending");

		const gradingLink = screen.getByRole("link", {
			name: /Bài tập quá hạn chấm/,
		});
		expect(gradingLink.getAttribute("href")).toContain("status=awaiting");

		const tuitionLink = screen.getByRole("link", { name: /Học phí đến hạn/ });
		expect(tuitionLink.getAttribute("href")).toContain("/tuition");
	});

	it("thiếu block tuition thì không render thẻ học phí", () => {
		const withoutTuition: DashboardReminders = {
			...FULL_DATA,
			tuition: undefined,
		};
		render(<ReminderCards data={withoutTuition} />);
		expect(screen.queryByText(/Học phí đến hạn/)).toBeNull();
		expect(screen.queryByRole("link", { name: /Sổ học phí/ })).toBeNull();
	});

	it("đếm 0 → nhãn zero inbox, thẻ không hiển thị số, CTA vẫn dẫn đúng", () => {
		const zeroData: DashboardReminders = {
			date: "2026-10-26",
			attendance: { pending: 0, items: [] },
			overdueGrading: { count: 0, writing: 0, speaking: 0 },
			tuition: { students: 0, outstanding: 0 },
		};
		render(<ReminderCards data={zeroData} />);
		const labels = screen.getAllByText("Đã hoàn tất hôm nay");
		expect(labels).toHaveLength(3);
		expect(screen.queryByText("0 ca")).toBeNull();
		expect(screen.queryByText("0 bài")).toBeNull();
		const attendanceLink = screen.getByRole("link", {
			name: /Ca học hôm nay chưa điểm danh/,
		});
		expect(attendanceLink.getAttribute("href")).toContain("status=pending");
	});

	it("items preview cắt tối đa 3 dòng và ghép giờ kết thúc theo dur", () => {
		const manyItems: DashboardReminders = {
			...FULL_DATA,
			attendance: {
				pending: 5,
				items: [
					{ classId: "c1", className: "Lớp 1", time: "07:00", dur: 60 },
					{ classId: "c2", className: "Lớp 2", time: "09:00", dur: 45 },
					{ classId: "c3", className: "Lớp 3", time: "13:30", dur: 90 },
					{ classId: "c4", className: "Lớp 4", time: "15:00", dur: 120 },
					{ classId: "c5", className: "Lớp 5", time: "18:00", dur: 60 },
				],
			},
		};
		render(<ReminderCards data={manyItems} />);
		expect(screen.getByText("Lớp 1 (07:00 – 08:00)")).toBeTruthy();
		expect(screen.getByText("Lớp 3 (13:30 – 15:00)")).toBeTruthy();
		expect(screen.queryByText(/Lớp 4/)).toBeNull();
		expect(screen.queryByText(/Lớp 5/)).toBeNull();
	});
});

describe("remindersSectionTitle", () => {
	it("định dạng vi-VN: weekday từ ISO, không phụ thuộc múi máy", () => {
		expect(remindersSectionTitle("2026-10-26")).toBe(
			"Việc cần làm hôm nay (Thứ Hai, 26/10/2026)",
		);
		expect(remindersSectionTitle("2026-11-01")).toBe(
			"Việc cần làm hôm nay (Chủ Nhật, 01/11/2026)",
		);
	});
});
