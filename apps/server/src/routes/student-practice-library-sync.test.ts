import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore } from "../lib/media-store";
import type { SessionUser } from "../session";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

/**
 * Đề thư viện ready (admin xuất bản) phải hiện ở catalog practice của mọi
 * org qua bản sao assignment_test; gỡ xuất bản thì ẩn; không nhân đôi.
 */
describe("student practice — đồng bộ đề thư viện", () => {
	let app: ServerApp;
	let db: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const drizzleDb = drizzle(client, { schema });
		await migrate(drizzleDb, { migrationsFolder: MIGRATIONS_DIR });
		db = drizzleDb as unknown as Db;

		await db.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await db.insert(schema.student).values([
			{ id: "s-1", orgId: "org-1", name: "Hoa", email: "hoa@test.local" },
			{ id: "s-2", orgId: "org-2", name: "Hoa", email: "hoa@test.local" },
		]);
		const audioObjects = new Map<
			string,
			{ bytes: Uint8Array; contentType: string }
		>([
			[
				"library/lt-listening-ready/s4/bikes.mp3",
				{
					bytes: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]),
					contentType: "audio/mpeg",
				},
			],
		]);
		const libraryAudioStore: MediaStore = {
			async put(key, body, meta) {
				const bytes = new Uint8Array(await new Response(body).arrayBuffer());
				audioObjects.set(key, { bytes, contentType: meta.contentType });
			},
			async get(key) {
				const obj = audioObjects.get(key);
				if (!obj) return null;
				return {
					body: new Response(obj.bytes).body as ReadableStream,
					contentType: obj.contentType,
					size: obj.bytes.byteLength,
				};
			},
			async delete(key) {
				audioObjects.delete(key);
			},
		};

		await db.insert(schema.libraryTest).values([
			{
				id: "lt-ready",
				title: "Solving Traffic Problems in Big Cities",
				skill: "reading",
				status: "ready",
				collection: "Step IELTS",
			},
			{ id: "lt-draft", title: "Bản nháp", skill: "reading", status: "draft" },
			{
				id: "lt-listening-ready",
				title: "Talking about the history of bikes",
				skill: "listening",
				timeLimitSeconds: 600,
				status: "ready",
			},
		]);
		await db.insert(schema.libraryTestPart).values([
			{
				id: "ltp-1",
				testId: "lt-ready",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				passage: "text",
				questions: JSON.stringify([
					{ stem: "Q1", answer: "TRUE", alts: "" },
					{ stem: "Q2", answer: "FALSE", alts: "" },
				]),
			},
			{
				id: "ltp-2",
				testId: "lt-draft",
				part: "p1",
				type: "tfng",
				questions: "[]",
			},
			{
				id: "ltp-listening-s4",
				testId: "lt-listening-ready",
				part: "s4",
				type: "notes",
				title: "Section 4: Talking about the history of bikes",
				transcript: "Good afternoon, ladies and gentlemen.",
				audioKey: "library/lt-listening-ready/s4/bikes.mp3",
				audioName: "talking-about-the-history-of-bikes.mp3",
				audioContentType: "audio/mpeg",
				audioSize: 6,
				groups: JSON.stringify([
					{
						id: "g1",
						type: "notes",
						instruction: "<p>Complete the notes below.</p>",
						startIndex: 0,
						count: 1,
						optionBank: [],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
					{
						id: "g2",
						type: "mcq_many",
						instruction: "<p>Choose TWO letters, A–D.</p>",
						startIndex: 1,
						count: 2,
						optionBank: [],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
				]),
				questions: JSON.stringify([
					{
						stem: "1830s — Advantage: need ____ than walking",
						opts: null,
						answer: "less effort",
						alts: "",
						type: "notes",
					},
					{
						stem: "Which TWO were affected?",
						opts: ["Wheel size", "Balance", "Rate of speed", "The back wheel"],
						answer: "C",
						alts: "",
						type: "mcq_many",
						answerSet: "g2",
					},
					{
						stem: "Which TWO were affected?",
						opts: ["Wheel size", "Balance", "Rate of speed", "The back wheel"],
						answer: "D",
						alts: "",
						type: "mcq_many",
						answerSet: "g2",
					},
				]),
			},
		]);

		app = buildApp({
			getDb: () => db,
			corsOrigin: ["http://localhost:8003"],
			getLibraryAudioStore: () => libraryAudioStore,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> =>
				headers.get("x-test-user") === "hoa"
					? {
							userId: "u-hoa",
							userName: "Hoa",
							email: "hoa@test.local",
							emailVerified: true,
							role: "student",
						}
					: null,
			authHandler: () => new Response("auth OK"),
		});
	});

	async function catalog(orgId: string) {
		const res = await app.request("/api/student/practice?skill=reading", {
			headers: { "x-test-user": "hoa", "x-student-org-id": orgId },
		});
		expect(res.status).toBe(200);
		return (await res.json()) as {
			total: number;
			items: Array<{ testId: string; title: string; parts: number }>;
		};
	}

	test("đề thư viện ready hiện ở catalog của từng org, đề draft thì không", async () => {
		for (const orgId of ["org-1", "org-2"]) {
			const body = await catalog(orgId);
			expect(body.items.map((i) => i.title)).toEqual([
				"Solving Traffic Problems in Big Cities",
			]);
			expect(body.items[0]?.parts).toBe(1);
		}
	});

	test("gọi lặp lại không nhân đôi bản sao", async () => {
		await catalog("org-1");
		const body = await catalog("org-1");
		expect(body.total).toBe(1);
		const copies = await db
			.select()
			.from(schema.assignmentTest)
			.where(eq(schema.assignmentTest.libraryRef, "lt-ready"));
		expect(copies).toHaveLength(2); // một bản mỗi org
	});

	test("gỡ xuất bản thì ẩn, xuất bản lại thì hiện", async () => {
		await db
			.update(schema.libraryTest)
			.set({ status: "draft" })
			.where(eq(schema.libraryTest.id, "lt-ready"));
		expect((await catalog("org-1")).total).toBe(0);

		await db
			.update(schema.libraryTest)
			.set({ status: "ready" })
			.where(eq(schema.libraryTest.id, "lt-ready"));
		expect((await catalog("org-1")).total).toBe(1);
	});

	test("bản sao thiếu part được bù ở lần mở catalog sau", async () => {
		await db
			.delete(schema.assignmentTestPart)
			.where(
				eq(
					schema.assignmentTestPart.testId,
					(
						await db
							.select({ id: schema.assignmentTest.id })
							.from(schema.assignmentTest)
							.where(eq(schema.assignmentTest.libraryRef, "lt-ready"))
					)[0]?.id as string,
				),
			);
		const body = await catalog("org-1");
		expect(body.items.find((i) => i.title.startsWith("Solving"))?.parts).toBe(
			1,
		);
	});

	test("đề thư viện listening ready đồng bộ sang catalog practice, trả hasAudio và stream audio từ R2", async () => {
		const res = await app.request("/api/student/practice?skill=listening", {
			headers: { "x-test-user": "hoa", "x-student-org-id": "org-1" },
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			total: number;
			items: Array<{ testId: string; title: string; parts: number }>;
		};
		expect(body.total).toBe(1);
		const item = body.items[0];
		expect(item?.title).toBe("Talking about the history of bikes");
		expect(item?.parts).toBe(1);

		const quizRes = await app.request(
			`/api/student/practice/${item?.testId}/quiz`,
			{
				headers: { "x-test-user": "hoa", "x-student-org-id": "org-1" },
			},
		);
		expect(quizRes.status).toBe(200);
		const quiz = (await quizRes.json()) as {
			skill: string;
			hasAudio?: boolean;
			audioName: string;
			questions: Array<{ type?: string }>;
		};
		expect(quiz.skill).toBe("listening");
		expect(quiz.hasAudio).toBe(true);
		expect(quiz.audioName).toBe("talking-about-the-history-of-bikes.mp3");
		expect(quiz.questions.map((q) => q.type)).toEqual([
			"notes",
			"mcq_many",
			"mcq_many",
		]);

		const audioRes = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: { "x-test-user": "hoa", "x-student-org-id": "org-1" },
			},
		);
		expect(audioRes.status).toBe(200);
		expect(audioRes.headers.get("content-type")).toBe("audio/mpeg");
		const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
		expect(Array.from(audioBytes)).toEqual([
			0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
		]);

		// Org khác không đọc được bản sao của org-1
		const otherOrgAudio = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: { "x-test-user": "hoa", "x-student-org-id": "org-2" },
			},
		);
		expect(otherOrgAudio.status).toBe(404);
	});
});
