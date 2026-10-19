import {
	LIBRARY_AUDIO_MAX_BYTES,
	VOCAB_DURATION_MAX_MS,
	VOCAB_ERROR_CODES,
	type VocabOverview,
	type VocabSessionCard,
	type VocabStudentLibraryCoursesResponse,
	type VocabStudentLibraryDecksResponse,
	vocabAnswerSchema,
	vocabLearnCommitSchema,
} from "@teacher-os/api/contracts";
import {
	applyAnswer,
	learned,
	roundHalfAwayFromZero,
} from "@teacher-os/api/srs/scheduler";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	type student,
	vocabCard,
	vocabDeck,
	vocabLibraryCourse,
	vocabLibraryDeck,
	vocabLibraryWord,
	vocabReviewLog,
	vocabSuggestion,
	vocabWord,
} from "@teacher-os/db/schema/index";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Db } from "../app";
import { mediaObjectResponse } from "../lib/media-response";
import {
	ensureDeckCards,
	loadPool,
	loadStudentAccessibleDecks,
	loadWordsAndCardsForAccessibleDecks,
	studentCanAccessDeckCondition,
} from "../lib/vocab-provision";
import type { SessionUser } from "../session";
import type { StudentRouteDeps } from "./student";

interface VocabStudentContext {
	student: typeof student.$inferSelect;
	orgId: string;
	userId: string;
	sessionUser: SessionUser & { email: string };
}

type VocabStudentEnv = {
	Variables: {
		sessionUser: SessionUser & { email: string };
		studentCtx: VocabStudentContext;
	};
};

const UPCOMING_WINDOW_MS = 3_600_000;

async function loadOwnedSessionCard(
	db: Db,
	cardId: string,
	studentId: string,
	orgId: string,
): Promise<(VocabSessionCard & { deckId: string }) | null> {
	const [row] = await db
		.select({
			id: vocabCard.id,
			wordId: vocabWord.id,
			deckId: vocabDeck.id,
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
		.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
		.where(
			and(
				eq(vocabCard.id, cardId),
				eq(vocabCard.studentId, studentId),
				studentCanAccessDeckCondition(studentId, orgId),
			),
		)
		.limit(1);

	if (row) {
		return {
			id: row.id,
			wordId: row.wordId,
			deckId: row.deckId,
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
		};
	}

	const [libRow] = await db
		.select({
			id: vocabCard.id,
			wordId: vocabLibraryWord.id,
			deckId: vocabLibraryDeck.id,
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
		.innerJoin(
			vocabLibraryDeck,
			eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
		)
		.where(and(eq(vocabCard.id, cardId), eq(vocabCard.studentId, studentId)))
		.limit(1);

	if (!libRow) return null;
	return {
		id: libRow.id,
		wordId: libRow.wordId,
		deckId: libRow.deckId,
		word: libRow.word,
		translation: libRow.translation,
		ipa: libRow.ipa ?? null,
		audioKey: null,
		hasAudio: libRow.audioUrl !== null && libRow.audioUrl.trim().length > 0,
		level: libRow.level,
		isWarning: Boolean(libRow.isWarning),
		state: libRow.state === "review" ? "review" : "new",
		intervalDays: libRow.intervalDays,
		dueAt: libRow.dueAt,
		lapses: libRow.lapses,
	};
}

function stripDeckId(
	card: VocabSessionCard & { deckId: string },
): VocabSessionCard {
	const { deckId: _deckId, ...rest } = card;
	return rest;
}

const ALLOWED_LIBRARY_AUDIO_ORIGIN_HOSTS: Record<string, true> = {
	"mochien3.1-api.mochidemy.com": true,
};
const ALLOWED_LIBRARY_AUDIO_REDIRECT_HOSTS: Record<string, true> = {
	"mochien3.1-api.mochidemy.com": true,
	"mochien-server.mochidemy.com": true,
};
const LIBRARY_AUDIO_TIMEOUT_MS = 10_000;
const MAX_AUDIO_REDIRECT_HOPS = 3;

async function proxyRemoteAudio(
	c: Context<VocabStudentEnv>,
	audioUrl: string,
): Promise<Response> {
	const notFound = () =>
		c.json(
			{ error: "audio not found", code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND },
			404,
		);

	let parsedOrigin: URL;
	try {
		parsedOrigin = new URL(audioUrl);
	} catch {
		return notFound();
	}

	if (
		parsedOrigin.protocol !== "https:" ||
		!ALLOWED_LIBRARY_AUDIO_ORIGIN_HOSTS[parsedOrigin.hostname]
	) {
		return notFound();
	}

	try {
		let currentUrl = parsedOrigin.toString();
		let response: Response | null = null;

		for (let hop = 0; hop <= MAX_AUDIO_REDIRECT_HOPS; hop++) {
			const res = await fetch(currentUrl, {
				method: "GET",
				redirect: "follow",
				signal: AbortSignal.timeout(LIBRARY_AUDIO_TIMEOUT_MS),
			});
			if (res.status >= 300 && res.status < 400) {
				const location = res.headers.get("location");
				if (!location || hop === MAX_AUDIO_REDIRECT_HOPS) {
					return notFound();
				}
				const nextUrl = new URL(location, currentUrl);
				if (
					nextUrl.protocol !== "https:" ||
					!ALLOWED_LIBRARY_AUDIO_REDIRECT_HOSTS[nextUrl.hostname]
				) {
					return notFound();
				}
				currentUrl = nextUrl.toString();
				continue;
			}
			response = res;
			break;
		}

		if (!response?.ok) {
			return notFound();
		}
		if (response.url) {
			try {
				const finalUrl = new URL(response.url);
				if (
					finalUrl.protocol !== "https:" ||
					!ALLOWED_LIBRARY_AUDIO_REDIRECT_HOSTS[finalUrl.hostname]
				) {
					return notFound();
				}
			} catch {
				return notFound();
			}
		}

		const rawContentType = (
			response.headers.get("content-type") ?? ""
		).toLowerCase();
		const mimeType = rawContentType.split(";")[0]?.trim() ?? "";
		if (!mimeType.startsWith("audio/")) {
			return notFound();
		}

		const contentLengthHeader = response.headers.get("content-length");
		if (contentLengthHeader) {
			const declaredBytes = Number.parseInt(contentLengthHeader, 10);
			if (
				Number.isFinite(declaredBytes) &&
				declaredBytes > LIBRARY_AUDIO_MAX_BYTES
			) {
				return notFound();
			}
		}

		const buffer = await response.arrayBuffer();
		if (
			buffer.byteLength === 0 ||
			buffer.byteLength > LIBRARY_AUDIO_MAX_BYTES
		) {
			return notFound();
		}

		return new Response(buffer, {
			status: 200,
			headers: {
				"Content-Type": mimeType || "audio/mpeg",
				"Content-Length": String(buffer.byteLength),
				"Cache-Control": "private, max-age=86400",
				"X-Content-Type-Options": "nosniff",
				"Content-Security-Policy": "sandbox",
			},
		});
	} catch {
		return notFound();
	}
}

/**
 * Registers all `/api/student/vocab/*` routes INSIDE `studentRoutes()` (RT#1).
 * Never mount standalone in `app.ts` because `bootstrapMiddleware` skips `/api/student/*`
 * and `requireStudent` lives inside `studentRoutes()`.
 */
export function registerVocabRoutes(
	router: Hono<VocabStudentEnv>,
	deps: StudentRouteDeps,
	requireStudent: MiddlewareHandler<VocabStudentEnv>,
	allowedOrigins: readonly string[],
): void {
	const vocabWriteGuard = async (
		c: Context<VocabStudentEnv>,
		next: () => Promise<void>,
	) => {
		const method = c.req.method;
		if (
			method === "POST" ||
			method === "PATCH" ||
			method === "PUT" ||
			method === "DELETE"
		) {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json({ error: "origin not allowed" }, 403);
			}
			const contentType = c.req.header("Content-Type") ?? "";
			if (!contentType.toLowerCase().startsWith("application/json")) {
				return c.json({ error: "content-type must be application/json" }, 415);
			}
			return bodyLimit({
				maxSize: 4096,
				onError: (bc) => bc.json({ error: "payload too large" }, 413),
			})(c, next);
		}
		return next();
	};

	// #320 precedent: register both `path` and `path/*` BEFORE handlers.
	router.use("/vocab/overview", requireStudent);
	router.use("/vocab/overview/*", requireStudent);
	router.use("/vocab/decks/:deckId/session-data", requireStudent);
	router.use("/vocab/decks/:deckId/session-data/*", requireStudent);
	router.use("/vocab/answer", requireStudent);
	router.use("/vocab/answer/*", requireStudent);
	router.use("/vocab/answer", vocabWriteGuard);
	router.use("/vocab/answer/*", vocabWriteGuard);
	router.use("/vocab/learn-commit", requireStudent);
	router.use("/vocab/learn-commit/*", requireStudent);
	router.use("/vocab/learn-commit", vocabWriteGuard);
	router.use("/vocab/learn-commit/*", vocabWriteGuard);
	router.use("/vocab/audio/:wordId", requireStudent);
	router.use("/vocab/audio/:wordId/*", requireStudent);
	router.use("/vocab/suggestions/:id/accept", requireStudent);
	router.use("/vocab/suggestions/:id/accept/*", requireStudent);
	router.use("/vocab/suggestions/:id/accept", vocabWriteGuard);
	router.use("/vocab/suggestions/:id/accept/*", vocabWriteGuard);
	router.use("/vocab/suggestions/:id/dismiss", requireStudent);
	router.use("/vocab/suggestions/:id/dismiss/*", requireStudent);
	router.use("/vocab/suggestions/:id/dismiss", vocabWriteGuard);
	router.use("/vocab/suggestions/:id/dismiss/*", vocabWriteGuard);
	router.use("/vocab/library/courses", requireStudent);
	router.use("/vocab/library/courses/*", requireStudent);

	router.get("/vocab/library/courses", async (c) => {
		const { student: s } = c.get("studentCtx");
		const db = deps.getDb();
		const now = Date.now();

		const [courses, deckCounts, wordCounts, progressRows] = await Promise.all([
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
			db
				.select({
					courseId: vocabLibraryDeck.courseId,
					count: sql<number>`count(*)`,
				})
				.from(vocabLibraryWord)
				.innerJoin(
					vocabLibraryDeck,
					eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
				)
				.groupBy(vocabLibraryDeck.courseId),
			db
				.select({
					courseId: vocabLibraryDeck.courseId,
					reviewWordCount: sql<number>`count(*)`,
					learnedWordCount: sql<number>`coalesce(sum(case when ${vocabCard.level} >= 2 then 1 else 0 end), 0)`,
					dueWordCount: sql<number>`coalesce(sum(case when ${vocabCard.dueAt} <= ${now} then 1 else 0 end), 0)`,
				})
				.from(vocabCard)
				.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
				.innerJoin(
					vocabLibraryDeck,
					eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
				)
				.where(
					and(eq(vocabCard.studentId, s.id), eq(vocabCard.state, "review")),
				)
				.groupBy(vocabLibraryDeck.courseId),
		]);

		const deckCountByCourse = new Map<string, number>();
		for (const row of deckCounts) {
			deckCountByCourse.set(row.courseId, Number(row.count));
		}
		const wordCountByCourse = new Map<string, number>();
		for (const row of wordCounts) {
			wordCountByCourse.set(row.courseId, Number(row.count));
		}
		const progressByCourse = new Map<
			string,
			{
				reviewWordCount: number;
				learnedWordCount: number;
				dueWordCount: number;
			}
		>();
		for (const row of progressRows) {
			progressByCourse.set(row.courseId, {
				reviewWordCount: Number(row.reviewWordCount) || 0,
				learnedWordCount: Number(row.learnedWordCount) || 0,
				dueWordCount: Number(row.dueWordCount) || 0,
			});
		}

		const response: VocabStudentLibraryCoursesResponse = {
			courses: courses.map((course) => {
				const prog = progressByCourse.get(course.id);
				return {
					id: course.id,
					name: course.name,
					description: course.description ?? null,
					target: course.target ?? null,
					deckCount: deckCountByCourse.get(course.id) ?? 0,
					wordCount: wordCountByCourse.get(course.id) ?? 0,
					reviewWordCount: prog?.reviewWordCount ?? 0,
					learnedWordCount: prog?.learnedWordCount ?? 0,
					dueWordCount: prog?.dueWordCount ?? 0,
					sortOrder: course.sortOrder,
				};
			}),
		};
		return c.json(response);
	});

	router.get("/vocab/library/courses/:courseId/decks", async (c) => {
		const { student: s } = c.get("studentCtx");
		const courseId = c.req.param("courseId");
		const db = deps.getDb();
		const now = Date.now();

		const [course] = await db
			.select({
				id: vocabLibraryCourse.id,
				name: vocabLibraryCourse.name,
				description: vocabLibraryCourse.description,
				target: vocabLibraryCourse.target,
			})
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

		const [decks, wordCounts, progressRows] = await Promise.all([
			db
				.select()
				.from(vocabLibraryDeck)
				.where(eq(vocabLibraryDeck.courseId, courseId))
				.orderBy(asc(vocabLibraryDeck.sortOrder), asc(vocabLibraryDeck.id)),
			db
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
				.groupBy(vocabLibraryWord.deckId),
			db
				.select({
					deckId: vocabLibraryWord.deckId,
					reviewCount: sql<number>`count(*)`,
					learnedCount: sql<number>`coalesce(sum(case when ${vocabCard.level} >= 2 then 1 else 0 end), 0)`,
					dueCount: sql<number>`coalesce(sum(case when ${vocabCard.dueAt} <= ${now} then 1 else 0 end), 0)`,
				})
				.from(vocabCard)
				.innerJoin(vocabLibraryWord, eq(vocabCard.wordId, vocabLibraryWord.id))
				.innerJoin(
					vocabLibraryDeck,
					eq(vocabLibraryWord.deckId, vocabLibraryDeck.id),
				)
				.where(
					and(
						eq(vocabCard.studentId, s.id),
						eq(vocabCard.state, "review"),
						eq(vocabLibraryDeck.courseId, courseId),
					),
				)
				.groupBy(vocabLibraryWord.deckId),
		]);

		const wordCountByDeck = new Map<string, number>();
		for (const row of wordCounts) {
			wordCountByDeck.set(row.deckId, Number(row.count));
		}
		const progressByDeck = new Map<
			string,
			{
				reviewCount: number;
				learnedCount: number;
				dueCount: number;
			}
		>();
		for (const row of progressRows) {
			progressByDeck.set(row.deckId, {
				reviewCount: Number(row.reviewCount) || 0,
				learnedCount: Number(row.learnedCount) || 0,
				dueCount: Number(row.dueCount) || 0,
			});
		}

		const response: VocabStudentLibraryDecksResponse = {
			course: {
				id: course.id,
				name: course.name,
				description: course.description ?? null,
				target: course.target ?? null,
			},
			decks: decks.map((deck) => {
				const wordCount = wordCountByDeck.get(deck.id) ?? 0;
				const prog = progressByDeck.get(deck.id);
				const reviewCount = prog?.reviewCount ?? 0;
				const newCount = Math.max(0, wordCount - reviewCount);
				return {
					id: deck.id,
					courseId: deck.courseId,
					title: deck.title,
					imageUrl: deck.imageUrl ?? null,
					wordCount,
					newCount,
					reviewCount,
					dueCount: prog?.dueCount ?? 0,
					learnedCount: prog?.learnedCount ?? 0,
					sortOrder: deck.sortOrder,
				};
			}),
		};
		return c.json(response);
	});

	router.get("/vocab/overview", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();
		const now = Date.now();

		const [accessibleDecks, pendingSuggestions] = await Promise.all([
			loadStudentAccessibleDecks(db, s.id, orgId),
			db
				.select({
					id: vocabSuggestion.id,
					deckId: vocabDeck.id,
					title: vocabDeck.title,
					note: vocabSuggestion.note,
					createdAt: vocabSuggestion.createdAt,
					wordCount: sql<number>`count(${vocabWord.id})`,
				})
				.from(vocabSuggestion)
				.innerJoin(
					vocabDeck,
					and(
						eq(vocabSuggestion.deckId, vocabDeck.id),
						eq(vocabSuggestion.orgId, vocabDeck.orgId),
					),
				)
				.leftJoin(vocabWord, eq(vocabWord.deckId, vocabDeck.id))
				.where(
					and(
						eq(vocabSuggestion.studentId, s.id),
						eq(vocabSuggestion.orgId, orgId),
						eq(vocabSuggestion.status, "pending"),
					),
				)
				.groupBy(vocabSuggestion.id)
				.orderBy(asc(vocabSuggestion.createdAt), asc(vocabSuggestion.id)),
		]);

		const [{ words, cards }, logs] = await Promise.all([
			loadWordsAndCardsForAccessibleDecks(db, s.id, accessibleDecks),
			db
				.select({
					grade: vocabReviewLog.grade,
					reviewedAt: vocabReviewLog.reviewedAt,
				})
				.from(vocabReviewLog)
				.where(eq(vocabReviewLog.studentId, s.id)),
		]);

		const cardByWordId = new Map(cards.map((card) => [card.wordId, card]));
		const wordsByDeck = new Map<string, string[]>();
		for (const w of words) {
			const list = wordsByDeck.get(w.deckId) ?? [];
			list.push(w.id);
			wordsByDeck.set(w.deckId, list);
		}

		// Global review pool: only `state === "review"` cards (red-team F5 / spec §5).
		const reviewPool = cards.filter((c) => c.state === "review");
		const dueCount = reviewPool.filter((c) => c.dueAt <= now).length;
		const futureDue = reviewPool
			.filter((c) => c.dueAt > now)
			.map((c) => c.dueAt);
		const nextDueAt = futureDue.length > 0 ? Math.min(...futureDue) : null;
		const upcomingCount =
			nextDueAt === null
				? 0
				: reviewPool.filter(
						(c) =>
							c.dueAt >= nextDueAt && c.dueAt < nextDueAt + UPCOMING_WINDOW_MS,
					).length;

		const learnedCount = cards.filter((c) => c.level >= 2).length;
		const matureCount = cards.filter((c) => c.level === 5).length;

		const levelDistribution: [number, number, number, number, number] = [
			0, 0, 0, 0, 0,
		];
		for (const c of reviewPool) {
			if (c.level >= 1 && c.level <= 5) {
				levelDistribution[c.level - 1] =
					(levelDistribution[c.level - 1] ?? 0) + 1;
			}
		}

		const todayISO = vietnamTodayISO(new Date(now));
		const forecastDays = [
			todayISO,
			addDaysISO(todayISO, 1),
			addDaysISO(todayISO, 2),
			addDaysISO(todayISO, 3),
			addDaysISO(todayISO, 4),
			addDaysISO(todayISO, 5),
			addDaysISO(todayISO, 6),
		];
		const forecast: [number, number, number, number, number, number, number] = [
			0, 0, 0, 0, 0, 0, 0,
		];
		for (const c of reviewPool) {
			const dueDayISO = vietnamTodayISO(new Date(c.dueAt));
			const dayIdx = forecastDays.indexOf(dueDayISO);
			if (dayIdx >= 0 && dayIdx < 7) {
				forecast[dayIdx] = (forecast[dayIdx] ?? 0) + 1;
			}
		}

		// Streak per spec §5: consecutive local Vietnam days ending at today OR yesterday.
		const logDays = new Set<string>();
		let goodLogs = 0;
		for (const l of logs) {
			const dt =
				l.reviewedAt instanceof Date ? l.reviewedAt : new Date(l.reviewedAt);
			logDays.add(vietnamTodayISO(dt));
			if (l.grade !== "again") goodLogs += 1;
		}
		const yesterdayISO = addDaysISO(todayISO, -1);
		const streakAnchor = logDays.has(todayISO)
			? todayISO
			: logDays.has(yesterdayISO)
				? yesterdayISO
				: null;
		let streak = 0;
		if (streakAnchor !== null) {
			while (logDays.has(addDaysISO(streakAnchor, -streak))) {
				streak += 1;
			}
		}

		const retention =
			logs.length === 0
				? null
				: roundHalfAwayFromZero((goodLogs / logs.length) * 100);

		const decks = accessibleDecks.map((d) => {
			const wordIds = wordsByDeck.get(d.deckId) ?? [];
			let deckNewCount = 0;
			let deckDueCount = 0;
			for (const wId of wordIds) {
				const card = cardByWordId.get(wId);
				if (!card || card.state === "new") {
					deckNewCount += 1;
				} else if (card.dueAt <= now) {
					deckDueCount += 1;
				}
			}
			return {
				deckId: d.deckId,
				title: d.title,
				className: d.className,
				source: d.source,
				total: wordIds.length,
				newCount: deckNewCount,
				dueCount: deckDueCount,
			};
		});

		const suggestions = pendingSuggestions.map((row) => ({
			id: row.id,
			deckId: row.deckId,
			title: row.title,
			wordCount: Number(row.wordCount) || 0,
			note: row.note ?? null,
			createdAt:
				row.createdAt instanceof Date
					? row.createdAt.toISOString()
					: new Date(row.createdAt).toISOString(),
		}));

		const response: VocabOverview = {
			dueCount,
			nextDueAt,
			upcomingCount,
			learnedCount,
			matureCount,
			levelDistribution,
			streak,
			retention,
			forecast,
			decks,
			suggestions,
		};
		return c.json(response);
	});

	router.post("/vocab/suggestions/:id/accept", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const id = c.req.param("id");
		const db = deps.getDb();

		const [row] = await db
			.select({
				id: vocabSuggestion.id,
				deckId: vocabSuggestion.deckId,
				status: vocabSuggestion.status,
				respondedAt: vocabSuggestion.respondedAt,
			})
			.from(vocabSuggestion)
			.innerJoin(
				vocabDeck,
				and(
					eq(vocabSuggestion.deckId, vocabDeck.id),
					eq(vocabSuggestion.orgId, vocabDeck.orgId),
				),
			)
			.where(
				and(
					eq(vocabSuggestion.id, id),
					eq(vocabSuggestion.studentId, s.id),
					eq(vocabSuggestion.orgId, orgId),
				),
			)
			.limit(1);

		if (!row || row.status === "dismissed") {
			return c.json(
				{
					error: "suggestion not found",
					code: VOCAB_ERROR_CODES.SUGGESTION_NOT_FOUND,
				},
				404,
			);
		}

		if (row.status === "accepted") {
			const respondedAt =
				row.respondedAt instanceof Date
					? row.respondedAt.toISOString()
					: row.respondedAt
						? new Date(row.respondedAt).toISOString()
						: new Date().toISOString();
			return c.json({
				id: row.id,
				deckId: row.deckId,
				status: "accepted" as const,
				respondedAt,
			});
		}

		const now = new Date();
		await db
			.update(vocabSuggestion)
			.set({ status: "accepted", respondedAt: now })
			.where(
				and(
					eq(vocabSuggestion.id, row.id),
					eq(vocabSuggestion.studentId, s.id),
					eq(vocabSuggestion.orgId, orgId),
				),
			);

		return c.json({
			id: row.id,
			deckId: row.deckId,
			status: "accepted" as const,
			respondedAt: now.toISOString(),
		});
	});

	router.post("/vocab/suggestions/:id/dismiss", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const id = c.req.param("id");
		const db = deps.getDb();

		const [row] = await db
			.select({
				id: vocabSuggestion.id,
				deckId: vocabSuggestion.deckId,
				status: vocabSuggestion.status,
				respondedAt: vocabSuggestion.respondedAt,
			})
			.from(vocabSuggestion)
			.innerJoin(
				vocabDeck,
				and(
					eq(vocabSuggestion.deckId, vocabDeck.id),
					eq(vocabSuggestion.orgId, vocabDeck.orgId),
				),
			)
			.where(
				and(
					eq(vocabSuggestion.id, id),
					eq(vocabSuggestion.studentId, s.id),
					eq(vocabSuggestion.orgId, orgId),
				),
			)
			.limit(1);

		if (!row) {
			return c.json(
				{
					error: "suggestion not found",
					code: VOCAB_ERROR_CODES.SUGGESTION_NOT_FOUND,
				},
				404,
			);
		}

		if (row.status === "accepted") {
			return c.json(
				{
					error: "cannot dismiss accepted suggestion",
					code: VOCAB_ERROR_CODES.SUGGESTION_ALREADY_ACCEPTED,
				},
				409,
			);
		}

		const now = new Date();
		await db
			.update(vocabSuggestion)
			.set({ status: "dismissed", respondedAt: now })
			.where(
				and(
					eq(vocabSuggestion.id, row.id),
					eq(vocabSuggestion.studentId, s.id),
					eq(vocabSuggestion.orgId, orgId),
				),
			);

		return c.json({
			id: row.id,
			deckId: row.deckId,
			status: "dismissed" as const,
			respondedAt: now.toISOString(),
		});
	});

	router.get("/vocab/decks/:deckId/session-data", async (c) => {
		const secFetchSite = c.req.header("Sec-Fetch-Site");
		if (secFetchSite === "cross-site") {
			const origin = c.req.header("Origin") ?? "";
			if (!allowedOrigins.includes(origin)) {
				return c.json(
					{ error: "origin not allowed", code: "FORBIDDEN_ORIGIN" },
					403,
				);
			}
		}

		const { student: s, orgId } = c.get("studentCtx");
		const deckId = c.req.param("deckId");
		const db = deps.getDb();

		const ensured = await ensureDeckCards(db, s.id, orgId, deckId);
		if (!ensured) {
			return c.json(
				{ error: "deck not found", code: VOCAB_ERROR_CODES.DECK_NOT_FOUND },
				404,
			);
		}
		const pool = await loadPool(db, s.id, orgId, deckId);
		return c.json({
			deck: ensured.deck,
			cards: ensured.cards,
			pool,
		});
	});

	router.post("/vocab/answer", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = vocabAnswerSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { clientLogId, cardId, correct } = parsed.data;
		const durationMs = Math.min(parsed.data.durationMs, VOCAB_DURATION_MAX_MS);
		const now = Date.now();

		const current = await loadOwnedSessionCard(db, cardId, s.id, orgId);
		if (!current) {
			return c.json(
				{ error: "card not found", code: VOCAB_ERROR_CODES.CARD_NOT_FOUND },
				404,
			);
		}

		// Sequential idempotency check
		const [existingLog] = await db
			.select({
				id: vocabReviewLog.id,
				studentId: vocabReviewLog.studentId,
			})
			.from(vocabReviewLog)
			.where(eq(vocabReviewLog.id, clientLogId))
			.limit(1);

		if (existingLog) {
			if (existingLog.studentId !== s.id) {
				return c.json({ error: "log id conflict" }, 409);
			}
			return c.json({ card: stripDeckId(current) });
		}

		// Cross-session guard (red-team F6 / spec §1 "due iff dueAt <= now")
		if (current.state === "review" && current.dueAt > now) {
			return c.json({ card: stripDeckId(current) });
		}

		// Review first-result chỉ hợp lệ trên card đã học (spec §3); card
		// state='new' phải đi qua Learn — chặn nhảy level bỏ qua Learn (I1).
		if (current.state === "new") {
			return c.json(
				{ error: "card not due", code: VOCAB_ERROR_CODES.CARD_NOT_DUE },
				409,
			);
		}

		const applied = applyAnswer(current, correct, now);
		const grade: "good" | "again" = correct ? "good" : "again";

		try {
			await db.batch([
				db.insert(vocabReviewLog).values({
					id: clientLogId,
					studentId: s.id,
					cardId: current.id,
					deckId: current.deckId,
					sessionKind: "review",
					grade,
					durationMs,
					reviewedAt: new Date(now),
					word: current.word,
					translation: current.translation,
				}),
				db
					.update(vocabCard)
					.set({
						level: applied.level,
						isWarning: applied.isWarning,
						state: applied.state,
						intervalDays: applied.intervalDays,
						dueAt: applied.dueAt,
						lapses: applied.lapses,
						updatedAt: new Date(now),
					})
					.where(
						and(eq(vocabCard.id, current.id), eq(vocabCard.studentId, s.id)),
					),
			]);
		} catch (error) {
			// Concurrent race on same clientLogId -> batch rolled back, replay winner's state
			const [racedLog] = await db
				.select({
					id: vocabReviewLog.id,
					studentId: vocabReviewLog.studentId,
				})
				.from(vocabReviewLog)
				.where(eq(vocabReviewLog.id, clientLogId))
				.limit(1);

			if (racedLog && racedLog.studentId === s.id) {
				const reread = await loadOwnedSessionCard(db, cardId, s.id, orgId);
				if (reread) {
					return c.json({ card: stripDeckId(reread) });
				}
			}
			throw error;
		}

		const updatedCard: VocabSessionCard = {
			id: current.id,
			wordId: current.wordId,
			word: current.word,
			translation: current.translation,
			ipa: current.ipa,
			audioKey: current.audioKey,
			hasAudio: current.hasAudio,
			level: applied.level,
			isWarning: applied.isWarning,
			state: applied.state,
			intervalDays: applied.intervalDays,
			dueAt: applied.dueAt,
			lapses: applied.lapses,
		};
		return c.json({ card: updatedCard });
	});

	router.post("/vocab/learn-commit", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db = deps.getDb();

		let raw: unknown;
		try {
			raw = await c.req.json();
		} catch {
			return c.json({ error: "invalid json" }, 400);
		}
		const parsed = vocabLearnCommitSchema.safeParse(raw);
		if (!parsed.success) {
			return c.json({ error: "invalid body" }, 400);
		}

		const { clientLogId, cardId, gradeGood } = parsed.data;
		const durationMs = Math.min(parsed.data.durationMs, VOCAB_DURATION_MAX_MS);
		const now = Date.now();

		const current = await loadOwnedSessionCard(db, cardId, s.id, orgId);
		if (!current) {
			return c.json(
				{ error: "card not found", code: VOCAB_ERROR_CODES.CARD_NOT_FOUND },
				404,
			);
		}

		const [existingLog] = await db
			.select({
				id: vocabReviewLog.id,
				studentId: vocabReviewLog.studentId,
			})
			.from(vocabReviewLog)
			.where(eq(vocabReviewLog.id, clientLogId))
			.limit(1);

		if (existingLog) {
			if (existingLog.studentId !== s.id) {
				return c.json({ error: "log id conflict" }, 409);
			}
			return c.json({ card: stripDeckId(current) });
		}

		// Cross-session guard: card already committed to review in another tab
		if (current.state === "review") {
			return c.json({ card: stripDeckId(current) });
		}

		const applied = learned(current, now);
		const grade: "good" | "again" = gradeGood ? "good" : "again";

		try {
			await db.batch([
				db.insert(vocabReviewLog).values({
					id: clientLogId,
					studentId: s.id,
					cardId: current.id,
					deckId: current.deckId,
					sessionKind: "learn",
					grade,
					durationMs,
					reviewedAt: new Date(now),
					word: current.word,
					translation: current.translation,
				}),
				db
					.update(vocabCard)
					.set({
						level: applied.level,
						isWarning: applied.isWarning,
						state: applied.state,
						intervalDays: applied.intervalDays,
						dueAt: applied.dueAt,
						lapses: applied.lapses,
						updatedAt: new Date(now),
					})
					.where(
						and(eq(vocabCard.id, current.id), eq(vocabCard.studentId, s.id)),
					),
			]);
		} catch (error) {
			const [racedLog] = await db
				.select({
					id: vocabReviewLog.id,
					studentId: vocabReviewLog.studentId,
				})
				.from(vocabReviewLog)
				.where(eq(vocabReviewLog.id, clientLogId))
				.limit(1);

			if (racedLog && racedLog.studentId === s.id) {
				const reread = await loadOwnedSessionCard(db, cardId, s.id, orgId);
				if (reread) {
					return c.json({ card: stripDeckId(reread) });
				}
			}
			throw error;
		}

		const updatedCard: VocabSessionCard = {
			id: current.id,
			wordId: current.wordId,
			word: current.word,
			translation: current.translation,
			ipa: current.ipa,
			audioKey: current.audioKey,
			hasAudio: current.hasAudio,
			level: applied.level,
			isWarning: applied.isWarning,
			state: applied.state,
			intervalDays: applied.intervalDays,
			dueAt: applied.dueAt,
			lapses: applied.lapses,
		};
		return c.json({ card: updatedCard });
	});

	router.get("/vocab/audio/:wordId", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const wordId = c.req.param("wordId");
		const db = deps.getDb();

		if (!wordId.startsWith("libword-")) {
			const [row] = await db
				.select({
					word: vocabWord.word,
					audioKey: vocabWord.audioKey,
					audioUrl: vocabWord.audioUrl,
				})
				.from(vocabWord)
				.innerJoin(vocabDeck, eq(vocabWord.deckId, vocabDeck.id))
				.where(
					and(
						eq(vocabWord.id, wordId),
						studentCanAccessDeckCondition(s.id, orgId),
					),
				)
				.limit(1);

			if (row) {
				if (row.audioKey !== null && row.audioKey.trim().length > 0) {
					const store = deps.getMediaStore?.();
					if (!store) {
						return c.json({ error: "media storage unavailable" }, 503);
					}
					const object = await store.get(row.audioKey);
					if (!object) {
						return c.json(
							{
								error: "audio not found",
								code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND,
							},
							404,
						);
					}
					return mediaObjectResponse(object, {
						mediaType: object.contentType,
						mediaName: `${row.word}.mp3`,
					});
				}

				if (row.audioUrl !== null && row.audioUrl.trim().length > 0) {
					return proxyRemoteAudio(c, row.audioUrl);
				}

				return c.json(
					{
						error: "audio not found",
						code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND,
					},
					404,
				);
			}
		}

		const [libRow] = await db
			.select({
				audioUrl: vocabLibraryWord.audioUrl,
			})
			.from(vocabLibraryWord)
			.innerJoin(vocabCard, eq(vocabCard.wordId, vocabLibraryWord.id))
			.where(
				and(eq(vocabLibraryWord.id, wordId), eq(vocabCard.studentId, s.id)),
			)
			.limit(1);

		if (
			libRow &&
			libRow.audioUrl !== null &&
			libRow.audioUrl.trim().length > 0
		) {
			return proxyRemoteAudio(c, libRow.audioUrl);
		}

		return c.json(
			{ error: "audio not found", code: VOCAB_ERROR_CODES.AUDIO_NOT_FOUND },
			404,
		);
	});
}
