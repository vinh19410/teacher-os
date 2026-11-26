// @vitest-environment jsdom

import type {
	StudentAssignment,
	StudentClassLesson,
} from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
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
const NOW_MS = new Date("2026-11-20T03:00:00Z").getTime(); // 10:00 VN

function lesson(
	overrides: Partial<StudentClassLesson> & { id: string },
): StudentClassLesson {
	return {
		day: 5,
		time: "19:00",
		dur: 90,
		date: "2026-11-18",
		status: "completed",
		topic: "Reading Practice",
		...overrides,
	};
}

function assignment(
	overrides: Partial<StudentAssignment> & { id: string },
): StudentAssignment {
	return {
		source: "class_assignment",
		classId: "c1",
		className: "IELTS Intensive 6.5",
		title: "Bài tập mẫu",
		skill: "reading",
		due: "2026-11-28",
		submittedAt: null,
		gradedAt: null,
		scores: null,
		sessionDate: "2026-11-18",
		...overrides,
	};
}

describe("ClassAssignmentsTab", () => {
	it("hiển thị trạng thái rỗng 'Chưa có bài tập nào' khi không có bài tập", () => {
		render(
			<ClassAssignmentsTab
				classId="c1"
				assignments={[]}
				lessons={[]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);
		expect(screen.getByText("Chưa có bài tập nào")).toBeTruthy();
	});

	it("Todo Priority Strip đếm bài cần làm/quá hạn, ưu tiên đúng, giữ unique aria-label trên link row và ẩn CTA khi toàn bộ bài cần làm là source='grading'", () => {
		const { rerender } = render(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[
					lesson({ id: "l1", date: "2026-11-12" }),
					lesson({ id: "l2", date: "2026-11-18" }),
				]}
				assignments={[
					assignment({
						id: "a-open",
						title: "Bài chưa tới hạn",
						due: "2026-11-28",
					}),
					assignment({
						id: "a-overdue-grading",
						source: "grading",
						title: "Bài chấm ngoài quá hạn",
						due: "2026-11-15",
					}),
					assignment({
						id: "a-soon",
						title: "Bài sắp đến hạn",
						due: "2026-11-21",
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);

		const strip = screen.getByTestId("assignments-todo-strip");
		expect(strip.textContent).toContain("3 bài cần làm");
		expect(strip.textContent).toContain("1 quá hạn");
		// Tiêu đề Ưu tiên khớp đúng với bài mà CTA "Làm bài này" sẽ mở (a-soon)
		expect(strip.textContent).toContain("Ưu tiên: Bài sắp đến hạn");
		const stripCta = within(strip).getByRole("link", { name: "Làm bài này" });
		expect(stripCta.getAttribute("href")).toBe("/learn/quizzes/a-soon");

		// Strict-mode Playwright: đúng 1 link 'Làm bài: Bài sắp đến hạn'
		expect(
			screen.getAllByRole("link", { name: "Làm bài: Bài sắp đến hạn" }),
		).toHaveLength(1);
		// source === 'grading' không sinh link làm bài
		expect(
			screen.queryByRole("link", { name: "Làm bài: Bài chấm ngoài quá hạn" }),
		).toBeNull();

		// Khi toàn bộ bài cần làm đều là source === 'grading' -> ẩn CTA
		rerender(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[]}
				assignments={[
					assignment({
						id: "g-only",
						source: "grading",
						title: "Chỉ có bài grading",
						due: "2026-11-15",
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);
		expect(
			within(screen.getByTestId("assignments-todo-strip")).queryByRole("link"),
		).toBeNull();

		// Khi tất cả bài đã nộp/chấm -> thẻ hoàn thành
		rerender(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[]}
				assignments={[
					assignment({
						id: "a-sub",
						title: "Đã nộp hết",
						submittedAt: "2026-11-19T10:00:00Z",
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);
		expect(screen.getByText("Bạn đã hoàn thành hết bài tập")).toBeTruthy();
	});

	it("lọc 4 trạng thái (aria-hidden count), phân nhóm trung thực Cần làm / Đã nộp / Đã chấm (gập mặc định, sort an toàn không NaN)", () => {
		render(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[lesson({ id: "l1", date: "2026-11-18" })]}
				assignments={[
					assignment({
						id: "a-todo",
						title: "Bài cần làm 1",
						due: "2026-11-25",
					}),
					assignment({
						id: "a-sub-auto",
						title: "Bài Reading tự chấm",
						skill: "reading",
						submittedAt: "2026-11-19T08:00:00Z",
					}),
					assignment({
						id: "a-sub-writing",
						title: "Bài Writing chờ chấm",
						skill: "writing",
						hasWriting: true,
						submittedAt: "2026-11-19T09:00:00Z",
					}),
					assignment({
						id: "a-graded-undated",
						title: "Bài đã chấm không hạn",
						due: "",
						submittedAt: "2026-11-10T09:00:00Z",
						gradedAt: "2026-11-11T09:00:00Z",
						scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6 },
					}),
					assignment({
						id: "a-graded-dated",
						title: "Bài đã chấm có hạn",
						due: "2026-11-18",
						submittedAt: "2026-11-17T09:00:00Z",
						gradedAt: "2026-11-18T09:00:00Z",
						scores: { task: 7, coherence: 7, lexical: 6.5, grammar: 6.5 },
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);

		const filterGroup = screen.getByRole("group", { name: "Lọc bài tập" });
		const counts = filterGroup.querySelectorAll("[aria-hidden='true']");
		expect(counts.length).toBe(3);

		// Nhóm Đã nộp giữ nguyên nhãn trung thực từ deriveAssignmentStatus
		expect(screen.getByText("Đã nộp — Đang chờ giáo viên chấm")).toBeTruthy();

		// Nhóm Đã chấm mặc định gập khi filter = all
		const gradedSection = screen.getByRole("region", { name: "Đã chấm" });
		const gradedToggle = within(gradedSection).getByRole("button", {
			name: /Đã chấm/,
		});
		expect(gradedToggle.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("Bài đã chấm có hạn")).toBeNull();

		// Chọn filter Đã chấm -> mở thẳng danh sách và sort có hạn trước không hạn
		fireEvent.click(
			within(filterGroup).getByRole("button", { name: /Đã chấm/ }),
		);
		const items = screen.getAllByRole("listitem");
		expect(items).toHaveLength(2);
		expect(items[0]?.textContent).toContain("Bài đã chấm có hạn");
		expect(items[1]?.textContent).toContain("Bài đã chấm không hạn");
	});

	it("panel chi tiết kiểm guard link buổi học (non-holiday + ISO), hiển thị 4 tiêu chí IELTS và nhánh gradedAt không có scores", () => {
		render(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[
					lesson({ id: "l-hol", date: "2026-11-12", status: "holiday" }),
					lesson({ id: "l1", date: "2026-11-18", status: "completed" }),
				]}
				assignments={[
					assignment({
						id: "a-valid-session",
						title: "Bài có buổi hợp lệ",
						skill: "writing",
						sessionDate: "2026-11-18",
						submittedAt: "2026-11-18T10:00:00Z",
						gradedAt: "2026-11-19T10:00:00Z",
						scores: { task: 6.5, coherence: 7, lexical: 6, grammar: 6.5 },
					}),
					assignment({
						id: "a-holiday-session",
						title: "Bài trùng ngày nghỉ lễ",
						sessionDate: "2026-11-12",
						submittedAt: "2026-11-12T10:00:00Z",
						gradedAt: "2026-11-13T10:00:00Z",
						scores: null,
					}),
					assignment({
						id: "a-orphan-session",
						title: "Bài ngày mồ côi",
						sessionDate: "2026-11-99",
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);

		// Mở nhóm Đã chấm
		const gradedSection = screen.getByRole("region", { name: "Đã chấm" });
		fireEvent.click(
			within(gradedSection).getByRole("button", { name: /Đã chấm/ }),
		);

		// Mở chi tiết bài có buổi hợp lệ + 4 tiêu chí IELTS
		const validRow = screen
			.getByText("Bài có buổi hợp lệ")
			.closest("li") as HTMLElement;
		expect(validRow.textContent).toContain("Buổi 1 · Writing");
		fireEvent.click(within(validRow).getByRole("button", { expanded: false }));
		expect(
			within(validRow)
				.getByRole("link", { name: /Xem buổi học/ })
				.getAttribute("href"),
		).toBe("/classes/c1/sessions/2026-11-18");
		expect(validRow.textContent).toContain("Band 6.5");
		expect(validRow.textContent).toContain("Task");
		expect(validRow.textContent).toContain("Coherence");
		expect(validRow.textContent).toContain("Lexical");
		expect(validRow.textContent).toContain("Grammar");

		// Bài trùng ngày holiday + gradedAt && scores === null -> không link 404 & thông báo chung
		const holRow = screen
			.getByText("Bài trùng ngày nghỉ lễ")
			.closest("li") as HTMLElement;
		fireEvent.click(within(holRow).getByRole("button", { expanded: false }));
		expect(
			within(holRow).queryByRole("link", { name: /Xem buổi học/ }),
		).toBeNull();
		expect(holRow.textContent).toContain("Giáo viên đã chốt trả bài");

		// Bài ngày mồ côi -> không link 404
		const todoSection = screen.getByRole("region", { name: "Cần làm" });
		const orphanRow = within(todoSection)
			.getByText("Bài ngày mồ côi")
			.closest("li") as HTMLElement;
		fireEvent.click(within(orphanRow).getByRole("button", { expanded: false }));
		expect(
			within(orphanRow).queryByRole("link", { name: /Xem buổi học/ }),
		).toBeNull();
	});

	it("focusedAssignmentId 2 pha tự mở nhóm Đã chấm, mở rộng dòng, cuộn/focus và gọi onFocusHandled (kể cả khi ID không tồn tại); đổi classId reset state", async () => {
		const scrollSpy = vi.fn();
		Element.prototype.scrollIntoView = scrollSpy;
		const onFocusHandled = vi.fn();

		const { rerender } = render(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[]}
				assignments={[
					assignment({
						id: "a-graded-target",
						title: "Bài đích đã chấm",
						submittedAt: "2026-11-15T10:00:00Z",
						gradedAt: "2026-11-16T10:00:00Z",
						scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
				focusedAssignmentId="a-graded-target"
				onFocusHandled={onFocusHandled}
			/>,
		);

		await waitFor(() => {
			const row = screen
				.getByText("Bài đích đã chấm")
				.closest("li") as HTMLElement;
			const btn = within(row).getByRole("button", { expanded: true });
			expect(document.activeElement).toBe(btn);
			expect(scrollSpy).toHaveBeenCalled();
			expect(onFocusHandled).toHaveBeenCalledTimes(1);
		});

		// ID không tồn tại -> vẫn gọi onFocusHandled để không kẹt state
		rerender(
			<ClassAssignmentsTab
				classId="c1"
				lessons={[]}
				assignments={[
					assignment({
						id: "a-graded-target",
						title: "Bài đích đã chấm",
						submittedAt: "2026-11-15T10:00:00Z",
						gradedAt: "2026-11-16T10:00:00Z",
						scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
				focusedAssignmentId="missing-id"
				onFocusHandled={onFocusHandled}
			/>,
		);
		await waitFor(() => {
			expect(onFocusHandled).toHaveBeenCalledTimes(2);
		});

		// Đổi classId -> reset gradedOpen và expandedIds
		rerender(
			<ClassAssignmentsTab
				classId="c2"
				lessons={[]}
				assignments={[
					assignment({
						id: "a-graded-target",
						title: "Bài đích lớp 2",
						submittedAt: "2026-11-15T10:00:00Z",
						gradedAt: "2026-11-16T10:00:00Z",
						scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
					}),
				]}
				todayISO={TODAY}
				nowMs={NOW_MS}
			/>,
		);
		expect(screen.queryByText("Bài đích lớp 2")).toBeNull();
	});
});
