// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DailyAttendanceResponse } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISOVietnam } from "@/lib/week-grid";
import { resetRouterState, routerState } from "@/test/router-mock";

// Vitest hoists vi.mock above top-level imports, so the factory must load router-mock dynamically.
vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AttendanceRoute, validateAttendanceSearch } from "./attendance";

// Thứ Tư giữa sáng giờ máy (2026-10-07).
const WEDNESDAY = new Date("2026-10-07T03:00:00Z");

const SAMPLE_DAILY: DailyAttendanceResponse = {
	date: "2026-10-07",
	sessions: [
		{
			classId: "cls-1",
			className: "IELTS 6.5A",
			time: "18:00",
			dur: 90,
			mode: "dated",
			recorded: false,
			students: [
				{
					lessonId: "l-1",
					studentId: "s-1",
					studentName: "Nguyễn Minh Anh",
					attendance: null,
					note: "",
				},
			],
		},
		{
			classId: "cls-2",
			className: "IELTS 5.0B",
			time: "19:30",
			dur: 90,
			mode: "dated",
			recorded: true,
			students: [
				{
					lessonId: "l-2",
					studentId: "s-2",
					studentName: "Trần Hoàng Nam",
					attendance: "present",
					note: "Tốt",
				},
			],
		},
	],
	counts: { all: 2, pending: 1, completed: 1 },
};

function renderAttendance() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<AttendanceRoute />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	resetRouterState();
	routerState.routeContext = {
		session: { data: { user: { name: "Cô Hạnh", email: "h@example.com" } } },
	};
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("validateAttendanceSearch", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(WEDNESDAY);
	});

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

describe("/attendance screen (TOS-7 Phase 3)", () => {
	it("hiển thị rỗng khi không có ca học nào trong ngày", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						date: "2026-10-07",
						sessions: [],
						counts: { all: 0, pending: 0, completed: 0 },
					}),
					{ status: 200 },
				),
			),
		);

		renderAttendance();
		expect(
			screen.getByRole("heading", { name: "Điểm danh tổng theo ngày" }),
		).toBeTruthy();
		expect(
			await screen.findByText("Không có ca học nào trong ngày này."),
		).toBeTruthy();
	});

	it("khi status=pending, tự mở sẵn ca chưa điểm danh đầu tiên; chọn trạng thái và lưu gọi PUT, hiện toast và thu gọn hàng", async () => {
		routerState.search = { date: "2026-10-07", status: "pending" };
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (init?.method === "PUT") {
					return new Response(JSON.stringify({ updated: 1, recorded: true }), {
						status: 200,
					});
				}
				if (url.includes("/api/attendance/daily")) {
					return new Response(JSON.stringify(SAMPLE_DAILY), { status: 200 });
				}
				return new Response("{}", { status: 404 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderAttendance();

		// Chỉ hiện ca pending (IELTS 6.5A), ca đã lưu (IELTS 5.0B) được lọc ẩn.
		expect(await screen.findByText("IELTS 6.5A")).toBeTruthy();
		expect(screen.queryByText("IELTS 5.0B")).toBeNull();

		// Ca chưa điểm danh đầu tiên tự mở sẵn -> thấy radiogroup của Nguyễn Minh Anh.
		const group = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group).getByRole("radio", { name: "Có mặt" }));

		const noteInput = screen.getByLabelText(
			"Ghi chú học vụ của Nguyễn Minh Anh",
		);
		fireEvent.change(noteInput, { target: { value: "  Đủ bài tập  " } });

		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã lưu điểm danh"),
		);

		const putCall = fetchMock.mock.calls.find(
			(call) => call[1]?.method === "PUT",
		);
		expect(putCall).toBeTruthy();
		expect(String(putCall?.[0])).toContain(
			"/api/classes/cls-1/sessions/2026-10-07/attendance",
		);
		expect(JSON.parse(String(putCall?.[1]?.body))).toEqual({
			entries: [{ lessonId: "l-1", attendance: "present", note: "Đủ bài tập" }],
		});
	});

	it("409 roster-changed hoặc 422 incomplete-roster tự báo lỗi và tải lại danh sách", async () => {
		routerState.search = { date: "2026-10-07", status: "pending" };
		let getCalls = 0;
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PUT") {
					return new Response(
						JSON.stringify({
							error: "roster changed",
							reason: "roster-changed",
						}),
						{ status: 409 },
					);
				}
				getCalls += 1;
				return new Response(JSON.stringify(SAMPLE_DAILY), { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderAttendance();

		const group = await screen.findByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		await waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(
				"Danh sách lớp vừa thay đổi, đã tải lại.",
			),
		);
		expect(getCalls).toBeGreaterThanOrEqual(2);
	});

	it("bấm chip lọc và đổi ngày đẩy search param lên URL", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(SAMPLE_DAILY), { status: 200 }),
				),
		);

		renderAttendance();
		expect(await screen.findByText("IELTS 6.5A")).toBeTruthy();
		expect(screen.getByText("IELTS 5.0B")).toBeTruthy();

		const chipGroup = screen.getByRole("group", {
			name: "Lọc trạng thái điểm danh",
		});
		fireEvent.click(
			within(chipGroup).getByRole("button", { name: "Đã điểm danh" }),
		);
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/attendance",
			search: { date: "2026-10-07", status: "completed" },
		});

		const dateInput = screen.getByLabelText("Chọn ngày điểm danh");
		fireEvent.change(dateInput, { target: { value: "2026-10-08" } });
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/attendance",
			search: { date: "2026-10-08", status: "all" },
		});
	});
});
