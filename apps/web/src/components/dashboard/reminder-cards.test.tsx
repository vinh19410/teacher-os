// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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
	it("render đủ 3 thẻ theo thứ tự 1, 2, 3 với nhãn chức năng rõ, số đếm và CTA đáy", () => {
		render(<ReminderCards data={FULL_DATA} canAccessFinance />);

		const attendanceCard = screen.getByTestId("reminder-card-attendance");
		expect(attendanceCard.getAttribute("data-done")).toBe("false");
		expect(within(attendanceCard).getByText("1")).toBeTruthy();
		expect(
			within(attendanceCard).getByTestId("reminder-card-label").textContent,
		).toBe("Điểm danh");
		expect(
			within(attendanceCard).getByRole("heading", {
				name: "Ca dạy hôm nay chưa điểm danh",
			}),
		).toBeTruthy();
		expect(
			within(attendanceCard).getByTestId("reminder-card-count").textContent,
		).toBe("2 ca dạy");
		expect(
			within(attendanceCard).getByTestId("reminder-card-cta").textContent,
		).toBe("Điểm danh");

		const gradingCard = screen.getByTestId("reminder-card-grading");
		expect(within(gradingCard).getByText("2")).toBeTruthy();
		expect(
			within(gradingCard).getByTestId("reminder-card-label").textContent,
		).toBe("Chấm bài");
		expect(
			within(gradingCard).getByRole("heading", {
				name: "Bài tập quá hạn chấm > 24h",
			}),
		).toBeTruthy();
		expect(
			within(gradingCard).getByTestId("reminder-card-count").textContent,
		).toBe("3 bài");
		expect(
			within(gradingCard).getByText("2 Writing · 1 Speaking"),
		).toBeTruthy();
		expect(
			within(gradingCard).getByTestId("reminder-card-cta").textContent,
		).toBe("Chấm bài");

		const tuitionCard = screen.getByTestId("reminder-card-tuition");
		expect(within(tuitionCard).getByText("3")).toBeTruthy();
		expect(
			within(tuitionCard).getByTestId("reminder-card-label").textContent,
		).toBe("Học phí");
		expect(
			within(tuitionCard).getByRole("heading", { name: "Học phí đến hạn" }),
		).toBeTruthy();
		expect(
			within(tuitionCard).getByTestId("reminder-card-count").textContent,
		).toBe("4 học viên");
		expect(tuitionCard.textContent).toContain("2.500.000đ cần thu");
		expect(
			within(tuitionCard).getByTestId("reminder-card-cta").textContent,
		).toBe("Xem học phí");
	});

	it("href thẻ điểm danh mang date và status=pending; thẻ chấm bài status=awaiting; aria-label mang thứ tự và nhãn", () => {
		render(<ReminderCards data={FULL_DATA} canAccessFinance />);
		const attendanceLink = screen.getByRole("link", {
			name: "1. Điểm danh — Ca dạy hôm nay chưa điểm danh",
		});
		const href = attendanceLink.getAttribute("href") ?? "";
		expect(href).toContain("/attendance");
		expect(href).toContain("date=2026-10-26");
		expect(href).toContain("status=pending");

		const gradingLink = screen.getByRole("link", {
			name: "2. Chấm bài — Bài tập quá hạn chấm > 24h",
		});
		expect(gradingLink.getAttribute("href")).toContain("/grading");
		expect(gradingLink.getAttribute("href")).toContain("status=awaiting");

		const tuitionLink = screen.getByRole("link", {
			name: "3. Học phí — Học phí đến hạn",
		});
		expect(tuitionLink.getAttribute("href")).toContain("/tuition");
	});

	it("fail-closed: mặc định không truyền canAccessFinance sẽ ẩn thẻ học phí", () => {
		const { container } = render(<ReminderCards data={FULL_DATA} />);
		expect(screen.queryByTestId("reminder-card-tuition")).toBeNull();
		expect(screen.queryByRole("link", { name: /Học phí/ })).toBeNull();
		expect(container.firstElementChild?.className).toContain("lg:grid-cols-2");
	});

	it("thiếu block tuition thì không render thẻ học phí và đổi grid sang 2 cột", () => {
		const withoutTuition: DashboardReminders = {
			...FULL_DATA,
			tuition: undefined,
		};
		const { container } = render(
			<ReminderCards data={withoutTuition} canAccessFinance />,
		);
		expect(screen.queryByTestId("reminder-card-tuition")).toBeNull();
		expect(screen.queryByRole("link", { name: /Học phí/ })).toBeNull();
		expect(container.firstElementChild?.className).toContain("lg:grid-cols-2");
	});

	it("ẩn thẻ học phí khi canAccessFinance=false ngay cả khi response còn block tuition", () => {
		const { container } = render(
			<ReminderCards data={FULL_DATA} canAccessFinance={false} />,
		);
		expect(screen.queryByTestId("reminder-card-tuition")).toBeNull();
		expect(screen.queryByRole("link", { name: /Học phí/ })).toBeNull();
		expect(screen.getByTestId("reminder-card-attendance")).toBeTruthy();
		expect(screen.getByTestId("reminder-card-grading")).toBeTruthy();
		expect(container.firstElementChild?.className).toContain("lg:grid-cols-2");
	});

	it("đếm 0 → nhãn zero inbox, ẩn số 0 và dòng preview thừa, CTA chuyển Xem lại và giữ URL đích", () => {
		const zeroData: DashboardReminders = {
			date: "2026-10-26",
			attendance: { pending: 0, items: [] },
			overdueGrading: { count: 0, writing: 0, speaking: 0 },
			tuition: { students: 0, outstanding: 0 },
		};
		render(<ReminderCards data={zeroData} canAccessFinance />);
		const labels = screen.getAllByText("Đã hoàn tất hôm nay");
		expect(labels).toHaveLength(3);
		expect(
			screen.getByTestId("reminder-card-attendance").getAttribute("data-done"),
		).toBe("true");
		expect(screen.queryByTestId("reminder-card-count")).toBeNull();
		expect(screen.queryByText("0 Writing · 0 Speaking")).toBeNull();
		expect(screen.queryByText(/0đ/)).toBeNull();
		expect(screen.getAllByText("Xem lại")).toHaveLength(3);
		const attendanceLink = screen.getByRole("link", {
			name: /Ca dạy hôm nay chưa điểm danh/,
		});
		expect(attendanceLink.getAttribute("href")).toContain("status=pending");
	});

	it("items preview cắt tối đa 3 dòng với giờ bắt đầu + tên lớp và hiển thị +N ca khác khi pending > 3", () => {
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
		render(<ReminderCards data={manyItems} canAccessFinance />);
		const attendanceCard = screen.getByTestId("reminder-card-attendance");
		expect(within(attendanceCard).getByText("07:00")).toBeTruthy();
		expect(within(attendanceCard).getByText("Lớp 1")).toBeTruthy();
		expect(within(attendanceCard).getByText("13:30")).toBeTruthy();
		expect(within(attendanceCard).getByText("Lớp 3")).toBeTruthy();
		expect(within(attendanceCard).getByText("+2 ca khác")).toBeTruthy();
		expect(within(attendanceCard).queryByText("Lớp 4")).toBeNull();
		expect(within(attendanceCard).queryByText("Lớp 5")).toBeNull();
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
