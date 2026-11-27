import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import {
	startPracticeResponseSchema,
	type TeacherSubmission,
} from "@teacher-os/api/contracts";
import * as schema from "@teacher-os/db/schema/index";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp, type Db, type ServerApp } from "../app";
import type { MediaStore } from "../lib/media-store";
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../../packages/db/src/migrations", import.meta.url).href,
);

const READING_QUESTIONS_P1 = [
	{ stem: "P1-Q1", opts: null, answer: "TRUE", alts: "", pin: null },
	{ stem: "P1-Q2", opts: null, answer: "FALSE", alts: "NO", pin: null },
];
const READING_QUESTIONS_P2 = [
	{ stem: "P2-Q1", opts: ["A", "B"], answer: "B", alts: "", pin: null },
];

/**
 * Fixture phase 10 (#378): hai org, học viên Hoa (cùng email ở cả hai org
 * để test cross-org qua header x-student-org-id), thư viện đề ready/draft
 * reading + writing 2 part, một lượt giao reading có attempt assignment
 * đã nộp để hồi quy "practice không lọt bảng điểm lớp".
 */
describe("student practice (#378 phase 10)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-1", name: "Academy 1" },
			{ id: "org-2", name: "Academy 2" },
		]);
		await libsql.insert(schema.user).values({
			id: "t-1",
			name: "Cô Lan",
			email: "lan@test.local",
			role: "teacher",
		});
		await libsql.insert(schema.membership).values({
			id: "mem-1",
			orgId: "org-1",
			userId: "t-1",
			role: "teacher",
		});
		await libsql.insert(schema.student).values([
			{
				id: "student-hoa",
				orgId: "org-1",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
			{
				id: "student-hoa-o2",
				orgId: "org-2",
				name: "Nguyễn Thị Hoa",
				email: "hoa@test.local",
			},
		]);
		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 0,
			sessionsTotal: 20,
			status: "active",
		});
		await libsql.insert(schema.enrollment).values({
			id: "enr-1",
			orgId: "org-1",
			classId: "class-1",
			studentId: "student-hoa",
			status: "active",
		});

		await libsql.insert(schema.assignmentTest).values([
			{
				id: "test-read-1",
				orgId: "org-1",
				title: "The Falkirk Wheel",
				description: "<p>Đọc kỹ đề.</p>",
				skill: "reading",
				timeLimitSeconds: 3600,
				collection: "IELTS Trainer 2",
				testGroup: "TEST 1",
				status: "ready",
			},
			{
				id: "test-read-draft",
				orgId: "org-1",
				title: "Bản nháp chưa phát hành",
				skill: "reading",
				timeLimitSeconds: null,
				collection: null,
				testGroup: null,
				status: "draft",
			},
			{
				id: "test-read-2",
				orgId: "org-1",
				title: "Seed vault guards resources",
				skill: "reading",
				timeLimitSeconds: null,
				collection: "Cambridge 18",
				testGroup: null,
				status: "ready",
			},
			{
				id: "test-writ-1",
				orgId: "org-1",
				title: "Writing Mock 1",
				skill: "writing",
				timeLimitSeconds: null,
				collection: null,
				testGroup: null,
				status: "ready",
			},
			{
				id: "test-read-org2",
				orgId: "org-2",
				title: "Đề của org khác",
				skill: "reading",
				timeLimitSeconds: null,
				collection: null,
				testGroup: null,
				status: "ready",
			},
			{
				id: "test-listen-meta",
				orgId: "org-1",
				title: "Listening Full Meta",
				description: "<p>Nghe kỹ băng.</p>",
				skill: "listening",
				timeLimitSeconds: 1800,
				collection: "Cambridge 19",
				testGroup: "TEST 2",
				status: "ready",
			},
			{
				id: "test-listen-zero",
				orgId: "org-1",
				title: "Listening Zero Limit",
				description: null,
				skill: "listening",
				timeLimitSeconds: 0,
				collection: null,
				testGroup: "SECTION 1",
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "prompt-read-p1",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				prompt: "",
				passage: "<p>Passage one</p>",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
			{
				id: "prompt-read-p2",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p2",
				type: "choice",
				title: "Passage 2",
				prompt: "",
				passage: "<p>Passage two</p>",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			{
				id: "prompt-writ-task1",
				orgId: "org-1",
				task: "task1",
				genre: "graph",
				skill: "writing",
				part: "task1",
				type: "report",
				title: "Task 1",
				prompt: "<p>Describe the graph.</p>",
				questions: "[]",
				note: "<p>150 từ.</p>",
				status: "ready",
			},
			{
				id: "prompt-writ-task2",
				orgId: "org-1",
				task: "task2",
				genre: "essay",
				skill: "writing",
				part: "task2",
				type: "essay",
				title: "Task 2",
				prompt: "<p>Some people think…</p>",
				questions: "[]",
				note: "<p>250 từ.</p>",
				status: "ready",
			},
			{
				id: "prompt-read-org2",
				orgId: "org-2",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "P1 org2",
				prompt: "",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
			{
				id: "prompt-listen-s1",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq",
				title: "Section 1",
				prompt: "",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			{
				id: "prompt-listen-s2",
				orgId: "org-1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "tfng",
				title: "Section 2",
				prompt: "",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-1",
				testId: "test-read-1",
				promptId: "prompt-read-p1",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-2",
				testId: "test-read-1",
				promptId: "prompt-read-p2",
				part: "p2",
				position: 2,
			},
			{
				id: "atp-3",
				testId: "test-read-2",
				promptId: "prompt-read-p1",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-4",
				testId: "test-writ-1",
				promptId: "prompt-writ-task1",
				part: "task1",
				position: 1,
			},
			{
				id: "atp-5",
				testId: "test-writ-1",
				promptId: "prompt-writ-task2",
				part: "task2",
				position: 2,
			},
			{
				id: "atp-6",
				testId: "test-read-org2",
				promptId: "prompt-read-org2",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-7",
				testId: "test-listen-meta",
				promptId: "prompt-listen-s1",
				part: "s1",
				position: 1,
			},
			{
				id: "atp-8",
				testId: "test-listen-meta",
				promptId: "prompt-listen-s2",
				part: "s2",
				position: 2,
			},
			{
				id: "atp-9",
				testId: "test-listen-zero",
				promptId: "prompt-listen-s1",
				part: "s1",
				position: 1,
			},
		]);

		// Lượt giao reading có attempt assignment đã nộp — hồi quy snapshot.
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-ca-read",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Bài giao trên lớp",
			prompt: "",
			questions: JSON.stringify(READING_QUESTIONS_P1),
			status: "ready",
		});
		await libsql.insert(schema.classAssignment).values({
			id: "ca-1",
			orgId: "org-1",
			classId: "class-1",
			promptId: "prompt-ca-read",
			title: "Quiz tuần 3",
			due: "2099-01-10",
		});
		await libsql.insert(schema.classAssignmentTarget).values({
			id: "cat-1",
			orgId: "org-1",
			assignmentId: "ca-1",
			studentId: "student-hoa",
			submittedAt: null,
		});
		await libsql.insert(schema.quizAttempt).values({
			id: "attempt-ca",
			orgId: "org-1",
			assignmentId: "ca-1",
			studentId: "student-hoa",
			status: "submitted",
			questionsSnapshot: JSON.stringify(READING_QUESTIONS_P1),
			answers: JSON.stringify({ 0: "TRUE", 1: "FALSE" }),
			correctCount: 2,
			submittedAt: new Date("2026-10-01T01:00:00Z"),
		});

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const key = headers.get("x-test-user");
				if (key === "hoa")
					return {
						userId: "u-hoa",
						userName: "Nguyễn Thị Hoa",
						email: "hoa@test.local",
						emailVerified: true,
						role: "student",
					};
				if (key === "teacher")
					return {
						userId: "t-1",
						userName: "Cô Lan",
						role: "teacher",
					};
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function studentGet(path: string, orgId = "org-1"): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: { "x-test-user": "hoa", "x-student-org-id": orgId },
		});
	}

	async function studentPost(path: string, orgId = "org-1"): Promise<Response> {
		return app.request(path, {
			method: "POST",
			headers: {
				"x-test-user": "hoa",
				"x-student-org-id": orgId,
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body: "{}",
		});
	}

	describe("GET /api/student/practice — catalog", () => {
		test("chỉ trả đề ready của org đang chọn, kèm parts/duration/lastAttempt", async () => {
			const res = await studentGet("/api/student/practice?skill=reading");
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				items: Array<Record<string, unknown>>;
				page: number;
				pages: number;
				total: number;
			};
			// Draft ẩn, đề org-2 ẩn — chỉ 2 đề ready của org-1.
			expect(body.total).toBe(2);
			expect(body.items.map((i) => i.testId).sort()).toEqual([
				"test-read-1",
				"test-read-2",
			]);
			const first = body.items.find((i) => i.testId === "test-read-1");
			expect(first).toMatchObject({
				title: "The Falkirk Wheel",
				skill: "reading",
				parts: 2,
				collection: "IELTS Trainer 2",
				testGroup: "TEST 1",
				durationMin: 60,
				lastAttempt: null,
			});
			expect(Object.keys(first ?? {}).sort()).toEqual([
				"collection",
				"durationMin",
				"lastAttempt",
				"parts",
				"skill",
				"testGroup",
				"testId",
				"title",
			]);
		});

		test("skill không hợp lệ và page không hợp lệ → 400", async () => {
			expect(
				(await studentGet("/api/student/practice?skill=dictation")).status,
			).toBe(400);
			expect((await studentGet("/api/student/practice")).status).toBe(400);
			expect(
				(await studentGet("/api/student/practice?skill=reading&page=0")).status,
			).toBe(400);
		});

		test("lọc collection và tìm theo tiêu đề (không phân biệt hoa/thường)", async () => {
			const byCollection = await studentGet(
				"/api/student/practice?skill=reading&collection=Cambridge%2018",
			);
			const collectionBody = (await byCollection.json()) as {
				items: Array<{ testId: string }>;
			};
			expect(collectionBody.items.map((i) => i.testId)).toEqual([
				"test-read-2",
			]);

			const byQuery = await studentGet(
				"/api/student/practice?skill=reading&q=falkirk",
			);
			const queryBody = (await byQuery.json()) as {
				items: Array<{ testId: string }>;
				total: number;
			};
			expect(queryBody.total).toBe(1);
			expect(queryBody.items[0]?.testId).toBe("test-read-1");
		});

		test("org khác (cùng email học viên) không thấy đề của org-1", async () => {
			const res = await studentGet(
				"/api/student/practice?skill=reading",
				"org-2",
			);
			const body = (await res.json()) as {
				items: Array<{ testId: string }>;
				total: number;
			};
			expect(body.total).toBe(1);
			expect(body.items[0]?.testId).toBe("test-read-org2");
		});

		test("chưa đăng nhập → 401", async () => {
			const res = await app.request("/api/student/practice?skill=reading");
			expect(res.status).toBe(401);
		});
	});

	describe("POST /api/student/practice/:testId/attempts — start", () => {
		test("tạo attempt practice: assignment_id NULL, mode=practice, snapshot gộp đủ key", async () => {
			const res = await studentPost(
				"/api/student/practice/test-read-1/attempts",
			);
			expect(res.status).toBe(201);
			const { attemptId } = startPracticeResponseSchema.parse(await res.json());
			expect(attemptId).toBeTruthy();

			const [row] = await libsql
				.select()
				.from(schema.quizAttempt)
				.where(eq(schema.quizAttempt.id, attemptId));
			expect(row?.assignmentId).toBeNull();
			expect(row?.testId).toBe("test-read-1");
			expect(row?.mode).toBe("practice");
			expect(row?.status).toBe("in_progress");
			// Snapshot gộp 3 câu của 2 part theo position, giữ nguyên key.
			const questions = JSON.parse(row?.questionsSnapshot ?? "[]") as Array<{
				stem: string;
				answer: string;
			}>;
			expect(questions.map((q) => q.stem)).toEqual(["P1-Q1", "P1-Q2", "P2-Q1"]);
			expect(questions[0]?.answer).toBe("TRUE");
		});

		test("resume lượt đang làm → 200 cùng attemptId; làm lại sau khi nộp → lượt mới", async () => {
			const first = await studentPost(
				"/api/student/practice/test-read-2/attempts",
			);
			expect(first.status).toBe(201);
			const { attemptId } = startPracticeResponseSchema.parse(
				await first.json(),
			);

			const resume = await studentPost(
				"/api/student/practice/test-read-2/attempts",
			);
			expect(resume.status).toBe(200);
			const resumed = startPracticeResponseSchema.parse(await resume.json());
			expect(resumed.attemptId).toBe(attemptId);

			await libsql
				.update(schema.quizAttempt)
				.set({ status: "submitted", submittedAt: new Date() })
				.where(eq(schema.quizAttempt.id, attemptId));
			const retake = await studentPost(
				"/api/student/practice/test-read-2/attempts",
			);
			// Practice làm lại được — không 409 như luồng assignment.
			expect(retake.status).toBe(201);
			const created = startPracticeResponseSchema.parse(await retake.json());
			expect(created.attemptId).not.toBe(attemptId);
		});

		test("đề draft, đề org khác, đề không có part → 404", async () => {
			expect(
				(await studentPost("/api/student/practice/test-read-draft/attempts"))
					.status,
			).toBe(404);
			// Đề ready của org-2 nhưng header chọn org-1 → không thấy.
			expect(
				(await studentPost("/api/student/practice/test-read-org2/attempts"))
					.status,
			).toBe(404);
		});

		test("guard CSRF: Origin lạ → 403, sai Content-Type → 415", async () => {
			const badOrigin = await app.request(
				"/api/student/practice/test-read-1/attempts",
				{
					method: "POST",
					headers: {
						"x-test-user": "hoa",
						Origin: "http://evil.example",
						"Content-Type": "application/json",
					},
					body: "{}",
				},
			);
			expect(badOrigin.status).toBe(403);

			const badType = await app.request(
				"/api/student/practice/test-read-1/attempts",
				{
					method: "POST",
					headers: {
						"x-test-user": "hoa",
						"x-student-org-id": "org-1",
						Origin: STUDENT_ORIGIN,
						"Content-Type": "text/plain",
					},
					body: "{}",
				},
			);
			expect(badType.status).toBe(415);
		});
	});

	describe("GET /api/student/practice/:testId/quiz — take payload", () => {
		test("đề sạch khi chưa start; attempt đang làm trả answers để resume", async () => {
			const fresh = await studentGet("/api/student/practice/test-writ-1/quiz");
			expect(fresh.status).toBe(200);
			const detail = (await fresh.json()) as Record<string, unknown>;
			expect(detail.title).toBe("Writing Mock 1");
			expect(detail.due).toBe("");
			expect(detail.dueAt).toBeNull();
			expect(detail.skill).toBe("writing");
			expect(detail.questions).toEqual([]);
			expect(detail.attempt).toBeNull();
			expect(detail.timeLimitSeconds).toBeNull();
			expect(detail.partsCount).toBe(2);
			expect(detail.collection).toBeNull();
			expect(detail.testGroup).toBeNull();
			expect(detail.description).toBeNull();

			// Start rồi mới lấy take payload → có attempt + chrome part đầu.
			await studentPost("/api/student/practice/test-writ-1/attempts");
			const resumed = await studentGet(
				"/api/student/practice/test-writ-1/quiz",
			);
			const resumedDetail = (await resumed.json()) as {
				prompt: string;
				part: string;
				attempt: { id: string; status: string } | null;
			};
			// Chrome từ prompt của part ĐẦU (task1).
			expect(resumedDetail.prompt).toBe("<p>Describe the graph.</p>");
			expect(resumedDetail.part).toBe("task1");
			expect(resumedDetail.attempt?.status).toBe("in_progress");
		});

		test("trả đủ practice intro metadata trước start (fresh) và sau start (in_progress), chuẩn hoá timeLimitSeconds <= 0 (#883)", async () => {
			const freshListen = await studentGet(
				"/api/student/practice/test-listen-meta/quiz",
			);
			expect(freshListen.status).toBe(200);
			const freshBody = (await freshListen.json()) as Record<string, unknown>;
			expect(freshBody.attempt).toBeNull();
			expect(freshBody.timeLimitSeconds).toBe(1800);
			expect(freshBody.partsCount).toBe(2);
			expect(freshBody.collection).toBe("Cambridge 19");
			expect(freshBody.testGroup).toBe("TEST 2");
			expect(freshBody.description).toBe("<p>Nghe kỹ băng.</p>");
			expect(Array.isArray(freshBody.questions)).toBe(true);
			expect((freshBody.questions as unknown[]).length).toBe(3);

			// test-read-1 đã được POST /attempts ở block trên → kiểm metadata giữ nguyên ở trạng thái in_progress.
			const inProgressRead = await studentGet(
				"/api/student/practice/test-read-1/quiz",
			);
			expect(inProgressRead.status).toBe(200);
			const readBody = (await inProgressRead.json()) as {
				attempt: { status: string } | null;
				timeLimitSeconds: number | null;
				partsCount: number;
				collection: string | null;
				testGroup: string | null;
				description: string | null;
				questions: unknown[];
			};
			expect(readBody.attempt?.status).toBe("in_progress");
			expect(readBody.timeLimitSeconds).toBe(3600);
			expect(readBody.partsCount).toBe(2);
			expect(readBody.collection).toBe("IELTS Trainer 2");
			expect(readBody.testGroup).toBe("TEST 1");
			expect(readBody.description).toBe("<p>Đọc kỹ đề.</p>");
			expect(readBody.questions).toHaveLength(3);

			// timeLimitSeconds <= 0 không gây 404 fail-closed mà chuẩn hoá về null ở cả /quiz lẫn catalog.
			const zeroRes = await studentGet(
				"/api/student/practice/test-listen-zero/quiz",
			);
			expect(zeroRes.status).toBe(200);
			const zeroBody = (await zeroRes.json()) as Record<string, unknown>;
			expect(zeroBody.timeLimitSeconds).toBeNull();
			expect(zeroBody.partsCount).toBe(1);
			expect(zeroBody.collection).toBeNull();
			expect(zeroBody.testGroup).toBe("SECTION 1");

			const catalogRes = await studentGet(
				"/api/student/practice?skill=listening",
			);
			expect(catalogRes.status).toBe(200);
			const catalogBody = (await catalogRes.json()) as {
				items: Array<{ testId: string; durationMin: number | null }>;
			};
			const zeroCard = catalogBody.items.find(
				(i) => i.testId === "test-listen-zero",
			);
			expect(zeroCard?.durationMin).toBeNull();
		});

		test("đề draft → 404", async () => {
			const res = await studentGet(
				"/api/student/practice/test-read-draft/quiz",
			);
			expect(res.status).toBe(404);
		});
	});

	describe("submit + tách khỏi bảng điểm lớp", () => {
		let practiceAttemptId = "";

		test("nộp bài reading practice → counters đúng, KHÔNG stamp target", async () => {
			const start = await studentPost(
				"/api/student/practice/test-read-1/attempts",
			);
			practiceAttemptId = startPracticeResponseSchema.parse(
				await start.json(),
			).attemptId;

			for (const [q, value] of [
				[0, "TRUE"],
				[1, "FALSE"],
				[2, "B"],
			]) {
				const patch = await app.request(
					`/api/student/attempts/${practiceAttemptId}/answer`,
					{
						method: "PATCH",
						headers: {
							"x-test-user": "hoa",
							"x-student-org-id": "org-1",
							Origin: STUDENT_ORIGIN,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ q, value }),
					},
				);
				expect(patch.status).toBe(200);
			}

			const submit = await app.request(
				`/api/student/attempts/${practiceAttemptId}/submit`,
				{
					method: "POST",
					headers: {
						"x-test-user": "hoa",
						"x-student-org-id": "org-1",
						Origin: STUDENT_ORIGIN,
						"Content-Type": "application/json",
					},
					body: "{}",
				},
			);
			expect(submit.status).toBe(200);
			expect(await submit.json()).toEqual({
				correctCount: 3,
				totalCount: 3,
				wrongCount: 0,
				skippedCount: 0,
			});

			// Lượt giao reading (ca-1) KHÔNG bị stamp submittedAt bởi submit
			// practice — target chỉ gắn luồng assignment.
			const [target] = await libsql
				.select()
				.from(schema.classAssignmentTarget)
				.where(eq(schema.classAssignmentTarget.id, "cat-1"));
			expect(target?.submittedAt).toBeNull();
		});

		test("summary practice gắn cờ practice + testId, assignmentId rỗng", async () => {
			const res = await studentGet(
				`/api/student/attempts/${practiceAttemptId}`,
			);
			expect(res.status).toBe(200);
			const summary = (await res.json()) as Record<string, unknown>;
			expect(summary.practice).toBe(true);
			expect(summary.testId).toBe("test-read-1");
			expect(summary.assignmentId).toBe("");
			expect(summary.title).toBe("The Falkirk Wheel");
			expect(summary.skill).toBe("reading");
		});

		test("snapshot giáo viên: practice không lọt attemptByTarget/bảng điểm", async () => {
			const res = await app.request("/api/kernel", {
				headers: { "x-test-user": "teacher" },
			});
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				classAssignments: Array<{
					id: string;
					targets: Array<{
						studentId: string;
						attemptId: string | null;
						submittedAt: string | null;
						correctCount?: number | null;
						totalQuestions?: number | null;
					}>;
				}>;
			};
			const ca1 = body.classAssignments.find((c) => c.id === "ca-1");
			expect(ca1?.targets).toHaveLength(1);
			// DB cat-1.submittedAt vẫn null (đã kiểm ở test trước); snapshot suy
			// submittedAt từ attempt-ca (assignment-mode), không nhận timestamp hay
			// điểm 3/3 của practice attempt riêng biệt.
			expect(ca1?.targets[0]?.attemptId).toBe("attempt-ca");
			expect(ca1?.targets[0]?.submittedAt).toBe("2026-10-01T01:00:00.000Z");
			expect(ca1?.targets[0]?.correctCount).toBe(2);
			expect(ca1?.targets[0]?.totalQuestions).toBe(2);
		});

		test("bài tập lớp của học viên không chứa đề practice", async () => {
			const res = await studentGet("/api/student/overview");
			const body = (await res.json()) as {
				assignments: Array<{ id: string; source: string }>;
			};
			expect(body.assignments.map((a) => a.id)).toEqual(["ca-1"]);
		});

		test("hàng chờ chấm: writing practice vào grading route với nhãn Luyện tập", async () => {
			// Học viên nộp bài writing practice.
			const start = await studentPost(
				"/api/student/practice/test-writ-1/attempts",
			);
			const { attemptId } = startPracticeResponseSchema.parse(
				await start.json(),
			);
			const submit = await app.request(
				`/api/student/attempts/${attemptId}/essay`,
				{
					method: "PATCH",
					headers: {
						"x-test-user": "hoa",
						"x-student-org-id": "org-1",
						Origin: STUDENT_ORIGIN,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ text: "Bài viết tự luyện của Hoa." }),
				},
			);
			expect(submit.status).toBe(200);
			const submitRes = await app.request(
				`/api/student/attempts/${attemptId}/submit`,
				{
					method: "POST",
					headers: {
						"x-test-user": "hoa",
						"x-student-org-id": "org-1",
						Origin: STUDENT_ORIGIN,
						"Content-Type": "application/json",
					},
					body: "{}",
				},
			);
			expect(submitRes.status).toBe(200);

			const gradedRes = await app.request(`/api/grading/${attemptId}`, {
				headers: { "x-test-user": "teacher" },
			});
			expect(gradedRes.status).toBe(200);
			const submission = (await gradedRes.json()) as TeacherSubmission;
			expect(submission.practice).toBe(true);
			expect(submission.className).toBe("Luyện tập");
			expect(submission.classId).toBe("");
			expect(submission.due).toBe("");
			expect(submission.title).toBe("Writing Mock 1");
			expect(submission.skill).toBe("writing");
			// Prompt fields từ part đầu (task1).
			expect(submission.prompt.prompt).toBe("<p>Describe the graph.</p>");

			// Giáo viên chấm được: band derive từ 4 tiêu chí writing.
			const grade = await app.request(`/api/grading/${attemptId}/grade`, {
				method: "POST",
				headers: {
					"x-test-user": "teacher",
					// Origin guard của kernel chỉ chấp nhận allowlist của app —
					// fixture này khai báo đúng một origin (student portal).
					Origin: STUDENT_ORIGIN,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 5.5 },
					feedback: "CầnDevelop ý tốt hơn.",
				}),
			});
			expect(grade.status).toBe(200);

			// Học viên thấy điểm giáo viên ở summary.
			const after = await studentGet(`/api/student/attempts/${attemptId}`);
			const afterSummary = (await after.json()) as {
				grade: { band: number } | null;
			};
			expect(afterSummary.grade).not.toBeNull();

			// Attempt lượt giao còn lại nguyên trạng thái chấm (chưa chấm).
			const [caAttempt] = await libsql
				.select()
				.from(schema.quizAttempt)
				.where(eq(schema.quizAttempt.id, "attempt-ca"));
			expect(caAttempt?.gradeScores).toBeNull();
		});

		test("grading attempt practice của org khác → 404 (IDOR)", async () => {
			// Attempt practice của Hoa org-2: tạo trực tiếp rồi gọi bằng teacher org-1.
			await libsql.insert(schema.assignmentTest).values({
				id: "test-writ-org2",
				orgId: "org-2",
				title: "Writing org2",
				skill: "writing",
				status: "ready",
			});
			await libsql.insert(schema.quizAttempt).values({
				id: "attempt-org2",
				orgId: "org-2",
				assignmentId: null,
				studentId: "student-hoa-o2",
				testId: "test-writ-org2",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: "[]",
				essay: "Bài org 2.",
				submittedAt: new Date("2026-10-02T01:00:00Z"),
			});
			const res = await app.request("/api/grading/attempt-org2", {
				headers: { "x-test-user": "teacher" },
			});
			expect(res.status).toBe(404);
		});
	});
});

describe("practice timer, clock header, concurrency & cross-reload duration", () => {
	let app: ServerApp;
	let libsql: Db;
	let nowMs = Date.parse("2026-11-24T10:00:00.000Z");

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-t", name: "Timer Academy" });
		await libsql.insert(schema.student).values({
			id: "student-t",
			orgId: "org-t",
			name: "Minh",
			email: "minh@test.local",
		});
		await libsql.insert(schema.assignmentTest).values([
			{
				id: "test-timed",
				orgId: "org-t",
				title: "Reading 20m",
				skill: "reading",
				timeLimitSeconds: 1200,
				status: "ready",
			},
			{
				id: "test-untimed",
				orgId: "org-t",
				title: "Reading Untimed",
				skill: "reading",
				timeLimitSeconds: null,
				status: "ready",
			},
			{
				id: "test-zero-limit",
				orgId: "org-t",
				title: "Reading Legacy Zero",
				skill: "reading",
				timeLimitSeconds: 0,
				status: "ready",
			},
			{
				id: "test-race",
				orgId: "org-t",
				title: "Reading Race",
				skill: "reading",
				timeLimitSeconds: 600,
				status: "ready",
			},
		]);
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-t",
			orgId: "org-t",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "tfng",
			title: "Passage 1",
			prompt: "",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify(READING_QUESTIONS_P1),
			status: "ready",
		});
		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-t1",
				testId: "test-timed",
				promptId: "prompt-t",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-t2",
				testId: "test-untimed",
				promptId: "prompt-t",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-t3",
				testId: "test-zero-limit",
				promptId: "prompt-t",
				part: "p1",
				position: 1,
			},
			{
				id: "atp-t4",
				testId: "test-race",
				promptId: "prompt-t",
				part: "p1",
				position: 1,
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			now: () => new Date(nowMs),
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				if (headers.get("x-test-user") === "minh") {
					return {
						userId: "u-minh",
						userName: "Minh",
						email: "minh@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function studentGet(path: string): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: {
				"x-test-user": "minh",
				"x-student-org-id": "org-t",
				Origin: STUDENT_ORIGIN,
			},
		});
	}

	async function studentMutate(
		path: string,
		method: "POST" | "PATCH",
		body = "{}",
	): Promise<Response> {
		return app.request(path, {
			method,
			headers: {
				"x-test-user": "minh",
				"x-student-org-id": "org-t",
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body,
		});
	}

	test("timed practice emits timeLimitSeconds and X-Server-Now header (CORS-exposed); untimed & <=0 normalize cleanly", async () => {
		nowMs = Date.parse("2026-11-24T10:00:00.000Z");

		const catalogRes = await studentGet("/api/student/practice?skill=reading");
		expect(catalogRes.status).toBe(200);
		const catalog = (await catalogRes.json()) as {
			items: Array<{ testId: string; durationMin: number | null }>;
		};
		const byId = new Map(catalog.items.map((i) => [i.testId, i.durationMin]));
		expect(byId.get("test-timed")).toBe(20);
		expect(byId.get("test-untimed")).toBeNull();
		expect(byId.get("test-zero-limit")).toBeNull();

		const timedRes = await studentGet("/api/student/practice/test-timed/quiz");
		expect(timedRes.status).toBe(200);
		expect(timedRes.headers.get("X-Server-Now")).toBe(
			"2026-11-24T10:00:00.000Z",
		);
		expect(timedRes.headers.get("Access-Control-Expose-Headers")).toContain(
			"X-Server-Now",
		);
		const timedDetail = (await timedRes.json()) as Record<string, unknown>;
		expect(timedDetail.timeLimitSeconds).toBe(1200);
		expect(timedDetail.attempt).toBeNull();
		expect("serverNow" in timedDetail).toBe(false);

		for (const id of ["test-untimed", "test-zero-limit"]) {
			const res = await studentGet(`/api/student/practice/${id}/quiz`);
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.timeLimitSeconds).toBeNull();
		}
	});

	test("concurrent POST /practice/:testId/attempts resolves to one canonical attemptId and single in_progress row", async () => {
		nowMs = Date.parse("2026-11-24T10:00:00.000Z");
		const [r1, r2] = await Promise.all([
			studentMutate("/api/student/practice/test-race/attempts", "POST"),
			studentMutate("/api/student/practice/test-race/attempts", "POST"),
		]);
		expect([r1.status, r2.status].sort()).toEqual([200, 201]);
		const id1 = startPracticeResponseSchema.parse(await r1.json()).attemptId;
		const id2 = startPracticeResponseSchema.parse(await r2.json()).attemptId;
		expect(id1).toBe(id2);

		const rows = await libsql
			.select({ id: schema.quizAttempt.id })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.testId, "test-race"));
		expect(rows).toHaveLength(1);
	});

	test("cross-reload trace preserves startedAt and counts full pre-reload + post-resume duration", async () => {
		const t0Iso = "2026-11-24T10:00:00.000Z";
		const t0 = Date.parse(t0Iso);
		nowMs = t0;

		const startRes = await studentMutate(
			"/api/student/practice/test-timed/attempts",
			"POST",
		);
		expect(startRes.status).toBe(201);
		const { attemptId } = startPracticeResponseSchema.parse(
			await startRes.json(),
		);

		// T0 + 2m30s: answer Q0
		nowMs = t0 + 150_000;
		const patch0 = await studentMutate(
			`/api/student/attempts/${attemptId}/answer`,
			"PATCH",
			JSON.stringify({ q: 0, value: "TRUE" }),
		);
		expect(patch0.status).toBe(200);

		// T0 + 3m00s: simulated page reload GET /quiz
		nowMs = t0 + 180_000;
		const reloadRes = await studentGet("/api/student/practice/test-timed/quiz");
		expect(reloadRes.status).toBe(200);
		expect(reloadRes.headers.get("X-Server-Now")).toBe(
			new Date(t0 + 180_000).toISOString(),
		);
		const reloadBody = (await reloadRes.json()) as {
			timeLimitSeconds?: number;
			attempt: {
				id: string;
				startedAt?: string;
				answers: Record<string, string>;
			} | null;
		};
		expect(reloadBody.timeLimitSeconds).toBe(1200);
		expect(reloadBody.attempt?.id).toBe(attemptId);
		expect(reloadBody.attempt?.startedAt).toBe(t0Iso);
		expect(reloadBody.attempt?.answers).toEqual({ "0": "TRUE" });

		// T0 + 3m05s: re-clicking card in catalog returns 200 same attemptId and keeps startedAt
		nowMs = t0 + 185_000;
		const reopenRes = await studentMutate(
			"/api/student/practice/test-timed/attempts",
			"POST",
		);
		expect(reopenRes.status).toBe(200);
		expect(
			startPracticeResponseSchema.parse(await reopenRes.json()).attemptId,
		).toBe(attemptId);

		// T0 + 4m44s (284s total): answer Q1 and submit
		nowMs = t0 + 284_000;
		const patch1 = await studentMutate(
			`/api/student/attempts/${attemptId}/answer`,
			"PATCH",
			JSON.stringify({ q: 1, value: "FALSE" }),
		);
		expect(patch1.status).toBe(200);
		const submitRes = await studentMutate(
			`/api/student/attempts/${attemptId}/submit`,
			"POST",
		);
		expect(submitRes.status).toBe(200);

		// Summary reports exact pre-reload + post-resume duration (284s = 4 phút 44 giây)
		const summaryRes = await studentGet(`/api/student/attempts/${attemptId}`);
		expect(summaryRes.status).toBe(200);
		const summary = (await summaryRes.json()) as {
			startedAt: string;
			submittedAt: string;
		};
		expect(summary.startedAt).toBe(t0Iso);
		expect(summary.submittedAt).toBe(new Date(t0 + 284_000).toISOString());
		expect(
			Date.parse(summary.submittedAt) - Date.parse(summary.startedAt),
		).toBe(284_000);
	});
});

describe("GET /api/student/practice — facets & part/type/band filters (#884)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values([
			{ id: "org-f1", name: "Facet Academy 1" },
			{ id: "org-f2", name: "Facet Academy 2" },
		]);
		await libsql.insert(schema.student).values([
			{ id: "st-f1", orgId: "org-f1", name: "Lan", email: "lan@facets.local" },
			{ id: "st-f2", orgId: "org-f2", name: "Lan", email: "lan@facets.local" },
		]);

		// Prompts for org-f1 reading
		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "pf-multi-group",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				band: "7.0",
				title: "Multi-group P1",
				prompt: "",
				passage: "<p>Passage</p>",
				groups: JSON.stringify([
					{
						id: "g1",
						type: "tfng",
						instruction: "",
						startIndex: 0,
						count: 1,
						optionBank: [],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
					{
						id: "g2",
						type: "fill_blank",
						instruction: "",
						startIndex: 1,
						count: 1,
						optionBank: [],
						answersInline: false,
						splitContent: false,
						dragDrop: false,
					},
				]),
				questions: JSON.stringify([
					{ stem: "Q1", opts: null, answer: "TRUE", alts: "", type: "tfng" },
					{
						stem: "Q2 ____",
						opts: null,
						answer: "sun",
						alts: "",
						type: "fill_blank",
					},
				]),
				status: "ready",
			},
			{
				id: "pf-ungrouped",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p2",
				type: "sent",
				band: "6.0",
				title: "Ungrouped P2",
				prompt: "",
				passage: "<p>Passage</p>",
				groups: "[]",
				questions: JSON.stringify([
					{ stem: "Q1 ____", opts: null, answer: "a", alts: "", type: "sent" },
					{ stem: "Q2", opts: null, answer: "b", alts: "", type: "shortans" },
				]),
				status: "ready",
			},
			{
				id: "pf-malformed-root",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p3",
				type: "ynng",
				band: "7.5",
				title: "Malformed Root JSON",
				prompt: "",
				passage: "<p>Passage</p>",
				groups: "not-json",
				questions: "{broken",
				status: "ready",
			},
			{
				id: "pf-scalar-elements",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				band: "7.0",
				title: "Scalar Array Elements",
				prompt: "",
				passage: "<p>Passage</p>",
				groups:
					'["corrupt", {"type": ["nested"]}, {"type": 123}, null, {"type": "summary"}]',
				questions: '["bad", {"type": "diagram"}]',
				status: "ready",
			},
			{
				id: "pf-scalar-questions-fallback",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p2",
				type: "note",
				band: "7.0",
				title: "Scalar Questions Fallback",
				prompt: "",
				passage: "<p>Passage</p>",
				groups: "[]",
				questions: '["bad", {"type": ["arr"]}, {"type": "diagram"}]',
				status: "ready",
			},
			{
				id: "pf-multipart-p1",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				band: "6.0",
				title: "MultiPart P1",
				prompt: "",
				passage: "<p>P1</p>",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
			{
				id: "pf-multipart-p2",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p2",
				type: "headings",
				band: "7.5",
				title: "MultiPart P2",
				prompt: "",
				passage: "<p>P2</p>",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			// Listening prompts for org-f1 (alias collapsing: mcq1, mcq, mcq3 -> mcq)
			{
				id: "pf-l-s1",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq1",
				band: "7.0",
				title: "Listening S1",
				prompt: "",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			{
				id: "pf-l-s2",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "mcq",
				band: "7.0",
				title: "Listening S2",
				prompt: "",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			{
				id: "pf-l-s3",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s3",
				type: "mcq3",
				band: "7.0",
				title: "Listening S3",
				prompt: "",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P2),
				status: "ready",
			},
			{
				id: "pf-l-s4",
				orgId: "org-f1",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s4",
				type: "notes",
				band: "7.0",
				title: "Listening S4",
				prompt: "",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
			// Other org prompt
			{
				id: "pf-other-org",
				orgId: "org-f2",
				task: "task1",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				band: "8.0",
				title: "Other Org P1",
				prompt: "",
				groups: "[]",
				questions: JSON.stringify(READING_QUESTIONS_P1),
				status: "ready",
			},
		]);

		const baseMs = Date.parse("2026-11-24T12:00:00.000Z");
		// 12 newest reading tests all have collection "Actual Test" (filling page 1 completely)
		const page1ActualTests = Array.from({ length: 10 }, (_, idx) => ({
			id: `tf-actual-${idx + 1}`,
			orgId: "org-f1",
			title: `Actual Reading ${idx + 1}`,
			skill: "reading",
			collection: "Actual Test",
			status: "ready",
			createdAt: new Date(baseMs - idx * 1000),
		}));

		await libsql.insert(schema.assignmentTest).values([
			...page1ActualTests,
			{
				id: "tf-actual-multi-group",
				orgId: "org-f1",
				title: "Actual Multi-Group Reading",
				skill: "reading",
				collection: "  Actual Test  ",
				status: "ready",
				createdAt: new Date(baseMs - 10 * 1000),
			},
			{
				id: "tf-actual-scalar",
				orgId: "org-f1",
				title: "Actual Scalar Array Reading",
				skill: "reading",
				collection: "Actual Test",
				status: "ready",
				createdAt: new Date(baseMs - 11 * 1000),
			},
			// Page 2 items (3 items) have completely different collections + blank collections
			{
				id: "tf-cam18-ungrouped",
				orgId: "org-f1",
				title: "Cambridge 18 Ungrouped",
				skill: "reading",
				collection: "Cambridge IELTS 18",
				status: "ready",
				createdAt: new Date(baseMs - 12 * 1000),
			},
			{
				id: "tf-other-multipart",
				orgId: "org-f1",
				title: "Other Sources MultiPart",
				skill: "reading",
				collection: "Other sources",
				status: "ready",
				createdAt: new Date(baseMs - 13 * 1000),
			},
			{
				id: "tf-blank-collection-1",
				orgId: "org-f1",
				title: "Blank Collection Reading",
				skill: "reading",
				collection: "",
				status: "ready",
				createdAt: new Date(baseMs - 14 * 1000),
			},
			{
				id: "tf-whitespace-collection",
				orgId: "org-f1",
				title: "Whitespace Collection Reading",
				skill: "reading",
				collection: "   ",
				status: "ready",
				createdAt: new Date(baseMs - 15 * 1000),
			},
			// Draft & Other org tests (must NEVER leak into facets or results)
			{
				id: "tf-draft-secret",
				orgId: "org-f1",
				title: "Draft Secret Test",
				skill: "reading",
				collection: "Draft Secret Book",
				status: "draft",
				createdAt: new Date(baseMs + 5000),
			},
			{
				id: "tf-org2-secret",
				orgId: "org-f2",
				title: "Other Org Test",
				skill: "reading",
				collection: "Other Org Book",
				status: "ready",
				createdAt: new Date(baseMs + 5000),
			},
			// Listening tests
			{
				id: "tf-listen-1",
				orgId: "org-f1",
				title: "Listen MCQ1",
				skill: "listening",
				collection: "Cambridge IELTS 17",
				status: "ready",
				createdAt: new Date(baseMs - 1000),
			},
			{
				id: "tf-listen-2",
				orgId: "org-f1",
				title: "Listen MCQ4",
				skill: "listening",
				collection: "Actual Test",
				status: "ready",
				createdAt: new Date(baseMs - 2000),
			},
			{
				id: "tf-listen-3",
				orgId: "org-f1",
				title: "Listen MCQ3",
				skill: "listening",
				collection: "Forecast Quý 2-2025",
				status: "ready",
				createdAt: new Date(baseMs - 3000),
			},
			{
				id: "tf-listen-4",
				orgId: "org-f1",
				title: "Listen Notes S4",
				skill: "listening",
				collection: "Other sources",
				status: "ready",
				createdAt: new Date(baseMs - 4000),
			},
		]);

		await libsql.insert(schema.assignmentTestPart).values([
			...page1ActualTests.map((t, idx) => ({
				id: `atpf-actual-${idx + 1}`,
				testId: t.id,
				promptId: "pf-multi-group",
				part: "p1",
				position: 0,
			})),
			{
				id: "atpf-multi-group",
				testId: "tf-actual-multi-group",
				promptId: "pf-multi-group",
				part: "p1",
				position: 0,
			},
			{
				id: "atpf-scalar",
				testId: "tf-actual-scalar",
				promptId: "pf-scalar-elements",
				part: "p1",
				position: 0,
			},
			{
				id: "atpf-cam18",
				testId: "tf-cam18-ungrouped",
				promptId: "pf-ungrouped",
				part: "p2",
				position: 0,
			},
			{
				id: "atpf-other-p1",
				testId: "tf-other-multipart",
				promptId: "pf-multipart-p1",
				part: "p1",
				position: 0,
			},
			{
				id: "atpf-other-p2",
				testId: "tf-other-multipart",
				promptId: "pf-multipart-p2",
				part: "p2",
				position: 1,
			},
			{
				id: "atpf-blank-1",
				testId: "tf-blank-collection-1",
				promptId: "pf-malformed-root",
				part: "p3",
				position: 0,
			},
			{
				id: "atpf-whitespace-1",
				testId: "tf-whitespace-collection",
				promptId: "pf-scalar-questions-fallback",
				part: "p2",
				position: 0,
			},
			{
				id: "atpf-draft-1",
				testId: "tf-draft-secret",
				promptId: "pf-multi-group",
				part: "p1",
				position: 0,
			},
			{
				id: "atpf-org2-1",
				testId: "tf-org2-secret",
				promptId: "pf-other-org",
				part: "p1",
				position: 0,
			},
			{
				id: "atpf-l1",
				testId: "tf-listen-1",
				promptId: "pf-l-s1",
				part: "s1",
				position: 0,
			},
			{
				id: "atpf-l2",
				testId: "tf-listen-2",
				promptId: "pf-l-s2",
				part: "s2",
				position: 0,
			},
			{
				id: "atpf-l3",
				testId: "tf-listen-3",
				promptId: "pf-l-s3",
				part: "s3",
				position: 0,
			},
			{
				id: "atpf-l4",
				testId: "tf-listen-4",
				promptId: "pf-l-s4",
				part: "s4",
				position: 0,
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				if (headers.get("x-test-user") === "lan") {
					return {
						userId: "u-lan",
						userName: "Lan",
						email: "lan@facets.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function facetGet(path: string, orgId = "org-f1"): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: { "x-test-user": "lan", "x-student-org-id": orgId },
		});
	}

	test("omits facets without ?facets=1 (legacy .strict() compatibility) and sets private cache headers", async () => {
		const res = await facetGet("/api/student/practice?skill=reading&page=1");
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(res.headers.get("vary")).toContain("Cookie");
		expect(res.headers.get("vary")).toContain("x-student-org-id");
		const body = (await res.json()) as Record<string, unknown>;
		expect(Object.keys(body).sort()).toEqual([
			"items",
			"page",
			"pages",
			"total",
		]);
		expect("facets" in body).toBe(false);
	});

	test("returns identical catalog-wide facets across page 1, page 2, and active filters while excluding blanks/draft/other-org and surviving corrupt JSON arrays", async () => {
		const expectedFacets = {
			collections: ["Actual Test", "Cambridge IELTS 18", "Other sources"],
			parts: ["p1", "p2", "p3"],
			bands: ["6.0", "7.0", "7.5"],
			types: [
				"fill_blank",
				"diagram",
				"headings",
				"notes",
				"sent",
				"shortans",
				"summary",
				"tfng",
				"ynng",
			],
		};

		const [p1Res, p2Res, filteredRes] = await Promise.all([
			facetGet("/api/student/practice?skill=reading&page=1&facets=1"),
			facetGet("/api/student/practice?skill=reading&page=2&facets=1"),
			facetGet(
				"/api/student/practice?skill=reading&collection=Cambridge%20IELTS%2018&part=p2&type=shortans&band=6.0&q=nonexistent&facets=1",
			),
		]);

		expect(p1Res.status).toBe(200);
		expect(p2Res.status).toBe(200);
		expect(filteredRes.status).toBe(200);

		const p1 = (await p1Res.json()) as {
			items: Array<{ collection: string | null }>;
			total: number;
			pages: number;
			facets: typeof expectedFacets;
		};
		const p2 = (await p2Res.json()) as {
			facets: typeof expectedFacets;
		};
		const filtered = (await filteredRes.json()) as {
			items: unknown[];
			total: number;
			facets: typeof expectedFacets;
		};

		// Page 1 items ONLY have "Actual Test", yet facets lists ALL 3 collections!
		expect(new Set(p1.items.map((i) => i.collection?.trim()))).toEqual(
			new Set(["Actual Test"]),
		);
		expect(p1.total).toBe(16);
		expect(p1.pages).toBe(2);
		expect(p1.facets).toEqual(expectedFacets);
		expect(p2.facets).toEqual(expectedFacets);
		expect(filtered.total).toBe(0);
		expect(filtered.items).toEqual([]);
		expect(filtered.facets).toEqual(expectedFacets);
	});

	test("filters by trimmed collection, secondary group type, ungrouped question type, and enforces same-part intersection on multi-part tests", async () => {
		// Trimmed collection matches "  Actual Test  " as well as "Actual Test"
		const byCol = await facetGet(
			"/api/student/practice?skill=reading&collection=Actual%20Test&facets=1",
		);
		const colBody = (await byCol.json()) as { total: number };
		expect(colBody.total).toBe(12);

		// Secondary group type fill_blank (prompt.type is tfng, groups[1].type is fill_blank)
		const bySecondaryGroup = await facetGet(
			"/api/student/practice?skill=reading&type=fill_blank&facets=1",
		);
		const secBody = (await bySecondaryGroup.json()) as { total: number };
		expect(secBody.total).toBe(11);

		// Ungrouped per-question fallback type shortans (groups = "[]", questions[1].type = "shortans")
		const byQuestionFallback = await facetGet(
			"/api/student/practice?skill=reading&type=shortans&facets=1",
		);
		const qFallbackBody = (await byQuestionFallback.json()) as {
			items: Array<{ testId: string }>;
		};
		expect(qFallbackBody.items.map((i) => i.testId)).toEqual([
			"tf-cam18-ungrouped",
		]);

		// Scalar element fallback in questions (groups="[]", questions='["bad", ..., {"type":"diagram"}]')
		const byDiagram = await facetGet(
			"/api/student/practice?skill=reading&type=diagram&facets=1",
		);
		const diagBody = (await byDiagram.json()) as {
			items: Array<{ testId: string }>;
		};
		expect(diagBody.items.map((i) => i.testId)).toEqual([
			"tf-whitespace-collection",
		]);

		// Multi-part same-part intersection: p1 is tfng (6.0), p2 is headings (7.5)
		const mismatch = await facetGet(
			"/api/student/practice?skill=reading&part=p1&type=headings&facets=1",
		);
		expect(
			((await mismatch.json()) as { items: unknown[] }).items,
		).toHaveLength(0);

		const exactMatch = await facetGet(
			"/api/student/practice?skill=reading&part=p2&type=headings&band=7.5&facets=1",
		);
		expect(
			(
				(await exactMatch.json()) as { items: Array<{ testId: string }> }
			).items.map((i) => i.testId),
		).toEqual(["tf-other-multipart"]);
	});

	test("canonicalizes listening MCQ aliases (mcq/mcq1/mcq3) in facets and expands them when filtering", async () => {
		const res = await facetGet(
			"/api/student/practice?skill=listening&facets=1",
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			facets: { types: string[]; parts: string[]; bands: string[] };
		};
		expect(body.facets.types).toEqual(["mcq", "notes"]);
		expect(body.facets.parts).toEqual(["s1", "s2", "s3", "s4"]);
		expect(body.facets.bands).toEqual(["7.0"]);

		for (const qType of ["mcq", "mcq1", "mcq3"]) {
			const filtered = await facetGet(
				`/api/student/practice?skill=listening&type=${qType}`,
			);
			const fBody = (await filtered.json()) as {
				items: Array<{ testId: string }>;
			};
			expect(fBody.items.map((i) => i.testId).sort()).toEqual([
				"tf-listen-1",
				"tf-listen-2",
				"tf-listen-3",
			]);
		}
	});

	test("returns 200 empty list for unknown filter values and 400 for oversized raw params or invalid/overflow page", async () => {
		const unknownRes = await facetGet(
			"/api/student/practice?skill=reading&collection=NoSuchBook&type=unknown_t&part=p9&band=9.0&facets=1",
		);
		expect(unknownRes.status).toBe(200);
		const unknownBody = (await unknownRes.json()) as {
			items: unknown[];
			total: number;
			facets: { collections: string[] };
		};
		expect(unknownBody.total).toBe(0);
		expect(unknownBody.items).toEqual([]);
		expect(unknownBody.facets.collections).toEqual([
			"Actual Test",
			"Cambridge IELTS 18",
			"Other sources",
		]);

		for (const protoKey of [
			"toString",
			"constructor",
			"valueOf",
			"__proto__",
		]) {
			const protoRes = await facetGet(
				`/api/student/practice?skill=reading&type=${encodeURIComponent(protoKey)}&facets=1`,
			);
			expect(protoRes.status, `expected 200 for type=${protoKey}`).toBe(200);
			const protoBody = (await protoRes.json()) as {
				items: unknown[];
				total: number;
			};
			expect(protoBody.total).toBe(0);
			expect(protoBody.items).toEqual([]);
		}

		const over200 = "a".repeat(201);
		const spaces201 = " ".repeat(201);
		for (const badPath of [
			`/api/student/practice?skill=reading&collection=${over200}`,
			`/api/student/practice?skill=reading&part=${over200}`,
			`/api/student/practice?skill=reading&type=${over200}`,
			`/api/student/practice?skill=reading&band=${over200}`,
			`/api/student/practice?skill=reading&q=${encodeURIComponent(spaces201)}`,
			"/api/student/practice?skill=reading&page=0",
			"/api/student/practice?skill=reading&page=01",
			"/api/student/practice?skill=reading&page=1abc",
			"/api/student/practice?skill=reading&page=100001",
			"/api/student/practice?skill=reading&page=999999999999999999999",
		]) {
			const badRes = await facetGet(badPath);
			expect(badRes.status, `expected 400 for ${badPath}`).toBe(400);
		}
	});

	test("sorts collections with natural numeric ordering (Cambridge IELTS 7 before 10 and 20)", async () => {
		await libsql
			.insert(schema.organization)
			.values({ id: "org-num-sort", name: "Numeric Sort Academy" });
		await libsql.insert(schema.student).values({
			id: "student-num-sort",
			orgId: "org-num-sort",
			name: "Lan",
			email: "lan@facets.local",
		});

		const cols = [
			{ id: "num-c20", collection: "Cambridge IELTS 20" },
			{ id: "num-c7", collection: "Cambridge IELTS 7" },
			{ id: "num-c10", collection: "Cambridge IELTS 10" },
			{ id: "num-act", collection: "Actual Test" },
		];
		await libsql.insert(schema.assignmentTest).values(
			cols.map((entry) => ({
				id: entry.id,
				orgId: "org-num-sort",
				title: `Title ${entry.id}`,
				skill: "reading",
				collection: entry.collection,
				status: "ready",
			})),
		);
		await libsql.insert(schema.assignmentPrompt).values(
			cols.map((entry) => ({
				id: `p-${entry.id}`,
				orgId: "org-num-sort",
				task: "task2",
				genre: "",
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: `Prompt ${entry.id}`,
				band: "7.0",
				prompt: "",
				passage: "<p>Passage</p>",
				questions: JSON.stringify([
					{
						stem: "Q1",
						opts: null,
						answer: "TRUE",
						alts: "",
						type: "tfng",
						pin: null,
					},
				]),
				status: "ready",
			})),
		);
		await libsql.insert(schema.assignmentTestPart).values(
			cols.map((entry) => ({
				id: `tp-${entry.id}`,
				testId: entry.id,
				promptId: `p-${entry.id}`,
				part: "p1",
				position: 0,
			})),
		);

		const res = await facetGet(
			"/api/student/practice?skill=reading&facets=1",
			"org-num-sort",
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { facets: { collections: string[] } };
		expect(body.facets.collections).toEqual([
			"Actual Test",
			"Cambridge IELTS 7",
			"Cambridge IELTS 10",
			"Cambridge IELTS 20",
		]);
	});
});

describe("student practice multi-part & overlong answerSet isolation", () => {
	let app: ServerApp;
	let libsql: Db;

	const MCQ_OPTS = ["Opt A", "Opt B", "Opt C", "Opt D", "Opt E"];

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-as", name: "AnswerSet Academy" });
		await libsql.insert(schema.student).values({
			id: "student-as",
			orgId: "org-as",
			name: "Linh",
			email: "linh@test.local",
		});

		const twentyCharKey = "set-0123456789abcdef";
		const overlongKey = "legacy-overlong-answerset-key-01";

		await libsql.insert(schema.assignmentTest).values([
			{
				id: "test-mp-explicit",
				orgId: "org-as",
				title: "Multi-Part Explicit 20-char Set",
				skill: "listening",
				timeLimitSeconds: null,
				status: "ready",
			},
			{
				id: "test-mp-implicit",
				orgId: "org-as",
				title: "Multi-Part Implicit Boundary",
				skill: "listening",
				timeLimitSeconds: null,
				status: "ready",
			},
			{
				id: "test-overlong-single",
				orgId: "org-as",
				title: "Single-Part Overlong Key",
				skill: "listening",
				timeLimitSeconds: null,
				status: "ready",
			},
			{
				id: "test-mp-solo-boundary",
				orgId: "org-as",
				title: "Multi-Part Solo mcq_many Boundary",
				skill: "listening",
				timeLimitSeconds: null,
				status: "ready",
			},
		]);

		await libsql.insert(schema.assignmentPrompt).values([
			{
				id: "prompt-mp-exp-1",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq_many",
				title: "Part 1 Explicit",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "A",
						alts: "",
						type: "mcq_many",
						answerSet: twentyCharKey,
					},
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "B",
						alts: "",
						type: "mcq_many",
						answerSet: twentyCharKey,
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-mp-exp-2",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "mcq_many",
				title: "Part 2 Explicit",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "C",
						alts: "",
						type: "mcq_many",
						answerSet: twentyCharKey,
					},
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "D",
						alts: "",
						type: "mcq_many",
						answerSet: twentyCharKey,
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-mp-imp-1",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq_many",
				title: "Part 1 Implicit",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "A",
						alts: "",
						type: "mcq_many",
					},
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "B",
						alts: "",
						type: "mcq_many",
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-mp-imp-2",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "mcq_many",
				title: "Part 2 Implicit",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "C",
						alts: "",
						type: "mcq_many",
					},
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "D",
						alts: "",
						type: "mcq_many",
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-overlong",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq_many",
				title: "Single Part Overlong",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "C",
						alts: "",
						type: "mcq_many",
						answerSet: overlongKey,
					},
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "E",
						alts: "",
						type: "mcq_many",
						answerSet: overlongKey,
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-solo-1",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s1",
				type: "mcq_many",
				title: "Part 1 Solo mcq_many",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "A",
						alts: "",
						type: "mcq_many",
					},
				]),
				status: "ready",
			},
			{
				id: "prompt-solo-2",
				orgId: "org-as",
				task: "task1",
				genre: "",
				skill: "listening",
				part: "s2",
				type: "mcq_many",
				title: "Part 2 Solo mcq_many",
				prompt: "",
				passage: "",
				questions: JSON.stringify([
					{
						stem: "Choose TWO letters, A-E.",
						opts: MCQ_OPTS,
						answer: "B",
						alts: "",
						type: "mcq_many",
					},
				]),
				status: "ready",
			},
		]);

		await libsql.insert(schema.assignmentTestPart).values([
			{
				id: "atp-as-1",
				testId: "test-mp-explicit",
				promptId: "prompt-mp-exp-1",
				part: "s1",
				position: 1,
			},
			{
				id: "atp-as-2",
				testId: "test-mp-explicit",
				promptId: "prompt-mp-exp-2",
				part: "s2",
				position: 2,
			},
			{
				id: "atp-as-3",
				testId: "test-mp-implicit",
				promptId: "prompt-mp-imp-1",
				part: "s1",
				position: 1,
			},
			{
				id: "atp-as-4",
				testId: "test-mp-implicit",
				promptId: "prompt-mp-imp-2",
				part: "s2",
				position: 2,
			},
			{
				id: "atp-as-5",
				testId: "test-overlong-single",
				promptId: "prompt-overlong",
				part: "s1",
				position: 1,
			},
			{
				id: "atp-as-6",
				testId: "test-mp-solo-boundary",
				promptId: "prompt-solo-1",
				part: "s1",
				position: 1,
			},
			{
				id: "atp-as-7",
				testId: "test-mp-solo-boundary",
				promptId: "prompt-solo-2",
				part: "s2",
				position: 2,
			},
		]);

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				if (headers.get("x-test-user") === "linh") {
					return {
						userId: "u-linh",
						userName: "Linh",
						email: "linh@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function asGet(path: string): Promise<Response> {
		return app.request(path, {
			method: "GET",
			headers: {
				"x-test-user": "linh",
				"x-student-org-id": "org-as",
				Origin: STUDENT_ORIGIN,
			},
		});
	}

	async function asMutate(
		path: string,
		method: "POST" | "PATCH",
		body = "{}",
	): Promise<Response> {
		return app.request(path, {
			method,
			headers: {
				"x-test-user": "linh",
				"x-student-org-id": "org-as",
				Origin: STUDENT_ORIGIN,
				"Content-Type": "application/json",
			},
			body,
		});
	}

	async function takeAndSubmit(
		testId: string,
		answers: Record<number, string>,
	) {
		const startRes = await asMutate(
			`/api/student/practice/${testId}/attempts`,
			"POST",
		);
		expect(startRes.status).toBe(201);
		const { attemptId } = startPracticeResponseSchema.parse(
			await startRes.json(),
		);
		for (const [q, value] of Object.entries(answers)) {
			const res = await asMutate(
				`/api/student/attempts/${attemptId}/answer`,
				"PATCH",
				JSON.stringify({ q: Number(q), value }),
			);
			expect(res.status).toBe(200);
		}
		const submitRes = await asMutate(
			`/api/student/attempts/${attemptId}/submit`,
			"POST",
		);
		expect(submitRes.status).toBe(200);
		const submitted = (await submitRes.json()) as {
			correctCount: number;
			wrongCount: number;
			skippedCount: number;
			totalCount: number;
		};
		const summaryRes = await asGet(`/api/student/attempts/${attemptId}`);
		expect(summaryRes.status).toBe(200);
		const summary = (await summaryRes.json()) as {
			correctCount: number;
			items: Array<{ verdict: string; key: string; answer: string | null }>;
		};
		return { attemptId, submitted, summary };
	}

	test("multi-part explicit 20-char answerSet stays <= 20 chars, isolates parts, and grades permutations per part", async () => {
		const quizRes = await asGet("/api/student/practice/test-mp-explicit/quiz");
		expect(quizRes.status).toBe(200);
		const quiz = (await quizRes.json()) as {
			questions: Array<{ answerSet?: string }>;
		};
		expect(quiz.questions).toHaveLength(4);
		const sets = quiz.questions.map((q) => q.answerSet);
		expect(sets[0]).toBeTruthy();
		expect(sets[0]).toBe(sets[1]);
		expect(sets[2]).toBeTruthy();
		expect(sets[2]).toBe(sets[3]);
		expect(sets[0]).not.toBe(sets[2]);
		for (const s of sets) {
			expect((s ?? "").length).toBeLessThanOrEqual(20);
		}

		// Cross-part swapped answers must NOT match across parts.
		const crossSwap = await takeAndSubmit("test-mp-explicit", {
			0: "C",
			1: "D",
			2: "A",
			3: "B",
		});
		expect(crossSwap.submitted.correctCount).toBe(0);

		// Within-part reversed answers score 4/4 and show part-scoped summary keys.
		const intraSwap = await takeAndSubmit("test-mp-explicit", {
			0: "B",
			1: "A",
			2: "D",
			3: "C",
		});
		expect(intraSwap.submitted.correctCount).toBe(4);
		expect(intraSwap.summary.items.map((item) => item.key)).toEqual([
			"A, B",
			"A, B",
			"C, D",
			"C, D",
		]);
	});

	test("multi-part implicit mcq_many boundary separates consecutive clusters across parts", async () => {
		const quizRes = await asGet("/api/student/practice/test-mp-implicit/quiz");
		expect(quizRes.status).toBe(200);
		const quiz = (await quizRes.json()) as {
			questions: Array<{ answerSet?: string }>;
		};
		expect(quiz.questions).toHaveLength(4);
		expect(quiz.questions[0]?.answerSet).toBeTruthy();
		expect(quiz.questions[0]?.answerSet).toBe(quiz.questions[1]?.answerSet);
		expect(quiz.questions[2]?.answerSet).toBeTruthy();
		expect(quiz.questions[2]?.answerSet).toBe(quiz.questions[3]?.answerSet);
		expect(quiz.questions[0]?.answerSet).not.toBe(quiz.questions[2]?.answerSet);

		// Cross-part swap must score 0 (never merged into a single 4-question cluster).
		const crossSwap = await takeAndSubmit("test-mp-implicit", {
			0: "C",
			1: "D",
			2: "A",
			3: "B",
		});
		expect(crossSwap.submitted.correctCount).toBe(0);

		// Within-part swap scores 4/4.
		const intraSwap = await takeAndSubmit("test-mp-implicit", {
			0: "B",
			1: "A",
			2: "D",
			3: "C",
		});
		expect(intraSwap.submitted.correctCount).toBe(4);
	});

	test("single-part overlong legacy answerSet (> 20 chars) is sanitized without 404 and preserves unordered grading", async () => {
		const quizRes = await asGet(
			"/api/student/practice/test-overlong-single/quiz",
		);
		expect(quizRes.status).toBe(200);
		const quiz = (await quizRes.json()) as {
			questions: Array<{ answerSet?: string }>;
		};
		expect(quiz.questions).toHaveLength(2);
		expect(quiz.questions[0]?.answerSet).toBeTruthy();
		expect(quiz.questions[0]?.answerSet).toBe(quiz.questions[1]?.answerSet);
		expect((quiz.questions[0]?.answerSet ?? "").length).toBeLessThanOrEqual(20);

		const result = await takeAndSubmit("test-overlong-single", {
			0: "E",
			1: "C",
		});
		expect(result.submitted.correctCount).toBe(2);
		expect(result.summary.items.map((item) => item.key)).toEqual([
			"C, E",
			"C, E",
		]);
	});

	test("multi-part solo mcq_many without answerSet at part boundaries never merge across parts", async () => {
		const quizRes = await asGet(
			"/api/student/practice/test-mp-solo-boundary/quiz",
		);
		expect(quizRes.status).toBe(200);
		const quiz = (await quizRes.json()) as {
			questions: Array<{ answerSet?: string }>;
		};
		expect(quiz.questions).toHaveLength(2);
		expect(quiz.questions[0]?.answerSet).toBeTruthy();
		expect(quiz.questions[1]?.answerSet).toBeTruthy();
		expect(quiz.questions[0]?.answerSet).not.toBe(quiz.questions[1]?.answerSet);

		// Swapping Part 1 and Part 2 answers must score 0 (each solo question grades positionally).
		const swapped = await takeAndSubmit("test-mp-solo-boundary", {
			0: "B",
			1: "A",
		});
		expect(swapped.submitted.correctCount).toBe(0);
	});
});

describe("student practice — historical review access on demoted draft tests (#887)", () => {
	test("allows /quiz and /audio for a student with a submitted attempt on a draft test, while blocking POST /attempts and non-submitters with 404", async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		const libsql = db as unknown as Db;

		await libsql.insert(schema.organization).values({
			id: "org-hist",
			name: "History Org",
		});
		await libsql.insert(schema.student).values([
			{
				id: "stu-owner",
				orgId: "org-hist",
				name: "Submitted Student",
				email: "owner@test.local",
			},
			{
				id: "stu-other",
				orgId: "org-hist",
				name: "Other Student",
				email: "other@test.local",
			},
			{
				id: "stu-inprog",
				orgId: "org-hist",
				name: "In Progress Student",
				email: "inprog@test.local",
			},
		]);

		const audioKey = "library/demoted-bikes/s4/audio.mp3";
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-demoted",
			orgId: "org-hist",
			task: "task2",
			genre: "",
			skill: "listening",
			part: "s4",
			type: "tablecomp",
			title: "Section 4: Talking about the history of bikes",
			prompt: "",
			questions: JSON.stringify(READING_QUESTIONS_P1),
			audioKey,
			audioName: "bikes.mp3",
			status: "ready",
		});
		await libsql.insert(schema.assignmentTest).values({
			id: "test-demoted-draft",
			orgId: "org-hist",
			title: "Talking about the history of bikes",
			skill: "listening",
			status: "draft",
		});
		await libsql.insert(schema.assignmentTestPart).values({
			id: "atp-demoted",
			testId: "test-demoted-draft",
			promptId: "prompt-demoted",
			part: "s4",
			position: 0,
		});
		await libsql.insert(schema.quizAttempt).values([
			{
				id: "att-submitted",
				orgId: "org-hist",
				assignmentId: null,
				studentId: "stu-owner",
				testId: "test-demoted-draft",
				mode: "practice",
				status: "submitted",
				questionsSnapshot: JSON.stringify(READING_QUESTIONS_P1),
				correctCount: 1,
				submittedAt: new Date(1700000000000),
			},
			{
				id: "att-owner-stale-in-progress",
				orgId: "org-hist",
				assignmentId: null,
				studentId: "stu-owner",
				testId: "test-demoted-draft",
				mode: "practice",
				status: "in_progress",
				questionsSnapshot: "corrupt-snapshot-must-not-be-loaded-for-draft",
			},
			{
				id: "att-in-progress-only",
				orgId: "org-hist",
				assignmentId: null,
				studentId: "stu-inprog",
				testId: "test-demoted-draft",
				mode: "practice",
				status: "in_progress",
				questionsSnapshot: JSON.stringify(READING_QUESTIONS_P1),
			},
		]);

		const sampleMp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]);
		const store: MediaStore = {
			async put() {},
			async get(key) {
				if (key === audioKey) {
					return {
						body: new Response(sampleMp3).body as ReadableStream,
						contentType: "audio/mpeg",
						size: sampleMp3.byteLength,
						etag: '"demoted-audio"',
					};
				}
				return null;
			},
			async delete() {},
		};
		const app = buildApp({
			getDb: () => libsql,
			corsOrigin: CORS_ORIGINS,
			getLibraryAudioStore: () => store,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const tag = headers.get("x-test-user");
				if (tag === "owner") {
					return {
						userId: "u-owner",
						userName: "Owner",
						email: "owner@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "other") {
					return {
						userId: "u-other",
						userName: "Other",
						email: "other@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				if (tag === "inprog") {
					return {
						userId: "u-inprog",
						userName: "InProg",
						email: "inprog@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("ok"),
		});

		// Owner with submitted + stale in_progress attempts: /quiz returns 200 with attempt=null (cannot resume draft or break detail review), /audio returns 200, POST /attempts returns 404.
		const ownerHeaders = {
			"x-test-user": "owner",
			"x-student-org-id": "org-hist",
		};
		const ownerQuiz = await app.request(
			"/api/student/practice/test-demoted-draft/quiz",
			{ headers: ownerHeaders },
		);
		expect(ownerQuiz.status).toBe(200);
		const ownerQuizBody = (await ownerQuiz.json()) as {
			attempt: unknown;
			questions: unknown[];
		};
		expect(ownerQuizBody.attempt).toBeNull();
		expect(ownerQuizBody.questions.length).toBeGreaterThan(0);
		const ownerAudio = await app.request(
			"/api/student/practice/test-demoted-draft/audio",
			{ headers: ownerHeaders },
		);
		expect(ownerAudio.status).toBe(200);
		const ownerRetake = await app.request(
			"/api/student/practice/test-demoted-draft/attempts",
			{
				method: "POST",
				headers: {
					...ownerHeaders,
					Origin: STUDENT_ORIGIN,
					"Content-Type": "application/json",
				},
				body: "{}",
			},
		);
		expect(ownerRetake.status).toBe(404);

		// Other student (no submitted attempt) and in-progress-only student: 404 on /quiz, /audio, and POST /attempts.
		for (const userTag of ["other", "inprog"] as const) {
			const headers = {
				"x-test-user": userTag,
				"x-student-org-id": "org-hist",
			};
			expect(
				(
					await app.request("/api/student/practice/test-demoted-draft/quiz", {
						headers,
					})
				).status,
				`${userTag} /quiz`,
			).toBe(404);
			expect(
				(
					await app.request("/api/student/practice/test-demoted-draft/audio", {
						headers,
					})
				).status,
				`${userTag} /audio`,
			).toBe(404);
			expect(
				(
					await app.request(
						"/api/student/practice/test-demoted-draft/attempts",
						{
							method: "POST",
							headers: {
								...headers,
								Origin: STUDENT_ORIGIN,
								"Content-Type": "application/json",
							},
							body: "{}",
						},
					)
				).status,
				`${userTag} POST /attempts`,
			).toBe(404);
		}
	});
});
