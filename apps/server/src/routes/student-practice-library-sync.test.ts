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
			async head(key) {
				const obj = audioObjects.get(key);
				if (!obj) return null;
				return {
					contentType: obj.contentType,
					size: obj.bytes.byteLength,
					etag: `"${obj.bytes.byteLength}-${key}"`,
				};
			},
			async get(key, range) {
				const obj = audioObjects.get(key);
				if (!obj) return null;
				if (range && range.offset >= 0 && range.offset < obj.bytes.byteLength) {
					const length = Math.min(
						range.length,
						obj.bytes.byteLength - range.offset,
					);
					const slice = obj.bytes.subarray(range.offset, range.offset + length);
					return {
						body: new Response(slice).body as ReadableStream,
						contentType: obj.contentType,
						size: obj.bytes.byteLength,
						range: { offset: range.offset, length },
						etag: `"${obj.bytes.byteLength}-${key}"`,
					};
				}
				return {
					body: new Response(obj.bytes).body as ReadableStream,
					contentType: obj.contentType,
					size: obj.bytes.byteLength,
					etag: `"${obj.bytes.byteLength}-${key}"`,
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
			groups?: Array<{ id: string; type: string; optionBank: string[] }>;
			questions: Array<{ type?: string; answerSet?: string | null }>;
		};
		expect(quiz.skill).toBe("listening");
		expect(quiz.hasAudio).toBe(true);
		expect(quiz.audioName).toBe("talking-about-the-history-of-bikes.mp3");
		expect(quiz.groups).toHaveLength(2);
		expect(quiz.groups?.[0]?.type).toBe("notes");
		expect(quiz.groups?.[1]?.type).toBe("mcq_many");
		expect(quiz.questions.map((q) => q.type)).toEqual([
			"notes",
			"mcq_many",
			"mcq_many",
		]);
		expect(quiz.questions.map((q) => q.answerSet ?? null)).toEqual([
			null,
			"g2",
			"g2",
		]);

		const audioRes = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-1",
					Origin: "http://localhost:8003",
				},
			},
		);
		expect(audioRes.status).toBe(200);
		expect(audioRes.headers.get("content-type")).toBe("audio/mpeg");
		expect(audioRes.headers.get("accept-ranges")).toBe("bytes");
		expect(audioRes.headers.get("cache-control")).toBe("private, no-cache");
		expect(audioRes.headers.get("cross-origin-resource-policy")).toBe(
			"same-site",
		);
		expect(audioRes.headers.get("referrer-policy")).toBe("no-referrer");
		const etag = audioRes.headers.get("etag");
		expect(etag).toBeTruthy();
		expect(audioRes.headers.get("vary") ?? "").toContain("x-student-org-id");
		const exposeHeaders = (
			audioRes.headers.get("access-control-expose-headers") ?? ""
		).toLowerCase();
		expect(exposeHeaders).toContain("accept-ranges");
		expect(exposeHeaders).toContain("content-range");
		expect(exposeHeaders).toContain("content-length");
		expect(exposeHeaders).toContain("etag");
		const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
		expect(Array.from(audioBytes)).toEqual([
			0x49, 0x44, 0x33, 0x03, 0x00, 0x00,
		]);

		// Revalidation with If-None-Match -> 304 Not Modified
		const cachedRes = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-1",
					"if-none-match": etag ?? "",
				},
			},
		);
		expect(cachedRes.status).toBe(304);

		// Partial Range -> 206
		const rangeRes = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-1",
					Origin: "http://localhost:8003",
					Range: "bytes=0-2",
				},
			},
		);
		expect(rangeRes.status).toBe(206);
		expect(rangeRes.headers.get("content-range")).toBe("bytes 0-2/6");
		expect(rangeRes.headers.get("content-length")).toBe("3");
		expect(Array.from(new Uint8Array(await rangeRes.arrayBuffer()))).toEqual([
			0x49, 0x44, 0x33,
		]);

		// Out-of-bounds Range -> 416
		const badRangeRes = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-1",
					Range: "bytes=100-200",
				},
			},
		);
		expect(badRangeRes.status).toBe(416);
		expect(badRangeRes.headers.get("content-range")).toBe("bytes */6");

		// OPTIONS preflight allows Range & If-None-Match
		const preflight = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				method: "OPTIONS",
				headers: {
					Origin: "http://localhost:8003",
					"Access-Control-Request-Method": "GET",
					"Access-Control-Request-Headers":
						"range, if-none-match, x-student-org-id",
				},
			},
		);
		expect(preflight.status).toBe(204);
		const allowHeaders = (
			preflight.headers.get("access-control-allow-headers") ?? ""
		).toLowerCase();
		expect(allowHeaders).toContain("range");
		expect(allowHeaders).toContain("if-none-match");

		// Org khác không đọc được bản sao của org-1
		const otherOrgAudio = await app.request(
			`/api/student/practice/${item?.testId}/audio`,
			{
				headers: { "x-test-user": "hoa", "x-student-org-id": "org-2" },
			},
		);
		expect(otherOrgAudio.status).toBe(404);
	});

	test("đề thư viện listening đồng bộ hiện đủ dạng câu hỏi nhóm phụ (mcq_many) trong facets và lọc đúng (#884)", async () => {
		const res = await app.request(
			"/api/student/practice?skill=listening&facets=1&type=mcq_many&part=s4",
			{
				headers: { "x-test-user": "hoa", "x-student-org-id": "org-1" },
			},
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			total: number;
			items: Array<{ title: string }>;
			facets?: { types: string[]; parts: string[]; bands: string[] };
		};
		expect(body.total).toBe(1);
		expect(body.items[0]?.title).toBe("Talking about the history of bikes");
		expect(body.facets?.types).toEqual(["mcq_many", "notes"]);
		expect(body.facets?.parts).toEqual(["s4"]);
		expect(body.facets?.bands).toEqual(["7.0"]);
	});

	test("giữ nguyên part của assignment_prompt đã clone sẵn (Study Pack p1) khi đồng bộ đề thư viện đã nâng cấp lên p2 (#884)", async () => {
		await db.insert(schema.organization).values({
			id: "org-pack-pre",
			name: "Study Pack Pre-Migrated Academy",
		});
		await db.insert(schema.student).values({
			id: "s-pack-pre",
			orgId: "org-pack-pre",
			name: "Hoa",
			email: "hoa@test.local",
		});
		await db.insert(schema.libraryTest).values({
			id: "lt-reading-p2",
			title: "The Falkirk Wheel",
			skill: "reading",
			status: "ready",
			collection: "Cambridge IELTS 11",
			testGroup: "Test 1",
		});
		await db.insert(schema.libraryTestPart).values({
			id: "ltp-reading-p2",
			testId: "lt-reading-p2",
			part: "p2",
			type: "tfng",
			title: "The Falkirk Wheel — P2",
			passage: "<p>Original library passage</p>",
			questions: JSON.stringify([{ stem: "Q1", answer: "TRUE", alts: "" }]),
		});
		// Org đã từng materialize prompt này qua Study Pack trước khi migration đổi library_test_part sang p2
		// và giáo viên đã sửa passage nên prompt giữ part='p1'.
		await db.insert(schema.assignmentPrompt).values({
			id: "ap-pack-pre",
			orgId: "org-pack-pre",
			task: "task2",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "The Falkirk Wheel — P1",
			band: "7.0",
			prompt: "",
			passage: "<p>Teacher-edited passage</p>",
			questions: JSON.stringify([{ stem: "Q1", answer: "TRUE", alts: "" }]),
			status: "ready",
			libraryRef: "library_test_part:ltp-reading-p2",
		});

		const res = await app.request(
			"/api/student/practice?skill=reading&facets=1",
			{
				headers: {
					"x-test-user": "hoa",
					"x-student-org-id": "org-pack-pre",
				},
			},
		);
		expect(res.status).toBe(200);

		const syncedTests = await db
			.select()
			.from(schema.assignmentTest)
			.where(eq(schema.assignmentTest.orgId, "org-pack-pre"));
		const falkirkTest = syncedTests.find(
			(row) => row.libraryRef === "lt-reading-p2",
		);
		expect(falkirkTest).toBeTruthy();

		const [atp] = await db
			.select()
			.from(schema.assignmentTestPart)
			.where(eq(schema.assignmentTestPart.testId, falkirkTest?.id ?? ""));
		// Bắt buộc khớp existing assignment_prompt.part ('p1', position 0) để không vỡ tests.ts:212.
		expect(atp?.promptId).toBe("ap-pack-pre");
		expect(atp?.part).toBe("p1");
		expect(atp?.position).toBe(0);
	});

	test("ưu tiên part khớp slot gốc trên đề multi-part có prompt cũ lệch slot và không lặp ghi vô hạn ở lần mở sau (#884)", async () => {
		await db.insert(schema.organization).values({
			id: "org-multi-collide",
			name: "Multi Collide Academy",
		});
		await db.insert(schema.student).values({
			id: "s-multi-collide",
			orgId: "org-multi-collide",
			name: "Hoa",
			email: "hoa@test.local",
		});
		await db.insert(schema.libraryTest).values({
			id: "lt-multi-collide",
			title: "Full Reading Multi-Part",
			skill: "reading",
			status: "ready",
			collection: "Cambridge IELTS 19",
			testGroup: "Test 1",
		});
		await db.insert(schema.libraryTestPart).values([
			{
				id: "ltp-multi-1",
				testId: "lt-multi-collide",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				passage: "<p>Passage 1</p>",
				questions: JSON.stringify([{ stem: "Q1", answer: "TRUE", alts: "" }]),
			},
			{
				id: "ltp-multi-2",
				testId: "lt-multi-collide",
				part: "p2",
				type: "tfng",
				title: "Passage 2",
				passage: "<p>Passage 2</p>",
				questions: JSON.stringify([{ stem: "Q2", answer: "FALSE", alts: "" }]),
			},
		]);
		// Org đã có sẵn prompt từ Study Pack cho ltp-multi-2 nhưng giữ part='p1' (trùng slot với ltp-multi-1)
		await db.insert(schema.assignmentPrompt).values({
			id: "ap-collide-p2-as-p1",
			orgId: "org-multi-collide",
			task: "task2",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Edited Passage 2",
			band: "7.0",
			prompt: "",
			passage: "<p>Teacher edited passage</p>",
			questions: JSON.stringify([{ stem: "Q2", answer: "FALSE", alts: "" }]),
			status: "ready",
			libraryRef: "library_test_part:ltp-multi-2",
		});

		const firstRes = await app.request("/api/student/practice?skill=reading", {
			headers: {
				"x-test-user": "hoa",
				"x-student-org-id": "org-multi-collide",
			},
		});
		expect(firstRes.status).toBe(200);

		const copies = await db
			.select()
			.from(schema.assignmentTest)
			.where(eq(schema.assignmentTest.orgId, "org-multi-collide"));
		const multiCopy = copies.find(
			(row) => row.libraryRef === "lt-multi-collide",
		);
		expect(multiCopy).toBeTruthy();

		const partsAfterFirst = await db
			.select()
			.from(schema.assignmentTestPart)
			.where(eq(schema.assignmentTestPart.testId, multiCopy?.id ?? ""));
		// Exact-match ltp-multi-1 thắng slot p1; không vỡ unique(test_id, part) hay lệch atp.part !== ap.part
		expect(partsAfterFirst).toHaveLength(1);
		expect(partsAfterFirst[0]?.part).toBe("p1");
		const [attachedPrompt] = await db
			.select()
			.from(schema.assignmentPrompt)
			.where(
				eq(schema.assignmentPrompt.id, partsAfterFirst[0]?.promptId ?? ""),
			);
		expect(attachedPrompt?.libraryRef).toBe("library_test_part:ltp-multi-1");
		expect(attachedPrompt?.part).toBe("p1");

		// Lần mở catalog thứ 2 vẫn ổn định, không ghi thêm dòng/đổi id
		const secondRes = await app.request("/api/student/practice?skill=reading", {
			headers: {
				"x-test-user": "hoa",
				"x-student-org-id": "org-multi-collide",
			},
		});
		expect(secondRes.status).toBe(200);
		const partsAfterSecond = await db
			.select()
			.from(schema.assignmentTestPart)
			.where(eq(schema.assignmentTestPart.testId, multiCopy?.id ?? ""));
		expect(partsAfterSecond).toEqual(partsAfterFirst);
	});
});
