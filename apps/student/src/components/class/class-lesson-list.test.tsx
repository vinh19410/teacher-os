// @vitest-environment jsdom

import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requestStudentZoomJoin } from "@/lib/repos/student";
import { ClassLessonList } from "./class-lesson-list";

vi.mock("sonner", () => ({
	toast: {
		info: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
	},
}));

vi.mock("@/lib/repos/student", async (importOriginal) => {
	const mod = await importOriginal<typeof import("@/lib/repos/student")>();
	return {
		...mod,
		requestStudentZoomJoin: vi.fn(),
	};
});

afterEach(cleanup);

const NOW = new Date("2026-11-20T03:00:00Z"); // 10:00 giờ VN, 20/11/2026
const TODAY = "2026-11-20";

function lesson(
	overrides: Partial<StudentClassLesson> & { id: string },
): StudentClassLesson {
	return {
		day: 5,
		time: "19:00",
		dur: 90,
		date: "2026-11-20",
		status: "upcoming",
		topic: "Writing Task 2",
		...overrides,
	};
}

describe("ClassLessonList — TOS-11 holiday", () => {
	test("buổi holiday hiển thị 'Nghỉ lễ — Đã dời lịch', không phải 'Buổi tới'", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({ id: "l-holiday", status: "holiday", date: "2026-11-20" }),
					lesson({ id: "l-makeup", status: "upcoming", date: "2026-12-11" }),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.getByText("Nghỉ lễ — Đã dời lịch")).toBeTruthy();
		expect(
			screen.queryByText("Buổi tới")?.closest("li")?.textContent,
		).toContain("11/12");
	});

	test("buổi bù (upcoming) là 'Buổi tới' — holiday không chặn highlight", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({ id: "l-holiday", status: "holiday", date: "2026-11-20" }),
					lesson({ id: "l-makeup", status: "upcoming", date: "2026-12-11" }),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const badges = screen.getAllByText("Buổi tới");
		expect(badges).toHaveLength(1);
		expect(badges[0]?.closest("li")?.textContent).toContain("11/12");
	});

	test("isLessonEnded bỏ qua holiday (chỉ áp cho upcoming)", () => {
		const holidayPast = lesson({
			id: "l-old",
			status: "holiday",
			date: "2026-10-20",
		});
		expect(vietnamSessionEndMs("2026-10-20", "19:00", 90)).not.toBeNull();
		const { container } = render(
			<ClassLessonList
				classId="c1"
				lessons={[holidayPast]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(container.textContent).toContain("Nghỉ lễ — Đã dời lịch");
		expect(container.textContent).not.toContain("Đã kết thúc");
	});
});

describe("ClassLessonList — lớp tạm dừng (#694)", () => {
	test("ẩn 'Buổi tới' và hiển thị 'Tạm hoãn' thay vì 'Đã kết thúc' hay 'Sắp tới' khi isPaused=true, vẫn giữ lịch sử và nút Tài liệu", () => {
		render(
			<ClassLessonList
				classId="c1"
				isPaused
				lessons={[
					lesson({ id: "l-done", status: "completed", date: "2026-11-10" }),
					lesson({ id: "l-absent", status: "absent", date: "2026-11-12" }),
					lesson({
						id: "l-past-upcoming",
						status: "upcoming",
						date: "2026-11-18",
						topic: "Past Unmarked Session",
					}),
					lesson({
						id: "l-future-upcoming",
						status: "upcoming",
						date: "2026-12-01",
						topic: "Future Session",
					}),
					lesson({ id: "l-holiday", status: "holiday", date: "2026-11-25" }),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByText("Buổi tới")).toBeNull();
		expect(screen.queryByText("Đã kết thúc")).toBeNull();
		expect(screen.queryByText("Sắp tới")).toBeNull();
		expect(screen.getAllByText("Tạm hoãn")).toHaveLength(2);
		expect(screen.getByText("Đã học")).toBeTruthy();
		expect(screen.getByText("Vắng")).toBeTruthy();
		expect(screen.getByText("Nghỉ lễ — Đã dời lịch")).toBeTruthy();
		expect(
			screen.getAllByRole("button", { name: "Tài liệu" }).length,
		).toBeGreaterThanOrEqual(3);
	});
});

describe("ClassLessonList — Zoom & Recording (#816)", () => {
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
	});

	test("hiển thị nút 'Vào lớp (Zoom)' cho buổi upcoming chưa kết thúc (ẩn khi đã kết thúc/huỷ/nghỉ lễ/đã học) và kiểm tra khung giờ khi bấm", async () => {
		const tooEarlyMsg =
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 18:30 đến 20:30 ngày 25/11/2026 (được vào sớm 30 phút).";
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: false,
			status: 403,
			error: {
				error: tooEarlyMsg,
				code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
			},
		});

		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-upcoming",
						status: "upcoming",
						date: "2026-11-25",
						topic: "Upcoming with Meet",
						hasZoom: true,
					}),
					lesson({
						id: "l-ended",
						status: "upcoming",
						date: "2026-11-18",
						topic: "Ended with Meet",
						hasZoom: true,
					}),
					lesson({
						id: "l-cancelled",
						status: "cancelled",
						date: "2026-11-26",
						topic: "Cancelled with Meet",
						hasZoom: true,
					}),
					lesson({
						id: "l-holiday",
						status: "holiday",
						date: "2026-11-27",
						topic: "Holiday with Meet",
						hasZoom: true,
					}),
					lesson({
						id: "l-completed",
						status: "completed",
						date: "2026-11-10",
						topic: "Completed with Meet",
						hasZoom: true,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const upcomingItem = screen.getByText("Upcoming with Meet").closest("li");
		expect(upcomingItem).not.toBeNull();
		const meetBtn = within(upcomingItem as HTMLElement).getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		fireEvent.click(meetBtn);

		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledWith("c1", "2026-11-25");
			expect(toast.info).toHaveBeenCalledWith(tooEarlyMsg);
		});
		expect(openSpy).not.toHaveBeenCalled();

		for (const topic of [
			"Ended with Meet",
			"Cancelled with Meet",
			"Holiday with Meet",
			"Completed with Meet",
		]) {
			const item = screen.getByText(topic).closest("li") as HTMLElement;
			expect(
				within(item).queryByRole("button", { name: "Vào lớp (Zoom)" }),
			).toBeNull();
		}
	});

	test("mở Zoom khi bấm 'Vào lớp (Zoom)' trong khung giờ buổi học", async () => {
		const fakeWin = {
			opener: window as Window | null,
			closed: false,
			close: vi.fn(),
			location: { assign: vi.fn() },
		};
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: true,
			data: {
				joinUrl: "https://zoom.us/j/123456789",
				openAt: "2026-11-20T11:30:00.000Z",
				closeAt: "2026-11-20T13:30:00.000Z",
			},
		});

		const insideNow = new Date("2026-11-20T11:45:00Z"); // 18:45 VN
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-open",
						status: "upcoming",
						date: "2026-11-20",
						time: "19:00",
						dur: 90,
						topic: "Live session",
						hasZoom: true,
					}),
				]}
				todayISO={TODAY}
				now={insideNow}
				zoomNowMs={insideNow.getTime()}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledWith("c1", "2026-11-20");
			expect(fakeWin.location.assign).toHaveBeenCalledWith(
				"https://zoom.us/j/123456789",
			);
		});
	});

	test("không đóng băng now lúc render: mở trang trước giờ mở lớp nhưng bấm đúng giờ vẫn pre-open đồng bộ", async () => {
		const fakeWin = {
			closed: false,
			opener: {} as Window | null,
			close: vi.fn(),
			location: { assign: vi.fn() },
		};
		openSpy.mockReturnValue(fakeWin as unknown as Window);
		vi.mocked(requestStudentZoomJoin).mockResolvedValueOnce({
			ok: true,
			data: {
				joinUrl: "HTTPS://zoom.us/j/123456789",
				openAt: "2026-11-20T11:30:00.000Z",
				closeAt: "2026-11-20T13:30:00.000Z",
			},
		});

		const renderTooEarly = new Date("2026-11-20T11:25:00Z"); // 18:25 VN
		const clickInsideMs = new Date("2026-11-20T11:31:00Z").getTime(); // 18:31 VN
		const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(clickInsideMs);
		try {
			render(
				<ClassLessonList
					classId="c1"
					lessons={[
						lesson({
							id: "l-fresh-clock",
							status: "upcoming",
							date: "2026-11-20",
							time: "19:00",
							dur: 90,
							topic: "Fresh clock session",
							hasZoom: true,
						}),
					]}
					todayISO={TODAY}
					now={renderTooEarly}
				/>,
			);

			fireEvent.click(screen.getByRole("button", { name: "Vào lớp (Zoom)" }));

			expect(openSpy).toHaveBeenCalledWith("", "_blank");
			await waitFor(() => {
				expect(fakeWin.location.assign).toHaveBeenCalledWith(
					"HTTPS://zoom.us/j/123456789",
				);
			});
		} finally {
			dateNowSpy.mockRestore();
		}
	});

	test("ẩn 'Vào lớp (Zoom)' khi lớp tạm dừng (isPaused=true)", () => {
		render(
			<ClassLessonList
				classId="c1"
				isPaused
				lessons={[
					lesson({
						id: "l-paused",
						status: "upcoming",
						date: "2026-11-25",
						hasZoom: true,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByRole("button", { name: "Vào lớp (Zoom)" })).toBeNull();
	});

	test("hiển thị 'Xem recording' khi có recordingUrl (trừ cancelled/holiday) và 'Đang chờ recording' khi pending sau buổi", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-rec-ready",
						status: "completed",
						date: "2026-11-10",
						topic: "Completed with recording",
						recordingUrl: "https://zoom.us/rec/share/class-rec-1",
						recordingStatus: "ready",
					}),
					lesson({
						id: "l-rec-ended-pending",
						status: "upcoming",
						date: "2026-11-18",
						topic: "Ended pending recording",
						recordingUrl: null,
						recordingStatus: "pending",
					}),
					lesson({
						id: "l-rec-absent-pending",
						status: "absent",
						date: "2026-11-12",
						topic: "Absent pending recording",
						recordingUrl: null,
						recordingStatus: "pending",
					}),
					lesson({
						id: "l-rec-upcoming-pending",
						status: "upcoming",
						date: "2026-11-25",
						topic: "Upcoming not ended",
						recordingUrl: null,
						recordingStatus: "pending",
					}),
					lesson({
						id: "l-rec-cancelled",
						status: "cancelled",
						date: "2026-11-15",
						topic: "Cancelled with recording",
						recordingUrl: "https://zoom.us/rec/share/cancelled",
						recordingStatus: "ready",
					}),
					lesson({
						id: "l-rec-holiday",
						status: "holiday",
						date: "2026-11-16",
						topic: "Holiday with recording",
						recordingUrl: "https://zoom.us/rec/share/holiday",
						recordingStatus: "ready",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const readyItem = screen
			.getByText("Completed with recording")
			.closest("li") as HTMLElement;
		const recLink = within(readyItem).getByRole("link", {
			name: "Xem recording",
		});
		expect(recLink.getAttribute("href")).toBe(
			"https://zoom.us/rec/share/class-rec-1",
		);
		expect(recLink.getAttribute("target")).toBe("_blank");
		expect(recLink.getAttribute("rel")).toBe("noopener noreferrer");

		const endedItem = screen
			.getByText("Ended pending recording")
			.closest("li") as HTMLElement;
		expect(within(endedItem).getByText("Đang chờ recording")).toBeTruthy();

		const absentItem = screen
			.getByText("Absent pending recording")
			.closest("li") as HTMLElement;
		expect(within(absentItem).getByText("Đang chờ recording")).toBeTruthy();

		const upcomingItem = screen
			.getByText("Upcoming not ended")
			.closest("li") as HTMLElement;
		expect(within(upcomingItem).queryByText("Đang chờ recording")).toBeNull();

		for (const topic of [
			"Cancelled with recording",
			"Holiday with recording",
		]) {
			const item = screen.getByText(topic).closest("li") as HTMLElement;
			expect(
				within(item).queryByRole("link", { name: "Xem recording" }),
			).toBeNull();
			expect(within(item).queryByText("Đang chờ recording")).toBeNull();
		}
	});

	test("hiển thị mật khẩu recording kèm nút sao chép khi có recordingPassword", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-pass",
						status: "completed",
						date: "2026-11-10",
						topic: "Has passcode",
						recordingUrl: "https://zoom.us/rec/share/pass-1",
						recordingPassword: "Ab3dEf",
						recordingStatus: "ready",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		const item = screen.getByText("Has passcode").closest("li") as HTMLElement;
		expect(within(item).getByText("Ab3dEf")).toBeTruthy();
		expect(
			within(item).getByRole("button", {
				name: "Sao chép mật khẩu recording",
			}),
		).toBeTruthy();
	});
});
