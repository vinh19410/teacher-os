import { describe, expect, it } from "vitest";
import {
	VOCAB_DURATION_MAX_MS,
	vocabAnswerSchema,
	vocabDeckCreateSchema,
	vocabLearnCommitSchema,
	vocabOverviewSchema,
	vocabSessionDataSchema,
	vocabWordUpsertSchema,
} from "./contracts";

describe("vocab contracts (.strict() and boundary validation)", () => {
	it("rejects client-supplied audioKey on vocabWordUpsertSchema (red-team F3)", () => {
		const valid = vocabWordUpsertSchema.safeParse({
			deckId: "deck-1",
			word: "resilient",
			ipa: "/rɪˈzɪl.i.ənt/",
			translation: "kiên cường",
			sortOrder: 0,
		});
		expect(valid.success).toBe(true);

		const withAudioKey = vocabWordUpsertSchema.safeParse({
			deckId: "deck-1",
			word: "resilient",
			translation: "kiên cường",
			audioKey: "vocab/other-org/word/123",
		});
		expect(withAudioKey.success).toBe(false);
	});

	it("enforces strictness on vocabDeckCreateSchema", () => {
		expect(
			vocabDeckCreateSchema.safeParse({
				classId: "class-1",
				title: "Unit 1: Environment",
			}).success,
		).toBe(true);

		expect(
			vocabDeckCreateSchema.safeParse({
				classId: "class-1",
				title: "Unit 1",
				extraField: "nope",
			}).success,
		).toBe(false);
	});

	it("validates vocabOverviewSchema with strict nested decks", () => {
		const payload = {
			dueCount: 2,
			nextDueAt: 1_700_000_000_000,
			upcomingCount: 1,
			learnedCount: 10,
			matureCount: 3,
			levelDistribution: [4, 3, 2, 1, 3],
			streak: 5,
			retention: 88,
			forecast: [2, 1, 0, 3, 0, 0, 4],
			decks: [
				{
					deckId: "d1",
					title: "Academic Verbs",
					className: "IELTS 6.5",
					total: 20,
					newCount: 5,
					dueCount: 2,
				},
			],
		};
		expect(vocabOverviewSchema.safeParse(payload).success).toBe(true);
		expect(
			vocabOverviewSchema.safeParse({ ...payload, unknownKey: 1 }).success,
		).toBe(false);
	});

	it("validates vocabSessionDataSchema and rejects level out of 1..5 or pool hasAudio", () => {
		const base = {
			deck: { id: "d1", title: "Deck 1", lang: "en" },
			cards: [
				{
					id: "c1",
					wordId: "w1",
					word: "café",
					translation: "quán cà phê",
					ipa: null,
					audioKey: "vocab/org-1/w1/uuid",
					level: 1,
					isWarning: false,
					state: "new",
					intervalDays: 0,
					dueAt: 1_700_000_000_000,
					lapses: 0,
				},
			],
			pool: [
				{
					wordId: "w1",
					word: "café",
					translation: "quán cà phê",
					lang: "en",
					deckId: "d1",
				},
			],
		};
		expect(vocabSessionDataSchema.safeParse(base).success).toBe(true);

		expect(
			vocabSessionDataSchema.safeParse({
				...base,
				cards: [{ ...base.cards[0], level: 0 }],
			}).success,
		).toBe(false);

		expect(
			vocabSessionDataSchema.safeParse({
				...base,
				cards: [{ ...base.cards[0], level: 6 }],
			}).success,
		).toBe(false);

		expect(
			vocabSessionDataSchema.safeParse({
				...base,
				pool: [{ ...base.pool[0], hasAudio: true }],
			}).success,
		).toBe(false);
	});

	it("accepts large non-negative durationMs on answer and learn-commit (server clamps at VOCAB_DURATION_MAX_MS)", () => {
		const clientLogId = "550e8400-e29b-41d4-a716-446655440000";
		expect(
			vocabAnswerSchema.safeParse({
				clientLogId,
				cardId: "c1",
				correct: true,
				durationMs: 4_000_000,
			}).success,
		).toBe(true);

		expect(
			vocabLearnCommitSchema.safeParse({
				clientLogId,
				cardId: "c1",
				gradeGood: false,
				durationMs: 4_000_000,
			}).success,
		).toBe(true);

		expect(
			vocabAnswerSchema.safeParse({
				clientLogId,
				cardId: "c1",
				correct: true,
				durationMs: -1,
			}).success,
		).toBe(false);

		expect(VOCAB_DURATION_MAX_MS).toBe(3_600_000);
	});
});
