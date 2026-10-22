import type { LibraryTestListItem } from "@teacher-os/api/library-contracts";
import { describe, expect, it } from "vitest";
import {
	chipCounts,
	countBy,
	DEFAULT_FILTERS,
	filtersToSearch,
	fmtDateTime,
	type LibraryTestFilters,
	matchesFilters,
	normalizeFilters,
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
	it("giữ nguyên string, bỏ giá trị không phải string", () => {
		expect(
			parseLibrarySearch({
				skill: "reading",
				status: "draft",
				q: "cam",
			}),
		).toEqual({ skill: "reading", status: "draft", q: "cam" });
		expect(parseLibrarySearch({ skill: 1 as never })).toEqual({});
		expect(parseLibrarySearch({})).toEqual({});
	});
});

describe("normalizeFilters", () => {
	it("giá trị lạ rơi về mặc định, q trim", () => {
		expect(
			normalizeFilters({ skill: "writing", status: "archived", q: "  " }),
		).toEqual(DEFAULT_FILTERS);
		expect(
			normalizeFilters({ skill: "listening", status: "ready", q: " mock " }),
		).toEqual({ skill: "listening", status: "ready", q: "mock" });
		expect(normalizeFilters({})).toEqual(DEFAULT_FILTERS);
	});
});

describe("filtersToSearch", () => {
	it("mặc định không lên URL", () => {
		expect(filtersToSearch(DEFAULT_FILTERS)).toEqual({});
	});

	it("chỉ mang filter thật — round-trip qua normalizeFilters giữ nguyên", () => {
		const filters: LibraryTestFilters = {
			skill: "listening",
			status: "ready",
			q: "cam 18",
		};
		expect(filtersToSearch(filters)).toEqual({
			skill: "listening",
			status: "ready",
			q: "cam 18",
		});
		expect(normalizeFilters(filtersToSearch(filters))).toEqual(filters);
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
