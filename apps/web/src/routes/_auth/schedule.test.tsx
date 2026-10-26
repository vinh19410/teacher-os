// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { ScheduleRoute } from "./schedule";

// Monday 12/10/2026, 10:00 Vietnam time.
const MONDAY = new Date("2026-10-12T03:00:00Z");

function weekSnapshot() {
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
		expect(
			screen
				.getByRole("link", { name: "Tuần này" })
				.getAttribute("aria-disabled"),
		).toBe("true");
		// No fake calendar-sync chrome (Google Calendar is a non-goal).
		expect(document.body.textContent).not.toMatch(/GCal|Google Calendar/);
	});

	it("follows the ?week= param and links to the neighbouring weeks", async () => {
		start();
		routerState.search = { week: "2026-10-21" };
		renderWithKernel(<ScheduleRoute />);
		expect(await screen.findByText(/^Tuần 19–25\/10/)).toBeTruthy();
		expect(dayColumnLabels()[0]).toBe("T2 19/10");
		expect(
			screen.getByRole("link", { name: "← Tuần trước" }).getAttribute("href"),
		).toBe("/schedule?week=2026-10-12");
		expect(
			screen.getByRole("link", { name: "Tuần sau →" }).getAttribute("href"),
		).toBe("/schedule?week=2026-10-26");
		expect(
			screen
				.getByRole("link", { name: "Tuần này" })
				.getAttribute("aria-disabled"),
		).toBe("false");
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
				search: {},
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
