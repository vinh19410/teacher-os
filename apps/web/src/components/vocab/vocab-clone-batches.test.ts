import { describe, expect, it } from "vitest";
import {
	isVocabDeckOversized,
	MAX_VOCAB_CLONE_DECKS_PER_BATCH,
	MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH,
	splitVocabCloneBatches,
} from "./vocab-clone-batches";

describe("vocab-clone-batches", () => {
	it("returns empty batches and empty oversizedDeckIds for empty input", () => {
		expect(splitVocabCloneBatches([])).toEqual({
			batches: [],
			oversizedDeckIds: [],
		});
	});

	it("packs decks into a single batch when under both deck and statement limits", () => {
		const plan = splitVocabCloneBatches([
			{ id: "d-1", wordCount: 20 },
			{ id: "d-2", wordCount: 35 },
			{ id: "d-3", wordCount: 0 },
		]);

		expect(plan).toEqual({
			batches: [{ deckIds: ["d-1", "d-2", "d-3"], totalWords: 55 }],
			oversizedDeckIds: [],
		});
	});

	it("keeps exact statement boundary (decks + words === 500) in one batch and splits at 501", () => {
		const exact = splitVocabCloneBatches([
			{ id: "d-1", wordCount: 250 },
			{ id: "d-2", wordCount: 248 },
		]);
		expect(exact).toEqual({
			batches: [{ deckIds: ["d-1", "d-2"], totalWords: 498 }],
			oversizedDeckIds: [],
		});

		const overByOne = splitVocabCloneBatches([
			{ id: "d-1", wordCount: 250 },
			{ id: "d-2", wordCount: 249 },
		]);
		expect(overByOne).toEqual({
			batches: [
				{ deckIds: ["d-1"], totalWords: 250 },
				{ deckIds: ["d-2"], totalWords: 249 },
			],
			oversizedDeckIds: [],
		});
	});

	it("keeps exact deck count boundary (50 decks) in one batch and splits 51st into a second batch", () => {
		const fiftyDecks = Array.from({ length: 50 }, (_, idx) => ({
			id: `d-${idx + 1}`,
			wordCount: idx % 6,
		}));
		const fiftyPlan = splitVocabCloneBatches(fiftyDecks);
		expect(fiftyPlan.oversizedDeckIds).toEqual([]);
		expect(fiftyPlan.batches).toHaveLength(1);
		expect(fiftyPlan.batches[0]?.deckIds).toHaveLength(50);

		const fiftyOneDecks = [...fiftyDecks, { id: "d-51", wordCount: 3 }];
		const fiftyOnePlan = splitVocabCloneBatches(fiftyOneDecks);
		expect(fiftyOnePlan.oversizedDeckIds).toEqual([]);
		expect(fiftyOnePlan.batches).toHaveLength(2);
		expect(fiftyOnePlan.batches[0]?.deckIds).toHaveLength(50);
		expect(fiftyOnePlan.batches[1]).toEqual({
			deckIds: ["d-51"],
			totalWords: 3,
		});
	});

	it("splits a large group (25 decks x 30 words) sequentially while preserving order and limits", () => {
		const items = Array.from({ length: 25 }, (_, idx) => ({
			id: `group-deck-${idx + 1}`,
			wordCount: 30,
		}));

		const plan = splitVocabCloneBatches(items);
		expect(plan.oversizedDeckIds).toEqual([]);
		expect(plan.batches).toHaveLength(2);

		for (const batch of plan.batches) {
			expect(batch.deckIds.length).toBeLessThanOrEqual(
				MAX_VOCAB_CLONE_DECKS_PER_BATCH,
			);
			expect(batch.deckIds.length + batch.totalWords).toBeLessThanOrEqual(
				MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH,
			);
		}

		expect(plan.batches[0]?.deckIds).toHaveLength(16);
		expect(plan.batches[0]?.totalWords).toBe(480);
		expect(plan.batches[1]?.deckIds).toHaveLength(9);
		expect(plan.batches[1]?.totalWords).toBe(270);

		const flattened = plan.batches.flatMap((batch) => batch.deckIds);
		expect(flattened).toEqual(items.map((item) => item.id));
	});

	it("isolates oversized single decks (wordCount >= 500) while batching remaining decks cleanly", () => {
		expect(isVocabDeckOversized(499)).toBe(false);
		expect(isVocabDeckOversized(500)).toBe(true);
		expect(isVocabDeckOversized(0)).toBe(false);
		expect(isVocabDeckOversized(-5)).toBe(false);

		const plan = splitVocabCloneBatches([
			{ id: "d-1", wordCount: 200 },
			{ id: "d-huge", wordCount: 500 },
			{ id: "d-2", wordCount: 250 },
			{ id: "d-max-valid", wordCount: 499 },
			{ id: "d-giant", wordCount: 820 },
		]);

		expect(plan.oversizedDeckIds).toEqual(["d-huge", "d-giant"]);
		expect(plan.batches).toEqual([
			{ deckIds: ["d-1", "d-2"], totalWords: 450 },
			{ deckIds: ["d-max-valid"], totalWords: 499 },
		]);
	});
});
