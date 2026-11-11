import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	type KernelSnapshot,
	vocabStudentProgressResponseSchema,
	vocabTeacherSuggestionsResponseSchema,
	vocabTeacherWordsResponseSchema,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore, StoredMedia } from "../lib/media-store";
import type { SessionUser } from "../session";

const TEACHER_ORIGIN = "http://localhost:8001";
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

describe("teacher vocab kernel sub-routes (/api/kernel/vocab/* & snapshot)", () => {
	let app: ServerApp;
	let libsql: Db;
	let mediaStore: MemoryMediaStore;

	const teacherUser: SessionUser = {
		userId: "teacher-1",
		userName: "Ms. My",
		email: "teacher@test.local",
		emailVerified: true,
		role: "teacher",
	};

	const teacherHeaders = {
		"x-test-user": "teacher",
		Origin: TEACHER_ORIGIN,
		"Content-Type": "application/json",
	};

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		// Explicitly disable foreign_keys to prove batch delete does NOT rely on FK cascade (red-team F7)
		await client.execute("PRAGMA foreign_keys = OFF");
		libsql = db as unknown as Db;
		mediaStore = createMemoryMediaStore();

		await libsql.insert(schema.user).values({
			id: "teacher-1",
			name: "Ms. My",
			email: "teacher@test.local",
			emailVerified: true,
			role: "teacher",
		});
		await libsql
			.insert(schema.organization)
			.values({ id: "org-t1", name: "Teacher Org" });
		await libsql.insert(schema.membership).values({
			id: "mem-t1",
			orgId: "org-t1",
			userId: "teacher-1",
			role: "teacher",
		});
		await libsql.insert(schema.classTable).values({
			id: "class-t1",
			orgId: "org-t1",
			name: "IELTS Intensive",
			level: "IELTS",
			mode: "Online",
			schedule: "T3",
			sessionsDone: 0,
			sessionsTotal: 12,
			status: "active",
		});
		await libsql.insert(schema.student).values({
			id: "student-t1",
			orgId: "org-t1",
			name: "Student T1",
			email: "st1@test.local",
			phone: "0903333333",
		});

		app = buildApp({
			getDb: () => libsql,
			getMediaStore: () => mediaStore,
			corsOrigin: [TEACHER_ORIGIN],
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				if (headers.get("x-test-user") === "teacher") return teacherUser;
				return null;
			},
		});
	});

	test("creates, renames, upserts words, uploads audio, exposes vocabDecks in snapshot (without vocabWords), and batch-deletes deck leaving 0 orphan words/cards while keeping review_log", async () => {
		// 1) Create deck
		const createRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				title: "Topic 1: Education",
				lang: "en",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: deckId } = (await createRes.json()) as { id: string };

		// 2) Rename deck
		const renameRes = await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				title: "Topic 1: Higher Education",
			}),
		});
		expect(renameRes.status).toBe(200);

		// 3) Upsert 2 words
		const w1Res = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "curriculum",
				ipa: "/kəˈrɪk.jə.ləm/",
				translation: "chương trình học",
				sortOrder: 0,
			}),
		});
		expect(w1Res.status).toBe(201);
		const { id: word1Id } = (await w1Res.json()) as { id: string };

		const w2Res = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "pedagogy",
				translation: "sư phạm",
				sortOrder: 1,
			}),
		});
		expect(w2Res.status).toBe(201);
		const { id: word2Id } = (await w2Res.json()) as { id: string };

		// 4) Upload audio for word1 (server generates org-scoped key)
		const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x64]);
		const uploadRes = await app.request(
			`/api/kernel/vocab/words/${word1Id}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(audioBytes.byteLength),
				},
				body: audioBytes,
			},
		);
		expect(uploadRes.status).toBe(200);
		const uploadJson = (await uploadRes.json()) as {
			id: string;
			audioKey: string;
		};
		expect(uploadJson.audioKey).toMatch(
			new RegExp(`^vocab/org-t1/${word1Id}/`),
		);

		// Reject non-audio MIME on audio upload
		const badMimeRes = await app.request(
			`/api/kernel/vocab/words/${word1Id}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "text/html",
					"Content-Length": "4",
				},
				body: new Uint8Array([1, 2, 3, 4]),
			},
		);
		expect(badMimeRes.status).toBe(415);

		// 5) GET words per deck
		const wordsRes = await app.request(
			`/api/kernel/vocab/decks/${deckId}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(wordsRes.status).toBe(200);
		const wordsData = vocabTeacherWordsResponseSchema.parse(
			await wordsRes.json(),
		);
		expect(wordsData.words).toHaveLength(2);
		expect(wordsData.words[0]?.audioKey).toBe(uploadJson.audioKey);

		// 6) Check kernel snapshot contains vocabDecks with aggregate wordCount = 2 and NO vocabWords
		const snapRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		expect(snapRes.status).toBe(200);
		const snapRaw = (await snapRes.json()) as KernelSnapshot &
			Record<string, unknown>;
		expect(snapRaw.vocabDecks).toEqual([
			expect.objectContaining({
				id: deckId,
				classId: "class-t1",
				title: "Topic 1: Higher Education",
				lang: "en",
				wordCount: 2,
			}),
		]);
		expect(snapRaw.vocabWords).toBeUndefined();

		// 7) Seed a vocab_card and vocab_review_log for word1 + word2, then delete deck
		await libsql.insert(schema.vocabCard).values([
			{
				id: "card-w1",
				studentId: "student-t1",
				wordId: word1Id,
				level: 2,
				isWarning: false,
				state: "review",
				intervalDays: 3,
				dueAt: Date.now(),
				lapses: 0,
			},
			{
				id: "card-w2",
				studentId: "student-t1",
				wordId: word2Id,
				level: 1,
				isWarning: false,
				state: "new",
				intervalDays: 0,
				dueAt: Date.now(),
				lapses: 0,
			},
		]);
		await libsql.insert(schema.vocabReviewLog).values({
			id: "log-survive-1",
			studentId: "student-t1",
			cardId: "card-w1",
			deckId,
			sessionKind: "review",
			grade: "good",
			durationMs: 1100,
			word: "curriculum",
			translation: "chương trình học",
		});

		const delRes = await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId }),
		});
		expect(delRes.status).toBe(200);

		const remainingDecks = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, deckId));
		const remainingWords = await libsql
			.select()
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.deckId, deckId));
		const remainingCards = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.studentId, "student-t1"));
		const survivingLogs = await libsql
			.select()
			.from(schema.vocabReviewLog)
			.where(eq(schema.vocabReviewLog.id, "log-survive-1"));

		expect(remainingDecks).toHaveLength(0);
		expect(remainingWords).toHaveLength(0);
		expect(remainingCards).toHaveLength(0);
		expect(survivingLogs).toHaveLength(1);
	});

	test("word remove deletes the word and its cards (0 orphan)", async () => {
		// Setup: deck riêng cho test này.
		const createRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				title: "Remove Test Deck",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: deckId } = (await createRes.json()) as { id: string };

		const wRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "obsolete",
				translation: "lỗi thời",
				sortOrder: 0,
			}),
		});
		expect(wRes.status).toBe(201);
		const { id: wordId } = (await wRes.json()) as { id: string };

		// Seed 1 card trên word này (như học sinh đã học).
		await libsql.insert(schema.vocabCard).values({
			id: "card-remove-1",
			studentId: "student-t1",
			wordId,
			level: 1,
			isWarning: false,
			state: "new",
			intervalDays: 0,
			dueAt: Date.now(),
			lapses: 0,
		});

		const removeRes = await app.request("/api/kernel/vocab/words/remove", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ wordId }),
		});
		expect(removeRes.status).toBe(200);

		const orphanWords = await libsql
			.select()
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.id, wordId));
		const orphanCards = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.id, "card-remove-1"));
		expect(orphanWords).toHaveLength(0);
		expect(orphanCards).toHaveLength(0);

		// Dọn dẹp deck test.
		await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId }),
		});
	});

	test("GET words of a deck from ANOTHER org returns 404 (org scope)", async () => {
		// Tạo org-2 + teacher-2 + class-2 + deck-2.
		await libsql.insert(schema.user).values({
			id: "teacher-2",
			name: "Other Teacher",
			email: "teacher2@test.local",
			emailVerified: true,
			role: "teacher",
		});
		await libsql
			.insert(schema.organization)
			.values({ id: "org-t2", name: "Other Org" });
		await libsql.insert(schema.membership).values({
			id: "mem-t2",
			orgId: "org-t2",
			userId: "teacher-2",
			role: "teacher",
		});
		await libsql.insert(schema.classTable).values({
			id: "class-t2",
			orgId: "org-t2",
			name: "Other Class",
			level: "IELTS",
			mode: "Online",
			schedule: "T5",
			sessionsDone: 0,
			sessionsTotal: 12,
			status: "active",
		});
		await libsql.insert(schema.vocabDeck).values({
			id: "deck-org2",
			orgId: "org-t2",
			classId: "class-t2",
			title: "Foreign Deck",
			lang: "en",
		});
		await libsql.insert(schema.vocabWord).values({
			id: "w-org2-1",
			deckId: "deck-org2",
			word: "foreign",
			translation: "ngoại",
			sortOrder: 0,
		});

		// Teacher-1 (org-t1) đọc words của deck org-t2 → 404.
		const crossRes = await app.request(
			"/api/kernel/vocab/decks/deck-org2/words",
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(crossRes.status).toBe(404);
	});

	test("independent deck, suggest idempotent/upsert, soft revoke, delete batch cleanup, and per-student progress with VN day grouping (#363)", async () => {
		// 1) Create independent deck (classId: null)
		const createRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				title: "Hub Deck: Business English",
				lang: "en",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: indepDeckId } = (await createRes.json()) as { id: string };

		// Add 2 words to indepDeckId
		const w1Res = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: indepDeckId,
				word: "invoice",
				translation: "hoá đơn",
				sortOrder: 0,
			}),
		});
		const { id: w1Id } = (await w1Res.json()) as { id: string };

		const w2Res = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: indepDeckId,
				word: "revenue",
				translation: "doanh thu",
				sortOrder: 1,
			}),
		});
		expect(w2Res.status).toBe(201);

		// 2) Suggest deck to student-t1 (and test double-suggest idempotency RT-F11)
		const sugRes1 = await app.request("/api/kernel/vocab/suggestions", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: indepDeckId,
				studentId: "student-t1",
				note: "Học trước buổi tới",
			}),
		});
		expect(sugRes1.status).toBe(201);
		const { id: sugId } = (await sugRes1.json()) as { id: string };

		const sugRes2 = await app.request("/api/kernel/vocab/suggestions", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: indepDeckId,
				studentId: "student-t1",
				note: "Học trước buổi tới",
			}),
		});
		expect(sugRes2.status).toBe(200);
		const sugBody2 = (await sugRes2.json()) as { id: string };
		expect(sugBody2.id).toBe(sugId);

		// Snapshot contains vocabSuggestions (pending only) and indepDeck with classId: null
		const snapRes1 = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap1 = (await snapRes1.json()) as KernelSnapshot;
		expect(snap1.vocabDecks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: indepDeckId,
					classId: null,
					title: "Hub Deck: Business English",
					wordCount: 2,
				}),
			]),
		);
		expect(snap1.vocabSuggestions).toEqual([
			expect.objectContaining({
				id: sugId,
				deckId: indepDeckId,
				studentId: "student-t1",
				note: "Học trước buổi tới",
			}),
		]);

		// Cross-org student/deck on suggest -> 404
		const crossDeckSug = await app.request("/api/kernel/vocab/suggestions", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: "deck-org2",
				studentId: "student-t1",
			}),
		});
		expect(crossDeckSug.status).toBe(404);

		// 3) Simulate student accepting suggestion -> disappears from pending snapshot, appears in GET /decks/:deckId/suggestions & progress
		const acceptedTime = new Date("2026-10-19T02:00:00Z");
		await libsql
			.update(schema.vocabSuggestion)
			.set({ status: "accepted", respondedAt: acceptedTime })
			.where(eq(schema.vocabSuggestion.id, sugId));

		const snapRes2 = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap2 = (await snapRes2.json()) as KernelSnapshot;
		expect(snap2.vocabSuggestions).toEqual([]);

		const deckSugsRes = await app.request(
			`/api/kernel/vocab/decks/${indepDeckId}/suggestions`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(deckSugsRes.status).toBe(200);
		const deckSugs = vocabTeacherSuggestionsResponseSchema.parse(
			await deckSugsRes.json(),
		);
		expect(deckSugs.suggestions).toEqual([
			expect.objectContaining({
				id: sugId,
				status: "accepted",
				respondedAt: acceptedTime.toISOString(),
			}),
		]);

		// 4) Seed card (level 2, due today) and review log at 00:30 VN today (17:30 UTC yesterday) to verify VN day grouping (RT-F7)
		const now = Date.now();
		await libsql.insert(schema.vocabCard).values({
			id: "card-prog-1",
			studentId: "student-t1",
			wordId: w1Id,
			level: 2,
			isWarning: false,
			state: "review",
			intervalDays: 1,
			dueAt: now - 1000,
			lapses: 0,
		});

		// Compute 00:30 VN of the current Vietnam day
		const vnFormatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: "Asia/Ho_Chi_Minh",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
		const todayVN = vnFormatter.format(new Date(now));
		const vn0030Ms = Date.parse(`${todayVN}T00:30:00+07:00`);

		await libsql.insert(schema.vocabReviewLog).values({
			id: crypto.randomUUID(),
			studentId: "student-t1",
			cardId: "card-prog-1",
			deckId: indepDeckId,
			sessionKind: "learn",
			grade: "good",
			durationMs: 1100,
			reviewedAt: new Date(vn0030Ms),
			word: "invoice",
			translation: "hoá đơn",
		});

		const progRes = await app.request(
			"/api/kernel/vocab/progress?studentId=student-t1",
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(progRes.status).toBe(200);
		const prog = vocabStudentProgressResponseSchema.parse(await progRes.json());
		expect(prog.studentId).toBe("student-t1");
		const indepProg = prog.decks.find((d) => d.deckId === indepDeckId);
		expect(indepProg).toEqual({
			deckId: indepDeckId,
			title: "Hub Deck: Business English",
			classId: null,
			className: "",
			source: "suggested",
			total: 2,
			byLevel: [0, 1, 0, 0, 0],
			dueToday: 1,
			stateNew: 1,
			stateReview: 1,
			lastActivityAt: new Date(vn0030Ms).toISOString(),
		});
		const todayActivity = prog.activity7Days.find((d) => d.dateISO === todayVN);
		expect(todayActivity?.sessions).toBeGreaterThanOrEqual(1);
		expect(todayActivity?.correct).toBeGreaterThanOrEqual(1);

		// 5) Revoke suggestion (soft flip to dismissed, preserving respondedAt) -> deck leaves student's progress
		const revokeRes = await app.request(
			"/api/kernel/vocab/suggestions/revoke",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ suggestionId: sugId }),
			},
		);
		expect(revokeRes.status).toBe(200);

		const [afterRevoke] = await libsql
			.select()
			.from(schema.vocabSuggestion)
			.where(eq(schema.vocabSuggestion.id, sugId));
		expect(afterRevoke?.status).toBe("dismissed");
		expect(afterRevoke?.respondedAt?.toISOString()).toBe(
			acceptedTime.toISOString(),
		);

		const progAfterRevoke = vocabStudentProgressResponseSchema.parse(
			await (
				await app.request("/api/kernel/vocab/progress?studentId=student-t1", {
					headers: { "x-test-user": "teacher" },
				})
			).json(),
		);
		expect(progAfterRevoke.decks.some((d) => d.deckId === indepDeckId)).toBe(
			false,
		);

		// 6) Re-suggest after revoke/dismissed flips back to pending (upsert)
		const resugRes = await app.request("/api/kernel/vocab/suggestions", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: indepDeckId,
				studentId: "student-t1",
				note: "Gợi ý lại",
			}),
		});
		expect(resugRes.status).toBe(200);
		const [afterResug] = await libsql
			.select()
			.from(schema.vocabSuggestion)
			.where(eq(schema.vocabSuggestion.id, sugId));
		expect(afterResug?.status).toBe("pending");
		expect(afterResug?.respondedAt).toBeNull();

		// 7) Deleting the deck removes vocab_suggestion rows in the same batch (0 orphans)
		const delDeckRes = await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId: indepDeckId }),
		});
		expect(delDeckRes.status).toBe(200);

		const orphanSugs = await libsql
			.select()
			.from(schema.vocabSuggestion)
			.where(eq(schema.vocabSuggestion.deckId, indepDeckId));
		expect(orphanSugs).toHaveLength(0);
	});

	test("includes library deck progress (source='library', className=courseName) and protects libword-* cards from teacher deletion (#366)", async () => {
		await libsql.insert(schema.vocabLibraryCourse).values({
			id: "libcourse-t1",
			name: "1000 Từ Cơ Bản",
			description: "Mô tả",
			target: "Mất gốc",
			sortOrder: 0,
		});
		await libsql.insert(schema.vocabLibraryDeck).values({
			id: "libdeck-t1",
			courseId: "libcourse-t1",
			title: "Bài 1: Chào hỏi",
			imageUrl: null,
			sortOrder: 0,
		});
		await libsql.insert(schema.vocabLibraryWord).values([
			{
				id: "libword-t1",
				deckId: "libdeck-t1",
				word: "greet",
				ipa: "/ɡriːt/",
				pos: "v",
				translation: "chào đón",
				sentenceVi: null,
				sentenceEn: null,
				pictureUrl: null,
				audioUrl: null,
				sortOrder: 0,
			},
			{
				id: "libword-t2",
				deckId: "libdeck-t1",
				word: "welcome",
				ipa: null,
				pos: "v",
				translation: "hoan nghênh",
				sentenceVi: null,
				sentenceEn: null,
				pictureUrl: null,
				audioUrl: null,
				sortOrder: 1,
			},
		]);

		const now = Date.now();
		await libsql.insert(schema.vocabCard).values({
			id: "card-lib-t1",
			studentId: "student-t1",
			wordId: "libword-t1",
			level: 1,
			isWarning: false,
			state: "review",
			intervalDays: 1,
			dueAt: now - 1000,
			lapses: 0,
		});

		// Teacher cannot create deck or word with reserved lib* prefix
		const badDeckRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				id: "libdeck-t1",
				title: "Shadow Attempt",
			}),
		});
		expect(badDeckRes.status).toBe(400);

		const badWordRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				id: "libword-t1",
				deckId: "deck-1",
				word: "greet",
				translation: "chào",
			}),
		});
		expect(badWordRes.status).toBe(400);

		// Teacher progress includes the library deck with source='library' and className='1000 Từ Cơ Bản'
		const progRes = await app.request(
			"/api/kernel/vocab/progress?studentId=student-t1",
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(progRes.status).toBe(200);
		const prog = vocabStudentProgressResponseSchema.parse(await progRes.json());
		const libProg = prog.decks.find((d) => d.deckId === "libdeck-t1");
		expect(libProg).toMatchObject({
			deckId: "libdeck-t1",
			title: "Bài 1: Chào hỏi",
			classId: null,
			className: "1000 Từ Cơ Bản",
			source: "library",
			total: 2,
			byLevel: [1, 0, 0, 0, 0],
			dueToday: 1,
			stateNew: 1,
			stateReview: 1,
		});
	});
});
