import { createClient } from "@libsql/client";
import {
	type KernelSnapshot,
	VOCAB_ERROR_CODES,
	vocabLibraryCoursesResponseSchema,
	vocabLibraryDecksResponseSchema,
	vocabLibraryWordsResponseSchema,
	vocabTeacherWordsResponseSchema,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { SessionUser } from "../session";

const TEACHER_ORIGIN = "http://localhost:8001";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

describe("built-in vocab library routes (/api/kernel/vocab-library/*, #361)", () => {
	let app: ServerApp;
	let libsql: Db;

	const users: Record<string, SessionUser> = {
		teacherA: {
			userId: "teacher-a",
			userName: "Ms. Lan",
			email: "teacher-a@test.local",
			emailVerified: true,
			role: "teacher",
		},
		teacherB: {
			userId: "teacher-b",
			userName: "Mr. Minh",
			email: "teacher-b@test.local",
			emailVerified: true,
			role: "teacher",
		},
	};

	function headersFor(userKey: "teacherA" | "teacherB") {
		return {
			"x-test-user": userKey,
			Origin: TEACHER_ORIGIN,
			"Content-Type": "application/json",
		};
	}

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.user).values([
			{
				id: "teacher-a",
				name: "Ms. Lan",
				email: "teacher-a@test.local",
				emailVerified: true,
			},
			{
				id: "teacher-b",
				name: "Mr. Minh",
				email: "teacher-b@test.local",
				emailVerified: true,
			},
		]);

		await libsql.insert(schema.organization).values([
			{ id: "org-a", name: "Org A" },
			{ id: "org-b", name: "Org B" },
		]);

		await libsql.insert(schema.membership).values([
			{
				id: "mem-a",
				orgId: "org-a",
				userId: "teacher-a",
				role: "owner",
			},
			{
				id: "mem-b",
				orgId: "org-b",
				userId: "teacher-b",
				role: "owner",
			},
		]);

		await libsql.insert(schema.classTable).values([
			{
				id: "class-a",
				orgId: "org-a",
				name: "IELTS A1",
				level: "IELTS",
				mode: "Online",
				schedule: "Mon 18:00",
				sessionsDone: 0,
				sessionsTotal: 12,
				status: "active",
			},
			{
				id: "class-b",
				orgId: "org-b",
				name: "IELTS B1",
				level: "IELTS",
				mode: "Online",
				schedule: "Tue 18:00",
				sessionsDone: 0,
				sessionsTotal: 12,
				status: "active",
			},
		]);

		await libsql.insert(schema.vocabLibraryCourse).values([
			{
				id: "libcourse-6",
				name: "IELTS CƠ BẢN",
				description: "Hơn 1200 từ IELTS",
				target: "Ôn IELTS 6.5",
				sortOrder: 1,
			},
			{
				id: "libcourse-7",
				name: "1000 TỪ CƠ BẢN",
				description: "Từ thông dụng",
				target: "Mất gốc",
				sortOrder: 2,
			},
		]);

		await libsql.insert(schema.vocabLibraryDeck).values([
			{
				id: "libdeck-101",
				courseId: "libcourse-6",
				title: "Lesson 1: Education",
				description: "1.Giáo dục",
				imageUrl:
					"https://mochien3.1-api.mochidemy.com/public/images/lesson/1.webp",
				sortOrder: 1,
			},
			{
				id: "libdeck-102",
				courseId: "libcourse-6",
				title: "Lesson 2: Environment",
				imageUrl: null,
				sortOrder: 2,
			},
		]);

		await libsql.insert(schema.vocabLibraryWord).values([
			{
				id: "libword-1",
				deckId: "libdeck-101",
				word: "teacher",
				ipa: "/ˈtiːtʃər/",
				pos: "n",
				translation: "Giáo viên",
				sentenceVi: "Cô ấy là giáo viên.",
				sentenceEn: "She is a teacher.",
				pictureUrl: null,
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/public/audios/question/teacher.mp3",
				sortOrder: 0,
			},
			{
				id: "libword-2",
				deckId: "libdeck-101",
				word: "curriculum",
				ipa: "/kəˈrɪkjələm/",
				pos: "n",
				translation: "Chương trình học",
				sentenceVi: null,
				sentenceEn: null,
				pictureUrl: null,
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/public/audios/question/curriculum.mp3",
				sortOrder: 1,
			},
			{
				id: "libword-3",
				deckId: "libdeck-102",
				word: "climate",
				ipa: "/ˈklaɪmət/",
				pos: "n",
				translation: "Khí hậu",
				sentenceVi: null,
				sentenceEn: null,
				pictureUrl: null,
				audioUrl:
					"https://mochien3.1-api.mochidemy.com/public/audios/question/climate.mp3",
				sortOrder: 0,
			},
		]);

		app = buildApp({
			getDb: () => libsql,
			corsOrigin: [TEACHER_ORIGIN],
			authHandler: async () => new Response("not used", { status: 404 }),
			getSessionUser: async (headers) => {
				const key = headers.get("x-test-user") ?? "";
				return users[key] ?? null;
			},
		});
	});

	test("per-route 401 guard: unauthenticated requests to all 4 library endpoints return 401", async () => {
		const resCourses = await app.request("/api/kernel/vocab-library/courses");
		expect(resCourses.status).toBe(401);

		const resDecks = await app.request(
			"/api/kernel/vocab-library/courses/libcourse-6/decks",
		);
		expect(resDecks.status).toBe(401);

		const resWords = await app.request(
			"/api/kernel/vocab-library/decks/libdeck-101/words",
		);
		expect(resWords.status).toBe(401);

		const resClone = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: {
				Origin: TEACHER_ORIGIN,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				classId: "class-a",
				deckIds: ["libdeck-101"],
			}),
		});
		expect(resClone.status).toBe(401);
	});

	test("browse endpoints return courses with deckCount, decks with wordCount, and words preview with 404 on unknown IDs", async () => {
		const resCourses = await app.request("/api/kernel/vocab-library/courses", {
			headers: headersFor("teacherA"),
		});
		expect(resCourses.status).toBe(200);
		const coursesData = vocabLibraryCoursesResponseSchema.parse(
			await resCourses.json(),
		);
		expect(coursesData.courses).toEqual([
			{
				id: "libcourse-6",
				name: "IELTS CƠ BẢN",
				description: "Hơn 1200 từ IELTS",
				target: "Ôn IELTS 6.5",
				deckCount: 2,
				sortOrder: 1,
			},
			{
				id: "libcourse-7",
				name: "1000 TỪ CƠ BẢN",
				description: "Từ thông dụng",
				target: "Mất gốc",
				deckCount: 0,
				sortOrder: 2,
			},
		]);

		// Teacher B in Org B reads the exact same global catalog
		const resCoursesB = await app.request("/api/kernel/vocab-library/courses", {
			headers: headersFor("teacherB"),
		});
		expect(resCoursesB.status).toBe(200);

		const resMissingCourse = await app.request(
			"/api/kernel/vocab-library/courses/libcourse-missing/decks",
			{ headers: headersFor("teacherA") },
		);
		expect(resMissingCourse.status).toBe(404);
		expect(await resMissingCourse.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.LIBRARY_COURSE_NOT_FOUND,
		});

		const resDecks = await app.request(
			"/api/kernel/vocab-library/courses/libcourse-6/decks",
			{ headers: headersFor("teacherA") },
		);
		expect(resDecks.status).toBe(200);
		const decksData = vocabLibraryDecksResponseSchema.parse(
			await resDecks.json(),
		);
		expect(decksData.decks).toEqual([
			{
				id: "libdeck-101",
				courseId: "libcourse-6",
				title: "Lesson 1: Education",
				description: "1.Giáo dục",
				imageUrl:
					"https://mochien3.1-api.mochidemy.com/public/images/lesson/1.webp",
				wordCount: 2,
				sortOrder: 1,
			},
			{
				id: "libdeck-102",
				courseId: "libcourse-6",
				title: "Lesson 2: Environment",
				description: null,
				imageUrl: null,
				wordCount: 1,
				sortOrder: 2,
			},
		]);

		const resMissingDeck = await app.request(
			"/api/kernel/vocab-library/decks/libdeck-missing/words",
			{ headers: headersFor("teacherA") },
		);
		expect(resMissingDeck.status).toBe(404);
		expect(await resMissingDeck.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
		});

		const resWords = await app.request(
			"/api/kernel/vocab-library/decks/libdeck-101/words?limit=1&offset=0",
			{ headers: headersFor("teacherA") },
		);
		expect(resWords.status).toBe(200);
		const wordsData = vocabLibraryWordsResponseSchema.parse(
			await resWords.json(),
		);
		expect(wordsData.deck).toEqual({
			id: "libdeck-101",
			title: "Lesson 1: Education",
		});
		expect(wordsData.words).toHaveLength(1);
		expect(wordsData.words[0]?.word).toBe("teacher");
	});

	test("POST /clone guards: duplicate deckIds -> 400, other org classId -> 404, missing deck -> 404", async () => {
		const resDup = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				classId: "class-a",
				deckIds: ["libdeck-101", "libdeck-101"],
			}),
		});
		expect(resDup.status).toBe(400);
		expect(await resDup.json()).toMatchObject({
			error: VOCAB_ERROR_CODES.LIBRARY_CLONE_DUPLICATE_DECK,
		});

		// Teacher B attempts to clone into Org A's class-a -> 404
		const resIdor = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherB"),
			body: JSON.stringify({
				classId: "class-a",
				deckIds: ["libdeck-101"],
			}),
		});
		expect(resIdor.status).toBe(404);

		const resMissingDeck = await app.request(
			"/api/kernel/vocab-library/clone",
			{
				method: "POST",
				headers: headersFor("teacherA"),
				body: JSON.stringify({
					classId: "class-a",
					deckIds: ["libdeck-101", "libdeck-nonexistent"],
				}),
			},
		);
		expect(resMissingDeck.status).toBe(404);
		expect(await resMissingDeck.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.LIBRARY_DECK_NOT_FOUND,
		});
	});

	test("POST /clone statement caps: >50 decks OR decks + words > 500 returns 422 LIBRARY_CLONE_TOO_LARGE", async () => {
		const fiftyOneDeckIds = Array.from(
			{ length: 51 },
			(_, idx) => `libdeck-cap-${idx + 1}`,
		);
		const resTooManyDecks = await app.request(
			"/api/kernel/vocab-library/clone",
			{
				method: "POST",
				headers: headersFor("teacherA"),
				body: JSON.stringify({
					classId: "class-a",
					deckIds: fiftyOneDeckIds,
				}),
			},
		);
		expect(resTooManyDecks.status).toBe(422);
		expect(await resTooManyDecks.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
		});

		// Seed 50 decks with 451 total words (50 + 451 = 501 > 500 statements)
		const capDecks = Array.from({ length: 50 }, (_, idx) => ({
			id: `libdeck-bulk-${idx + 1}`,
			courseId: "libcourse-7",
			title: `Bulk Deck ${idx + 1}`,
			imageUrl: null,
			sortOrder: idx,
		}));
		await libsql.insert(schema.vocabLibraryDeck).values(capDecks);

		const capWords = Array.from({ length: 451 }, (_, idx) => ({
			id: `libword-bulk-${idx + 1}`,
			deckId: capDecks[idx % 50]?.id ?? "libdeck-bulk-1",
			word: `word-${idx + 1}`,
			ipa: null,
			pos: null,
			translation: `nghĩa ${idx + 1}`,
			sentenceVi: null,
			sentenceEn: null,
			pictureUrl: null,
			audioUrl: null,
			sortOrder: idx,
		}));
		await libsql.insert(schema.vocabLibraryWord).values(capWords);

		const resTotalCap = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				classId: "class-a",
				deckIds: capDecks.map((d) => d.id),
			}),
		});
		expect(resTotalCap.status).toBe(422);
		expect(await resTotalCap.json()).toMatchObject({
			code: VOCAB_ERROR_CODES.LIBRARY_CLONE_TOO_LARGE,
		});
	});

	test("POST /clone creates org-scoped decks + words with sourceLibraryDeckId & audioUrl, exposes in snapshot, and reports duplicates on re-clone", async () => {
		const resClone = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				classId: "class-a",
				deckIds: ["libdeck-101", "libdeck-102"],
			}),
		});
		expect(resClone.status).toBe(201);
		const cloneBody = (await resClone.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(cloneBody.updated).toBe(2);
		expect(cloneBody.duplicates).toEqual([]);
		expect(cloneBody.id).toBeTruthy();

		// Snapshot for Teacher A contains both cloned decks with sourceLibraryDeckId; Teacher B sees 0 decks.
		const snapResA = await app.request("/api/kernel", {
			headers: headersFor("teacherA"),
		});
		expect(snapResA.status).toBe(200);
		const snapA = (await snapResA.json()) as KernelSnapshot;
		expect(snapA.vocabDecks).toHaveLength(2);
		expect(
			snapA.vocabDecks.map((d) => ({
				title: d.title,
				wordCount: d.wordCount,
				sourceLibraryDeckId: d.sourceLibraryDeckId,
			})),
		).toEqual(
			expect.arrayContaining([
				{
					title: "Lesson 1: Education",
					wordCount: 2,
					sourceLibraryDeckId: "libdeck-101",
				},
				{
					title: "Lesson 2: Environment",
					wordCount: 1,
					sourceLibraryDeckId: "libdeck-102",
				},
			]),
		);

		const snapResB = await app.request("/api/kernel", {
			headers: headersFor("teacherB"),
		});
		const snapB = (await snapResB.json()) as KernelSnapshot;
		expect(snapB.vocabDecks).toHaveLength(0);

		// Teacher words endpoint exposes audioUrl on cloned words
		const clonedDeck101 = snapA.vocabDecks.find(
			(d) => d.sourceLibraryDeckId === "libdeck-101",
		);
		expect(clonedDeck101).toBeDefined();
		const teacherWordsRes = await app.request(
			`/api/kernel/vocab/decks/${clonedDeck101?.id ?? ""}/words`,
			{ headers: headersFor("teacherA") },
		);
		expect(teacherWordsRes.status).toBe(200);
		const teacherWords = vocabTeacherWordsResponseSchema.parse(
			await teacherWordsRes.json(),
		);
		expect(teacherWords.words).toHaveLength(2);
		expect(teacherWords.words[0]?.audioUrl).toBe(
			"https://mochien3.1-api.mochidemy.com/public/audios/question/teacher.mp3",
		);
		expect(teacherWords.words[0]?.audioKey).toBeNull();

		// Re-cloning libdeck-101 succeeds and reports libdeck-101 in duplicates[]
		const resReclone = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				classId: "class-a",
				deckIds: ["libdeck-101"],
			}),
		});
		expect(resReclone.status).toBe(201);
		const recloneBody = (await resReclone.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(recloneBody.updated).toBe(1);
		expect(recloneBody.duplicates).toEqual(["libdeck-101"]);

		// Deleting a cloned deck does not affect the library catalog
		const delRes = await app.request("/api/kernel/vocab/decks/delete", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({ deckId: recloneBody.id }),
		});
		expect(delRes.status).toBe(200);

		const libStillThere = await libsql
			.select()
			.from(schema.vocabLibraryDeck)
			.where(eq(schema.vocabLibraryDeck.id, "libdeck-101"));
		expect(libStillThere).toHaveLength(1);
	});

	test("POST /clone supports independent hub decks (classId: null) and reports duplicates via isNull (#363 RT-F14)", async () => {
		const res1 = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				classId: null,
				deckIds: ["libdeck-102"],
			}),
		});
		expect(res1.status).toBe(201);
		const body1 = (await res1.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(body1.updated).toBe(1);
		expect(body1.duplicates).toEqual([]);

		const snapRes = await app.request("/api/kernel", {
			headers: headersFor("teacherA"),
		});
		const snap = (await snapRes.json()) as KernelSnapshot;
		const indepCloned = snap.vocabDecks.find((d) => d.id === body1.id);
		expect(indepCloned).toMatchObject({
			id: body1.id,
			classId: null,
			title: "Lesson 2: Environment",
			sourceLibraryDeckId: "libdeck-102",
		});

		// Re-cloning into independent hub (classId omitted -> null) detects duplicate via isNull(vocabDeck.classId)
		const res2 = await app.request("/api/kernel/vocab-library/clone", {
			method: "POST",
			headers: headersFor("teacherA"),
			body: JSON.stringify({
				deckIds: ["libdeck-102"],
			}),
		});
		expect(res2.status).toBe(201);
		const body2 = (await res2.json()) as {
			id: string;
			updated: number;
			duplicates: string[];
		};
		expect(body2.duplicates).toEqual(["libdeck-102"]);
	});
});
