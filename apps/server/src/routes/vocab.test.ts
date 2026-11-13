import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	VOCAB_DURATION_MAX_MS,
	vocabCardMutationResponseSchema,
	vocabOverviewSchema,
	vocabSessionDataSchema,
	vocabStudentLibraryCoursesResponseSchema,
	vocabStudentLibraryDecksResponseSchema,
	vocabSuggestionMutationResponseSchema,
} from "@teacher-os/api/contracts";
import { DAY_MS } from "@teacher-os/api/srs/scheduler";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore, StoredMedia } from "../lib/media-store";
import { ensureDeckCards } from "../lib/vocab-provision";
import type { SessionUser } from "../session";

const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

interface MemoryMediaStore extends MediaStore {
	objects: Map<string, { bytes: Uint8Array; contentType: string }>;
}

function createMemoryMediaStore(): MemoryMediaStore {
	const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
	return {
		objects,
		async put(key, body, meta) {
			const reader = body.getReader();
			const chunks: Uint8Array[] = [];
			let total = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					chunks.push(value);
					total += value.byteLength;
				}
			}
			const combined = new Uint8Array(total);
			let offset = 0;
			for (const chunk of chunks) {
				combined.set(chunk, offset);
				offset += chunk.byteLength;
			}
			objects.set(key, { bytes: combined, contentType: meta.contentType });
		},
		async get(key): Promise<StoredMedia | null> {
			const found = objects.get(key);
			if (!found) return null;
			return {
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(found.bytes);
						controller.close();
					},
				}),
				contentType: found.contentType,
				size: found.bytes.byteLength,
			};
		},
		async delete(key) {
			objects.delete(key);
		},
	};
}

describe("student vocab API (/api/student/vocab/*)", () => {
	let app: ServerApp;
	let libsql: Db;
	let mediaStore: MemoryMediaStore;

	const users: Record<string, SessionUser> = {
		studentA: {
			userId: "user-student-a",
			userName: "Minh A",
			email: "minh-a@test.local",
			emailVerified: true,
			role: "student",
		},
		studentB: {
			userId: "user-student-b",
			userName: "Trung B",
			email: "trung-b@test.local",
			emailVerified: true,
			role: "student",
		},
	};

	const headersFor = (
		who: "studentA" | "studentB",
		origin: string | null = STUDENT_ORIGIN,
	) => {
		const h: Record<string, string> = {
			"x-test-user": who,
			"Content-Type": "application/json",
		};
		if (origin !== null) h.Origin = origin;
		return h;
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		await client.execute("PRAGMA foreign_keys = ON;");
		libsql = db as unknown as Db;
		mediaStore = createMemoryMediaStore();

		await libsql
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy 1" });

		await libsql.insert(schema.student).values([
			{
				id: "student-a",
				orgId: "org-1",
				name: "Minh A",
				email: "minh-a@test.local",
				phone: "0901111111",
			},
			{
				id: "student-b",
				orgId: "org-1",
				name: "Trung B",
				email: "trung-b@test.local",
				phone: "0902222222",
			},
		]);

		await libsql.insert(schema.classTable).values([
			{
				id: "class-enrolled",
				orgId: "org-1",
				name: "IELTS 6.5",
				level: "IELTS",
				mode: "Online",
				schedule: "T2",
				sessionsDone: 0,
				sessionsTotal: 10,
				status: "active",
			},
			{
				id: "class-other",
				orgId: "org-1",
				name: "TOEIC 700",
				level: "TOEIC",
				mode: "Online",
				schedule: "T4",
				sessionsDone: 0,
				sessionsTotal: 10,
				status: "active",
			},
		]);

		// Only student-a is actively enrolled in class-enrolled; student-b is enrolled in class-other
		await libsql.insert(schema.enrollment).values([
			{
				id: "enr-a",
				orgId: "org-1",
				classId: "class-enrolled",
				studentId: "student-a",
				status: "active",
			},
			{
				id: "enr-b",
				orgId: "org-1",
				classId: "class-other",
				studentId: "student-b",
				status: "active",
			},
		]);

		const deckCreatedAt = new Date("2026-10-01T00:00:00Z");
		await libsql.insert(schema.vocabDeck).values([
			{
				id: "deck-1",
				orgId: "org-1",
				classId: "class-enrolled",
				title: "Environment Vocab",
				lang: "en",
				createdAt: deckCreatedAt,
				updatedAt: deckCreatedAt,
			},
			{
				id: "deck-other",
				orgId: "org-1",
				classId: "class-other",
				title: "Business Vocab",
				lang: "en",
				createdAt: deckCreatedAt,
				updatedAt: deckCreatedAt,
			},
		]);

		await libsql.insert(schema.vocabWord).values([
			{
				id: "w-1",
				deckId: "deck-1",
				word: "resilient",
				ipa: "/rɪˈzɪl.i.ənt/",
				translation: "kiên cường",
				audioKey: "vocab/org-1/w-1/audio.mp3",
				sortOrder: 0,
			},
			{
				id: "w-2",
				deckId: "deck-1",
				word: "sustainable",
				ipa: null,
				translation: "bền vững",
				audioKey: null,
				sortOrder: 1,
			},
			{
				id: "w-3",
				deckId: "deck-1",
				word: "biodiversity",
				ipa: null,
				translation: "đa dạng sinh học",
				audioKey: null,
				sortOrder: 2,
			},
			{
				id: "w-other-1",
				deckId: "deck-other",
				word: "invoice",
				ipa: null,
				translation: "hoá đơn",
				audioKey: "vocab/org-1/w-other-1/audio.mp3",
				sortOrder: 0,
			},
		]);

		mediaStore.objects.set("vocab/org-1/w-1/audio.mp3", {
			bytes: new Uint8Array([1, 2, 3, 4]),
			contentType: "audio/mpeg",
		});
		mediaStore.objects.set("vocab/org-1/w-other-1/audio.mp3", {
			bytes: new Uint8Array([5, 6, 7, 8]),
			contentType: "audio/mpeg",
		});

		app = buildApp({
			getDb: () => libsql,
			getMediaStore: () => mediaStore,
			corsOrigin: [STUDENT_ORIGIN],
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user") ?? "";
				return users[key] ?? null;
			},
		});
	});

	test("RT#1 auth gate: unauthenticated request to /api/student/vocab/* returns 401", async () => {
		const res = await app.request(
			"/api/student/vocab/decks/deck-1/session-data",
		);
		expect(res.status).toBe(401);
	});

	test("CSRF gate: POST /api/student/vocab/answer without Origin returns 403", async () => {
		const res = await app.request("/api/student/vocab/answer", {
			method: "POST",
			headers: headersFor("studentA", null),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: "any",
				correct: true,
				durationMs: 500,
			}),
		});
		expect(res.status).toBe(403);
	});

	test("IDOR enrollment gate (red-team F1): student not enrolled in deck class gets 404 on session-data and audio without provisioning cards", async () => {
		const resSession = await app.request(
			"/api/student/vocab/decks/deck-other/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(resSession.status).toBe(404);

		const cardsInOtherDeck = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-other-1"));
		expect(cardsInOtherDeck).toHaveLength(0);

		const resAudio = await app.request("/api/student/vocab/audio/w-other-1", {
			headers: { "x-test-user": "studentA" },
		});
		expect(resAudio.status).toBe(404);
	});

	test("lazy provision race (red-team F8): concurrent ensureDeckCards calls produce deterministic dueAt anchored to deck.createdAt", async () => {
		const [r1, r2] = await Promise.all([
			ensureDeckCards(libsql, "student-a", "org-1", "deck-1"),
			ensureDeckCards(libsql, "student-a", "org-1", "deck-1"),
		]);
		expect(r1).not.toBeNull();
		expect(r2).not.toBeNull();
		expect(r1!.cards).toHaveLength(3);
		expect(r2!.cards).toEqual(r1!.cards);

		const baseMs = new Date("2026-10-01T00:00:00Z").getTime();
		expect(r1!.cards.map((c) => c.dueAt)).toEqual([
			baseMs - 2,
			baseMs - 1,
			baseMs,
		]);
	});

	test("overview due metrics (red-team F5): 3 new unstudied cards yield dueCount = 0 and newCount = 3", async () => {
		const res = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		expect(res.status).toBe(200);
		const body = vocabOverviewSchema.parse(await res.json());
		expect(body.dueCount).toBe(0);
		expect(body.nextDueAt).toBeNull();
		expect(body.upcomingCount).toBe(0);
		expect(body.levelDistribution).toEqual([0, 0, 0, 0, 0]);
		expect(body.decks).toEqual([
			{
				deckId: "deck-1",
				title: "Environment Vocab",
				className: "IELTS 6.5",
				source: "class",
				total: 3,
				newCount: 3,
				dueCount: 0,
			},
		]);
	});

	test("session-data returns strict schema with cards and distractor pool, and audio stream sets nosniff + sandbox", async () => {
		const res = await app.request(
			"/api/student/vocab/decks/deck-1/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(res.status).toBe(200);
		const data = vocabSessionDataSchema.parse(await res.json());
		expect(data.deck.id).toBe("deck-1");
		expect(data.cards).toHaveLength(3);
		expect(data.pool).toHaveLength(3);

		const audioRes = await app.request("/api/student/vocab/audio/w-1", {
			headers: { "x-test-user": "studentA" },
		});
		expect(audioRes.status).toBe(200);
		expect(audioRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(audioRes.headers.get("Content-Security-Policy")).toContain(
			"sandbox",
		);
	});

	test("ownership gate: studentB cannot answer or learn-commit studentA's card (404)", async () => {
		const [cardA] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.studentId, "student-a"))
			.limit(1);

		const res = await app.request("/api/student/vocab/learn-commit", {
			method: "POST",
			headers: headersFor("studentB"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: cardA!.id,
				gradeGood: true,
				durationMs: 1000,
			}),
		});
		expect(res.status).toBe(404);
	});

	test("learn-commit clamps durationMs at VOCAB_DURATION_MAX_MS and transitions card to state='review', dueAt=now+1d", async () => {
		const [card1] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-1"))
			.limit(1);

		const logId = crypto.randomUUID();
		const before = Date.now();
		const res = await app.request("/api/student/vocab/learn-commit", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: logId,
				cardId: card1!.id,
				gradeGood: true,
				durationMs: 4_000_000,
			}),
		});
		expect(res.status).toBe(200);
		const parsed = vocabCardMutationResponseSchema.parse(await res.json());
		expect(parsed.card.state).toBe("review");
		expect(parsed.card.level).toBe(1);
		expect(parsed.card.intervalDays).toBe(1);
		expect(parsed.card.dueAt).toBeGreaterThanOrEqual(before + DAY_MS);

		const [logRow] = await libsql
			.select()
			.from(schema.vocabReviewLog)
			.where(eq(schema.vocabReviewLog.id, logId));
		expect(logRow?.durationMs).toBe(VOCAB_DURATION_MAX_MS);
		expect(logRow?.grade).toBe("good");
		expect(logRow?.sessionKind).toBe("learn");
	});

	test("concurrent idempotency (red-team F6): Promise.all with same clientLogId applies answer once and both return 200", async () => {
		const [card1] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-1"))
			.limit(1);

		// Make card1 due now
		await libsql
			.update(schema.vocabCard)
			.set({ dueAt: Date.now() - 1000, state: "review", level: 1 })
			.where(eq(schema.vocabCard.id, card1!.id));

		const sharedLogId = crypto.randomUUID();
		const payload = JSON.stringify({
			clientLogId: sharedLogId,
			cardId: card1!.id,
			correct: true,
			durationMs: 1200,
		});

		const [res1, res2] = await Promise.all([
			app.request("/api/student/vocab/answer", {
				method: "POST",
				headers: headersFor("studentA"),
				body: payload,
			}),
			app.request("/api/student/vocab/answer", {
				method: "POST",
				headers: headersFor("studentA"),
				body: payload,
			}),
		]);

		expect(res1.status).toBe(200);
		expect(res2.status).toBe(200);
		const body1 = vocabCardMutationResponseSchema.parse(await res1.json());
		const body2 = vocabCardMutationResponseSchema.parse(await res2.json());
		// Applied once: L1 + correct -> L2 (intervalDays = 3), NOT L3
		expect(body1.card.level).toBe(2);
		expect(body2.card.level).toBe(2);
		expect(body1.card.intervalDays).toBe(3);

		const logs = await libsql
			.select()
			.from(schema.vocabReviewLog)
			.where(eq(schema.vocabReviewLog.id, sharedLogId));
		expect(logs).toHaveLength(1);

		// Cross-session guard: card1 now has dueAt > now -> another answer with a NEW clientLogId does not apply again
		const crossSessionRes = await app.request("/api/student/vocab/answer", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: card1!.id,
				correct: true,
				durationMs: 800,
			}),
		});
		expect(crossSessionRes.status).toBe(200);
		const crossBody = vocabCardMutationResponseSchema.parse(
			await crossSessionRes.json(),
		);
		expect(crossBody.card.level).toBe(2);
	});

	test("batch atomicity: when db.batch fails on log insert, card is not updated", async () => {
		const [card2] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-2"))
			.limit(1);

		await libsql
			.update(schema.vocabCard)
			.set({ state: "review", level: 1, dueAt: Date.now() - 5000 })
			.where(eq(schema.vocabCard.id, card2!.id));

		const failingDb = new Proxy(libsql, {
			get(target, prop, receiver) {
				if (prop === "batch") {
					return async () => {
						throw new Error("simulated batch failure");
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		const failingApp = buildApp({
			getDb: () => failingDb,
			corsOrigin: [STUDENT_ORIGIN],
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user") ?? "";
				return users[key] ?? null;
			},
		});

		const res = await failingApp.request("/api/student/vocab/answer", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: card2!.id,
				correct: true,
				durationMs: 900,
			}),
		});
		expect(res.status).toBe(500);

		const [after] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.id, card2!.id));
		expect(after?.level).toBe(1);
	});

	test("streak and forecast rules (red-team F12): yesterday-only keeps streak=1, yesterday+today=2, 1-day gap=0, forecast excludes overdue", async () => {
		const now = Date.now();
		// Clear logs for student-a
		await libsql
			.delete(schema.vocabReviewLog)
			.where(eq(schema.vocabReviewLog.studentId, "student-a"));

		// 1) Log only yesterday -> streak = 1
		await libsql.insert(schema.vocabReviewLog).values({
			id: crypto.randomUUID(),
			studentId: "student-a",
			cardId: "c-any",
			deckId: "deck-1",
			sessionKind: "review",
			grade: "good",
			durationMs: 1000,
			reviewedAt: new Date(now - DAY_MS),
			word: "resilient",
			translation: "kiên cường",
		});

		let res = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		let overview = vocabOverviewSchema.parse(await res.json());
		expect(overview.streak).toBe(1);

		// 2) Add log today -> streak = 2
		await libsql.insert(schema.vocabReviewLog).values({
			id: crypto.randomUUID(),
			studentId: "student-a",
			cardId: "c-any",
			deckId: "deck-1",
			sessionKind: "review",
			grade: "again",
			durationMs: 1000,
			reviewedAt: new Date(now),
			word: "resilient",
			translation: "kiên cường",
		});

		res = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		overview = vocabOverviewSchema.parse(await res.json());
		expect(overview.streak).toBe(2);
		expect(overview.retention).toBe(50);

		// 3) Only log 2 days ago (gap yesterday & today) -> streak = 0
		await libsql
			.delete(schema.vocabReviewLog)
			.where(eq(schema.vocabReviewLog.studentId, "student-a"));
		await libsql.insert(schema.vocabReviewLog).values({
			id: crypto.randomUUID(),
			studentId: "student-a",
			cardId: "c-any",
			deckId: "deck-1",
			sessionKind: "review",
			grade: "good",
			durationMs: 1000,
			reviewedAt: new Date(now - 2 * DAY_MS),
			word: "resilient",
			translation: "kiên cường",
		});

		// Set card2 to overdue 2 days ago -> must NOT appear in 7-day forecast
		const [card2] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-2"))
			.limit(1);
		await libsql
			.update(schema.vocabCard)
			.set({ state: "review", dueAt: now - 2 * DAY_MS })
			.where(eq(schema.vocabCard.id, card2!.id));

		res = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		overview = vocabOverviewSchema.parse(await res.json());
		expect(overview.streak).toBe(0);
		expect(overview.dueCount).toBe(1);
		// card1 is due in +3 days -> forecast[3] = 1, overdue card2 excluded from forecast
		expect(overview.forecast.reduce((a, b) => a + b, 0)).toBe(1);
	});

	test("review answer on a NEW (not learned) card is rejected 409 CARD_NOT_DUE (review I1)", async () => {
		const [card3] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-3"));
		expect(card3?.state).toBe("new");

		const res = await app.request("/api/student/vocab/answer", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: card3!.id,
				correct: true,
				durationMs: 500,
			}),
		});
		expect(res.status).toBe(409);
		const body = (await res.json()) as { code?: string };
		expect(body.code).toBe("VOCAB_CARD_NOT_DUE");

		// Card không đổi trạng thái, không sinh log.
		const [after] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.id, card3!.id));
		expect(after?.state).toBe("new");
		expect(after?.level).toBe(1);
	});

	// Chạy CUỐI describe: mutate card3 lên L5 review (mốc +1h) — các test
	// trước phải giữ trạng thái cũ (streak test dùng dueCount/forecast).
	test("overview exposes positive states: learnedCount (L2+), matureCount (L5), levelDistribution, nextDueAt + upcomingCount", async () => {
		const [card3] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.wordId, "w-3"));
		await libsql
			.update(schema.vocabCard)
			.set({ state: "review", level: 5, dueAt: Date.now() + 3_600_000 })
			.where(eq(schema.vocabCard.id, card3!.id));

		const dbRows = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.studentId, "student-a"));

		const res = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		expect(res.status).toBe(200);
		const overview = vocabOverviewSchema.parse(await res.json());

		expect(overview.learnedCount).toBe(
			dbRows.filter((c) => c.level >= 2).length,
		);
		expect(overview.matureCount).toBe(
			dbRows.filter((c) => c.level === 5).length,
		);
		// distribution tổng số card review của student-a.
		expect(overview.levelDistribution.reduce((a, b) => a + b, 0)).toBe(
			dbRows.filter((c) => c.state === "review").length,
		);
		// card2 due trong tương lai 1h → nextDueAt != null, upcomingCount >= 1.
		expect(overview.nextDueAt).not.toBeNull();
		expect(overview.upcomingCount).toBeGreaterThanOrEqual(1);

		// card3 (dueAt +1h, cùng ngày VN hôm nay) rơi vào bucket 0;
		// card1 overdue (dueAt 2 ngày trước) KHÔNG nằm trong bucket nào;
		// card2 (applyAnswer +3d khi trả lời đúng) nằm trong bucket 3.
		expect(overview.forecast.reduce((a, b) => a + b, 0)).toBe(2);
	});

	test("remote audio proxy (#361): follows 301 cross-host redirect, works when mediaStore is undefined, enforces allowlist/5MB/content-type, and prioritizes audioKey", async () => {
		// Add a word with audioUrl only (and no audioKey)
		await libsql.insert(schema.vocabWord).values({
			id: "w-remote",
			deckId: "deck-1",
			word: "teacher",
			ipa: "/ˈtiːtʃər/",
			translation: "Giáo viên",
			audioKey: null,
			audioUrl:
				"https://mochien3.1-api.mochidemy.com/public/audios/question/teacher.mp3",
			sortOrder: 3,
		});

		// 1) Session-data reports hasAudio: true for w-1 (audioKey) and w-remote (audioUrl), false for w-2
		const sessionRes = await app.request(
			"/api/student/vocab/decks/deck-1/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(sessionRes.status).toBe(200);
		const sessionData = vocabSessionDataSchema.parse(await sessionRes.json());
		const cardByWordId = new Map(
			sessionData.cards.map((c) => [c.wordId, c.hasAudio]),
		);
		expect(cardByWordId.get("w-1")).toBe(true);
		expect(cardByWordId.get("w-remote")).toBe(true);
		expect(cardByWordId.get("w-2")).toBe(false);

		// 2) 301 cross-host redirect where first hop is text/html and final hop is 200 audio/mpeg
		//    AND tested on an app instance with getMediaStore: () => undefined!
		const appWithoutStore = buildApp({
			getDb: () => libsql,
			getMediaStore: () => undefined,
			corsOrigin: [STUDENT_ORIGIN],
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user") ?? "";
				return users[key] ?? null;
			},
		});

		const mp3Bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockImplementationOnce(
				async () =>
					new Response("<html>301 Moved Permanently</html>", {
						status: 301,
						headers: {
							"content-type": "text/html",
							location:
								"https://mochien-server.mochidemy.com/public/audios/question/teacher.mp3",
						},
					}),
			)
			.mockImplementationOnce(
				async () =>
					new Response(mp3Bytes, {
						status: 200,
						headers: {
							"content-type": "audio/mpeg",
						},
					}),
			);

		try {
			const proxyRes = await appWithoutStore.request(
				"/api/student/vocab/audio/w-remote",
				{ headers: { "x-test-user": "studentA" } },
			);
			expect(proxyRes.status).toBe(200);
			expect(proxyRes.headers.get("Content-Type")).toBe("audio/mpeg");
			expect(proxyRes.headers.get("Cache-Control")).toBe(
				"private, max-age=86400",
			);
			expect(proxyRes.headers.get("X-Content-Type-Options")).toBe("nosniff");
			const buf = new Uint8Array(await proxyRes.arrayBuffer());
			expect(Array.from(buf)).toEqual([0xff, 0xfb, 0x90, 0x64]);
			expect(fetchSpy).toHaveBeenCalledTimes(2);

			// Missing store on a word with audioKey still returns 503
			const keyWithoutStoreRes = await appWithoutStore.request(
				"/api/student/vocab/audio/w-1",
				{ headers: { "x-test-user": "studentA" } },
			);
			expect(keyWithoutStoreRes.status).toBe(503);

			// Upstream 500 -> 404 AUDIO_NOT_FOUND
			fetchSpy.mockImplementationOnce(
				async () => new Response("Internal Server Error", { status: 500 }),
			);
			const failRes = await appWithoutStore.request(
				"/api/student/vocab/audio/w-remote",
				{ headers: { "x-test-user": "studentA" } },
			);
			expect(failRes.status).toBe(404);

			// Non-allowlisted host -> 404 without calling fetch
			await libsql
				.update(schema.vocabWord)
				.set({ audioUrl: "https://evil.example.com/audio.mp3" })
				.where(eq(schema.vocabWord.id, "w-remote"));
			fetchSpy.mockClear();
			const blockedHostRes = await appWithoutStore.request(
				"/api/student/vocab/audio/w-remote",
				{ headers: { "x-test-user": "studentA" } },
			);
			expect(blockedHostRes.status).toBe(404);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test("independent deck & suggestion lifecycle (#363): 5-site access predicate, CSRF guard, IDOR negative, dismiss 409 on accepted, re-suggest upsert, and class>suggested dedupe", async () => {
		// Seed a teacher user + an independent deck (classId = null) with 2 words (1 with audioKey)
		await libsql.insert(schema.user).values({
			id: "teacher-1",
			name: "Teacher One",
			email: "t1@test.local",
			emailVerified: true,
			createdAt: new Date(1_700_000_000_000),
			updatedAt: new Date(1_700_000_000_000),
		});

		await libsql.insert(schema.vocabDeck).values([
			{
				id: "deck-indep-1",
				orgId: "org-1",
				classId: null,
				title: "TOEIC 600 Independent",
				lang: "en",
				createdAt: new Date("2026-10-10T00:00:00Z"),
				updatedAt: new Date("2026-10-10T00:00:00Z"),
			},
			{
				id: "deck-indep-2",
				orgId: "org-1",
				classId: null,
				title: "Academic Collocations",
				lang: "en",
				createdAt: new Date("2026-10-11T00:00:00Z"),
				updatedAt: new Date("2026-10-11T00:00:00Z"),
			},
		]);

		const indepAudioKey = "vocab/org-1/w-indep-1/audio.mp3";
		await mediaStore.put(
			indepAudioKey,
			new ReadableStream({
				start(c) {
					c.enqueue(new Uint8Array([0x11, 0x22, 0x33]));
					c.close();
				},
			}),
			{ contentType: "audio/mpeg", size: 3 },
		);

		await libsql.insert(schema.vocabWord).values([
			{
				id: "w-indep-1",
				deckId: "deck-indep-1",
				word: "negotiate",
				ipa: "/nɪˈɡəʊʃieɪt/",
				translation: "đàm phán",
				audioKey: indepAudioKey,
				sortOrder: 0,
			},
			{
				id: "w-indep-2",
				deckId: "deck-indep-1",
				word: "agenda",
				ipa: "/əˈdʒendə/",
				translation: "chương trình nghị sự",
				audioKey: null,
				sortOrder: 1,
			},
			{
				id: "w-indep-3",
				deckId: "deck-indep-2",
				word: "hypothesis",
				ipa: "/haɪˈpɒθəsɪs/",
				translation: "giả thuyết",
				audioKey: null,
				sortOrder: 0,
			},
		]);

		// (c) Before suggestion is created/accepted: deck-indep-1 is 404 across session-data & audio
		const preSession = await app.request(
			"/api/student/vocab/decks/deck-indep-1/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(preSession.status).toBe(404);

		const preAudio = await app.request("/api/student/vocab/audio/w-indep-1", {
			headers: { "x-test-user": "studentA" },
		});
		expect(preAudio.status).toBe(404);

		// Seed 2 pending suggestions for student-a
		await libsql.insert(schema.vocabSuggestion).values([
			{
				id: "sug-a-1",
				orgId: "org-1",
				teacherId: "teacher-1",
				studentId: "student-a",
				deckId: "deck-indep-1",
				note: "Ôn trước thứ 7 nhé",
				status: "pending",
				createdAt: new Date("2026-10-19T01:00:00Z"),
			},
			{
				id: "sug-a-2",
				orgId: "org-1",
				teacherId: "teacher-1",
				studentId: "student-a",
				deckId: "deck-indep-2",
				note: "Đọc thêm",
				status: "pending",
				createdAt: new Date("2026-10-19T02:00:00Z"),
			},
		]);

		// Pending suggestion does NOT grant deck access yet (session-data/audio still 404)
		const pendingSession = await app.request(
			"/api/student/vocab/decks/deck-indep-1/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(pendingSession.status).toBe(404);

		// Student A overview lists both pending suggestions with wordCount & note, but NOT in decks[]
		const ovRes1 = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		const ov1 = vocabOverviewSchema.parse(await ovRes1.json());
		expect(ov1.suggestions).toEqual([
			{
				id: "sug-a-1",
				deckId: "deck-indep-1",
				title: "TOEIC 600 Independent",
				wordCount: 2,
				note: "Ôn trước thứ 7 nhé",
				createdAt: "2026-10-19T01:00:00.000Z",
			},
			{
				id: "sug-a-2",
				deckId: "deck-indep-2",
				title: "Academic Collocations",
				wordCount: 1,
				note: "Đọc thêm",
				createdAt: "2026-10-19T02:00:00.000Z",
			},
		]);
		expect(ov1.decks.some((d) => d.deckId === "deck-indep-1")).toBe(false);

		// (c) IDOR: Student B sees 0 suggestions and gets 404 on accept/dismiss of A's suggestion
		const ovResB = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentB" },
		});
		const ovB = vocabOverviewSchema.parse(await ovResB.json());
		expect(ovB.suggestions).toEqual([]);

		const idorAccept = await app.request(
			"/api/student/vocab/suggestions/sug-a-1/accept",
			{
				method: "POST",
				headers: headersFor("studentB"),
				body: JSON.stringify({}),
			},
		);
		expect(idorAccept.status).toBe(404);

		const idorDismiss = await app.request(
			"/api/student/vocab/suggestions/sug-a-2/dismiss",
			{
				method: "POST",
				headers: headersFor("studentB"),
				body: JSON.stringify({}),
			},
		);
		expect(idorDismiss.status).toBe(404);

		// (c) CSRF guard: foreign Origin on accept & dismiss -> 403
		const csrfAccept = await app.request(
			"/api/student/vocab/suggestions/sug-a-1/accept",
			{
				method: "POST",
				headers: headersFor("studentA", "https://evil.example.com"),
				body: JSON.stringify({}),
			},
		);
		expect(csrfAccept.status).toBe(403);

		const csrfDismiss = await app.request(
			"/api/student/vocab/suggestions/sug-a-2/dismiss",
			{
				method: "POST",
				headers: headersFor("studentA", "https://evil.example.com"),
				body: JSON.stringify({}),
			},
		);
		expect(csrfDismiss.status).toBe(403);

		// (a) Student A accepts sug-a-1 (and verify idempotency on repeat accept)
		const acceptRes1 = await app.request(
			"/api/student/vocab/suggestions/sug-a-1/accept",
			{
				method: "POST",
				headers: headersFor("studentA"),
				body: JSON.stringify({}),
			},
		);
		expect(acceptRes1.status).toBe(200);
		const acceptData1 = vocabSuggestionMutationResponseSchema.parse(
			await acceptRes1.json(),
		);
		expect(acceptData1.status).toBe("accepted");
		expect(acceptData1.deckId).toBe("deck-indep-1");

		const acceptRes2 = await app.request(
			"/api/student/vocab/suggestions/sug-a-1/accept",
			{
				method: "POST",
				headers: headersFor("studentA"),
				body: JSON.stringify({}),
			},
		);
		expect(acceptRes2.status).toBe(200);
		const acceptData2 = vocabSuggestionMutationResponseSchema.parse(
			await acceptRes2.json(),
		);
		expect(acceptData2.respondedAt).toBe(acceptData1.respondedAt);

		// (b) Dismissing an already-accepted suggestion -> 409
		const dismissAccepted = await app.request(
			"/api/student/vocab/suggestions/sug-a-1/dismiss",
			{
				method: "POST",
				headers: headersFor("studentA"),
				body: JSON.stringify({}),
			},
		);
		expect(dismissAccepted.status).toBe(409);

		// (a) Verify all 5 call sites work for accepted independent deck:
		// Site 1: overview includes deck-indep-1 with source='suggested', className=''
		const ovRes2 = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		const ov2 = vocabOverviewSchema.parse(await ovRes2.json());
		const indepOverviewDeck = ov2.decks.find(
			(d) => d.deckId === "deck-indep-1",
		);
		expect(indepOverviewDeck).toEqual({
			deckId: "deck-indep-1",
			title: "TOEIC 600 Independent",
			className: "",
			source: "suggested",
			total: 2,
			newCount: 2,
			dueCount: 0,
		});
		expect(ov2.suggestions.map((s) => s.id)).toEqual(["sug-a-2"]);

		// Site 4 & Site 5: session-data provisions cards AND pool includes words from deck-indep-1
		const indepSessionRes = await app.request(
			"/api/student/vocab/decks/deck-indep-1/session-data",
			{ headers: { "x-test-user": "studentA" } },
		);
		expect(indepSessionRes.status).toBe(200);
		const indepSession = vocabSessionDataSchema.parse(
			await indepSessionRes.json(),
		);
		expect(indepSession.cards).toHaveLength(2);
		expect(indepSession.pool.some((p) => p.deckId === "deck-indep-1")).toBe(
			true,
		);

		// Site 2: learn-commit AND answer on card of independent deck
		const indepCard1 = indepSession.cards[0];
		expect(indepCard1).toBeDefined();
		const learnRes = await app.request("/api/student/vocab/learn-commit", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: indepCard1?.id,
				gradeGood: true,
				durationMs: 1200,
			}),
		});
		expect(learnRes.status).toBe(200);
		const learnedCard = vocabCardMutationResponseSchema.parse(
			await learnRes.json(),
		).card;
		expect(learnedCard.state).toBe("review");

		// Make indepCard1 due now and call POST /vocab/answer
		await libsql
			.update(schema.vocabCard)
			.set({ dueAt: Date.now() - 1000 })
			.where(eq(schema.vocabCard.id, indepCard1?.id ?? ""));
		const answerRes = await app.request("/api/student/vocab/answer", {
			method: "POST",
			headers: headersFor("studentA"),
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: indepCard1?.id,
				correct: true,
				durationMs: 900,
			}),
		});
		expect(answerRes.status).toBe(200);
		const answeredCard = vocabCardMutationResponseSchema.parse(
			await answerRes.json(),
		).card;
		expect(answeredCard.level).toBe(2);

		// Site 3: audio on word of independent deck
		const audioRes = await app.request("/api/student/vocab/audio/w-indep-1", {
			headers: { "x-test-user": "studentA" },
		});
		expect(audioRes.status).toBe(200);

		// (b) Dismiss pending sug-a-2 -> disappears from overview.suggestions
		const dismissRes = await app.request(
			"/api/student/vocab/suggestions/sug-a-2/dismiss",
			{
				method: "POST",
				headers: headersFor("studentA"),
				body: JSON.stringify({}),
			},
		);
		expect(dismissRes.status).toBe(200);
		const ovRes3 = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		const ov3 = vocabOverviewSchema.parse(await ovRes3.json());
		expect(ov3.suggestions).toEqual([]);

		// (e) Re-suggest after dismissed flips status back to pending (upsert)
		await libsql
			.insert(schema.vocabSuggestion)
			.values({
				id: "sug-a-2-new",
				orgId: "org-1",
				teacherId: "teacher-1",
				studentId: "student-a",
				deckId: "deck-indep-2",
				note: "Gợi ý lại lần 2",
				status: "pending",
				createdAt: new Date("2026-10-19T05:00:00Z"),
			})
			.onConflictDoUpdate({
				target: [
					schema.vocabSuggestion.studentId,
					schema.vocabSuggestion.deckId,
				],
				set: {
					status: "pending",
					note: "Gợi ý lại lần 2",
					respondedAt: null,
				},
			});
		const ovRes4 = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		const ov4 = vocabOverviewSchema.parse(await ovRes4.json());
		expect(ov4.suggestions).toEqual([
			expect.objectContaining({
				id: "sug-a-2",
				deckId: "deck-indep-2",
				note: "Gợi ý lại lần 2",
			}),
		]);

		// (f) Deck simultaneously enrolled (deck-1 in class-enrolled) AND accepted suggestion
		// appears ONCE in overview.decks with source='class' and className='IELTS 6.5'
		await libsql.insert(schema.vocabSuggestion).values({
			id: "sug-dup-class",
			orgId: "org-1",
			teacherId: "teacher-1",
			studentId: "student-a",
			deckId: "deck-1",
			status: "accepted",
			respondedAt: new Date("2026-10-19T06:00:00Z"),
		});
		const ovRes5 = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentA" },
		});
		const ov5 = vocabOverviewSchema.parse(await ovRes5.json());
		const deck1Matches = ov5.decks.filter((d) => d.deckId === "deck-1");
		expect(deck1Matches).toHaveLength(1);
		expect(deck1Matches[0]?.source).toBe("class");
		expect(deck1Matches[0]?.className).toBe("IELTS 6.5");
	});

	test("student full vocabulary courses (#366): browse courses & decks, chunked >10-word provisioning under PRAGMA foreign_keys=ON, cross-site guard, immediate reviewWordCount/reviewCount after learn-commit, answer, audio check, and overview source='library'", async () => {
		// Create a student with 0 enrollments and 0 suggestions
		users.studentZero = {
			userId: "user-student-zero",
			userName: "Lan Zero",
			email: "lan-zero@test.local",
			emailVerified: true,
			role: "student",
		};
		await libsql.insert(schema.student).values({
			id: "student-zero",
			orgId: "org-1",
			name: "Lan Zero",
			email: "lan-zero@test.local",
			phone: "0903333333",
		});

		// Seed library course, deck with 15 words (exceeds 10-row chunk threshold), and a second deck
		await libsql.insert(schema.vocabLibraryCourse).values({
			id: "libcourse-366",
			name: "IELTS Academic Reading",
			description: "Từ vựng học thuật IELTS Reading",
			target: "Band 6.5+",
			sortOrder: 1,
		});
		await libsql.insert(schema.vocabLibraryDeck).values([
			{
				id: "libdeck-366-1",
				courseId: "libcourse-366",
				title: "Bài 1: Môi trường (15 từ)",
				description: "1.Môi trường",
				imageUrl: null,
				sortOrder: 0,
			},
			{
				id: "libdeck-366-2",
				courseId: "libcourse-366",
				title: "Bài 2: Năng lượng",
				imageUrl: null,
				sortOrder: 1,
			},
		]);

		const fifteenWords = Array.from({ length: 15 }, (_, idx) => ({
			id: `libword-366-${idx + 1}`,
			deckId: "libdeck-366-1",
			word: `ecoword${idx + 1}`,
			ipa: `/ˈiːkəʊ.${idx + 1}/`,
			pos: "n",
			translation: `nghĩa sinh thái ${idx + 1}`,
			sentenceVi: `Câu ví dụ ${idx + 1}`,
			sentenceEn: `Example sentence ${idx + 1}`,
			pictureUrl: null,
			audioUrl:
				idx === 0
					? "https://mochien3.1-api.mochidemy.com/v3.1/words/audio/eco1.mp3"
					: null,
			sortOrder: idx,
		}));
		await libsql.insert(schema.vocabLibraryWord).values([
			...fifteenWords,
			{
				id: "libword-366-b1",
				deckId: "libdeck-366-2",
				word: "solar",
				ipa: "/ˈsəʊ.lər/",
				pos: "adj",
				translation: "thuộc mặt trời",
				sentenceVi: null,
				sentenceEn: null,
				pictureUrl: null,
				audioUrl: null,
				sortOrder: 0,
			},
		]);

		// 1) Browse courses as studentZero (0 enrollments, 0 suggestions)
		const coursesRes = await app.request("/api/student/vocab/library/courses", {
			headers: { "x-test-user": "studentZero" },
		});
		expect(coursesRes.status).toBe(200);
		const coursesData = vocabStudentLibraryCoursesResponseSchema.parse(
			await coursesRes.json(),
		);
		const course366 = coursesData.courses.find((c) => c.id === "libcourse-366");
		expect(course366).toEqual({
			id: "libcourse-366",
			name: "IELTS Academic Reading",
			description: "Từ vựng học thuật IELTS Reading",
			target: "Band 6.5+",
			deckCount: 2,
			wordCount: 16,
			reviewWordCount: 0,
			learnedWordCount: 0,
			dueWordCount: 0,
			sortOrder: 1,
		});

		// 2) Browse decks of libcourse-366 (and 404 on unknown course)
		const notFoundDecksRes = await app.request(
			"/api/student/vocab/library/courses/libcourse-missing/decks",
			{ headers: { "x-test-user": "studentZero" } },
		);
		expect(notFoundDecksRes.status).toBe(404);

		const decksRes = await app.request(
			"/api/student/vocab/library/courses/libcourse-366/decks",
			{ headers: { "x-test-user": "studentZero" } },
		);
		expect(decksRes.status).toBe(200);
		const decksData = vocabStudentLibraryDecksResponseSchema.parse(
			await decksRes.json(),
		);
		expect(decksData.course?.name).toBe("IELTS Academic Reading");
		expect(decksData.decks).toEqual([
			{
				id: "libdeck-366-1",
				courseId: "libcourse-366",
				title: "Bài 1: Môi trường (15 từ)",
				description: "1.Môi trường",
				imageUrl: null,
				wordCount: 15,
				newCount: 15,
				reviewCount: 0,
				dueCount: 0,
				learnedCount: 0,
				sortOrder: 0,
			},
			{
				id: "libdeck-366-2",
				courseId: "libcourse-366",
				title: "Bài 2: Năng lượng",
				description: null,
				imageUrl: null,
				wordCount: 1,
				newCount: 1,
				reviewCount: 0,
				dueCount: 0,
				learnedCount: 0,
				sortOrder: 1,
			},
		]);

		// 3) Before opening libdeck-366-1: audio for libword-366-1 is 404 (no vocab_card yet),
		// and overview.decks is empty (unstarted library decks do NOT clutter overview.decks)
		const preAudioRes = await app.request(
			"/api/student/vocab/audio/libword-366-1",
			{ headers: { "x-test-user": "studentZero" } },
		);
		expect(preAudioRes.status).toBe(404);

		const preOvRes = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentZero" },
		});
		const preOv = vocabOverviewSchema.parse(await preOvRes.json());
		expect(preOv.decks).toEqual([]);

		// 4) Cross-site Sec-Fetch-Site without allowed Origin is blocked (403 FORBIDDEN_ORIGIN)
		const crossSiteRes = await app.request(
			"/api/student/vocab/decks/libdeck-366-1/session-data",
			{
				headers: {
					"x-test-user": "studentZero",
					"Sec-Fetch-Site": "cross-site",
					Origin: "https://evil.example.com",
				},
			},
		);
		expect(crossSiteRes.status).toBe(403);

		// 5) Open session-data for libdeck-366-1 -> lazy-provisions 15 cards in chunks of <=10,
		// does NOT create any vocab_deck row, and includes same-course fallback word in pool
		const orgDecksBefore = await libsql.select().from(schema.vocabDeck);
		const sessionRes = await app.request(
			"/api/student/vocab/decks/libdeck-366-1/session-data",
			{ headers: { "x-test-user": "studentZero" } },
		);
		expect(sessionRes.status).toBe(200);
		const sessionData = vocabSessionDataSchema.parse(await sessionRes.json());
		expect(sessionData.deck).toEqual({
			id: "libdeck-366-1",
			title: "Bài 1: Môi trường (15 từ)",
			lang: "en",
		});
		expect(sessionData.cards).toHaveLength(15);
		expect(sessionData.cards[0]?.wordId).toBe("libword-366-1");
		expect(sessionData.cards[0]?.hasAudio).toBe(true);
		expect(sessionData.cards[1]?.hasAudio).toBe(false);
		// Same-course fallback included "libword-366-b1" since pool had <20 words
		expect(sessionData.pool.some((p) => p.wordId === "libword-366-b1")).toBe(
			true,
		);

		const orgDecksAfter = await libsql.select().from(schema.vocabDeck);
		expect(orgDecksAfter).toHaveLength(orgDecksBefore.length);

		// 6) Learn-commit on first card -> state='review', level=1 -> reviewWordCount & reviewCount become 1 immediately
		const firstCard = sessionData.cards[0];
		if (!firstCard) throw new Error("expected first card");

		const learnRes = await app.request("/api/student/vocab/learn-commit", {
			method: "POST",
			headers: {
				"x-test-user": "studentZero",
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: firstCard.id,
				gradeGood: true,
				durationMs: 1200,
			}),
		});
		expect(learnRes.status).toBe(200);
		const learnBody = vocabCardMutationResponseSchema.parse(
			await learnRes.json(),
		);
		expect(learnBody.card.state).toBe("review");
		expect(learnBody.card.level).toBe(1);

		// Verify reviewWordCount=1 on courses and reviewCount=1, newCount=14 on decks immediately
		const coursesAfterLearn = vocabStudentLibraryCoursesResponseSchema.parse(
			await (
				await app.request("/api/student/vocab/library/courses", {
					headers: { "x-test-user": "studentZero" },
				})
			).json(),
		);
		const courseAfterLearn = coursesAfterLearn.courses.find(
			(c) => c.id === "libcourse-366",
		);
		expect(courseAfterLearn?.reviewWordCount).toBe(1);
		expect(courseAfterLearn?.learnedWordCount).toBe(0);

		const decksAfterLearn = vocabStudentLibraryDecksResponseSchema.parse(
			await (
				await app.request(
					"/api/student/vocab/library/courses/libcourse-366/decks",
					{ headers: { "x-test-user": "studentZero" } },
				)
			).json(),
		);
		const deck1AfterLearn = decksAfterLearn.decks.find(
			(d) => d.id === "libdeck-366-1",
		);
		expect(deck1AfterLearn).toMatchObject({
			wordCount: 15,
			newCount: 14,
			reviewCount: 1,
			learnedCount: 0,
		});

		// 7) Make card due and submit review answer -> level=2 -> learnedWordCount=1 & learnedCount=1
		await libsql
			.update(schema.vocabCard)
			.set({ dueAt: Date.now() - 5000 })
			.where(eq(schema.vocabCard.id, firstCard.id));

		const answerRes = await app.request("/api/student/vocab/answer", {
			method: "POST",
			headers: {
				"x-test-user": "studentZero",
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				clientLogId: crypto.randomUUID(),
				cardId: firstCard.id,
				correct: true,
				durationMs: 900,
			}),
		});
		expect(answerRes.status).toBe(200);
		const answerBody = vocabCardMutationResponseSchema.parse(
			await answerRes.json(),
		);
		expect(answerBody.card.level).toBe(2);

		// 8) Overview now includes libdeck-366-1 with source='library' and className='IELTS Academic Reading'
		const postOvRes = await app.request("/api/student/vocab/overview", {
			headers: { "x-test-user": "studentZero" },
		});
		const postOv = vocabOverviewSchema.parse(await postOvRes.json());
		expect(postOv.learnedCount).toBe(1);
		expect(postOv.decks).toEqual([
			{
				deckId: "libdeck-366-1",
				title: "Bài 1: Môi trường (15 từ)",
				className: "IELTS Academic Reading",
				source: "library",
				total: 15,
				newCount: 14,
				dueCount: 0,
			},
		]);

		// 9) Audio on libword-366-2 (null audioUrl) returns 404 cleanly
		const nullAudioRes = await app.request(
			"/api/student/vocab/audio/libword-366-2",
			{ headers: { "x-test-user": "studentZero" } },
		);
		expect(nullAudioRes.status).toBe(404);
	});
});
