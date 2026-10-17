import { createClient } from "@libsql/client";
import {
	VOCAB_DURATION_MAX_MS,
	vocabCardMutationResponseSchema,
	vocabOverviewSchema,
	vocabSessionDataSchema,
} from "@teacher-os/api/contracts";
import { DAY_MS } from "@teacher-os/api/srs/scheduler";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore, StoredMedia } from "../lib/media-store";
import { ensureDeckCards } from "../lib/vocab-provision";
import type { SessionUser } from "../session";

const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

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
});
