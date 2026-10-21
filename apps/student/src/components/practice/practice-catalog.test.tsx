// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PracticeCatalogItem } from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryButton } from "@/components/practice/history-button";
import { Pager } from "@/components/practice/pager";
import * as practiceFilters from "@/components/practice/practice-filters";
import { PracticeFilters } from "@/components/practice/practice-filters";
import { SkillCatalog } from "@/components/practice/skill-catalog";
import * as repos from "@/lib/repos/student";

const ITEM: PracticeCatalogItem = {
	testId: "test-1",
	title: "The Falkirk Wheel",
	skill: "reading",
	parts: 3,
	collection: "IELTS Trainer 2",
	testGroup: "TEST 1",
	durationMin: 60,
	lastAttempt: null,
};

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function renderWithClient(ui: React.ReactElement) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{ui}</QueryClientProvider>,
	);
}

describe("SkillCatalog", () => {
	it("vẽ lưới card đề + số trang, bấm card trả item", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: {
				items: [ITEM],
				page: 1,
				pages: 1,
				total: 1,
			},
		} as never);
		const onOpen = vi.fn();
		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={onOpen}
			/>,
		);
		expect(screen.getAllByTestId("practice-test-card")).toHaveLength(1);
		expect(screen.getByText("The Falkirk Wheel")).toBeTruthy();
		expect(screen.getByText(/1 đề — trang 1/)).toBeTruthy();
		// 1 trang → Pager ẩn.
		expect(screen.queryByRole("navigation")).toBeNull();
		screen.getAllByTestId("practice-test-card")[0]?.click();
		expect(onOpen).toHaveBeenCalledWith(ITEM);
	});

	it("empty state khi org chưa có đề ready", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: { items: [], page: 1, pages: 1, total: 0 },
		} as never);
		renderWithClient(
			<SkillCatalog
				skill="writing"
				collection=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);
		expect(
			screen.getByText("Giáo viên chưa có đề luyện tập cho kỹ năng này"),
		).toBeTruthy();
	});

	it("nhiều trang → Pager bấm gọi onFilterChange với trang mới", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: {
				items: Array.from({ length: 12 }, (_, i) => ({
					...ITEM,
					testId: `test-${i}`,
				})),
				page: 1,
				pages: 2,
				total: 14,
			},
		} as never);
		const onFilterChange = vi.fn();
		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				q=""
				page={1}
				onFilterChange={onFilterChange}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByRole("navigation")).toBeTruthy();
		const next = screen.getByText("Sau");
		next.click();
		expect(onFilterChange).toHaveBeenCalledWith(
			expect.objectContaining({ page: 2 }),
		);
	});

	it("card Writing/Speaking đã nộp nhưng chưa chấm hiện 'Lần gần nhất' và 'Chờ chấm' (#383)", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: {
				items: [
					{
						...ITEM,
						testId: "test-w-1",
						title: "Writing Mock 1",
						skill: "writing",
						lastAttempt: {
							status: "submitted",
							score: null,
							submittedAt: "2026-10-20T10:00:00.000Z",
						},
					},
				],
				page: 1,
				pages: 1,
				total: 1,
			},
		} as never);
		renderWithClient(
			<SkillCatalog
				skill="writing"
				collection=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);
		expect(screen.getByText("Lần gần nhất")).toBeTruthy();
		expect(screen.getByText("Chờ chấm")).toBeTruthy();
	});
});

describe("PracticeFilters", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("search debounce 300ms rồi mới gọi onSearch một lần", () => {
		const onSearch = vi.fn();
		render(
			<PracticeFilters
				searchLabel="Tìm đề…"
				collections={["Cambridge 18"]}
				collectionValue=""
				onCollectionChange={vi.fn()}
				onSearch={onSearch}
			/>,
		);
		const input = screen.getByLabelText("Tìm đề…");
		fireEvent.change(input, { target: { value: "falkirk" } });
		expect(onSearch).not.toHaveBeenCalled();
		vi.advanceTimersByTime(299);
		expect(onSearch).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSearch).toHaveBeenCalledTimes(1);
		expect(onSearch).toHaveBeenCalledWith("falkirk");
	});

	it("chọn bộ đề gọi onCollectionChange ngay (không debounce)", () => {
		const onCollectionChange = vi.fn();
		render(
			<PracticeFilters
				searchLabel="Tìm đề…"
				collections={["Cambridge 18"]}
				collectionValue=""
				onCollectionChange={onCollectionChange}
				onSearch={vi.fn()}
			/>,
		);
		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "Cambridge 18" } });
		expect(onCollectionChange).toHaveBeenCalledWith("Cambridge 18");
	});

	it("export đúng contract module filters (không tiny wrapper)", () => {
		expect(typeof practiceFilters.PracticeFilters).toBe("function");
		expect(typeof practiceFilters.PracticeSelect).toBe("function");
	});
});

describe("Pager + HistoryButton", () => {
	it("Pager disable Previous ở trang đầu và hiển thị tổng trang", () => {
		const onPage = vi.fn();
		render(<Pager page={1} pages={3} onPage={onPage} />);
		const prev = screen.getByText("Trước").closest("button");
		expect(prev?.disabled).toBe(true);
		expect(screen.getByText("Trang 1 / 3")).toBeTruthy();
	});

	it("HistoryButton đếm lượt và bỏ ngoặc khi 0", () => {
		const { rerender } = render(<HistoryButton count={0} onClick={vi.fn()} />);
		expect(screen.getByText("Lịch sử")).toBeTruthy();
		expect(screen.queryByText(/\(0\)/)).toBeNull();
		rerender(<HistoryButton count={6} onClick={vi.fn()} />);
		expect(screen.getByText("(6)")).toBeTruthy();
	});
});
