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
	vocabLibraryCourse,
	vocabLibraryDeck,
	vocabLibraryWord,
	vocabSuggestion,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Db } from "../app";

/**
 * Fixed anchor timestamp for library deck card `dueAt` ordering (#366 RT-F5).
 * Does not depend on `vocabLibraryDeck.createdAt` (which is reset on `seedVocabLibrary --prune`).
 */
export const LIBRARY_DECK_BASE_MS = 1_700_000_000_000;

/** Max `vocab_card` rows per INSERT statement (10 * 9 = 90 < 100 D1 SQL variable limit — #366 RT-F2). */
export const MAX_CARD_INSERT_CHUNK = 10;

/** Max `deckId` items per `inArray` SELECT query (50 + 1 = 51 < 100 D1 SQL variable limit — #366 RT-F2). */
export const MAX_DECK_QUERY_CHUNK = 50;

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
	if (items.length === 0) return [];
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += chunkSize) {
		chunks.push(items.slice(i, i + chunkSize));
	}
	return chunks;
}

export interface EnsuredDeckSession {
	deck: VocabSessionDeck;
	cards: VocabSessionCard[];
}

export interface AccessibleStudentDeck {
	deckId: string;
	title: string;
	classId: string | null;
	className: string;
	source: "class" | "suggested" | "library";
	createdAt: Date;
	sortOrder?: number;
}

export interface AccessibleDeckWordRow {
	id: string;
	deckId: string;
}

export interface AccessibleDeckCardRow {
	id: string;
	wordId: string;
	deckId: string;
	level: number;
	isWarning: boolean;
	state: "new" | "review";
	dueAt: number;
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
	const [enrolledRows, suggestedRows, libraryRows] = await Promise.all([
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
		db
			.select({
				deckId: vocabLibraryDeck.id,
				title: vocabLibraryDeck.title,
				courseName: vocabLibraryCourse.name,
				sortOrder: vocabLibraryDeck.sortOrder,
				firstCardCreatedAt: sql<number>`min(${vocabCard.createdAt})`,
			})
			.from(vocabCard)
			.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
			.innerJoin(
				vocabLibraryDeck,
				eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
			)
			.innerJoin(
				vocabLibraryCourse,
				eq(vocabLibraryDeck.courseId, vocabLibraryCourse.id),
			)
			.where(eq(vocabCard.studentId, studentId))
			.groupBy(
				vocabLibraryDeck.id,
				vocabLibraryDeck.title,
				vocabLibraryCourse.name,
				vocabLibraryDeck.sortOrder,
			)
			.orderBy(
				asc(sql`min(${vocabCard.createdAt})`),
				asc(vocabLibraryDeck.sortOrder),
				asc(vocabLibraryDeck.id),
			),
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
	for (const row of libraryRows) {
		if (byId.has(row.deckId)) continue;
		const firstMs = Number(row.firstCardCreatedAt);
		byId.set(row.deckId, {
			deckId: row.deckId,
			title: row.title,
			classId: null,
			className: row.courseName,
			source: "library",
			createdAt: new Date(
				Number.isFinite(firstMs) && firstMs > 0
					? firstMs
					: LIBRARY_DECK_BASE_MS,
			),
			sortOrder: row.sortOrder,
		});
	}

	return Array.from(byId.values()).sort((a, b) => {
		const diff = a.createdAt.getTime() - b.createdAt.getTime();
		if (diff !== 0) return diff;
		const sortDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
		if (sortDiff !== 0) return sortDiff;
		return a.deckId.localeCompare(b.deckId);
	});
}

/**
 * Loads words and student cards across both org decks (`vocab_deck`/`vocab_word`)
 * and library decks (`vocab_library_deck`/`vocab_library_word`), chunked by
 * `<= 50` deck IDs per query so no SQL statement exceeds 51 bound parameters on D1 (#366 RT-F2).
 */
export async function loadWordsAndCardsForAccessibleDecks(
	db: Db,
	studentId: string,
	accessibleDecks: readonly AccessibleStudentDeck[],
): Promise<{
	words: AccessibleDeckWordRow[];
	cards: AccessibleDeckCardRow[];
}> {
	const orgDeckIds = accessibleDecks
		.filter((d) => d.source !== "library")
		.map((d) => d.deckId);
	const libDeckIds = accessibleDecks
		.filter((d) => d.source === "library")
		.map((d) => d.deckId);

	const words: AccessibleDeckWordRow[] = [];
	const cards: AccessibleDeckCardRow[] = [];

	for (const chunk of chunkArray(orgDeckIds, MAX_DECK_QUERY_CHUNK)) {
		const [wRows, cRows] = await Promise.all([
			db
				.select({
					id: vocabWord.id,
					deckId: vocabWord.deckId,
				})
				.from(vocabWord)
				.where(inArray(vocabWord.deckId, chunk)),
			db
				.select({
					id: vocabCard.id,
					wordId: vocabCard.wordId,
					deckId: vocabWord.deckId,
					level: vocabCard.level,
					isWarning: vocabCard.isWarning,
					state: vocabCard.state,
					dueAt: vocabCard.dueAt,
				})
				.from(vocabCard)
				.innerJoin(vocabWord, eq(vocabCard.wordId, vocabWord.id))
				.where(
					and(
						eq(vocabCard.studentId, studentId),
						inArray(vocabWord.deckId, chunk),
					),
				),
		]);
		words.push(...wRows);
		for (const c of cRows) {
			cards.push({
				id: c.id,
				wordId: c.wordId,
				deckId: c.deckId,
				level: c.level,
				isWarning: Boolean(c.isWarning),
				state: c.state === "review" ? "review" : "new",
				dueAt: c.dueAt,
			});
		}
	}

	for (const chunk of chunkArray(libDeckIds, MAX_DECK_QUERY_CHUNK)) {
		const [wRows, cRows] = await Promise.all([
			db
				.select({
					id: vocabLibraryWord.id,
					deckId: vocabLibraryWord.deckId,
				})
				.from(vocabLibraryWord)
				.where(inArray(vocabLibraryWord.deckId, chunk)),
			db
				.select({
					id: vocabCard.id,
					wordId: vocabCard.wordId,
					deckId: vocabLibraryWord.deckId,
					level: vocabCard.level,
					isWarning: vocabCard.isWarning,
					state: vocabCard.state,
					dueAt: vocabCard.dueAt,
				})
				.from(vocabCard)
				.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
				.where(
					and(
						eq(vocabCard.studentId, studentId),
						inArray(vocabLibraryWord.deckId, chunk),
					),
				),
		]);
		words.push(...wRows);
		for (const c of cRows) {
			cards.push({
				id: c.id,
				wordId: c.wordId,
				deckId: c.deckId,
				level: c.level,
				isWarning: Boolean(c.isWarning),
				state: c.state === "review" ? "review" : "new",
				dueAt: c.dueAt,
			});
		}
	}

	return { words, cards };
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
	if (!deckId.startsWith("libdeck-")) {
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

		if (deckRow) {
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
				const cardValues = words.map((w, idx) => ({
					id: crypto.randomUUID(),
					studentId,
					wordId: w.id,
					level: 1,
					isWarning: false,
					state: "new" as const,
					intervalDays: 0,
					dueAt: baseMs - (n - 1) + idx,
					lapses: 0,
				}));

				for (const chunk of chunkArray(cardValues, MAX_CARD_INSERT_CHUNK)) {
					await db
						.insert(vocabCard)
						.values(chunk)
						.onConflictDoNothing({
							target: [vocabCard.studentId, vocabCard.wordId],
						});
				}
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
	}

	const [libDeck] = await db
		.select({
			id: vocabLibraryDeck.id,
			title: vocabLibraryDeck.title,
		})
		.from(vocabLibraryDeck)
		.where(eq(vocabLibraryDeck.id, deckId))
		.limit(1);
	if (!libDeck) return null;

	const libWords = await db
		.select({
			id: vocabLibraryWord.id,
			word: vocabLibraryWord.word,
			translation: vocabLibraryWord.translation,
			ipa: vocabLibraryWord.ipa,
			audioUrl: vocabLibraryWord.audioUrl,
			sortOrder: vocabLibraryWord.sortOrder,
		})
		.from(vocabLibraryWord)
		.where(eq(vocabLibraryWord.deckId, deckId))
		.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id));

	if (libWords.length > 0) {
		const n = libWords.length;
		const cardValues = libWords.map((w, idx) => ({
			id: crypto.randomUUID(),
			studentId,
			wordId: w.id,
			level: 1,
			isWarning: false,
			state: "new" as const,
			intervalDays: 0,
			dueAt: LIBRARY_DECK_BASE_MS - (n - 1) + idx,
			lapses: 0,
		}));

		for (const chunk of chunkArray(cardValues, MAX_CARD_INSERT_CHUNK)) {
			await db
				.insert(vocabCard)
				.values(chunk)
				.onConflictDoNothing({
					target: [vocabCard.studentId, vocabCard.wordId],
				});
		}
	}

	const libRows = await db
		.select({
			id: vocabCard.id,
			wordId: vocabLibraryWord.id,
			word: vocabLibraryWord.word,
			translation: vocabLibraryWord.translation,
			ipa: vocabLibraryWord.ipa,
			audioUrl: vocabLibraryWord.audioUrl,
			level: vocabCard.level,
			isWarning: vocabCard.isWarning,
			state: vocabCard.state,
			intervalDays: vocabCard.intervalDays,
			dueAt: vocabCard.dueAt,
			lapses: vocabCard.lapses,
		})
		.from(vocabCard)
		.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
		.where(
			and(
				eq(vocabCard.studentId, studentId),
				eq(vocabLibraryWord.deckId, deckId),
			),
		)
		.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id));

	return {
		deck: {
			id: libDeck.id,
			title: libDeck.title,
			lang: "en",
		},
		cards: libRows.map((row) => ({
			id: row.id,
			wordId: row.wordId,
			word: row.word,
			translation: row.translation,
			ipa: row.ipa ?? null,
			audioKey: null,
			hasAudio: row.audioUrl !== null && row.audioUrl.trim().length > 0,
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
 * Loads the distractor pool across live words in decks accessible to
 * `studentId` in `orgId` plus library words already provisioned for `studentId`
 * (with same-course fallback and deduplication by `(word, translation)` — #366 RT-F6).
 */
export async function loadPool(
	db: Db,
	studentId: string,
	orgId: string,
	currentDeckId?: string,
): Promise<VocabPoolItem[]> {
	const pool: VocabPoolItem[] = [];
	const seenWordIds = new Set<string>();
	const seenPairs = new Set<string>();

	const pushItem = (item: VocabPoolItem, allowDuplicatePair = false) => {
		if (seenWordIds.has(item.wordId)) return;
		const pairKey = `${item.word.trim().toLowerCase()}::${item.translation.trim().toLowerCase()}`;
		if (!allowDuplicatePair && seenPairs.has(pairKey)) return;
		seenWordIds.add(item.wordId);
		seenPairs.add(pairKey);
		pool.push(item);
	};

	let currentCourseId: string | null = null;

	if (currentDeckId) {
		if (currentDeckId.startsWith("libdeck-")) {
			const [deckMeta, currentLibWords] = await Promise.all([
				db
					.select({ courseId: vocabLibraryDeck.courseId })
					.from(vocabLibraryDeck)
					.where(eq(vocabLibraryDeck.id, currentDeckId))
					.limit(1),
				db
					.select({
						wordId: vocabLibraryWord.id,
						word: vocabLibraryWord.word,
						translation: vocabLibraryWord.translation,
						deckId: vocabLibraryWord.deckId,
					})
					.from(vocabLibraryWord)
					.where(eq(vocabLibraryWord.deckId, currentDeckId))
					.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id)),
			]);
			currentCourseId = deckMeta[0]?.courseId ?? null;
			for (const row of currentLibWords) {
				pushItem(
					{
						wordId: row.wordId,
						word: row.word,
						translation: row.translation,
						lang: "en",
						deckId: row.deckId,
					},
					true,
				);
			}
		} else {
			const currentOrgWords = await db
				.select({
					wordId: vocabWord.id,
					word: vocabWord.word,
					translation: vocabWord.translation,
					lang: vocabDeck.lang,
					deckId: vocabDeck.id,
				})
				.from(vocabWord)
				.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
				.where(
					and(
						eq(vocabDeck.id, currentDeckId),
						studentCanAccessDeckCondition(studentId, orgId),
					),
				)
				.orderBy(asc(vocabWord.sortOrder), asc(vocabWord.id));
			for (const row of currentOrgWords) {
				pushItem(row, true);
			}
		}
	}

	const [orgDistractors, libDistractors] = await Promise.all([
		db
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
			)
			.limit(100),
		db
			.select({
				wordId: vocabLibraryWord.id,
				word: vocabLibraryWord.word,
				translation: vocabLibraryWord.translation,
				deckId: vocabLibraryWord.deckId,
			})
			.from(vocabCard)
			.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
			.where(eq(vocabCard.studentId, studentId))
			.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id))
			.limit(100),
	]);

	let extraCount = 0;
	for (const row of orgDistractors) {
		if (extraCount >= 100) break;
		const before = pool.length;
		pushItem(row);
		if (pool.length > before) extraCount += 1;
	}
	for (const row of libDistractors) {
		if (extraCount >= 100) break;
		const before = pool.length;
		pushItem({
			wordId: row.wordId,
			word: row.word,
			translation: row.translation,
			lang: "en",
			deckId: row.deckId,
		});
		if (pool.length > before) extraCount += 1;
	}

	if (currentCourseId && pool.length < 20) {
		const courseFallbackWords = await db
			.select({
				wordId: vocabLibraryWord.id,
				word: vocabLibraryWord.word,
				translation: vocabLibraryWord.translation,
				deckId: vocabLibraryWord.deckId,
			})
			.from(vocabLibraryWord)
			.innerJoin(
				vocabLibraryDeck,
				eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
			)
			.where(eq(vocabLibraryDeck.courseId, currentCourseId))
			.orderBy(
				asc(vocabLibraryDeck.sortOrder),
				asc(vocabLibraryWord.sortOrder),
				asc(vocabLibraryWord.id),
			)
			.limit(50);
		for (const row of courseFallbackWords) {
			if (extraCount >= 100) break;
			const before = pool.length;
			pushItem({
				wordId: row.wordId,
				word: row.word,
				translation: row.translation,
				lang: "en",
				deckId: row.deckId,
			});
			if (pool.length > before) extraCount += 1;
		}
	}

	return pool;
}
