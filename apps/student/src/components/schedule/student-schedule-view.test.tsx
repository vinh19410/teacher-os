// @vitest-environment jsdom

import type {
	StudentClass,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import { ZOOM_JOIN_ERROR_CODES } from "@teacher-os/api/zoom-window";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestStudentZoomJoin } from "@/lib/repos/student";
import {
	clearActiveStudentOrgId,
	setActiveStudentOrgId,
} from "@/lib/student-org-storage";
import { StudentScheduleView } from "./student-schedule-view";

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
		const href =
			typeof to === "string"
				? to.replace("$classId", params?.classId ?? "")
				: to;
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const MOCK_CLASSES: StudentClass[] = [
	{
		id: "cls-1",
		name: "IELTS 6.5A",
		level: "IELTS 6.5",
		mode: "1:1",
		schedule: '{"days":[1,4],"start":"18:00","end":"19:30"}',
		sessionsDone: 2,
		sessionsTotal: 10,
		status: "active",
		enrollmentId: "enr-1",
		enrollmentStatus: "active",
		nextSession: {
			date: "2026-11-10",
			time: "18:00",
			topic: "Reading Task 1",
		},
		teacher: {
			name: "Thầy Hùng",
			email: "hung@test.local",
			image: null,
		},
	},
	{
		id: "cls-2",
		name: "Writing Intensive",
		level: "IELTS 7.0",
		mode: "1:1",
		schedule: '{"days":[0,3],"start":"09:00","end":"10:30"}',
		sessionsDone: 1,
		sessionsTotal: 8,
		status: "active",
		enrollmentId: "enr-2",
		enrollmentStatus: "active",
		nextSession: null,
		teacher: null,
	},
];

const MOCK_LESSONS: StudentScheduleLesson[] = [
	// Buổi trong quá khứ (Đã học)
	{
		id: "les-past-1",
		classId: "cls-1",
		className: "IELTS 6.5A",
		date: "2026-11-01",
		day: 1,
		time: "18:00",
		dur: 90,
		status: "completed",
		topic: "Giới thiệu khoá học",
	},
	// Buổi quá khứ bị vắng
	{
		id: "les-past-absent",
		classId: "cls-2",
		className: "Writing Intensive",
		date: "2026-11-02",
		day: 2,
		time: "09:00",
		dur: 90,
		status: "absent",
		topic: "Writing Task 1 Bar Chart",
	},
	// Buổi kế tiếp (Sắp tới sớm nhất)
	{
		id: "les-upcoming-next",
		classId: "cls-1",
		className: "IELTS 6.5A",
		date: "2026-11-10",
		day: 3,
		time: "18:00",
		dur: 90,
		status: "upcoming",
		topic: "Reading Task 1",
	},
	// Buổi tương lai xa
	{
		id: "les-upcoming-future",
		classId: "cls-2",
		className: "Writing Intensive",
		date: "2026-11-12",
		day: 5,
		time: "09:00",
		dur: 90,
		status: "upcoming",
		topic: "Writing Task 2 Essay Structure",
	},
	// Buổi bị hủy trong tương lai
	{
		id: "les-cancelled",
		classId: "cls-1",
		className: "IELTS 6.5A",
		date: "2026-11-15",
		day: 1,
		time: "18:00",
		dur: 90,
		status: "cancelled",
		topic: "Nghỉ đột xuất",
	},
	// Buổi legacy không có ngày
	{
		id: "les-legacy",
		classId: "cls-1",
		className: "IELTS 6.5A",
		date: null,
		day: 2,
		time: "19:00",
		dur: 90,
		status: "upcoming",
		topic: "Ngữ pháp nâng cao",
	},
];

// Giả định thời điểm hiện tại: 2026-11-04 lúc 12:00 VN
const FIXED_NOW = new Date("2026-11-04T05:00:00Z");

describe("StudentScheduleView component", () => {
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.clearAllMocks();
		openSpy = vi.spyOn(window, "open");
	});

	afterEach(() => {
		openSpy.mockRestore();
		cleanup();
	});

	it("1. Hiển thị khối lịch định kỳ các lớp và thông tin giáo viên, lịch tuần", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
			/>,
		);

		expect(screen.getByText("Lịch học của tôi")).toBeTruthy();
		expect(screen.getByText("Lịch học · 2 lớp")).toBeTruthy();

		// Thẻ lớp IELTS 6.5A
		const card1 = screen.getByTestId("class-schedule-card-cls-1");
		expect(card1).toBeTruthy();
		expect(card1.textContent).toContain("IELTS 6.5A");
		expect(card1.textContent).toContain("Thầy Hùng");
		expect(card1.textContent).toContain("T3 & T6 · 18:00–19:30");
		expect(card1.textContent).toContain("10/11");

		// Thẻ lớp Writing Intensive
		const card2 = screen.getByTestId("class-schedule-card-cls-2");
		expect(card2).toBeTruthy();
		expect(card2.textContent).toContain("Writing Intensive");
		expect(card2.textContent).toContain("Chưa có lịch buổi tới");
	});

	it("2. Mặc định ở tab 'Sắp tới', lọc các buổi tương lai và làm nổi bật Buổi kế tiếp", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
			/>,
		);

		// Buổi kế tiếp ngày 10/11 phải có badge "Buổi kế tiếp"
		const nextRow = screen.getByTestId("session-row-les-upcoming-next");
		expect(nextRow).toBeTruthy();
		expect(nextRow.textContent).toContain("Buổi kế tiếp");
		expect(nextRow.textContent).toContain("Reading Task 1");

		// Buổi 12/11 cũng nằm trong tab sắp tới
		expect(screen.getByTestId("session-row-les-upcoming-future")).toBeTruthy();

		// Buổi quá khứ 01/11 và 02/11 KHÔNG xuất hiện ở tab Sắp tới
		expect(screen.queryByTestId("session-row-les-past-1")).toBeNull();
		expect(screen.queryByTestId("session-row-les-past-absent")).toBeNull();
	});

	it("3. Chuyển sang tab 'Đã học' hiển thị các buổi trong quá khứ", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
			/>,
		);

		// Click tab "Đã học"
		const completedTab = screen.getByRole("tab", { name: /Đã học/ });
		fireEvent.click(completedTab);

		expect(screen.getByTestId("session-row-les-past-1")).toBeTruthy();
		expect(screen.getByTestId("session-row-les-past-absent")).toBeTruthy();

		// Buổi tương lai không xuất hiện
		expect(screen.queryByTestId("session-row-les-upcoming-next")).toBeNull();
	});

	it("4. Chuyển sang tab 'Tất cả' hiển thị đầy đủ mọi buổi học", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
			/>,
		);

		const allTab = screen.getByRole("tab", { name: /Tất cả/ });
		fireEvent.click(allTab);

		expect(screen.getByTestId("session-row-les-past-1")).toBeTruthy();
		expect(screen.getByTestId("session-row-les-upcoming-next")).toBeTruthy();
		expect(screen.getByTestId("session-row-les-legacy")).toBeTruthy();
	});

	it("5. Bộ lọc theo lớp lọc đúng buổi học của lớp được chọn", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
				selectedTab="all"
			/>,
		);

		// Bấm lọc lớp "Writing Intensive"
		const classBtn = screen.getByRole("button", {
			name: /Writing Intensive/,
		});
		fireEvent.click(classBtn);

		// Chỉ còn các buổi của class-2
		expect(screen.getByTestId("session-row-les-past-absent")).toBeTruthy();
		expect(screen.getByTestId("session-row-les-upcoming-future")).toBeTruthy();
		expect(screen.queryByTestId("session-row-les-past-1")).toBeNull();
		expect(screen.queryByTestId("session-row-les-upcoming-next")).toBeNull();
	});

	it("6. Hiển thị đúng empty state khi học viên chưa có lớp nào", () => {
		render(<StudentScheduleView classes={[]} lessons={[]} now={FIXED_NOW} />);

		expect(screen.getByText("Bạn chưa tham gia lớp học nào")).toBeTruthy();
		expect(screen.queryByTestId("sessions-list")).toBeNull();
	});

	it("7. Lớp legacy (date null) hiển thị an toàn với thứ trong tuần", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
				selectedTab="all"
			/>,
		);

		const legacyRow = screen.getByTestId("session-row-les-legacy");
		expect(legacyRow).toBeTruthy();
		expect(legacyRow.textContent).toContain("Thứ Ba");
		expect(legacyRow.textContent).toContain("19:00 · 90 phút");
		expect(legacyRow.textContent).toContain("Ngữ pháp nâng cao");
	});

	it("8. Tab 'Đã học' hiển thị buổi học gần nhất lên đầu (newest first)", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
				selectedTab="completed"
			/>,
		);

		const sessionRows = screen.getAllByTestId(/^session-row-/);
		expect(sessionRows).toHaveLength(2);
		// les-past-absent (02/11) mới hơn les-past-1 (01/11) nên đứng đầu
		expect(sessionRows[0].getAttribute("data-testid")).toBe(
			"session-row-les-past-absent",
		);
		expect(sessionRows[1].getAttribute("data-testid")).toBe(
			"session-row-les-past-1",
		);
	});

	it("9. Hiển thị empty state 'Không có buổi học sắp tới' khi mọi buổi đều đã qua", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={[MOCK_LESSONS[0], MOCK_LESSONS[1]]}
				now={FIXED_NOW}
				selectedTab="upcoming"
			/>,
		);

		expect(screen.getByText("Không có buổi học sắp tới")).toBeTruthy();
		expect(
			screen.getByText(
				"Tất cả các buổi học hiện tại đã kết thúc hoặc lớp chưa có lịch mới.",
			),
		).toBeTruthy();
	});

	it("10. Làm nổi bật đúng buổi kế tiếp của lớp được chọn khi lọc theo lớp", () => {
		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={MOCK_LESSONS}
				now={FIXED_NOW}
				selectedTab="upcoming"
				selectedClassId="cls-2"
			/>,
		);

		// Khi lọc class-2, les-upcoming-future (12/11) trở thành buổi kế tiếp của class-2
		const row = screen.getByTestId("session-row-les-upcoming-future");
		expect(row).toBeTruthy();
		expect(row.textContent).toContain("Buổi kế tiếp");
	});

	it("11. Lớp tạm dừng hiển thị badge Tạm dừng + 'Lớp đang tạm dừng' và không đưa buổi upcoming vào tab Sắp tới (#694)", () => {
		const classesWithPaused: StudentClass[] = [
			MOCK_CLASSES[0],
			{
				...MOCK_CLASSES[1],
				status: "paused",
				nextSession: null,
			},
		];
		const lessonsWithPausedUpcoming: StudentScheduleLesson[] = [
			...MOCK_LESSONS,
			{
				id: "les-paused-past-upcoming",
				classId: "cls-2",
				className: "Writing Intensive",
				date: "2026-11-03",
				day: 2,
				time: "09:00",
				dur: 90,
				status: "upcoming",
				topic: "Past Paused Slot",
			},
		];

		render(
			<StudentScheduleView
				classes={classesWithPaused}
				lessons={lessonsWithPausedUpcoming}
				now={FIXED_NOW}
			/>,
		);

		const pausedCard = screen.getByTestId("class-schedule-card-cls-2");
		expect(pausedCard.textContent).toContain("Tạm dừng");
		expect(pausedCard.textContent).toContain("Lớp đang tạm dừng");
		expect(pausedCard.textContent).not.toContain("Chưa có lịch buổi tới");

		// Lớp cls-2 đã paused → les-upcoming-future (12/11) không xuất hiện ở tab Sắp tới
		expect(screen.queryByTestId("session-row-les-upcoming-future")).toBeNull();
		expect(
			screen.queryByTestId("session-row-les-paused-past-upcoming"),
		).toBeNull();
		// Lớp cls-1 vẫn active → hiển thị bình thường
		expect(screen.getByTestId("session-row-les-upcoming-next")).toBeTruthy();

		// Chuyển sang tab "Tất cả": buổi đã học vẫn giữ, buổi upcoming của lớp paused hiển thị "Tạm hoãn" thay vì "Đã kết thúc"
		fireEvent.click(screen.getByRole("tab", { name: /Tất cả/ }));
		expect(screen.getByTestId("session-row-les-past-absent")).toBeTruthy();
		const pausedRow = screen.getByTestId(
			"session-row-les-paused-past-upcoming",
		);
		expect(pausedRow.textContent).toContain("Tạm hoãn");
		expect(pausedRow.textContent).not.toContain("Đã kết thúc");
	});

	it("12. Hiển thị nút Zoom trên thẻ lớp và buổi upcoming (ẩn khi paused/ended/cancelled/holiday), kiểm tra khung giờ khi bấm", async () => {
		const classesWithMeet: StudentClass[] = [
			{
				...MOCK_CLASSES[0],
				nextSession: {
					date: "2026-11-10",
					time: "18:00",
					dur: 90,
					topic: "Reading Task 1",
					hasZoom: true,
				},
			},
			{
				...MOCK_CLASSES[1],
				status: "paused",
				nextSession: {
					date: "2026-11-12",
					time: "09:00",
					dur: 90,
					topic: "Paused class next",
					hasZoom: true,
				},
			},
		];

		const lessonsWithMeet: StudentScheduleLesson[] = [
			// Upcoming hợp lệ -> hiện nút Zoom
			{
				...MOCK_LESSONS[2],
				hasZoom: true,
			},
			// Upcoming nhưng lớp paused -> ẩn nút Zoom
			{
				...MOCK_LESSONS[3],
				hasZoom: true,
			},
			// Upcoming nhưng đã qua giờ kết thúc (ended) -> ẩn nút Zoom
			{
				id: "les-ended-meet",
				classId: "cls-1",
				className: "IELTS 6.5A",
				date: "2026-11-03",
				day: 2,
				time: "18:00",
				dur: 90,
				status: "upcoming",
				topic: "Ended session",
				hasZoom: true,
			},
			// Cancelled có hasZoom -> ẩn nút Zoom
			{
				...MOCK_LESSONS[4],
				hasZoom: true,
			},
			// Holiday tương lai có hasZoom -> ẩn nút Zoom
			{
				id: "les-holiday-meet",
				classId: "cls-1",
				className: "IELTS 6.5A",
				date: "2026-11-18",
				day: 3,
				time: "18:00",
				dur: 90,
				status: "holiday",
				topic: "Holiday session",
				hasZoom: true,
			},
		];

		const tooEarlyMsg =
			"Chưa đến giờ vào lớp. Link Zoom chỉ mở từ 17:30 đến 19:30 ngày 10/11/2026 (được vào sớm 30 phút).";
		vi.mocked(requestStudentZoomJoin)
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				error: {
					error: tooEarlyMsg,
					code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
				},
			})
			.mockResolvedValueOnce({
				ok: false,
				status: 403,
				error: {
					error: tooEarlyMsg,
					code: ZOOM_JOIN_ERROR_CODES.TOO_EARLY,
				},
			});

		render(
			<StudentScheduleView
				classes={classesWithMeet}
				lessons={lessonsWithMeet}
				now={FIXED_NOW}
				selectedTab="all"
			/>,
		);

		// Card lớp active hiện nút Zoom; card lớp paused ẩn nút Zoom
		const card1 = screen.getByTestId("class-schedule-card-cls-1");
		const card1Meet = within(card1).getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		fireEvent.click(card1Meet);
		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledWith(
				"cls-1",
				"2026-11-10",
			);
			expect(toast.info).toHaveBeenCalledWith(tooEarlyMsg);
		});

		const card2 = screen.getByTestId("class-schedule-card-cls-2");
		expect(
			within(card2).queryByRole("button", { name: "Vào lớp (Zoom)" }),
		).toBeNull();

		// Row upcoming hợp lệ hiện nút Zoom và cũng gọi server khi bấm
		const upcomingRow = screen.getByTestId("session-row-les-upcoming-next");
		const rowMeet = within(upcomingRow).getByRole("button", {
			name: "Vào lớp (Zoom)",
		});
		fireEvent.click(rowMeet);
		await waitFor(() => {
			expect(requestStudentZoomJoin).toHaveBeenCalledTimes(2);
			expect(toast.info).toHaveBeenCalledTimes(2);
		});
		expect(openSpy).not.toHaveBeenCalled();

		// Các row paused / ended / cancelled / holiday KHÔNG hiện nút Zoom
		for (const rowId of [
			"session-row-les-upcoming-future",
			"session-row-les-ended-meet",
			"session-row-les-cancelled",
			"session-row-les-holiday-meet",
		]) {
			const row = screen.getByTestId(rowId);
			expect(
				within(row).queryByRole("button", { name: "Vào lớp (Zoom)" }),
			).toBeNull();
		}
	});

	it("12b. Mở Zoom ở cả thẻ lớp định kỳ và danh sách buổi học khi trong khung giờ", async () => {
		const fakeWin1 = {
			opener: window as Window | null,
			closed: false,
			close: vi.fn(),
			location: { assign: vi.fn() },
		};
		const fakeWin2 = {
			opener: window as Window | null,
			closed: false,
			close: vi.fn(),
			location: { assign: vi.fn() },
		};
		openSpy
			.mockReturnValueOnce(fakeWin1 as unknown as Window)
			.mockReturnValueOnce(fakeWin2 as unknown as Window);

		vi.mocked(requestStudentZoomJoin)
			.mockResolvedValueOnce({
				ok: true,
				data: {
					joinUrl: "https://zoom.us/j/111222333",
					openAt: "2026-11-10T10:30:00.000Z",
					closeAt: "2026-11-10T12:30:00.000Z",
				},
			})
			.mockResolvedValueOnce({
				ok: true,
				data: {
					joinUrl: "https://zoom.us/j/111222333",
					openAt: "2026-11-10T10:30:00.000Z",
					closeAt: "2026-11-10T12:30:00.000Z",
				},
			});

		// 17:45 VN ngày 10/11/2026 (trong cửa sổ 17:30–19:30 VN)
		const insideNow = new Date("2026-11-10T10:45:00Z");
		render(
			<StudentScheduleView
				classes={[
					{
						...MOCK_CLASSES[0],
						nextSession: {
							date: "2026-11-10",
							time: "18:00",
							dur: 90,
							topic: "Reading Task 1",
							hasZoom: true,
						},
					},
				]}
				lessons={[
					{
						...MOCK_LESSONS[2],
						hasZoom: true,
					},
				]}
				now={insideNow}
				selectedTab="upcoming"
			/>,
		);

		const card1 = screen.getByTestId("class-schedule-card-cls-1");
		fireEvent.click(
			within(card1).getByRole("button", { name: "Vào lớp (Zoom)" }),
		);
		await waitFor(() => {
			expect(fakeWin1.location.assign).toHaveBeenCalledWith(
				"https://zoom.us/j/111222333",
			);
		});

		const upcomingRow = screen.getByTestId("session-row-les-upcoming-next");
		fireEvent.click(
			within(upcomingRow).getByRole("button", { name: "Vào lớp (Zoom)" }),
		);
		await waitFor(() => {
			expect(fakeWin2.location.assign).toHaveBeenCalledWith(
				"https://zoom.us/j/111222333",
			);
		});
	});

	it("13. Hiển thị nút 'Xem recording' hoặc badge 'Đang chờ recording' đúng điều kiện", () => {
		const lessonsWithRecordings: StudentScheduleLesson[] = [
			// Completed có recordingUrl -> hiện "Xem recording"
			{
				...MOCK_LESSONS[0],
				recordingUrl: "https://drive.google.com/file/d/rec-1/view",
				recordingStatus: "ready",
			},
			// Absent không có recordingUrl, recordingStatus=pending -> hiện "Đang chờ recording"
			{
				...MOCK_LESSONS[1],
				recordingUrl: null,
				recordingStatus: "pending",
			},
			// Ended (upcoming quá giờ) không có recordingUrl, recordingStatus=pending -> hiện "Đang chờ recording"
			{
				id: "les-ended-pending",
				classId: "cls-1",
				className: "IELTS 6.5A",
				date: "2026-11-03",
				day: 2,
				time: "18:00",
				dur: 90,
				status: "upcoming",
				topic: "Ended pending rec",
				recordingUrl: null,
				recordingStatus: "pending",
			},
			// Upcoming chưa diễn ra có recordingStatus=pending -> KHÔNG hiện badge chờ
			{
				...MOCK_LESSONS[2],
				recordingUrl: null,
				recordingStatus: "pending",
			},
			// Cancelled có recordingUrl + recordingStatus=pending -> KHÔNG hiện nút hay badge
			{
				...MOCK_LESSONS[4],
				recordingUrl: "https://drive.google.com/file/d/rec-cancelled/view",
				recordingStatus: "pending",
			},
			// Holiday có recordingUrl -> KHÔNG hiện nút
			{
				id: "les-holiday-rec",
				classId: "cls-1",
				className: "IELTS 6.5A",
				date: "2026-11-18",
				day: 3,
				time: "18:00",
				dur: 90,
				status: "holiday",
				topic: "Holiday rec",
				recordingUrl: "https://drive.google.com/file/d/rec-holiday/view",
				recordingStatus: "ready",
			},
		];

		render(
			<StudentScheduleView
				classes={MOCK_CLASSES}
				lessons={lessonsWithRecordings}
				now={FIXED_NOW}
				selectedTab="all"
			/>,
		);

		const pastRow = screen.getByTestId("session-row-les-past-1");
		const recLink = within(pastRow).getByRole("link", {
			name: "Xem recording",
		});
		expect(recLink.getAttribute("href")).toBe(
			"https://drive.google.com/file/d/rec-1/view",
		);
		expect(recLink.getAttribute("target")).toBe("_blank");
		expect(recLink.getAttribute("rel")).toBe("noopener noreferrer");
		expect(within(pastRow).queryByText("Đang chờ recording")).toBeNull();

		const absentRow = screen.getByTestId("session-row-les-past-absent");
		expect(within(absentRow).getByText("Đang chờ recording")).toBeTruthy();
		expect(
			within(absentRow).queryByRole("link", { name: "Xem recording" }),
		).toBeNull();

		const endedRow = screen.getByTestId("session-row-les-ended-pending");
		expect(within(endedRow).getByText("Đang chờ recording")).toBeTruthy();

		const upcomingRow = screen.getByTestId("session-row-les-upcoming-next");
		expect(within(upcomingRow).queryByText("Đang chờ recording")).toBeNull();

		const cancelledRow = screen.getByTestId("session-row-les-cancelled");
		expect(
			within(cancelledRow).queryByRole("link", { name: "Xem recording" }),
		).toBeNull();
		expect(within(cancelledRow).queryByText("Đang chờ recording")).toBeNull();

		const holidayRow = screen.getByTestId("session-row-les-holiday-rec");
		expect(
			within(holidayRow).queryByRole("link", { name: "Xem recording" }),
		).toBeNull();
	});

	it("14. Mở modal xem video in-app cho R2 recording (kèm hạn lưu & org query), hiển thị badge hết hạn 90 ngày và giữ link fallback + mật khẩu", () => {
		setActiveStudentOrgId("org-sched-1");
		try {
			const lessonsForR2: StudentScheduleLesson[] = [
				{
					...MOCK_LESSONS[0],
					id: "les-r2-video",
					recordingUrl: "",
					recordingPassword: "ShouldHide",
					recordingStatus: "ready",
					recordingSource: "r2",
					hasRecordingVideo: true,
					recordingExpiresAt: "2027-01-30T18:00:00Z",
				},
				{
					...MOCK_LESSONS[1],
					id: "les-expired-video",
					recordingUrl: "",
					recordingStatus: "expired",
					hasRecordingVideo: false,
					recordingExpiresAt: "2026-10-15T10:00:00Z",
				},
				{
					id: "les-fallback-zoom",
					classId: "cls-1",
					className: "IELTS 6.5A",
					date: "2026-11-03",
					day: 2,
					time: "18:00",
					dur: 90,
					status: "completed",
					topic: "Listening Section 4",
					recordingUrl: "https://zoom.us/rec/share/sched-fallback",
					recordingPassword: "SchedPass7",
					recordingStatus: "failed",
					hasRecordingVideo: false,
				},
			];

			render(
				<StudentScheduleView
					classes={MOCK_CLASSES}
					lessons={lessonsForR2}
					now={FIXED_NOW}
					selectedTab="all"
				/>,
			);

			// 1) R2 recording mở modal trong app + hiển thị hạn lưu + ẩn mật khẩu
			const r2Row = screen.getByTestId("session-row-les-r2-video");
			expect(within(r2Row).getByText("Lưu đến 31/01/2027")).toBeTruthy();
			expect(within(r2Row).queryByText("ShouldHide")).toBeNull();
			expect(
				within(r2Row).queryByRole("link", { name: "Xem recording" }),
			).toBeNull();

			fireEvent.click(
				within(r2Row).getByRole("button", { name: "Xem recording" }),
			);

			const dialog = screen.getByRole("dialog", {
				name: "IELTS 6.5A — Giới thiệu khoá học",
			});
			const video = dialog.querySelector("video") as HTMLVideoElement | null;
			expect(video).not.toBeNull();
			expect(video?.getAttribute("controlslist")).toBe("nodownload");
			expect(video?.getAttribute("src")).toContain(
				"/api/student/classes/cls-1/sessions/2026-11-01/recording/video?org=org-sched-1",
			);
			expect(
				within(dialog).getByText(
					"Lưu trữ đến 31/01/2027 (tự động xóa sau 90 ngày)",
				),
			).toBeTruthy();

			fireEvent.click(within(dialog).getByRole("button", { name: "Đóng" }));
			expect(screen.queryByRole("dialog")).toBeNull();

			// 2) Expired recording hiện badge hết hạn 90 ngày
			const expiredRow = screen.getByTestId("session-row-les-expired-video");
			expect(
				within(expiredRow).getByText("Recording đã hết hạn (90 ngày)"),
			).toBeTruthy();
			expect(
				within(expiredRow).queryByRole("button", { name: "Xem recording" }),
			).toBeNull();

			// 3) Fallback Zoom giữ external link + mật khẩu
			const fallbackRow = screen.getByTestId("session-row-les-fallback-zoom");
			const fallbackLink = within(fallbackRow).getByRole("link", {
				name: "Xem recording",
			});
			expect(fallbackLink.getAttribute("href")).toBe(
				"https://zoom.us/rec/share/sched-fallback",
			);
			expect(within(fallbackRow).getByText("SchedPass7")).toBeTruthy();
		} finally {
			clearActiveStudentOrgId();
		}
	});
});
