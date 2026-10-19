import {
	VOCAB_ERROR_CODES,
	vocabLibraryCloneSchema,
} from "@teacher-os/api/contracts";
import {
	classTable,
	vocabDeck,
	vocabLibraryCourse,
	vocabLibraryDeck,
	vocabLibraryWord,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { Hono } from "hono";
import { z } from "zod";
import type { Db, KernelCtx } from "../app";

type Env = { Variables: { kernelCtx: KernelCtx } };

const MAX_CLONE_DECKS = 50;
const MAX_CLONE_STATEMENTS = 500;
const DEFAULT_WORDS_PREVIEW_LIMIT = 20;
const MAX_WORDS_PREVIEW_LIMIT = 50;

const cloneRawEnvelopeSchema = z
	.object({
		classId: z.string().min(1).nullable().optional().default(null),
		deckIds: z.array(z.string().min(1)).min(1),
	})
	.strict();
/**
 * Built-in Vocabulary Library sub-router (#361).
 * - Mounted at `/api/kernel/vocab-library`.
 * - Every route enforces `if (!ctx) return 401` because `bootstrapMiddleware`
 *   lets unauthenticated requests fall through to route handlers.
 * - Browse endpoints (`GET /courses`, `GET /courses/:courseId/decks`,
 *   `GET /decks/:deckId/words`) are intentionally global across all authenticated
 *   teacher orgs.
 * - `POST /clone` is org-scoped: verifies `classId` belongs to `ctx.orgId`
 *   before touching any library table, enforces deduplication and statement caps,
 *   and writes cloned `vocab_deck` + `vocab_word` rows in a single `db.batch`.
 */
export function vocabLibraryRoutes(deps: { getDb(): Db }) {
	const routes = new Hono<Env>();

	routes.get("/courses", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const db = deps.getDb();

		const [courses, deckCounts] = await Promise.all([
			db
				.select()
				.from(vocabLibraryCourse)
				.orderBy(asc(vocabLibraryCourse.sortOrder), asc(vocabLibraryCourse.id)),
			db
				.select({
					courseId: vocabLibraryDeck.courseId,
					count: sql<number>`count(*)`,
				})
				.from(vocabLibraryDeck)
				.groupBy(vocabLibraryDeck.courseId),
		]);

		const countByCourse = new Map<string, number>();
		for (const row of deckCounts) {
			countByCourse.set(row.courseId, Number(row.count));
		}

		return c.json({
			courses: courses.map((course) => ({
				id: course.id,
				name: course.name,
				description: course.description ?? null,
				target: course.target ?? null,
				deckCount: countByCourse.get(course.id) ?? 0,
				sortOrder: course.sortOrder,
			})),
		});
	});

	routes.get("/courses/:courseId/decks", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const courseId = c.req.param("courseId");
		const db = deps.getDb();

		const [course] = await db
			.select({ id: vocabLibraryCourse.id })
			.from(vocabLibraryCourse)
			.where(eq(vocabLibraryCourse.id, courseId))
			.limit(1);

		if (!course) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_COURSE_NOT_FOUND,
					code: VOCAB_ERROR_CODES.LIBRARY_COURSE_NOT_FOUND,
				},
				404,
			);
		}

		const decks = await db
			.select()
			.from(vocabLibraryDeck)
			.where(eq(vocabLibraryDeck.courseId, courseId))
			.orderBy(asc(vocabLibraryDeck.sortOrder), asc(vocabLibraryDeck.id));

		const countByDeck = new Map<string, number>();
		if (decks.length > 0) {
			const wordCounts = await db
				.select({
					deckId: vocabLibraryWord.deckId,
					count: sql<number>`count(*)`,
				})
				.from(vocabLibraryWord)
				.innerJoin(
					vocabLibraryDeck,
					eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
				)
				.where(eq(vocabLibraryDeck.courseId, courseId))
				.groupBy(vocabLibraryWord.deckId);
			for (const row of wordCounts) {
				countByDeck.set(row.deckId, Number(row.count));
			}
		}

		return c.json({
			decks: decks.map((deck) => ({
				id: deck.id,
				courseId: deck.courseId,
				title: deck.title,
				description: deck.description ?? null,
				imageUrl: deck.imageUrl ?? null,
				wordCount: countByDeck.get(deck.id) ?? 0,
				sortOrder: deck.sortOrder,
			})),
		});
	});

	routes.get("/decks/:deckId/words", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const deckId = c.req.param("deckId");
		const db = deps.getDb();

		const [deck] = await db
			.select({
				id: vocabLibraryDeck.id,
				title: vocabLibraryDeck.title,
			})
			.from(vocabLibraryDeck)
			.where(eq(vocabLibraryDeck.id, deckId))
			.limit(1);

		if (!deck) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
					code: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
				},
				404,
			);
		}

		const rawLimit = Number.parseInt(c.req.query("limit") ?? "", 10);
		const limit = Number.isFinite(rawLimit)
			? Math.min(Math.max(1, rawLimit), MAX_WORDS_PREVIEW_LIMIT)
			: DEFAULT_WORDS_PREVIEW_LIMIT;

		const rawOffset = Number.parseInt(c.req.query("offset") ?? "", 10);
		const offset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

		const words = await db
			.select()
			.from(vocabLibraryWord)
			.where(eq(vocabLibraryWord.deckId, deckId))
			.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id))
			.limit(limit)
			.offset(offset);

		return c.json({
			deck: {
				id: deck.id,
				title: deck.title,
			},
			words: words.map((w) => ({
				id: w.id,
				word: w.word,
				ipa: w.ipa ?? null,
				pos: w.pos ?? null,
				translation: w.translation,
				sentenceVi: w.sentenceVi ?? null,
				sentenceEn: w.sentenceEn ?? null,
				pictureUrl: w.pictureUrl ?? null,
				audioUrl: w.audioUrl ?? null,
				sortOrder: w.sortOrder,
			})),
		});
	});

	routes.post("/clone", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}

		const baseParsed = cloneRawEnvelopeSchema.safeParse(raw);
		if (!baseParsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { classId, deckIds } = baseParsed.data;
		const uniqueDeckIds = [...new Set(deckIds)];
		if (uniqueDeckIds.length !== deckIds.length) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_CLONE_DUPLICATE_DECK,
					code: VOCAB_ERROR_CODES.LIBRARY_CLONE_DUPLICATE_DECK,
				},
				400,
			);
		}

		const db = deps.getDb();

		// IDOR guard first: when classId is provided, verify target class belongs to caller's org before querying library tables.
		if (classId !== null) {
			const [cls] = await db
				.select({ id: classTable.id })
				.from(classTable)
				.where(and(eq(classTable.id, classId), eq(classTable.orgId, ctx.orgId)))
				.limit(1);

			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}
		}
		if (
			uniqueDeckIds.length > MAX_CLONE_DECKS ||
			!vocabLibraryCloneSchema.safeParse(baseParsed.data).success
		) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
					code: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
				},
				422,
			);
		}

		const libDecks = await db
			.select()
			.from(vocabLibraryDeck)
			.where(inArray(vocabLibraryDeck.id, uniqueDeckIds))
			.orderBy(asc(vocabLibraryDeck.sortOrder), asc(vocabLibraryDeck.id));

		if (libDecks.length !== uniqueDeckIds.length) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
					code: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
				},
				404,
			);
		}

		const libWords = await db
			.select()
			.from(vocabLibraryWord)
			.where(inArray(vocabLibraryWord.deckId, uniqueDeckIds))
			.orderBy(asc(vocabLibraryWord.sortOrder), asc(vocabLibraryWord.id));

		if (
			libDecks.length > MAX_CLONE_DECKS ||
			libDecks.length + libWords.length > MAX_CLONE_STATEMENTS
		) {
			return c.json(
				{
					error: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
					code: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
				},
				422,
			);
		}

		const existingDecks = await db
			.select({ sourceLibraryDeckId: vocabDeck.sourceLibraryDeckId })
			.from(vocabDeck)
			.where(
				and(
					classId === null
						? isNull(vocabDeck.classId)
						: eq(vocabDeck.classId, classId),
					eq(vocabDeck.orgId, ctx.orgId),
					inArray(vocabDeck.sourceLibraryDeckId, uniqueDeckIds),
				),
			);
		const duplicates = [
			...new Set(
				existingDecks
					.map((d) => d.sourceLibraryDeckId)
					.filter((id): id is string => id !== null),
			),
		];

		const now = new Date();
		const deckIdMap = new Map<string, string>();
		for (const libDeck of libDecks) {
			deckIdMap.set(libDeck.id, crypto.randomUUID());
		}

		const firstLibDeck = libDecks[0];
		const firstDeckId = firstLibDeck
			? (deckIdMap.get(firstLibDeck.id) ?? "")
			: "";

		const batchOps: BatchItem<"sqlite">[] = [
			...libDecks.map((libDeck) =>
				db.insert(vocabDeck).values({
					id: deckIdMap.get(libDeck.id) ?? crypto.randomUUID(),
					orgId: ctx.orgId,
					classId,
					title: libDeck.title,
					lang: "en",
					sourceLibraryDeckId: libDeck.id,
					createdAt: now,
					updatedAt: now,
				}),
			),
			...libWords.map((libWord) =>
				db.insert(vocabWord).values({
					id: crypto.randomUUID(),
					deckId: deckIdMap.get(libWord.deckId) ?? "",
					word: libWord.word,
					ipa: libWord.ipa ?? null,
					translation: libWord.translation,
					audioKey: null,
					audioUrl: libWord.audioUrl ?? null,
					sortOrder: libWord.sortOrder,
					createdAt: now,
					updatedAt: now,
				}),
			),
		];

		await db.batch(batchOps as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

		return c.json(
			{
				id: firstDeckId,
				updated: libDecks.length,
				duplicates,
			},
			201,
		);
	});

	return routes;
}
