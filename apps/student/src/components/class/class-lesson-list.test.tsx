// @vitest-environment jsdom

import type { StudentClassLesson } from "@teacher-os/api/contracts";
import { vietnamSessionEndMs } from "@teacher-os/api/vietnam-date";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { ClassLessonList } from "./class-lesson-list";

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

describe("ClassLessonList — Google Meet & Recording (#816)", () => {
	test("hiển thị 'Vào lớp (Google Meet)' cho buổi upcoming chưa kết thúc và ẩn khi đã kết thúc/huỷ/nghỉ lễ/đã học", () => {
		render(
			<ClassLessonList
				classId="c1"
				lessons={[
					lesson({
						id: "l-upcoming",
						status: "upcoming",
						date: "2026-11-25",
						topic: "Upcoming with Meet",
						meetUrl: "https://meet.google.com/class-upcoming",
					}),
					lesson({
						id: "l-ended",
						status: "upcoming",
						date: "2026-11-18",
						topic: "Ended with Meet",
						meetUrl: "https://meet.google.com/class-ended",
					}),
					lesson({
						id: "l-cancelled",
						status: "cancelled",
						date: "2026-11-26",
						topic: "Cancelled with Meet",
						meetUrl: "https://meet.google.com/class-cancelled",
					}),
					lesson({
						id: "l-holiday",
						status: "holiday",
						date: "2026-11-27",
						topic: "Holiday with Meet",
						meetUrl: "https://meet.google.com/class-holiday",
					}),
					lesson({
						id: "l-completed",
						status: "completed",
						date: "2026-11-10",
						topic: "Completed with Meet",
						meetUrl: "https://meet.google.com/class-completed",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		const upcomingItem = screen.getByText("Upcoming with Meet").closest("li");
		expect(upcomingItem).not.toBeNull();
		const meetLink = within(upcomingItem as HTMLElement).getByRole("link", {
			name: "Vào lớp (Google Meet)",
		});
		expect(meetLink.getAttribute("href")).toBe(
			"https://meet.google.com/class-upcoming",
		);
		expect(meetLink.getAttribute("target")).toBe("_blank");
		expect(meetLink.getAttribute("rel")).toBe("noopener noreferrer");

		for (const topic of [
			"Ended with Meet",
			"Cancelled with Meet",
			"Holiday with Meet",
			"Completed with Meet",
		]) {
			const item = screen.getByText(topic).closest("li") as HTMLElement;
			expect(
				within(item).queryByRole("link", { name: "Vào lớp (Google Meet)" }),
			).toBeNull();
		}
	});

	test("ẩn 'Vào lớp (Google Meet)' khi lớp tạm dừng (isPaused=true)", () => {
		render(
			<ClassLessonList
				classId="c1"
				isPaused
				lessons={[
					lesson({
						id: "l-paused",
						status: "upcoming",
						date: "2026-11-25",
						meetUrl: "https://meet.google.com/class-paused",
					}),
				]}
				todayISO={TODAY}
				now={NOW}
			/>,
		);

		expect(
			screen.queryByRole("link", { name: "Vào lớp (Google Meet)" }),
		).toBeNull();
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
						recordingUrl: "https://drive.google.com/file/d/class-rec-1/view",
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
						recordingUrl: "https://drive.google.com/file/d/cancelled/view",
						recordingStatus: "ready",
					}),
					lesson({
						id: "l-rec-holiday",
						status: "holiday",
						date: "2026-11-16",
						topic: "Holiday with recording",
						recordingUrl: "https://drive.google.com/file/d/holiday/view",
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
			"https://drive.google.com/file/d/class-rec-1/view",
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
});
