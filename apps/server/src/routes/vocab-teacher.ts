import {
	type CreatedResponse,
	QUIZ_MEDIA_MAX_BYTES,
	VOCAB_ERROR_CODES,
	type VocabStudentProgressResponse,
	type VocabTeacherSuggestionsResponse,
	vocabDeckCreateSchema,
	vocabDeckDeleteSchema,
	vocabDeckRenameSchema,
	vocabRevokeSuggestionSchema,
	vocabSuggestDeckSchema,
	vocabWordRemoveSchema,
	vocabWordUpsertSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	classTable,
	student,
	vocabCard,
	vocabDeck,
	vocabReviewLog,
	vocabSuggestion,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import type { Db, KernelCtx } from "../app";
import { mediaObjectResponse } from "../lib/media-response";
import { MediaSizeMismatchError, type MediaStore } from "../lib/media-store";
import {
	loadStudentAccessibleDecks,
	loadWordsAndCardsForAccessibleDecks,
} from "../lib/vocab-provision";

type Env = { Variables: { kernelCtx: KernelCtx } };
type VocabTeacherContext = Context<Env>;

const ALLOWED_AUDIO_MIMES: Record<string, true> = {
	"audio/mpeg": true,
	"audio/mp3": true,
	"audio/mp4": true,
	"audio/x-m4a": true,
	"audio/aac": true,
	"audio/wav": true,
	"audio/x-wav": true,
	"audio/webm": true,
	"audio/ogg": true,
};

/**
 * Teacher vocabulary CRUD & audio upload sub-router (#359).
 * Mounted inside `kernelRoutes` so Origin + JSON POST CSRF guards and
 * teacher role checks cover all routes.
 */
export function vocabTeacherRoutes(deps: {
	getDb(): Db;
	getMediaStore?(): MediaStore | undefined;
}) {
	const routes = new Hono<Env>();

	async function readBody<S extends z.ZodType>(
		c: VocabTeacherContext,
		schema: S,
	): Promise<
		{ ok: true; data: z.infer<S> } | { ok: false; response: Response }
	> {
		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return { ok: false, response: c.json({ error: "invalid json" }, 400) };
		}
		const parsed = schema.safeParse(raw);
		if (!parsed.success) {
			return { ok: false, response: c.json({ error: "invalid body" }, 400) };
		}
		return { ok: true, data: parsed.data };
	}

	routes.get("/decks/:deckId/words", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const deckId = c.req.param("deckId");
		const db = deps.getDb();

		const [deck] = await db
			.select({ id: vocabDeck.id })
			.from(vocabDeck)
			.where(and(eq(vocabDeck.id, deckId), eq(vocabDeck.orgId, ctx.orgId)))
			.limit(1);

		if (!deck) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}

		const words = await db
			.select({
				id: vocabWord.id,
				deckId: vocabWord.deckId,
				word: vocabWord.word,
				ipa: vocabWord.ipa,
				translation: vocabWord.translation,
				audioKey: vocabWord.audioKey,
				audioUrl: vocabWord.audioUrl,
				sortOrder: vocabWord.sortOrder,
			})
			.from(vocabWord)
			.where(eq(vocabWord.deckId, deckId))
			.orderBy(
				asc(vocabWord.sortOrder),
				asc(vocabWord.createdAt),
				asc(vocabWord.id),
			);

		return c.json({
			words: words.map((w) => ({
				id: w.id,
				deckId: w.deckId,
				word: w.word,
				ipa: w.ipa ?? null,
				translation: w.translation,
				audioKey: w.audioKey ?? null,
				audioUrl: w.audioUrl ?? null,
				sortOrder: w.sortOrder,
			})),
		});
	});

	routes.post("/decks", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabDeckCreateSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		if (body.data.classId !== null) {
			const [cls] = await db
				.select({ id: classTable.id })
				.from(classTable)
				.where(
					and(
						eq(classTable.id, body.data.classId),
						eq(classTable.orgId, ctx.orgId),
					),
				)
				.limit(1);
			if (!cls) {
				return c.json({ error: "class not found" }, 404);
			}
		}
		const id = body.data.id ?? crypto.randomUUID();
		const now = new Date();
		const [created] = await db
			.insert(vocabDeck)
			.values({
				id,
				orgId: ctx.orgId,
				classId: body.data.classId,
				title: body.data.title,
				lang: body.data.lang,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: vocabDeck.id });

		if (!created) return c.json({ error: "deck write conflict" }, 500);
		return c.json<CreatedResponse>(created, 201);
	});

	routes.post("/decks/rename", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabDeckRenameSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const updates: Partial<typeof vocabDeck.$inferInsert> = {
			title: body.data.title,
			updatedAt: new Date(),
		};
		if (body.data.lang !== undefined) {
			updates.lang = body.data.lang;
		}

		const updated = await db
			.update(vocabDeck)
			.set(updates)
			.where(
				and(eq(vocabDeck.id, body.data.deckId), eq(vocabDeck.orgId, ctx.orgId)),
			)
			.returning({ id: vocabDeck.id });

		if (!updated[0]) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}
		return c.json({ id: body.data.deckId } satisfies CreatedResponse);
	});

	/**
	 * Deletes `vocab_card + vocab_word + vocab_deck` explicitly in ONE `db.batch`
	 * (red-team F7: never rely on SQLite FK cascade across connections), while
	 * preserving `vocab_review_log` rows for student streak/retention history.
	 */
	routes.post("/decks/delete", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabDeckDeleteSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [deck] = await db
			.select({ id: vocabDeck.id })
			.from(vocabDeck)
			.where(
				and(eq(vocabDeck.id, body.data.deckId), eq(vocabDeck.orgId, ctx.orgId)),
			)
			.limit(1);
		if (!deck) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}

		const words = await db
			.select({ id: vocabWord.id })
			.from(vocabWord)
			.where(eq(vocabWord.deckId, deck.id));
		const wordIds = words.map((w) => w.id);

		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] =
			wordIds.length > 0
				? [
						db
							.delete(vocabCard)
							.where(
								and(
									sql`${vocabCard.wordId} NOT LIKE 'libword-%'`,
									sql`${vocabCard.wordId} IN (SELECT ${vocabWord.id} FROM ${vocabWord} WHERE ${vocabWord.deckId} = ${deck.id})`,
								),
							),
						db
							.delete(vocabSuggestion)
							.where(eq(vocabSuggestion.deckId, deck.id)),
						db.delete(vocabWord).where(eq(vocabWord.deckId, deck.id)),
						db
							.delete(vocabDeck)
							.where(
								and(eq(vocabDeck.id, deck.id), eq(vocabDeck.orgId, ctx.orgId)),
							),
					]
				: [
						db
							.delete(vocabSuggestion)
							.where(eq(vocabSuggestion.deckId, deck.id)),
						db.delete(vocabWord).where(eq(vocabWord.deckId, deck.id)),
						db
							.delete(vocabDeck)
							.where(
								and(eq(vocabDeck.id, deck.id), eq(vocabDeck.orgId, ctx.orgId)),
							),
					];

		await db.batch(statements);
		return c.json({ id: deck.id } satisfies CreatedResponse);
	});

	routes.get("/decks/:deckId/suggestions", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const deckId = c.req.param("deckId");
		const db = deps.getDb();

		const [deck] = await db
			.select({ id: vocabDeck.id })
			.from(vocabDeck)
			.where(and(eq(vocabDeck.id, deckId), eq(vocabDeck.orgId, ctx.orgId)))
			.limit(1);
		if (!deck) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}

		const rows = await db
			.select({
				id: vocabSuggestion.id,
				deckId: vocabSuggestion.deckId,
				studentId: vocabSuggestion.studentId,
				note: vocabSuggestion.note,
				status: vocabSuggestion.status,
				createdAt: vocabSuggestion.createdAt,
				respondedAt: vocabSuggestion.respondedAt,
			})
			.from(vocabSuggestion)
			.where(
				and(
					eq(vocabSuggestion.deckId, deckId),
					eq(vocabSuggestion.orgId, ctx.orgId),
				),
			)
			.orderBy(asc(vocabSuggestion.createdAt), asc(vocabSuggestion.id));

		const response: VocabTeacherSuggestionsResponse = {
			suggestions: rows.map((row) => ({
				id: row.id,
				deckId: row.deckId,
				studentId: row.studentId,
				note: row.note ?? null,
				status:
					row.status === "accepted" || row.status === "dismissed"
						? row.status
						: "pending",
				createdAt:
					row.createdAt instanceof Date
						? row.createdAt.toISOString()
						: new Date(row.createdAt).toISOString(),
				respondedAt:
					row.respondedAt instanceof Date
						? row.respondedAt.toISOString()
						: row.respondedAt
							? new Date(row.respondedAt).toISOString()
							: null,
			})),
		};
		return c.json(response);
	});

	routes.post("/suggestions", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabSuggestDeckSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [[deck], [st]] = await Promise.all([
			db
				.select({ id: vocabDeck.id })
				.from(vocabDeck)
				.where(
					and(
						eq(vocabDeck.id, body.data.deckId),
						eq(vocabDeck.orgId, ctx.orgId),
					),
				)
				.limit(1),
			db
				.select({ id: student.id })
				.from(student)
				.where(
					and(
						eq(student.id, body.data.studentId),
						eq(student.orgId, ctx.orgId),
					),
				)
				.limit(1),
		]);

		if (!deck) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}
		if (!st) {
			return c.json({ error: "student not found" }, 404);
		}

		const note =
			body.data.note && body.data.note.length > 0 ? body.data.note : null;

		const [existing] = await db
			.select({
				id: vocabSuggestion.id,
				status: vocabSuggestion.status,
			})
			.from(vocabSuggestion)
			.where(
				and(
					eq(vocabSuggestion.studentId, st.id),
					eq(vocabSuggestion.deckId, deck.id),
					eq(vocabSuggestion.orgId, ctx.orgId),
				),
			)
			.limit(1);

		if (existing) {
			if (existing.status === "pending" || existing.status === "accepted") {
				return c.json({ id: existing.id } satisfies CreatedResponse, 200);
			}
			// existing.status === "dismissed" -> flip back to pending (re-suggest upsert)
			const now = new Date();
			await db
				.update(vocabSuggestion)
				.set({
					status: "pending",
					note,
					teacherId: ctx.userId,
					createdAt: now,
					respondedAt: null,
				})
				.where(eq(vocabSuggestion.id, existing.id));
			return c.json({ id: existing.id } satisfies CreatedResponse, 200);
		}

		const id = body.data.id ?? crypto.randomUUID();
		const now = new Date();
		const inserted = await db
			.insert(vocabSuggestion)
			.values({
				id,
				orgId: ctx.orgId,
				teacherId: ctx.userId,
				studentId: st.id,
				deckId: deck.id,
				note,
				status: "pending",
				createdAt: now,
				respondedAt: null,
			})
			.onConflictDoNothing({
				target: [vocabSuggestion.studentId, vocabSuggestion.deckId],
			})
			.returning({ id: vocabSuggestion.id });

		if (inserted[0]) {
			return c.json({ id: inserted[0].id } satisfies CreatedResponse, 201);
		}

		// Concurrent race on UNIQUE(student_id, deck_id)
		const [raced] = await db
			.select({ id: vocabSuggestion.id })
			.from(vocabSuggestion)
			.where(
				and(
					eq(vocabSuggestion.studentId, st.id),
					eq(vocabSuggestion.deckId, deck.id),
					eq(vocabSuggestion.orgId, ctx.orgId),
				),
			)
			.limit(1);
		if (!raced) return c.json({ error: "suggestion write conflict" }, 500);
		return c.json({ id: raced.id } satisfies CreatedResponse, 200);
	});

	routes.post("/suggestions/revoke", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabRevokeSuggestionSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [existing] = await db
			.select({ id: vocabSuggestion.id })
			.from(vocabSuggestion)
			.where(
				and(
					eq(vocabSuggestion.id, body.data.suggestionId),
					eq(vocabSuggestion.orgId, ctx.orgId),
				),
			)
			.limit(1);

		if (!existing) {
			return c.json(
				{
					error: "suggestion not found",
					code: VOCAB_ERROR_CODES.SUGGESTION_NOT_FOUND,
				},
				404,
			);
		}

		// Soft flip to dismissed, preserving respondedAt (RT-F6)
		await db
			.update(vocabSuggestion)
			.set({ status: "dismissed" })
			.where(
				and(
					eq(vocabSuggestion.id, existing.id),
					eq(vocabSuggestion.orgId, ctx.orgId),
				),
			);

		return c.json({ id: existing.id } satisfies CreatedResponse);
	});

	routes.get("/progress", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const studentId = c.req.query("studentId")?.trim() ?? "";
		if (!studentId) {
			return c.json({ error: "studentId is required" }, 400);
		}
		const db = deps.getDb();

		const [st] = await db
			.select({ id: student.id })
			.from(student)
			.where(and(eq(student.id, studentId), eq(student.orgId, ctx.orgId)))
			.limit(1);
		if (!st) {
			return c.json({ error: "student not found" }, 404);
		}

		const now = Date.now();
		const todayISO = vietnamTodayISO(new Date(now));
		const endOfTodayVN = Date.parse(`${todayISO}T23:59:59.999+07:00`);

		const accessibleDecks = await loadStudentAccessibleDecks(
			db,
			st.id,
			ctx.orgId,
		);
		const startOfWindowVN = Date.parse(
			`${addDaysISO(todayISO, -6)}T00:00:00+07:00`,
		);

		const [{ words, cards }, recentLogs, lastActivityRows] = await Promise.all([
			loadWordsAndCardsForAccessibleDecks(db, st.id, accessibleDecks),
			db
				.select({
					grade: vocabReviewLog.grade,
					reviewedAt: vocabReviewLog.reviewedAt,
				})
				.from(vocabReviewLog)
				.where(
					and(
						eq(vocabReviewLog.studentId, st.id),
						gte(vocabReviewLog.reviewedAt, new Date(startOfWindowVN)),
					),
				),
			accessibleDecks.length > 0
				? db
						.select({
							deckId: vocabReviewLog.deckId,
							maxReviewedAt: sql<number>`max(${vocabReviewLog.reviewedAt})`,
						})
						.from(vocabReviewLog)
						.where(eq(vocabReviewLog.studentId, st.id))
						.groupBy(vocabReviewLog.deckId)
				: Promise.resolve([]),
		]);
		const wordsByDeck = new Map<string, string[]>();
		for (const w of words) {
			const list = wordsByDeck.get(w.deckId) ?? [];
			list.push(w.id);
			wordsByDeck.set(w.deckId, list);
		}
		const cardByWordId = new Map(cards.map((card) => [card.wordId, card]));

		const lastActivityByDeck = new Map<string, number>();
		for (const row of lastActivityRows) {
			const ms = Number(row.maxReviewedAt);
			if (Number.isFinite(ms) && ms > 0) {
				lastActivityByDeck.set(row.deckId, ms);
			}
		}
		const last7DaysISO = [
			addDaysISO(todayISO, -6),
			addDaysISO(todayISO, -5),
			addDaysISO(todayISO, -4),
			addDaysISO(todayISO, -3),
			addDaysISO(todayISO, -2),
			addDaysISO(todayISO, -1),
			todayISO,
		];
		const activityMap = new Map<
			string,
			{ sessions: number; correct: number }
		>();
		for (const dISO of last7DaysISO) {
			activityMap.set(dISO, { sessions: 0, correct: 0 });
		}

		for (const log of recentLogs) {
			const dt =
				log.reviewedAt instanceof Date
					? log.reviewedAt
					: new Date(log.reviewedAt);
			const dayISO = vietnamTodayISO(dt);
			const bucket = activityMap.get(dayISO);
			if (bucket) {
				bucket.sessions += 1;
				if (log.grade === "good") {
					bucket.correct += 1;
				}
			}
		}

		const decks = accessibleDecks.map((d) => {
			const wordIds = wordsByDeck.get(d.deckId) ?? [];
			const byLevel: [number, number, number, number, number] = [0, 0, 0, 0, 0];
			let dueToday = 0;
			let stateNew = 0;
			let stateReview = 0;

			for (const wId of wordIds) {
				const card = cardByWordId.get(wId);
				if (!card || card.state === "new") {
					stateNew += 1;
				} else {
					stateReview += 1;
					if (card.level >= 1 && card.level <= 5) {
						byLevel[card.level - 1] = (byLevel[card.level - 1] ?? 0) + 1;
					}
					if (card.dueAt <= endOfTodayVN) {
						dueToday += 1;
					}
				}
			}

			const lastMs = lastActivityByDeck.get(d.deckId);
			return {
				deckId: d.deckId,
				title: d.title,
				classId: d.classId,
				className: d.className,
				source: d.source,
				total: wordIds.length,
				byLevel,
				dueToday,
				stateNew,
				stateReview,
				lastActivityAt: lastMs ? new Date(lastMs).toISOString() : null,
			};
		});

		const response: VocabStudentProgressResponse = {
			studentId: st.id,
			decks,
			activity7Days: last7DaysISO.map((dateISO) => {
				const bucket = activityMap.get(dateISO) ?? { sessions: 0, correct: 0 };
				return {
					dateISO,
					sessions: bucket.sessions,
					correct: bucket.correct,
				};
			}),
		};
		return c.json(response);
	});

	routes.post("/words/upsert", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabWordUpsertSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [deck] = await db
			.select({ id: vocabDeck.id })
			.from(vocabDeck)
			.where(
				and(eq(vocabDeck.id, body.data.deckId), eq(vocabDeck.orgId, ctx.orgId)),
			)
			.limit(1);
		if (!deck) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}

		const now = new Date();
		if (body.data.id) {
			const [existing] = await db
				.select({ id: vocabWord.id })
				.from(vocabWord)
				.where(
					and(eq(vocabWord.id, body.data.id), eq(vocabWord.deckId, deck.id)),
				)
				.limit(1);

			if (existing) {
				await db
					.update(vocabWord)
					.set({
						word: body.data.word,
						ipa: body.data.ipa ?? null,
						translation: body.data.translation,
						sortOrder: body.data.sortOrder,
						updatedAt: now,
					})
					.where(eq(vocabWord.id, existing.id));
				return c.json({ id: existing.id } satisfies CreatedResponse);
			}
		}

		const wordId = body.data.id ?? crypto.randomUUID();
		await db.insert(vocabWord).values({
			id: wordId,
			deckId: deck.id,
			word: body.data.word,
			ipa: body.data.ipa ?? null,
			translation: body.data.translation,
			sortOrder: body.data.sortOrder,
			createdAt: now,
			updatedAt: now,
		});
		return c.json({ id: wordId } satisfies CreatedResponse, 201);
	});

	routes.post("/words/remove", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const body = await readBody(c, vocabWordRemoveSchema);
		if (!body.ok) return body.response;
		const db = deps.getDb();

		const [wordRow] = await db
			.select({ id: vocabWord.id })
			.from(vocabWord)
			.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
			.where(
				and(eq(vocabWord.id, body.data.wordId), eq(vocabDeck.orgId, ctx.orgId)),
			)
			.limit(1);

		if (!wordRow) {
			return c.json(
				{ error: "word not found", code: VOCAB_ERROR_CODES.WORD_NOT_FOUND },
				404,
			);
		}

		await db.batch([
			db
				.delete(vocabCard)
				.where(
					and(
						eq(vocabCard.wordId, wordRow.id),
						sql`${vocabCard.wordId} NOT LIKE 'libword-%'`,
					),
				),
			db.delete(vocabWord).where(eq(vocabWord.id, wordRow.id)),
		]);
		return c.json({ id: wordRow.id } satisfies CreatedResponse);
	});

	/**
	 * PUT /words/:wordId/audio — uploads word pronunciation audio to MediaStore
	 * and sets server-generated key `vocab/{orgId}/{wordId}/{uuid}` (red-team F3).
	 */
	routes.put("/words/:wordId/audio", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const wordId = c.req.param("wordId");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}

		const lengthHeader = c.req.header("Content-Length");
		const size =
			lengthHeader !== undefined && /^\d+$/.test(lengthHeader)
				? Number(lengthHeader)
				: Number.NaN;
		if (!Number.isSafeInteger(size)) {
			return c.json({ error: "length required" }, 411);
		}
		if (size === 0) {
			return c.json({ error: "empty file" }, 400);
		}
		if (size > QUIZ_MEDIA_MAX_BYTES) {
			return c.json({ error: "payload too large" }, 413);
		}

		const contentType = normalizeMediaType(c.req.header("Content-Type") ?? "");
		if (
			!contentType.startsWith("audio/") ||
			!Object.hasOwn(ALLOWED_AUDIO_MIMES, contentType)
		) {
			return c.json(
				{
					error: "unsupported audio type",
					code: VOCAB_ERROR_CODES.INVALID_AUDIO,
				},
				415,
			);
		}

		const db = deps.getDb();
		const [wordRow] = await db
			.select({
				id: vocabWord.id,
				audioKey: vocabWord.audioKey,
			})
			.from(vocabWord)
			.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
			.where(and(eq(vocabWord.id, wordId), eq(vocabDeck.orgId, ctx.orgId)))
			.limit(1);

		if (!wordRow) {
			return c.json(
				{ error: "word not found", code: VOCAB_ERROR_CODES.WORD_NOT_FOUND },
				404,
			);
		}

		const body = c.req.raw.body;
		if (body === null) {
			return c.json({ error: "empty file" }, 400);
		}

		const newKey = `vocab/${ctx.orgId}/${wordId}/${crypto.randomUUID()}`;
		try {
			await store.put(newKey, body, { contentType, size });
		} catch (error) {
			await store.delete(newKey).catch(() => undefined);
			if (error instanceof MediaSizeMismatchError) {
				return c.json({ error: "size mismatch" }, 400);
			}
			throw error;
		}

		await db
			.update(vocabWord)
			.set({
				audioKey: newKey,
				updatedAt: new Date(),
			})
			.where(eq(vocabWord.id, wordId));

		if (wordRow.audioKey) {
			await store.delete(wordRow.audioKey).catch(() => undefined);
		}

		return c.json({ id: wordId, audioKey: newKey });
	});

	routes.get("/words/:wordId/audio", async (c) => {
		const ctx = c.get("kernelCtx");
		if (!ctx) return c.json({ error: "unauthorized" }, 401);
		const wordId = c.req.param("wordId");
		const store = deps.getMediaStore?.();
		if (!store) {
			return c.json({ error: "media storage unavailable" }, 503);
		}
		const db = deps.getDb();

		const [row] = await db
			.select({
				word: vocabWord.word,
				audioKey: vocabWord.audioKey,
			})
			.from(vocabWord)
			.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
			.where(and(eq(vocabWord.id, wordId), eq(vocabDeck.orgId, ctx.orgId)))
			.limit(1);

		if (row?.audioKey === undefined || row.audioKey === null) {
			return c.json(
				{ error: "audio not found", code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND },
				404,
			);
		}

		const object = await store.get(row.audioKey);
		if (!object) {
			return c.json(
				{ error: "audio not found", code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND },
				404,
			);
		}
		return mediaObjectResponse(object, {
			mediaType: object.contentType,
			mediaName: `${row.word}.mp3`,
		});
	});

	return routes;
}
