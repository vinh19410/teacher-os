// @vitest-environment jsdom

import type {
	StudentClass,
	StudentScheduleLesson,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentScheduleView } from "./student-schedule-view";

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
	afterEach(() => {
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
});
