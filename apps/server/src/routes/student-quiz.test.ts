import { createClient } from "@libsql/client";
import {
	QUIZ_ANSWER_VALUE_MAX,
	type QuizAttemptDetail,
	type QuizAttemptSummary,
	type StudentQuizDetail,
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

/** Answer key lives ONLY here + in the DB — never in a take payload assert. */
const QUIZ_QUESTIONS = [
	{ stem: "Câu 1 — điền từ", opts: null, answer: "Paris", alts: "paris" },
	{ stem: "Câu 2 — chọn", opts: ["A", "B", "C", "D"], answer: "B", alts: "" },
	{ stem: "Câu 3 — đúng sai", opts: null, answer: "TRUE", alts: "" },
	{
		stem: "Câu 4 — điền từ",
		opts: null,
		answer: "northern",
		alts: "north / Northern",
	},
	{ stem: "Câu 5 — headings", opts: null, answer: "ii", alts: "" },
	{ stem: "Câu 6 — chọn", opts: ["A", "B", "C", "D"], answer: "C", alts: "" },
	{ stem: "Câu 7 — yes no", opts: null, answer: "YES", alts: "" },
	{ stem: "Câu 8 — letter", opts: null, answer: "E", alts: "" },
].map((question) => ({ ...question, pin: null }));

const OWNER = { "x-test-user": "google-verified" };
const writeHeaders = (origin: string = STUDENT_ORIGIN) => ({
	"x-test-user": "google-verified",
	Origin: origin,
	"Content-Type": "application/json",
});

describe("student quiz take & review (/api/student/* quiz attempt domain)", () => {
	let app: ServerApp;
	let libsql: Db;

	beforeAll(async () => {
		const client = createClient({ url: "file::memory:" });
		const db = drizzle(client, { schema });
		await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
		libsql = db as unknown as Db;

		await libsql
			.insert(schema.organization)
			.values({ id: "org-1", name: "Academy 1" });

		// Owner student-1 (minh) + same-org NON-owner student-amb-1 (trung).
		await libsql.insert(schema.student).values([
			{
				id: "student-1",
				orgId: "org-1",
				name: "Minh Tran",
				email: "minh@gmail.com",
				phone: "0901234567",
			},
			{
				id: "student-amb-1",
				orgId: "org-1",
				name: "Trung A",
				email: "trung@test.local",
				phone: "0901111111",
			},
		]);

		// Org-2 + dòng student CÙNG email (unique index là per-org nên hợp lệ) —
		// phục vụ test cross-org qua header x-student-org-id. createdAt CŨ hơn
		// student-1 để default org resolution (rows[0] = mới nhất) của mọi test
		// khác vẫn trỏ về student-1/org-1.
		await libsql
			.insert(schema.organization)
			.values({ id: "org-2", name: "Academy 2" });
		await libsql.insert(schema.student).values({
			id: "student-org2",
			orgId: "org-2",
			name: "Minh Tran",
			email: "minh@gmail.com",
			phone: "0901234567",
			createdAt: new Date("2020-01-01T00:00:00Z"),
		});

		await libsql.insert(schema.classTable).values({
			id: "class-1",
			orgId: "org-1",
			name: "IELTS Foundation",
			level: "IELTS 5.0–6.0",
			mode: "Online",
			schedule: "T2 & T5 18:30–20:00",
			sessionsDone: 10,
			sessionsTotal: 20,
			status: "active",
		});

		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-quiz",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			title: "Reading Practice 1",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			transcript: "<p>Transcript bí mật — chỉ giáo viên đọc</p>",
			questions: JSON.stringify(QUIZ_QUESTIONS),
			optionBank: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
			note: "<p>Teacher-only explanation note</p>",
			status: "ready",
		});

		// Mỗi test một lượt giao riêng (1 attempt / assignment / student) —
		// state không chéo giữa các test.
		// Pin malformed (string coord / out-of-range) — parsePin phải sanitize
		// thành null, không tràn xuống wire (code-review: pin guard).
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-badpin",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			title: "Bad Pin Practice",
			prompt: "Label the diagram.",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify([
				{
					stem: "Câu 1 — pin x là chuỗi",
					opts: null,
					answer: "Alpha",
					alts: "",
					pin: { x: "50", y: 50 },
				},
				{
					stem: "Câu 2 — pin ngoài 0–100",
					opts: null,
					answer: "Beta",
					alts: "",
					pin: { x: 150, y: -1 },
				},
				{
					stem: "Câu 3 — pin hợp lệ",
					opts: null,
					answer: "Gamma",
					alts: "",
					pin: { x: 25, y: 75 },
				},
			]),
			optionBank: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
			note: "<p>note</p>",
			status: "ready",
		});

		// Đề reading trộn dạng câu hỏi trong 1 prompt — per-question `type`
		// (tfng ×2 + note ×2, cả hai thuộc catalog type của part p1).
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-mixed",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "note",
			title: "Mixed Types Practice",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify([
				{
					stem: "Câu 1 — tfng",
					opts: null,
					answer: "TRUE",
					alts: "",
					pin: null,
					type: "tfng",
				},
				{
					stem: "Câu 2 — tfng",
					opts: null,
					answer: "FALSE",
					alts: "",
					pin: null,
					type: "tfng",
				},
				{
					stem: "Câu 3 — note",
					opts: null,
					answer: "river",
					alts: "",
					pin: null,
					type: "note",
				},
				{
					stem: "Câu 4 — không khai type → fallback prompt.type",
					opts: null,
					answer: "bank",
					alts: "",
					pin: null,
				},
			]),
			optionBank: "[]",
			note: "<p>note</p>",
			status: "ready",
		});

		// Đề note-completion có câu T/F/NG không khai type (đề legacy): stem không
		// marker + đáp án TFNG → server suy ra type tfng cho câu đó.
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-note-tfng",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "note",
			title: "Note With TFNG Practice",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			questions: JSON.stringify([
				{
					stem: "The roof was made of wood.",
					opts: null,
					answer: "TRUE",
					alts: "",
					pin: null,
				},
				{
					stem: "The walls were painted.",
					opts: null,
					answer: "NOT GIVEN",
					alts: "",
					pin: null,
				},
				{
					stem: "Houses used ____ frames.",
					opts: null,
					answer: "timber",
					alts: "",
					pin: null,
				},
			]),
			optionBank: "[]",
			note: "<p>note</p>",
			status: "ready",
		});

		// Đề Writing prompt-only (#304) — `questions: []`, không answer key.
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-writing",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "writing",
			part: "task1",
			type: "chart",
			title: "Writing Task 1 Practice",
			prompt:
				"<p>The graph shows marriage and age from 1960 to 2000 in Australia. Summarise the information.</p>",
			passage: "",
			questions: "[]",
			optionBank: "[]",
			note: "<p>note</p>",
			status: "ready",
		});

		// Bản sao 8 câu của prompt-quiz dùng RIÊNG cho các test scenario mới
		// (T1/I1/I3/I4/D1/A2): test (h) đè questions của prompt-quiz sau khi
		// chạy, nên attempt mở trên prompt-quiz sau (h) sẽ freeze đề 1 câu.
		await libsql.insert(schema.assignmentPrompt).values({
			id: "prompt-quiz-2",
			orgId: "org-1",
			task: "task1",
			genre: "",
			skill: "reading",
			part: "p1",
			type: "info",
			title: "Reading Practice 2",
			prompt: "Read the passage and answer.",
			passage: "<p>Passage body</p>",
			transcript: "<p>Transcript bí mật — chỉ giáo viên đọc</p>",
			questions: JSON.stringify(QUIZ_QUESTIONS),
			optionBank: JSON.stringify(["Alpha", "Beta", "Gamma", "Delta"]),
			note: "<p>note</p>",
			status: "ready",
		});

		for (const assignmentId of [
			"ca-q1",
			"ca-q2",
			"ca-q3",
			"ca-q4",
			"ca-q5",
			"ca-q6",
			"ca-q7",
			"ca-q8",
			"ca-q9",
			"ca-q10",
			"ca-q11",
			"ca-q12",
			"ca-q13",
			"ca-q14",
			"ca-q15",
			"ca-q16",
			"ca-q17",
			"ca-q18",
			"ca-q19",
			"ca-q20",
			"ca-q21",
			"ca-q22",
			"ca-q23",
			"ca-q24",
			"ca-q25",
		]) {
			await libsql.insert(schema.classAssignment).values({
				id: assignmentId,
				orgId: "org-1",
				classId: "class-1",
				promptId:
					assignmentId === "ca-q8"
						? "prompt-badpin"
						: assignmentId === "ca-q10"
							? "prompt-mixed"
							: assignmentId === "ca-q12"
								? "prompt-note-tfng"
								: [
											"ca-q13",
											"ca-q14",
											"ca-q16",
											"ca-q18",
											"ca-q23",
											"ca-q24",
											"ca-q25",
										].includes(assignmentId)
									? "prompt-writing"
									: ["ca-q19", "ca-q20", "ca-q21", "ca-q22"].includes(
												assignmentId,
											)
										? "prompt-quiz-2"
										: "prompt-quiz",
				title: `Quiz ${assignmentId}`,
				due: "2099-01-10",
			});
			await libsql.insert(schema.classAssignmentTarget).values({
				id: `cat-${assignmentId}`,
				orgId: "org-1",
				assignmentId,
				studentId: "student-1",
				submittedAt: null,
			});
		}

		app = buildApp({
			getDb: () => libsql as unknown as Db,
			corsOrigin: CORS_ORIGINS,
			getSessionUser: async (headers: Headers): Promise<SessionUser | null> => {
				const userKey = headers.get("x-test-user");
				if (!userKey || userKey === "none") return null;
				if (userKey === "google-verified") {
					return {
						userId: "u-1",
						userName: "Minh Tran",
						email: "minh@gmail.com",
						emailVerified: true,
						role: "student",
					};
				}
				if (userKey === "ambiguous") {
					return {
						userId: "u-amb",
						userName: "Trung",
						email: "trung@test.local",
						emailVerified: true,
						role: "student",
					};
				}
				return null;
			},
			authHandler: () => new Response("auth OK"),
		});
	});

	async function startAttempt(assignmentId: string): Promise<string> {
		const res = await app.request(
			`/api/student/assignments/${assignmentId}/quiz/start`,
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(res.status).toBe(201);
		const body = (await res.json()) as { attemptId: string };
		return body.attemptId;
	}

	async function patchAnswer(
		attemptId: string,
		q: number,
		value: string,
		origin?: string,
	): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/answer`, {
			method: "PATCH",
			headers: writeHeaders(origin),
			body: JSON.stringify({ q, value }),
		});
	}

	async function patchEssay(
		attemptId: string,
		text: string,
		headersOverride?: HeadersInit,
	): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/essay`, {
			method: "PATCH",
			headers: headersOverride ?? writeHeaders(),
			body: JSON.stringify({ text }),
		});
	}

	async function submit(attemptId: string): Promise<Response> {
		return app.request(`/api/student/attempts/${attemptId}/submit`, {
			method: "POST",
			headers: writeHeaders(),
			body: "{}",
		});
	}

	// (a) 401 khi không có session cookie — cả 7 endpoint mới
	test("(a) unauthenticated requests return 401 on all seven endpoints", async () => {
		const noSessionWrite = {
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};
		const cases: Array<[string, RequestInit]> = [
			["/api/student/assignments/ca-q1/quiz", { method: "GET" }],
			[
				"/api/student/assignments/ca-q1/quiz/start",
				{ method: "POST", headers: noSessionWrite, body: "{}" },
			],
			[
				"/api/student/attempts/any/answer",
				{
					method: "PATCH",
					headers: noSessionWrite,
					body: '{"q":0,"value":"A"}',
				},
			],
			[
				"/api/student/attempts/any/essay",
				{
					method: "PATCH",
					headers: noSessionWrite,
					body: '{"text":"A"}',
				},
			],
			[
				"/api/student/attempts/any/submit",
				{ method: "POST", headers: noSessionWrite, body: "{}" },
			],
			["/api/student/attempts/any", { method: "GET" }],
			["/api/student/attempts/any/detail", { method: "GET" }],
		];
		for (const [path, init] of cases) {
			const res = await app.request(path, init);
			expect(res.status, path).toBe(401);
		}
	});

	// (b) POST/PATCH sai Origin → 403; Content-Type không phải JSON → 415; body > 4096 → 413
	test("(b) CSRF guards: bad origin 403, non-json content-type 415, oversized body 413", async () => {
		const badOrigin = await app.request(
			"/api/student/assignments/ca-q4/quiz/start",
			{
				method: "POST",
				headers: writeHeaders("https://evil.example"),
				body: "{}",
			},
		);
		expect(badOrigin.status).toBe(403);
		expect(await badOrigin.json()).toEqual({ error: "origin not allowed" });

		const attemptId = await startAttempt("ca-q4");
		const badOriginPatch = await patchAnswer(
			attemptId,
			0,
			"A",
			"https://evil.example",
		);
		expect(badOriginPatch.status).toBe(403);

		const textPlain = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "google-verified",
					Origin: STUDENT_ORIGIN,
					"Content-Type": "text/plain",
				},
				body: '{"q":0,"value":"A"}',
			},
		);
		expect(textPlain.status).toBe(415);
		expect(await textPlain.json()).toEqual({
			error: "content-type must be application/json",
		});

		const oversized = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: { ...writeHeaders(), "Content-Length": "5000" },
				body: JSON.stringify({ q: 0, value: "x".repeat(4500) }),
			},
		);
		expect(oversized.status).toBe(413);
		expect(await oversized.json()).toEqual({ error: "payload too large" });

		// RT O: guard quizWriteGuard bị sửa cho /essay — CSRF phải khoá cả
		// route 48KB này (origin sai → 403, content-type sai → 415).
		const writingAttempt = await startAttempt("ca-q13");
		const essayBadOrigin = await patchEssay(writingAttempt, "A graph.", {
			...writeHeaders(),
			Origin: "https://evil.example",
		});
		expect(essayBadOrigin.status).toBe(403);
		expect(await essayBadOrigin.json()).toEqual({
			error: "origin not allowed",
		});

		const essayTextPlain = await app.request(
			`/api/student/attempts/${writingAttempt}/essay`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "google-verified",
					Origin: STUDENT_ORIGIN,
					"Content-Type": "text/plain",
				},
				body: '{"text":"A graph."}',
			},
		);
		expect(essayTextPlain.status).toBe(415);
		expect(await essayTextPlain.json()).toEqual({
			error: "content-type must be application/json",
		});
	});

	// (i) GET quiz không chứa key; summary/detail in_progress → 409; caps q/value
	test("(i) take payload leaks no answer key; in_progress summary is 409", async () => {
		const before = await app.request("/api/student/assignments/ca-q1/quiz", {
			headers: OWNER,
		});
		expect(before.status).toBe(200);
		const beforeBody = (await before.json()) as StudentQuizDetail;
		expect(beforeBody.attempt).toBeNull();
		expect(beforeBody.questions).toHaveLength(8);
		expect(beforeBody.optionBank).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);

		const attemptId = await startAttempt("ca-q1");

		const takeRes = await app.request("/api/student/assignments/ca-q1/quiz", {
			headers: OWNER,
		});
		expect(takeRes.status).toBe(200);
		const takeText = await takeRes.text();
		const take = JSON.parse(takeText) as StudentQuizDetail;
		expect(take.attempt?.id).toBe(attemptId);
		expect(take.attempt?.status).toBe("in_progress");
		// RT#6: không key, không alts, không note, không transcript của đề.
		for (const leaked of [
			'"answer"',
			'"alts"',
			'"transcript"',
			"Paris",
			"northern",
			"TRUE",
			"YES",
			"Teacher-only explanation note",
			"Transcript bí mật",
		]) {
			expect(takeText.includes(leaked), leaked).toBe(false);
		}

		// Summary/detail đang in_progress → 409, body không chứa key.
		const summaryRes = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summaryRes.status).toBe(409);
		expect(await summaryRes.text()).not.toContain("Paris");
		const detailRes = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(detailRes.status).toBe(409);

		// Caps: q ngoài snapshot → 400; q âm → 400; value vượt max → 400.
		expect(
			(await patchAnswer(attemptId, QUIZ_QUESTIONS.length, "A")).status,
		).toBe(400);
		expect((await patchAnswer(attemptId, -1, "A")).status).toBe(400);
		expect(
			(await patchAnswer(attemptId, 0, "x".repeat(QUIZ_ANSWER_VALUE_MAX + 1)))
				.status,
		).toBe(400);
	});

	// (c) student cùng org không phải chủ attempt → 404 trên /attempts/* + quiz
	test("(c) same-org non-owner student gets 404 on every /attempts/* endpoint", async () => {
		const attemptId = await startAttempt("ca-q2");
		const other = { "x-test-user": "ambiguous" };
		const otherWrite = {
			"x-test-user": "ambiguous",
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};

		const quiz = await app.request("/api/student/assignments/ca-q2/quiz", {
			headers: other,
		});
		expect(quiz.status).toBe(404);

		const start = await app.request(
			"/api/student/assignments/ca-q2/quiz/start",
			{ method: "POST", headers: otherWrite, body: "{}" },
		);
		expect(start.status).toBe(404);

		const patch = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: otherWrite,
				body: '{"q":0,"value":"A"}',
			},
		);
		expect(patch.status).toBe(404);

		const submitRes = await app.request(
			`/api/student/attempts/${attemptId}/submit`,
			{ method: "POST", headers: otherWrite, body: "{}" },
		);
		expect(submitRes.status).toBe(404);

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: other,
		});
		expect(summary.status).toBe(404);

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: other },
		);
		expect(detail.status).toBe(404);
	});

	// (d)+(f)+(g) start idempotent, double submit identical + no re-stamp, PATCH sau submit 409
	test("(d/f/g) start idempotent; double submit identical without re-stamp; patch after submit 409", async () => {
		const first = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(first.status).toBe(201);
		const attemptId = ((await first.json()) as { attemptId: string }).attemptId;

		// Idempotent resume: start lần 2 trả về CÙNG attempt đang chạy.
		const second = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			},
		);
		expect(second.status).toBe(200);
		expect(((await second.json()) as { attemptId: string }).attemptId).toBe(
			attemptId,
		);

		// Nộp bài trắng (chưa trả lời câu nào) — mọi câu skipped.
		const submitRes = await submit(attemptId);
		expect(submitRes.status).toBe(200);
		const firstBody = await submitRes.text();
		expect(JSON.parse(firstBody)).toEqual({
			correctCount: 0,
			totalCount: 8,
			wrongCount: 0,
			skippedCount: 8,
		});

		const [targetAfterFirst] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q5"));
		expect(targetAfterFirst?.submittedAt).not.toBeNull();

		// Double submit: response giống hệt, KHÔNG re-stamp target.
		const secondSubmit = await submit(attemptId);
		expect(secondSubmit.status).toBe(200);
		expect(await secondSubmit.text()).toBe(firstBody);
		const [targetAfterSecond] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q5"));
		expect(targetAfterSecond?.submittedAt).toBe(targetAfterFirst?.submittedAt);

		// (g) PATCH sau submit → 409.
		expect((await patchAnswer(attemptId, 0, "A")).status).toBe(409);

		// Start lại sau submit → 409 (không retake v1).
		const restart = await app.request(
			"/api/student/assignments/ca-q5/quiz/start",
			{ method: "POST", headers: writeHeaders(), body: "{}" },
		);
		expect(restart.status).toBe(409);

		// Summary/detail sau submit mở khóa, trả key/verdict + note.
		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summary.status).toBe(200);
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.totalCount).toBe(8);
		expect(summaryBody.skippedCount).toBe(8);
		expect(summaryBody.items).toHaveLength(8);
		expect(summaryBody.items[0]).toEqual({
			verdict: "skipped",
			key: "Paris",
			answer: null,
		});
		// RT D: đề Reading không bao giờ lộ essay — null trên cả summary lẫn detail.
		expect(summaryBody.essay).toBeNull();
		expect(summaryBody.submittedAt).not.toBe("");

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{
				headers: OWNER,
			},
		);
		expect(detail.status).toBe(200);
		const detailBody = (await detail.json()) as QuizAttemptDetail;
		expect(detailBody.note).toBe("<p>Teacher-only explanation note</p>");
		expect(detailBody.essay).toBeNull();
		expect(detailBody.questions[0]?.key).toBe("Paris");
		expect(detailBody.questions[0]?.alts).toBe("paris");
		expect(detailBody.questions[0]?.verdict).toBe("skipped");
	});

	// Flip thắng nhưng batch stamp hỏng ở request trước (D1 transient) —
	// submit lại phải tự chữa stamp, không để mất vĩnh viễn.
	test("submit retry heals a missing submittedAt stamp", async () => {
		const attemptId = await startAttempt("ca-q11");
		expect((await submit(attemptId)).status).toBe(200);

		// Giả lập batch hỏng sau flip: attempt đã submitted nhưng stamp mất.
		await libsql
			.update(schema.classAssignmentTarget)
			.set({ submittedAt: null })
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q11"));

		const retry = await submit(attemptId);
		expect(retry.status).toBe(200);
		const [healed] = await libsql
			.select({ submittedAt: schema.classAssignmentTarget.submittedAt })
			.from(schema.classAssignmentTarget)
			.where(eq(schema.classAssignmentTarget.id, "cat-ca-q11"));
		expect(healed?.submittedAt).not.toBeNull();
	});

	// (e) hai PATCH interleaved (q3, q7) — cả hai còn nguyên nhờ json_set atomic
	test("(e) interleaved patches on different questions both persist", async () => {
		const attemptId = await startAttempt("ca-q6");

		expect((await patchAnswer(attemptId, 3, "northern")).status).toBe(200);
		expect((await patchAnswer(attemptId, 7, "Z")).status).toBe(200);

		const take = await app.request("/api/student/assignments/ca-q6/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.attempt?.answers).toEqual({ "3": "northern", "7": "Z" });

		// Grade: q3 đúng (answer), q7 sai, còn lại skipped.
		const submitRes = await submit(attemptId);
		expect(await submitRes.json()).toEqual({
			correctCount: 1,
			totalCount: 8,
			wrongCount: 1,
			skippedCount: 6,
		});

		// Cùng câu patch lại — last-write-wins cho câu đó, câu khác giữ nguyên.
		const attempt2 = await startAttempt("ca-q7");
		await patchAnswer(attempt2, 0, "London");
		await patchAnswer(attempt2, 0, "Paris");
		const take2 = await app.request("/api/student/assignments/ca-q7/quiz", {
			headers: OWNER,
		});
		const body2 = (await take2.json()) as StudentQuizDetail;
		expect(body2.attempt?.answers).toEqual({ "0": "Paris" });
	});

	// (h) đề bị edit giữa chừng → resume + grading dùng snapshot, không đổi
	test("(h) prompt edited mid-attempt: resume and grading use the snapshot", async () => {
		const attemptId = await startAttempt("ca-q3");

		// Teacher PATCH prompt sau khi học viên đã start (thao tác DB trực tiếp
		// cùng hiệu ứng với PATCH /api/assignments/prompts/:id).
		await libsql
			.update(schema.assignmentPrompt)
			.set({
				questions: JSON.stringify([
					{
						stem: "EDITED stem",
						opts: null,
						answer: "London",
						alts: "",
						pin: null,
					},
				]),
			})
			.where(eq(schema.assignmentPrompt.id, "prompt-quiz"));

		// Resume: đề render từ snapshot — 8 câu cũ, không dính stem mới.
		const take = await app.request("/api/student/assignments/ca-q3/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.questions).toHaveLength(8);
		expect(JSON.stringify(body.questions)).not.toContain("EDITED stem");

		// Trả lời theo key cũ — grading vẫn chấm theo snapshot, không theo đề mới.
		expect((await patchAnswer(attemptId, 0, "Paris")).status).toBe(200);
		const submitRes = await submit(attemptId);
		expect(await submitRes.json()).toEqual({
			correctCount: 1,
			totalCount: 8,
			wrongCount: 0,
			skippedCount: 7,
		});

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.items[0]?.key).toBe("Paris");
		expect(summaryBody.items[0]?.verdict).toBe("correct");
	});

	// Per-question type: đề trộn dạng → payload mang type từng câu; đề cũ
	// fallback prompt.type cho mọi câu (diff wire chỉ thêm field).
	test("per-question type reaches take payload; legacy prompts fall back to prompt type", async () => {
		const mixed = await app.request("/api/student/assignments/ca-q10/quiz", {
			headers: OWNER,
		});
		expect(mixed.status).toBe(200);
		const mixedBody = (await mixed.json()) as StudentQuizDetail;
		expect(mixedBody.questions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
			"note", // câu không khai type → resolve prompt.type
		]);

		// Đề cũ (không per-question type): mọi câu nhận type của prompt.
		const legacy = await app.request("/api/student/assignments/ca-q1/quiz", {
			headers: OWNER,
		});
		expect(legacy.status).toBe(200);
		const legacyBody = (await legacy.json()) as StudentQuizDetail;
		expect(legacyBody.questions).toHaveLength(8);
		for (const question of legacyBody.questions) {
			expect(question.type).toBe("info");
		}

		// Snapshot sau start cũng resolve per-question type (resume không lệch).
		const attemptId = await startAttempt("ca-q10");
		const resumed = await app.request("/api/student/assignments/ca-q10/quiz", {
			headers: OWNER,
		});
		const resumedBody = (await resumed.json()) as StudentQuizDetail;
		expect(resumedBody.attempt?.id).toBe(attemptId);
		expect(resumedBody.questions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
			"note",
		]);

		// Review sau nộp: attempt detail mang type từng câu (header cụm dùng
		// chung cấu trúc take).
		await patchAnswer(attemptId, 0, "TRUE");
		expect((await submit(attemptId)).status).toBe(200);
		const reviewRes = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(reviewRes.status).toBe(200);
		const reviewBody = (await reviewRes.json()) as QuizAttemptDetail;
		expect(reviewBody.questions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
			"note",
		]);
	});

	// Đề điền chữ có câu T/F/NG không khai type: take + review đều ra tfng để
	// học viên có radio; câu có marker giữ type đề.
	test("markerless TFNG answers in a note prompt are inferred as tfng in take and review", async () => {
		const take = await app.request("/api/student/assignments/ca-q12/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const takeBody = (await take.json()) as StudentQuizDetail;
		expect(takeBody.type).toBe("note");
		expect(takeBody.questions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
		]);

		const attemptId = await startAttempt("ca-q12");
		// Sau startAttempt take đọc từ snapshot (câu không có type) — vẫn suy luận.
		const takeAfterStart = await app.request(
			"/api/student/assignments/ca-q12/quiz",
			{ headers: OWNER },
		);
		expect(takeAfterStart.status).toBe(200);
		const takeAfterStartBody =
			(await takeAfterStart.json()) as StudentQuizDetail;
		expect(
			takeAfterStartBody.questions.map((question) => question.type),
		).toEqual(["tfng", "tfng", "note"]);
		expect((await patchAnswer(attemptId, 0, "TRUE")).status).toBe(200);
		expect((await submit(attemptId)).status).toBe(200);
		const reviewRes = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(reviewRes.status).toBe(200);
		const reviewBody = (await reviewRes.json()) as QuizAttemptDetail;
		expect(reviewBody.questions.map((question) => question.type)).toEqual([
			"tfng",
			"tfng",
			"note",
		]);
		expect(reviewBody.questions.map((question) => question.verdict)).toEqual([
			"correct",
			"skipped",
			"skipped",
		]);
	});

	// code-review: pin malformed không tràn xuống wire — parsePin sanitize null.
	test("malformed question pins are sanitized to null in take payloads", async () => {
		await startAttempt("ca-q8");
		const take = await app.request("/api/student/assignments/ca-q8/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.questions.map((question) => question.pin)).toEqual([
			null,
			null,
			{ x: 25, y: 75 },
		]);
	});

	// code-review: body cap đo byte THẬT — stream không Content-Length vẫn 413.
	test("oversized streaming body without Content-Length is rejected 413", async () => {
		const attemptId = await startAttempt("ca-q9");
		// Stream thật (không Content-Length do fetch tự sinh với string body)
		// — cap phải đo BYTE THẬT, không tin header client khai.
		const streamed = new Request(
			`http://localhost/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: {
					"x-test-user": "google-verified",
					Origin: STUDENT_ORIGIN,
					"Content-Type": "application/json",
				},
				body: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode(
								JSON.stringify({ q: 0, value: "x".repeat(8192) }),
							),
						);
						controller.close();
					},
				}),
				duplex: "half",
				// workers-types không khai báo duplex (Node undici cần cho
				// stream body) — cast hẹp chỉ tại điểm xây Request test.
			} as RequestInit & { duplex: "half" },
		);
		expect(streamed.headers.get("Content-Length")).toBeNull();
		const res = await app.request(streamed);
		expect(res.status).toBe(413);
		expect(await res.json()).toEqual({ error: "payload too large" });
	});

	// (#304) Writing: essay autosave → resume qua take payload → summary lộ bài.
	test("writing essay autosaves, resumes via take payload and shows on summary", async () => {
		const attemptId = await startAttempt("ca-q14");
		const essay = "The graph shows a clear upward trend in marriages.";

		expect((await patchEssay(attemptId, essay)).status).toBe(200);

		// Resume qua take payload: attempt.essay trả lại bài đã autosave.
		const take = await app.request("/api/student/assignments/ca-q14/quiz", {
			headers: OWNER,
		});
		const takeBody = (await take.json()) as StudentQuizDetail;
		expect(takeBody.attempt?.essay).toBe(essay);
		expect(takeBody.questions).toHaveLength(0);

		// Nộp: totalCount 0 (không có câu nào), summary + detail lộ bài + null reading.
		expect((await submit(attemptId)).status).toBe(200);

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summary.status).toBe(200);
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.essay).toBe(essay);
		expect(summaryBody.totalCount).toBe(0);
		expect(summaryBody.items).toHaveLength(0);

		// RT D: detail cũng phải set essay — quên sẽ làm zod parse client fail.
		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(detail.status).toBe(200);
		const detailBody = (await detail.json()) as QuizAttemptDetail;
		expect(detailBody.essay).toBe(essay);
	});

	// (#332) Summary chỉ lộ highlight khi ĐÃ chấm + có ít nhất 1 highlight.
	test("summary reveals teacher annotations only after grading", async () => {
		const essay = "The graph shows a clear upward trend in marriages.";
		const attemptId = await startAttempt("ca-q23");
		expect((await patchEssay(attemptId, essay)).status).toBe(200);
		expect((await submit(attemptId)).status).toBe(200);

		// Giáo viên highlight trước, chấm sau: 2 annotation đã tồn tại trong DB.
		await libsql.insert(schema.quizAttemptAnnotation).values([
			{
				id: "ann-late",
				orgId: "org-1",
				attemptId,
				startOffset: 0,
				endOffset: 3,
				note: "Mở bài ổn.",
			},
			{
				id: "ann-early",
				orgId: "org-1",
				attemptId,
				startOffset: 4,
				endOffset: 9,
				note: "Graph: viết hoa giữa câu.",
			},
		]);

		// Chưa chấm → KHÔNG có key `annotations` (học viên không thấy dở dang).
		const beforeGrade = await app.request(
			`/api/student/attempts/${attemptId}`,
			{ headers: OWNER },
		);
		expect(beforeGrade.status).toBe(200);
		const beforeBody = (await beforeGrade.json()) as Record<string, unknown>;
		expect("annotations" in beforeBody).toBe(false);

		// Chấm điểm (ghi thẳng DB như giáo viên lưu qua route grade).
		await libsql
			.update(schema.quizAttempt)
			.set({
				gradeScores: { task: 6, coherence: 6, lexical: 6, grammar: 6 },
				gradeFeedback: "Khá.",
				gradedAt: new Date("2026-10-06T05:00:00Z"),
			})
			.where(eq(schema.quizAttempt.id, attemptId));

		const afterGrade = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		const afterBody = (await afterGrade.json()) as QuizAttemptSummary;
		expect(afterBody.grade?.band).toBe(6);
		// Sắp theo start dù seed ngược thứ tự id.
		expect(afterBody.annotations?.map((a) => [a.start, a.end])).toEqual([
			[0, 3],
			[4, 9],
		]);
		expect(afterBody.annotations?.map((a) => a.note)).toEqual([
			"Mở bài ổn.",
			"Graph: viết hoa giữa câu.",
		]);

		// Đã chấm nhưng 0 highlight → không có key.
		const noAnnAttempt = await startAttempt("ca-q24");
		expect((await patchEssay(noAnnAttempt, "Another essay.")).status).toBe(200);
		expect((await submit(noAnnAttempt)).status).toBe(200);
		await libsql
			.update(schema.quizAttempt)
			.set({
				gradeScores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
				gradeFeedback: "",
				gradedAt: new Date("2026-10-06T05:30:00Z"),
			})
			.where(eq(schema.quizAttempt.id, noAnnAttempt));
		const noAnn = await app.request(`/api/student/attempts/${noAnnAttempt}`, {
			headers: OWNER,
		});
		const noAnnBody = (await noAnn.json()) as Record<string, unknown>;
		expect(noAnnBody.grade).toBeTruthy();
		expect("annotations" in noAnnBody).toBe(false);
	});

	// (#304) Guards của PATCH essay: đề không phải Writing 400, vượt max 400,
	// học viên khác 404, đã nộp 409.
	test("essay patch guards: non-writing 400, over max 400, other student 404, after submit 409", async () => {
		// Đề Reading: PATCH essay → 400 essay not allowed.
		const readingAttempt = await startAttempt("ca-q15");
		const notWriting = await patchEssay(readingAttempt, "Some essay.");
		expect(notWriting.status).toBe(400);
		expect(await notWriting.json()).toEqual({ error: "essay not allowed" });

		// Đề Writing: vượt QUIZ_ESSAY_MAX (10.000 ký tự) → 400 invalid body.
		const writingAttempt = await startAttempt("ca-q16");
		const overMax = await patchEssay(writingAttempt, "x".repeat(10001));
		expect(overMax.status).toBe(400);
		expect(await overMax.json()).toEqual({ error: "invalid body" });

		// Học viên cùng org không phải chủ → 404 (IDOR guard như PATCH answer).
		const otherWrite = {
			"x-test-user": "ambiguous",
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};
		const otherStudent = await patchEssay(
			writingAttempt,
			"Hijack.",
			otherWrite,
		);
		expect(otherStudent.status).toBe(404);

		// Body sai schema (thiếu text) → 400.
		const badBody = await app.request(
			`/api/student/attempts/${writingAttempt}/essay`,
			{
				method: "PATCH",
				headers: writeHeaders(),
				body: '{"value":"nope"}',
			},
		);
		expect(badBody.status).toBe(400);

		// Nộp xong → PATCH essay 409 (CAS như PATCH answer).
		expect((await submit(writingAttempt)).status).toBe(200);
		const afterSubmit = await patchEssay(writingAttempt, "Too late.");
		expect(afterSubmit.status).toBe(409);
		expect(await afterSubmit.json()).toEqual({
			error: "attempt already submitted",
		});
	});

	// (#304) Route /essay nhận body > 4096 byte (cap riêng 48KB) trong khi
	// /answer vẫn 413; vượt 48KB → 413; đúng biên 10.000 ký tự → 200.
	test("essay route accepts bodies above 4096 bytes while answer route still rejects them", async () => {
		const attemptId = await startAttempt("ca-q18");

		// ~9.000 ký tự ASCII → ~9KB: vượt cap cũ 4096 nhưng dưới 48KB.
		const longEssay = "word ".repeat(1800).trim(); // 9000 ký tự
		expect((await patchEssay(attemptId, longEssay)).status).toBe(200);

		// Đúng biên 10.000 ký tự → 200 (schema max = QUIZ_ESSAY_MAX).
		expect((await patchEssay(attemptId, "x".repeat(10000))).status).toBe(200);

		// > 48KB (QUIZ_ESSAY_BODY_MAX) → 413 từ bodyLimit của guard.
		const tooBig = await app.request(
			`/api/student/attempts/${attemptId}/essay`,
			{
				method: "PATCH",
				headers: writeHeaders(),
				body: JSON.stringify({ text: "x".repeat(50000) }),
			},
		);
		expect(tooBig.status).toBe(413);
		expect(await tooBig.json()).toEqual({ error: "payload too large" });

		// /answer giữ cap 4096: body ~5KB vẫn 413.
		const attempt2 = await startAttempt("ca-q17");
		const answerBig = await patchAnswer(attempt2, 0, "x".repeat(5000));
		expect(answerBig.status).toBe(413);
	});

	// (scenario T1) Hai request start đua nhau — unique (assignmentId,
	// studentId) đảm bảo chỉ một insert thắng; request thua re-read (backstop)
	// và trả CÙNG attemptId. Assert theo bất biến, không theo thứ tự schedule.
	test("concurrent quiz start requests converge to a single attempt", async () => {
		const results = await Promise.all([
			app.request("/api/student/assignments/ca-q19/quiz/start", {
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			}),
			app.request("/api/student/assignments/ca-q19/quiz/start", {
				method: "POST",
				headers: writeHeaders(),
				body: "{}",
			}),
		]);
		// Đúng một request thắng insert (201), request kia resume (200) —
		// không bao giờ 201×2 (unique chặn) hay 500 (catch re-read).
		expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
		const attemptIds = await Promise.all(
			results.map(
				async (r) => ((await r.json()) as { attemptId: string }).attemptId,
			),
		);
		expect(new Set(attemptIds).size).toBe(1);

		// DB chỉ có đúng một dòng attempt cho assignment này.
		const rows = await libsql
			.select({ id: schema.quizAttempt.id })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.assignmentId, "ca-q19"));
		expect(rows).toHaveLength(1);
	});

	// (scenarios I1 + I3) Chặn input biên của PATCH /answer trước khi chạm DB:
	// value > 500 ký tự và q âm/lẻ là 400 zod; q ngoài snapshot là 400 range.
	test("answer patch rejects out-of-bound inputs with 400", async () => {
		const attemptId = await startAttempt("ca-q20");

		// value vượt QUIZ_ANSWER_VALUE_MAX → 400 invalid body (zod).
		const tooLong = await patchAnswer(
			attemptId,
			0,
			"x".repeat(QUIZ_ANSWER_VALUE_MAX + 1),
		);
		expect(tooLong.status).toBe(400);
		expect(await tooLong.json()).toEqual({ error: "invalid body" });

		// q âm và q lẻ → zod 400 (int, min 0).
		expect((await patchAnswer(attemptId, -1, "A")).status).toBe(400);
		expect((await patchAnswer(attemptId, 1.5, "A")).status).toBe(400);

		// q == snapshot length và xa hơn → range check server-side 400.
		expect(
			(await patchAnswer(attemptId, QUIZ_QUESTIONS.length, "A")).status,
		).toBe(400);
		expect((await patchAnswer(attemptId, 100, "A")).status).toBe(400);

		// Không có gì được ghi xuống attempt.
		const take = await app.request("/api/student/assignments/ca-q20/quiz", {
			headers: OWNER,
		});
		expect(((await take.json()) as StudentQuizDetail).attempt?.answers).toEqual(
			{},
		);
	});

	// (scenarios I4 + D1) json_set giữ nguyên giá trị chứa ký tự JSON đặc biệt
	// (json_quote escape đúng) và key luôn là chuỗi index nguyên — key "0.0"
	// là regression thật khi param số bind REAL thay vì TEXT (String(q)).
	test("special-character answers round-trip and keys stay integer strings", async () => {
		const attemptId = await startAttempt("ca-q21");
		const weird = 'say "ok" \\ done 😀';
		expect((await patchAnswer(attemptId, 0, "  PARIS  ")).status).toBe(200);
		expect((await patchAnswer(attemptId, 2, "TRUE")).status).toBe(200);
		expect((await patchAnswer(attemptId, 7, weird)).status).toBe(200);

		// Take payload trả raw đúng từng ký tự — storage không normalize.
		const take = await app.request("/api/student/assignments/ca-q21/quiz", {
			headers: OWNER,
		});
		const body = (await take.json()) as StudentQuizDetail;
		expect(body.attempt?.answers).toEqual({
			"0": "  PARIS  ",
			"2": "TRUE",
			"7": weird,
		});

		// Raw JSON trong DB: đúng key "0"/"2"/"7", không bao giờ "0.0".
		const [stored] = await libsql
			.select({ answers: schema.quizAttempt.answers })
			.from(schema.quizAttempt)
			.where(eq(schema.quizAttempt.id, attemptId));
		expect(Object.keys(JSON.parse(stored?.answers ?? "{}")).sort()).toEqual([
			"0",
			"2",
			"7",
		]);

		// Grader đọc được JSON không corrupt: q0 correct (normalize hoa/thường
		// + whitespace), q2 correct, q7 wrong, còn lại skipped.
		const submitRes = await submit(attemptId);
		expect(await submitRes.json()).toEqual({
			correctCount: 2,
			totalCount: 8,
			wrongCount: 1,
			skippedCount: 5,
		});
	});

	// (scenario A2) Cùng email, org khác qua header x-student-org-id —
	// danh tính org-2 (student id riêng) không chạm được attempt của org-1:
	// mọi route đều 404. Test chứng minh chặn cross-identity qua org header,
	// chưa tách riêng predicate orgId khỏi predicate studentId.
	test("org switcher cannot reach another org's attempt (cross-org IDOR)", async () => {
		const attemptId = await startAttempt("ca-q22");
		const org2Read = {
			"x-test-user": "google-verified",
			"x-student-org-id": "org-2",
		};
		const org2Write = {
			...org2Read,
			Origin: STUDENT_ORIGIN,
			"Content-Type": "application/json",
		};

		const patch = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: org2Write,
				body: JSON.stringify({ q: 0, value: "Paris" }),
			},
		);
		expect(patch.status).toBe(404);

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: org2Read,
		});
		expect(summary.status).toBe(404);

		const submitRes = await app.request(
			`/api/student/attempts/${attemptId}/submit`,
			{ method: "POST", headers: org2Write, body: "{}" },
		);
		expect(submitRes.status).toBe(404);

		// Positive control: cơ chế header hoạt động — chọn org-1 vẫn thao tác
		// được attempt (chứng minh 404 ở trên do org guard, không phải header hỏng).
		const control = await app.request(
			`/api/student/attempts/${attemptId}/answer`,
			{
				method: "PATCH",
				headers: { ...writeHeaders(), "x-student-org-id": "org-1" },
				body: JSON.stringify({ q: 0, value: "Paris" }),
			},
		);
		expect(control.status).toBe(200);
	});

	test("HTML-wrapped writing essay (<p> tags) renders as plain text in take, summary, and detail with aligned annotation offsets (#382)", async () => {
		const htmlEssay = "<p>Remote learning has widened the gap.</p>";
		const attemptId = await startAttempt("ca-q25");
		expect((await patchEssay(attemptId, htmlEssay)).status).toBe(200);

		// Take payload khi resume trả plain text (không lộ thẻ <p>).
		const take = await app.request("/api/student/assignments/ca-q25/quiz", {
			headers: OWNER,
		});
		expect(take.status).toBe(200);
		const takeBody = (await take.json()) as StudentQuizDetail;
		expect(takeBody.attempt?.essay).toBe(
			"Remote learning has widened the gap.",
		);

		expect((await submit(attemptId)).status).toBe(200);

		// Giáo viên highlight "widened" (raw 23..30, plain 20..27) và chấm điểm.
		await libsql.insert(schema.quizAttemptAnnotation).values({
			id: "ann-html-student",
			orgId: "org-1",
			attemptId,
			startOffset: 23,
			endOffset: 30,
			note: "Động từ chuẩn.",
		});
		await libsql
			.update(schema.quizAttempt)
			.set({
				gradeScores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
				gradeFeedback: "Tốt.",
				gradedAt: new Date("2026-10-21T05:00:00Z"),
			})
			.where(eq(schema.quizAttempt.id, attemptId));

		const summary = await app.request(`/api/student/attempts/${attemptId}`, {
			headers: OWNER,
		});
		expect(summary.status).toBe(200);
		const summaryBody = (await summary.json()) as QuizAttemptSummary;
		expect(summaryBody.essay).toBe("Remote learning has widened the gap.");
		expect(summaryBody.annotations).toEqual([
			{
				id: "ann-html-student",
				start: 20,
				end: 27,
				note: "Động từ chuẩn.",
			},
		]);

		const detail = await app.request(
			`/api/student/attempts/${attemptId}/detail`,
			{ headers: OWNER },
		);
		expect(detail.status).toBe(200);
		const detailBody = (await detail.json()) as QuizAttemptDetail;
		expect(detailBody.essay).toBe("Remote learning has widened the gap.");
	});
});
