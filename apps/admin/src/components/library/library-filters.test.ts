import type { LibraryTestListItem } from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import {
	buildPageItems,
	chipCounts,
	countBy,
	countsToChipCounts,
	DEFAULT_FILTERS,
	filtersToSearch,
	fmtDateTime,
	hasActiveFilters,
	type LibraryTestFilters,
	matchesFilters,
	normalizeFilters,
	pageItemRange,
	parseLibrarySearch,
} from "./library-filters";

const item = (overrides: Partial<LibraryTestListItem> = {}) => ({
	id: "t1",
	title: "IELTS Reading Mock 01",
	description: null,
	skill: "reading",
	timeLimitSeconds: 3600,
	collection: "Cambridge 18",
	testGroup: "TEST 1",
	status: "draft",
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-02T02:30:00.000Z",
	partCount: 3,
	questionCount: 40,
	hasAllAudio: true,
	...overrides,
});

describe("parseLibrarySearch (validateSearch)", () => {
	it("giữ nguyên string, chuyển số hữu hạn của page/pageSize/q thành string và bỏ giá trị không hợp lệ", () => {
		expect(
			parseLibrarySearch({
				skill: "reading",
				status: "draft",
				q: "cam",
				page: "2",
				pageSize: "10",
			}),
		).toEqual({
			skill: "reading",
			status: "draft",
			q: "cam",
			page: "2",
			pageSize: "10",
		});
		expect(
			parseLibrarySearch({
				page: 3,
				pageSize: 50,
				q: 18,
			}),
		).toEqual({
			skill: undefined,
			status: undefined,
			q: "18",
			page: "3",
			pageSize: "50",
		});
		expect(
			parseLibrarySearch({
				skill: 1,
				status: true,
				page: Number.NaN,
				pageSize: Number.POSITIVE_INFINITY,
				q: {},
			}),
		).toEqual({});
		expect(parseLibrarySearch({})).toEqual({});
	});
});

describe("normalizeFilters", () => {
	it("giá trị lạ rơi về mặc định, q trim, page và pageSize parse theo contract", () => {
		expect(
			normalizeFilters({
				skill: "writing",
				status: "archived",
				q: "  ",
				page: "0",
				pageSize: "15",
			}),
		).toEqual(DEFAULT_FILTERS);
		expect(
			normalizeFilters({
				skill: "listening",
				status: "ready",
				q: " mock ",
				page: "3",
				pageSize: "50",
			}),
		).toEqual({
			skill: "listening",
			status: "ready",
			q: "mock",
			page: 3,
			pageSize: 50,
		});
		expect(normalizeFilters({ page: "02", pageSize: "010" })).toEqual(
			DEFAULT_FILTERS,
		);
		expect(normalizeFilters({})).toEqual(DEFAULT_FILTERS);
	});
});

describe("filtersToSearch", () => {
	it("mặc định không lên URL (kể cả page <= 1 và pageSize mặc định 20)", () => {
		expect(filtersToSearch(DEFAULT_FILTERS)).toEqual({});
		expect(filtersToSearch({ ...DEFAULT_FILTERS, page: 0 })).toEqual({});
	});

	it("chỉ mang filter và trang khác mặc định — round-trip qua parse + normalize giữ nguyên", () => {
		const filters: LibraryTestFilters = {
			skill: "listening",
			status: "ready",
			q: "cam 18",
			page: 4,
			pageSize: 10,
		};
		const serialized = filtersToSearch(filters);
		expect(serialized).toEqual({
			skill: "listening",
			status: "ready",
			q: "cam 18",
			page: "4",
			pageSize: "10",
		});
		expect(normalizeFilters(parseLibrarySearch(serialized))).toEqual(filters);
	});

	it("round-trip khi TanStack Router chuyển page/pageSize sang kiểu number", () => {
		const parsed = parseLibrarySearch({ page: 2, pageSize: 50 });
		expect(normalizeFilters(parsed)).toEqual({
			...DEFAULT_FILTERS,
			page: 2,
			pageSize: 50,
		});
	});
});

describe("hasActiveFilters", () => {
	it("phản ánh đúng trạng thái lọc, không tính page hay pageSize", () => {
		expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
		expect(
			hasActiveFilters({ ...DEFAULT_FILTERS, page: 3, pageSize: 50 }),
		).toBe(false);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, skill: "reading" })).toBe(
			true,
		);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, status: "ready" })).toBe(
			true,
		);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: "cam" })).toBe(true);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, q: "   " })).toBe(false);
	});
});

describe("countsToChipCounts", () => {
	const counts = {
		skill: { reading: 14, listening: 6 },
		status: { draft: 8, ready: 12 },
	};

	it("trả undefined khi chưa có counts", () => {
		expect(countsToChipCounts(undefined, "skill")).toBeUndefined();
		expect(countsToChipCounts(undefined, "status")).toBeUndefined();
	});

	it("ánh xạ sang nhãn chip theo chiều skill và status", () => {
		expect(countsToChipCounts(counts, "skill")).toEqual({
			Reading: 14,
			Listening: 6,
		});
		expect(countsToChipCounts(counts, "status")).toEqual({
			Nháp: 8,
			"Đã xuất bản": 12,
		});
	});
});

describe("buildPageItems", () => {
	it("totalPages <= 1 luôn trả [1]", () => {
		expect(buildPageItems(1, 0)).toEqual([1]);
		expect(buildPageItems(1, 1)).toEqual([1]);
	});

	it("totalPages <= 7 liệt kê đủ từng trang không có dấu ba chấm", () => {
		expect(buildPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(buildPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it("totalPages > 7 ở đầu, giữa và cuối danh sách", () => {
		expect(buildPageItems(1, 10)).toEqual([1, 2, 3, 4, "ellipsis", 10]);
		expect(buildPageItems(3, 10)).toEqual([1, 2, 3, 4, "ellipsis", 10]);
		expect(buildPageItems(5, 10)).toEqual([
			1,
			"ellipsis",
			4,
			5,
			6,
			"ellipsis",
			10,
		]);
		expect(buildPageItems(8, 10)).toEqual([1, "ellipsis", 7, 8, 9, 10]);
		expect(buildPageItems(10, 10)).toEqual([1, "ellipsis", 7, 8, 9, 10]);
	});

	it("không bao giờ thay một trang đơn lẻ bằng ellipsis và không lặp số trang", () => {
		expect(buildPageItems(4, 10)).toEqual([1, 2, 3, 4, 5, "ellipsis", 10]);
		expect(buildPageItems(7, 10)).toEqual([1, "ellipsis", 6, 7, 8, 9, 10]);
		expect(buildPageItems(4, 8)).toEqual([1, 2, 3, 4, 5, "ellipsis", 8]);
		expect(buildPageItems(5, 8)).toEqual([1, "ellipsis", 4, 5, 6, 7, 8]);

		for (let total = 1; total <= 15; total += 1) {
			for (let current = 1; current <= total; current += 1) {
				const items = buildPageItems(current, total);
				const numbers = items.filter((entry): entry is number =>
					Number.isInteger(entry),
				);
				expect(new Set(numbers).size).toBe(numbers.length);
				for (let i = 1; i < numbers.length; i += 1) {
					expect(numbers[i]).toBeGreaterThan(numbers[i - 1] ?? 0);
				}
				for (let i = 0; i < items.length; i += 1) {
					if (items[i] === "ellipsis") {
						const prev = items[i - 1];
						const next = items[i + 1];
						expect(typeof prev).toBe("number");
						expect(typeof next).toBe("number");
						expect((next as number) - (prev as number)).toBeGreaterThan(2);
					}
				}
			}
		}
	});
});

describe("pageItemRange", () => {
	it("tính đúng khoảng 1-indexed và trả 0..0 khi rỗng hoặc vượt tổng số trang", () => {
		expect(pageItemRange(1, 20, 0)).toEqual({ start: 0, end: 0 });
		expect(pageItemRange(1, 20, 5)).toEqual({ start: 1, end: 5 });
		expect(pageItemRange(2, 20, 45)).toEqual({ start: 21, end: 40 });
		expect(pageItemRange(3, 20, 45)).toEqual({ start: 41, end: 45 });
		expect(pageItemRange(4, 20, 45)).toEqual({ start: 0, end: 0 });
		expect(pageItemRange(0, 20, 45)).toEqual({ start: 0, end: 0 });
	});
});

describe("matchesFilters", () => {
	const rows: LibraryTestListItem[] = [
		item(),
		item({
			id: "t2",
			title: "Listening Section Practice",
			skill: "listening",
			status: "ready",
			collection: null,
			testGroup: null,
		}),
	];

	it("lọc theo skill + status + q đồng thời", () => {
		expect(
			rows.filter((row) =>
				matchesFilters(row, { skill: "listening", status: "all", q: "" }),
			),
		).toEqual([rows[1]]);
		expect(
			rows.filter((row) =>
				matchesFilters(row, { skill: "all", status: "ready", q: "" }),
			),
		).toEqual([rows[1]]);
		expect(
			rows.filter((row) =>
				matchesFilters(row, { skill: "all", status: "all", q: "cambridge" }),
			),
		).toEqual([rows[0]]);
		expect(
			rows.filter((row) =>
				matchesFilters(row, { skill: "all", status: "all", q: "test 1" }),
			),
		).toEqual([rows[0]]);
	});
});

describe("chipCounts", () => {
	const rows: LibraryTestListItem[] = [
		item(),
		item({ id: "t2", skill: "listening", status: "ready" }),
		item({ id: "t3", skill: "listening", status: "ready", title: "Khác" }),
	];

	it("đếm skill giữ nguyên chiều status + q", () => {
		expect(
			chipCounts(rows, { skill: "all", status: "ready", q: "" }, "skill"),
		).toEqual({ Reading: 0, Listening: 2 });
	});

	it("đếm status giữ nguyên chiều skill + q", () => {
		expect(
			chipCounts(rows, { skill: "listening", status: "all", q: "" }, "status"),
		).toEqual({ Nháp: 0, "Đã xuất bản": 2 });
	});

	it("countBy trả key thô theo id", () => {
		expect(countBy(rows, DEFAULT_FILTERS, "skill")).toEqual({
			reading: 1,
			listening: 2,
		});
	});
});

describe("fmtDateTime", () => {
	it("định dạng ngày giờ Việt Nam", () => {
		expect(fmtDateTime("2026-10-02T02:30:00.000Z")).toMatch(/02\/10\/2026/);
	});

	it("giá trị không parse được → trả nguyên văn", () => {
		expect(fmtDateTime("không phải ngày")).toBe("không phải ngày");
	});
});
