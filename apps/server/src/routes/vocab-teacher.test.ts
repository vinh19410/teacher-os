import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	type KernelSnapshot,
	VOCAB_ERROR_CODES,
	vocabCsvImportResponseSchema,
	vocabStudentProgressResponseSchema,
	vocabTeacherSuggestionsResponseSchema,
	vocabTeacherWordsResponseSchema,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, enforceDeclaredSize, type ServerApp } from "../app";
import type { MediaStore, StoredMedia } from "../lib/media-store";
import { mp3Bytes, wavBytes } from "../lib/test-media-fixtures";
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
			const counted = enforceDeclaredSize(body, meta.size);
			const reader = counted.stream.getReader();
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

		// 4) Upload audio for word1 (server generates org-scoped key) — genuine MPEG frame bytes (#681)
		const audioBytes = mp3Bytes(16, 1);
		const uploadRes = await app.request(
			`/api/kernel/vocab/words/${word1Id}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(audioBytes.byteLength),
					"X-File-Name": encodeURIComponent("curriculum.mp3"),
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
					"X-File-Name": encodeURIComponent("curriculum.mp3"),
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

	test("vocab word audio upload enforces X-File-Name, extension, and magic bytes (#681)", async () => {
		const deckRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				title: "Upload Guards Deck",
				lang: "en",
			}),
		});
		expect(deckRes.status).toBe(201);
		const { id: guardsDeckId } = (await deckRes.json()) as { id: string };
		const wRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: guardsDeckId,
				word: "guards",
				translation: "bảo vệ",
				sortOrder: 9,
			}),
		});
		expect(wRes.status).toBe(201);
		const { id: wordId } = (await wRes.json()) as { id: string };
		const htmlBytes = new TextEncoder().encode(
			"<!doctype html><html><script>alert(1)</script></html>",
		);
		const put = async (
			overrides: Record<string, string | undefined> = {},
			body: BodyInit = htmlBytes,
		) =>
			app.request(`/api/kernel/vocab/words/${wordId}/audio`, {
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length":
						overrides["Content-Length"] ??
						String(
							typeof body === "string"
								? new TextEncoder().encode(body).byteLength
								: body instanceof Uint8Array
									? body.byteLength
									: htmlBytes.byteLength,
						),
					"X-File-Name": encodeURIComponent("word.mp3"),
					...overrides,
				},
				body,
			});

		// Missing / dotfile / spoofed -> 400 / 415
		const missingName = await put({ "X-File-Name": "" });
		expect(missingName.status).toBe(400);
		expect(await missingName.json()).toMatchObject({
			code: "VOCAB_INVALID_AUDIO",
		});
		const dotFile = await put({ "X-File-Name": encodeURIComponent(".mp3") });
		expect(dotFile.status).toBe(415);
		const htmlExt = await put({
			"X-File-Name": encodeURIComponent("payload.html"),
		});
		expect(htmlExt.status).toBe(415);
		expect(await htmlExt.json()).toMatchObject({
			code: "VOCAB_INVALID_AUDIO",
		});
		const videoMime = await put({ "Content-Type": "video/mp4" });
		expect(videoMime.status).toBe(415);
		const spoofMagic = await put(
			{ "X-File-Name": encodeURIComponent("word.mp3") },
			htmlBytes,
		);
		expect(spoofMagic.status).toBe(415);
		const id3Html = await put(
			{ "X-File-Name": encodeURIComponent("word.mp3") },
			new TextEncoder().encode("ID3\x04<html><script>alert(1)</script>"),
		);
		expect(id3Html.status).toBe(415);
		const utf16 = await put(
			{ "X-File-Name": encodeURIComponent("word.mp3") },
			new Uint8Array([0xff, 0xfe, 0x20, 0x00, 0x3c, 0x00, 0x68, 0x00]),
		);
		expect(utf16.status).toBe(415);

		// Lying Content-Length both <= 64B Slowloris and > 64B -> 400, old key untouched
		const slowlorisGate = Promise.withResolvers<void>();
		let sent11 = false;
		const slowlorisBody = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (!sent11) {
					sent11 = true;
					controller.enqueue(mp3Bytes(11, 1));
					return;
				}
				await slowlorisGate.promise;
				controller.close();
			},
			cancel() {
				slowlorisGate.resolve();
			},
		});
		const slowloris = await app.request(
			`/api/kernel/vocab/words/${wordId}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": "10",
					"X-File-Name": encodeURIComponent("word.mp3"),
				},
				body: slowlorisBody,
				duplex: "half",
			} as RequestInit & { duplex: "half" },
		);
		expect(slowloris.status).toBe(400);
		expect(await slowloris.json()).toMatchObject({
			code: "VOCAB_INVALID_AUDIO",
		});
		const valid150 = mp3Bytes(150, 2);
		const lieLength = async (length: string): Promise<Response> =>
			app.request(`/api/kernel/vocab/words/${wordId}/audio`, {
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": length,
					"X-File-Name": encodeURIComponent("word.mp3"),
				},
				body: valid150,
			});
		expect((await lieLength("300")).status).toBe(400);
		expect((await lieLength("100")).status).toBe(400);

		const [wordRow] = await libsql
			.select({ audioKey: schema.vocabWord.audioKey })
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.id, wordId));
		expect(wordRow?.audioKey ?? null).toBeNull();

		// audio/mp3 alias normalized to audio/mpeg; audio/wave accepted for .wav
		const aliasMp3 = await app.request(
			`/api/kernel/vocab/words/${wordId}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mp3",
					"Content-Length": String(mp3Bytes(16, 1).byteLength),
					"X-File-Name": encodeURIComponent("word.mp3"),
				},
				body: mp3Bytes(16, 1),
			},
		);
		expect(aliasMp3.status).toBe(200);
		const aliasJson = (await aliasMp3.json()) as { audioKey: string };
		expect(aliasJson.audioKey).toContain(`vocab/org-t1/${wordId}/`);
		const wavRes = await app.request(
			`/api/kernel/vocab/words/${wordId}/audio`,
			{
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/wave",
					"Content-Length": String(wavBytes(2048, 2).byteLength),
					"X-File-Name": encodeURIComponent("word.wav"),
				},
				body: wavBytes(2048, 2),
			},
		);
		expect(wavRes.status).toBe(200);

		// Polyglot WAV after success must NOT touch the stored key
		const [wordRowBefore] = await libsql
			.select({ audioKey: schema.vocabWord.audioKey })
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.id, wordId));
		const audioKeyBefore = wordRowBefore?.audioKey ?? null;
		const badWav = await put(
			{ "X-File-Name": encodeURIComponent("word.mp3") },
			new TextEncoder().encode("RIFF<a  WAVEfmt ><script>alert(1)</script>"),
		);
		expect(badWav.status).toBe(415);
		const [wordRowAfter] = await libsql
			.select({ audioKey: schema.vocabWord.audioKey })
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.id, wordId));
		expect(wordRowAfter?.audioKey ?? null).toBe(audioKeyBefore);
	});

	test("decks create/rename with lessonNumber/topic, words upsert/list with entryType/pos/example, and snapshot exposure", async () => {
		const createRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				title: "Lesson 5: Speaking",
				lessonNumber: 5,
				topic: "Technology",
				lang: "en",
			}),
		});
		expect(createRes.status).toBe(201);
		const { id: deckId } = (await createRes.json()) as { id: string };

		const snapRes1 = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap1 = (await snapRes1.json()) as KernelSnapshot;
		expect(snap1.vocabDecks.find((d) => d.id === deckId)).toMatchObject({
			id: deckId,
			title: "Lesson 5: Speaking",
			lessonNumber: 5,
			topic: "Technology",
		});

		// Update title, lessonNumber, and normalize empty topic "" -> null
		const renameRes = await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				title: "Lesson 6: AI",
				lessonNumber: 6,
				topic: "   ",
			}),
		});
		expect(renameRes.status).toBe(200);

		const snapRes2 = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap2 = (await snapRes2.json()) as KernelSnapshot;
		expect(snap2.vocabDecks.find((d) => d.id === deckId)).toMatchObject({
			id: deckId,
			title: "Lesson 6: AI",
			lessonNumber: 6,
			topic: null,
		});

		// Upsert chunk word with pos & example
		const upsertRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "break the ice",
				entryType: "chunk",
				ipa: "/breɪk ði aɪs/",
				pos: "idiom",
				translation: "phá vỡ bầu không khí ngượng ngùng",
				example: "He told a joke to break the ice.",
				sortOrder: 0,
			}),
		});
		expect(upsertRes.status).toBe(201);
		const { id: wordId } = (await upsertRes.json()) as { id: string };

		// Update same word changing example to "" -> null
		const updateRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				id: wordId,
				deckId,
				word: "break the ice",
				entryType: "chunk",
				pos: "phrase",
				translation: "làm quen ban đầu",
				example: "",
				sortOrder: 0,
			}),
		});
		expect(updateRes.status).toBe(200);

		const wordsRes = await app.request(
			`/api/kernel/vocab/decks/${deckId}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(wordsRes.status).toBe(200);
		const wordsData = vocabTeacherWordsResponseSchema.parse(
			await wordsRes.json(),
		);
		expect(wordsData.words).toEqual([
			{
				id: wordId,
				deckId,
				word: "break the ice",
				entryType: "chunk",
				ipa: null,
				pos: "phrase",
				translation: "làm quen ban đầu",
				example: null,
				audioKey: null,
				audioUrl: null,
				sortOrder: 0,
			},
		]);

		await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId }),
		});
	});

	test("POST /decks/import-csv bulk creates decks with chunked >8 word inserts, preserves order, and enforces IDOR on classId", async () => {
		// IDOR negative: class-t2 belongs to org-t2 -> 404
		const foreignRes = await app.request("/api/kernel/vocab/decks/import-csv", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t2",
				decks: [
					{
						title: "Unauthorized Deck",
						words: [{ word: "hack", translation: "xâm nhập" }],
					},
				],
			}),
		});
		expect(foreignRes.status).toBe(404);

		// 28 words in deck 1 (exercises 4 chunks: 8+8+8+4) + 2 words in deck 2
		const twentyEightWords = Array.from({ length: 28 }, (_, idx) => ({
			word: idx % 3 === 0 ? `take part in ${idx}` : `word-${idx}`,
			entryType: idx % 3 === 0 ? ("chunk" as const) : ("word" as const),
			ipa: idx % 2 === 0 ? `/w${idx}/` : null,
			pos: idx % 3 === 0 ? "phrase" : "n",
			translation: `nghĩa ${idx}`,
			example: `Example sentence ${idx}.`,
		}));

		const importRes = await app.request("/api/kernel/vocab/decks/import-csv", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				decks: [
					{
						title: "Lesson 1: Daily Life",
						lessonNumber: 1,
						topic: "Daily Life",
						lang: "en",
						words: twentyEightWords,
					},
					{
						title: "Lesson 2: Travel",
						lessonNumber: 2,
						topic: "",
						lang: "en",
						words: [
							{ word: "itinerary", translation: "lịch trình", pos: "n" },
							{
								word: "check in",
								entryType: "chunk",
								translation: "làm thủ tục nhận phòng",
							},
						],
					},
				],
			}),
		});
		expect(importRes.status).toBe(201);
		const importBody = vocabCsvImportResponseSchema.parse(
			await importRes.json(),
		);
		expect(importBody.deckIds).toHaveLength(2);
		expect(importBody.id).toBe(importBody.deckIds[0]);
		expect(importBody.importedDecks).toBe(2);
		expect(importBody.importedWords).toBe(30);

		const [deck1Id, deck2Id] = importBody.deckIds;
		if (!deck1Id || !deck2Id) throw new Error("expected 2 imported deck IDs");

		const wordsRes = await app.request(
			`/api/kernel/vocab/decks/${deck1Id}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(wordsRes.status).toBe(200);
		const wordsData = vocabTeacherWordsResponseSchema.parse(
			await wordsRes.json(),
		);
		expect(wordsData.words).toHaveLength(28);
		expect(wordsData.words.map((w) => w.sortOrder)).toEqual(
			Array.from({ length: 28 }, (_, i) => i),
		);
		expect(wordsData.words[0]).toMatchObject({
			word: "take part in 0",
			entryType: "chunk",
			pos: "phrase",
			example: "Example sentence 0.",
			sortOrder: 0,
		});
		expect(wordsData.words[27]).toMatchObject({
			word: "take part in 27",
			entryType: "chunk",
			sortOrder: 27,
		});

		const snapRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap = (await snapRes.json()) as KernelSnapshot;
		expect(snap.vocabDecks.find((d) => d.id === deck1Id)).toMatchObject({
			lessonNumber: 1,
			topic: "Daily Life",
			wordCount: 28,
		});
		expect(snap.vocabDecks.find((d) => d.id === deck2Id)).toMatchObject({
			lessonNumber: 2,
			topic: null,
			wordCount: 2,
		});

		for (const dId of importBody.deckIds) {
			await app.request("/api/kernel/vocab/decks/delete", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ deckId: dId }),
			});
		}
	});

	test("POST /decks/:deckId/words/import appends after max(sortOrder), preserves existing words, and returns 404 on foreign deck", async () => {
		// IDOR negative: deck-org2 belongs to org-t2 -> 404 VOCAB_DECK_NOT_FOUND
		const foreignRes = await app.request(
			"/api/kernel/vocab/decks/deck-org2/words/import",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					words: [{ word: "intrude", translation: "xâm nhập" }],
				}),
			},
		);
		expect(foreignRes.status).toBe(404);
		expect(await foreignRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.DECK_NOT_FOUND,
		});

		// Create deck with 2 existing words (sortOrder 0 and 4)
		const createRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				title: "Append Target Deck",
			}),
		});
		const { id: deckId } = (await createRes.json()) as { id: string };

		await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "initial-a",
				translation: "ban đầu a",
				sortOrder: 0,
			}),
		});
		await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId,
				word: "initial-b",
				translation: "ban đầu b",
				sortOrder: 4,
			}),
		});

		// Append 10 words (>8 chunk limit) -> should start at sortOrder 5..14
		const appendedWords = Array.from({ length: 10 }, (_, idx) => ({
			word: `appended-${idx}`,
			entryType: idx === 0 ? ("chunk" as const) : ("word" as const),
			pos: "v",
			translation: `bổ sung ${idx}`,
			example: `Appended example ${idx}`,
		}));

		const appendRes = await app.request(
			`/api/kernel/vocab/decks/${deckId}/words/import`,
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ words: appendedWords }),
			},
		);
		expect(appendRes.status).toBe(201);
		const appendBody = vocabCsvImportResponseSchema.parse(
			await appendRes.json(),
		);
		expect(appendBody).toEqual({
			id: deckId,
			deckIds: [deckId],
			importedDecks: 0,
			importedWords: 10,
		});

		const wordsRes = await app.request(
			`/api/kernel/vocab/decks/${deckId}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		const wordsData = vocabTeacherWordsResponseSchema.parse(
			await wordsRes.json(),
		);
		expect(wordsData.words).toHaveLength(12);
		expect(wordsData.words[0]).toMatchObject({
			word: "initial-a",
			sortOrder: 0,
		});
		expect(wordsData.words[1]).toMatchObject({
			word: "initial-b",
			sortOrder: 4,
		});
		expect(wordsData.words[2]).toMatchObject({
			word: "appended-0",
			entryType: "chunk",
			pos: "v",
			example: "Appended example 0",
			sortOrder: 5,
		});
		expect(wordsData.words[11]).toMatchObject({
			word: "appended-9",
			sortOrder: 14,
		});

		await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId }),
		});
	});

	test("POST /decks/clone clones independent and class decks into class or hub, preserves metadata/words, survives source edits/deletes, supports empty decks, and reports duplicates", async () => {
		await libsql.insert(schema.classTable).values({
			id: "class-t1-target",
			orgId: "org-t1",
			name: "IELTS Target Class",
			level: "IELTS",
			mode: "Online",
			schedule: "T4",
			sessionsDone: 0,
			sessionsTotal: 12,
			status: "active",
		});

		// 1) Seed hub deck (classId = null) with metadata, sourceLibraryDeckId, and 9 words (>7 chunk boundary)
		const hubDeckId = "deck-clone-hub-src";
		const classDeckId = "deck-clone-class-src";
		const emptyDeckId = "deck-clone-empty-src";
		const baseTime = new Date("2026-10-01T00:00:00Z");

		await libsql.insert(schema.vocabDeck).values([
			{
				id: hubDeckId,
				orgId: "org-t1",
				classId: null,
				title: "Lesson 3: Environment",
				lessonNumber: 3,
				topic: "Climate",
				lang: "en",
				sourceLibraryDeckId: "libdeck-origin-1",
				createdAt: baseTime,
				updatedAt: baseTime,
			},
			{
				id: classDeckId,
				orgId: "org-t1",
				classId: "class-t1",
				title: "Class A Deck",
				lessonNumber: 4,
				topic: "Work",
				lang: "en",
				sourceLibraryDeckId: null,
				createdAt: new Date(baseTime.getTime() + 1000),
				updatedAt: new Date(baseTime.getTime() + 1000),
			},
			{
				id: emptyDeckId,
				orgId: "org-t1",
				classId: null,
				title: "Empty Hub Deck",
				lessonNumber: null,
				topic: null,
				lang: "vi",
				sourceLibraryDeckId: null,
				createdAt: new Date(baseTime.getTime() + 2000),
				updatedAt: new Date(baseTime.getTime() + 2000),
			},
		]);

		const seededHubWords = Array.from({ length: 9 }, (_, idx) => ({
			id: `w-hub-clone-${idx}`,
			deckId: hubDeckId,
			word: idx === 0 ? "cut down on" : `eco-word-${idx}`,
			entryType: idx === 0 ? ("chunk" as const) : ("word" as const),
			ipa: idx === 0 ? "/kʌt daʊn ɒn/" : `/iːkoʊ${idx}/`,
			pos: idx === 0 ? "phr. v." : "n",
			translation: `nghĩa sinh thái ${idx}`,
			example: `Example ${idx}.`,
			audioKey: idx === 0 ? "vocab/org-t1/seed/eco0.mp3" : null,
			audioUrl: idx === 1 ? "https://cdn.example.com/audio/eco1.mp3" : null,
			sortOrder: idx,
			createdAt: baseTime,
			updatedAt: baseTime,
		}));
		await libsql.insert(schema.vocabWord).values([
			...seededHubWords,
			{
				id: "w-class-clone-0",
				deckId: classDeckId,
				word: "deadline",
				entryType: "word",
				ipa: "/ˈded.laɪn/",
				pos: "n",
				translation: "hạn chót",
				example: "Meet the deadline.",
				audioKey: null,
				audioUrl: null,
				sortOrder: 0,
				createdAt: baseTime,
				updatedAt: baseTime,
			},
		]);

		// 2) Clone both hub deck + class deck + empty deck into class-t1-target
		const cloneToClassRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1-target",
				deckIds: [hubDeckId, classDeckId, emptyDeckId],
			}),
		});
		expect(cloneToClassRes.status).toBe(201);
		const cloneToClassBody = (await cloneToClassRes.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(cloneToClassBody.updated).toBe(3);
		expect(cloneToClassBody.duplicates).toEqual([]);
		expect(cloneToClassBody.id).toBeTruthy();

		// Verify snapshot exposes sourceDeckId and metadata for all 3 cloned decks
		const snapRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		const snap = (await snapRes.json()) as KernelSnapshot;
		const clonedHub = snap.vocabDecks.find(
			(d) => d.classId === "class-t1-target" && d.sourceDeckId === hubDeckId,
		);
		const clonedClass = snap.vocabDecks.find(
			(d) => d.classId === "class-t1-target" && d.sourceDeckId === classDeckId,
		);
		const clonedEmpty = snap.vocabDecks.find(
			(d) => d.classId === "class-t1-target" && d.sourceDeckId === emptyDeckId,
		);
		expect(clonedHub).toMatchObject({
			id: cloneToClassBody.id,
			classId: "class-t1-target",
			title: "Lesson 3: Environment",
			lessonNumber: 3,
			topic: "Climate",
			lang: "en",
			wordCount: 9,
			sourceLibraryDeckId: "libdeck-origin-1",
			sourceDeckId: hubDeckId,
		});
		expect(clonedClass).toMatchObject({
			classId: "class-t1-target",
			title: "Class A Deck",
			lessonNumber: 4,
			topic: "Work",
			lang: "en",
			wordCount: 1,
			sourceDeckId: classDeckId,
		});
		expect(clonedEmpty).toMatchObject({
			classId: "class-t1-target",
			title: "Empty Hub Deck",
			lessonNumber: null,
			topic: null,
			lang: "vi",
			wordCount: 0,
			sourceDeckId: emptyDeckId,
		});
		if (!clonedHub || !clonedClass || !clonedEmpty) {
			throw new Error("expected all 3 cloned decks in snapshot");
		}

		// Verify all word fields copied cleanly
		const clonedWordsRes = await app.request(
			`/api/kernel/vocab/decks/${clonedHub.id}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(clonedWordsRes.status).toBe(200);
		const clonedWords = vocabTeacherWordsResponseSchema.parse(
			await clonedWordsRes.json(),
		);
		expect(clonedWords.words).toHaveLength(9);
		expect(clonedWords.words[0]).toMatchObject({
			deckId: clonedHub.id,
			word: "cut down on",
			entryType: "chunk",
			ipa: "/kʌt daʊn ɒn/",
			pos: "phr. v.",
			translation: "nghĩa sinh thái 0",
			example: "Example 0.",
			audioKey: "vocab/org-t1/seed/eco0.mp3",
			audioUrl: null,
			sortOrder: 0,
		});
		expect(clonedWords.words[1]).toMatchObject({
			word: "eco-word-1",
			audioKey: null,
			audioUrl: "https://cdn.example.com/audio/eco1.mp3",
			sortOrder: 1,
		});
		expect(clonedWords.words[8]?.sortOrder).toBe(8);

		// 3) Re-cloning hubDeckId to the same target class reports duplicates: [hubDeckId]
		const dupCloneRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1-target",
				deckIds: [hubDeckId],
			}),
		});
		expect(dupCloneRes.status).toBe(201);
		const dupCloneBody = (await dupCloneRes.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(dupCloneBody.updated).toBe(1);
		expect(dupCloneBody.duplicates).toEqual([hubDeckId]);

		// 4) Clone class deck into hub (classId: null)
		const cloneToHubRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				deckIds: [classDeckId],
			}),
		});
		expect(cloneToHubRes.status).toBe(201);
		const cloneToHubBody = (await cloneToHubRes.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(cloneToHubBody.updated).toBe(1);
		expect(cloneToHubBody.duplicates).toEqual([]);

		// 5) Edit and delete source deck -> cloned deck & words remain intact
		await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: hubDeckId,
				title: "Edited Source Title",
			}),
		});
		await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ deckId: hubDeckId }),
		});

		const snapAfterDel = (await (
			await app.request("/api/kernel", {
				headers: { "x-test-user": "teacher" },
			})
		).json()) as KernelSnapshot;
		expect(
			snapAfterDel.vocabDecks.find((d) => d.id === clonedHub.id),
		).toMatchObject({
			title: "Lesson 3: Environment",
			wordCount: 9,
			sourceDeckId: hubDeckId,
		});
		expect(
			snapAfterDel.vocabDecks.find((d) => d.id === cloneToHubBody.id),
		).toMatchObject({
			classId: null,
			title: "Class A Deck",
			sourceDeckId: classDeckId,
		});

		// Clean up created decks
		for (const dId of [
			classDeckId,
			emptyDeckId,
			clonedHub.id,
			clonedClass.id,
			clonedEmpty.id,
			dupCloneBody.id,
			cloneToHubBody.id,
		]) {
			await app.request("/api/kernel/vocab/decks/delete", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ deckId: dId }),
			});
		}
	});

	test("POST /decks/clone enforces auth, IDOR guards, duplicate input rejection, and size limits", async () => {
		// Unauthenticated -> 401
		const unauthRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: {
				Origin: TEACHER_ORIGIN,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ classId: null, deckIds: ["deck-1"] }),
		});
		expect(unauthRes.status).toBe(401);

		// Invalid JSON -> 400
		const badJsonRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: "{not-json",
		});
		expect(badJsonRes.status).toBe(400);

		// Duplicate IDs inside deckIds -> 400 VOCAB_DECK_CLONE_DUPLICATE_DECK
		const dupInputRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: ["deck-a", "deck-a"],
			}),
		});
		expect(dupInputRes.status).toBe(400);
		expect(await dupInputRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.DECK_CLONE_DUPLICATE_DECK,
		});

		// Cross-org classId -> 404
		const ownDeckRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ classId: null, title: "Own Guard Deck" }),
		});
		const { id: ownDeckId } = (await ownDeckRes.json()) as { id: string };

		const foreignClassRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t2",
				deckIds: [ownDeckId],
			}),
		});
		expect(foreignClassRes.status).toBe(404);

		// Cross-org deckIds (mixed with own deck) -> 404 & 0 rows created
		const countBefore = (
			await libsql
				.select({ id: schema.vocabDeck.id })
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.classId, "class-t1"))
		).length;

		const foreignDeckRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: [ownDeckId, "deck-org2"],
			}),
		});
		expect(foreignDeckRes.status).toBe(404);
		expect(await foreignDeckRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.DECK_NOT_FOUND,
		});

		const countAfter = (
			await libsql
				.select({ id: schema.vocabDeck.id })
				.from(schema.vocabDeck)
				.where(eq(schema.vocabDeck.classId, "class-t1"))
		).length;
		expect(countAfter).toBe(countBefore);

		// > 50 deckIds -> 422 VOCAB_DECK_CLONE_TOO_LARGE
		const fiftyOneRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: Array.from({ length: 51 }, (_, i) => `deck-cap-${i}`),
			}),
		});
		expect(fiftyOneRes.status).toBe(422);
		expect(await fiftyOneRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.DECK_CLONE_TOO_LARGE,
		});

		// decks + words > 500 -> 422 VOCAB_DECK_CLONE_TOO_LARGE
		const bigDeckId = "deck-clone-too-large";
		await libsql.insert(schema.vocabDeck).values({
			id: bigDeckId,
			orgId: "org-t1",
			classId: null,
			title: "500 Words Deck",
			lang: "en",
		});
		const fiveHundredWords = Array.from({ length: 500 }, (_, i) => ({
			id: `w-big-${i}`,
			deckId: bigDeckId,
			word: `bigword-${i}`,
			translation: `nghĩa ${i}`,
			sortOrder: i,
		}));
		for (let i = 0; i < fiveHundredWords.length; i += 20) {
			await libsql
				.insert(schema.vocabWord)
				.values(fiveHundredWords.slice(i, i + 20));
		}

		const tooManyWordsRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: [bigDeckId],
			}),
		});
		expect(tooManyWordsRes.status).toBe(422);
		expect(await tooManyWordsRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.DECK_CLONE_TOO_LARGE,
		});

		// Cleanup
		for (const dId of [ownDeckId, bigDeckId]) {
			await app.request("/api/kernel/vocab/decks/delete", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ deckId: dId }),
			});
		}
	});

	test("PUT /words/:wordId/audio keeps shared R2 audioKey while cloned word still references it, and deletes it once unreferenced", async () => {
		const deckRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				title: "Shared Audio Source Deck",
				lang: "en",
			}),
		});
		expect(deckRes.status).toBe(201);
		const { id: srcDeckId } = (await deckRes.json()) as { id: string };

		const wordRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: srcDeckId,
				word: "harmony",
				translation: "sự hài hoà",
				sortOrder: 0,
			}),
		});
		expect(wordRes.status).toBe(201);
		const { id: srcWordId } = (await wordRes.json()) as { id: string };

		const uploadAudio = async (wordId: string, bytes: Uint8Array) =>
			app.request(`/api/kernel/vocab/words/${wordId}/audio`, {
				method: "PUT",
				headers: {
					"x-test-user": "teacher",
					Origin: TEACHER_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(bytes.byteLength),
					"X-File-Name": encodeURIComponent("harmony.mp3"),
				},
				body: bytes,
			});

		// 1) Upload original audio on source word
		const firstUploadRes = await uploadAudio(srcWordId, mp3Bytes(16, 1));
		expect(firstUploadRes.status).toBe(200);
		const { audioKey: sharedKey } = (await firstUploadRes.json()) as {
			audioKey: string;
		};
		expect(mediaStore.objects.has(sharedKey)).toBe(true);

		// 2) Clone source deck to class-t1
		const cloneRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: [srcDeckId],
			}),
		});
		expect(cloneRes.status).toBe(201);
		const { id: clonedDeckId } = (await cloneRes.json()) as { id: string };

		const clonedWordsRes = await app.request(
			`/api/kernel/vocab/decks/${clonedDeckId}/words`,
			{ headers: { "x-test-user": "teacher" } },
		);
		const clonedWords = vocabTeacherWordsResponseSchema.parse(
			await clonedWordsRes.json(),
		);
		const clonedWord = clonedWords.words[0];
		if (!clonedWord) throw new Error("expected cloned word");
		expect(clonedWord.audioKey).toBe(sharedKey);

		// 3) Replace audio on source word -> sharedKey MUST stay in R2 because cloned word still references it
		const replaceSrcRes = await uploadAudio(srcWordId, mp3Bytes(24, 2));
		expect(replaceSrcRes.status).toBe(200);
		expect(mediaStore.objects.has(sharedKey)).toBe(true);

		const getClonedAudioRes = await app.request(
			`/api/kernel/vocab/words/${clonedWord.id}/audio`,
			{ headers: { "x-test-user": "teacher" } },
		);
		expect(getClonedAudioRes.status).toBe(200);

		// 4) Replace audio on cloned word too -> now no row references sharedKey, so R2 object IS deleted
		const replaceClonedRes = await uploadAudio(clonedWord.id, mp3Bytes(32, 3));
		expect(replaceClonedRes.status).toBe(200);
		expect(mediaStore.objects.has(sharedKey)).toBe(false);

		// Cleanup
		for (const dId of [srcDeckId, clonedDeckId]) {
			await app.request("/api/kernel/vocab/decks/delete", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ deckId: dId }),
			});
		}
	});

	test("vocab group CRUD, duplicate Vietnamese name 409, cross-org IDOR 404, deck assignment/clone/csv-import, snapshot exposure, and batch delete preserving decks/words/cards", async () => {
		// 1) Create two groups
		const g1Res = await app.request("/api/kernel/vocab/groups", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ name: "  Giao Tiếp  " }),
		});
		expect(g1Res.status).toBe(201);
		const { id: g1Id } = (await g1Res.json()) as { id: string };

		const g2Res = await app.request("/api/kernel/vocab/groups", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ name: "IELTS Speaking" }),
		});
		expect(g2Res.status).toBe(201);
		const { id: g2Id } = (await g2Res.json()) as { id: string };

		// 2) Duplicate name (Vietnamese case-insensitive & NFD/NFC) -> 409 VOCAB_GROUP_NAME_EXISTS
		const dupCreateRes = await app.request("/api/kernel/vocab/groups", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ name: "giao tiếp" }),
		});
		expect(dupCreateRes.status).toBe(409);
		expect(await dupCreateRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
		});

		const dupNfdRes = await app.request("/api/kernel/vocab/groups", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ name: "GIAO TIẾP".normalize("NFD") }),
		});
		expect(dupNfdRes.status).toBe(409);
		expect(await dupNfdRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
		});

		// 3) Rename group: conflict with another group -> 409; case-only rename on self -> 200; normal rename -> 200
		const dupRenameRes = await app.request("/api/kernel/vocab/groups/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ groupId: g2Id, name: "giao tiếp" }),
		});
		expect(dupRenameRes.status).toBe(409);
		expect(await dupRenameRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NAME_EXISTS,
		});

		const selfCaseRenameRes = await app.request(
			"/api/kernel/vocab/groups/rename",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ groupId: g1Id, name: "Giao tiếp" }),
			},
		);
		expect(selfCaseRenameRes.status).toBe(200);
		expect(await selfCaseRenameRes.json()).toEqual({ id: g1Id });

		const renameG2Res = await app.request("/api/kernel/vocab/groups/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ groupId: g2Id, name: "IELTS Academic" }),
		});
		expect(renameG2Res.status).toBe(200);

		// 4) Seed foreign org & group for cross-org IDOR checks
		await libsql
			.insert(schema.organization)
			.values({ id: "org-foreign-grp", name: "Foreign Group Org" })
			.onConflictDoNothing();
		await libsql.insert(schema.vocabGroup).values({
			id: "grp-foreign-1",
			orgId: "org-foreign-grp",
			name: "Giao Tiếp",
			normalizedName: "giao tiếp",
		});

		const foreignRenameRes = await app.request(
			"/api/kernel/vocab/groups/rename",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ groupId: "grp-foreign-1", name: "Hijacked" }),
			},
		);
		expect(foreignRenameRes.status).toBe(404);
		expect(await foreignRenameRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NOT_FOUND,
		});

		const foreignDeleteRes = await app.request(
			"/api/kernel/vocab/groups/delete",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ groupId: "grp-foreign-1" }),
			},
		);
		expect(foreignDeleteRes.status).toBe(404);
		expect(await foreignDeleteRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NOT_FOUND,
		});

		const foreignDeckCreateRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				groupId: "grp-foreign-1",
				title: "IDOR Deck",
			}),
		});
		expect(foreignDeckCreateRes.status).toBe(404);
		expect(await foreignDeckCreateRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NOT_FOUND,
		});

		const foreignCsvRes = await app.request(
			"/api/kernel/vocab/decks/import-csv",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					classId: null,
					groupId: "grp-foreign-1",
					decks: [
						{
							title: "Foreign CSV Deck",
							words: [{ word: "test", translation: "kiểm tra" }],
						},
					],
				}),
			},
		);
		expect(foreignCsvRes.status).toBe(404);
		expect(await foreignCsvRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NOT_FOUND,
		});

		// 5) Create deck with g1Id, upsert word & student card progress
		const deckCreateRes = await app.request("/api/kernel/vocab/decks", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				groupId: g1Id,
				title: "Grouped Hub Deck",
				lang: "en",
			}),
		});
		expect(deckCreateRes.status).toBe(201);
		const { id: groupedDeckId } = (await deckCreateRes.json()) as {
			id: string;
		};

		const wordRes = await app.request("/api/kernel/vocab/words/upsert", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: groupedDeckId,
				word: "converse",
				translation: "trò chuyện",
				sortOrder: 0,
			}),
		});
		expect(wordRes.status).toBe(201);
		const { id: groupedWordId } = (await wordRes.json()) as { id: string };

		await libsql.insert(schema.vocabCard).values({
			id: "card-group-preserve-1",
			studentId: "student-t1",
			wordId: groupedWordId,
			level: 3,
			state: "review",
			intervalDays: 7,
			dueAt: Date.now() + 86_400_000,
			lapses: 0,
		});

		// 6) Rename deck: foreign groupId -> 404; omit groupId -> keeps g1Id; switch to g2Id; clear with null; restore to g1Id
		const foreignDeckRenameRes = await app.request(
			"/api/kernel/vocab/decks/rename",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					deckId: groupedDeckId,
					title: "Grouped Hub Deck",
					groupId: "grp-foreign-1",
				}),
			},
		);
		expect(foreignDeckRenameRes.status).toBe(404);
		expect(await foreignDeckRenameRes.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.GROUP_NOT_FOUND,
		});

		const renameKeepGroupRes = await app.request(
			"/api/kernel/vocab/decks/rename",
			{
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({
					deckId: groupedDeckId,
					title: "Grouped Hub Deck v2",
				}),
			},
		);
		expect(renameKeepGroupRes.status).toBe(200);
		let [deckRow] = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, groupedDeckId));
		expect(deckRow?.groupId).toBe(g1Id);

		const renameToG2Res = await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: groupedDeckId,
				title: "Grouped Hub Deck v2",
				groupId: g2Id,
			}),
		});
		expect(renameToG2Res.status).toBe(200);
		[deckRow] = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, groupedDeckId));
		expect(deckRow?.groupId).toBe(g2Id);

		const clearGroupRes = await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: groupedDeckId,
				title: "Grouped Hub Deck v2",
				groupId: null,
			}),
		});
		expect(clearGroupRes.status).toBe(200);
		[deckRow] = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, groupedDeckId));
		expect(deckRow?.groupId).toBeNull();

		await app.request("/api/kernel/vocab/decks/rename", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				deckId: groupedDeckId,
				title: "Grouped Hub Deck v2",
				groupId: g1Id,
			}),
		});

		// 7) CSV import with groupId assigns groupId to all imported decks
		const csvRes = await app.request("/api/kernel/vocab/decks/import-csv", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: null,
				groupId: g2Id,
				decks: [
					{
						title: "CSV Group Deck 1",
						words: [{ word: "alpha", translation: "a" }],
					},
					{
						title: "CSV Group Deck 2",
						words: [{ word: "beta", translation: "b" }],
					},
				],
			}),
		});
		expect(csvRes.status).toBe(201);
		const csvPayload = vocabCsvImportResponseSchema.parse(await csvRes.json());
		expect(csvPayload.deckIds).toHaveLength(2);

		// 8) Clone deck preserves srcDeck.groupId
		const cloneRes = await app.request("/api/kernel/vocab/decks/clone", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({
				classId: "class-t1",
				deckIds: [groupedDeckId],
			}),
		});
		expect(cloneRes.status).toBe(201);
		const { id: clonedGroupedDeckId } = (await cloneRes.json()) as {
			id: string;
		};

		// 9) Snapshot returns vocabGroups (org-scoped, excluding foreign org) and vocabDecks[*].groupId
		const snapRes = await app.request("/api/kernel", {
			headers: { "x-test-user": "teacher" },
		});
		expect(snapRes.status).toBe(200);
		const snap = (await snapRes.json()) as KernelSnapshot;
		expect(snap.vocabGroups).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: g1Id, name: "Giao tiếp" }),
				expect.objectContaining({ id: g2Id, name: "IELTS Academic" }),
			]),
		);
		expect(snap.vocabGroups?.some((g) => g.id === "grp-foreign-1")).toBe(false);

		const snapGroupedDeck = snap.vocabDecks.find((d) => d.id === groupedDeckId);
		const snapClonedDeck = snap.vocabDecks.find(
			(d) => d.id === clonedGroupedDeckId,
		);
		const snapCsvDeck1 = snap.vocabDecks.find(
			(d) => d.id === csvPayload.deckIds[0],
		);
		const snapCsvDeck2 = snap.vocabDecks.find(
			(d) => d.id === csvPayload.deckIds[1],
		);
		expect(snapGroupedDeck?.groupId).toBe(g1Id);
		expect(snapClonedDeck?.groupId).toBe(g1Id);
		expect(snapCsvDeck1?.groupId).toBe(g2Id);
		expect(snapCsvDeck2?.groupId).toBe(g2Id);

		// 10) Delete g1Id (even with PRAGMA foreign_keys = OFF): explicitly ungroups decks while preserving decks, words, and student vocab_card
		const deleteG1Res = await app.request("/api/kernel/vocab/groups/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ groupId: g1Id }),
		});
		expect(deleteG1Res.status).toBe(200);
		expect(await deleteG1Res.json()).toEqual({ id: g1Id });

		const [deletedGroup] = await libsql
			.select()
			.from(schema.vocabGroup)
			.where(eq(schema.vocabGroup.id, g1Id));
		expect(deletedGroup).toBeUndefined();

		const [ungroupedSource] = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, groupedDeckId));
		expect(ungroupedSource?.groupId).toBeNull();

		const [ungroupedClone] = await libsql
			.select()
			.from(schema.vocabDeck)
			.where(eq(schema.vocabDeck.id, clonedGroupedDeckId));
		expect(ungroupedClone?.groupId).toBeNull();

		// Words and student progress survived group deletion
		const [preservedWord] = await libsql
			.select()
			.from(schema.vocabWord)
			.where(eq(schema.vocabWord.id, groupedWordId));
		expect(preservedWord?.word).toBe("converse");

		const [preservedCard] = await libsql
			.select()
			.from(schema.vocabCard)
			.where(eq(schema.vocabCard.id, "card-group-preserve-1"));
		expect(preservedCard).toMatchObject({
			id: "card-group-preserve-1",
			level: 3,
			state: "review",
		});

		// Foreign org group untouched
		const [foreignStillExists] = await libsql
			.select()
			.from(schema.vocabGroup)
			.where(eq(schema.vocabGroup.id, "grp-foreign-1"));
		expect(foreignStillExists?.name).toBe("Giao Tiếp");

		// Cleanup
		await app.request("/api/kernel/vocab/groups/delete", {
			method: "POST",
			headers: teacherHeaders,
			body: JSON.stringify({ groupId: g2Id }),
		});
		for (const dId of [
			groupedDeckId,
			clonedGroupedDeckId,
			...csvPayload.deckIds,
		]) {
			await app.request("/api/kernel/vocab/decks/delete", {
				method: "POST",
				headers: teacherHeaders,
				body: JSON.stringify({ deckId: dId }),
			});
		}
		await libsql
			.delete(schema.vocabGroup)
			.where(eq(schema.vocabGroup.id, "grp-foreign-1"));
	});
});
