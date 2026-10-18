import type {
	VocabPoolItem,
	VocabSessionCard,
	VocabSessionDeck,
} from "@teacher-os/api/contracts";
import {
	enrollment,
	vocabCard,
	vocabDeck,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../app";

export interface EnsuredDeckSession {
	deck: VocabSessionDeck;
	cards: VocabSessionCard[];
}

/**
 * Verifies that `studentId` has an active enrollment in the class owning `deckId`
 * (within `orgId`), then lazy-provisions any missing `vocab_card` rows for that
 * deck's words using `deck.createdAt` as the stable timestamp anchor:
 *   `dueAt = baseMs - (n - 1) + i`
 * (red-team F1 + F8).
 *
 * Returns `null` when the deck does not exist or the student is not actively enrolled.
 */
export async function ensureDeckCards(
	db: Db,
	studentId: string,
	orgId: string,
	deckId: string,
): Promise<EnsuredDeckSession | null> {
	const [deckRow] = await db
		.select({
			id: vocabDeck.id,
			title: vocabDeck.title,
			lang: vocabDeck.lang,
			createdAt: vocabDeck.createdAt,
		})
		.from(vocabDeck)
		.innerJoin(
			enrollment,
			and(
				eq(enrollment.classId, vocabDeck.classId),
				eq(enrollment.orgId, vocabDeck.orgId),
			),
		)
		.where(
			and(
				eq(vocabDeck.id, deckId),
				eq(vocabDeck.orgId, orgId),
				eq(enrollment.studentId, studentId),
				eq(enrollment.status, "active"),
			),
		)
		.limit(1);

	if (!deckRow) return null;

	const words = await db
		.select({
			id: vocabWord.id,
			word: vocabWord.word,
			translation: vocabWord.translation,
			ipa: vocabWord.ipa,
			audioKey: vocabWord.audioKey,
			sortOrder: vocabWord.sortOrder,
		})
		.from(vocabWord)
		.where(eq(vocabWord.deckId, deckId))
		.orderBy(
			asc(vocabWord.sortOrder),
			asc(vocabWord.createdAt),
			asc(vocabWord.id),
		);

	if (words.length > 0) {
		const baseMs =
			deckRow.createdAt instanceof Date
				? deckRow.createdAt.getTime()
				: Number(deckRow.createdAt);
		const n = words.length;

		await db
			.insert(vocabCard)
			.values(
				words.map((w, idx) => ({
					id: crypto.randomUUID(),
					studentId,
					wordId: w.id,
					level: 1,
					isWarning: false,
					state: "new" as const,
					intervalDays: 0,
					dueAt: baseMs - (n - 1) + idx,
					lapses: 0,
				})),
			)
			.onConflictDoNothing({
				target: [vocabCard.studentId, vocabCard.wordId],
			});
	}

	const rows = await db
		.select({
			id: vocabCard.id,
			wordId: vocabWord.id,
			word: vocabWord.word,
			translation: vocabWord.translation,
			ipa: vocabWord.ipa,
			audioKey: vocabWord.audioKey,
			audioUrl: vocabWord.audioUrl,
			level: vocabCard.level,
			isWarning: vocabCard.isWarning,
			state: vocabCard.state,
			intervalDays: vocabCard.intervalDays,
			dueAt: vocabCard.dueAt,
			lapses: vocabCard.lapses,
		})
		.from(vocabCard)
		.innerJoin(vocabWord, eq(vocabCard.wordId, vocabWord.id))
		.where(
			and(eq(vocabCard.studentId, studentId), eq(vocabWord.deckId, deckId)),
		)
		.orderBy(
			asc(vocabWord.sortOrder),
			asc(vocabWord.createdAt),
			asc(vocabWord.id),
		);

	return {
		deck: {
			id: deckRow.id,
			title: deckRow.title,
			lang: deckRow.lang,
		},
		cards: rows.map((row) => ({
			id: row.id,
			wordId: row.wordId,
			word: row.word,
			translation: row.translation,
			ipa: row.ipa ?? null,
			audioKey: row.audioKey ?? null,
			hasAudio:
				(row.audioKey !== null && row.audioKey.trim().length > 0) ||
				(row.audioUrl !== null && row.audioUrl.trim().length > 0),
			level: row.level,
			isWarning: Boolean(row.isWarning),
			state: row.state === "review" ? "review" : "new",
			intervalDays: row.intervalDays,
			dueAt: row.dueAt,
			lapses: row.lapses,
		})),
	};
}

/**
 * Loads the distractor pool across all live words in decks belonging to classes
 * where `studentId` has an active enrollment in `orgId` (per docs/srs-spec.md §4).
 */
export async function loadPool(
	db: Db,
	studentId: string,
	orgId: string,
): Promise<VocabPoolItem[]> {
	const rows = await db
		.select({
			wordId: vocabWord.id,
			word: vocabWord.word,
			translation: vocabWord.translation,
			lang: vocabDeck.lang,
			deckId: vocabDeck.id,
		})
		.from(vocabWord)
		.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
		.innerJoin(
			enrollment,
			and(
				eq(enrollment.classId, vocabDeck.classId),
				eq(enrollment.orgId, vocabDeck.orgId),
			),
		)
		.where(
			and(
				eq(vocabDeck.orgId, orgId),
				eq(enrollment.studentId, studentId),
				eq(enrollment.status, "active"),
			),
		)
		.orderBy(
			asc(vocabDeck.createdAt),
			asc(vocabWord.sortOrder),
			asc(vocabWord.id),
		);

	return rows;
}
