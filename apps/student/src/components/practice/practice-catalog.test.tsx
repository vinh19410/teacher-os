// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PracticeCatalogItem } from "@teacher-os/api/contracts";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryButton } from "@/components/practice/history-button";
import { Pager } from "@/components/practice/pager";
import * as practiceFilters from "@/components/practice/practice-filters";
import {
	PracticeFilters,
	PracticeSelect,
	parsePracticeSearch,
} from "@/components/practice/practice-filters";
import {
	SkillCatalog,
	usePracticeOpenLock,
} from "@/components/practice/skill-catalog";
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
		expect(screen.getByText("Đã nộp — Đang chờ giáo viên chấm")).toBeTruthy();
	});

	it("khoá các card khi openingTestId đang mở để tránh double-click tạo nhiều request", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: { items: [ITEM], page: 1, pages: 1, total: 1 },
		} as never);
		const onOpen = vi.fn();
		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				q=""
				page={1}
				openingTestId="test-1"
				onFilterChange={vi.fn()}
				onOpen={onOpen}
			/>,
		);
		const card = screen.getByTestId("practice-test-card") as HTMLButtonElement;
		expect(card.disabled).toBe(true);
		fireEvent.click(card);
		expect(onOpen).not.toHaveBeenCalled();
	});

	it("usePracticeOpenLock chặn double-click cùng tick, nhả khoá khi navigate resolve mà không unmount, và huỷ điều hướng cũ khi đổi skill", async () => {
		let pendingSuccess: (() => void) | null = null;
		let resolveNavigate: (() => void) | null = null;
		const startAttempt = vi.fn(
			(
				_testId: string,
				callbacks: { onSuccess: () => void; onError: (err: unknown) => void },
			) => {
				pendingSuccess = callbacks.onSuccess;
			},
		);
		const navigateToTest = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveNavigate = resolve;
				}),
		);
		const onError = vi.fn();

		function Harness({ skill }: { skill: "reading" | "listening" }) {
			const { openingTestId, handleOpen } = usePracticeOpenLock({
				skill,
				startAttempt,
				navigateToTest,
				onError,
			});
			return (
				<button
					type="button"
					data-testid="open-trigger"
					data-opening={openingTestId ?? ""}
					onClick={() => {
						// Mô phỏng 2 click đồng bộ trong cùng tick trước khi React re-render.
						handleOpen(ITEM);
						handleOpen(ITEM);
					}}
				>
					Open
				</button>
			);
		}

		const { rerender } = render(<Harness skill="reading" />);
		const trigger = screen.getByTestId("open-trigger");
		fireEvent.click(trigger);
		expect(startAttempt).toHaveBeenCalledTimes(1);
		expect(trigger.getAttribute("data-opening")).toBe("test-1");

		// Hoàn tất POST → đang chờ navigate; click thêm vẫn bị chặn.
		act(() => {
			pendingSuccess?.();
		});
		expect(navigateToTest).toHaveBeenCalledTimes(1);
		fireEvent.click(trigger);
		expect(startAttempt).toHaveBeenCalledTimes(1);

		// navigate resolve mà component không unmount (ví dụ bị supersede/hủy) → khoá PHẢI tự nhả.
		await act(async () => {
			resolveNavigate?.();
			await Promise.resolve();
		});
		expect(trigger.getAttribute("data-opening")).toBe("");

		// Mở lại rồi đổi tab skill trước khi POST xong → onSuccess cũ KHÔNG gọi navigate và khoá đã nhả.
		fireEvent.click(trigger);
		expect(startAttempt).toHaveBeenCalledTimes(2);
		rerender(<Harness skill="listening" />);
		expect(trigger.getAttribute("data-opening")).toBe("");
		act(() => {
			pendingSuccess?.();
		});
		expect(navigateToTest).toHaveBeenCalledTimes(1);
		expect(onError).not.toHaveBeenCalled();
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

describe("Practice catalog facets, filters, URL coercion, and debounce races (#884)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("parsePracticeSearch handles TanStack Router numeric coercion, preserves .0 on integer band, omits page<=1, and clamps length", () => {
		expect(
			parsePracticeSearch({ band: 6, q: 18, collection: 2025, page: 1 }),
		).toEqual({
			collection: "2025",
			part: undefined,
			type: undefined,
			band: "6.0",
			q: "18",
			page: undefined,
		});
		expect(
			parsePracticeSearch({
				band: 6.5,
				page: "2",
				q: "  falkirk  ",
				part: " p2 ",
				type: " fill_blank ",
			}),
		).toEqual({
			collection: undefined,
			part: "p2",
			type: "fill_blank",
			band: "6.5",
			q: "falkirk",
			page: 2,
		});
		expect(
			parsePracticeSearch({
				page: 100_001,
				band: Number.POSITIVE_INFINITY,
				q: "x".repeat(250),
			}),
		).toEqual({
			collection: undefined,
			part: undefined,
			type: undefined,
			band: undefined,
			q: "x".repeat(200),
			page: undefined,
		});
		expect(
			parsePracticeSearch({
				page: "999999999999999999999",
				collection: "   ",
				q: null,
			}),
		).toEqual({
			collection: undefined,
			part: undefined,
			type: undefined,
			band: undefined,
			q: undefined,
			page: undefined,
		});
	});

	it("renders all catalog-wide facets from server even when page items only contain 1 collection, and hides Band when <2 distinct bands", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: {
				items: [{ ...ITEM, collection: "Actual Test" }],
				page: 2,
				pages: 2,
				total: 13,
				facets: {
					collections: [
						"Actual Test",
						"Cambridge IELTS 18",
						"Forecast Quý 2-2025",
					],
					parts: ["p1", "p2", "p3"],
					types: ["fill_blank", "tfng"],
					bands: ["7.0"],
				},
			},
		} as never);

		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				part=""
				type=""
				band=""
				q=""
				page={2}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);

		const colSelect = screen.getByLabelText("Bộ đề") as HTMLSelectElement;
		expect(Array.from(colSelect.options).map((o) => o.value)).toEqual([
			"",
			"Actual Test",
			"Cambridge IELTS 18",
			"Forecast Quý 2-2025",
		]);
		const partSelect = screen.getByLabelText("Phần thi") as HTMLSelectElement;
		expect(Array.from(partSelect.options).map((o) => o.text)).toEqual([
			"Phần thi",
			"Passage 1",
			"Passage 2",
			"Passage 3",
		]);
		const typeSelect = screen.getByLabelText("Dạng bài") as HTMLSelectElement;
		expect(Array.from(typeSelect.options).map((o) => o.text)).toEqual([
			"Dạng bài",
			"Fill in the blank",
			"True / False / Not Given",
		]);
		// Only 1 band ("7.0") and band="" -> Band dropdown hidden
		expect(screen.queryByLabelText("Band")).toBeNull();
		// aria-live="polite" on results summary
		expect(screen.getByText(/13 đề — trang 2/).getAttribute("aria-live")).toBe(
			"polite",
		);
	});

	it("shows Band dropdown when >=2 distinct bands or active URL band, and canonicalizes legacy alias type=mcq1", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: {
				items: [],
				page: 1,
				pages: 1,
				total: 0,
				facets: {
					collections: ["Actual Test"],
					parts: ["s1", "s4"],
					types: ["mcq", "notes"],
					bands: ["7.0"],
				},
			},
		} as never);

		const onFilterChange = vi.fn();
		renderWithClient(
			<SkillCatalog
				skill="listening"
				collection=""
				part=""
				type="mcq1"
				band="6.0"
				q=""
				page={1}
				onFilterChange={onFilterChange}
				onOpen={vi.fn()}
			/>,
		);

		const typeSelect = screen.getByLabelText("Dạng bài") as HTMLSelectElement;
		expect(typeSelect.value).toBe("mcq");
		const bandSelect = screen.getByLabelText("Band") as HTMLSelectElement;
		expect(bandSelect.value).toBe("6.0");
		expect(Array.from(bandSelect.options).map((o) => o.text)).toEqual([
			"Band",
			"Band 6.0",
			"Band 7.0",
		]);

		// Filtered empty state differs from unpopulated org empty state
		expect(
			screen.getByText("Không tìm thấy đề phù hợp với bộ lọc hiện tại."),
		).toBeTruthy();
		expect(
			screen.queryByText("Giáo viên chưa có đề luyện tập cho kỹ năng này"),
		).toBeNull();
	});

	it("strips blank collections in deploy-skew fallback when server omits facets", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			data: {
				items: [
					{ ...ITEM, testId: "t1", collection: "" },
					{ ...ITEM, testId: "t2", collection: "   " },
					{ ...ITEM, testId: "t3", collection: "Cambridge 18" },
				],
				page: 1,
				pages: 1,
				total: 3,
			},
		} as never);

		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				part=""
				type=""
				band=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);

		const colSelect = screen.getByLabelText("Bộ đề") as HTMLSelectElement;
		expect(Array.from(colSelect.options).map((o) => o.value)).toEqual([
			"",
			"Cambridge 18",
		]);
	});

	it("prevents stale onSearch closure when dropdown changes mid-debounce, clears draft from both reset buttons, and cancels debounce on skill switch", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: {
				items: [],
				page: 1,
				pages: 1,
				total: 0,
				facets: {
					collections: ["Cambridge 18"],
					parts: ["p1", "p2"],
					types: ["tfng", "summary"],
					bands: ["6.0", "7.0"],
				},
			},
		} as never);

		const onFilterChange = vi.fn();
		const { rerender } = renderWithClient(
			<SkillCatalog
				skill="reading"
				collection="Cambridge 18"
				part=""
				type=""
				band=""
				q=""
				page={1}
				onFilterChange={onFilterChange}
				onOpen={vi.fn()}
			/>,
		);

		// 1. Type search at t=0, then change part at t=100ms -> debounce at t=300ms must preserve part="p2"
		const searchInput = screen.getByLabelText(
			"Tìm đề Reading theo tiêu đề…",
		) as HTMLInputElement;
		fireEvent.change(searchInput, { target: { value: "falkirk" } });
		vi.advanceTimersByTime(100);
		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<SkillCatalog
					skill="reading"
					collection="Cambridge 18"
					part="p2"
					type=""
					band=""
					q=""
					page={1}
					onFilterChange={onFilterChange}
					onOpen={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		vi.advanceTimersByTime(200);
		expect(onFilterChange).toHaveBeenLastCalledWith({
			collection: "Cambridge 18",
			part: "p2",
			type: "",
			band: "",
			q: "falkirk",
			page: 1,
		});

		// 2. Type draft while q="" then click empty-state "Xóa bộ lọc" before 300ms -> no resurrection!
		onFilterChange.mockClear();
		fireEvent.change(searchInput, { target: { value: "resurrect" } });
		vi.advanceTimersByTime(100);
		const resetButtons = screen.getAllByRole("button", { name: "Xóa bộ lọc" });
		expect(resetButtons.length).toBe(2);
		fireEvent.click(resetButtons[1] as HTMLButtonElement);
		expect(onFilterChange).toHaveBeenCalledTimes(1);
		expect(onFilterChange).toHaveBeenCalledWith({
			collection: "",
			part: "",
			type: "",
			band: "",
			q: "",
			page: 1,
		});
		expect(searchInput.value).toBe("");
		vi.advanceTimersByTime(400);
		expect(onFilterChange).toHaveBeenCalledTimes(1);

		// 3. Type draft on reading then switch skill to listening within 100ms -> timer canceled & draft cleared
		onFilterChange.mockClear();
		fireEvent.change(searchInput, { target: { value: "cross-skill" } });
		vi.advanceTimersByTime(100);
		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<SkillCatalog
					skill="listening"
					collection=""
					part=""
					type=""
					band=""
					q=""
					page={1}
					onFilterChange={onFilterChange}
					onOpen={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		vi.advanceTimersByTime(400);
		expect(onFilterChange).not.toHaveBeenCalled();
		expect(
			(
				screen.getByLabelText(
					"Tìm đề Listening theo tiêu đề…",
				) as HTMLInputElement
			).value,
		).toBe("");
	});

	it("auto-clamps out-of-range page for both non-empty and total===0 catalogs, but skips while isPlaceholderData", () => {
		const onFilterChange = vi.fn();
		const spy = vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: true,
			data: { items: [], page: 5, pages: 1, total: 0 },
		} as never);

		const { rerender } = renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				part=""
				type=""
				band=""
				q=""
				page={5}
				onFilterChange={onFilterChange}
				onOpen={vi.fn()}
			/>,
		);
		expect(onFilterChange).not.toHaveBeenCalled();

		// Real response (total === 0, page 5 > pages 1) clamps to page 1 with replace: true
		spy.mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: { items: [], page: 5, pages: 1, total: 0 },
		} as never);
		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<SkillCatalog
					skill="reading"
					collection=""
					part=""
					type=""
					band=""
					q=""
					page={5}
					onFilterChange={onFilterChange}
					onOpen={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		expect(onFilterChange).toHaveBeenCalledWith(
			{
				collection: "",
				part: "",
				type: "",
				band: "",
				q: "",
				page: 1,
			},
			{ replace: true },
		);

		// Real response (total === 14, page 5 > pages 2) clamps to page 2 with replace: true
		onFilterChange.mockClear();
		spy.mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: { items: [ITEM], page: 5, pages: 2, total: 14 },
		} as never);
		rerender(
			<QueryClientProvider
				client={
					new QueryClient({ defaultOptions: { queries: { retry: false } } })
				}
			>
				<SkillCatalog
					skill="reading"
					collection=""
					part=""
					type=""
					band=""
					q=""
					page={5}
					onFilterChange={onFilterChange}
					onOpen={vi.fn()}
				/>
			</QueryClientProvider>,
		);
		expect(onFilterChange).toHaveBeenCalledWith(
			{
				collection: "",
				part: "",
				type: "",
				band: "",
				q: "",
				page: 2,
			},
			{ replace: true },
		);
	});

	it("PracticeSelect supports {value, label} options with responsive truncation and PracticeFilters sets maxLength=200", () => {
		render(
			<PracticeSelect
				label="Phần thi"
				value="p1"
				options={[{ value: "p1", label: "Passage 1" }]}
				onChange={vi.fn()}
			/>,
		);
		const select = screen.getByLabelText("Phần thi") as HTMLSelectElement;
		expect(select.className).toContain("select-chevron");
		expect(select.className).toContain("max-w-full");
		expect(select.closest("label")?.className).toContain("max-w-full");

		cleanup();
		render(
			<PracticeFilters
				searchLabel="Tìm đề…"
				collections={["Cambridge 18"]}
				collectionValue=""
				onCollectionChange={vi.fn()}
				onSearch={vi.fn()}
			/>,
		);
		const input = screen.getByLabelText("Tìm đề…") as HTMLInputElement;
		expect(input.maxLength).toBe(200);
	});

	it("renders safely when URL type param is an Object.prototype key (toString/constructor)", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: {
				items: [],
				page: 1,
				pages: 1,
				total: 0,
				facets: {
					collections: ["Cambridge 18"],
					types: ["tfng"],
					parts: ["p1"],
					bands: ["7.0"],
				},
			},
		} as never);

		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				part=""
				type="toString"
				band=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);
		expect((screen.getByLabelText("Dạng bài") as HTMLSelectElement).value).toBe(
			"toString",
		);

		cleanup();
		renderWithClient(
			<SkillCatalog
				skill="writing"
				collection=""
				part=""
				type="constructor"
				band=""
				q=""
				page={1}
				onFilterChange={vi.fn()}
				onOpen={vi.fn()}
			/>,
		);
		expect((screen.getByLabelText("Dạng bài") as HTMLSelectElement).value).toBe(
			"constructor",
		);
	});

	it("merges consecutive dropdown changes before parent commits search props (async beforeLoad race)", () => {
		vi.spyOn(repos, "usePracticeCatalog").mockReturnValue({
			isLoading: false,
			isError: false,
			isPlaceholderData: false,
			data: {
				items: [ITEM],
				page: 1,
				pages: 1,
				total: 1,
				facets: {
					collections: ["Actual Test", "Cambridge 18"],
					types: ["tfng", "fill_blank"],
					parts: ["p1", "p2"],
					bands: ["7.0"],
				},
			},
		} as never);

		const onFilterChange = vi.fn();
		renderWithClient(
			<SkillCatalog
				skill="reading"
				collection=""
				part=""
				type=""
				band=""
				q=""
				page={1}
				onFilterChange={onFilterChange}
				onOpen={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("Bộ đề"), {
			target: { value: "Actual Test" },
		});
		fireEvent.change(screen.getByLabelText("Phần thi"), {
			target: { value: "p2" },
		});
		fireEvent.change(screen.getByLabelText("Dạng bài"), {
			target: { value: "fill_blank" },
		});

		expect(onFilterChange).toHaveBeenLastCalledWith({
			collection: "Actual Test",
			part: "p2",
			type: "fill_blank",
			band: "",
			q: "",
			page: 1,
		});
	});
});

describe("fetchPracticeCatalog & usePracticeCatalog (#884)", () => {
	it("serializes facets=1 and active filters while omitting empty values and page<=1", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					items: [ITEM],
					page: 2,
					pages: 3,
					total: 25,
					facets: {
						collections: ["Actual Test"],
						types: ["tfng"],
						parts: ["p1", "p2"],
						bands: ["7.0"],
					},
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);

		const result = await repos.fetchPracticeCatalog({
			skill: "reading",
			collection: "Actual Test",
			part: "p2",
			type: "tfng",
			band: "7.0",
			q: "falkirk",
			page: 2,
		});
		expect(result.total).toBe(25);
		expect(result.facets?.parts).toEqual(["p1", "p2"]);

		const requestedUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]));
		expect(requestedUrl.pathname).toBe("/api/student/practice");
		expect(requestedUrl.searchParams.get("skill")).toBe("reading");
		expect(requestedUrl.searchParams.get("facets")).toBe("1");
		expect(requestedUrl.searchParams.get("collection")).toBe("Actual Test");
		expect(requestedUrl.searchParams.get("part")).toBe("p2");
		expect(requestedUrl.searchParams.get("type")).toBe("tfng");
		expect(requestedUrl.searchParams.get("band")).toBe("7.0");
		expect(requestedUrl.searchParams.get("q")).toBe("falkirk");
		expect(requestedUrl.searchParams.get("page")).toBe("2");

		fetchSpy.mockClear();
		fetchSpy.mockResolvedValueOnce(
			new Response(JSON.stringify({ items: [], page: 1, pages: 1, total: 0 }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
		await repos.fetchPracticeCatalog({ skill: "listening", page: 1 });
		const secondUrl = new URL(String(fetchSpy.mock.calls[0]?.[0]));
		expect(secondUrl.searchParams.get("skill")).toBe("listening");
		expect(secondUrl.searchParams.get("facets")).toBe("1");
		expect(secondUrl.searchParams.has("page")).toBe(false);
		expect(secondUrl.searchParams.has("part")).toBe(false);
	});

	it("keeps placeholderData within the same skill and drops it when switching skills", async () => {
		let resolveSecond!: (value: Response) => void;
		let resolveThird!: (value: Response) => void;
		const secondPromise = new Promise<Response>((r) => {
			resolveSecond = r;
		});
		const thirdPromise = new Promise<Response>((r) => {
			resolveThird = r;
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						items: [ITEM],
						page: 1,
						pages: 2,
						total: 15,
						facets: {
							collections: ["Actual Test"],
							types: ["tfng"],
							parts: ["p1", "p2"],
							bands: ["7.0"],
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			)
			.mockReturnValueOnce(secondPromise)
			.mockReturnValueOnce(thirdPromise);

		function Probe({
			skill,
			page,
		}: {
			skill: "reading" | "listening";
			page: number;
		}) {
			const query = repos.usePracticeCatalog({ skill, page });
			return (
				<div data-testid="probe">
					{`${query.isPlaceholderData ? "placeholder" : "fresh"}:${query.data?.total ?? "none"}`}
				</div>
			);
		}

		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { rerender } = render(
			<QueryClientProvider client={client}>
				<Probe skill="reading" page={1} />
			</QueryClientProvider>,
		);

		await vi.waitFor(() => {
			expect(screen.getByTestId("probe").textContent).toBe("fresh:15");
		});

		// Same skill, next page -> retains previous reading data as placeholderData
		rerender(
			<QueryClientProvider client={client}>
				<Probe skill="reading" page={2} />
			</QueryClientProvider>,
		);
		expect(screen.getByTestId("probe").textContent).toBe("placeholder:15");

		// Different skill -> drops reading placeholderData immediately
		rerender(
			<QueryClientProvider client={client}>
				<Probe skill="listening" page={1} />
			</QueryClientProvider>,
		);
		expect(screen.getByTestId("probe").textContent).toBe("fresh:none");
		expect(fetchSpy).toHaveBeenCalledTimes(3);

		resolveSecond(
			new Response(
				JSON.stringify({ items: [], page: 2, pages: 2, total: 15 }),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
		resolveThird(
			new Response(JSON.stringify({ items: [], page: 1, pages: 1, total: 0 }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	});
});
