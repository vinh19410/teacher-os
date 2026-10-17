import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import {
	type LearnedCommitEvent,
	LearnSession,
	type LearnStepKind,
	learnSteps,
} from "./learn-session";
import { SeededRandom } from "./rng";

const vectors = JSON.parse(
	readFileSync(
		fileURLToPath(
			new URL("./vectors/level-vectors.json", import.meta.url).href,
		),
		"utf8",
	),
) as {
	learnSteps: Array<{ eligible: string[]; steps: LearnStepKind[] }>;
	learnQueue: Array<{
		name: string;
		words: Array<{ word: string; steps: LearnStepKind[] }>;
		actions: string[];
		expected: {
			total: number;
			shown: string[];
			done: number[];
			commits: Array<{ word: string; grade: "good" | "again" }>;
		};
	}>;
};

const NOW = 1_700_000_000_000;

function makeCard(word: string, index: number): VocabSessionCard {
	return {
		id: word,
		wordId: `word-${word}`,
		word,
		translation: `nghĩa ${word}`,
		ipa: null,
		audioKey: "vocab/org/w/audio.mp3",
		level: 1,
		isWarning: false,
		state: "new",
		intervalDays: 0,
		dueAt: NOW - 10 + index,
		lapses: 0,
	};
}

const pool: VocabPoolItem[] = [
	{
		wordId: "word-w1",
		word: "w1",
		translation: "nghĩa w1",
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "word-w2",
		word: "w2",
		translation: "nghĩa w2",
		lang: "en",
		deckId: "d1",
	},
	{
		wordId: "word-w3",
		word: "w3",
		translation: "nghĩa w3",
		lang: "en",
		deckId: "d1",
	},
];

describe("LearnSession (conformance vectors + §3b rules)", () => {
	it.each(vectors.learnSteps)(
		"learnSteps($eligible) === $steps",
		({ eligible, steps }) => {
			expect(learnSteps(eligible)).toEqual(steps);
		},
	);

	it.each(vectors.learnQueue)(
		"learnQueue vector: $name",
		({ words, actions, expected }) => {
			const commits: Array<{ word: string; grade: "good" | "again" }> = [];
			const plan = words.map((entry, idx) => ({
				card: makeCard(entry.word, idx),
				steps: entry.steps,
			}));

			const session = new LearnSession({
				cards: plan.map((p) => p.card),
				pool,
				deckId: "d1",
				lang: "en",
				nowMs: NOW,
				rng: new SeededRandom(1),
				plan,
				onCommit: (ev) => {
					commits.push({ word: ev.card.word, grade: ev.grade });
				},
			});

			expect(session.total).toBe(expected.total);
			const shown: string[] = [];
			const doneAfterTurn: number[] = [];

			let t = NOW;
			for (const action of actions) {
				const step = session.currentStep!;
				shown.push(`${step.cardId}:${step.kind}`);
				t += 1000;
				if (step.kind === "intro") {
					expect(action).toBe("continue");
					// Continue before reveal must be a no-op (§3b rule 5)
					session.continueIntro(t);
					expect(session.done).toBe(doneAfterTurn.at(-1) ?? 0);
					session.reveal();
					session.continueIntro(t);
				} else {
					if (action === "correct") {
						session.respond({ type: "remembered" }, t);
					} else if (action === "wrong") {
						session.respond({ type: "option", text: "__wrong__" }, t);
					} else if (action === "forgot") {
						session.respond({ type: "forgot" }, t);
					}
					session.continueAfterFeedback(t + 100);
				}
				doneAfterTurn.push(session.done);
			}

			expect(session.finished).toBe(true);
			expect({
				total: session.total,
				shown,
				done: doneAfterTurn,
				commits,
			}).toEqual(expected);
		},
	);

	it("accumulates durationMs from intro + first-attempt scored steps only, and removes deleted cards without committing (§3b.5,6,9)", () => {
		const commitEvents: LearnedCommitEvent[] = [];
		const c1 = makeCard("alpha", 0);
		const c2 = makeCard("beta", 1);

		const session = new LearnSession({
			cards: [c1, c2],
			pool,
			deckId: "d1",
			lang: "en",
			nowMs: NOW,
			rng: new SeededRandom(7),
			plan: [
				{ card: c1, steps: ["intro", "typing"] },
				{ card: c2, steps: ["intro", "typing"] },
			],
			onCommit: (ev) => commitEvents.push(ev),
		});

		// c1 intro: dwell 1500ms
		session.reveal();
		session.continueIntro(NOW + 1500);

		// c1 typing: wrong on 1st try after 2000ms (total for c1 = 3500ms)
		session.respond({ type: "typed", text: "wrong" }, NOW + 3500);
		session.continueAfterFeedback(NOW + 4000);

		// c2 is deleted mid-session before completing -> must never commit
		session.removeCard("beta", NOW + 4000);

		// c1 typing comes back at front: retry takes 5000ms (must NOT add to durationMs)
		expect(session.currentStep).toEqual({ cardId: "alpha", kind: "typing" });
		session.respond({ type: "typed", text: "alpha" }, NOW + 9000);
		session.continueAfterFeedback(NOW + 9500);

		expect(session.finished).toBe(true);
		expect(commitEvents).toHaveLength(1);
		expect(commitEvents[0]?.card.id).toBe("alpha");
		expect(commitEvents[0]?.grade).toBe("again");
		expect(commitEvents[0]?.gradeGood).toBe(false);
		expect(commitEvents[0]?.durationMs).toBe(3500);
	});
});
