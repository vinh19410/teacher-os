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

describe("/attendance TOS-8 auto-advance", () => {
	const pendingSession = (
		classId: string,
		className: string,
		time: string,
		lessonId: string,
		studentName: string,
	): DailyAttendanceResponse["sessions"][number] => ({
		classId,
		className,
		time,
		dur: 90,
		mode: "dated",
		recorded: false,
		students: [
			{
				lessonId,
				studentId: `st-${lessonId}`,
				studentName,
				attendance: null,
				note: "",
			},
		],
	});

	const TWO_PENDING: DailyAttendanceResponse = {
		date: "2026-10-07",
		sessions: [
			pendingSession("cls-1", "IELTS 6.5A", "18:00", "l-1", "Nguyễn Minh Anh"),
			pendingSession("cls-2", "IELTS 5.0B", "19:30", "l-2", "Trần Hoàng Nam"),
		],
		counts: { all: 2, pending: 2, completed: 0 },
	};

	const SAVED_CLS1: DailyAttendanceResponse = {
		...TWO_PENDING,
		sessions: [
			{
				...TWO_PENDING.sessions[0],
				recorded: true,
				students: [
					{
						lessonId: "l-1",
						studentId: "st-l-1",
						studentName: "Nguyễn Minh Anh",
						attendance: "present" as const,
						note: "",
					},
				],
			},
			TWO_PENDING.sessions[1],
		],
		counts: { all: 2, pending: 1, completed: 1 },
	};

	const ALL_DONE: DailyAttendanceResponse = {
		...TWO_PENDING,
		sessions: TWO_PENDING.sessions.map((s) => ({
			...s,
			recorded: true,
			students: s.students.map((st) => ({
				...st,
				attendance: "present" as const,
			})),
		})),
		counts: { all: 2, pending: 0, completed: 2 },
	};

	const LEGACY_MIXED: DailyAttendanceResponse = {
		date: "2026-10-07",
		sessions: [
			pendingSession("cls-1", "IELTS 6.5A", "18:00", "l-1", "Nguyễn Minh Anh"),
			{
				classId: "cls-9",
				className: "Lớp Cũ Chưa Gắn Lịch",
				time: "08:00",
				dur: 60,
				mode: "legacy",
				recorded: false,
				students: [
					{
						lessonId: null,
						studentId: "st-9",
						studentName: "Lê Thu Hà",
						attendance: null,
						note: "",
					},
				],
			},
		],
		counts: { all: 2, pending: 2, completed: 0 },
	};

	function statefulFetch(
		getResponses: DailyAttendanceResponse[],
		putStatus = 200,
	) {
		let getCalls = 0;
		let putCalls = 0;
		return {
			getCalls: () => getCalls,
			putCalls: () => putCalls,
			mock: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PUT") {
					putCalls += 1;
					if (putStatus !== 200) {
						return new Response(
							JSON.stringify({
								error: "roster changed",
								reason: "roster-changed",
							}),
							{ status: putStatus },
						);
					}
					return new Response(JSON.stringify({ updated: 1, recorded: true }), {
						status: 200,
					});
				}
				const body = getResponses[Math.min(getCalls, getResponses.length - 1)];
				getCalls += 1;
				return new Response(JSON.stringify(body), { status: 200 });
			}),
		};
	}

	async function saveFirstPendingSession() {
		// Chip `all` không tự mở ca nào — bấm header để mở; chip `pending` đã
		// tự mở ca đầu (radiogroup có sẵn thì đừng bấm header nữa kẻo thu gọn).
		await screen.findByText("IELTS 6.5A");
		if (
			screen.queryByRole("radiogroup", {
				name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
			}) === null
		) {
			fireEvent.click(screen.getByRole("button", { name: /IELTS 6.5A/ }));
		}
		const group = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã lưu điểm danh"),
		);
	}

	it("lưu ca đầu thành công → ca pending kế tiếp tự mở và picker đầu tiên nhận focus", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		const { mock } = statefulFetch([TWO_PENDING, SAVED_CLS1]);
		vi.stubGlobal("fetch", mock);

		renderAttendance();
		await saveFirstPendingSession();

		const group2 = await screen.findByRole("radiogroup", {
			name: /Trạng thái điểm danh của Trần Hoàng Nam/,
		});
		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(group2).getByRole("radio", { name: "Có mặt" }),
			),
		);
		// Không tái mở ca vừa lưu (post-refetch: cls-1 đã recorded → header thu gọn).
		expect(
			screen
				.getByRole("button", { name: /IELTS 6.5A/ })
				.getAttribute("aria-expanded"),
		).toBe("false");
	});

	it("lưu ca cuối (hết pending) → aria-live thông báo hoàn tất và focus về ô chọn ngày", async () => {
		routerState.search = { date: "2026-10-07", status: "pending" };
		const { mock } = statefulFetch([TWO_PENDING, ALL_DONE]);
		vi.stubGlobal("fetch", mock);

		renderAttendance();
		await saveFirstPendingSession();

		await waitFor(() =>
			expect(
				screen.getByTestId("attendance-live-status").textContent,
			).toContain("Đã điểm danh xong mọi ca trong ngày"),
		);
		expect(document.activeElement).toBe(
			screen.getByLabelText("Chọn ngày điểm danh"),
		);
		// Không tái mở ca vừa lưu; empty-state chip pending hiện chữ hoàn tất
		// (text trùng với live region nên đếm qua getAllByText, không findByText).
		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(
			screen.getAllByText("Đã điểm danh xong mọi ca trong ngày").length,
		).toBeGreaterThanOrEqual(1);
	});

	it("ngày còn lớp legacy chưa điểm danh → thông báo hoàn tất kèm ghi chú ca legacy, không tự mở legacy", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		const savedCls1Only: DailyAttendanceResponse = {
			...LEGACY_MIXED,
			sessions: [
				{
					...LEGACY_MIXED.sessions[0],
					recorded: true,
					students: [
						{
							lessonId: "l-1",
							studentId: "st-l-1",
							studentName: "Nguyễn Minh Anh",
							attendance: "present" as const,
							note: "",
						},
					],
				},
				LEGACY_MIXED.sessions[1],
			],
			counts: { all: 2, pending: 1, completed: 1 },
		};
		const { mock } = statefulFetch([LEGACY_MIXED, savedCls1Only]);
		vi.stubGlobal("fetch", mock);

		renderAttendance();
		await saveFirstPendingSession();

		await waitFor(() =>
			expect(
				screen.getByTestId("attendance-live-status").textContent,
			).toContain("Còn 1 ca lớp chưa gắn lịch ngày"),
		);
		expect(document.activeElement).toBe(
			screen.getByLabelText("Chọn ngày điểm danh"),
		);
	});

	it("lưu thất bại 409 roster-changed → không auto-advance, không thông báo hoàn tất, hàng giữ nguyên", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		const { mock } = statefulFetch([TWO_PENDING], 409);
		vi.stubGlobal("fetch", mock);

		renderAttendance();
		await screen.findByText("IELTS 6.5A");
		fireEvent.click(screen.getByRole("button", { name: /IELTS 6.5A/ }));
		const group = screen.getByRole("radiogroup", {
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
		expect(screen.getByTestId("attendance-live-status").textContent).toBe("");
		// cls-2 không tự mở; cls-1 vẫn mở để sửa lại.
		expect(
			screen
				.getByRole("button", { name: /IELTS 6.5A/ })
				.getAttribute("aria-expanded"),
		).toBe("true");
		expect(
			screen.queryByRole("radiogroup", { name: /Trần Hoàng Nam/ }),
		).toBeNull();
	});

	it("đổi ngày giữa lúc lưu → bỏ auto-advance (sessionKey không chứa ngày)", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		const { promise: putPromise, resolve: resolvePut } =
			Promise.withResolvers<Response>();
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PUT") {
					return putPromise;
				}
				return new Response(JSON.stringify(TWO_PENDING), { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderAttendance();
		await screen.findByText("IELTS 6.5A");
		fireEvent.click(screen.getByRole("button", { name: /IELTS 6.5A/ }));
		const group = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		// Người dùng đổi ngày trong lúc PUT đang bay. Mock navigate không tự áp
		// search — gán TRƯỚC fireEvent để render do setState đọc giá trị mới
		// (fireEvent flush render + effects đồng bộ ngay trong lệnh gọi).
		routerState.search = { date: "2026-10-08", status: "all" };
		fireEvent.change(screen.getByLabelText("Chọn ngày điểm danh"), {
			target: { value: "2026-10-08" },
		});
		await waitFor(() => expect(routerState.navigate).toHaveBeenCalled());
		resolvePut(
			new Response(JSON.stringify({ updated: 1, recorded: true }), {
				status: 200,
			}),
		);

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		expect(
			screen.queryByRole("radiogroup", { name: /Trần Hoàng Nam/ }),
		).toBeNull();
		expect(screen.getByTestId("attendance-live-status").textContent).toBe("");
	});

	it("refetch sau lưu lỗi → bỏ auto-advance, không thông báo sai", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		let getCalls = 0;
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PUT") {
					return new Response(JSON.stringify({ updated: 1, recorded: true }), {
						status: 200,
					});
				}
				getCalls += 1;
				if (getCalls === 1) {
					return new Response(JSON.stringify(TWO_PENDING), { status: 200 });
				}
				return new Response(JSON.stringify({ error: "boom" }), { status: 500 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderAttendance();
		await saveFirstPendingSession();

		// Refetch thứ 2 lỗi 500 → query error, không mở ca kế tiếp.
		expect(
			screen.queryByRole("radiogroup", { name: /Trần Hoàng Nam/ }),
		).toBeNull();
		expect(screen.getByTestId("attendance-live-status").textContent).toBe("");
	});

	it("double-submit khi PUT chưa xong: guard savingRef chặn re-entry, chỉ 1 PUT", async () => {
		routerState.search = { date: "2026-10-07", status: "all" };
		const { promise: putPromise } = Promise.withResolvers<Response>();
		const fetchMock = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "PUT") return putPromise;
				return new Response(JSON.stringify(TWO_PENDING), { status: 200 });
			},
		);
		vi.stubGlobal("fetch", fetchMock);

		renderAttendance();
		await screen.findByText("IELTS 6.5A");
		fireEvent.click(screen.getByRole("button", { name: /IELTS 6.5A/ }));
		// Điền đủ học viên của ca đang mở (cls-2 collapse nên không có picker)
		// để bấm lưu đi thẳng đường PUT (không mở modal).
		const group1 = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group1).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);
		// Bấm lần 2 ngay khi PUT còn treo (red-team FAIL-3): nút đang "Đang lưu…"
		// và savingRef chặn re-entry trong handleSaveSession.
		const saveButton = screen.getByRole("button", { name: "Đang lưu…" });
		expect(saveButton.hasAttribute("disabled")).toBe(true);
		fireEvent.click(saveButton);

		const puts = fetchMock.mock.calls.filter(
			(call) => call[1]?.method === "PUT",
		);
		expect(puts.length).toBe(1);
	});

	it("ngày còn đúng 1 ca pending: lưu xong không tái mở chính nó, thông báo hoàn tất", async () => {
		routerState.search = { date: "2026-10-07", status: "pending" };
		const SINGLE_PENDING: DailyAttendanceResponse = {
			date: "2026-10-07",
			sessions: [
				pendingSession(
					"cls-1",
					"IELTS 6.5A",
					"18:00",
					"l-1",
					"Nguyễn Minh Anh",
				),
			],
			counts: { all: 1, pending: 1, completed: 0 },
		};
		const SINGLE_DONE: DailyAttendanceResponse = {
			...SINGLE_PENDING,
			sessions: [
				{
					...SINGLE_PENDING.sessions[0],
					recorded: true,
					students: [
						{
							lessonId: "l-1",
							studentId: "st-l-1",
							studentName: "Nguyễn Minh Anh",
							attendance: "present" as const,
							note: "",
						},
					],
				},
			],
			counts: { all: 1, pending: 0, completed: 1 },
		};
		const { mock } = statefulFetch([SINGLE_PENDING, SINGLE_DONE]);
		vi.stubGlobal("fetch", mock);

		renderAttendance();
		await screen.findByText("IELTS 6.5A");
		// pending → ca đầu tự mở sẵn.
		const group = screen.getByRole("radiogroup", {
			name: /Trạng thái điểm danh của Nguyễn Minh Anh/,
		});
		fireEvent.click(within(group).getByRole("radio", { name: "Có mặt" }));
		fireEvent.click(
			screen.getByRole("button", { name: "Lưu điểm danh ca học" }),
		);

		// Red-team FAIL-1: wrap-around phải loại key ca vừa lưu.
		await waitFor(() =>
			expect(
				screen.getByTestId("attendance-live-status").textContent,
			).toContain("Đã điểm danh xong mọi ca trong ngày"),
		);
		// Hết pending: danh sách chip pending unmount toàn bộ row, không tái mở gì.
		expect(screen.queryByRole("radiogroup")).toBeNull();
	});
});
