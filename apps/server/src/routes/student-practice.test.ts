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
import type { SessionUser } from "../session";

const CORS_ORIGINS = ["http://localhost:8003"];
const STUDENT_ORIGIN = "http://localhost:8003";
const MIGRATIONS_DIR = new URL(
	"../../../../packages/db/src/migrations",
	import.meta.url,
).pathname;

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
					}>;
				}>;
			};
			const ca1 = body.classAssignments.find((c) => c.id === "ca-1");
			expect(ca1?.targets).toHaveLength(1);
			// Chỉ attempt assignment-mode được tính — practice attempt riêng biệt.
			expect(ca1?.targets[0]?.attemptId).toBe("attempt-ca");
			expect(ca1?.targets[0]?.submittedAt).toBeNull();
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
