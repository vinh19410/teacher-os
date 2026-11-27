import type {
	VocabOverview,
	VocabOverviewDeck,
} from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import {
	buildStreakWeekDays,
	buildVocabOverviewSearch,
	filterVocabDecks,
	formatVocabDeckSourceLabel,
	getVocabDeckLearnedCount,
	getVocabDeckProgressPercent,
	getVocabDeckStatus,
	isVocabDeckDone,
	parseVocabOverviewSearch,
	resolveVocabHeroState,
	sortVocabDecks,
} from "./vocab-overview-helpers";

function makeDeck(
	overrides: Partial<VocabOverviewDeck> = {},
): VocabOverviewDeck {
	return {
		deckId: "deck-1",
		title: "Environment",
		className: "IELTS 6.5",
		source: "class",
		total: 20,
		newCount: 5,
		dueCount: 3,
		levelDistribution: [2, 3, 4, 4, 2],
		...overrides,
	};
}

function makeOverview(overrides: Partial<VocabOverview> = {}): VocabOverview {
	return {
		dueCount: 3,
		nextDueAt: null,
		upcomingCount: 0,
		learnedCount: 13,
		matureCount: 2,
		levelDistribution: [2, 3, 4, 4, 2],
		streak: 5,
		streakDays: [false, false, true, true, true, true, true],
		retention: 87,
		forecast: [3, 0, 0, 0, 0, 0, 0],
		decks: [makeDeck()],
		suggestions: [],
		...overrides,
	};
}

describe("vocab-overview-helpers", () => {
	it("parses and normalizes URL search state safely (f, lv, q)", () => {
		expect(parseVocabOverviewSearch({})).toEqual({});
		expect(
			parseVocabOverviewSearch({
				f: "all",
				lv: "0",
				q: "   ",
			}),
		).toEqual({});

		// TanStack Router parses numeric search values via JSON.parse
		expect(
			parseVocabOverviewSearch({
				f: "due",
				lv: 3,
				q: 18,
			}),
		).toEqual({
			f: "due",
			lv: 3,
			q: "18",
		});

		expect(
			parseVocabOverviewSearch({
				f: "done",
				lv: "5",
				q: "  \u202Eenv\u0000ironment  ",
			}),
		).toEqual({
			f: "done",
			lv: 5,
			q: "environment",
		});

		expect(
			parseVocabOverviewSearch({
				f: "unknown",
				lv: 6,
				q: "a".repeat(250),
			}),
		).toEqual({
			q: "a".repeat(200),
		});

		expect(
			buildVocabOverviewSearch({ f: "learning", lv: 2, q: "ielts" }),
		).toEqual({
			f: "learning",
			lv: 2,
			q: "ielts",
		});
	});

	it("guards deck progress and done state when total === 0 or dueCount > 0", () => {
		const emptyDeck = makeDeck({
			total: 0,
			newCount: 0,
			dueCount: 0,
			levelDistribution: [0, 0, 0, 0, 0],
		});
		expect(getVocabDeckLearnedCount(emptyDeck)).toBe(0);
		expect(getVocabDeckProgressPercent(emptyDeck)).toBe(0);
		expect(isVocabDeckDone(emptyDeck)).toBe(false);
		expect(getVocabDeckStatus(emptyDeck)).toBe("learning");

		const dueFullDeck = makeDeck({
			total: 10,
			newCount: 0,
			dueCount: 2,
			levelDistribution: [0, 4, 3, 2, 1],
		});
		expect(getVocabDeckLearnedCount(dueFullDeck)).toBe(10);
		expect(getVocabDeckProgressPercent(dueFullDeck)).toBe(100);
		expect(isVocabDeckDone(dueFullDeck)).toBe(false);
		expect(getVocabDeckStatus(dueFullDeck)).toBe("due");

		const doneDeck = makeDeck({
			total: 10,
			newCount: 0,
			dueCount: 0,
			levelDistribution: [0, 4, 3, 2, 1],
		});
		expect(isVocabDeckDone(doneDeck)).toBe(true);
		expect(getVocabDeckStatus(doneDeck)).toBe("done");
	});

	it("formats deck source labels preserving E2E invariants", () => {
		expect(
			formatVocabDeckSourceLabel(
				makeDeck({ source: "suggested", className: "" }),
			),
		).toBe("Gợi ý");
		expect(
			formatVocabDeckSourceLabel(
				makeDeck({ source: "library", className: "1000 Từ Cơ Bản" }),
			),
		).toBe("Khóa 1000 Từ Cơ Bản");
		expect(
			formatVocabDeckSourceLabel(
				makeDeck({ source: "library", className: "" }),
			),
		).toBe("Khóa học");
		expect(
			formatVocabDeckSourceLabel(
				makeDeck({ source: "class", className: "IELTS 6.5" }),
			),
		).toBe("Lớp IELTS 6.5");
		expect(
			formatVocabDeckSourceLabel(makeDeck({ source: "class", className: "" })),
		).toBe("Lớp học");
	});

	it("sorts and filters decks by status, memory level, and Vietnamese diacritic-insensitive query", () => {
		const d1 = makeDeck({
			deckId: "d1",
			title: "Môi trường",
			className: "IELTS Cơ bản",
			source: "class",
			dueCount: 0,
			newCount: 4,
			levelDistribution: [1, 0, 2, 0, 0],
		});
		const d2 = makeDeck({
			deckId: "d2",
			title: "Giáo dục",
			className: "Khóa Học Nền Tảng",
			source: "library",
			dueCount: 5,
			newCount: 0,
			levelDistribution: [0, 3, 0, 2, 0],
		});
		const d3 = makeDeck({
			deckId: "d3",
			title: "Sức khỏe",
			className: "",
			source: "suggested",
			total: 5,
			dueCount: 0,
			newCount: 0,
			levelDistribution: [0, 2, 1, 1, 1],
		});

		expect(sortVocabDecks([d1, d2, d3]).map((d) => d.deckId)).toEqual([
			"d2",
			"d1",
			"d3",
		]);
		expect(
			filterVocabDecks([d1, d2, d3], {
				filter: "done",
				level: null,
				query: "",
			}).map((d) => d.deckId),
		).toEqual(["d3"]);
		expect(
			filterVocabDecks([d1, d2, d3], {
				filter: "all",
				level: 1,
				query: "",
			}).map((d) => d.deckId),
		).toEqual(["d1"]);
		expect(
			filterVocabDecks([d1, d2, d3], {
				filter: "all",
				level: null,
				query: "moi truong",
			}).map((d) => d.deckId),
		).toEqual(["d1"]);
		expect(
			filterVocabDecks([d1, d2, d3], {
				filter: "all",
				level: null,
				query: "nen tang",
			}).map((d) => d.deckId),
		).toEqual(["d2"]);
	});

	it("resolves all 5 Hero states and picks topNewDeck independently of sortedDecks[0]", () => {
		// 1. no-decks with null vs non-null librarySummary (#573)
		const noDecksHidden = resolveVocabHeroState(
			makeOverview({ dueCount: 0, decks: [] }),
			null,
		);
		expect(noDecksHidden.kind).toBe("no-decks");
		if (noDecksHidden.kind === "no-decks") {
			expect(noDecksHidden.subtitle).not.toContain("bên dưới");
			expect(noDecksHidden.subtitle).not.toContain("Thư viện từ vựng");
		}

		const noDecksWithLib = resolveVocabHeroState(
			makeOverview({ dueCount: 0, decks: [] }),
			{ courseCount: 6, lessonCount: 48 },
		);
		expect(noDecksWithLib.kind).toBe("no-decks");
		if (noDecksWithLib.kind === "no-decks") {
			expect(noDecksWithLib.subtitle).toContain("Thư viện từ vựng");
		}

		// 2. due: topDueDeck is d-due (newCount=0), topNewDeck must pick d-new!
		const dueHero = resolveVocabHeroState(
			makeOverview({
				dueCount: 4,
				decks: [
					makeDeck({ deckId: "d-due", dueCount: 4, newCount: 0 }),
					makeDeck({ deckId: "d-new", dueCount: 0, newCount: 7 }),
				],
			}),
			null,
		);
		expect(dueHero.kind).toBe("due");
		if (dueHero.kind === "due") {
			expect(dueHero.topDueDeck.deckId).toBe("d-due");
			expect(dueHero.topNewDeck?.deckId).toBe("d-new");
			expect(dueHero.totalNewCount).toBe(7);
		}

		// 3. new-only: dueCount=0, totalNewCount>0, nextDueAt=null
		const newOnlyHero = resolveVocabHeroState(
			makeOverview({
				dueCount: 0,
				nextDueAt: null,
				decks: [makeDeck({ deckId: "d-fresh", dueCount: 0, newCount: 3 })],
			}),
			null,
		);
		expect(newOnlyHero.kind).toBe("new-only");
		if (newOnlyHero.kind === "new-only") {
			expect(newOnlyHero.totalNewCount).toBe(3);
			expect(newOnlyHero.topNewDeck.deckId).toBe("d-fresh");
		}

		// 4. caught-up: dueCount=0, nextDueAt!=null
		const caughtUpHero = resolveVocabHeroState(
			makeOverview({
				dueCount: 0,
				nextDueAt: 1_800_000_000_000,
				upcomingCount: 2,
				decks: [makeDeck({ deckId: "d-rev", dueCount: 0, newCount: 0 })],
			}),
			null,
		);
		expect(caughtUpHero.kind).toBe("caught-up");

		// 5. empty-decks + inconsistent fallback guard (dueCount > 0 with no matching due deck)
		const emptyDecksHero = resolveVocabHeroState(
			makeOverview({
				dueCount: 0,
				nextDueAt: null,
				decks: [
					makeDeck({ deckId: "d-zero", total: 0, dueCount: 0, newCount: 0 }),
				],
			}),
			null,
		);
		expect(emptyDecksHero.kind).toBe("empty-decks");

		const inconsistentFallback = resolveVocabHeroState(
			makeOverview({
				dueCount: 2,
				nextDueAt: null,
				decks: [
					makeDeck({ deckId: "d-none", total: 0, dueCount: 0, newCount: 0 }),
				],
			}),
			null,
		);
		expect(inconsistentFallback.kind).toBe("empty-decks");
	});

	it("builds 7 streak weekday labels anchored to Vietnam todayISO regardless of host timezone", () => {
		// 2026-11-27 is Friday (Thứ Sáu) -> T7, CN, T2, T3, T4, T5, Nay
		const days = buildStreakWeekDays("2026-11-27", [
			true,
			false,
			true,
			true,
			false,
			true,
			false,
		]);
		expect(days).toHaveLength(7);
		expect(days.map((d) => d.shortLabel)).toEqual([
			"T7",
			"CN",
			"T2",
			"T3",
			"T4",
			"T5",
			"Nay",
		]);
		expect(days.map((d) => d.fullLabel)).toEqual([
			"Thứ Bảy",
			"Chủ Nhật",
			"Thứ Hai",
			"Thứ Ba",
			"Thứ Tư",
			"Thứ Năm",
			"Hôm nay",
		]);
		expect(days.map((d) => d.done)).toEqual([
			true,
			false,
			true,
			true,
			false,
			true,
			false,
		]);
		expect(days[6]?.isToday).toBe(true);
		expect(days[5]?.isToday).toBe(false);
	});
});
