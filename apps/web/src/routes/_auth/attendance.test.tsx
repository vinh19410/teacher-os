// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISOVietnam } from "@/lib/week-grid";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route, validateAttendanceSearch } from "./attendance";

const AttendanceRoute = (
	Route as unknown as { component: () => React.ReactNode }
).component;

// Thứ Tư giữa sáng giờ máy.
const WEDNESDAY = new Date(2026, 9, 7, 10, 0);

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(WEDNESDAY);
	resetRouterState();
	routerState.routeContext = {
		session: { data: { user: { name: "Cô Hạnh", email: "h@example.com" } } },
	};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("validateAttendanceSearch", () => {
	it("giữ date hợp lệ dạng YYYY-MM-DD", () => {
		expect(validateAttendanceSearch({ date: "2026-10-26" })).toEqual({
			date: "2026-10-26",
			status: "all",
		});
	});

	it("date sai định dạng rơi về hôm nay (giờ VN), không throw", () => {
		const today = todayISOVietnam(new Date());
		expect(validateAttendanceSearch({ date: "26/10/2026" })).toEqual({
			date: today,
			status: "all",
		});
		expect(validateAttendanceSearch({ date: "2026-13-99" })).toEqual({
			date: today,
			status: "all",
		});
		expect(validateAttendanceSearch({ date: 42 })).toEqual({
			date: today,
			status: "all",
		});
	});

	it("thiếu date mặc định hôm nay, thiếu status mặc định all", () => {
		expect(validateAttendanceSearch({})).toEqual({
			date: todayISOVietnam(new Date()),
			status: "all",
		});
	});

	it("status nhận đúng 3 giá trị hợp đồng, giá trị lạ rơi về all", () => {
		expect(validateAttendanceSearch({ status: "pending" })).toMatchObject({
			status: "pending",
		});
		expect(validateAttendanceSearch({ status: "completed" })).toMatchObject({
			status: "completed",
		});
		expect(validateAttendanceSearch({ status: "weird" })).toMatchObject({
			status: "all",
		});
	});

	it("giữ đồng thời date + status", () => {
		expect(
			validateAttendanceSearch({ date: "2026-10-20", status: "pending" }),
		).toEqual({ date: "2026-10-20", status: "pending" });
	});
});

describe("/attendance route shell", () => {
	it("hiển thị PageHead và empty state trung tính, không có nút hành động", () => {
		routerState.search = { date: "2026-10-26", status: "pending" };
		render(<AttendanceRoute />);
		expect(
			screen.getByRole("heading", { name: "Điểm danh tổng theo ngày" }),
		).toBeTruthy();
		// Kicker là ngày đang chọn.
		expect(screen.getByText(/26\/10\/2026/)).toBeTruthy();
		expect(
			screen.getByText("Danh sách ca học trong ngày sẽ hiển thị tại đây."),
		).toBeTruthy();
		expect(screen.queryByRole("button")).toBeNull();
	});
});
