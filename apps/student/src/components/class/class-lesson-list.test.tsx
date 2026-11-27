// @vitest-environment jsdom

import type {
	StudentAssignment,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
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
						id: "l-upcoming-later",
						status: "upcoming",
						date: "2026-11-28",
						topic: "Later Upcoming with Meet",
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

		// Buổi tới đặt ZoomJoinButton trong JourneyNextStopHero (không lặp trong <li>)
		const hero = screen.getByTestId("journey-next-hero");
		const meetBtn = within(hero).getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		expect((meetBtn as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(meetBtn);

		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledWith("c1", "2026-11-25");
			expect(toast.info).toHaveBeenCalledWith(tooEarlyMsg);
		});
		expect(openSpy).not.toHaveBeenCalled();

		const nextLi = screen
			.getAllByText("Upcoming with Meet")
			.map((el) => el.closest("li"))
			.find((el): el is HTMLLIElement => el !== null);
		expect(nextLi).toBeTruthy();
		expect(
			within(nextLi as HTMLElement).queryByRole("button", {
				name: "Vào lớp (Zoom)",
			}),
		).toBeNull();

		// Buổi upcoming sau đó mở rộng thì hiện ZoomJoinButton trong chi tiết buổi
		const laterLi = screen
			.getByText("Later Upcoming with Meet")
			.closest("li") as HTMLElement;
		fireEvent.click(within(laterLi).getByRole("button", { expanded: false }));
		expect(
			within(laterLi).getByRole("button", { name: "Vào lớp (Zoom)" }),
		).toBeTruthy();

		for (const topic of [
			"Ended with Meet",
			"Cancelled with Meet",
			"Holiday with Meet",
			"Completed with Meet",
		]) {
			const item = screen.getByText(topic).closest("li") as HTMLElement;
			const expandBtn = within(item).queryByRole("button", {
				expanded: false,
			});
			if (expandBtn) fireEvent.click(expandBtn);
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
		expect(screen.queryByTestId("journey-next-hero")).toBeNull();
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
		fireEvent.click(within(readyItem).getByRole("button", { expanded: false }));
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
		fireEvent.click(within(endedItem).getByRole("button", { expanded: false }));
		expect(within(endedItem).getByText("Đang chờ recording")).toBeTruthy();

		const absentItem = screen
			.getByText("Absent pending recording")
			.closest("li") as HTMLElement;
		fireEvent.click(
			within(absentItem).getByRole("button", { expanded: false }),
		);
		expect(within(absentItem).getByText("Đang chờ recording")).toBeTruthy();

		const upcomingItem = screen
			.getAllByText("Upcoming not ended")
			.map((el) => el.closest("li"))
			.find((el): el is HTMLLIElement => el !== null) as HTMLElement;
		expect(within(upcomingItem).queryByText("Đang chờ recording")).toBeNull();

		for (const topic of [
			"Cancelled with recording",
			"Holiday with recording",
		]) {
			const item = screen.getByText(topic).closest("li") as HTMLElement;
			const expandBtn = within(item).queryByRole("button", {
				expanded: false,
			});
			if (expandBtn) fireEvent.click(expandBtn);
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
		fireEvent.click(within(item).getByRole("button", { expanded: false }));
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
			fireEvent.click(within(item).getByRole("button", { expanded: false }));
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
		fireEvent.click(
			within(expiredItem).getByRole("button", { expanded: false }),
		);
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
		fireEvent.click(
			within(cancelledItem).getByRole("button", { expanded: false }),
		);
		expect(
			within(cancelledItem).queryByText("Recording đã hết hạn (90 ngày)"),
		).toBeNull();
		expect(cancelledItem.textContent).toContain("Buổi học này đã được huỷ.");

		const fallbackItem = screen
			.getByText("Fallback Zoom recording")
			.closest("li") as HTMLElement;
		fireEvent.click(
			within(fallbackItem).getByRole("button", { expanded: false }),
		);
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
		expect(screen.queryByTestId("journey-module-m1")).toBeNull();
		expect(screen.queryByRole("link")).toBeNull();
	});
});

function assignment(
	overrides: Partial<StudentAssignment> & { id: string },
): StudentAssignment {
	return {
		source: "class_assignment",
		classId: "c1",
		className: "IELTS Intensive 6.5",
		title: "Bài tập đọc hiểu",
		skill: "reading",
		due: "2026-11-26",
		submittedAt: null,
		gradedAt: null,
		scores: null,
		sessionDate: "2026-11-24",
		...overrides,
	};
}

describe("ClassLessonList — redesign Hành trình học", () => {
	test("gỡ JourneySummitCard (Đích đến của bạn / chặng đã vượt / progressbar), bắt đầu thẳng bằng Buổi tiếp theo và Lộ trình chinh phục", () => {
		const { rerender } = render(
			<ClassLessonList
				classId="c1"
				syllabus={{
					name: "IELTS Reading Intensive",
					description: "Rèn tốc độ đọc hiểu học thuật",
					modules: [
						{ id: "m1", title: "Chặng 1: Nền tảng", description: "" },
						{ id: "m2", title: "Chặng 2: Luyện đề", description: "" },
					],
				}}
				lessons={[
					lesson({
						id: "l1",
						date: "2026-11-10",
						status: "completed",
						topic: "Skimming",
						moduleId: "m1",
					}),
					lesson({
						id: "l2",
						date: "2026-11-12",
						status: "absent",
						topic: "Scanning",
						moduleId: "m1",
					}),
					lesson({
						id: "l3",
						date: "2026-11-24",
						status: "upcoming",
						topic: "True/False/NG",
						moduleId: "m2",
					}),
					lesson({
						id: "l4",
						date: "2026-11-30",
						status: "upcoming",
						topic: "Ôn mở rộng",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(screen.queryByTestId("journey-syllabus-header")).toBeNull();
		expect(screen.queryByText("Đích đến của bạn")).toBeNull();
		expect(screen.queryByText(/chặng đã vượt/)).toBeNull();
		expect(screen.queryByText(/buổi đã diễn ra/)).toBeNull();
		expect(screen.queryByText(/% hành trình/)).toBeNull();
		expect(screen.queryByText(/Về đích dự kiến/)).toBeNull();
		expect(screen.queryByText(/Hoàn thành ngày/)).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();

		expect(screen.getByTestId("journey-next-hero").textContent).toContain(
			"Buổi tiếp theo",
		);
		expect(screen.getByText("Lộ trình chinh phục")).toBeTruthy();
		// completedCount không tính absent -> m1 hiển thị 1/2 buổi.
		expect(screen.getByTestId("journey-module-m1").textContent).toContain(
			"1/2 buổi",
		);
		expect(screen.getByTestId("journey-module-m2").textContent).toContain(
			"0/1 buổi",
		);
		expect(
			screen.getByTestId("journey-module-__extra__").textContent,
		).toContain("Buổi học bổ sung");

		// Trạng thái tạm dừng cũng không render JourneySummitCard.
		rerender(
			<ClassLessonList
				classId="c1"
				isPaused={true}
				lessons={[
					lesson({
						id: "l-paused",
						date: "2026-11-24",
						status: "upcoming",
						topic: "Buổi đang hoãn",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(screen.queryByText("Đích đến của bạn")).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();

		// Trạng thái hoàn thành toàn bộ lộ trình vẫn hiện thẻ Hoàn thành, không hiện JourneySummitCard.
		rerender(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-done",
						date: "2026-11-10",
						status: "completed",
						topic: "Buổi cuối",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(screen.queryByText("Đích đến của bạn")).toBeNull();
		expect(screen.queryByText(/Hoàn thành ngày/)).toBeNull();
		expect(screen.queryByRole("progressbar")).toBeNull();
		expect(
			screen.getByText("Bạn đã đi hết lộ trình — chúc thi tốt!"),
		).toBeTruthy();
	});

	test("Next Stop Hero hiển thị đếm ngược, gợi ý mở Zoom cùng ngày/khác ngày và thẻ hoàn thành khi hết buổi", () => {
		const { rerender } = render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-today",
						date: "2026-11-20",
						time: "19:00",
						dur: 90,
						status: "upcoming",
						topic: "Buổi hôm nay",
						hasZoom: true,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
				zoomNowMs={NOW.getTime()}
			/>,
		);

		const heroToday = screen.getByTestId("journey-next-hero");
		expect(heroToday.textContent).toContain("Buổi tiếp theo");
		expect(heroToday.textContent).toContain("Bắt đầu sau 9 giờ");
		expect(heroToday.textContent).toContain("Mở lúc 18:30 (trước 30 phút)");
		expect(
			within(heroToday).getByRole("button", { name: "Chuẩn bị bài" }),
		).toBeTruthy();

		// Khác ngày -> hiển thị cả dd/mm
		rerender(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-later",
						date: "2026-11-25",
						time: "19:00",
						dur: 90,
						status: "upcoming",
						topic: "Buổi tuần sau",
						hasZoom: true,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
				zoomNowMs={NOW.getTime()}
			/>,
		);
		expect(screen.getByTestId("journey-next-hero").textContent).toContain(
			"Mở lúc 18:30 25/11 (trước 30 phút)",
		);

		// Hoàn thành toàn bộ lộ trình
		rerender(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-done",
						date: "2026-11-10",
						status: "completed",
						topic: "Buổi cuối",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		expect(screen.queryByTestId("journey-next-hero")).toBeNull();
		expect(
			screen.getByText("Bạn đã đi hết lộ trình — chúc thi tốt!"),
		).toBeTruthy();
	});

	test("bộ lọc giữ nguyên số Buổi N, tỷ lệ module X/Y buổi, ẩn module rỗng và hiện trạng thái rỗng khi không khớp", () => {
		render(
			<ClassLessonList
				classId="c1"
				syllabus={{
					name: "Syllabus A",
					description: "",
					modules: [
						{ id: "m1", title: "Module 1", description: "" },
						{ id: "m2", title: "Module 2", description: "" },
					],
				}}
				lessons={[
					lesson({
						id: "l1",
						date: "2026-11-10",
						status: "completed",
						topic: "Buổi 1 đã học",
						moduleId: "m1",
					}),
					lesson({
						id: "l-hol",
						date: "2026-11-12",
						status: "holiday",
						topic: "Nghỉ lễ",
					}),
					lesson({
						id: "l2",
						date: "2026-11-24",
						status: "upcoming",
						topic: "Buổi 2 phía trước",
						moduleId: "m2",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Phía trước" }));
		expect(screen.queryByTestId("journey-module-m1")).toBeNull();
		expect(screen.queryByText("Nghỉ lễ — Đã dời lịch")).toBeNull();
		const m2 = screen.getByTestId("journey-module-m2");
		expect(m2.textContent).toContain("Buổi 2 ·");
		expect(m2.textContent).toContain("0/1 buổi");

		fireEvent.click(screen.getByRole("button", { name: "Đã đi qua" }));
		expect(screen.queryByTestId("journey-module-m2")).toBeNull();
		expect(screen.getByTestId("journey-module-m1").textContent).toContain(
			"1/1 buổi",
		);
	});

	test("bấm 'Vị trí hiện tại' khi đang lọc Đã đi qua tự chuyển về Tất cả, mở buổi tới và cuộn/focus 2 pha", async () => {
		const scrollSpy = vi.fn();
		Element.prototype.scrollIntoView = scrollSpy;

		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l1",
						date: "2026-11-10",
						status: "completed",
						topic: "Buổi đã xong",
					}),
					lesson({
						id: "l2",
						date: "2026-11-24",
						status: "upcoming",
						topic: "Buổi tới mục tiêu",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Đã đi qua" }));
		expect(screen.queryByTestId("session-link-2026-11-24")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Vị trí hiện tại" }));

		await waitFor(() => {
			expect(
				screen
					.getByRole("button", { name: "Tất cả" })
					.getAttribute("aria-pressed"),
			).toBe("true");
			expect(screen.getByTestId("session-link-2026-11-24")).toBeTruthy();
			expect(scrollSpy).toHaveBeenCalled();
			expect(document.activeElement?.getAttribute("aria-expanded")).toBe(
				"true",
			);
		});
	});

	test("buổi tới mở sẵn mặc định không lặp count bài giảng/bài tập, ghép bài tập đúng guard (chặn legacy null & holiday), gọi onOpenAssignment và reset expandedIds khi đổi classId", () => {
		const onOpenAssignment = vi.fn();
		const { container, rerender } = render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-absent",
						date: "2026-11-10",
						status: "absent",
						topic: "Buổi bị vắng",
					}),
					lesson({
						id: "l-hol",
						date: "2026-11-12",
						status: "holiday",
						topic: "Nghỉ lễ",
					}),
					lesson({
						id: "l-next",
						date: "2026-11-24",
						status: "upcoming",
						topic: "Buổi tới có mục tiêu",
						objectives: "Nắm chắc dạng True/False/Not Given",
						lectureCount: 1,
						homeworkCount: 1,
						assignmentCount: 2,
					}),
				]}
				assignments={[
					assignment({
						id: "a-match",
						title: "Bài đọc hiểu buổi 2",
						sessionDate: "2026-11-24",
					}),
					assignment({
						id: "a-hol",
						title: "Bài trùng ngày nghỉ lễ",
						sessionDate: "2026-11-12",
					}),
					assignment({
						id: "a-null",
						title: "Bài không gắn buổi",
						sessionDate: null,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
				onOpenAssignment={onOpenAssignment}
			/>,
		);

		// Đúng 3 thẻ <li> (không thêm <li> cho bài tập trong detail)
		expect(container.querySelectorAll("li")).toHaveLength(3);
		// Strict-mode: đúng 1 lần "1 bài giảng" và "3 bài tập" dù buổi tới mở sẵn
		expect(screen.getAllByText("1 bài giảng")).toHaveLength(1);
		expect(screen.getAllByText("3 bài tập")).toHaveLength(1);
		expect(screen.getAllByTestId("session-link-2026-11-24")).toHaveLength(1);
		expect(screen.getByText("Nắm chắc dạng True/False/Not Given")).toBeTruthy();
		expect(screen.getByText("Bài đọc hiểu buổi 2")).toBeTruthy();
		expect(screen.queryByText("Bài trùng ngày nghỉ lễ")).toBeNull();
		expect(screen.queryByText("Bài không gắn buổi")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Mở trong Bài tập" }));
		expect(onOpenAssignment).toHaveBeenCalledWith("a-match");

		// Mở buổi vắng -> thấy cảnh báo vắng
		const absentLi = screen
			.getByText("Buổi bị vắng")
			.closest("li") as HTMLElement;
		const absentBtn = within(absentLi).getByRole("button", { expanded: false });
		fireEvent.click(absentBtn);
		expect(absentLi.textContent).toContain("Bạn vắng buổi này");

		// Đổi classId -> reset expandedIds (buổi đã học đóng lại)
		rerender(
			<ClassLessonList
				classId="c2"
				lessons={[
					lesson({
						id: "l-absent",
						date: "2026-11-10",
						status: "absent",
						topic: "Buổi bị vắng lớp mới",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);
		const newLi = screen
			.getByText("Buổi bị vắng lớp mới")
			.closest("li") as HTMLElement;
		expect(within(newLi).getByRole("button", { expanded: false })).toBeTruthy();
	});

	test("lớp legacy (date null) không ghép nhầm bài tập có sessionDate=null", () => {
		const { container } = render(
			<ClassLessonList
				classId="c-legacy"
				lessons={[
					lesson({
						id: "leg-1",
						date: null,
						status: "completed",
						topic: "Buổi cũ không ngày",
					}),
				]}
				assignments={[
					assignment({
						id: "a-null",
						title: "Bài tập không ngày",
						sessionDate: null,
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const li = container.querySelector("li") as HTMLElement;
		const expandBtn = within(li).queryByRole("button", { expanded: false });
		if (expandBtn) fireEvent.click(expandBtn);
		expect(screen.queryByText("Bài tập không ngày")).toBeNull();
	});

	test("khi nextId dịch chuyển giữa phiên trên cùng classId thì giữ nguyên RecordingPlayerModal đang mở và buổi đã mở tay", () => {
		const pastWithR2 = lesson({
			id: "l-past-r2",
			date: "2026-11-18",
			status: "completed",
			topic: "Buổi 1 có R2 recording",
			hasRecordingVideo: true,
			recordingSource: "r2",
			recordingExpiresAt: "2027-02-16T00:00:00.000Z",
		});
		const next1 = lesson({
			id: "l-next-1",
			date: "2026-11-24",
			time: "19:00",
			dur: 90,
			status: "upcoming",
			topic: "Buổi 2 sắp kết thúc",
		});
		const next2 = lesson({
			id: "l-next-2",
			date: "2026-11-28",
			time: "19:00",
			dur: 90,
			status: "upcoming",
			topic: "Buổi 3 kế tiếp",
		});

		const { rerender } = render(
			<ClassLessonList
				classId="c1"
				lessons={[pastWithR2, next1, next2]}
				todayISO={TODAY}
				now={new Date("2026-11-24T12:00:00+07:00")}
			/>,
		);

		// Mở buổi 1 đã học và mở modal video R2
		const pastLi = screen
			.getByText("Buổi 1 có R2 recording")
			.closest("li") as HTMLElement;
		fireEvent.click(within(pastLi).getByRole("button", { expanded: false }));
		fireEvent.click(screen.getByRole("button", { name: /Xem recording/i }));
		expect(screen.getByRole("dialog")).toBeTruthy();

		// Rerender cùng classId nhưng thời gian đã trôi qua giờ kết thúc buổi 2 → nextId đổi từ l-next-1 sang l-next-2
		rerender(
			<ClassLessonList
				classId="c1"
				lessons={[pastWithR2, next1, next2]}
				todayISO="2026-11-25"
				now={new Date("2026-11-25T10:00:00+07:00")}
			/>,
		);

		// Modal recording vẫn mở, không bị đá đóng giữa chừng, buổi 1 vẫn đang mở
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(within(pastLi).getByRole("button", { expanded: true })).toBeTruthy();
	});
});
