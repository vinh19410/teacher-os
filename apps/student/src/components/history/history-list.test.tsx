// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
	HistoryEntry,
	HistoryListResponse,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryList } from "@/components/history/history-list";
import * as quizRepos from "@/lib/repos/quiz";

const ENTRY_WRITING_GRADED: HistoryEntry = {
	id: "attempt-writing-graded",
	kind: "practice",
	skill: "writing",
	title: "Writing Mock 1",
	date: "2026-10-01",
	submittedAt: "2026-10-01T10:00:00.000Z",
	minutes: 60,
	score: "Band 6.5",
	status: "graded",
	attemptId: "attempt-writing-graded",
};
const ENTRY_READING: HistoryEntry = {
	id: "attempt-practice-read",
	kind: "practice",
	skill: "reading",
	title: "The Falkirk Wheel",
	date: "2026-10-05",
	submittedAt: "2026-10-05T16:30:00.000Z",
	minutes: 30,
	score: "2/2",
	status: "auto",
	attemptId: "attempt-practice-read",
};
const ENTRY_AWAITING: HistoryEntry = {
	...ENTRY_WRITING_GRADED,
	id: "attempt-writing-awaiting",
	title: "Writing Mock 2",
	score: null,
	status: "awaiting",
	attemptId: "attempt-writing-awaiting",
};
const EMPTY: HistoryListResponse = {
	entries: [],
	page: 1,
	pages: 1,
	total: 0,
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderList(
	data: HistoryListResponse,
	skill: HistoryEntry["skill"] | "" = "",
) {
	const onSkillChange = vi.fn();
	const onPageChange = vi.fn();
	render(
		<HistoryList
			skill={skill}
			page={data.page}
			data={data}
			onSkillChange={onSkillChange}
			onPageChange={onPageChange}
		/>,
	);
	return { onSkillChange, onPageChange };
}

describe("HistoryList (phase 11 #378)", () => {
	it("vẽ dòng entry: ngày dd/mm, điểm, phút, chip trạng thái", () => {
		renderList({
			entries: [ENTRY_READING, ENTRY_WRITING_GRADED],
			page: 1,
			pages: 1,
			total: 2,
		});
		expect(screen.getByText("The Falkirk Wheel")).toBeTruthy();
		expect(screen.getByText("2/2")).toBeTruthy();
		expect(screen.getByText("30m")).toBeTruthy();
		// Chip: tự chấm vs đã chấm; writing đã chấm có nút xem lại.
		expect(screen.getByText("Tự chấm")).toBeTruthy();
		expect(screen.getByText("Đã chấm")).toBeTruthy();
		expect(screen.getByText("Xem nhận xét")).toBeTruthy();
		cleanup();

		// Chờ chấm (#383, TOS-30 #478): cả practice lẫn assignment chưa chấm
		// đều hiện nhãn thống nhất "Đã nộp — Đang chờ giáo viên chấm" và đều
		// KHÔNG có nút xem lại.
		renderList({
			entries: [
				ENTRY_AWAITING,
				{ ...ENTRY_AWAITING, id: "assign-await", kind: "assignment" },
			],
			page: 1,
			pages: 1,
			total: 2,
		});
		expect(
			screen.getAllByText("Đã nộp — Đang chờ giáo viên chấm"),
		).toHaveLength(2);
		expect(screen.queryByText("Đã nộp — tự luyện")).toBeNull();
		expect(screen.queryByText("Xem nhận xét")).toBeNull();
	});

	it("tab kỹ năng gọi onSkillChange; chọn 'Tất cả' trả chuỗi rỗng", () => {
		const { onSkillChange } = renderList(
			{ entries: [ENTRY_READING], page: 1, pages: 1, total: 1 },
			"reading",
		);
		fireEvent.click(screen.getByRole("tab", { name: "Tất cả" }));
		expect(onSkillChange).toHaveBeenCalledWith("");
		fireEvent.click(screen.getByRole("tab", { name: "Từ vựng" }));
		expect(onSkillChange).toHaveBeenLastCalledWith("vocabulary");
	});

	it("empty state theo kỹ năng + CTA 'Bắt đầu luyện tập'", () => {
		renderList(EMPTY, "listening");
		expect(screen.getByText("Chưa có hoạt động Listening nào.")).toBeTruthy();
		expect(screen.getByText("Bắt đầu luyện tập")).toBeTruthy();
		renderList(EMPTY, "");
		expect(screen.getByText("Bạn chưa có hoạt động nào.")).toBeTruthy();
	});

	it("bấm 'Xem nhận xét' mở WritingReview với band + highlight", () => {
		vi.spyOn(quizRepos, "useAttemptSummary").mockReturnValue({
			isLoading: false,
			isError: false,
			data: {
				id: "attempt-writing-graded",
				assignmentId: "",
				title: "Writing Mock 1",
				status: "submitted",
				correctCount: 0,
				wrongCount: 0,
				skippedCount: 0,
				totalCount: 0,
				startedAt: "2026-10-01T09:00:00.000Z",
				submittedAt: "2026-10-01T10:00:00.000Z",
				items: [],
				essay: "Governments should invest more in infrastructure.",
				skill: "writing",
				media: null,
				grade: {
					scores: { task: 6.5, coherence: 6.5, lexical: 6.0, grammar: 6.5 },
					band: 6.5,
					feedback: "A clear position with relevant support. Work on accuracy.",
					gradedAt: "2026-10-02T02:00:00.000Z",
				},
				part: "task2",
				annotations: [
					{ id: "a-1", start: 21, end: 26, note: "Collocation: “invest in”." },
				],
			},
		} as never);
		renderList({
			entries: [ENTRY_WRITING_GRADED],
			page: 1,
			pages: 1,
			total: 1,
		});
		fireEvent.click(screen.getByText("Xem nhận xét"));
		const review = screen.getByTestId("writing-review");
		expect(review).toBeTruthy();
		expect(screen.getByText("Band tổng")).toBeTruthy();
		// Band tổng 6.5 + tiêu chí 6.5 (task/coherence/grammar) → nhiều match.
		expect(screen.getAllByText("6.5").length).toBeGreaterThan(0);
		// Essay tách theo phần tử đoạn/mark — kiểm tra qua textContent.
		expect(review.textContent).toContain("invest");
		// Ghi chú highlight inline (#336) hiện cùng essay.
		expect(review.textContent).toContain("Collocation");
		// Nhãn tiêu chí theo part task2 → "Task Response".
		expect(screen.getByText("Task Response")).toBeTruthy();
		expect(screen.getByText("Coherence & Cohesion")).toBeTruthy();
		// Bấm lần nữa → ẩn.
		fireEvent.click(screen.getByText("Ẩn nhận xét"));
		expect(screen.queryByTestId("writing-review")).toBeNull();
	});

	it("nhiều trang → phân trang gọi onPageChange", () => {
		const { onPageChange } = renderList({
			entries: [ENTRY_READING],
			page: 1,
			pages: 2,
			total: 25,
		});
		fireEvent.click(screen.getByText("Sau"));
		expect(onPageChange).toHaveBeenCalledWith(2);
	});
});
