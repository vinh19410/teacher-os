import type {
	VocabPoolItem,
	VocabSessionCard,
	VocabSessionDeck,
} from "@teacher-os/api/contracts";
import {
	classTable,
	enrollment,
	vocabCard,
	vocabDeck,
	vocabSuggestion,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "../app";

export interface EnsuredDeckSession {
	deck: VocabSessionDeck;
	cards: VocabSessionCard[];
}

export interface AccessibleStudentDeck {
	deckId: string;
	title: string;
	classId: string | null;
	className: string;
	source: "class" | "suggested";
	createdAt: Date;
}

/**
 * Single-source SQL access predicate (#363 RT-F1) shared across all 5 student
 * vocab call sites: overview, loadOwnedSessionCard (answer + learn-commit),
 * audio, ensureDeckCards, and loadPool.
 *
 * A student can access `vocabDeck` iff:
 * - `vocabDeck.orgId === orgId`, AND
 * - (`vocabDeck.classId IS NOT NULL` and student has an `'active'` enrollment in that class)
 *   OR student has an `'accepted'` `vocab_suggestion` for that deck.
 */
export function studentCanAccessDeckCondition(
	studentId: string,
	orgId: string,
) {
	return and(
		eq(vocabDeck.orgId, orgId),
		or(
			and(
				isNotNull(vocabDeck.classId),
				sql`EXISTS (
					SELECT 1 FROM ${enrollment}
					WHERE ${enrollment.classId} = ${vocabDeck.classId}
					  AND ${enrollment.orgId} = ${vocabDeck.orgId}
					  AND ${enrollment.studentId} = ${studentId}
					  AND ${enrollment.status} = 'active'
				)`,
			),
			sql`EXISTS (
				SELECT 1 FROM ${vocabSuggestion}
				WHERE ${vocabSuggestion.deckId} = ${vocabDeck.id}
				  AND ${vocabSuggestion.orgId} = ${vocabDeck.orgId}
				  AND ${vocabSuggestion.studentId} = ${studentId}
				  AND ${vocabSuggestion.status} = 'accepted'
			)`,
		),
	);
}

/**
 * Loads all decks accessible to `studentId` in `orgId` (enrolled union accepted
 * suggestions), deduplicated by `deckId` with source precedence `'class' > 'suggested'`
 * (#363 RT-F7).
 */
export async function loadStudentAccessibleDecks(
	db: Db,
	studentId: string,
	orgId: string,
): Promise<AccessibleStudentDeck[]> {
	const [enrolledRows, suggestedRows] = await Promise.all([
		db
			.select({
				deckId: vocabDeck.id,
				title: vocabDeck.title,
				classId: vocabDeck.classId,
				className: classTable.name,
				createdAt: vocabDeck.createdAt,
			})
			.from(vocabDeck)
			.innerJoin(classTable, eq(vocabDeck.classId, classTable.id))
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
			.orderBy(asc(vocabDeck.createdAt), asc(vocabDeck.id)),
		db
			.select({
				deckId: vocabDeck.id,
				title: vocabDeck.title,
				classId: vocabDeck.classId,
				createdAt: vocabDeck.createdAt,
			})
			.from(vocabDeck)
			.innerJoin(
				vocabSuggestion,
				and(
					eq(vocabSuggestion.deckId, vocabDeck.id),
					eq(vocabSuggestion.orgId, vocabDeck.orgId),
				),
			)
			.where(
				and(
					eq(vocabDeck.orgId, orgId),
					eq(vocabSuggestion.studentId, studentId),
					eq(vocabSuggestion.status, "accepted"),
				),
			)
			.orderBy(asc(vocabDeck.createdAt), asc(vocabDeck.id)),
	]);

	const byId = new Map<string, AccessibleStudentDeck>();
	for (const row of enrolledRows) {
		byId.set(row.deckId, {
			deckId: row.deckId,
			title: row.title,
			classId: row.classId,
			className: row.className,
			source: "class",
			createdAt: row.createdAt,
		});
	}
	for (const row of suggestedRows) {
		if (byId.has(row.deckId)) continue;
		byId.set(row.deckId, {
			deckId: row.deckId,
			title: row.title,
			classId: row.classId,
			className: "",
			source: "suggested",
			createdAt: row.createdAt,
		});
	}

	return Array.from(byId.values()).sort((a, b) => {
		const diff = a.createdAt.getTime() - b.createdAt.getTime();
		if (diff !== 0) return diff;
		return a.deckId.localeCompare(b.deckId);
	});
}

/**
 * Verifies that `studentId` can access `deckId` (enrolled OR accepted suggestion)
 * within `orgId`, then lazy-provisions any missing `vocab_card` rows for that
 * deck's words using `deck.createdAt` as the stable timestamp anchor:
 *   `dueAt = baseMs - (n - 1) + i`
 * (red-team F1 + F8).
 *
 * Returns `null` when the deck does not exist or the student cannot access it.
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
		.where(
			and(
				eq(vocabDeck.id, deckId),
				studentCanAccessDeckCondition(studentId, orgId),
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
 * Loads the distractor pool across all live words in decks accessible to
 * `studentId` in `orgId` (enrolled OR accepted suggestion, per docs/srs-spec.md §4 + #363 RT-F1).
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
		.where(studentCanAccessDeckCondition(studentId, orgId))
		.orderBy(
			asc(vocabDeck.createdAt),
			asc(vocabWord.sortOrder),
			asc(vocabWord.id),
		);

	return rows;
}
