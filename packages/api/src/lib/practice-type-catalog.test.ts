import { describe, expect, test } from "vitest";
import {
	PRACTICE_CATALOG_MAX_PAGE,
	PRACTICE_FILTER_MAX_LENGTH,
	parsePracticePageParam,
	practiceCatalogFacetsSchema,
	practiceCatalogResponseSchema,
} from "../contracts";
import {
	LIBRARY_LISTENING_TYPES,
	LIBRARY_READING_TYPES,
} from "../library-contracts";
import {
	canonicalizePracticeType,
	expandPracticeTypeFilter,
	practicePartLabel,
	practiceTypeLabel,
	sortPracticeBands,
	sortPracticeParts,
	sortPracticeTypes,
} from "./practice-type-catalog";

describe("practice catalog contracts & page parser (#884)", () => {
	test("parsePracticePageParam accepts positive integers within bounds and rejects malformed/overflow values", () => {
		expect(PRACTICE_FILTER_MAX_LENGTH).toBe(200);
		expect(PRACTICE_CATALOG_MAX_PAGE).toBe(100_000);
		expect(parsePracticePageParam("1")).toBe(1);
		expect(parsePracticePageParam("42")).toBe(42);
		expect(parsePracticePageParam("100000")).toBe(100_000);

		for (const bad of [
			undefined,
			"",
			"0",
			"-1",
			"01",
			"1.5",
			"2abc",
			" 2 ",
			"100001",
			"999999999999999999999",
		]) {
			expect(parsePracticePageParam(bad)).toBeNull();
		}
	});

	test("practiceCatalogResponseSchema preserves backward compatibility without facets and validates strict facets", () => {
		const legacy = practiceCatalogResponseSchema.parse({
			items: [],
			page: 1,
			pages: 1,
			total: 0,
		});
		expect(legacy.facets).toBeUndefined();

		const withFacets = practiceCatalogResponseSchema.parse({
			items: [],
			page: 1,
			pages: 1,
			total: 0,
			facets: {
				collections: ["Cambridge IELTS 18"],
				types: ["tfng"],
				parts: ["p1"],
				bands: ["7.0"],
			},
		});
		expect(withFacets.facets).toEqual({
			collections: ["Cambridge IELTS 18"],
			types: ["tfng"],
			parts: ["p1"],
			bands: ["7.0"],
		});

		expect(() =>
			practiceCatalogResponseSchema.parse({
				items: [],
				page: 1,
				pages: 1,
				total: 0,
				unexpected: true,
			}),
		).toThrow();

		expect(() =>
			practiceCatalogFacetsSchema.parse({
				collections: [],
				types: [],
				parts: [],
				bands: [],
				extra: [],
			}),
		).toThrow();
	});
});

describe("practice-type-catalog canonicalization, expansion, labeling, and sorting", () => {
	test("canonicalizePracticeType collapses duplicate-label aliases for reading/listening without altering writing/speaking", () => {
		expect(canonicalizePracticeType("listening", "mcq1")).toBe("mcq");
		expect(canonicalizePracticeType("listening", "mcq3")).toBe("mcq");
		expect(canonicalizePracticeType("listening", " mcq ")).toBe("mcq");
		expect(canonicalizePracticeType("reading", "note")).toBe("notes");
		expect(canonicalizePracticeType("listening", "notes")).toBe("notes");
		expect(canonicalizePracticeType("listening", "sent4")).toBe("sent");
		expect(canonicalizePracticeType("reading", "sent")).toBe("sent");
		expect(canonicalizePracticeType("reading", "flowchart")).toBe("flow");
		expect(canonicalizePracticeType("listening", "flow")).toBe("flow");
		expect(canonicalizePracticeType("listening", "match2")).toBe("matching");
		expect(canonicalizePracticeType("reading", "match")).toBe("matching");
		expect(canonicalizePracticeType("reading", "choice")).toBe("choice");
		expect(canonicalizePracticeType("reading", "   ")).toBe("");

		expect(canonicalizePracticeType("writing", "map")).toBe("map");
		expect(canonicalizePracticeType("writing", "note")).toBe("note");
		expect(canonicalizePracticeType("speaking", "work")).toBe("work");
	});

	test("expandPracticeTypeFilter returns all raw DB types in the canonical alias group", () => {
		expect(expandPracticeTypeFilter("listening", "mcq")).toEqual([
			"mcq",
			"mcq1",
			"mcq3",
		]);
		expect(expandPracticeTypeFilter("listening", "mcq1")).toEqual([
			"mcq",
			"mcq1",
			"mcq3",
		]);
		expect(expandPracticeTypeFilter("listening", "mcq3")).toEqual([
			"mcq",
			"mcq1",
			"mcq3",
		]);
		expect(expandPracticeTypeFilter("reading", "note")).toEqual([
			"notes",
			"note",
		]);
		expect(expandPracticeTypeFilter("listening", "sent4")).toEqual([
			"sent",
			"sent4",
		]);
		expect(expandPracticeTypeFilter("reading", "flowchart")).toEqual([
			"flow",
			"flowchart",
		]);
		expect(expandPracticeTypeFilter("listening", "match2")).toEqual([
			"matching",
			"match2",
			"match",
		]);
		expect(expandPracticeTypeFilter("reading", "custom")).toEqual(["custom"]);
		expect(expandPracticeTypeFilter("reading", "  ")).toEqual([]);
		expect(expandPracticeTypeFilter("writing", "map")).toEqual(["map"]);
	});

	test("practiceTypeLabel produces zero duplicate labels across canonicalized reading & listening library types", () => {
		for (const [skill, rawTypes] of [
			["reading", LIBRARY_READING_TYPES],
			["listening", LIBRARY_LISTENING_TYPES],
		] as const) {
			const canonical = sortPracticeTypes(skill, rawTypes);
			const labels = canonical.map((id) => practiceTypeLabel(skill, id));
			expect(new Set(labels).size).toBe(labels.length);
		}

		expect(practiceTypeLabel("listening", "mcq")).toBe(
			"Multiple choice (One answer)",
		);
		expect(practiceTypeLabel("listening", "mcq1")).toBe(
			"Multiple choice (One answer)",
		);
		expect(practiceTypeLabel("listening", "map")).toBe("Map labelling");
		expect(practiceTypeLabel("writing", "map")).toBe("Bản đồ");
		expect(practiceTypeLabel("writing", "chart")).toBe("Biểu đồ");
		expect(practiceTypeLabel("writing", "discuss")).toBe("Discuss both views");
		expect(practiceTypeLabel("speaking", "work")).toBe("Work & study");
		expect(practiceTypeLabel("reading", "legacy_custom")).toBe("legacy_custom");
	});

	test("practicePartLabel and sortPracticeParts follow slot preset order with unknown parts sorted at end", () => {
		expect(sortPracticeParts("reading", ["p3", "p1", "", "p2", "p1"])).toEqual([
			"p1",
			"p2",
			"p3",
		]);
		expect(practicePartLabel("reading", "p1")).toBe("Passage 1");
		expect(practicePartLabel("reading", "p3")).toBe("Passage 3");

		expect(
			sortPracticeParts("listening", ["s4", "extra", "s2", "s1", "s3"]),
		).toEqual(["s1", "s2", "s3", "s4", "extra"]);
		expect(practicePartLabel("listening", "s4")).toBe("Section 4");
		expect(practicePartLabel("listening", "extra")).toBe("extra");
	});

	test("sortPracticeBands orders known bands numerically and places non-numeric bands safely at end", () => {
		expect(
			sortPracticeBands(["7.5", "6.0", "5.0", "7.0", "6.5", "", "8.5", "6.0"]),
		).toEqual(["5.0", "6.0", "6.5", "7.0", "7.5", "8.5"]);
		expect(sortPracticeBands(["custom-b", "7.0", "custom-a", "5.5"])).toEqual([
			"5.5",
			"7.0",
			"custom-a",
			"custom-b",
		]);
	});

	test("sortPracticeTypes deduplicates aliases and sorts case-insensitively by label", () => {
		expect(
			sortPracticeTypes("listening", ["notes", "note", "mcq3", "mcq1", "form"]),
		).toEqual(["form", "mcq", "notes"]);
	});

	test("handles Object.prototype keys safely without throwing or leaking functions", () => {
		const protoKeys = ["toString", "constructor", "valueOf", "__proto__"];
		for (const skill of [
			"reading",
			"listening",
			"writing",
			"speaking",
		] as const) {
			for (const key of protoKeys) {
				expect(canonicalizePracticeType(skill, key)).toBe(key);
				expect(expandPracticeTypeFilter(skill, key)).toEqual([key]);
				expect(practiceTypeLabel(skill, key)).toBe(key);
			}
			expect(sortPracticeTypes(skill, ["tfng", ...protoKeys])).toEqual(
				expect.arrayContaining(["tfng", ...protoKeys]),
			);
		}
	});
});
