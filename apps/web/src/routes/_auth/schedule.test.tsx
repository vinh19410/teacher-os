// @vitest-environment jsdom

import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { todayISOVietnam } from "@/lib/week-grid";
import {
	classRow,
	enrollmentRow,
	type KernelServer,
	lessonRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	type WriteHandler,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ClassSessionModal } from "@/components/schedule/class-session-modal";
import { ScheduleRoute } from "./schedule";

// Monday 12/10/2026, 10:00 Vietnam time.
const MONDAY = new Date("2026-10-12T03:00:00Z");

function weekSnapshot(overrides: Partial<KernelSnapshot> = {}) {
	return snapshotFixture({
		classes: [
			classRow({
				id: "cl-1",
				name: "IELTS Writing",
				schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
				startDate: "2026-10-12",
				sessionsTotal: 2,
			}),
		],
		students: [
			studentRow({ id: "st-1", name: "Học viên Một" }),
			studentRow({ id: "st-2", name: "Học viên Hai" }),
		],
		enrollments: [
			enrollmentRow({ id: "en-1", studentId: "st-1" }),
			enrollmentRow({ id: "en-2", studentId: "st-2" }),
		],
		lessons: [
			lessonRow({
				id: "les-1",
				enrollmentId: "en-1",
				day: 1,
				date: "2026-10-12",
				type: "1:2",
				topic: "Line chart",
				zoom: "https://meet.example/abc",
			}),
			lessonRow({
				id: "les-2",
				enrollmentId: "en-2",
				day: 1,
				date: "2026-10-12",
				type: "1:2",
				topic: "Line chart",
				zoom: "https://meet.example/abc",
			}),
		],
		...overrides,
	});
}

let server: KernelServer;
function start(onWrite?: WriteHandler) {
	server = startKernelServer(weekSnapshot(), onWrite);
	return server;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(MONDAY);
	resetRouterState();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function dayColumnLabels(): string[] {
	return Array.from(document.querySelectorAll(".day-col")).map(
		(col) => col.firstElementChild?.textContent ?? "",
	);
}

describe("schedule week grid", () => {
	it("shows the current week with real dates and highlights today", async () => {
		start();
		renderWithKernel(<ScheduleRoute />);
		expect(await screen.findByText(/^Tuần 12–18\/10 · 1 buổi$/)).toBeTruthy();
		expect(dayColumnLabels()).toEqual([
			"T2 12/10Hôm nay",
			"T3 13/10",
			"T4 14/10",
			"T5 15/10",
			"T6 16/10",
			"T7 17/10",
			"CN 18/10",
		]);
		const todayCol = document.querySelector(".day-col") as HTMLElement;
		expect(todayCol.className).toContain("ring-ring/20");
		expect(
			(document.querySelectorAll(".day-col")[1] as HTMLElement).className,
		).not.toContain("ring-ring/20");
		// TOS-14: nav là button (URL ?view=&date=), "Hôm nay" disabled khi đang
		// xem tuần hiện tại.
		expect(
			(screen.getByRole("button", { name: "Hôm nay" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		// No fake calendar-sync chrome (Google Calendar is a non-goal).
		expect(document.body.textContent).not.toMatch(/GCal|Google Calendar/);
	});

	it("follows the ?week= param, rewrites canonical URL, and navigates by button", async () => {
		start();
		routerState.search = { week: "2026-10-21" };
		renderWithKernel(<ScheduleRoute />);
		expect(await screen.findByText(/^Tuần 19–25\/10/)).toBeTruthy();
		expect(dayColumnLabels()[0]).toBe("T2 19/10");
		// Link ?week= cũ vẫn chạy (D1): scrub về ?view=week&date= tương đương.
		await waitFor(() =>
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/schedule",
				search: { view: "week", date: "2026-10-21" },
				replace: true,
			}),
		);
		// Nav theo button (TOS-14): prev sang tuần trước cùng view.
		fireEvent.click(screen.getByRole("button", { name: "← Tuần trước" }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/schedule",
			search: { view: "week", date: "2026-10-12" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Tuần sau →" }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/schedule",
			search: { view: "week", date: "2026-10-26" },
		});
		// Ngoài tuần hiện tại → "Hôm nay" khả dụng.
		expect(
			(screen.getByRole("button", { name: "Hôm nay" }) as HTMLButtonElement)
				.disabled,
		).toBe(false);
		// No highlighted "today" outside the current week.
		expect(document.querySelectorAll(".day-col.ring-2")).toHaveLength(0);
	});

	it("drops an invalid week param from the URL", async () => {
		start();
		routerState.search = { week: "not-a-date" };
		renderWithKernel(<ScheduleRoute />);
		await waitFor(() =>
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/schedule",
				search: { view: "week", date: todayISOVietnam() },
				replace: true,
			}),
		);
	});
});

describe("class session dialog from the week grid", () => {
	async function openMondaySession() {
		renderWithKernel(<ScheduleRoute />);
		fireEvent.click(
			await screen.findByRole("button", { name: /IELTS Writing/ }),
		);
		return screen.getByRole("dialog");
	}

	it("is titled with the clicked session's real date", async () => {
		start();
		const dialog = await openMondaySession();
		expect(dialog.textContent).toContain("IELTS Writing — ");
		expect(dialog.textContent).toContain("12/10");
		expect(dialog.textContent).toContain("Danh sách học viên (2)");
	});

	it("checks one student in once, blocking every action while it saves", async () => {
		let land: () => void = () => {};
		start(
			() =>
				new Promise((resolve) => {
					land = () => resolve(undefined);
				}),
		);
		const dialog = await openMondaySession();
		const one = within(dialog).getByRole("group", { name: "Học viên Một" });
		const two = within(dialog).getByRole("group", { name: "Học viên Hai" });

		fireEvent.click(within(one).getByRole("button", { name: "Điểm danh" }));
		await waitFor(() =>
			expect(
				(
					within(two).getByRole("button", {
						name: "Điểm danh",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true),
		);
		fireEvent.click(within(two).getByRole("button", { name: "Điểm danh" }));
		land();
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã điểm danh."),
		);
		expect(server.writes).toEqual([
			{ method: "POST", path: "/api/lessons/les-1/check-in", body: {} },
		]);
	});

	it("edits the session with all five fields prefilled and leaves edit mode only after the refresh", async () => {
		start();
		const dialog = await openMondaySession();
		fireEvent.click(
			within(
				within(dialog).getByRole("group", { name: "Học viên Một" }),
			).getByRole("button", { name: "Sửa buổi học" }),
		);
		const value = (label: string) =>
			(within(dialog).getByLabelText(label) as HTMLInputElement).value;
		expect(value("Thứ")).toBe("1");
		expect(value("Giờ (HH:MM)")).toBe("19:00");
		expect(value("Thời lượng (phút)")).toBe("90");
		expect(value("Link Zoom/Meet")).toBe("https://meet.example/abc");
		expect(value("Chủ đề")).toBe("Line chart");

		fireEvent.change(within(dialog).getByLabelText("Thời lượng (phút)"), {
			target: { value: "120" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));
		await waitFor(() =>
			expect(toast.success).toHaveBeenCalledWith("Đã sửa buổi học."),
		);
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/lessons/les-1/edit",
				body: {
					day: 1,
					time: "19:00",
					dur: 120,
					topic: "Line chart",
					zoom: "https://meet.example/abc",
				},
			},
		]);
		expect(within(dialog).queryByLabelText("Thứ")).toBeNull();
	});

	it("keeps the edit open with the typed values when the edit is rejected", async () => {
		start(() => ({ status: 422, body: {} }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const dialog = await openMondaySession();
		fireEvent.click(
			within(
				within(dialog).getByRole("group", { name: "Học viên Một" }),
			).getByRole("button", { name: "Sửa buổi học" }),
		);
		fireEvent.change(within(dialog).getByLabelText("Chủ đề"), {
			target: { value: "Bar chart" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));
		expect(await within(dialog).findByRole("alert")).toBeTruthy();
		expect(
			(within(dialog).getByLabelText("Chủ đề") as HTMLInputElement).value,
		).toBe("Bar chart");
	});

	it("refuses an invalid time before writing", async () => {
		start();
		const dialog = await openMondaySession();
		fireEvent.click(
			within(
				within(dialog).getByRole("group", { name: "Học viên Một" }),
			).getByRole("button", { name: "Sửa buổi học" }),
		);
		fireEvent.change(within(dialog).getByLabelText("Giờ (HH:MM)"), {
			target: { value: "7pm" },
		});
		expect(
			(within(dialog).getByRole("button", { name: "Lưu" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(server.writes).toEqual([]);
	});

	it("reopens on the student list, not on a half-finished edit", async () => {
		start();
		const dialog = await openMondaySession();
		fireEvent.click(
			within(
				within(dialog).getByRole("group", { name: "Học viên Một" }),
			).getByRole("button", { name: "Sửa buổi học" }),
		);
		// Footer "Đóng" (the header ✕ shares the accessible name).
		const closeButtons = within(dialog).getAllByRole("button", {
			name: "Đóng",
		});
		fireEvent.click(closeButtons[closeButtons.length - 1]);
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: /IELTS Writing/ }));
		const reopened = screen.getByRole("dialog");
		expect(within(reopened).queryByLabelText("Thứ")).toBeNull();
		expect(reopened.textContent).toContain("Danh sách học viên (2)");
	});

	it("TOS-7: shows detailed attendance badge when attendance is set, keeping legacy labels when null", async () => {
		server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: "IELTS Writing",
						schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
						startDate: "2026-10-12",
						sessionsTotal: 2,
					}),
				],
				students: [
					studentRow({ id: "st-1", name: "HV Có Mặt" }),
					studentRow({ id: "st-2", name: "HV Đi Muộn" }),
					studentRow({ id: "st-3", name: "HV Có Phép" }),
					studentRow({ id: "st-4", name: "HV Không Phép" }),
					studentRow({ id: "st-5", name: "HV Cũ 1-click" }),
				],
				enrollments: [
					enrollmentRow({ id: "en-1", studentId: "st-1" }),
					enrollmentRow({ id: "en-2", studentId: "st-2" }),
					enrollmentRow({ id: "en-3", studentId: "st-3" }),
					enrollmentRow({ id: "en-4", studentId: "st-4" }),
					enrollmentRow({ id: "en-5", studentId: "st-5" }),
				],
				lessons: [
					lessonRow({
						id: "les-1",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-10-12",
						status: "completed",
						attendance: "present",
					}),
					lessonRow({
						id: "les-2",
						enrollmentId: "en-2",
						day: 1,
						date: "2026-10-12",
						status: "completed",
						attendance: "late",
					}),
					lessonRow({
						id: "les-3",
						enrollmentId: "en-3",
						day: 1,
						date: "2026-10-12",
						status: "absent",
						attendance: "excused",
					}),
					lessonRow({
						id: "les-4",
						enrollmentId: "en-4",
						day: 1,
						date: "2026-10-12",
						status: "completed",
						attendance: "unexcused",
					}),
					lessonRow({
						id: "les-5",
						enrollmentId: "en-5",
						day: 1,
						date: "2026-10-12",
						status: "completed",
						attendance: null,
					}),
				],
			}),
		);
		const dialog = await openMondaySession();
		expect(
			within(
				within(dialog).getByRole("group", { name: "HV Có Mặt" }),
			).getByText("Có mặt"),
		).toBeTruthy();
		expect(
			within(
				within(dialog).getByRole("group", { name: "HV Đi Muộn" }),
			).getByText("Đi muộn"),
		).toBeTruthy();
		expect(
			within(
				within(dialog).getByRole("group", { name: "HV Có Phép" }),
			).getByText("Vắng có phép"),
		).toBeTruthy();
		expect(
			within(
				within(dialog).getByRole("group", { name: "HV Không Phép" }),
			).getByText("Vắng không phép"),
		).toBeTruthy();
		expect(
			within(
				within(dialog).getByRole("group", { name: "HV Cũ 1-click" }),
			).getByText("Hoàn thành"),
		).toBeTruthy();
	});
});

describe("schedule holiday labels (TOS-11)", () => {
	it("block tuần holiday hiển thị 'Nghỉ lễ — Đã dời sang dd/MM' từ snapshot shift", async () => {
		server = startKernelServer(
			weekSnapshot({
				lessons: [
					lessonRow({
						id: "les-1",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-10-12",
						type: "1:2",
						status: "holiday",
					}),
					lessonRow({
						id: "les-2",
						enrollmentId: "en-2",
						day: 1,
						date: "2026-10-12",
						type: "1:2",
						status: "holiday",
					}),
				],
				holidays: [
					{
						id: "hol-1",
						name: "Nghỉ lễ 20/11",
						fromDate: "2026-10-12",
						toDate: "2026-10-12",
						scope: "org",
						mode: "shift",
					},
				],
				holidayShifts: [
					{
						classId: "cl-1",
						originalDate: "2026-10-12",
						makeupDate: "2026-12-21",
					},
				],
			}),
		);
		renderWithKernel(<ScheduleRoute />);
		const block = await screen.findByText("IELTS Writing");
		expect(block).toBeTruthy();
		const blockEl = block.closest("button");
		expect(blockEl?.textContent).toContain("Nghỉ lễ — Đã dời lịch");
		expect(blockEl?.textContent).toContain("Nghỉ lễ 20/11");
		expect(blockEl?.textContent).toContain("Đã dời sang 21/12");
	});

	it("hiển thị nút + Tạo lịch nghỉ", async () => {
		start();
		renderWithKernel(<ScheduleRoute />);
		expect(await screen.findByTestId("holiday-open")).toBeTruthy();
	});

	it("TOS-13: kỳ nghỉ tương lai hiện thẻ kỳ nghỉ kèm nút 'Xóa kỳ nghỉ (Hoàn tác)' và xác nhận gọi DELETE /api/holidays/:id; kỳ nghỉ đã bắt đầu (fromDate = hôm nay) ẩn nút", async () => {
		server = startKernelServer(
			weekSnapshot({
				holidays: [
					{
						id: "hol-started",
						name: "Nghỉ hôm nay",
						fromDate: "2026-10-12",
						toDate: "2026-10-12",
						scope: "org",
						mode: "shift",
					},
					{
						id: "hol-future",
						name: "Nghỉ ngày mai",
						fromDate: "2026-10-13",
						toDate: "2026-10-13",
						scope: "org",
						mode: "shift",
					},
				],
				holidayShifts: [
					{
						holidayId: "hol-future",
						classId: "cl-1",
						originalDate: "2026-10-13",
						makeupDate: "2026-12-22",
					},
				],
			}),
			(req, s) => {
				if (
					req.method === "DELETE" &&
					req.path === "/api/holidays/hol-future"
				) {
					s.snapshot = {
						...s.snapshot,
						holidays: (s.snapshot.holidays ?? []).filter(
							(h) => h.id !== "hol-future",
						),
						holidayShifts: [],
					};
					return {
						status: 200,
						body: { restoredCount: 1, removedMakeupCount: 1 },
					};
				}
				return undefined;
			},
		);
		renderWithKernel(<ScheduleRoute />);
		const cards = await screen.findAllByTestId("holiday-calendar-card");
		expect(cards).toHaveLength(2);

		const startedCard = cards.find(
			(c) => c.getAttribute("data-holiday-id") === "hol-started",
		);
		const futureCard = cards.find(
			(c) => c.getAttribute("data-holiday-id") === "hol-future",
		);
		if (!startedCard || !futureCard) throw new Error("missing holiday cards");

		expect(
			within(startedCard).queryByTestId("holiday-undo-trigger"),
		).toBeNull();
		const undoBtn = within(futureCard).getByTestId("holiday-undo-trigger");
		expect(undoBtn.textContent).toBe("Xóa kỳ nghỉ (Hoàn tác)");

		fireEvent.click(undoBtn);
		expect(await screen.findByTestId("holiday-undo-dialog")).toBeTruthy();
		expect(screen.getByTestId("holiday-undo-summary").textContent).toBe(
			"Khôi phục 1 buổi gốc · Thu hồi 1 buổi bù",
		);

		fireEvent.click(screen.getByTestId("holiday-undo-confirm"));
		await waitFor(() => {
			expect(server.writes.map((w) => `${w.method} ${w.path}`)).toContain(
				"DELETE /api/holidays/hol-future",
			);
		});
	});

	it("TOS-13: block buổi cancelled do kỳ nghỉ hiển thị 'Đã hủy — «tên kỳ nghỉ»'", async () => {
		server = startKernelServer(
			weekSnapshot({
				lessons: [
					lessonRow({
						id: "les-1",
						enrollmentId: "en-1",
						day: 1,
						date: "2026-10-12",
						type: "1:2",
						status: "cancelled",
					}),
				],
				holidays: [
					{
						id: "hol-cancel-1",
						name: "Nghỉ bảo trì",
						fromDate: "2026-10-12",
						toDate: "2026-10-12",
						scope: "org",
						mode: "cancel",
					},
				],
				holidayCancels: [
					{
						holidayId: "hol-cancel-1",
						classId: "cl-1",
						date: "2026-10-12",
					},
				],
			}),
		);
		renderWithKernel(<ScheduleRoute />);
		const block = await screen.findByText("IELTS Writing");
		const blockEl = block.closest("button");
		expect(blockEl?.textContent).toContain("Đã hủy — Nghỉ bảo trì");
	});
});

describe("schedule views and org events (TOS-14)", () => {
	function eventsSnapshot() {
		return snapshotFixture({
			classes: [
				classRow({ id: "cl-1", name: "IELTS Writing" }),
				classRow({
					id: "cl-2",
					name: "Speaking cơ bản",
					schedule: '{"days":[2],"start":"08:00","end":"09:30"}',
				}),
			],
			students: [studentRow({ id: "st-1", name: "Học viên Một" })],
			enrollments: [enrollmentRow({ id: "en-1", studentId: "st-1" })],
			lessons: [
				lessonRow({
					id: "les-1",
					enrollmentId: "en-1",
					day: 1,
					date: "2026-10-12",
					type: "1:2",
					topic: "Line chart",
				}),
			],
			events: [
				{
					id: "ev-1",
					title: "Họp chuyên môn giáo viên",
					date: "2026-10-12",
					startTime: "15:00",
					endTime: "16:30",
					note: "",
				},
			],
		});
	}

	it("switches to month view and rewrites the URL", async () => {
		start();
		renderWithKernel(<ScheduleRoute />);
		await screen.findByText(/^Tuần 12–18\/10/);
		fireEvent.click(screen.getByRole("tab", { name: "Tháng" }));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/schedule",
			search: { view: "month", date: todayISOVietnam() },
		});
	});

	it("renders the month grid with per-class colors and day navigation", async () => {
		start();
		routerState.search = { view: "month", date: "2026-10-12" };
		renderWithKernel(<ScheduleRoute />);
		const grid = await screen.findByTestId("schedule-month-grid");
		// Bấm ngày mở view Ngày.
		fireEvent.click(within(grid).getByLabelText("Xem lịch ngày 12/10"));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/schedule",
			search: { view: "day", date: "2026-10-12" },
		});
	});

	it("creates an org event and shows it without a snapshot reload", async () => {
		start((req, s) => {
			if (req.method === "POST" && req.path === "/api/events") {
				const body = req.body as { title: string; date: string };
				const row = {
					id: "ev-new",
					title: body.title,
					date: body.date,
					startTime: (req.body as { startTime: string }).startTime,
					endTime: (req.body as { endTime: string }).endTime,
					note: "",
				};
				s.snapshot = {
					...s.snapshot,
					events: [...(s.snapshot.events ?? []), row],
				};
				return { status: 201, body: row };
			}
			return undefined;
		});
		renderWithKernel(<ScheduleRoute />);
		await screen.findByText(/^Tuần 12–18\/10/);
		const loadsBefore = server.snapshotLoads;
		fireEvent.click(screen.getByTestId("schedule-add-event"));
		fireEvent.change(screen.getByLabelText("Tên sự kiện *"), {
			target: { value: "Họp chuyên môn giáo viên" },
		});
		fireEvent.change(screen.getByLabelText("Từ giờ *"), {
			target: { value: "15:00" },
		});
		fireEvent.change(screen.getByLabelText("Đến giờ *"), {
			target: { value: "16:30" },
		});
		fireEvent.click(screen.getByTestId("org-event-submit"));
		// D6: chip hiện ngay từ response POST, KHÔNG refetch snapshot.
		expect(await screen.findByText("Họp chuyên môn giáo viên")).toBeTruthy();
		expect(server.writes.map((w) => `${w.method} ${w.path}`)).toContain(
			"POST /api/events",
		);
		expect(server.snapshotLoads).toBe(loadsBefore);
	});

	it("deletes an org event and removes the chip immediately", async () => {
		server = startKernelServer(eventsSnapshot(), (req, s) => {
			if (req.method === "DELETE" && req.path === "/api/events/ev-1") {
				s.snapshot = {
					...s.snapshot,
					events: (s.snapshot.events ?? []).filter((e) => e.id !== "ev-1"),
				};
				return { status: 200, body: { ok: true } };
			}
			return undefined;
		});
		renderWithKernel(<ScheduleRoute />);
		const chip = await screen.findByTestId("org-event-chip");
		fireEvent.click(chip);
		fireEvent.click(screen.getByTestId("org-event-delete"));
		fireEvent.click(screen.getByTestId("org-event-delete-confirm"));
		await waitFor(() => {
			expect(screen.queryByTestId("org-event-chip")).toBeNull();
		});
		expect(server.writes.map((w) => `${w.method} ${w.path}`)).toContain(
			"DELETE /api/events/ev-1",
		);
	});

	it("renders the day agenda with sessions and events", async () => {
		server = startKernelServer(eventsSnapshot());
		routerState.search = { view: "day", date: "2026-10-12" };
		renderWithKernel(<ScheduleRoute />);
		const agenda = await screen.findByTestId("schedule-day-agenda");
		expect(within(agenda).getByText("IELTS Writing")).toBeTruthy();
		expect(within(agenda).getByText("Họp chuyên môn giáo viên")).toBeTruthy();
		// Bấm ca học mở ClassSessionModal như view Tuần.
		fireEvent.click(within(agenda).getByText("IELTS Writing"));
		expect(await screen.findByRole("dialog")).toBeTruthy();
	});
});

describe("paused classes on /schedule (#694)", () => {
	it("shows empty state when all classes are paused and have no historical attendance", async () => {
		server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-p",
						name: "Lớp Tạm Dừng",
						status: "paused",
						schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
						startDate: "2026-10-12",
					}),
				],
				students: [studentRow()],
				enrollments: [enrollmentRow({ classId: "cl-p" })],
				lessons: [
					lessonRow({
						id: "les-up",
						classId: "cl-p",
						day: 1,
						date: "2026-10-12",
						status: "upcoming",
					}),
				],
				events: [],
			}),
		);
		renderWithKernel(<ScheduleRoute />);
		expect(await screen.findByTestId("schedule-empty-state")).toBeTruthy();
		expect(screen.queryByText("Lớp Tạm Dừng")).toBeNull();
	});

	it("keeps dated historical attendance visible when all classes are paused", async () => {
		server = startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-p",
						name: "Lớp Có Lịch Sử",
						status: "paused",
						schedule: '{"days":[1],"start":"19:00","end":"20:30"}',
						startDate: "2026-10-12",
					}),
				],
				students: [studentRow()],
				enrollments: [enrollmentRow({ classId: "cl-p" })],
				lessons: [
					lessonRow({
						id: "les-comp",
						classId: "cl-p",
						day: 1,
						date: "2026-10-12",
						status: "completed",
					}),
				],
				events: [],
			}),
		);
		renderWithKernel(<ScheduleRoute />);
		expect(
			await screen.findByRole("button", { name: /Lớp Có Lịch Sử/ }),
		).toBeTruthy();
		expect(screen.queryByTestId("schedule-empty-state")).toBeNull();
	});

	it("hides Điểm danh action inside ClassSessionModal when the class is paused (#694)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-p",
						name: "Lớp Tạm Dừng",
						status: "paused",
						schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
						startDate: "2026-10-12",
					}),
				],
				students: [studentRow({ id: "st-1", name: "Học viên Một" })],
				enrollments: [
					enrollmentRow({ id: "en-1", classId: "cl-p", studentId: "st-1" }),
				],
				lessons: [
					lessonRow({
						id: "les-1",
						classId: "cl-p",
						enrollmentId: "en-1",
						day: 1,
						time: "19:00",
						date: "2026-10-12",
						status: "upcoming",
					}),
				],
			}),
		);
		renderWithKernel(
			<ClassSessionModal
				sessionRef={{
					classId: "cl-p",
					dateISO: "2026-10-12",
					day: 1,
					time: "19:00",
				}}
				onClose={vi.fn()}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("Lớp Tạm Dừng");
		expect(dialog.textContent).toContain("Học viên Một");
		expect(
			within(dialog).queryByRole("button", { name: "Điểm danh" }),
		).toBeNull();
	});
});
