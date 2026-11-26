// @vitest-environment jsdom

import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { requestStudentZoomJoin } from "@/lib/repos/student";
import {
	clearActiveStudentOrgId,
	setActiveStudentOrgId,
} from "@/lib/student-org-storage";
import { ClassLessonList } from "./class-lesson-list";

vi.mock("@tanstack/react-router", () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		const href = Object.entries(params ?? {}).reduce(
			(acc, [k, v]) => acc.replace(`$${k}`, v),
			to,
		);
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

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
	test("ẩn 'Buổi tới' và hiển thị 'Tạm hoãn' thay vì 'Đã kết thúc' hay 'Sắp tới' khi isPaused=true, vẫn giữ lịch sử và link xem chi tiết buổi", () => {
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
			screen.getByTestId("session-link-2026-11-10").getAttribute("href"),
		).toBe("/classes/c1/sessions/2026-11-10");
		expect(
			screen.getByTestId("session-link-2026-12-01").getAttribute("href"),
		).toBe("/classes/c1/sessions/2026-12-01");
		expect(screen.queryByTestId("session-link-2026-11-25")).toBeNull();
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

	test("mở modal xem video in-app cho R2 recording (kèm org query, hạn lưu 90 ngày, không hiện mật khẩu) và cập nhật khi đổi org", () => {
		setActiveStudentOrgId("org-alpha");
		try {
			render(
				<ClassLessonList
					classId="c1"
					lessons={[
						lesson({
							id: "l-r2",
							status: "completed",
							date: "2026-11-10",
							topic: "Speaking Part 2",
							recordingUrl: "",
							recordingPassword: "HiddenPass",
							recordingStatus: "ready",
							recordingSource: "r2",
							hasRecordingVideo: true,
							recordingExpiresAt: "2027-02-08T18:30:00Z",
						}),
					]}
					todayISO={TODAY}
					now={NOW}
				/>,
			);

			const item = screen
				.getByText("Speaking Part 2")
				.closest("li") as HTMLElement;
			expect(within(item).getByText("Lưu đến 09/02/2027")).toBeTruthy();
			expect(within(item).queryByText("HiddenPass")).toBeNull();
			expect(
				within(item).queryByRole("link", { name: "Xem recording" }),
			).toBeNull();

			fireEvent.click(
				within(item).getByRole("button", { name: "Xem recording" }),
			);

			const dialog = screen.getByRole("dialog", {
				name: "Recording — Speaking Part 2",
			});
			const video = dialog.querySelector("video") as HTMLVideoElement | null;
			expect(video).not.toBeNull();
			expect(video?.getAttribute("controlslist")).toBe("nodownload");
			expect(video?.getAttribute("src")).toContain(
				"/api/student/classes/c1/sessions/2026-11-10/recording/video?org=org-alpha",
			);
			expect(video?.getAttribute("src")).not.toContain("download=");
			expect(
				within(dialog).getByText(
					"Lưu trữ đến 09/02/2027 (tự động xóa sau 90 ngày)",
				),
			).toBeTruthy();

			// Đổi org đang hoạt động -> URL video tự cập nhật theo org mới
			act(() => {
				setActiveStudentOrgId("org-beta");
			});
			expect(dialog.querySelector("video")?.getAttribute("src")).toContain(
				"/api/student/classes/c1/sessions/2026-11-10/recording/video?org=org-beta",
			);

			fireEvent.keyDown(document, { key: "Escape" });
			expect(screen.queryByRole("dialog")).toBeNull();
		} finally {
			clearActiveStudentOrgId();
		}
	});

	test("hiển thị badge 'Recording đã hết hạn (90 ngày)' khi hết hạn và giữ link ngoài + mật khẩu khi fallback", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-expired",
						status: "completed",
						date: "2026-08-01",
						topic: "Expired recording session",
						recordingUrl: "",
						recordingStatus: "expired",
						hasRecordingVideo: false,
						recordingExpiresAt: "2026-10-30T14:00:00Z",
					}),
					lesson({
						id: "l-expired-cancelled",
						status: "cancelled",
						date: "2026-08-02",
						topic: "Cancelled expired session",
						recordingUrl: "",
						recordingStatus: "expired",
						hasRecordingVideo: false,
					}),
					lesson({
						id: "l-fallback",
						status: "completed",
						date: "2026-11-11",
						topic: "Fallback Zoom recording",
						recordingUrl: "https://zoom.us/rec/share/fallback-cls",
						recordingPassword: "ZoomPass1",
						recordingStatus: "failed",
						hasRecordingVideo: false,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const expiredItem = screen
			.getByText("Expired recording session")
			.closest("li") as HTMLElement;
		expect(
			within(expiredItem).getByText("Recording đã hết hạn (90 ngày)"),
		).toBeTruthy();
		expect(
			within(expiredItem).queryByRole("button", { name: "Xem recording" }),
		).toBeNull();
		expect(
			within(expiredItem).queryByRole("link", { name: "Xem recording" }),
		).toBeNull();

		const cancelledItem = screen
			.getByText("Cancelled expired session")
			.closest("li") as HTMLElement;
		expect(
			within(cancelledItem).queryByText("Recording đã hết hạn (90 ngày)"),
		).toBeNull();

		const fallbackItem = screen
			.getByText("Fallback Zoom recording")
			.closest("li") as HTMLElement;
		const fallbackLink = within(fallbackItem).getByRole("link", {
			name: "Xem recording",
		});
		expect(fallbackLink.getAttribute("href")).toBe(
			"https://zoom.us/rec/share/fallback-cls",
		);
		expect(within(fallbackItem).getByText("ZoomPass1")).toBeTruthy();
	});
});

describe("ClassLessonList — gộp giáo trình & link chi tiết buổi", () => {
	test("hiển thị badge đếm bài giảng/bài tập, nhóm theo module (không lồng li), loại holiday khỏi mẫu số và gộp buổi vượt giáo trình", () => {
		const { container } = render(
			<ClassLessonList
				classId="c1"
				syllabus={{
					name: "IELTS Writing",
					description: "",
					modules: [
						{ id: "m1", title: "Module 1: Foundation", description: "" },
						{ id: "m2", title: "Module 2: Essays", description: "" },
					],
				}}
				lessons={[
					lesson({
						id: "l1",
						date: "2026-11-10",
						status: "completed",
						topic: "Mở bài",
						moduleId: "m1",
						moduleTitle: "Module 1: Foundation",
						lectureCount: 2,
						homeworkCount: 1,
						assignmentCount: 2,
					}),
					lesson({
						id: "l-hol",
						date: "2026-11-12",
						status: "holiday",
						topic: "",
					}),
					lesson({
						id: "l2",
						date: "2026-11-24",
						status: "upcoming",
						topic: "Thân bài",
						moduleId: "m2",
						moduleTitle: "Module 2: Essays",
					}),
					lesson({
						id: "l3-extra",
						date: "2026-11-28",
						status: "upcoming",
						topic: "Ôn tập mở rộng",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		// Tổng số <li> đúng bằng số buổi (không lồng <li> cho module)
		expect(container.querySelectorAll("li")).toHaveLength(4);
		expect(screen.getByTestId("journey-module-m1").textContent).toContain(
			"1/1 buổi",
		);
		expect(screen.getByTestId("journey-module-m2").textContent).toContain(
			"0/1 buổi",
		);
		expect(
			screen.getByTestId("journey-module-__extra__").textContent,
		).toContain("Buổi học bổ sung");
		expect(screen.getByText("2 bài giảng")).toBeTruthy();
		expect(screen.getByText("3 bài tập")).toBeTruthy();
		expect(
			screen.getByTestId("session-link-2026-11-10").getAttribute("href"),
		).toBe("/classes/c1/sessions/2026-11-10");
		expect(screen.queryByTestId("session-link-2026-11-12")).toBeNull();
		// Holiday không tiêu thụ số buổi: l2 là Buổi 2 (khớp GET /sessions/:date), không phải Buổi 3
		expect(screen.getByTestId("journey-module-m2").textContent).toContain(
			"Buổi 2 ·",
		);
		expect(
			screen.getByTestId("journey-module-__extra__").textContent,
		).toContain("Buổi 3 ·");
	});

	test("lớp legacy (date null) không tạo link chi tiết buổi và fallback về timeline phẳng", () => {
		render(
			<ClassLessonList
				classId="c1"
				syllabus={{
					name: "Legacy Syllabus",
					description: "",
					modules: [{ id: "m1", title: "Module 1", description: "" }],
				}}
				lessons={[lesson({ id: "leg-1", date: null, topic: "Buổi cũ" })]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(screen.queryByTestId("journey-syllabus-header")).toBeNull();
		expect(screen.queryByRole("link")).toBeNull();
	});
});
