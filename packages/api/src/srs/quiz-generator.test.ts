import { describe, expect, it } from "vitest";
import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import {
	buildPrompt,
	chooseAndBuildPrompt,
	eligibleKinds,
	toQuizCandidate,
} from "./quiz-generator";
import { normalizeAnswer } from "./quiz-rules";
import { SeededRandom } from "./rng";

function makeCard(overrides: Partial<VocabSessionCard> = {}): VocabSessionCard {
	return {
		id: "c1",
		wordId: "w1",
		word: "resilient",
		translation: "kiên cường",
		ipa: "/rɪˈzɪl.i.ənt/",
		audioKey: null,
		level: 1,
		isWarning: false,
		state: "review",
		intervalDays: 1,
		dueAt: 1_700_000_000_000,
		lapses: 0,
		...overrides,
	};
}

const pool: VocabPoolItem[] = [
	{
		wordId: "w1",
		word: "resilient",
		translation: "kiên cường",
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "w2",
		word: "fragile",
		translation: "mỏng manh",
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "w3",
		word: "abundant",
		translation: "dồi dào",
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "w4",
		word: "scarce",
		translation: "khan hiếm",
		lang: "en",
		deckId: "d2",
	},
	{
		wordId: "w5",
		word: "tenacious",
		translation: "kiên cường", // duplicate translation key -> must be excluded from meaningChoice distractors
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "w6",
		word: "bonjour",
		translation: "xin chào",
		lang: "fr", // different lang -> excluded from wordChoice/listeningChoice
		deckId: "d3",
	},
];

describe("QuizGenerator", () => {
	it("evaluates eligibleKinds according to level, audioKey, translation, and distractors", () => {
		const c1 = toQuizCandidate(
			makeCard({ audioKey: null, level: 1 }),
			"d1",
			"en",
		);
		expect(eligibleKinds(c1, pool)).toEqual([
			"meaningChoice",
			"wordChoice",
			"typing",
		]);

		const withAudio = toQuizCandidate(
			makeCard({ audioKey: "vocab/org/w1/a.mp3", level: 1 }),
			"d1",
			"en",
		);
		expect(eligibleKinds(withAudio, pool)).toEqual([
			"meaningChoice",
			"wordChoice",
			"listeningChoice",
			"typing",
		]);

		const level5 = toQuizCandidate(
			makeCard({ audioKey: "vocab/org/w1/a.mp3", level: 5 }),
			"d1",
			"en",
		);
		// At level 5, meaningChoice and wordChoice are disabled (level <= 4 required)
		expect(eligibleKinds(level5, pool)).toEqual(["listeningChoice", "typing"]);

		const noDistractorsAndIneligibleTyping = toQuizCandidate(
			makeCard({ word: "5 o'clock", translation: "" }),
			"d1",
			"en",
		);
		expect(eligibleKinds(noDistractorsAndIneligibleTyping, [])).toEqual([]);
	});

	it("never includes distractors with normalized key equal to answer or from another language for wordChoice", () => {
		const rng = new SeededRandom(42);
		const candidate = toQuizCandidate(makeCard(), "d1", "en");

		const meaningPrompt = buildPrompt(candidate, "meaningChoice", pool, rng);
		expect(meaningPrompt.options).toHaveLength(4);
		expect(meaningPrompt.options).toContain("kiên cường");
		const normalizedMeaningOptions = meaningPrompt.options.map(normalizeAnswer);
		expect(new Set(normalizedMeaningOptions).size).toBe(
			meaningPrompt.options.length,
		);

		const wordPrompt = buildPrompt(candidate, "wordChoice", pool, rng);
		expect(wordPrompt.options).toHaveLength(4);
		expect(wordPrompt.options).toContain("resilient");
		expect(wordPrompt.options).not.toContain("bonjour");
	});

	it("prioritizes same-deck distractors before other-deck distractors", () => {
		const rng = new SeededRandom(7);
		const candidate = toQuizCandidate(makeCard(), "d1", "en");
		// Same deck d1 has w2 (fragile), w3 (abundant), w5 (tenacious) -> 3 distinct word distractors in d1!
		// So d2's "scarce" should not be needed when k = 3.
		const wordPrompt = buildPrompt(candidate, "wordChoice", pool, rng);
		expect(wordPrompt.options.sort()).toEqual(
			["abundant", "fragile", "resilient", "tenacious"].sort(),
		);
	});

	it("chooses kind using strict priority avoiding cardLastKind and previousKind, or falls back to selfCheck", () => {
		const rng = new SeededRandom(11);
		const candidate = toQuizCandidate(makeCard({ level: 1 }), "d1", "en");
		// Eligible: meaningChoice, wordChoice, typing
		const prompt = chooseAndBuildPrompt(
			candidate,
			pool,
			"meaningChoice",
			"wordChoice",
			rng,
		);
		expect(prompt.kind).toBe("typing");
		expect(prompt.hint).toBe("r________");

		const fallback = chooseAndBuildPrompt(
			toQuizCandidate(makeCard({ word: "123", translation: "" }), "d1", "en"),
			[],
			null,
			null,
			rng,
		);
		expect(fallback.kind).toBe("selfCheck");
	});
});
