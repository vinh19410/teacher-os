import { describe, expect, it } from "vitest";
import type { VocabPoolItem, VocabSessionCard } from "../contracts";
import { type FirstResultEvent, ReviewSession } from "./review-session";
import { SeededRandom } from "./rng";

const NOW = 1_700_000_000_000;

function makeCards(count: number): VocabSessionCard[] {
	return Array.from({ length: count }, (_, idx) => ({
		id: `c${idx + 1}`,
		wordId: `w${idx + 1}`,
		word: `word${idx + 1}`,
		translation: `nghĩa ${idx + 1}`,
		ipa: null,
		audioKey: null,
		level: 2,
		isWarning: false,
		state: "review" as const,
		intervalDays: 3,
		dueAt: NOW - (count - idx) * 1000,
		lapses: 0,
	}));
}

function makePool(cards: readonly VocabSessionCard[]): VocabPoolItem[] {
	return cards.map((c) => ({
		wordId: c.wordId,
		word: c.word,
		translation: c.translation,
		lang: "en",
		deckId: "d1",
	}));
}

describe("ReviewSession (§3 spec model tests)", () => {
	it("selects only state='review' cards and excludes 'new' cards (red-team F5)", () => {
		const cards: VocabSessionCard[] = [
			...makeCards(2),
			{
				id: "c-new",
				wordId: "w-new",
				word: "newword",
				translation: "từ mới",
				ipa: null,
				audioKey: null,
				level: 1,
				isWarning: false,
				state: "new",
				intervalDays: 0,
				dueAt: NOW - 999_999,
				lapses: 0,
			},
		];
		const selected = ReviewSession.selectReviewCards(cards, NOW);
		expect(selected.map((c) => c.id)).toEqual(["c1", "c2"]);
	});

	it("emits onFirstResult only once per card and removes card on correct Continue", () => {
		const cards = makeCards(3);
		const events: FirstResultEvent[] = [];
		const session = new ReviewSession({
			cards,
			pool: makePool(cards),
			deckId: "d1",
			lang: "en",
			nowMs: NOW,
			rng: new SeededRandom(1),
			onFirstResult: (ev) => events.push(ev),
		});

		expect(session.total).toBe(3);
		const firstCardId = session.currentCard!.id;

		// Wrong first response -> records first result once and requeues on Continue
		session.respond({ type: "option", text: "__wrong__" }, NOW + 1200);
		expect(events).toHaveLength(1);
		expect(events[0]?.card.id).toBe(firstCardId);
		expect(events[0]?.result).toBe("wrong");
		expect(events[0]?.durationMs).toBe(1200);
		expect(events[0]?.applied.level).toBe(1);

		// Calling respond again while in feedback is ignored
		session.respond({ type: "remembered" }, NOW + 1500);
		expect(events).toHaveLength(1);

		session.continueAfterFeedback(NOW + 2000);
		// Double-tap continue is a no-op
		const turnAfterFirstContinue = session.turn;
		session.continueAfterFeedback(NOW + 2100);
		expect(session.turn).toBe(turnAfterFirstContinue);

		// Finish remaining cards with correct answers; when firstCardId comes back, no second onFirstResult fires
		while (!session.finished) {
			const prompt = session.prompt!;
			if (prompt.kind === "typing" || prompt.kind === "selfCheck") {
				session.respond({ type: "remembered" }, NOW + 3000);
			} else {
				session.respond({ type: "option", text: prompt.answer }, NOW + 3000);
			}
			session.continueAfterFeedback(NOW + 3100);
		}

		expect(events).toHaveLength(3);
		expect(session.done).toBe(3);
		const summary = session.summary();
		expect(summary.reviewed).toBe(3);
		expect(summary.firstTryCorrect).toBe(2);
		expect(summary.recallRate).toBe(67);
		expect(summary.levelUps).toBe(2);
		expect(summary.levelDowns).toBe(1);
	});

	it("requeues wrong card at index 4 or 5 of remaining queue (clamped to queue length)", () => {
		const seenPositions = new Set<number>();
		for (let seed = 1; seed <= 30; seed++) {
			const cards = makeCards(8);
			const session = new ReviewSession({
				cards,
				pool: makePool(cards),
				deckId: "d1",
				lang: "en",
				nowMs: NOW,
				rng: new SeededRandom(seed),
			});
			const frontId = session.currentCard!.id;
			session.respond({ type: "option", text: "__wrong__" }, NOW + 500);
			session.continueAfterFeedback(NOW + 600);
			const newIdx = session.queue.findIndex((c) => c.id === frontId);
			expect([4, 5]).toContain(newIdx);
			seenPositions.add(newIdx);
		}
		expect(seenPositions).toEqual(new Set([4, 5]));
	});

	it("evicts a card after 2 forgot responses and increments done", () => {
		const cards = makeCards(1);
		const session = new ReviewSession({
			cards,
			pool: makePool(cards),
			deckId: "d1",
			lang: "en",
			nowMs: NOW,
			rng: new SeededRandom(99),
		});

		// 1st forgot -> requeued
		session.respond({ type: "forgot" }, NOW + 100);
		session.continueAfterFeedback(NOW + 200);
		expect(session.finished).toBe(false);
		expect(session.done).toBe(0);

		// 2nd forgot -> evicted, session ends
		session.respond({ type: "forgot" }, NOW + 300);
		session.continueAfterFeedback(NOW + 400);
		expect(session.finished).toBe(true);
		expect(session.done).toBe(1);
	});

	it("shows wrong-streak encouragement overlay at streak 5 and blocks input until dismissed", () => {
		const cards = makeCards(6);
		const session = new ReviewSession({
			cards,
			pool: makePool(cards),
			deckId: "d1",
			lang: "en",
			nowMs: NOW,
			rng: new SeededRandom(5),
		});

		for (let i = 0; i < 4; i++) {
			session.respond({ type: "option", text: "__wrong__" }, NOW + i * 100);
			expect(session.showEncouragement).toBe(false);
			session.continueAfterFeedback(NOW + i * 100 + 50);
		}

		// 5th wrong in a row triggers overlay
		session.respond({ type: "option", text: "__wrong__" }, NOW + 500);
		expect(session.showEncouragement).toBe(true);

		// While overlay is up, continueAfterFeedback is ignored
		const turnWhileOverlay = session.turn;
		session.continueAfterFeedback(NOW + 550);
		expect(session.turn).toBe(turnWhileOverlay);

		// Dismiss closes overlay; for quiz prompt, feedback stays until explicit continue
		session.dismissEncouragement(NOW + 600);
		expect(session.showEncouragement).toBe(false);
		expect(session.feedback).toBe("wrong");
		session.continueAfterFeedback(NOW + 650);
		expect(session.turn).toBe(turnWhileOverlay + 1);
	});

	it("removes card mid-session via removeCard(cardId)", () => {
		const cards = makeCards(2);
		const session = new ReviewSession({
			cards,
			pool: makePool(cards),
			deckId: "d1",
			lang: "en",
			nowMs: NOW,
			rng: new SeededRandom(3),
		});
		const frontId = session.currentCard!.id;
		expect(session.removeCard(frontId, NOW + 100)).toBe(true);
		expect(session.remaining).toBe(1);
		expect(session.currentCard?.id).not.toBe(frontId);
	});
});
