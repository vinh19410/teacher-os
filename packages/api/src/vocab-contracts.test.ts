import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
	VOCAB_DURATION_MAX_MS,
	VOCAB_ERROR_CODES,
	vocabAnswerSchema,
	vocabDeckCreateSchema,
	vocabLearnCommitSchema,
	vocabLibraryCloneSchema,
	vocabLibraryCourseSchema,
	vocabLibraryDeckSchema,
	vocabLibraryWordsResponseSchema,
	vocabOverviewSchema,
	vocabRevokeSuggestionSchema,
	vocabSessionCardSchema,
	vocabSessionDataSchema,
	vocabStudentProgressResponseSchema,
	vocabSuggestDeckSchema,
	vocabSuggestionItemSchema,
	vocabTeacherWordSchema,
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

	it("defaults hasAudio to false on vocabSessionCardSchema and documents reverse release-train strictness (#361)", () => {
		const legacyPayload = {
			id: "c1",
			wordId: "w1",
			word: "café",
			translation: "quán cà phê",
			ipa: null,
			audioKey: null,
			level: 1,
			isWarning: false,
			state: "new" as const,
			intervalDays: 0,
			dueAt: 1_700_000_000_000,
			lapses: 0,
		};
		const parsedLegacy = vocabSessionCardSchema.safeParse(legacyPayload);
		expect(parsedLegacy.success).toBe(true);
		if (parsedLegacy.success) {
			expect(parsedLegacy.data.hasAudio).toBe(false);
		}

		const parsedWithAudio = vocabSessionCardSchema.safeParse({
			...legacyPayload,
			hasAudio: true,
		});
		expect(parsedWithAudio.success).toBe(true);
		if (parsedWithAudio.success) {
			expect(parsedWithAudio.data.hasAudio).toBe(true);
		}

		// Reverse direction (#304, #361 release-train note): an older client schema
		// without `hasAudio` using `.strict()` rejects payloads containing `hasAudio`.
		const simulatedLegacyStrictSchema = z
			.object({
				id: z.string().min(1),
				wordId: z.string().min(1),
				word: z.string(),
				translation: z.string(),
				ipa: z.string().nullable(),
				audioKey: z.string().nullable(),
				level: z.number().int().min(1).max(5),
				isWarning: z.boolean(),
				state: z.enum(["new", "review"]),
				intervalDays: z.number().int().min(0),
				dueAt: z.number().int(),
				lapses: z.number().int().min(0),
			})
			.strict();
		expect(
			simulatedLegacyStrictSchema.safeParse({
				...legacyPayload,
				hasAudio: true,
			}).success,
		).toBe(false);
	});

	it("validates vocabLibraryCloneSchema boundaries (1..50 deckIds) and strictness (#361)", () => {
		expect(
			vocabLibraryCloneSchema.safeParse({
				classId: "class-1",
				deckIds: ["libdeck-1", "libdeck-2"],
			}).success,
		).toBe(true);

		expect(
			vocabLibraryCloneSchema.safeParse({
				classId: "class-1",
				deckIds: [],
			}).success,
		).toBe(false);

		const sixtyOneDecks = Array.from(
			{ length: 61 },
			(_, idx) => `libdeck-${idx + 1}`,
		);
		expect(
			vocabLibraryCloneSchema.safeParse({
				classId: "class-1",
				deckIds: sixtyOneDecks,
			}).success,
		).toBe(false);

		expect(
			vocabLibraryCloneSchema.safeParse({
				classId: "class-1",
				deckIds: ["libdeck-1"],
				extraField: true,
			}).success,
		).toBe(false);
	});

	it("validates library browse schemas, teacher word audioUrl, and error codes (#361)", () => {
		expect(
			vocabLibraryCourseSchema.safeParse({
				id: "libcourse-6",
				name: "1000 TỪ CƠ BẢN",
				description: "Từ vựng thông dụng",
				target: "Mất gốc",
				deckCount: 50,
				sortOrder: 1,
			}).success,
		).toBe(true);
		expect(
			vocabLibraryCourseSchema.safeParse({
				id: "libcourse-6",
				name: "1000 TỪ CƠ BẢN",
				description: null,
				target: null,
				deckCount: 50,
				sortOrder: 1,
				extra: 1,
			}).success,
		).toBe(false);

		expect(
			vocabLibraryDeckSchema.safeParse({
				id: "libdeck-10",
				courseId: "libcourse-6",
				title: "School",
				imageUrl: null,
				wordCount: 12,
				sortOrder: 1,
			}).success,
		).toBe(true);

		expect(
			vocabLibraryWordsResponseSchema.safeParse({
				deck: { id: "libdeck-10", title: "School" },
				words: [
					{
						id: "libword-44753",
						word: "teacher",
						ipa: "/ˈtiːtʃər/",
						pos: "n",
						translation: "Giáo viên",
						sentenceVi: "Cô ấy là giáo viên",
						sentenceEn: "She is a teacher",
						pictureUrl: null,
						audioUrl:
							"https://mochien3.1-api.mochidemy.com/v3.1/audios/teacher.mp3",
						sortOrder: 1,
					},
				],
			}).success,
		).toBe(true);

		expect(
			vocabTeacherWordSchema.safeParse({
				id: "w1",
				deckId: "d1",
				word: "teacher",
				ipa: "/ˈtiːtʃər/",
				translation: "Giáo viên",
				audioKey: null,
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/v3.1/audios/teacher.mp3",
				sortOrder: 0,
			}).success,
		).toBe(true);

		expect(VOCAB_ERROR_CODES.LIBRARY_COURSE_NOT_FOUND).toBe(
			"LIBRARY_COURSE_NOT_FOUND",
		);
		expect(VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND).toBe(
			"LIBRARY_DECK_NOT_FOUND",
		);
		expect(VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE).toBe(
			"LIBRARY_CLONE_TOO_LARGE",
		);
	});

	it("validates independent deck creation, suggestion lifecycle, progress, and 2-way wire compatibility (#363)", () => {
		// 1) Independent deck creation & library clone (classId null or omitted -> null)
		const indepCreate = vocabDeckCreateSchema.parse({
			title: "TOEIC Essential",
		});
		expect(indepCreate.classId).toBeNull();
		expect(
			vocabDeckCreateSchema.parse({
				classId: null,
				title: "TOEIC Essential",
			}).classId,
		).toBeNull();
		expect(
			vocabLibraryCloneSchema.parse({
				deckIds: ["libdeck-10"],
			}).classId,
		).toBeNull();

		// 2) Suggest & revoke schemas
		expect(
			vocabSuggestDeckSchema.safeParse({
				deckId: "d1",
				studentId: "s1",
				note: "  Ôn trước thứ 7 nhé  ",
			}),
		).toMatchObject({
			success: true,
			data: {
				deckId: "d1",
				studentId: "s1",
				note: "Ôn trước thứ 7 nhé",
			},
		});
		expect(
			vocabSuggestDeckSchema.safeParse({
				deckId: "d1",
				studentId: "s1",
				note: "x".repeat(501),
			}).success,
		).toBe(false);
		expect(
			vocabRevokeSuggestionSchema.safeParse({ suggestionId: "sug-1" }).success,
		).toBe(true);

		// 3) 2-way compatibility on vocabOverviewSchema (RT-F4)
		const legacyOverviewPayload = {
			dueCount: 1,
			nextDueAt: null,
			upcomingCount: 0,
			learnedCount: 5,
			matureCount: 1,
			levelDistribution: [1, 2, 1, 0, 1],
			streak: 2,
			retention: 90,
			forecast: [1, 0, 0, 0, 0, 0, 0],
			decks: [
				{
					deckId: "d1",
					title: "Class Deck",
					className: "IELTS A1",
					total: 10,
					newCount: 5,
					dueCount: 1,
				},
			],
		};
		// New client schema parses old server payload using .catch() defaults
		const parsedFromLegacy = vocabOverviewSchema.parse(legacyOverviewPayload);
		expect(parsedFromLegacy.suggestions).toEqual([]);
		expect(parsedFromLegacy.decks[0]?.source).toBe("class");
		expect(parsedFromLegacy.decks[0]?.className).toBe("IELTS A1");

		// New server payload with suggested deck (className: "") and suggestions[]
		const newOverviewPayload = {
			...legacyOverviewPayload,
			decks: [
				{
					deckId: "d-indep",
					title: "TOEIC 600",
					className: "",
					source: "suggested" as const,
					total: 15,
					newCount: 15,
					dueCount: 0,
				},
			],
			suggestions: [
				{
					id: "sug-1",
					deckId: "d-pending",
					title: "Academic Collocations",
					wordCount: 20,
					note: "Làm thử nhé",
					createdAt: "2026-10-19T00:00:00.000Z",
				},
			],
		};
		const parsedNew = vocabOverviewSchema.parse(newOverviewPayload);
		expect(parsedNew.decks[0]?.source).toBe("suggested");
		expect(parsedNew.decks[0]?.className).toBe("");
		expect(parsedNew.suggestions).toHaveLength(1);
		expect(
			vocabSuggestionItemSchema.parse(newOverviewPayload.suggestions[0])
				.wordCount,
		).toBe(20);

		// Document why release train matters: old strict client schema rejects unknown top-level suggestions key
		const legacyClientOverviewSchema = z
			.object({
				dueCount: z.number(),
				nextDueAt: z.number().nullable(),
				upcomingCount: z.number().nullable(),
				learnedCount: z.number(),
				matureCount: z.number(),
				levelDistribution: z.tuple([
					z.number(),
					z.number(),
					z.number(),
					z.number(),
					z.number(),
				]),
				streak: z.number(),
				retention: z.number().nullable(),
				forecast: z.tuple([
					z.number(),
					z.number(),
					z.number(),
					z.number(),
					z.number(),
					z.number(),
					z.number(),
				]),
				decks: z.array(
					z
						.object({
							deckId: z.string(),
							title: z.string(),
							className: z.string(),
							total: z.number(),
							newCount: z.number(),
							dueCount: z.number(),
						})
						.strict(),
				),
			})
			.strict();
		expect(
			legacyClientOverviewSchema.safeParse(newOverviewPayload).success,
		).toBe(false);

		// 4) Progress per-student schema
		expect(
			vocabStudentProgressResponseSchema.safeParse({
				studentId: "s1",
				decks: [
					{
						deckId: "d-indep",
						title: "TOEIC 600",
						classId: null,
						source: "suggested",
						total: 15,
						byLevel: [2, 5, 0, 0, 0],
						dueToday: 2,
						stateNew: 8,
						stateReview: 7,
						lastActivityAt: "2026-10-19T03:00:00.000Z",
					},
				],
				activity7Days: [
					{
						dateISO: "2026-10-19",
						sessions: 5,
						correct: 4,
					},
				],
			}).success,
		).toBe(true);
	});
});
