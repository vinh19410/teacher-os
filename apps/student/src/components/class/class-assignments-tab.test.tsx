// @vitest-environment jsdom

import type { StudentAssignment } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClassAssignmentsTab } from "./class-assignments-tab";

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

afterEach(cleanup);

const TODAY = "2026-11-20";
const NOW_MORNING_MS = new Date("2026-11-20T03:00:00Z").getTime(); // 10:00 VN
const NOW_EVENING_MS = new Date("2026-11-20T11:00:00Z").getTime(); // 18:00 VN

function assignment(
	overrides: Partial<StudentAssignment> & { id: string },
): StudentAssignment {
	return {
		source: "class_assignment",
		classId: "c1",
		className: "IELTS Intensive 6.5",
		title: "Bài tập bộ đề",
		skill: "reading",
		due: "2026-11-21",
		submittedAt: null,
		gradedAt: null,
		scores: null,
		classStudyPackId: "csp-1",
		studyPackTitle: "IELTS Foundation Daily",
		studyPackStatus: "active",
		studyPackDayIndex: 2,
		studyPackPosition: 0,
		...overrides,
	};
}

describe("ClassAssignmentsTab (Bộ đề tự học)", () => {
	it("lọc bỏ bài tập homework (classStudyPackId null) và hiển thị đủ 3 biến thể empty state", () => {
		const onGoToJourney = vi.fn();

		// 1. Chưa có bài nào
		const { rerender } = render(
			<ClassAssignmentsTab
				assignments={[]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
				onGoToJourney={onGoToJourney}
			/>,
		);
		expect(screen.getByText("Chưa có bộ đề tự học")).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Xem Hành trình học" }),
		).toBeNull();
		expect(
			screen.queryByRole("link", { name: "Xem tất cả bài tập" }),
		).toBeNull();

		// 2. Chỉ có homework gắn buổi (sessionDate != null) -> ẩn khỏi list + nút Xem Hành trình học
		rerender(
			<ClassAssignmentsTab
				assignments={[
					assignment({
						id: "hw-session",
						title: "Homework buổi 1",
						classStudyPackId: null,
						studyPackTitle: null,
						studyPackDayIndex: null,
						sessionDate: "2026-11-18",
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
				onGoToJourney={onGoToJourney}
			/>,
		);
		expect(screen.queryByText("Homework buổi 1")).toBeNull();
		expect(screen.getByText("Chưa có bộ đề tự học")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Xem Hành trình học" }));
		expect(onGoToJourney).toHaveBeenCalledTimes(1);

		// 3. Chỉ có homework không gắn buổi (sessionDate == null) -> link tới /assignments
		rerender(
			<ClassAssignmentsTab
				assignments={[
					assignment({
						id: "hw-unlinked",
						title: "Homework tự do",
						classStudyPackId: null,
						studyPackTitle: null,
						studyPackDayIndex: null,
						sessionDate: null,
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
				onGoToJourney={onGoToJourney}
			/>,
		);
		expect(screen.queryByText("Homework tự do")).toBeNull();
		expect(
			screen
				.getByRole("link", { name: "Xem tất cả bài tập" })
				.getAttribute("href"),
		).toBe("/assignments");
	});

	it("strip 3 trạng thái, hiển thị cả bài quá hạn / hôm nay / tương lai kèm ngày dự kiến, phân biệt Quá hạn sau 17:00 và không chặn làm trước", () => {
		const packTodayAt = "2026-11-20T10:00:00Z"; // 17:00 VN
		const items: StudentAssignment[] = [
			assignment({
				id: "hw-ignored",
				title: "Bài giao tay bị lọc",
				classStudyPackId: null,
				sessionDate: "2026-11-20",
			}),
			assignment({
				id: "sp-day1-overdue",
				title: "Ngày 1 · Reading Practice",
				due: "2026-11-19",
				dueAt: "2026-11-19T10:00:00Z",
				studyPackDayIndex: 1,
			}),
			assignment({
				id: "sp-day2-today",
				title: "Ngày 2 · Listening Part 1",
				skill: "listening",
				due: "2026-11-20",
				dueAt: packTodayAt,
				studyPackDayIndex: 2,
			}),
			assignment({
				id: "sp-day3-tomorrow",
				title: "Ngày 3 · Grammar Preview",
				due: "2026-11-21",
				dueAt: "2026-11-21T10:00:00Z",
				studyPackDayIndex: 3,
			}),
			assignment({
				id: "sp-day4-future",
				title: "Ngày 4 · Writing Task 1",
				skill: "writing",
				hasWriting: true,
				due: "2026-11-23",
				dueAt: "2026-11-23T10:00:00Z",
				studyPackDayIndex: 4,
			}),
		];

		// Sáng 10:00 VN -> Day 2 là "Hôm nay", Day 1 là "Quá hạn", Day 3/4 là "Có thể làm trước"
		const { rerender } = render(
			<ClassAssignmentsTab
				assignments={items}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
			/>,
		);

		expect(screen.queryByText("Bài giao tay bị lọc")).toBeNull();
		const strip = screen.getByTestId("assignments-todo-strip");
		expect(strip.textContent).toContain("2 bài cần làm");
		expect(strip.textContent).toContain("1 quá hạn");
		expect(strip.textContent).toContain("Ưu tiên: Ngày 1 · Reading Practice");
		expect(
			within(strip)
				.getByRole("link", { name: "Làm bài này" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/sp-day1-overdue");

		const dueNowRegion = screen.getByRole("region", {
			name: "Cần làm hôm nay & quá hạn",
		});
		const todayRow = within(dueNowRegion)
			.getByText("Ngày 2 · Listening Part 1")
			.closest("li") as HTMLElement;
		expect(
			within(todayRow).getByTestId("study-pack-status-badge").textContent,
		).toBe("Hôm nay");
		expect(todayRow.textContent).toContain("Dự kiến: Hôm nay (20/11)");

		const upcomingRegion = screen.getByRole("region", {
			name: "Lịch sắp tới · Có thể làm trước",
		});
		const tomorrowRow = within(upcomingRegion)
			.getByText("Ngày 3 · Grammar Preview")
			.closest("li") as HTMLElement;
		expect(
			within(tomorrowRow).getByTestId("study-pack-status-badge").textContent,
		).toBe("Có thể làm trước");
		expect(tomorrowRow.textContent).toContain("Dự kiến: Ngày mai (21/11)");
		expect(tomorrowRow.textContent).not.toContain("Sắp đến hạn");
		expect(tomorrowRow.textContent).not.toContain("Quá hạn");
		expect(
			within(tomorrowRow)
				.getByRole("link", { name: "Làm bài: Ngày 3 · Grammar Preview" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/sp-day3-tomorrow");

		// Tối 18:00 VN -> Day 2 sau dueAt 17:00 badge chuyển thành "Quá hạn" (nhưng dòng dự kiến vẫn ghi Hôm nay + quá hạn)
		rerender(
			<ClassAssignmentsTab
				assignments={items}
				todayISO={TODAY}
				nowMs={NOW_EVENING_MS}
			/>,
		);
		const updatedDueNow = screen.getByRole("region", {
			name: "Cần làm hôm nay & quá hạn",
		});
		const lateTodayRow = within(updatedDueNow)
			.getByText("Ngày 2 · Listening Part 1")
			.closest("li") as HTMLElement;
		expect(
			within(lateTodayRow).getByTestId("study-pack-status-badge").textContent,
		).toBe("Quá hạn");
		expect(lateTodayRow.textContent).toContain(
			"Dự kiến: Hôm nay (20/11) · quá hạn",
		);

		// Trạng thái 2: xong bài hôm nay & quá hạn, còn bài tương lai làm trước
		rerender(
			<ClassAssignmentsTab
				assignments={[
					assignment({
						id: "sp-day1-done",
						title: "Ngày 1 xong",
						due: "2026-11-20",
						submittedAt: "2026-11-20T02:00:00Z",
						studyPackDayIndex: 1,
					}),
					assignment({
						id: "sp-day2-ahead",
						title: "Ngày 2 làm trước",
						due: "2026-11-22",
						studyPackDayIndex: 2,
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
			/>,
		);
		const aheadStrip = screen.getByTestId("assignments-todo-strip");
		expect(aheadStrip.textContent).toContain("Bạn đã xong bài hôm nay");
		expect(aheadStrip.textContent).toContain("1 bài sắp tới");
		expect(
			within(aheadStrip)
				.getByRole("link", { name: "Làm bài này" })
				.getAttribute("href"),
		).toBe("/learn/quizzes/sp-day2-ahead");

		// Trạng thái 3: đã làm hết mọi bài
		rerender(
			<ClassAssignmentsTab
				assignments={[
					assignment({
						id: "sp-all-done",
						title: "Hoàn tất",
						due: "2026-11-20",
						submittedAt: "2026-11-19T10:00:00Z",
						studyPackDayIndex: 1,
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
			/>,
		);
		expect(screen.getByText("Bạn đã hoàn thành hết bài tập")).toBeTruthy();
	});

	it("hỗ trợ Làm sớm, gradedAt không scores, 4 tiêu chí IELTS, nhiều bộ đề (gồm cancelled), 4 bộ lọc và sort an toàn khi thiếu metadata", () => {
		render(
			<ClassAssignmentsTab
				assignments={[
					assignment({
						id: "sp-early-sub",
						title: "Ngày 5 nộp sớm",
						due: "2026-11-25",
						submittedAt: "2026-11-20T02:00:00Z", // 09:00 VN ngày 20/11 < 25/11
						studyPackDayIndex: 5,
					}),
					assignment({
						id: "sp-graded-no-scores",
						title: "Speaking đã chấm không scores",
						skill: "speaking",
						due: "2026-11-26",
						submittedAt: null,
						gradedAt: "2026-11-20T01:00:00Z",
						scores: null,
						studyPackDayIndex: 6,
					}),
					assignment({
						id: "sp-graded-ielts",
						title: "Writing có đủ 4 tiêu chí",
						skill: "writing",
						due: "2026-11-18",
						submittedAt: "2026-11-18T10:00:00Z",
						gradedAt: "2026-11-19T10:00:00Z",
						scores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
						studyPackDayIndex: 1,
					}),
					assignment({
						id: "sp-cancelled-pack",
						title: "Bài thuộc pack đã huỷ",
						due: "2026-11-22",
						submittedAt: "2026-11-19T10:00:00Z",
						studyPackTitle: "Pack cũ",
						studyPackStatus: "cancelled",
						studyPackDayIndex: 2,
					}),
					assignment({
						id: "sp-missing-meta",
						title: "Bài thiếu dayIndex",
						due: "2026-11-24",
						studyPackDayIndex: null,
						studyPackPosition: null,
					}),
					assignment({
						id: "sp-day1-pack2",
						title: "Pack 2 Ngày 1",
						due: "2026-11-23",
						classStudyPackId: "csp-2",
						studyPackTitle: "IELTS Booster",
						studyPackDayIndex: 1,
						studyPackPosition: 0,
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MORNING_MS}
			/>,
		);

		const filterGroup = screen.getByRole("group", { name: "Lọc bài tập" });
		expect(filterGroup.querySelectorAll("[aria-hidden='true']").length).toBe(3);
		expect(
			within(filterGroup).getByRole("button", { name: /Chưa làm/ }),
		).toBeTruthy();

		// Nhóm Đã nộp hiển thị " · Làm sớm" và nhãn "Bộ đề đã huỷ"
		const submittedSection = screen.getByRole("region", { name: "Đã nộp" });
		const earlyRow = within(submittedSection)
			.getByText("Ngày 5 nộp sớm")
			.closest("li") as HTMLElement;
		expect(earlyRow.textContent).toContain("Làm sớm");
		const cancelledRow = within(submittedSection)
			.getByText("Bài thuộc pack đã huỷ")
			.closest("li") as HTMLElement;
		expect(cancelledRow.textContent).toContain("Pack cũ");
		expect(cancelledRow.textContent).toContain("Bộ đề đã huỷ");

		// Nhóm sắp tới sort chronological (23/11 trước 24/11 dù bài thiếu meta)
		const upcomingRegion = screen.getByRole("region", {
			name: "Lịch sắp tới · Có thể làm trước",
		});
		const upcomingItems = within(upcomingRegion).getAllByRole("listitem");
		expect(upcomingItems[0]?.textContent).toContain("Pack 2 Ngày 1");
		expect(upcomingItems[1]?.textContent).toContain("Bài thiếu dayIndex");

		// Nhóm Đã chấm mặc định gập
		const gradedSection = screen.getByRole("region", { name: "Đã chấm" });
		expect(
			within(gradedSection)
				.getByRole("button", { name: /Đã chấm/ })
				.getAttribute("aria-expanded"),
		).toBe("false");
		expect(screen.queryByText("Writing có đủ 4 tiêu chí")).toBeNull();
		fireEvent.click(
			within(filterGroup).getByRole("button", { name: /Đã chấm/ }),
		);

		const ieltsRow = screen
			.getByText("Writing có đủ 4 tiêu chí")
			.closest("li") as HTMLElement;
		fireEvent.click(within(ieltsRow).getByRole("button", { expanded: false }));
		expect(ieltsRow.textContent).toContain("Task");
		expect(ieltsRow.textContent).toContain("Coherence");
		expect(ieltsRow.textContent).toContain("Lexical");
		expect(ieltsRow.textContent).toContain("Grammar");

		// Bài có gradedAt && submittedAt == null không gắn "Làm sớm"
		const noScoresRow = screen
			.getByText("Speaking đã chấm không scores")
			.closest("li") as HTMLElement;
		expect(noScoresRow.textContent).not.toContain("Làm sớm");
		fireEvent.click(
			within(noScoresRow).getByRole("button", { expanded: false }),
		);
		expect(noScoresRow.textContent).toContain("Giáo viên đã chốt trả bài");
	});
});
